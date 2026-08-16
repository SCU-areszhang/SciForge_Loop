import type { DomainMainHost } from '@sciforge/domain-sdk/host'
import type { TrustedDomainProcessEntryInput } from '@sciforge/domain-sdk/main'
import type { PrincipalSnapshot } from '@sciforge/domain-sdk/principal'
import type { DomainMainFileTransferHost } from '@sciforge/domain-sdk/file-transfer'
import type { DomainMainExternalNavigationHost } from '@sciforge/domain-sdk/external-navigation'
import type { PortableResourceAuthorityResolver } from '@sciforge/domain-sdk/portable-resource-references'
import { z } from 'zod'
import {
  CONTENT_SPACE_ARTIFACT_REFERENCE_CODEC_CONTRIBUTION,
  CONTENT_SPACE_CAPABILITY_FACTORY_CONTRIBUTION,
  CONTENT_SPACE_CONTAINER_REFERENCE_CODEC_CONTRIBUTION,
  CONTENT_SPACE_DOMAIN_MODULE_ID,
  CONTENT_SPACE_FILE_REFERENCE_CODEC_CONTRIBUTION,
  CONTENT_SPACE_PORTABLE_AUTHORITY_RESOLVER_CONTRIBUTION,
  domainPackageDefinition
} from '../definition.js'
import {
  CONTENT_SPACE_CAPABILITY_IDS,
  artifactReferenceCodec,
  contentSpaceCapabilityListSchema,
  contentContainerReferenceCodec,
  contentSpaceContainerPageSchema,
  contentSpaceCreateFolderInputSchema,
  contentSpaceEntryObservationSchema,
  contentSpaceEntryPageSchema,
  contentFileReferenceCodec,
  contentSpaceListContainersInputSchema,
  contentSpaceListEntriesInputSchema,
  contentSpaceObserveEntryInputSchema,
  contentSpaceObserveImmutableVersionInputSchema,
  contentSpaceUploadNewInputSchema,
  contentSpaceDownloadInputSchema,
  contentSpaceResolvePortalTargetInputSchema,
  contentSpacePortalTargetHandleSchema,
  contentSpaceOpenPortalTargetInputSchema,
  contentSpaceOpenPortalTargetResultSchema,
  contentSpaceProviderInstanceInputSchema,
  contentSpaceProviderInstanceListSchema,
  createFolderReceiptSchema,
  downloadReceiptSchema,
  immutableVersionObservationSchema,
  uploadNewReceiptSchema
} from '../contract.js'
import { ContentSpaceService, type ContentSpaceServiceCallContext } from './service.js'
import { createContentSpacePortableAuthorityResolver } from './portable-authority-resolver.js'

type ContentSpaceCapabilityContext = Readonly<{
  caller: Readonly<{
    audience: 'ui' | 'agent' | 'system'
    callerId: string
    principal?: PrincipalSnapshot
  }>
  invocationId?: string
  signal?: AbortSignal
}>

export type ContentSpaceCapabilityOptions = Readonly<{
  id: string
  version: string
  title: string
  description: string
  audiences: readonly ('ui' | 'agent' | 'system')[]
  scope: 'global'
  effect: 'read' | 'external-write'
  approval: 'none' | 'confirmation'
  concurrency: Readonly<{
    revision: 'none'
    idempotency: 'none' | 'required'
  }>
  tags: readonly string[]
  inputSchema: z.ZodType
  outputSchema: z.ZodType
  handler: (
    input: any,
    context: ContentSpaceCapabilityContext
  ) => Promise<Readonly<{ output: unknown }>>
}>

export type ContentSpaceCapabilityFactory<CapabilityDefinition = unknown> = Readonly<{
  moduleId: typeof CONTENT_SPACE_DOMAIN_MODULE_ID
  policy: Readonly<{
    id: 'content-space'
    title: 'Content Space'
    directTransportPrefixes: readonly []
    allowedDirectTransports: readonly []
  }>
  createDefinitions: () => readonly CapabilityDefinition[]
}>

