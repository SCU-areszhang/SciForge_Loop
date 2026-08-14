import { createHash, randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  workspaceLocatorSchema,
  type WorkspaceLocator
} from '@sciforge/domain-sdk/workspace-host'
import {
  CAPABILITY_BROKER_CONTRACT_VERSION,
  capabilityDiscoveryQuerySchema,
  capabilityEventQuerySchema,
  capabilityInvocationRequestSchema,
  capabilityObserveRequestSchema,
  capabilityReadinessRequestSchema,
  capabilityReadinessSchema,
  capabilityResourceBindRequestSchema,
  capabilityResourceHandleSchema,
  type CapabilityApprovalGrant,
  type CapabilityCallerContextInput,
  type CapabilityResourceChangeEvent
} from '../../shared/capability-broker'
import type { PrincipalSnapshot } from '@sciforge/domain-sdk/principal'
import type { CapabilityBroker } from './broker'

export const CAPABILITY_IPC_CHANNELS = Object.freeze({
  readiness: 'capability:readiness',
  discover: 'capability:discover',
  observe: 'capability:observe',
  bind: 'capability:bind',
  invoke: 'capability:invoke',
  events: 'capability:events',
  subscribe: 'capability:subscribe',
  unsubscribe: 'capability:unsubscribe',
  event: 'capability:event'
} as const)

const workspaceIdSchema = z.string().trim().min(1).max(4_096)
const capabilityDiscoverIpcSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  query: capabilityDiscoveryQuerySchema.optional()
}).strict()
const capabilityObserveIpcSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  request: capabilityObserveRequestSchema
}).strict()
const capabilityBindIpcSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  request: capabilityResourceBindRequestSchema
}).strict()
const capabilityInvokeIpcSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  workspaceLocator: workspaceLocatorSchema.optional(),
  request: capabilityInvocationRequestSchema,
  approval: z.object({ mode: z.enum(['confirmation']) }).strict().optional()
}).strict()
const capabilityEventsIpcSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  query: capabilityEventQuerySchema.optional()
}).strict()
const capabilitySubscribeIpcSchema = z.object({ workspaceId: workspaceIdSchema.optional() }).strict()
const capabilityUnsubscribeIpcSchema = z.object({ subscriptionId: z.string().uuid() }).strict()
const capabilityResourceContentPayloadSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  resource: capabilityResourceHandleSchema
}).strict()
const capabilityResourceContentRangePayloadSchema = capabilityResourceContentPayloadSchema.extend({
  range: z.object({
    offset: z.number().int().nonnegative(),
    length: z.number().int().positive()
  }).strict()
}).strict()

type CapabilityIpcSender = {
  id: number
  trustedRendererTransport?: 'dev-browser'
  send: (channel: string, ...args: unknown[]) => void
  once: (event: 'destroyed', listener: () => void) => unknown
  isDestroyed: () => boolean
}
type CapabilityIpcEvent = {
  sender: CapabilityIpcSender
  senderFrame?: Readonly<{ url?: string }> | null
}
type CapabilityIpcHandler = (event: CapabilityIpcEvent, payload: unknown) => unknown
type CapabilityIpcMain = Pick<typeof ipcMain, 'handle' | 'removeHandler'>

export type RegisterCapabilityIpcOptions = {
  broker: CapabilityBroker
  isTrustedIpcSender: (event: CapabilityIpcEvent) => boolean
  getPrincipal?: () => PrincipalSnapshot | undefined
  ipc?: CapabilityIpcMain
  onCallerDestroyed?: (callerId: string) => void
}

export type CapabilityIpcRegistration = {
  dispose: () => void
  handles: (channel: string) => boolean
  invoke: (channel: string, payload: unknown, sender: CapabilityIpcSender) => Promise<unknown>
  resourceContent: {
    describe: (payload: unknown, sender: CapabilityIpcSender) => Promise<unknown>
    readRange: (payload: unknown, sender: CapabilityIpcSender) => Promise<unknown>
  }
}

type Subscription = {
  sender: CapabilityIpcSender
  dispose: () => void
}

