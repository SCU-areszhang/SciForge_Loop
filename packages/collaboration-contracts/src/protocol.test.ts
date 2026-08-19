import { describe, expect, it } from 'vitest'
import {
  capabilityInputSchema,
  capabilityOutputSchema,
  agentInboxPayloadSchema,
  inboxMessageSchema,
  receiptSchema,
  restRequestSchema,
  restResponseSchema,
  webSocketMessageSchema
} from './protocol.js'
import {
  humanEndpointProviderContractSchema,
  providerDiagnosticSchema,
  providerEventSchema,
  providerSendRequestSchema
} from './provider.js'
import {
  REDACTED_VALUE,
  redactedJsonSchema,
  redactCredentials
} from './core.js'
import {
  TEST_IDS,
  TEST_TIMESTAMP,
  agentOwnerTransferredResponseFixture,
  agentInboxMessageFixture,
  chineseProviderLocatorFixture,
  collaborationFixtures,
  invalidTestOnlyValue,
  providerIdentityFixture,
  providerEventFixture,
  providerHumanAnswerEventFixture,
  projectionUpdatedPayloadFixture,
  projectCapabilityDirectoryFixture,
  remoteSessionProjectionFixture,
  restRequestFixture,
  taskFixture,
  webSocketMessageFixture
} from './testing.js'

describe('discriminated transport unions', () => {
  it('accepts shared REST, WebSocket, provider event, inbox, and receipt fixtures', () => {
    expect(restRequestSchema.parse(restRequestFixture).type).toBe('project.get')
    expect(webSocketMessageSchema.parse(webSocketMessageFixture).type).toBe('inbox.available')
    expect(providerEventSchema.parse(providerEventFixture).type).toBe('provider.message.created')
    expect(inboxMessageSchema.parse(agentInboxMessageFixture).recipientType).toBe('agent')
    expect(receiptSchema.parse(collaborationFixtures.operationReceipt).type).toBe('operation.receipt')
  })

  it('rejects unknown discriminators and unknown fields in every protocol family', () => {
    expect(restRequestSchema.safeParse({ ...restRequestFixture, type: 'project.guess' }).success).toBe(false)
    expect(webSocketMessageSchema.safeParse({ ...webSocketMessageFixture, fullPayload: {} }).success).toBe(false)
    expect(providerEventSchema.safeParse({ ...providerEventFixture, accessToken: invalidTestOnlyValue('VALUE') }).success).toBe(false)
    expect(inboxMessageSchema.safeParse({ ...agentInboxMessageFixture, recipientUserId: TEST_IDS.userId }).success).toBe(false)
  })

  it('rejects nested unknown fields instead of silently stripping them', () => {
    expect(providerEventSchema.safeParse({
      ...providerEventFixture,
      locator: { ...chineseProviderLocatorFixture, workspaceId: 'guessed-target' }
    }).success).toBe(false)
    expect(inboxMessageSchema.safeParse({
      ...agentInboxMessageFixture,
      payload: { ...agentInboxMessageFixture.payload, runtimeId: 'wrong-layer' }
    }).success).toBe(false)
  })

  it('orders locator refresh before later personal messages without exposing the locator', () => {
    expect(agentInboxPayloadSchema.parse(projectionUpdatedPayloadFixture)).toEqual({
      protocolVersion: '1.0',
      type: 'projection.updated',
      projectionId: TEST_IDS.projectionId,
      revision: 2
    })
    expect(agentInboxPayloadSchema.safeParse({
      ...projectionUpdatedPayloadFixture,
      locator: chineseProviderLocatorFixture
    }).success).toBe(false)
  })
})

