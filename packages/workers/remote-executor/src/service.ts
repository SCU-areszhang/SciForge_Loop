import { createHash } from 'node:crypto'

import {
  REMOTE_EXECUTOR_MCP_SERVER_VERSION,
  REMOTE_WORKER_CAPABILITIES,
  REMOTE_WORKER_ENTRYPOINT,
  REMOTE_WORKER_PROTOCOL,
  RemoteExecutorWorkerError,
  remoteCancelJobInputSchema,
  remoteDeployWorkerInputSchema,
  remoteJobStatusInputSchema,
  remoteListTargetsInputSchema,
  remotePollInputSchema,
  remoteProbeTargetInputSchema,
  remoteReadOutputInputSchema,
  remoteRunInputSchema,
  remoteStopInputSchema,
  remoteSubmitJobInputSchema,
  remoteTargetInputSchema,
  remoteTargetSchema,
  remoteWriteInputSchema,
  type RemoteCancelJobInput,
  type RemoteDeployWorkerInput,
  type RemoteJobStatusInput,
  type RemoteJobSummary,
  type RemoteListTargetsInput,
  type RemoteOutputStream,
  type RemotePollInput,
  type RemoteProbeTargetInput,
  type RemoteReadOutputInput,
  type RemoteRunInput,
  type RemoteRunStatus,
  type RemoteRunSummary,
  type RemoteScheduler,
  type RemoteStopInput,
  type RemoteSubmitJobInput,
  type RemoteTarget,
  type RemoteTargetInput,
  type RemoteWriteInput,
  type RemoteWorkerManifest,
  type SlurmNormalizedState,
  type SlurmStatusNormalized
} from './contract.js'

type MaybePromise<T> = T | Promise<T>

export type RemoteTargetProvider = () => MaybePromise<RemoteTargetInput[]>

export type RemoteExecutorServiceOptions = {
  targets?: RemoteTargetInput[]
  targetProvider?: RemoteTargetProvider
  env?: NodeJS.ProcessEnv
  now?: () => Date
  workerManifest?: RemoteWorkerManifest
}

export function remoteExecutorConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RemoteExecutorServiceOptions {
  return {
    env,
    targets: targetsFromEnv(env)
  }
}

export type RemoteListTargetsResult = {
  ok: true
  targets: RemoteTarget[]
  count: number
}

export type RemoteProbeTargetResult = {
  ok: true
  target: RemoteTarget
  available: boolean
  mode: 'mock'
  message: string
}

export type RemoteDeployWorkerResult = {
  ok: true
  targetId: string
  deployed: boolean
  dryRun: boolean
  remotePath: string
  manifest: RemoteWorkerManifest
}

export type RemoteRunResult = {
  ok: true
  run: RemoteRunSummary
  output: RemoteOutputChunk
}

export type RemotePollResult = RemoteRunResult

export type RemoteWriteResult = {
  ok: true
  runId: string
  acceptedBytes: number
  eof: boolean
}

export type RemoteStopResult = {
  ok: true
  run: RemoteRunSummary
  stopped: boolean
}

export type RemoteSubmitJobResult = {
  ok: true
  dryRun: boolean
  job: RemoteJobSummary
  scriptBytes: number
}

export type RemoteJobStatusResult = {
  ok: true
  job: RemoteJobSummary
}

export type RemoteCancelJobResult = {
  ok: true
  job: RemoteJobSummary
  cancelled: boolean
}

export type RemoteReadOutputResult = {
  ok: true
  stream: RemoteOutputStream
  output: RemoteOutputChunk
}

export type RemoteOutputChunk = {
  text: string
  offset: number
  bytesRead: number
  truncated: boolean
  nextOffset?: number
}

export type WorkerManifestFileInput = {
  path: string
  content: string | Uint8Array
  mode?: string
}

type RemoteRunRecord = {
  summary: RemoteRunSummary
  stdout: string
  stderr: string
  stdin: string
  polls: number
}

type RemoteJobRecord = {
  summary: RemoteJobSummary
  script: string
  stdout: string
  stderr: string
  polls: number
}

export class RemoteExecutorService {
  private readonly targetProvider: RemoteTargetProvider
  private readonly now: () => Date
  private readonly workerManifest: RemoteWorkerManifest
  private readonly runs = new Map<string, RemoteRunRecord>()
  private readonly jobs = new Map<string, RemoteJobRecord>()
  private sequence = 0

