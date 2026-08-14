import {
  chmodSync,
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { IDENTITY_RESET_CONFIRMATION, IdentityValidationError } from '../contract.js'
import { IdentityService } from './service.js'
import { IdentityStore, IdentityStoreOpenError } from './store.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'sciforge-identity-'))
  roots.push(root)
  return root
}

describe('IdentityStore', () => {
  it('persists immutable UUID accounts, selection, rename, exit, and monotonically ordered state', () => {
    const root = temporaryRoot()
    const store = IdentityStore.open(root)
    const created = store.createAccount('  张三 7  ')
    expect(created.currentAccount?.username).toBe('张三 7')
    expect(created.currentAccount?.userId).toMatch(/^[0-9a-f-]{36}$/)
    const userId = created.currentAccount!.userId
    const renamed = store.renameAccount(userId, 'Researcher_7')
    expect(renamed.currentAccount).toMatchObject({ userId, username: 'Researcher_7' })
    expect(renamed.identityVersion).toBeGreaterThan(created.identityVersion)
    const exited = store.exitAccount()
    expect(exited.currentAccount).toBeNull()
    store.close()

    const reopened = IdentityStore.open(root)
    expect(reopened.listAccounts()).toEqual([
      expect.objectContaining({ userId, username: 'Researcher_7' })
    ])
    expect(reopened.state()).toMatchObject({ currentAccount: null, identityVersion: exited.identityVersion })
    reopened.selectAccount(userId)
    reopened.close()

    const restored = IdentityStore.open(root)
    expect(restored.state().currentAccount?.userId).toBe(userId)
    restored.close()
  })

  it('rejects case-insensitive conflicts and invalid names without changing state', () => {
    const store = IdentityStore.open(temporaryRoot())
    store.createAccount('Alice')
    const before = store.state()
    expect(() => store.createAccount(' alice ')).toThrowError(IdentityValidationError)
    expect(() => store.createAccount('bad/name')).toThrowError(IdentityValidationError)
    expect(store.state()).toEqual(before)
    store.close()
  })

  it('classifies corruption without replacing the original database', () => {
    const root = temporaryRoot()
    const store = IdentityStore.open(root)
    const path = store.databasePath
    store.close()
    const handle = openSync(path, 'r+')
    writeSync(handle, Buffer.alloc(200, 0xff), 0, 200, 4_096)
    closeSync(handle)
    const original = readFileSync(path)
    try {
      IdentityStore.open(root)
      throw new Error('Expected integrity failure.')
    } catch (error) {
      expect(error).toBeInstanceOf(IdentityStoreOpenError)
      expect((error as IdentityStoreOpenError).reason).toBe('integrity-failed')
    }
    expect(readFileSync(path)).toEqual(original)
  })

  it('classifies unsupported migrations without modifying the database', () => {
    const root = temporaryRoot()
    const store = IdentityStore.open(root)
    const path = store.databasePath
    store.close()
    const database = new DatabaseSync(path)
    database.exec('PRAGMA user_version = 99')
    database.close()
    const original = readFileSync(path)
    try {
      IdentityStore.open(root)
      throw new Error('Expected migration failure.')
    } catch (error) {
      expect(error).toBeInstanceOf(IdentityStoreOpenError)
      expect((error as IdentityStoreOpenError).reason).toBe('migration-failed')
    }
    expect(readFileSync(path)).toEqual(original)
  })
})

describe('IdentityService', () => {
  it('publishes only committed higher-version local-selection snapshots', () => {
    const service = new IdentityService(temporaryRoot(), 'device-installation-1')
    const snapshots: unknown[] = []
    const dispose = service.subscribe((snapshot) => snapshots.push(snapshot))
    const created = service.createAccount('Alice')
    service.selectAccount(created.currentAccount!.userId)
    service.renameAccount(created.currentAccount!.userId, 'Alice 2')
    service.exitAccount()
    expect(snapshots).toHaveLength(3)
    expect(snapshots[0]).toMatchObject({
      principal: { userId: created.currentAccount!.userId, assurance: 'local-selection', deviceId: 'device-installation-1' }
    })
    expect(snapshots.at(-1)).toMatchObject({ principal: null })
    dispose()
    service.close()
  })

  it('serializes concurrently scheduled mutations and keeps repeated selection idempotent', async () => {
    const service = new IdentityService(temporaryRoot(), 'device-installation-1')
    const created = await Promise.all(['甲', '乙', 'Gamma'].map((username) =>
      Promise.resolve().then(() => service.createAccount(username))
    ))
    expect(new Set(service.listAccounts().accounts.map(({ username }) => username)))
      .toEqual(new Set(['甲', '乙', 'Gamma']))
    const selected = service.selectAccount(created[0]!.currentAccount!.userId)
    const repeated = service.selectAccount(created[0]!.currentAccount!.userId)
    expect(repeated.identityVersion).toBe(selected.identityVersion)
    service.close()
  })

  it('fails closed on corruption and resets only after a verified backup', () => {
    const root = temporaryRoot()
    const store = IdentityStore.open(root)
    const path = store.databasePath
    store.close()
    writeFileSync(path, 'corrupt identity database')

    const service = new IdentityService(root, 'device-installation-1')
    expect(service.inspect()).toMatchObject({ status: 'unavailable', recoveryAvailable: true })
    expect(service.current()).toBeUndefined()
    expect(() => service.backupAndReset('wrong')).toThrowError(IdentityValidationError)
    const recovered = service.backupAndReset(IDENTITY_RESET_CONFIRMATION)
    expect(recovered.state).toMatchObject({ accountCount: 0, currentAccount: null })
    expect(readFileSync(recovered.backupPath).toString()).toBe('corrupt identity database')
    expect(service.current()).toBeUndefined()
    service.close()
  })

  it('refuses reset without overwriting the original when backup creation fails', () => {
    const root = temporaryRoot()
    const store = IdentityStore.open(root)
    const path = store.databasePath
    store.close()
    writeFileSync(path, 'corrupt identity database')
    const service = new IdentityService(root, 'device-installation-1')
    const directory = join(root, 'identity-access')
    chmodSync(directory, 0o500)
    try {
      expect(() => service.backupAndReset(IDENTITY_RESET_CONFIRMATION))
        .toThrowError(IdentityValidationError)
      expect(readFileSync(path).toString()).toBe('corrupt identity database')
      expect(service.inspect()).toMatchObject({ status: 'unavailable' })
    } finally {
      chmodSync(directory, 0o700)
      service.close()
    }
  })
})
