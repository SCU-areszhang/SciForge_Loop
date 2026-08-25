import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { StoredFeedbackSubmission } from './contract.js'
import { IdempotencyConflictError } from './service.js'
import { FileFeedbackIdempotencyStore } from './stores/file-idempotency.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function record(requestDigest = 'a'.repeat(64)): StoredFeedbackSubmission {
  return {
    idempotencyKey: 'feedback:thread-1234567890',
    requestDigest,
    result: {
      schemaVersion: 1,
      idempotencyKey: 'feedback:thread-1234567890',
      issueNumber: 8,
      issueUrl: 'https://github.test/issues/8',
      assetUrls: ['https://assets.test/feedback/aa/asset.png'],
      createdAt: '2026-07-11T03:00:00.000Z'
    }
  }
}

describe('FileFeedbackIdempotencyStore', () => {
  it('persists an atomic result that can be read after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'feedback-store-'))
    temporaryDirectories.push(directory)
    const store = new FileFeedbackIdempotencyStore(directory)
    await store.put(record())

    await expect(new FileFeedbackIdempotencyStore(directory).get(record().idempotencyKey)).resolves.toEqual(record())
    await expect(store.put(record('b'.repeat(64)))).rejects.toBeInstanceOf(IdempotencyConflictError)
  })
})
