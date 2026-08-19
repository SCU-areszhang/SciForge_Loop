import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type {
  ProjectCapabilityDirectory,
  ProjectCoordinationView,
  RestResponse
} from '@sciforge/collaboration-contracts'
import { Coordinator, ProposalDigestUnavailableError } from './coordinator.js'
import { FileWorkerJournal } from './journal.js'
import type { BCloudRequest } from './ports.js'
import { taskFixture } from './test-fixtures.js'

test('Coordinator reads A views and creates confirmed Tasks through durable outbox', async () => {
  const calls: BCloudRequest[] = []
  const task = taskFixture({ status: 'offered', revision: 1 })
  const view = {
    type: 'project_coordination_view', projectId: task.projectId, projectRevision: 4,
    project: { projectId: task.projectId, coordinatorAgentId: task.createdByCoordinatorAgentId },
    members: [], tasks: [], records: [], humanRequests: [], humanAnswers: []
  } as unknown as ProjectCoordinationView
  const capabilities = {
    type: 'project_capability_directory', projectId: task.projectId, projectRevision: 4,
    agents: [{ agentId: task.assigneeAgentId, status: 'online', capabilities: ['analysis.run'] }]
  } as unknown as ProjectCapabilityDirectory
  const cloud = {
    execute: async (request: BCloudRequest): Promise<RestResponse> => {
      calls.push(structuredClone(request))
      if (request.type === 'project.coordination_view.get') return entity(request.requestId, view)
      if (request.type === 'project.capability_directory.get') return entity(request.requestId, capabilities)
      if (request.type === 'task.create') return entity(request.requestId, task)
      throw new Error(`Unexpected ${request.type}`)
    }
  }
  const journal = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-coordinator-')), 'state.json'))
  const coordinator = new Coordinator(cloud, {
    current: async () => ({ userId: task.assigneeUserId, agentId: task.createdByCoordinatorAgentId })
  }, journal)

  await coordinator.createTasks(task.projectId, [{
    title: task.title,
    objective: task.objective,
    completionCriteria: task.completionCriteria,
    dependencyTaskIds: [],
    requiredCapabilities: {
      capabilityIds: ['analysis.run'], vpnAccessIds: [], slurmClusterIds: [], requiredResourceRefIds: []
    },
    resourceRefIds: [],
    assigneeAgentId: task.assigneeAgentId,
    confirmationId: 'cnf_Confirm000001'
  }])

  assert.deepEqual(calls.slice(0, 2).map((request) => request.type).sort(), [
    'project.capability_directory.get', 'project.coordination_view.get'
  ])
  const create = calls.find((request) => request.type === 'task.create')
  assert.equal(create?.type, 'task.create')
  if (create?.type !== 'task.create') throw new Error('Missing task.create.')
  assert.equal(create.confirmationId, 'cnf_Confirm000001')
  assert.equal(create.expectedRevision, 4)
  assert.equal(await journal.pendingCount(), 0)
})

test('Coordinator exposes one explicit blocker instead of copying A stableDigest', async () => {
  const journal = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-coordinator-')), 'state.json'))
  const coordinator = new Coordinator({ execute: async () => { throw new Error('unused') } }, {
    current: async () => ({ userId: 'usr_123456789012', agentId: 'agt_123456789012' })
  }, journal)
  assert.throws(() => coordinator.requestTaskProposalConfirmation(), ProposalDigestUnavailableError)
})

test('Coordinator rejects credential or local-path leakage before task.create', async () => {
  let cloudCalls = 0
  const journal = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-coordinator-')), 'state.json'))
  const coordinator = new Coordinator({ execute: async () => {
    cloudCalls += 1
    throw new Error('must not reach A')
  } }, {
    current: async () => ({ userId: 'usr_123456789012', agentId: 'agt_123456789012' })
  }, journal)
  await assert.rejects(coordinator.createTasks('prj_123456789012', [{
    title: 'Read /Users/example/private.csv', objective: 'Analyze data',
    completionCriteria: [{ criterionId: 'cri_123456789012', text: 'Produce result' }],
    dependencyTaskIds: [], requiredCapabilities: {
      capabilityIds: [], vpnAccessIds: [], slurmClusterIds: [], requiredResourceRefIds: []
    }, resourceRefIds: [], assigneeAgentId: 'agt_123456789012', confirmationId: 'cnf_123456789012'
  }]), /Cloud text contains/u)
  assert.equal(cloudCalls, 0)
})

function entity(requestId: string, value: unknown): RestResponse {
  return { protocolVersion: '1.0', type: 'rest.entity', requestId, entity: value } as RestResponse
}
