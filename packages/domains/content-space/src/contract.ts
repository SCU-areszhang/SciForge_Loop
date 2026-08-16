import { z } from 'zod'
import {
  PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION,
  parsePortableResourceReference,
  validatePortableIdentity,
  type PortableResourceIdentity,
  type PortableResourceReferenceCodec,
  type PortableResourceReferenceEnvelope
} from '@sciforge/domain-sdk/portable-resource-references'
import {
  providerInstanceRefSchema
} from '@sciforge/domain-sdk/provider-composition'
import type { PrincipalSnapshot } from '@sciforge/domain-sdk/principal'
import { domainFileTransferHandleSchema } from '@sciforge/domain-sdk/file-transfer'

export const CONTENT_SPACE_DOMAIN_MODULE_ID = 'sciforge.content-space' as const
export const CONTENT_SPACE_PROVIDER_CONTRACT_VERSION = '1.0.0' as const

export const CONTENT_CONTAINER_REFERENCE_KIND = 'content-space.container-reference' as const
export const CONTENT_FILE_REFERENCE_KIND = 'content-space.file-reference' as const
export const ARTIFACT_REFERENCE_KIND = 'content-space.artifact-reference' as const
export const CONTENT_CONTAINER_RESOURCE_KIND = 'content-space.container' as const
export const CONTENT_FILE_RESOURCE_KIND = 'content-space.file' as const
export const ARTIFACT_RESOURCE_KIND = 'content-space.artifact' as const
export const CONTENT_SPACE_PORTABLE_AUTHORITY_RESOLVER_ID =
  'content-space.provider-instance-authority' as const
export const CONTENT_SPACE_PORTABLE_EXPORT_CONSUMER_ID =
  'content-space.portable-reference' as const

export const CONTENT_SPACE_CAPABILITY_IDS = Object.freeze({
  listProviderInstances: 'content-space.list-provider-instances',
  describeCapabilities: 'content-space.describe-capabilities',
  listContainers: 'content-space.list-containers',
  listEntries: 'content-space.list-entries',
  observeEntry: 'content-space.observe-entry',
  createFolder: 'content-space.create-folder',
  uploadNew: 'content-space.upload-new',
  download: 'content-space.download',
  resolvePortalTarget: 'content-space.resolve-portal-target',
  openPortalTarget: 'content-space.open-portal-target',
  observeImmutableVersion: 'content-space.observe-immutable-version'
} as const)

export const contentSpaceReadinessSchema = z.enum([
  'poc_only',
  'blocked_by_contract',
  'production_ready'
])
export type ContentSpaceReadiness = z.infer<typeof contentSpaceReadinessSchema>

export const contentSpaceOperationSchema = z.enum([
  'list-containers',
  'list-entries',
  'observe-entry',
  'create-folder',
  'upload-new',
  'download',
  'portal-target',
  'observe-immutable-version'
])
export type ContentSpaceOperation = z.infer<typeof contentSpaceOperationSchema>

export const contentSpaceReadinessReasonSchema = z.enum([
  'available',
  'verification_profile_required',
  'provider_contract_missing',
  'instance_policy_blocked',
  'resource_capability_missing',
  'platform_gate_blocked',
  'audience_policy_blocked'
])

export const contentSpaceCapabilityStateSchema = z.object({
  operation: contentSpaceOperationSchema,
  readiness: contentSpaceReadinessSchema,
  reasonCode: contentSpaceReadinessReasonSchema
}).strict()
export type ContentSpaceCapabilityState = z.infer<typeof contentSpaceCapabilityStateSchema>

export const contentSpaceErrorCodeSchema = z.enum([
  'invalid_input',
  'invalid_reference',
  'invalid_target',
  'unknown_provider_instance',
  'missing_provider',
  'provider_unavailable',
  'unauthorized',
  'blocked_by_contract',
  'bounds_exceeded',
  'conflict',
  'outcome_unknown',
  'cancelled',
  'unsafe_portal_target',
  'immutable_version_unproven'
])
export type ContentSpaceErrorCode = z.infer<typeof contentSpaceErrorCodeSchema>

export const contentSpaceErrorSchema = z.object({
  code: contentSpaceErrorCodeSchema,
  message: z.string().trim().min(1).max(256),
  retry: z.enum(['never', 'after-human-action', 'safe-with-same-invocation'])
}).strict().superRefine((error, context) => {
  if (error.code === 'outcome_unknown' && error.retry !== 'never') {
    context.addIssue({
      code: 'custom',
      path: ['retry'],
      message: 'Unknown outcomes cannot be retried automatically.'
    })
  }
})
export type ContentSpaceError = z.infer<typeof contentSpaceErrorSchema>

