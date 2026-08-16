import {
  MAIN_PORTABLE_AUTHORITY_RESOLVER_CONTRIBUTION_KIND,
  MAIN_PORTABLE_RESOURCE_CODEC_CONTRIBUTION_KIND,
  PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION,
  PortableResourceReferenceError,
  canonicalPortableJson,
  isPortableResourceAuthorityResolver,
  isPortableResourceReferenceCodec,
  parsePortableResourceReference,
  validatePortableAuthorityReference,
  validatePortableIdentity,
  validatePortableKind,
  type PortableResourceAuthorityResolver,
  type PortableResourceExportProjection,
  type PortableResourceIdentity,
  type PortableResourceLocalRegistration,
  type PortableResourceReferenceCodec,
  type PortableResourceReferenceEnvelope,
  type TrustedPortableResourceAuthority
} from '@sciforge/domain-sdk/portable-resource-references'
import { principalSnapshotSchema, type PrincipalSnapshot } from '@sciforge/domain-sdk/principal'
import {
  capabilityCallerContextSchema,
  type CapabilityCallerContextInput,
  type CapabilityResourceHandle
} from '../../shared/capability-broker'
import { CapabilityBroker } from '../capabilities/broker'
import type { CapabilityResourceRegistration } from '../capabilities/registry'
import { DomainModuleCatalog } from './catalog'

type OwnedCodec = Readonly<{
  ownerId: string
  contributionId: string
  codec: PortableResourceReferenceCodec
}>

type OwnedResolver = Readonly<{
  ownerId: string
  contributionId: string
  resolver: PortableResourceAuthorityResolver
}>

export class PortableResourceCodecRegistry {
  readonly #byKind = new Map<string, OwnedCodec>()

  constructor(codecs: readonly OwnedCodec[] = []) {
    for (const owned of codecs) {
      const kind = validatePortableKind(owned.codec.kind)
      if (this.#byKind.has(kind)) {
        throw new PortableResourceReferenceError(
          'duplicate_codec',
          'Portable resource reference codec ownership conflicts.'
        )
      }
      this.#byKind.set(kind, Object.freeze({ ...owned }))
    }
  }

  require(kind: string): OwnedCodec {
    const codec = this.#byKind.get(kind)
    if (!codec) {
      throw new PortableResourceReferenceError(
        'unknown_kind',
        'Portable resource reference kind is not registered.'
      )
    }
    return codec
  }

  list(): readonly OwnedCodec[] {
    return Object.freeze([...this.#byKind.values()].sort((left, right) =>
      left.codec.kind.localeCompare(right.codec.kind)
    ))
  }
}

export class PortableAuthorityResolverRegistry {
  readonly #byId = new Map<string, OwnedResolver>()

  constructor(resolvers: readonly OwnedResolver[] = []) {
    for (const owned of resolvers) {
      const id = validatePortableKind(owned.resolver.id)
      if (this.#byId.has(id)) {
        throw new PortableResourceReferenceError(
          'duplicate_resolver',
          'Portable resource authority resolver ownership conflicts.'
        )
      }
      this.#byId.set(id, Object.freeze({ ...owned }))
    }
  }

  lookup(reference: string): Readonly<{
    authority: TrustedPortableResourceAuthority
    resolver: OwnedResolver
  }> {
    const matches: Array<{
      authority: TrustedPortableResourceAuthority
      resolver: OwnedResolver
    }> = []
    for (const resolver of this.#byId.values()) {
      let authority: TrustedPortableResourceAuthority | undefined
      try {
        authority = resolver.resolver.lookupAuthority(reference)
      } catch {
        throw new PortableResourceReferenceError(
          'unknown_authority',
          'Portable resource reference authority is not trusted locally.'
        )
      }
      if (authority) matches.push({ authority, resolver })
    }
    if (matches.length === 0) {
      throw new PortableResourceReferenceError(
        'unknown_authority',
        'Portable resource reference authority is not trusted locally.'
      )
    }
    if (matches.length !== 1) {
      throw new PortableResourceReferenceError(
        'duplicate_resolver',
        'Portable resource authority ownership conflicts.'
      )
    }
    const match = matches[0]!
    const authority = trustedAuthority(match.authority, reference)
    if (authority.resolverId !== match.resolver.resolver.id) {
      throw new PortableResourceReferenceError(
        'unknown_authority',
        'Portable resource authority resolver binding is invalid.'
      )
    }
    return Object.freeze({ authority, resolver: match.resolver })
  }

