import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createDomainMainEntry } from './main.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('composes from the generic source host without a Dataset-specific host hook', () => {
  const host = {
    defineCapability: (definition: unknown) => definition,
    capabilities: {}
  }
  const entry = createDomainMainEntry(host as never)
  assert.equal(entry.definition.module.id, 'sciforge.dataset-api')
  assert.deepEqual(entry.contributions.map((contribution) => contribution.id), [
    'dataset-api.capabilities',
    'dataset-api.synthetic-generation-receipts',
    'dataset-api.create-loop-resource-executor'
  ])
  assert.equal('createDatasetApiServices' in host, false)
})

test('keeps packaged backend and renderer composition on one versioned package boundary', async () => {
  const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as {
    version: string
    files: string[]
    exports: Record<string, string>
  }
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'sciforge.domain.json'), 'utf8')) as {
    packageName: string
    module: { version: string }
    entrypoints: Array<{ process: string; export: string }>
  }
  assert.equal(packageJson.version, manifest.module.version)
  assert.deepEqual(manifest.entrypoints.map(({ process, export: exportPath }) => [process, exportPath]), [
    ['main', './main'],
    ['renderer', './renderer']
  ])
  assert.equal(packageJson.exports['./main'], './src/main.ts')
  assert.equal(packageJson.exports['./renderer'], './src/renderer/index.tsx')
  assert.equal(packageJson.exports['./service'], undefined)
  assert.ok(packageJson.files.includes('src'))
  assert.ok(Object.values(packageJson.exports).every((target) => !target.includes('/connectors/')))
  for (const target of Object.values(packageJson.exports)) {
    await access(resolve(packageRoot, target.replace(/^\.\//, '')))
  }
  await access(resolve(packageRoot, 'src/main/connectors/dataset-connectors.internal.ts'))
})
