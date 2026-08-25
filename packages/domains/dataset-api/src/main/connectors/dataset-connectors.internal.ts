import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type S3ClientConfig
} from '@aws-sdk/client-s3'
import { NoAuthSigner } from '@smithy/core'
import type { LookupAddress } from 'node:dns'
import { lookup as systemLookup } from 'node:dns/promises'
import type { LookupFunction } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'

export type DatasetHttpRequest = Readonly<{
  sourceId: string
  url: URL
  credentialBindingId?: string
  timeoutMs: number
  maxRetries: number
  range?: Readonly<{ start: number; end?: number }>
}>

export type DatasetHttpResponse = Readonly<{
  ok: boolean
  status: number
  body: ReadableStream<Uint8Array> | null
  contentType: string
  contentLength?: number
  contentRange?: string
  contentDisposition?: string
}>

export type DatasetHttpConnector = Readonly<{
  get(request: DatasetHttpRequest): Promise<DatasetHttpResponse>
}>

export type DatasetS3Source = Readonly<{
  id: string
  endpoint: string
  bucket: string
  region: string
  forcePathStyle: boolean
  credentialBindingId?: string
}>

export type DatasetS3ListRequest = Readonly<{
  prefix?: string
  delimiter?: string
  continuationToken?: string
  maxKeys: number
}>

export type DatasetS3Connector = Readonly<{
  listObjects(source: DatasetS3Source, request: DatasetS3ListRequest): Promise<Readonly<{
    status: number
    objects: readonly Readonly<{
      key?: string
      size?: number
      etag?: string
      lastModified?: string
      storageClass?: string
    }>[]
    commonPrefixes: readonly string[]
    isTruncated: boolean
    nextContinuationToken?: string
    keyCount: number
  }>>
  metadata(source: DatasetS3Source, key: string): Promise<Readonly<{
    status: number
    size?: number
    etag?: string
    lastModified?: string
    contentType?: string
    contentEncoding?: string
    cacheControl?: string
    versionId?: string
    storageClass?: string
    userMetadata: Readonly<Record<string, string>>
  }>>
  rawData(source: DatasetS3Source, request: Readonly<{
    key: string
    range?: Readonly<{ start: number; end?: number }>
  }>): Promise<Readonly<{
    status: number
    body: unknown
    contentLength?: number
    contentRange?: string
    contentType?: string
    etag?: string
    lastModified?: string
  }>>
}>

type S3Sender = Readonly<{
  send(command: unknown): Promise<any>
  destroy?: () => void
}>

export class DatasetCredentialBindingUnavailableError extends Error {
  readonly code = 'DATASET_CREDENTIAL_BINDING_UNAVAILABLE'

  constructor(readonly bindingId: string) {
    super(
      `Dataset credential binding '${bindingId}' is unavailable: native secure-store enrollment is not configured.`
    )
    this.name = 'DatasetCredentialBindingUnavailableError'
  }
}

export class DatasetConnectorRequestError extends Error {
  readonly code = 'DATASET_API_NETWORK_ERROR'

  constructor(
    message: string,
    readonly details: Readonly<{
      sourceId: string
      host: string
      attempts: number
      causeCode?: string
      causeMessage: string
    }>
  ) {
    super(message)
    this.name = 'DatasetConnectorRequestError'
  }
}

export function createDatasetHttpConnector(options: Readonly<{
  fetchImpl?: typeof fetch
}> = {}): DatasetHttpConnector {
  const fetchImpl = options.fetchImpl ?? createResilientDatasetFetch()
  return Object.freeze({
    async get(request) {
      requireAnonymousBinding(request.credentialBindingId)
      if (request.url.username || request.url.password) {
        throw new Error('Dataset request URL must not contain credentials.')
      }
      const headers = new Headers({
        accept: 'application/json, application/octet-stream;q=0.9, */*;q=0.5',
        'user-agent': 'SciForge-Dataset-API/2.0.0'
      })
      if (request.range) {
        headers.set('range', `bytes=${request.range.start}-${request.range.end ?? ''}`)
      }
      const response = await requestWithRetries(fetchImpl, request, headers)
      return Object.freeze({
        ok: response.ok,
        status: response.status,
        body: response.body,
        contentType: response.headers.get('content-type') ?? '',
        ...numberHeader(response, 'content-length', 'contentLength'),
        ...stringHeader(response, 'content-range', 'contentRange'),
        ...stringHeader(response, 'content-disposition', 'contentDisposition')
      })
    }
  })
}

