import React, { lazy, type ReactElement } from 'react'
import { FolderClosed } from 'lucide-react'
import type { DomainRendererHost } from '@sciforge/domain-sdk/host'
import {
  defineTrustedRendererDomainPackageEntry,
  type DomainRendererCommandHandler,
  type DomainRendererWorkbenchRightPanelValue,
  type DomainRendererWorkbenchToolbarActionValue,
  type TrustedRendererDomainPackageEntry
} from '@sciforge/domain-sdk/renderer'
import {
  CONTENT_SPACE_RENDERER_COMMAND_CONTRIBUTION,
  CONTENT_SPACE_RENDERER_RIGHT_PANEL_CONTRACT,
  CONTENT_SPACE_RENDERER_RIGHT_PANEL_CONTRIBUTION,
  CONTENT_SPACE_RENDERER_TOOLBAR_ACTION_CONTRACT,
  CONTENT_SPACE_RENDERER_TOOLBAR_ACTION_CONTRIBUTION,
  domainPackageDefinition
} from '../definition.js'
import { createContentSpaceCapabilityClient } from './capability-client.js'

const ContentSpacePanel = lazy(() =>
  import('./ContentSpacePanel.js').then((module) => ({ default: module.ContentSpacePanel }))
)

export type ContentSpaceRightPanelContribution =
  DomainRendererWorkbenchRightPanelValue<ReactElement>
export type ContentSpaceToolbarActionContribution =
  DomainRendererWorkbenchToolbarActionValue<typeof FolderClosed>
export type ContentSpaceRendererContribution =
  | ContentSpaceRightPanelContribution
  | ContentSpaceToolbarActionContribution
  | DomainRendererCommandHandler

export function createDomainRendererEntry(
  host: DomainRendererHost
): TrustedRendererDomainPackageEntry<ContentSpaceRendererContribution> {
  const contributionId = CONTENT_SPACE_RENDERER_RIGHT_PANEL_CONTRIBUTION.id
  const client = createContentSpaceCapabilityClient(host.capabilityInvoker)
  const panel: ContentSpaceRightPanelContribution = Object.freeze({
    render: ({ active, className, onCollapse }) => (
      <ContentSpacePanel
        active={active}
        client={client}
        fileTransfers={host.fileTransfers}
        className={className}
        onCollapse={onCollapse}
      />
    )
  })
  const command: DomainRendererCommandHandler = Object.freeze({
    execute: ({ sessionId, payload }) => {
      if (!sessionId || !host.workbench) return
      host.workbench.openRightPanel({
        contributionId,
        sessionId,
        ...(payload === undefined ? {} : {
          activation: { contributionId, revision: 1, payload }
        })
      })
    },
    isAvailable: () => Boolean(host.workbench),
    isActive: ({ activeSurface }) =>
      activeSurface?.kind === 'right-panel' &&
      activeSurface.contributionId === contributionId
  })

  return defineTrustedRendererDomainPackageEntry<ContentSpaceRendererContribution>({
    definition: domainPackageDefinition,
    contributions: [
      {
        ...CONTENT_SPACE_RENDERER_RIGHT_PANEL_CONTRIBUTION,
        contract: CONTENT_SPACE_RENDERER_RIGHT_PANEL_CONTRACT,
        value: panel
      },
      {
        ...CONTENT_SPACE_RENDERER_COMMAND_CONTRIBUTION,
        value: command
      },
      {
        ...CONTENT_SPACE_RENDERER_TOOLBAR_ACTION_CONTRIBUTION,
        contract: CONTENT_SPACE_RENDERER_TOOLBAR_ACTION_CONTRACT,
        value: Object.freeze({ icon: FolderClosed })
      }
    ]
  })
}

export * from './ContentSpacePanel.js'
export * from './capability-client.js'
