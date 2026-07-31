#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const expectedNode = readFileSync(resolve(root, '.node-version'), 'utf8').trim()
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const packageManagerMatch = /^npm@(\d+\.\d+\.\d+)$/.exec(packageJson.packageManager ?? '')

if (!/^\d+\.\d+\.\d+$/.test(expectedNode)) {
  throw new Error(`.node-version must contain one exact semantic version; received ${JSON.stringify(expectedNode)}`)
}
if (!packageManagerMatch) {
  throw new Error(
    `package.json packageManager must pin one exact npm version; received ${JSON.stringify(packageJson.packageManager)}`
  )
}

const actualNode = process.version.replace(/^v/, '')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const actualNpm = execFileSync(npmCommand, ['--version'], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
}).trim()
const expectedNpm = packageManagerMatch[1]

const failures = []
if (actualNode !== expectedNode) failures.push(`Node ${actualNode} !== .node-version ${expectedNode}`)
if (actualNpm !== expectedNpm) failures.push(`npm ${actualNpm} !== packageManager npm@${expectedNpm}`)
if (failures.length > 0) {
  throw new Error(`Toolchain assertion failed:\n- ${failures.join('\n- ')}`)
}

console.log(
  `Toolchain assertion passed: .node-version=${expectedNode}, packageManager=npm@${expectedNpm}, ` +
    `node=${actualNode}, npm=${actualNpm}.`
)
