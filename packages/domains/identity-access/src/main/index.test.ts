import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  IDENTITY_CAPABILITY_IDS,
  IDENTITY_RESET_CONFIRMATION
} from '../contract.js'
import {
  createDomainMainEntry,
  createIdentityCapabilityFactory,
  type IdentityCapabilityOptions
} from './index.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Identity main contributions', () => {
  it('declares one UI-only global capability set with governed mutation policies', () => {
    const definitions = createIdentityCapabilityFactory({
      defineCapability: (definition) => definition,
      getService: () => ({}) as never
    }).createDefinitions() as IdentityCapabilityOptions[]
    expect(definitions.map((definition) => definition.id)).toEqual(Object.values(IDENTITY_CAPABILITY_IDS))
    for (const definition of definitions) {
      expect(definition.audiences).toEqual(['ui'])
      expect(definition.scope).toBe('global')
      expect(definition.concurrency.idempotency).toBe(
        definition.effect === 'read' ? 'none' : 'required'
      )
    }
    expect(definitions.find(({ id }) => id === IDENTITY_CAPABILITY_IDS.backupAndReset))
      .toMatchObject({ effect: 'destructive', approval: 'confirmation' })
  })

  it('shares one lazy service between capabilities and Principal provider and rejects Agent calls', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sciforge-identity-main-'))
    roots.push(root)
    const entry = createDomainMainEntry({
      getUserDataDir: () => root,
      getDeviceId: () => 'device-1',
      defineCapability: (definition) => definition
    })
    const factory = entry.contributions[0]!.value as ReturnType<typeof createIdentityCapabilityFactory>
    const provider = entry.contributions[1]!.value as { current(): unknown }
    expect(provider.current()).toBeUndefined()
    const definitions = factory.createDefinitions() as unknown as IdentityCapabilityOptions[]
    const create = definitions.find(({ id }) => id === IDENTITY_CAPABILITY_IDS.createAccount)!
    expect(() => create.handler({ username: 'Alice' }, { caller: { audience: 'agent' } }))
      .toThrow('trusted Human UI')
    const created = await create.handler({ username: 'Alice' }, { caller: { audience: 'ui' } })
    expect(created.output).toMatchObject({ currentAccount: { username: 'Alice' } })
    expect(created).not.toHaveProperty('changed')
    expect(provider.current()).toMatchObject({ assurance: 'local-selection', deviceId: 'device-1' })
    const reset = definitions.find(({ id }) => id === IDENTITY_CAPABILITY_IDS.backupAndReset)!
    expect(reset.inputSchema.safeParse({ secondConfirmation: IDENTITY_RESET_CONFIRMATION }).success).toBe(true)
    entry.contributions[0]!.onDispose?.()
    entry.contributions[1]!.onDispose?.()
  })
})
