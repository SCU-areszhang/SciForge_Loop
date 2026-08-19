import assert from 'node:assert/strict'
import test from 'node:test'
import { ExecutionFenceError, assertExecutionFence } from './execution-fence.js'
import { taskFixture } from './test-fixtures.js'

test('execution fence rejects a stale execution before a write', () => {
  assert.throws(
    () => assertExecutionFence(taskFixture({ executionId: 'exe_newer123456' }), {
      taskId: 'tsk_123456789012', executionId: 'exe_123456789012', agentId: 'agt_123456789012'
    }),
    ExecutionFenceError
  )
})

test('execution fence rejects terminal and reassigned tasks', () => {
  assert.throws(() => assertExecutionFence(taskFixture({ assigneeAgentId: 'agt_other123456' }), {
    taskId: 'tsk_123456789012', executionId: 'exe_123456789012', agentId: 'agt_123456789012'
  }), ExecutionFenceError)
  assert.throws(() => assertExecutionFence(taskFixture({
    status: 'cancelled', completedAt: '2026-08-19T00:01:00.000Z'
  }), {
    taskId: 'tsk_123456789012', executionId: 'exe_123456789012', agentId: 'agt_123456789012'
  }), ExecutionFenceError)
})
