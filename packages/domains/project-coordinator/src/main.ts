import { join } from 'node:path'
import {
  defineDomainMainInternalServiceDescriptor,
  type DomainMainHost
} from '@sciforge/domain-sdk/host'
import type { TrustedDomainProcessEntryInput } from '@sciforge/domain-sdk/main'
import { Coordinator } from './coordinator.js'
import {
  PROJECT_COORDINATOR_SERVICE_CONTRACT,
  PROJECT_COORDINATOR_SERVICE_CONTRIBUTION,
  domainPackageDefinition
} from './definition.js'
import { FileWorkerJournal } from './journal.js'
import { WorkerRunner, type WorkerRunnerOptions } from './worker-runner.js'

export { Coordinator } from './coordinator.js'
export { FileWorkerJournal } from './journal.js'
export { MockContentSpacePort } from './mock-content-space.js'
export { WorkerRunner } from './worker-runner.js'

/**
 * Composition root used by Desktop once A, C, E, and AgentRuntime ports are available.
 * It deliberately contains no UI and no credential or transport implementation.
 */
export const PROJECT_COORDINATOR_SERVICE_ID = 'collaboration.bc' as const
export const PROJECT_COORDINATOR_SERVICE_VERSION = '1.0.0' as const

export type BCService = Readonly<{
  create(workerOptions: Omit<WorkerRunnerOptions, 'journal'>): ReturnType<typeof createBCServices>
}>

export function createBCServices(workerOptions: WorkerRunnerOptions) {
  return Object.freeze({
    coordinator: new Coordinator(workerOptions.cloud, workerOptions.principal, workerOptions.journal),
    workerRunner: new WorkerRunner(workerOptions)
  })
}

export function createDomainMainEntry(
  host: DomainMainHost
): TrustedDomainProcessEntryInput<ReturnType<typeof defineDomainMainInternalServiceDescriptor>> {
  if (!host.internalServices) throw new Error('B requires Host internal-service mediation.')
  let journal: FileWorkerJournal | undefined
  const service: BCService = Object.freeze({
    create: (options) => {
      journal ??= new FileWorkerJournal(join(
        host.getUserDataDir(),
        'project-coordinator',
        'worker-state.json'
      ))
      return createBCServices({ ...options, journal })
    }
  })
  host.internalServices.register({
    serviceId: PROJECT_COORDINATOR_SERVICE_ID,
    contractVersion: PROJECT_COORDINATOR_SERVICE_VERSION,
    allowedConsumerModuleIds: ['sciforge.collaboration-integration'],
    service
  })
  const descriptor = defineDomainMainInternalServiceDescriptor({
    location: 'main.internal-service-descriptor',
    serviceId: PROJECT_COORDINATOR_SERVICE_ID,
    contractVersion: PROJECT_COORDINATOR_SERVICE_VERSION,
    allowedConsumerModuleIds: ['sciforge.collaboration-integration']
  })
  return {
    definition: domainPackageDefinition,
    contributions: [{
      ...PROJECT_COORDINATOR_SERVICE_CONTRIBUTION,
      contract: PROJECT_COORDINATOR_SERVICE_CONTRACT,
      value: descriptor
    }]
  }
}
