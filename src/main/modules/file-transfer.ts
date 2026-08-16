import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { copyFile, open, stat, unlink } from 'node:fs/promises'
import type { DomainMainFileTransferHost } from '@sciforge/domain-sdk/file-transfer'
import { domainFileTransferHandleSchema } from '@sciforge/domain-sdk/file-transfer'

const MAX_TRANSFER_BYTES = 1_073_741_824
const MAX_CHUNK_BYTES = 1024 * 1024
const HANDLE_TTL_MS = 5 * 60_000

type TransferGrant = Readonly<{
  ownerId: string
  kind: 'upload' | 'download'
  path: string
  label: string
  size?: number
  expiresAt: number
}>

export class HostFileTransferService implements DomainMainFileTransferHost {
  readonly #grants = new Map<string, TransferGrant>()
  readonly #now: () => Date

  constructor(now: () => Date = () => new Date()) {
    this.#now = now
  }

  async registerUpload(ownerId: string, path: string) {
    assertOwnerAndPath(ownerId, path)
    const info = await stat(path)
    if (!info.isFile() || info.size > MAX_TRANSFER_BYTES) {
      throw new Error('The selected upload source is not a bounded regular file.')
    }
    const handle = this.#issue({
      ownerId,
      kind: 'upload',
      path,
      label: basename(path),
      size: info.size,
      expiresAt: this.#now().getTime() + HANDLE_TTL_MS
    })
    return Object.freeze({ handle, name: basename(path), size: info.size })
  }

  registerDownload(ownerId: string, path: string) {
    assertOwnerAndPath(ownerId, path)
    const handle = this.#issue({
      ownerId,
      kind: 'download',
      path,
      label: basename(path),
      expiresAt: this.#now().getTime() + HANDLE_TTL_MS
    })
    return Object.freeze({ handle, label: basename(path) })
  }

  async openUploadSource(input: Readonly<{ handle: string; callerId: string; maxBytes: number }>) {
    const grant = this.#take(input.handle, input.callerId, 'upload')
    const maxBytes = boundedMax(input.maxBytes)
    if (grant.size === undefined || grant.size > maxBytes) {
      throw new Error('The upload source exceeds the operation bound.')
    }
    return Object.freeze({
      name: grant.label,
      size: grant.size,
      read: async ({ offset, length }: Readonly<{ offset: number; length: number }>) => {
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) ||
          length < 1 || length > MAX_CHUNK_BYTES || offset + length > grant.size!) {
          throw new Error('The upload read range is invalid.')
        }
        const file = await open(grant.path, 'r')
        try {
          const buffer = new Uint8Array(length)
          const { bytesRead } = await file.read(buffer, 0, length, offset)
          return buffer.slice(0, bytesRead)
        } finally {
          await file.close()
        }
      }
    })
  }

  async openDownloadDestination(
    input: Readonly<{ handle: string; callerId: string; maxBytes: number }>
  ) {
    const grant = this.#take(input.handle, input.callerId, 'download')
    const maxBytes = boundedMax(input.maxBytes)
    const temporaryPath = join(
      dirname(grant.path),
      `.sciforge-download-${randomBytes(18).toString('hex')}.tmp`
    )
    const file = await open(temporaryPath, 'wx', 0o600)
    let bytesWritten = 0
    let closed = false
    const close = async () => {
      if (closed) return
      closed = true
      await file.close()
    }
    const cleanup = async () => {
      await close()
      await unlink(temporaryPath).catch(() => undefined)
    }
    return Object.freeze({
      label: grant.label,
      write: async (chunk: Uint8Array) => {
        if (closed || !(chunk instanceof Uint8Array) || chunk.byteLength < 1 ||
          chunk.byteLength > MAX_CHUNK_BYTES || bytesWritten + chunk.byteLength > maxBytes) {
          throw new Error('The download chunk exceeds the destination bound.')
        }
        await file.write(chunk)
        bytesWritten += chunk.byteLength
      },
      commit: async () => {
        await close()
        try {
          await copyFile(temporaryPath, grant.path, constants.COPYFILE_EXCL)
        } finally {
          await unlink(temporaryPath).catch(() => undefined)
        }
      },
      abort: cleanup
    })
  }

  revokeOwner(ownerId: string): void {
    for (const [handle, grant] of this.#grants) {
      if (grant.ownerId === ownerId) this.#grants.delete(handle)
    }
  }

  #issue(grant: TransferGrant): string {
    this.#sweep()
    const handle = domainFileTransferHandleSchema.parse(
      `xfer_${randomBytes(24).toString('base64url')}`
    )
    this.#grants.set(handle, grant)
    return handle
  }

  #take(handle: string, ownerId: string, kind: TransferGrant['kind']): TransferGrant {
    const parsed = domainFileTransferHandleSchema.parse(handle)
    const grant = this.#grants.get(parsed)
    this.#grants.delete(parsed)
    if (!grant || grant.ownerId !== ownerId || grant.kind !== kind ||
      grant.expiresAt <= this.#now().getTime()) {
      throw new Error('The Host-owned file transfer handle is unavailable.')
    }
    return grant
  }

  #sweep(): void {
    const now = this.#now().getTime()
    for (const [handle, grant] of this.#grants) {
      if (grant.expiresAt <= now) this.#grants.delete(handle)
    }
  }
}

function assertOwnerAndPath(ownerId: string, path: string): void {
  if (!ownerId.trim() || ownerId.length > 256 || !isAbsolute(path) || path.length > 4096) {
    throw new Error('The Host-owned file selection is invalid.')
  }
}

function boundedMax(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TRANSFER_BYTES) {
    throw new Error('The file transfer bound is invalid.')
  }
  return value
}
