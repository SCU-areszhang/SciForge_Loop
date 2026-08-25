import { createHash } from 'node:crypto'
import { access, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { z } from 'zod'
import {
  datasetObjectListInputSchema,
  datasetObjectMetadataInputSchema,
  datasetObjectRawDataInputSchema,
  datasetObjectStoreListInputSchema,
  datasetObjectStoreRegisterInputSchema,
  datasetCredentialBindingIdSchema,
  type DatasetObjectListInput,
  type DatasetObjectMetadataInput,
  type DatasetObjectRawDataInput,
  type DatasetObjectStoreListInput,
  type DatasetObjectStoreRegisterInput,
  type DatasetObjectStoreSource
} from './contract.js'
import {
  createDatasetS3Connector,
  type DatasetS3Connector
} from './main/connectors/dataset-connectors.internal.js'

type ObjectStoreRegistry = Readonly<{
  version: 2
  sources: DatasetObjectStoreSource[]
}>

const objectStoreSourceRegistrySchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  endpoint: z.string().trim().url().max(4096),
  bucket: z.string().trim().min(1).max(255),
  prefix: z.string().max(4096).optional(),
  region: z.string().trim().min(1).max(128),
  forcePathStyle: z.boolean(),
  allowInsecureHttp: z.boolean(),
  credentialBindingId: datasetCredentialBindingIdSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict()

const objectStoreRegistrySchema = z.object({
  version: z.literal(2),
  sources: z.array(objectStoreSourceRegistrySchema).max(1000)
}).strict()

export type DatasetObjectStoreService = ReturnType<typeof createDatasetObjectStoreService>

const DEFAULT_REGION = 'us-east-1'
const DEFAULT_MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024
const PREVIEW_BYTES = 8 * 1024

export function createDatasetObjectStoreService(options: {
  workspaceRoot?: string
} = {}) {
  return createDatasetObjectStoreServiceWithConnector({
    workspaceRoot: options.workspaceRoot,
    connector: createDatasetS3Connector()
  })
}

export function createDatasetObjectStoreServiceWithConnector(options: Readonly<{
  workspaceRoot?: string
  connector: DatasetS3Connector
}>) {
  const defaultWorkspaceRoot = options.workspaceRoot?.trim()
  const connector = options.connector

  return {
    async register(raw: DatasetObjectStoreRegisterInput) {
      const input = datasetObjectStoreRegisterInputSchema.parse(raw)
      const workspaceRoot = resolveWorkspaceRoot(input.workspaceRoot, defaultWorkspaceRoot)
      validateEndpoint(input.endpoint, input.allowInsecureHttp === true)
      const registryPath = registryPathFor(workspaceRoot)
      const registry = await readRegistry(registryPath)
      const existingIndex = registry.sources.findIndex((source) => source.id === input.id)
      const previous = existingIndex >= 0 ? registry.sources[existingIndex] : undefined
      const now = new Date().toISOString()
      const source: DatasetObjectStoreSource = {
        id: input.id,
        name: input.name ?? input.id,
        ...(input.description ? { description: input.description } : {}),
        endpoint: normalizeEndpoint(input.endpoint),
        bucket: input.bucket,
        ...(input.prefix ? { prefix: normalizePrefix(input.prefix) } : {}),
        region: input.region ?? DEFAULT_REGION,
        forcePathStyle: input.forcePathStyle ?? true,
        allowInsecureHttp: input.allowInsecureHttp ?? false,
        ...(input.credentialBindingId ? { credentialBindingId: input.credentialBindingId } : {}),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now
      }
      if (previous && !input.overwrite) {
        if (sameConfiguration(previous, source)) {
          return {
            registryPath,
            source: publicSource(previous),
            reused: true
          }
        }
        throw new Error(`Dataset object store '${input.id}' already exists with different settings. Set overwrite=true to replace it.`)
      }
      if (existingIndex >= 0) registry.sources[existingIndex] = source
      else registry.sources.push(source)
      registry.sources.sort((left, right) => left.id.localeCompare(right.id))
      await writeRegistry(registryPath, registry)
      return { registryPath, source: publicSource(source), reused: false }
    },

    async list(raw: DatasetObjectStoreListInput) {
      const input = datasetObjectStoreListInputSchema.parse(raw)
      const workspaceRoot = resolveWorkspaceRoot(input.workspaceRoot, defaultWorkspaceRoot)
      const registryPath = registryPathFor(workspaceRoot)
      const registry = await readRegistry(registryPath)
      return {
        registryPath,
        stores: registry.sources.map(publicSource)
      }
    },

    async listObjects(raw: DatasetObjectListInput) {
      const input = datasetObjectListInputSchema.parse(raw)
      const { source } = await registeredSource(input.sourceId, input.workspaceRoot, defaultWorkspaceRoot)
      const prefix = scopedKey(source.prefix, input.prefix)
      return withConnectorError(source, async () => {
        const result = await connector.listObjects(source, {
          ...(prefix ? { prefix } : {}),
          ...(input.delimiter ? { delimiter: input.delimiter } : {}),
          ...(input.continuationToken ? { continuationToken: input.continuationToken } : {}),
          maxKeys: input.maxKeys ?? 100
        })
        return {
          source: publicSource(source),
          request: {
            bucket: source.bucket,
            prefix,
            ...(input.delimiter ? { delimiter: input.delimiter } : {})
          },
          response: { status: result.status },
          objects: result.objects.map((object) => ({
            key: object.key,
            relativeKey: relativeKey(source.prefix, object.key),
            size: object.size,
            etag: object.etag,
            lastModified: object.lastModified,
            storageClass: object.storageClass
          })),
          commonPrefixes: result.commonPrefixes,
          isTruncated: result.isTruncated,
          nextContinuationToken: result.nextContinuationToken,
          keyCount: result.keyCount
        }
      })
    },

    async metadata(raw: DatasetObjectMetadataInput) {
      const input = datasetObjectMetadataInputSchema.parse(raw)
      const { source } = await registeredSource(input.sourceId, input.workspaceRoot, defaultWorkspaceRoot)
      const key = scopedKey(source.prefix, input.key)
      return withConnectorError(source, async () => {
        const result = await connector.metadata(source, key)
        return {
          source: publicSource(source),
          request: { bucket: source.bucket, key },
          response: { status: result.status },
          metadata: {
            key,
            size: result.size,
            etag: result.etag,
            lastModified: result.lastModified,
            contentType: result.contentType,
            contentEncoding: result.contentEncoding,
            cacheControl: result.cacheControl,
            versionId: result.versionId,
            storageClass: result.storageClass,
            userMetadata: result.userMetadata
          }
        }
      })
    },

    async rawData(raw: DatasetObjectRawDataInput) {
      const input = datasetObjectRawDataInputSchema.parse(raw)
      const workspaceRoot = resolveWorkspaceRoot(input.workspaceRoot, defaultWorkspaceRoot)
      const { source } = await registeredSource(input.sourceId, workspaceRoot, defaultWorkspaceRoot)
      const key = scopedKey(source.prefix, input.key)
      const fileName = safeFileName(input.outputFileName ?? basename(key))
      const maxBytes = input.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES
      return withConnectorError(source, async () => {
        const range = input.range
          ? `bytes=${input.range.start}-${input.range.end ?? ''}`
          : undefined
        const result = await connector.rawData(source, {
          key,
          ...(input.range ? { range: input.range } : {})
        })
        if (!result.body) throw new Error(`Dataset object '${key}' returned an empty body.`)
        if (result.contentLength !== undefined && result.contentLength > maxBytes) {
          throw new Error(`Dataset object '${key}' exceeds the ${maxBytes}-byte download limit.`)
        }
        const destinationDirectory = resolve(workspaceRoot, '.sciforge', 'datasets', 'raw', source.id)
        await mkdir(destinationDirectory, { recursive: true })
        const temporaryPath = join(destinationDirectory, `.${fileName}.${process.pid}.${Date.now()}.tmp`)
        const streamed = await streamBody(result.body, temporaryPath, maxBytes)
        let destinationPath = join(destinationDirectory, fileName)
        let reused = false
        try {
          if (await exists(destinationPath)) {
            if (!input.overwrite) {
              throw new Error(`Dataset artifact '${fileName}' already exists. Set overwrite=true to create or reuse a content-addressed version.`)
            }
            const existingSha = createHash('sha256').update(await readFile(destinationPath)).digest('hex')
            if (existingSha === streamed.sha256) {
              reused = true
              await rm(temporaryPath, { force: true })
            } else {
              destinationPath = versionedPath(destinationPath, streamed.sha256)
              if (await exists(destinationPath)) await rm(temporaryPath, { force: true })
              else await rename(temporaryPath, destinationPath)
            }
          } else {
            await rename(temporaryPath, destinationPath)
          }
        } catch (error) {
          await rm(temporaryPath, { force: true })
          throw error
        }
        const format = resolveFormat(input.expectedFormat, fileName, result.contentType)
        const preview = ['fasta', 'json', 'text'].includes(format)
          ? await readPreview(destinationPath, PREVIEW_BYTES)
          : undefined
        const manifestPath = `${destinationPath}.manifest.json`
        await writeFile(manifestPath, `${JSON.stringify({
          version: 1,
          operation: 'dataset_object_raw_data',
          source: safeSourceForManifest(source),
          request: { bucket: source.bucket, key, ...(range ? { range } : {}) },
          response: {
            status: result.status,
            etag: result.etag,
            lastModified: result.lastModified,
            contentType: result.contentType,
            bytes: streamed.bytes
          },
          artifact: { path: destinationPath, bytes: streamed.bytes, sha256: streamed.sha256, format }
        }, null, 2)}\n`, 'utf8')
        return {
          source: publicSource(source),
          request: { bucket: source.bucket, key, ...(range ? { range } : {}) },
          response: {
            status: result.status,
            bytes: streamed.bytes,
            etag: result.etag,
            lastModified: result.lastModified,
            contentType: result.contentType,
            rangeSatisfied: range ? result.status === 206 || !!result.contentRange : undefined
          },
          artifact: {
            path: destinationPath,
            manifestPath,
            fileName: basename(destinationPath),
            bytes: streamed.bytes,
            sha256: streamed.sha256,
            format,
            reused,
            ...(preview ? { preview: preview.content, previewTruncated: preview.truncated } : {})
          }
        }
      })
    }
  }
}

async function withConnectorError<T>(
  source: DatasetObjectStoreSource,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Dataset object store '${source.id}' request failed: ${detail}`)
  }
}

function publicSource(source: DatasetObjectStoreSource) {
  return {
    ...safeSourceForManifest(source),
    authentication: source.credentialBindingId
      ? { mode: 'bound' as const, status: 'unavailable' as const }
      : { mode: 'anonymous' as const, status: 'ready' as const },
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  }
}

function safeSourceForManifest(source: DatasetObjectStoreSource) {
  return {
    id: source.id,
    name: source.name,
    ...(source.description ? { description: source.description } : {}),
    endpoint: source.endpoint,
    bucket: source.bucket,
    ...(source.prefix ? { prefix: source.prefix } : {}),
    region: source.region,
    forcePathStyle: source.forcePathStyle,
    allowInsecureHttp: source.allowInsecureHttp
  }
}

async function registeredSource(
  sourceId: string,
  requestedRoot: string | undefined,
  defaultRoot: string | undefined
): Promise<{ source: DatasetObjectStoreSource; workspaceRoot: string }> {
  const workspaceRoot = resolveWorkspaceRoot(requestedRoot, defaultRoot)
  const registry = await readRegistry(registryPathFor(workspaceRoot))
  const source = registry.sources.find((candidate) => candidate.id === sourceId)
  if (!source) throw new Error(`Dataset object store '${sourceId}' is not registered.`)
  return { source, workspaceRoot }
}

function resolveWorkspaceRoot(requestedRoot: string | undefined, defaultRoot: string | undefined): string {
  const root = requestedRoot?.trim() || defaultRoot
  if (!root) throw new Error('workspaceRoot is required for Dataset object storage access.')
  return resolve(root)
}

function registryPathFor(workspaceRoot: string): string {
  return join(workspaceRoot, '.sciforge', 'datasets', 'object-stores.json')
}

async function readRegistry(path: string): Promise<ObjectStoreRegistry> {
  try {
    const registry = objectStoreRegistrySchema.parse(JSON.parse(await readFile(path, 'utf8')))
    for (const source of registry.sources) validateEndpoint(source.endpoint, source.allowInsecureHttp)
    return registry
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 2, sources: [] }
    throw new Error(`Failed to read Dataset object store registry: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function writeRegistry(path: string, registry: ObjectStoreRegistry): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

function validateEndpoint(value: string, allowInsecureHttp: boolean): void {
  const endpoint = new URL(value)
  if (endpoint.username || endpoint.password) throw new Error('Object store endpoint must not contain credentials.')
  if (endpoint.search || endpoint.hash) throw new Error('Object store endpoint must not contain a query or fragment.')
  if (['169.254.169.254', 'metadata.google.internal'].includes(endpoint.hostname.toLowerCase())) {
    throw new Error('Cloud instance metadata endpoints are not allowed.')
  }
  if (endpoint.protocol === 'https:') return
  if (endpoint.protocol === 'http:' && allowInsecureHttp) return
  throw new Error('Object store endpoints must use HTTPS unless allowInsecureHttp=true is explicitly confirmed.')
}

function normalizeEndpoint(value: string): string {
  const url = new URL(value)
  return url.toString().replace(/\/$/, '')
}

function normalizePrefix(value: string): string {
  if (value.includes('\u0000')) throw new Error('Object store prefixes must not contain NUL bytes.')
  return value.replace(/^\/+/, '').replace(/\/+$/, '')
}

function scopedKey(basePrefix: string | undefined, requested: string | undefined): string {
  const relative = requested?.replace(/^\/+/, '') ?? ''
  if (!basePrefix) return relative
  if (!relative) return `${normalizePrefix(basePrefix)}/`
  return `${normalizePrefix(basePrefix)}/${relative}`
}

function relativeKey(basePrefix: string | undefined, key: unknown): string | undefined {
  if (typeof key !== 'string') return undefined
  if (!basePrefix) return key
  const prefix = `${normalizePrefix(basePrefix)}/`
  return key.startsWith(prefix) ? key.slice(prefix.length) : key
}

function sameConfiguration(left: DatasetObjectStoreSource, right: DatasetObjectStoreSource): boolean {
  const comparable = (source: DatasetObjectStoreSource) => ({
    id: source.id,
    name: source.name,
    description: source.description,
    endpoint: source.endpoint,
    bucket: source.bucket,
    prefix: source.prefix,
    region: source.region,
    forcePathStyle: source.forcePathStyle,
    allowInsecureHttp: source.allowInsecureHttp,
    credentialBindingId: source.credentialBindingId
  })
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right))
}

