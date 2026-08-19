import type {
  HumanNeeded,
  ResourceRef,
  Task
} from '@sciforge/collaboration-contracts'
import { structuredTaskResultSchema } from '@sciforge/collaboration-contracts'
import {
  execute,
  expectResource,
  loadTask as loadTaskFromCloud,
  operationKey,
  operationRequestId,
  requestId
} from './cloud.js'
import { assertAResourceRefId, assertCloudSafeText } from './cloud-safety.js'
import { assertExecutionFence } from './execution-fence.js'
import { FileWorkerJournal, type WorkerJournalEntry } from './journal.js'
import { WorkerLocks } from './locks.js'
import { DurableAOutbox } from './outbox.js'
import type {
  ACloudPort,
  AgentRuntimePort,
  CPrincipalPort,
  EContentSpacePort,
  MaterializedInput
} from './ports.js'

export class ManualRecoveryRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManualRecoveryRequiredError'
  }
}

export type WorkerRunnerOptions = Readonly<{
  journal: FileWorkerJournal
  cloud: ACloudPort
  principal: CPrincipalPort
  contentSpace: EContentSpacePort
  agentRuntime: AgentRuntimePort
  loadTask?: (taskId: string) => Promise<Task>
  locks?: WorkerLocks
  now?: () => Date
}>

export class WorkerRunner {
  private readonly loadTask: (taskId: string) => Promise<Task>
  private readonly locks: WorkerLocks
  private readonly now: () => Date
  private readonly outbox: DurableAOutbox

  constructor(private readonly options: WorkerRunnerOptions) {
    this.loadTask = options.loadTask ?? ((taskId) => loadTaskFromCloud(options.cloud, taskId))
    this.locks = options.locks ?? new WorkerLocks()
    this.now = options.now ?? (() => new Date())
    this.outbox = new DurableAOutbox(options.journal, options.cloud, this.loadTask)
  }

  async run(taskId: string, executionId: string): Promise<void> {
    await this.locks.run(taskId, executionId, () => this.runLocked(taskId, executionId))
  }

  async requestHuman(input: Readonly<{
    taskId: string
    executionId: string
    targetUserId: string
    prompt: string
    requiredAssurance: 'verified' | 'strong'
    expiresAt: string
  }>): Promise<HumanNeeded> {
    assertCloudSafeText(input.prompt)
    const principal = await this.options.principal.current()
    const cloudKey = operationKey(`a-human-needed:${JSON.stringify(input)}`)
    const response = await this.outbox.sendOnce(cloudKey, assigneeFence(principal.agentId), async () => {
      const task = await this.fencedTask(input.taskId, input.executionId, principal.agentId)
      return {
        protocolVersion: '1.0', requestId: operationRequestId(cloudKey), idempotencyKey: cloudKey,
        type: 'human.needed.create', projectId: task.projectId, sourceKind: 'worker',
        taskId: input.taskId, executionId: input.executionId, expectedTaskRevision: task.revision,
        targetUserId: input.targetUserId, requiredAssurance: input.requiredAssurance,
        prompt: input.prompt, expiresAt: input.expiresAt
      }
    })
    if (response.type !== 'rest.entity' || response.entity.type !== 'human_needed') {
      throw new Error('A returned an unexpected human.needed.create response.')
    }
    const task = await this.fencedTask(input.taskId, input.executionId, principal.agentId)
    const transitionKey = operationKey(`a-transition:${input.taskId}:${input.executionId}:needs_human`)
    await this.outbox.sendOnce(transitionKey, assigneeFence(principal.agentId), () => ({
      protocolVersion: '1.0', requestId: operationRequestId(transitionKey), idempotencyKey: transitionKey,
      type: 'task.transition', taskId: input.taskId, executionId: input.executionId,
      expectedRevision: task.revision, status: 'needs_human'
    }))
    return response.entity
  }

