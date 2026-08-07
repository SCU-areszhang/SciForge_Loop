## Why

SciForge lacks one canonical, collaborative document surface that humans and governed agents can edit together without copying content through workspace files, private IPC, or runtime-specific tool implementations. The v1 change establishes the contracts, package boundary, private-alpha deployment boundary, and evidence gates required to add rich documents and Base-style structured data safely to the existing manifest-discovered Domain and Capability Broker architecture.

## What Changes

- Add a single versioned `@sciforge/domain-shared-documents` package that owns the shared contract, optional desktop main/renderer entrypoints, collaboration model, semantic operations, and an independently packaged Node CLI server.
- Add project creation and explicit local binding around a server-generated immutable UUIDv7 `projectId`; local absolute workspace paths remain Host-only binding keys and never become remote identity.
- Make one Y.Doc per Catalog or document the sole collaborative-content truth, with SQLite owning project/resource lifecycle, schema, idempotency receipts, store ordering, and asset storage metadata.
- Give Human clients raw Yjs collaboration over WS/WSS while every Agent runtime uses the same Capability Broker and package-owned semantic operation engine; remove the possibility of a second runtime-specific business path.
- Add rich documents, Base tables/views, comments, images, presence, cached Human offline editing, archive/restore, stable sharing locators, and explicit Markdown/CSV/ZIP snapshot exchange within frozen v1 limits.
- Add a generic external-URI contribution and delivery queue so the Host routes `sciforge:` ingress without parsing shared-document business data or adding a domain-ID switch.
- Extend generic Capability metadata propagation and metadata-only execution evidence for governed external mutations without shared-document action-ID exceptions.
- Ship only as `private-alpha`: loopback by default, or an explicitly acknowledged non-loopback deployment behind operator-provided access control and HTTPS; unauthenticated direct-public deployment is a release blocker.
- Establish an early package-boundary gate and test-only feasibility gate before production collaboration work, followed by durability, privacy, near-limit, 2/10/50-client, packaged-Electron, CLI-tarball, and installed-protocol release evidence.
- **BREAKING**: Supersede the historical path-derived project identity, Y.Doc `system.*` authority, hash/state-vector revision, Y.Doc receipt, automatic first-link binding, and public/no-auth deployment assumptions. No compatibility alias, dual registration, or fallback path is retained.

## Capabilities

### New Capabilities

- `shared-documents`: Collaborative project, Catalog, rich-document, Base, comment, asset, presence, offline, semantic Agent, persistence, sharing, exchange, deployment, and release behavior.
- `external-uri-routing`: Generic package-contributed external URI registration, queued OS delivery, renderer routing, and lifecycle behavior without Host domain knowledge.
- `capability-metadata-propagation`: Authoritative effect, resource, opaque revision, idempotency, approval, and metadata-only execution evidence propagation through the generic Broker tool surface.

### Modified Capabilities

None. The target branch currently has no archived main specs; related active changes remain independently owned and are prerequisites rather than files modified by this change.

## Impact

- Adds one OpenSpec change spanning PR 0 through PR 11, with PR 12 reserved for post-implementation archival.
- Future implementation affects `packages/domains/shared-documents/**`, generic Domain SDK/Host external-URI extension points, Capability Broker metadata/evidence paths, generated Domain composition, root build/test orchestration, and release evidence.
- Adds exact Yjs, Hocuspocus, y-prosemirror, y-indexeddb, and Tiptap collaboration dependencies in subsequent implementation PRs; PR 0 only pins `@fission-ai/openspec@1.8.0`.
- Adds a compiled Node CLI and SQLite data directory as a release artifact separate from Electron, while keeping backend and UI in one Domain package/version.
- Requires completion of existing Capability readiness/no-fallback tasks and Domain enable/disable/dispose lifecycle tasks before PR 1 can pass Design Freeze.
- Does not implement browser editing, authentication/authorization, Docker, version history, suggestions/review, mentions/notifications, permanent deletion, or advanced Base formula/relation/automation features.
