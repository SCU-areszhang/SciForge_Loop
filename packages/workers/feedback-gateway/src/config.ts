export type FeedbackGatewayEnvironmentConfig = {
  host: string
  port: number
}

export type FeedbackGatewayEnvironment = Readonly<{
  SCIFORGE_FEEDBACK_HOST?: string
  SCIFORGE_FEEDBACK_PORT?: string
}>

function optional(value: string | undefined): string | undefined {
  value = value?.trim()
  return value || undefined
}

function integer(rawValue: string | undefined, key: string, fallback: number, minimum: number, maximum: number): number {
  const raw = optional(rawValue)
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer from ${minimum} to ${maximum}.`)
  }
  return value
}

export function feedbackGatewayConfigFromEnv(
  environment: FeedbackGatewayEnvironment = currentFeedbackGatewayEnvironment()
): FeedbackGatewayEnvironmentConfig {
  return {
    host: optional(environment.SCIFORGE_FEEDBACK_HOST) ?? '127.0.0.1',
    port: integer(environment.SCIFORGE_FEEDBACK_PORT, 'SCIFORGE_FEEDBACK_PORT', 8787, 1, 65_535)
  }
}

function currentFeedbackGatewayEnvironment(): FeedbackGatewayEnvironment {
  return Object.freeze({
    SCIFORGE_FEEDBACK_HOST: process.env.SCIFORGE_FEEDBACK_HOST,
    SCIFORGE_FEEDBACK_PORT: process.env.SCIFORGE_FEEDBACK_PORT
  })
}
