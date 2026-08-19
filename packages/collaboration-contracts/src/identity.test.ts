import { describe, expect, it } from 'vitest'
// @ts-expect-error Vendored fixture is intentionally dependency-free JavaScript.
import { createZulipBindingFixture } from '../../../test-fixtures/collaboration/unified-identity/binding-fixture.mjs'
// @ts-expect-error Vendored fixture is intentionally dependency-free JavaScript.
import { createDeviceFixture } from '../../../test-fixtures/collaboration/unified-identity/device-fixture.mjs'
// @ts-expect-error Vendored fixture is intentionally dependency-free JavaScript.
import { startOidcFixtureServer } from '../../../test-fixtures/collaboration/unified-identity/oidc-fixture.mjs'
import { REDACTED_VALUE, redactCredentials } from './core.js'
import { agentNodeSchema } from './entities.js'
import { COLLABORATION_ERROR_RULES, createCollaborationError } from './errors.js'
import {
  deviceCreateRequestSchema,
  deviceEnrollmentCreateRequestSchema,
  deviceEnrollmentCreateResponseSchema,
  deviceIdSchema,
  deviceListResponseSchema,
  deviceResponseSchema,
  deviceRevokeRequestSchema,
  deviceSchema,
  externalIdentityListResponseSchema,
  externalIdentityResponseSchema,
  externalIdentityRevokeRequestSchema,
  externalIdentitySchema,
  meResponseSchema,
  oidcIssuerSchema,
  oidcUserActorSchema,
  serviceActorSchema,
  trustedZulipConfirmContextSchema,
  zulipBindingBeginRequestSchema,
  zulipBindingBeginResponseSchema,
  zulipBindingConfirmRequestSchema,
  zulipBindingConfirmResponseSchema
} from './identity.js'
import {
  agentRegisterCommandSchema,
  pairingBegunResponseSchema,
  restRequestSchema,
  restResponseSchema
} from './protocol.js'
import { canTransition, hasStableEntityIdentity } from './rules.js'

const timestamp = '2026-08-18T12:00:00.000Z'
const laterTimestamp = '2026-08-18T12:01:00.000Z'
const identityId = 'xid_identity_test_0001'
const humanEndpointId = 'hep_identity_test_0001'

function externalIdentityFixture(binding = createZulipBindingFixture()) {
  return {
    schemaVersion: 1,
    type: 'external_identity',
    externalIdentityId: identityId,
    provider: 'zulip',
    userId: binding.actor.userId,
    realmUrl: binding.expectedBinding.realmUrl,
    realmId: binding.expectedBinding.realmId,
    zulipUserId: binding.expectedBinding.zulipUserId,
    humanEndpointId,
    status: 'active',
    verifiedAt: laterTimestamp,
    revision: 1,
    createdAt: timestamp,
    updatedAt: laterTimestamp
  } as const
}

describe('strict OIDC and me contracts', () => {
  it('accepts the vendored dynamic OIDC issuer and underscore-style fixture IDs', async () => {
    const oidc = await startOidcFixtureServer()
    try {
      expect(oidcIssuerSchema.parse(oidc.issuer)).toBe(oidc.issuer)
      expect(deviceIdSchema.parse('dev_identity_test_0001')).toBe('dev_identity_test_0001')
      expect(oidcUserActorSchema.safeParse({
        kind: 'user',
        userId: 'usr_identity_test_0001',
        identityId: 'oid_identity_test_0001',
        issuer: oidc.issuer,
        subject: 'oidc-sub-test-owner',
        authTime: 1_776_513_600
      }).success).toBe(true)
    } finally {
      await oidc.close()
    }
  })

  it('keeps /v1/me strict and free of JWT or complete claims', () => {
    const me = {
      schemaVersion: 1,
      type: 'me',
      userId: 'usr_identity_test_0001',
      displayName: 'Identity Test User',
      status: 'active',
      oidcIdentityId: 'oid_identity_test_0001',
      issuer: 'https://login-test.sciforge.cn/realms/SciForge',
      revision: 1,
      createdAt: timestamp,
      updatedAt: laterTimestamp
    } as const
    expect(meResponseSchema.parse(me)).toEqual(me)
    expect(meResponseSchema.safeParse({ ...me, accessToken: 'not-allowed' }).success).toBe(false)
    expect(meResponseSchema.safeParse({ ...me, claims: { sub: 'not-public' } }).success).toBe(false)
  })
})

