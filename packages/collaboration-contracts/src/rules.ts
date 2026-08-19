import { z } from 'zod'
import {
  idempotencyKeySchema,
  receiptIdSchema,
  revisionSchema,
  sha256Schema
} from './core.js'
import type { ProviderIdentity } from './provider.js'

export const STATE_TRANSITIONS = {
  user: {
    active: ['suspended', 'revoked'],
    suspended: ['active', 'revoked'],
    revoked: []
  },
  endpoint: {
    active: ['suspended', 'revoked'],
    suspended: ['active', 'revoked'],
    revoked: []
  },
  oidc_identity: {
    active: ['revoked'],
    revoked: []
  },
  device_enrollment: {
    pending: ['consumed', 'expired'],
    consumed: [],
    expired: []
  },
  device: {
    active: ['revoked'],
    revoked: []
  },
  zulip_binding_request: {
    pending: ['confirmed', 'expired'],
    confirmed: [],
    expired: []
  },
  external_identity: {
    active: ['revoked'],
    revoked: []
  },
  ['agent']: {
    active: ['revoked'],
    revoked: []
  },
  participant: {
    incomplete: ['active', 'suspended', 'revoked'],
    active: ['incomplete', 'suspended', 'revoked'],
    suspended: ['incomplete', 'active', 'revoked'],
    revoked: []
  },
  projection: {
    active: ['paused', 'error', 'closed'],
    paused: ['active', 'error', 'closed'],
    error: ['active', 'paused', 'closed'],
    closed: []
  },
  project_input: {
    queued: ['processed', 'rejected', 'expired'],
    processed: [],
    rejected: [],
    expired: []
  },
  project: {
    draft: ['active', 'cancelled'],
    active: ['paused', 'completed', 'cancelled'],
    paused: ['active', 'cancelled'],
    completed: [],
    cancelled: []
  },
  project_endpoint_binding: {
    active: ['error', 'closed'],
    error: ['active', 'closed'],
    closed: []
  },
  task: {
    offered: ['offered', 'accepted', 'rejected', 'cancelled'],
    accepted: ['offered', 'running', 'rejected', 'cancelled'],
    rejected: ['offered'],
    running: ['offered', 'needs_human', 'succeeded', 'failed', 'cancelled'],
    needs_human: ['offered', 'running', 'failed', 'cancelled'],
    succeeded: ['offered'],
    failed: ['offered'],
    cancelled: []
  },
  project_record: {
    proposed: ['accepted', 'rejected', 'superseded'],
    accepted: [],
    rejected: ['superseded'],
    superseded: []
  },
  resource_ref: {
    available: ['unavailable', 'revoked', 'invalidated'],
    unavailable: ['available', 'revoked'],
    revoked: ['available', 'unavailable'],
    invalidated: []
  },
  human_needed: {
    pending: ['answered', 'expired', 'cancelled'],
    answered: [],
    expired: [],
    cancelled: []
  },
  inbox: {
    pending: ['acknowledged', 'superseded'],
    acknowledged: [],
    superseded: []
  },
  action_confirmation: {
    approved: ['consumed', 'superseded'],
    consumed: [],
    superseded: []
  }
} as const

export type StateMachineName = keyof typeof STATE_TRANSITIONS

export function canTransition(
  machine: StateMachineName,
  from: string,
  to: string
): boolean {
  const transitions = STATE_TRANSITIONS[machine] as Readonly<Record<string, readonly string[]>>
  return transitions[from]?.includes(to) ?? false
}

export const stateTransitionSchema = z.object({
  machine: z.enum(Object.keys(STATE_TRANSITIONS) as [StateMachineName, ...StateMachineName[]]),
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64)
}).strict().superRefine((transition, context) => {
  if (!canTransition(transition.machine, transition.from, transition.to)) {
    context.addIssue({
      code: 'custom',
      message: `Invalid ${transition.machine} transition: ${transition.from} -> ${transition.to}`
    })
  }
})
export type StateTransition = z.infer<typeof stateTransitionSchema>

export const revisionCheckSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('match'),
    currentRevision: revisionSchema,
    nextRevision: revisionSchema
  }).strict(),
  z.object({
    outcome: z.literal('conflict'),
    expectedRevision: revisionSchema,
    currentRevision: revisionSchema
  }).strict()
])
export type RevisionCheck = z.infer<typeof revisionCheckSchema>

export function checkExpectedRevision(expectedRevision: number, currentRevision: number): RevisionCheck {
  if (expectedRevision === currentRevision) {
    return revisionCheckSchema.parse({
      outcome: 'match',
      currentRevision,
      nextRevision: currentRevision + 1
    })
  }
  return revisionCheckSchema.parse({ outcome: 'conflict', expectedRevision, currentRevision })
}

export const idempotencyRecordSchema = z.object({
  actorKey: z.string().min(1).max(256),
  idempotencyKey: idempotencyKeySchema,
  requestHash: sha256Schema,
  receiptId: receiptIdSchema
}).strict()
export type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>

export const idempotencyReconciliationSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('new') }).strict(),
  z.object({ outcome: z.literal('duplicate'), receiptId: receiptIdSchema }).strict(),
  z.object({ outcome: z.literal('conflict'), receiptId: receiptIdSchema }).strict()
])
export type IdempotencyReconciliation = z.infer<typeof idempotencyReconciliationSchema>

export function reconcileIdempotency(
  existing: IdempotencyRecord | undefined,
  candidate: Omit<IdempotencyRecord, 'receiptId'>
): IdempotencyReconciliation {
  if (existing === undefined) return { outcome: 'new' }
  if (existing.actorKey !== candidate.actorKey || existing.idempotencyKey !== candidate.idempotencyKey) {
    return { outcome: 'new' }
  }
  return existing.requestHash === candidate.requestHash
    ? { outcome: 'duplicate', receiptId: existing.receiptId }
    : { outcome: 'conflict', receiptId: existing.receiptId }
}

export function providerIdentityKey(identity: ProviderIdentity): string {
  return [identity.provider, identity.realmId, identity.providerUserId]
    .map((part) => `${part.length}:${part}`)
    .join('|')
}

export const STABLE_ENTITY_ID_FIELDS = {
  user_principal: 'userId',
  human_endpoint_binding: 'humanEndpointId',
  oidc_identity: 'identityId',
  device_enrollment: 'enrollmentId',
  device: 'deviceId',
  zulip_binding_request: 'bindingRequestId',
  external_identity: 'externalIdentityId',
  agent_node: 'agentId',
  agent_capability_profile: 'agentId',
  participant_profile: 'participantId',
  remote_session_projection: 'projectionId',
  project_input: 'projectInputId',
  project: 'projectId',
  project_capability_directory: 'projectId',
  project_endpoint_binding: 'projectEndpointBindingId',
  task: 'taskId',
  project_record: 'projectRecordId',
  resource_ref: 'resourceRefId',
  human_needed: 'humanRequestId',
  human_answer: 'humanAnswerId',
  action_confirmation: 'confirmationId'
} as const

export function hasStableEntityIdentity(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>
): boolean {
  if (before.type !== after.type || typeof before.type !== 'string') return false
  const field = STABLE_ENTITY_ID_FIELDS[before.type as keyof typeof STABLE_ENTITY_ID_FIELDS]
  return field !== undefined && before[field] === after[field]
}
