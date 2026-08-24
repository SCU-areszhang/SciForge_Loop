#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants as fsConstants, createWriteStream } from 'node:fs'
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_OUTPUT_PATHS = Object.freeze([
  'out/main/index.js',
  'out/main/codex-pre-tool-use-governance-node-entry.js',
  'out/preload/index.cjs',
  'out/renderer/index.html'
])
const GENERATED_COMPOSITION_PATHS = new Set([
  'src/shared/installed-domain-packages.ts',
  'src/main/modules/installed-domain-main.ts',
  'src/main/modules/installed-main-source-packages.ts',
  'src/main/modules/installed-domain-runtime-mcp.ts',
  'src/renderer/src/domain-modules/installed-domain-renderer.ts'
])
const HOST_SOURCE_ROOTS = Object.freeze(['src/main', 'src/renderer/src', 'src/shared'])
const SOURCE_EXTENSION_PATTERN = /\.(?:[cm]?[jt]s|[jt]sx)$/u
const SMOKE_COMPOSITION_FIELDS = Object.freeze([
  'version',
  'readiness',
  'capabilityCount',
  'identityActionId',
  'contentSpaceProviderActionId',
  'contentSpaceProviderInstanceCount',
  'datasetLoopCreated',
  'datasetLoopWorkflowCount',
  'paperRadarActionId',
  'workspacePreviewActionId',
  'previewPluginCount',
  'workspacePreviewPluginId',
  'workspacePreviewReleased',
  'artifactVersionsActionId',
  'evidenceDagActionId',
  'scientificPlottingActionId',
  'visualReviewActionId',
  'workspaceEditPersisted',
  'paperRadarProfilePersisted'
])

function gateCheck(id, status, detail) {
  return Object.freeze({ id, status, ...(detail ? { detail } : {}) })
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function defaultRunProcess({ command, args, cwd }) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024
    })
    return { status: 0, stdout, stderr }
  } catch (error) {
    return {
      status: Number.isInteger(error?.code) ? error.code : 1,
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : String(error?.message ?? error)
    }
  }
}

async function defaultResolveSourceCommit(repositoryRoot) {
  const result = await defaultRunProcess({
    command: 'git',
    args: ['rev-parse', '--verify', 'HEAD^{commit}'],
    cwd: repositoryRoot
  })
  const commit = result.stdout.trim()
  if (result.status !== 0 || !/^[a-f0-9]{40,64}$/u.test(commit)) {
    throw new Error('Unable to resolve the repository source commit.')
  }
  return commit
}

async function defaultReadRepositoryStatus(repositoryRoot) {
  const result = await defaultRunProcess({
    command: 'git',
    args: ['status', '--porcelain=v1', '--untracked-files=all'],
    cwd: repositoryRoot
  })
  if (result.status !== 0) throw new Error('Unable to inspect the repository worktree status.')
  return result.stdout
}

function commandCheck(id, result) {
  return result.status === 0
    ? gateCheck(id, 'passed')
    : gateCheck(id, 'failed', `canonical_check_exit_${result.status}`)
}

function repositoryRelative(repositoryRoot, path) {
  return relative(repositoryRoot, path).split('\\').join('/')
}

function isProductionSource(relativePath) {
  return SOURCE_EXTENSION_PATTERN.test(relativePath) &&
    !/(?:^|\/)(?:__tests__|fixtures|test-fixtures)(?:\/|$)/u.test(relativePath) &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(relativePath) &&
    !relativePath.endsWith('.d.ts') &&
    !GENERATED_COMPOSITION_PATHS.has(relativePath)
}

async function walkProductionSource(repositoryRoot, entryRelativePath) {
  const entryPath = resolve(repositoryRoot, entryRelativePath)
  if (!await pathExists(entryPath)) return []
  const files = []
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'dist', 'out', 'coverage'].includes(entry.name)) continue
      const child = resolve(directory, entry.name)
      if (entry.isDirectory()) await visit(child)
      else if (entry.isFile()) {
        const relativePath = repositoryRelative(repositoryRoot, child)
        if (isProductionSource(relativePath)) files.push(child)
      }
    }
  }
  await visit(entryPath)
  return files.sort()
}

