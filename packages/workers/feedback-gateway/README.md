# SciForge Feedback Gateway

This worker preserves the non-secret deployment contract for SciForge product
feedback while authenticated operations await owner-private Connectors.

`GET /health` is available for deployment diagnostics. `POST /v1/feedback` and
`GET /v1/feedback/:idempotencyKey` fail closed with HTTP `503`; an
`Authorization` header cannot enable either route. The worker does not read a
gateway bearer secret, GitHub credential, S3 access key, or the AWS SDK
credential chain.

## Non-secret configuration

Copy `.env.example` to `.env` when validating the health-only deployment.
The only supported values are the listener configuration:

- `SCIFORGE_FEEDBACK_HOST` and `SCIFORGE_FEEDBACK_PORT`

Legacy gateway, GitHub, and S3 secret environment variables have no effect.
Legacy GitHub/S3 endpoints, repositories, asset locations, storage paths and
secret variables likewise have no effect. They are not compatibility aliases
and are not forwarded anywhere.

## Enabling submission

Authenticated submission must be implemented by owner-scoped, main-only
Connectors that unseal credentials and apply them only to their exact pinned
outbound transports. Until those Connectors are installed and composed, this
worker intentionally remains health-only. An authenticating reverse proxy,
static bearer header, worker environment credential, or SDK credential lookup
is not a fallback.

Run focused verification with:

```bash
npm test
npm run typecheck
```
