import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import type {
  CapabilityAudience,
  CapabilityCallerContextInput,
  CapabilityInvocationRequest,
  CapabilityResourceHandle
} from '../../shared/capability-broker'
import { CapabilityBroker, CapabilityBrokerError } from './broker'
import {
  CapabilityRegistrationError,
  CapabilityRegistry,
  defineCapability,
  type CapabilityDefinition
} from './registry'

const agent: CapabilityCallerContextInput = {
  audience: 'agent',
  callerId: 'agent-1',
  workspaceId: 'workspace-1'
}

const ui: CapabilityCallerContextInput = {
  audience: 'ui',
  callerId: 'window-1',
  workspaceId: 'workspace-1'
}

const system: CapabilityCallerContextInput = {
  audience: 'system',
  callerId: 'system-1',
  workspaceId: 'workspace-1'
}

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function expectBrokerCode(error: unknown, code: string): boolean {
  expect(error).toBeInstanceOf(CapabilityBrokerError)
  expect((error as CapabilityBrokerError).code).toBe(code)
  return true
}

function readCapability(handler = vi.fn(async (input: { section: string }) => ({
  output: { text: `read:${input.section}` }
}))) {
  return defineCapability({
    id: 'document.read-section',
    version: '1',
    title: 'Read document section',
    description: 'Read a named section from a document resource.',
    audiences: ['ui', 'agent', 'system'],
    scope: 'resource',
    resourceKinds: ['document'],
    effect: 'read',
    approval: 'none',
    concurrency: { revision: 'none', idempotency: 'none' },
    inputSchema: z.object({ section: z.string().min(1) }).strict(),
    outputSchema: z.object({ text: z.string() }).strict(),
    handler
  })
}

function mutationCapability(handler = vi.fn(async (input: { text: string }, context) => ({
  output: { saved: input.text },
  changed: true,
  semanticRevision: `${Number(context.resource?.semanticRevision ?? '0') + 1}`
}))) {
  return defineCapability({
    id: 'document.annotation-upsert',
    version: '1',
    title: 'Upsert annotation',
    description: 'Create or update an annotation through the canonical document provider.',
    audiences: ['ui', 'agent', 'system'],
    scope: 'resource',
    resourceKinds: ['document'],
    effect: 'workspace-write',
    approval: 'none',
    concurrency: { revision: 'optimistic', idempotency: 'required' },
    inputSchema: z.object({ text: z.string().min(1) }).strict(),
    outputSchema: z.object({ saved: z.string() }).strict(),
    handler
  })
}

function issueDocument(
  broker: CapabilityBroker,
  caller: CapabilityCallerContextInput = agent,
  options: {
    resourceId?: string
    semanticRevision?: string
    expiresInMs?: number
    layoutRevision?: string
    audiences?: CapabilityAudience[]
    dispose?: () => void | Promise<void>
  } = {}
): CapabilityResourceHandle {
  const semanticRevision = options.semanticRevision ?? '1'
  return broker.issueResourceHandle(caller, {
    resourceId: options.resourceId ?? 'internal/path/paper.pdf',
    resourceKind: 'document',
    workspaceId: caller.workspaceId,
    audiences: options.audiences,
    semanticRevision,
    layoutRevision: options.layoutRevision,
    expiresInMs: options.expiresInMs,
    dispose: options.dispose,
    observe: async () => ({
      state: { title: 'Paper', annotationCount: 0 },
      semanticRevision,
      layoutRevision: 'layout-2',
      operationIds: ['document.read-section', 'document.annotation-upsert']
    })
  })
}

