import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type {
  DomainCapabilityContract,
  DomainMainRuntimeLifecycleContext,
  DomainMainRuntimeLifecycleContribution,
  DomainMainSystemCapabilityInvoker
} from '@sciforge/domain-sdk/host'
import {
  VERSION_CONTROL_CREATE_SNAPSHOT_ACTION_ID,
  VERSION_CONTROL_OPEN_WORKSPACE_ACTION_ID,
  VERSION_CONTROL_PREVIEW_RESTORE_ACTION_ID,
  VERSION_CONTROL_RESTORE_ACTION_ID,
  VERSION_CONTROL_STATUS_ACTION_ID
} from '@sciforge/domain-sdk/version-control'
import {
  GIT_CHECKPOINTS_CAPABILITY_IDS,
  gitCheckpointCreateResultSchema,
  gitCheckpointRestoreResultSchema
} from './contract.js'
import {
  createDomainMainEntry,
  createGitCheckpointsCapabilityFactory,
  createVersionControlCheckpointPort,
  type GitCheckpointsCapabilityFactory,
  type GitCheckpointsCapabilityOptions
} from './main.js'
import type { GitCheckpointService } from './service.js'

test('version-control adapter uses only public generic contracts and inherits restore authorization', async () => {
  const calls: Array<Readonly<{
    actionId: string
    input: unknown
    options: unknown
  }>> = []
  const invoker = {
    invoke: async (
      contract: DomainCapabilityContract<unknown, unknown>,
      input: unknown,
      options: unknown
    ): Promise<unknown> => {
      calls.push({ actionId: contract.actionId, input, options })
      switch (contract.actionId) {
        case VERSION_CONTROL_OPEN_WORKSPACE_ACTION_ID:
          return {
            resourceKind: 'host.version-control.workspace',
            resource: {
              token: 'token',
              semanticRevision: 'revision-0',
              expiresAt: '2026-07-28T01:00:00.000Z'
            },
            provider: 'git'
          }
        case VERSION_CONTROL_STATUS_ACTION_ID:
          return {
            revision: 'revision-0',
            clean: false,
            changes: [
              { path: 'a.ts', status: 'modified' },
              { path: 'b.ts', status: 'untracked' }
            ],
            truncated: false
          }
        case VERSION_CONTROL_CREATE_SNAPSHOT_ACTION_ID:
          return {
            id: 'snapshot-1',
            revision: 'revision-1',
            createdAt: '2026-07-28T00:00:00.000Z'
          }
        case VERSION_CONTROL_PREVIEW_RESTORE_ACTION_ID:
          return { text: 'diff', truncated: false }
        case VERSION_CONTROL_RESTORE_ACTION_ID:
          return { ok: true, revision: 'revision-1' }
        default:
          throw new Error(`Unexpected contract ${contract.actionId}`)
      }
    }
  } as DomainMainSystemCapabilityInvoker
  const port = createVersionControlCheckpointPort(invoker)

  await assert.doesNotReject(port.capture({
    workspaceRoot: '/workspace',
    snapshotName: 'checkpoint-1'
  }))
  await assert.doesNotReject(port.preview({
    workspaceRoot: '/workspace',
    snapshotId: 'snapshot-1'
  }))
  await assert.doesNotReject(port.restore({
    workspaceRoot: '/workspace',
    snapshotId: 'snapshot-1'
  }))

  assert.deepEqual(calls.map(({ actionId }) => actionId), [
    VERSION_CONTROL_OPEN_WORKSPACE_ACTION_ID,
    VERSION_CONTROL_STATUS_ACTION_ID,
    VERSION_CONTROL_CREATE_SNAPSHOT_ACTION_ID,
    VERSION_CONTROL_OPEN_WORKSPACE_ACTION_ID,
    VERSION_CONTROL_PREVIEW_RESTORE_ACTION_ID,
    VERSION_CONTROL_OPEN_WORKSPACE_ACTION_ID,
    VERSION_CONTROL_STATUS_ACTION_ID,
    VERSION_CONTROL_RESTORE_ACTION_ID
  ])
  assert.deepEqual(calls.at(-1)?.options, {
    workspaceId: '/workspace',
    idempotencyKey: calls.at(-1) &&
      (calls.at(-1)!.options as { idempotencyKey: string }).idempotencyKey,
    resource: {
      token: 'token',
      semanticRevision: 'revision-0',
      expiresAt: '2026-07-28T01:00:00.000Z'
    },
    expectedRevision: 'revision-0',
    authorization: { mode: 'inherit-current-action' }
  })
  assert.equal(
    calls.slice(0, -1).some(({ options }) =>
      Boolean((options as { authorization?: unknown } | undefined)?.authorization)
    ),
    false
  )
  assert.equal(
    calls.filter(({ actionId }) => actionId === VERSION_CONTROL_RESTORE_ACTION_ID).length,
    1
  )
})

