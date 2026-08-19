import type { Task } from '@sciforge/collaboration-contracts'

export class ExecutionFenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExecutionFenceError'
  }
}

export type ExecutionFence = Readonly<{
  taskId: string
  executionId: string
  agentId: string
}>

export function assertTaskExecution(
  task: Task,
  fence: Readonly<{ taskId: string; executionId: string }>
): void {
  if (task.taskId !== fence.taskId || task.executionId !== fence.executionId) {
    throw new ExecutionFenceError('Task execution fence is stale.')
  }
}

export function assertExecutionIdentity(task: Task, fence: ExecutionFence): void {
  assertTaskExecution(task, fence)
  if (task.assigneeAgentId !== fence.agentId) {
    throw new ExecutionFenceError('Task is no longer assigned to this Agent.')
  }
}

export function assertExecutionFence(task: Task, fence: ExecutionFence): void {
  assertExecutionIdentity(task, fence)
  if (['rejected', 'succeeded', 'failed', 'cancelled'].includes(task.status)) {
    throw new ExecutionFenceError('Task is already terminal.')
  }
}
