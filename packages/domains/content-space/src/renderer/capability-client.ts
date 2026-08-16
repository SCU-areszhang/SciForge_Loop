import { z } from 'zod'
import type {
  DomainRendererCapabilityContract,
  DomainRendererCapabilityInvoker
} from '@sciforge/domain-sdk/host'
import {
  CONTENT_SPACE_CAPABILITY_IDS,
  contentSpaceCapabilityListSchema,
  contentSpaceContainerPageSchema,
  contentSpaceCreateFolderInputSchema,
  contentSpaceEntryObservationSchema,
  contentSpaceEntryPageSchema,
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
  uploadNewReceiptSchema,
  type ArtifactReference,
  type ContentContainerReference,
  type ContentFileReference
} from '../contract.js'

const emptyInputSchema = z.object({}).strict()

export const contentSpaceCapabilityContracts = Object.freeze({
  listProviderInstances: contract(
    CONTENT_SPACE_CAPABILITY_IDS.listProviderInstances,
    'read',
    emptyInputSchema,
    contentSpaceProviderInstanceListSchema
  ),
  describeCapabilities: contract(
    CONTENT_SPACE_CAPABILITY_IDS.describeCapabilities,
    'read',
    contentSpaceProviderInstanceInputSchema,
    contentSpaceCapabilityListSchema
  ),
  listContainers: contract(
    CONTENT_SPACE_CAPABILITY_IDS.listContainers,
    'read',
    contentSpaceListContainersInputSchema,
    contentSpaceContainerPageSchema
  ),
  listEntries: contract(
    CONTENT_SPACE_CAPABILITY_IDS.listEntries,
    'read',
    contentSpaceListEntriesInputSchema,
    contentSpaceEntryPageSchema
  ),
  observeEntry: contract(
    CONTENT_SPACE_CAPABILITY_IDS.observeEntry,
    'read',
    contentSpaceObserveEntryInputSchema,
    contentSpaceEntryObservationSchema
  ),
  createFolder: contract(
    CONTENT_SPACE_CAPABILITY_IDS.createFolder,
    'external-write',
    contentSpaceCreateFolderInputSchema,
    createFolderReceiptSchema
  ),
  observeImmutableVersion: contract(
    CONTENT_SPACE_CAPABILITY_IDS.observeImmutableVersion,
    'read',
    contentSpaceObserveImmutableVersionInputSchema,
    immutableVersionObservationSchema
  ),
  uploadNew: contract(
    CONTENT_SPACE_CAPABILITY_IDS.uploadNew,
    'external-write',
    contentSpaceUploadNewInputSchema,
    uploadNewReceiptSchema
  ),
  download: contract(
    CONTENT_SPACE_CAPABILITY_IDS.download,
    'external-write',
    contentSpaceDownloadInputSchema,
    downloadReceiptSchema
  ),
  resolvePortalTarget: contract(
    CONTENT_SPACE_CAPABILITY_IDS.resolvePortalTarget,
    'read',
    contentSpaceResolvePortalTargetInputSchema,
    contentSpacePortalTargetHandleSchema
  ),
  openPortalTarget: contract(
    CONTENT_SPACE_CAPABILITY_IDS.openPortalTarget,
    'external-write',
    contentSpaceOpenPortalTargetInputSchema,
    contentSpaceOpenPortalTargetResultSchema
  )
})

function contract<TInput, TOutput>(
  actionId: string,
  effect: DomainRendererCapabilityContract<TInput, TOutput>['effect'],
  inputSchema: DomainRendererCapabilityContract<TInput, TOutput>['inputSchema'],
  outputSchema: DomainRendererCapabilityContract<TInput, TOutput>['outputSchema']
): DomainRendererCapabilityContract<TInput, TOutput> {
  return Object.freeze({ actionId, effect, inputSchema, outputSchema })
}

export type ContentSpaceCapabilityClient = Readonly<{
  listProviderInstances: () => Promise<z.infer<typeof contentSpaceProviderInstanceListSchema>>
  describeCapabilities: (
    providerInstanceRef: string
  ) => Promise<z.infer<typeof contentSpaceCapabilityListSchema>>
  listContainers: (
    providerInstanceRef: string,
    page: z.infer<typeof contentSpaceListContainersInputSchema>['page']
  ) => Promise<z.infer<typeof contentSpaceContainerPageSchema>>
  listEntries: (
    parent: ContentContainerReference,
    page: z.infer<typeof contentSpaceListEntriesInputSchema>['page']
  ) => Promise<z.infer<typeof contentSpaceEntryPageSchema>>
  observeEntry: (
    reference: ContentContainerReference | ContentFileReference
  ) => Promise<z.infer<typeof contentSpaceEntryObservationSchema>>
  createFolder: (
    parent: ContentContainerReference,
    name: string
  ) => Promise<z.infer<typeof createFolderReceiptSchema>>
  observeImmutableVersion: (
    reference: ContentFileReference
  ) => Promise<z.infer<typeof immutableVersionObservationSchema>>
  uploadNew: (
    parent: ContentContainerReference,
    name: string,
    sourceHandle: string
  ) => Promise<z.infer<typeof uploadNewReceiptSchema>>
  download: (
    reference: ContentFileReference | ArtifactReference,
    destinationHandle: string
  ) => Promise<z.infer<typeof downloadReceiptSchema>>
  openPortal: (
    reference: ContentContainerReference | ContentFileReference | ArtifactReference
  ) => Promise<z.infer<typeof contentSpaceOpenPortalTargetResultSchema>>
}>

export function createContentSpaceCapabilityClient(
  invoker: DomainRendererCapabilityInvoker
): ContentSpaceCapabilityClient {
  return Object.freeze({
    listProviderInstances: () => invoker.invoke(
      contentSpaceCapabilityContracts.listProviderInstances,
      {}
    ),
    describeCapabilities: (providerInstanceRef) => invoker.invoke(
      contentSpaceCapabilityContracts.describeCapabilities,
      { providerInstanceRef }
    ),
    listContainers: (providerInstanceRef, page) => invoker.invoke(
      contentSpaceCapabilityContracts.listContainers,
      { providerInstanceRef, page }
    ),
    listEntries: (parent, page) => invoker.invoke(
      contentSpaceCapabilityContracts.listEntries,
      { parent, page }
    ),
    observeEntry: (reference) => invoker.invoke(
      contentSpaceCapabilityContracts.observeEntry,
      { reference }
    ),
    createFolder: (parent, name) => invoker.invoke(
      contentSpaceCapabilityContracts.createFolder,
      { parent, name },
      { approval: { mode: 'confirmation' } }
    ),
    observeImmutableVersion: (reference) => invoker.invoke(
      contentSpaceCapabilityContracts.observeImmutableVersion,
      { reference }
    ),
    uploadNew: (parent, name, sourceHandle) => invoker.invoke(
      contentSpaceCapabilityContracts.uploadNew,
      { parent, name, sourceHandle },
      { approval: { mode: 'confirmation' } }
    ),
    download: (reference, destinationHandle) => invoker.invoke(
      contentSpaceCapabilityContracts.download,
      { reference, destinationHandle },
      { approval: { mode: 'confirmation' } }
    ),
    openPortal: async (reference) => {
      const target = await invoker.invoke(
        contentSpaceCapabilityContracts.resolvePortalTarget,
        { reference }
      )
      return invoker.invoke(
        contentSpaceCapabilityContracts.openPortalTarget,
        { handle: target.handle },
        { approval: { mode: 'confirmation' } }
      )
    }
  })
}
