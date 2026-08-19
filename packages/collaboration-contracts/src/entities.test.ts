import { describe, expect, it } from 'vitest'
import {
  agentNodeSchema,
  humanEndpointBindingSchema,
  participantProfileSchema,
  projectRecordSchema,
  resourceRefCreateMetadataSchema,
  resourceRefSchema,
  projectSchema,
  projectCapabilityDirectorySchema,
  remoteSessionProjectionSchema,
  taskSchema,
  userPrincipalSchema
} from './entities.js'
import { hasStableEntityIdentity, providerIdentityKey } from './rules.js'
import {
  TEST_IDS,
  TEST_LATER_TIMESTAMP,
  agentNodeFixture,
  chineseProviderLocatorFixture,
  collaborationFixtures,
  humanEndpointBindingFixture,
  invalidTestOnlyValue,
  participantProfileFixture,
  projectFixture,
  projectCapabilityDirectoryFixture,
  projectRecordFixture,
  resourceRefFixture,
  providerIdentityFixture,
  remoteSessionProjectionFixture,
  taskFixture,
  userPrincipalFixture
} from './testing.js'

describe('strict collaboration entities', () => {
  it('parses every shared entity fixture', () => {
    expect(collaborationFixtures.userPrincipal.userId).toBe(TEST_IDS.userId)
    expect(collaborationFixtures.humanEndpointBinding.humanEndpointId).toBe(TEST_IDS.humanEndpointId)
    expect(collaborationFixtures.agentNode.agentId).toBe(TEST_IDS.agentId)
    expect(collaborationFixtures.remoteSessionProjection.projectionId).toBe(TEST_IDS.projectionId)
    expect(collaborationFixtures.project.projectId).toBe(TEST_IDS.projectId)
    expect(collaborationFixtures.task.taskId).toBe(TEST_IDS.taskId)
    expect(collaborationFixtures.resourceRef.resourceRefId).toBe(TEST_IDS.resourceRefId)
  })

  it('rejects unknown fields at the entity root and nested provider identity', () => {
    expect(userPrincipalSchema.safeParse({ ...userPrincipalFixture, email: 'not-an-identity@example.invalid' }).success).toBe(false)
    expect(humanEndpointBindingSchema.safeParse({
      ...humanEndpointBindingFixture,
      identity: { ...humanEndpointBindingFixture.identity, providerToken: invalidTestOnlyValue('VALUE') }
    }).success).toBe(false)
  })

  it('allows display-name changes without changing stable identity', () => {
    const renamed = userPrincipalSchema.parse({
      ...userPrincipalFixture,
      displayName: '新的显示名称',
      revision: 2,
      updatedAt: TEST_LATER_TIMESTAMP
    })
    expect(hasStableEntityIdentity(userPrincipalFixture, renamed)).toBe(true)
    expect(renamed.userId).toBe(userPrincipalFixture.userId)
  })

  it('keys provider identities by provider, realm, and provider user ID', () => {
    const key = providerIdentityKey(providerIdentityFixture)
    expect(key).not.toContain(providerIdentityFixture.displayName!)
    expect(providerIdentityKey({ ...providerIdentityFixture, displayName: '已改名' })).toBe(key)
    expect(providerIdentityKey({ ...providerIdentityFixture, realmId: 'another-realm' })).not.toBe(key)
  })
})

describe('identity and ownership invariants', () => {
  it('requires revoked endpoint and Agent timestamps and forces revoked Agents offline', () => {
    expect(humanEndpointBindingSchema.safeParse({
      ...humanEndpointBindingFixture,
      status: 'revoked'
    }).success).toBe(false)
    expect(agentNodeSchema.safeParse({
      ...agentNodeFixture,
      lifecycleStatus: 'revoked',
      connectionStatus: 'online',
      revokedAt: TEST_LATER_TIMESTAMP
    }).success).toBe(false)
    expect(agentNodeSchema.safeParse({
      ...agentNodeFixture,
      lifecycleStatus: 'revoked',
      connectionStatus: 'offline',
      revokedAt: TEST_LATER_TIMESTAMP
    }).success).toBe(true)
  })

  it('requires a complete Participant to explicitly select both primary endpoints', () => {
    expect(participantProfileSchema.safeParse({
      ...participantProfileFixture,
      primaryAgentId: null,
      status: 'active'
    }).success).toBe(false)
    expect(participantProfileSchema.safeParse({
      ...participantProfileFixture,
      primaryAgentId: null,
      status: 'incomplete'
    }).success).toBe(true)
  })

  it('does not allow an implicit Agent fallback from another owner', () => {
    expect(participantProfileFixture.primaryAgentId).toBe(agentNodeFixture.agentId)
    expect(agentNodeFixture.ownerUserId).toBe(participantProfileFixture.userId)
    const reassigned = agentNodeSchema.parse({
      ...agentNodeFixture,
      agentId: TEST_IDS.secondAgentId,
      ownerUserId: TEST_IDS.secondUserId
    })
    expect(reassigned.ownerUserId).not.toBe(participantProfileFixture.userId)
  })
})

