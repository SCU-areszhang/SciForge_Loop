import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DOMAIN_PACKAGE_CONTRACT_VERSION,
  type DomainPackageJsonValue,
  type TrustedDomainPackageDefinitionInput
} from './contract.js'
import { TrustedDomainProcessEntryError, defineTrustedDomainProcessEntry } from './process-entry.js'
import {
  MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND,
  MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND,
  MAIN_PROVIDER_INSTANCE_DIRECTORY_ENTRY_CONTRIBUTION_KIND,
  PROVIDER_FACTORY_CONTRACT_VERSION,
  ProviderCompositionError,
  ProviderInstanceDirectory,
  createContentSpaceProviderFactoryCatalog,
  createDocumentProviderFactoryCatalog,
  createProviderInstanceDirectory,
  defineContentSpaceProviderFactory,
  defineDocumentProviderFactory,
  defineProviderInstanceDirectoryEntry,
  providerFactoryContributionContractSchema,
  providerInstanceRefSchema,
  providerInstanceDirectoryEntryContributionContractSchema,
  providerKindSchema,
  type DomainMainComposedContribution,
  type DomainMainContributionSource,
  type ProviderFactoryRuntimeValue
} from './provider-composition.js'

type FixtureProvider = Readonly<{ provider: string }>
type FixturePorts = Readonly<{ operationDependency: () => string }>

const documentKind = MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND
const contentKind = MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND

function expectCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof ProviderCompositionError && error.code === code
}

function contribution(input: Readonly<{
  kind: typeof documentKind | typeof contentKind
  providerKind: string
  owner?: string
  contractVersion?: string
  declarationVersion?: string
  value?: unknown
}>): DomainMainComposedContribution {
  const owner = input.owner ?? 'fixture.provider-integration'
  const contractVersion = input.contractVersion ?? PROVIDER_FACTORY_CONTRACT_VERSION
  const id = `${owner}.${input.kind === documentKind ? 'document' : 'content-space'}`
  const value = input.value ?? Object.freeze({
    contributionKind: input.kind,
    contractVersion,
    providerKind: input.providerKind,
    createProvider: () => ({ provider: input.providerKind })
  })
  return Object.freeze({
    packageName: `@fixture/${owner.replaceAll('.', '-')}`,
    owner: Object.freeze({ moduleId: owner, moduleVersion: '1.2.3' }),
    declaration: Object.freeze({
      id,
      kind: input.kind,
      version: input.declarationVersion ?? contractVersion,
      priority: 100
    }),
    contract: Object.freeze({ contractVersion, providerKind: input.providerKind }),
    value
  })
}

function source(
  contributions: readonly DomainMainComposedContribution[]
): DomainMainContributionSource {
  return Object.freeze({
    list: (kind: string) => Object.freeze(
      contributions.filter((entry) => entry.declaration.kind === kind)
    )
  })
}

