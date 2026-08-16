import { describe, expect, it, vi } from 'vitest'
import {
  MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND,
  PROVIDER_FACTORY_CONTRACT_VERSION,
  defineContentSpaceProviderFactory,
  parseProviderInstanceRef,
  parseProviderKind,
  type DomainMainComposedContribution,
  type DomainMainContributionSource,
  type DomainMainProviderInstanceDirectorySource
} from '@sciforge/domain-sdk/provider-composition'
import {
  CONTENT_SPACE_PROVIDER_CONTRACT_VERSION,
  ContentSpaceOperationError,
  defineContentSpaceProvider,
  type ContentSpaceProvider
} from '../contract.js'
import { ContentSpaceService } from './service.js'

const principal = Object.freeze({
  userId: '123e4567-e89b-42d3-a456-426614174000',
  assurance: 'local-selection' as const,
  deviceId: 'service-test-device',
  identityVersion: 1
})

function provider(
  listEntries: ContentSpaceProvider['listEntries'],
  readiness: 'production_ready' | 'blocked_by_contract' = 'production_ready',
  operation: 'list-entries' | 'observe-immutable-version' = 'list-entries',
  observeImmutableVersion: ContentSpaceProvider['observeImmutableVersion'] = vi.fn(async () => ({
    proven: false as const,
    reasonCode: 'provider_contract_missing' as const
  }))
): ContentSpaceProvider {
  return defineContentSpaceProvider({
    contractVersion: CONTENT_SPACE_PROVIDER_CONTRACT_VERSION,
    describeCapabilities: vi.fn(async () => [Object.freeze({
      operation,
      readiness,
      reasonCode: readiness === 'production_ready' ? 'available' : 'platform_gate_blocked'
    })]),
    listContainers: vi.fn(async () => ({ items: [] })),
    listEntries,
    observeEntry: vi.fn(async () => { throw new Error('unused') }),
    createFolder: vi.fn(async () => { throw new Error('unused') }),
    uploadNewFile: vi.fn(async () => { throw new Error('unused') }),
    downloadFile: vi.fn(async () => { throw new Error('unused') }),
    resolvePortalTarget: vi.fn(async () => { throw new Error('unused') }),
    observeImmutableVersion
  })
}

function factoryContribution(
  providerKind: string,
  createProvider: () => ContentSpaceProvider
): DomainMainComposedContribution {
  return {
    packageName: `@fixture/${providerKind}`,
    owner: { moduleId: `fixture.${providerKind}`, moduleVersion: '1.0.0' },
    declaration: {
      id: `fixture.${providerKind}.content-space`,
      kind: MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND,
      version: PROVIDER_FACTORY_CONTRACT_VERSION,
      priority: 100
    },
    contract: { contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION, providerKind },
    value: defineContentSpaceProviderFactory({
      contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
      providerKind,
      createProvider
    })
  }
}