describe('projection, Project, Task, and Record invariants', () => {
  it('accepts Chinese locator display metadata without deriving projection identity from it', () => {
    expect(chineseProviderLocatorFixture.topicDisplayName).toContain('蛋白质')
    const renamed = remoteSessionProjectionSchema.parse({
      ...remoteSessionProjectionFixture,
      locator: { ...chineseProviderLocatorFixture, topicDisplayName: '完全不同的中文标题' },
      locatorRevision: 2,
      revision: 2,
      updatedAt: TEST_LATER_TIMESTAMP
    })
    expect(renamed.projectionId).toBe(remoteSessionProjectionFixture.projectionId)
  })

  it('keeps local runtime/thread/workspace facts out of the cloud projection', () => {
    expect(remoteSessionProjectionSchema.safeParse({
      ...remoteSessionProjectionFixture,
      runtimeId: 'runtime-local',
      threadId: 'thread-local',
      workspaceRoot: '/private/local/path'
    }).success).toBe(false)
  })

  it('requires owner access and rejects duplicate projection allowlist entries', () => {
    expect(remoteSessionProjectionSchema.safeParse({
      ...remoteSessionProjectionFixture,
      allowedSenderUserIds: [TEST_IDS.secondUserId]
    }).success).toBe(false)
    expect(remoteSessionProjectionSchema.safeParse({
      ...remoteSessionProjectionFixture,
      allowedSenderUserIds: [TEST_IDS.userId, TEST_IDS.userId]
    }).success).toBe(false)
  })

  it('requires unique Project members including the owner and a bounded budget', () => {
    expect(projectSchema.safeParse({ ...projectFixture, memberUserIds: [TEST_IDS.secondUserId] }).success).toBe(false)
    expect(projectSchema.safeParse({ ...projectFixture, memberUserIds: [TEST_IDS.userId, TEST_IDS.userId] }).success).toBe(false)
    expect(projectSchema.safeParse({
      ...projectFixture,
      budget: { ...projectFixture.budget, maxTasksPerRound: 21 }
    }).success).toBe(false)
  })

  it('rejects self-dependencies, retry overflow, and missing terminal timestamps', () => {
    expect(taskSchema.safeParse({ ...taskFixture, dependencyTaskIds: [taskFixture.taskId] }).success).toBe(false)
    expect(taskSchema.safeParse({ ...taskFixture, attempt: 4, maxRetries: 2 }).success).toBe(false)
    expect(taskSchema.safeParse({ ...taskFixture, status: 'succeeded' }).success).toBe(false)
    expect(taskSchema.safeParse({ ...taskFixture, status: 'succeeded', completedAt: TEST_LATER_TIMESTAMP,
      resultSummary: '有界结果摘要', resultProjectRecordId: TEST_IDS.projectRecordId }).success).toBe(true)
    expect(taskSchema.safeParse({ ...taskFixture, status: 'running', progress: {
      percent: 40, summary: '已完成输入校验', reportedAt: TEST_LATER_TIMESTAMP
    } }).success).toBe(true)
    expect(taskSchema.safeParse({ ...taskFixture, status: 'running', resultSummary: '过早结果' }).success).toBe(false)
    expect(taskSchema.safeParse({ ...taskFixture, status: 'failed', completedAt: TEST_LATER_TIMESTAMP }).success).toBe(false)
    expect(taskSchema.safeParse({ ...taskFixture, status: 'failed', completedAt: TEST_LATER_TIMESTAMP,
      safeFailureCode: 'input_invalid' }).success).toBe(true)
    expect(taskSchema.safeParse({ ...taskFixture, status: 'failed', completedAt: TEST_LATER_TIMESTAMP,
      safeFailureCode: 'input_invalid', safeFailureSummary: 'Input validation rejected the bounded request.' }).success).toBe(true)
    expect(taskSchema.safeParse({ ...taskFixture, status: 'running', safeFailureSummary: 'Failure text before failure.' }).success).toBe(false)
    expect(taskSchema.safeParse({ ...taskFixture, status: 'failed', completedAt: TEST_LATER_TIMESTAMP,
      safeFailureSummary: 'A summary cannot replace the stable failure code.' }).success).toBe(false)
  })

  it('keeps the Project capability directory minimal and strict', () => {
    expect(projectCapabilityDirectorySchema.safeParse(projectCapabilityDirectoryFixture).success).toBe(true)
    for (const forbidden of ['installationId', 'credentialVersion', 'humanEndpointId', 'deviceCredential'] as const) {
      expect(projectCapabilityDirectorySchema.safeParse({
        ...projectCapabilityDirectoryFixture,
        agents: [{ ...projectCapabilityDirectoryFixture.agents[0], [forbidden]: 'forbidden' }]
      }).success).toBe(false)
    }
  })

  it('requires provenance acceptance fields only on accepted Project Records', () => {
    expect(projectRecordSchema.safeParse({
      ...projectRecordFixture,
      status: 'accepted'
    }).success).toBe(false)
    expect(projectRecordSchema.safeParse({
      ...projectRecordFixture,
      status: 'accepted',
      acceptedByAgentId: TEST_IDS.agentId,
      acceptedAt: TEST_LATER_TIMESTAMP
    }).success).toBe(true)
  })

  it('requires ResourceRef creator provenance and pairs Task identity with its revision', () => {
    const taskResource = {
      ...resourceRefFixture,
      taskId: TEST_IDS.taskId,
      taskRevision: 1,
      createdByUserId: TEST_IDS.userId,
      createdByAgentId: TEST_IDS.agentId
    }
    expect(resourceRefSchema.safeParse(taskResource).success).toBe(true)
    expect(resourceRefSchema.safeParse({
      ...taskResource,
      taskId: null,
      executionId: null,
      taskRevision: null,
      createdByUserId: TEST_IDS.userId,
      createdByAgentId: null
    }).success).toBe(true)
    expect(resourceRefSchema.safeParse({ ...taskResource, taskRevision: null }).success).toBe(false)
    expect(resourceRefSchema.safeParse({ ...taskResource, taskId: null }).success).toBe(false)
    expect(resourceRefSchema.safeParse({
      ...taskResource,
      createdByUserId: null
    }).success).toBe(false)
  })

  it('keeps ResourceRef metadata-only and HTTPS-only while allowing ordinary query parameters', () => {
    const base = {
      provider: resourceRefFixture.provider,
      externalId: resourceRefFixture.externalId,
      kind: resourceRefFixture.kind,
      name: resourceRefFixture.name,
      openUrl: 'https://content.example.invalid/resources/document-42?view=summary&locale=zh-CN',
      version: resourceRefFixture.version ?? undefined
    }
    expect(resourceRefCreateMetadataSchema.safeParse(base).success).toBe(true)
    for (const rejected of [
      { ...base, openUrl: 'file:///Users/test/private.txt' },
      { ...base, externalId: '/Users/test/private.txt' },
      { ...base, body: 'full document body' },
      { ...base, credential: 'test-only' },
      { ...base, localPath: 'C:\\Users\\test\\private.txt' }
    ]) {
      expect(resourceRefCreateMetadataSchema.safeParse(rejected).success).toBe(false)
    }
  })

  it('rejects fragments, credential parameters, and authorization material in ResourceRef metadata', () => {
    const base = {
      provider: resourceRefFixture.provider,
      externalId: resourceRefFixture.externalId,
      kind: resourceRefFixture.kind,
      name: resourceRefFixture.name,
      openUrl: resourceRefFixture.openUrl,
      version: resourceRefFixture.version ?? undefined
    }
    const rejectedOpenUrls = [
      'https://content.example.invalid/resource#',
      'https://content.example.invalid/resource#section-1',
      'https://content.example.invalid/resource?sig=test-only-signature',
      'https://content.example.invalid/resource?SiG=test-only-signature',
      'https://content.example.invalid/resource?%73%69%67=test-only-signature',
      'https://user:password@content.example.invalid/resource',
      'https://content.example.invalid/resource?note=Bearer%20test-only-token',
      'https://content.example.invalid/resource?note=Basic%20dGVzdC1vbmx5OnNlY3JldA==',
      'https://content.example.invalid/resource?token=test-only-token',
      'https://content.example.invalid/resource?signature=test-only-signature',
      'https://content.example.invalid/resource?password=test-only-password'
    ]
    for (const openUrl of rejectedOpenUrls) {
      expect(resourceRefCreateMetadataSchema.safeParse({ ...base, openUrl }).success).toBe(false)
    }

    const credentialValues = [
      'Bearer test-only-token',
      'Basic dGVzdC1vbmx5OnNlY3JldA==',
      'token=test-only-token',
      'signature=test-only-signature',
      'password=test-only-password'
    ]
    for (const field of ['name', 'externalId', 'version'] as const) {
      for (const value of credentialValues) {
        expect(resourceRefCreateMetadataSchema.safeParse({ ...base, [field]: value }).success).toBe(false)
        expect(resourceRefSchema.safeParse({ ...resourceRefFixture, [field]: value }).success).toBe(false)
      }
    }
  })
})