  list(): readonly OwnedResolver[] {
    return Object.freeze([...this.#byId.values()].sort((left, right) =>
      left.resolver.id.localeCompare(right.resolver.id)
    ))
  }
}

export function composePortableResourceReferenceRegistries(
  catalog: DomainModuleCatalog
): Readonly<{
  codecs: PortableResourceCodecRegistry
  resolvers: PortableAuthorityResolverRegistry
}> {
  const codecs = catalog.listContributions(
    MAIN_PORTABLE_RESOURCE_CODEC_CONTRIBUTION_KIND,
    (value, metadata): value is PortableResourceReferenceCodec =>
      isPortableResourceReferenceCodec(value) &&
      matchesCodecContract(metadata.contract, value)
  ).map((contribution) => ({
    ownerId: contribution.owner.moduleId,
    contributionId: contribution.declaration.id,
    codec: contribution.value
  }))
  const resolvers = catalog.listContributions(
    MAIN_PORTABLE_AUTHORITY_RESOLVER_CONTRIBUTION_KIND,
    (value, metadata): value is PortableResourceAuthorityResolver =>
      isPortableResourceAuthorityResolver(value) &&
      matchesResolverContract(metadata.contract, value)
  ).map((contribution) => ({
    ownerId: contribution.owner.moduleId,
    contributionId: contribution.declaration.id,
    resolver: contribution.value
  }))
  return Object.freeze({
    codecs: new PortableResourceCodecRegistry(codecs),
    resolvers: new PortableAuthorityResolverRegistry(resolvers)
  })
}

export type PortableResourceMaterializationResult = Readonly<{
  resource: CapabilityResourceHandle
  resourceRef: string
  resourceKind: string
}>

type ExportBinding = Readonly<{
  authority: string
  codec: OwnedCodec
  projection: PortableResourceExportProjection
  principal: PrincipalSnapshot
}>

export class PortableResourceReferenceService {
  readonly #exportsByResourceRef = new Map<string, ExportBinding>()

  constructor(
    readonly broker: CapabilityBroker,
    readonly codecs: PortableResourceCodecRegistry,
    readonly resolvers: PortableAuthorityResolverRegistry,
    readonly getPrincipal: () => PrincipalSnapshot | undefined
  ) {}

