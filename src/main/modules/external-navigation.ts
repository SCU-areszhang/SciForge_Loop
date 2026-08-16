import { randomBytes } from 'node:crypto'
import type { DomainMainExternalNavigationHost } from '@sciforge/domain-sdk/external-navigation'

const MAX_TARGET_TTL_MS = 5 * 60_000
const handlePattern = /^portal_[A-Za-z0-9_-]{20,}$/u

type Target = Readonly<{
  callerId: string
  url: string
  expiresAt: number
}>

export class HostExternalNavigationService implements DomainMainExternalNavigationHost {
  readonly #targets = new Map<string, Target>()
  readonly #openExternal: (url: string) => Promise<void>
  readonly #now: () => Date

  constructor(input: Readonly<{
    openExternal: (url: string) => Promise<void>
    now?: () => Date
  }>) {
    this.#openExternal = input.openExternal
    this.#now = input.now ?? (() => new Date())
  }

  issueTarget(input: Readonly<{ callerId: string; url: string; expiresAt: string }>) {
    const now = this.#now().getTime()
    const expiresAt = Date.parse(input.expiresAt)
    const url = safeHttpsUrl(input.url)
    if (!input.callerId.trim() || input.callerId.length > 256 || !Number.isFinite(expiresAt) ||
      expiresAt <= now || expiresAt > now + MAX_TARGET_TTL_MS) {
      throw new Error('The external portal target is unsafe or expired.')
    }
    const handle = `portal_${randomBytes(24).toString('base64url')}`
    this.#targets.set(handle, Object.freeze({ callerId: input.callerId, url, expiresAt }))
    return Object.freeze({ handle, expiresAt: new Date(expiresAt).toISOString() })
  }

  async openTarget(input: Readonly<{ callerId: string; handle: string }>): Promise<void> {
    if (!handlePattern.test(input.handle)) throw new Error('The portal target handle is invalid.')
    const target = this.#targets.get(input.handle)
    this.#targets.delete(input.handle)
    if (!target || target.callerId !== input.callerId || target.expiresAt <= this.#now().getTime()) {
      throw new Error('The portal target handle is unavailable.')
    }
    await this.#openExternal(target.url)
  }
}

function safeHttpsUrl(raw: string): string {
  if (raw.length > 4096) throw new Error('The external portal target is too long.')
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Only credential-free HTTPS portal targets are allowed.')
  }
  return url.toString()
}
