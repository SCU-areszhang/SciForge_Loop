import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { ResourceRef, RestResponse } from '@sciforge/collaboration-contracts'
import { FileWorkerJournal } from './journal.js'
import { WorkerRunner, ManualRecoveryRequiredError } from './worker-runner.js'
import { taskFixture } from './test-fixtures.js'
import type { BCloudRequest } from './ports.js'

function dependencies(journal: FileWorkerJournal) {
  let agentRuns = 0
  let uploads = 0
  const task = taskFixture()
  return {
    counts: () => ({ agentRuns, uploads }),
    options: {
      journal,
      cloud: { execute: async () => { throw new Error('not expected') } },
      principal: { current: async () => ({ userId: task.assigneeUserId, agentId: task.assigneeAgentId }) },
      contentSpace: {
        materialize: async () => ({ resourceHandle: 'local-handle', resourceKind: 'content-space.file' }),
        agentDownload: async () => ({ workspaceRelativePath: 'input/file.txt' }),
        agentUploadNew: async () => {
          uploads += 1
          throw new Error('upload timeout')
        }
      },
      agentRuntime: {
        run: async () => {
          agentRuns += 1
          return { summary: 'done', criterionEvidence: [], outputs: [], logSummary: 'ok' }
        }
      },
      loadTask: async () => task
    }
  }
}

test('recovery never reruns an Agent whose start was journaled', async () => {
  const journal = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-runner-')), 'state.json'))
  const fixture = dependencies(journal)
  await journal.save({ taskId: 'tsk_123456789012', executionId: 'exe_123456789012', phase: 'agent_started', updatedAt: 'now' })
  const runner = new WorkerRunner(fixture.options)
  await assert.rejects(runner.run('tsk_123456789012', 'exe_123456789012'), ManualRecoveryRequiredError)
  assert.deepEqual(fixture.counts(), { agentRuns: 0, uploads: 0 })
})

test('recovery never retries an upload whose outcome is unknown', async () => {
  const journal = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-runner-')), 'state.json'))
  const fixture = dependencies(journal)
  await journal.save({
    taskId: 'tsk_123456789012', executionId: 'exe_123456789012', phase: 'output_uploading',
    updatedAt: 'now', agentResult: { summary: 'done', criterionEvidence: [], outputs: [{ name: 'x', workspaceRelativePath: 'x' }] },
    nextOutputIndex: 0, resourceRefIds: []
  })
  const runner = new WorkerRunner(fixture.options)
  await assert.rejects(runner.run('tsk_123456789012', 'exe_123456789012'), ManualRecoveryRequiredError)
  assert.deepEqual(fixture.counts(), { agentRuns: 0, uploads: 0 })
})

test('Worker uses E transfer, creates A ResourceRef, and submits only StructuredTaskResult', async () => {
  const journal = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-runner-')), 'state.json'))
  const inputId = 'rrf_Input00000001'
  const containerId = 'rrf_Container0001'
  const outputId = 'rrf_Output0000001'
  const task = taskFixture({ resourceRefIds: [inputId, containerId] })
  const calls: BCloudRequest[] = []
  const effects: string[] = []
  const cloud = {
    execute: async (request: BCloudRequest): Promise<RestResponse> => {
      calls.push(structuredClone(request))
      if (request.type === 'resource.get') {
        return entityResponse(request.requestId, resourceFixture(
          request.resourceRefId,
          request.resourceRefId === containerId
            ? 'content-space.container-reference'
            : 'content-space.file-reference'
        ))
      }
      if (request.type === 'resource.create') {
        return entityResponse(request.requestId, resourceFixture(outputId, 'content-space.file-reference'))
      }
      return receiptResponse(request)
    }
  }
  const runner = new WorkerRunner({
    journal,
    cloud,
    principal: { current: async () => ({ userId: task.assigneeUserId, agentId: task.assigneeAgentId }) },
    contentSpace: {
      materialize: async (reference) => {
        effects.push(`materialize:${reference.kind}`)
        return { resourceHandle: `local:${reference.kind}`, resourceKind: reference.kind }
      },
      agentDownload: async () => {
        effects.push('agent-download')
        return { workspaceRelativePath: 'inputs/data.csv' }
      },
      agentUploadNew: async () => {
        effects.push('agent-upload-new')
        return {
          provider: 'opencontent', externalId: 'external-output',
          kind: 'content-space.file-reference', name: 'result.csv',
          portableReference: portable('content-space.file-reference')
        }
      }
    },
    agentRuntime: {
      run: async ({ inputs }) => {
        effects.push(`agent-runtime:${inputs[0]?.workspaceRelativePath}`)
        return {
          summary: 'Analysis completed.',
          criterionEvidence: [{
            criterionId: task.completionCriteria[0]!.criterionId,
            summary: 'Output was produced.',
            resourceRefIds: [outputId]
          }],
          outputs: [{ name: 'result.csv', workspaceRelativePath: 'outputs/result.csv' }],
          logSummary: 'Completed without warnings.'
        }
      }
    },
    loadTask: async () => task
  })

  await runner.run(task.taskId, task.executionId)

  assert.equal(effects.filter((item) => item === 'agent-download').length, 1)
  assert.equal(effects.filter((item) => item === 'agent-upload-new').length, 1)
  assert.equal(effects.filter((item) => item.startsWith('agent-runtime:')).length, 1)
  assert.equal(calls.some((request) => (request as { type: string }).type === 'project_record.submit'), false)
  const terminal = calls.find((request) => request.type === 'task.transition')
  assert.equal(terminal?.type, 'task.transition')
  if (terminal?.type !== 'task.transition') throw new Error('Missing terminal transition.')
  assert.equal('resultSummary' in terminal, false)
  assert.deepEqual(Object.keys(terminal.result ?? {}).sort(), [
    'criterionEvidence', 'logSummary', 'resourceRefIds', 'summary'
  ])
  assert.equal((await journal.get(task.taskId, task.executionId))?.phase, 'succeeded')
})

