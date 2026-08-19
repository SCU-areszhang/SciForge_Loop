import { z } from 'zod'
import {
  agentIdSchema,
  assuranceLevelSchema,
  challengeIdSchema,
  confirmationIdSchema,
  containsCredentialMaterial,
  criterionIdSchema,
  credentialVersionSchema,
  displayNameSchema,
  entityMetadataShape,
  executionIdSchema,
  humanAnswerIdSchema,
  humanEndpointIdSchema,
  humanRequestIdSchema,
  inboxMessageIdSchema,
  isCredentialFieldName,
  localItemIdSchema,
  nonEmptyTextSchema,
  participantIdSchema,
  projectIdSchema,
  projectEndpointBindingIdSchema,
  projectInputIdSchema,
  projectRecordIdSchema,
  projectionIdSchema,
  providerMessageIdSchema,
  providerIdSchema,
  resourceRefIdSchema,
  revisionSchema,
  runtimeIdSchema,
  schemaVersionSchema,
  sequenceSchema,
  sha256Schema,
  taskIdSchema,
  threadIdSchema,
  timestampSchema,
  turnIdSchema,
  userIdSchema
} from './core.js'
import { deviceIdSchema } from './identity.js'
import {
  isPortableReferenceKind,
  portableResourceReferenceCarrierSchema
} from './portable-resource.js'
import { providerIdentitySchema, providerLocatorSchema } from './provider.js'

function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

export const userStatusSchema = z.enum(['active', 'suspended', 'revoked'])
export type UserStatus = z.infer<typeof userStatusSchema>

export const userPrincipalSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('user_principal'),
  userId: userIdSchema,
  displayName: displayNameSchema,
  status: userStatusSchema
}).strict()
export type UserPrincipal = z.infer<typeof userPrincipalSchema>

export const endpointStatusSchema = z.enum(['active', 'suspended', 'revoked'])
export type EndpointStatus = z.infer<typeof endpointStatusSchema>

export const humanEndpointBindingSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('human_endpoint_binding'),
  humanEndpointId: humanEndpointIdSchema,
  userId: userIdSchema,
  identity: providerIdentitySchema,
  displayName: displayNameSchema,
  assurance: assuranceLevelSchema.exclude(['basic']),
  status: endpointStatusSchema,
  verifiedAt: timestampSchema,
  lastSeenAt: timestampSchema.optional(),
  revokedAt: timestampSchema.optional()
}).strict().superRefine((binding, context) => {
  if (binding.status === 'revoked' && binding.revokedAt === undefined) {
    context.addIssue({ code: 'custom', path: ['revokedAt'], message: 'Revoked endpoint requires revokedAt' })
  }
  if (binding.status !== 'revoked' && binding.revokedAt !== undefined) {
    context.addIssue({ code: 'custom', path: ['revokedAt'], message: 'Only revoked endpoint may set revokedAt' })
  }
})
export type HumanEndpointBinding = z.infer<typeof humanEndpointBindingSchema>

export const endpointChallengeStatusSchema = z.enum(['pending', 'consumed', 'expired', 'cancelled'])
export const endpointChallengeSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('endpoint_challenge'),
  challengeId: challengeIdSchema,
  userId: userIdSchema,
  expectedIdentity: providerIdentitySchema,
  status: endpointChallengeStatusSchema,
  expiresAt: timestampSchema,
  consumedAt: timestampSchema.optional()
}).strict().superRefine((challenge, context) => {
  if ((challenge.status === 'consumed') !== (challenge.consumedAt !== undefined)) {
    context.addIssue({ code: 'custom', path: ['consumedAt'], message: 'Consumed challenge requires consumedAt exclusively' })
  }
})
export type EndpointChallenge = z.infer<typeof endpointChallengeSchema>

export const agentLifecycleStatusSchema = z.enum(['active', 'revoked'])
export const agentConnectionStatusSchema = z.enum(['online', 'offline'])
export const agentNodeTypeSchema = z.enum(['desktop', 'server'])
export type AgentLifecycleStatus = z.infer<typeof agentLifecycleStatusSchema>
export type AgentConnectionStatus = z.infer<typeof agentConnectionStatusSchema>
export type AgentNodeType = z.infer<typeof agentNodeTypeSchema>

export const agentCapabilitySchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/u)

export const agentNodeSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('agent_node'),
  agentId: agentIdSchema,
  deviceId: deviceIdSchema.nullable().optional(),
  ownerUserId: userIdSchema,
  displayName: displayNameSchema,
  nodeType: agentNodeTypeSchema,
  capabilities: z.array(agentCapabilitySchema).max(256).refine(uniqueStrings, 'Capabilities must be unique'),
  lifecycleStatus: agentLifecycleStatusSchema,
  connectionStatus: agentConnectionStatusSchema,
  credentialVersion: credentialVersionSchema,
  lastSeenAt: timestampSchema.optional(),
  revokedAt: timestampSchema.optional()
}).strict().superRefine((agent, context) => {
  if (agent.lifecycleStatus === 'active' && agent.deviceId == null) {
    context.addIssue({ code: 'custom', path: ['deviceId'], message: 'Active Agent requires an associated Device' })
  }
  if (agent.lifecycleStatus === 'revoked' && agent.revokedAt === undefined) {
    context.addIssue({ code: 'custom', path: ['revokedAt'], message: 'Revoked Agent requires revokedAt' })
  }
  if (agent.lifecycleStatus === 'revoked' && agent.connectionStatus !== 'offline') {
    context.addIssue({ code: 'custom', path: ['connectionStatus'], message: 'Revoked Agent must be offline' })
  }
  if (agent.lifecycleStatus === 'active' && agent.revokedAt !== undefined) {
    context.addIssue({ code: 'custom', path: ['revokedAt'], message: 'Active Agent cannot have revokedAt' })
  }
})
export type AgentNode = z.infer<typeof agentNodeSchema>

