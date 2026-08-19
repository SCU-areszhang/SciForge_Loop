import type { RestResponse, Task } from '@sciforge/collaboration-contracts'
import {
  assertExecutionFence,
  assertTaskExecution
} from './execution-fence.js'
import { FileWorkerJournal } from './journal.js'
import type { ACloudPort, BCloudRequest } from './ports.js'

export class DurableAOutbox {
  constructor(
    private readonly store: FileWorkerJournal,
    private readonly cloud: ACloudPort,
    private readonly loadTask: (taskId: string) => Promise<Task>
  ) {}

  async send(request: BCloudRequest, context: OutboxFenceContext): Promise<RestResponse> {
    if (!('idempotencyKey' in request)) {
      throw new Error('Durable A outbox accepts write commands only.')
    }
    await this.store.enqueue({ idempotencyKey: request.idempotencyKey, request })
    return this.replay(request.idempotencyKey, context)
  }

  async sendOnce(
    idempotencyKey: string,
    context: OutboxFenceContext,
    createRequest: () => Promise<BCloudRequest> | BCloudRequest
  ): Promise<RestResponse> {
    const existing = await this.store.outboxEntry(idempotencyKey)
    if (existing) return this.replay(idempotencyKey, context)
    return this.send(await createRequest(), context)
  }

  async flushNext(context: OutboxFenceContext): Promise<RestResponse | undefined> {
    const entry = await this.store.nextPending()
    if (!entry) return undefined
    return this.deliver(entry.idempotencyKey, context)
  }

  async replay(idempotencyKey: string, context: OutboxFenceContext): Promise<RestResponse> {
    return this.deliver(idempotencyKey, context)
  }

  private async deliver(
    idempotencyKey: string,
    context: OutboxFenceContext
  ): Promise<RestResponse> {
    const entry = await this.store.outboxEntry(idempotencyKey)
    if (!entry) throw new Error('Outbox entry was not found.')
    const request = entry.request as BCloudRequest
    if (
      'taskId' in request && typeof request.taskId === 'string' &&
      'executionId' in request && typeof request.executionId === 'string'
    ) {
      const task = await this.loadTask(request.taskId)
      if (context.enforceAssignee) {
        const fence = {
          taskId: request.taskId, executionId: request.executionId, agentId: context.agentId
        }
        if (isAcceptedTerminalReplay(request, task)) {
          assertTaskExecution(task, fence)
          if (task.assigneeAgentId !== context.agentId) {
            throw new Error('Task is no longer assigned to this Agent.')
          }
        } else {
          assertExecutionFence(task, fence)
        }
      } else {
        assertTaskExecution(task, { taskId: request.taskId, executionId: request.executionId })
      }
    }
    const response = await this.cloud.execute(request)
    if (response.type === 'rest.error') throw new Error(`${response.error.code}: ${response.error.message}`)
    await this.store.markDelivered(entry.idempotencyKey)
    return response
  }
}

function isAcceptedTerminalReplay(request: BCloudRequest, task: Task): boolean {
  return request.type === 'task.transition' &&
    ['succeeded', 'failed', 'cancelled', 'rejected'].includes(request.status) &&
    request.status === task.status
}

export type OutboxFenceContext =
  | Readonly<{ enforceAssignee: true; agentId: string }>
  | Readonly<{ enforceAssignee?: false }>
