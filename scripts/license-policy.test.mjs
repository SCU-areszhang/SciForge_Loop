import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { evaluateInventory } from './license-policy-check.mjs'

const root = resolve(import.meta.dirname, '..')
const policy = JSON.parse(readFileSync(resolve(root, 'config/license-policy/v1/policy.json'), 'utf8'))
const fixtures = JSON.parse(readFileSync(resolve(root, 'test/fixtures/license-policy/cases.json'), 'utf8'))

for (const fixture of fixtures.cases) {
  test(`license policy fixture: ${fixture.name}`, () => {
    const findings = evaluateInventory({
      packages: fixture.packages,
      repositoryNoticeFiles: fixture.repositoryNoticeFiles,
      policy
    })
    if (fixture.expected === 'pass') {
      assert.deepEqual(findings, [])
    } else {
      assert.ok(findings.length > 0, `${fixture.name} must fail closed`)
      assert.equal(findings[0].code, fixture.expectedCode)
    }
  })
}