async function readDomainIdentifierInventory(repositoryRoot) {
  const domainsRoot = resolve(repositoryRoot, 'packages/domains')
  if (!await pathExists(domainsRoot)) return new Set()
  const identifiers = new Set(['run0', 'run-0', 'showcase'])
  for (const entry of await readdir(domainsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestPath = resolve(domainsRoot, entry.name, 'sciforge.domain.json')
    if (!await pathExists(manifestPath)) continue
    let manifest
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch {
      continue
    }
    if (typeof manifest.packageName === 'string') identifiers.add(manifest.packageName)
    if (typeof manifest.module?.id === 'string') identifiers.add(manifest.module.id)
    for (const entrypoint of Array.isArray(manifest.entrypoints) ? manifest.entrypoints : []) {
      for (const contribution of Array.isArray(entrypoint?.contributions) ? entrypoint.contributions : []) {
        if (typeof contribution?.id === 'string') identifiers.add(contribution.id)
      }
    }
  }
  const ignoredProviderTokens = new Set([
    'sciforge', 'domain', 'collaboration', 'content', 'space', 'provider', 'connector'
  ])
  const scanWorkspacePackages = async (directory, depth) => {
    if (depth < 0 || !await pathExists(directory)) return
    const packagePath = resolve(directory, 'package.json')
    if (await pathExists(packagePath)) {
      try {
        const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
        const name = typeof packageJson.name === 'string' ? packageJson.name : ''
        if (/(?:provider|connector)/iu.test(name)) {
          identifiers.add(name)
          for (const token of name.replace(/^@[^/]+\//u, '').split(/[-_.]+/u)) {
            if (token.length >= 4 && !ignoredProviderTokens.has(token)) identifiers.add(token)
          }
        }
      } catch {
        // The canonical package checker owns malformed package metadata.
      }
    }
    if (depth === 0) return
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') ||
        ['node_modules', 'dist', 'out', 'artifacts'].includes(entry.name)) continue
      await scanWorkspacePackages(resolve(directory, entry.name), depth - 1)
    }
  }
  await scanWorkspacePackages(resolve(repositoryRoot, 'packages'), 2)
  return identifiers
}

async function auditDomainPackageOwnership(repositoryRoot) {
  const domainsRoot = resolve(repositoryRoot, 'packages/domains')
  if (!await pathExists(domainsRoot)) {
    return [{ rule: 'domain-package-root-missing', file: 'packages/domains', line: 1 }]
  }
  const findings = []
  const packageNames = new Map()
  const moduleIds = new Map()
  const contributionRegistrations = new Map()
  for (const entry of (await readdir(domainsRoot, { withFileTypes: true }))
    .filter((candidate) => candidate.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const packageRoot = resolve(domainsRoot, entry.name)
    const manifestPath = resolve(packageRoot, 'sciforge.domain.json')
    const packagePath = resolve(packageRoot, 'package.json')
    const manifestFile = repositoryRelative(repositoryRoot, manifestPath)
    let manifest
    let packageJson
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
    } catch {
      findings.push({ rule: 'domain-package-metadata-invalid', file: manifestFile, line: 1 })
      continue
    }
    if (manifest.packageName !== packageJson.name) {
      findings.push({ rule: 'domain-package-name-mismatch', file: manifestFile, line: 1 })
    }
    if (manifest.module?.version !== packageJson.version) {
      findings.push({ rule: 'domain-package-version-mismatch', file: manifestFile, line: 1 })
    }
    const exportsMap = packageJson.exports && typeof packageJson.exports === 'object' &&
      !Array.isArray(packageJson.exports) ? packageJson.exports : {}
    if (Object.hasOwn(exportsMap, '.')) {
      findings.push({ rule: 'domain-ambiguous-root-export', file: manifestFile, line: 1 })
    }
    if (typeof manifest.packageName === 'string') {
      if (packageNames.has(manifest.packageName)) {
        findings.push({ rule: 'duplicate-domain-package-name', file: manifestFile, line: 1 })
      } else {
        packageNames.set(manifest.packageName, manifestFile)
      }
    }
    if (typeof manifest.module?.id === 'string') {
      if (moduleIds.has(manifest.module.id)) {
        findings.push({ rule: 'duplicate-domain-module-id', file: manifestFile, line: 1 })
      } else {
        moduleIds.set(manifest.module.id, manifestFile)
      }
    }
    const processNames = new Set()
    for (const entrypoint of Array.isArray(manifest.entrypoints) ? manifest.entrypoints : []) {
      const processName = entrypoint?.process
      if (typeof processName !== 'string') continue
      if (processNames.has(processName)) {
        findings.push({ rule: 'duplicate-domain-process-entrypoint', file: manifestFile, line: 1 })
      }
      processNames.add(processName)
      if (!['main', 'renderer', 'workspace-server'].includes(processName)) continue
      const exportName = `./${processName}`
      const target = exportsMap[exportName]
      if (entrypoint.export !== exportName || typeof target !== 'string' || !target.startsWith('./')) {
        findings.push({ rule: 'domain-process-export-mismatch', file: manifestFile, line: 1 })
        continue
      }
      if (!isWithin(packageRoot, resolve(packageRoot, target))) {
        findings.push({ rule: 'domain-process-export-escape', file: manifestFile, line: 1 })
      }
      for (const [candidateExport, candidateTarget] of Object.entries(exportsMap)) {
        if (candidateExport !== exportName && candidateTarget === target) {
          findings.push({ rule: 'domain-process-export-alias', file: manifestFile, line: 1 })
        }
      }
      const localContributions = new Set()
      for (const contribution of Array.isArray(entrypoint.contributions) ? entrypoint.contributions : []) {
        if (typeof contribution?.id !== 'string' || typeof contribution?.kind !== 'string') continue
        const key = `${processName}\0${contribution.kind}\0${contribution.id}`
        if (localContributions.has(key) || contributionRegistrations.has(key)) {
          findings.push({
            rule: 'duplicate-domain-contribution-registration',
            file: manifestFile,
            line: 1
          })
          continue
        }
        localContributions.add(key)
        contributionRegistrations.set(key, manifestFile)
      }
    }
  }
  return findings
}