export class ContentSpaceOperationError extends Error {
  readonly detail: ContentSpaceError

  constructor(detail: ContentSpaceError) {
    const parsed = contentSpaceErrorSchema.parse(detail)
    super(parsed.message)
    this.name = 'ContentSpaceOperationError'
    this.detail = Object.freeze(parsed)
  }
}

export const contentSpaceInvocationIdSchema = z.string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]+$/u)

const providerResourceIdSchema = z.string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u, 'Use an opaque provider resource identity.')
  .refine((value) => !/^(?:res|cap|conn(?:ection)?)_/iu.test(value), {
    message: 'Local Broker and connection handles are not provider resource identities.'
  })

export const artifactDigestSchema = z.object({
  algorithm: z.literal('sha256'),
  value: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict()

const contentContainerIdentitySchema = z.object({
  containerId: providerResourceIdSchema
}).strict()
const contentFileIdentitySchema = z.object({
  fileId: providerResourceIdSchema
}).strict()
const artifactIdentitySchema = z.object({
  fileId: providerResourceIdSchema,
  immutableVersionId: providerResourceIdSchema,
  digest: artifactDigestSchema.optional()
}).strict()

export const contentContainerReferenceSchema = z.object({
  providerInstanceRef: providerInstanceRefSchema,
  containerId: providerResourceIdSchema
}).strict()
export const contentFileReferenceSchema = z.object({
  providerInstanceRef: providerInstanceRefSchema,
  fileId: providerResourceIdSchema
}).strict()
export const artifactReferenceSchema = z.object({
  providerInstanceRef: providerInstanceRefSchema,
  fileId: providerResourceIdSchema,
  immutableVersionId: providerResourceIdSchema,
  digest: artifactDigestSchema.optional()
}).strict()

export type ContentContainerReference = z.infer<typeof contentContainerReferenceSchema>
export type ContentFileReference = z.infer<typeof contentFileReferenceSchema>
export type ArtifactReference = z.infer<typeof artifactReferenceSchema>
type ContentContainerIdentity = z.infer<typeof contentContainerIdentitySchema>
type ContentFileIdentity = z.infer<typeof contentFileIdentitySchema>
type ArtifactIdentity = z.infer<typeof artifactIdentitySchema>

export const createFolderReceiptSchema = z.object({
  invocationId: contentSpaceInvocationIdSchema,
  reference: contentContainerReferenceSchema
}).strict()
export const uploadNewReceiptSchema = z.object({
  invocationId: contentSpaceInvocationIdSchema,
  reference: contentFileReferenceSchema
}).strict()
export const downloadReceiptSchema = z.object({
  invocationId: contentSpaceInvocationIdSchema,
  bytesWritten: z.number().int().nonnegative().max(1_073_741_824),
  digest: artifactDigestSchema.optional()
}).strict()

export type CreateFolderReceipt = z.infer<typeof createFolderReceiptSchema>
export type UploadNewReceipt = z.infer<typeof uploadNewReceiptSchema>
export type DownloadReceipt = z.infer<typeof downloadReceiptSchema>

export const immutableVersionProofSchema = z.object({
  reference: contentFileReferenceSchema,
  immutableVersionId: providerResourceIdSchema,
  immutableIdentity: z.literal(true),
  retained: z.literal(true),
  versionSpecificRetrieval: z.literal(true),
  digest: artifactDigestSchema.optional()
}).strict()
export type ImmutableVersionProof = z.infer<typeof immutableVersionProofSchema>

export function issueArtifactReference(input: unknown): ArtifactReference {
  const proof = immutableVersionProofSchema.parse(input)
  return Object.freeze(artifactReferenceSchema.parse({
    providerInstanceRef: proof.reference.providerInstanceRef,
    fileId: proof.reference.fileId,
    immutableVersionId: proof.immutableVersionId,
    ...(proof.digest ? { digest: proof.digest } : {})
  }))
}

export const contentContainerReferenceCodec: PortableResourceReferenceCodec<
  ContentContainerIdentity,
  unknown
> = defineReferenceCodec(
  CONTENT_CONTAINER_REFERENCE_KIND,
  CONTENT_CONTAINER_RESOURCE_KIND,
  contentContainerIdentitySchema
)

export const contentFileReferenceCodec: PortableResourceReferenceCodec<
  ContentFileIdentity,
  unknown
> = defineReferenceCodec(
  CONTENT_FILE_REFERENCE_KIND,
  CONTENT_FILE_RESOURCE_KIND,
  contentFileIdentitySchema
)

export const artifactReferenceCodec: PortableResourceReferenceCodec<
  ArtifactIdentity,
  unknown
> = defineReferenceCodec(
  ARTIFACT_REFERENCE_KIND,
  ARTIFACT_RESOURCE_KIND,
  artifactIdentitySchema
)

export function toPortableContentContainerReference(
  input: ContentContainerReference
): PortableResourceReferenceEnvelope {
  const reference = contentContainerReferenceSchema.parse(input)
  return portableEnvelope(
    reference.providerInstanceRef,
    contentContainerReferenceCodec,
    { containerId: reference.containerId }
  )
}

export function toPortableContentFileReference(
  input: ContentFileReference
): PortableResourceReferenceEnvelope {
  const reference = contentFileReferenceSchema.parse(input)
  return portableEnvelope(
    reference.providerInstanceRef,
    contentFileReferenceCodec,
    { fileId: reference.fileId }
  )
}

export function toPortableArtifactReference(
  input: ArtifactReference
): PortableResourceReferenceEnvelope {
  const reference = artifactReferenceSchema.parse(input)
  return portableEnvelope(
    reference.providerInstanceRef,
    artifactReferenceCodec,
    {
      fileId: reference.fileId,
      immutableVersionId: reference.immutableVersionId,
      ...(reference.digest ? { digest: reference.digest } : {})
    }
  )
}

export function parsePortableContentContainerReference(input: unknown): ContentContainerReference {
  const { envelope, identity } = parseOwnedEnvelope(input, contentContainerReferenceCodec)
  return Object.freeze(contentContainerReferenceSchema.parse({
    providerInstanceRef: envelope.authority,
    ...identity
  }))
}

export function parsePortableContentFileReference(input: unknown): ContentFileReference {
  const { envelope, identity } = parseOwnedEnvelope(input, contentFileReferenceCodec)
  return Object.freeze(contentFileReferenceSchema.parse({
    providerInstanceRef: envelope.authority,
    ...identity
  }))
}

export function parsePortableArtifactReference(input: unknown): ArtifactReference {
  const { envelope, identity } = parseOwnedEnvelope(input, artifactReferenceCodec)
  return Object.freeze(artifactReferenceSchema.parse({
    providerInstanceRef: envelope.authority,
    ...identity
  }))
}

function defineReferenceCodec<Identity>(
  kind: string,
  resourceKind: string,
  schema: z.ZodType<Identity>
): PortableResourceReferenceCodec<Identity, unknown> {
  return Object.freeze({
    kind,
    resourceKind,
    decodeIdentity: (identity) => schema.parse(identity),
    encodeIdentity: (identity) => validatePortableIdentity(schema.parse(identity)) as PortableResourceIdentity,
    projectExport: (projection) => schema.parse(projection)
  })
}

function portableEnvelope<Identity>(
  providerInstanceRef: string,
  codec: PortableResourceReferenceCodec<Identity>,
  identity: Identity
): PortableResourceReferenceEnvelope {
  return parsePortableResourceReference({
    contractVersion: PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION,
    kind: codec.kind,
    authority: providerInstanceRef,
    identity: codec.encodeIdentity(identity)
  })
}

function parseOwnedEnvelope<Identity>(
  input: unknown,
  codec: PortableResourceReferenceCodec<Identity>
): Readonly<{ envelope: PortableResourceReferenceEnvelope; identity: Identity }> {
  const envelope = parsePortableResourceReference(input)
  if (envelope.kind !== codec.kind) throw new TypeError('Portable reference kind is incompatible.')
  providerInstanceRefSchema.parse(envelope.authority)
  return Object.freeze({ envelope, identity: codec.decodeIdentity(envelope.identity) })
}

export const contentSpacePageRequestSchema = z.object({
  cursor: z.string().trim().min(1).max(256).optional(),
  limit: z.number().int().min(1).max(200)
}).strict()

export const contentSpaceContainerSummarySchema = z.object({
  reference: contentContainerReferenceSchema,
  label: z.string().trim().min(1).max(256)
}).strict()

export const contentSpaceEntrySummarySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('container'),
    reference: contentContainerReferenceSchema,
    label: z.string().trim().min(1).max(256)
  }).strict(),
  z.object({
    kind: z.literal('file'),
    reference: contentFileReferenceSchema,
    label: z.string().trim().min(1).max(256),
    size: z.number().int().nonnegative().max(1_073_741_824),
    modifiedAt: z.string().datetime({ offset: true }).optional()
  }).strict()
])

