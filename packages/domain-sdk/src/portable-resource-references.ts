import type { DomainPackageJsonValue } from './contract.js'
import type { PrincipalSnapshot } from './principal.js'

export const PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION = 1 as const
export const PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES = 8_192
export const PORTABLE_RESOURCE_REFERENCE_MAX_IDENTITY_BYTES = 6_144
export const PORTABLE_RESOURCE_REFERENCE_MAX_IDENTITY_DEPTH = 8
export const PORTABLE_RESOURCE_REFERENCE_MAX_IDENTITY_NODES = 256
export const PORTABLE_RESOURCE_REFERENCE_MAX_COLLECTION_SIZE = 64
export const PORTABLE_RESOURCE_REFERENCE_MAX_STRING_BYTES = 1_024

export const MAIN_PORTABLE_RESOURCE_CODEC_CONTRIBUTION_KIND =
  'main.portable-resource-codec' as const
export const MAIN_PORTABLE_AUTHORITY_RESOLVER_CONTRIBUTION_KIND =
  'main.portable-authority-resolver' as const

export type PortableResourceReferenceErrorCode =
  | 'invalid_envelope'
  | 'envelope_too_large'
  | 'unsupported_version'
  | 'unknown_kind'
  | 'malformed_identity'
  | 'unknown_authority'
  | 'duplicate_codec'
  | 'duplicate_resolver'
  | 'principal_unavailable'
  | 'resolution_rejected'
  | 'invalid_resolution'
  | 'unauthorized_export'
  | 'invalid_export_projection'

/** A deliberately bounded, closed error surface safe for cross-context callers. */
export class PortableResourceReferenceError extends Error {
  readonly code: PortableResourceReferenceErrorCode

  constructor(code: PortableResourceReferenceErrorCode, message: string) {
    super(message.slice(0, 256))
    this.name = 'PortableResourceReferenceError'
    this.code = code
  }
}

export type PortableResourceIdentityValue =
  | null
  | boolean
  | number
  | string
  | readonly PortableResourceIdentityValue[]
  | Readonly<{ [key: string]: PortableResourceIdentityValue }>

export type PortableResourceIdentity = Readonly<{
  [key: string]: PortableResourceIdentityValue
}>

export type PortableResourceReferenceEnvelope = Readonly<{
  contractVersion: typeof PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION
  kind: string
  authority: string
  identity: PortableResourceIdentity
}>

export type PortableResourceCaller = Readonly<{
  audience: PortableResourceAudience
  callerId: string
  workspaceId?: string
}>

export type PortableResourceMaterializedReference = Readonly<{
  resource: Readonly<{
    token: string
    semanticRevision: string
    expiresAt: string
  }>
  resourceRef: string
  resourceKind: string
}>

export type DomainMainPortableResourceReferencesHost = Readonly<{
  materialize(
    reference: string | PortableResourceReferenceEnvelope,
    caller: PortableResourceCaller,
    options?: Readonly<{ signal?: AbortSignal }>
  ): Promise<PortableResourceMaterializedReference>
  export(
    caller: PortableResourceCaller,
    input: Readonly<{ resourceRef: string; consumerId: string }>
  ): Promise<PortableResourceReferenceEnvelope>
}>

export type PortableResourceReferenceCodec<Identity = unknown, ExportProjection = unknown> =
  Readonly<{
    kind: string
    resourceKind: string
    decodeIdentity(identity: PortableResourceIdentity): Identity
    encodeIdentity(identity: Identity): PortableResourceIdentity
    projectExport(projection: ExportProjection): Identity | Promise<Identity>
  }>

export type PortableResourceAudience = 'ui' | 'agent' | 'system'

export type PortableResourceObservation = Readonly<{
  state: DomainPackageJsonValue
  semanticRevision: string
  layoutRevision?: string
  operationIds?: readonly string[]
}>

/** Provider-owned registration consumed only by the canonical Host Broker issuer. */
export type PortableResourceLocalRegistration = Readonly<{
  resourceId: string
  resourceKind: string
  workspaceId?: string
  audiences?: readonly PortableResourceAudience[]
  semanticRevision: string
  layoutRevision?: string
  observe: () => PortableResourceObservation | Promise<PortableResourceObservation>
  dispose?: () => void | Promise<void>
  contentTransport?: Readonly<{
    describeActionId: string
    readRangeActionId: string
  }>
  expiresInMs?: number
}>

export type PortableResourceExportProjection = Readonly<{
  /** Trusted higher-level consumer contracts allowed to receive the portable value. */
  consumerIds: readonly string[]
  /** A provider-owned strict projection; it never receives generic Broker raw state. */
  project: () => unknown | Promise<unknown>
}>

export type PortableResourceResolution = Readonly<{
  registration: PortableResourceLocalRegistration
  exportProjection?: PortableResourceExportProjection
}>

export type TrustedPortableResourceAuthority<Context = unknown> = Readonly<{
  reference: string
  resolverId: string
  context?: Context
}>

