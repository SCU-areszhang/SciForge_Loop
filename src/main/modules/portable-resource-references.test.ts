import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DOMAIN_PACKAGE_CONTRACT_VERSION,
  type DomainPackageJsonValue,
  type TrustedDomainPackageDefinitionInput
} from '@sciforge/domain-sdk'
import {
  MAIN_PORTABLE_AUTHORITY_RESOLVER_CONTRIBUTION_KIND,
  MAIN_PORTABLE_RESOURCE_CODEC_CONTRIBUTION_KIND,
  PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION,
  PortableResourceReferenceError,
  type PortableResourceAuthorityResolver,
  type PortableResourceReferenceCodec
} from '@sciforge/domain-sdk/portable-resource-references'
import { describe, expect, it, vi } from 'vitest'
import type { CapabilityCallerContextInput } from '../../shared/capability-broker'
import { CapabilityBroker, CapabilityBrokerError } from '../capabilities/broker'
import { CapabilityRegistry } from '../capabilities/registry'
import { DomainModuleCatalog, type MainDomainModuleDefinition } from './catalog'
import {
  PortableAuthorityResolverRegistry,
  PortableResourceCodecRegistry,
  PortableResourceReferenceService,
  composePortableResourceReferenceRegistries
} from './portable-resource-references'

const kind = 'fixture.logical-resource'
const resourceKind = 'fixture.local-resource'
const resolverId = 'fixture.authority-resolver'
const authority = 'provider_instance_alpha'
const consumerId = 'fixture.allowed-consumer'
const principal = {
  userId: 'c781f184-6cb4-4300-a22b-c5dd491422c6',
  assurance: 'cloud-authenticated' as const,
  deviceId: 'device-alpha',
  identityVersion: 7
}
const forgedPrincipal = {
  ...principal,
  userId: '4ae844d8-a103-4d56-83c1-cb079275433c'
}
const caller: CapabilityCallerContextInput = {
  audience: 'ui',
  callerId: 'window-alpha',
  workspaceId: 'workspace-alpha',
  principal: forgedPrincipal
}
const envelope = {
  contractVersion: PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION,
  kind,
  authority,
  identity: { resourceId: 'logical-123' }
} as const

function fakeCodec(): PortableResourceReferenceCodec<{ resourceId: string }, { stableId: string }> {
  return Object.freeze({
    kind,
    resourceKind,
    decodeIdentity: (identity) => {
      if (Object.keys(identity).length !== 1 ||
        typeof identity.resourceId !== 'string' ||
        !identity.resourceId.startsWith('logical-')) {
        throw new Error('invalid fixture identity')
      }
      return { resourceId: identity.resourceId }
    },
    encodeIdentity: (identity) => ({ resourceId: identity.resourceId }),
    projectExport: (projection) => ({ resourceId: projection.stableId })
  })
}

function fakeResolver(options: Readonly<{
  resolve?: PortableResourceAuthorityResolver['resolve']
  project?: () => unknown | Promise<unknown>
  audiences?: readonly ('ui' | 'agent' | 'system')[]
  lookupAuthority?: PortableResourceAuthorityResolver['lookupAuthority']
}> = {}): PortableResourceAuthorityResolver {
  return Object.freeze({
    id: resolverId,
    lookupAuthority: options.lookupAuthority ?? ((reference) =>
      reference === authority ? { reference, resolverId } : undefined
    ),
    resolve: options.resolve ?? vi.fn(async () => ({
      registration: {
        resourceId: 'provider-internal-9',
        resourceKind,
        audiences: options.audiences ?? ['ui', 'system'],
        semanticRevision: 'revision-1',
        observe: async () => ({
          state: { privateTitle: 'must-not-export' },
          semanticRevision: 'revision-1'
        })
      },
      exportProjection: {
        consumerIds: [consumerId],
        project: options.project ?? (() => ({ stableId: 'logical-123' }))
      }
    }))
  })
}

function serviceFixture(options: Readonly<{
  codec?: PortableResourceReferenceCodec
  resolver?: PortableResourceAuthorityResolver
  lookup?: (reference: string) => { reference: string; resolverId: string } | undefined
  broker?: CapabilityBroker
  currentPrincipal?: () => typeof principal | undefined
}> = {}) {
  const codec = options.codec ?? fakeCodec()
  const lookup = vi.fn(options.lookup ?? ((reference: string) =>
    reference === authority ? { reference, resolverId } : undefined
  ))
  const resolver = Object.freeze({
    ...(options.resolver ?? fakeResolver()),
    lookupAuthority: lookup
  })
  const broker = options.broker ?? new CapabilityBroker(new CapabilityRegistry())
  const service = new PortableResourceReferenceService(
    broker,
    new PortableResourceCodecRegistry([{
      ownerId: 'fixture.resource-owner',
      contributionId: 'fixture.resource-owner.codec',
      codec
    }]),
    new PortableAuthorityResolverRegistry([{
      ownerId: 'fixture.integration-owner',
      contributionId: 'fixture.integration-owner.resolver',
      resolver
    }]),
    options.currentPrincipal ?? (() => principal)
  )
  return { broker, codec, resolver, lookup, service }
}

