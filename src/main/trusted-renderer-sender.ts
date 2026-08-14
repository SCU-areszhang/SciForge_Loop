import { isTrustedRendererUrl } from './renderer-trust'

export type TrustedRendererSender = Readonly<{
  id: number
  trustedRendererTransport?: 'dev-browser'
}>

export type TrustedRendererInvokeEvent = Readonly<{
  sender: TrustedRendererSender
  senderFrame?: Readonly<{ url?: string }> | null
}>

type MainWindowLike = Readonly<{
  isDestroyed(): boolean
  webContents: Readonly<{ id: number; mainFrame: unknown }>
}>

export function createTrustedRendererSenderPolicy(options: Readonly<{
  getMainWindow: () => MainWindowLike | null
  getExpectedRendererUrl: () => string
  allowDevBrowser: boolean
}>): (event: TrustedRendererInvokeEvent) => boolean {
  return (event) => {
    if (
      options.allowDevBrowser &&
      event.sender.trustedRendererTransport === 'dev-browser'
    ) return true

    const window = options.getMainWindow()
    if (!window || window.isDestroyed()) return false
    const contents = window.webContents
    const frame = event.senderFrame
    return event.sender === contents &&
      frame === contents.mainFrame &&
      isTrustedRendererUrl(frame?.url ?? '', options.getExpectedRendererUrl())
  }
}
