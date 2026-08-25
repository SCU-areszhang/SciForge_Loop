import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { auditRoot } from './collaboration-secret-audit.mjs'

const auditScript = fileURLToPath(new URL('./collaboration-secret-audit.mjs', import.meta.url))

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'sciforge-collaboration-secret-audit-'))
  for (const [path, source] of Object.entries(files)) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, source, 'utf8')
  }
  return {
    root,
    audit: () => auditRoot({ root, scanAll: true, useGit: false, includeOwnFixtures: true }),
    auditDefault: () => auditRoot({ root, scanAll: false, useGit: false, includeOwnFixtures: true }),
    close: () => rmSync(root, { recursive: true, force: true })
  }
}

function findingKinds(result) {
  return result.findings.map((finding) => finding.kind)
}

test('default gate discovers the complete meeting-loop security boundary', (t) => {
  const manifests = {
    'packages/domain-sdk/package.json': '@sciforge/domain-sdk',
    'packages/domains/project-coordinator/package.json': '@sciforge/domain-project-coordinator',
    'packages/domains/content-space/package.json': '@sciforge/domain-content-space',
    'packages/domains/collaboration/package.json': '@sciforge/domain-collaboration',
    'packages/domains/opencontent-connector/package.json': '@sciforge/domain-opencontent-connector',
    'packages/domains/opencontent-content-space-provider/package.json':
      '@sciforge/domain-opencontent-content-space-provider',
    'packages/domains/identity-access/package.json': '@sciforge/domain-identity-access',
    'packages/collaboration-server/package.json': '@sciforge/collaboration-server',
    'packages/workers/runtime/package.json': '@sciforge/runtime-worker',
    'packages/domains/unrelated/package.json': '@sciforge/domain-unrelated'
  }
  const files = Object.fromEntries(Object.entries(manifests).flatMap(([path, name]) => {
    const directory = dirname(path)
    return [
      [path, JSON.stringify({ name, exports: './src/index.ts' })],
      [`${directory}/src/index.ts`, 'export function leak(accessToken: string) { console.info(accessToken) }\n']
    ]
  }))
  files['src/main/logger.ts'] = [
    "import '@sciforge/runtime-worker'",
    'export function leak(providerCredential: string) { console.info(providerCredential) }'
  ].join('\n')
  files['src/preload/bridge.ts'] =
    'export function leak(deviceCredential: string) { ipcRenderer.send("leak", deviceCredential) }\n'
  const repo = fixture(files)
  t.after(repo.close)

  const result = repo.auditDefault()
  const findingFiles = new Set(result.findings.map((finding) => finding.file))
  assert.equal(result.scope, 'meeting-loop-security-boundary')
  assert.ok(findingFiles.has('packages/domain-sdk/src/index.ts'))
  assert.ok(findingFiles.has('packages/domains/project-coordinator/src/index.ts'))
  assert.ok(findingFiles.has('packages/domains/content-space/src/index.ts'))
  assert.ok(findingFiles.has('packages/domains/collaboration/src/index.ts'))
  assert.ok(findingFiles.has('packages/domains/opencontent-connector/src/index.ts'))
  assert.ok(findingFiles.has('packages/domains/opencontent-content-space-provider/src/index.ts'))
  assert.ok(findingFiles.has('packages/domains/identity-access/src/index.ts'))
  assert.ok(findingFiles.has('packages/collaboration-server/src/index.ts'))
  assert.ok(findingFiles.has('packages/workers/runtime/src/index.ts'))
  assert.ok(findingFiles.has('src/main/logger.ts'))
  assert.ok(findingFiles.has('src/preload/bridge.ts'))
  assert.equal(findingFiles.has('packages/domains/unrelated/src/index.ts'), false)
})

test('default gate follows internal production dependencies of a meeting-loop package', (t) => {
  const repo = fixture({
    'packages/domains/project-coordinator/package.json': JSON.stringify({
      name: '@sciforge/domain-project-coordinator',
      exports: './src/index.ts',
      dependencies: { '@sciforge/coordination-journal': '1.0.0' }
    }),
    'packages/domains/project-coordinator/src/index.ts': 'export const coordinator = true\n',
    'packages/coordination-journal/package.json': JSON.stringify({
      name: '@sciforge/coordination-journal',
      exports: './src/index.ts'
    }),
    'packages/coordination-journal/src/index.ts':
      'export function leak(agentCredential: string) { console.info(agentCredential) }\n'
  })
  t.after(repo.close)

  assert.ok(repo.auditDefault().findings.some((finding) =>
    finding.file === 'packages/coordination-journal/src/index.ts' &&
    finding.kind === 'secret-log-credential'))
})

