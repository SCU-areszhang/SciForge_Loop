import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

import { describe, expect, it } from 'vitest'
import { createFeedbackGatewayServer } from './server.js'

const idempotencyKey = 'feedback:thread-1234567890'

async function withServer(
  options: Parameters<typeof createFeedbackGatewayServer>[0],
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createFeedbackGatewayServer(options)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  try {
    await run(`http://127.0.0.1:${port}`)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

describe('feedback gateway HTTP API', () => {
  it('fails closed for authenticated operations when no private Connector is installed', async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/feedback`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey
        },
        body: JSON.stringify({ idempotencyKey })
      })
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({
        message: expect.stringContaining('private Connector'),
        retryable: false
      })

      const lookup = await fetch(`${baseUrl}/v1/feedback/${encodeURIComponent(idempotencyKey)}`)
      expect(lookup.status).toBe(503)
    })
  })

  it('does not revive the removed bearer-header path', async () => {
    const canary = 'legacy-gateway-header-canary'
    await withServer({}, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
      const response = await fetch(`${baseUrl}/v1/feedback/${encodeURIComponent(idempotencyKey)}`, {
        headers: { authorization: `Bearer ${canary}` }
      })
      expect(response.status).toBe(503)
      expect(await response.text()).not.toContain(canary)
    })
  })
})