type ContentSpaceMainContribution =
  | ContentSpaceCapabilityFactory
  | typeof contentContainerReferenceCodec
  | typeof contentFileReferenceCodec
  | typeof artifactReferenceCodec
  | PortableResourceAuthorityResolver

export function createDomainMainEntry(
  host: DomainMainHost
): TrustedDomainProcessEntryInput<ContentSpaceMainContribution> {
  if (!host.providerInstances) {
    throw new Error('Content Space Provider Instance composition is unavailable.')
  }
  let service: ContentSpaceService | undefined
  const getService = (): ContentSpaceService => {
    if (service) return service
    if (!host.mainContributions || !host.providerInstances) {
      throw new Error('Content Space composition ports are unavailable.')
    }
    service = new ContentSpaceService({
      contributions: host.mainContributions,
      instances: host.providerInstances
    })
    return service
  }
  return {
    definition: domainPackageDefinition,
    contributions: [{
      ...CONTENT_SPACE_CAPABILITY_FACTORY_CONTRIBUTION,
      value: createContentSpaceCapabilityFactory({
        defineCapability: host.defineCapability as (
          options: ContentSpaceCapabilityOptions
        ) => unknown,
        getService,
        fileTransfers: host.fileTransfers,
        externalNavigation: host.externalNavigation
      }),
      onDispose: () => { service = undefined }
    }, {
      ...CONTENT_SPACE_CONTAINER_REFERENCE_CODEC_CONTRIBUTION,
      contract: domainPackageDefinition.contributionContracts[
        CONTENT_SPACE_CONTAINER_REFERENCE_CODEC_CONTRIBUTION.id
      ],
      value: contentContainerReferenceCodec
    }, {
      ...CONTENT_SPACE_FILE_REFERENCE_CODEC_CONTRIBUTION,
      contract: domainPackageDefinition.contributionContracts[
        CONTENT_SPACE_FILE_REFERENCE_CODEC_CONTRIBUTION.id
      ],
      value: contentFileReferenceCodec
    }, {
      ...CONTENT_SPACE_ARTIFACT_REFERENCE_CODEC_CONTRIBUTION,
      contract: domainPackageDefinition.contributionContracts[
        CONTENT_SPACE_ARTIFACT_REFERENCE_CODEC_CONTRIBUTION.id
      ],
      value: artifactReferenceCodec
    }, {
      ...CONTENT_SPACE_PORTABLE_AUTHORITY_RESOLVER_CONTRIBUTION,
      contract: domainPackageDefinition.contributionContracts[
        CONTENT_SPACE_PORTABLE_AUTHORITY_RESOLVER_CONTRIBUTION.id
      ],
      value: createContentSpacePortableAuthorityResolver({
        instances: host.providerInstances,
        getService
      })
    }]
  }
}

