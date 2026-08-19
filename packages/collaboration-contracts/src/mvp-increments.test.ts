import { describe, expect, it } from 'vitest'
import {
  confirmationIdSchema,
  criterionIdSchema,
  executionIdSchema
} from './core.js'
import {
  actionConfirmationSchema,
  agentCapabilityReportSchema,
  agentCapabilityProfileSchema,
  humanNeededSchema,
  projectCoordinationViewSchema,
  projectCapabilityDirectorySchema,
  projectRecordSchema,
  resourceRefSchema,
  structuredTaskResultSchema,
  taskSchema
} from './entities.js'
import { createCollaborationError } from './errors.js'
import {
  agentInboxPayloadSchema,
  inboxMessageSchema,
  restRequestSchema,
  restResponseSchema
} from './protocol.js'
import {
  TEST_HASH,
  TEST_IDS,
  TEST_LATER_TIMESTAMP,
  TEST_TIMESTAMP,
  actionConfirmationFixture,
  agentCapabilityProfileFixture,
  agentInboxMessageFixture,
  humanNeededFixture,
  projectCapabilityDirectoryFixture,
  projectCoordinationViewFixture,
  projectRecordFixture,
  resourceRefFixture,
  taskFixture
} from './testing.js'

const writeEnvelope = {
  protocolVersion: '1.0' as const,
  requestId: TEST_IDS.requestId,
  idempotencyKey: 'idem_mvp_contract_increment_0001'
}