async function streamBody(body: any, path: string, maxBytes: number): Promise<{ bytes: number; sha256: string }> {
  const handle = await open(path, 'wx')
  const hash = createHash('sha256')
  let bytes = 0
  try {
    for await (const chunk of bodyChunks(body)) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.byteLength
      if (bytes > maxBytes) throw new Error(`Dataset object exceeds the ${maxBytes}-byte download limit.`)
      hash.update(buffer)
      await handle.write(buffer)
    }
  } catch (error) {
    await handle.close()
    await rm(path, { force: true })
    throw error
  }
  await handle.close()
  return { bytes, sha256: hash.digest('hex') }
}

async function* bodyChunks(body: any): AsyncGenerator<Uint8Array | string> {
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    yield* body as AsyncIterable<Uint8Array | string>
    return
  }
  if (body && typeof body.transformToByteArray === 'function') {
    yield await body.transformToByteArray()
    return
  }
  if (body instanceof Uint8Array || typeof body === 'string') {
    yield body
    return
  }
  throw new Error('Dataset object response body is not streamable.')
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function safeFileName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..' || basename(trimmed) !== trimmed) {
    throw new Error('Dataset object outputFileName must be a plain file name.')
  }
  return trimmed
}

function versionedPath(path: string, sha256: string): string {
  const extension = extname(path)
  const stem = extension ? path.slice(0, -extension.length) : path
  return `${stem}-${sha256.slice(0, 12)}${extension}`
}

function resolveFormat(
  requested: DatasetObjectRawDataInput['expectedFormat'],
  fileName: string,
  contentType: string | undefined
): 'fasta' | 'json' | 'text' | 'binary' {
  if (requested && requested !== 'auto') return requested
  const extension = extname(fileName).toLowerCase()
  if (['.fa', '.faa', '.fna', '.fasta'].includes(extension)) return 'fasta'
  if (['.json', '.jsonl', '.ndjson'].includes(extension) || /json/i.test(contentType ?? '')) return 'json'
  if (['.txt', '.csv', '.tsv', '.sdf', '.cif', '.mmcif'].includes(extension) || /^text\//i.test(contentType ?? '')) return 'text'
  return 'binary'
}

async function readPreview(path: string, maxBytes: number): Promise<{ content: string; truncated: boolean }> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(maxBytes + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return {
      content: buffer.subarray(0, Math.min(bytesRead, maxBytes)).toString('utf8'),
      truncated: bytesRead > maxBytes
    }
  } finally {
    await handle.close()
  }
}
