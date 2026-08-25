import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

const MAX_SERVER_SECRET_BYTES = 16 * 1024

/** Reads one deployment-owned secret without following the final path component. */
export async function readServerSecretFile(path: string | undefined): Promise<string> {
  const locator = path?.trim()
  if (!locator || !isAbsolute(locator)) {
    throw new Error('A valid absolute server secret-file locator is required.')
  }

  let file
  try {
    file = await open(locator, constants.O_RDONLY | constants.O_NOFOLLOW)
    const metadata = await file.stat()
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_SERVER_SECRET_BYTES ||
        (metadata.mode & 0o077) !== 0) {
      throw new Error('The server secret file has unsafe metadata.')
    }
    const currentUid = typeof process.getuid === 'function' ? process.getuid() : undefined
    if (currentUid !== undefined && metadata.uid !== 0 && metadata.uid !== currentUid) {
      throw new Error('The server secret file has an unexpected owner.')
    }
    const bytes = Buffer.alloc(metadata.size)
    try {
      const { bytesRead } = await file.read(bytes, 0, bytes.byteLength, 0)
      const afterRead = await file.stat()
      if (bytesRead !== bytes.byteLength || afterRead.dev !== metadata.dev ||
          afterRead.ino !== metadata.ino || afterRead.size !== metadata.size ||
          afterRead.mtimeMs !== metadata.mtimeMs) {
        throw new Error('The server secret file changed while it was being read.')
      }
      const value = bytes.toString('utf8').trim()
      if (!value || value.includes('\0') || value.length > MAX_SERVER_SECRET_BYTES) {
        throw new Error('The server secret file contains an invalid value.')
      }
      return value
    } finally {
      bytes.fill(0)
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The server secret file')) {
      throw error
    }
    throw new Error('The server secret file is unavailable.')
  } finally {
    await file?.close().catch(() => undefined)
  }
}