describe('canonical pairing and bidirectional Session commands', () => {
  it('models pairing begin only as an authenticated binding adapter', () => {
    const request = restRequestSchema.parse({
      protocolVersion: '1.0',
      requestId: TEST_IDS.requestId,
      type: 'pairing.begin',
      idempotencyKey: 'idem_pairing_begin_0001',
      realmUrl: 'https://chat-test.example.invalid'
    })
    expect(request).not.toHaveProperty('userId')
    expect(request).not.toHaveProperty('bootstrapToken')
    expect(request).not.toHaveProperty('requestedDisplayName')
  })

  it('returns one-time binding material without a poll secret or User credential', () => {
    expect(restResponseSchema.safeParse({
      protocolVersion: '1.0',
      requestId: TEST_IDS.requestId,
      type: 'pairing.begun',
      bindingRequestId: 'zbr_identity_test_0001',
      bindingCode: 'SF-TEST-4P6Q',
      expiresAt: TEST_TIMESTAMP
    }).success).toBe(true)
    expect(JSON.stringify(collaborationFixtures)).not.toContain('pollSecret')
    expect(JSON.stringify(collaborationFixtures)).not.toContain('userCredential')
  })

  it('uses one publish command for desktop user mirrors and final assistant replies', () => {
    const base = {
      protocolVersion: '1.0',
      requestId: TEST_IDS.requestId,
      type: 'projection.message.publish',
      idempotencyKey: 'idem_projection_publish_01',
      projectionId: TEST_IDS.projectionId,
      projectionRevision: 1,
      localItemId: TEST_IDS.localItemId,
      text: '同步消息',
      occurredAt: TEST_TIMESTAMP
    }
    expect(restRequestSchema.safeParse({ ...base, kind: 'user_message' }).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...base, kind: 'assistant_final', localTurnId: TEST_IDS.turnId }).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...base, kind: 'stream_delta' }).success).toBe(false)
  })

  it('transfers Agent ownership with optimistic concurrency and a one-time rotated credential', () => {
    expect(restRequestSchema.safeParse({
      protocolVersion: '1.0',
      requestId: TEST_IDS.requestId,
      type: 'agent.owner.transfer',
      idempotencyKey: 'idem_agent_owner_transfer_01',
      agentId: TEST_IDS.agentId,
      targetUserId: TEST_IDS.secondUserId,
      expectedRevision: 1
    }).success).toBe(true)
    expect(restResponseSchema.safeParse(agentOwnerTransferredResponseFixture).success).toBe(true)
    const sanitized = JSON.stringify(redactCredentials(agentOwnerTransferredResponseFixture))
    expect(sanitized).not.toContain(['INVALID', 'TEST', 'ONLY'].join('_'))
  })

  it('exposes strict current-credential revocation and actor-neutral Task retry commands', () => {
    const revokeCurrent = {
      protocolVersion: '1.0',
      requestId: TEST_IDS.requestId,
      type: 'credential.revoke_current',
      idempotencyKey: 'idem_credential_revoke_current_01'
    }
    expect(restRequestSchema.safeParse(revokeCurrent).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...revokeCurrent, credentialId: 'credential_guessed' }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...revokeCurrent, userId: TEST_IDS.userId }).success).toBe(false)

    const retryTask = {
      protocolVersion: '1.0',
      requestId: TEST_IDS.requestId,
      type: 'task.retry',
      idempotencyKey: 'idem_task_retry_current_01',
      taskId: TEST_IDS.taskId,
      executionId: TEST_IDS.executionId,
      assigneeAgentId: TEST_IDS.agentId,
      expectedRevision: 3
    }
    expect(restRequestSchema.safeParse(retryTask).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...retryTask, assigneeAgentId: undefined }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...retryTask, expectedRevision: undefined }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...retryTask, status: 'offered' }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...retryTask, actorUserId: TEST_IDS.userId }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...retryTask, actorAgentId: TEST_IDS.agentId }).success).toBe(false)
  })

  it('exposes a strict read-only ProjectRecord query', () => {
    const getProjectRecord = {
      protocolVersion: '1.0',
      requestId: TEST_IDS.requestId,
      type: 'project_record.get',
      projectRecordId: TEST_IDS.projectRecordId
    }
    expect(restRequestSchema.safeParse(getProjectRecord).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...getProjectRecord, projectRecordId: undefined }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...getProjectRecord, projectId: TEST_IDS.projectId }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...getProjectRecord, expectedRevision: 1 }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...getProjectRecord, idempotencyKey: 'idem_record_get_invalid_01' }).success).toBe(false)
  })

  it('exposes one strict canonical ResourceRef command path', () => {
    const create = {
      protocolVersion: '1.0',
      requestId: TEST_IDS.requestId,
      type: 'resource.create',
      idempotencyKey: 'idem_resource_create_0001',
      projectId: TEST_IDS.projectId,
      taskId: TEST_IDS.taskId,
      executionId: TEST_IDS.executionId,
      expectedTaskRevision: 1,
      provider: 'example-content',
      externalId: 'document-42',
      kind: 'shared_document',
      name: '模型分析记录',
      openUrl: 'https://content.example.invalid/resources/document-42',
      version: '1'
    }
    expect(restRequestSchema.safeParse(create).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...create, taskId: undefined, executionId: undefined,
      expectedTaskRevision: undefined }).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...create, expectedTaskRevision: undefined }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...create, taskId: undefined }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...create, body: 'document body' }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...create, openUrl: 'file:///private/document' }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...create, name: 'token=test-only-token' }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...create,
      openUrl: 'https://content.example.invalid/resource?%73%69%67=test-only' }).success).toBe(false)
    expect(restRequestSchema.safeParse({
      protocolVersion: '1.0', requestId: TEST_IDS.requestId, type: 'resource.get',
      resourceRefId: TEST_IDS.resourceRefId
    }).success).toBe(true)
    expect(restRequestSchema.safeParse({
      protocolVersion: '1.0', requestId: TEST_IDS.requestId, type: 'resource.invalidate',
      idempotencyKey: 'idem_resource_invalidate_0001', resourceRefId: TEST_IDS.resourceRefId,
      expectedRevision: 1
    }).success).toBe(true)
  })

  it('exposes strict capability-directory and monotonic-progress command shapes', () => {
    const directory = {
      protocolVersion: '1.0', requestId: TEST_IDS.requestId,
      type: 'project.capability_directory.get', projectId: TEST_IDS.projectId
    }
    expect(restRequestSchema.safeParse(directory).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...directory, includeCredentials: true }).success).toBe(false)
    const progress = {
      protocolVersion: '1.0', requestId: TEST_IDS.requestId, type: 'task.progress.report',
      idempotencyKey: 'idem_task_progress_report_01', taskId: TEST_IDS.taskId,
      executionId: TEST_IDS.executionId,
      expectedRevision: 2, percent: 40, summary: '输入校验完成。'
    }
    expect(restRequestSchema.safeParse(progress).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...progress, percent: 101 }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...progress, summary: 'x'.repeat(2_001) }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...progress, localPath: '/private/data' }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...progress, resultSummary: 'not progress' }).success).toBe(false)
    expect(restResponseSchema.safeParse({ protocolVersion: '1.0', requestId: TEST_IDS.requestId,
      type: 'rest.entity', entity: projectCapabilityDirectoryFixture }).success).toBe(true)
    const transition = {
      protocolVersion: '1.0', requestId: TEST_IDS.requestId, type: 'task.transition',
      idempotencyKey: 'idem_task_terminal_contract_01', taskId: TEST_IDS.taskId,
      executionId: TEST_IDS.executionId, expectedRevision: 3
    }
    expect(restRequestSchema.safeParse({ ...transition, status: 'succeeded' }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...transition, status: 'succeeded', resultSummary: 'Bounded result.' }).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...transition, status: 'failed' }).success).toBe(false)
    expect(restRequestSchema.safeParse({ ...transition, status: 'failed', safeFailureCode: 'input_invalid' }).success).toBe(true)
    expect(restRequestSchema.safeParse({ ...transition, status: 'rejected', safeFailureCode: 'not_applicable' }).success).toBe(false)
  })
})