function lineAt(source, index) {
  let line = 1
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source.charCodeAt(cursor) === 10) line += 1
  }
  return line
}

function literalContainsIdentifier(literal, identifiers) {
  const normalized = literal.toLowerCase()
  for (const identifier of identifiers) {
    const token = identifier.toLowerCase()
    let offset = normalized.indexOf(token)
    while (offset >= 0) {
      const left = offset === 0 ? '' : normalized[offset - 1]
      const rightIndex = offset + token.length
      const right = rightIndex === normalized.length ? '' : normalized[rightIndex]
      const leftBounded = !left || !/[a-z0-9]/u.test(left) || !/[a-z0-9]/u.test(token[0])
      const rightBounded = !right || !/[a-z0-9]/u.test(right) ||
        !/[a-z0-9]/u.test(token[token.length - 1])
      if (leftBounded && rightBounded) return true
      offset = normalized.indexOf(token, offset + 1)
    }
  }
  return false
}

function importSpecifiers(source) {
  const matches = []
  const patterns = [
    /\bfrom\s*(['"])([^'"\n]+)\1/gu,
    /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/gu,
    /\bimport\s+(['"])([^'"\n]+)\1/gu,
    /\brequire\s*\(\s*(['"])([^'"\n]+)\1\s*\)/gu
  ]
  for (const pattern of patterns) {
    for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
      const literalOffset = match[0].indexOf(match[1] + match[2] + match[1])
      matches.push({
        start: match.index + literalOffset,
        end: match.index + literalOffset + match[2].length + 2,
        specifier: match[2]
      })
    }
  }
  return matches
}

async function scanHostArchitecture(repositoryRoot) {
  const identifiers = await readDomainIdentifierInventory(repositoryRoot)
  const files = (await Promise.all(
    HOST_SOURCE_ROOTS.map((root) => walkProductionSource(repositoryRoot, root))
  )).flat().sort()
  const findings = []
  for (const filePath of files) {
    const file = repositoryRelative(repositoryRoot, filePath)
    const source = await readFile(filePath, 'utf8')
    const imports = importSpecifiers(source)
    for (const imported of imports) {
      if (
        (imported.specifier.startsWith('@sciforge/domain-') &&
          !imported.specifier.startsWith('@sciforge/domain-sdk')) ||
        /(?:^|\/)packages\/domains(?:\/|$)/u.test(imported.specifier)
      ) {
        findings.push({
          rule: 'host-domain-implementation-import',
          file,
          line: lineAt(source, imported.start)
        })
      }
    }
    const stringPattern = /(['"`])([^'"`\n]{1,512})\1/gu
    for (let match = stringPattern.exec(source); match; match = stringPattern.exec(source)) {
      if (!literalContainsIdentifier(match[2], identifiers)) continue
      if (imports.some(({ start, end }) => match.index >= start && match.index < end)) continue
      findings.push({
        rule: 'host-domain-identifier-hardcode',
        file,
        line: lineAt(source, match.index)
      })
    }
  }
  return findings.sort((left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line || left.rule.localeCompare(right.rule)
  )
}

function isWithin(root, candidate) {
  const relation = relative(root, candidate)
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))
}

function smokeCompositionProjection(value, expectedMode) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.mode !== expectedMode) {
    throw new Error('smoke_result_invalid')
  }
  const projection = {}
  for (const field of SMOKE_COMPOSITION_FIELDS) {
    if (value[field] === undefined) throw new Error('smoke_result_incomplete')
    projection[field] = value[field]
  }
  return Object.freeze(projection)
}

function parseSmokeOutput(result, expectedMode) {
  if (result.status !== 0) throw new Error(`smoke_exit_${result.status}`)
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    throw new Error('smoke_output_invalid_json')
  }
  return smokeCompositionProjection(parsed, expectedMode)
}

function compositionFingerprint(projection) {
  return `sha256:${createHash('sha256').update(JSON.stringify(projection)).digest('hex')}`
}

async function defaultVerifyArtifactReceipt({
  repositoryRoot,
  artifactReceiptPath,
  packedArtifactPath,
  expectedSourceCommit
}) {
  const receiptPath = resolve(artifactReceiptPath)
  const artifactPath = resolve(packedArtifactPath)
  const distDirectory = dirname(receiptPath)
  if (!isWithin(distDirectory, artifactPath)) {
    throw new Error('packaged_evidence_must_share_dist_root')
  }
  const receiptMetadata = await stat(receiptPath)
  if (!receiptMetadata.isFile() || receiptMetadata.size > 1024 * 1024) {
    throw new Error('artifact_receipt_invalid')
  }
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
  const modulePath = resolve(repositoryRoot, 'scripts/public-release-artifact-receipt.cjs')
  const verifier = require(modulePath)
  if (resolve(verifier.publicReleaseArtifactReceiptPath(distDirectory, receipt.platform)) !== receiptPath) {
    throw new Error('artifact_receipt_path_is_not_canonical')
  }
  const handle = verifier.verifyPublicReleaseArtifactReceipt({
    distDir: distDirectory,
    platform: receipt.platform,
    tag: receipt.tag,
    channel: receipt.channel,
    sourceCommit: expectedSourceCommit
  })
  const artifact = handle.receipt.files.find((entry) =>
    resolve(distDirectory, entry.fileName) === artifactPath
  )
  if (!artifact || handle.receipt.sourceCommit !== expectedSourceCommit) {
    handle.close()
    throw new Error('artifact_not_bound_to_source_commit')
  }
  return Object.freeze({
    sourceCommit: handle.receipt.sourceCommit,
    artifact: Object.freeze({
      fileName: artifact.fileName,
      sha256: artifact.sha256,
      size: artifact.size
    }),
    receiptSha256: handle.sha256,
    assertUnchanged: handle.assertUnchanged,
    openReadStream: handle.openReadStream,
    close: handle.close
  })
}

function normalizeExecutableLocator(value) {
  if (
    typeof value !== 'string' || value.length === 0 || value.length > 512 ||
    value !== value.trim() || value.includes('\\') || value.includes('\0') ||
    value.startsWith('/') || /^[A-Za-z]:\//u.test(value)
  ) {
    throw new Error('packaged_executable_locator_invalid')
  }
  const segments = value.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('packaged_executable_locator_invalid')
  }
  return posix.normalize(value)
}

function validateArchiveEntryPath(value) {
  const withoutTrailingSlash = value.endsWith('/') ? value.slice(0, -1) : value
  if (!withoutTrailingSlash) return
  normalizeExecutableLocator(withoutTrailingSlash)
}

async function copyVerifiedArtifact(artifactHandle, targetPath) {
  const source = artifactHandle.openReadStream(artifactHandle.artifact.fileName)
  await pipeline(source, createWriteStream(targetPath, { flags: 'wx', mode: 0o600 }))
}

async function validateExtractedTree(root) {
  const canonicalRoot = await realpath(root)
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      const metadata = await lstat(path)
      if (!metadata.isDirectory() && !metadata.isFile() && !metadata.isSymbolicLink()) {
        throw new Error('packaged_archive_special_file_rejected')
      }
      const canonical = await realpath(path)
      if (!isWithin(canonicalRoot, canonical)) throw new Error('packaged_archive_symlink_escape')
      if (metadata.isDirectory()) await visit(path)
    }
  }
  await visit(root)
}

async function hashOpenFile(fileHandle, size) {
  const digest = createHash('sha256')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  let offset = 0
  while (offset < size) {
    const { bytesRead } = await fileHandle.read(
      buffer,
      0,
      Math.min(buffer.length, size - offset),
      offset
    )
    if (bytesRead === 0) throw new Error('packaged_executable_truncated')
    digest.update(buffer.subarray(0, bytesRead))
    offset += bytesRead
  }
  return digest.digest('hex')
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeMs === right.mtimeMs
}

async function openStableExecutable(path, temporaryRoot, executableLocator) {
  const metadata = await lstat(path)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error('packaged_executable_must_be_regular_file')
  }
  const canonicalRoot = await realpath(temporaryRoot)
  const canonicalPath = await realpath(path)
  if (!isWithin(canonicalRoot, canonicalPath)) throw new Error('packaged_executable_escape')
  const fileHandle = await open(
    path,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
  )
  try {
    const descriptorIdentity = await fileHandle.stat()
    const pathIdentity = await lstat(path)
    if (!sameFileIdentity(descriptorIdentity, pathIdentity)) {
      throw new Error('packaged_executable_path_race')
    }
    const sha256 = await hashOpenFile(fileHandle, descriptorIdentity.size)
    let closed = false
    return Object.freeze({
      executablePath: path,
      executableLocator,
      sha256,
      size: descriptorIdentity.size,
      assertUnchanged: async () => {
        if (closed) throw new Error('packaged_executable_handle_closed')
        const [currentDescriptor, currentPath, currentCanonicalPath] = await Promise.all([
          fileHandle.stat(),
          lstat(path),
          realpath(path)
        ])
        if (
          currentPath.isSymbolicLink() || !currentPath.isFile() ||
          currentCanonicalPath !== canonicalPath ||
          !sameFileIdentity(currentDescriptor, descriptorIdentity) ||
          !sameFileIdentity(currentPath, descriptorIdentity) ||
          await hashOpenFile(fileHandle, currentDescriptor.size) !== sha256
        ) {
          throw new Error('packaged_executable_changed')
        }
      },
      closeFile: async () => {
        if (closed) return
        closed = true
        await fileHandle.close()
      }
    })
  } catch (error) {
    await fileHandle.close()
    throw error
  }
}

