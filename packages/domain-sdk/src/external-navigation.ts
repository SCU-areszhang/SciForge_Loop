export type DomainMainExternalNavigationHost = Readonly<{
  issueTarget(input: Readonly<{
    callerId: string
    url: string
    expiresAt: string
  }>): Readonly<{ handle: string; expiresAt: string }>
  openTarget(input: Readonly<{ callerId: string; handle: string }>): Promise<void>
}>
