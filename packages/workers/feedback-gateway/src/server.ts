import { createServer, type Server, type ServerResponse } from 'node:http'

export const FEEDBACK_GATEWAY_SERVICE_ID = 'sciforge.feedback-gateway'
export const FEEDBACK_GATEWAY_SERVICE_VERSION = '0.1.0'

export type FeedbackGatewayHttpOptions = {
  now?: () => Date
}

/**
 * The worker deliberately exposes no authenticated feedback transport until an
 * owner-private Connector owns both authentication and the exact outbound
 * operations. Health remains available for deployment diagnostics.
 */
export function createFeedbackGatewayServer(options: FeedbackGatewayHttpOptions = {}): Server {
  const now = options.now ?? (() => new Date())
  return createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
    if (request.method === 'GET' && url.pathname === '/health') {
      return sendJson(response, 200, {
        ok: true,
        service: FEEDBACK_GATEWAY_SERVICE_ID,
        version: FEEDBACK_GATEWAY_SERVICE_VERSION,
        authenticatedOperations: 'unavailable',
        checkedAt: now().toISOString()
      })
    }
    if (url.pathname === '/v1/feedback' || url.pathname.startsWith('/v1/feedback/')) {
      return sendJson(response, 503, {
        message: 'Authenticated feedback operations are unavailable because no owner-private Connector is installed.',
        retryable: false
      })
    }
    return sendJson(response, 404, {
      message: `No route for ${request.method} ${url.pathname}.`,
      retryable: false
    })
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  })
  response.end(JSON.stringify(body))
}
