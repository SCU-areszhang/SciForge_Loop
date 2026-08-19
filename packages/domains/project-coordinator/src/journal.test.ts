import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FileWorkerJournal } from './journal.js'

test('journal isolates attempts by taskId and executionId', async () => {
  const journal = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-journal-')), 'state.json'))
  await journal.save({ taskId: 'task', executionId: 'exec-1', phase: 'agent_started', updatedAt: 'now' })
  await journal.save({ taskId: 'task', executionId: 'exec-2', phase: 'inputs_ready', updatedAt: 'later' })
  assert.equal((await journal.get('task', 'exec-1'))?.phase, 'agent_started')
  assert.equal((await journal.get('task', 'exec-2'))?.phase, 'inputs_ready')
})

test('journal rejects an idempotency key reused with a different payload', async () => {
  const journal = new FileWorkerJournal(join(await mkdtemp(join(tmpdir(), 'b-journal-')), 'state.json'))
  await journal.enqueue({ idempotencyKey: 'idem-one', request: { a: 1 } })
  await assert.rejects(
    journal.enqueue({ idempotencyKey: 'idem-one', request: { a: 2 } }),
    /different payload/u
  )
})