test('default gate rejects credential material in worker environments and bearer headers', (t) => {
  const repo = fixture({
    'package.json': JSON.stringify({
      name: '@fixture/desktop',
      dependencies: { '@fixture/background-worker': '1.0.0' }
    }),
    'src/main/worker-authority.ts': [
      "const BACKGROUND_WORKER_INTERNAL_SECRET_ENV = 'BACKGROUND_WORKER_INTERNAL_SECRET'",
      'export function workerEnvironment(value: string): Readonly<Record<string, string>> {',
      '  return { [BACKGROUND_WORKER_INTERNAL_SECRET_ENV]: value }',
      '}'
    ].join('\n'),
    'packages/background-worker/package.json': JSON.stringify({
      name: '@fixture/background-worker',
      exports: './src/index.ts'
    }),
    'packages/background-worker/src/index.ts': [
      'export async function callHost() {',
      '  const material = process.env.BACKGROUND_WORKER_INTERNAL_SECRET?.trim()',
      "  return fetch('http://127.0.0.1:1234/internal', {",
      '    headers: { Authorization: `Bearer ${material}` }',
      '  })',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  const result = repo.auditDefault()
  assert.ok(result.findings.some((finding) =>
    finding.file === 'src/main/worker-authority.ts' &&
    finding.kind === 'boundary-secret-environment'))
  assert.ok(result.findings.some((finding) =>
    finding.file === 'packages/background-worker/src/index.ts' &&
    finding.kind === 'boundary-secret-environment'))
  assert.ok(result.findings.some((finding) =>
    finding.file === 'packages/background-worker/src/index.ts' &&
    finding.kind === 'boundary-secret-authorization-header'))
})

test('default gate rejects whole environment projection and direct domain credential reads', (t) => {
  const repo = fixture({
    'package.json': JSON.stringify({
      name: '@fixture/desktop',
      dependencies: { '@fixture/installed-domain': '1.0.0' }
    }),
    'src/main/index.ts': [
      'declare function activateInstalledDomain(context: unknown): void',
      'activateInstalledDomain({ environment: Object.freeze({ ...process.env }) })'
    ].join('\n'),
    'packages/installed-domain/package.json': JSON.stringify({
      name: '@fixture/installed-domain',
      exports: './src/index.ts'
    }),
    'packages/installed-domain/src/index.ts': [
      'export function connect() {',
      '  return process.env.EXTERNAL_SERVICE_TOKEN?.trim()',
      '}',
      'export const nonSecretChildEnvironment = Object.freeze({',
      '  PATH: process.env.PATH,',
      '  LANG: process.env.LANG',
      '})'
    ].join('\n')
  })
  t.after(repo.close)

  const result = repo.auditDefault()
  const environmentFindings = result.findings.filter((finding) =>
    finding.kind === 'boundary-secret-environment')
  assert.ok(environmentFindings.some((finding) => finding.file === 'src/main/index.ts'))
  assert.ok(environmentFindings.some((finding) =>
    finding.file === 'packages/installed-domain/src/index.ts' && finding.line === 2))
  assert.equal(environmentFindings.some((finding) =>
    finding.file === 'packages/installed-domain/src/index.ts' && finding.line >= 5), false)
})

test('rejects a dynamic selector against a structurally proven process environment', (t) => {
  const repo = fixture({
    'package.json': JSON.stringify({
      name: '@fixture/desktop',
      dependencies: { '@fixture/installed-domain': '1.0.0' }
    }),
    'packages/installed-domain/package.json': JSON.stringify({
      name: '@fixture/installed-domain',
      exports: './src/index.ts'
    }),
    'packages/installed-domain/src/index.ts': [
      'function readSelected(environment: NodeJS.ProcessEnv, selector: string) {',
      '  const selected = environment[selector]',
      '  const language = environment.LANG',
      '  return { selected, language }',
      '}',
      'export function connect(selector: string) {',
      '  return readSelected(process.env, selector)',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.auditDefault().findings.filter((finding) =>
    finding.kind === 'boundary-secret-environment'), [{
    file: 'packages/installed-domain/src/index.ts',
    line: 2,
    kind: 'boundary-secret-environment'
  }])
})

test('proves a non-secret environment allowlist without trusting a sanitizer name', (t) => {
  const repo = fixture({
    'src/main/worker-environment.ts': [
      "const SAFE_CHILD_ENVIRONMENT = ['PATH', 'LANG'] as const",
      'function allowlistedEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {',
      '  const result: Record<string, string> = {}',
      '  for (const name of SAFE_CHILD_ENVIRONMENT) {',
      '    const value = source[name]',
      '    if (value !== undefined) result[name] = value',
      '  }',
      '  return result',
      '}',
      'function sanitizeEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {',
      '  return { ...source }',
      '}',
      'export const safeLaunch = { env: allowlistedEnvironment(process.env) }',
      'export const unsafeLaunch = { env: sanitizeEnvironment(process.env) }'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.auditDefault().findings.filter((finding) =>
    finding.kind === 'boundary-secret-environment'), [{
    file: 'src/main/worker-environment.ts',
    line: 14,
    kind: 'boundary-secret-environment'
  }])
})

test('proves mapped and conditional non-secret environment selectors', (t) => {
  const repo = fixture({
    'src/main/worker-environment.ts': [
      "const SAFE_CHILD_ENVIRONMENT = Object.freeze(['PATH', 'LANG'] as const)",
      'export function safeEnvironment(source: NodeJS.ProcessEnv) {',
      '  const selected = SAFE_CHILD_ENVIRONMENT.map((name) => source[name])',
      "  const pathName = source.PATH === undefined ? 'Path' : 'PATH'",
      '  return { selected, path: source[pathName] }',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.auditDefault().findings.filter((finding) =>
    finding.kind === 'boundary-secret-environment'), [])
})

test('default gate rejects credential strings in shared, preload, and renderer boundaries', (t) => {
  const repo = fixture({
    'src/shared/app-settings.ts': [
      'export type AppSettings = {',
      '  runtimeApiKey: string',
      '  refreshToken?: boolean',
      "  credentialKind: 'apiKey'",
      '  privateSecretFile: string',
      '}'
    ].join('\n'),
    'src/preload/bridge.ts': [
      'type ExposedSettings = { serviceCredential: string }',
      'export const api = {} as { getSettings(): Promise<ExposedSettings> }'
    ].join('\n'),
    'src/renderer/src/settings-state.ts': [
      'export type RendererSettingsState = { internalRuntimeKey: string }',
      'export const state = {} as RendererSettingsState'
    ].join('\n')
  })
  t.after(repo.close)

  const result = repo.auditDefault()
  assert.ok(result.findings.some((finding) =>
    finding.file === 'src/shared/app-settings.ts' && finding.line === 2 &&
    finding.kind === 'boundary-secret-provider-credential'))
  assert.ok(result.findings.some((finding) =>
    finding.file === 'src/preload/bridge.ts' && finding.line === 1 &&
    finding.kind === 'boundary-secret-credential'))
  assert.ok(result.findings.some((finding) =>
    finding.file === 'src/renderer/src/settings-state.ts' && finding.line === 1 &&
    finding.kind === 'boundary-secret-credential'))
  assert.equal(result.findings.some((finding) =>
    finding.file === 'src/shared/app-settings.ts' && finding.line >= 3), false)
})

test('allows only an immediate native-vault authorization use inside a private main connector', (t) => {
  const repo = fixture({
    'src/main/connectors/example/native-vault.internal.ts': [
      "import { safeStorage } from 'electron'",
      'export function readNativeValue(ciphertext: Buffer): string {',
      '  return safeStorage.decryptString(ciphertext)',
      '}'
    ].join('\n'),
    'src/main/connectors/example/index.ts': [
      "import { readNativeValue } from './native-vault.internal'",
      'declare function loadCiphertext(): Buffer',
      'export function createConnector(fetchImpl: typeof fetch) {',
      '  return {',
      '    async request(body: unknown, signal?: AbortSignal) {',
      '      const material = readNativeValue(loadCiphertext())',
      "      return fetchImpl('https://provider.invalid/v1/request', {",
      "        method: 'POST',",
      '        headers: { authorization: `Bearer ${material}` },',
      '        body: JSON.stringify(body),',
      '        signal',
      '      })',
      '    }',
      '  }',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.auditDefault().findings, [])
})

test('follows private connector secret flow through local serializer and connection closures', (t) => {
  const repo = fixture({
    'src/main/connectors/example/native-sealer.ts': [
      "import { safeStorage } from 'electron'",
      "import type { NativeSealer } from './runtime'",
      'export function createNativeSealer(): NativeSealer {',
      '  return {',
      '    seal: (plaintext) => safeStorage.encryptString(plaintext),',
      '    unseal: (ciphertext) => safeStorage.decryptString(ciphertext)',
      '  }',
      '}'
    ].join('\n'),
    'src/main/connectors/example/runtime.ts': [
      "import { writeFile } from 'node:fs/promises'",
      'export type NativeSealer = Readonly<{',
      '  seal(plaintext: string): Buffer',
      '  unseal(ciphertext: Buffer): string',
      '}>',
      'declare function loadCiphertext(): Buffer',
      'declare function parseRecord(value: unknown): { runtimeApiKey: string }',
      'export function createConnector(input: { sealer: NativeSealer; fetchImpl: typeof fetch }) {',
      '  const read = () => parseRecord(JSON.parse(input.sealer.unseal(loadCiphertext())))',
      '  const persist = (value: unknown) => persistRecord(value, input.sealer)',
      '  const serialize = async <Value>(operation: () => Promise<Value> | Value) => {',
      '    return await operation()',
      '  }',
      '  const resolveConnection = async () => {',
      '    const resolved = await serialize(read)',
      '    await persist(resolved)',
      '    const runtimeApiKey = resolved.runtimeApiKey',
      "    return { url: 'https://provider.invalid/v1/request', runtimeApiKey }",
      '  }',
      '  return {',
      '    async request(body: unknown) {',
      '      const connection = await resolveConnection()',
      '      return input.fetchImpl(connection.url, {',
      '        headers: { authorization: `Bearer ${connection.runtimeApiKey}` },',
      '        body: JSON.stringify(body)',
      '      })',
      '    }',
      '  }',
      '}',
      'async function persistRecord(value: unknown, sealer: NativeSealer) {',
      "  const ciphertext = sealer.seal(JSON.stringify(value)).toString('base64')",
      '  const envelope = { version: 1, ciphertext }',
      "  await writeFile('/private/example.enc.json', JSON.stringify(envelope))",
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.auditDefault().findings, [])
})

test('rejects raw connector persistence hidden behind a local helper', (t) => {
  const repo = fixture({
    'src/main/connectors/example/native-vault.internal.ts': [
      "import { safeStorage } from 'electron'",
      'export function readNativeValue(ciphertext: Buffer): string {',
      '  return safeStorage.decryptString(ciphertext)',
      '}'
    ].join('\n'),
    'src/main/connectors/example/index.ts': [
      "import { writeFile } from 'node:fs/promises'",
      "import { readNativeValue } from './native-vault.internal'",
      'declare function loadCiphertext(): Buffer',
      'const fakeEncrypt = (value: string) => value',
      'const persist = (value: string) => {',
      '  const ciphertext = fakeEncrypt(value)',
      "  return writeFile('/private/example.enc.json', ciphertext)",
      '}',
      'export async function leak() {',
      '  const material = readNativeValue(loadCiphertext())',
      '  await persist(material)',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  assert.ok(repo.auditDefault().findings.some((finding) =>
    finding.file === 'src/main/connectors/example/index.ts' &&
    finding.kind === 'insecure-secret-persistence-credential'))
})

test('rejects a raw secret return from any connector module imported by Host', (t) => {
  const repo = fixture({
    'src/main/index.ts': [
      "import { rawReturn } from './connectors/example/runtime'",
      'void rawReturn'
    ].join('\n'),
    'src/main/connectors/example/native-vault.internal.ts': [
      "import { safeStorage } from 'electron'",
      'export function readNativeValue(ciphertext: Buffer): string {',
      '  return safeStorage.decryptString(ciphertext)',
      '}'
    ].join('\n'),
    'src/main/connectors/example/runtime.ts': [
      "import { readNativeValue } from './native-vault.internal'",
      'declare function loadCiphertext(): Buffer',
      'export function rawReturn() {',
      '  const material = readNativeValue(loadCiphertext())',
      '  return material',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  assert.ok(repo.auditDefault().findings.some((finding) =>
    finding.file === 'src/main/connectors/example/runtime.ts' &&
    finding.kind === 'connector-secret-return'))
})

test('private connector boundary still rejects raw returns callbacks and outbound projections', (t) => {
  const repo = fixture({
    'src/main/connectors/example/native-vault.internal.ts': [
      "import { safeStorage } from 'electron'",
      'export function readNativeValue(ciphertext: Buffer): string {',
      '  return safeStorage.decryptString(ciphertext)',
      '}'
    ].join('\n'),
    'src/main/connectors/example/index.ts': [
      "import { readNativeValue } from './native-vault.internal'",
      'declare function loadCiphertext(): Buffer',
      'export function rawReturn() {',
      '  const material = readNativeValue(loadCiphertext())',
      '  return material',
      '}',
      'export function leak(',
      '  emit: (value: unknown) => void,',
      '  ipcRenderer: { send(channel: string, value: unknown): void },',
      '  logger: { info(value: unknown): void },',
      '  spawn: (command: string, args: string[], options: unknown) => void,',
      '  writeFile: (path: string, value: unknown) => void',
      ') {',
      '  const material = readNativeValue(loadCiphertext())',
      '  logger.info(material)',
      "  ipcRenderer.send('connector', material)",
      "  spawn('helper', [], { env: { PROVIDER_SECRET: material } })",
      "  writeFile('/tmp/connector-output', material)",
      '  emit(material)',
      '}',
      'export function callerSupplied(fetchImpl: typeof fetch, apiKey: string) {',
      "  return fetchImpl('https://provider.invalid/v1/request', {",
      '    headers: { authorization: `Bearer ${apiKey}` }',
      '  })',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  const kinds = findingKinds(repo.auditDefault())
  assert.ok(kinds.includes('connector-secret-return'))
  assert.ok(kinds.includes('secret-log-credential'))
  assert.ok(kinds.includes('secret-ipc-credential'))
  assert.ok(kinds.includes('secret-process-credential'))
  assert.ok(kinds.includes('insecure-secret-persistence-credential'))
  assert.ok(kinds.includes('connector-secret-callback'))
  assert.ok(kinds.includes('boundary-secret-authorization-header'))
})

test('default gate rejects credential-like material in a cross-package contract', (t) => {
  const repo = fixture({
    'package.json': JSON.stringify({
      name: '@fixture/desktop',
      dependencies: { '@fixture/runtime-gateway': '1.0.0' }
    }),
    'packages/runtime-gateway/package.json': JSON.stringify({
      name: '@fixture/runtime-gateway',
      exports: './src/index.ts'
    }),
    'packages/runtime-gateway/src/index.ts': [
      'export type GatewayRequest = {',
      '  runtimeKey: string',
      '  refreshToken?: boolean',
      "  credentialKind: 'apiKey'",
      '  privateSecretFile: string',
      '}',
      'export function openGateway(runtimeCredential: string): void {',
      '  void runtimeCredential',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.auditDefault().findings, [{
    file: 'packages/runtime-gateway/src/index.ts',
    line: 2,
    kind: 'public-secret-credential'
  }, {
    file: 'packages/runtime-gateway/src/index.ts',
    line: 7,
    kind: 'public-secret-credential'
  }])
})

test('resolves re-exported public modules and rejects an accessToken contract', (t) => {
  const repo = fixture({
    'packages/collaboration-identity/package.json': JSON.stringify({
      name: '@sciforge/collaboration-identity',
      exports: { '.': { source: './src/index.ts', import: './dist/index.js' } }
    }),
    'packages/collaboration-identity/src/index.ts': "export * from './client.js'\n",
    'packages/collaboration-identity/src/client.ts': [
      'export interface IdentityAccessContext {',
      '  accessToken: string',
      '  accessTokenExpiresAt: string',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  const result = repo.audit()
  assert.ok(result.publicModules.includes('packages/collaboration-identity/src/client.ts'))
  assert.deepEqual(result.findings, [{
    file: 'packages/collaboration-identity/src/client.ts',
    line: 2,
    kind: 'public-secret-token'
  }])
})

test('resolves legacy package main and types entrypoints when exports is absent', (t) => {
  const repo = fixture({
    'packages/public-legacy/package.json': JSON.stringify({
      name: '@fixture/public-legacy',
      main: './dist/index.js',
      types: './dist/index.d.ts'
    }),
    'packages/public-legacy/src/index.ts': 'export interface Session { refreshToken: string }\n'
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [{
    file: 'packages/public-legacy/src/index.ts',
    line: 1,
    kind: 'public-secret-token'
  }])
})

test('does not expose an unselected secret declaration through a named re-export', (t) => {
  const repo = fixture({
    'packages/public-actors/package.json': JSON.stringify({
      name: '@fixture/public-actors',
      exports: './src/index.ts'
    }),
    'packages/public-actors/src/index.ts': "export { SafeActor } from './internal.js'\n",
    'packages/public-actors/src/internal.ts': [
      "export type SafeActor = { kind: 'user'; userId: string }",
      'export type PrivateVerifierInput = { accessToken: string }'
    ].join('\n')
  })
  t.after(repo.close)

  const result = repo.audit()
  assert.ok(result.publicModules.includes('packages/public-actors/src/internal.ts'))
  assert.deepEqual(result.findings, [])
})

test('follows neutral local and imported aliases used by a public contract', (t) => {
  const repo = fixture({
    'packages/public-alias/package.json': JSON.stringify({
      name: '@fixture/public-alias',
      exports: './src/index.ts'
    }),
    'packages/public-alias/src/index.ts': [
      "import type { InternalInput as ImportedInput } from './internal.js'",
      'type LocalInput = { deviceCredential: string }',
      'export type PublicInput = Readonly<{ local: LocalInput; imported: ImportedInput }>'
    ].join('\n'),
    'packages/public-alias/src/internal.ts': 'export type InternalInput = { accessToken: string }\n'
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [{
    file: 'packages/public-alias/src/index.ts',
    line: 2,
    kind: 'public-secret-credential'
  }, {
    file: 'packages/public-alias/src/internal.ts',
    line: 1,
    kind: 'public-secret-token'
  }])
})

test('excludes default declarations from export-star but includes them through a public namespace', (t) => {
  const repo = fixture({
    'packages/star/package.json': JSON.stringify({
      name: '@fixture/star',
      exports: './src/index.ts'
    }),
    'packages/star/src/index.ts': "export * from './internal.js'\n",
    'packages/star/src/internal.ts': 'export default interface PrivateDefault { accessToken: string }\n',
    'packages/namespace/package.json': JSON.stringify({
      name: '@fixture/namespace',
      exports: './src/index.ts'
    }),
    'packages/namespace/src/index.ts': "export * as identities from './internal.js'\n",
    'packages/namespace/src/internal.ts': 'export default interface PublicDefault { accessToken: string }\n'
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [{
    file: 'packages/namespace/src/internal.ts',
    line: 1,
    kind: 'public-secret-token'
  }])
})

test('distinguishes an Authorization header from non-secret authorization facts', (t) => {
  const repo = fixture({
    'packages/public-http/package.json': JSON.stringify({
      name: '@fixture/public-http',
      exports: './src/index.ts'
    }),
    'packages/public-http/src/index.ts': [
      'export interface HttpHeaders { authorization: string }',
      'export const httpHeadersSchema = z.object({ authorization: z.string() })',
      'export interface ContentBinding {',
      '  authorization: { issuer: string; expiresAt: string }',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [{
    file: 'packages/public-http/src/index.ts',
    line: 1,
    kind: 'public-secret-authorization-header'
  }, {
    file: 'packages/public-http/src/index.ts',
    line: 2,
    kind: 'public-secret-authorization-header'
  }])
})

test('proves literal discriminators and boolean action flags without blessing same-name material', (t) => {
  const repo = fixture({
    'packages/public-account/package.json': JSON.stringify({
      name: '@fixture/public-account',
      exports: './src/index.ts'
    }),
    'packages/public-account/src/index.ts': [
      "export type Account = { type: 'apiKey' }",
      'export type RefreshRequest = { refreshToken?: boolean }',
      'export type LeakyKey = { apiKey: string }',
      'export type LeakyToken = { refreshToken?: string }',
      "export type LiteralLeak = { apiKey: 'apiKey' }"
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [{
    file: 'packages/public-account/src/index.ts',
    line: 3,
    kind: 'public-secret-provider-credential'
  }, {
    file: 'packages/public-account/src/index.ts',
    line: 4,
    kind: 'public-secret-token'
  }, {
    file: 'packages/public-account/src/index.ts',
    line: 5,
    kind: 'public-secret-provider-credential'
  }])
})

test('does not taint an IPC boolean action flag but rejects same-name string material', (t) => {
  const repo = fixture({
    'src/renderer/account.ts': [
      "ipcRenderer.invoke('account:refresh', { refreshToken: true, type: 'apiKey' })",
      "ipcRenderer.invoke('account:replace', { refreshToken: 'raw-material' })"
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings.filter((finding) =>
    finding.kind === 'secret-ipc-token'), [{
    file: 'src/renderer/account.ts',
    line: 2,
    kind: 'secret-ipc-token'
  }])
})

test('rejects renaming a credential to generic byte material', (t) => {
  const repo = fixture({
    'packages/public-enrollment/package.json': JSON.stringify({
      name: '@fixture/public-enrollment',
      exports: './src/index.ts'
    }),
    'packages/public-enrollment/src/index.ts': 'export type Enrollment = { credentialBytes: Uint8Array }\n'
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [{
    file: 'packages/public-enrollment/src/index.ts',
    line: 1,
    kind: 'public-secret-credential'
  }])
})

test('treats bearer handles as secrets but allows structurally proven secret-file locators', (t) => {
  const repo = fixture({
    'packages/public-handles/package.json': JSON.stringify({
      name: '@fixture/public-handles',
      exports: './src/index.ts'
    }),
    'packages/public-handles/src/index.ts': [
      'export type PublicHandles = {',
      '  token: string',
      '  accessTokenHandle: string',
      '  providerCredentialReference: string',
      '  providerCredentialDigest: string',
      '  credentialId: string',
      '  privateKeyPath: string',
      '  providerSecretFile: string',
      '  serverSecretFile: string',
      '  resourceHandleId: string',
      '}',
      'export type SecretFileReader = {',
      '  serverSecretFile: { read(): string }',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [{
    file: 'packages/public-handles/src/index.ts',
    line: 2,
    kind: 'public-secret-token'
  }, {
    file: 'packages/public-handles/src/index.ts',
    line: 3,
    kind: 'public-secret-token'
  }, {
    file: 'packages/public-handles/src/index.ts',
    line: 4,
    kind: 'public-secret-provider-credential'
  }, {
    file: 'packages/public-handles/src/index.ts',
    line: 7,
    kind: 'public-secret-private-key'
  }, {
    file: 'packages/public-handles/src/index.ts',
    line: 13,
    kind: 'public-secret-secret'
  }])
})

test('rejects public ports capable of reading or returning raw secrets', (t) => {
  const repo = fixture({
    'packages/public-storage/package.json': JSON.stringify({
      name: '@fixture/public-storage',
      exports: './src/index.ts'
    }),
    'packages/public-storage/src/index.ts': [
      'export type DomainMainProviderCredentialStoreHost = Readonly<{',
      '  replace: (access: unknown, secret: string) => Promise<void>',
      '  use: <T>(access: unknown, operation: (secret: string) => T) => Promise<T>',
      '}>',
      'export type DomainMainPackageSecretStoreHost = Readonly<{',
      '  read: (key: string) => Promise<string | null>',
      '  write: (key: string, value: string) => Promise<void>',
      '}>',
      'export interface HumanEndpointProviderSecretReader {',
      '  readSecret(secretReference: string): Promise<string>',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  const result = repo.audit()
  assert.equal(result.findings.filter((finding) => finding.kind === 'public-secret-authority').length, 3)
  assert.ok(result.findings.some((finding) => finding.kind === 'public-secret-secret'))
})

test('rejects secret-bearing contract, IPC, log, receipt, and ordinary persistence sinks', (t) => {
  const repo = fixture({
    'src/cloud-contract.ts': 'export type CloudRequest = { userCredential: string }\n',
    'src/ipc.ts': [
      'export function cross(ipcRenderer: { send(channel: string, value: unknown): void }, agentCredential: string) {',
      "  ipcRenderer.send('agent', { agentCredential })",
      '}'
    ].join('\n'),
    'src/runtime.ts': [
      'export function leak(logger: { info(value: unknown): void }, providerCredential: string, privateKey: string) {',
      '  logger.info({ providerCredential })',
      "  spawn('provider-cli', [], { env: { PROVIDER_CREDENTIAL: providerCredential } })",
      '  writeFile(privateKey)',
      '}',
      'declare function spawn(command: string, args: string[], options: unknown): void',
      'declare function writeFile(value: string): void'
    ].join('\n'),
    'src/renderer/Panel.tsx': [
      'declare function useState<T>(value: T): [T, (next: T) => void]',
      "const [accessToken] = useState('')"
    ].join('\n'),
    'src/meeting-receipt.ts': [
      'export function persist(writeReceipt: (value: unknown) => void, pollSecret: string) {',
      '  const evidence = { pollSecret }',
      '  writeReceipt({ pollSecret })',
      '  return evidence',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  const kinds = findingKinds(repo.audit())
  assert.ok(kinds.includes('boundary-secret-credential'))
  assert.ok(kinds.includes('boundary-secret-token'))
  assert.ok(kinds.includes('secret-ipc-credential'))
  assert.ok(kinds.includes('secret-log-provider-credential'))
  assert.ok(kinds.includes('secret-process-provider-credential'))
  assert.ok(kinds.includes('secret-receipt-secret'))
  assert.ok(kinds.includes('insecure-secret-persistence-private-key'))
})

test('tracks secret aliases, destructuring, byte wrappers, child stdin, and temporary files', (t) => {
  const repo = fixture({
    'src/runtime.ts': [
      'export function leak(input: { accessToken: string; providerCredential: string }, child: { stdin: { write(value: unknown): void } }) {',
      '  const bytes = Buffer.from(input.accessToken)',
      '  const alias = bytes',
      '  const { providerCredential: opaque } = input',
      "  ipcRenderer.send('secret', alias)",
      '  child.stdin.write(opaque)',
      "  writeFile('/tmp/provider-secret', opaque)",
      '}',
      'declare const ipcRenderer: { send(channel: string, value: unknown): void }',
      'declare function writeFile(path: string, value: unknown): void'
    ].join('\n')
  })
  t.after(repo.close)

  const kinds = findingKinds(repo.audit())
  assert.ok(kinds.includes('secret-ipc-token'))
  assert.ok(kinds.includes('secret-process-provider-credential'))
  assert.ok(kinds.includes('insecure-secret-persistence-provider-credential'))
})

test('does not trust a native-secret-store name outside its owning private runtime', (t) => {
  const repo = fixture({
    'packages/unrelated-domain/src/runtime.ts': [
      'export function persist(nativeSecretStore: { write(key: string, value: string): void }, agentCredential: string) {',
      "  nativeSecretStore.write('agent', agentCredential)",
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [{
    file: 'packages/unrelated-domain/src/runtime.ts',
    line: 2,
    kind: 'insecure-secret-persistence-credential'
  }])
})

test('rejects secret transfer through child argv, environment, process output, and exec callbacks', (t) => {
  const repo = fixture({
    'src/runtime.ts': [
      'export function leak(accessToken: string) {',
      "  spawn('helper', [accessToken], { env: { PROVIDER_TOKEN: accessToken } })",
      '  process.stdout.write(accessToken)',
      "  execFile('helper', [], (_error, stdout) => {",
      '    const { providerCredential } = JSON.parse(stdout)',
      "    nativeSecretStore.write('provider', providerCredential)",
      '  })',
      '}',
      'declare function spawn(command: string, args: string[], options: unknown): void',
      'declare function execFile(command: string, args: string[], callback: (...args: unknown[]) => void): void',
      'declare const nativeSecretStore: { write(key: string, value: string): void }'
    ].join('\n')
  })
  t.after(repo.close)

  const kinds = findingKinds(repo.audit())
  assert.ok(kinds.includes('secret-process-token'))
  assert.ok(kinds.includes('secret-log-token'))
  assert.ok(kinds.includes('secret-process-provider-credential'))
})

test('does not let fake redaction or sealing functions bless secret logging', (t) => {
  const repo = fixture({
    'src/runtime.ts': [
      'export function leak(accessToken: string, providerCredential: string) {',
      '  const masked = redactCredential(accessToken)',
      '  const ciphertext = encrypt(providerCredential)',
      '  console.info(masked)',
      '  console.info(ciphertext)',
      '  console.info(sanitizeToken(accessToken))',
      '  console.info(sealCredential(providerCredential))',
      '}',
      'declare function redactCredential(value: string): string',
      'declare function encrypt(value: string): string',
      'declare function sanitizeToken(value: string): string',
      'declare function sealCredential(value: string): string',
      'export function renameOnly(maskedAccessToken: string, encryptedProviderCredential: string, accessTokenRedacted: string) {',
      '  console.info(maskedAccessToken)',
      '  console.info(encryptedProviderCredential)',
      '  console.info(accessTokenRedacted)',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  const logFindings = repo.audit().findings.filter((finding) => finding.kind.startsWith('secret-log-'))
  assert.deepEqual(logFindings, [{
    file: 'src/runtime.ts',
    line: 4,
    kind: 'secret-log-token'
  }, {
    file: 'src/runtime.ts',
    line: 5,
    kind: 'secret-log-provider-credential'
  }, {
    file: 'src/runtime.ts',
    line: 6,
    kind: 'secret-log-token'
  }, {
    file: 'src/runtime.ts',
    line: 7,
    kind: 'secret-log-provider-credential'
  }, {
    file: 'src/runtime.ts',
    line: 14,
    kind: 'secret-log-token'
  }, {
    file: 'src/runtime.ts',
    line: 15,
    kind: 'secret-log-provider-credential'
  }, {
    file: 'src/runtime.ts',
    line: 16,
    kind: 'secret-log-token'
  }])
})

test('allows a secret to be replaced by a provable presence fact', (t) => {
  const repo = fixture({
    'src/runtime.ts': [
      'export function report(accessToken: string) {',
      '  const tokenPresent = accessToken.length > 0',
      '  console.info({ tokenPresent })',
      '}'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [])
})

test('proves a sealed credential envelope through package exports', (t) => {
  const repo = fixture({
    'packages/contracts/package.json': JSON.stringify({
      name: '@fixture/contracts',
      exports: './src/index.ts'
    }),
    'packages/contracts/src/index.ts': "export * from './protocol.js'\n",
    'packages/contracts/src/protocol.ts': [
      'export const credentialEnvelopeSchema = z.object({',
      "  algorithm: z.literal('fixture-aead'),",
      '  iv: z.string(),',
      '  ciphertext: z.string(),',
      '  authenticationTag: z.string()',
      '}).strict()',
      'export type CredentialEnvelope = z.infer<typeof credentialEnvelopeSchema>'
    ].join('\n'),
    'packages/server/package.json': JSON.stringify({
      name: '@fixture/server',
      exports: './src/index.ts',
      dependencies: { '@fixture/contracts': '1.0.0' }
    }),
    'packages/server/src/index.ts': [
      "import type { CredentialEnvelope } from '@fixture/contracts'",
      'export interface BootstrapResponse { sealedCredential: CredentialEnvelope }'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [])
})

test('allows private runtime use and native secret persistence but not name-only redaction', (t) => {
  const repo = fixture({
    'packages/domains/identity-access/src/main/oidc-runtime.ts': [
      'export async function callCloud(accessToken: string, sessionStore: { save(value: unknown): Promise<void> }) {',
      '  await sessionStore.save({ accessToken })',
      "  return fetch('https://cloud.invalid/v1/me', { headers: { authorization: `Bearer ${accessToken}` } })",
      '}'
    ].join('\n'),
    'packages/domains/opencontent-connector/src/main/provider-runtime.ts': [
      'export async function connect(apiKey: string, secrets: { set(key: string, value: string): Promise<void> }, serverSecretFile: { writeFile(value: string): Promise<void> }) {',
      "  await secrets.set('provider-key', apiKey)",
      '  await serverSecretFile.writeFile(apiKey)',
      '  console.info(redactCredential(apiKey))',
      '}',
      'declare function redactCredential(value: string): string'
    ].join('\n')
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [{
    file: 'packages/domains/opencontent-connector/src/main/provider-runtime.ts',
    line: 4,
    kind: 'secret-log-provider-credential'
  }])
})

test('allows explicit synthetic tests and safe non-secret representations', (t) => {
  const repo = fixture({
    'packages/safe/package.json': JSON.stringify({
      name: '@fixture/safe',
      exports: './src/index.ts'
    }),
    'packages/safe/src/index.ts': [
      'export type RegistrationResult = Readonly<{',
      '  sealedCredential: {',
      '    algorithm: string',
      '    iv: string',
      '    ciphertext: string',
      '    authenticationTag: string',
      '  }',
      '  agentCredentialDigest: string',
      '  providerCredentialFingerprint: string',
      '  accessTokenExpiresAt: string',
      '  credentialGeneration: number',
      '  tokenDigest: string',
      '}>',
      'const envelopeSchema = z.object({',
      "  algorithm: z.literal('fixture-aead'),",
      '  iv: z.string(),',
      '  ciphertext: z.string(),',
      '  authenticationTag: z.string()',
      '})',
      'export const responseSchema = z.object({ sealedCredential: envelopeSchema })',
      'export const INVALID_TEST_ONLY_CREDENTIAL_FIXTURE = {',
      "  accessToken: 'INVALID_TEST_ONLY_ACCESS_VALUE'",
      '}'
    ].join('\n'),
    'packages/safe/src/index.test.ts': [
      "const accessToken = 'sk-THIS_IS_SYNTHETIC_TEST_ONLY_VALUE'",
      'console.log({ accessToken })'
    ].join('\n'),
    'packages/safe/src/test-fixtures/provider.ts': [
      "export const apiKey = 'provider.SYNTHETIC_TEST_ONLY_VALUE'",
      'console.log(apiKey)'
    ].join('\n'),
    'packages/safe/src/test-fixtures/.env': 'PROVIDER_CREDENTIAL=SYNTHETIC_TEST_ONLY_PROVIDER_VALUE\n'
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [])
})

test('does not treat a test path as permission to log an environment secret', (t) => {
  const repo = fixture({
    'src/runtime.test.ts': 'console.log(process.env.OIDC_ACCESS_TOKEN)\n'
  })
  t.after(repo.close)

  assert.deepEqual(repo.audit().findings, [{
    file: 'src/runtime.test.ts',
    line: 1,
    kind: 'secret-log-environment'
  }])
})

test('requires a test credential literal to identify itself as synthetic', (t) => {
  const repo = fixture({
    'src/runtime.test.ts': "const agentCredential = 'agent.Abcdefghijklmnop1234567890Abcdefgh'\n"
  })
  t.after(repo.close)

  const kinds = findingKinds(repo.audit())
  assert.ok(kinds.includes('collaboration-credential-shaped-value'))
  assert.ok(kinds.includes('literal-secret-assignment-credential'))
})

test('rejects credential material committed as a literal or sensitive file', (t) => {
  const repo = fixture({
    'infra/.env': 'PROVIDER_CREDENTIAL=provider.Abcdefghijklmnop1234567890\n',
    'src/runtime.ts': "const agentCredential = 'agent.Abcdefghijklmnop1234567890'\n"
  })
  t.after(repo.close)

  const result = repo.audit()
  assert.ok(result.findings.some((finding) => finding.kind === 'sensitive-file-name'))
  assert.ok(result.findings.some((finding) => finding.kind === 'literal-secret-assignment-credential'))
})

test('CLI reports only redacted location and rule metadata', (t) => {
  const marker = 'agent.DO_NOT_ECHO_Abcdefghijklmnop1234567890'
  const repo = fixture({
    'src/runtime.ts': `const agentCredential = '${marker}'\n`
  })
  t.after(repo.close)

  const result = spawnSync(process.execPath, [auditScript, '--root', repo.root], {
    encoding: 'utf8'
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /literal-secret-assignment-credential/u)
  assert.equal(`${result.stdout}${result.stderr}`.includes(marker), false)
})
