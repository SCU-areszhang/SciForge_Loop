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
    close: () => rmSync(root, { recursive: true, force: true })
  }
}

function findingKinds(result) {
  return result.findings.map((finding) => finding.kind)
}

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

test('treats bearer handles and references as secrets unless they are non-authorizing metadata', (t) => {
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
    line: 8,
    kind: 'public-secret-secret'
  }, {
    file: 'packages/public-handles/src/index.ts',
    line: 9,
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

test('allows private runtime use, native secret persistence, and redacted logging', (t) => {
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

  assert.deepEqual(repo.audit().findings, [])
})

test('allows explicit synthetic tests and safe non-secret representations', (t) => {
  const repo = fixture({
    'packages/safe/package.json': JSON.stringify({
      name: '@fixture/safe',
      exports: './src/index.ts'
    }),
    'packages/safe/src/index.ts': [
      'export type RegistrationResult = Readonly<{',
      '  sealedCredential: { ciphertext: string }',
      '  agentCredentialDigest: string',
      '  providerCredentialFingerprint: string',
      '  accessTokenExpiresAt: string',
      '  credentialGeneration: number',
      '  tokenDigest: string',
      '}>',
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