  private async runLocked(taskId: string, executionId: string): Promise<void> {
    const principal = await this.options.principal.current()
    let entry = await this.options.journal.get(taskId, executionId)
    if (entry?.phase === 'agent_started') {
      throw await this.manual(entry, 'Agent start was persisted but completion is unknown; automatic rerun is forbidden.')
    }
    if (entry?.phase === 'output_uploading') {
      throw await this.manual(entry, 'Output upload outcome is unknown; automatic re-upload is forbidden.')
    }
    if (entry?.phase === 'manual_recovery') {
      throw new ManualRecoveryRequiredError(entry.recoveryReason ?? 'Manual recovery is required.')
    }
    if (entry?.phase === 'succeeded') return
    if (entry?.phase === 'resource_registering') {
      if (!entry.pendingCloudKey) throw new Error('Resource registration has no durable A operation key.')
      const response = await this.outbox.replay(entry.pendingCloudKey, assigneeFence(principal.agentId))
      entry = {
        ...entry,
        phase: 'agent_completed',
        nextOutputIndex: (entry.nextOutputIndex ?? 0) + 1,
        resourceRefIds: [...(entry.resourceRefIds ?? []), expectResource(response).resourceRefId],
        updatedAt: this.timestamp()
      }
      await this.options.journal.save(entry)
    }
    if (entry?.phase === 'terminal_queued') {
      if (!entry.pendingCloudKey) throw new Error('Terminal transition has no durable A operation key.')
      await this.outbox.replay(entry.pendingCloudKey, assigneeFence(principal.agentId))
      await this.options.journal.save({
        ...entry, phase: 'succeeded', updatedAt: this.timestamp()
      })
      return
    }

    let task = await this.loadTask(taskId)
    assertExecutionFence(task, { taskId, executionId, agentId: principal.agentId })
    task = await this.ensureRunning(task, principal.agentId)

    let outputContainer: MaterializedInput | undefined
    if (!entry) {
      const inputs = []
      const resources = await Promise.all(task.resourceRefIds.map((resourceRefId) => this.loadResource(resourceRefId)))
      for (const resource of resources) {
        if (!resource.portableReference) continue
        const materialized = await this.options.contentSpace.materialize(resource.portableReference)
        if (resource.kind === 'content-space.container-reference') {
          outputContainer ??= materialized
        } else {
          inputs.push(await this.options.contentSpace.agentDownload(materialized, safeName(resource.name)))
        }
      }
      entry = {
        taskId, executionId, phase: 'inputs_ready', updatedAt: this.timestamp(), downloadedInputs: inputs
      }
      await this.options.journal.save(entry)
    }

    if (entry.phase === 'inputs_ready') {
      await this.reportProgress(task, principal.agentId, 10, 'Inputs ready; starting Agent runtime.')
      await this.options.journal.save({ ...entry, phase: 'agent_started', updatedAt: this.timestamp() })
      const result = await this.options.agentRuntime.run({
        task,
        inputs: entry.downloadedInputs ?? []
      })
      assertCloudSafeText(result.summary)
      if (result.logSummary) assertCloudSafeText(result.logSummary)
      for (const evidence of result.criterionEvidence) assertCloudSafeText(evidence.summary)
      entry = {
        ...entry,
        phase: 'agent_completed',
        updatedAt: this.timestamp(),
        agentResult: result,
        nextOutputIndex: 0,
        resourceRefIds: []
      }
      await this.options.journal.save(entry)
    }

    if (entry.phase === 'agent_completed') {
      if (!entry.agentResult) throw new Error('Completed Agent journal entry has no result.')
      const agentResult = entry.agentResult
      const nextOutputIndex = entry.nextOutputIndex ?? 0
      if (agentResult.outputs.length > nextOutputIndex && !outputContainer) {
        task = await this.loadTask(taskId)
        const resources = await Promise.all(task.resourceRefIds.map((id) => this.loadResource(id)))
        const container = resources.find((resource) => resource.kind === 'content-space.container-reference')
        if (!container?.portableReference) throw new Error('Task output requires an E Content Space container ResourceRef.')
        outputContainer = await this.options.contentSpace.materialize(container.portableReference)
      }
      const outputResourceIds = [...(entry.resourceRefIds ?? [])]
      for (let index = nextOutputIndex; index < agentResult.outputs.length; index += 1) {
        const output = agentResult.outputs[index]!
        const uploadKey = operationKey(`e-upload:${taskId}:${executionId}:${index}`)
        await this.options.journal.save({
          ...entry, phase: 'output_uploading', nextOutputIndex: index,
          resourceRefIds: outputResourceIds, updatedAt: this.timestamp()
        })
        const uploaded = await this.options.contentSpace.agentUploadNew({
          outputContainer: outputContainer!,
          name: safeName(output.name),
          workspaceRelativePath: output.workspaceRelativePath,
          idempotencyKey: uploadKey
        })
        task = await this.fencedTask(taskId, executionId, principal.agentId)
        const cloudKey = operationKey(`a-resource:${taskId}:${executionId}:${index}`)
        const command = {
          protocolVersion: '1.0' as const, requestId: operationRequestId(cloudKey),
          idempotencyKey: cloudKey,
          type: 'resource.create', projectId: task.projectId, taskId, executionId,
          expectedTaskRevision: task.revision,
          provider: uploaded.provider, externalId: uploaded.externalId, kind: uploaded.kind,
          name: uploaded.name, portableReference: uploaded.portableReference,
          ...(uploaded.version ? { version: uploaded.version } : {})
        } as const
        const registeringEntry = {
          ...entry, phase: 'resource_registering' as const, nextOutputIndex: index,
          resourceRefIds: outputResourceIds, pendingCloudKey: cloudKey, updatedAt: this.timestamp()
        }
        await this.options.journal.saveAndEnqueue(registeringEntry, {
          idempotencyKey: cloudKey, request: command
        })
        const response = await this.outbox.replay(cloudKey, assigneeFence(principal.agentId))
        outputResourceIds.push(expectResource(response).resourceRefId)
        entry = {
          ...entry, phase: 'agent_completed', nextOutputIndex: index + 1,
          resourceRefIds: outputResourceIds, updatedAt: this.timestamp()
        }
        await this.options.journal.save(entry)
      }
      entry = { ...entry, phase: 'outputs_uploaded', updatedAt: this.timestamp() }
      await this.options.journal.save(entry)
    }

    if (entry.phase === 'outputs_uploaded') {
      if (!entry.agentResult) throw new Error('Output journal entry has no Agent result.')
      task = await this.fencedTask(taskId, executionId, principal.agentId)
      const resourceRefIds = [...new Set([...task.resourceRefIds, ...(entry.resourceRefIds ?? [])])]
      resourceRefIds.forEach(assertAResourceRefId)
      const allowedRefs = new Set(resourceRefIds)
      const criterionEvidence = entry.agentResult.criterionEvidence.map((evidence) => {
        evidence.resourceRefIds.forEach((id) => {
          assertAResourceRefId(id)
          if (!allowedRefs.has(id)) throw new Error('Criterion evidence references an unavailable A ResourceRef.')
        })
        return evidence
      })
      const result = structuredTaskResultSchema.parse({
        summary: entry.agentResult.summary,
        criterionEvidence,
        resourceRefIds,
        ...(entry.agentResult.logSummary ? { logSummary: entry.agentResult.logSummary } : {})
      })
      const cloudKey = operationKey(`a-succeeded:${taskId}:${executionId}`)
      const command = {
        protocolVersion: '1.0' as const, requestId: operationRequestId(cloudKey),
        idempotencyKey: cloudKey,
        type: 'task.transition' as const, taskId, executionId,
        expectedRevision: task.revision, status: 'succeeded' as const, result
      }
      entry = {
        ...entry, phase: 'terminal_queued', pendingCloudKey: cloudKey, updatedAt: this.timestamp()
      }
      await this.options.journal.saveAndEnqueue(entry, { idempotencyKey: cloudKey, request: command })
      await this.outbox.replay(cloudKey, assigneeFence(principal.agentId))
      await this.options.journal.save({
        ...entry, phase: 'succeeded', updatedAt: this.timestamp()
      })
    }
  }