describe('provider-neutral contract', () => {
  it('normalizes a bounded HumanAnswer with its verified source locator and no guessed target identity', () => {
    expect(providerEventSchema.parse(providerHumanAnswerEventFixture)).toMatchObject({
      type: 'provider.human_answer.responded',
      humanRequestId: TEST_IDS.humanRequestId,
      requestRevision: 1
    })
    expect(providerEventSchema.safeParse({
      ...providerHumanAnswerEventFixture,
      locator: undefined
    }).success).toBe(false)
    expect(providerEventSchema.safeParse({
      ...providerHumanAnswerEventFixture,
      targetUserId: TEST_IDS.secondUserId
    }).success).toBe(false)
    expect(providerEventSchema.safeParse({
      ...providerHumanAnswerEventFixture,
      answer: ''
    }).success).toBe(false)
  })

  it('accepts stable Chinese locators and append-only unsupported provider events', () => {
    expect(chineseProviderLocatorFixture.topicDisplayName).toBe('蛋白质结构分析（上海样本）')
    expect(providerEventSchema.safeParse({
      protocolVersion: '1.0',
      type: 'provider.message.edited',
      provider: 'example-im',
      eventId: 'provider-event-edit-1',
      eventCursor: 'cursor-2',
      occurredAt: TEST_TIMESTAMP,
      identity: providerIdentityFixture,
      locator: chineseProviderLocatorFixture,
      providerMessageId: 'provider-message-1',
      replacementText: '更正内容'
    }).success).toBe(true)
  })

  it('uses provider-neutral send requests without a provider ID branch', () => {
    expect(providerSendRequestSchema.safeParse({
      protocolVersion: '1.0',
      type: 'provider.send.message',
      locator: chineseProviderLocatorFixture,
      clientMessageId: 'client-message-1',
      text: '最终回复'
    }).success).toBe(true)
  })

  it('requires contract capabilities and strictly redacted diagnostics', () => {
    expect(humanEndpointProviderContractSchema.safeParse({
      protocolVersion: '1.0',
      type: 'human_endpoint_provider_contract',
      provider: 'example-im',
      displayName: 'Example IM',
      capabilities: {
        textMessages: true,
        stableLocators: true,
        eventCursor: true,
        locatorRename: true,
        locatorMove: true,
        locatorDiscovery: true,
        identityChallenge: true
      },
      onboarding: {
        realmLabel: '组织',
        accountLabel: '用户',
        containerLabel: '频道',
        topicLabel: '话题'
      },
      limits: { maxTextLength: 10_000, maxLocatorDisplayLength: 200 }
    }).success).toBe(true)
    expect(providerDiagnosticSchema.safeParse({
      protocolVersion: '1.0',
      type: 'provider.diagnostic',
      provider: 'example-im',
      status: 'degraded',
      checkedAt: TEST_TIMESTAMP,
      safeSummary: 'Connection unavailable.',
      details: { deviceToken: invalidTestOnlyValue('VALUE') }
    }).success).toBe(false)
    expect(redactedJsonSchema.safeParse({ deviceToken: REDACTED_VALUE }).success).toBe(true)
  })
})