describe('Task execution identity and atomic result contract', () => {
  it('uses distinct opaque prefixes for execution, criterion, and confirmation identity', () => {
    expect(executionIdSchema.parse(TEST_IDS.executionId)).toBe(TEST_IDS.executionId)
    expect(criterionIdSchema.parse(TEST_IDS.firstCriterionId)).toBe(TEST_IDS.firstCriterionId)
    expect(confirmationIdSchema.parse(TEST_IDS.confirmationId)).toBe(TEST_IDS.confirmationId)
    expect(executionIdSchema.safeParse(TEST_IDS.taskId).success).toBe(false)
    expect(criterionIdSchema.safeParse('criterion-1').success).toBe(false)
  })

  it('requires a current execution and stable, unique criterion IDs on a Task', () => {
    expect(taskSchema.safeParse(taskFixture).success).toBe(true)
    expect(taskSchema.safeParse({ ...taskFixture, executionId: undefined }).success).toBe(false)
    expect(taskSchema.safeParse({
      ...taskFixture,
      completionCriteria: [taskFixture.completionCriteria[0], taskFixture.completionCriteria[0]]
    }).success).toBe(false)
  })

  it('stores cross-module Worker, ResourceRef, and local-authorization requirements without runtime-private data', () => {
    const parsed = restRequestSchema.parse({
      ...writeEnvelope,
      type: 'task.create',
      projectId: TEST_IDS.projectId,
      expectedRevision: 1,
      assigneeAgentId: TEST_IDS.secondAgentId,
      title: 'Run on the institution node',
      objective: 'Use the shared input and return a bounded summary.',
      completionCriteria: [{ criterionId: TEST_IDS.firstCriterionId, text: 'Return evidence.' }],
      dependencyTaskIds: [],
      requiredCapabilities: {
        osFamilies: ['linux'],
        capabilityIds: ['research.execute'],
        minimumEvidenceLevel: 'configured',
        minGpuMemoryGB: 16,
        vpnAccessIds: ['vpn_lab'],
        slurmClusterIds: ['slurm_main'],
        requiredResourceRefIds: [TEST_IDS.resourceRefId],
        requireLogSummary: true
      },
      resourceRefIds: [TEST_IDS.resourceRefId],
      authorizationRequirements: [{
        id: 'auth_Requirement001', kind: 'resource_access', targetRefId: TEST_IDS.resourceRefId,
        description: 'Confirm access to the shared input reference.'
      }]
    })
    expect(parsed).toMatchObject({
      requiredCapabilities: { capabilityIds: ['research.execute'] },
      resourceRefIds: [TEST_IDS.resourceRefId]
    })
    expect(taskSchema.safeParse({
      ...taskFixture,
      assigneeUserId: undefined
    }).success).toBe(false)
  })

  it('accepts a structured result and preserves legacy resultSummary input', () => {
    const result = structuredTaskResultSchema.parse({
      summary: 'The bounded result is reproducible.',
      criterionEvidence: [{
        criterionId: TEST_IDS.firstCriterionId,
        summary: 'The first criterion passed.',
        resourceRefIds: [TEST_IDS.resourceRefId]
      }],
      resourceRefIds: [TEST_IDS.resourceRefId],
      logSummary: 'No unsafe log content was retained.'
    })
    const base = {
      ...writeEnvelope,
      type: 'task.transition' as const,
      taskId: TEST_IDS.taskId,
      executionId: TEST_IDS.executionId,
      expectedRevision: 3,
      status: 'succeeded' as const
    }
    expect(restRequestSchema.safeParse({ ...base, result }).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...base, resultSummary: result.summary }).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...base, result, resultSummary: result.summary }).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...base, result, resultSummary: 'Different summary.' }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...base, executionId: undefined, result }).success).toBe(false)
  })

  it('carries execution identity in Worker commands and Task Inbox payloads', () => {
    expect(agentInboxPayloadSchema.safeParse({
      protocolVersion: '1.0',
      type: 'task.offered',
      projectId: TEST_IDS.projectId,
      taskId: TEST_IDS.taskId,
      executionId: TEST_IDS.executionId,
      revision: 1,
      reroutedFromMessageId: TEST_IDS.inboxMessageId
    }).success).toBe(true)
    expect(agentInboxPayloadSchema.safeParse({
      protocolVersion: '1.0',
      type: 'task.offered',
      projectId: TEST_IDS.projectId,
      taskId: TEST_IDS.taskId,
      revision: 1
    }).success).toBe(false)
    expect(restRequestSchema.safeParse({
      ...writeEnvelope,
      type: 'task.progress.report',
      taskId: TEST_IDS.taskId,
      executionId: TEST_IDS.executionId,
      expectedRevision: 2,
      percent: 50,
      summary: 'Half complete.'
    }).success).toBe(true)
  })

  it('keeps a bounded safe failure summary only on failed Task state', () => {
    expect(taskSchema.safeParse({
      ...taskFixture,
      status: 'failed',
      safeFailureCode: 'runtime_unavailable',
      safeFailureSummary: 'The runtime was unavailable after bounded retry.',
      completedAt: TEST_LATER_TIMESTAMP
    }).success).toBe(true)
    expect(taskSchema.safeParse({
      ...taskFixture,
      status: 'running',
      safeFailureSummary: 'Failure detail cannot appear before failure.'
    }).success).toBe(false)
    const failedUpdate = {
      protocolVersion: '1.0' as const,
      type: 'task.updated' as const,
      projectId: TEST_IDS.projectId,
      taskId: TEST_IDS.taskId,
      executionId: TEST_IDS.executionId,
      revision: 4,
      status: 'failed' as const,
      safeFailureCode: 'runtime_unavailable',
      safeFailureSummary: 'The runtime was unavailable after bounded retry.'
    }
    expect(agentInboxPayloadSchema.safeParse(failedUpdate).success).toBe(true)
    expect(agentInboxPayloadSchema.safeParse({ ...failedUpdate, status: 'running' }).success).toBe(false)
  })
})

describe('execution provenance and coordination projections', () => {
  it('binds ProjectRecord, ResourceRef, and HumanNeeded to the Task execution', () => {
    expect(projectRecordSchema.safeParse({
      ...projectRecordFixture,
      kind: 'task_result',
      criterionEvidence: [{
        criterionId: TEST_IDS.firstCriterionId,
        summary: 'Criterion passed.',
        resourceRefIds: [TEST_IDS.resourceRefId]
      }],
      resourceRefIds: [TEST_IDS.resourceRefId],
      logSummary: 'Bounded log summary.'
    }).success).toBe(true)
    expect(projectRecordSchema.safeParse({ ...projectRecordFixture, sourceExecutionId: null }).success).toBe(false)
    expect(resourceRefSchema.safeParse({ ...resourceRefFixture, executionId: null }).success).toBe(false)
    expect(humanNeededSchema.safeParse({ ...humanNeededFixture, executionId: null }).success).toBe(false)
    expect(humanNeededSchema.safeParse({
      ...humanNeededFixture,
      sourceKind: 'coordinator',
      taskId: null,
      executionId: null,
      sourceInboxMessageId: TEST_IDS.inboxMessageId
    }).success).toBe(true)
  })

  it('rejects direct task_result submission because success owns that atomic write', () => {
    expect(restRequestSchema.safeParse({
      ...writeEnvelope,
      type: 'project_record.submit',
      projectId: TEST_IDS.projectId,
      sourceTaskId: TEST_IDS.taskId,
      sourceExecutionId: TEST_IDS.executionId,
      sourceRevision: 4,
      kind: 'task_result',
      body: 'Would otherwise split the Task and result transaction.'
    }).success).toBe(false)
  })

  it('validates one project-scoped coordination snapshot', () => {
    expect(projectCoordinationViewSchema.safeParse(projectCoordinationViewFixture).success).toBe(true)
    expect(projectCoordinationViewSchema.safeParse({
      ...projectCoordinationViewFixture,
      tasks: [{ ...taskFixture, projectId: 'prj_Other0000001' }]
    }).success).toBe(false)
    expect(restRequestSchema.safeParse({
      protocolVersion: '1.0',
      requestId: TEST_IDS.requestId,
      type: 'project.coordination_view.get',
      projectId: TEST_IDS.projectId
    }).success).toBe(true)
  })
})

