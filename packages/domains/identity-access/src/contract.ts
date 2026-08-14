import { z } from 'zod'

export const IDENTITY_CAPABILITY_IDS = Object.freeze({
  inspect: 'identity.local.inspect',
  listAccounts: 'identity.local.list-accounts',
  createAccount: 'identity.local.create-account',
  selectAccount: 'identity.local.select-account',
  renameAccount: 'identity.local.rename-account',
  exitAccount: 'identity.local.exit-account',
  dismissFirstPrompt: 'identity.local.dismiss-first-prompt',
  backupAndReset: 'identity.local.backup-and-reset'
} as const)

export const IDENTITY_RESET_CONFIRMATION = 'RESET LOCAL IDENTITY' as const
export const IDENTITY_APPLICATION_OVERLAY_ID =
  'sciforge.identity-access.application-overlay' as const
export const IDENTITY_TOOLBAR_WIDGET_ID =
  'sciforge.identity-access.toolbar-widget' as const

export const localAccountSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().min(1).max(64),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
}).strict().readonly()

export const identityUnavailableReasonSchema = z.enum([
  'open-failed',
  'integrity-failed',
  'migration-failed'
])

export const identityAvailableStateSchema = z.object({
  status: z.literal('available'),
  identityVersion: z.number().int().nonnegative(),
  currentAccount: localAccountSchema.nullable(),
  accountCount: z.number().int().nonnegative(),
  firstPromptDismissed: z.boolean()
}).strict().readonly()

export const identityUnavailableStateSchema = z.object({
  status: z.literal('unavailable'),
  reason: identityUnavailableReasonSchema,
  recoveryAvailable: z.boolean()
}).strict().readonly()

export const identityUiStateSchema = z.discriminatedUnion('status', [
  identityAvailableStateSchema,
  identityUnavailableStateSchema
])

export const identityListAccountsOutputSchema = z.object({
  state: identityUiStateSchema,
  accounts: z.array(localAccountSchema).max(10_000)
}).strict().readonly()

export const usernameInputSchema = z.object({
  username: z.string().max(512)
}).strict()

export const accountSelectionInputSchema = z.object({
  userId: z.string().uuid()
}).strict()

export const accountRenameInputSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().max(512)
}).strict()

export const emptyIdentityInputSchema = z.object({}).strict()

export const identityBackupAndResetInputSchema = z.object({
  secondConfirmation: z.literal(IDENTITY_RESET_CONFIRMATION)
}).strict()

export const identityBackupAndResetOutputSchema = z.object({
  state: identityAvailableStateSchema,
  backupPath: z.string().min(1).max(4_096)
}).strict().readonly()

export type LocalAccount = z.infer<typeof localAccountSchema>
export type IdentityAvailableState = z.infer<typeof identityAvailableStateSchema>
export type IdentityUnavailableState = z.infer<typeof identityUnavailableStateSchema>
export type IdentityUiState = z.infer<typeof identityUiStateSchema>
export type IdentityListAccountsOutput = z.infer<typeof identityListAccountsOutputSchema>

export type NormalizedUsername = Readonly<{
  username: string
  usernameKey: string
}>

export class IdentityValidationError extends Error {
  readonly code: 'invalid-username' | 'username-conflict' | 'account-not-found' |
    'identity-unavailable' | 'reset-not-confirmed' | 'backup-failed'

  constructor(code: IdentityValidationError['code'], message: string) {
    super(message)
    this.name = 'IdentityValidationError'
    this.code = code
  }
}

export function normalizeUsername(rawUsername: string): NormalizedUsername {
  const username = rawUsername.normalize('NFC').trim()
  const length = Array.from(username).length
  if (length < 1 || length > 64 || !/^[\p{L}\p{N} _-]+$/u.test(username)) {
    throw new IdentityValidationError(
      'invalid-username',
      'Username must contain 1-64 letters, numbers, spaces, hyphens, or underscores.'
    )
  }
  return Object.freeze({
    username,
    usernameKey: username.toLowerCase().normalize('NFC')
  })
}