async function defaultPrepareSealedPackagedApplication({
  artifactHandle,
  executableLocator,
  runProcess
}) {
  const locator = normalizeExecutableLocator(executableLocator)
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'sciforge-architecture-gate-packaged-'))
  await chmod(temporaryRoot, 0o700)
  let stableExecutable
  try {
    const sealedCopyPath = resolve(temporaryRoot, basename(artifactHandle.artifact.fileName))
    await copyVerifiedArtifact(artifactHandle, sealedCopyPath)
    let executablePath
    const extension = extname(artifactHandle.artifact.fileName).toLowerCase()
    if (extension === '.zip') {
      const listing = await runProcess({
        command: 'unzip',
        args: ['-Z1', sealedCopyPath],
        cwd: temporaryRoot
      })
      if (listing.status !== 0) throw new Error('packaged_archive_listing_failed')
      const entries = listing.stdout.split(/\r?\n/u).filter(Boolean)
      for (const entry of entries) validateArchiveEntryPath(entry)
      if (!entries.includes(locator)) throw new Error('packaged_executable_locator_missing')
      const extractedRoot = resolve(temporaryRoot, 'application')
      await mkdir(extractedRoot, { mode: 0o700 })
      const extraction = await runProcess({
        command: process.platform === 'darwin' ? '/usr/bin/ditto' : 'unzip',
        args: process.platform === 'darwin'
          ? ['-x', '-k', sealedCopyPath, extractedRoot]
          : ['-q', sealedCopyPath, '-d', extractedRoot],
        cwd: temporaryRoot
      })
      if (extraction.status !== 0) throw new Error('packaged_archive_extraction_failed')
      await validateExtractedTree(extractedRoot)
      executablePath = resolve(extractedRoot, ...locator.split('/'))
    } else if (extension === '.appimage') {
      if (locator !== basename(artifactHandle.artifact.fileName)) {
        throw new Error('packaged_executable_locator_missing')
      }
      await chmod(sealedCopyPath, 0o700)
      executablePath = sealedCopyPath
    } else {
      throw new Error('sealed_artifact_format_unsupported')
    }
    stableExecutable = await openStableExecutable(executablePath, temporaryRoot, locator)
    return Object.freeze({
      executablePath: stableExecutable.executablePath,
      executableLocator: stableExecutable.executableLocator,
      sha256: stableExecutable.sha256,
      size: stableExecutable.size,
      assertUnchanged: stableExecutable.assertUnchanged,
      close: async () => {
        await stableExecutable.closeFile()
        await rm(temporaryRoot, { recursive: true, force: true })
      }
    })
  } catch (error) {
    await stableExecutable?.closeFile?.().catch(() => undefined)
    await rm(temporaryRoot, { recursive: true, force: true })
    throw error
  }
}

