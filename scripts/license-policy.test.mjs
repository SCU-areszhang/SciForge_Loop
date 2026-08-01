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

  const dependencies = fixture.dependencies
  const noticeExpected = fixture.noticeExpected
  const noticePath = 'THIRD_PARTY_NOTICES.md'
  const exceptionNotice = fixture.exceptionNotice ?? 'fixture dependency terms\n'
  const exceptions = fixture.sharedException === true
    ? [
        {
          id: 'shared-fixture-exception',
          packageNames: dependencies.map((dependency) => dependency.name),
          version: '1.0.0',
          declaredLicenseValues: ['SEE LICENSE IN LICENSE.md'],
          licenseReference: 'LicenseRef-Fixture-Terms',
          owner: 'integration-platform',
          evidenceUrl: 'https://example.com/license-evidence',
          reviewedOn: '2026-07-31',
          reviewAfter: '2026-10-31',
          expiresOn: '2027-01-31',
          mergeBlockOnExpiry: true,
          noticeFile: 'LICENSE.md',
          noticeSha256: createHash('sha256').update(exceptionNotice).digest('hex')
        }
      ]
    : []
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
  writeJson(resolve(policyDir, 'exceptions.json'), { schemaVersion: 1, exceptions })

  writeJson(resolve(repositoryRoot, 'package.json'), {
    name: 'fixture-root',
    version: '1.0.0',
    private: true,
    license: 'MIT'
  })
  const packageEntries = {
    '': {
      name: 'fixture-root',
      version: '1.0.0',
      license: 'MIT'
    }
  }
  for (const dependency of dependencies) {
    packageEntries[`node_modules/${dependency.name}`] = {
      version: dependency.lockVersion ?? '1.0.0',
      license: dependency.lockLicense,
      ...(dependency.optional === true ? { optional: true } : {}),
      ...(dependency.os ? { os: dependency.os } : {}),
      ...(dependency.cpu ? { cpu: dependency.cpu } : {})
    }
  }
  writeJson(resolve(repositoryRoot, 'package-lock.json'), {
    name: 'fixture-root',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: packageEntries
  })

  for (const dependency of dependencies) {
    if (dependency.installed === false) continue
    const dependencyDir = resolve(repositoryRoot, `node_modules/${dependency.name}`)
    mkdirSync(dependencyDir, { recursive: true })
    writeJson(resolve(dependencyDir, 'package.json'), {
      ...(dependency.installedName !== null
        ? { name: dependency.installedName ?? dependency.name }
        : {}),
      ...(dependency.installedVersion !== null
        ? { version: dependency.installedVersion ?? '1.0.0' }
        : {}),
      ...(dependency.installedLicense !== null
        ? { license: dependency.installedLicense ?? dependency.lockLicense }
        : {})
    })
    if (fixture.sharedException === true) {
      writeFileSync(resolve(dependencyDir, 'LICENSE.md'), exceptionNotice)
    }
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
      if (fixture.expectedCheckedPackages !== undefined) {
        assert.equal(result.checkedPackages, fixture.expectedCheckedPackages)
      }
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true })
    }
  })
}
