import { createHash } from 'node:crypto'
import {
  CONTENT_SPACE_PROVIDER_CONTRACT_VERSION,
  ContentSpaceOperationError,
  contentContainerReferenceSchema,
  contentFileReferenceSchema,
  contentSpacePageRequestSchema,
  defineContentSpaceProvider,
  type ArtifactReference,
  type ContentContainerReference,
  type ContentFileReference,
  type ContentSpaceCapabilityState,
  type ContentSpaceDownloadSink,
  type ContentSpaceEntrySummary,
  type ContentSpaceProvider,
  type ContentSpaceProviderOperationContext,
  type ContentSpaceUploadSource,
  type CreateFolderReceipt,
  type UploadNewReceipt
} from '@sciforge/domain-content-space/contract'
import { principalSnapshotSchema } from '@sciforge/domain-sdk/principal'
import { providerInstanceRefSchema } from '@sciforge/domain-sdk/provider-composition'

const MAX_MOCK_FILE_BYTES = 16 * 1024 * 1024
const CHUNK_BYTES = 64 * 1024
const ROOT_CONTAINER_ID = 'mock_root'

type FolderNode = Readonly<{
  kind: 'container'
  id: string
  parentId?: string
  name: string
}>

type FileVersion = Readonly<{
  id: string
  bytes: Uint8Array
  digest: string
  modifiedAt: string
}>

type FileNode = Readonly<{
  kind: 'file'
  id: string
  parentId: string
  name: string
  currentVersionId: string
  versions: ReadonlyMap<string, FileVersion>
}>

type StoredNode = FolderNode | FileNode
type WriteRecord = Readonly<{
  fingerprint: string
  receipt: CreateFolderReceipt | UploadNewReceipt
}>

export type LocalMockContentSpaceProviderOptions = Readonly<{
  providerInstanceRef: string
  now?: () => Date
}>