describe('ContentSpaceService pinned Provider routing', () => {
  it('never routes by extension, falls back, or reuses identity across Provider Instances', async () => {
    const pinnedList = vi.fn(async () => {
      throw new ContentSpaceOperationError({
        code: 'invalid_reference',
        message: 'The resource is not owned by the pinned Provider.',
        retry: 'never'
      })
    })
    const fallbackList = vi.fn(async () => ({ items: [] }))
    const pinnedFactory = vi.fn(() => provider(pinnedList))
    const fallbackFactory = vi.fn(() => provider(fallbackList))
    const contributions = [
      factoryContribution('pinned-provider', pinnedFactory),
      factoryContribution('fallback-provider', fallbackFactory)
    ]
    const source: DomainMainContributionSource = Object.freeze({
      list: (kind) => contributions.filter(({ declaration }) => declaration.kind === kind)
    })
    const entries = Object.freeze([{
      providerInstanceRef: parseProviderInstanceRef('provider-instance-alpha'),
      providerKind: parseProviderKind('pinned-provider'),
      displayName: 'Pinned'
    }, {
      providerInstanceRef: parseProviderInstanceRef('provider-instance-beta'),
      providerKind: parseProviderKind('fallback-provider'),
      displayName: 'Fallback'
    }])
    const instances: DomainMainProviderInstanceDirectorySource = Object.freeze({
      list: () => entries,
      resolve: (providerInstanceRef) => entries.find((entry) =>
        entry.providerInstanceRef === providerInstanceRef
      )
    })
    const service = new ContentSpaceService({ contributions: source, instances })

    for (const containerId of ['report.pdf', 'provider_beta_resource']) {
      await expect(service.listEntries({
        parent: { providerInstanceRef: 'provider-instance-alpha', containerId },
        page: { limit: 20 }
      }, { principal })).rejects.toMatchObject({
        detail: { code: 'invalid_reference' }
      })
    }
    expect(pinnedFactory).toHaveBeenCalledTimes(1)
    expect(pinnedList).toHaveBeenCalledTimes(2)
    expect(fallbackFactory).not.toHaveBeenCalled()
    expect(fallbackList).not.toHaveBeenCalled()
  })

  it('rejects an unknown authority before any Provider factory invocation', async () => {
    const createProvider = vi.fn(() => provider(vi.fn(async () => ({ items: [] }))))
    const contributions = [factoryContribution('pinned-provider', createProvider)]
    const service = new ContentSpaceService({
      contributions: { list: () => contributions },
      instances: { list: () => [], resolve: () => undefined }
    })
    await expect(service.listEntries({
      parent: { providerInstanceRef: 'provider-instance-unknown', containerId: 'report.pdf' },
      page: { limit: 20 }
    }, { principal })).rejects.toMatchObject({
      detail: { code: 'unknown_provider_instance' }
    })
    expect(createProvider).not.toHaveBeenCalled()
  })

  it('enforces trusted readiness even when a caller reaches the operation handler', async () => {
    const listEntries = vi.fn(async () => ({ items: [] }))
    const createProvider = vi.fn(() => provider(listEntries, 'blocked_by_contract'))
    const contributions = [factoryContribution('pinned-provider', createProvider)]
    const entry = {
      providerInstanceRef: parseProviderInstanceRef('provider-instance-alpha'),
      providerKind: parseProviderKind('pinned-provider'),
      displayName: 'Pinned'
    }
    const service = new ContentSpaceService({
      contributions: { list: () => contributions },
      instances: { list: () => [entry], resolve: () => entry }
    })
    await expect(service.listEntries({
      parent: { providerInstanceRef: 'provider-instance-alpha', containerId: 'report.pdf' },
      page: { limit: 20 }
    }, { principal })).rejects.toMatchObject({
      detail: { code: 'blocked_by_contract' }
    })
    expect(listEntries).not.toHaveBeenCalled()
  })

  it('rejects immutable proof for a different Provider or file identity', async () => {
    const mismatch = vi.fn(async () => ({
      proven: true as const,
      proof: {
        reference: {
          providerInstanceRef: 'provider-instance-beta',
          fileId: 'other-file'
        },
        immutableVersionId: 'version-1',
        immutableIdentity: true as const,
        retained: true as const,
        versionSpecificRetrieval: true as const
      }
    }))
    const createProvider = vi.fn(() => provider(
      vi.fn(async () => ({ items: [] })),
      'production_ready',
      'observe-immutable-version',
      mismatch
    ))
    const contributions = [factoryContribution('pinned-provider', createProvider)]
    const entry = {
      providerInstanceRef: parseProviderInstanceRef('provider-instance-alpha'),
      providerKind: parseProviderKind('pinned-provider'),
      displayName: 'Pinned'
    }
    const service = new ContentSpaceService({
      contributions: { list: () => contributions },
      instances: { list: () => [entry], resolve: () => entry }
    })
    await expect(service.observeImmutableVersion({
      providerInstanceRef: 'provider-instance-alpha',
      fileId: 'file-1'
    }, { principal })).rejects.toMatchObject({
      detail: { code: 'immutable_version_unproven' }
    })
  })
})