describe('CapabilityRegistry', () => {
  it('atomically binds wire metadata, Zod schemas, and one executable handler', () => {
    const handler = vi.fn(async () => ({ output: { text: 'ok' } }))
    const definition = readCapability(handler)
    const registry = new CapabilityRegistry([definition])

    expect(registry.require('document.read-section').handler).toBe(handler)
    expect(registry.list()).toHaveLength(1)
    expect(registry.list()[0]).toMatchObject({
      id: 'document.read-section',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' }
    })
  })

  it('fails fast for duplicate or incomplete definitions', () => {
    const definition = readCapability()
    const registry = new CapabilityRegistry([definition])
    expect(() => registry.register(definition)).toThrowError(CapabilityRegistrationError)
    expect(() => registry.register(definition)).toThrow(/already registered/)

    const incomplete = { ...definition, handler: undefined } as unknown as CapabilityDefinition
    expect(() => new CapabilityRegistry([incomplete])).toThrow(/exactly one handler/)
    expect(() => defineCapability({
      ...definition.descriptor,
      inputSchema: z.function(),
      outputSchema: z.object({ ok: z.boolean() }),
      handler: async () => ({ output: { ok: true } })
    })).toThrow(/cannot be represented as JSON Schema/)
  })

  it('rejects unsafe audience, effect, approval, scope, and concurrency combinations', () => {
    expect(() => defineCapability({
      id: 'desktop.delete-everything',
      version: '1',
      title: 'Delete everything',
      description: 'Unsafe test action.',
      audiences: ['agent'],
      scope: 'global',
      effect: 'destructive',
      approval: 'none',
      concurrency: { revision: 'none', idempotency: 'required' },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      handler: async () => ({ output: { ok: true } })
    })).toThrow(/require approval/)

    expect(() => defineCapability({
      id: 'workspace.bad-revision',
      version: '1',
      title: 'Bad revision action',
      description: 'Invalid non-resource optimistic action.',
      audiences: ['ui'],
      scope: 'workspace',
      effect: 'workspace-write',
      approval: 'none',
      concurrency: { revision: 'optimistic', idempotency: 'required' },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      handler: async () => ({ output: { ok: true } })
    })).toThrow(/Optimistic revisions require resource scope/)
  })

  it('discovers by exact ID and ranked unordered tokens with independent bounded filters', () => {
    const uiOnly = defineCapability({
      id: 'document.human-review',
      version: '1',
      title: 'Human review',
      description: 'A UI-only human review decision.',
      audiences: ['ui'],
      scope: 'resource',
      resourceKinds: ['document'],
      effect: 'read',
      approval: 'none',
      concurrency: { revision: 'none', idempotency: 'none' },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ ready: z.boolean() }).strict(),
      handler: async () => ({ output: { ready: true } })
    })
    const openPreview = defineCapability({
      id: 'workspace-preview.open',
      version: '1',
      title: 'Open Workspace Preview',
      description: 'Open a workspace file through the canonical preview provider.',
      audiences: ['ui', 'agent'],
      scope: 'workspace',
      producedResourceKinds: ['workspace-preview'],
      effect: 'read',
      approval: 'none',
      concurrency: { revision: 'none', idempotency: 'none' },
      tags: ['workspace', 'preview', 'open'],
      inputSchema: z.object({ path: z.string() }).strict(),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      handler: async () => ({ output: { ok: true } })
    })
    const registry = new CapabilityRegistry([readCapability(), uiOnly, openPreview])

    expect(registry.discover(agent, { acceptedResourceKind: 'document' }).map((item) => item.id))
      .toEqual(['document.read-section'])
    expect(registry.discover(ui, { acceptedResourceKind: 'document' }).map((item) => item.id))
      .toEqual(['document.human-review', 'document.read-section'])
    expect(registry.discover(agent, {
      capabilityId: 'workspace-preview.open',
      text: 'words that do not match'
    }).map((item) => item.id)).toEqual(['workspace-preview.open'])
    expect(registry.discover(agent, {
      text: 'file preview workspace open'
    }).map((item) => item.id)).toEqual(['workspace-preview.open'])
    expect(registry.discover(agent, {
      text: 'open workspace file image png view'
    }).map((item) => item.id)).toEqual(['workspace-preview.open'])
    expect(registry.discover(agent, {
      text: 'image png view'
    })).toEqual([])
    expect(registry.discover(agent, {
      scope: 'workspace',
      producedResourceKind: 'workspace-preview'
    }).map((item) => item.id)).toEqual(['workspace-preview.open'])
    expect(registry.discover(agent, {
      providerFamily: 'managed-mcp'
    })).toEqual([])
    expect(registry.discover(ui, { limit: 1 })).toHaveLength(1)
  })
})