export function createLocalMockContentSpaceProvider(
  options: LocalMockContentSpaceProviderOptions
): ContentSpaceProvider {
  const providerInstanceRef = providerInstanceRefSchema.parse(options.providerInstanceRef)
  const now = options.now ?? (() => new Date())
  const nodes = new Map<string, StoredNode>()
  const writes = new Map<string, WriteRecord>()
  let nextFolderId = 1
  let nextFileId = 1
  let nextVersionId = 1

  nodes.set(ROOT_CONTAINER_ID, Object.freeze({
    kind: 'container',
    id: ROOT_CONTAINER_ID,
    name: 'Local Content Space'
  }))

  const provider = defineContentSpaceProvider({
    contractVersion: CONTENT_SPACE_PROVIDER_CONTRACT_VERSION,

    async describeCapabilities(context) {
      assertContext(context, providerInstanceRef, now)
      return ALL_CAPABILITIES
    },

    async listContainers({ context, page }) {
      assertContext(context, providerInstanceRef, now)
      const request = contentSpacePageRequestSchema.parse(page)
      return pageItems([{
        reference: containerReference(providerInstanceRef, ROOT_CONTAINER_ID),
        label: 'Local Content Space'
      }], request)
    },

    async listEntries({ context, parent, page }) {
      assertContext(context, providerInstanceRef, now)
      const parentReference = assertContainerReference(parent, providerInstanceRef)
      assertFolder(nodes, parentReference.containerId)
      const request = contentSpacePageRequestSchema.parse(page)
      const items = [...nodes.values()]
        .filter((node) => node.parentId === parentReference.containerId)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((node) => entrySummary(providerInstanceRef, node))
      return pageItems(items, request)
    },

    async observeEntry({ context, reference }) {
      assertContext(context, providerInstanceRef, now)
      const node = resolveNode(nodes, reference, providerInstanceRef)
      if ('immutableVersionId' in reference) {
        const file = assertFile(nodes, reference.fileId)
        if (!file.versions.has(reference.immutableVersionId)) {
          fail('invalid_reference', 'The immutable file version is unknown.')
        }
      }
      return Object.freeze({
        entry: entrySummary(providerInstanceRef, node),
        capabilities: [...(node.kind === 'container' ? CONTAINER_CAPABILITIES : FILE_CAPABILITIES)]
      })
    },

    async createFolder({ context, parent, name }) {
      assertWriteContext(context, providerInstanceRef, now)
      const parentReference = assertContainerReference(parent, providerInstanceRef)
      assertFolder(nodes, parentReference.containerId)
      const safeName = parseEntryName(name)
      const fingerprint = `create-folder:${parentReference.containerId}:${safeName}`
      const prior = resolvePriorWrite(writes, context.invocationId, fingerprint)
      if (prior) return prior as CreateFolderReceipt
      assertNoCollision(nodes, parentReference.containerId, safeName)
      const id = `mock_folder_${nextFolderId++}`
      nodes.set(id, Object.freeze({
        kind: 'container',
        id,
        parentId: parentReference.containerId,
        name: safeName
      }))
      const receipt = Object.freeze({
        invocationId: context.invocationId,
        reference: containerReference(providerInstanceRef, id)
      })
      writes.set(context.invocationId, Object.freeze({ fingerprint, receipt }))
      return receipt
    },

    async uploadNewFile({ context, parent, name, source }) {
      assertWriteContext(context, providerInstanceRef, now)
      const parentReference = assertContainerReference(parent, providerInstanceRef)
      assertFolder(nodes, parentReference.containerId)
      const safeName = parseEntryName(name)
      const sourceSize = parseSourceSize(source)
      const fingerprint = `upload-new:${parentReference.containerId}:${safeName}:${sourceSize}`
      const prior = resolvePriorWrite(writes, context.invocationId, fingerprint)
      if (prior) return prior as UploadNewReceipt
      assertNoCollision(nodes, parentReference.containerId, safeName)
      const bytes = await readUploadSource(source, sourceSize, context.signal)
      assertNotCancelled(context.signal)

      const fileId = `mock_file_${nextFileId++}`
      const versionId = `mock_version_${nextVersionId++}`
      const version = Object.freeze({
        id: versionId,
        bytes,
        digest: sha256(bytes),
        modifiedAt: now().toISOString()
      })
      nodes.set(fileId, Object.freeze({
        kind: 'file',
        id: fileId,
        parentId: parentReference.containerId,
        name: safeName,
        currentVersionId: versionId,
        versions: new Map([[versionId, version]])
      }))
      const receipt = Object.freeze({
        invocationId: context.invocationId,
        reference: fileReference(providerInstanceRef, fileId)
      })
      writes.set(context.invocationId, Object.freeze({ fingerprint, receipt }))
      return receipt
    },

    async downloadFile({ context, reference, destination }) {
      assertWriteContext(context, providerInstanceRef, now)
      const file = assertFile(nodes, assertFileProvider(reference, providerInstanceRef).fileId)
      const versionId = 'immutableVersionId' in reference
        ? reference.immutableVersionId
        : file.currentVersionId
      const version = file.versions.get(versionId)
      if (!version) fail('invalid_reference', 'The requested immutable version is unknown.')
      try {
        for (let offset = 0; offset < version.bytes.byteLength; offset += CHUNK_BYTES) {
          assertNotCancelled(context.signal)
          await destination.write(version.bytes.slice(offset, offset + CHUNK_BYTES))
        }
        assertNotCancelled(context.signal)
        await destination.commit()
      } catch (error) {
        await abortDestination(destination)
        throw error
      }
      return Object.freeze({
        invocationId: context.invocationId,
        bytesWritten: version.bytes.byteLength,
        digest: Object.freeze({ algorithm: 'sha256' as const, value: version.digest })
      })
    },

    async resolvePortalTarget({ context, reference }) {
      assertContext(context, providerInstanceRef, now)
      const node = resolveNode(nodes, reference, providerInstanceRef)
      const expiresAt = new Date(now().getTime() + 60_000).toISOString()
      return Object.freeze({
        url: `https://content-space.invalid/portal/${encodeURIComponent(node.id)}`,
        expiresAt
      })
    },

    async observeImmutableVersion({ context, reference }) {
      assertContext(context, providerInstanceRef, now)
      const parsed = assertFileProvider(reference, providerInstanceRef)
      const file = assertFile(nodes, parsed.fileId)
      const version = file.versions.get(file.currentVersionId)
      if (!version) fail('immutable_version_unproven', 'The current immutable version is unavailable.')
      return Object.freeze({
        proven: true as const,
        proof: Object.freeze({
          reference: fileReference(providerInstanceRef, file.id),
          immutableVersionId: version.id,
          immutableIdentity: true as const,
          retained: true as const,
          versionSpecificRetrieval: true as const,
          digest: Object.freeze({ algorithm: 'sha256' as const, value: version.digest })
        })
      })
    }
  })
  return provider
}