export const contentSpaceContainerPageSchema = z.object({
  items: z.array(contentSpaceContainerSummarySchema).max(200),
  nextCursor: z.string().trim().min(1).max(256).optional()
}).strict()
export const contentSpaceEntryPageSchema = z.object({
  items: z.array(contentSpaceEntrySummarySchema).max(200),
  nextCursor: z.string().trim().min(1).max(256).optional()
}).strict()

export const contentSpaceEntryObservationSchema = z.object({
  entry: contentSpaceEntrySummarySchema,
  capabilities: z.array(contentSpaceCapabilityStateSchema)
    .max(8)
    .superRefine((items, context) => {
      if (new Set(items.map(({ operation }) => operation)).size !== items.length) {
        context.addIssue({
          code: 'custom',
          message: 'Entry capability operations must be unique.'
        })
      }
    })
}).strict()

export const immutableVersionObservationSchema = z.discriminatedUnion('proven', [
  z.object({ proven: z.literal(false), reasonCode: contentSpaceReadinessReasonSchema }).strict(),
  z.object({
    proven: z.literal(true),
    proof: immutableVersionProofSchema
  }).strict()
])

export type ContentSpaceContainerSummary = z.infer<typeof contentSpaceContainerSummarySchema>
export type ContentSpaceEntrySummary = z.infer<typeof contentSpaceEntrySummarySchema>
export type ContentSpaceContainerPage = z.infer<typeof contentSpaceContainerPageSchema>
export type ContentSpaceEntryPage = z.infer<typeof contentSpaceEntryPageSchema>
export type ContentSpaceEntryObservation = z.infer<typeof contentSpaceEntryObservationSchema>
export type ImmutableVersionObservation = z.infer<typeof immutableVersionObservationSchema>

