import { describe, expect, it } from 'vitest'

import { feedbackGatewayConfigFromEnv } from './config.js'

describe('feedbackGatewayConfigFromEnv', () => {
  it('loads only the health listener configuration', () => {
    expect(feedbackGatewayConfigFromEnv({})).toEqual({
      host: '127.0.0.1',
      port: 8787
    })
    expect(feedbackGatewayConfigFromEnv({
      SCIFORGE_FEEDBACK_HOST: '0.0.0.0',
      SCIFORGE_FEEDBACK_PORT: '9000'
    })).toEqual({ host: '0.0.0.0', port: 9000 })
  })

  it.each([
    'SCIFORGE_FEEDBACK_GATEWAY_TOKEN',
    'SCIFORGE_FEEDBACK_GITHUB_TOKEN',
    'SCIFORGE_FEEDBACK_S3_ACCESS_KEY_ID',
    'SCIFORGE_FEEDBACK_S3_SECRET_ACCESS_KEY'
  ])('ignores the removed legacy secret environment path %s', (name) => {
    const canary = 'feedback-secret-canary-must-not-cross'
    const config = feedbackGatewayConfigFromEnv({ [name]: canary })
    expect(JSON.stringify(config)).not.toContain(canary)
    expect(Object.keys(config).join('\n')).not.toMatch(/auth|credential|secret|token/i)
  })

  it('does not consume the AWS SDK credential-chain environment fallback', () => {
    const canary = 'feedback-aws-chain-canary-must-not-cross'
    const config = feedbackGatewayConfigFromEnv({
      AWS_ACCESS_KEY_ID: canary,
      AWS_SECRET_ACCESS_KEY: canary,
      AWS_SESSION_TOKEN: canary
    })
    expect(JSON.stringify(config)).not.toContain(canary)
  })

  it('rejects an invalid listener port', () => {
    expect(() => feedbackGatewayConfigFromEnv({ SCIFORGE_FEEDBACK_PORT: '0' }))
      .toThrow('must be an integer')
  })
})
