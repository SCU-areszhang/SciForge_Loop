import { describe, expect, it, vi } from 'vitest'
import type { PrincipalContextSnapshot } from '@sciforge/domain-sdk/principal'
import type { DomainModuleCatalog } from './modules/catalog'
import { createMainPrincipalContext } from './principal-context'

const principal = {
  userId: 'c07f29ee-801d-4cf3-90ef-96c56c65de21',
  assurance: 'local-selection' as const,
  deviceId: 'device-1',
  identityVersion: 2
}

function catalog(values: unknown[]): DomainModuleCatalog {
  return {
    listContributions: () => values.map((value, index) => ({
      value,
      owner: { moduleId: `fixture.${index}`, moduleVersion: '1.0.0' },
      declaration: { id: `fixture.${index}.principal`, kind: 'main.principal-provider', priority: 1 }
    }))
  } as unknown as DomainModuleCatalog
}

describe('main Principal context', () => {
  it('treats a missing provider as signed out and rejects ambiguous authorities', () => {
    expect(createMainPrincipalContext(catalog([])).snapshot()).toEqual({
      identityVersion: 0,
      principal: null
    })
    const provider = {
      current: () => principal,
      snapshot: () => ({ identityVersion: 2, principal }),
      subscribe: () => () => undefined
    }
    expect(() => createMainPrincipalContext(catalog([provider, provider])))
      .toThrow('expected zero or one')
  })

  it('validates provider snapshots and ignores duplicate or stale notifications', () => {
    let publish!: (snapshot: PrincipalContextSnapshot) => void
    const provider = {
      current: () => principal,
      snapshot: () => ({ identityVersion: 2, principal }),
      subscribe: (listener: typeof publish) => {
        publish = listener
        return vi.fn()
      }
    }
    const context = createMainPrincipalContext(catalog([provider]))
    const listener = vi.fn()
    context.subscribe(listener)
    publish({ identityVersion: 2, principal })
    publish({ identityVersion: 2, principal })
    publish({ identityVersion: 1, principal: null })
    publish({ identityVersion: 3, principal: null })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith({ identityVersion: 3, principal: null })
  })
})
