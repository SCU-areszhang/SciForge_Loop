#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const policyDir = resolve(root, 'config/license-policy/v1')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} has unknown or missing fields: expected ${wanted.join(', ')}, received ${actual.join(', ')}`)
  }
}

function isoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`)
  }
  return value
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function identifiers(expression) {
  return expression.match(/[A-Za-z0-9][A-Za-z0-9.+-]*/g) ?? []
}

function packageNameFromLockPath(lockPath, metadataPath) {
  if (metadataPath?.name) return metadataPath.name
  const marker = 'node_modules/'
  const index = lockPath.lastIndexOf(marker)
  if (index < 0) return basename(lockPath)
  return lockPath.slice(index + marker.length)
}

function loadPolicy() {
  const policy = readJson(resolve(policyDir, 'policy.json'))
  const resolutions = readJson(resolve(policyDir, 'resolutions.json'))
  const exceptions = readJson(resolve(policyDir, 'exceptions.json'))
  exactKeys(
    policy,
    [
      'schemaVersion',
      'allowedLicenseExpressions',
      'deniedLicenseIdentifiers',
      'licenseAliases',
      'noticeRequiredIdentifiers',
      'requiredRepositoryNoticeFiles'
    ],
    'license policy'
  )
  exactKeys(resolutions, ['schemaVersion', 'resolutions'], 'license resolutions')
  exactKeys(exceptions, ['schemaVersion', 'exceptions'], 'license exceptions')
  if (policy.schemaVersion !== 1 || resolutions.schemaVersion !== 1 || exceptions.schemaVersion !== 1) {
    throw new Error('All license policy inputs must use schemaVersion 1')
  }
  return { policy, resolutions: resolutions.resolutions, exceptions: exceptions.exceptions }
}

function validateSupportingRecords(records, now = new Date()) {
  const resolutionMap = new Map()
  for (const record of records.resolutions) {
    exactKeys(
      record,
      ['packageName', 'version', 'declaredLicenseValue', 'licenseExpression', 'evidenceFile', 'evidenceSha256'],
      'license resolution'
    )
    if (!/^[a-f0-9]{64}$/.test(record.evidenceSha256)) throw new Error('Resolution evidenceSha256 must be lowercase SHA-256')
    const key = `${record.packageName}@${record.version}`
    if (resolutionMap.has(key)) throw new Error(`Duplicate license resolution for ${key}`)
    resolutionMap.set(key, record)
  }

  const exceptionMap = new Map()
  for (const record of records.exceptions) {
    exactKeys(
      record,
      [
        'id',
        'packageNames',
        'version',
        'declaredLicenseValues',
        'licenseReference',
        'owner',
        'evidenceUrl',
        'reviewedOn',
        'reviewAfter',
        'expiresOn',
        'mergeBlockOnExpiry',
        'noticeFile',
        'noticeSha256'
      ],
      'manual license exception'
    )
    if (!record.id || !record.owner || !record.licenseReference.startsWith('LicenseRef-')) {
      throw new Error(`Manual exception ${record.id || '(missing id)'} lacks owner or LicenseRef`)
    }
    if (!Array.isArray(record.packageNames) || record.packageNames.length === 0) {
      throw new Error(`Manual exception ${record.id} must bind at least one exact package`)
    }
    if (!Array.isArray(record.declaredLicenseValues) || record.declaredLicenseValues.length === 0) {
      throw new Error(`Manual exception ${record.id} must bind declared license values`)
    }
    if (!/^https:\/\//.test(record.evidenceUrl)) throw new Error(`Manual exception ${record.id} needs HTTPS evidence`)
    if (!/^[a-f0-9]{64}$/.test(record.noticeSha256)) throw new Error(`Manual exception ${record.id} needs notice SHA-256`)
    const reviewedOn = isoDate(record.reviewedOn, `${record.id}.reviewedOn`)
    const reviewAfter = isoDate(record.reviewAfter, `${record.id}.reviewAfter`)
    const expiresOn = isoDate(record.expiresOn, `${record.id}.expiresOn`)
    if (!(reviewedOn <= reviewAfter && reviewAfter <= expiresOn)) {
      throw new Error(`Manual exception ${record.id} has invalid review/expiry ordering`)
    }
    if (record.mergeBlockOnExpiry !== true) {
      throw new Error(`Manual exception ${record.id} must explicitly block merge on expiry`)
    }
    const today = now.toISOString().slice(0, 10)
    if (today > expiresOn) throw new Error(`Manual exception ${record.id} expired on ${expiresOn}`)
    for (const packageName of record.packageNames) {
      const key = `${packageName}@${record.version}`
      if (exceptionMap.has(key)) throw new Error(`Duplicate manual exception for ${key}`)
      exceptionMap.set(key, record)
    }
  }
  return { resolutionMap, exceptionMap }
}

export function evaluateInventory({ packages, repositoryNoticeFiles, policy }) {
  const findings = []
  const allowed = new Set(policy.allowedLicenseExpressions)
  const denied = new Set(policy.deniedLicenseIdentifiers)
  const noticeIds = new Set(policy.noticeRequiredIdentifiers)
  const notices = new Set(repositoryNoticeFiles)

  for (const pkg of packages) {
    const label = `${pkg.name}@${pkg.version}`
    const expression = pkg.licenseExpression
    if (typeof expression !== 'string' || expression.trim() === '') {
      findings.push({ code: 'MISSING_LICENSE', package: label, message: `${label} has no license metadata or resolution` })
      continue
    }
    const normalized = policy.licenseAliases[expression] ?? expression
    const expressionIdentifiers = identifiers(normalized)
    if (!allowed.has(normalized)) {
      const deniedId = expressionIdentifiers.find((identifier) => denied.has(identifier))
      findings.push({
        code: deniedId ? 'DENIED_LICENSE' : 'UNKNOWN_LICENSE',
        package: label,
        message: deniedId
          ? `${label} uses denied license ${deniedId}`
          : `${label} uses unreviewed license expression ${normalized}`
      })
      continue
    }
    if (expressionIdentifiers.some((identifier) => noticeIds.has(identifier))) {
      for (const noticeFile of policy.requiredRepositoryNoticeFiles) {
        if (!notices.has(noticeFile)) {
          findings.push({
            code: 'MISSING_NOTICE',
            package: label,
            message: `${label} requires committed repository notice ${noticeFile}`
          })
        }
      }
    }
  }
  return findings
}

function installedMetadata(lockPath) {
  const path = resolve(root, lockPath, 'package.json')
  return existsSync(path) ? readJson(path) : null
}

function legacyLicense(metadata) {
  if (typeof metadata?.license === 'string') return metadata.license
  if (!Array.isArray(metadata?.licenses) || metadata.licenses.length !== 1) return null
  return typeof metadata.licenses[0] === 'string' ? metadata.licenses[0] : metadata.licenses[0]?.type ?? null
}

export function checkRepository({ now = new Date() } = {}) {
  const records = loadPolicy()
  const maps = validateSupportingRecords(records, now)
  const lock = readJson(resolve(root, 'package-lock.json'))
  if (lock.lockfileVersion !== 3 || typeof lock.packages !== 'object') {
    throw new Error('license policy requires canonical package-lock.json lockfileVersion 3 package metadata')
  }
  const repositoryNoticeFiles = records.policy.requiredRepositoryNoticeFiles.filter((file) => existsSync(resolve(root, file)))
  const packages = []
  const findings = []
  const usedResolutions = new Set()
  const usedExceptions = new Set()

  for (const [lockPath, lockEntry] of Object.entries(lock.packages)) {
    if (lockEntry.link === true) continue
    const metadata = lockPath === '' ? readJson(resolve(root, 'package.json')) : installedMetadata(lockPath)
    const name = packageNameFromLockPath(lockPath, metadata)
    const version = lockEntry.version ?? metadata?.version
    if (!name || !version) {
      findings.push({ code: 'MISSING_IDENTITY', package: lockPath || '(root)', message: 'Locked package lacks name/version' })
      continue
    }
    const key = `${name}@${version}`
    const rawLicense = lockEntry.license ?? legacyLicense(metadata)
    const resolution = maps.resolutionMap.get(key)
    let licenseExpression = rawLicense
    if (resolution && rawLicense === resolution.declaredLicenseValue) {
      usedResolutions.add(key)
      const evidencePath = resolve(root, lockPath, resolution.evidenceFile)
      if (!existsSync(evidencePath)) {
        findings.push({ code: 'MISSING_NOTICE', package: key, message: `${key} lacks resolution evidence file` })
        continue
      }
      if (sha256(evidencePath) !== resolution.evidenceSha256) {
        findings.push({ code: 'NOTICE_DRIFT', package: key, message: `${key} resolution evidence digest differs` })
        continue
      }
      licenseExpression = resolution.licenseExpression
    }
    const exception = maps.exceptionMap.get(key)
    if (!resolution && exception && exception.declaredLicenseValues.includes(rawLicense)) {
      usedExceptions.add(exception.id)
      if (metadata) {
        const noticePath = resolve(root, lockPath, exception.noticeFile)
        if (!existsSync(noticePath)) {
          findings.push({ code: 'MISSING_NOTICE', package: key, message: `${key} lacks ${exception.noticeFile}` })
        } else if (sha256(noticePath) !== exception.noticeSha256) {
          findings.push({ code: 'NOTICE_DRIFT', package: key, message: `${key} notice digest differs from exception evidence` })
        }
      }
      continue
    }
    if (!resolution && typeof rawLicense === 'string' && rawLicense.startsWith('SEE LICENSE IN')) {
      findings.push({ code: 'UNKNOWN_LICENSE', package: key, message: `${key} needs an exact reviewed manual exception` })
      continue
    }
    packages.push({ name, version, licenseExpression })
  }

  findings.push(...evaluateInventory({ packages, repositoryNoticeFiles, policy: records.policy }))
  for (const key of maps.resolutionMap.keys()) {
    if (!usedResolutions.has(key)) findings.push({ code: 'STALE_RESOLUTION', package: key, message: `${key} resolution is unused` })
  }
  for (const record of records.exceptions) {
    if (!usedExceptions.has(record.id)) {
      findings.push({ code: 'STALE_EXCEPTION', package: record.id, message: `${record.id} exception is unused` })
    }
  }
  return { checkedPackages: packages.length + usedExceptions.size, findings }
}

function main() {
  const result = checkRepository()
  if (result.findings.length > 0) {
    for (const finding of result.findings) console.error(`[${finding.code}] ${finding.message}`)
    console.error(`License policy failed: ${result.findings.length} finding(s).`)
    process.exitCode = 1
    return
  }
  console.log(`License policy passed: ${result.checkedPackages} locked package records checked fail-closed.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
