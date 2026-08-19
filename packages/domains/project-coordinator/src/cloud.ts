import { createHash, randomBytes } from 'node:crypto'
import type {
  ProjectCapabilityDirectory,
  ProjectCoordinationView,
  ResourceRef,
  RestResponse,
  Task
} from '@sciforge/collaboration-contracts'
import type { ACloudPort, BCloudRequest } from './ports.js'

export function requestId(): `req_${string}` {
  return `req_${randomBytes(12).toString('hex')}`
}

export function operationKey(scope: string): string {
  return `idem_${createHash('sha256').update(scope).digest('hex')}`
}

export function operationRequestId(key: string): `req_${string}` {
  return `req_${createHash('sha256').update(`request:${key}`).digest('hex').slice(0, 32)}`
}

export async function execute(cloud: ACloudPort, request: BCloudRequest): Promise<RestResponse> {
  const response = await cloud.execute(request)
  if (response.type === 'rest.error') throw new Error(`${response.error.code}: ${response.error.message}`)
  return response
}

export async function loadTask(cloud: ACloudPort, taskId: string): Promise<Task> {
  const response = await execute(cloud, {
    protocolVersion: '1.0', requestId: requestId(), type: 'task.get', taskId
  })
  if (response.type !== 'rest.entity' || response.entity.type !== 'task') {
    throw new Error('A returned an unexpected task.get response.')
  }
  return response.entity
}

export function expectResource(response: RestResponse): ResourceRef {
  if (response.type !== 'rest.entity' || response.entity.type !== 'resource_ref') {
    throw new Error('A returned an unexpected resource.create response.')
  }
  return response.entity
}

export function expectCoordinationView(response: RestResponse): ProjectCoordinationView {
  if (response.type !== 'rest.entity' || response.entity.type !== 'project_coordination_view') {
    throw new Error('A returned an unexpected coordination view response.')
  }
  return response.entity
}

export function expectCapabilityDirectory(response: RestResponse): ProjectCapabilityDirectory {
  if (response.type !== 'rest.entity' || response.entity.type !== 'project_capability_directory') {
    throw new Error('A returned an unexpected capability directory response.')
  }
  return response.entity
}
