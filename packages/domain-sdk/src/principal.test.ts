import assert from 'node:assert/strict'
import test from 'node:test'

import {
  definePrincipalContextSnapshot,
  definePrincipalSnapshot,
  isDomainMainPrincipalProvider,
  principalSnapshotSchema
} from './principal.js'

const principal = {
  userId: 'c07f29ee-801d-4cf3-90ef-96c56c65de21',
  assurance: 'local-selection' as const,
  deviceId: 'sciforge-device',
  identityVersion: 7
}

test('Principal snapshots are strict and immutable', () => {
  const parsed = definePrincipalSnapshot(principal)
  assert.equal(Object.isFrozen(parsed), true)
  assert.throws(() => principalSnapshotSchema.parse({ ...principal, username: 'Alice' }))
  assert.throws(() => principalSnapshotSchema.parse({ ...principal, assurance: 'password' }))
})

test('Principal context snapshots require matching versions', () => {
  const parsed = definePrincipalContextSnapshot({ identityVersion: 7, principal })
  assert.equal(Object.isFrozen(parsed), true)
  assert.throws(() => definePrincipalContextSnapshot({
    identityVersion: 8,
    principal
  }))
})

test('Principal-provider guard accepts only the generic contract', () => {
  assert.equal(isDomainMainPrincipalProvider({
    current: () => principal,
    snapshot: () => ({ identityVersion: 7, principal }),
    subscribe: () => () => undefined
  }), true)
  assert.equal(isDomainMainPrincipalProvider({
    current: () => principal,
    snapshot: () => ({ identityVersion: 7, principal })
  }), false)
})