export const capabilityEvidenceLevelSchema = z.enum(['detected', 'configured', 'verified'])
export const capabilityEvidenceSchema = z.object({
  level: capabilityEvidenceLevelSchema,
  checkedAt: timestampSchema,
  summary: z.string().trim().min(1).max(500).optional()
}).strict()
export type CapabilityEvidence = z.infer<typeof capabilityEvidenceSchema>

export const resultReturnPolicySchema = z.object({
  summary: z.literal(true),
  evidenceRefs: z.boolean(),
  resourceRefs: z.boolean(),
  logSummary: z.boolean(),
  fullFileRequiresConfirmation: z.literal(true),
  fullLogRequiresConfirmation: z.literal(true)
}).strict()
export type ResultReturnPolicy = z.infer<typeof resultReturnPolicySchema>

const capabilityRuntimeIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
const accessIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u)

export const agentCapabilityReportSchema = z.object({
  agentId: agentIdSchema,
  ownerUserId: userIdSchema,
  nodeType: z.enum(['personal_computer', 'institution_server']),
  os: z.object({
    family: z.enum(['windows', 'macos', 'linux']),
    architecture: z.enum(['x64', 'arm64']),
    version: z.string().trim().min(1).max(200).optional()
  }).strict(),
  runtimeIds: z.array(capabilityRuntimeIdSchema).max(100).refine(uniqueStrings, 'Runtime IDs must be unique'),
  capabilities: z.array(z.object({
    capabilityId: agentCapabilitySchema,
    version: z.string().trim().min(1).max(200).optional(),
    evidence: capabilityEvidenceSchema
  }).strict()).max(256).refine(
    (capabilities) => uniqueStrings(capabilities.map((capability) => capability.capabilityId)),
    'Capability IDs must be unique'
  ),
  gpu: z.array(z.object({
    vendor: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    memoryGB: z.number().finite().min(0).max(1_000_000).optional(),
    evidence: capabilityEvidenceSchema
  }).strict()).max(32).default([]),
  vpnAccessIds: z.array(accessIdSchema).max(100).refine(uniqueStrings, 'VPN access IDs must be unique'),
  slurmClusterIds: z.array(accessIdSchema).max(100).refine(uniqueStrings, 'Slurm cluster IDs must be unique'),
  accessibleResourceRefIds: z.array(resourceRefIdSchema).max(10_000)
    .refine(uniqueStrings, 'Accessible ResourceRef IDs must be unique'),
  resultReturnPolicy: resultReturnPolicySchema,
  reportedAt: timestampSchema,
  expiresAt: timestampSchema
}).strict().superRefine((report, context) => {
  if (new Date(report.expiresAt).getTime() <= new Date(report.reportedAt).getTime()) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Capability profile must expire after it is reported' })
  }
})
export type AgentCapabilityReport = z.infer<typeof agentCapabilityReportSchema>

export const agentCapabilityProfileSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('agent_capability_profile'),
  ...agentCapabilityReportSchema.shape
}).strict().superRefine((profile, context) => {
  if (new Date(profile.expiresAt).getTime() <= new Date(profile.reportedAt).getTime()) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Capability profile must expire after it is reported' })
  }
})
export type AgentCapabilityProfile = z.infer<typeof agentCapabilityProfileSchema>

export const projectCapabilityAgentSchema = z.object({
  agentId: agentIdSchema,
  ownerUserId: userIdSchema,
  displayName: displayNameSchema,
  nodeType: agentNodeTypeSchema,
  capabilities: z.array(agentCapabilitySchema).max(256).refine(uniqueStrings, 'Capabilities must be unique'),
  status: z.enum(['online', 'offline', 'busy', 'revoked']),
  lastSeenAt: timestampSchema,
  profile: agentCapabilityProfileSchema,
  revision: revisionSchema
}).strict().superRefine((entry, context) => {
  if (entry.profile.agentId !== entry.agentId) {
    context.addIssue({ code: 'custom', path: ['profile', 'agentId'], message: 'Capability profile Agent must match directory entry' })
  }
  if (entry.profile.ownerUserId !== entry.ownerUserId) {
    context.addIssue({ code: 'custom', path: ['profile', 'ownerUserId'], message: 'Capability profile owner must match directory entry' })
  }
})
export type ProjectCapabilityAgent = z.infer<typeof projectCapabilityAgentSchema>

export const projectCapabilityDirectorySchema = z.object({
  schemaVersion: schemaVersionSchema,
  type: z.literal('project_capability_directory'),
  projectId: projectIdSchema,
  projectRevision: revisionSchema,
  agents: z.array(projectCapabilityAgentSchema).max(10_000)
    .refine((agents) => uniqueStrings(agents.map((agent) => agent.agentId)), 'Capability Agent IDs must be unique')
}).strict()
export type ProjectCapabilityDirectory = z.infer<typeof projectCapabilityDirectorySchema>