  async materialize(
    rawEnvelope: string | unknown,
    rawCaller: CapabilityCallerContextInput,
    options: Readonly<{ signal?: AbortSignal }> = {}
  ): Promise<PortableResourceMaterializationResult> {
    // Ordered fail-closed stages: envelope -> version -> kind -> codec identity.
    const envelope = parsePortableResourceReference(rawEnvelope)
    const codec = this.codecs.require(envelope.kind)
    const identity = decodeCanonicalIdentity(codec.codec, envelope.identity)

    // Authority lookup is deliberately synchronous and local.
    const authorityResolution = this.resolvers.lookup(envelope.authority)
    const authority = authorityResolution.authority

    // The principal is Host-asserted; caller input cannot choose or replace it.
    const principal = requirePrincipal(this.getPrincipal())
    const resolver = authorityResolution.resolver
    const caller = capabilityCallerContextSchema.parse({ ...rawCaller, principal })

    let resolution
    try {
      resolution = await resolver.resolver.resolve({
        envelope,
        identity,
        resourceKind: codec.codec.resourceKind,
        authority,
        principal,
        ...(options.signal ? { signal: options.signal } : {})
      })
    } catch (error) {
      if (error instanceof PortableResourceReferenceError) throw error
      throw new PortableResourceReferenceError(
        'resolution_rejected',
        'Portable resource reauthorization was rejected.'
      )
    }

    const registration = validateResolution(resolution, codec.codec.resourceKind)
    const projection = resolution.exportProjection
      ? validateExportProjection(resolution.exportProjection)
      : undefined
    let issued
    try {
      issued = this.broker.issueResource(caller, toBrokerRegistration(registration))
    } catch {
      throw new PortableResourceReferenceError(
        'invalid_resolution',
        'Portable resource resolver returned an invalid registration.'
      )
    }
    if (projection) {
      const previous = this.#exportsByResourceRef.get(issued.resourceRef)
      if (previous &&
        (previous.authority !== envelope.authority || previous.codec.codec.kind !== codec.codec.kind)) {
        this.#exportsByResourceRef.delete(issued.resourceRef)
        throw new PortableResourceReferenceError(
          'invalid_resolution',
          'Portable resource resolver returned conflicting export ownership.'
        )
      }
      this.#exportsByResourceRef.set(issued.resourceRef, Object.freeze({
        authority: envelope.authority,
        codec,
        projection,
        principal
      }))
    } else {
      this.#exportsByResourceRef.delete(issued.resourceRef)
    }
    return Object.freeze({
      resource: issued.resource,
      resourceRef: issued.resourceRef,
      resourceKind: codec.codec.resourceKind
    })
  }

  async export(
    rawCaller: CapabilityCallerContextInput,
    input: Readonly<{ resourceRef: string; consumerId: string }>
  ): Promise<PortableResourceReferenceEnvelope> {
    const principal = requirePrincipal(this.getPrincipal())
    const caller = capabilityCallerContextSchema.parse({ ...rawCaller, principal })
    const resourceRef = input.resourceRef.trim()
    const consumerId = validatePortableKind(input.consumerId)

    // This proves liveness, audience, and scope without returning state to the caller.
    this.broker.describeResourceRef(caller, resourceRef)
    const binding = this.#exportsByResourceRef.get(resourceRef)
    if (!binding || !samePrincipal(binding.principal, principal) ||
      !binding.projection.consumerIds.includes(consumerId)) {
      throw new PortableResourceReferenceError(
        'unauthorized_export',
        'Portable resource export is not authorized.'
      )
    }

    let projected: unknown
    try {
      projected = await binding.projection.project()
      const identity = await binding.codec.codec.projectExport(projected)
      const encoded = validatePortableIdentity(binding.codec.codec.encodeIdentity(identity))
      return parsePortableResourceReference({
        contractVersion: PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION,
        kind: binding.codec.codec.kind,
        authority: binding.authority,
        identity: encoded
      })
    } catch (error) {
      throw new PortableResourceReferenceError(
        'invalid_export_projection',
        'Portable resource export projection is invalid.'
      )
    }
  }

}

function decodeCanonicalIdentity(
  codec: PortableResourceReferenceCodec,
  encoded: PortableResourceIdentity
): unknown {
  try {
    const identity = codec.decodeIdentity(encoded)
    const recoded = validatePortableIdentity(codec.encodeIdentity(identity))
    if (canonicalPortableJson(recoded) !== canonicalPortableJson(encoded)) {
      throw new Error('Codec canonical identity drifted.')
    }
    return identity
  } catch {
    throw new PortableResourceReferenceError(
      'malformed_identity',
      'Portable resource reference identity is invalid.'
    )
  }
}

function trustedAuthority(
  value: TrustedPortableResourceAuthority | undefined,
  expectedReference: string
): TrustedPortableResourceAuthority {
  if (!value || value.reference !== expectedReference) {
    throw new PortableResourceReferenceError(
      'unknown_authority',
      'Portable resource reference authority is not trusted locally.'
    )
  }
  validatePortableAuthorityReference(value.reference)
  validatePortableKind(value.resolverId)
  return Object.freeze({ ...value })
}

