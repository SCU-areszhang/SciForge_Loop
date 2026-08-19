import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { RestResponse } from '@sciforge/collaboration-contracts'
import type { BCloudRequest } from './ports.js'
import { DurableAOutbox } from './outbox.js'
import { FileWorkerJournal } from './journal.js'
import { taskFixture } from './test-fixtures.js'
import { ExecutionFenceError } from './execution-fence.js'

test('A timeout leaves one exact request for replay', async () => {
  const store = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-outbox-')), 'state.json'))
  const sent: unknown[] = []
  let fail = true
  const cloud = {
    execute: async (request: BCloudRequest): Promise<RestResponse> => {
      sent.push(structuredClone(request))
      if (fail) throw new Error('timeout')
      return { protocolVersion: '1.0', type: 'rest.receipt', requestId: request.requestId, receipt: {
        schemaVersion: 1, type: 'operation.receipt', receiptId: 'rcp_123456789012',
        actor: { actorType: 'agent', userId: 'usr_123456789012', agentId: 'agt_123456789012', assurance: 'strong' },
        idempotencyKey: 'idempotencyKey' in request ? request.idempotencyKey : 'idem_read_not_used',
        requestHash: 'a'.repeat(64), status: 'succeeded', resultHash: 'b'.repeat(64),
        createdAt: '2026-08-19T00:00:00.000Z'
      } }
    }
  }
  const outbox = new DurableAOutbox(store, cloud, async () => taskFixture())
  const request = {
    protocolVersion: '1.0', requestId: 'req_123456789012', idempotencyKey: 'idem-progress-1',
    type: 'task.progress.report', taskId: 'tsk_123456789012', executionId: 'exe_123456789012',
    expectedRevision: 3, percent: 50, summary: 'Halfway'
  } as const
  await store.enqueue({ idempotencyKey: request.idempotencyKey, request })
  await assert.rejects(outbox.flushNext({ enforceAssignee: true, agentId: 'agt_123456789012' }), /timeout/u)
  fail = false
  await outbox.flushNext({ enforceAssignee: true, agentId: 'agt_123456789012' })
  assert.deepEqual(sent, [request, request])
})

test('pending progress and ResourceRef writes stop after the execution becomes terminal', async () => {
  const store = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-outbox-')), 'state.json'))
  const requests = [{
    protocolVersion: '1.0', requestId: 'req_progress_terminal_0001', idempotencyKey: 'idem-progress-terminal',
    type: 'task.progress.report', taskId: 'tsk_123456789012', executionId: 'exe_123456789012',
    expectedRevision: 3, percent: 50, summary: 'Halfway'
  }, {
    protocolVersion: '1.0', requestId: 'req_resource_terminal_0001', idempotencyKey: 'idem-resource-terminal',
    type: 'resource.create', projectId: 'prj_123456789012', taskId: 'tsk_123456789012',
    executionId: 'exe_123456789012', expectedTaskRevision: 3, provider: 'opencontent',
    externalId: 'external', kind: 'content-space.file-reference', name: 'result.csv',
    portableReference: {
      contractVersion: 1, kind: 'content-space.file-reference',
      authority: { resolverId: 'content-space.provider-instance-authority', authorityRef: 'mock' },
      identity: { id: 'result' }
    }
  }] as const
  const outbox = new DurableAOutbox(store, {
    execute: async () => { throw new Error('must not write') }
  }, async () => taskFixture({ status: 'succeeded', completedAt: '2026-08-19T00:01:00.000Z' }))
  for (const request of requests) {
    await store.enqueue({ idempotencyKey: request.idempotencyKey, request })
    await assert.rejects(
      outbox.replay(request.idempotencyKey, { enforceAssignee: true, agentId: 'agt_123456789012' }),
      ExecutionFenceError
    )
  }
})

test('an accepted terminal write may replay only its exact durable payload', async () => {
  const store = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-outbox-')), 'state.json'))
  const request = {
    protocolVersion: '1.0', requestId: 'req_terminal_replay_0001', idempotencyKey: 'idem-terminal-replay',
    type: 'task.transition', taskId: 'tsk_123456789012', executionId: 'exe_123456789012',
    expectedRevision: 3, status: 'succeeded', result: {
      summary: 'Done', criterionEvidence: [], resourceRefIds: [], logSummary: 'No warnings.'
    }
  } as const
  const sent: BCloudRequest[] = []
  const outbox = new DurableAOutbox(store, {
    execute: async (command) => {
      sent.push(command)
      return { protocolVersion: '1.0', type: 'rest.receipt', requestId: command.requestId, receipt: {
        schemaVersion: 1, type: 'operation.receipt', receiptId: 'rcp_123456789012',
        actor: { actorType: 'agent', userId: 'usr_123456789012', agentId: 'agt_123456789012', assurance: 'strong' },
        idempotencyKey: request.idempotencyKey, requestHash: 'a'.repeat(64), status: 'succeeded',
        resultHash: 'b'.repeat(64), createdAt: '2026-08-19T00:00:00.000Z'
      } }
    }
  }, async () => taskFixture({ status: 'succeeded', completedAt: '2026-08-19T00:01:00.000Z' }))
  await store.enqueue({ idempotencyKey: request.idempotencyKey, request })
  await outbox.replay(request.idempotencyKey, { enforceAssignee: true, agentId: 'agt_123456789012' })
  assert.deepEqual(sent, [request])
})
