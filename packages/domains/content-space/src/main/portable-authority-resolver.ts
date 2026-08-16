import type {
  PortableResourceAuthorityResolver,
  PortableResourceIdentity,
  PortableResourceResolution
} from '@sciforge/domain-sdk/portable-resource-references'
import type { DomainMainProviderInstanceDirectorySource } from '@sciforge/domain-sdk/provider-composition'
import {
  ARTIFACT_RESOURCE_KIND,
  CONTENT_CONTAINER_RESOURCE_KIND,
  CONTENT_FILE_RESOURCE_KIND,
  CONTENT_SPACE_CAPABILITY_IDS,
  CONTENT_SPACE_PORTABLE_AUTHORITY_RESOLVER_ID,
  CONTENT_SPACE_PORTABLE_EXPORT_CONSUMER_ID,
  artifactReferenceSchema,
  contentContainerReferenceSchema,
  contentFileReferenceSchema,
  type ArtifactReference,
  type ContentContainerReference,
  type ContentFileReference
} from '../contract.js'
import type { ContentSpaceService } from './service.js'

type ContentReference = ContentContainerReference | ContentFileReference | ArtifactReference

export function createContentSpacePortableAuthorityResolver(input: Readonly<{
  instances: DomainMainProviderInstanceDirectorySource
  getService: () => ContentSpaceService
}>): PortableResourceAuthorityResolver {
  return Object.freeze({
    id: CONTENT_SPACE_PORTABLE_AUTHORITY_RESOLVER_ID,
    lookupAuthority: (reference) => input.instances.resolve(reference)
      ? Object.freeze({
          reference,
          resolverId: CONTENT_SPACE_PORTABLE_AUTHORITY_RESOLVER_ID
        })
      : undefined,
    resolve: async ({ envelope, identity, resourceKind, principal, signal }) => {
      const reference = contentReference(resourceKind, envelope.authority, identity)
      const observation = await input.getService().observeEntry(reference, { principal, signal })
      return resolution(reference, resourceKind, observation)
    }
  })
}

function contentReference(
  resourceKind: string,
  providerInstanceRef: string,
  identity: unknown
): ContentReference {
  const candidate = { providerInstanceRef, ...identityRecord(identity) }
  if (resourceKind === CONTENT_CONTAINER_RESOURCE_KIND) {
    return contentContainerReferenceSchema.parse(candidate)
  }
  if (resourceKind === CONTENT_FILE_RESOURCE_KIND) {
    return contentFileReferenceSchema.parse(candidate)
  }
  if (resourceKind === ARTIFACT_RESOURCE_KIND) {
    return artifactReferenceSchema.parse(candidate)
  }
  throw new TypeError('The Content Space portable resource kind is unsupported.')
}

function resolution(
  reference: ContentReference,
  resourceKind: string,
  observation: Awaited<ReturnType<ContentSpaceService['observeEntry']>>
): PortableResourceResolution {
  const identity = portableIdentity(reference)
  const identityKey = 'containerId' in reference
    ? reference.containerId
    : 'immutableVersionId' in reference
      ? `${reference.fileId}:${reference.immutableVersionId}`
      : reference.fileId
  return Object.freeze({
    registration: Object.freeze({
      resourceId: `content-space:${reference.providerInstanceRef}:${resourceKind}:${identityKey}`,
      resourceKind,
      semanticRevision: 'immutableVersionId' in reference
        ? reference.immutableVersionId
        : `live:${identityKey}`,
      audiences: Object.freeze(['ui', 'agent', 'system'] as const),
      observe: async () => Object.freeze({
        state: {
          reference,
          entry: observation.entry,
          capabilities: observation.capabilities
        },
        semanticRevision: 'immutableVersionId' in reference
          ? reference.immutableVersionId
          : `live:${identityKey}`,
        operationIds: Object.freeze([
          CONTENT_SPACE_CAPABILITY_IDS.observeEntry,
          ...('containerId' in reference
            ? [CONTENT_SPACE_CAPABILITY_IDS.listEntries]
            : [
                CONTENT_SPACE_CAPABILITY_IDS.download,
                CONTENT_SPACE_CAPABILITY_IDS.observeImmutableVersion
              ])
        ])
      })
    }),
    exportProjection: Object.freeze({
      consumerIds: Object.freeze([CONTENT_SPACE_PORTABLE_EXPORT_CONSUMER_ID]),
      project: () => identity
    })
  })
}

function portableIdentity(reference: ContentReference): PortableResourceIdentity {
  if ('containerId' in reference) return Object.freeze({ containerId: reference.containerId })
  if ('immutableVersionId' in reference) {
    return Object.freeze({
      fileId: reference.fileId,
      immutableVersionId: reference.immutableVersionId,
      ...(reference.digest ? { digest: reference.digest } : {})
    })
  }
  return Object.freeze({ fileId: reference.fileId })
}

function identityRecord(identity: unknown): Record<string, unknown> {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    throw new TypeError('Content Space portable identity is invalid.')
  }
  return identity as Record<string, unknown>
}