  constructor(options: RemoteExecutorServiceOptions = {}) {
    const env = options.env ?? process.env
    this.targetProvider = options.targetProvider ?? (() => options.targets ?? targetsFromEnv(env))
    this.now = options.now ?? (() => new Date())
    this.workerManifest = options.workerManifest ?? createWorkerHashManifest([{
      path: REMOTE_WORKER_ENTRYPOINT,
      content: 'remote-worker-stdlib-skeleton\n',
      mode: '0644'
    }], { createdAt: '1970-01-01T00:00:00.000Z' })
  }

  async listTargets(input: RemoteListTargetsInput = {}): Promise<RemoteListTargetsResult> {
    const parsed = remoteListTargetsInputSchema.parse(input)
    const targets = await this.loadTargets()
    const visibleTargets = parsed.include_disabled
      ? targets
      : targets.filter((target) => !target.disabled)
    return {
      ok: true,
      targets: visibleTargets,
      count: visibleTargets.length
    }
  }

  async probeTarget(input: RemoteProbeTargetInput): Promise<RemoteProbeTargetResult> {
    const parsed = remoteProbeTargetInputSchema.parse(input)
    const target = await this.resolveTarget(parsed.target_id, { allowDisabled: true })
    return {
      ok: true,
      target,
      available: !target.disabled,
      mode: 'mock',
      message: target.disabled
        ? `Target ${target.id} is configured but disabled.`
        : `Target ${target.id} is available through the mock remote executor service.`
    }
  }

  async deployWorker(input: RemoteDeployWorkerInput): Promise<RemoteDeployWorkerResult> {
    const parsed = remoteDeployWorkerInputSchema.parse(input)
    const target = await this.resolveTarget(parsed.target_id)
    if (!target.capabilities.deploy) {
      throw unsupported(target.id, 'Worker deployment is not enabled for this target.')
    }
    return {
      ok: true,
      targetId: target.id,
      deployed: !parsed.dry_run,
      dryRun: parsed.dry_run === true,
      remotePath: parsed.remote_path ?? `.sciforge/${REMOTE_WORKER_ENTRYPOINT}`,
      manifest: this.workerManifest
    }
  }

  async run(input: RemoteRunInput): Promise<RemoteRunResult> {
    const parsed = remoteRunInputSchema.parse(input)
    const target = await this.resolveTarget(parsed.target_id)
    if (!target.capabilities.directRun) {
      throw unsupported(target.id, 'Direct remote runs are not enabled for this target.')
    }
    const runId = parsed.run_id ?? this.nextId('run')
    if (this.runs.has(runId)) {
      throw invalidRequest(`Run id ${runId} already exists.`)
    }
    const command = normalizeCommand(parsed.command)
    const startedAt = this.isoNow()
    const stdout = [
      `[${startedAt}] mock remote run accepted on ${target.id}: ${command.join(' ')}`,
      parsed.stdin ? `[${startedAt}] stdin bytes accepted: ${Buffer.byteLength(parsed.stdin, 'utf8')}` : ''
    ].filter(Boolean).join('\n') + '\n'
    const record: RemoteRunRecord = {
      summary: {
        runId,
        targetId: target.id,
        status: 'running',
        command,
        ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
        startedAt
      },
      stdout,
      stderr: '',
      stdin: parsed.stdin ?? '',
      polls: 0
    }
    this.runs.set(runId, record)
    return {
      ok: true,
      run: cloneRunSummary(record.summary),
      output: chunkText(record.stdout, 0, record.stdout.length)
    }
  }

  async poll(input: RemotePollInput): Promise<RemotePollResult> {
    const parsed = remotePollInputSchema.parse(input)
    const record = this.resolveRun(parsed.run_id)
    record.polls += 1
    if (record.summary.status === 'running') {
      record.summary.status = 'succeeded'
      record.summary.exitCode = 0
      record.summary.finishedAt = this.isoNow()
      record.stdout += `[${record.summary.finishedAt}] mock remote run completed with exit code 0\n`
    }
    return {
      ok: true,
      run: cloneRunSummary(record.summary),
      output: chunkText(record.stdout, 0, record.stdout.length)
    }
  }

