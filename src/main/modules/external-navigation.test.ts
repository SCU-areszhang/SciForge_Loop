import { describe, expect, it, vi } from 'vitest'
import { HostExternalNavigationService } from './external-navigation'

describe('Host external navigation targets', () => {
  it('opens only a caller-bound one-shot HTTPS handle without returning the URL', async () => {
    const openExternal = vi.fn(async () => undefined)
    const now = new Date('2026-08-16T10:00:00.000Z')
    const service = new HostExternalNavigationService({ openExternal, now: () => now })
    const target = service.issueTarget({
      callerId: 'window:7',
      url: 'https://content-space.invalid/portal/mock_file_1',
      expiresAt: '2026-08-16T10:01:00.000Z'
    })
    expect(target).not.toHaveProperty('url')
    await expect(service.openTarget({
      callerId: 'window:8',
      handle: target.handle
    })).rejects.toThrow('unavailable')
    expect(openExternal).not.toHaveBeenCalled()

    const second = service.issueTarget({
      callerId: 'window:7',
      url: 'https://content-space.invalid/portal/mock_file_1',
      expiresAt: '2026-08-16T10:01:00.000Z'
    })
    await service.openTarget({ callerId: 'window:7', handle: second.handle })
    expect(openExternal).toHaveBeenCalledWith(
      'https://content-space.invalid/portal/mock_file_1'
    )
    await expect(service.openTarget({
      callerId: 'window:7',
      handle: second.handle
    })).rejects.toThrow('unavailable')
  })

  it('rejects unsafe, credential-bearing, and overlong-lived targets', () => {
    const service = new HostExternalNavigationService({
      openExternal: async () => undefined,
      now: () => new Date('2026-08-16T10:00:00.000Z')
    })
    for (const url of [
      'http://content-space.invalid/portal',
      'https://user:secret@content-space.invalid/portal'
    ]) {
      expect(() => service.issueTarget({
        callerId: 'window:7',
        url,
        expiresAt: '2026-08-16T10:01:00.000Z'
      })).toThrow()
    }
    expect(() => service.issueTarget({
      callerId: 'window:7',
      url: 'https://content-space.invalid/portal',
      expiresAt: '2026-08-16T11:00:00.000Z'
    })).toThrow()
  })
})
