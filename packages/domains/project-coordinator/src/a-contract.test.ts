import assert from 'node:assert/strict'
import test from 'node:test'
import { A_CONTRACT_COMMIT, A_CONTRACT_TGZ_SHA256 } from './a-contract.js'

test('pins the A contract commit and release artifact SHA', () => {
  assert.equal(A_CONTRACT_COMMIT, 'e7829276e34422a95133a6e1c5a602d79c0d79ed')
  assert.equal(A_CONTRACT_TGZ_SHA256, '4a838d173637022bee7b53a1e3d9b2bdf4017ac741302d10d7b4771bde16b22c')
})