export const contentSpaceProviderInstanceSummarySchema = z.object({
  providerInstanceRef: providerInstanceRefSchema,
  label: z.string().trim().min(1).max(160)
}).strict()
export const contentSpaceProviderInstanceListSchema = z.object({
  items: z.array(contentSpaceProviderInstanceSummarySchema).max(64)
}).strict()
export const contentSpaceProviderInstanceInputSchema = z.object({
  providerInstanceRef: providerInstanceRefSchema
}).strict()
export const contentSpaceCapabilityListSchema = z.object({
  items: z.array(contentSpaceCapabilityStateSchema).max(8)
}).strict()
export const contentSpaceListContainersInputSchema = contentSpaceProviderInstanceInputSchema.extend({
  page: contentSpacePageRequestSchema
}).strict()
export const contentSpaceListEntriesInputSchema = z.object({
  parent: contentContainerReferenceSchema,
  page: contentSpacePageRequestSchema
}).strict()
export const contentSpaceObserveEntryInputSchema = z.object({
  reference: z.union([contentContainerReferenceSchema, contentFileReferenceSchema])
}).strict()
export const contentSpaceCreateFolderInputSchema = z.object({
  parent: contentContainerReferenceSchema,
  name: z.string().trim().min(1).max(128)
    .refine((name) => !/[\\/\0]/u.test(name) && name !== '.' && name !== '..')
}).strict()
export const contentSpaceObserveImmutableVersionInputSchema = z.object({
  reference: contentFileReferenceSchema
}).strict()
export const contentSpaceUploadNewInputSchema = z.object({
  parent: contentContainerReferenceSchema,
  name: z.string().trim().min(1).max(128)
    .refine((name) => !/[\\/\0]/u.test(name) && name !== '.' && name !== '..'),
  sourceHandle: domainFileTransferHandleSchema
}).strict()
export const contentSpaceDownloadInputSchema = z.object({
  reference: z.union([contentFileReferenceSchema, artifactReferenceSchema]),
  destinationHandle: domainFileTransferHandleSchema
}).strict()
export const contentSpaceResolvePortalTargetInputSchema = z.object({
  reference: z.union([
    contentContainerReferenceSchema,
    contentFileReferenceSchema,
    artifactReferenceSchema
  ])
}).strict()
export const contentSpacePortalTargetHandleSchema = z.object({
  handle: z.string().regex(/^portal_[A-Za-z0-9_-]{20,}$/u),
  expiresAt: z.string().datetime({ offset: true })
}).strict()
export const contentSpaceOpenPortalTargetInputSchema = z.object({
  handle: z.string().regex(/^portal_[A-Za-z0-9_-]{20,}$/u)
}).strict()
export const contentSpaceOpenPortalTargetResultSchema = z.object({
  opened: z.literal(true)
}).strict()

