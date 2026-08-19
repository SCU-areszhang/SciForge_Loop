import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkerLocks } from './locks.js'

test('locks serialize one task execution without blocking a different execution', async () => {
  const locks = new WorkerLocks()
  const events: string[] = []
  let releaseFirst!: () => void
  const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve })
  let firstStarted!: () => void
  const firstDidStart = new Promise<void>((resolve) => { firstStarted = resolve })

  const first = locks.run('task', 'execution-1', async () => {
    events.push('first:start')
    firstStarted()
    await firstMayFinish
    events.push('first:end')
  })
  await firstDidStart
  const sameExecution = locks.run('task', 'execution-1', async () => {
    events.push('same:start')
  })
  const otherExecution = locks.run('task', 'execution-2', async () => {
    events.push('other:start')
  })

  await otherExecution
  assert.deepEqual(events, ['first:start', 'other:start'])
  releaseFirst()
  await Promise.all([first, sameExecution])
  assert.deepEqual(events, ['first:start', 'other:start', 'first:end', 'same:start'])
})
