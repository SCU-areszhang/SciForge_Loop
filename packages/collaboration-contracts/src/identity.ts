import { Buffer } from 'node:buffer'
import { z } from 'zod'
import {
  displayNameSchema,
  entityMetadataShape,
  humanEndpointIdSchema,
  idempotencyKeySchema,
  installationIdSchema,
  providerOpaqueIdSchema,
  revisionSchema,
  schemaVersionSchema,
  timestampSchema,
  userIdSchema
} from './core.js'

const opaqueSuffix = '[A-Za-z0-9](?:[A-Za-z0-9_]{10,62}[A-Za-z0-9])'

function opaqueId(prefix: string): z.ZodString {
  return z.string().regex(new RegExp(`^${prefix}_${opaqueSuffix}$`, 'u'))
}

function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

function isBase64UrlBytes(value: string, expectedBytes: number | { min: number }): boolean {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) return false
  try {
    const decoded = Buffer.from(value, 'base64url')
    if (decoded.toString('base64url') !== value) return false
    return typeof expectedBytes === 'number' ? decoded.length === expectedBytes : decoded.length >= expectedBytes.min
  } catch {
    return false
  }
}

export const oidcIdentityIdSchema = opaqueId('oid')
export const deviceEnrollmentIdSchema = opaqueId('enr')
export const deviceIdSchema = opaqueId('dev')
export const zulipBindingRequestIdSchema = opaqueId('zbr')
export const externalIdentityIdSchema = opaqueId('xid')

export type OidcIdentityId = z.infer<typeof oidcIdentityIdSchema>
export type DeviceEnrollmentId = z.infer<typeof deviceEnrollmentIdSchema>
export type DeviceId = z.infer<typeof deviceIdSchema>
export type ZulipBindingRequestId = z.infer<typeof zulipBindingRequestIdSchema>
export type ExternalIdentityId = z.infer<typeof externalIdentityIdSchema>

export const oidcIssuerSchema = z.string().min(1).max(2_048).superRefine((value, context) => {
  if (value !== value.trim()) {
    context.addIssue({ code: 'custom', message: 'OIDC issuer must not contain surrounding whitespace' })
    return
  }
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      context.addIssue({ code: 'custom', message: 'OIDC issuer must be an HTTP(S) URL without credentials, query, or fragment' })
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'OIDC issuer must be a valid URL' })
  }
})

export const oidcSubjectSchema = z.string().min(1).max(512)
export const oidcIdentityStatusSchema = z.enum(['active', 'revoked'])

export const oidcIdentitySchema = z.object({
  ...entityMetadataShape,
  type: z.literal('oidc_identity'),
  identityId: oidcIdentityIdSchema,
  userId: userIdSchema,
  issuer: oidcIssuerSchema,
  subject: oidcSubjectSchema,
  emailAtLinkTime: z.string().email().max(320).optional(),
  status: oidcIdentityStatusSchema,
  revokedAt: timestampSchema.optional()
}).strict().superRefine((identity, context) => {
  if ((identity.status === 'revoked') !== (identity.revokedAt !== undefined)) {
    context.addIssue({ code: 'custom', path: ['revokedAt'], message: 'Revoked OIDC identity requires revokedAt exclusively' })
  }
})
export type OidcIdentity = z.infer<typeof oidcIdentitySchema>

export const oidcUserActorSchema = z.object({
  kind: z.literal('user'),
  userId: userIdSchema,
  identityId: oidcIdentityIdSchema,
  issuer: oidcIssuerSchema,
  subject: oidcSubjectSchema,
  authTime: z.number().int().nonnegative()
}).strict()
export type OidcUserActor = z.infer<typeof oidcUserActorSchema>

export const serviceActorSchema = z.object({
  kind: z.literal('service'),
  clientId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
}).strict()
export type ServiceActor = z.infer<typeof serviceActorSchema>

export const meResponseSchema = z.object({
  schemaVersion: schemaVersionSchema,
  type: z.literal('me'),
  userId: userIdSchema,
  displayName: displayNameSchema,
  status: z.literal('active'),
  oidcIdentityId: oidcIdentityIdSchema,
  issuer: oidcIssuerSchema,
  revision: revisionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).strict()
export type MeResponse = z.infer<typeof meResponseSchema>

export const deviceEnrollmentStatusSchema = z.enum(['pending', 'consumed', 'expired'])
export const deviceStatusSchema = z.enum(['active', 'revoked'])
export const deviceOsSchema = z.enum(['windows', 'macos', 'linux'])
export const deviceArchSchema = z.enum(['x64', 'arm64'])
export const deviceCapabilitySchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/u)

export const devicePlatformSchema = z.object({
  os: deviceOsSchema,
  arch: deviceArchSchema,
  osVersion: z.string().trim().min(1).max(200).optional(),
  appVersion: z.string().trim().min(1).max(200)
}).strict()
export type DevicePlatform = z.infer<typeof devicePlatformSchema>

