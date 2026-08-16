import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HostFileTransferService } from './file-transfer'

describe('Host-owned file transfers', () => {
  it('keeps paths in main, binds opaque handles to the caller, and commits without overwrite', async () => {
    const root = await mkdtemp('/private/tmp/sciforge-file-transfer-')
    try {
      const sourcePath = join(root, 'source.bin')
      const destinationPath = join(root, 'destination.bin')
      await writeFile(sourcePath, 'bounded bytes')
      const service = new HostFileTransferService()
      const upload = await service.registerUpload('window:7', sourcePath)
      expect(upload).not.toHaveProperty('path')
      await expect(service.openUploadSource({
        handle: upload.handle,
        callerId: 'window:8',
        maxBytes: 1024
      })).rejects.toThrow('unavailable')

      const validUpload = await service.registerUpload('window:7', sourcePath)
      const source = await service.openUploadSource({
        handle: validUpload.handle,
        callerId: 'window:7',
        maxBytes: 1024
      })
      expect(Buffer.from(await source.read({ offset: 0, length: source.size })).toString())
        .toBe('bounded bytes')

      const download = service.registerDownload('window:7', destinationPath)
      expect(download).not.toHaveProperty('path')
      const sink = await service.openDownloadDestination({
        handle: download.handle,
        callerId: 'window:7',
        maxBytes: 1024
      })
      await sink.write(new TextEncoder().encode('downloaded bytes'))
      await sink.commit()
      expect(await readFile(destinationPath, 'utf8')).toBe('downloaded bytes')

      const collision = service.registerDownload('window:7', destinationPath)
      const collisionSink = await service.openDownloadDestination({
        handle: collision.handle,
        callerId: 'window:7',
        maxBytes: 1024
      })
      await collisionSink.write(new TextEncoder().encode('must not replace'))
      await expect(collisionSink.commit()).rejects.toThrow()
      expect(await readFile(destinationPath, 'utf8')).toBe('downloaded bytes')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