describe('capability profile and immutable confirmation contract', () => {
  it('separates capability reporting from the filtered Project directory', () => {
    const {
      schemaVersion: _schemaVersion,
      type: _type,
      revision: _revision,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...profile
    } = agentCapabilityProfileFixture
    expect(restRequestSchema.safeParse({
      ...writeEnvelope,
      type: 'agent.capability_profile.report',
      expectedProfileRevision: 0,
      profile
    }).success).toBe(true)
    const { gpu: _gpu, ...profileWithoutGpu } = profile
    expect(agentCapabilityReportSchema.parse(profileWithoutGpu).gpu).toEqual([])
    expect(agentCapabilityProfileSchema.safeParse({
      ...agentCapabilityProfileFixture,
      expiresAt: TEST_TIMESTAMP
    }).success).toBe(false)
    expect(projectCapabilityDirectoryFixture.agents[0]?.profile.agentId).toBe(TEST_IDS.agentId)
    expect(projectCapabilityDirectorySchema.safeParse({
      ...projectCapabilityDirectoryFixture,
      agents: projectCapabilityDirectoryFixture.agents.map(({ lastSeenAt: _lastSeenAt, ...agent }) => agent)
    }).success).toBe(false)
    expect(projectCapabilityDirectoryFixture).not.toHaveProperty('installationId')
  })

  it('binds confirmation identity to one immutable action and lifecycle', () => {
    expect(actionConfirmationSchema.safeParse(actionConfirmationFixture).success).toBe(true)
    expect(actionConfirmationSchema.safeParse({
      ...actionConfirmationFixture,
      status: 'consumed',
      consumedAt: null
    }).success).toBe(false)
    expect(actionConfirmationSchema.safeParse({
      ...actionConfirmationFixture,
      action: { kind: 'tasks.create', projectId: 'prj_Other0000001', proposalDigest: TEST_HASH }
    }).success).toBe(false)
    expect(restRequestSchema.safeParse({
      protocolVersion: '1.0',
      requestId: TEST_IDS.requestId,
      type: 'confirmation.get',
      confirmationId: TEST_IDS.confirmationId
    }).success).toBe(true)

    const coordinatorRequest = {
      ...humanNeededFixture,
      sourceKind: 'coordinator' as const,
      taskId: null,
      executionId: null,
      sourceInboxMessageId: TEST_IDS.inboxMessageId,
      confirmableAction: {
        kind: 'task.retry_reassign' as const,
        projectId: TEST_IDS.projectId,
        taskId: TEST_IDS.taskId,
        fromExecutionId: TEST_IDS.executionId,
        assigneeAgentId: TEST_IDS.secondAgentId
      }
    }
    expect(humanNeededSchema.safeParse(coordinatorRequest).success).toBe(true)
    expect(humanNeededSchema.safeParse({
      ...coordinatorRequest,
      confirmableAction: { ...coordinatorRequest.confirmableAction, projectId: 'prj_Other0000001' }
    }).success).toBe(false)
    const { projectId: _projectId, ...unscopedRetryAction } = coordinatorRequest.confirmableAction
    expect(humanNeededSchema.safeParse({
      ...coordinatorRequest,
      confirmableAction: unscopedRetryAction
    }).success).toBe(false)
  })

  it('keeps Owner-direct commands compatible while carrying confirmation for delegated execution', () => {
    const retry = {
      ...writeEnvelope,
      type: 'task.retry' as const,
      taskId: TEST_IDS.taskId,
      executionId: TEST_IDS.executionId,
      assigneeAgentId: TEST_IDS.secondAgentId,
      expectedRevision: 3
    }
    expect(restRequestSchema.safeParse(retry).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...retry, confirmationId: TEST_IDS.confirmationId }).success).toBe(true)
    const complete = {
      ...writeEnvelope,
      type: 'project.transition' as const,
      projectId: TEST_IDS.projectId,
      expectedRevision: 4,
      status: 'completed' as const
    }
    expect(restRequestSchema.safeParse(complete).success).toBe(true)
    expect(restRequestSchema.safeParse({
      ...complete,
      finalRecordDigest: TEST_HASH,
      confirmationId: TEST_IDS.confirmationId
    }).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...complete, finalRecordDigest: TEST_HASH }).success).toBe(false)
  })
})

