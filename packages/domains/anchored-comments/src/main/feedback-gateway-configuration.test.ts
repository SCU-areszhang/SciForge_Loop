import { describe, expect, it } from 'vitest'

import * as gatewayConfiguration from './feedback-gateway-configuration'

describe('feedback gateway configuration', () => {
  it('preserves only the non-secret HTTPS gateway URL', () => {
    expect(gatewayConfiguration.configuredFeedbackGatewayUrl({})).toBeNull()
    expect(gatewayConfiguration.configuredFeedbackGatewayUrl({
      SCIFORGE_FEEDBACK_GATEWAY_URL: ' https://feedback.sciforge.test/root/ ',
      SCIFORGE_FEEDBACK_GATEWAY_TOKEN: 'gateway-secret-canary-must-not-cross'
    })).toBe('https://feedback.sciforge.test/root')
    expect(() => gatewayConfiguration.configuredFeedbackGatewayUrl({
      SCIFORGE_FEEDBACK_GATEWAY_URL: 'http://feedback.test'
    })).toThrow('must use HTTPS')
  })

  it('does not expose a raw HTTP client or token alias', () => {
    expect(gatewayConfiguration).not.toHaveProperty('FeedbackGatewayClient')
    expect(gatewayConfiguration).not.toHaveProperty('configuredFeedbackGatewayToken')
  })
})