const ALL_CAPABILITIES: readonly ContentSpaceCapabilityState[] = Object.freeze([
  capability('list-containers'),
  capability('list-entries'),
  capability('observe-entry'),
  capability('create-folder'),
  capability('upload-new'),
  capability('download'),
  capability('portal-target'),
  capability('observe-immutable-version')
])
const CONTAINER_CAPABILITIES = Object.freeze(ALL_CAPABILITIES.filter(({ operation }) =>
  ['list-entries', 'observe-entry', 'create-folder', 'upload-new', 'portal-target']
    .includes(operation)
))
const FILE_CAPABILITIES = Object.freeze(ALL_CAPABILITIES.filter(({ operation }) =>
  ['observe-entry', 'download', 'portal-target', 'observe-immutable-version']
    .includes(operation)
))

function capability(operation: ContentSpaceCapabilityState['operation']): ContentSpaceCapabilityState {
  return Object.freeze({ operation, readiness: 'production_ready', reasonCode: 'available' })
}

function assertContext(
  context: ContentSpaceProviderOperationContext,
  providerInstanceRef: string,
  now: () => Date
): void {
  principalSnapshotSchema.parse(context.principal)
  if (context.providerInstanceRef !== providerInstanceRef) {
    fail('invalid_target', 'The operation target belongs to another Provider Instance.')
  }
  if (!Number.isFinite(Date.parse(context.deadlineAt)) || Date.parse(context.deadlineAt) <= now().getTime()) {
    fail('cancelled', 'The operation deadline has elapsed.')
  }
  assertNotCancelled(context.signal)
}

function assertWriteContext(
  context: ContentSpaceProviderOperationContext & Readonly<{ invocationId: string }>,
  providerInstanceRef: string,
  now: () => Date
): void {
  assertContext(context, providerInstanceRef, now)
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/u.test(context.invocationId)) {
    fail('invalid_input', 'A bounded logical invocation identity is required.')
  }
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) fail('cancelled', 'The operation was cancelled.')
}

function parseEntryName(value: string): string {
  const name = value.trim()
  if (name.length < 1 || name.length > 128 || /[\\/\0]/u.test(name) || name === '.' || name === '..') {
    fail('invalid_input', 'The entry name is invalid or out of bounds.')
  }
  return name
}

function parseSourceSize(source: ContentSpaceUploadSource): number {
  if (!Number.isSafeInteger(source.size) || source.size < 0 || source.size > MAX_MOCK_FILE_BYTES ||
    typeof source.read !== 'function') {
    fail('bounds_exceeded', 'The upload source exceeds the local Provider bounds.')
  }
  return source.size
}