  private async loadResource(resourceRefId: string): Promise<ResourceRef> {
    const response = await execute(this.options.cloud, {
      protocolVersion: '1.0', requestId: requestId(), type: 'resource.get', resourceRefId
    })
    if (response.type !== 'rest.entity' || response.entity.type !== 'resource_ref') {
      throw new Error('A returned an unexpected resource.get response.')
    }
    return response.entity
  }

  private async fencedTask(taskId: string, executionId: string, agentId: string): Promise<Task> {
    const task = await this.loadTask(taskId)
    assertExecutionFence(task, { taskId, executionId, agentId })
    return task
  }

  private async ensureRunning(task: Task, agentId: string): Promise<Task> {
    let current = task
    if (current.status === 'offered') current = await this.transition(current, agentId, 'accepted')
    if (current.status === 'accepted' || current.status === 'needs_human') {
      current = await this.transition(current, agentId, 'running')
    }
    if (current.status !== 'running') throw new Error(`Worker cannot run Task in ${current.status} state.`)
    return current
  }

  private async transition(
    task: Task,
    agentId: string,
    status: 'accepted' | 'running'
  ): Promise<Task> {
    const cloudKey = operationKey(`a-transition:${task.taskId}:${task.executionId}:${status}`)
    await this.outbox.sendOnce(cloudKey, assigneeFence(agentId), async () => {
      const fenced = await this.fencedTask(task.taskId, task.executionId, agentId)
      return {
        protocolVersion: '1.0', requestId: operationRequestId(cloudKey), idempotencyKey: cloudKey,
        type: 'task.transition', taskId: task.taskId, executionId: task.executionId,
        expectedRevision: fenced.revision, status
      }
    })
    const refreshed = await this.loadTask(task.taskId)
    assertExecutionFence(refreshed, {
      taskId: task.taskId, executionId: task.executionId, agentId
    })
    return refreshed
  }

  private async reportProgress(task: Task, agentId: string, percent: number, summary: string): Promise<void> {
    const cloudKey = operationKey(`a-progress:${task.taskId}:${task.executionId}:${percent}`)
    await this.outbox.sendOnce(cloudKey, assigneeFence(agentId), async () => {
      const fenced = await this.fencedTask(task.taskId, task.executionId, agentId)
      return {
        protocolVersion: '1.0', requestId: operationRequestId(cloudKey), idempotencyKey: cloudKey,
        type: 'task.progress.report', taskId: task.taskId, executionId: task.executionId,
        expectedRevision: fenced.revision, percent, summary
      }
    })
  }

  private async manual(entry: WorkerJournalEntry, reason: string): Promise<ManualRecoveryRequiredError> {
    await this.options.journal.save({ ...entry, phase: 'manual_recovery', recoveryReason: reason, updatedAt: this.timestamp() })
    return new ManualRecoveryRequiredError(reason)
  }

  private timestamp(): string {
    return this.now().toISOString()
  }
}

function safeName(value: string): string {
  const name = value.replace(/[\\/]/gu, '_').trim()
  if (!name || name === '.' || name === '..') throw new Error('Unsafe Content Space entry name.')
  return name.slice(0, 128)
}

function assigneeFence(agentId: string) {
  return { enforceAssignee: true as const, agentId }
}