describe('provider factory contribution contracts', () => {
  it('strictly validates declaration and runtime versions, kinds, and exact keys', () => {
    assert.deepEqual(providerFactoryContributionContractSchema.parse({
      contractVersion: '1.4.0',
      providerKind: 'fixture-cloud'
    }), {
      contractVersion: '1.4.0',
      providerKind: 'fixture-cloud'
    })
    for (const invalid of [
      { contractVersion: '1', providerKind: 'fixture-cloud' },
      { contractVersion: '1.0.0', providerKind: 'UPPER' },
      { contractVersion: '1.0.0', providerKind: 'x' },
      { contractVersion: '1.0.0', providerKind: 'fixture-cloud', endpoint: 'forbidden' }
    ]) {
      assert.equal(providerFactoryContributionContractSchema.safeParse(invalid).success, false)
    }
    for (const invalid of ['OpenContent', 'ab', 'fixture/cloud', ' fixture-cloud']) {
      assert.equal(providerKindSchema.safeParse(invalid).success, false)
    }
    for (const invalid of [
      'https://provider.invalid',
      'connection_local_alpha',
      'credential-alpha',
      'ab'
    ]) {
      assert.equal(providerInstanceRefSchema.safeParse(invalid).success, false)
    }
    assert.throws(
      () => defineDocumentProviderFactory({
        contractVersion: '1.0.0',
        providerKind: 'fixture-cloud',
        createProvider: () => ({ provider: 'fixture-cloud' }),
        extra: true
      } as unknown as Parameters<typeof defineDocumentProviderFactory>[0]),
      expectCode('invalid_contribution')
    )
  })

  it('keeps document and content-space factory values independently typed and validated', () => {
    const document = defineDocumentProviderFactory<FixtureProvider, FixturePorts>({
      contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
      providerKind: 'fixture-cloud',
      createProvider: () => ({ provider: 'document' })
    })
    const content = defineContentSpaceProviderFactory<FixtureProvider, FixturePorts>({
      contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
      providerKind: 'fixture-cloud',
      createProvider: () => ({ provider: 'content-space' })
    })
    assert.equal(document.contributionKind, documentKind)
    assert.equal(content.contributionKind, contentKind)
    assert.equal(document.providerKind, 'fixture-cloud')
    assert.equal(content.providerKind, 'fixture-cloud')
    assert.equal(Object.isFrozen(document), true)
    assert.equal(Object.isFrozen(content), true)
  })

  it('uses the standard process contract to reject missing, extra, and drifted runtime values', () => {
    const definition = providerPackageDefinition()
    const documentValue = contribution({ kind: documentKind, providerKind: 'fixture-cloud' })
    const contentValue = contribution({ kind: contentKind, providerKind: 'fixture-cloud' })
    assert.throws(
      () => defineTrustedDomainProcessEntry('main', {
        definition,
        contributions: [{
          id: documentValue.declaration.id,
          kind: documentKind,
          contract: documentValue.contract,
          value: documentValue.value
        }]
      }),
      (error) => error instanceof TrustedDomainProcessEntryError &&
        error.code === 'runtime_contribution_mismatch'
    )
    assert.throws(
      () => defineTrustedDomainProcessEntry('main', {
        definition,
        contributions: [
          {
            id: documentValue.declaration.id,
            kind: documentKind,
            contract: documentValue.contract,
            value: documentValue.value
          },
          {
            id: contentValue.declaration.id,
            kind: contentKind,
            contract: contentValue.contract,
            value: contentValue.value
          },
          {
            id: 'fixture.provider-integration.extra',
            kind: documentKind,
            value: documentValue.value
          }
        ]
      }),
      (error) => error instanceof TrustedDomainProcessEntryError &&
        error.code === 'runtime_contribution_mismatch'
    )
    assert.throws(
      () => defineTrustedDomainProcessEntry('main', {
        definition,
        contributions: [
          {
            id: documentValue.declaration.id,
            kind: documentKind,
            contract: { contractVersion: '1.0.0', providerKind: 'drifted-provider' },
            value: documentValue.value
          },
          {
            id: contentValue.declaration.id,
            kind: contentKind,
            contract: contentValue.contract,
            value: contentValue.value
          }
        ]
      }),
      (error) => error instanceof TrustedDomainProcessEntryError &&
        error.code === 'runtime_contribution_contract_mismatch'
    )
  })
})