export function createDatasetS3Connector(options: Readonly<{
  clientFactory?: (source: DatasetS3Source) => S3Sender
}> = {}): DatasetS3Connector {
  const clientFactory = options.clientFactory ?? createAnonymousS3Client
  return Object.freeze({
    async listObjects(source, request) {
      return withAnonymousS3Client(source, clientFactory, async (client) => {
        const result = await client.send(new ListObjectsV2Command({
          Bucket: source.bucket,
          ...(request.prefix ? { Prefix: request.prefix } : {}),
          ...(request.delimiter ? { Delimiter: request.delimiter } : {}),
          ...(request.continuationToken ? { ContinuationToken: request.continuationToken } : {}),
          MaxKeys: request.maxKeys
        }))
        return Object.freeze({
          status: result.$metadata?.httpStatusCode ?? 200,
          objects: Object.freeze((result.Contents ?? []).map((object: any) => Object.freeze({
            ...(typeof object.Key === 'string' ? { key: object.Key } : {}),
            ...(typeof object.Size === 'number' ? { size: object.Size } : {}),
            ...(cleanEtag(object.ETag) ? { etag: cleanEtag(object.ETag) } : {}),
            ...(isoDate(object.LastModified) ? { lastModified: isoDate(object.LastModified) } : {}),
            ...(typeof object.StorageClass === 'string' ? { storageClass: object.StorageClass } : {})
          }))),
          commonPrefixes: Object.freeze((result.CommonPrefixes ?? [])
            .map((entry: any) => entry.Prefix)
            .filter((value: unknown): value is string => typeof value === 'string')),
          isTruncated: result.IsTruncated === true,
          ...(typeof result.NextContinuationToken === 'string'
            ? { nextContinuationToken: result.NextContinuationToken }
            : {}),
          keyCount: result.KeyCount ?? result.Contents?.length ?? 0
        })
      })
    },

    async metadata(source, key) {
      return withAnonymousS3Client(source, clientFactory, async (client) => {
        const result = await client.send(new HeadObjectCommand({ Bucket: source.bucket, Key: key }))
        return Object.freeze({
          status: result.$metadata?.httpStatusCode ?? 200,
          ...(typeof result.ContentLength === 'number' ? { size: result.ContentLength } : {}),
          ...(cleanEtag(result.ETag) ? { etag: cleanEtag(result.ETag) } : {}),
          ...(isoDate(result.LastModified) ? { lastModified: isoDate(result.LastModified) } : {}),
          ...(typeof result.ContentType === 'string' ? { contentType: result.ContentType } : {}),
          ...(typeof result.ContentEncoding === 'string' ? { contentEncoding: result.ContentEncoding } : {}),
          ...(typeof result.CacheControl === 'string' ? { cacheControl: result.CacheControl } : {}),
          ...(typeof result.VersionId === 'string' ? { versionId: result.VersionId } : {}),
          ...(typeof result.StorageClass === 'string' ? { storageClass: result.StorageClass } : {}),
          userMetadata: Object.freeze({ ...(result.Metadata ?? {}) })
        })
      })
    },

    async rawData(source, request) {
      return withAnonymousS3Client(source, clientFactory, async (client) => {
        const range = request.range
          ? `bytes=${request.range.start}-${request.range.end ?? ''}`
          : undefined
        const result = await client.send(new GetObjectCommand({
          Bucket: source.bucket,
          Key: request.key,
          ...(range ? { Range: range } : {})
        }))
        return Object.freeze({
          status: result.$metadata?.httpStatusCode ?? (range ? 206 : 200),
          body: result.Body,
          ...(typeof result.ContentLength === 'number' ? { contentLength: result.ContentLength } : {}),
          ...(typeof result.ContentRange === 'string' ? { contentRange: result.ContentRange } : {}),
          ...(typeof result.ContentType === 'string' ? { contentType: result.ContentType } : {}),
          ...(cleanEtag(result.ETag) ? { etag: cleanEtag(result.ETag) } : {}),
          ...(isoDate(result.LastModified) ? { lastModified: isoDate(result.LastModified) } : {})
        })
      })
    }
  })
}

function requireAnonymousBinding(bindingId: string | undefined): void {
  if (bindingId) throw new DatasetCredentialBindingUnavailableError(bindingId)
}

async function requestWithRetries(
  fetchImpl: typeof fetch,
  request: DatasetHttpRequest,
  headers: Headers
): Promise<Response> {
  let lastError: unknown
  const attempts = request.maxRetries + 1
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(request.url, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(request.timeoutMs)
      })
      if (!isRetryableStatus(response.status) || attempt === attempts) return response
      await response.body?.cancel().catch(() => undefined)
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
      if (attempt === attempts || !isRetryableNetworkError(error)) {
        throw connectorRequestError(request, attempt, error)
      }
    }
    await retryDelay(attempt)
  }
  throw connectorRequestError(request, attempts, lastError)
}

function createResilientDatasetFetch(): typeof fetch {
  const dispatcher = new Agent({ connect: { lookup: createCachedDnsLookup() } })
  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher }
    ) as unknown as Promise<Response>) as typeof fetch
}