function requirePrincipal(value: PrincipalSnapshot | undefined): PrincipalSnapshot {
  const parsed = principalSnapshotSchema.safeParse(value)
  if (!parsed.success) {
    throw new PortableResourceReferenceError(
      'principal_unavailable',
      'A current Host principal is required.'
    )
  }
  return parsed.data
}

function validateResolution(
  value: unknown,
  expectedResourceKind: string
): PortableResourceLocalRegistration {
  if (!isRecord(value) || !isRecord(value.registration)) {
    throw new PortableResourceReferenceError(
      'invalid_resolution',
      'Portable resource resolver returned an invalid result.'
    )
  }
  const registration = value.registration as unknown as PortableResourceLocalRegistration
  if (registration.resourceKind !== expectedResourceKind ||
    typeof registration.resourceId !== 'string' || !registration.resourceId.trim() ||
    typeof registration.semanticRevision !== 'string' || !registration.semanticRevision.trim() ||
    typeof registration.observe !== 'function') {
    throw new PortableResourceReferenceError(
      'invalid_resolution',
      'Portable resource resolver returned an invalid result.'
    )
  }
  return registration
}

function validateExportProjection(value: PortableResourceExportProjection): PortableResourceExportProjection {
  if (!isRecord(value) || !Array.isArray(value.consumerIds) || value.consumerIds.length < 1 ||
    value.consumerIds.length > 64 || typeof value.project !== 'function') {
    throw new PortableResourceReferenceError(
      'invalid_resolution',
      'Portable resource resolver returned an invalid export projection.'
    )
  }
  const consumerIds = value.consumerIds.map(validatePortableKind)
  if (new Set(consumerIds).size !== consumerIds.length) {
    throw new PortableResourceReferenceError(
      'invalid_resolution',
      'Portable resource resolver returned an invalid export projection.'
    )
  }
  return Object.freeze({ consumerIds: Object.freeze(consumerIds), project: value.project })
}

function toBrokerRegistration(
  registration: PortableResourceLocalRegistration
): CapabilityResourceRegistration {
  return {
    resourceId: registration.resourceId,
    resourceKind: registration.resourceKind,
    ...(registration.workspaceId ? { workspaceId: registration.workspaceId } : {}),
    ...(registration.audiences ? { audiences: [...registration.audiences] } : {}),
    semanticRevision: registration.semanticRevision,
    ...(registration.layoutRevision ? { layoutRevision: registration.layoutRevision } : {}),
    observe: async () => {
      const observed = await registration.observe()
      return {
        state: observed.state,
        semanticRevision: observed.semanticRevision,
        ...(observed.layoutRevision ? { layoutRevision: observed.layoutRevision } : {}),
        ...(observed.operationIds ? { operationIds: [...observed.operationIds] } : {})
      }
    },
    ...(registration.dispose ? { dispose: registration.dispose } : {}),
    ...(registration.contentTransport ? { contentTransport: registration.contentTransport } : {}),
    ...(registration.expiresInMs === undefined ? {} : { expiresInMs: registration.expiresInMs })
  }
}

function matchesCodecContract(contract: unknown, codec: PortableResourceReferenceCodec): boolean {
  return isRecord(contract) && Object.keys(contract).length === 3 &&
    contract.contractVersion === PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION &&
    contract.kind === codec.kind && contract.resourceKind === codec.resourceKind
}

function matchesResolverContract(contract: unknown, resolver: PortableResourceAuthorityResolver): boolean {
  return isRecord(contract) && Object.keys(contract).length === 2 &&
    contract.contractVersion === PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION &&
    contract.resolverId === resolver.id
}

function samePrincipal(left: PrincipalSnapshot, right: PrincipalSnapshot): boolean {
  return left.userId === right.userId && left.deviceId === right.deviceId &&
    left.identityVersion === right.identityVersion && left.assurance === right.assurance
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
