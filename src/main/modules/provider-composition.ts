import type {
  DomainMainComposedContribution,
  DomainMainContributionSource,
  DomainMainProviderInstanceDirectorySource
} from '@sciforge/domain-sdk/provider-composition'
import {
  ProviderCompositionError,
  createProviderInstanceDirectory
} from '@sciforge/domain-sdk/provider-composition'
import type { DomainModuleCatalog } from './catalog'

/**
 * Projects the canonical main catalog through a frozen SDK facade. The facade
 * deliberately exposes no registration, package lookup, or Host-private API.
 */
export function createDomainMainContributionSource(
  catalog: DomainModuleCatalog,
  isCompositionReady: () => boolean = () => true
): DomainMainContributionSource {
  return Object.freeze({
    list(kind: string): readonly DomainMainComposedContribution[] {
      if (!isCompositionReady()) {
        throw new ProviderCompositionError(
          'composition_not_ready',
          'Main contribution composition is not ready.'
        )
      }
      return Object.freeze(catalog.listContributions(
        kind,
        (_value): _value is unknown => true
      ).map((contribution) => Object.freeze({
        packageName: contribution.packageName,
        owner: contribution.owner,
        declaration: contribution.declaration,
        ...(contribution.contract === undefined ? {} : { contract: contribution.contract }),
        value: contribution.value
      })))
    }
  })
}

/** Lazily projects the generic trusted Provider Instance Directory after composition is complete. */
export function createDomainMainProviderInstanceDirectorySource(
  catalog: DomainModuleCatalog,
  isCompositionReady: () => boolean = () => true
): DomainMainProviderInstanceDirectorySource {
  const source = createDomainMainContributionSource(catalog, isCompositionReady)
  const directory = () => createProviderInstanceDirectory(source)
  return Object.freeze({
    list: () => directory().list(),
    resolve: (providerInstanceRef: string) => directory().resolve(providerInstanceRef)
  })
}