export async function runRepositoryArchitecturePrinciplesGate(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const dependencies = {
    runProcess: defaultRunProcess,
    resolveSourceCommit: defaultResolveSourceCommit,
    readRepositoryStatus: defaultReadRepositoryStatus,
    verifyArtifactReceipt: defaultVerifyArtifactReceipt,
    prepareSealedPackagedApplication: defaultPrepareSealedPackagedApplication,
    ...options.dependencies
  }
  const checks = []

  let sourceCommit = null
  try {
    sourceCommit = await dependencies.resolveSourceCommit(repositoryRoot)
    checks.push(gateCheck('repository-source-commit', 'passed'))
  } catch {
    checks.push(gateCheck('repository-source-commit', 'failed', 'source_commit_unavailable'))
  }

  let repositoryClean = false
  try {
    const status = await dependencies.readRepositoryStatus(repositoryRoot)
    repositoryClean = status.trim().length === 0
    checks.push(repositoryClean
      ? gateCheck('repository-clean', 'passed')
      : gateCheck('repository-clean', 'failed', 'worktree_has_uncommitted_changes'))
  } catch {
    checks.push(gateCheck('repository-clean', 'failed', 'worktree_status_unavailable'))
  }

  const domainPackages = await dependencies.runProcess({
    command: process.execPath,
    args: [resolve(repositoryRoot, 'scripts/domain-packages.mjs'), '--check'],
    cwd: repositoryRoot
  })
  const generatedCompositionCheck = commandCheck('generated-composition', domainPackages)
  checks.push(generatedCompositionCheck)

  const governance = await dependencies.runProcess({
    command: process.execPath,
    args: [
      '--import',
      'tsx',
      resolve(repositoryRoot, 'scripts/capability-governance.mjs'),
      '--check'
    ],
    cwd: repositoryRoot
  })
  const capabilityGovernanceCheck = commandCheck('capability-governance', governance)
  checks.push(capabilityGovernanceCheck)

  let findings = []
  try {
    const [hostFindings, ownershipFindings] = await Promise.all([
      scanHostArchitecture(repositoryRoot),
      auditDomainPackageOwnership(repositoryRoot)
    ])
    findings = [...hostFindings, ...ownershipFindings].sort((left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line || left.rule.localeCompare(right.rule)
    )
    const importCount = findings.filter((finding) =>
      finding.rule === 'host-domain-implementation-import'
    ).length
    const hardcodeCount = findings.filter((finding) =>
      finding.rule === 'host-domain-identifier-hardcode'
    ).length
    checks.push(importCount === 0
      ? gateCheck('host-generic-sdk-boundary', 'passed')
      : gateCheck('host-generic-sdk-boundary', 'failed', `finding_count_${importCount}`))
    checks.push(hardcodeCount === 0
      ? gateCheck('host-identifier-hardcode', 'passed')
      : gateCheck('host-identifier-hardcode', 'failed', `finding_count_${hardcodeCount}`))
    const ownershipCount = findings.filter((finding) => [
      'domain-package-root-missing',
      'domain-package-metadata-invalid',
      'domain-package-name-mismatch',
      'domain-package-version-mismatch',
      'duplicate-domain-package-name',
      'duplicate-domain-module-id',
      'duplicate-domain-process-entrypoint',
      'domain-process-export-mismatch',
      'domain-process-export-escape'
    ].includes(finding.rule)).length
    checks.push(ownershipCount === 0
      ? gateCheck('domain-package-co-ownership', 'passed')
      : gateCheck('domain-package-co-ownership', 'failed', `finding_count_${ownershipCount}`))
    const registrationCount = findings.filter((finding) => [
      'domain-ambiguous-root-export',
      'domain-process-export-alias',
      'duplicate-domain-contribution-registration'
    ].includes(finding.rule)).length
    checks.push(registrationCount === 0
      ? gateCheck('canonical-registration', 'passed')
      : gateCheck('canonical-registration', 'failed', `finding_count_${registrationCount}`))
  } catch {
    checks.push(gateCheck('host-generic-sdk-boundary', 'failed', 'host_scan_failed'))
    checks.push(gateCheck('host-identifier-hardcode', 'failed', 'host_scan_failed'))
    checks.push(gateCheck('domain-package-co-ownership', 'failed', 'domain_package_audit_failed'))
    checks.push(gateCheck('canonical-registration', 'failed', 'domain_package_audit_failed'))
  }

  const hasSourceOutput = (await Promise.all(
    SOURCE_OUTPUT_PATHS.map((path) => pathExists(resolve(repositoryRoot, path)))
  )).every(Boolean)
  const packagedInputsPresent = Boolean(
    options.packagedExecutableLocator && options.packedArtifactPath && options.artifactReceiptPath
  )
  const packagedPathsPresent = packagedInputsPresent && (await Promise.all([
    pathExists(resolve(options.packedArtifactPath)),
    pathExists(resolve(options.artifactReceiptPath))
  ])).every(Boolean)
  const canBindCommit = sourceCommit !== null && repositoryClean
  const canonicalChecksPassed = generatedCompositionCheck.status === 'passed' &&
    capabilityGovernanceCheck.status === 'passed' &&
    checks.find((entry) => entry.id === 'host-generic-sdk-boundary')?.status === 'passed' &&
    checks.find((entry) => entry.id === 'host-identifier-hardcode')?.status === 'passed' &&
    checks.find((entry) => entry.id === 'domain-package-co-ownership')?.status === 'passed' &&
    checks.find((entry) => entry.id === 'canonical-registration')?.status === 'passed'

  let artifactHandle
  let artifact = null
  if (!packagedInputsPresent || !packagedPathsPresent) {
    checks.push(gateCheck('packaged-artifact-receipt', 'not_run', 'packaged_artifact_or_receipt_missing'))
  } else if (!canBindCommit) {
    checks.push(gateCheck('packaged-artifact-receipt', 'not_run', 'source_commit_not_bindable'))
  } else {
    try {
      artifactHandle = await dependencies.verifyArtifactReceipt({
        repositoryRoot,
        artifactReceiptPath: resolve(options.artifactReceiptPath),
        packedArtifactPath: resolve(options.packedArtifactPath),
        expectedSourceCommit: sourceCommit
      })
      if (artifactHandle.sourceCommit !== sourceCommit) throw new Error('artifact_source_commit_mismatch')
      await artifactHandle.assertUnchanged()
      artifact = Object.freeze({
        fileName: artifactHandle.artifact.fileName,
        sha256: `sha256:${artifactHandle.artifact.sha256}`,
        size: artifactHandle.artifact.size,
        receiptSha256: `sha256:${artifactHandle.receiptSha256}`
      })
      checks.push(gateCheck('packaged-artifact-receipt', 'passed'))
    } catch {
      artifactHandle?.close?.()
      artifactHandle = undefined
      checks.push(gateCheck('packaged-artifact-receipt', 'failed', 'artifact_receipt_verification_failed'))
    }
  }

  let packagedApplication
  if (!artifactHandle) {
    checks.push(gateCheck('sealed-packaged-application', 'not_run', 'verified_artifact_required'))
  } else {
    try {
      packagedApplication = await dependencies.prepareSealedPackagedApplication({
        artifactHandle,
        executableLocator: options.packagedExecutableLocator,
        runProcess: dependencies.runProcess
      })
      await packagedApplication.assertUnchanged()
      await artifactHandle.assertUnchanged()
      artifact = Object.freeze({
        ...artifact,
        executable: Object.freeze({
          locator: packagedApplication.executableLocator,
          sha256: `sha256:${packagedApplication.sha256}`,
          size: packagedApplication.size
        })
      })
      checks.push(gateCheck('sealed-packaged-application', 'passed'))
    } catch {
      await packagedApplication?.close?.().catch(() => undefined)
      packagedApplication = undefined
      artifactHandle.close()
      artifactHandle = undefined
      checks.push(gateCheck('sealed-packaged-application', 'failed', 'sealed_application_preparation_failed'))
    }
  }

  let sourceProjection
  if (!hasSourceOutput) {
    checks.push(gateCheck('source-composition-smoke', 'not_run', 'source_output_missing'))
  } else if (!canBindCommit || !canonicalChecksPassed) {
    checks.push(gateCheck('source-composition-smoke', 'not_run', 'source_commit_or_canonical_check_failed'))
  } else {
    const sourceSmoke = await dependencies.runProcess({
      command: process.execPath,
      args: [
        resolve(repositoryRoot, 'scripts/electron-domain-smoke.mjs'),
        '--repository-root',
        repositoryRoot,
        ...(options.timeoutMs ? ['--timeout-ms', String(options.timeoutMs)] : [])
      ],
      cwd: repositoryRoot
    })
    try {
      sourceProjection = parseSmokeOutput(sourceSmoke, 'source/out')
      checks.push(gateCheck('source-composition-smoke', 'passed'))
    } catch (error) {
      checks.push(gateCheck(
        'source-composition-smoke',
        'failed',
        error instanceof Error ? error.message : 'source_smoke_failed'
      ))
    }
  }

  let packagedProjection
  if (!packagedInputsPresent || !packagedPathsPresent || !artifactHandle || !packagedApplication) {
    checks.push(gateCheck('packaged-composition-smoke', 'not_run', 'verified_packaged_evidence_missing'))
  } else if (!canBindCommit || !canonicalChecksPassed) {
    checks.push(gateCheck('packaged-composition-smoke', 'not_run', 'source_commit_or_canonical_check_failed'))
  } else {
    const packagedSmoke = await dependencies.runProcess({
      command: process.execPath,
      args: [
        resolve(repositoryRoot, 'scripts/electron-domain-packaged-smoke.mjs'),
        '--repository-root',
        repositoryRoot,
        '--executable',
        packagedApplication.executablePath,
        ...(options.timeoutMs ? ['--timeout-ms', String(options.timeoutMs)] : [])
      ],
      cwd: repositoryRoot
    })
    let packagedFailure
    try {
      packagedProjection = parseSmokeOutput(packagedSmoke, 'packaged/unpacked')
      await packagedApplication.assertUnchanged()
      await artifactHandle.assertUnchanged()
    } catch (error) {
      packagedFailure = error instanceof Error ? error.message : 'packaged_smoke_failed'
    } finally {
      try {
        await packagedApplication.close()
      } catch {
        packagedFailure ??= 'packaged_application_cleanup_failed'
      }
      packagedApplication = undefined
      artifactHandle.close()
      artifactHandle = undefined
    }
    checks.push(packagedFailure
      ? gateCheck('packaged-composition-smoke', 'failed', packagedFailure)
      : gateCheck('packaged-composition-smoke', 'passed'))
  }

  let fingerprint = null
  if (!sourceProjection || !packagedProjection) {
    checks.push(gateCheck('source-packaged-composition-parity', 'not_run', 'both_smokes_required'))
  } else if (JSON.stringify(sourceProjection) !== JSON.stringify(packagedProjection)) {
    checks.push(gateCheck('source-packaged-composition-parity', 'failed', 'composition_projection_mismatch'))
  } else {
    fingerprint = compositionFingerprint(sourceProjection)
    checks.push(gateCheck('source-packaged-composition-parity', 'passed'))
  }
  await packagedApplication?.close?.().catch(() => undefined)
  artifactHandle?.close?.()

  if (!canBindCommit) {
    checks.push(gateCheck('repository-commit-stability', 'not_run', 'initial_repository_state_not_bindable'))
  } else {
    try {
      const [finalCommit, finalStatus] = await Promise.all([
        dependencies.resolveSourceCommit(repositoryRoot),
        dependencies.readRepositoryStatus(repositoryRoot)
      ])
      checks.push(finalCommit === sourceCommit && finalStatus.trim().length === 0
        ? gateCheck('repository-commit-stability', 'passed')
        : gateCheck('repository-commit-stability', 'failed', 'repository_changed_during_gate'))
    } catch {
      checks.push(gateCheck('repository-commit-stability', 'failed', 'final_repository_state_unavailable'))
    }
  }

  const status = checks.every((entry) => entry.status === 'passed') ? 'passed' : 'failed'
  return Object.freeze({
    contractVersion: 1,
    kind: 'sciforge-repository-architecture-principles-gate',
    status,
    sourceCommit,
    artifact,
    compositionFingerprint: fingerprint,
    checks: Object.freeze(checks),
    findings: Object.freeze(findings.map((finding) => Object.freeze(finding))),
    generatedAt: new Date().toISOString()
  })
}

function parseCliArguments(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const key = new Map([
      ['--repository-root', 'repositoryRoot'],
      ['--packaged-executable-locator', 'packagedExecutableLocator'],
      ['--packed-artifact', 'packedArtifactPath'],
      ['--artifact-receipt', 'artifactReceiptPath'],
      ['--timeout-ms', 'timeoutMs']
    ]).get(flag)
    if (!key) throw new Error(`Unknown architecture gate option: ${flag}`)
    const value = argv[index + 1]?.trim()
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`)
    index += 1
    options[key] = key === 'timeoutMs' ? Number(value) : value
  }
  if (options.timeoutMs !== undefined && (
    !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 300_000
  )) {
    throw new Error('--timeout-ms must be an integer between 1000 and 300000.')
  }
  return options
}

async function main() {
  const receipt = await runRepositoryArchitecturePrinciplesGate(parseCliArguments(process.argv.slice(2)))
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
  if (receipt.status !== 'passed') process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
