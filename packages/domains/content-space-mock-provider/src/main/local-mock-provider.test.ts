import { describe, expect, it } from 'vitest'
import {
  ContentSpaceOperationError,
  issueArtifactReference,
  type ContentSpaceProviderOperationContext
} from '@sciforge/domain-content-space/contract'
import {
  LOCAL_MOCK_PROVIDER_INSTANCE_REF,
  LOCAL_MOCK_PROVIDER_KIND,
  domainPackageDefinition
} from '../definition.js'
import { createDomainMainEntry } from './index.js'
import { createLocalMockContentSpaceProvider } from './local-mock-provider.js'

const now = new Date('2026-08-16T10:00:00.000Z')
const principal = Object.freeze({
  userId: '123e4567-e89b-42d3-a456-426614174000',
  assurance: 'local-selection' as const,
  deviceId: 'fixture-device',
  identityVersion: 1
})

function context(invocationId?: string): ContentSpaceProviderOperationContext {
  return Object.freeze({
    principal,
    providerInstanceRef: LOCAL_MOCK_PROVIDER_INSTANCE_REF,
    deadlineAt: '2026-08-16T11:00:00.000Z',
    ...(invocationId ? { invocationId } : {})
  })
}

function expectCode(code: string) {
  return (error: unknown) => error instanceof ContentSpaceOperationError &&
    error.detail.code === code
}