describe('CapabilityBroker', () => {
  it('validates caller audience, approval, input, and provider output before returning', async () => {
    const destructive = defineCapability({
      id: 'external.publish-result',
      version: '1',
      title: 'Publish result',
      description: 'Publish a result outside the workspace.',
      audiences: ['ui', 'agent'],
      scope: 'workspace',
      effect: 'external-write',
      approval: 'confirmation',
      concurrency: { revision: 'none', idempotency: 'required' },
      inputSchema: z.object({ destination: z.string().url() }).strict(),
      outputSchema: z.object({ published: z.boolean() }).strict(),
      handler: vi.fn(async () => ({ output: { published: true } }))
    })
    const invalidOutput = readCapability(vi.fn(async () => ({ output: { text: 42 } })) as never)
    const broker = new CapabilityBroker(new CapabilityRegistry([destructive, invalidOutput]))

    await expect(broker.invoke(agent, {
      actionId: 'external.publish-result',
      invocationId: 'publish-1',
      input: { destination: 'https://example.com' }
    })).rejects.toSatisfy((error) => expectBrokerCode(error, 'approval_denied'))

    const approved = {
      ...agent,
      approvals: [{
        actionId: 'external.publish-result',
        invocationId: '  publish-1  ',
        mode: 'confirmation' as const
      }]
    }
    await expect(broker.invoke(approved, {
      actionId: 'external.publish-result',
      invocationId: '  publish-1  ',
      input: { destination: 'not-a-url' }
    })).rejects.toSatisfy((error) => expectBrokerCode(error, 'invalid_input'))

    const handle = issueDocument(broker)
    await expect(broker.invoke(agent, {
      actionId: 'document.read-section',
      resource: handle,
      input: { section: 'abstract' }
    })).rejects.toSatisfy((error) => expectBrokerCode(error, 'invalid_output'))
  })

  it('rejects an invocation ID on a read request with a stable typed code before the handler', async () => {
    const handler = vi.fn(async () => ({ output: { ok: true } }))
    const broker = new CapabilityBroker(new CapabilityRegistry([defineCapability({
      id: 'fixture.read',
      version: '1',
      title: 'Fixture read',
      description: 'Reads fixture state without command semantics.',
      audiences: ['ui'],
      scope: 'global',
      effect: 'read',
      approval: 'none',
      concurrency: { revision: 'none', idempotency: 'none' },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      handler
    })]))

    await expect(broker.invoke(ui, {
      actionId: 'fixture.read',
      invocationId: 'read-command',
      input: {}
    })).rejects.toSatisfy((error) => expectBrokerCode(error, 'unexpected_invocation_id'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('passes one canonical invocation ID to every non-read handler and none to read handlers', async () => {
    const seen = new Map<string, string | undefined>()
    const effects = ['compute', 'workspace-write', 'external-write', 'destructive'] as const
    const definitions = effects.map((effect) => defineCapability({
      id: `fixture.${effect}`,
      version: '1',
      title: `Fixture ${effect}`,
      description: `Exercises ${effect} handler invocation context.`,
      audiences: ['ui'],
      scope: 'global',
      effect,
      approval: 'none',
      concurrency: { revision: 'none', idempotency: 'required' },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      handler: async (_input, context) => {
        seen.set(effect, context.invocationId)
        return { output: { ok: true } }
      }
    }))
    definitions.push(defineCapability({
      id: 'fixture.read-context',
      version: '1',
      title: 'Fixture read context',
      description: 'Exercises read handler invocation context.',
      audiences: ['ui'],
      scope: 'global',
      effect: 'read',
      approval: 'none',
      concurrency: { revision: 'none', idempotency: 'none' },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      handler: async (_input, context) => {
        seen.set('read', context.invocationId)
        return { output: { ok: true } }
      }
    }))
    const broker = new CapabilityBroker(new CapabilityRegistry(definitions))

    for (const effect of effects) {
      const result = await broker.invoke(ui, {
        actionId: `fixture.${effect}`,
        invocationId: `  command-${effect}  `,
        input: {}
      })
      expect(result.invocationId).toBe(`command-${effect}`)
      expect(seen.get(effect)).toBe(`command-${effect}`)
    }
    await broker.invoke(ui, { actionId: 'fixture.read-context', input: {} })
    expect(seen.get('read')).toBeUndefined()
    expect(broker.listAuditRecords().map((record) => record.invocationId)).toEqual([
      ...effects.map((effect) => `command-${effect}`),
      undefined
    ])
  })

  it('keeps resource identity opaque and rejects forged, cross-audience, cross-workspace, and expired handles', async () => {
    let now = new Date('2026-07-16T00:00:00.000Z')
    const broker = new CapabilityBroker(new CapabilityRegistry([readCapability()]), { now: () => now })
    const handle = issueDocument(broker, agent, { expiresInMs: 1_000 })

    expect(JSON.stringify(handle)).not.toContain('paper.pdf')
    await expect(broker.invoke(ui, {
      actionId: 'document.read-section',
      resource: handle,
      input: { section: 'abstract' }
    })).rejects.toSatisfy((error) => expectBrokerCode(error, 'resource_audience_denied'))
    await expect(broker.invoke({ ...agent, workspaceId: 'workspace-2' }, {
      actionId: 'document.read-section',
      resource: handle,
      input: { section: 'abstract' }
    })).rejects.toSatisfy((error) => expectBrokerCode(error, 'resource_scope_mismatch'))
    await expect(broker.invoke(agent, {
      actionId: 'document.read-section',
      resource: { ...handle, semanticRevision: 'forged' },
      input: { section: 'abstract' }
    })).rejects.toSatisfy((error) => expectBrokerCode(error, 'invalid_resource_handle'))

    now = new Date('2026-07-16T00:00:01.001Z')
    await expect(broker.observe(agent, { resource: handle }))
      .rejects.toSatisfy((error) => expectBrokerCode(error, 'resource_handle_expired'))
  })

  it('keeps resource handles audience-private unless transfer is explicitly declared', async () => {
    const broker = new CapabilityBroker(new CapabilityRegistry([readCapability()]))
    const handle = issueDocument(broker, ui)

    await expect(broker.observe(agent, { resource: handle }))
      .rejects.toSatisfy((error) => expectBrokerCode(error, 'resource_audience_denied'))
  })

  it('allows explicitly shared handles in the same workspace and preserves transfer through refresh', async () => {
    const handler = vi.fn(async (input: { text: string }, context) => ({
      output: { saved: input.text },
      changed: true,
      semanticRevision: `${Number(context.resource?.semanticRevision ?? '0') + 1}`
    }))
    const broker = new CapabilityBroker(new CapabilityRegistry([
      readCapability(),
      mutationCapability(handler)
    ]))
    const handle = issueDocument(broker, ui, { audiences: ['ui', 'agent', 'system'] })

    const observed = await broker.observe(agent, { resource: handle })
    expect(observed.operations.map((operation) => operation.id)).toContain('document.annotation-upsert')
    const changed = await broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'shared-edit-1',
      resource: observed.resource,
      expectedRevision: observed.semanticRevision,
      input: { text: 'Shared annotation' }
    })
    expect(changed).toMatchObject({ changed: true, beforeRevision: '1', afterRevision: '2' })
    expect(handler).toHaveBeenCalledTimes(1)

    await expect(broker.observe({ ...agent, workspaceId: 'workspace-2' }, { resource: changed.resource! }))
      .rejects.toSatisfy((error) => expectBrokerCode(error, 'resource_scope_mismatch'))
  })

  it('renews a stable resource reference only after audience and workspace checks', async () => {
    let now = new Date('2026-07-16T00:00:00.000Z')
    const broker = new CapabilityBroker(new CapabilityRegistry([readCapability(), mutationCapability()]), {
      now: () => now,
      handleTtlMs: 1_000
    })
    const sharedHandle = issueDocument(broker, ui, {
      audiences: ['ui', 'agent', 'system'],
      expiresInMs: 1_000
    })
    const shared = await broker.observe(ui, { resource: sharedHandle })
    now = new Date('2026-07-16T00:00:02.000Z')

    const renewed = broker.bindResourceRef(agent, shared.resourceRef)
    expect(broker.describeResourceRef(agent, shared.resourceRef)).toMatchObject({
      resourceId: 'internal/path/paper.pdf',
      resourceRef: shared.resourceRef,
      resourceKind: 'document',
      workspaceId: 'workspace-1',
      semanticRevision: '1'
    })
    await expect(broker.observe(agent, { resource: renewed })).resolves.toMatchObject({
      resourceRef: shared.resourceRef,
      resourceKind: 'document'
    })
    await expect(Promise.resolve().then(() => broker.bindResourceRef(
      { ...agent, workspaceId: 'workspace-2' },
      shared.resourceRef
    ))).rejects.toSatisfy((error) => expectBrokerCode(error, 'resource_scope_mismatch'))
    expect(() => broker.describeResourceRef(
      { ...agent, workspaceId: 'workspace-2' },
      shared.resourceRef
    )).toThrow(expect.objectContaining({ code: 'resource_scope_mismatch' }))

    const privateHandle = issueDocument(broker, ui, { expiresInMs: 1_000 })
    const privateObservation = await broker.observe(ui, { resource: privateHandle })
    await expect(Promise.resolve().then(() => broker.bindResourceRef(agent, privateObservation.resourceRef)))
      .rejects.toSatisfy((error) => expectBrokerCode(error, 'resource_audience_denied'))
    expect(() => broker.describeResourceRef(agent, privateObservation.resourceRef))
      .toThrow(expect.objectContaining({ code: 'resource_audience_denied' }))
  })

  it('observes current semantic state, keeps layout revisions separate, and returns executable operations', async () => {
    const broker = new CapabilityBroker(new CapabilityRegistry([readCapability(), mutationCapability()]))
    const handle = issueDocument(broker, agent, { layoutRevision: 'layout-1' })
    const observation = await broker.observe(agent, { resource: handle })

    expect(observation).toMatchObject({
      resourceKind: 'document',
      semanticRevision: '1',
      layoutRevision: 'layout-2',
      state: { title: 'Paper', annotationCount: 0 }
    })
    expect(observation.resource.semanticRevision).toBe('1')
    expect(observation.operations.map((item) => item.id)).toEqual([
      'document.read-section',
      'document.annotation-upsert'
    ])
  })

  it('enforces semantic revisions and makes mutations idempotent, audited, and evented', async () => {
    const handler = vi.fn(async (input: { text: string }, context) => ({
      output: { saved: input.text },
      changed: true,
      semanticRevision: `${Number(context.resource?.semanticRevision ?? '0') + 1}`
    }))
    const broker = new CapabilityBroker(new CapabilityRegistry([mutationCapability(handler)]))
    const handle = issueDocument(broker)
    const events: unknown[] = []
    const unsubscribe = broker.subscribe(ui, (event) => events.push(event))
    const request: CapabilityInvocationRequest = {
      actionId: 'document.annotation-upsert',
      invocationId: 'annotation-1',
      resource: handle,
      expectedRevision: '1',
      input: { text: 'Major comment' }
    }

    const first = await broker.invoke(agent, request)
    const retry = await broker.invoke(agent, request)
    unsubscribe()

    expect(handler).toHaveBeenCalledTimes(1)
    expect(first).toMatchObject({
      beforeRevision: '1',
      afterRevision: '2',
      changed: true,
      replayed: false
    })
    expect(first.resource?.semanticRevision).toBe('2')
    expect(retry).toMatchObject({ afterRevision: '2', replayed: true })
    expect(events).toHaveLength(1)
    expect(broker.listEvents(ui)).toHaveLength(1)
    expect(broker.listEvents({ ...ui, workspaceId: 'workspace-2' })).toHaveLength(0)
    expect(broker.listAuditRecords().map((record) => record.status)).toEqual(['success', 'replayed'])

    await expect(broker.invoke(agent, {
      ...request,
      invocationId: 'annotation-2'
    })).rejects.toSatisfy((error) => expectBrokerCode(error, 'revision_conflict'))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(broker.listAuditRecords().at(-1)).toMatchObject({
      status: 'rejected',
      errorCode: 'revision_conflict'
    })
  })

  it('projects historical resource liveness and rejects retired references with a stable code', async () => {
    const release = defineCapability({
      id: 'document.release',
      version: '1',
      title: 'Release document',
      description: 'Retires the broker resource after its provider is released.',
      audiences: ['agent'],
      scope: 'resource',
      resourceKinds: ['document'],
      effect: 'compute',
      approval: 'none',
      concurrency: { revision: 'none', idempotency: 'required' },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ released: z.boolean() }).strict(),
      handler: async () => ({
        output: { released: true },
        changed: false,
        retireResource: true
      })
    })
    const broker = new CapabilityBroker(new CapabilityRegistry([mutationCapability(), release]))
    const handle = issueDocument(broker)
    const changed = await broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'annotation-before-release',
      resource: handle,
      expectedRevision: '1',
      input: { text: 'Audit this change' }
    })
    const liveEvent = broker.listEvents(agent)[0]
    expect(liveEvent).toMatchObject({ resourceStatus: 'live' })
    const releaseTaskBinding = broker.retainResourceRefs(agent, [liveEvent!.resourceRef])

    await broker.invoke(agent, {
      actionId: 'document.release',
      invocationId: 'release-document',
      resource: changed.resource,
      input: {}
    })

    expect(broker.listEvents(agent)[0]).toMatchObject({
      id: liveEvent?.id,
      resourceRef: liveEvent?.resourceRef,
      resourceStatus: 'retired'
    })
    expect(() => broker.bindResourceRef(agent, liveEvent!.resourceRef))
      .toThrow(expect.objectContaining({ code: 'resource_ref_retired' }))
    await releaseTaskBinding()
  })

  it('defers provider disposal while a task retains the question-time resource', async () => {
    const release = defineCapability({
      id: 'document.release',
      version: '1',
      title: 'Release document',
      description: 'Requests retirement of the document resource.',
      audiences: ['ui', 'agent'],
      scope: 'resource',
      resourceKinds: ['document'],
      effect: 'compute',
      approval: 'none',
      concurrency: { revision: 'none', idempotency: 'required' },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ released: z.boolean() }).strict(),
      handler: async () => ({
        output: { released: true },
        changed: false,
        retireResource: 'defer-while-retained'
      })
    })
    const dispose = vi.fn()
    const broker = new CapabilityBroker(new CapabilityRegistry([readCapability(), mutationCapability(), release]))
    const handle = issueDocument(broker, agent, { audiences: ['ui', 'agent'], dispose })
    const observed = await broker.observe(agent, { resource: handle })
    const releaseTaskBinding = broker.retainResourceRefs(agent, [observed.resourceRef])

    await broker.invoke(ui, {
      actionId: 'document.release',
      invocationId: 'release-from-ui',
      resource: handle,
      input: {}
    })

    expect(dispose).not.toHaveBeenCalled()
    expect(broker.describeResourceRef(agent, observed.resourceRef)).toMatchObject({
      resourceRef: observed.resourceRef,
      resourceKind: 'document'
    })

    await releaseTaskBinding()
    expect(dispose).toHaveBeenCalledOnce()
    expect(() => broker.bindResourceRef(agent, observed.resourceRef))
      .toThrow(expect.objectContaining({ code: 'resource_ref_retired' }))
  })

  it('deduplicates 100 concurrent retries and rejects invocation ID reuse with different input', async () => {
    const gate = deferred()
    const handler = vi.fn(async (input: { text: string }) => {
      await gate.promise
      return { output: { saved: input.text }, changed: true, semanticRevision: '2' }
    })
    const broker = new CapabilityBroker(new CapabilityRegistry([mutationCapability(handler)]))
    const handle = issueDocument(broker)
    const request: CapabilityInvocationRequest = {
      actionId: 'document.annotation-upsert',
      invocationId: 'same-invocation',
      resource: handle,
      expectedRevision: '1',
      input: { text: 'same' }
    }

    const attempts = Array.from({ length: 100 }, () => broker.invoke(agent, request))
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
    await expect(broker.invoke(agent, {
      ...request,
      input: { text: 'different' }
    })).rejects.toSatisfy((error) => expectBrokerCode(error, 'idempotency_conflict'))

    gate.resolve()
    const results = await Promise.all(attempts)
    expect(results.filter((item) => !item.replayed)).toHaveLength(1)
    expect(results.filter((item) => item.replayed)).toHaveLength(99)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('characterizes invocation IDs as action-scoped for the same caller and workspace', async () => {
    const first = vi.fn(async () => ({ output: { action: 'first' } }))
    const second = vi.fn(async () => ({ output: { action: 'second' } }))
    const capability = (id: string, handler: typeof first) => defineCapability({
      id,
      version: '1',
      title: id,
      description: `Characterizes the current idempotency namespace for ${id}.`,
      audiences: ['ui'],
      scope: 'workspace',
      effect: 'compute',
      approval: 'none',
      concurrency: { revision: 'none', idempotency: 'required' },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ action: z.string() }).strict(),
      handler
    })
    const broker = new CapabilityBroker(new CapabilityRegistry([
      capability('fixture.action-first', first),
      capability('fixture.action-second', second)
    ]))

    await expect(broker.invoke(ui, {
      actionId: 'fixture.action-first',
      invocationId: 'same-command',
      input: {}
    })).resolves.toMatchObject({ output: { action: 'first' } })
    await expect(broker.invoke(ui, {
      actionId: 'fixture.action-second',
      invocationId: 'same-command',
      input: {}
    })).resolves.toMatchObject({ output: { action: 'second' } })

    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
  })

  it('serializes different invocation IDs on one resource and rechecks revision after acquiring execution', async () => {
    const gate = deferred()
    const handler = vi.fn(async (input: { text: string }) => {
      await gate.promise
      return { output: { saved: input.text }, changed: true, semanticRevision: '2' }
    })
    const broker = new CapabilityBroker(new CapabilityRegistry([mutationCapability(handler)]))
    const handle = issueDocument(broker)

    const first = broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'command-1',
      resource: handle,
      expectedRevision: '1',
      input: { text: 'first' }
    })
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce())
    const second = broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'command-2',
      resource: handle,
      expectedRevision: '1',
      input: { text: 'second' }
    })

    gate.resolve()
    await expect(first).resolves.toMatchObject({ afterRevision: '2' })
    await expect(second).rejects.toSatisfy((error) => expectBrokerCode(error, 'revision_conflict'))
    expect(handler).toHaveBeenCalledOnce()
  })

  it.each(['compute', 'workspace-write', 'external-write', 'destructive'] as const)(
    'serializes resource-scoped %s handlers',
    async (effect) => {
      const gate = deferred()
      const handler = vi.fn(async () => {
        await gate.promise
        return { output: { ok: true }, changed: false }
      })
      const capability = defineCapability({
        id: `fixture.serial-${effect}`,
        version: '1',
        title: `Serialize ${effect}`,
        description: `Verifies canonical resource serialization for ${effect}.`,
        audiences: ['ui'],
        scope: 'resource',
        resourceKinds: ['document'],
        effect,
        approval: 'none',
        concurrency: { revision: 'none', idempotency: 'required' },
        inputSchema: z.object({ command: z.number() }).strict(),
        outputSchema: z.object({ ok: z.boolean() }).strict(),
        handler
      })
      const broker = new CapabilityBroker(new CapabilityRegistry([capability]))
      const handle = issueDocument(broker, ui)

      const first = broker.invoke(ui, {
        actionId: `fixture.serial-${effect}`,
        invocationId: `${effect}-1`,
        resource: handle,
        input: { command: 1 }
      })
      const second = broker.invoke(ui, {
        actionId: `fixture.serial-${effect}`,
        invocationId: `${effect}-2`,
        resource: handle,
        input: { command: 2 }
      })

      await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce())
      gate.resolve()
      await expect(Promise.all([first, second])).resolves.toHaveLength(2)
      expect(handler).toHaveBeenCalledTimes(2)
    }
  )

  it('allows non-read operations on different resources to execute in parallel', async () => {
    const gate = deferred()
    const started: string[] = []
    const handler = vi.fn(async (input: { text: string }) => {
      started.push(input.text)
      await gate.promise
      return { output: { saved: input.text }, changed: true, semanticRevision: '2' }
    })
    const broker = new CapabilityBroker(new CapabilityRegistry([mutationCapability(handler)]))
    const firstResource = issueDocument(broker, agent, { resourceId: 'document-1' })
    const secondResource = issueDocument(broker, agent, { resourceId: 'document-2' })

    const first = broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'document-1-command',
      resource: firstResource,
      expectedRevision: '1',
      input: { text: 'document-1' }
    })
    const second = broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'document-2-command',
      resource: secondResource,
      expectedRevision: '1',
      input: { text: 'document-2' }
    })

    await vi.waitFor(() => expect(started).toHaveLength(2))
    gate.resolve()
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('uses one resource queue across UI and system handles for the same canonical resource', async () => {
    const gate = deferred()
    const handler = vi.fn(async (input: { text: string }) => {
      await gate.promise
      return { output: { saved: input.text }, changed: true, semanticRevision: '2' }
    })
    const broker = new CapabilityBroker(new CapabilityRegistry([
      readCapability(),
      mutationCapability(handler)
    ]))
    const uiHandle = issueDocument(broker, ui, { audiences: ['ui', 'agent', 'system'] })
    const observed = await broker.observe(ui, { resource: uiHandle })
    const systemHandle = broker.bindResourceRef(system, observed.resourceRef)

    const first = broker.invoke(ui, {
      actionId: 'document.annotation-upsert',
      invocationId: 'ui-command',
      resource: uiHandle,
      expectedRevision: '1',
      input: { text: 'ui' }
    })
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce())
    const second = broker.invoke(system, {
      actionId: 'document.annotation-upsert',
      invocationId: 'system-command',
      resource: systemHandle,
      expectedRevision: '1',
      input: { text: 'system' }
    })

    gate.resolve()
    await expect(first).resolves.toMatchObject({ afterRevision: '2' })
    await expect(second).rejects.toSatisfy((error) => expectBrokerCode(error, 'revision_conflict'))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not cache a failed invocation as a successful replay', async () => {
    let attempts = 0
    const handler = vi.fn(async (input: { text: string }) => {
      attempts += 1
      if (input.text === 'fail' && attempts === 1) throw new Error('expected failure')
      return { output: { saved: input.text }, changed: true, semanticRevision: '2' }
    })
    const broker = new CapabilityBroker(new CapabilityRegistry([mutationCapability(handler)]))
    const handle = issueDocument(broker)
    const failedRequest: CapabilityInvocationRequest = {
      actionId: 'document.annotation-upsert',
      invocationId: 'retry-after-failure',
      resource: handle,
      expectedRevision: '1',
      input: { text: 'fail' }
    }

    await expect(broker.invoke(agent, failedRequest))
      .rejects.toSatisfy((error) => expectBrokerCode(error, 'handler_failed'))
    await expect(broker.invoke(agent, failedRequest)).resolves.toMatchObject({
      changed: true,
      replayed: false,
      afterRevision: '2'
    })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('continues queued resource work after a handler rejection', async () => {
    const gate = deferred()
    const handler = vi.fn(async (input: { text: string }) => {
      if (input.text === 'fail') {
        await gate.promise
        throw new Error('expected failure')
      }
      return { output: { saved: input.text }, changed: true, semanticRevision: '2' }
    })
    const broker = new CapabilityBroker(new CapabilityRegistry([mutationCapability(handler)]))
    const handle = issueDocument(broker)
    const first = broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'failed-command',
      resource: handle,
      expectedRevision: '1',
      input: { text: 'fail' }
    })
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce())
    const second = broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'next-command',
      resource: handle,
      expectedRevision: '1',
      input: { text: 'next' }
    })

    gate.resolve()
    await expect(first).rejects.toSatisfy((error) => expectBrokerCode(error, 'handler_failed'))
    await expect(second).resolves.toMatchObject({ afterRevision: '2' })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('continues a resource queue after a revision conflict', async () => {
    const handler = vi.fn(async (input: { text: string }, context) => ({
      output: { saved: input.text },
      changed: true,
      semanticRevision: `${Number(context.resource?.semanticRevision ?? '0') + 1}`
    }))
    const broker = new CapabilityBroker(new CapabilityRegistry([mutationCapability(handler)]))
    const handle = issueDocument(broker)
    const first = await broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'first-revision',
      resource: handle,
      expectedRevision: '1',
      input: { text: 'first' }
    })
    await expect(broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'stale-revision',
      resource: handle,
      expectedRevision: '1',
      input: { text: 'stale' }
    })).rejects.toSatisfy((error) => expectBrokerCode(error, 'revision_conflict'))
    await expect(broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'fresh-revision',
      resource: first.resource,
      expectedRevision: '2',
      input: { text: 'fresh' }
    })).resolves.toMatchObject({ afterRevision: '3' })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('serializes compute retirement with queued non-read work and rejects stale resource state', async () => {
    const gate = deferred()
    const retireHandler = vi.fn(async () => {
      await gate.promise
      return {
        output: { released: true },
        changed: false,
        retireResource: true as const
      }
    })
    const queuedHandler = vi.fn(async (input: { text: string }) => ({
      output: { saved: input.text },
      changed: true,
      semanticRevision: '2'
    }))
    const retire = defineCapability({
      id: 'document.retire-compute',
      version: '1',
      title: 'Retire document',
      description: 'Retires a document from a resource-scoped compute action.',
      audiences: ['agent'],
      scope: 'resource',
      resourceKinds: ['document'],
      effect: 'compute',
      approval: 'none',
      concurrency: { revision: 'none', idempotency: 'required' },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ released: z.boolean() }).strict(),
      handler: retireHandler
    })
    const broker = new CapabilityBroker(new CapabilityRegistry([
      retire,
      mutationCapability(queuedHandler)
    ]))
    const handle = issueDocument(broker)

    const retirement = broker.invoke(agent, {
      actionId: 'document.retire-compute',
      invocationId: 'retire-command',
      resource: handle,
      input: {}
    })
    await vi.waitFor(() => expect(retireHandler).toHaveBeenCalledOnce())
    const queued = broker.invoke(agent, {
      actionId: 'document.annotation-upsert',
      invocationId: 'queued-command',
      resource: handle,
      expectedRevision: '1',
      input: { text: 'must-not-run' }
    })

    gate.resolve()
    await expect(retirement).resolves.toMatchObject({ changed: false })
    await expect(queued).rejects.toSatisfy((error) => expectBrokerCode(error, 'resource_unavailable'))
    expect(queuedHandler).not.toHaveBeenCalled()
  })
})
