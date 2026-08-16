## Why

The OpenContent Content Space Provider needs one separately owned authentication and transport implementation without moving vendor infrastructure into Content Space. The optional V1 OpenContent track therefore starts with a main-only Connector beneath the Content Space adapter. A future Document adapter must extend this same Connector through a separately reviewed, independently authorized port rather than duplicate login state or block the Content Space milestone.

## What Changes

- Add one trusted compile-time, main-only `opencontent-connector` package discovered through the standard manifest and generated composition path.
- Make the Connector the sole owner of the non-secret Provider Instance Directory, node-local per-Human Provider Connections, authentication and Token lifecycle, OpenContent credential namespace, schema validation, and canonical transport.
- Bind one least-privilege typed port to the allowlisted OpenContent Content Space Provider adapter package at composition time; caller input cannot select a consumer identity or credential owner.
- Defer the OpenContent Document adapter port to a later change after Shared Documents; this milestone creates no Document port, optional Document method, or stub.
- Contribute OpenContent authority resolution to the generic portable-reference materializer without exposing endpoints or credentials through portable envelopes.
- Expose no Agent/UI business capability, raw HTTP, Token, Cookie, provider DTO, arbitrary endpoint, approval, Task, Project, or document/file business semantic.
- Make every operation explicitly `poc_only`, `blocked_by_contract`, or `production_ready`, and fail closed on session supersession rather than silently logging in again.
- Permit the Connector/Content Space adapter track to be absent or paused without blocking Provider composition, Content Space, its mocks, or the unified Content Space UI. Shared Documents remains an independent deferred domain.

## Capabilities

### New Capabilities

- `opencontent-connector`: Main-only instance, connection, authentication, credential, schema-validation, transport, readiness, and Content Space adapter-port infrastructure for OpenContent.

### Modified Capabilities

None.

## Impact

- Adds a provider-specific integration package with only a main entrypoint and package-owned tests/typecheck.
- Depends on `add-portable-resource-references`, `add-secure-provider-credentials`, and a stable Host-asserted Human Principal.
- Requires generated source and packaged composition to bind owner and adapter-consumer identities without a central OpenContent feature map.
- Depends on `add-provider-composition` only for the Content Space adapter that consumes it; the Connector itself registers no DocumentProvider or ContentSpaceProvider factory.
- Implements the Content Space-first milestone recorded by ADR 0025. `add-shared-documents-v1`, a future Document Connector port change, and `add-opencontent-document-provider-v1` are explicitly deferred and are not prerequisites.
- Blocks production network use until formal per-user authentication, Token lifecycle/revocation, metadata authorization, and API/API, API/browser, and API/Skill coexistence contracts pass.