  async write(input: RemoteWriteInput): Promise<RemoteWriteResult> {
    const parsed = remoteWriteInputSchema.parse(input)
    const record = this.resolveRun(parsed.run_id)
    if (isTerminalRunStatus(record.summary.status)) {
      throw new RemoteExecutorWorkerError({
        code: 'command_rejected',
        reason: `Run ${record.summary.runId} is already ${record.summary.status}.`,
        retryable: false,
        suggestion: 'Start a new remote_run before writing more stdin.',
        targetId: record.summary.targetId
      })
    }
    record.stdin += parsed.data
    const acceptedBytes = Buffer.byteLength(parsed.data, 'utf8')
    record.stdout += `[${this.isoNow()}] mock stdin accepted: ${acceptedBytes} byte(s), eof=${parsed.eof === true}\n`
    return {
      ok: true,
      runId: record.summary.runId,
      acceptedBytes,
      eof: parsed.eof === true
    }
  }

  async stop(input: RemoteStopInput): Promise<RemoteStopResult> {
    const parsed = remoteStopInputSchema.parse(input)
    const record = this.resolveRun(parsed.run_id)
    const stopped = !isTerminalRunStatus(record.summary.status)
    if (stopped) {
      record.summary.status = 'cancelled'
      record.summary.signal = parsed.signal ?? 'TERM'
      record.summary.finishedAt = this.isoNow()
      record.stderr += `[${record.summary.finishedAt}] mock remote run cancelled with ${record.summary.signal}\n`
    }
    return {
      ok: true,
      run: cloneRunSummary(record.summary),
      stopped
    }
  }

  async submitJob(input: RemoteSubmitJobInput): Promise<RemoteSubmitJobResult> {
    const parsed = remoteSubmitJobInputSchema.parse(input)
    const target = await this.resolveTarget(parsed.target_id)
    const scheduler = parsed.scheduler ?? 'slurm'
    if (scheduler !== 'slurm') {
      throw unsupported(target.id, `Unsupported scheduler ${scheduler}.`)
    }
    if (!target.capabilities.slurm) {
      throw unsupported(target.id, 'Slurm job submission is not enabled for this target.')
    }
    const jobId = parsed.dry_run ? 'dry-run-slurm-job' : this.nextId('slurm')
    const submittedAt = this.isoNow()
    const job: RemoteJobSummary = {
      jobId,
      targetId: target.id,
      scheduler,
      ...(parsed.name ? { name: parsed.name } : {}),
      submittedAt,
      status: normalizeSlurmStatus('PENDING')
    }
    if (!parsed.dry_run) {
      this.jobs.set(jobKey(target.id, scheduler, jobId), {
        summary: job,
        script: parsed.script,
        stdout: `[${submittedAt}] mock Slurm job submitted: ${jobId}\n`,
        stderr: '',
        polls: 0
      })
    }
    return {
      ok: true,
      dryRun: parsed.dry_run === true,
      job: cloneJobSummary(job),
      scriptBytes: Buffer.byteLength(parsed.script, 'utf8')
    }
  }

  async jobStatus(input: RemoteJobStatusInput): Promise<RemoteJobStatusResult> {
    const parsed = remoteJobStatusInputSchema.parse(input)
    const scheduler = parsed.scheduler ?? 'slurm'
    const record = this.resolveJob(parsed.target_id, scheduler, parsed.job_id)
    record.polls += 1
    if (record.summary.status.state === 'queued' && record.polls > 1) {
      record.summary.status = normalizeSlurmStatus('RUNNING')
      record.stdout += `[${this.isoNow()}] mock Slurm job is running\n`
    }
    return {
      ok: true,
      job: cloneJobSummary(record.summary)
    }
  }

  async cancelJob(input: RemoteCancelJobInput): Promise<RemoteCancelJobResult> {
    const parsed = remoteCancelJobInputSchema.parse(input)
    const scheduler = parsed.scheduler ?? 'slurm'
    const record = this.resolveJob(parsed.target_id, scheduler, parsed.job_id)
    const cancelled = record.summary.status.state !== 'cancelled'
    if (cancelled) {
      record.summary.status = normalizeSlurmStatus('CANCELLED')
      record.stderr += `[${this.isoNow()}] mock Slurm job cancelled\n`
    }
    return {
      ok: true,
      job: cloneJobSummary(record.summary),
      cancelled
    }
  }

