import type { ReactElement } from 'react'
import {
  RENDERER_WORKBENCH_TOOLBAR_WIDGET_CONTRIBUTION_KIND,
  WORKBENCH_TOPBAR_LOCATION,
  type DomainRendererWorkbenchToolbarWidgetContract,
  type DomainRendererWorkbenchToolbarWidgetRenderContext,
  type DomainRendererWorkbenchToolbarWidgetValue
} from '@sciforge/domain-sdk/renderer'
import {
  RendererSlotRegistry,
  type RegisteredRendererSlotContribution,
  type RendererSlotRegistrationDisposable
} from './renderer-slot-registry'

export const WORKBENCH_TOOLBAR_WIDGET_SLOT = WORKBENCH_TOPBAR_LOCATION
export { RENDERER_WORKBENCH_TOOLBAR_WIDGET_CONTRIBUTION_KIND }

export type WorkbenchToolbarWidgetContribution =
  DomainRendererWorkbenchToolbarWidgetContract &
  DomainRendererWorkbenchToolbarWidgetValue<ReactElement> &
  Readonly<{ id: string }>

type WorkbenchToolbarWidgetSlots = {
  [WORKBENCH_TOOLBAR_WIDGET_SLOT]: WorkbenchToolbarWidgetContribution
}

export type RegisteredWorkbenchToolbarWidgetContribution =
  RegisteredRendererSlotContribution<
    WorkbenchToolbarWidgetSlots,
    typeof WORKBENCH_TOOLBAR_WIDGET_SLOT
  >

export class WorkbenchToolbarWidgetContributionRegistry {
  private readonly slots = new RendererSlotRegistry<WorkbenchToolbarWidgetSlots>()

  register(input: Readonly<{
    id: string
    ownerId: string
    order?: number
    contract: DomainRendererWorkbenchToolbarWidgetContract
    value: DomainRendererWorkbenchToolbarWidgetValue<ReactElement>
  }>): RendererSlotRegistrationDisposable {
    return this.slots.register({
      slot: WORKBENCH_TOOLBAR_WIDGET_SLOT,
      id: input.id,
      ownerId: input.ownerId,
      order: input.order,
      contribution: Object.freeze({
        id: input.id,
        ...input.contract,
        render: (context: DomainRendererWorkbenchToolbarWidgetRenderContext) =>
          input.value.render(context)
      })
    })
  }

  list(): readonly RegisteredWorkbenchToolbarWidgetContribution[] {
    return this.slots.list(WORKBENCH_TOOLBAR_WIDGET_SLOT)
  }

  dispose(): void {
    this.slots.dispose()
  }
}
