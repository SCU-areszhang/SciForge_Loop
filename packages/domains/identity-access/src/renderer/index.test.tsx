import { describe, expect, it, vi } from 'vitest'
import type { DomainRendererHost } from '@sciforge/domain-sdk/host'
import { IDENTITY_CAPABILITY_IDS, IDENTITY_APPLICATION_OVERLAY_ID } from '../contract.js'
import { createDomainRendererEntry } from './index.js'

describe('Identity renderer entry', () => {
  it('declares overlay, widget, lifecycle, and i18n through the manifest entry', () => {
    const entry = createDomainRendererEntry(rendererHost())
    expect(entry.contributions.map(({ kind }) => kind)).toEqual([
      'renderer.application-overlay',
      'renderer.workbench-toolbar-widget',
      'renderer.lifecycle',
      'renderer.i18n-resource'
    ])
  })

  it('opens one optional first-run overlay after a successful zero-account inspection', async () => {
    const openOverlay = vi.fn()
    const host = rendererHost(openOverlay)
    const entry = createDomainRendererEntry(host)
    const lifecycle = entry.contributions.find(({ kind }) => kind === 'renderer.lifecycle')!
      .value as { activate(): void | (() => void) }
    const dispose = lifecycle.activate()
    await vi.waitFor(() => expect(openOverlay).toHaveBeenCalledWith({
      contributionId: IDENTITY_APPLICATION_OVERLAY_ID,
      payload: { mode: 'first-run' }
    }))
    dispose?.()
  })
})

function rendererHost(openOverlay = vi.fn()): DomainRendererHost {
  return {
    capabilityInvoker: {
      observe: vi.fn(),
      invoke: vi.fn(async (contract) => {
        if (contract.actionId !== IDENTITY_CAPABILITY_IDS.listAccounts) {
          throw new Error(`Unexpected action ${contract.actionId}`)
        }
        return {
          state: {
            status: 'available',
            identityVersion: 0,
            currentAccount: null,
            accountCount: 0,
            firstPromptDismissed: false
          },
          accounts: []
        } as never
      })
    },
    openExternal: vi.fn(),
    application: {
      openOverlay,
      closeOverlay: vi.fn()
    }
  }
}