test('recovery after E upload replays only the exact pending A ResourceRef write', async () => {
  const journal = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-runner-')), 'state.json'))
  const task = taskFixture()
  const cloudKey = 'idem_resource_recovery_123456789012'
  const request = {
    protocolVersion: '1.0', requestId: 'req_resource_recovery_123456789012', idempotencyKey: cloudKey,
    type: 'resource.create', projectId: task.projectId, taskId: task.taskId,
    executionId: task.executionId, expectedTaskRevision: task.revision,
    provider: 'opencontent', externalId: 'uploaded-once', kind: 'content-space.file-reference',
    name: 'result.csv', portableReference: portable('content-space.file-reference')
  } as const
  await journal.saveAndEnqueue({
    taskId: task.taskId, executionId: task.executionId, phase: 'resource_registering',
    updatedAt: '2026-08-19T00:00:00.000Z', pendingCloudKey: cloudKey,
    nextOutputIndex: 0, resourceRefIds: [],
    agentResult: {
      summary: 'Recovered result.', criterionEvidence: [],
      outputs: [{ name: 'result.csv', workspaceRelativePath: 'outputs/result.csv' }]
    }
  }, { idempotencyKey: cloudKey, request })
  let agentRuns = 0
  let uploads = 0
  const calls: BCloudRequest[] = []
  const runner = new WorkerRunner({
    journal,
    cloud: {
      execute: async (command) => {
        calls.push(structuredClone(command))
        if (command.type === 'resource.create') {
          return entityResponse(command.requestId, resourceFixture('rrf_Recovered001', 'content-space.file-reference'))
        }
        return receiptResponse(command)
      }
    },
    principal: { current: async () => ({ userId: task.assigneeUserId, agentId: task.assigneeAgentId }) },
    contentSpace: {
      materialize: async () => { throw new Error('must not materialize') },
      agentDownload: async () => { throw new Error('must not download') },
      agentUploadNew: async () => { uploads += 1; throw new Error('must not upload') }
    },
    agentRuntime: { run: async () => { agentRuns += 1; throw new Error('must not run') } },
    loadTask: async () => task
  })

  await runner.run(task.taskId, task.executionId)

  assert.equal(agentRuns, 0)
  assert.equal(uploads, 0)
  assert.deepEqual(calls.find((command) => command.type === 'resource.create'), request)
  assert.equal((await journal.get(task.taskId, task.executionId))?.phase, 'succeeded')
})

function portable(kind: 'content-space.file-reference' | 'content-space.container-reference') {
  return {
    contractVersion: 1 as const,
    kind,
    authority: { resolverId: 'content-space.provider-instance-authority', authorityRef: 'mock' },
    identity: { id: kind }
  } as never
}

function resourceFixture(
  resourceRefId: string,
  kind: 'content-space.file-reference' | 'content-space.container-reference'
): ResourceRef {
  return {
    schemaVersion: 1, type: 'resource_ref', resourceRefId,
    projectId: 'prj_123456789012', taskId: 'tsk_123456789012', executionId: 'exe_123456789012',
    taskRevision: 3, createdByUserId: 'usr_123456789012', createdByAgentId: 'agt_123456789012',
    provider: 'opencontent', externalId: `external-${resourceRefId}`, kind,
    name: kind.includes('container') ? 'outputs' : 'data.csv', openUrl: null,
    portableReference: portable(kind), version: null, status: 'available', statusReasonCode: null,
    unavailableAt: null, revokedAt: null, invalidatedAt: null,
    revision: 1, createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z'
  }
}

function entityResponse(requestId: string, entity: ResourceRef): RestResponse {
  return { protocolVersion: '1.0', type: 'rest.entity', requestId, entity }
}

function receiptResponse(request: BCloudRequest): RestResponse {
  if (!('idempotencyKey' in request)) throw new Error('Expected write command.')
  return {
    protocolVersion: '1.0', type: 'rest.receipt', requestId: request.requestId,
    receipt: {
      schemaVersion: 1, type: 'operation.receipt', receiptId: 'rcp_123456789012',
      actor: { actorType: 'agent', userId: 'usr_123456789012', agentId: 'agt_123456789012', assurance: 'strong' },
      idempotencyKey: request.idempotencyKey, requestHash: 'a'.repeat(64),
      status: 'succeeded', resultHash: 'b'.repeat(64), createdAt: '2026-08-19T00:00:00.000Z'
    }
  }
}
