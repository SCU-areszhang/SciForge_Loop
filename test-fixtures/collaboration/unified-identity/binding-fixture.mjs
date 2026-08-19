export function createZulipBindingFixture(overrides = {}) {
  const requestedAt = overrides.requestedAt ?? new Date('2026-08-18T12:00:00.000Z')
  const userId = overrides.userId ?? 'usr_identity_test_0001'
  const bindingRequestId = overrides.bindingRequestId ?? 'zbr_identity_test_0001'
  const realmUrl = overrides.realmUrl ?? 'https://chat-test.example.invalid'
  const realmId = overrides.realmId ?? 'zulip-realm-test-0001'
  const zulipUserId = overrides.zulipUserId ?? 'zulip-user-test-0001'

  return {
    actor: {
      kind: 'user',
      userId,
      issuer: overrides.issuer ?? 'https://login-test.sciforge.cn/realms/SciForge',
      subject: overrides.subject ?? 'oidc-sub-test-owner'
    },
    beginRequest: {
      realmUrl
    },
    beginResponse: {
      bindingRequestId,
      bindingCode: overrides.bindingCode ?? 'SF-TEST-4P6Q',
      expiresAt: overrides.expiresAt ?? new Date(requestedAt.getTime() + 5 * 60_000).toISOString()
    },
    serviceActor: {
      kind: 'service',
      clientId: overrides.serviceClientId ?? 'sciforge-zulip-bot'
    },
    confirmRequest: {
      bindingCode: overrides.bindingCode ?? 'SF-TEST-4P6Q',
      realmUrl,
      realmId,
      zulipUserId,
      providerEventId: overrides.providerEventId ?? 'zulip-event-test-0001'
    },
    expectedBinding: {
      bindingRequestId,
      userId,
      realmUrl,
      realmId,
      zulipUserId,
      status: 'active'
    }
  }
}
