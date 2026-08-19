import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AgentRunResult, BCloudRequest } from './ports.js'

export type WorkerPhase =
  | 'inputs_ready'
  | 'agent_started'
  | 'agent_completed'
  | 'output_uploading'
  | 'resource_registering'
  | 'outputs_uploaded'
  | 'terminal_queued'
  | 'succeeded'
  | 'manual_recovery'

export type WorkerJournalEntry = Readonly<{
  taskId: string
  executionId: string
  phase: WorkerPhase
  updatedAt: string
  downloadedInputs?: readonly Readonly<{ workspaceRelativePath: string }>[]
  agentResult?: AgentRunResult
  nextOutputIndex?: number
  resourceRefIds?: readonly string[]
  pendingCloudKey?: string
  recoveryReason?: string
}>

export type OutboxEntry = Readonly<{
  idempotencyKey: string
  request: BCloudRequest | Readonly<Record<string, unknown>>
  payloadHash: string
  state: 'pending' | 'delivered'
}>

type State = {
  journal: Record<string, WorkerJournalEntry>
  outbox: OutboxEntry[]
}

const EMPTY_STATE: State = { journal: {}, outbox: [] }

export class FileWorkerJournal {
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async get(taskId: string, executionId: string): Promise<WorkerJournalEntry | undefined> {
    return (await this.read()).journal[workerKey(taskId, executionId)]
  }

  async save(entry: WorkerJournalEntry): Promise<void> {
    await this.mutate((state) => {
      state.journal[workerKey(entry.taskId, entry.executionId)] = structuredClone(entry)
    })
  }

  async enqueue(input: Readonly<{
    idempotencyKey: string
    request: BCloudRequest | Readonly<Record<string, unknown>>
  }>): Promise<void> {
    await this.mutate((state) => {
      enqueueState(state, input)
    })
  }

  async saveAndEnqueue(
    entry: WorkerJournalEntry,
    input: Readonly<{
      idempotencyKey: string
      request: BCloudRequest | Readonly<Record<string, unknown>>
    }>
  ): Promise<void> {
    await this.mutate((state) => {
      state.journal[workerKey(entry.taskId, entry.executionId)] = structuredClone(entry)
      enqueueState(state, input)
    })
  }

  async outboxEntry(idempotencyKey: string): Promise<OutboxEntry | undefined> {
    return (await this.read()).outbox.find((entry) => entry.idempotencyKey === idempotencyKey)
  }

  async nextPending(): Promise<OutboxEntry | undefined> {
    return (await this.read()).outbox.find((entry) => entry.state === 'pending')
  }

  async markDelivered(idempotencyKey: string): Promise<void> {
    await this.mutate((state) => {
      const index = state.outbox.findIndex((entry) => entry.idempotencyKey === idempotencyKey)
      if (index < 0) throw new Error('Outbox entry was not found.')
      state.outbox[index] = { ...state.outbox[index]!, state: 'delivered' }
    })
  }

  async pendingCount(): Promise<number> {
    return (await this.read()).outbox.filter((entry) => entry.state === 'pending').length
  }

  private async mutate(change: (state: State) => void): Promise<void> {
    const operation = this.tail.then(async () => {
      const state = await this.read()
      change(state)
      await mkdir(dirname(this.filePath), { recursive: true })
      const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
      await rename(temporaryPath, this.filePath)
    })
    this.tail = operation.catch(() => undefined)
    await operation
  }

  private async read(): Promise<State> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as State
      return {
        journal: parsed.journal ?? {},
        outbox: parsed.outbox ?? []
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(EMPTY_STATE)
      throw error
    }
  }
}

function enqueueState(
  state: State,
  input: Readonly<{
    idempotencyKey: string
    request: BCloudRequest | Readonly<Record<string, unknown>>
  }>
): void {
  const payloadHash = hashPayload(input.request)
  const existing = state.outbox.find((entry) => entry.idempotencyKey === input.idempotencyKey)
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      throw new Error('Outbox idempotency key was reused with a different payload.')
    }
    return
  }
  state.outbox.push({ ...structuredClone(input), payloadHash, state: 'pending' })
}

export function workerKey(taskId: string, executionId: string): string {
  return `${encodeURIComponent(taskId)}::${encodeURIComponent(executionId)}`
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