  async readOutput(input: RemoteReadOutputInput): Promise<RemoteReadOutputResult> {
    const parsed = remoteReadOutputInputSchema.parse(input)
    const stream = parsed.stream ?? 'combined'
    const text = parsed.run_id
      ? outputForRun(this.resolveRun(parsed.run_id), stream)
      : outputForJob(this.resolveJob(parsed.target_id ?? '', 'slurm', parsed.job_id ?? ''), stream)
    return {
      ok: true,
      stream,
      output: chunkText(text, parsed.offset ?? 0, parsed.max_bytes ?? 64 * 1024)
    }
  }

  private async loadTargets(): Promise<RemoteTarget[]> {
    const rawTargets = await this.targetProvider()
    return rawTargets.map((target, index) => {
      try {
        return sanitizeRemoteTarget(target)
      } catch (error) {
        if (error instanceof RemoteExecutorWorkerError) throw error
        throw new RemoteExecutorWorkerError({
          code: 'invalid_request',
          reason: `Invalid remote target at index ${index}: ${error instanceof Error ? error.message : String(error)}`,
          retryable: false,
          suggestion: 'Fix SCIFORGE_REMOTE_EXECUTOR_TARGETS_JSON or the injected target provider.',
          details: { index }
        })
      }
    })
  }

  private async resolveTarget(targetId: string, options: { allowDisabled?: boolean } = {}): Promise<RemoteTarget> {
    const targets = await this.loadTargets()
    const target = targets.find((candidate) => candidate.id === targetId)
    if (!target) {
      throw new RemoteExecutorWorkerError({
        code: 'target_not_found',
        reason: `Remote target ${targetId} was not found.`,
        retryable: false,
        suggestion: 'Call remote_list_targets and use one of the returned target ids.',
        targetId
      })
    }
    if (target.disabled && !options.allowDisabled) {
      throw new RemoteExecutorWorkerError({
        code: 'target_unavailable',
        reason: `Remote target ${target.id} is disabled.`,
        retryable: false,
        suggestion: 'Enable the target configuration before running remote executor tools.',
        targetId: target.id
      })
    }
    return target
  }

  private resolveRun(runId: string): RemoteRunRecord {
    const record = this.runs.get(runId)
    if (!record) {
      throw new RemoteExecutorWorkerError({
        code: 'run_not_found',
        reason: `Remote run ${runId} was not found.`,
        retryable: false,
        suggestion: 'Use a run id returned by remote_run.',
        details: { runId }
      })
    }
    return record
  }

  private resolveJob(targetId: string, scheduler: RemoteScheduler, jobId: string): RemoteJobRecord {
    const record = this.jobs.get(jobKey(targetId, scheduler, jobId))
    if (!record) {
      throw new RemoteExecutorWorkerError({
        code: 'job_not_found',
        reason: `Remote job ${jobId} was not found for target ${targetId}.`,
        retryable: false,
        suggestion: 'Use a job id returned by remote_submit_job.',
        targetId,
        details: { scheduler, jobId }
      })
    }
    return record
  }

  private nextId(prefix: string): string {
    this.sequence += 1
    return `${prefix}_${this.sequence.toString(36)}`
  }

  private isoNow(): string {
    return this.now().toISOString()
  }
}

export function createRemoteExecutorService(options: RemoteExecutorServiceOptions = {}): RemoteExecutorService {
  return new RemoteExecutorService(options)
}

export function sanitizeRemoteTarget(input: RemoteTargetInput): RemoteTarget {
  const parsed = remoteTargetInputSchema.parse(input)
  const kind = parsed.kind ?? 'ssh'
  const host = cleanString(parsed.host) || (kind === 'local' ? 'localhost' : '')
  if (!host) {
    throw invalidRequest('Remote target host is required.')
  }
  const user = cleanString(parsed.user)
  const id = cleanString(parsed.id) || slugify([user, host, parsed.port ? String(parsed.port) : ''].filter(Boolean).join('@'))
  if (!id) {
    throw invalidRequest('Remote target id could not be derived.')
  }
  const capabilities = defaultCapabilities(kind)
  const providedCapabilities = parsed.capabilities ?? {}
  const target = {
    id,
    ...(cleanString(parsed.label) ? { label: cleanString(parsed.label) } : {}),
    kind,
    host,
    ...(user ? { user } : {}),
    ...(parsed.port ? { port: parsed.port } : {}),
    disabled: parsed.disabled === true,
    tags: uniqueStrings(parsed.tags ?? []),
    ...(cleanString(parsed.workspaceRoot) ? { workspaceRoot: cleanString(parsed.workspaceRoot) } : {}),
    capabilities: {
      directRun: providedCapabilities.directRun ?? capabilities.directRun,
      stdin: providedCapabilities.stdin ?? capabilities.stdin,
      deploy: providedCapabilities.deploy ?? capabilities.deploy,
      slurm: providedCapabilities.slurm ?? capabilities.slurm
    }
  }
  return remoteTargetSchema.parse(target)
}

