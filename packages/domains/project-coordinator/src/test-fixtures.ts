import type { Task } from '@sciforge/collaboration-contracts'

export function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    schemaVersion: 1,
    type: 'task',
    taskId: 'tsk_123456789012',
    projectId: 'prj_123456789012',
    executionId: 'exe_123456789012',
    createdByCoordinatorAgentId: 'agt_123456789012',
    assigneeAgentId: 'agt_123456789012',
    assigneeUserId: 'usr_123456789012',
    title: 'Run analysis',
    objective: 'Produce a validated output.',
    completionCriteria: [{ criterionId: 'cri_123456789012', text: 'Output exists.' }],
    dependencyTaskIds: [],
    requiredCapabilities: {
      capabilityIds: [],
      vpnAccessIds: [],
      slurmClusterIds: [],
      requiredResourceRefIds: []
    },
    resourceRefIds: [],
    authorizationRequirements: [],
    status: 'running',
    attempt: 1,
    maxRetries: 1,
    revision: 3,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    ...overrides
  }
}
