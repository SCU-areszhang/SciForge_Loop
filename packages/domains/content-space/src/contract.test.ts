import { describe, expect, it } from 'vitest'
import {
  CONTENT_SPACE_CAPABILITY_IDS,
  artifactReferenceSchema,
  contentContainerReferenceSchema,
  contentFileReferenceSchema,
  contentSpaceListEntriesInputSchema,
  contentSpaceErrorSchema,
  issueArtifactReference,
  parsePortableArtifactReference,
  parsePortableContentContainerReference,
  parsePortableContentFileReference,
  toPortableArtifactReference,
  toPortableContentContainerReference,
  toPortableContentFileReference
} from './contract.js'

const providerInstanceRef = 'provider-instance-alpha'

describe('Content Space public contract', () => {
  it('round trips strict container, live file, and fixed artifact references', () => {
    const container = { providerInstanceRef, containerId: 'container_01' }
    const file = { providerInstanceRef, fileId: 'file_01' }
    const artifact = {
      providerInstanceRef,
      fileId: 'file_01',
      immutableVersionId: 'version_01',
      digest: { algorithm: 'sha256' as const, value: 'a'.repeat(64) }
    }

    expect(parsePortableContentContainerReference(
      toPortableContentContainerReference(container)
    )).toEqual(container)
    expect(parsePortableContentFileReference(toPortableContentFileReference(file))).toEqual(file)
    expect(parsePortableArtifactReference(toPortableArtifactReference(artifact))).toEqual(artifact)
  })

  it('keeps endpoints, paths, display data, access bindings, and Broker handles out of references', () => {
    for (const extra of [
      { endpoint: 'https://provider.example' },
      { path: '/folder/file' },
      { displayName: 'Report' },
      { credential: 'secret' },
      { connectionId: 'connection_01' },
      { resourceRef: 'res_abcdefghijklmnopqrstuv' }
    ]) {
      expect(contentContainerReferenceSchema.safeParse({
        providerInstanceRef,
        containerId: 'container_01',
        ...extra
      }).success).toBe(false)
    }
    expect(contentFileReferenceSchema.safeParse({
      providerInstanceRef,
      fileId: 'cap_abcdefghijklmnopqrstuv'
    }).success).toBe(false)
    expect(artifactReferenceSchema.safeParse({
      providerInstanceRef,
      fileId: 'file_01'
    }).success).toBe(false)
  })

  it('issues an ArtifactReference only from complete immutable-version proof', () => {
    const proof = {
      reference: { providerInstanceRef, fileId: 'file_01' },
      immutableVersionId: 'version_01',
      immutableIdentity: true,
      retained: true,
      versionSpecificRetrieval: true
    } as const
    expect(issueArtifactReference(proof)).toEqual({
      providerInstanceRef,
      fileId: 'file_01',
      immutableVersionId: 'version_01'
    })
    for (const field of ['immutableIdentity', 'retained', 'versionSpecificRetrieval'] as const) {
      expect(() => issueArtifactReference({ ...proof, [field]: false })).toThrow()
    }
  })

  it('prevents blind retry for an unknown outcome', () => {
    expect(contentSpaceErrorSchema.safeParse({
      code: 'outcome_unknown',
      message: 'The Provider cannot prove whether the create completed.',
      retry: 'safe-with-same-invocation'
    }).success).toBe(false)
    expect(contentSpaceErrorSchema.parse({
      code: 'outcome_unknown',
      message: 'The Provider cannot prove whether the create completed.',
      retry: 'never'
    }).code).toBe('outcome_unknown')
  })

  it('keeps excluded mutable lifecycle and collaboration operations out of V1', () => {
    const publicCapabilityIds = Object.values(CONTENT_SPACE_CAPABILITY_IDS).join('\n')
    for (const excluded of [
      'overwrite', 'update', 'move', 'rename', 'delete', 'share', 'acl', 'member', 'rollback'
    ]) {
      expect(publicCapabilityIds).not.toContain(excluded)
    }
  })

  it('does not accept caller readiness promotion or extension routing hints', () => {
    const input = {
      parent: {
        providerInstanceRef,
        containerId: 'report.pdf'
      },
      page: { limit: 20 }
    }
    expect(contentSpaceListEntriesInputSchema.parse(input)).toEqual(input)
    expect(contentSpaceListEntriesInputSchema.safeParse({
      ...input,
      readiness: 'production_ready'
    }).success).toBe(false)
    expect(contentSpaceListEntriesInputSchema.safeParse({
      ...input,
      providerKind: 'extension-router'
    }).success).toBe(false)
  })
})