function expectPortableCode(error: unknown, code: string): boolean {
  expect(error).toBeInstanceOf(PortableResourceReferenceError)
  expect((error as PortableResourceReferenceError).code).toBe(code)
  expect((error as Error).message.length).toBeLessThanOrEqual(256)
  return true
}

describe('portable resource reference composition', () => {
  it('binds codec and resolver contributions through the standard main catalog', () => {
    const catalog = new DomainModuleCatalog()
    catalog.registerBatch([
      contributionEntry('fixture.resource-owner', 'fixture.resource-owner.codec',
        MAIN_PORTABLE_RESOURCE_CODEC_CONTRIBUTION_KIND, {
          contractVersion: 1,
          kind,
          resourceKind
        }, fakeCodec()),
      contributionEntry('fixture.integration-owner', 'fixture.integration-owner.resolver',
        MAIN_PORTABLE_AUTHORITY_RESOLVER_CONTRIBUTION_KIND, {
          contractVersion: 1,
          resolverId
        }, fakeResolver())
    ])

    const registries = composePortableResourceReferenceRegistries(catalog)
    expect(registries.codecs.list().map(({ ownerId }) => ownerId))
      .toEqual(['fixture.resource-owner'])
    expect(registries.resolvers.list().map(({ ownerId }) => ownerId))
      .toEqual(['fixture.integration-owner'])
    catalog.dispose()
  })

  it('rejects duplicate kind/resolver ownership and manifest-runtime contract drift', () => {
    expect(() => new PortableResourceCodecRegistry([
      { ownerId: 'fixture.one', contributionId: 'fixture.one.codec', codec: fakeCodec() },
      { ownerId: 'fixture.two', contributionId: 'fixture.two.codec', codec: fakeCodec() }
    ])).toThrow(expect.objectContaining({ code: 'duplicate_codec' }))
    expect(() => new PortableAuthorityResolverRegistry([
      { ownerId: 'fixture.one', contributionId: 'fixture.one.resolver', resolver: fakeResolver() },
      { ownerId: 'fixture.two', contributionId: 'fixture.two.resolver', resolver: fakeResolver() }
    ])).toThrow(expect.objectContaining({ code: 'duplicate_resolver' }))

    const conflictingAuthorities = new PortableAuthorityResolverRegistry([
      { ownerId: 'fixture.one', contributionId: 'fixture.one.resolver', resolver: fakeResolver() },
      {
        ownerId: 'fixture.two',
        contributionId: 'fixture.two.resolver',
        resolver: {
          ...fakeResolver(),
          id: 'fixture.second-resolver',
          lookupAuthority: (reference) => reference === authority
            ? { reference, resolverId: 'fixture.second-resolver' }
            : undefined
        }
      }
    ])
    expect(() => conflictingAuthorities.lookup(authority))
      .toThrow(expect.objectContaining({ code: 'duplicate_resolver' }))

    const drifted = new DomainModuleCatalog()
    drifted.registerModule(contributionEntry(
      'fixture.drifted-owner',
      'fixture.drifted-owner.codec',
      MAIN_PORTABLE_RESOURCE_CODEC_CONTRIBUTION_KIND,
      { contractVersion: 1, kind: 'fixture.other-kind', resourceKind },
      fakeCodec()
    ))
    expect(() => composePortableResourceReferenceRegistries(drifted))
      .toThrow(/failed runtime validation/u)
    drifted.dispose()
  })

  it('keeps generic production code free of business/provider routing unions', () => {
    const sources = [
      resolve('packages/domain-sdk/src/portable-resource-references.ts'),
      resolve('src/main/modules/portable-resource-references.ts')
    ].map((path) => readFileSync(path, 'utf8')).join('\n')
    const forbidden = [
      /opencontent/iu,
      /documentreference/iu,
      /contentcontainer/iu,
      /contentfilereference/iu,
      /artifactreference/iu,
      /projectreference/iu,
      /taskreference/iu,
      /mimetype\s*(?:===|switch|case)/iu
    ]
    expect(forbidden.flatMap((pattern) => sources.match(pattern) ?? [])).toEqual([])
  })
})