export function createWorkerHashManifest(
  files: WorkerManifestFileInput[],
  options: { version?: string; createdAt?: string } = {}
): RemoteWorkerManifest {
  const manifest: RemoteWorkerManifest = {
    protocol: REMOTE_WORKER_PROTOCOL,
    version: options.version ?? REMOTE_EXECUTOR_MCP_SERVER_VERSION,
    createdAt: options.createdAt ?? new Date().toISOString(),
    entrypoint: REMOTE_WORKER_ENTRYPOINT,
    files: files.map((file) => {
      const bytes = bytesForContent(file.content)
      return {
        path: file.path,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        sizeBytes: bytes.byteLength,
        ...(file.mode ? { mode: file.mode } : {})
      }
    }),
    capabilities: [...REMOTE_WORKER_CAPABILITIES]
  }
  return manifest
}

export function normalizeSlurmStatus(value: unknown): SlurmStatusNormalized {
  const extracted = extractSlurmStatus(value)
  const slurmState = normalizeSlurmStateToken(extracted.raw)
  const state = slurmStateToRemoteState(slurmState)
  return {
    raw: extracted.raw || 'UNKNOWN',
    slurmState: slurmState || 'UNKNOWN',
    state,
    terminal: ['succeeded', 'failed', 'cancelled', 'timeout'].includes(state),
    ...(extracted.reason ? { reason: extracted.reason } : {}),
    ...(extracted.exitCode ? { exitCode: extracted.exitCode } : {})
  }
}

function targetsFromEnv(env: NodeJS.ProcessEnv): RemoteTargetInput[] {
  const raw = env.SCIFORGE_REMOTE_EXECUTOR_TARGETS_JSON?.trim()
  if (!raw) return []
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) {
    throw invalidRequest('SCIFORGE_REMOTE_EXECUTOR_TARGETS_JSON must be a JSON array.')
  }
  return parsed as RemoteTargetInput[]
}

function defaultCapabilities(kind: RemoteTarget['kind']): RemoteTarget['capabilities'] {
  if (kind === 'mock' || kind === 'local') {
    return {
      directRun: true,
      stdin: true,
      deploy: true,
      slurm: kind === 'mock'
    }
  }
  return {
    directRun: true,
    stdin: true,
    deploy: true,
    slurm: false
  }
}

function normalizeCommand(command: string | string[]): string[] {
  if (Array.isArray(command)) return command.map((part) => part.trim()).filter(Boolean)
  return [command.trim()]
}

function outputForRun(record: RemoteRunRecord, stream: RemoteOutputStream): string {
  if (stream === 'stdout') return record.stdout
  if (stream === 'stderr') return record.stderr
  return record.stdout + record.stderr
}

function outputForJob(record: RemoteJobRecord, stream: RemoteOutputStream): string {
  if (stream === 'stdout') return record.stdout
  if (stream === 'stderr') return record.stderr
  return record.stdout + record.stderr
}

function chunkText(text: string, offset: number, maxBytes: number): RemoteOutputChunk {
  const normalizedOffset = Math.min(Math.max(offset, 0), text.length)
  const end = Math.min(normalizedOffset + maxBytes, text.length)
  const chunk = text.slice(normalizedOffset, end)
  return {
    text: chunk,
    offset: normalizedOffset,
    bytesRead: Buffer.byteLength(chunk, 'utf8'),
    truncated: end < text.length,
    ...(end < text.length ? { nextOffset: end } : {})
  }
}

