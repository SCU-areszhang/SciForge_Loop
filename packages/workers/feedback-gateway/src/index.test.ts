import { describe, expect, it } from 'vitest'

import * as feedbackGateway from './index.js'

describe('feedback gateway public API', () => {
  it('has no legacy raw GitHub, S3, or gateway-secret aliases', () => {
    expect(feedbackGateway).not.toHaveProperty('GitHubRestIssueAdapter')
    expect(feedbackGateway).not.toHaveProperty('S3ImmutableAssetPublisher')
    expect(feedbackGateway).not.toHaveProperty('createConfiguredFeedbackGateway')
    expect(Object.keys(feedbackGateway).join('\n')).not.toMatch(/auth|credential|secret|token/i)
  })
})
