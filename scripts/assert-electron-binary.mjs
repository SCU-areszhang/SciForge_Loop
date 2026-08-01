#!/usr/bin/env node

import { accessSync, constants, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const electronPackage = require('electron/package.json')
const electronPackageRoot = dirname(require.resolve('electron/package.json'))

accessSync(electronPath, constants.X_OK)
const installedVersion = readFileSync(
  resolve(electronPackageRoot, 'dist', 'version'),
  'utf8',
).trim()
if (installedVersion !== electronPackage.version) {
  throw new Error(`Electron binary ${installedVersion} does not match package ${electronPackage.version}`)
}

console.log(`Electron binary assertion passed: ${electronPackage.version} at ${electronPath}`)