async function readUploadSource(
  source: ContentSpaceUploadSource,
  size: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const result = new Uint8Array(size)
  for (let offset = 0; offset < size;) {
    assertNotCancelled(signal)
    const length = Math.min(CHUNK_BYTES, size - offset)
    const chunk = await source.read(Object.freeze({ offset, length }))
    if (!(chunk instanceof Uint8Array) || chunk.byteLength < 1 || chunk.byteLength > length) {
      fail('provider_unavailable', 'The upload source returned an invalid chunk.')
    }
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function resolvePriorWrite(
  writes: ReadonlyMap<string, WriteRecord>,
  invocationId: string,
  fingerprint: string
): CreateFolderReceipt | UploadNewReceipt | undefined {
  const prior = writes.get(invocationId)
  if (!prior) return undefined
  if (prior.fingerprint !== fingerprint) {
    fail('outcome_unknown', 'The invocation identity was already used for a different write.')
  }
  return prior.receipt
}

function assertNoCollision(nodes: ReadonlyMap<string, StoredNode>, parentId: string, name: string) {
  if ([...nodes.values()].some((node) => node.parentId === parentId && node.name === name)) {
    fail('conflict', 'An entry with this name already exists.')
  }
}

function assertContainerReference(
  reference: ContentContainerReference,
  providerInstanceRef: string
): ContentContainerReference {
  const parsed = contentContainerReferenceSchema.parse(reference)
  if (parsed.providerInstanceRef !== providerInstanceRef) {
    fail('invalid_target', 'The container belongs to another Provider Instance.')
  }
  return parsed
}

function assertFileProvider(
  reference: ContentFileReference | ArtifactReference,
  providerInstanceRef: string
): ContentFileReference | ArtifactReference {
  if (reference.providerInstanceRef !== providerInstanceRef) {
    fail('invalid_target', 'The file belongs to another Provider Instance.')
  }
  return reference
}

function resolveNode(
  nodes: ReadonlyMap<string, StoredNode>,
  reference: ContentContainerReference | ContentFileReference | ArtifactReference,
  providerInstanceRef: string
): StoredNode {
  const id = 'containerId' in reference
    ? assertContainerReference(reference, providerInstanceRef).containerId
    : assertFileProvider(reference, providerInstanceRef).fileId
  const node = nodes.get(id)
  if (!node) fail('invalid_reference', 'The referenced Content Space entry is unknown.')
  return node
}

function assertFolder(nodes: ReadonlyMap<string, StoredNode>, id: string): FolderNode {
  const node = nodes.get(id)
  if (!node || node.kind !== 'container') fail('invalid_reference', 'The container is unknown.')
  return node
}

function assertFile(nodes: ReadonlyMap<string, StoredNode>, id: string): FileNode {
  const node = nodes.get(id)
  if (!node || node.kind !== 'file') fail('invalid_reference', 'The file is unknown.')
  return node
}

function containerReference(providerInstanceRef: string, containerId: string) {
  return Object.freeze(contentContainerReferenceSchema.parse({ providerInstanceRef, containerId }))
}

function fileReference(providerInstanceRef: string, fileId: string) {
  return Object.freeze(contentFileReferenceSchema.parse({ providerInstanceRef, fileId }))
}

function entrySummary(providerInstanceRef: string, node: StoredNode): ContentSpaceEntrySummary {
  if (node.kind === 'container') {
    return Object.freeze({
      kind: 'container' as const,
      reference: containerReference(providerInstanceRef, node.id),
      label: node.name
    })
  }
  const version = node.versions.get(node.currentVersionId)
  if (!version) fail('provider_unavailable', 'The file version is unavailable.')
  return Object.freeze({
    kind: 'file' as const,
    reference: fileReference(providerInstanceRef, node.id),
    label: node.name,
    size: version.bytes.byteLength,
    modifiedAt: version.modifiedAt
  })
}

function pageItems<Item>(
  items: readonly Item[],
  request: Readonly<{ cursor?: string; limit: number }>
): { items: Item[]; nextCursor?: string } {
  const offset = request.cursor ? parseCursor(request.cursor) : 0
  if (offset > items.length) fail('invalid_input', 'The page cursor is invalid.')
  const page = items.slice(offset, offset + request.limit)
  const next = offset + page.length
  return {
    items: page,
    ...(next < items.length ? { nextCursor: `offset_${next}` } : {})
  }
}

function parseCursor(cursor: string): number {
  const match = /^offset_(\d{1,10})$/u.exec(cursor)
  if (!match) fail('invalid_input', 'The page cursor is invalid.')
  return Number(match[1])
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function abortDestination(destination: ContentSpaceDownloadSink): Promise<void> {
  try {
    await destination.abort()
  } catch {
    // The original bounded failure remains authoritative.
  }
}

function fail(
  code: ConstructorParameters<typeof ContentSpaceOperationError>[0]['code'],
  message: string
): never {
  throw new ContentSpaceOperationError({
    code,
    message,
    retry: code === 'conflict' ? 'after-human-action' : 'never'
  })
}