/** Synchronous by contract so unknown authority rejection cannot perform network I/O. */
export type PortableResourceAuthorityResolver<AuthorityContext = unknown> = Readonly<{
  id: string
  /** Synchronous trusted-directory lookup; implementations must never perform I/O here. */
  lookupAuthority(reference: string): TrustedPortableResourceAuthority<AuthorityContext> | undefined
  resolve(input: Readonly<{
    envelope: PortableResourceReferenceEnvelope
    identity: unknown
    resourceKind: string
    authority: TrustedPortableResourceAuthority<AuthorityContext>
    principal: PrincipalSnapshot
    signal?: AbortSignal
  }>): PortableResourceResolution | Promise<PortableResourceResolution>
}>

const namespacedIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/u
const authorityPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,255}$/u
const forbiddenPortableKey = /(?:url|uri|endpoint|origin|host|hostname|credential|secret|token|password|connection|connectionid|providerconnection|providerdto|dto|display|displayname|mime|mimetype|path|filepath|pathname|name)$/iu
const runtimeHandlePattern = /^(?:res|cap)_[A-Za-z0-9_-]{3,}$/u
const localConnectionPattern = /^(?:conn|connection)_[A-Za-z0-9_-]{3,}$/iu
const uriPattern = /^[A-Za-z][A-Za-z0-9+.-]*:/u
const networkTargetPattern = /^(?:localhost|\[?(?:::1|[Ff][Ee]80:)|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?\]?$/u

export function parsePortableResourceReference(
  input: string | unknown
): PortableResourceReferenceEnvelope {
  const raw = parseBoundedInput(input)
  const envelope = validateEnvelopeShape(raw)
  if (envelope.contractVersion !== PORTABLE_RESOURCE_REFERENCE_CONTRACT_VERSION) {
    throw portableError('unsupported_version')
  }
  return envelope as PortableResourceReferenceEnvelope
}

export function serializePortableResourceReference(
  input: PortableResourceReferenceEnvelope | unknown
): string {
  return canonicalPortableJson(parsePortableResourceReference(input))
}

export function canonicalPortableJson(value: unknown): string {
  validateBoundedJson(value, PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES)
  return encodeCanonical(value)
}

export function isPortableResourceReferenceCodec(
  value: unknown
): value is PortableResourceReferenceCodec {
  return isRecord(value) &&
    typeof value.kind === 'string' && namespacedIdPattern.test(value.kind) &&
    typeof value.resourceKind === 'string' && namespacedIdPattern.test(value.resourceKind) &&
    typeof value.decodeIdentity === 'function' &&
    typeof value.encodeIdentity === 'function' &&
    typeof value.projectExport === 'function'
}

export function isPortableResourceAuthorityResolver(
  value: unknown
): value is PortableResourceAuthorityResolver {
  return isRecord(value) &&
    typeof value.id === 'string' && namespacedIdPattern.test(value.id) &&
    typeof value.lookupAuthority === 'function' &&
    typeof value.resolve === 'function'
}

export function validatePortableIdentity(input: unknown): PortableResourceIdentity {
  validateBoundedJson(input, PORTABLE_RESOURCE_REFERENCE_MAX_IDENTITY_BYTES, true)
  if (!isRecord(input) || Object.keys(input).length === 0) {
    throw portableError('malformed_identity')
  }
  return deepFreeze(cloneCanonical(input)) as PortableResourceIdentity
}

export function validatePortableKind(input: unknown): string {
  if (typeof input !== 'string' || input.length > 128 || !namespacedIdPattern.test(input)) {
    throw portableError('invalid_envelope')
  }
  return input
}

export function validatePortableAuthorityReference(input: unknown): string {
  if (typeof input !== 'string' || !authorityPattern.test(input) || isForbiddenString(input)) {
    throw portableError('invalid_envelope')
  }
  return input
}

function parseBoundedInput(input: unknown): unknown {
  if (typeof input !== 'string') {
    validateBoundedJson(input, PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES)
    return input
  }
  if (utf8Length(input) > PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES) {
    throw portableError('envelope_too_large')
  }
  try {
    return JSON.parse(input)
  } catch {
    throw portableError('invalid_envelope')
  }
}

function validateEnvelopeShape(raw: unknown): Readonly<{
  contractVersion: number
  kind: string
  authority: string
  identity: PortableResourceIdentity
}> {
  if (!isRecord(raw) || Object.getPrototypeOf(raw) !== Object.prototype) {
    throw portableError('invalid_envelope')
  }
  const keys = Object.keys(raw).sort()
  if (keys.length !== 4 || keys.join(',') !== 'authority,contractVersion,identity,kind') {
    throw portableError('invalid_envelope')
  }
  if (!Number.isSafeInteger(raw.contractVersion) || (raw.contractVersion as number) < 1) {
    throw portableError('invalid_envelope')
  }
  const result = {
    contractVersion: raw.contractVersion as number,
    kind: validatePortableKind(raw.kind),
    authority: validatePortableAuthorityReference(raw.authority),
    identity: validatePortableIdentity(raw.identity)
  }
  const canonical = encodeCanonical(result)
  if (utf8Length(canonical) > PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES) {
    throw portableError('envelope_too_large')
  }
  return deepFreeze(result)
}

function validateBoundedJson(input: unknown, maxBytes: number, portablePositions = false): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: input, depth: 0 }]
  const seen = new Set<object>()
  let nodes = 0
  let approximateBytes = 0
  while (stack.length > 0) {
    const current = stack.pop()!
    nodes += 1
    if (nodes > PORTABLE_RESOURCE_REFERENCE_MAX_IDENTITY_NODES) {
      throw portableError(maxBytes === PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES
        ? 'envelope_too_large'
        : 'malformed_identity')
    }
    if (current.depth > PORTABLE_RESOURCE_REFERENCE_MAX_IDENTITY_DEPTH) {
      throw portableError('malformed_identity')
    }
    const value = current.value
    if (value === null || typeof value === 'boolean') {
      approximateBytes += 5
      continue
    }
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw portableError('malformed_identity')
      approximateBytes += String(value).length
      continue
    }
    if (typeof value === 'string') {
      const bytes = utf8Length(value)
      if (bytes > PORTABLE_RESOURCE_REFERENCE_MAX_STRING_BYTES ||
        (portablePositions && isForbiddenString(value))) {
        throw portableError('malformed_identity')
      }
      approximateBytes += bytes + 2
      continue
    }
    if (!value || typeof value !== 'object' || seen.has(value)) {
      throw portableError('malformed_identity')
    }
    seen.add(value)
    if (Array.isArray(value)) {
      if (value.length > PORTABLE_RESOURCE_REFERENCE_MAX_COLLECTION_SIZE) {
        throw portableError('malformed_identity')
      }
      approximateBytes += value.length + 2
      for (const nested of value) stack.push({ value: nested, depth: current.depth + 1 })
      continue
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw portableError('malformed_identity')
    }
    const entries = Object.entries(value)
    if (entries.length > PORTABLE_RESOURCE_REFERENCE_MAX_COLLECTION_SIZE) {
      throw portableError('malformed_identity')
    }
    approximateBytes += entries.length + 2
    for (const [key, nested] of entries) {
      if (!key || utf8Length(key) > 128 ||
        (portablePositions && forbiddenPortableKey.test(key.replace(/[^A-Za-z0-9]/gu, '')))) {
        throw portableError('malformed_identity')
      }
      approximateBytes += utf8Length(key) + 3
      stack.push({ value: nested, depth: current.depth + 1 })
    }
    if (approximateBytes > maxBytes) {
      throw portableError(maxBytes === PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES
        ? 'envelope_too_large'
        : 'malformed_identity')
    }
  }
  let serialized: string
  try {
    serialized = encodeCanonical(input)
  } catch {
    throw portableError('malformed_identity')
  }
  if (utf8Length(serialized) > maxBytes) {
    throw portableError(maxBytes === PORTABLE_RESOURCE_REFERENCE_MAX_SERIALIZED_BYTES
      ? 'envelope_too_large'
      : 'malformed_identity')
  }
}

