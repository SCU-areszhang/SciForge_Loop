import assert from 'node:assert/strict'
import test from 'node:test'
import { assertAResourceRefId, assertCloudSafeText } from './cloud-safety.js'

test('keeps A ResourceRef IDs distinct from E and local resource identities', () => {
  assert.doesNotThrow(() => assertAResourceRefId('rrf_Resource000001'))
  assert.throws(() => assertAResourceRefId('res_Resource000001'), /Only A ResourceRef IDs/u)
  assert.throws(() => assertAResourceRefId('local-resource-handle'), /Only A ResourceRef IDs/u)
})

test('rejects credentials, local paths, and ResourceRef IDs in A text fields', () => {
  assert.throws(() => assertCloudSafeText('token=secret-value'), /Cloud text contains/u)
  assert.throws(() => assertCloudSafeText('See /Users/example/result.csv'), /Cloud text contains/u)
  assert.throws(() => assertCloudSafeText('Result rrf_Resource000001'), /Cloud text contains/u)
})