export type ContentSpaceProviderOperationContext = Readonly<{
  principal: PrincipalSnapshot
  providerInstanceRef: string
  invocationId?: string
  deadlineAt: string
  signal?: AbortSignal
}>

export type ContentSpaceUploadSource = Readonly<{
  size: number
  read(input: Readonly<{ offset: number; length: number }>): Promise<Uint8Array>
}>

export type ContentSpaceDownloadSink = Readonly<{
  write(chunk: Uint8Array): Promise<void>
  commit(): Promise<void>
  abort(): Promise<void>
}>

export type ContentSpacePortalTarget = Readonly<{
  url: string
  expiresAt: string
}>

export type ContentSpaceProvider = Readonly<{
  contractVersion: typeof CONTENT_SPACE_PROVIDER_CONTRACT_VERSION
  describeCapabilities(
    context: ContentSpaceProviderOperationContext
  ): Promise<readonly ContentSpaceCapabilityState[]>
  listContainers(input: Readonly<{
    context: ContentSpaceProviderOperationContext
    page: z.infer<typeof contentSpacePageRequestSchema>
  }>): Promise<ContentSpaceContainerPage>
  listEntries(input: Readonly<{
    context: ContentSpaceProviderOperationContext
    parent: ContentContainerReference
    page: z.infer<typeof contentSpacePageRequestSchema>
  }>): Promise<ContentSpaceEntryPage>
  observeEntry(input: Readonly<{
    context: ContentSpaceProviderOperationContext
    reference: ContentContainerReference | ContentFileReference | ArtifactReference
  }>): Promise<ContentSpaceEntryObservation>
  createFolder(input: Readonly<{
    context: ContentSpaceProviderOperationContext & Readonly<{ invocationId: string }>
    parent: ContentContainerReference
    name: string
  }>): Promise<CreateFolderReceipt>
  uploadNewFile(input: Readonly<{
    context: ContentSpaceProviderOperationContext & Readonly<{ invocationId: string }>
    parent: ContentContainerReference
    name: string
    source: ContentSpaceUploadSource
  }>): Promise<UploadNewReceipt>
  downloadFile(input: Readonly<{
    context: ContentSpaceProviderOperationContext & Readonly<{ invocationId: string }>
    reference: ContentFileReference | ArtifactReference
    destination: ContentSpaceDownloadSink
  }>): Promise<DownloadReceipt>
  resolvePortalTarget(input: Readonly<{
    context: ContentSpaceProviderOperationContext
    reference: ContentContainerReference | ContentFileReference | ArtifactReference
  }>): Promise<ContentSpacePortalTarget>
  observeImmutableVersion(input: Readonly<{
    context: ContentSpaceProviderOperationContext
    reference: ContentFileReference
  }>): Promise<ImmutableVersionObservation>
}>

export type ContentSpaceProviderHostPorts = Readonly<{
  contractVersion: typeof CONTENT_SPACE_PROVIDER_CONTRACT_VERSION
}>

export function defineContentSpaceProvider(input: ContentSpaceProvider): ContentSpaceProvider {
  if (!isRecord(input)) throw new TypeError('ContentSpaceProvider must be an object.')
  const candidate = input as unknown as Record<string, unknown>
  const keys = Object.keys(input).sort()
  const expected = [
    'contractVersion',
    'createFolder',
    'describeCapabilities',
    'downloadFile',
    'listContainers',
    'listEntries',
    'observeEntry',
    'observeImmutableVersion',
    'resolvePortalTarget',
    'uploadNewFile'
  ].sort()
  if (keys.join(',') !== expected.join(',') ||
    input.contractVersion !== CONTENT_SPACE_PROVIDER_CONTRACT_VERSION ||
    expected.slice(1).some((key) => typeof candidate[key] !== 'function')) {
    throw new TypeError('ContentSpaceProvider contract is invalid.')
  }
  return Object.freeze(input)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
