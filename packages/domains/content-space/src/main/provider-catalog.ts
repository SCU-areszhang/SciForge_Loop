import {
  MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND,
  ProviderInstanceDirectory,
  createContentSpaceProviderFactoryCatalog,
  type DomainMainContributionSource,
  type ProviderKind
} from '@sciforge/domain-sdk/provider-composition'
import {
  CONTENT_SPACE_PROVIDER_CONTRACT_VERSION,
  defineContentSpaceProvider,
  type ContentSpaceProvider,
  type ContentSpaceProviderHostPorts
} from '../contract.js'

const CONTENT_SPACE_PROVIDER_HOST_PORTS: ContentSpaceProviderHostPorts = Object.freeze({
  contractVersion: CONTENT_SPACE_PROVIDER_CONTRACT_VERSION
})

export type PinnedContentSpaceProvider = Readonly<{
  providerInstanceRef: string
  providerKind: ProviderKind
  provider: ContentSpaceProvider
}>

/** Content Space-owned projection over the generic compile-time factory composition. */
export class ContentSpaceProviderCatalog {
  readonly #catalog

  constructor(source: DomainMainContributionSource) {
    this.#catalog = createContentSpaceProviderFactoryCatalog<
      ContentSpaceProvider,
      ContentSpaceProviderHostPorts
    >(Object.freeze({
      list: (kind: string) => kind === MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND
        ? source.list(kind)
        : Object.freeze([])
    }))
  }

  listProviderKinds(): readonly ProviderKind[] {
    return Object.freeze(this.#catalog.list().map(({ providerKind }) => providerKind))
  }

  async pin(
    directory: ProviderInstanceDirectory,
    providerInstanceRef: string
  ): Promise<PinnedContentSpaceProvider> {
    const selection = this.#catalog.select(directory, providerInstanceRef)
    const provider = defineContentSpaceProvider(
      await selection.createProvider(CONTENT_SPACE_PROVIDER_HOST_PORTS)
    )
    return Object.freeze({
      providerInstanceRef: selection.providerInstanceRef,
      providerKind: selection.providerKind,
      provider
    })
  }
}