function cloneRunSummary(summary: RemoteRunSummary): RemoteRunSummary {
  return {
    ...summary,
    command: [...summary.command]
  }
}

function cloneJobSummary(summary: RemoteJobSummary): RemoteJobSummary {
  return {
    ...summary,
    status: { ...summary.status }
  }
}

function isTerminalRunStatus(status: RemoteRunStatus): boolean {
  return ['succeeded', 'failed', 'cancelled', 'timeout'].includes(status)
}

function jobKey(targetId: string, scheduler: RemoteScheduler, jobId: string): string {
  return `${targetId}:${scheduler}:${jobId}`
}

function bytesForContent(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? Buffer.from(content, 'utf8') : content
}

function cleanString(value: string | undefined): string {
  return value?.trim().split('').filter((character) => {
    const code = character.charCodeAt(0)
    return code > 0x1f && code !== 0x7f
  }).join('') ?? ''
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => cleanString(value)).filter(Boolean))]
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128)
}

function extractSlurmStatus(value: unknown): { raw: string; reason?: string; exitCode?: string } {
  if (typeof value === 'string') {
    return extractSlurmStatusFromString(value)
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const raw = firstString(record, ['JobState', 'jobState', 'job_state', 'State', 'state', 'stateCompact']) ?? ''
    const reason = firstString(record, ['Reason', 'reason', 'StateReason', 'stateReason'])
    const exitCode = firstString(record, ['ExitCode', 'exitCode', 'exit_code'])
    return { raw, ...(reason ? { reason } : {}), ...(exitCode ? { exitCode } : {}) }
  }
  return { raw: String(value ?? '') }
}

function extractSlurmStatusFromString(value: string): { raw: string; reason?: string; exitCode?: string } {
  const raw = value.trim()
  const reason = raw.match(/(?:Reason|reason)=([^\s]+)/)?.[1]
  const exitCode = raw.match(/(?:ExitCode|exitCode)=([^\s]+)/)?.[1]
  const state = raw.match(/(?:JobState|State)=([A-Za-z_]+)/)?.[1]
  return {
    raw: state ?? raw,
    ...(reason ? { reason } : {}),
    ...(exitCode ? { exitCode } : {})
  }
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function normalizeSlurmStateToken(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'UNKNOWN'
  const token = trimmed
    .split(/[|,(/\s]+/u)
    .find((part) => part.trim().length > 0)
    ?.trim()
    .toUpperCase()
  return token || 'UNKNOWN'
}

function slurmStateToRemoteState(slurmState: string): SlurmNormalizedState {
  switch (slurmState) {
    case 'PD':
    case 'PENDING':
    case 'CF':
    case 'CONFIGURING':
    case 'REQUEUED':
    case 'REQUEUE_FED':
    case 'REQUEUE_HOLD':
    case 'REQUEUE':
      return 'queued'
    case 'R':
    case 'RUNNING':
    case 'CG':
    case 'COMPLETING':
    case 'S':
    case 'SUSPENDED':
    case 'RS':
    case 'RESIZING':
      return 'running'
    case 'CD':
    case 'COMPLETED':
      return 'succeeded'
    case 'CA':
    case 'CANCELLED':
      return 'cancelled'
    case 'TO':
    case 'TIMEOUT':
      return 'timeout'
    case 'BF':
    case 'BOOT_FAIL':
    case 'DL':
    case 'DEADLINE':
    case 'F':
    case 'FAILED':
    case 'NF':
    case 'NODE_FAIL':
    case 'OOM':
    case 'OUT_OF_MEMORY':
    case 'PR':
    case 'PREEMPTED':
    case 'SE':
    case 'SPECIAL_EXIT':
    case 'ST':
    case 'STOPPED':
      return 'failed'
    default:
      return 'unknown'
  }
}

function unsupported(targetId: string, reason: string): RemoteExecutorWorkerError {
  return new RemoteExecutorWorkerError({
    code: 'unsupported_operation',
    reason,
    retryable: false,
    suggestion: 'Inspect target capabilities with remote_list_targets or configure a compatible remote executor target.',
    targetId
  })
}

function invalidRequest(reason: string): RemoteExecutorWorkerError {
  return new RemoteExecutorWorkerError({
    code: 'invalid_request',
    reason,
    retryable: false,
    suggestion: 'Fix the remote executor configuration or request arguments and retry.'
  })
}
