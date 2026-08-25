import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, link, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { z } from 'zod'
import {
  datasetApiListInputSchema,
  datasetApiCatalogInputSchema,
  datasetApiRegisterProviderInputSchema,
  datasetApiMetadataInputSchema,
  datasetApiRawDataInputSchema,
  datasetApiRegisterInputSchema,
  datasetCredentialBindingIdSchema,
  type DatasetApiListInput,
  type DatasetApiCatalogInput,
  type DatasetApiRegisterProviderInput,
  type DatasetApiMetadataInput,
  type DatasetApiRawDataInput,
  type DatasetApiRegisterInput,
  type DatasetApiSource
} from './contract.js'
import { BIOLOGY_DATASET_PROVIDERS } from './providers.js'
import { EXECUTABLE_DATASET_PROVIDER_PRESETS } from './provider-presets.js'
import {
  createDatasetHttpConnector,
  DatasetConnectorRequestError,
  type DatasetHttpConnector,
  type DatasetHttpResponse
} from './main/connectors/dataset-connectors.internal.js'

type DatasetApiRegistry = {
  version: 2
  sources: DatasetApiSource[]
}

const datasetApiSourceRegistrySchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  baseUrl: z.string().trim().url().max(4096),
  metadataEndpoint: z.string().trim().min(1).max(2048),
  rawDataEndpoint: z.string().trim().min(1).max(2048),
  credentialBindingId: datasetCredentialBindingIdSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict()

const datasetApiRegistrySchema = z.object({
  version: z.literal(2),
  sources: z.array(datasetApiSourceRegistrySchema).max(1000)
}).strict()

export type DatasetApiService = ReturnType<typeof createDatasetApiService>

const RAW_ARTIFACT_PREVIEW_BYTES = 2 * 1024
const DEFAULT_DATASET_MAX_RETRIES = 3
const BUILTIN_SOURCE_TIMESTAMP = '1970-01-01T00:00:00.000Z'
const registryMutations = new Map<string, Promise<void>>()

export { DatasetConnectorRequestError as DatasetApiRequestError }

export function createDatasetApiService(options: {
  workspaceRoot?: string
} = {}) {
  return createDatasetApiServiceWithConnector({
    workspaceRoot: options.workspaceRoot,
    connector: createDatasetHttpConnector()
  })
}

