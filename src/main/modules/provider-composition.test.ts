import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DOMAIN_PACKAGE_CONTRACT_VERSION,
  type DomainPackageJsonValue,
  type TrustedDomainPackageDefinitionInput
} from '@sciforge/domain-sdk'
import {
  MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND,
  MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND,
  MAIN_PROVIDER_INSTANCE_DIRECTORY_ENTRY_CONTRIBUTION_KIND,
  PROVIDER_FACTORY_CONTRACT_VERSION,
  ProviderInstanceDirectory,
  createContentSpaceProviderFactoryCatalog,
  createDocumentProviderFactoryCatalog,
  defineContentSpaceProviderFactory,
  defineDocumentProviderFactory,
  defineProviderInstanceDirectoryEntry
} from '@sciforge/domain-sdk/provider-composition'
import { describe, expect, it, vi } from 'vitest'
import { DomainModuleCatalog, type MainDomainModuleDefinition } from './catalog'
import {
  createDomainMainContributionSource,
  createDomainMainProviderInstanceDirectorySource
} from './provider-composition'

const documentKind = MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND
const contentKind = MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND

describe('generated provider composition adapter', () => {
  it('projects both factory kinds from one standard main catalog with composition ownership', async () => {
    const catalog = new DomainModuleCatalog()
    catalog.registerModule(providerModule())
    const source = createDomainMainContributionSource(catalog)
    const providerInstances = createDomainMainProviderInstanceDirectorySource(catalog)
    const documents = createDocumentProviderFactoryCatalog(source)
    const contentSpace = createContentSpaceProviderFactoryCatalog(source)

    expect(documents.list()).toEqual([expect.objectContaining({
      providerKind: 'fixture-cloud',
      owner: {
        packageName: '@fixture/provider-integration',
        moduleId: 'fixture.provider-integration',
        moduleVersion: '1.0.0',
        contributionId: 'fixture.provider-integration.document'
      }
    })])
    expect(contentSpace.list()).toEqual([expect.objectContaining({
      providerKind: 'fixture-cloud',
      owner: expect.objectContaining({
        contributionId: 'fixture.provider-integration.content-space'
      })
    })])

    const directory = new ProviderInstanceDirectory(providerInstances.list())
    await expect(documents.select(directory, 'provider_instance_alpha').createProvider({
      dependency: () => 'document'
    })).resolves.toEqual({ domain: 'document', dependency: 'document' })
    await expect(contentSpace.select(directory, 'provider_instance_alpha').createProvider({
      dependency: () => 'content-space'
    })).resolves.toEqual({ domain: 'content-space', dependency: 'content-space' })
    catalog.dispose()
  })

  it('fails instead of exposing a load-order-dependent partial composition', () => {
    const catalog = new DomainModuleCatalog()
    let ready = false
    const source = createDomainMainContributionSource(catalog, () => ready)
    const providerInstances = createDomainMainProviderInstanceDirectorySource(
      catalog,
      () => ready
    )
    expect(() => createDocumentProviderFactoryCatalog(source)).toThrow(
      expect.objectContaining({ code: 'composition_not_ready' })
    )
    expect(() => providerInstances.list()).toThrow(
      expect.objectContaining({ code: 'composition_not_ready' })
    )
    catalog.registerModule(providerModule())
    expect(() => createDocumentProviderFactoryCatalog(source)).toThrow(
      expect.objectContaining({ code: 'composition_not_ready' })
    )
    ready = true
    expect(createDocumentProviderFactoryCatalog(source).list()).toHaveLength(1)
    expect(providerInstances.list()).toEqual([{
      providerInstanceRef: 'provider_instance_alpha',
      providerKind: 'fixture-cloud',
      displayName: 'Fixture instance'
    }])
    catalog.dispose()
  })

  it('reflects package addition and removal without a Provider map or fallback registry', () => {
    const catalog = new DomainModuleCatalog()
    const source = createDomainMainContributionSource(catalog)
    expect(createDocumentProviderFactoryCatalog(source).list()).toEqual([])
    expect(createContentSpaceProviderFactoryCatalog(source).list()).toEqual([])

    const registration = catalog.registerModule(providerModule())
    expect(createDocumentProviderFactoryCatalog(source).list()).toHaveLength(1)
    expect(createContentSpaceProviderFactoryCatalog(source).list()).toHaveLength(1)

    registration.dispose()
    expect(createDocumentProviderFactoryCatalog(source).list()).toEqual([])
    expect(createContentSpaceProviderFactoryCatalog(source).list()).toEqual([])
  })

  it('performs no factory, network, login, credential, content, or mutation work while composing', () => {
    const sideEffects = {
      factory: vi.fn(),
      network: vi.fn(),
      login: vi.fn(),
      credential: vi.fn(),
      content: vi.fn(),
      mutation: vi.fn()
    }
    const catalog = new DomainModuleCatalog()
    catalog.registerModule(providerModule(({ domain }) => {
      sideEffects.factory()
      sideEffects.network()
      sideEffects.login()
      sideEffects.credential()
      sideEffects.content()
      sideEffects.mutation()
      return { domain, dependency: 'created' }
    }))
    const source = createDomainMainContributionSource(catalog)
    const documents = createDocumentProviderFactoryCatalog(source)
    const contentSpace = createContentSpaceProviderFactoryCatalog(source)
    expect(documents.list()).toHaveLength(1)
    expect(contentSpace.list()).toHaveLength(1)
    for (const effect of Object.values(sideEffects)) expect(effect).not.toHaveBeenCalled()
    catalog.dispose()
  })

  it('keeps Host Core and Agent Runtime free of vendor routing and Provider-specific surfaces', () => {
    const providerSources = [
      'packages/domain-sdk/src/provider-composition.ts',
      'src/main/modules/provider-composition.ts',
      'src/main/modules/application-composition.ts',
      'src/main/modules/installed-domain-main.ts'
    ].map((path) => readFileSync(resolve(path), 'utf8')).join('\n')
    const agentRuntimeSources = [
      'src/main/runtime/agent-runtime/host.ts',
      'src/main/runtime/agent-runtime/workspace-host-agent-runtime-adapter.ts'
    ].map((path) => readFileSync(resolve(path), 'utf8')).join('\n')

    const forbiddenProviderCore = [
      /opencontent/iu,
      /google(?:drive|docs)?/iu,
      /microsoft(?:graph)?/iu,
      /dropbox/iu,
      /switch\s*\([^)]*(?:provider|domain)/iu,
      /case\s+['"][^'"]*(?:provider|document|content-space)/iu,
      /\bfetch\s*\(/u,
      /from\s+['"]node:https?['"]/u,
      /\b(?:login|readCredential|createClient)\s*\(/u,
      /interface\s+Provider\s*\{/u,
      /(?:listFiles|readDocument|upload|download)\?\s*\(/u
    ]
    expect(forbiddenProviderCore.flatMap((pattern) =>
      providerSources.match(pattern) ?? []
    )).toEqual([])
    expect(agentRuntimeSources).not.toContain(documentKind)
    expect(agentRuntimeSources).not.toContain(contentKind)
  })
})

type FixtureFactoryInput = Readonly<{
  domain: 'document' | 'content-space'
}>

function providerModule(
  create?: (input: FixtureFactoryInput) => Readonly<{ domain: string; dependency: string }>
): MainDomainModuleDefinition {
  const documentId = 'fixture.provider-integration.document'
  const contentId = 'fixture.provider-integration.content-space'
  const instanceId = 'fixture.provider-integration.instance'
  const contract: DomainPackageJsonValue = {
    contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
    providerKind: 'fixture-cloud'
  }
  const instanceContract: DomainPackageJsonValue = {
    contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
    providerInstanceRef: 'provider_instance_alpha',
    providerKind: 'fixture-cloud',
    displayName: 'Fixture instance'
  }
  const definition: TrustedDomainPackageDefinitionInput = {
    contractVersion: DOMAIN_PACKAGE_CONTRACT_VERSION,
    kind: 'trusted-compile-time',
    packageName: '@fixture/provider-integration',
    module: {
      id: 'fixture.provider-integration',
      displayName: 'Fixture Provider Integration',
      version: '1.0.0',
      hostApi: { minimum: '1.0.0', maximumExclusive: '2.0.0' }
    },
    contributionContracts: {
      [documentId]: contract,
      [contentId]: contract,
      [instanceId]: instanceContract
    },
    entrypoints: [{
      process: 'main',
      export: './main',
      contributions: [
        { id: documentId, kind: documentKind, version: PROVIDER_FACTORY_CONTRACT_VERSION },
        { id: contentId, kind: contentKind, version: PROVIDER_FACTORY_CONTRACT_VERSION },
        {
          id: instanceId,
          kind: MAIN_PROVIDER_INSTANCE_DIRECTORY_ENTRY_CONTRIBUTION_KIND,
          version: PROVIDER_FACTORY_CONTRACT_VERSION
        }
      ]
    }]
  }
  const createProvider = create ?? (({ domain }: FixtureFactoryInput) => ({
    domain,
    dependency: domain
  }))
  return {
    definition,
    contributions: [
      {
        id: documentId,
        kind: documentKind,
        contract,
        value: defineDocumentProviderFactory({
          contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
          providerKind: 'fixture-cloud',
          createProvider: (hostView: Readonly<{
            ports: Readonly<{ dependency: () => string }>
          }>) => createProvider({ domain: 'document' }) ?? {
            domain: 'document',
            dependency: hostView.ports.dependency()
          }
        })
      },
      {
        id: contentId,
        kind: contentKind,
        contract,
        value: defineContentSpaceProviderFactory({
          contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
          providerKind: 'fixture-cloud',
          createProvider: (hostView: Readonly<{
            ports: Readonly<{ dependency: () => string }>
          }>) => createProvider({ domain: 'content-space' }) ?? {
            domain: 'content-space',
            dependency: hostView.ports.dependency()
          }
        })
      },
      {
        id: instanceId,
        kind: MAIN_PROVIDER_INSTANCE_DIRECTORY_ENTRY_CONTRIBUTION_KIND,
        contract: instanceContract,
        value: defineProviderInstanceDirectoryEntry({
          contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
          providerInstanceRef: 'provider_instance_alpha',
          providerKind: 'fixture-cloud',
          displayName: 'Fixture instance'
        })
      }
    ]
  }
}
