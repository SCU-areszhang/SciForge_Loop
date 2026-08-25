import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readServerSecretFile } from './server-secret-file.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('server secret files', () => {
  it('reads one owner-only absolute file without exposing its locator', async () => {
    const root = await temporaryRoot()
    const path = join(root, 'database-url')
    await writeFile(path, 'postgresql://synthetic-user@db.invalid/synthetic\n', { mode: 0o600 })

    await expect(readServerSecretFile(path)).resolves.toBe(
      'postgresql://synthetic-user@db.invalid/synthetic'
    )
  })

  it('rejects relative, symlinked, permissive, empty, and oversized files', async () => {
    const root = await temporaryRoot()
    const target = join(root, 'target')
    const link = join(root, 'link')
    const permissive = join(root, 'permissive')
    const empty = join(root, 'empty')
    const oversized = join(root, 'oversized')
    await writeFile(target, 'synthetic-secret', { mode: 0o600 })
    await symlink(target, link)
    await writeFile(permissive, 'synthetic-secret', { mode: 0o600 })
    await chmod(permissive, 0o640)
    await writeFile(empty, '', { mode: 0o600 })
    await writeFile(oversized, 'x'.repeat(16 * 1024 + 1), { mode: 0o600 })

    for (const path of ['relative', link, permissive, empty, oversized]) {
      await expect(readServerSecretFile(path)).rejects.toThrow(/secret-file|secret file/u)
    }
  })
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sciforge-server-secret-'))
  roots.push(root)
  return root
}