export function createDatasetApiServiceWithConnector(options: Readonly<{
  workspaceRoot?: string
  connector: DatasetHttpConnector
}>) {
  const defaultWorkspaceRoot = options.workspaceRoot?.trim()
  const connector = options.connector

  return {
    async catalog(raw: DatasetApiCatalogInput) {
      const input = datasetApiCatalogInputSchema.parse(raw)
      const query = input.query?.toLocaleLowerCase()
      const providers = BIOLOGY_DATASET_PROVIDERS.filter((provider) => {
        if (input.category && provider.category !== input.category) return false
        if (input.transport && provider.transport !== input.transport) return false
        if (!query) return true
        return [provider.id, provider.name, provider.metadata, provider.rawData]
          .some((value) => value.toLocaleLowerCase().includes(query))
      })
      return {
        providers,
        total: providers.length,
        note: 'provider-specific and sdk-required entries need dedicated adapters before execution; catalog presence alone does not imply generic HTTP compatibility.'
      }
    },

    async list(raw: DatasetApiListInput) {
      const input = datasetApiListInputSchema.parse(raw)
      const registryPath = resolveRegistryPath(input.workspaceRoot, defaultWorkspaceRoot)
      const registry = await readRegistry(registryPath)
      const requestedSourceIds = input.sourceIds ? new Set(input.sourceIds) : null
      const sourcesById = new Map<string, DatasetApiSource>(
        Object.values(EXECUTABLE_DATASET_PROVIDER_PRESETS)
          .map((preset) => [preset.source.id, builtinSource(preset.source)] as const)
      )
      for (const source of registry.sources) sourcesById.set(source.id, source)
      const sources = [...sourcesById.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .filter((source) => !requestedSourceIds || requestedSourceIds.has(source.id))
        .map((source) => ({
          usageExamples: providerUsageExamples(source),
          ...source,
          authentication: authenticationStatus(source.credentialBindingId)
        }))
      const usageExamplesBySource = Object.fromEntries(
        sources.flatMap((source) => source.usageExamples ? [[source.id, source.usageExamples]] : [])
      )
      return {
        usageExamplesBySource,
        sources,
        registryPath
      }
    },

    async registerProvider(raw: DatasetApiRegisterProviderInput) {
      const input = datasetApiRegisterProviderInputSchema.parse(raw)
      const preset = EXECUTABLE_DATASET_PROVIDER_PRESETS[input.providerId]
      const sourceId = input.sourceId ?? preset.source.id
      const registered = await registerSource({
        ...preset.source,
        id: sourceId,
        workspaceRoot: input.workspaceRoot,
        overwrite: input.overwrite
      }, defaultWorkspaceRoot)
      return {
        ...registered,
        providerId: input.providerId,
        usage: {
          metadata: withSourceId(preset.metadataExample, sourceId),
          rawData: withSourceId(preset.rawDataExample, sourceId)
        }
      }
    },

    async register(raw: DatasetApiRegisterInput) {
      const input = datasetApiRegisterInputSchema.parse(raw)
      return registerSource(input, defaultWorkspaceRoot)
    },

    async metadata(raw: DatasetApiMetadataInput) {
      const input = datasetApiMetadataInputSchema.parse(raw)
      const { source, workspaceRoot } = await registeredSource(input.sourceId, input.workspaceRoot, defaultWorkspaceRoot)
      const url = buildEndpointUrl(source, source.metadataEndpoint, input.pathParameters, input.query)
      const response = await connector.get({
        sourceId: source.id,
        url,
        credentialBindingId: source.credentialBindingId,
        timeoutMs: input.timeoutMs ?? 30_000,
        maxRetries: input.maxRetries ?? DEFAULT_DATASET_MAX_RETRIES
      })
      const maxBytes = input.maxBytes ?? 2 * 1024 * 1024
      if (!response.ok) throw httpError(response)
      const body = await readResponseBody(response, maxBytes)
      const contentType = response.contentType
      const metadata = parseMetadata(body, contentType)
      const responseMode = input.responseMode ?? 'auto'
      const summarizeResponse = responseMode === 'summary' || (
        responseMode === 'auto' && Buffer.byteLength(body) > 64 * 1024
      )
      const responseMetadata = summarizeResponse
        ? summarizeMetadata(metadata)
        : metadata
      const sourceRecord = { id: source.id, name: source.name }
      const requestRecord = publicRequestRecord(url)
      const responseRecord = { status: response.status, contentType, bytes: Buffer.byteLength(body) }
      let artifact: Record<string, unknown> | undefined
      if (input.outputFileName) {
        const format = typeof metadata === 'string' ? 'text' : 'json'
        const data = format === 'json'
          ? Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`)
          : Buffer.from(String(metadata))
        const sha256 = sha256Bytes(data)
        const outputDirectory = join(workspaceRoot, '.sciforge', 'datasets', 'metadata', source.id)
        await mkdir(outputDirectory, { recursive: true })
        const fileName = resolveRawFileName(input.outputFileName, response, url, input.sourceId)
        const requestedPath = join(outputDirectory, fileName)
        const temporaryPath = `${requestedPath}.${process.pid}.tmp`
        await writeFile(temporaryPath, data, { flag: 'wx' })
        let artifactPath = requestedPath
        let reused = false
        try {
          if (await pathExists(requestedPath)) {
            if (await hashFile(requestedPath) === sha256) reused = true
            else {
              artifactPath = versionedRawArtifactPath(requestedPath, sha256)
              reused = await installRawArtifact(temporaryPath, artifactPath, sha256)
            }
          } else reused = await installRawArtifact(temporaryPath, requestedPath, sha256)
        } finally {
          await rm(temporaryPath, { force: true }).catch(() => undefined)
        }
        artifactPath = await realpath(artifactPath)
        const manifestPath = `${artifactPath}.manifest.json`
        await writeRawArtifactManifest(manifestPath, {
          version: 1,
          artifactId: `sha256:${sha256}`,
          operation: 'dataset_api_metadata',
          format,
          path: artifactPath,
          manifestPath,
          sha256,
          bytes: data.byteLength,
          parents: [],
          parameters: {
            sourceId: source.id,
            responseMode: input.responseMode ?? 'auto',
            ...(input.planId ? { planId: input.planId } : {})
          },
          summary: { responseBytes: responseRecord.bytes, artifactBytes: data.byteLength, reused },
          schema: rawArtifactSchema(format),
          source: sourceRecord,
          request: requestRecord,
          response: responseRecord,
          origins: [{ source: sourceRecord, request: requestRecord, response: responseRecord }],
          createdAt: new Date().toISOString()
        })
        artifact = {
          path: artifactPath,
          manifestPath,
          sha256,
          bytes: data.byteLength,
          fileName: basename(artifactPath),
          format,
          reused
        }
      }
      return {
        ...(artifact ? { artifact } : {}),
        source: sourceRecord,
        request: requestRecord,
        response: responseRecord,
        metadata: responseMetadata,
        metadataResponseMode: summarizeResponse ? 'summary' : 'full',
        metadataTruncated: summarizeResponse
      }
    },

    async rawData(raw: DatasetApiRawDataInput) {
      const input = datasetApiRawDataInputSchema.parse(raw)
      const { source, workspaceRoot } = await registeredSource(
        input.sourceId,
        input.workspaceRoot,
        defaultWorkspaceRoot
      )
      let url = buildEndpointUrl(source, source.rawDataEndpoint, input.pathParameters, input.query)
      let resolvedFrom: Record<string, unknown> | undefined
      if (isNcbiGeneFastaRequest(source, input.query, input.expectedFormat, input.outputFileName)) {
        const resolved = await resolveNcbiGeneFastaRequest(
          connector,
          source,
          input.query ?? {},
          input.timeoutMs ?? 30_000,
          input.maxRetries ?? DEFAULT_DATASET_MAX_RETRIES
        )
        url = resolved.url
        resolvedFrom = resolved.resolvedFrom
      }
      const response = await connector.get({
        sourceId: source.id,
        url,
        credentialBindingId: source.credentialBindingId,
        timeoutMs: input.timeoutMs ?? 5 * 60_000,
        maxRetries: input.maxRetries ?? DEFAULT_DATASET_MAX_RETRIES,
        ...(input.range ? { range: input.range } : {})
      })
      const maxBytes = input.maxBytes ?? 256 * 1024 * 1024
      if (!response.ok) throw httpError(response)
      const fileName = resolveRawFileName(input.outputFileName, response, url, input.sourceId)
      const expectedFormat = resolveExpectedFormat(input.expectedFormat, input.outputFileName, input.query, response)
      const outputDir = join(workspaceRoot, '.sciforge', 'datasets', 'raw', input.sourceId)
      const artifactPath = join(outputDir, fileName)
      await mkdir(outputDir, { recursive: true })
      if (!input.overwrite && await pathExists(artifactPath)) {
        throw new Error(`Raw dataset artifact already exists: ${artifactPath}`)
      }
      const temporaryPath = `${artifactPath}.${process.pid}.tmp`
      const streamed = await streamResponseToFile(response, temporaryPath, maxBytes, expectedFormat)
      let finalArtifactPath = artifactPath
      let reused = false
      try {
        if (await pathExists(artifactPath)) {
          const existingHash = await hashFile(artifactPath)
          if (existingHash === streamed.sha256) {
            reused = true
          } else {
            finalArtifactPath = versionedRawArtifactPath(artifactPath, streamed.sha256)
            reused = await installRawArtifact(temporaryPath, finalArtifactPath, streamed.sha256)
          }
        } else {
          reused = await installRawArtifact(temporaryPath, artifactPath, streamed.sha256)
        }
      } finally {
        await rm(temporaryPath, { force: true }).catch(() => undefined)
      }
      finalArtifactPath = await realpath(finalArtifactPath)
      const sourceRecord = { id: source.id, name: source.name }
      const requestRecord = {
        ...publicRequestRecord(url),
        ...(input.range ? { range: input.range } : {}),
        ...(resolvedFrom ? { resolvedFrom } : {})
      }
      const responseRecord = {
        status: response.status,
        contentType: response.contentType,
        contentRange: response.contentRange,
        rangeSatisfied: input.range ? response.status === 206 : undefined,
        bytes: streamed.bytes
      }
      const manifestPath = `${finalArtifactPath}.manifest.json`
      await writeRawArtifactManifest(manifestPath, {
        version: 1,
        artifactId: `sha256:${streamed.sha256}`,
        operation: 'dataset_api_raw_data',
        format: expectedFormat,
        path: finalArtifactPath,
        manifestPath,
        sha256: streamed.sha256,
        bytes: streamed.bytes,
        parents: [],
        parameters: {
          sourceId: source.id,
          expectedFormat,
          ...(input.planId ? { planId: input.planId } : {}),
          ...(input.range ? { range: input.range } : {})
        },
        summary: { responseBytes: streamed.bytes, reused },
        schema: rawArtifactSchema(expectedFormat),
        source: sourceRecord,
        request: requestRecord,
        response: responseRecord,
        origins: [{ source: sourceRecord, request: requestRecord, response: responseRecord }],
        createdAt: new Date().toISOString()
      })
      const preview = expectedFormat === 'fasta' || expectedFormat === 'json' || expectedFormat === 'text'
        ? await readArtifactPreview(finalArtifactPath, RAW_ARTIFACT_PREVIEW_BYTES)
        : undefined
      return {
        artifact: {
          path: finalArtifactPath,
          manifestPath,
          sha256: streamed.sha256,
          bytes: streamed.bytes,
          fileName: basename(finalArtifactPath),
          format: expectedFormat,
          reused,
          ...(preview ? {
            preview: preview.content,
            previewTruncated: preview.truncated
          } : {})
        },
        source: sourceRecord,
        request: requestRecord,
        response: responseRecord
      }
    }
  }
}

function providerUsageExamples(source: DatasetApiSource): {
  metadata: Record<string, unknown>
  rawData: Record<string, unknown>
} | undefined {
  const preset = Object.values(EXECUTABLE_DATASET_PROVIDER_PRESETS).find((candidate) => (
    candidate.source.id === source.id
    || (
      candidate.source.baseUrl === source.baseUrl
      && candidate.source.metadataEndpoint === source.metadataEndpoint
      && candidate.source.rawDataEndpoint === source.rawDataEndpoint
    )
  ))
  if (!preset) return undefined
  return {
    metadata: { ...preset.metadataExample, sourceId: source.id },
    rawData: { ...preset.rawDataExample, sourceId: source.id }
  }
}

async function readArtifactPreview(
  path: string,
  maxBytes: number
): Promise<{ content: string; truncated: boolean }> {
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

async function registerSource(
  input: DatasetApiRegisterInput,
  defaultWorkspaceRoot: string | undefined
): Promise<{ registryPath: string; source: DatasetApiSource; reused: boolean }> {
  const registryPath = resolveRegistryPath(input.workspaceRoot, defaultWorkspaceRoot)
  validateBaseUrl(input.baseUrl)
  validateEndpoint(input.metadataEndpoint, 'metadataEndpoint')
  validateEndpoint(input.rawDataEndpoint, 'rawDataEndpoint')
  return withRegistryMutation(registryPath, async () => {
    const registry = await readRegistry(registryPath)
    const existingIndex = registry.sources.findIndex((source) => source.id === input.id)
    const now = new Date().toISOString()
    const previous = existingIndex >= 0 ? registry.sources[existingIndex] : undefined
    const source: DatasetApiSource = {
      id: input.id,
      name: input.name ?? input.id,
      ...(input.description ? { description: input.description } : {}),
      baseUrl: input.baseUrl,
      metadataEndpoint: input.metadataEndpoint,
      rawDataEndpoint: input.rawDataEndpoint,
      ...(input.credentialBindingId ? { credentialBindingId: input.credentialBindingId } : {}),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    }
    if (previous && !input.overwrite) {
      if (sameSourceConfiguration(previous, source)) {
        return { registryPath, source: previous, reused: true }
      }
      throw new Error(`Dataset source '${input.id}' already exists with different settings. Set overwrite=true to replace it.`)
    }
    if (existingIndex >= 0) registry.sources[existingIndex] = source
    else registry.sources.push(source)
    registry.sources.sort((left, right) => left.id.localeCompare(right.id))
    await writeRegistry(registryPath, registry)
    return { registryPath, source, reused: false }
  })
}

function sameSourceConfiguration(left: DatasetApiSource, right: DatasetApiSource): boolean {
  const configuration = (source: DatasetApiSource) => ({
    id: source.id,
    name: source.name,
    description: source.description,
    baseUrl: source.baseUrl,
    metadataEndpoint: source.metadataEndpoint,
    rawDataEndpoint: source.rawDataEndpoint,
    credentialBindingId: source.credentialBindingId
  })
  return JSON.stringify(configuration(left)) === JSON.stringify(configuration(right))
}

function withSourceId(example: Record<string, unknown>, sourceId: string): Record<string, unknown> {
  return { ...example, sourceId }
}

async function registeredSource(
  sourceId: string,
  requestedRoot: string | undefined,
  defaultRoot: string | undefined
): Promise<{ source: DatasetApiSource; workspaceRoot: string }> {
  const workspaceRoot = resolveWorkspaceRoot(requestedRoot, defaultRoot)
  const registry = await readRegistry(registryPathFor(workspaceRoot))
  const source = registry.sources.find((candidate) => candidate.id === sourceId) ??
    builtinSourceById(sourceId)
  if (!source) throw new Error(`Dataset source '${sourceId}' is not registered.`)
  return { source, workspaceRoot }
}

function resolveWorkspaceRoot(requestedRoot: string | undefined, defaultRoot: string | undefined): string {
  const root = requestedRoot?.trim() || defaultRoot
  if (!root) throw new Error('workspaceRoot is required for Dataset API access.')
  return resolve(root)
}

function registryPathFor(workspaceRoot: string): string {
  return join(workspaceRoot, '.sciforge', 'datasets', 'api-sources.json')
}

function resolveRegistryPath(requestedRoot: string | undefined, defaultRoot: string | undefined): string {
  return registryPathFor(resolveWorkspaceRoot(requestedRoot, defaultRoot))
}

async function readRegistry(path: string): Promise<DatasetApiRegistry> {
  try {
    const registry = datasetApiRegistrySchema.parse(JSON.parse(await readFile(path, 'utf8')))
    for (const source of registry.sources) {
      validateBaseUrl(source.baseUrl)
      validateEndpoint(source.metadataEndpoint, 'metadataEndpoint')
      validateEndpoint(source.rawDataEndpoint, 'rawDataEndpoint')
    }
    return registry
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 2, sources: [] }
    throw new Error(`Failed to read Dataset API registry: ${message(error)}`)
  }
}

async function writeRegistry(path: string, registry: DatasetApiRegistry): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

function builtinSourceById(sourceId: string): DatasetApiSource | undefined {
  const preset = EXECUTABLE_DATASET_PROVIDER_PRESETS[
    sourceId as keyof typeof EXECUTABLE_DATASET_PROVIDER_PRESETS
  ]
  return preset ? builtinSource(preset.source) : undefined
}

function builtinSource(
  source: Omit<DatasetApiRegisterInput, 'workspaceRoot' | 'overwrite'>
): DatasetApiSource {
  return {
    ...source,
    name: source.name ?? source.id,
    createdAt: BUILTIN_SOURCE_TIMESTAMP,
    updatedAt: BUILTIN_SOURCE_TIMESTAMP
  }
}

async function withRegistryMutation<T>(path: string, mutate: () => Promise<T>): Promise<T> {
  const previous = registryMutations.get(path) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  registryMutations.set(path, current)
  await previous
  try {
    return await mutate()
  } finally {
    release()
    if (registryMutations.get(path) === current) registryMutations.delete(path)
  }
}

function validateBaseUrl(value: string): void {
  const url = new URL(value)
  if (url.username || url.password) throw new Error('Dataset baseUrl must not contain credentials.')
  if (url.protocol === 'https:') return
  if (url.protocol === 'http:' && isLoopbackHost(url.hostname)) return
  throw new Error('Dataset baseUrl must use HTTPS; HTTP is allowed only for loopback development APIs.')
}

function validateEndpoint(value: string, field: string): void {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) {
    throw new Error(`${field} must be relative to baseUrl.`)
  }
}

function isLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  const normalized = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function buildEndpointUrl(
  source: DatasetApiSource,
  endpoint: string,
  pathParameters: Record<string, string> | undefined,
  query: Record<string, string | number | boolean | Array<string | number | boolean>> | undefined
): URL {
  const renderedEndpoint = endpoint.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, name: string) => {
    const value = pathParameters?.[name] ?? (
      name === 'identifier'
        ? pathParameters?.accession ?? pathParameters?.id
        : undefined
    )
    if (!value) throw new Error(`Dataset endpoint requires pathParameters.${name}.`)
    return encodeURIComponent(value)
  })
  const base = new URL(source.baseUrl)
  const normalizedBase = base.toString().endsWith('/') ? base : new URL(`${base.toString()}/`)
  const url = new URL(renderedEndpoint, normalizedBase)
  if (url.origin !== base.origin) throw new Error('Dataset endpoint must stay on the registered origin.')
  for (const [name, rawValue] of Object.entries(query ?? {})) {
    url.searchParams.delete(name)
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      url.searchParams.append(name, String(value))
    }
  }
  return url
}

function isNcbiGeneFastaRequest(
  source: DatasetApiSource,
  query: DatasetApiRawDataInput['query'],
  expectedFormat: DatasetApiRawDataInput['expectedFormat'],
  outputFileName: string | undefined
): boolean {
  if (source.id !== 'ncbi-eutils') return false
  const db = scalarQueryValue(query?.db)?.toLowerCase()
  const rettype = scalarQueryValue(query?.rettype)?.toLowerCase()
  return db === 'gene' && (
    rettype === 'fasta' || expectedFormat === 'fasta' || /\.(?:fa|faa|fna|fasta)$/i.test(outputFileName ?? '')
  )
}

async function resolveNcbiGeneFastaRequest(
  connector: DatasetHttpConnector,
  source: DatasetApiSource,
  query: NonNullable<DatasetApiRawDataInput['query']>,
  timeoutMs: number,
  maxRetries: number
): Promise<{ url: URL; resolvedFrom: Record<string, unknown> }> {
  const geneId = scalarQueryValue(query.id)
  if (!geneId) throw new Error('NCBI Gene FASTA access requires query.id with one Gene ID.')
  const summaryUrl = buildEndpointUrl(source, 'esummary.fcgi', undefined, {
    db: 'gene',
    id: geneId,
    retmode: 'json',
    ...(query.tool !== undefined ? { tool: query.tool } : {})
  })
  const summaryResponse = await connector.get({
    sourceId: source.id,
    url: summaryUrl,
    credentialBindingId: source.credentialBindingId,
    timeoutMs,
    maxRetries
  })
  if (!summaryResponse.ok) throw httpError(summaryResponse)
  const summaryBody = await readResponseBody(summaryResponse, 1024 * 1024)
  const summary = JSON.parse(summaryBody) as {
    result?: Record<string, { genomicinfo?: Array<{ chraccver?: string; chrstart?: number; chrstop?: number }> }>
  }
  const genomic = summary.result?.[geneId]?.genomicinfo?.[0]
  const accession = genomic?.chraccver?.trim()
  const chrStart = Number(genomic?.chrstart)
  const chrStop = Number(genomic?.chrstop)
  if (!accession || !Number.isInteger(chrStart) || !Number.isInteger(chrStop) || chrStart < 0 || chrStop < 0) {
    throw new Error(`NCBI Gene ${geneId} does not expose resolvable genomic sequence coordinates.`)
  }
  const sequenceStart = Math.min(chrStart, chrStop) + 1
  const sequenceStop = Math.max(chrStart, chrStop) + 1
  const strand = chrStart > chrStop ? 2 : 1
  const url = buildEndpointUrl(source, source.rawDataEndpoint, undefined, {
    db: 'nuccore',
    id: accession,
    seq_start: sequenceStart,
    seq_stop: sequenceStop,
    strand,
    rettype: 'fasta',
    retmode: 'text',
    ...(query.tool !== undefined ? { tool: query.tool } : {})
  })
  return {
    url,
    resolvedFrom: {
      database: 'gene',
      geneId,
      accession,
      sequenceStart,
      sequenceStop,
      strand
    }
  }
}

function scalarQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.length === 1 ? String(value[0]) : undefined
  return value === undefined ? undefined : String(value)
}

function httpError(response: DatasetHttpResponse): Error {
  return new Error(`Dataset API returned HTTP ${response.status}.`)
}

async function readResponseBody(response: DatasetHttpResponse, maxBytes: number): Promise<string> {
  if (response.contentLength !== undefined && response.contentLength > maxBytes) {
    throw new Error(`Dataset response exceeds the ${maxBytes}-byte limit.`)
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(`Dataset response exceeds the ${maxBytes}-byte limit.`)
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
}

function parseMetadata(body: string, contentType: string): unknown {
  const firstCharacter = body.trimStart()[0]
  if (/json/i.test(contentType) || firstCharacter === '[' || firstCharacter === '{') {
    try {
      return JSON.parse(body)
    } catch (error) {
      throw new Error(`Dataset metadata is not valid JSON: ${message(error)}`)
    }
  }
  return body
}

function summarizeMetadata(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return value.length > 256 ? `${value.slice(0, 256)}…` : value
  }
  if (depth >= 3) {
    if (Array.isArray(value)) return { itemCount: value.length }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>
      const identityEntries = Object.entries(record).filter(([key, item]) => (
        ['id', 'name', 'label', 'accession', 'value'].includes(key.toLowerCase()) &&
        (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
      ))
      if (identityEntries.length > 0) {
        return Object.fromEntries(identityEntries.map(([key, item]) => [
          key,
          summarizeMetadata(item, depth + 1)
        ]))
      }
      return { fieldCount: Object.keys(value).length }
    }
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.slice(0, 2).map((item) => summarizeMetadata(item, depth + 1))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([key, item]) => [key, summarizeMetadata(item, depth + 1)])
    )
  }
  return String(value)
}

async function streamResponseToFile(
  response: DatasetHttpResponse,
  outputPath: string,
  maxBytes: number,
  expectedFormat: 'fasta' | 'json' | 'text' | 'binary'
): Promise<{ bytes: number; sha256: string }> {
  if (response.contentLength !== undefined && response.contentLength > maxBytes) {
    throw new Error(`Raw dataset response exceeds the ${maxBytes}-byte limit.`)
  }
  const handle = await open(outputPath, 'wx')
  const hash = createHash('sha256')
  let bytes = 0
  const prefixChunks: Uint8Array[] = []
  let prefixBytes = 0
  try {
    const reader = response.body?.getReader()
    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > maxBytes) {
          await reader.cancel()
          throw new Error(`Raw dataset response exceeds the ${maxBytes}-byte limit.`)
        }
        hash.update(value)
        if (prefixBytes < 4096) {
          const remaining = 4096 - prefixBytes
          const prefix = value.subarray(0, remaining)
          prefixChunks.push(prefix)
          prefixBytes += prefix.byteLength
        }
        await handle.write(value)
      }
    }
    validateResponseFormat(
      new TextDecoder().decode(Buffer.concat(prefixChunks.map((chunk) => Buffer.from(chunk)))),
      expectedFormat
    )
  } catch (error) {
    await handle.close()
    await rm(outputPath, { force: true }).catch(() => undefined)
    throw error
  }
  await handle.close()
  return { bytes, sha256: hash.digest('hex') }
}

function resolveExpectedFormat(
  requested: DatasetApiRawDataInput['expectedFormat'],
  outputFileName: string | undefined,
  query: DatasetApiRawDataInput['query'],
  response: DatasetHttpResponse
): 'fasta' | 'json' | 'text' | 'binary' {
  if (requested && requested !== 'auto') return requested
  const rettype = scalarQueryValue(query?.rettype)?.toLowerCase()
  const contentType = response.contentType
  const fileName = outputFileName ?? ''
  if (rettype === 'fasta' || /format\s*=\s*fasta/i.test(contentType) || /\.(?:fa|faa|fna|fasta)$/i.test(fileName)) {
    return 'fasta'
  }
  if (/json/i.test(contentType) || /\.json$/i.test(fileName)) return 'json'
  if (/^text\//i.test(contentType) || /\.(?:txt|tsv|csv)$/i.test(fileName)) return 'text'
  return 'binary'
}

function validateResponseFormat(prefix: string, expectedFormat: 'fasta' | 'json' | 'text' | 'binary'): void {
  if (expectedFormat === 'binary') return
  const trimmed = prefix.trimStart()
  if (expectedFormat === 'fasta' && !trimmed.startsWith('>')) {
    throw new Error('Dataset response format mismatch: expected FASTA data beginning with a ">" header.')
  }
  if (expectedFormat === 'json' && trimmed[0] !== '{' && trimmed[0] !== '[') {
    throw new Error('Dataset response format mismatch: expected a JSON object or array.')
  }
  if (expectedFormat === 'text' && prefix.includes('\u0000')) {
    throw new Error('Dataset response format mismatch: expected text but received binary data.')
  }
}

function resolveRawFileName(
  requested: string | undefined,
  response: DatasetHttpResponse,
  url: URL,
  sourceId: string
): string {
  const dispositionName = response.contentDisposition?.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i)?.[1]
  const urlName = basename(url.pathname)
  const inferred = dispositionName ? decodeURIComponent(dispositionName) : urlName || `${sourceId}-raw${extensionForContentType(response.contentType)}`
  const candidate = requested ?? inferred
  if (candidate !== basename(candidate) || candidate === '.' || candidate === '..') {
    throw new Error('outputFileName must be a plain file name without directory segments.')
  }
  const sanitized = candidate.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '')
  if (!sanitized) throw new Error('Unable to derive a safe raw-data file name.')
  return extname(sanitized) ? sanitized : `${sanitized}${extensionForContentType(response.contentType)}`
}

function extensionForContentType(contentType: string | null | undefined): string {
  if (/json/i.test(contentType ?? '')) return '.json'
  if (/csv/i.test(contentType ?? '')) return '.csv'
  if (/zip/i.test(contentType ?? '')) return '.zip'
  if (/gzip/i.test(contentType ?? '')) return '.gz'
  return '.bin'
}

function rawArtifactSchema(format: 'fasta' | 'json' | 'text' | 'binary'): Record<string, unknown> {
  if (format === 'fasta') {
    return {
      version: 1,
      format,
      fields: [
        { name: 'header', types: { string: 1 }, nullable: false },
        { name: 'id', types: { string: 1 }, nullable: false },
        { name: 'description', types: { string: 1 }, nullable: true },
        { name: 'sequence', types: { string: 1 }, nullable: false },
        { name: 'length', types: { number: 1 }, nullable: false }
      ]
    }
  }
  return {
    version: 1,
    format,
    fields: [],
    inference: format === 'json' ? 'deferred-to-dataset_profile' : 'not-applicable'
  }
}

async function hashFile(path: string): Promise<string> {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function versionedRawArtifactPath(path: string, sha256: string): string {
  const extension = extname(path)
  const stem = basename(path, extension)
  return join(dirname(path), `${stem}-${sha256.slice(0, 12)}${extension}`)
}

async function installRawArtifact(temporaryPath: string, targetPath: string, sha256: string): Promise<boolean> {
  try {
    await link(temporaryPath, targetPath)
    return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if (await hashFile(targetPath) !== sha256) {
      throw new Error(`Raw dataset artifact collision at content-addressed path: ${targetPath}`)
    }
    return true
  }
}

async function writeRawArtifactManifest(path: string, manifest: Record<string, unknown>): Promise<void> {
  try {
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const existing = JSON.parse(await readFile(path, 'utf8')) as { sha256?: string; path?: string }
    if (existing.sha256 !== manifest.sha256 || existing.path !== manifest.path) {
      throw new Error(`Raw dataset manifest collision: ${path}`)
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function publicRequestRecord(url: URL): Readonly<{
  origin: string
  path: string
  queryNames: readonly string[]
}> {
  return Object.freeze({
    origin: url.origin,
    path: url.pathname,
    queryNames: Object.freeze([...new Set(url.searchParams.keys())].sort())
  })
}

function authenticationStatus(credentialBindingId: string | undefined): Readonly<{
  mode: 'anonymous' | 'bound'
  status: 'ready' | 'unavailable'
}> {
  return credentialBindingId
    ? Object.freeze({ mode: 'bound', status: 'unavailable' })
    : Object.freeze({ mode: 'anonymous', status: 'ready' })
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
