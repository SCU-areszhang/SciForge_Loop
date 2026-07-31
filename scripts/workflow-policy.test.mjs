import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { checkWorkflowPolicy } from './workflow-policy-check.mjs'

const root = resolve(import.meta.dirname, '..')
const mergeWorkflow = readFileSync(resolve(root, '.github/workflows/merge-pr-ci.yml'), 'utf8')
const releaseWorkflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8')

test('accepts the committed blocking merge-PR and explicit Release boundaries', () => {
  assert.doesNotThrow(() => checkWorkflowPolicy({ mergeWorkflow, releaseWorkflow }))
})

test('rejects generation drift checks that ignore untracked generator output', () => {
  const withoutUntrackedGate = mergeWorkflow.replace(
    '          test -z "$(git ls-files --others --exclude-standard)"\n',
    ''
  )
  assert.throws(
    () => checkWorkflowPolicy({ mergeWorkflow: withoutUntrackedGate, releaseWorkflow }),
    /Missing CI gate: git ls-files --others --exclude-standard/
  )
})