describe('provider-neutral factory catalogs', () => {
  it('composes the two catalog kinds independently when one package contributes both', () => {
    const document = contribution({ kind: documentKind, providerKind: 'fixture-cloud' })
    const content = contribution({ kind: contentKind, providerKind: 'fixture-cloud' })
    const contributions = source([document, content])
    assert.deepEqual(
      createDocumentProviderFactoryCatalog(contributions).list().map((entry) => entry.providerKind),
      ['fixture-cloud']
    )
    assert.deepEqual(
      createContentSpaceProviderFactoryCatalog(contributions).list()
        .map((entry) => entry.providerKind),
      ['fixture-cloud']
    )
  })

  it('rejects duplicate kinds, incompatible majors, and declaration/runtime drift', () => {
    assert.throws(
      () => createDocumentProviderFactoryCatalog(source([
        contribution({ kind: documentKind, providerKind: 'fixture-cloud', owner: 'fixture.one' }),
        contribution({ kind: documentKind, providerKind: 'fixture-cloud', owner: 'fixture.two' })
      ])),
      expectCode('duplicate_provider_kind')
    )
    assert.throws(
      () => createDocumentProviderFactoryCatalog(source([
        contribution({ kind: documentKind, providerKind: 'fixture-cloud', contractVersion: '2.0.0' })
      ])),
      expectCode('incompatible_contract_version')
    )
    assert.throws(
      () => createDocumentProviderFactoryCatalog(source([
        contribution({
          kind: documentKind,
          providerKind: 'fixture-cloud',
          declarationVersion: '1.1.0'
        })
      ])),
      expectCode('invalid_contribution')
    )
    assert.throws(
      () => createDocumentProviderFactoryCatalog(source([
        contribution({
          kind: documentKind,
          providerKind: 'fixture-cloud',
          value: {
            contributionKind: documentKind,
            contractVersion: '1.0.0',
            providerKind: 'other-cloud',
            createProvider: () => ({ provider: 'other-cloud' })
          }
        })
      ])),
      expectCode('invalid_contribution')
    )
    assert.throws(
      () => createDocumentProviderFactoryCatalog(source([
        contribution({
          kind: documentKind,
          providerKind: 'fixture-cloud',
          value: defineContentSpaceProviderFactory({
            contractVersion: '1.0.0',
            providerKind: 'fixture-cloud',
            createProvider: () => ({ provider: 'content-space' })
          })
        })
      ])),
      expectCode('invalid_contribution')
    )
  })

  it('lets one invalid contribution fail without manufacturing or invalidating its sibling', () => {
    const contributions = source([
      contribution({
        kind: documentKind,
        providerKind: 'fixture-cloud',
        value: { contractVersion: '1.0.0', providerKind: 'fixture-cloud' }
      }),
      contribution({ kind: contentKind, providerKind: 'fixture-cloud' })
    ])
    assert.throws(
      () => createDocumentProviderFactoryCatalog(contributions),
      expectCode('invalid_contribution')
    )
    assert.equal(createContentSpaceProviderFactoryCatalog(contributions).list().length, 1)
  })

  it('constructs catalogs and selects instances without invoking factories or lazy ports', () => {
    let factoryCalls = 0
    let dependencyCalls = 0
    let receivedOwner: unknown
    let receivedInstance: unknown
    const runtime: ProviderFactoryRuntimeValue<FixtureProvider, FixturePorts> = Object.freeze({
      contributionKind: documentKind,
      contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
      providerKind: 'fixture-cloud' as ProviderFactoryRuntimeValue<FixtureProvider, FixturePorts>['providerKind'],
      createProvider: (hostView) => {
        factoryCalls += 1
        receivedOwner = hostView.owner
        receivedInstance = hostView.instance
        return { provider: hostView.ports.operationDependency() }
      }
    })
    const catalog = createDocumentProviderFactoryCatalog<FixtureProvider, FixturePorts>(source([
      contribution({ kind: documentKind, providerKind: 'fixture-cloud', value: runtime })
    ]))
    const directory = new ProviderInstanceDirectory([{
      providerInstanceRef: 'provider_instance_alpha',
      providerKind: 'fixture-cloud'
    }])
    const selected = catalog.select(directory, 'provider_instance_alpha')
    assert.equal(factoryCalls, 0)
    assert.equal(dependencyCalls, 0)
    assert.equal(selected.owner.packageName, '@fixture/fixture-provider-integration')
    assert.equal(selected.owner.moduleId, 'fixture.provider-integration')
    return selected.createProvider({
      operationDependency: () => {
        dependencyCalls += 1
        return 'lazy-provider'
      }
    }).then((provider) => {
      assert.deepEqual(provider, { provider: 'lazy-provider' })
      assert.equal(factoryCalls, 1)
      assert.equal(dependencyCalls, 1)
      assert.deepEqual(receivedOwner, selected.owner)
      assert.deepEqual(receivedInstance, {
        providerInstanceRef: 'provider_instance_alpha',
        providerKind: 'fixture-cloud'
      })
    })
  })

  it('fails unknown and missing instances before any factory invocation', () => {
    let factoryCalls = 0
    const catalog = createDocumentProviderFactoryCatalog(source([
      contribution({
        kind: documentKind,
        providerKind: 'fixture-cloud',
        value: {
          contributionKind: documentKind,
          contractVersion: '1.0.0',
          providerKind: 'fixture-cloud',
          createProvider: () => {
            factoryCalls += 1
            return { provider: 'fixture-cloud' }
          }
        }
      })
    ]))
    const unknown = new ProviderInstanceDirectory([])
    assert.throws(
      () => catalog.select(unknown, 'provider_instance_unknown'),
      expectCode('unknown_provider_instance')
    )
    const callerSelectedOwner = {
      providerInstanceRef: 'provider_instance_unknown',
      packageName: '@fixture/forced'
    } as unknown as string
    assert.throws(
      () => catalog.select(unknown, callerSelectedOwner),
      expectCode('invalid_provider_instance')
    )
    assert.throws(
      () => catalog.select(unknown, 'report.pdf'),
      expectCode('unknown_provider_instance')
    )
    const missing = new ProviderInstanceDirectory([{
      providerInstanceRef: 'provider_instance_missing',
      providerKind: 'missing-cloud'
    }])
    assert.throws(
      () => catalog.select(missing, 'provider_instance_missing'),
      expectCode('missing_provider')
    )
    assert.equal(factoryCalls, 0)
  })

  it('never falls back when the pinned Provider is unavailable', async () => {
    let pinnedCalls = 0
    let fallbackCalls = 0
    const catalog = createDocumentProviderFactoryCatalog<FixtureProvider, FixturePorts>(source([
      contribution({
        kind: documentKind,
        providerKind: 'pinned-cloud',
        owner: 'fixture.pinned',
        value: {
          contributionKind: documentKind,
          contractVersion: '1.0.0',
          providerKind: 'pinned-cloud',
          createProvider: () => {
            pinnedCalls += 1
            throw new Error('offline')
          }
        }
      }),
      contribution({
        kind: documentKind,
        providerKind: 'fallback-cloud',
        owner: 'fixture.fallback',
        value: {
          contributionKind: documentKind,
          contractVersion: '1.0.0',
          providerKind: 'fallback-cloud',
          createProvider: () => {
            fallbackCalls += 1
            return { provider: 'fallback-cloud' }
          }
        }
      })
    ]))
    const directory = new ProviderInstanceDirectory([{
      providerInstanceRef: 'provider_instance_pinned',
      providerKind: 'pinned-cloud'
    }])
    const selected = catalog.select(directory, 'provider_instance_pinned')
    await assert.rejects(
      selected.createProvider({ operationDependency: () => 'unused' }),
      expectCode('provider_unavailable')
    )
    assert.equal(pinnedCalls, 1)
    assert.equal(fallbackCalls, 0)
  })
})