describe('portable resource materialization and export', () => {
  it('uses the Host principal, reauthorizes, and issues through the canonical Broker path', async () => {
    const resolver = fakeResolver()
    const fixture = serviceFixture({ resolver })
    const issue = vi.spyOn(fixture.broker, 'issueResource')
    const materialized = await fixture.service.materialize(envelope, caller)

    expect(resolver.resolve).toHaveBeenCalledWith(expect.objectContaining({
      envelope,
      identity: { resourceId: 'logical-123' },
      resourceKind,
      principal
    }))
    expect((resolver.resolve as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].principal)
      .not.toEqual(forgedPrincipal)
    expect(issue).toHaveBeenCalledTimes(1)
    expect(materialized.resourceRef).toMatch(/^res_/u)
    expect(materialized.resource.token).toMatch(/^cap_/u)
    expect(materialized.resourceKind).toBe(resourceKind)
    expect(JSON.stringify(materialized)).not.toContain('provider-internal-9')
  })

  it('fails structural, version, kind, codec, and authority stages before resolver/network use', async () => {
    const resolver = fakeResolver()
    const fixture = serviceFixture({ resolver })
    const invalidCases: Array<{ value: unknown; code: string; lookupCalls: number }> = [
      { value: { ...envelope, endpoint: 'provider_instance_alpha' }, code: 'invalid_envelope', lookupCalls: 0 },
      { value: { ...envelope, contractVersion: 2 }, code: 'unsupported_version', lookupCalls: 0 },
      { value: { ...envelope, kind: 'fixture.unknown-resource' }, code: 'unknown_kind', lookupCalls: 0 },
      { value: { ...envelope, identity: { resourceId: 'bad' } }, code: 'malformed_identity', lookupCalls: 0 },
      { value: { ...envelope, identity: { endpoint: 'http://169.254.169.254/latest' } }, code: 'malformed_identity', lookupCalls: 0 },
      { value: { ...envelope, authority: 'forged_instance_alpha' }, code: 'unknown_authority', lookupCalls: 1 },
      { value: { ...envelope, authority: 'http://169.254.169.254' }, code: 'invalid_envelope', lookupCalls: 0 },
      { value: { ...envelope, identity: { resourceId: 'x'.repeat(7_000) } }, code: 'malformed_identity', lookupCalls: 0 },
      { value: `res_${'r'.repeat(24)}`, code: 'invalid_envelope', lookupCalls: 0 },
      { value: `cap_${'c'.repeat(24)}`, code: 'invalid_envelope', lookupCalls: 0 }
    ]

    for (const testCase of invalidCases) {
      fixture.lookup.mockClear()
      vi.mocked(resolver.resolve).mockClear()
      await expect(fixture.service.materialize(testCase.value, caller)).rejects
        .toSatisfy((error) => expectPortableCode(error, testCase.code))
      expect(fixture.lookup).toHaveBeenCalledTimes(testCase.lookupCalls)
      expect(resolver.resolve).not.toHaveBeenCalled()
    }
  })

  it('exports only a live authorized provider projection and never raw resource state', async () => {
    const project = vi.fn(() => ({ stableId: 'logical-123' }))
    const fixture = serviceFixture({ resolver: fakeResolver({ project }) })
    const materialized = await fixture.service.materialize(envelope, caller)

    await expect(fixture.service.export(caller, {
      resourceRef: materialized.resourceRef,
      consumerId: 'fixture.denied-consumer'
    })).rejects.toSatisfy((error) => expectPortableCode(error, 'unauthorized_export'))
    expect(project).not.toHaveBeenCalled()

    const exported = await fixture.service.export(caller, {
      resourceRef: materialized.resourceRef,
      consumerId
    })
    expect(exported).toEqual(envelope)
    expect(JSON.stringify(exported)).not.toMatch(/provider-internal|privateTitle|endpoint|credential|connection|path|name|res_|cap_/iu)
    expect(project).toHaveBeenCalledTimes(1)
  })

  it('rejects projection leakage, wrong audience/scope/principal, restart, and cross-node handles', async () => {
    let current = principal
    const leaking = fakeResolver({ project: () => ({
      stableId: 'logical-123',
      endpoint: 'https://provider.invalid'
    }) })
    const fixture = serviceFixture({ resolver: leaking, currentPrincipal: () => current })
    const materialized = await fixture.service.materialize(envelope, caller)

    await expect(fixture.service.export({ ...caller, audience: 'agent' }, {
      resourceRef: materialized.resourceRef,
      consumerId
    })).rejects.toMatchObject({ code: 'resource_audience_denied' })
    await expect(fixture.service.export({ ...caller, workspaceId: 'workspace-other' }, {
      resourceRef: materialized.resourceRef,
      consumerId
    })).rejects.toMatchObject({ code: 'resource_scope_mismatch' })

    current = { ...principal, identityVersion: principal.identityVersion + 1 }
    await expect(fixture.service.export(caller, {
      resourceRef: materialized.resourceRef,
      consumerId
    })).rejects.toSatisfy((error) => expectPortableCode(error, 'unauthorized_export'))
    current = principal

    const restarted = serviceFixture()
    await expect(restarted.service.export(caller, {
      resourceRef: materialized.resourceRef,
      consumerId
    })).rejects.toMatchObject({ code: 'resource_unavailable' })
    await expect(restarted.broker.observe(caller, { resource: materialized.resource }))
      .rejects.toSatisfy((error) =>
        error instanceof CapabilityBrokerError && error.code === 'invalid_resource_handle'
      )

    const leakProject = vi.fn(() => ({
      stableId: 'logical-123',
      endpoint: 'https://provider.invalid'
    }))
    const leakCodec = {
      ...fakeCodec(),
      encodeIdentity: (identity: unknown) => {
        const value = identity as { resourceId: string; endpoint?: string }
        return {
          resourceId: value.resourceId,
          ...(value.endpoint ? { endpoint: value.endpoint } : {})
        }
      },
      projectExport: (projection: unknown) => {
        const value = projection as { stableId: string; endpoint: string }
        return { resourceId: value.stableId, endpoint: value.endpoint }
      }
    } as unknown as PortableResourceReferenceCodec
    const leakFixture = serviceFixture({
      codec: leakCodec,
      resolver: fakeResolver({ project: leakProject })
    })
    const leakResource = await leakFixture.service.materialize(envelope, caller)
    await expect(leakFixture.service.export(caller, {
      resourceRef: leakResource.resourceRef,
      consumerId
    })).rejects.toSatisfy((error) => expectPortableCode(error, 'invalid_export_projection'))
  })

  it('does not issue a Broker resource for missing principal or failed reauthorization', async () => {
    const noPrincipal = serviceFixture({ currentPrincipal: () => undefined })
    const issueWithoutPrincipal = vi.spyOn(noPrincipal.broker, 'issueResource')
    await expect(noPrincipal.service.materialize(envelope, caller)).rejects
      .toSatisfy((error) => expectPortableCode(error, 'principal_unavailable'))
    expect(issueWithoutPrincipal).not.toHaveBeenCalled()

    const rejected = serviceFixture({
      resolver: fakeResolver({ resolve: vi.fn(async () => { throw new Error('network denied') }) })
    })
    const issueRejected = vi.spyOn(rejected.broker, 'issueResource')
    await expect(rejected.service.materialize(envelope, caller)).rejects
      .toSatisfy((error) => expectPortableCode(error, 'resolution_rejected'))
    expect(issueRejected).not.toHaveBeenCalled()

    const invalidProjection = serviceFixture({
      resolver: fakeResolver({
        resolve: vi.fn(async () => ({
          registration: {
            resourceId: 'provider-internal-9',
            resourceKind,
            semanticRevision: 'revision-1',
            observe: async () => ({ state: {}, semanticRevision: 'revision-1' })
          },
          exportProjection: { consumerIds: [], project: () => ({ stableId: 'logical-123' }) }
        }))
      })
    })
    const issueInvalidProjection = vi.spyOn(invalidProjection.broker, 'issueResource')
    await expect(invalidProjection.service.materialize(envelope, caller)).rejects
      .toSatisfy((error) => expectPortableCode(error, 'invalid_resolution'))
    expect(issueInvalidProjection).not.toHaveBeenCalled()
  })
})

function contributionEntry(
  moduleId: string,
  contributionId: string,
  contributionKind: string,
  contract: DomainPackageJsonValue,
  value: unknown
): MainDomainModuleDefinition {
  const definition: TrustedDomainPackageDefinitionInput = {
    contractVersion: DOMAIN_PACKAGE_CONTRACT_VERSION,
    kind: 'trusted-compile-time',
    packageName: `@fixture/${moduleId.replaceAll('.', '-')}`,
    module: {
      id: moduleId,
      displayName: moduleId,
      version: '1.0.0',
      hostApi: { minimum: '1.0.0', maximumExclusive: '2.0.0' }
    },
    contributionContracts: { [contributionId]: contract },
    entrypoints: [{
      process: 'main',
      export: './main',
      contributions: [{ id: contributionId, kind: contributionKind }]
    }]
  }
  return {
    definition,
    contributions: [{ id: contributionId, kind: contributionKind, contract, value }]
  }
}