export const ed25519PublicJwkSchema = z.object({
  kty: z.literal('OKP'),
  crv: z.literal('Ed25519'),
  alg: z.literal('EdDSA'),
  use: z.literal('sig'),
  kid: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u),
  x: z.string().min(1).max(128).refine((value) => isBase64UrlBytes(value, 32), {
    message: 'Ed25519 public JWK x must be canonical base64url for exactly 32 bytes'
  })
}).strict()
export type Ed25519PublicJwk = z.infer<typeof ed25519PublicJwkSchema>

export const enrollmentNonceSchema = z.string().min(43).max(512).refine(
  (value) => isBase64UrlBytes(value, { min: 32 }),
  { message: 'Device enrollment nonce must be canonical base64url for at least 32 bytes' }
)

export const ed25519SignatureSchema = z.string().min(86).max(128).refine(
  (value) => isBase64UrlBytes(value, 64),
  { message: 'Ed25519 signature must be canonical base64url for exactly 64 bytes' }
)

export const deviceEnrollmentSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('device_enrollment'),
  enrollmentId: deviceEnrollmentIdSchema,
  userId: userIdSchema,
  installationId: installationIdSchema,
  status: deviceEnrollmentStatusSchema,
  expiresAt: timestampSchema,
  consumedAt: timestampSchema.optional()
}).strict().superRefine((enrollment, context) => {
  if ((enrollment.status === 'consumed') !== (enrollment.consumedAt !== undefined)) {
    context.addIssue({ code: 'custom', path: ['consumedAt'], message: 'Consumed Device enrollment requires consumedAt exclusively' })
  }
})
export type DeviceEnrollment = z.infer<typeof deviceEnrollmentSchema>

export const deviceSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('device'),
  deviceId: deviceIdSchema,
  userId: userIdSchema,
  installationId: installationIdSchema,
  displayName: displayNameSchema,
  platform: devicePlatformSchema,
  publicKeyJwk: ed25519PublicJwkSchema,
  capabilitySummary: z.array(deviceCapabilitySchema).max(256)
    .refine(uniqueStrings, 'Device capability summary values must be unique'),
  status: deviceStatusSchema,
  revokedAt: timestampSchema.optional()
}).strict().superRefine((device, context) => {
  if ((device.status === 'revoked') !== (device.revokedAt !== undefined)) {
    context.addIssue({ code: 'custom', path: ['revokedAt'], message: 'Revoked Device requires revokedAt exclusively' })
  }
})
export type Device = z.infer<typeof deviceSchema>

export const deviceEnrollmentCreateRequestSchema = z.object({
  installationId: installationIdSchema,
  idempotencyKey: idempotencyKeySchema
}).strict()
export type DeviceEnrollmentCreateRequest = z.infer<typeof deviceEnrollmentCreateRequestSchema>

export const deviceEnrollmentCreateResponseSchema = z.object({
  enrollmentId: deviceEnrollmentIdSchema,
  nonce: enrollmentNonceSchema,
  expiresAt: timestampSchema
}).strict()
export type DeviceEnrollmentCreateResponse = z.infer<typeof deviceEnrollmentCreateResponseSchema>

export const deviceCreateRequestSchema = z.object({
  enrollmentId: deviceEnrollmentIdSchema,
  nonce: enrollmentNonceSchema,
  installationId: installationIdSchema,
  displayName: displayNameSchema,
  platform: devicePlatformSchema,
  publicKeyJwk: ed25519PublicJwkSchema,
  capabilitySummary: z.array(deviceCapabilitySchema).max(256)
    .refine(uniqueStrings, 'Device capability summary values must be unique'),
  signature: ed25519SignatureSchema,
  idempotencyKey: idempotencyKeySchema
}).strict()
export type DeviceCreateRequest = z.infer<typeof deviceCreateRequestSchema>

export const deviceResponseSchema = z.object({ device: deviceSchema }).strict()
export type DeviceResponse = z.infer<typeof deviceResponseSchema>

export const deviceListResponseSchema = z.object({
  devices: z.array(deviceSchema).max(1_000)
    .refine((devices) => uniqueStrings(devices.map((device) => device.deviceId)), 'Device IDs must be unique')
}).strict()
export type DeviceListResponse = z.infer<typeof deviceListResponseSchema>

export const deviceRevokeRequestSchema = z.object({
  deviceId: deviceIdSchema,
  idempotencyKey: idempotencyKeySchema
}).strict()
export type DeviceRevokeRequest = z.infer<typeof deviceRevokeRequestSchema>

export const zulipRealmUrlSchema = z.string().min(1).max(2_048).superRefine((value, context) => {
  if (value !== value.trim()) {
    context.addIssue({ code: 'custom', message: 'Zulip realm URL must not contain surrounding whitespace' })
    return
  }
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      context.addIssue({ code: 'custom', message: 'Zulip realm URL must use HTTPS without credentials, query, or fragment' })
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'Zulip realm URL must be a valid URL' })
  }
})