export const participantStatusSchema = z.enum(['incomplete', 'active', 'suspended', 'revoked'])
export type ParticipantStatus = z.infer<typeof participantStatusSchema>

export const participantProfileSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('participant_profile'),
  participantId: participantIdSchema,
  userId: userIdSchema,
  primaryHumanEndpointId: humanEndpointIdSchema.nullable(),
  primaryAgentId: agentIdSchema.nullable(),
  status: participantStatusSchema
}).strict().superRefine((participant, context) => {
  const complete = participant.primaryHumanEndpointId !== null && participant.primaryAgentId !== null
  if (participant.status === 'active' && !complete) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Active Participant requires both primary endpoints' })
  }
  if (participant.status === 'incomplete' && complete) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Complete Participant cannot be incomplete' })
  }
})
export type ParticipantProfile = z.infer<typeof participantProfileSchema>

export const projectionStatusSchema = z.enum(['active', 'paused', 'error', 'closed'])
export type ProjectionStatus = z.infer<typeof projectionStatusSchema>

export const remoteSessionProjectionSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('remote_session_projection'),
  projectionId: projectionIdSchema,
  ownerUserId: userIdSchema,
  agentId: agentIdSchema,
  humanEndpointId: humanEndpointIdSchema,
  locator: providerLocatorSchema,
  locatorRevision: revisionSchema,
  displayName: displayNameSchema,
  status: projectionStatusSchema,
  allowedSenderUserIds: z.array(userIdSchema).min(1).max(100).refine(uniqueStrings, 'Allowed senders must be unique'),
  lastErrorCode: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/u).optional()
}).strict().superRefine((projection, context) => {
  if (!projection.allowedSenderUserIds.includes(projection.ownerUserId)) {
    context.addIssue({ code: 'custom', path: ['allowedSenderUserIds'], message: 'Projection owner must be allowed' })
  }
  if (projection.status === 'error' && projection.lastErrorCode === undefined) {
    context.addIssue({ code: 'custom', path: ['lastErrorCode'], message: 'Error projection requires lastErrorCode' })
  }
  if (projection.status !== 'error' && projection.lastErrorCode !== undefined) {
    context.addIssue({ code: 'custom', path: ['lastErrorCode'], message: 'Only error projection may set lastErrorCode' })
  }
})
export type RemoteSessionProjection = z.infer<typeof remoteSessionProjectionSchema>

export const localSessionProjectionBindingSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal('local_session_projection_binding'),
  projectionId: projectionIdSchema,
  agentId: agentIdSchema,
  runtimeId: runtimeIdSchema,
  threadId: threadIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).strict()
export type LocalSessionProjectionBinding = z.infer<typeof localSessionProjectionBindingSchema>

export const projectInputStatusSchema = z.enum(['queued', 'processed', 'rejected', 'expired'])
export type ProjectInputStatus = z.infer<typeof projectInputStatusSchema>

export const projectInputSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('project_input'),
  projectInputId: projectInputIdSchema,
  projectId: projectIdSchema,
  senderUserId: userIdSchema,
  sourceHumanEndpointId: humanEndpointIdSchema,
  providerMessageId: providerMessageIdSchema,
  sequence: sequenceSchema,
  text: nonEmptyTextSchema,
  status: projectInputStatusSchema,
  occurredAt: timestampSchema
}).strict()
export type ProjectInput = z.infer<typeof projectInputSchema>

export const projectStatusSchema = z.enum(['draft', 'active', 'paused', 'completed', 'cancelled'])
export type ProjectStatus = z.infer<typeof projectStatusSchema>

export const projectBudgetSchema = z.object({
  maxTasks: z.number().int().min(1).max(10_000),
  maxTasksPerRound: z.number().int().min(1).max(1_000),
  maxCoordinationRounds: z.number().int().min(1).max(10_000),
  maxTaskRetries: z.number().int().min(0).max(100)
}).strict().superRefine((budget, context) => {
  if (budget.maxTasksPerRound > budget.maxTasks) {
    context.addIssue({ code: 'custom', path: ['maxTasksPerRound'], message: 'Per-round budget cannot exceed total tasks' })
  }
})
export type ProjectBudget = z.infer<typeof projectBudgetSchema>

export const projectSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('project'),
  projectId: projectIdSchema,
  ownerUserId: userIdSchema,
  displayName: displayNameSchema,
  goal: nonEmptyTextSchema,
  memberUserIds: z.array(userIdSchema).min(1).max(1_000).refine(uniqueStrings, 'Project members must be unique'),
  coordinatorAgentId: agentIdSchema,
  status: projectStatusSchema,
  budget: projectBudgetSchema
}).strict().superRefine((project, context) => {
  if (!project.memberUserIds.includes(project.ownerUserId)) {
    context.addIssue({ code: 'custom', path: ['memberUserIds'], message: 'Project owner must be a member' })
  }
})
export type Project = z.infer<typeof projectSchema>

export const projectEndpointBindingStatusSchema = z.enum(['active', 'error', 'closed'])
export const projectEndpointBindingSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('project_endpoint_binding'),
  projectEndpointBindingId: projectEndpointBindingIdSchema,
  projectId: projectIdSchema,
  locator: providerLocatorSchema,
  locatorRevision: revisionSchema,
  status: projectEndpointBindingStatusSchema,
  lastErrorCode: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/u).optional()
}).strict().superRefine((binding, context) => {
  if ((binding.status === 'error') !== (binding.lastErrorCode !== undefined)) {
    context.addIssue({ code: 'custom', path: ['lastErrorCode'], message: 'Error binding requires lastErrorCode exclusively' })
  }
})
export type ProjectEndpointBinding = z.infer<typeof projectEndpointBindingSchema>

