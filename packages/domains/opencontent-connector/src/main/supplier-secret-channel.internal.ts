import { writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

const LEGACY_SUPPLIER_CREDENTIAL_KEY = ['SYSTEM', 'USER', 'TOKEN'].join('_')
const LEGACY_SUPPLIER_CREDENTIAL_ACCESS = [
  'process',
  'env',
  LEGACY_SUPPLIER_CREDENTIAL_KEY
].join('.')

export const OPENCONTENT_SUPPLIER_SECRET_CHANNEL_FD = 3
export const OPENCONTENT_SUPPLIER_SECRET_CHANNEL_MAX_BYTES = 64 * 1024
export const OPENCONTENT_SUPPLIER_SECRET_CHANNEL_PROTOCOL =
  'sciforge-opencontent-supplier-secret-channel:v1' as const

const SUPPLIER_SECRET_ACCESS =
  'globalThis[Symbol.for("sciforge.opencontent.supplier-secret-channel")].systemUserToken()'

/**
 * Rebinds the one credential read in the receipt-pinned supplier snapshot to
 * the Connector-owned inherited channel. The exact verified snapshot is
 * patched only in its private per-invocation copy.
 */
export function patchOpenContentSupplierSecretAccess(source: string): string {
  let replacementCount = 0
  const patched = source.replaceAll(LEGACY_SUPPLIER_CREDENTIAL_ACCESS, () => {
    replacementCount += 1
    return SUPPLIER_SECRET_ACCESS
  })
  if (replacementCount < 1 || patched.includes(LEGACY_SUPPLIER_CREDENTIAL_KEY)) {
    throw new TypeError('The pinned OpenContent supplier credential access is invalid.')
  }
  return patched
}

export function encodeOpenContentSupplierSecretEnvelope(systemUserToken: string): Buffer {
  const payload = Buffer.from(JSON.stringify({
    protocol: OPENCONTENT_SUPPLIER_SECRET_CHANNEL_PROTOCOL,
    systemUserToken
  }), 'utf8')
  if (payload.byteLength < 1 ||
      payload.byteLength > OPENCONTENT_SUPPLIER_SECRET_CHANNEL_MAX_BYTES) {
    payload.fill(0)
    throw new TypeError('The OpenContent supplier secret channel payload is invalid.')
  }
  return payload
}

/** Materializes only fixed code; credential bytes never touch this file. */
export async function materializeOpenContentSupplierSecretShim(
  runtimeRoot: string
): Promise<string> {
  if (!isAbsolute(runtimeRoot)) {
    throw new TypeError('The OpenContent supplier runtime root must be absolute.')
  }
  const path = join(runtimeRoot, 'cli', 'sciforge-supplier-secret-entry.cjs')
  await writeFile(path, SUPPLIER_SECRET_SHIM_SOURCE, { flag: 'wx', mode: 0o500 })
  return path
}

const SUPPLIER_SECRET_SHIM_SOURCE = String.raw`
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const CHANNEL_FD = ${OPENCONTENT_SUPPLIER_SECRET_CHANNEL_FD}
const CHANNEL_MAX_BYTES = ${OPENCONTENT_SUPPLIER_SECRET_CHANNEL_MAX_BYTES}
const CHANNEL_PROTOCOL = ${JSON.stringify(OPENCONTENT_SUPPLIER_SECRET_CHANNEL_PROTOCOL)}
const CHANNEL_SYMBOL = Symbol.for('sciforge.opencontent.supplier-secret-channel')
const LEGACY_TOKEN_KEY = ['SYSTEM', 'USER', 'TOKEN'].join('_')
const failureMessage = 'The OpenContent supplier secret channel is unavailable.\n'

function failClosed() {
  try { process.stderr.write(failureMessage) } catch {}
  process.exit(78)
}

let channelBytes = Buffer.alloc(CHANNEL_MAX_BYTES + 1)
let channelLength = 0
try {
  while (channelLength <= CHANNEL_MAX_BYTES) {
    const bytesRead = fs.readSync(
      CHANNEL_FD,
      channelBytes,
      channelLength,
      channelBytes.byteLength - channelLength,
      null
    )
    if (bytesRead === 0) break
    channelLength += bytesRead
  }
} catch {
  channelBytes.fill(0)
  failClosed()
}
try { fs.closeSync(CHANNEL_FD) } catch {
  channelBytes.fill(0)
  failClosed()
}
let channelTombstoneFd
try {
  channelTombstoneFd = fs.openSync(process.platform === 'win32' ? 'NUL' : '/dev/null', 'r')
  if (channelTombstoneFd !== CHANNEL_FD) {
    fs.closeSync(channelTombstoneFd)
    channelBytes.fill(0)
    failClosed()
  }
} catch {
  channelBytes.fill(0)
  failClosed()
}
if (channelLength < 1 || channelLength > CHANNEL_MAX_BYTES) {
  channelBytes.fill(0)
  failClosed()
}

let decoded
try {
  decoded = JSON.parse(channelBytes.subarray(0, channelLength).toString('utf8'))
} catch {
  channelBytes.fill(0)
  failClosed()
}
channelBytes.fill(0)
channelBytes = Buffer.alloc(0)

if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded) ||
    Object.keys(decoded).length !== 2 ||
    decoded.protocol !== CHANNEL_PROTOCOL ||
    typeof decoded.systemUserToken !== 'string' ||
    decoded.systemUserToken.length < 1 ||
    decoded.systemUserToken.length > 16384) {
  if (decoded && typeof decoded === 'object' &&
      typeof decoded.systemUserToken === 'string') decoded.systemUserToken = ''
  decoded = undefined
  failClosed()
}

let systemUserToken = decoded.systemUserToken
decoded.systemUserToken = ''
decoded = undefined
Reflect.deleteProperty(process.env, LEGACY_TOKEN_KEY)

const tokenBytes = Buffer.from(systemUserToken, 'utf8')
const forbiddenOutput = Array.from(new Set([
  systemUserToken,
  encodeURIComponent(systemUserToken),
  encodeURIComponent(systemUserToken).replaceAll('%20', '+'),
  tokenBytes.toString('base64'),
  tokenBytes.toString('base64url'),
  tokenBytes.toString('hex')
])).filter((value) => value.length > 0)
const forbiddenOutputBytes = forbiddenOutput.map((value) => Buffer.from(value, 'utf8'))
let outputViolation = false

function guardOutput(stream, maxBytes) {
  const originalWrite = stream.write.bind(stream)
  const buffered = []
  let bufferedBytes = 0
  let flushed = false
  stream.write = function guardedWrite(chunk, encoding, callback) {
    if (outputViolation) {
      throw new Error('The OpenContent supplier attempted to emit credential material.')
    }
    const bytes = Buffer.isBuffer(chunk)
      ? Buffer.from(chunk)
      : ArrayBuffer.isView(chunk)
        ? Buffer.from(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
        : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8')
    buffered.push(bytes)
    bufferedBytes += bytes.byteLength
    const combined = Buffer.concat(buffered, bufferedBytes)
    if (forbiddenOutputBytes.some((secret) => combined.includes(secret))) {
      outputViolation = true
      for (const bufferedChunk of buffered) bufferedChunk.fill(0)
      combined.fill(0)
      throw new Error('The OpenContent supplier attempted to emit credential material.')
    }
    if (bufferedBytes > maxBytes) {
      outputViolation = true
      buffered.length = 0
      return originalWrite(combined, encoding, callback)
    }
    combined.fill(0)
    const completion = typeof encoding === 'function' ? encoding : callback
    if (typeof completion === 'function') queueMicrotask(() => completion())
    return true
  }
  return function flush() {
    if (flushed || outputViolation) return
    flushed = true
    stream.write = originalWrite
    for (const chunk of buffered) originalWrite(chunk)
    buffered.length = 0
  }
}

const flushStdout = guardOutput(process.stdout, 4 * 1024 * 1024)
const flushStderr = guardOutput(process.stderr, 64 * 1024)
const flushBufferedOutputs = () => {
  flushStdout()
  flushStderr()
}
const originalExit = process.exit.bind(process)
process.exit = function guardedExit(code) {
  flushBufferedOutputs()
  return originalExit(code)
}
Object.defineProperty(globalThis, CHANNEL_SYMBOL, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: Object.freeze({
    systemUserToken() { return systemUserToken }
  })
})

process.once('beforeExit', flushBufferedOutputs)
process.once('exit', () => {
  flushBufferedOutputs()
  systemUserToken = ''
  tokenBytes.fill(0)
  forbiddenOutput.fill('')
  for (const bytes of forbiddenOutputBytes) bytes.fill(0)
  try { fs.closeSync(channelTombstoneFd) } catch {}
})

require(path.join(__dirname, 'bin', 'oc.js'))
`
