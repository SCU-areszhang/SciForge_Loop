function normalizeGatewayBaseUrl(value: string): string {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:') {
    throw new Error('SciForge feedback gateway must use HTTPS.')
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

/**
 * Non-secret deployment metadata only. Authenticated submission remains
 * unavailable until the Host installs an owner-private Connector.
 */
export function configuredFeedbackGatewayUrl(environment: NodeJS.ProcessEnv = process.env): string | null {
  const value = environment.SCIFORGE_FEEDBACK_GATEWAY_URL?.trim()
  if (!value) return null
  return normalizeGatewayBaseUrl(value)
}