export const taskStatusSchema = z.enum([
  'offered',
  'accepted',
  'rejected',
  'running',
  'needs_human',
  'succeeded',
  'failed',
  'cancelled'
])
export type TaskStatus = z.infer<typeof taskStatusSchema>

export const taskProgressSchema = z.object({
  percent: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(2_000),
  reportedAt: timestampSchema
}).strict()
export type TaskProgress = z.infer<typeof taskProgressSchema>

export const taskSafeFailureCodeSchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/u)

export const taskCriterionSchema = z.object({
  criterionId: criterionIdSchema,
  text: z.string().trim().min(1).max(2_000)
}).strict()
export type TaskCriterion = z.infer<typeof taskCriterionSchema>

export const taskCriterionEvidenceSchema = z.object({
  criterionId: criterionIdSchema,
  summary: z.string().trim().min(1).max(2_000),
  resourceRefIds: z.array(resourceRefIdSchema).max(1_000)
    .refine(uniqueStrings, 'Criterion ResourceRef IDs must be unique')
}).strict()
export type TaskCriterionEvidence = z.infer<typeof taskCriterionEvidenceSchema>

export const structuredTaskResultSchema = z.object({
  summary: nonEmptyTextSchema,
  criterionEvidence: z.array(taskCriterionEvidenceSchema).max(100)
    .refine((items) => uniqueStrings(items.map((item) => item.criterionId)), 'Criterion evidence IDs must be unique'),
  resourceRefIds: z.array(resourceRefIdSchema).max(1_000)
    .refine(uniqueStrings, 'Result ResourceRef IDs must be unique'),
  logSummary: z.string().trim().min(1).max(2_000).optional()
}).strict().superRefine((result, context) => {
  const resultResources = new Set(result.resourceRefIds)
  for (const [index, evidence] of result.criterionEvidence.entries()) {
    for (const resourceRefId of evidence.resourceRefIds) {
      if (!resultResources.has(resourceRefId)) {
        context.addIssue({
          code: 'custom',
          path: ['criterionEvidence', index, 'resourceRefIds'],
          message: 'Criterion evidence ResourceRefs must also appear in the result ResourceRef list'
        })
      }
    }
  }
})
export type StructuredTaskResult = z.infer<typeof structuredTaskResultSchema>

export const workerRequirementSchema = z.object({
  osFamilies: z.array(z.enum(['windows', 'macos', 'linux'])).max(3).refine(uniqueStrings, 'OS families must be unique').optional(),
  capabilityIds: z.array(agentCapabilitySchema).max(256).refine(uniqueStrings, 'Required capability IDs must be unique'),
  minimumEvidenceLevel: capabilityEvidenceLevelSchema.optional(),
  minGpuMemoryGB: z.number().finite().min(0).max(1_000_000).optional(),
  vpnAccessIds: z.array(accessIdSchema).max(100).refine(uniqueStrings, 'Required VPN access IDs must be unique'),
  slurmClusterIds: z.array(accessIdSchema).max(100).refine(uniqueStrings, 'Required Slurm cluster IDs must be unique'),
  requiredResourceRefIds: z.array(resourceRefIdSchema).max(1_000)
    .refine(uniqueStrings, 'Required ResourceRef IDs must be unique'),
  requireLogSummary: z.boolean().optional()
}).strict()
export type WorkerRequirement = z.infer<typeof workerRequirementSchema>

export const authorizationRequirementSchema = z.object({
  id: z.string().regex(/^auth_[A-Za-z0-9]{12,64}$/u),
  kind: z.enum(['resource_access', 'data_egress', 'file_upload', 'local_action']),
  targetRefId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u).optional(),
  description: z.string().trim().min(1).max(500)
}).strict()
export type AuthorizationRequirement = z.infer<typeof authorizationRequirementSchema>

export const emptyWorkerRequirement = {
  capabilityIds: [],
  vpnAccessIds: [],
  slurmClusterIds: [],
  requiredResourceRefIds: []
} as const satisfies WorkerRequirement