describe('trusted Provider Instance Directory composition', () => {
  const instanceContribution = (input: Readonly<{
    owner?: string
    providerInstanceRef?: string
    runtimeRef?: string
  }> = {}): DomainMainComposedContribution => {
    const owner = input.owner ?? 'fixture.provider-instance'
    const contract = {
      contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
      providerInstanceRef: input.providerInstanceRef ?? 'provider_instance_alpha',
      providerKind: 'fixture-cloud',
      displayName: 'Fixture instance'
    }
    return Object.freeze({
      packageName: `@fixture/${owner.replaceAll('.', '-')}`,
      owner: Object.freeze({ moduleId: owner, moduleVersion: '1.0.0' }),
      declaration: Object.freeze({
        id: `${owner}.instance`,
        kind: MAIN_PROVIDER_INSTANCE_DIRECTORY_ENTRY_CONTRIBUTION_KIND,
        version: PROVIDER_FACTORY_CONTRACT_VERSION,
        priority: 100
      }),
      contract: Object.freeze(contract),
      value: defineProviderInstanceDirectoryEntry({
        ...contract,
        providerInstanceRef: input.runtimeRef ?? contract.providerInstanceRef
      })
    })
  }

  it('strictly validates and composes bounded non-secret instance entries', () => {
    assert.deepEqual(providerInstanceDirectoryEntryContributionContractSchema.parse({
      contractVersion: '1.0.0',
      providerInstanceRef: 'provider_instance_alpha',
      providerKind: 'fixture-cloud',
      displayName: 'Fixture instance'
    }), {
      contractVersion: '1.0.0',
      providerInstanceRef: 'provider_instance_alpha',
      providerKind: 'fixture-cloud',
      displayName: 'Fixture instance'
    })
    const directory = createProviderInstanceDirectory(source([instanceContribution()]))
    assert.deepEqual(directory.list(), [{
      providerInstanceRef: 'provider_instance_alpha',
      providerKind: 'fixture-cloud',
      displayName: 'Fixture instance'
    }])
  })

  it('rejects duplicates and declaration/runtime drift without choosing a default', () => {
    assert.throws(() => createProviderInstanceDirectory(source([
      instanceContribution({ owner: 'fixture.one' }),
      instanceContribution({ owner: 'fixture.two' })
    ])), expectCode('duplicate_provider_instance'))
    assert.throws(() => createProviderInstanceDirectory(source([
      instanceContribution({ runtimeRef: 'provider_instance_other' })
    ])), expectCode('invalid_contribution'))
    const empty = createProviderInstanceDirectory(source([]))
    assert.equal(empty.resolve('provider_instance_alpha'), undefined)
  })
})

function providerPackageDefinition(): TrustedDomainPackageDefinitionInput {
  const documentId = 'fixture.provider-integration.document'
  const contentId = 'fixture.provider-integration.content-space'
  const contract: DomainPackageJsonValue = {
    contractVersion: PROVIDER_FACTORY_CONTRACT_VERSION,
    providerKind: 'fixture-cloud'
  }
  return {
    contractVersion: DOMAIN_PACKAGE_CONTRACT_VERSION,
    kind: 'trusted-compile-time',
    packageName: '@fixture/fixture-provider-integration',
    module: {
      id: 'fixture.provider-integration',
      displayName: 'Fixture Provider Integration',
      version: '1.2.3',
      hostApi: { minimum: '1.0.0', maximumExclusive: '2.0.0' }
    },
    contributionContracts: {
      [documentId]: contract,
      [contentId]: contract
    },
    entrypoints: [{
      process: 'main',
      export: './main',
      contributions: [
        { id: documentId, kind: documentKind, version: '1.0.0' },
        { id: contentId, kind: contentKind, version: '1.0.0' }
      ]
    }]
  }
}
