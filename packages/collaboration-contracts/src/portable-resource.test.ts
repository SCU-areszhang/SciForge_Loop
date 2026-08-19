import { PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES } from '@sciforge/domain-sdk/portable-resource-references'
import {
  ARTIFACT_REFERENCE_KIND,
  CONTENT_CONTAINER_REFERENCE_KIND,
  CONTENT_FILE_REFERENCE_KIND,
  parsePortableArtifactReference,
  parsePortableContentContainerReference,
  parsePortableContentFileReference,
  toPortableArtifactReference,
  toPortableContentContainerReference,
  toPortableContentFileReference
// @ts-expect-error Test-only E contract bridge is runtime-typed by its source package.
} from '../../../test-fixtures/collaboration/e-content-space-portable.mjs'
import { describe, expect, it } from 'vitest'

import { resourceRefCreateMetadataSchema } from './entities.js'
import {
  deserializePortableResourceReferenceCarrier,
  PORTABLE_CONTENT_SPACE_REFERENCE_KINDS,
  portableResourceReferenceCarrierSchema,
  serializePortableResourceReferenceCarrier
} from './portable-resource.js'

const inputFile = Object.freeze({
  providerInstanceRef: 'opencontent.owner-input',
  fileId: 'opencontent_input_file_001'
})
const outputContainer = Object.freeze({
  providerInstanceRef: 'opencontent.worker-output',
  containerId: 'opencontent_output_container_001'
})
const uploadedMutableFile = Object.freeze({
  providerInstanceRef: 'opencontent.worker-output',
  fileId: 'opencontent_uploaded_mutable_file_001'
})
const artifactWithDigest = Object.freeze({
  providerInstanceRef: 'opencontent.worker-output',
  fileId: 'opencontent_uploaded_artifact_001',
  immutableVersionId: 'immutable_version_001',
  digest: Object.freeze({ algorithm: 'sha256' as const, value: 'f'.repeat(64) })
})

describe('R0 portable Content Space ResourceRef carrier', () => {
  it('pins the exact kind values exported by E instead of defining a parallel codec', () => {
    expect(PORTABLE_CONTENT_SPACE_REFERENCE_KINDS).toEqual([
      CONTENT_FILE_REFERENCE_KIND,
      CONTENT_CONTAINER_REFERENCE_KIND,
      ARTIFACT_REFERENCE_KIND
    ])
  })

  it('round-trips input file, output container, mutable upload, and artifact identities losslessly', () => {
    const cases = [
      [inputFile, toPortableContentFileReference, parsePortableContentFileReference],
      [outputContainer, toPortableContentContainerReference, parsePortableContentContainerReference],
      [uploadedMutableFile, toPortableContentFileReference, parsePortableContentFileReference],
      [artifactWithDigest, toPortableArtifactReference, parsePortableArtifactReference]
    ] as const

    for (const [canonicalValue, toPortable, parsePortable] of cases) {
      const envelope = toPortable(canonicalValue as never)
      const parsedCarrier = portableResourceReferenceCarrierSchema.parse(envelope)
      const stored = serializePortableResourceReferenceCarrier(parsedCarrier)
      const retrieved = deserializePortableResourceReferenceCarrier(stored)
      expect(retrieved).toEqual(envelope)
      expect(parsePortable(retrieved as never)).toEqual(canonicalValue)
    }
  })

  it('accepts a canonical portable reference without inventing openUrl', () => {
    const metadata = resourceRefCreateMetadataSchema.parse({
      provider: 'opencontent',
      externalId: inputFile.fileId,
      kind: 'content-space.file-reference',
      name: '真实输入文件',
      portableReference: toPortableContentFileReference(inputFile),
      version: '1'
    })
    expect(metadata.openUrl).toBeUndefined()
    expect(metadata.portableReference).toEqual(toPortableContentFileReference(inputFile))
  })

  it('accepts E provider/reference maximum lengths at the exact boundary', () => {
    const maximumFile = {
      providerInstanceRef: `p${'a'.repeat(255)}`,
      fileId: `f${'b'.repeat(255)}`
    }
    const envelope = toPortableContentFileReference(maximumFile)
    const canonical = serializePortableResourceReferenceCarrier(envelope)
    expect(new TextEncoder().encode(canonical).byteLength)
      .toBeLessThanOrEqual(PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES)
    expect(parsePortableContentFileReference(
      deserializePortableResourceReferenceCarrier(canonical)
    )).toEqual(maximumFile)
    expect(() => toPortableContentFileReference({
      ...maximumFile,
      fileId: `f${'b'.repeat(256)}`
    })).toThrow()
  })

  it('rejects unsupported versions, unknown kinds, missing carriers, and kind mismatches', () => {
    const fileEnvelope = toPortableContentFileReference(inputFile)
    expect(portableResourceReferenceCarrierSchema.safeParse({
      ...fileEnvelope,
      contractVersion: 2
    }).success).toBe(false)
    expect(portableResourceReferenceCarrierSchema.safeParse({
      ...fileEnvelope,
      kind: 'content-space.unknown-reference'
    }).success).toBe(false)
    expect(resourceRefCreateMetadataSchema.safeParse({
      provider: 'opencontent', externalId: inputFile.fileId,
      kind: 'content-space.file-reference', name: 'Missing carrier'
    }).success).toBe(false)
    expect(resourceRefCreateMetadataSchema.safeParse({
      provider: 'opencontent', externalId: inputFile.fileId,
      kind: 'content-space.container-reference', name: 'Mismatched carrier',
      portableReference: fileEnvelope
    }).success).toBe(false)
  })
})