export const taskSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('task'),
  taskId: taskIdSchema,
  projectId: projectIdSchema,
  executionId: executionIdSchema,
  createdByCoordinatorAgentId: agentIdSchema,
  assigneeAgentId: agentIdSchema,
  assigneeUserId: userIdSchema,
  title: displayNameSchema,
  objective: nonEmptyTextSchema,
  completionCriteria: z.array(taskCriterionSchema).min(1).max(100)
    .refine((criteria) => uniqueStrings(criteria.map((criterion) => criterion.criterionId)), 'Criterion IDs must be unique'),
  dependencyTaskIds: z.array(taskIdSchema).max(1_000).refine(uniqueStrings, 'Task dependencies must be unique'),
  requiredCapabilities: workerRequirementSchema,
  resourceRefIds: z.array(resourceRefIdSchema).max(1_000).refine(uniqueStrings, 'Task ResourceRef IDs must be unique'),
  authorizationRequirements: z.array(authorizationRequirementSchema).max(100)
    .refine((requirements) => uniqueStrings(requirements.map((requirement) => requirement.id)), 'Authorization requirement IDs must be unique'),
  status: taskStatusSchema,
  attempt: z.number().int().min(1).max(101),
  maxRetries: z.number().int().min(0).max(100),
  activeTurnId: turnIdSchema.optional(),
  progress: taskProgressSchema.optional(),
  resultSummary: nonEmptyTextSchema.optional(),
  resultProjectRecordId: projectRecordIdSchema.optional(),
  safeFailureCode: taskSafeFailureCodeSchema.optional(),
  safeFailureSummary: z.string().trim().min(1).max(2_000).optional(),
  completedAt: timestampSchema.optional()
}).strict().superRefine((task, context) => {
  if (task.dependencyTaskIds.includes(task.taskId)) {
    context.addIssue({ code: 'custom', path: ['dependencyTaskIds'], message: 'Task cannot depend on itself' })
  }
  if (task.attempt > task.maxRetries + 1) {
    context.addIssue({ code: 'custom', path: ['attempt'], message: 'Task attempt exceeds retry budget' })
  }
  const terminal = task.status === 'rejected' || task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled'
  if (terminal !== (task.completedAt !== undefined)) {
    context.addIssue({ code: 'custom', path: ['completedAt'], message: 'Terminal Task requires completedAt exclusively' })
  }
  const hasResult = task.resultSummary !== undefined && task.resultProjectRecordId !== undefined
  if ((task.status === 'succeeded') !== hasResult) {
    context.addIssue({ code: 'custom', path: ['resultProjectRecordId'], message: 'Succeeded Task requires result summary and candidate ProjectRecord exclusively' })
  }
  if ((task.resultSummary === undefined) !== (task.resultProjectRecordId === undefined)) {
    context.addIssue({ code: 'custom', path: ['resultProjectRecordId'], message: 'Task result summary and candidate ProjectRecord must be present together' })
  }
  if ((task.status === 'failed') !== (task.safeFailureCode !== undefined)) {
    context.addIssue({ code: 'custom', path: ['safeFailureCode'], message: 'Failed Task requires safeFailureCode exclusively' })
  }
  if (task.status !== 'failed' && task.safeFailureSummary !== undefined) {
    context.addIssue({ code: 'custom', path: ['safeFailureSummary'], message: 'Safe failure summary belongs only to a failed Task' })
  }
})
export type Task = z.infer<typeof taskSchema>

export const projectRecordKindSchema = z.enum(['observation', 'proposal', 'decision', 'summary', 'task_result'])
export const projectRecordStatusSchema = z.enum(['proposed', 'accepted', 'rejected', 'superseded'])
export type ProjectRecordKind = z.infer<typeof projectRecordKindSchema>
export type ProjectRecordStatus = z.infer<typeof projectRecordStatusSchema>

export const projectRecordSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('project_record'),
  projectRecordId: projectRecordIdSchema,
  projectId: projectIdSchema,
  kind: projectRecordKindSchema,
  status: projectRecordStatusSchema,
  body: nonEmptyTextSchema,
  authorUserId: userIdSchema,
  authorAgentId: agentIdSchema.nullable(),
  sourceTaskId: taskIdSchema.nullable(),
  sourceExecutionId: executionIdSchema.nullable(),
  sourceRevision: revisionSchema,
  criterionEvidence: z.array(taskCriterionEvidenceSchema).max(100)
    .refine((items) => uniqueStrings(items.map((item) => item.criterionId)), 'Criterion evidence IDs must be unique'),
  resourceRefIds: z.array(resourceRefIdSchema).max(1_000)
    .refine(uniqueStrings, 'ProjectRecord ResourceRef IDs must be unique'),
  logSummary: z.string().trim().min(1).max(2_000).nullable(),
  acceptedByUserId: userIdSchema.nullable(),
  acceptedByAgentId: agentIdSchema.nullable(),
  acceptedAt: timestampSchema.nullable()
}).strict().superRefine((record, context) => {
  if ((record.sourceTaskId === null) !== (record.sourceExecutionId === null)) {
    context.addIssue({ code: 'custom', path: ['sourceExecutionId'], message: 'Task provenance requires Task and execution identity together' })
  }
  if (record.kind === 'task_result' && (record.sourceTaskId === null || record.sourceExecutionId === null)) {
    context.addIssue({ code: 'custom', path: ['sourceExecutionId'], message: 'Task result requires Task execution provenance' })
  }
  if (record.kind !== 'task_result' && (record.criterionEvidence.length > 0 || record.logSummary !== null)) {
    context.addIssue({ code: 'custom', path: ['criterionEvidence'], message: 'Structured result evidence belongs only to task_result records' })
  }
  const recordResources = new Set(record.resourceRefIds)
  if (record.criterionEvidence.some((evidence) => evidence.resourceRefIds.some((resourceRefId) => !recordResources.has(resourceRefId)))) {
    context.addIssue({ code: 'custom', path: ['criterionEvidence'], message: 'Criterion evidence ResourceRefs must also appear in the ProjectRecord ResourceRef list' })
  }
  const hasAcceptance = record.acceptedByUserId !== null || record.acceptedByAgentId !== null
  if (record.status === 'accepted' && (!hasAcceptance || record.acceptedAt === null)) {
    context.addIssue({ code: 'custom', path: ['acceptedAt'], message: 'Accepted record requires accepter and time' })
  }
  if (record.status !== 'accepted' && (hasAcceptance || record.acceptedAt !== null)) {
    context.addIssue({ code: 'custom', path: ['acceptedAt'], message: 'Only accepted record may identify accepter' })
  }
})
export type ProjectRecord = z.infer<typeof projectRecordSchema>