test('restore envelope preserves the successful output identity without claiming a resource change', async () => {
  const definitions: GitCheckpointsCapabilityOptions[] = []
  const restoreCalls: unknown[] = []
  const successfulRestore = Object.freeze({
    ok: true as const,
    value: Object.freeze({
      checkpointId: 'checkpoint-1',
      runtimeId: 'codex',
      threadId: 'thread-1',
      phase: 'manual' as const,
      workspaceRoot: '/workspace',
      provider: 'git',
      revision: 'revision-1',
      createdAt: '2026-07-28T00:00:00.000Z',
      changeSummary: '1 change',
      status: 'restored' as const,
      restoreStatus: '2026-07-28T00:01:00.000Z',
      rescueCheckpointId: 'rescue-1'
    })
  })
  let restoreError: Error | undefined
  const service = {
    list: async () => ({ ok: true, value: [] }),
    create: async () => ({ ok: false, reason: 'unused', message: 'unused' }),
    preview: async () => ({ ok: false, reason: 'unused', message: 'unused' }),
    restore: async (...args: unknown[]) => {
      restoreCalls.push(args)
      if (restoreError) throw restoreError
      return successfulRestore
    }
  } as unknown as GitCheckpointService
  const factory = createGitCheckpointsCapabilityFactory({
    defineCapability: (definition) => {
      definitions.push(definition)
      return definition
    },
    getService: () => service
  })
  factory.createDefinitions()
  const restore = definitions.find(
    ({ id }) => id === GIT_CHECKPOINTS_CAPABILITY_IDS.restore
  )
  const list = definitions.find(
    ({ id }) => id === GIT_CHECKPOINTS_CAPABILITY_IDS.list
  )

  assert.ok(restore)
  assert.equal(restore.effect, 'destructive')
  assert.equal(restore.approval, 'confirmation')
  assert.deepEqual(restore.audiences, ['ui', 'agent'])
  const envelope = await restore.handler(
    { checkpointId: 'checkpoint-1' },
    { caller: { workspaceId: '/workspace' } }
  )
  assert.strictEqual(envelope.output, successfulRestore)
  assert.deepEqual(envelope, {
    output: successfulRestore,
    changed: false
  })
  assert.deepEqual(restoreCalls, [[
    { checkpointId: 'checkpoint-1' },
    '/workspace'
  ]])

  restoreError = new Error('outer restore failure')
  await assert.rejects(
    restore.handler(
      { checkpointId: 'checkpoint-1' },
      { caller: { workspaceId: '/workspace' } }
    ),
    /outer restore failure/u
  )

  assert.ok(list)
  await assert.rejects(
    list.handler(
      { workspaceRoot: '/another-workspace' },
      { caller: { workspaceId: '/workspace' } }
    ),
    /another workspace/u
  )
})

