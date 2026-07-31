#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const mergeWorkflow = readFileSync(resolve(root, '.github/workflows/merge-pr-ci.yml'), 'utf8')
const releaseWorkflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8')

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message)
}

function forbidMatch(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message)
}

requireMatch(mergeWorkflow, /^name: Merge PR CI$/m, 'Ordinary CI must retain the stable "Merge PR CI" workflow name.')
requireMatch(mergeWorkflow, /^ {4}name: Verify$/m, 'Ordinary CI must retain the stable blocking "Verify" job name.')
requireMatch(mergeWorkflow, /^ {2}pull_request:\n {4}branches:\n(?: {6}- .+\n)+/m, 'Ordinary CI must target pull requests.')
requireMatch(mergeWorkflow, /^ {2}push:\n {4}branches:\n(?: {6}- .+\n)+/m, 'Ordinary CI must target protected/shared branch pushes.')
for (const branch of ['stage1/integration', 'gui', 'develop', 'master']) {
  requireMatch(mergeWorkflow, new RegExp(`^      - ${branch.replace('/', '\\/')}$`, 'm'), `Missing CI branch ${branch}.`)
}
forbidMatch(
  mergeWorkflow,
  /workflow_run:|workflow_call:|repository_dispatch:|\.github\/workflows\/release\.yml|gh workflow run|gh release|\bnpm run (?:dist|release:)/,
  'Ordinary CI must not invoke, dispatch, reuse, or publish through the Release workflow.'
)
forbidMatch(mergeWorkflow, /continue-on-error:\s*true/, 'Ordinary CI gates must remain blocking.')

const toolchainIndex = mergeWorkflow.indexOf('run: node ./scripts/assert-toolchain.mjs')
requireMatch(mergeWorkflow, /^ {8}run: npm ci$/m, 'Dependency installation must use an unmodified ordinary npm ci.')
forbidMatch(mergeWorkflow, /^[ \t]*run: npm ci[ \t]+\S+/m, 'Dependency installation must not add npm ci bypass flags.')
const installIndex = mergeWorkflow.indexOf('run: npm ci')
if (toolchainIndex < 0 || installIndex < 0 || toolchainIndex > installIndex) {
  throw new Error('The exact toolchain assertion must run before npm ci.')
}
const electronIndex = mergeWorkflow.indexOf('npm run electron:binary:assert')
const testIndex = mergeWorkflow.indexOf('npm run test')
if (electronIndex < installIndex || testIndex < electronIndex) {
  throw new Error('Electron binary availability must be asserted after npm ci and before the parallel test suite.')
}
for (const command of [
  'npm run electron:binary:assert',
  'npm run ci:workflow-policy-check',
  'npm run license:policy-check',
  'npm run domain-packages:generate',
  'npm run capability:generate',
  'git diff --exit-code',
  'npm run domain-packages:check',
  'npm run capability:check',
  'npm run lint',
  'npm run typecheck',
  'npm run test',
  'npm run build'
]) {
  requireMatch(mergeWorkflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Missing CI gate: ${command}`)
}

requireMatch(releaseWorkflow, /^name: Release$/m, 'Release must remain an explicitly named workflow.')
requireMatch(releaseWorkflow, /^ {2}workflow_dispatch:/m, 'Release must retain an explicit manual dispatch boundary.')
requireMatch(releaseWorkflow, /^ {2}pull_request:\n {4}types:\n {6}- closed\n {4}branches:\n {6}- master$/m, 'Release may only observe closed pull requests targeting master.')
requireMatch(
  releaseWorkflow,
  /github\.event\.pull_request\.merged == true[\s\S]*github\.event\.pull_request\.base\.ref == 'master'[\s\S]*github\.event\.pull_request\.head\.ref == 'develop'[\s\S]*github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
  'Automatic Release must remain restricted to a merged in-repository develop-to-master pull request.'
)
forbidMatch(
  releaseWorkflow,
  /^ {2}(?:push|workflow_run|workflow_call|repository_dispatch):/m,
  'Release must not become an ordinary push, reusable, chained, or repository-dispatch workflow.'
)

console.log('Workflow policy passed: ordinary merge PR CI is blocking and the explicit Release boundary is isolated.')
