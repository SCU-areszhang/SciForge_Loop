const HOST_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'HOME',
  'USER',
  'LOGNAME',
  'PATH',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'USERPROFILE',
  'LOCALAPPDATA',
  'APPDATA',
  'XDG_CONFIG_HOME'
] as const)

/**
 * Builds the canonical Host-owned environment inherited by local utility
 * processes. Only exact, non-authorizing runtime keys are selected. Callers
 * must add their own fixed, operation-specific values after this projection.
 */
export function hostChildProcessEnvironment(
  source: NodeJS.ProcessEnv
): Record<string, string> {
  const environment: Record<string, string> = {}
  for (const name of HOST_CHILD_ENVIRONMENT_KEYS) {
    const value = source[name]
    if (
      typeof value === 'string'
      && value.length > 0
      && value.length <= 16_384
      && !value.includes('\0')
    ) {
      environment[name] = value
    }
  }
  return environment
}