describe('strict Device contracts', () => {
  it('parses the vendored Ed25519 request only with explicit nonce and idempotency', () => {
    const fixture = createDeviceFixture()
    const request = {
      ...fixture.deviceRequest,
      nonce: fixture.enrollment.nonce,
      idempotencyKey: 'idem_identity_device_create_0001'
    }
    expect(deviceCreateRequestSchema.parse(request)).toEqual(request)
    expect(deviceCreateRequestSchema.safeParse({ ...request, nonce: undefined }).success).toBe(false)
    expect(deviceCreateRequestSchema.safeParse({ ...request, idempotencyKey: undefined }).success).toBe(false)
    expect(deviceCreateRequestSchema.safeParse({ ...request, nonce: 'A'.repeat(42) }).success).toBe(false)
    expect(deviceCreateRequestSchema.safeParse({
      ...request,
      publicKeyJwk: { ...request.publicKeyJwk, d: 'private-material-must-not-cross-contract' }
    }).success).toBe(false)
  })

  it('requires idempotency on every Device mutation and keeps secrets out of Device entities', () => {
    const fixture = createDeviceFixture()
    const enrollmentCreate = {
      installationId: fixture.enrollment.installationId,
      idempotencyKey: 'idem_identity_enrollment_0001'
    }
    const revoke = {
      deviceId: 'dev_identity_test_0001',
      idempotencyKey: 'idem_identity_device_revoke_0001'
    }
    expect(deviceEnrollmentCreateRequestSchema.safeParse(enrollmentCreate).success).toBe(true)
    expect(deviceEnrollmentCreateRequestSchema.safeParse({ installationId: enrollmentCreate.installationId }).success).toBe(false)
    expect(deviceRevokeRequestSchema.safeParse(revoke).success).toBe(true)
    expect(deviceRevokeRequestSchema.safeParse({ deviceId: revoke.deviceId }).success).toBe(false)

    const response = deviceEnrollmentCreateResponseSchema.parse({
      enrollmentId: fixture.enrollment.enrollmentId,
      nonce: fixture.enrollment.nonce,
      expiresAt: fixture.enrollment.expiresAt
    })
    const device = deviceSchema.parse({
      schemaVersion: 1,
      type: 'device',
      deviceId: revoke.deviceId,
      userId: fixture.enrollment.userId,
      installationId: fixture.enrollment.installationId,
      displayName: fixture.deviceRequest.displayName,
      platform: fixture.deviceRequest.platform,
      publicKeyJwk: fixture.deviceRequest.publicKeyJwk,
      capabilitySummary: fixture.deviceRequest.capabilitySummary,
      status: 'active',
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    expect(response.nonce).toBe(fixture.enrollment.nonce)
    expect(device).not.toHaveProperty('nonce')
    expect(device).not.toHaveProperty('signature')
    expect(device).not.toHaveProperty('privateKey')
    expect(deviceResponseSchema.safeParse({ device }).success).toBe(true)
    expect(deviceListResponseSchema.safeParse({ devices: [device] }).success).toBe(true)
    expect(hasStableEntityIdentity(device, { ...device, displayName: 'Renamed Device', revision: 2 })).toBe(true)
  })

  it('links active Agent to Device while keeping installation and Device fields out of Agent', () => {
    const fixture = createDeviceFixture()
    const register = fixture.agentRegister()
    expect(agentRegisterCommandSchema.parse(register).deviceId).toBe('dev_identity_test_0001')
    expect(agentRegisterCommandSchema.safeParse({ ...register, deviceId: undefined }).success).toBe(false)
    expect(agentRegisterCommandSchema.safeParse({ ...register, ownerUserId: undefined }).success).toBe(true)
    expect(agentRegisterCommandSchema.safeParse({
      ...register,
      installationId: fixture.enrollment.installationId
    }).success).toBe(false)
    expect(restRequestSchema.safeParse(register).success).toBe(true)

    const activeAgent = {
      schemaVersion: 1,
      type: 'agent_node',
      agentId: 'agt_identity_test_0001',
      deviceId: 'dev_identity_test_0001',
      ownerUserId: fixture.enrollment.userId,
      displayName: register.displayName,
      nodeType: register.nodeType,
      capabilities: register.capabilities,
      lifecycleStatus: 'active',
      connectionStatus: 'online',
      credentialVersion: 1,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    } as const
    expect(agentNodeSchema.safeParse(activeAgent).success).toBe(true)
    expect(agentNodeSchema.safeParse({ ...activeAgent, deviceId: undefined }).success).toBe(false)
    expect(agentNodeSchema.safeParse({ ...activeAgent, deviceId: null }).success).toBe(false)
    expect(agentNodeSchema.safeParse({
      ...activeAgent,
      deviceId: null,
      lifecycleStatus: 'revoked',
      connectionStatus: 'offline',
      revokedAt: laterTimestamp,
      revision: 2,
      updatedAt: laterTimestamp
    }).success).toBe(true)
  })
})

describe('strict Zulip binding contracts', () => {
  it('parses vendored binding begin/confirm only with idempotency and trusted service context', () => {
    const fixture = createZulipBindingFixture()
    const begin = { ...fixture.beginRequest, idempotencyKey: 'idem_identity_binding_begin_0001' }
    const confirm = { ...fixture.confirmRequest, idempotencyKey: 'idem_identity_binding_confirm_0001' }
    expect(zulipBindingBeginRequestSchema.parse(begin)).toEqual(begin)
    expect(zulipBindingBeginRequestSchema.safeParse(fixture.beginRequest).success).toBe(false)
    expect(zulipBindingConfirmRequestSchema.parse(confirm)).toEqual(confirm)
    expect(zulipBindingConfirmRequestSchema.safeParse(fixture.confirmRequest).success).toBe(false)
    expect(serviceActorSchema.parse(fixture.serviceActor)).toEqual(fixture.serviceActor)
    expect(trustedZulipConfirmContextSchema.safeParse({
      actor: fixture.serviceActor,
      realmUrl: fixture.confirmRequest.realmUrl,
      realmId: fixture.confirmRequest.realmId,
      zulipUserId: fixture.confirmRequest.zulipUserId,
      providerEventId: fixture.confirmRequest.providerEventId
    }).success).toBe(true)
    expect(trustedZulipConfirmContextSchema.safeParse({
      actor: { kind: 'user', userId: fixture.actor.userId },
      ...fixture.confirmRequest
    }).success).toBe(false)
  })

  it('models begin, confirm, list, and revoke without User credential issuance', () => {
    const fixture = createZulipBindingFixture()
    const identity = externalIdentitySchema.parse(externalIdentityFixture(fixture))
    expect(zulipBindingBeginResponseSchema.parse(fixture.beginResponse)).toEqual(fixture.beginResponse)
    expect(zulipBindingConfirmResponseSchema.safeParse({ identity }).success).toBe(true)
    expect(externalIdentityListResponseSchema.safeParse({ identities: [identity] }).success).toBe(true)
    expect(externalIdentityResponseSchema.safeParse({ identity }).success).toBe(true)
    expect(externalIdentityRevokeRequestSchema.safeParse({
      externalIdentityId: identity.externalIdentityId,
      idempotencyKey: 'idem_identity_external_revoke_0001'
    }).success).toBe(true)
    expect(externalIdentityRevokeRequestSchema.safeParse({
      externalIdentityId: identity.externalIdentityId
    }).success).toBe(false)
    expect(pairingBegunResponseSchema.safeParse({
      protocolVersion: '1.0',
      requestId: 'req_identity_pairing_0001',
      type: 'pairing.begun',
      ...fixture.beginResponse
    }).success).toBe(true)
    expect(restResponseSchema.safeParse({
      protocolVersion: '1.0',
      requestId: 'req_identity_pairing_0001',
      type: 'pairing.verified',
      userId: fixture.actor.userId,
      humanEndpointId,
      userCredential: 'legacy-user-credential-must-not-exist'
    }).success).toBe(false)
  })

  it('redacts binding codes, nonces, and their digests', () => {
    expect(redactCredentials({
      bindingCode: 'SF-TEST-4P6Q',
      bindingCodeDigest: 'a'.repeat(64),
      nonce: 'nonce-value',
      nonceDigest: 'b'.repeat(64)
    })).toEqual({
      bindingCode: REDACTED_VALUE,
      bindingCodeDigest: REDACTED_VALUE,
      nonce: REDACTED_VALUE,
      nonceDigest: REDACTED_VALUE
    })
  })
})

describe('identity errors and lifecycle rules', () => {
  it('freezes exact binding errors and HTTP rules', () => {
    expect(COLLABORATION_ERROR_RULES.IDENTITY_ALREADY_BOUND).toMatchObject({ httpStatus: 409, retryable: false })
    expect(COLLABORATION_ERROR_RULES.BINDING_CODE_USED).toMatchObject({ httpStatus: 409, retryable: false })
    expect(COLLABORATION_ERROR_RULES.BINDING_CODE_EXPIRED).toMatchObject({ httpStatus: 410, retryable: false })
    expect(createCollaborationError('IDENTITY_ALREADY_BOUND', 'Identity is already bound.', {
      requestId: 'req_identity_error_0001',
      traceId: 'trc_identity_error_0001'
    }).code).toBe('IDENTITY_ALREADY_BOUND')
  })

  it('keeps enrollment, Device, binding, and external identity terminal states explicit', () => {
    expect(canTransition('device_enrollment', 'pending', 'consumed')).toBe(true)
    expect(canTransition('device_enrollment', 'consumed', 'pending')).toBe(false)
    expect(canTransition('device', 'active', 'revoked')).toBe(true)
    expect(canTransition('device', 'revoked', 'active')).toBe(false)
    expect(canTransition('zulip_binding_request', 'pending', 'confirmed')).toBe(true)
    expect(canTransition('external_identity', 'active', 'revoked')).toBe(true)
    expect(canTransition('external_identity', 'revoked', 'active')).toBe(false)
  })
})
