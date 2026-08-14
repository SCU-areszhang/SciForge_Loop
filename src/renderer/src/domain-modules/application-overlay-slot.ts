import type { ReactElement } from 'react'
import type { DomainPackageJsonValue } from '@sciforge/domain-sdk/contract'
import type { DomainRendererApplicationHost } from '@sciforge/domain-sdk/host'
import {
  APPLICATION_OVERLAY_LOCATION,
  RENDERER_APPLICATION_OVERLAY_CONTRIBUTION_KIND,
  type DomainRendererApplicationOverlayContract,
  type DomainRendererApplicationOverlayRenderContext,
  type DomainRendererApplicationOverlayValue
} from '@sciforge/domain-sdk/renderer'
import {
  RendererSlotRegistry,
  type RegisteredRendererSlotContribution,
  type RendererSlotRegistrationDisposable
} from './renderer-slot-registry'

export const APPLICATION_OVERLAY_SLOT = APPLICATION_OVERLAY_LOCATION
export { RENDERER_APPLICATION_OVERLAY_CONTRIBUTION_KIND }

export type ApplicationOverlayContribution =
  DomainRendererApplicationOverlayContract &
  DomainRendererApplicationOverlayValue<ReactElement> &
  Readonly<{ id: string }>

type ApplicationOverlaySlots = {
  [APPLICATION_OVERLAY_SLOT]: ApplicationOverlayContribution
}

export type RegisteredApplicationOverlayContribution =
  RegisteredRendererSlotContribution<
    ApplicationOverlaySlots,
    typeof APPLICATION_OVERLAY_SLOT
  >

export type ActiveApplicationOverlay = Readonly<{
  registration: RegisteredApplicationOverlayContribution
  payload?: DomainPackageJsonValue
}>

export class ApplicationOverlayContributionRegistry {
  private readonly slots = new RendererSlotRegistry<ApplicationOverlaySlots>()
  private readonly listeners = new Set<() => void>()
  private active: ActiveApplicationOverlay | null = null

  register(input: Readonly<{
    id: string
    ownerId: string
    order?: number
    contract: DomainRendererApplicationOverlayContract
    value: DomainRendererApplicationOverlayValue<ReactElement>
  }>): RendererSlotRegistrationDisposable {
    const registration = this.slots.register({
      slot: APPLICATION_OVERLAY_SLOT,
      id: input.id,
      ownerId: input.ownerId,
      order: input.order,
      contribution: Object.freeze({
        id: input.id,
        ...input.contract,
        render: (context: DomainRendererApplicationOverlayRenderContext) =>
          input.value.render(context)
      })
    })
    return {
      dispose: () => {
        const wasActive = this.active?.registration.id === input.id
        registration.dispose()
        if (wasActive) {
          this.active = null
          this.emit()
        }
      }
    }
  }

  list(): readonly RegisteredApplicationOverlayContribution[] {
    return this.slots.list(APPLICATION_OVERLAY_SLOT)
  }

  resolve(id: string | null | undefined): RegisteredApplicationOverlayContribution | null {
    const normalized = id?.trim()
    return normalized ? this.slots.get(APPLICATION_OVERLAY_SLOT, normalized) : null
  }

  open(ownerId: string, contributionId: string, payload?: DomainPackageJsonValue): void {
    const registration = this.resolve(contributionId)
    if (!registration) throw new Error(`Unknown application overlay "${contributionId}".`)
    if (registration.ownerId !== ownerId) {
      throw new Error(
        `Domain "${ownerId}" cannot open application overlay owned by "${registration.ownerId}".`
      )
    }
    this.active = Object.freeze({
      registration,
      ...(payload === undefined ? {} : { payload })
    })
    this.emit()
  }

  close(ownerId: string, contributionId: string): void {
    const registration = this.resolve(contributionId)
    if (registration && registration.ownerId !== ownerId) {
      throw new Error(
        `Domain "${ownerId}" cannot close application overlay owned by "${registration.ownerId}".`
      )
    }
    if (this.active?.registration.id !== contributionId) return
    if (this.active.registration.ownerId !== ownerId) {
      throw new Error(`Domain "${ownerId}" cannot close another domain's application overlay.`)
    }
    this.active = null
    this.emit()
  }

  snapshot = (): ActiveApplicationOverlay | null => this.active

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.active = null
    this.slots.dispose()
    this.emit()
    this.listeners.clear()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

let activeRegistry: ApplicationOverlayContributionRegistry | null = null

export function bindApplicationOverlayRegistry(
  registry: ApplicationOverlayContributionRegistry
): () => void {
  const previousRegistry = activeRegistry
  activeRegistry = registry
  return () => {
    if (activeRegistry === registry) activeRegistry = previousRegistry
  }
}

export function createDomainRendererApplicationHost(
  ownerId: string
): DomainRendererApplicationHost {
  return Object.freeze({
    openOverlay: ({ contributionId, payload }) => {
      if (!activeRegistry) throw new Error('Application overlay registry is not ready.')
      activeRegistry.open(ownerId, contributionId, payload)
    },
    closeOverlay: ({ contributionId }) => {
      if (!activeRegistry) throw new Error('Application overlay registry is not ready.')
      activeRegistry.close(ownerId, contributionId)
    }
  })
}
