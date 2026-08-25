import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  OPENCONTENT_SUPPLIER_SECRET_CHANNEL_FD,
  OPENCONTENT_SUPPLIER_SECRET_CHANNEL_MAX_BYTES,
  encodeOpenContentSupplierSecretEnvelope,
  materializeOpenContentSupplierSecretShim,
  patchOpenContentSupplierSecretAccess
} from './supplier-secret-channel.internal.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ))
})

describe('OpenContent supplier secret channel', () => {
  it('uses the inherited one-shot channel without adding the token to the environment', async () => {
    const fixture = await createShimFixture(String.raw`
      const fs = require('node:fs')
      const token = process.env.SYSTEM_USER_TOKEN
      const legacyKey = ['SYSTEM', 'USER', 'TOKEN'].join('_')
      let replayClosed = false
      try {
        replayClosed = fs.readSync(3, Buffer.alloc(1), 0, 1, null) === 0
      } catch { replayClosed = true }
      process.stdout.write(JSON.stringify({
        tokenMatches: token === 'channel-token',
        legacyTokenAbsent: !Object.hasOwn(process.env, legacyKey),
        replayClosed
      }))
    `)
    const payload = encodeOpenContentSupplierSecretEnvelope('channel-token')
    const result = await runShim(fixture.entrypoint, {
      payload,
      environment: { SYSTEM_USER_TOKEN: 'copied-legacy-token' }
    })
    payload.fill(0)

    expect(result).toEqual({
      exitCode: 0,
      stdout: JSON.stringify({
        tokenMatches: true,
        legacyTokenAbsent: true,
        replayClosed: true
      }),
      stderr: ''
    })
    expect(result.stdout).not.toContain('channel-token')
    expect(result.stderr).not.toContain('channel-token')
    expect(result.stdout).not.toContain('copied-legacy-token')
    expect(result.stderr).not.toContain('copied-legacy-token')
  })

  it('fails closed when the channel is absent even if a legacy token was copied', async () => {
    const fixture = await createShimFixture(
      'process.stdout.write(process.env.SYSTEM_USER_TOKEN)\n'
    )
    const result = await runShim(fixture.entrypoint, {
      environment: { SYSTEM_USER_TOKEN: 'copied-legacy-token' },
      channel: 'absent'
    })

    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).not.toContain('copied-legacy-token')
    expect(result.stderr).toContain('secret channel is unavailable')
  })

  it('fails closed when credential bytes are inherited on the wrong descriptor', async () => {
    const fixture = await createShimFixture(
      'process.stdout.write(process.env.SYSTEM_USER_TOKEN)\n'
    )
    const payload = encodeOpenContentSupplierSecretEnvelope('wrong-fd-token')
    const result = await runShim(fixture.entrypoint, {
      payload,
      channel: 'wrong-fd'
    })
    payload.fill(0)

    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).not.toContain('wrong-fd-token')
    expect(result.stderr).toContain('secret channel is unavailable')
  })

  it('rejects closed, malformed, and oversized channels with bounded diagnostics', async () => {
    const fixture = await createShimFixture(
      'process.stdout.write(process.env.SYSTEM_USER_TOKEN)\n'
    )
    const cases = [
      Buffer.alloc(0),
      Buffer.from(JSON.stringify({
        protocol: 'wrong',
        systemUserToken: 'malformed-token',
        extra: true
      })),
      Buffer.alloc(OPENCONTENT_SUPPLIER_SECRET_CHANNEL_MAX_BYTES + 1, 0x61)
    ]

    for (const payload of cases) {
      const result = await runShim(fixture.entrypoint, { payload })
      expect(result.exitCode).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.stderr.length).toBeLessThan(256)
      expect(result.stderr).not.toContain('malformed-token')
      expect(result.stderr).toContain('secret channel is unavailable')
      payload.fill(0)
    }
  })

  it('blocks raw and encoded credential writes before stdout or stderr', async () => {
    const fixture = await createShimFixture(String.raw`
      const token = process.env.SYSTEM_USER_TOKEN
      const encoded = Buffer.from(token).toString('base64')
      process.stderr.write(encoded.slice(0, 5))
      process.stderr.write(encoded.slice(5))
      process.stdout.write(token)
    `)
    const payload = encodeOpenContentSupplierSecretEnvelope('never-emit token')
    const result = await runShim(fixture.entrypoint, { payload })
    payload.fill(0)

    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).not.toContain('never-emit token')
    expect(result.stderr).not.toContain(encodeURIComponent('never-emit token'))
    expect(result.stderr).not.toContain(Buffer.from('never-emit token').toString('base64'))
  })

  it('rejects a drifted supplier source instead of restoring an environment fallback', () => {
    expect(() => patchOpenContentSupplierSecretAccess(
      'const token = process.env["SYSTEM_USER_TOKEN"]\n'
    )).toThrow('credential access is invalid')
    expect(() => patchOpenContentSupplierSecretAccess(
      'const token = "not supplied"\n'
    )).toThrow('credential access is invalid')
  })
})

async function createShimFixture(source: string): Promise<Readonly<{
  root: string
  entrypoint: string
}>> {
  const root = await mkdtemp(join(tmpdir(), 'sciforge-opencontent-secret-channel-'))
  roots.push(root)
  await mkdir(join(root, 'cli', 'bin'), { recursive: true })
  await writeFile(
    join(root, 'cli', 'bin', 'oc.js'),
    patchOpenContentSupplierSecretAccess(source),
    { mode: 0o500 }
  )
  const entrypoint = await materializeOpenContentSupplierSecretShim(root)
  return Object.freeze({ root, entrypoint })
}

async function runShim(
  entrypoint: string,
  options: Readonly<{
    payload?: Uint8Array
    environment?: NodeJS.ProcessEnv
    channel?: 'present' | 'absent' | 'wrong-fd'
  }>
): Promise<Readonly<{ exitCode: number | null; stdout: string; stderr: string }>> {
  const channel = options.channel ?? 'present'
  const stdio: Array<'ignore' | 'pipe'> = channel === 'wrong-fd'
    ? ['ignore', 'pipe', 'pipe', 'ignore', 'pipe']
    : channel === 'absent'
      ? ['ignore', 'pipe', 'pipe']
      : ['ignore', 'pipe', 'pipe', 'pipe']
  const child: ChildProcess = spawn(process.execPath, [entrypoint], {
    env: options.environment ?? {},
    shell: false,
    stdio
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))

  if (channel !== 'absent') {
    const descriptor = channel === 'wrong-fd'
      ? 4
      : OPENCONTENT_SUPPLIER_SECRET_CHANNEL_FD
    const pipe = child.stdio[descriptor]
    if (pipe && 'end' in pipe) pipe.end(options.payload ?? Buffer.alloc(0))
  }

  const exitCode = await new Promise<number | null>((resolve) => {
    child.once('close', resolve)
  })
  return Object.freeze({
    exitCode,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8')
  })
}
