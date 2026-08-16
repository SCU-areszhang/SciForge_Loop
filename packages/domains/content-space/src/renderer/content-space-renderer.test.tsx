import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DomainRendererCapabilityInvoker } from '@sciforge/domain-sdk/host'
import { CONTENT_SPACE_CAPABILITY_IDS } from '../contract.js'
import { ContentSpacePanel } from './ContentSpacePanel.js'
import {
  createContentSpaceCapabilityClient,
  type ContentSpaceCapabilityClient
} from './capability-client.js'

const idleClient: ContentSpaceCapabilityClient = Object.freeze({
  listProviderInstances: async () => ({ items: [] }),
  describeCapabilities: async () => ({ items: [] }),
  listContainers: async () => ({ items: [] }),
  listEntries: async () => ({ items: [] }),
  observeEntry: async () => { throw new Error('unused') },
  createFolder: async () => { throw new Error('unused') },
  uploadNew: async () => { throw new Error('unused') },
  download: async () => { throw new Error('unused') },
  openPortal: async () => { throw new Error('unused') },
  observeImmutableVersion: async () => ({
    proven: false as const,
    reasonCode: 'provider_contract_missing' as const
  })
})

describe('Content Space renderer', () => {
  it('renders explicit provider/container selection with no default or vendor branch', () => {
    const markup = renderToStaticMarkup(createElement(ContentSpacePanel, {
      active: true,
      client: idleClient
    }))
    expect(markup).toContain('Select a Provider Instance')
    expect(markup).toContain('Select a container')
    expect(markup).toContain('No container selected')
    expect(markup).toContain('Content entries')
    expect(markup).not.toMatch(/opencontent|google|microsoft|dropbox|default provider/iu)
  })

  it('maps renderer requests only to public Content Space capability contracts', async () => {
    const invoke = vi.fn(async (
      contract: { actionId: string },
      _input?: unknown,
      _options?: unknown
    ) => {
      if (contract.actionId === CONTENT_SPACE_CAPABILITY_IDS.listProviderInstances) {
        return { items: [] }
      }
      if (contract.actionId === CONTENT_SPACE_CAPABILITY_IDS.createFolder) {
        return {
          invocationId: 'host_generated_invocation',
          reference: {
            providerInstanceRef: 'provider-instance-alpha',
            containerId: 'container-created'
          }
        }
      }
      return { items: [] }
    })
    const client = createContentSpaceCapabilityClient({
      invoke,
      observe: vi.fn()
    } as unknown as DomainRendererCapabilityInvoker)
    await client.listProviderInstances()
    await client.createFolder({
      providerInstanceRef: 'provider-instance-alpha',
      containerId: 'container-root'
    }, 'New folder')

    expect(invoke.mock.calls.map(([contract]) => contract.actionId)).toEqual([
      CONTENT_SPACE_CAPABILITY_IDS.listProviderInstances,
      CONTENT_SPACE_CAPABILITY_IDS.createFolder
    ])
    expect(invoke.mock.calls[1]?.[2]).toEqual({ approval: { mode: 'confirmation' } })
  })
})
