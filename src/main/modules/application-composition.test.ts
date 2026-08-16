import { describe, expect, it } from 'vitest'
import {
  CONTENT_SPACE_CAPABILITY_IDS,
  CONTENT_SPACE_PORTABLE_EXPORT_CONSUMER_ID,
  toPortableContentContainerReference
} from '@sciforge/domain-content-space/contract'
import { installedDomainPackages } from '../../shared/installed-domain-packages'
import type { AppCapabilityDependencies } from '../capabilities/app-registry'
import { CapabilityBroker } from '../capabilities/broker'
import {
  createApplicationCapabilityRegistry,
  createApplicationDomainCatalog
} from './application-composition'
import {
  MAIN_CAPABILITY_FACTORY_CONTRIBUTION_KIND,
  isAppCapabilityContributionFactory,
  listMainCapabilityDomainPolicies
} from './main-contributions'
import {
  PortableResourceReferenceService,
  composePortableResourceReferenceRegistries
} from './portable-resource-references'

describe('application domain composition', () => {
  it('composes explicit host-core and installed package capabilities through one catalog', () => {
    const catalog = createApplicationDomainCatalog({
      getUserDataDir: () => '/tmp/sciforge-domain-composition-test'
    })
    const packages = catalog.listPackages()

    expect(packages.map((definition) => definition.packageName)).toEqual([
      '@sciforge/core-controlled-process',
      '@sciforge/core-surface',
      '@sciforge/core-version-control',
      '@sciforge/core-workspace-preview',
      ...installedDomainPackages.definitions
        .filter((definition) => definition.entrypoints.some(({ process }) => process === 'main'))
        .map((definition) => definition.packageName)
    ])
    const factories = catalog.listContributions(
      MAIN_CAPABILITY_FACTORY_CONTRIBUTION_KIND,
      isAppCapabilityContributionFactory
    )
    expect(factories.every((contribution) =>
      contribution.owner.moduleId === contribution.value.moduleId
    )).toBe(true)

    const dependencies = unavailableDependencies()
    const expectedCapabilityIds = factories.flatMap(({ value }) =>
      value.createDefinitions(dependencies).map(({ descriptor }) => descriptor.id)
    ).sort()
    const registry = createApplicationCapabilityRegistry(catalog, dependencies)
    expect(registry.list().map((descriptor) => descriptor.id)).toEqual(
      expectedCapabilityIds
    )
    expect(listMainCapabilityDomainPolicies(catalog).map((policy) => policy.id)).toEqual(
      factories.map(({ value }) => value.policy.id)
    )
    const portableReferences = composePortableResourceReferenceRegistries(catalog)
    expect(portableReferences.codecs.list().map(({ codec }) => codec.kind)).toEqual([
      'content-space.artifact-reference',
      'content-space.container-reference',
      'content-space.file-reference'
    ])
    expect(portableReferences.resolvers.list().map(({ resolver }) => resolver.id)).toEqual([
      'content-space.provider-instance-authority'
    ])

    catalog.dispose()
  })

  it('routes a governed Content Space write through Broker, domain service, and the pinned Provider', async () => {
    const uploadBytes = new TextEncoder().encode('broker transfer bytes')
    const downloaded: Uint8Array[] = []
    const catalog = createApplicationDomainCatalog({
      getUserDataDir: () => '/private/tmp/sciforge-content-space-composition-test',
      fileTransfers: {
        openUploadSource: async ({ handle, callerId }) => {
          expect(handle).toBe('xfer_abcdefghijklmnopqrstuvwx')
          expect(callerId).toBe('content-space-composition-test')
          return {
            name: 'upload.bin',
            size: uploadBytes.byteLength,
            read: async ({ offset, length }) => uploadBytes.slice(offset, offset + length)
          }
        },
        openDownloadDestination: async ({ handle, callerId }) => {
          expect(handle).toBe('xfer_zyxwvutsrqponmlkjihgfedc')
          expect(callerId).toBe('content-space-composition-test')
          return {
            label: 'download.bin',
            write: async (chunk) => { downloaded.push(chunk) },
            commit: async () => undefined,
            abort: async () => undefined
          }
        }
      }
    })
    const broker = new CapabilityBroker(
      createApplicationCapabilityRegistry(catalog, unavailableDependencies())
    )
    const principal = {
      userId: '123e4567-e89b-42d3-a456-426614174000',
      assurance: 'local-selection' as const,
      deviceId: 'composition-test-device',
      identityVersion: 1
    }
    const caller = {
      audience: 'ui' as const,
      callerId: 'content-space-composition-test',
      principal,
      approvals: []
    }
    const instances = await broker.invoke(caller, {
      actionId: CONTENT_SPACE_CAPABILITY_IDS.listProviderInstances,
      input: {}
    })
    expect(instances.output).toEqual({
      items: [{
        providerInstanceRef: 'sciforge-content-space-local',
        label: 'Local Content Space'
      }]
    })
    const containers = await broker.invoke(caller, {
      actionId: CONTENT_SPACE_CAPABILITY_IDS.listContainers,
      input: {
        providerInstanceRef: 'sciforge-content-space-local',
        page: { limit: 20 }
      }
    })
    const root = (containers.output as {
      items: Array<{ reference: { providerInstanceRef: string; containerId: string } }>
    }).items[0]!.reference
    const portableRegistries = composePortableResourceReferenceRegistries(catalog)
    const portableResources = new PortableResourceReferenceService(
      broker,
      portableRegistries.codecs,
      portableRegistries.resolvers,
      () => principal
    )
    await expect(portableResources.materialize(
      toPortableContentContainerReference({
        ...root,
        providerInstanceRef: 'provider-instance-unknown'
      }),
      caller
    )).rejects.toMatchObject({ code: 'unknown_authority' })
    const portableRoot = toPortableContentContainerReference(root)
    const materializedRoot = await portableResources.materialize(portableRoot, caller)
    expect(materializedRoot.resourceKind).toBe('content-space.container')
    expect(await portableResources.export(caller, {
      resourceRef: materializedRoot.resourceRef,
      consumerId: CONTENT_SPACE_PORTABLE_EXPORT_CONSUMER_ID
    })).toEqual(portableRoot)
    const invocationId = 'content_space_create_folder_0001'
    const created = await broker.invoke({
      ...caller,
      approvals: [{
        actionId: CONTENT_SPACE_CAPABILITY_IDS.createFolder,
        invocationId,
        mode: 'confirmation' as const
      }]
    }, {
      actionId: CONTENT_SPACE_CAPABILITY_IDS.createFolder,
      invocationId,
      input: { parent: root, name: 'Broker-created folder' }
    })
    expect(created.output).toMatchObject({
      invocationId,
      reference: { providerInstanceRef: 'sciforge-content-space-local' }
    })
    const entries = await broker.invoke(caller, {
      actionId: CONTENT_SPACE_CAPABILITY_IDS.listEntries,
      input: { parent: root, page: { limit: 20 } }
    })
    expect(entries.output).toMatchObject({
      items: [{ kind: 'container', label: 'Broker-created folder' }]
    })
    const uploadInvocationId = 'content_space_upload_new_0001'
    const uploaded = await broker.invoke({
      ...caller,
      approvals: [{
        actionId: CONTENT_SPACE_CAPABILITY_IDS.uploadNew,
        invocationId: uploadInvocationId,
        mode: 'confirmation' as const
      }]
    }, {
      actionId: CONTENT_SPACE_CAPABILITY_IDS.uploadNew,
      invocationId: uploadInvocationId,
      input: {
        parent: root,
        name: 'upload.bin',
        sourceHandle: 'xfer_abcdefghijklmnopqrstuvwx'
      }
    })
    const liveReference = (uploaded.output as {
      reference: { providerInstanceRef: string; fileId: string }
    }).reference
    const immutable = await broker.invoke(caller, {
      actionId: CONTENT_SPACE_CAPABILITY_IDS.observeImmutableVersion,
      input: { reference: liveReference }
    })
    expect(immutable.output).toMatchObject({ proven: true })
    const downloadInvocationId = 'content_space_download_0001'
    await broker.invoke({
      ...caller,
      approvals: [{
        actionId: CONTENT_SPACE_CAPABILITY_IDS.download,
        invocationId: downloadInvocationId,
        mode: 'confirmation' as const
      }]
    }, {
      actionId: CONTENT_SPACE_CAPABILITY_IDS.download,
      invocationId: downloadInvocationId,
      input: {
        reference: liveReference,
        destinationHandle: 'xfer_zyxwvutsrqponmlkjihgfedc'
      }
    })
    expect(Buffer.concat(downloaded).toString('utf8')).toBe('broker transfer bytes')
    catalog.dispose()
  })
})

function unavailableDependencies(): AppCapabilityDependencies {
  const unavailable = () => undefined
  return new Proxy({}, {
    get: () => unavailable
  }) as AppCapabilityDependencies
}
