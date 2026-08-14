import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  ApplicationOverlayContributionRegistry,
  bindApplicationOverlayRegistry,
  createDomainRendererApplicationHost
} from './application-overlay-slot'

describe('application overlay slot', () => {
  it('enforces package ownership and clears active state on registration disposal', () => {
    const registry = new ApplicationOverlayContributionRegistry()
    const unbind = bindApplicationOverlayRegistry(registry)
    const registration = registry.register({
      id: 'fixture.account-overlay',
      ownerId: 'fixture.identity',
      contract: { location: 'application.overlay', title: 'Account' },
      value: { render: () => createElement('div') }
    })
    const listener = vi.fn()
    registry.subscribe(listener)
    const identityHost = createDomainRendererApplicationHost('fixture.identity')
    identityHost.openOverlay({
      contributionId: 'fixture.account-overlay',
      payload: { mode: 'first-run' }
    })
    expect(registry.snapshot()).toMatchObject({
      registration: { id: 'fixture.account-overlay', ownerId: 'fixture.identity' },
      payload: { mode: 'first-run' }
    })
    expect(() => createDomainRendererApplicationHost('fixture.other').closeOverlay({
      contributionId: 'fixture.account-overlay'
    })).toThrow("cannot close application overlay")
    registration.dispose()
    expect(registry.snapshot()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
    unbind()
    registry.dispose()
  })

  it('rejects unknown overlay IDs without changing active state', () => {
    const registry = new ApplicationOverlayContributionRegistry()
    const unbind = bindApplicationOverlayRegistry(registry)
    expect(() => createDomainRendererApplicationHost('fixture.identity').openOverlay({
      contributionId: 'fixture.missing'
    })).toThrow('Unknown application overlay')
    expect(registry.snapshot()).toBeNull()
    unbind()
    registry.dispose()
  })
})
