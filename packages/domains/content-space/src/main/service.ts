import { principalSnapshotSchema, type PrincipalSnapshot } from '@sciforge/domain-sdk/principal'
import {
  ProviderCompositionError,
  ProviderInstanceDirectory,
  type DomainMainContributionSource,
  type DomainMainProviderInstanceDirectorySource
} from '@sciforge/domain-sdk/provider-composition'
import {
  ContentSpaceOperationError,
  contentSpaceCapabilityListSchema,
  contentSpaceContainerPageSchema,
  contentContainerReferenceSchema,
  contentSpaceEntryObservationSchema,
  contentSpaceEntryPageSchema,
  contentSpaceProviderInstanceListSchema,
  createFolderReceiptSchema,
  downloadReceiptSchema,
  immutableVersionObservationSchema,
  uploadNewReceiptSchema,
  type ArtifactReference,
  type ContentContainerReference,
  type ContentFileReference,
  type ContentSpaceDownloadSink,
  type ContentSpaceOperation,
  type ContentSpaceProvider,
  type ContentSpaceProviderOperationContext,
  type ContentSpaceUploadSource
} from '../contract.js'
import { ContentSpaceProviderCatalog } from './provider-catalog.js'

const OPERATION_DEADLINE_MS = 30_000

export type ContentSpaceServiceCallContext = Readonly<{
  principal: PrincipalSnapshot
  signal?: AbortSignal
  invocationId?: string
}>

export class ContentSpaceService {
  readonly #catalog: ContentSpaceProviderCatalog
  readonly #instances: DomainMainProviderInstanceDirectorySource
  readonly #now: () => Date
  readonly #pinned = new Map<string, Promise<ContentSpaceProvider>>()

  constructor(input: Readonly<{
    contributions: DomainMainContributionSource
    instances: DomainMainProviderInstanceDirectorySource
    now?: () => Date
  }>) {
    this.#catalog = new ContentSpaceProviderCatalog(input.contributions)
    this.#instances = input.instances
    this.#now = input.now ?? (() => new Date())
  }

  listProviderInstances() {
    const supportedKinds = new Set(this.#catalog.listProviderKinds())
    const items = this.#instances.list()
      .filter(({ providerKind }) => supportedKinds.has(providerKind))
      .map(({ providerInstanceRef, displayName }) => {
        if (!displayName) fail('invalid_input', 'A selectable Provider Instance needs a label.')
        return { providerInstanceRef, label: displayName }
      })
    return contentSpaceProviderInstanceListSchema.parse({ items })
  }

  async describeCapabilities(providerInstanceRef: string, call: ContentSpaceServiceCallContext) {
    const provider = await this.#provider(providerInstanceRef)
    const context = this.#operationContext(providerInstanceRef, call)
    return contentSpaceCapabilityListSchema.parse({
      items: await provider.describeCapabilities(context)
    })
  }

  async listContainers(
    input: Readonly<{ providerInstanceRef: string; page: { cursor?: string; limit: number } }>,
    call: ContentSpaceServiceCallContext
  ) {
    const provider = await this.#authorizedProvider(input.providerInstanceRef, 'list-containers', call)
    return contentSpaceContainerPageSchema.parse(await provider.listContainers({
      context: this.#operationContext(input.providerInstanceRef, call),
      page: input.page
    }))
  }

  async listEntries(
    input: Readonly<{ parent: ContentContainerReference; page: { cursor?: string; limit: number } }>,
    call: ContentSpaceServiceCallContext
  ) {
    const parent = contentContainerReferenceSchema.parse(input.parent)
    const provider = await this.#authorizedProvider(parent.providerInstanceRef, 'list-entries', call)
    return contentSpaceEntryPageSchema.parse(await provider.listEntries({
      context: this.#operationContext(parent.providerInstanceRef, call),
      parent,
      page: input.page
    }))
  }

  async observeEntry(
    reference: ContentContainerReference | ContentFileReference | ArtifactReference,
    call: ContentSpaceServiceCallContext
  ) {
    const provider = await this.#authorizedProvider(reference.providerInstanceRef, 'observe-entry', call)
    return contentSpaceEntryObservationSchema.parse(await provider.observeEntry({
      context: this.#operationContext(reference.providerInstanceRef, call),
      reference
    }))
  }

  async createFolder(
    input: Readonly<{ parent: ContentContainerReference; name: string }>,
    call: ContentSpaceServiceCallContext & Readonly<{ invocationId: string }>
  ) {
    const parent = contentContainerReferenceSchema.parse(input.parent)
    const provider = await this.#authorizedProvider(parent.providerInstanceRef, 'create-folder', call)
    return createFolderReceiptSchema.parse(await provider.createFolder({
      context: this.#operationContext(parent.providerInstanceRef, call) as
        ContentSpaceProviderOperationContext & Readonly<{ invocationId: string }>,
      parent,
      name: input.name
    }))
  }

  async uploadNewFile(
    input: Readonly<{
      parent: ContentContainerReference
      name: string
      source: ContentSpaceUploadSource
    }>,
    call: ContentSpaceServiceCallContext & Readonly<{ invocationId: string }>
  ) {
    const parent = contentContainerReferenceSchema.parse(input.parent)
    const provider = await this.#authorizedProvider(parent.providerInstanceRef, 'upload-new', call)
    return uploadNewReceiptSchema.parse(await provider.uploadNewFile({
      context: this.#operationContext(parent.providerInstanceRef, call) as
        ContentSpaceProviderOperationContext & Readonly<{ invocationId: string }>,
      parent,
      name: input.name,
      source: input.source
    }))
  }

  async downloadFile(
    input: Readonly<{
      reference: ContentFileReference | ArtifactReference
      openDestination: () => Promise<ContentSpaceDownloadSink>
    }>,
    call: ContentSpaceServiceCallContext & Readonly<{ invocationId: string }>
  ) {
    const providerInstanceRef = input.reference.providerInstanceRef
    const provider = await this.#authorizedProvider(providerInstanceRef, 'download', call)
    const destination = await input.openDestination()
    try {
      return downloadReceiptSchema.parse(await provider.downloadFile({
        context: this.#operationContext(providerInstanceRef, call) as
          ContentSpaceProviderOperationContext & Readonly<{ invocationId: string }>,
        reference: input.reference,
        destination
      }))
    } catch (error) {
      await destination.abort()
      throw error
    }
  }

  async resolvePortalTarget(
    reference: ContentContainerReference | ContentFileReference | ArtifactReference,
    call: ContentSpaceServiceCallContext
  ) {
    const provider = await this.#authorizedProvider(reference.providerInstanceRef, 'portal-target', call)
    return provider.resolvePortalTarget({
      context: this.#operationContext(reference.providerInstanceRef, call),
      reference
    })
  }

  async observeImmutableVersion(reference: ContentFileReference, call: ContentSpaceServiceCallContext) {
    const provider = await this.#authorizedProvider(
      reference.providerInstanceRef,
      'observe-immutable-version',
      call
    )
    const observation = immutableVersionObservationSchema.parse(await provider.observeImmutableVersion({
      context: this.#operationContext(reference.providerInstanceRef, call),
      reference
    }))
    if (observation.proven && (
      observation.proof.reference.providerInstanceRef !== reference.providerInstanceRef ||
      observation.proof.reference.fileId !== reference.fileId
    )) {
      fail('immutable_version_unproven', 'Immutable proof does not match the pinned file identity.')
    }
    return observation
  }