export const resourceRefProviderSchema = providerIdSchema
export const resourceRefKindSchema = z.string().regex(/^[a-z][a-z0-9._-]{0,127}$/u)
const unicodeControlCharacterPattern = /\p{Cc}/u
export const resourceRefExternalIdSchema = z.string().trim().min(1).max(512)
  .refine((value) => !/^(?:file:|\/|~[\\/]|[A-Za-z]:[\\/]|\\\\)/iu.test(value), {
    message: 'Resource external ID must not be a local absolute path or file URL'
  })
  .refine((value) => !unicodeControlCharacterPattern.test(value), {
    message: 'Resource external ID must not contain control characters'
  })
  .refine((value) => !containsCredentialMaterial(value), {
    message: 'Resource external ID must not contain credential material'
  })
export const resourceRefNameSchema = displayNameSchema
  .refine((value) => !unicodeControlCharacterPattern.test(value), {
    message: 'Resource name must not contain control characters'
  })
  .refine((value) => !containsCredentialMaterial(value), {
    message: 'Resource name must not contain credential material'
  })
export const resourceRefVersionSchema = z.string().trim().min(1).max(200)
  .refine((value) => !unicodeControlCharacterPattern.test(value), {
    message: 'Resource version must not contain control characters'
  })
  .refine((value) => !containsCredentialMaterial(value), {
    message: 'Resource version must not contain credential material'
  })
export const resourceRefOpenUrlSchema = z.string().trim().min(1).max(2_048).superRefine((value, context) => {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    context.addIssue({ code: 'custom', message: 'Resource openUrl must be a valid HTTPS URL' })
    return
  }
  if (parsed.protocol !== 'https:' || !/^https:\/\/[^/?#@\s]+(?:[/?]|$)/iu.test(value)) {
    context.addIssue({ code: 'custom', message: 'Resource openUrl must use HTTPS' })
  }
  if (parsed.username || parsed.password) {
    context.addIssue({ code: 'custom', message: 'Resource openUrl must not contain credentials' })
  }
  if (value.includes('#')) {
    context.addIssue({ code: 'custom', message: 'Resource openUrl must not contain a fragment' })
  }
  const sensitiveParameter = [...parsed.searchParams.keys()].find((key) => {
    const normalized = key.replace(/[^a-z0-9]/giu, '').toLowerCase()
    return isCredentialFieldName(key) || /^(?:authorization|credential|password|passphrase|secret|signature|sig|token|apikey|privatekey|accesskey)$/u.test(normalized)
  })
  if (sensitiveParameter) {
    context.addIssue({ code: 'custom', message: 'Resource openUrl must not contain credential-bearing query parameters' })
  }
  if (containsCredentialMaterial(value)) {
    context.addIssue({ code: 'custom', message: 'Resource openUrl must not embed authorization material' })
  }
})

export const resourceRefStatusSchema = z.enum(['available', 'unavailable', 'revoked', 'invalidated'])
export type ResourceRefStatus = z.infer<typeof resourceRefStatusSchema>

export const resourceRefCreateMetadataSchema = z.object({
  provider: resourceRefProviderSchema,
  externalId: resourceRefExternalIdSchema,
  kind: resourceRefKindSchema,
  name: resourceRefNameSchema,
  openUrl: resourceRefOpenUrlSchema.optional(),
  portableReference: portableResourceReferenceCarrierSchema.optional(),
  version: resourceRefVersionSchema.optional()
}).strict().superRefine((resource, context) => {
  const portableKind = isPortableReferenceKind(resource.kind)
  if (portableKind !== (resource.portableReference !== undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['portableReference'],
      message: 'Content Space ResourceRef kinds require exactly one portable reference carrier'
    })
  }
  if (resource.portableReference && resource.portableReference.kind !== resource.kind) {
    context.addIssue({
      code: 'custom',
      path: ['portableReference', 'kind'],
      message: 'ResourceRef kind must match the portable reference kind'
    })
  }
})
export type ResourceRefCreateMetadata = z.infer<typeof resourceRefCreateMetadataSchema>