function createCachedDnsLookup(): LookupFunction {
  const cache = new Map<string, { addresses: LookupAddress[]; expiresAt: number }>()
  const ttlMs = 5 * 60_000
  const staleTtlMs = 60 * 60_000
  return (hostname, options, callback) => {
    const key = hostname.toLowerCase()
    const cached = cache.get(key)
    const now = Date.now()
    const deliver = (addresses: LookupAddress[]) => {
      const family = typeof options.family === 'number' ? options.family : 0
      const filtered = family === 4 || family === 6
        ? addresses.filter((address) => address.family === family)
        : addresses
      const usable = filtered.length ? filtered : addresses
      if (!usable.length) {
        callback(Object.assign(new Error(`No DNS addresses resolved for ${hostname}.`), { code: 'ENOTFOUND' }), '', 0)
        return
      }
      if (options.all) callback(null, usable)
      else callback(null, usable[0]!.address, usable[0]!.family)
    }
    if (cached && cached.expiresAt > now) {
      deliver(cached.addresses)
      return
    }
    void systemLookup(hostname, { all: true, verbatim: true }).then((addresses) => {
      cache.set(key, { addresses, expiresAt: Date.now() + ttlMs })
      deliver(addresses)
    }).catch((error: unknown) => {
      if (cached && cached.expiresAt + staleTtlMs > now) {
        deliver(cached.addresses)
        return
      }
      callback(error as NodeJS.ErrnoException, '', 0)
    })
  }
}

function createAnonymousS3Client(source: DatasetS3Source): S3Sender {
  const rejectCredentialResolution = async (): Promise<never> => {
    throw new Error('Anonymous Dataset S3 access must not resolve process credentials.')
  }
  const config: S3ClientConfig = {
    endpoint: source.endpoint,
    region: source.region,
    forcePathStyle: source.forcePathStyle,
    credentials: rejectCredentialResolution,
    credentialDefaultProvider: () => rejectCredentialResolution,
    httpAuthSchemeProvider: () => [{ schemeId: 'smithy.api#noAuth' }],
    httpAuthSchemes: [{
      schemeId: 'smithy.api#noAuth',
      identityProvider: (providers) => providers.getIdentityProvider('smithy.api#noAuth') ?? (async () => ({})),
      signer: new NoAuthSigner()
    }],
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
  }
  return new S3Client(config)
}

async function withAnonymousS3Client<T>(
  source: DatasetS3Source,
  factory: (source: DatasetS3Source) => S3Sender,
  operation: (client: S3Sender) => Promise<T>
): Promise<T> {
  requireAnonymousBinding(source.credentialBindingId)
  const client = factory(source)
  try {
    return await operation(client)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Dataset object store '${source.id}' request failed: ${detail}`)
  } finally {
    client.destroy?.()
  }
}

function numberHeader<K extends string>(
  response: Response,
  headerName: string,
  propertyName: K
): Partial<Record<K, number>> {
  const value = Number(response.headers.get(headerName))
  return Number.isFinite(value) && value >= 0
    ? { [propertyName]: value } as Record<K, number>
    : {}
}

function stringHeader<K extends string>(
  response: Response,
  headerName: string,
  propertyName: K
): Partial<Record<K, string>> {
  const value = response.headers.get(headerName)
  return value ? { [propertyName]: value } as Record<K, string> : {}
}

function connectorRequestError(
  request: DatasetHttpRequest,
  attempts: number,
  error: unknown
): DatasetConnectorRequestError {
  const causeMessage = errorMessage(error)
  const causeCode = errorCode(error)
  const nestedMessage = nestedCauseMessage(error)
  const diagnostic = [causeCode, nestedMessage].filter(Boolean).join(': ')
  return new DatasetConnectorRequestError(
    `Dataset API request to '${request.sourceId}' (${request.url.hostname}) failed after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${causeMessage}${diagnostic ? `; cause=${diagnostic}` : ''}`,
    {
      sourceId: request.sourceId,
      host: request.url.hostname,
      attempts,
      ...(causeCode ? { causeCode } : {}),
      causeMessage: nestedMessage || causeMessage
    }
  )
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return true
  const code = errorCode(error)
  return error.name === 'TypeError' || error.name === 'TimeoutError' || error.name === 'AbortError' ||
    ['EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT'].includes(code ?? '')
}

function errorCode(error: unknown): string | undefined {
  const direct = (error as NodeJS.ErrnoException | undefined)?.code
  if (typeof direct === 'string') return direct
  const cause = (error as Error & { cause?: NodeJS.ErrnoException } | undefined)?.cause
  return typeof cause?.code === 'string' ? cause.code : undefined
}

function nestedCauseMessage(error: unknown): string | undefined {
  const cause = (error as Error & { cause?: unknown } | undefined)?.cause
  return cause instanceof Error ? cause.message : cause === undefined ? undefined : String(cause)
}

async function retryDelay(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.min(150 * (2 ** (attempt - 1)), 1_000)))
}

function cleanEtag(value: unknown): string | undefined {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : undefined
}

function isoDate(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString()
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
