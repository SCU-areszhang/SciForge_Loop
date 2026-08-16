import { describe, expect, it, vi } from 'vitest'
import {
  MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND,
  MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND,
  PROVIDER_FACTORY_CONTRACT_VERSION,
  ProviderInstanceDirectory,
  defineContentSpaceProviderFactory,
  type DomainMainComposedContribution,
  type DomainMainContributionSource
} from '@sciforge/domain-sdk/provider-composition'
import {
  CONTENT_SPACE_PROVIDER_CONTRACT_VERSION,
  defineContentSpaceProvider,
  type ContentSpaceProvider
} from '../contract.js'
import { ContentSpaceProviderCatalog } from './provider-catalog.js'

const provider = (): ContentSpaceProvider => defineContentSpaceProvider({
  contractVersion: CONTENT_SPACE_PROVIDER_CONTRACT_VERSION,
  describeCapabilities: vi.fn(async () => []),
  listContainers: vi.fn(async () => ({ items: [] })),
  listEntries: vi.fn(async () => ({ items: [] })),
  observeEntry: vi.fn(async () => {
    throw new Error('not needed')
  }),
  createFolder: vi.fn(async () => {
    throw new Error('not needed')
  }),
  uploadNewFile: vi.fn(async () => {
    throw new Error('not needed')
  }),
  downloadFile: vi.fn(async () => {
    throw new Error('not needed')
  }),
  resolvePortalTarget: vi.fn(async () => {
    throw new Error('not needed')
  }),
  observeImmutableVersion: vi.fn(async () => ({
    proven: false as const,
    reasonCode: 'provider_contract_missing' as const
  }))
})

function contribution(createProvider = vi.fn(async () => provider())):
DomainMainComposedContribution {
  return {
    packageName: '@fixture/content-provider',
    owner: { moduleId: 'fixture.content-provider', moduleVersion: '1.0.0' },
    declaration: {
      id: 'fixture.content-provider.factory',
      kind: MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND,
      version: PROVIDER_FACTORY_CONTRACT_VERSION,
      priority: 100
    },
    contract: {
      contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
      providerKind: 'fixture-provider'
    },
    value: defineContentSpaceProviderFactory({
      contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
      providerKind: 'fixture-provider',
      createProvider
    })
  }
}

describe('ContentSpaceProvider catalog', () => {
  it('reads only Content Space factory contributions and creates providers lazily', async () => {
    const createProvider = vi.fn(async () => provider())
    const list = vi.fn((kind: string) => kind === MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND
      ? [contribution(createProvider)]
      : [{ ...contribution(), declaration: {
          ...contribution().declaration,
          kind: MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND
        } }]
    )
    const catalog = new ContentSpaceProviderCatalog({ list } as DomainMainContributionSource)

    expect(list).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledWith(MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND)
    expect(catalog.listProviderKinds()).toEqual(['fixture-provider'])
    expect(createProvider).not.toHaveBeenCalled()

    const pinned = await catalog.pin(new ProviderInstanceDirectory([{
      providerInstanceRef: 'provider-instance-alpha',
      providerKind: 'fixture-provider'
    }]), 'provider-instance-alpha')
    expect(pinned.providerInstanceRef).toBe('provider-instance-alpha')
    expect(pinned.providerKind).toBe('fixture-provider')
    expect(pinned.provider.contractVersion).toBe(CONTENT_SPACE_PROVIDER_CONTRACT_VERSION)
    expect(createProvider).toHaveBeenCalledTimes(1)
  })

  it('rejects a runtime object that exposes a raw client beyond the SPI', async () => {
    const unsafe = { ...provider(), rawClient: {} }
    const catalog = new ContentSpaceProviderCatalog({
      list: () => [contribution(vi.fn(async () => unsafe as ContentSpaceProvider))]
    })
    await expect(catalog.pin(new ProviderInstanceDirectory([{
      providerInstanceRef: 'provider-instance-alpha',
      providerKind: 'fixture-provider'
    }]), 'provider-instance-alpha')).rejects.toThrow('contract is invalid')
  })

  it('fails closed for duplicate, missing, and incompatible Providers', async () => {
    expect(() => new ContentSpaceProviderCatalog({
      list: () => [contribution(), {
        ...contribution(),
        packageName: '@fixture/second-content-provider',
        owner: { moduleId: 'fixture.second-content-provider', moduleVersion: '1.0.0' },
        declaration: {
          ...contribution().declaration,
          id: 'fixture.second-content-provider.factory'
        }
      }]
    })).toThrow(expect.objectContaining({ code: 'duplicate_provider_kind' }))

    const catalog = new ContentSpaceProviderCatalog({ list: () => [contribution()] })
    await expect(catalog.pin(new ProviderInstanceDirectory([{
      providerInstanceRef: 'provider-instance-missing',
      providerKind: 'uninstalled-provider'
    }]), 'provider-instance-missing')).rejects.toMatchObject({ code: 'missing_provider' })

    const incompatible = contribution()
    expect(() => new ContentSpaceProviderCatalog({
      list: () => [{
        ...incompatible,
        declaration: { ...incompatible.declaration, version: '2.0.0' },
        contract: { contractVersion: '2.0.0', providerKind: 'fixture-provider' },
        value: {
          contributionKind: MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND,
          contractVersion: '2.0.0',
          providerKind: 'fixture-provider',
          createProvider: async () => provider()
        }
      }]
    })).toThrow(expect.objectContaining({ code: 'incompatible_contract_version' }))
  })
})