export const resourceRefSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('resource_ref'),
  resourceRefId: resourceRefIdSchema,
  projectId: projectIdSchema,
  taskId: taskIdSchema.nullable(),
  executionId: executionIdSchema.nullable(),
  taskRevision: revisionSchema.nullable(),
  createdByUserId: userIdSchema,
  createdByAgentId: agentIdSchema.nullable(),
  provider: resourceRefProviderSchema,
  externalId: resourceRefExternalIdSchema,
  kind: resourceRefKindSchema,
  name: resourceRefNameSchema,
  openUrl: resourceRefOpenUrlSchema.nullable(),
  portableReference: portableResourceReferenceCarrierSchema.nullable(),
  version: resourceRefVersionSchema.nullable(),
  status: resourceRefStatusSchema,
  statusReasonCode: taskSafeFailureCodeSchema.nullable(),
  unavailableAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable(),
  invalidatedAt: timestampSchema.nullable()
}).strict().superRefine((resource, context) => {
  const portableKind = isPortableReferenceKind(resource.kind)
  if (portableKind !== (resource.portableReference !== null)) {
    context.addIssue({
      code: 'custom',
      path: ['portableReference'],
      message: 'Content Space ResourceRef kinds require exactly one portable reference carrier'
    })
  }
  if (resource.portableReference && resource.portableReference.kind !== resource.kind) {
    context.addIssue({
      code: 'custom',
      path: ['portableReference', 'kind'],
      message: 'ResourceRef kind must match the portable reference kind'
    })
  }
  const taskScoped = resource.taskId !== null && resource.executionId !== null && resource.taskRevision !== null
  const anyTaskProvenance = resource.taskId !== null || resource.executionId !== null || resource.taskRevision !== null
  if (anyTaskProvenance && !taskScoped) {
    context.addIssue({
      code: 'custom',
      path: ['executionId'],
      message: 'Task-scoped ResourceRef requires Task, execution, and revision together'
    })
  }
  if ((resource.status === 'unavailable') !== (resource.unavailableAt !== null)) {
    context.addIssue({ code: 'custom', path: ['unavailableAt'], message: 'Unavailable ResourceRef requires unavailableAt exclusively' })
  }
  if ((resource.status === 'revoked') !== (resource.revokedAt !== null)) {
    context.addIssue({ code: 'custom', path: ['revokedAt'], message: 'Revoked ResourceRef requires revokedAt exclusively' })
  }
  if ((resource.status === 'invalidated') !== (resource.invalidatedAt !== null)) {
    context.addIssue({
      code: 'custom',
      path: ['invalidatedAt'],
      message: 'Invalidated ResourceRef requires invalidatedAt exclusively'
    })
  }
  const requiresReason = resource.status === 'unavailable' || resource.status === 'revoked'
  if (requiresReason !== (resource.statusReasonCode !== null)) {
    context.addIssue({ code: 'custom', path: ['statusReasonCode'], message: 'Unavailable or revoked ResourceRef requires a safe reason code exclusively' })
  }
})
export type ResourceRef = z.infer<typeof resourceRefSchema>

export const confirmableActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tasks.create'),
    projectId: projectIdSchema,
    proposalDigest: sha256Schema
  }).strict(),
  z.object({
    kind: z.literal('task.retry_reassign'),
    projectId: projectIdSchema,
    taskId: taskIdSchema,
    fromExecutionId: executionIdSchema,
    assigneeAgentId: agentIdSchema
  }).strict(),
  z.object({
    kind: z.literal('task.cancel'),
    projectId: projectIdSchema,
    taskId: taskIdSchema,
    executionId: executionIdSchema
  }).strict(),
  z.object({
    kind: z.literal('project.complete'),
    projectId: projectIdSchema,
    finalRecordDigest: sha256Schema
  }).strict()
])
export type ConfirmableAction = z.infer<typeof confirmableActionSchema>

export const actionConfirmationStatusSchema = z.enum(['approved', 'consumed', 'superseded'])
export const actionConfirmationSchema = z.object({
  schemaVersion: schemaVersionSchema,
  type: z.literal('action_confirmation'),
  confirmationId: confirmationIdSchema,
  humanRequestId: humanRequestIdSchema,
  projectId: projectIdSchema,
  targetUserId: userIdSchema,
  coordinatorAgentId: agentIdSchema,
  action: confirmableActionSchema,
  actionDigest: sha256Schema,
  status: actionConfirmationStatusSchema,
  approvedAt: timestampSchema,
  expiresAt: timestampSchema,
  consumedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).strict().superRefine((confirmation, context) => {
  if ((confirmation.status === 'consumed') !== (confirmation.consumedAt !== null)) {
    context.addIssue({ code: 'custom', path: ['consumedAt'], message: 'Consumed confirmation requires consumedAt exclusively' })
  }
  if (confirmation.action.projectId !== confirmation.projectId) {
    context.addIssue({ code: 'custom', path: ['action', 'projectId'], message: 'Confirmation action Project must match confirmation Project' })
  }
  if (new Date(confirmation.expiresAt).getTime() <= new Date(confirmation.approvedAt).getTime()) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Confirmation must expire after approval' })
  }
})
export type ActionConfirmation = z.infer<typeof actionConfirmationSchema>

export const humanNeededStatusSchema = z.enum(['pending', 'answered', 'expired', 'cancelled'])
export const humanNeededSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('human_needed'),
  humanRequestId: humanRequestIdSchema,
  projectId: projectIdSchema,
  sourceKind: z.enum(['worker', 'coordinator']),
  taskId: taskIdSchema.nullable(),
  executionId: executionIdSchema.nullable(),
  sourceInboxMessageId: inboxMessageIdSchema.nullable(),
  targetUserId: userIdSchema,
  requestedByAgentId: agentIdSchema,
  requiredAssurance: assuranceLevelSchema,
  prompt: nonEmptyTextSchema,
  confirmableAction: confirmableActionSchema.nullable(),
  status: humanNeededStatusSchema,
  expiresAt: timestampSchema
}).strict().superRefine((request, context) => {
  const workerSource = request.taskId !== null && request.executionId !== null && request.sourceInboxMessageId === null
  const coordinatorSource = request.taskId === null && request.executionId === null && request.sourceInboxMessageId !== null
  if (request.sourceKind === 'worker' && !workerSource) {
    context.addIssue({ code: 'custom', path: ['sourceKind'], message: 'Worker HumanNeeded requires Task execution provenance exclusively' })
  }
  if (request.sourceKind === 'coordinator' && !coordinatorSource) {
    context.addIssue({ code: 'custom', path: ['sourceKind'], message: 'Coordinator HumanNeeded requires source Inbox provenance exclusively' })
  }
  if (request.confirmableAction !== null && request.sourceKind !== 'coordinator') {
    context.addIssue({ code: 'custom', path: ['confirmableAction'], message: 'Only a Coordinator HumanNeeded may request immutable action confirmation' })
  }
  if (request.confirmableAction !== null && request.confirmableAction.projectId !== request.projectId) {
    context.addIssue({ code: 'custom', path: ['confirmableAction', 'projectId'], message: 'Confirmable action Project must match HumanNeeded Project' })
  }
})
export type HumanNeeded = z.infer<typeof humanNeededSchema>