export function createContentSpaceCapabilityFactory<CapabilityDefinition>(options: Readonly<{
  defineCapability: (options: ContentSpaceCapabilityOptions) => CapabilityDefinition
  getService: () => ContentSpaceService
  fileTransfers?: DomainMainFileTransferHost
  externalNavigation?: DomainMainExternalNavigationHost
}>): ContentSpaceCapabilityFactory<CapabilityDefinition> {
  const define = (
    input: Omit<ContentSpaceCapabilityOptions, 'version' | 'audiences' | 'scope' | 'tags'>
  ): CapabilityDefinition => options.defineCapability({
    ...input,
    version: '1.0.0',
    audiences: ['ui', 'agent', 'system'],
    scope: 'global',
    tags: ['content-space', 'provider-neutral']
  })
  const call = (context: ContentSpaceCapabilityContext): ContentSpaceServiceCallContext => {
    if (!context.caller.principal) throw new Error('A current Host Principal is required.')
    return Object.freeze({
      principal: context.caller.principal,
      ...(context.invocationId ? { invocationId: context.invocationId } : {}),
      ...(context.signal ? { signal: context.signal } : {})
    })
  }
  const writeCall = (
    context: ContentSpaceCapabilityContext
  ): ContentSpaceServiceCallContext & Readonly<{ invocationId: string }> => {
    const base = call(context)
    if (!context.invocationId) throw new Error('A Broker invocation identity is required.')
    return Object.freeze({ ...base, invocationId: context.invocationId })
  }
  return Object.freeze({
    moduleId: CONTENT_SPACE_DOMAIN_MODULE_ID,
    policy: Object.freeze({
      id: 'content-space' as const,
      title: 'Content Space' as const,
      directTransportPrefixes: Object.freeze([]) as readonly [],
      allowedDirectTransports: Object.freeze([]) as readonly []
    }),
    createDefinitions: () => Object.freeze([
      define({
        id: CONTENT_SPACE_CAPABILITY_IDS.listProviderInstances,
        title: 'List Content Space Provider Instances',
        description: 'Lists explicit trusted Provider Instances supported by Content Space.',
        effect: 'read',
        approval: 'none',
        concurrency: { revision: 'none', idempotency: 'none' },
        inputSchema: zEmptyObject,
        outputSchema: contentSpaceProviderInstanceListSchema,
        handler: async (_input, context) => ({
          output: options.getService().listProviderInstances()
        })
      }),
      define({
        id: CONTENT_SPACE_CAPABILITY_IDS.uploadNew,
        title: 'Upload New Content Space File',
        description: 'Uploads one Host-selected bounded file without overwrite.',
        effect: 'external-write',
        approval: 'confirmation',
        concurrency: { revision: 'none', idempotency: 'required' },
        inputSchema: contentSpaceUploadNewInputSchema,
        outputSchema: uploadNewReceiptSchema,
        handler: async ({ parent, name, sourceHandle }, context) => {
          if (!options.fileTransfers) throw new Error('Host-owned file transfer is unavailable.')
          const source = await options.fileTransfers.openUploadSource({
            handle: sourceHandle,
            callerId: context.caller.callerId,
            maxBytes: 16 * 1024 * 1024
          })
          return {
            output: await options.getService().uploadNewFile(
              { parent, name, source },
              writeCall(context)
            )
          }
        }
      }),
      define({
        id: CONTENT_SPACE_CAPABILITY_IDS.download,
        title: 'Download Content Space File',
        description: 'Downloads bytes only to a Host-selected bounded destination.',
        effect: 'external-write',
        approval: 'confirmation',
        concurrency: { revision: 'none', idempotency: 'required' },
        inputSchema: contentSpaceDownloadInputSchema,
        outputSchema: downloadReceiptSchema,
        handler: async ({ reference, destinationHandle }, context) => {
          if (!options.fileTransfers) throw new Error('Host-owned file transfer is unavailable.')
          return {
            output: await options.getService().downloadFile({
              reference,
              openDestination: () => options.fileTransfers!.openDownloadDestination({
                handle: destinationHandle,
                callerId: context.caller.callerId,
                maxBytes: 1024 * 1024 * 1024
              })
            }, writeCall(context))
          }
        }
      }),
      define({
        id: CONTENT_SPACE_CAPABILITY_IDS.describeCapabilities,
        title: 'Describe Content Space Capabilities',
        description: 'Reads trusted operation readiness for one pinned Provider Instance.',
        effect: 'read',
        approval: 'none',
        concurrency: { revision: 'none', idempotency: 'none' },
        inputSchema: contentSpaceProviderInstanceInputSchema,
        outputSchema: contentSpaceCapabilityListSchema,
        handler: async ({ providerInstanceRef }, context) => ({
          output: await options.getService().describeCapabilities(providerInstanceRef, call(context))
        })
      }),
      define({
        id: CONTENT_SPACE_CAPABILITY_IDS.listContainers,
        title: 'List Content Space Containers',
        description: 'Lists a bounded page of containers from one pinned Provider Instance.',
        effect: 'read',
        approval: 'none',
        concurrency: { revision: 'none', idempotency: 'none' },
        inputSchema: contentSpaceListContainersInputSchema,
        outputSchema: contentSpaceContainerPageSchema,
        handler: async (input, context) => ({
          output: await options.getService().listContainers(input, call(context))
        })
      }),
      define({
        id: CONTENT_SPACE_CAPABILITY_IDS.listEntries,
        title: 'List Content Space Entries',
        description: 'Lists one bounded page of direct children for an explicit container.',
        effect: 'read',
        approval: 'none',
        concurrency: { revision: 'none', idempotency: 'none' },
        inputSchema: contentSpaceListEntriesInputSchema,
        outputSchema: contentSpaceEntryPageSchema,
        handler: async (input, context) => ({
          output: await options.getService().listEntries(input, call(context))
        })
      }),
      define({
        id: CONTENT_SPACE_CAPABILITY_IDS.observeEntry,
        title: 'Observe Content Space Entry',
        description: 'Reads provider-neutral entry metadata and trusted operation readiness.',
        effect: 'read',
        approval: 'none',
        concurrency: { revision: 'none', idempotency: 'none' },
        inputSchema: contentSpaceObserveEntryInputSchema,
        outputSchema: contentSpaceEntryObservationSchema,
        handler: async ({ reference }, context) => ({
          output: await options.getService().observeEntry(reference, call(context))
        })
      }),
      define({
        id: CONTENT_SPACE_CAPABILITY_IDS.createFolder,
        title: 'Create Content Space Folder',
        description: 'Creates one new folder without overwriting an existing entry.',
        effect: 'external-write',
        approval: 'confirmation',
        concurrency: { revision: 'none', idempotency: 'required' },
        inputSchema: contentSpaceCreateFolderInputSchema,
        outputSchema: createFolderReceiptSchema,
        handler: async (input, context) => ({
          output: await options.getService().createFolder(input, writeCall(context))
        })
      }),
      define({
        id: CONTENT_SPACE_CAPABILITY_IDS.observeImmutableVersion,
        title: 'Observe Immutable Content Version',
        description: 'Requests Provider proof for retained version-specific immutable bytes.',
        effect: 'read',
        approval: 'none',
        concurrency: { revision: 'none', idempotency: 'none' },
        inputSchema: contentSpaceObserveImmutableVersionInputSchema,
        outputSchema: immutableVersionObservationSchema,
        handler: async ({ reference }, context) => ({
          output: await options.getService().observeImmutableVersion(reference, call(context))
        })
      }),
      define({
        id: CONTENT_SPACE_CAPABILITY_IDS.resolvePortalTarget,
        title: 'Resolve Content Space Portal Target',
        description: 'Resolves a Provider portal target into a short-lived Host-owned handle.',
        effect: 'read',
        approval: 'none',
        concurrency: { revision: 'none', idempotency: 'none' },
        inputSchema: contentSpaceResolvePortalTargetInputSchema,
        outputSchema: contentSpacePortalTargetHandleSchema,
        handler: async ({ reference }, context) => {
          if (!options.externalNavigation) {
            throw new Error('Safe external navigation is unavailable.')
          }
          const target = await options.getService().resolvePortalTarget(reference, call(context))
          return {
            output: options.externalNavigation.issueTarget({
              callerId: context.caller.callerId,
              url: target.url,
              expiresAt: target.expiresAt
            })
          }
        }
      }),
      define({
        id: CONTENT_SPACE_CAPABILITY_IDS.openPortalTarget,
        title: 'Open Content Space Portal Target',
        description: 'Opens one short-lived Host-validated portal target in the system browser.',
        effect: 'external-write',
        approval: 'confirmation',
        concurrency: { revision: 'none', idempotency: 'required' },
        inputSchema: contentSpaceOpenPortalTargetInputSchema,
        outputSchema: contentSpaceOpenPortalTargetResultSchema,
        handler: async ({ handle }, context) => {
          if (!options.externalNavigation) {
            throw new Error('Safe external navigation is unavailable.')
          }
          await options.externalNavigation.openTarget({
            callerId: context.caller.callerId,
            handle
          })
          return { output: { opened: true as const } }
        }
      })
    ])
  })
}

export * from './provider-catalog.js'
export * from './service.js'
export * from './portable-authority-resolver.js'

const zEmptyObject = z.object({}).strict()