  async #authorizedProvider(
    providerInstanceRef: string,
    operation: ContentSpaceOperation,
    call: ContentSpaceServiceCallContext
  ): Promise<ContentSpaceProvider> {
    const provider = await this.#provider(providerInstanceRef)
    const capabilities = await provider.describeCapabilities(
      this.#operationContext(providerInstanceRef, call)
    )
    const state = capabilities.find((candidate) => candidate.operation === operation)
    if (!state || state.readiness !== 'production_ready') {
      fail('blocked_by_contract', `Content Space operation ${operation} is unavailable.`)
    }
    return provider
  }

  async #provider(providerInstanceRef: string): Promise<ContentSpaceProvider> {
    let pinned = this.#pinned.get(providerInstanceRef)
    if (!pinned) {
      pinned = this.#pin(providerInstanceRef)
      this.#pinned.set(providerInstanceRef, pinned)
      void pinned.catch(() => {
        if (this.#pinned.get(providerInstanceRef) === pinned) this.#pinned.delete(providerInstanceRef)
      })
    }
    return pinned
  }

  async #pin(providerInstanceRef: string): Promise<ContentSpaceProvider> {
    try {
      if (!this.#instances.resolve(providerInstanceRef)) {
        fail('unknown_provider_instance', 'The Provider Instance is not registered.')
      }
      const directory = new ProviderInstanceDirectory(this.#instances.list())
      return (await this.#catalog.pin(directory, providerInstanceRef)).provider
    } catch (error) {
      if (error instanceof ContentSpaceOperationError) throw error
      if (error instanceof ProviderCompositionError) {
        const code = error.code === 'unknown_provider_instance'
          ? 'unknown_provider_instance'
          : error.code === 'missing_provider'
            ? 'missing_provider'
            : 'provider_unavailable'
        fail(code, 'The pinned Content Space Provider is unavailable.')
      }
      throw error
    }
  }

  #operationContext(
    providerInstanceRef: string,
    call: ContentSpaceServiceCallContext
  ): ContentSpaceProviderOperationContext {
    const principal = principalSnapshotSchema.parse(call.principal)
    const now = this.#now()
    return Object.freeze({
      principal,
      providerInstanceRef,
      ...(call.invocationId ? { invocationId: call.invocationId } : {}),
      deadlineAt: new Date(now.getTime() + OPERATION_DEADLINE_MS).toISOString(),
      ...(call.signal ? { signal: call.signal } : {})
    })
  }
}

function fail(
  code: ConstructorParameters<typeof ContentSpaceOperationError>[0]['code'],
  message: string
): never {
  throw new ContentSpaceOperationError({ code, message, retry: 'never' })
}