export const humanAnswerSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('human_answer'),
  humanAnswerId: humanAnswerIdSchema,
  humanRequestId: humanRequestIdSchema,
  projectId: projectIdSchema,
  taskId: taskIdSchema.nullable(),
  executionId: executionIdSchema.nullable(),
  requestRevision: revisionSchema,
  answeredByUserId: userIdSchema,
  answeredFromHumanEndpointId: humanEndpointIdSchema,
  assurance: assuranceLevelSchema,
  answer: nonEmptyTextSchema,
  decision: z.enum(['approve', 'reject']).nullable(),
  confirmationId: confirmationIdSchema.nullable(),
  answeredAt: timestampSchema
}).strict().superRefine((answer, context) => {
  if ((answer.taskId === null) !== (answer.executionId === null)) {
    context.addIssue({ code: 'custom', path: ['executionId'], message: 'HumanAnswer Task provenance requires Task and execution identity together' })
  }
  if ((answer.decision === 'approve') !== (answer.confirmationId !== null)) {
    context.addIssue({ code: 'custom', path: ['confirmationId'], message: 'Approved confirmation answer requires confirmationId exclusively' })
  }
})
export type HumanAnswer = z.infer<typeof humanAnswerSchema>

export const projectCoordinationMemberSchema = z.object({
  userId: userIdSchema,
  displayName: displayNameSchema,
  role: z.enum(['owner', 'member', 'observer']),
  active: z.boolean()
}).strict()

export const projectCoordinationViewSchema = z.object({
  schemaVersion: schemaVersionSchema,
  type: z.literal('project_coordination_view'),
  projectId: projectIdSchema,
  projectRevision: revisionSchema,
  project: projectSchema,
  members: z.array(projectCoordinationMemberSchema).max(1_000)
    .refine((members) => uniqueStrings(members.map((member) => member.userId)), 'Coordination-view members must be unique'),
  tasks: z.array(taskSchema).max(10_000)
    .refine((tasks) => uniqueStrings(tasks.map((task) => task.taskId)), 'Coordination-view Tasks must be unique'),
  records: z.array(projectRecordSchema).max(50_000)
    .refine((records) => uniqueStrings(records.map((record) => record.projectRecordId)), 'Coordination-view records must be unique'),
  humanRequests: z.array(humanNeededSchema).max(10_000)
    .refine((requests) => uniqueStrings(requests.map((request) => request.humanRequestId)), 'Coordination-view HumanNeeded requests must be unique'),
  humanAnswers: z.array(humanAnswerSchema).max(10_000)
    .refine((answers) => uniqueStrings(answers.map((answer) => answer.humanAnswerId)), 'Coordination-view HumanAnswers must be unique'),
  readAt: timestampSchema
}).strict().superRefine((view, context) => {
  if (view.project.projectId !== view.projectId || view.project.revision !== view.projectRevision) {
    context.addIssue({ code: 'custom', path: ['projectRevision'], message: 'Coordination-view Project identity and revision must match' })
  }
  const projectMembers = new Set(view.project.memberUserIds)
  if (view.members.some((member) => !projectMembers.has(member.userId))) {
    context.addIssue({ code: 'custom', path: ['members'], message: 'Every coordination-view member must belong to the Project' })
  }
  const ownerMember = view.members.find((member) => member.userId === view.project.ownerUserId)
  if (ownerMember?.role !== 'owner') {
    context.addIssue({ code: 'custom', path: ['members'], message: 'Coordination-view Project owner must have owner role' })
  }
  const children = [...view.tasks, ...view.records, ...view.humanRequests, ...view.humanAnswers]
  if (children.some((child) => child.projectId !== view.projectId)) {
    context.addIssue({ code: 'custom', message: 'Every coordination-view child must belong to the same Project' })
  }
})
export type ProjectCoordinationView = z.infer<typeof projectCoordinationViewSchema>

export const orderedProjectionItemSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal('ordered_projection_item'),
  projectionId: projectionIdSchema,
  sequence: sequenceSchema,
  localItemId: localItemIdSchema,
  origin: z.enum(['local', 'remote']),
  senderUserId: userIdSchema,
  senderHumanEndpointId: humanEndpointIdSchema.optional(),
  providerMessageId: providerMessageIdSchema.optional(),
  text: nonEmptyTextSchema,
  createdAt: timestampSchema
}).strict().superRefine((item, context) => {
  const hasRemoteIdentity = item.senderHumanEndpointId !== undefined && item.providerMessageId !== undefined
  if ((item.origin === 'remote') !== hasRemoteIdentity) {
    context.addIssue({ code: 'custom', message: 'Remote origin requires endpoint and provider message identity' })
  }
})
export type OrderedProjectionItem = z.infer<typeof orderedProjectionItemSchema>
