import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION,
  PORTABLE_RESOURCE_REFERENCE_MAX_COLLECTION_SIZE,
  PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES,
  PortableResourceReferenceError,
  canonicalPortableJson,
  parsePortableResourceReference,
  serializePortableResourceReference,
  validatePortableIdentity
} from './portable-resource-references.js'

const fixture = {
  contractVersion: PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION,
  kind: 'fixture.logical-resource',
  authority: 'provider_instance_alpha',
  identity: {
    resourceId: 'logical-123',
    coordinates: { shard: 2, stable: true }
  }
} as const

function expectCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof PortableResourceReferenceError && error.code === code
}

describe('portable resource reference contract', () => {
  it('canonically round trips the bounded identity without adding authority', () => {
    const serialized = serializePortableResourceReference(fixture)
    assert.equal(
      serialized,
      '{"authority":"provider_instance_alpha","contractVersion":1,"identity":{"coordinates":{"shard":2,"stable":true},"resourceId":"logical-123"},"kind":"fixture.logical-resource"}'
    )
    assert.deepEqual(parsePortableResourceReference(serialized), fixture)
    assert.equal(serializePortableResourceReference(JSON.parse(serialized)), serialized)
    assert.equal(Object.isFrozen(parsePortableResourceReference(serialized).identity), true)
  })

  it('rejects unsupported versions, malformed identities, and non-canonical JSON values', () => {
    assert.throws(
      () => parsePortableResourceReference({ ...fixture, contractVersion: 2 }),
      expectCode('unsupported_version')
    )
    for (const identity of [
      {},
      { fractional: 1.5 },
      { invalid: undefined },
      { recursive: null as unknown }
    ]) {
      if (identity.recursive === null) identity.recursive = identity
      assert.throws(
        () => parsePortableResourceReference({ ...fixture, identity }),
        expectCode('malformed_identity')
      )
    }
    assert.throws(() => canonicalPortableJson(new Date()), expectCode('malformed_identity'))
  })

  it('rejects runtime handles, local connection identity, endpoints, credentials, paths, and metadata', () => {
    const forbidden = [
      { resourceId: `res_${'a'.repeat(24)}` },
      { resourceId: `cap_${'b'.repeat(24)}` },
      { resourceId: 'connection_local_alpha' },
      { endpoint: 'safe-looking-id' },
      { resourceId: 'https://provider.invalid/resource' },
      { resourceId: '169.254.169.254' },
      { credential: 'opaque' },
      { providerDto: { resourceId: 'logical-123' } },
      { displayName: 'Private title' },
      { filePath: '/private/provider/path' }
    ]
    for (const identity of forbidden) {
      assert.throws(
        () => parsePortableResourceReference({ ...fixture, identity }),
        expectCode('malformed_identity')
      )
    }
    for (const authority of ['https://provider.invalid', '127.0.0.1', `res_${'x'.repeat(24)}`]) {
      assert.throws(
        () => parsePortableResourceReference({ ...fixture, authority }),
        expectCode('invalid_envelope')
      )
    }
  })

  it('fails closed on oversized strings, collections, depth, node count, and envelope bytes', () => {
    assert.throws(
      () => validatePortableIdentity({ resourceId: 'x'.repeat(1_025) }),
      expectCode('malformed_identity')
    )
    assert.throws(
      () => validatePortableIdentity({ ids: Array(PORTABLE_RESOURCE_REFERENCE_MAX_COLLECTION_SIZE + 1).fill('x') }),
      expectCode('malformed_identity')
    )
    let nested: unknown = 'leaf'
    for (let index = 0; index < 10; index += 1) nested = { child: nested }
    assert.throws(() => validatePortableIdentity(nested), expectCode('malformed_identity'))
    assert.throws(
      () => parsePortableResourceReference('x'.repeat(PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES + 1)),
      expectCode('envelope_too_large')
    )
  })

  it('rejects extra envelope fields and arbitrary URI-shaped input', () => {
    assert.throws(
      () => parsePortableResourceReference({ ...fixture, endpoint: 'provider_instance_alpha' }),
      expectCode('invalid_envelope')
    )
    for (const input of [
      `res_${'a'.repeat(24)}`,
      `cap_${'b'.repeat(24)}`,
      'https://provider.invalid/resource',
      '{not-json}'
    ]) {
      assert.throws(() => parsePortableResourceReference(input))
    }
  })
})