describe('stable errors, ResourceRef lifecycle, and contiguous Inbox ACK', () => {
  it.each([
    'execution_conflict',
    'assignee_mismatch',
    'coordinator_mismatch',
    'confirmation_required',
    'confirmation_mismatch',
    'resource_unavailable',
    'capability_profile_expired',
    'inbox_ack_gap'
  ] as const)('exports stable error code %s', (code) => {
    expect(createCollaborationError(code, 'Stable public error.', { traceId: TEST_IDS.traceId }).code).toBe(code)
  })

  it('returns the durable Inbox cursor with an ACK-gap error', () => {
    expect(createCollaborationError('inbox_ack_gap', 'Close the active Inbox gap first.', {
      traceId: TEST_IDS.traceId,
      ackedSequence: 11,
      nextSequence: 14
    })).toMatchObject({ code: 'inbox_ack_gap', ackedSequence: 11, nextSequence: 14 })
  })

  it('requires safe reasons for unavailable or revoked resources', () => {
    const transition = {
      ...writeEnvelope,
      type: 'resource.transition' as const,
      resourceRefId: TEST_IDS.resourceRefId,
      expectedRevision: 1
    }
    expect(restRequestSchema.safeParse({ ...transition, status: 'unavailable' }).success).toBe(false)
    expect(restRequestSchema.safeParse({
      ...transition,
      status: 'unavailable',
      safeReasonCode: 'provider_unreachable'
    }).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...transition, status: 'available' }).success).toBe(true)
    expect(restRequestSchema.safeParse({
      ...transition,
      status: 'available',
      safeReasonCode: 'not_needed'
    }).success).toBe(false)
  })

  it('models superseded messages and both contiguous ACK request forms', () => {
    expect(inboxMessageSchema.safeParse(agentInboxMessageFixture).success).toBe(true)
    expect(inboxMessageSchema.safeParse({
      ...agentInboxMessageFixture,
      status: 'superseded',
      disposition: 'superseded',
      supersededAt: TEST_LATER_TIMESTAMP
    }).success).toBe(true)
    expect(inboxMessageSchema.safeParse({
      ...agentInboxMessageFixture,
      disposition: 'superseded'
    }).success).toBe(false)
    expect(inboxMessageSchema.safeParse({
      ...agentInboxMessageFixture,
      status: 'acknowledged'
    }).success).toBe(true)
    for (const unreachableStatus of ['delivered', 'expired', 'dead_letter']) {
      expect(inboxMessageSchema.safeParse({
        ...agentInboxMessageFixture,
        status: unreachableStatus
      }).success).toBe(false)
    }
    expect(inboxMessageSchema.safeParse({
      ...agentInboxMessageFixture,
      status: 'acknowledged',
      acknowledgedAt: TEST_LATER_TIMESTAMP
    }).success).toBe(false)
    expect(restRequestSchema.safeParse({
      ...writeEnvelope,
      type: 'inbox.ack',
      throughSequence: 12
    }).success).toBe(true)
    expect(restRequestSchema.safeParse({
      ...writeEnvelope,
      type: 'inbox.ack',
      inboxMessageId: TEST_IDS.inboxMessageId,
      sequence: 12
    }).success).toBe(true)
    expect(restRequestSchema.safeParse({
      ...writeEnvelope,
      type: 'inbox.ack',
      throughSequence: 12,
      inboxMessageId: TEST_IDS.inboxMessageId,
      sequence: 12
    }).success).toBe(false)
    expect(restResponseSchema.safeParse({
      protocolVersion: '1.0',
      requestId: TEST_IDS.requestId,
      type: 'inbox.acked',
      ackedSequence: 12,
      nextSequence: 13
    }).success).toBe(true)
  })
})
