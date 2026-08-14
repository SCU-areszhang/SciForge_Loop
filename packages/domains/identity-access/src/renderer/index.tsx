import type { ReactElement } from 'react'
import type { DomainRendererHost } from '@sciforge/domain-sdk/host'
import {
  defineTrustedRendererDomainPackageEntry,
  type DomainRendererApplicationOverlayValue,
  type DomainRendererWorkbenchToolbarWidgetValue,
  type TrustedRendererDomainPackageEntry
} from '@sciforge/domain-sdk/renderer'
import {
  IDENTITY_APPLICATION_OVERLAY_ID
} from '../contract.js'
import {
  IDENTITY_APPLICATION_OVERLAY_CONTRACT,
  IDENTITY_APPLICATION_OVERLAY_CONTRIBUTION,
  IDENTITY_RENDERER_I18N_CONTRIBUTION,
  IDENTITY_RENDERER_LIFECYCLE_CONTRIBUTION,
  IDENTITY_TOOLBAR_WIDGET_CONTRACT,
  IDENTITY_TOOLBAR_WIDGET_CONTRIBUTION,
  domainPackageDefinition
} from '../definition.js'
import { IdentityAccountOverlay } from './IdentityAccountOverlay.js'
import { IdentityAccountWidget } from './IdentityAccountWidget.js'
import { createIdentityRendererClient } from './client.js'
import {
  identityI18nResourceContribution,
  type IdentityI18nResourceContribution
} from './messages.js'
import { IdentityRendererProjection } from './projection.js'

type IdentityRendererLifecycle = Readonly<{
  activate(): void | (() => void)
}>

type IdentityRendererContribution =
  | DomainRendererApplicationOverlayValue<ReactElement>
  | DomainRendererWorkbenchToolbarWidgetValue<ReactElement>
  | IdentityRendererLifecycle
  | IdentityI18nResourceContribution

export function createDomainRendererEntry(
  host: DomainRendererHost
): TrustedRendererDomainPackageEntry<IdentityRendererContribution> {
  if (!host.application) {
    throw new Error('Identity renderer requires the generic application Host surface.')
  }
  const projection = new IdentityRendererProjection(
    createIdentityRendererClient(host.capabilityInvoker)
  )
  const application = host.application
  const overlayValue: DomainRendererApplicationOverlayValue<ReactElement> = Object.freeze({
    render: ({ onClose, payload }) => (
      <IdentityAccountOverlay
        projection={projection}
        firstRun={Boolean(payload && typeof payload === 'object' && !Array.isArray(payload) && payload.mode === 'first-run')}
        onClose={onClose}
      />
    )
  })
  const toolbarWidgetValue: DomainRendererWorkbenchToolbarWidgetValue<ReactElement> =
    Object.freeze({
      render: ({ className }) => (
        <IdentityAccountWidget
          application={application}
          projection={projection}
          className={className}
        />
      )
    })

  return defineTrustedRendererDomainPackageEntry<IdentityRendererContribution>({
    definition: domainPackageDefinition,
    contributions: [
      {
        ...IDENTITY_APPLICATION_OVERLAY_CONTRIBUTION,
        contract: IDENTITY_APPLICATION_OVERLAY_CONTRACT,
        value: overlayValue
      },
      {
        ...IDENTITY_TOOLBAR_WIDGET_CONTRIBUTION,
        contract: IDENTITY_TOOLBAR_WIDGET_CONTRACT,
        value: toolbarWidgetValue
      },
      {
        ...IDENTITY_RENDERER_LIFECYCLE_CONTRIBUTION,
        value: Object.freeze({
          activate: () => {
            let disposed = false
            void projection.load().then((snapshot) => {
              if (
                !disposed &&
                snapshot.state?.status === 'available' &&
                snapshot.state.accountCount === 0 &&
                !snapshot.state.firstPromptDismissed
              ) {
                application.openOverlay({
                  contributionId: IDENTITY_APPLICATION_OVERLAY_ID,
                  payload: { mode: 'first-run' }
                })
              }
            })
            return () => {
              disposed = true
              projection.dispose()
            }
          }
        })
      },
      {
        ...IDENTITY_RENDERER_I18N_CONTRIBUTION,
        value: identityI18nResourceContribution
      }
    ]
  })
}

export * from './client.js'
export * from './projection.js'
export * from './messages.js'