function uiCaller(
  sender: CapabilityIpcSender,
  workspaceId?: string,
  approvals: CapabilityApprovalGrant[] = [],
  workspaceLocator?: WorkspaceLocator,
  principal?: PrincipalSnapshot
): CapabilityCallerContextInput {
  return {
    audience: 'ui',
    callerId: `window:${sender.id}`,
    ...(workspaceId ? { workspaceId } : {}),
    ...(workspaceLocator ? { workspaceLocator } : {}),
    ...(principal ? { principal } : {}),
    approvals
  }
}

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  return schema.parse(payload ?? {})
}

export function registerCapabilityIpc(options: RegisterCapabilityIpcOptions): CapabilityIpcRegistration {
  const ipc = options.ipc ?? ipcMain
  const subscriptions = new Map<string, Subscription>()
  const watchedCallerIds = new Set<number>()
  const invokeHandlers = new Map<string, CapabilityIpcHandler>()
  const channels = Object.values(CAPABILITY_IPC_CHANNELS).filter((channel) => channel !== CAPABILITY_IPC_CHANNELS.event)
  const caller = (
    sender: CapabilityIpcSender,
    workspaceId?: string,
    approvals: CapabilityApprovalGrant[] = [],
    workspaceLocator?: WorkspaceLocator
  ) => uiCaller(
    sender,
    workspaceId,
    approvals,
    workspaceLocator,
    options.getPrincipal?.()
  )

  const handle = (channel: string, handler: CapabilityIpcHandler): void => {
    invokeHandlers.set(channel, handler)
    ipc.removeHandler(channel)
    ipc.handle(channel, (event, payload) => {
      if (!options.isTrustedIpcSender(event)) {
        throw new Error('Rejected capability IPC invocation from an untrusted renderer.')
      }
      watchCaller(event.sender)
      return handler(event, payload)
    })
  }

  const watchCaller = (sender: CapabilityIpcSender): void => {
    if (watchedCallerIds.has(sender.id)) return
    watchedCallerIds.add(sender.id)
    sender.once('destroyed', () => {
      watchedCallerIds.delete(sender.id)
      options.onCallerDestroyed?.(`window:${sender.id}`)
    })
  }

  handle(CAPABILITY_IPC_CHANNELS.discover, (event, payload) => {
    const input = parse(capabilityDiscoverIpcSchema, payload)
    return options.broker.discover(caller(event.sender, input.workspaceId), input.query)
  })
  handle(CAPABILITY_IPC_CHANNELS.readiness, (event, payload) => {
    const input = parse(capabilityReadinessRequestSchema, payload)
    const descriptors = options.broker.discover(caller(event.sender, input.workspaceId))
    const availableCapabilityIds = descriptors.map((descriptor) => descriptor.id).sort()
    const available = new Set(availableCapabilityIds)
    const missingCapabilityIds = input.requiredCapabilityIds
      .filter((id) => !available.has(id))
      .sort()
    const status = input.expectedContractVersion !== CAPABILITY_BROKER_CONTRACT_VERSION
      ? 'incompatible'
      : missingCapabilityIds.length > 0
        ? 'incomplete'
        : 'ready'
    const registryFingerprint = createHash('sha256')
      .update(JSON.stringify(descriptors.map((descriptor) => ({
        contractVersion: descriptor.contractVersion,
        id: descriptor.id,
        version: descriptor.version
      }))))
      .digest('hex')
    const message = status === 'incompatible'
      ? `Capability broker contract mismatch: renderer expects ${input.expectedContractVersion}, main provides ${CAPABILITY_BROKER_CONTRACT_VERSION}.`
      : status === 'incomplete'
        ? `Capability registry is missing required operations: ${missingCapabilityIds.join(', ')}.`
        : `Capability broker is ready with ${availableCapabilityIds.length} UI operation${availableCapabilityIds.length === 1 ? '' : 's'}.`

    return capabilityReadinessSchema.parse({
      contractVersion: CAPABILITY_BROKER_CONTRACT_VERSION,
      status,
      registryFingerprint,
      availableCapabilityIds,
      missingCapabilityIds,
      message
    })
  })
  handle(CAPABILITY_IPC_CHANNELS.observe, (event, payload) => {
    const input = parse(capabilityObserveIpcSchema, payload)
    return options.broker.observe(caller(event.sender, input.workspaceId), input.request)
  })
  handle(CAPABILITY_IPC_CHANNELS.bind, (event, payload) => {
    const input = parse(capabilityBindIpcSchema, payload)
    return options.broker.bindResourceRef(
      caller(event.sender, input.workspaceId),
      input.request.resourceRef
    )
  })
  handle(CAPABILITY_IPC_CHANNELS.invoke, (event, payload) => {
    const input = parse(capabilityInvokeIpcSchema, payload)
    const approvals: CapabilityApprovalGrant[] = input.approval && input.request.invocationId
      ? [{
          actionId: input.request.actionId,
          invocationId: input.request.invocationId,
          mode: input.approval.mode
        }]
      : []
    return options.broker.invoke(
      caller(event.sender, input.workspaceId, approvals, input.workspaceLocator),
      input.request
    )
  })
  handle(CAPABILITY_IPC_CHANNELS.events, (event, payload) => {
    const input = parse(capabilityEventsIpcSchema, payload)
    return options.broker.listEvents(caller(event.sender, input.workspaceId), input.query)
  })
  handle(CAPABILITY_IPC_CHANNELS.subscribe, (event, payload) => {
    const input = parse(capabilitySubscribeIpcSchema, payload)
    const subscriptionId = randomUUID()
    const sender = event.sender
    const dispose = options.broker.subscribe(caller(sender, input.workspaceId), (change) => {
      if (sender.isDestroyed()) return
      sender.send(CAPABILITY_IPC_CHANNELS.event, {
        subscriptionId,
        event: change satisfies CapabilityResourceChangeEvent
      })
    })
    subscriptions.set(subscriptionId, { sender, dispose })
    sender.once('destroyed', () => {
      const subscription = subscriptions.get(subscriptionId)
      if (!subscription) return
      subscription.dispose()
      subscriptions.delete(subscriptionId)
    })
    return { subscriptionId }
  })
  handle(CAPABILITY_IPC_CHANNELS.unsubscribe, (event, payload) => {
    const { subscriptionId } = parse(capabilityUnsubscribeIpcSchema, payload)
    const subscription = subscriptions.get(subscriptionId)
    if (!subscription || subscription.sender.id !== event.sender.id) return false
    subscription.dispose()
    subscriptions.delete(subscriptionId)
    return true
  })

  return {
    handles: (channel) => invokeHandlers.has(channel),
    invoke: async (channel, payload, sender) => {
      const handler = invokeHandlers.get(channel)
      if (!handler) throw new Error(`Unknown capability bridge channel: ${channel}`)
      const event = { sender }
      if (!options.isTrustedIpcSender(event)) {
        throw new Error('Rejected capability bridge invocation from an untrusted renderer.')
      }
      watchCaller(sender)
      return await handler(event, payload)
    },
    resourceContent: {
      describe: async (payload, sender) => {
        if (!options.isTrustedIpcSender({ sender })) {
          throw new Error('Rejected capability content request from an untrusted renderer.')
        }
        const input = parse(capabilityResourceContentPayloadSchema, payload)
        return await options.broker.describeResourceContent(
          caller(sender, input.workspaceId),
          input.resource
        )
      },
      readRange: async (payload, sender) => {
        if (!options.isTrustedIpcSender({ sender })) {
          throw new Error('Rejected capability content request from an untrusted renderer.')
        }
        const input = parse(capabilityResourceContentRangePayloadSchema, payload)
        return await options.broker.readResourceContentRange(
          caller(sender, input.workspaceId),
          input.resource,
          input.range
        )
      }
    },
    dispose: () => {
      for (const channel of channels) ipc.removeHandler(channel)
      for (const subscription of subscriptions.values()) subscription.dispose()
      subscriptions.clear()
      watchedCallerIds.clear()
      invokeHandlers.clear()
    }
  }
}
