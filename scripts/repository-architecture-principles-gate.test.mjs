import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { runRepositoryArchitecturePrinciplesGate } from './repository-architecture-principles-gate.mjs'

const SOURCE_COMMIT = 'a'.repeat(40)

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'sciforge-architecture-gate-'))
  await Promise.all([
    mkdir(join(root, 'packages/domains/example/src'), { recursive: true }),
    mkdir(join(root, 'src/main'), { recursive: true }),
    mkdir(join(root, 'src/renderer/src'), { recursive: true }),
    mkdir(join(root, 'src/shared'), { recursive: true }),
    mkdir(join(root, 'scripts'), { recursive: true })
  ])
  await Promise.all([
    writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', workspaces: ['packages/*', 'packages/domains/*'] })),
    writeFile(join(root, 'src/main/index.ts'), "import type { DomainMainHost } from '@sciforge/domain-sdk/host'\n"),
    writeFile(join(root, 'packages/domains/example/sciforge.domain.json'), JSON.stringify({
      contractVersion: 1,
      packageName: '@sciforge/domain-example',
      module: { id: 'sciforge.example', version: '1.0.0' },
      entrypoints: [
        { process: 'main', export: './main', contributions: [{ id: 'example.main', kind: 'main.runtime-lifecycle' }] },
        { process: 'renderer', export: './renderer', contributions: [{ id: 'example.renderer', kind: 'renderer.workbench-right-panel' }] }
      ]
    })),
    writeFile(join(root, 'packages/domains/example/package.json'), JSON.stringify({
      name: '@sciforge/domain-example',
      version: '1.0.0',
      exports: {
        './definition': './src/definition.ts',
        './main': './src/main.ts',
        './renderer': './src/renderer.ts'
      }
    }))
  ])
  return root
}

function passingDependencies() {
  return {
    resolveSourceCommit: async () => SOURCE_COMMIT,
    readRepositoryStatus: async () => '',
    runProcess: async () => ({ status: 0, stdout: '', stderr: '' }),
    prepareSealedPackagedApplication: async ({ executableLocator }) => ({
      executablePath: `/sealed/${executableLocator}`,
      executableLocator,
      sha256: 'f'.repeat(64),
      size: 17,
      assertUnchanged: async () => undefined,
      close: async () => undefined
    })
  }
}

function smokeResult(mode) {
  return {
    mode,
    version: '1.0.0',
    readiness: 'ready',
    capabilityCount: 12,
    identityActionId: 'identity.local.create-account',
    contentSpaceProviderActionId: 'content-space.list-provider-instances',
    contentSpaceProviderInstanceCount: 1,
    datasetLoopCreated: true,
    datasetLoopWorkflowCount: 2,
    paperRadarActionId: 'paper-radar.status',
    workspacePreviewActionId: 'workspace-preview.list',
    previewPluginCount: 1,
    workspacePreviewPluginId: 'markdown',
    workspacePreviewReleased: true,
    artifactVersionsActionId: 'artifact-versions.list',
    evidenceDagActionId: 'evidence-dag.view',
    scientificPlottingActionId: 'scientific-plotting.status',
    visualReviewActionId: 'visual-review.open',
    workspaceEditPersisted: true,
    paperRadarProfilePersisted: true
  }
}

async function createPackagedEvidence(root) {
  const artifactPath = join(root, 'dist/SciForge-1.0.0-mac-arm64.zip')
  const receiptPath = join(root, 'dist/release-mac.json')
  const executableLocator = 'SciForge.app/Contents/MacOS/SciForge'
  await mkdir(join(root, 'dist'), { recursive: true })
  await Promise.all([
    writeFile(artifactPath, 'packed artifact'),
    writeFile(receiptPath, '{}'),
    ...[
      'out/main/index.js',
      'out/main/codex-pre-tool-use-governance-node-entry.js',
      'out/preload/index.cjs',
      'out/renderer/index.html'
    ].map(async (path) => {
      await mkdir(join(root, path, '..'), { recursive: true })
      await writeFile(join(root, path), 'built')
    })
  ])
  return { artifactPath, executableLocator, receiptPath }
}

test('missing source output and packaged evidence are not_run and fail the gate', async () => {
  const root = await createFixture()
  try {
    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      dependencies: passingDependencies()
    })

    assert.equal(receipt.status, 'failed')
    assert.equal(receipt.sourceCommit, SOURCE_COMMIT)
    assert.equal(receipt.checks.find((entry) => entry.id === 'source-composition-smoke')?.status, 'not_run')
    assert.equal(receipt.checks.find((entry) => entry.id === 'packaged-composition-smoke')?.status, 'not_run')
    assert.equal(receipt.artifact, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runs the canonical source and packaged smokes and seals one composition fingerprint', async () => {
  const root = await createFixture()
  try {
    const packaged = await createPackagedEvidence(root)
    const invocations = []
    let unchangedChecks = 0
    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      packagedExecutableLocator: packaged.executableLocator,
      packedArtifactPath: packaged.artifactPath,
      artifactReceiptPath: packaged.receiptPath,
      dependencies: {
        ...passingDependencies(),
        runProcess: async (invocation) => {
          invocations.push(invocation)
          const script = invocation.args.find((value) => value.endsWith?.('.mjs')) ?? ''
          if (script.endsWith('electron-domain-smoke.mjs')) {
            return { status: 0, stdout: JSON.stringify(smokeResult('source/out')), stderr: '' }
          }
          if (script.endsWith('electron-domain-packaged-smoke.mjs')) {
            return { status: 0, stdout: JSON.stringify(smokeResult('packaged/unpacked')), stderr: '' }
          }
          return { status: 0, stdout: '', stderr: '' }
        },
        verifyArtifactReceipt: async () => ({
          sourceCommit: SOURCE_COMMIT,
          artifact: {
            fileName: 'SciForge-1.0.0-mac-arm64.zip',
            sha256: 'b'.repeat(64),
            size: 15
          },
          receiptSha256: 'c'.repeat(64),
          assertUnchanged: () => { unchangedChecks += 1 },
          close: () => undefined
        })
      }
    })

    assert.equal(receipt.status, 'passed')
    assert.match(receipt.compositionFingerprint, /^sha256:[a-f0-9]{64}$/u)
    assert.equal(receipt.artifact.sha256, `sha256:${'b'.repeat(64)}`)
    assert.ok(invocations.some(({ args }) => args.some((value) => value.endsWith?.('domain-packages.mjs'))))
    assert.ok(invocations.some(({ args }) => args.some((value) => value.endsWith?.('capability-governance.mjs'))))
    assert.ok(invocations.some(({ args }) => args.some((value) => value.endsWith?.('electron-domain-smoke.mjs'))))
    assert.ok(invocations.some(({ args }) => args.some((value) => value.endsWith?.('electron-domain-packaged-smoke.mjs'))))
    assert.ok(invocations.some(({ args }) => args.includes(`/sealed/${packaged.executableLocator}`)))
    assert.equal(unchangedChecks, 3)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects Host production imports and identifier switches for an installed domain', async () => {
  const root = await createFixture()
  try {
    await writeFile(
      join(root, 'src/main/index.ts'),
      [
        "import { createDomainMainEntry } from '@sciforge/domain-example/main'",
        "const selectedDomain = 'sciforge.example'",
        'void createDomainMainEntry',
        'void selectedDomain'
      ].join('\n')
    )
    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      dependencies: passingDependencies()
    })

    assert.equal(receipt.status, 'failed')
    assert.equal(receipt.checks.find((entry) => entry.id === 'host-generic-sdk-boundary')?.status, 'failed')
    assert.equal(receipt.checks.find((entry) => entry.id === 'host-identifier-hardcode')?.status, 'failed')
    assert.deepEqual(
      receipt.findings.map(({ rule, file, line }) => ({ rule, file, line })),
      [
        { rule: 'host-domain-implementation-import', file: 'src/main/index.ts', line: 1 },
        { rule: 'host-domain-identifier-hardcode', file: 'src/main/index.ts', line: 2 }
      ]
    )
    assert.equal(JSON.stringify(receipt).includes('createDomainMainEntry'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails when a domain backend and UI are not owned at the manifest package version', async () => {
  const root = await createFixture()
  try {
    const manifestPath = join(root, 'packages/domains/example/sciforge.domain.json')
    const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(manifestPath, 'utf8'))
    manifest.module.version = '2.0.0'
    await writeFile(manifestPath, JSON.stringify(manifest))

    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      dependencies: passingDependencies()
    })

    assert.equal(receipt.status, 'failed')
    assert.equal(receipt.checks.find((entry) => entry.id === 'domain-package-co-ownership')?.status, 'failed')
    assert.ok(receipt.findings.some((finding) => finding.rule === 'domain-package-version-mismatch'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects compatibility export aliases and duplicate contribution registration', async () => {
  const root = await createFixture()
  try {
    const packagePath = join(root, 'packages/domains/example/package.json')
    const manifestPath = join(root, 'packages/domains/example/sciforge.domain.json')
    const fs = await import('node:fs/promises')
    const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'))
    packageJson.exports['./legacy-main'] = packageJson.exports['./main']
    await writeFile(packagePath, JSON.stringify(packageJson))
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    manifest.entrypoints[0].contributions.push({
      id: 'example.main',
      kind: 'main.runtime-lifecycle'
    })
    await writeFile(manifestPath, JSON.stringify(manifest))

    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      dependencies: passingDependencies()
    })

    assert.equal(receipt.checks.find((entry) => entry.id === 'canonical-registration')?.status, 'failed')
    assert.deepEqual(
      receipt.findings
        .filter((finding) => finding.rule === 'domain-process-export-alias' ||
          finding.rule === 'duplicate-domain-contribution-registration')
        .map((finding) => finding.rule)
        .sort(),
      ['domain-process-export-alias', 'duplicate-domain-contribution-registration']
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('derives provider identifiers from package ownership and rejects Host selection hardcode', async () => {
  const root = await createFixture()
  try {
    await mkdir(join(root, 'packages/collaboration-provider-zulip'), { recursive: true })
    await writeFile(
      join(root, 'packages/collaboration-provider-zulip/package.json'),
      JSON.stringify({ name: '@sciforge/collaboration-provider-zulip', version: '1.0.0' })
    )
    await writeFile(
      join(root, 'src/main/index.ts'),
      [
        "const selectedProvider = 'zulip-v1'",
        "const acceptanceOrigin = 'https://cloud-run0.example.invalid'",
        'void selectedProvider',
        'void acceptanceOrigin'
      ].join('\n')
    )

    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      dependencies: passingDependencies()
    })

    assert.equal(receipt.checks.find((entry) => entry.id === 'host-identifier-hardcode')?.status, 'failed')
    assert.equal(receipt.findings.filter((finding) => (
      finding.rule === 'host-domain-identifier-hardcode' && finding.file === 'src/main/index.ts'
    )).length, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('treats the canonical byte-exact generated composition check as authoritative', async () => {
  const root = await createFixture()
  try {
    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      dependencies: {
        ...passingDependencies(),
        runProcess: async (invocation) => invocation.args.some((value) =>
          value.endsWith?.('domain-packages.mjs'))
          ? { status: 1, stdout: '', stderr: 'Generated domain package composition is stale.' }
          : { status: 0, stdout: '', stderr: '' }
      }
    })

    assert.equal(receipt.checks.find((entry) => entry.id === 'generated-composition')?.status, 'failed')
    assert.equal(receipt.status, 'failed')
    assert.equal(JSON.stringify(receipt).includes('Generated domain package composition is stale.'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects a sealed artifact receipt from a different source commit', async () => {
  const root = await createFixture()
  try {
    const packaged = await createPackagedEvidence(root)
    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      packagedExecutableLocator: packaged.executableLocator,
      packedArtifactPath: packaged.artifactPath,
      artifactReceiptPath: packaged.receiptPath,
      dependencies: {
        ...passingDependencies(),
        verifyArtifactReceipt: async () => ({
          sourceCommit: 'd'.repeat(40),
          artifact: { fileName: 'fixture.zip', sha256: 'b'.repeat(64), size: 1 },
          receiptSha256: 'c'.repeat(64),
          assertUnchanged: () => undefined,
          close: () => undefined
        })
      }
    })

    assert.equal(receipt.checks.find((entry) => entry.id === 'packaged-artifact-receipt')?.status, 'failed')
    assert.equal(receipt.checks.find((entry) => entry.id === 'packaged-composition-smoke')?.status, 'not_run')
    assert.equal(receipt.status, 'failed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails when source and packaged canonical smoke projections differ', async () => {
  const root = await createFixture()
  try {
    const packaged = await createPackagedEvidence(root)
    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      packagedExecutableLocator: packaged.executableLocator,
      packedArtifactPath: packaged.artifactPath,
      artifactReceiptPath: packaged.receiptPath,
      dependencies: {
        ...passingDependencies(),
        runProcess: async (invocation) => {
          const script = invocation.args.find((value) => value.endsWith?.('.mjs')) ?? ''
          if (script.endsWith('electron-domain-smoke.mjs')) {
            return { status: 0, stdout: JSON.stringify(smokeResult('source/out')), stderr: '' }
          }
          if (script.endsWith('electron-domain-packaged-smoke.mjs')) {
            return {
              status: 0,
              stdout: JSON.stringify({ ...smokeResult('packaged/unpacked'), capabilityCount: 11 }),
              stderr: ''
            }
          }
          return { status: 0, stdout: '', stderr: '' }
        },
        verifyArtifactReceipt: async () => ({
          sourceCommit: SOURCE_COMMIT,
          artifact: { fileName: 'fixture.zip', sha256: 'b'.repeat(64), size: 1 },
          receiptSha256: 'c'.repeat(64),
          assertUnchanged: () => undefined,
          close: () => undefined
        })
      }
    })

    assert.equal(receipt.checks.find((entry) => entry.id === 'source-packaged-composition-parity')?.status, 'failed')
    assert.equal(receipt.compositionFingerprint, null)
    assert.equal(receipt.status, 'failed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rechecks sealed artifact bytes and inode after the packaged smoke', async () => {
  const root = await createFixture()
  try {
    const packaged = await createPackagedEvidence(root)
    let unchangedChecks = 0
    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      packagedExecutableLocator: packaged.executableLocator,
      packedArtifactPath: packaged.artifactPath,
      artifactReceiptPath: packaged.receiptPath,
      dependencies: {
        ...passingDependencies(),
        runProcess: async (invocation) => {
          const script = invocation.args.find((value) => value.endsWith?.('.mjs')) ?? ''
          if (script.endsWith('electron-domain-smoke.mjs')) {
            return { status: 0, stdout: JSON.stringify(smokeResult('source/out')), stderr: '' }
          }
          if (script.endsWith('electron-domain-packaged-smoke.mjs')) {
            return { status: 0, stdout: JSON.stringify(smokeResult('packaged/unpacked')), stderr: '' }
          }
          return { status: 0, stdout: '', stderr: '' }
        },
        verifyArtifactReceipt: async () => ({
          sourceCommit: SOURCE_COMMIT,
          artifact: { fileName: 'fixture.zip', sha256: 'b'.repeat(64), size: 1 },
          receiptSha256: 'c'.repeat(64),
          assertUnchanged: () => {
            unchangedChecks += 1
            if (unchangedChecks === 2) throw new Error('artifact changed')
          },
          close: () => undefined
        })
      }
    })

    assert.equal(receipt.checks.find((entry) => entry.id === 'sealed-packaged-application')?.status, 'failed')
    assert.equal(receipt.checks.find((entry) => entry.id === 'packaged-composition-smoke')?.status, 'not_run')
    assert.equal(receipt.status, 'failed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('holds the extracted executable by fd and rejects mutation after packaged smoke', async () => {
  const root = await createFixture()
  try {
    const packaged = await createPackagedEvidence(root)
    let executableChecks = 0
    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      packagedExecutableLocator: packaged.executableLocator,
      packedArtifactPath: packaged.artifactPath,
      artifactReceiptPath: packaged.receiptPath,
      dependencies: {
        ...passingDependencies(),
        runProcess: async (invocation) => {
          const script = invocation.args.find((value) => value.endsWith?.('.mjs')) ?? ''
          if (script.endsWith('electron-domain-smoke.mjs')) {
            return { status: 0, stdout: JSON.stringify(smokeResult('source/out')), stderr: '' }
          }
          if (script.endsWith('electron-domain-packaged-smoke.mjs')) {
            return { status: 0, stdout: JSON.stringify(smokeResult('packaged/unpacked')), stderr: '' }
          }
          return { status: 0, stdout: '', stderr: '' }
        },
        verifyArtifactReceipt: async () => ({
          sourceCommit: SOURCE_COMMIT,
          artifact: { fileName: 'fixture.zip', sha256: 'b'.repeat(64), size: 1 },
          receiptSha256: 'c'.repeat(64),
          assertUnchanged: () => undefined,
          close: () => undefined
        }),
        prepareSealedPackagedApplication: async ({ executableLocator }) => ({
          executablePath: `/sealed/${executableLocator}`,
          executableLocator,
          sha256: 'f'.repeat(64),
          size: 17,
          assertUnchanged: async () => {
            executableChecks += 1
            if (executableChecks === 2) throw new Error('executable changed')
          },
          close: async () => undefined
        })
      }
    })

    assert.equal(receipt.checks.find((entry) => entry.id === 'sealed-packaged-application')?.status, 'passed')
    assert.equal(receipt.checks.find((entry) => entry.id === 'packaged-composition-smoke')?.status, 'failed')
    assert.equal(receipt.status, 'failed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not run packaged smoke when the sealed artifact lacks the exact executable locator', async () => {
  const root = await createFixture()
  try {
    const packaged = await createPackagedEvidence(root)
    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      packagedExecutableLocator: 'Wrong.app/Contents/MacOS/Wrong',
      packedArtifactPath: packaged.artifactPath,
      artifactReceiptPath: packaged.receiptPath,
      dependencies: {
        ...passingDependencies(),
        verifyArtifactReceipt: async () => ({
          sourceCommit: SOURCE_COMMIT,
          artifact: { fileName: 'fixture.zip', sha256: 'b'.repeat(64), size: 1 },
          receiptSha256: 'c'.repeat(64),
          assertUnchanged: () => undefined,
          close: () => undefined
        }),
        prepareSealedPackagedApplication: async () => {
          throw new Error('packaged_executable_locator_missing')
        }
      }
    })

    assert.equal(receipt.checks.find((entry) => entry.id === 'sealed-packaged-application')?.status, 'failed')
    assert.equal(receipt.checks.find((entry) => entry.id === 'packaged-composition-smoke')?.status, 'not_run')
    assert.equal(receipt.status, 'failed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('extracts and executes the locator only from bytes held by the sealed receipt fd', {
  skip: process.platform !== 'darwin'
}, async () => {
  const root = await createFixture()
  try {
    const packaged = await createPackagedEvidence(root)
    const sourceApp = join(root, 'archive-input/SciForge.app')
    const sourceExecutable = join(sourceApp, 'Contents/MacOS/SciForge')
    await mkdir(join(sourceApp, 'Contents/MacOS'), { recursive: true })
    await writeFile(sourceExecutable, 'sealed executable bytes')
    await chmod(sourceExecutable, 0o755)
    const archive = spawnSync('/usr/bin/ditto', [
      '-c', '-k', '--keepParent', sourceApp, packaged.artifactPath
    ], { encoding: 'utf8' })
    assert.equal(archive.status, 0, archive.stderr)

    let packagedExecutableUsed = ''
    const {
      prepareSealedPackagedApplication: _fixturePreparation,
      ...baseDependencies
    } = passingDependencies()
    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      packagedExecutableLocator: packaged.executableLocator,
      packedArtifactPath: packaged.artifactPath,
      artifactReceiptPath: packaged.receiptPath,
      dependencies: {
        ...baseDependencies,
        runProcess: async (invocation) => {
          const script = invocation.args.find((value) => value.endsWith?.('.mjs')) ?? ''
          if (script.endsWith('electron-domain-smoke.mjs')) {
            return { status: 0, stdout: JSON.stringify(smokeResult('source/out')), stderr: '' }
          }
          if (script.endsWith('electron-domain-packaged-smoke.mjs')) {
            packagedExecutableUsed = invocation.args[invocation.args.indexOf('--executable') + 1]
            return { status: 0, stdout: JSON.stringify(smokeResult('packaged/unpacked')), stderr: '' }
          }
          if (invocation.command === 'unzip' || invocation.command === '/usr/bin/ditto') {
            const result = spawnSync(invocation.command, invocation.args, {
              cwd: invocation.cwd,
              encoding: 'utf8'
            })
            return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr }
          }
          return { status: 0, stdout: '', stderr: '' }
        },
        verifyArtifactReceipt: async () => ({
          sourceCommit: SOURCE_COMMIT,
          artifact: {
            fileName: 'SciForge-1.0.0-mac-arm64.zip',
            sha256: 'b'.repeat(64),
            size: 1
          },
          receiptSha256: 'c'.repeat(64),
          assertUnchanged: () => undefined,
          openReadStream: () => createReadStream(packaged.artifactPath),
          close: () => undefined
        })
      }
    })

    assert.equal(receipt.status, 'passed')
    assert.match(packagedExecutableUsed, /sciforge-architecture-gate-packaged-.+\/application\/SciForge\.app\/Contents\/MacOS\/SciForge$/u)
    assert.equal(packagedExecutableUsed.includes(root), false)
    assert.equal(receipt.artifact.executable.locator, packaged.executableLocator)
    assert.match(receipt.artifact.executable.sha256, /^sha256:[a-f0-9]{64}$/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails if HEAD changes while source and packaged evidence are being collected', async () => {
  const root = await createFixture()
  try {
    const packaged = await createPackagedEvidence(root)
    let commitReads = 0
    const receipt = await runRepositoryArchitecturePrinciplesGate({
      repositoryRoot: root,
      packagedExecutableLocator: packaged.executableLocator,
      packedArtifactPath: packaged.artifactPath,
      artifactReceiptPath: packaged.receiptPath,
      dependencies: {
        ...passingDependencies(),
        resolveSourceCommit: async () => {
          commitReads += 1
          return commitReads === 1 ? SOURCE_COMMIT : 'e'.repeat(40)
        },
        runProcess: async (invocation) => {
          const script = invocation.args.find((value) => value.endsWith?.('.mjs')) ?? ''
          if (script.endsWith('electron-domain-smoke.mjs')) {
            return { status: 0, stdout: JSON.stringify(smokeResult('source/out')), stderr: '' }
          }
          if (script.endsWith('electron-domain-packaged-smoke.mjs')) {
            return { status: 0, stdout: JSON.stringify(smokeResult('packaged/unpacked')), stderr: '' }
          }
          return { status: 0, stdout: '', stderr: '' }
        },
        verifyArtifactReceipt: async () => ({
          sourceCommit: SOURCE_COMMIT,
          artifact: { fileName: 'fixture.zip', sha256: 'b'.repeat(64), size: 1 },
          receiptSha256: 'c'.repeat(64),
          assertUnchanged: () => undefined,
          close: () => undefined
        })
      }
    })

    assert.equal(receipt.checks.find((entry) => entry.id === 'repository-commit-stability')?.status, 'failed')
    assert.equal(receipt.status, 'failed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