export const bindingCodeSchema = z.string().min(8).max(128).regex(/^[A-Z0-9][A-Z0-9-]+$/u)
export const zulipBindingRequestStatusSchema = z.enum(['pending', 'confirmed', 'expired'])
export const externalIdentityStatusSchema = z.enum(['active', 'revoked'])

export const zulipBindingRequestSchema = z.object({
  ...entityMetadataShape,
  type: z.literal('zulip_binding_request'),
  bindingRequestId: zulipBindingRequestIdSchema,
  userId: userIdSchema,
  realmUrl: zulipRealmUrlSchema,
  status: zulipBindingRequestStatusSchema,
  expiresAt: timestampSchema,
  confirmedAt: timestampSchema.optional(),
  externalIdentityId: externalIdentityIdSchema.optional()
}).strict().superRefine((request, context) => {
  const confirmed = request.confirmedAt !== undefined && request.externalIdentityId !== undefined
  if ((request.status === 'confirmed') !== confirmed) {
    context.addIssue({ code: 'custom', path: ['confirmedAt'], message: 'Confirmed binding request requires identity and time exclusively' })
  }
})
export type ZulipBindingRequest = z.infer<typeof zulipBindingRequestSchema>

export const externalIdentitySchema = z.object({
  ...entityMetadataShape,
  type: z.literal('external_identity'),
  externalIdentityId: externalIdentityIdSchema,
  provider: z.literal('zulip'),
  userId: userIdSchema,
  realmUrl: zulipRealmUrlSchema,
  realmId: providerOpaqueIdSchema,
  zulipUserId: providerOpaqueIdSchema,
  humanEndpointId: humanEndpointIdSchema,
  status: externalIdentityStatusSchema,
  verifiedAt: timestampSchema,
  revokedAt: timestampSchema.optional()
}).strict().superRefine((identity, context) => {
  if ((identity.status === 'revoked') !== (identity.revokedAt !== undefined)) {
    context.addIssue({ code: 'custom', path: ['revokedAt'], message: 'Revoked external identity requires revokedAt exclusively' })
  }
})
export type ExternalIdentity = z.infer<typeof externalIdentitySchema>

export const zulipBindingBeginRequestSchema = z.object({
  realmUrl: zulipRealmUrlSchema,
  idempotencyKey: idempotencyKeySchema
}).strict()
export type ZulipBindingBeginRequest = z.infer<typeof zulipBindingBeginRequestSchema>

export const zulipBindingBeginResponseSchema = z.object({
  bindingRequestId: zulipBindingRequestIdSchema,
  bindingCode: bindingCodeSchema,
  expiresAt: timestampSchema
}).strict()
export type ZulipBindingBeginResponse = z.infer<typeof zulipBindingBeginResponseSchema>

export const zulipBindingConfirmRequestSchema = z.object({
  bindingCode: bindingCodeSchema,
  realmUrl: zulipRealmUrlSchema,
  realmId: providerOpaqueIdSchema,
  zulipUserId: providerOpaqueIdSchema,
  providerEventId: providerOpaqueIdSchema,
  idempotencyKey: idempotencyKeySchema
}).strict()
export type ZulipBindingConfirmRequest = z.infer<typeof zulipBindingConfirmRequestSchema>

export const trustedZulipConfirmContextSchema = z.object({
  actor: serviceActorSchema,
  realmUrl: zulipRealmUrlSchema,
  realmId: providerOpaqueIdSchema,
  zulipUserId: providerOpaqueIdSchema,
  providerEventId: providerOpaqueIdSchema
}).strict()
export type TrustedZulipConfirmContext = z.infer<typeof trustedZulipConfirmContextSchema>

export const zulipBindingConfirmResponseSchema = z.object({ identity: externalIdentitySchema }).strict()
export type ZulipBindingConfirmResponse = z.infer<typeof zulipBindingConfirmResponseSchema>

export const externalIdentityListResponseSchema = z.object({
  identities: z.array(externalIdentitySchema).max(1_000)
    .refine((identities) => uniqueStrings(identities.map((identity) => identity.externalIdentityId)),
      'External identity IDs must be unique')
}).strict()
export type ExternalIdentityListResponse = z.infer<typeof externalIdentityListResponseSchema>

export const externalIdentityRevokeRequestSchema = z.object({
  externalIdentityId: externalIdentityIdSchema,
  idempotencyKey: idempotencyKeySchema
}).strict()
export type ExternalIdentityRevokeRequest = z.infer<typeof externalIdentityRevokeRequestSchema>

export const externalIdentityResponseSchema = z.object({ identity: externalIdentitySchema }).strict()
export type ExternalIdentityResponse = z.infer<typeof externalIdentityResponseSchema>

export const identityEntitySchema = z.discriminatedUnion('type', [
  oidcIdentitySchema,
  deviceEnrollmentSchema,
  deviceSchema,
  zulipBindingRequestSchema,
  externalIdentitySchema
])
export type IdentityEntity = z.infer<typeof identityEntitySchema>