function isForbiddenString(value: string): boolean {
  const trimmed = value.trim()
  return trimmed !== value ||
    runtimeHandlePattern.test(trimmed) ||
    localConnectionPattern.test(trimmed) ||
    uriPattern.test(trimmed) ||
    networkTargetPattern.test(trimmed) ||
    trimmed.startsWith('/') || trimmed.startsWith('\\') ||
    trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('~/') ||
    /(?:^|\s)(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*$/iu.test(trimmed)
}

function encodeCanonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(encodeCanonical).join(',')}]`
  if (!isRecord(value)) throw new TypeError('Value is not canonical JSON.')
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${encodeCanonical(value[key])}`
  ).join(',')}}`
}

function cloneCanonical(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneCanonical)
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) result[key] = cloneCanonical((value as Record<string, unknown>)[key])
  return result
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

function portableError(code: PortableResourceReferenceErrorCode): PortableResourceReferenceError {
  const messages: Record<PortableResourceReferenceErrorCode, string> = {
    invalid_envelope: 'Portable resource reference envelope is invalid.',
    envelope_too_large: 'Portable resource reference envelope exceeds its bound.',
    unsupported_version: 'Portable resource reference version is unsupported.',
    unknown_kind: 'Portable resource reference kind is not registered.',
    malformed_identity: 'Portable resource reference identity is invalid.',
    unknown_authority: 'Portable resource reference authority is not trusted locally.',
    duplicate_codec: 'Portable resource reference codec ownership conflicts.',
    duplicate_resolver: 'Portable resource authority resolver ownership conflicts.',
    principal_unavailable: 'A current Host principal is required.',
    resolution_rejected: 'Portable resource reauthorization was rejected.',
    invalid_resolution: 'Portable resource resolver returned an invalid result.',
    unauthorized_export: 'Portable resource export is not authorized.',
    invalid_export_projection: 'Portable resource export projection is invalid.'
  }
  return new PortableResourceReferenceError(code, messages[code])
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