describe('local mock ContentSpaceProvider', () => {
  it('discovers capabilities and navigates only direct children of an explicit container', async () => {
    const provider = createLocalMockContentSpaceProvider({
      providerInstanceRef: LOCAL_MOCK_PROVIDER_INSTANCE_REF,
      now: () => now
    })
    const capabilities = await provider.describeCapabilities(context())
    expect(capabilities.map(({ operation }) => operation)).toEqual([
      'list-containers',
      'list-entries',
      'observe-entry',
      'create-folder',
      'upload-new',
      'download',
      'portal-target',
      'observe-immutable-version'
    ])
    const containers = await provider.listContainers({ context: context(), page: { limit: 20 } })
    expect(containers.items).toHaveLength(1)
    const root = containers.items[0]!.reference
    const parent = await provider.createFolder({
      context: context('create_parent_0001') as ReturnType<typeof context> & { invocationId: string },
      parent: root,
      name: 'Parent'
    })
    await provider.createFolder({
      context: context('create_child_00001') as ReturnType<typeof context> & { invocationId: string },
      parent: parent.reference,
      name: 'Nested'
    })
    expect((await provider.listEntries({
      context: context(),
      parent: root,
      page: { limit: 20 }
    })).items.map(({ label }) => label)).toEqual(['Parent'])
    expect((await provider.listEntries({
      context: context(),
      parent: parent.reference,
      page: { limit: 20 }
    })).items.map(({ label }) => label)).toEqual(['Nested'])
  })

  it('creates once, uploads bounded bytes, downloads through a sink, and proves a fixed version', async () => {
    const provider = createLocalMockContentSpaceProvider({
      providerInstanceRef: LOCAL_MOCK_PROVIDER_INSTANCE_REF,
      now: () => now
    })
    const root = (await provider.listContainers({
      context: context(),
      page: { limit: 10 }
    })).items[0]!.reference
    const bytes = new TextEncoder().encode('provider-neutral content')
    const uploadInput = {
      context: context('upload_report_0001') as ReturnType<typeof context> & { invocationId: string },
      parent: root,
      name: 'report.bin',
      source: {
        size: bytes.byteLength,
        read: async ({ offset, length }: Readonly<{ offset: number; length: number }>) =>
          bytes.slice(offset, offset + length)
      }
    }
    const uploaded = await provider.uploadNewFile(uploadInput)
    expect(await provider.uploadNewFile(uploadInput)).toEqual(uploaded)

    const observation = await provider.observeImmutableVersion({
      context: context(),
      reference: uploaded.reference
    })
    expect(observation.proven).toBe(true)
    if (!observation.proven) throw new Error('Expected immutable proof.')
    const artifact = issueArtifactReference(observation.proof)
    const chunks: Uint8Array[] = []
    let committed = false
    const receipt = await provider.downloadFile({
      context: context('download_report_01') as ReturnType<typeof context> & { invocationId: string },
      reference: artifact,
      destination: {
        write: async (chunk) => { chunks.push(chunk) },
        commit: async () => { committed = true },
        abort: async () => { throw new Error('Unexpected abort.') }
      }
    })
    expect(committed).toBe(true)
    expect(Buffer.concat(chunks).toString('utf8')).toBe('provider-neutral content')
    expect(receipt.bytesWritten).toBe(bytes.byteLength)
    expect(receipt.digest).toEqual(observation.proof.digest)
  })

  it('returns typed collision/cross-instance errors and a safe expiring portal target', async () => {
    const provider = createLocalMockContentSpaceProvider({
      providerInstanceRef: LOCAL_MOCK_PROVIDER_INSTANCE_REF,
      now: () => now
    })
    const root = (await provider.listContainers({
      context: context(), page: { limit: 10 }
    })).items[0]!.reference
    await provider.createFolder({
      context: context('create_collision_1') as ReturnType<typeof context> & { invocationId: string },
      parent: root,
      name: 'Existing'
    })
    await expect(provider.createFolder({
      context: context('create_collision_2') as ReturnType<typeof context> & { invocationId: string },
      parent: root,
      name: 'Existing'
    })).rejects.toSatisfy(expectCode('conflict'))
    await expect(provider.listEntries({
      context: context(),
      parent: { ...root, providerInstanceRef: 'another-provider-instance' },
      page: { limit: 10 }
    })).rejects.toSatisfy(expectCode('invalid_target'))

    const target = await provider.resolvePortalTarget({ context: context(), reference: root })
    expect(new URL(target.url)).toMatchObject({ protocol: 'https:', hostname: 'content-space.invalid' })
    expect(target.url).not.toMatch(/token|credential|secret/iu)
    expect(target.expiresAt).toBe('2026-08-16T10:01:00.000Z')
  })

  it('registers one factory and one explicit instance through the conventional main entry', () => {
    const entry = createDomainMainEntry({
      getUserDataDir: () => '/private/tmp/sciforge-content-space-mock-test',
      defineCapability: (value) => value
    })
    expect(entry.definition).toBe(domainPackageDefinition)
    expect(entry.contributions.map(({ kind }) => kind)).toEqual([
      'main.content-space-provider-factory',
      'main.provider-instance-directory-entry'
    ])
    expect(JSON.stringify(entry.contributions)).toContain(LOCAL_MOCK_PROVIDER_KIND)
    expect(domainPackageDefinition.entrypoints).toHaveLength(1)
    expect(domainPackageDefinition.entrypoints[0]?.process).toBe('main')
  })

  it('requires bounded invocation identity and cancellation before a create-only mutation', async () => {
    const provider = createLocalMockContentSpaceProvider({
      providerInstanceRef: LOCAL_MOCK_PROVIDER_INSTANCE_REF,
      now: () => now
    })
    const root = (await provider.listContainers({
      context: context(), page: { limit: 10 }
    })).items[0]!.reference
    await expect(provider.createFolder({
      context: context('short') as ReturnType<typeof context> & { invocationId: string },
      parent: root,
      name: 'Rejected'
    })).rejects.toSatisfy(expectCode('invalid_input'))

    const controller = new AbortController()
    controller.abort()
    await expect(provider.uploadNewFile({
      context: {
        ...context('cancelled_upload_01'),
        invocationId: 'cancelled_upload_01',
        signal: controller.signal
      },
      parent: root,
      name: 'cancelled.bin',
      source: { size: 1, read: async () => new Uint8Array([1]) }
    })).rejects.toSatisfy(expectCode('cancelled'))
    expect((await provider.listEntries({
      context: context(), parent: root, page: { limit: 10 }
    })).items).toEqual([])
  })

  it('returns outcome_unknown when an invocation identity is reused for another write', async () => {
    const provider = createLocalMockContentSpaceProvider({
      providerInstanceRef: LOCAL_MOCK_PROVIDER_INSTANCE_REF,
      now: () => now
    })
    const root = (await provider.listContainers({
      context: context(), page: { limit: 10 }
    })).items[0]!.reference
    const writeContext = context('reused_invocation_01') as ReturnType<typeof context> & {
      invocationId: string
    }
    await provider.createFolder({ context: writeContext, parent: root, name: 'First' })
    await expect(provider.createFolder({
      context: writeContext,
      parent: root,
      name: 'Second'
    })).rejects.toSatisfy(expectCode('outcome_unknown'))
    expect((await provider.listEntries({
      context: context(), parent: root, page: { limit: 10 }
    })).items.map(({ label }) => label)).toEqual(['First'])
  })
})
