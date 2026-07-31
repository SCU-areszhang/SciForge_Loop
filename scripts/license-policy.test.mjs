import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

import { checkRepository, evaluateInventory } from './license-policy-check.mjs'

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

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function createRepositoryFixture(fixture) {
  const repositoryRoot = mkdtempSync(resolve(tmpdir(), 'sciforge-license-policy-'))
  const policyDir = resolve(repositoryRoot, 'config/license-policy/v1')
  mkdirSync(policyDir, { recursive: true })

  const noticeExpected = fixture.noticeExpected
  const noticePath = 'THIRD_PARTY_NOTICES.md'
  writeFileSync(resolve(repositoryRoot, noticePath), fixture.noticeActual)
  writeJson(resolve(policyDir, 'policy.json'), {
    schemaVersion: 1,
    allowedLicenseExpressions: ['MIT'],
    deniedLicenseIdentifiers: ['GPL-3.0-only'],
    licenseAliases: {},
    noticeRequiredIdentifiers: ['MIT'],
    requiredRepositoryNotices: [
      {
        path: noticePath,
        minimumBytes: Buffer.byteLength(noticeExpected),
        sha256: createHash('sha256').update(noticeExpected).digest('hex')
      }
    ]
  })
  writeJson(resolve(policyDir, 'resolutions.json'), { schemaVersion: 1, resolutions: [] })
  writeJson(resolve(policyDir, 'exceptions.json'), { schemaVersion: 1, exceptions: [] })

  writeJson(resolve(repositoryRoot, 'package.json'), {
    name: 'fixture-root',
    version: '1.0.0',
    private: true,
    license: 'MIT'
  })
  const dependency = {
    version: '1.0.0',
    license: fixture.lockLicense,
    ...(fixture.optional === true ? { optional: true } : {}),
    ...(fixture.os ? { os: fixture.os } : {}),
    ...(fixture.cpu ? { cpu: fixture.cpu } : {})
  }
  writeJson(resolve(repositoryRoot, 'package-lock.json'), {
    name: 'fixture-root',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'fixture-root',
        version: '1.0.0',
        license: 'MIT'
      },
      'node_modules/fixture-dependency': dependency
    }
  })
  if (fixture.installed !== false) {
    const dependencyDir = resolve(repositoryRoot, 'node_modules/fixture-dependency')
    mkdirSync(dependencyDir, { recursive: true })
    writeJson(resolve(dependencyDir, 'package.json'), {
      name: 'fixture-dependency',
      version: '1.0.0',
      license: fixture.installedLicense
    })
  }
  return repositoryRoot
}

for (const fixture of fixtures.repositoryCases) {
  test(`license repository reconciliation fixture: ${fixture.name}`, () => {
    const repositoryRoot = createRepositoryFixture(fixture)
    try {
      const result = checkRepository({
        rootDir: repositoryRoot,
        platform: fixture.platform ?? 'linux',
        arch: fixture.arch ?? 'x64'
      })
      if (fixture.expectedCode === null) {
        assert.deepEqual(result.findings, [])
      } else {
        assert.ok(
          result.findings.some((finding) => finding.code === fixture.expectedCode),
          `${fixture.name} must produce ${fixture.expectedCode}; received ${JSON.stringify(result.findings)}`
        )
      }
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true })
    }
  })
}
