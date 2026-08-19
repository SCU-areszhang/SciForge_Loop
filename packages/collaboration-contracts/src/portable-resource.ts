import {
  PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION,
  parsePortableResourceReference,
  portableResourceAuthorityReferenceSchema,
  serializePortableResourceReference,
  type PortableResourceReferenceEnvelope
} from '@sciforge/domain-sdk/portable-resource-references'
import { z } from 'zod'

export const PORTABLE_RESOURCE_CARRIER_SCHEMA_VERSION = '1.0.0' as const

/**
 * R0 Content Space kinds owned by E's public contract. The contract tests and
 * generated fixtures compare these values against
 * @sciforge/domain-content-space/contract so drift fails the release gate.
 */
export const PORTABLE_CONTENT_SPACE_REFERENCE_KINDS = Object.freeze([
  'content-space.file-reference',
  'content-space.container-reference',
  'content-space.artifact-reference'
] as const)

export const portableContentSpaceReferenceKindSchema = z.enum(
  PORTABLE_CONTENT_SPACE_REFERENCE_KINDS
)

/**
 * Lossless wire carrier for E's canonical generic portable-reference
 * envelope. Kind and authority validation reuse E's public Zod schemas, while
 * full identity, size, depth and canonical-value validation is delegated to
 * E's exact parsePortableResourceReference implementation.
 */
export const portableResourceReferenceCarrierSchema = z.object({
  contractVersion: z.literal(PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION),
  kind: portableContentSpaceReferenceKindSchema,
  authority: portableResourceAuthorityReferenceSchema,
  identity: z.record(z.string(), z.json())
}).strict().superRefine((input, context) => {
  try {
    parsePortableResourceReference(input)
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error
        ? `Portable resource reference rejected: ${error.name}`
        : 'Portable resource reference rejected.'
    })
  }
})

export type PortableResourceReferenceCarrier = z.infer<
  typeof portableResourceReferenceCarrierSchema
>

export function parsePortableResourceReferenceCarrier(
  input: unknown
): PortableResourceReferenceCarrier {
  const structurallyValidated = portableResourceReferenceCarrierSchema.parse(input)
  return parsePortableResourceReference(
    structurallyValidated
  ) as PortableResourceReferenceCarrier
}

export function serializePortableResourceReferenceCarrier(input: unknown): string {
  return serializePortableResourceReference(parsePortableResourceReferenceCarrier(input))
}

export function deserializePortableResourceReferenceCarrier(
  input: string
): PortableResourceReferenceCarrier {
  return parsePortableResourceReferenceCarrier(parsePortableResourceReference(input))
}

export function isPortableReferenceKind(kind: string): boolean {
  return portableContentSpaceReferenceKindSchema.safeParse(kind).success
}

export type { PortableResourceReferenceEnvelope }
