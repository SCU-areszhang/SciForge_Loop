import { describe, expect, it } from 'vitest'
import { createTrustedRendererSenderPolicy } from './trusted-renderer-sender'

describe('trusted renderer sender policy', () => {
  it('requires the current main WebContents, main frame, and expected URL', () => {
    const mainFrame = { url: 'file:///Applications/SciForge/index.html' }
    const webContents = { id: 8, mainFrame }
    const policy = createTrustedRendererSenderPolicy({
      getMainWindow: () => ({ isDestroyed: () => false, webContents }),
      getExpectedRendererUrl: () => 'file:///Applications/SciForge/index.html',
      allowDevBrowser: false
    })
    expect(policy({ sender: webContents, senderFrame: mainFrame })).toBe(true)
    expect(policy({ sender: { id: 9 }, senderFrame: mainFrame })).toBe(false)
    expect(policy({ sender: webContents, senderFrame: { url: 'https://evil.invalid' } })).toBe(false)
  })

  it('accepts only an explicitly marked dev-browser transport when enabled', () => {
    const policy = createTrustedRendererSenderPolicy({
      getMainWindow: () => null,
      getExpectedRendererUrl: () => 'http://localhost:5173',
      allowDevBrowser: true
    })
    expect(policy({ sender: { id: 1, trustedRendererTransport: 'dev-browser' } })).toBe(true)
    expect(policy({ sender: { id: 1 } })).toBe(false)
  })
})