test('public main entry drives the real runtime and service while restore failures stay closed', async (t) => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'sciforge-git-checkpoints-main-'))
  t.after(() => rm(userDataDir, { recursive: true, force: true }))
  const calls: Array<Readonly<{
    actionId: string
    input: unknown
    options: unknown
  }>> = []
  let snapshotSequence = 0
  let failRestore = false
  const invoker = {
    invoke: async (
      contract: DomainCapabilityContract<unknown, unknown>,
      input: unknown,
      options: unknown
    ): Promise<unknown> => {
      calls.push({ actionId: contract.actionId, input, options })
      switch (contract.actionId) {
        case VERSION_CONTROL_OPEN_WORKSPACE_ACTION_ID:
          return {
            resourceKind: 'host.version-control.workspace',
            resource: {
              token: 'token',
              semanticRevision: 'revision-0',
              expiresAt: '2099-07-28T01:00:00.000Z'
            },
            provider: 'git'
          }
        case VERSION_CONTROL_STATUS_ACTION_ID:
          return {
            revision: 'revision-0',
            clean: true,
            changes: [],
            truncated: false
          }
        case VERSION_CONTROL_CREATE_SNAPSHOT_ACTION_ID:
          snapshotSequence += 1
          return {
            id: `snapshot-${snapshotSequence}`,
            revision: `revision-${snapshotSequence}`,
            createdAt: '2026-07-28T00:00:00.000Z'
          }
        case VERSION_CONTROL_RESTORE_ACTION_ID:
          if (failRestore) {
            throw Object.assign(new Error('Working tree has changes.'), {
              code: 'dirty_worktree'
            })
          }
          return { ok: true, revision: 'revision-restored' }
        default:
          throw new Error(`Unexpected contract ${contract.actionId}`)
      }
    }
  } as DomainMainSystemCapabilityInvoker
  const entry = createDomainMainEntry<GitCheckpointsCapabilityOptions>({
    getUserDataDir: () => userDataDir,
    defineCapability: (definition) => definition
  })
  const factory = entry.contributions.find(
    ({ kind }) => kind === 'main.capability-factory'
  )?.value as GitCheckpointsCapabilityFactory<GitCheckpointsCapabilityOptions>
  const lifecycle = entry.contributions.find(
    ({ kind }) => kind === 'main.runtime-lifecycle'
  )?.value as DomainMainRuntimeLifecycleContribution
  const definitions = factory.createDefinitions()
  const create = definitions.find(
    ({ id }) => id === GIT_CHECKPOINTS_CAPABILITY_IDS.create
  )
  const restore = definitions.find(
    ({ id }) => id === GIT_CHECKPOINTS_CAPABILITY_IDS.restore
  )
  assert.ok(create)
  assert.ok(restore)

  const controller = new AbortController()
  let deactivate: (() => void | Promise<void>) | undefined
  try {
    const activated = await lifecycle.activate(
      lifecycleContext(userDataDir, invoker, controller.signal)
    )
    assert.equal(typeof activated, 'function')
    deactivate = activated as () => void | Promise<void>
    const caller = { caller: { workspaceId: '/workspace' } }
    const created = gitCheckpointCreateResultSchema.parse((await create.handler({
      runtimeId: 'codex',
      threadId: 'thread-success',
      workspaceRoot: '/workspace',
      phase: 'manual'
    }, caller)).output)
    assert.equal(created.ok, true)
    if (!created.ok) assert.fail('Expected the real service to create a checkpoint.')

    const successfulEnvelope = await restore.handler({
      checkpointId: created.value.checkpointId
    }, caller)
    const successfulOutput = gitCheckpointRestoreResultSchema.parse(
      successfulEnvelope.output
    )
    assert.equal(successfulOutput.ok, true)
    if (!successfulOutput.ok) assert.fail('Expected the real service restore to succeed.')
    assert.equal(successfulOutput.value.checkpointId, created.value.checkpointId)
    assert.equal(successfulOutput.value.status, 'restored')
    assert.ok(successfulOutput.value.rescueCheckpointId)
    assert.equal(successfulEnvelope.changed, false)
    assert.equal(restoreDispatchCount(calls), 1)

    const dispatchesAfterSuccess = restoreDispatchCount(calls)
    await assert.rejects(
      restore.handler({
        checkpointId: created.value.checkpointId,
        unexpected: true
      }, caller),
      /unrecognized_keys/u
    )
    await assert.rejects(
      restore.handler(
        { checkpointId: created.value.checkpointId },
        { caller: {} }
      ),
      /workspace-scoped caller/u
    )
    const missingEnvelope = await restore.handler(
      { checkpointId: 'missing-checkpoint' },
      caller
    )
    assert.deepEqual(missingEnvelope, {
      output: {
        ok: false,
        reason: 'not_found',
        message: 'Git checkpoint not found: missing-checkpoint'
      },
      changed: false
    })
    assert.equal(restoreDispatchCount(calls), dispatchesAfterSuccess)

    const blockedTarget = gitCheckpointCreateResultSchema.parse((await create.handler({
      runtimeId: 'codex',
      threadId: 'thread-blocked',
      workspaceRoot: '/workspace',
      phase: 'manual'
    }, caller)).output)
    assert.equal(blockedTarget.ok, true)
    if (!blockedTarget.ok) assert.fail('Expected a checkpoint for the failure case.')
    failRestore = true
    const blockedEnvelope = await restore.handler({
      checkpointId: blockedTarget.value.checkpointId
    }, caller)
    const blockedOutput = gitCheckpointRestoreResultSchema.parse(blockedEnvelope.output)
    assert.equal(blockedOutput.ok, false)
    if (blockedOutput.ok) assert.fail('Expected the real inner restore failure to stay failed.')
    assert.equal(blockedOutput.reason, 'dirty_worktree')
    assert.equal(blockedEnvelope.changed, false)
    assert.equal(restoreDispatchCount(calls), dispatchesAfterSuccess + 1)

    await deactivate()
    const dispatchesAfterDeactivate = restoreDispatchCount(calls)
    await assert.rejects(
      restore.handler({ checkpointId: created.value.checkpointId }, caller),
      /runtime is not active/u
    )
    assert.equal(restoreDispatchCount(calls), dispatchesAfterDeactivate)
  } finally {
    await deactivate?.()
    await entry.contributions.find(
      ({ kind }) => kind === 'main.runtime-lifecycle'
    )?.onDispose?.()
  }
})

function restoreDispatchCount(
  calls: readonly Readonly<{ actionId: string }>[]
): number {
  return calls.filter(({ actionId }) => actionId === VERSION_CONTROL_RESTORE_ACTION_ID).length
}

function lifecycleContext(
  userDataDir: string,
  capabilities: DomainMainSystemCapabilityInvoker,
  signal: AbortSignal
): DomainMainRuntimeLifecycleContext {
  return {
    owner: { moduleId: 'sciforge.git-checkpoints', moduleVersion: '0.1.0' },
    signal,
    userDataDir,
    appRoot: '/workspace',
    environment: {},
    agentThreads: {
      list: async () => [],
      read: async () => ({
        id: 'thread-1',
        runtimeId: 'codex',
        watermark: '1',
        turns: [],
        artifacts: []
      }),
      hasActiveTurns: () => false
    },
    turnEvents: {
      subscribe: () => () => undefined
    },
    capabilities,
    modelAccess: {
      textReasoner: async () => null
    },
    enablement: {
      isEnabled: async () => true,
      subscribe: () => () => undefined
    },
    log: () => undefined
  }
}
