import type {
  PortableResourceReferenceCarrier,
  RestRequest,
  RestResponse,
  StructuredTaskResult,
  Task
} from '@sciforge/collaboration-contracts'

export type CloudRequestType =
  | 'project.coordination_view.get'
  | 'project.capability_directory.get'
  | 'task.create'
  | 'task.get'
  | 'task.retry'
  | 'task.transition'
  | 'task.progress.report'
  | 'resource.create'
  | 'resource.get'
  | 'human.needed.create'

type BTaskTransitionRequest = Omit<
  Extract<RestRequest, { type: 'task.transition' }>,
  'resultSummary'
> & Readonly<{ resultSummary?: never }>

export type BCloudRequest =
  | Exclude<Extract<RestRequest, { type: CloudRequestType }>, { type: 'task.transition' }>
  | BTaskTransitionRequest

export interface ACloudPort {
  execute(request: BCloudRequest): Promise<RestResponse>
}

export type Principal = Readonly<{
  userId: string
  agentId: string
}>

export interface CPrincipalPort {
  current(): Promise<Principal>
}

export type MaterializedInput = Readonly<{
  resourceHandle: string
  resourceKind: string
}>

export type DownloadedInput = Readonly<{
  workspaceRelativePath: string
}>

export type UploadedOutput = Readonly<{
  provider: string
  externalId: string
  kind: PortableResourceReferenceCarrier['kind']
  name: string
  portableReference: PortableResourceReferenceCarrier
  version?: string
}>

export interface EContentSpacePort {
  materialize(reference: PortableResourceReferenceCarrier): Promise<MaterializedInput>
  agentDownload(input: MaterializedInput, destinationName: string): Promise<DownloadedInput>
  agentUploadNew(input: Readonly<{
    outputContainer: MaterializedInput
    name: string
    workspaceRelativePath: string
    idempotencyKey: string
  }>): Promise<UploadedOutput>
}

export type AgentOutput = Readonly<{
  name: string
  workspaceRelativePath: string
}>

export type AgentRunResult = Readonly<{
  summary: string
  criterionEvidence: StructuredTaskResult['criterionEvidence']
  outputs: readonly AgentOutput[]
  logSummary?: string
}>

export interface AgentRuntimePort {
  run(input: Readonly<{
    task: Task
    inputs: readonly DownloadedInput[]
  }>): Promise<AgentRunResult>
}