describe('capability contracts', () => {
  it('strictly validates the canonical personal and Task execution inputs', () => {
    expect(capabilityInputSchema.safeParse({
      protocolVersion: '1.0',
      type: 'collaboration.task.execute',
      task: taskFixture
    }).success).toBe(true)
    expect(capabilityInputSchema.safeParse({
      protocolVersion: '1.0',
      type: 'collaboration.personal.execute',
      projectionId: TEST_IDS.projectionId,
      projectionRevision: 1,
      runtimeId: 'runtime-local',
      threadId: 'thread-local',
      projection: remoteSessionProjectionFixture
    }).success).toBe(false)
  })

  it('does not synthesize mobile approval in execution output', () => {
    expect(capabilityOutputSchema.safeParse({
      protocolVersion: '1.0',
      type: 'collaboration.execution.needs_approval',
      localTurnId: TEST_IDS.turnId,
      approvalId: 'approval-1',
      requiresDesktop: true,
      safeSummary: 'Desktop approval is required.'
    }).success).toBe(true)
    expect(capabilityOutputSchema.safeParse({
      protocolVersion: '1.0',
      type: 'collaboration.execution.needs_approval',
      localTurnId: TEST_IDS.turnId,
      approvalId: 'approval-1',
      requiresDesktop: true,
      safeSummary: 'Desktop approval is required.',
      approvedByPhone: true
    }).success).toBe(false)
  })
})
