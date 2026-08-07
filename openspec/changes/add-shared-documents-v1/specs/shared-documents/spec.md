## Purpose

Defines the observable private-alpha contract through which SciForge humans and governed agents share rich documents and Base data using one canonical Yjs-backed content state and a disjoint server control plane.

## ADDED Requirements

### Requirement: Private-alpha server boundary
The server SHALL bind loopback by default and SHALL reject non-loopback startup unless private-alpha mode, external-access-control acknowledgement, and an HTTPS public origin are supplied. Direct unauthenticated public deployment SHALL be unsupported.

**Owning PR:** PR 5; release evidence PR 11. **Acceptance criterion:** safe startup matrix and deployment evidence pass. **Canonical path:** compiled CLI -> one HTTP/WS server. **Expected failure:** nonzero typed/redacted startup error. **Forbidden fallback:** permissive bind, Electron sidecar, CORS/UUID/link as auth, or public-production claim.

#### Scenario: Unsafe external bind
- **WHEN** a non-loopback bind lacks any required acknowledgement or uses a non-HTTPS public origin
- **THEN** startup fails before accepting HTTP, WebSocket, asset, or health traffic

### Requirement: One package owns every release artifact
`@sciforge/domain-shared-documents` SHALL be the single ownership, version, installation, rollback, and release unit for its shared contract/model, explicit Electron `main` and optional `renderer` entrypoints, and independently installable compiled Node CLI tarball. The Host SHALL discover only real Electron contributions through the standard manifest/generated composition path.

**Owning PR:** PR 1 package boundary; release evidence PR 11. **Acceptance criterion:** source and packaged Electron boundary checks plus `npm pack` install/launch/health/clean-exit smoke pass from the same package version. **Canonical path:** Domain manifest -> generated composition -> explicit package entrypoints; package `bin`/exports -> packed CLI. **Expected failure:** package build, activation, or release blocker. **Forbidden fallback:** separately versioned server package, Host-private import, central Domain-ID switch/feature map, shared-documents Host configuration, no-op contribution, or Electron sidecar/`app.asar.unpacked` CLI.

#### Scenario: Package is installed or removed
- **WHEN** the shared-documents package is added to or removed from the standard Domain manifest inputs
- **THEN** generated composition adds or removes its real Electron entrypoints without a Host business-code edit, while the same package tarball remains independently installable as the CLI

### Requirement: Stable project identity and binding
The system SHALL use a server-generated immutable UUIDv7 `projectId` and SHALL keep normalized absolute workspace paths only as local keys for `{ endpointOrigin, projectId }`. Path normalization SHALL be lexical on the caller platform without `realpath` or symlink collapse: Unicode NFC, `/` separators, no non-root trailing separator, case preserved except an uppercase Windows drive letter. Endpoint input SHALL be an origin without credentials, query, fragment, or non-root path; it SHALL normalize lowercase scheme/host, omit default port/trailing slash, permit HTTP only for exact `localhost`, IPv4 `127.0.0.0/8`, or IPv6 `::1`, and require HTTPS otherwise. Project create, join, unbind, and rebind SHALL require explicit UI/system intent.

**Owning PR:** PR 1 contracts, PR 6 binding, PR 10 flow. **Acceptance criterion:** exact vectors cover POSIX root, Unicode/spaces, lexical symlink spelling, drive root/path, and UNC root/path; endpoint origin/loopback matrices pass; different paths join one project and paths never occur in URI, room, server DB, or logs. **Canonical path:** caller workspace scope -> one package path/endpoint validator -> local binding -> endpoint/project. **Expected failure:** `INVALID_ENDPOINT`, `PROJECT_NOT_FOUND`, or `PROJECT_BINDING_CONFLICT`. **Forbidden fallback:** path-derived identity, `realpath`/symlink identity, Agent path override, automatic link binding, permissive non-loopback HTTP, or silent rebind.

#### Scenario: Different paths share a project
- **WHEN** two users explicitly bind different workspace paths to the same existing project
- **THEN** both use the same Catalog/document rooms without transmitting either path

#### Scenario: Existing binding conflicts
- **WHEN** a workspace is already bound to another endpoint or project
- **THEN** the operation returns `PROJECT_BINDING_CONFLICT` until the user explicitly changes the binding

#### Scenario: Path and endpoint normalization vectors
- **WHEN** the validator receives `/`, `/work/α project/`, canonically equivalent Unicode, a lexical symlink spelling, `c:\\Work\\A\\`, `C:/`, UNC roots/paths, or an endpoint with forbidden origin components or transport
- **THEN** paths normalize by the frozen lexical rules, equivalent Unicode produces one key, and invalid endpoints return `INVALID_ENDPOINT` before binding or network access

### Requirement: Canonical rooms and reversible lifecycle
The service SHALL use exactly `v1/<projectId>/catalog` and `v1/<projectId>/document/<documentId>`, publish creation only after recoverable `initializing -> active`, and implement deletion only as reversible archive.

**Owning PR:** PR 5. **Acceptance criterion:** initialization crash recovery, archive disconnect/reject, and restore pass. **Canonical path:** lifecycle operation -> control row -> room -> Catalog overlay. **Expected failure:** typed initialization, `DOCUMENT_NOT_FOUND`, or `DOCUMENT_ARCHIVED`. **Forbidden fallback:** unknown-room auto-create, empty-room-on-load-error, physical delete, or alternate room name.

#### Scenario: Archive and restore
- **WHEN** an active document is archived and subsequently restored
- **THEN** writes/connections are rejected while archived and the same document accepts cached CRDT merge after restore

### Requirement: Disjoint truth ownership
Collaborative content and Catalog display overlay SHALL be authoritative only in their Y.Docs; identity, kind, schema, lifecycle, receipts, retention, and store order SHALL be authoritative only in SQLite control rows; raw asset bytes SHALL be authoritative only in the package file asset store; MIME, byte size, dimensions, storage key, and upload metadata SHALL have exactly one writer and be authoritative only in asset-service-owned SQLite rows; presence SHALL remain memory-only.

**Owning PR:** PR 2 poisoning proof; PR 5 enforcement. **Acceptance criterion:** malicious Human updates cannot change control state, asset fault injection never leaves bytes/metadata split, presence disappears on cleanup/restart, and every field has one writer. **Canonical path:** Human update -> collaborative subtree; server lifecycle/engine -> control rows; asset endpoint -> one asset service -> atomic file bytes plus SQLite metadata row; trusted session -> process-memory presence. **Expected failure:** malformed/unknown input is rejected or ignored without authority change, while asset/storage failure returns a typed error and publishes neither durable bytes nor metadata. **Forbidden fallback:** authoritative `system.*`, Y.Doc receipts, file-store metadata sidecar, content JSON/Markdown copies, duplicated title/lifecycle, persisted presence, or recovery from request bytes.

#### Scenario: Crafted control data
- **WHEN** a Human update creates or mutates `system.*` or an unknown Catalog entry
- **THEN** project/resource identity, kind, schema, status, receipt, and retention remain unchanged

### Requirement: Opaque service revision
Every observation SHALL carry server-issued opaque `stateVersion` `sv1:<bootEpoch>:<sequence>`; clients SHALL only pass and compare the complete value.

**Owning PR:** PR 1 type, PR 2 proof, PR 5 issuer, PR 6 propagation. **Acceptance criterion:** baseline/change/no-op/replay/restart semantics and cross-surface token parity pass. **Canonical path:** server issuer -> observation/result -> Broker/renderer pass-through. **Expected failure:** typed stale precondition. **Forbidden fallback:** state-vector/content hash, client derivation/parsing, or cross-restart equality claim.

#### Scenario: Change, no-op, replay, and restart
- **WHEN** content/Catalog/lifecycle truly changes, no-ops, a receipt replays, and the service restarts
- **THEN** real change allocates exactly one sequence, no-op/replay allocates none, replay returns its historical token with `replayed=true`, and restart uses a new boot epoch

### Requirement: One Human path and one Agent path
Human edits SHALL enter over package WS/WSS as admitted Yjs collaboration updates, while every Agent runtime SHALL enter through the generic Capability Broker and package HTTP(S) semantic endpoint; both SHALL mutate the same live room. Human ordering SHALL be `WS admission -> per-room queue -> live Y.Doc/store sequence -> broadcast -> debounced SQLite store`. Agent ordering SHALL be `Broker/HTTP -> same per-room queue -> shadow -> atomic room+receipt/control commit -> synchronous live apply -> broadcast -> response`; all subsequent room mutations SHALL wait while that durable commit is pending.

**Owning PR:** PR 5 and PR 6. **Acceptance criterion:** Human, Codex, Claude, and child Agent converge through production entrypoints after restart, and ordering tests distinguish Human live-before-store from Agent durable-before-live. **Canonical path:** the two explicitly ordered paths above converge at one per-room queue and live Y.Doc. **Expected failure:** `OFFLINE`, typed domain error, or governed denial. **Forbidden fallback:** raw update via IPC/MCP/SSE, runtime-specific implementation, private service bypass, second queue that races Agent commit, or second state.

#### Scenario: Concurrent Human and Agent edit
- **WHEN** Human clients edit while an Agent applies a stable-ID semantic operation
- **THEN** all clients converge without Agent whole-document or raw-update input

### Requirement: Fixed v1 service routes
The service SHALL expose only WS/WSS `/v1/collaboration`, POST `/v1/operations`, PUT and GET `/v1/assets/:assetId`, and GET `/v1/health` for v1 collaboration traffic, with no route aliases. `/v1/operations` SHALL be the single audience-gated semantic/lifecycle transport for UI/system-only project create/lookup and registered document operations; sharing the route SHALL NOT expose project create/lookup to Agent discovery. Join/bind/unbind/rebind SHALL remain UI/system-only local binding writes and SHALL NOT be remote service operations.

**Owning PR:** PR 1 contract and CLI health; PR 5 service; PR 6 audience integration; PR 11 packaging smoke. **Acceptance criterion:** source, packed CLI, and packaged Electron contract tests accept every listed method/path, reject historical/alternative aliases, and prove UI/system project create succeeds while Agent discovery/invocation cannot expose it. **Canonical path:** package contract constants -> one HTTP/WS router -> audience-gated package operation registry -> package clients. **Expected failure:** typed route/method/audience rejection or health-smoke failure. **Forbidden fallback:** `POST /v1/assets`, alternate Agent/project endpoint, Domain-specific Host proxy, parallel IPC route, transport-derived audience, or route string duplicated outside the package contract.

#### Scenario: Historical asset route is called
- **WHEN** a client calls `POST /v1/assets` instead of raw `PUT /v1/assets/:assetId`
- **THEN** the service rejects it and does not create an asset or compatibility redirect

### Requirement: Atomic bounded semantic mutation
An Agent request SHALL use UUIDv7 `operationId`, contain at most 100 operations and 1 MiB, validate entirely on the latest shadow room, and commit all content/control/receipt changes or none. Success SHALL be durable before live publication and response.

**Owning PR:** PR 2 ordering proof; PR 5 engine; PR 6-10 operations. **Acceptance criterion:** fault injection at each operation/commit boundary proves all-or-none and response-loss replay. **Canonical path:** per-room queue -> shadow -> one SQLite transaction -> synchronous live delta -> WS -> response. **Expected failure:** typed precondition/limit/domain result. **Forbidden fallback:** live-loop rollback, partial mutation, post-commit await/throw, second engine, or whole-resource Broker conflict.

#### Scenario: Batch operation fails
- **WHEN** any operation or limit check fails
- **THEN** room, control, version, and receipt remain unchanged

### Requirement: Byte-comparison idempotency
The service SHALL retain at most 5,000 canonical UTF-8 request byte records and SHALL compare repeated IDs directly byte-for-byte without hashes. Those bytes are the sole content-bearing persistence exception: they SHALL be deleted with the receipt and SHALL never be used for recovery or copied to logs, traces, audits, evidence, errors, or model context.

**Owning PR:** PR 5. **Acceptance criterion:** identical bytes replay; unequal bytes conflict; trimmed IDs expire. **Canonical path:** validated DTO encoder -> control receipt -> `Buffer.equals`. **Expected failure:** `OPERATION_ID_CONFLICT` or `OPERATION_ID_EXPIRED`. **Forbidden fallback:** fingerprint/hash, Y.Doc receipt, or expired-ID re-execution.

#### Scenario: Repeated or expired ID
- **WHEN** a retained ID has different bytes or an ID is below the retention floor
- **THEN** the service returns the matching typed error and performs no mutation

### Requirement: Durable SQLite recovery
The server SHALL verify WAL, `synchronous=FULL`, foreign keys, 5000 ms busy timeout, and 1000-page autocheckpoint; clean shutdown SHALL finish a flush barrier and successful truncate checkpoint; hard-kill recovery SHALL restore every server-observed `T-2s` update from DB plus WAL without the original writer.

**Owning PR:** PR 2 probe, PR 5 production baseline, PR 11 faults. **Acceptance criterion:** exact PRAGMAs, checkpoint `0,0,0`, zero WAL, missing/stale SHM recovery, integrity check, five seeds. **Canonical path:** one SQLite connection -> room/control transaction -> WAL -> recovery. **Expected failure:** nonzero startup/shutdown or typed storage error. **Forbidden fallback:** NORMAL/OFF, busy declared clean, SHM backup, or client IndexedDB counted as server recovery.

#### Scenario: Clean and hard shutdown
- **WHEN** normal shutdown or SIGKILL recovery is tested
- **THEN** normal shutdown proves a zero checkpoint/WAL and hard-kill recovery meets the server-only two-second boundary

### Requirement: Rich document behavior
Rich documents SHALL use one shared ProseMirror/Yjs schema with stable block IDs, readiness-safe initialization, incremental Agent writeback, origin-scoped Human undo, and bounded read/context.

**Owning PR:** PR 2 writeback, PR 6 skeleton, PR 7 feature. **Acceptance criterion:** required nodes/marks, concurrency, stable-ID operations, pure-delete revision, undo isolation, 300k/tombstone limits pass. **Canonical path:** package schema -> renderer or semantic transaction -> one Y.XmlFragment. **Expected failure:** typed target/schema/limit result. **Forbidden fallback:** Host-private editor, second schema, index/name addressing, whole Markdown/HTML/JSON overwrite, data URL, or workspace file.

#### Scenario: Agent changes one block
- **WHEN** an Agent targets a valid stable block ID
- **THEN** one incremental transaction changes the target and retains unrelated concurrent content

### Requirement: Base behavior and conflicts
A Base SHALL support stable-ID tables, fields, records, cells, and shared views within 20 tables, 2,000 rows/table, 50 fields/table, and 20 views/table. Non-text scalar cells SHALL retain concurrent unequal candidates for Human-only resolution.

**Owning PR:** PR 2 limit probe; PR 8 feature. **Acceptance criterion:** concurrency, order helper, virtualization, conflict rules, empty-only type change, dense/multi-table/near-20-MiB tests pass. **Canonical path:** one package model/order/validator -> renderer or engine -> Base Y.Doc. **Expected failure:** `CELL_CONFLICT_REQUIRES_HUMAN`, field-type error, or `LIMIT_EXCEEDED`. **Forbidden fallback:** LWW, index/name addressing, duplicate validators/sorters, implicit conversion, or advanced Base features.

#### Scenario: Concurrent scalar conflict
- **WHEN** clients write unequal normalized scalar values concurrently
- **THEN** every candidate remains, filter/sort excludes the cell, export is blocked, and only a Human resolves it

### Requirement: Comments, assets, and presence
Comments SHALL live in their document Y.Doc with stable identities and live relative anchors; image bytes/metadata SHALL use client UUID raw PUT and atomic validated storage; Human/Agent presence SHALL remain ephemeral and trusted-context-derived.

**Owning PR:** PR 5 assets, PR 9 collaboration, PR 10 portable anchors. **Acceptance criterion:** comment movement/orphan/retarget, image bounds/retry/cache, presence TTL/cleanup, and privacy pass. **Canonical path:** document model/asset endpoint/session memory. **Expected failure:** typed orphan, `ASSET_TOO_LARGE`, invalid image, or ID conflict. **Forbidden fallback:** second comment store, portable raw RelativePosition bytes, content hash/fingerprint, arbitrary attachment, data URL, persisted presence, or model-supplied Agent identity.

#### Scenario: Same asset ID retry
- **WHEN** an asset ID is uploaded again
- **THEN** byte-identical bounded input returns the old result and unequal input returns typed conflict without overwrite

### Requirement: Cached Human offline behavior
Only Humans SHALL edit hydrated cached resources offline. Agent reads/writes SHALL return `OFFLINE`, and create/share/archive/restore/upload SHALL remain unavailable offline.

**Owning PR:** PR 6 and PR 9. **Acceptance criterion:** cached edit/reconnect, rename reducer parity, disabled actions, archive retry suppression, and full disposal pass. **Canonical path:** IndexedDB -> local Y.Doc -> provider reconnect. **Expected failure:** `OFFLINE` or disabled UI. **Forbidden fallback:** Agent local queue/receipt, file mirror, offline lifecycle/upload, or clearing cached data on normal close.

#### Scenario: Human and Agent offline
- **WHEN** a hydrated Human and an Agent act while the center is unreachable
- **THEN** allowed Human edits merge after reconnection while the Agent receives `OFFLINE` and queues nothing

### Requirement: Sharing and snapshot exchange
The package SHALL use `sciforge://shared-documents/open?v=1&endpoint=<origin>&projectId=<uuid>&documentId=<uuid>` as a locator, and SHALL import/export Markdown, CSV, and ZIP only as explicit validated snapshots with shadow construction, stable-ID preservation, and atomic publication.

**Owning PR:** PR 10. **Acceptance criterion:** locator, corruption/limits, ID round-trip/conflict, anchor reconstruction, and Base-conflict export tests pass. **Canonical path:** one package parser/exchange model -> shadow -> initializing/active publish. **Expected failure:** `INVALID_IMPORT`, `IMPORT_ID_CONFLICT`, or unresolved conflict. **Forbidden fallback:** path/credential in locator, locator as auth, watcher/mirror, silent overwrite/remap, or readable files as runtime truth.

#### Scenario: Import identity conflict
- **WHEN** an import collides with a document ID or unequal bytes under an asset ID
- **THEN** it returns `IMPORT_ID_CONFLICT` and publishes nothing

### Requirement: One runtime limits validator
All UI, semantic-operation, import, and WS admission paths SHALL call one package validator for 500 resources/project, Rich 300,000 characters/200 images, Base limits, 20 MiB encoded room state, and request 1 MiB/100-operation limits before publication.

**Owning PR:** PR 1 contract; PR 5/7/8 production validators; PR 9/10 entry-path integration. **Acceptance criterion:** exact-boundary and one-over-boundary tests pass through UI, Agent, import, and WS production entrypoints with atomic rejection. **Canonical path:** production entrypoint -> one package validator -> admitted room transaction or typed rejection. **Expected failure:** `LIMIT_EXCEEDED` with zero room/control/receipt/version change. **Forbidden fallback:** soft/split limits, entry-specific validator, post-publication rejection, or test-only admission path.

#### Scenario: Room byte limit
- **WHEN** any entry path would produce more than 20 MiB encoded room state
- **THEN** the shared validator returns `LIMIT_EXCEEDED` and the operation publishes nothing

### Requirement: Fail-closed release evidence gates
Private-alpha release SHALL require the frozen early feasibility protocols plus production durability, privacy, packaging, installed-protocol, 50-client, and all five exact near-limit fixture matrices. Persistent evidence SHALL use the metadata allowlist; content canaries SHALL never persist outside bounded receipt bytes, which are excluded from evidence and every other persistent diagnostic surface.

**Owning PR:** PR 2 feasibility; PR 11 release. **Acceptance criterion:** 50-client broadcast p95 is below 200 ms and server RSS below 512 MiB; every 10-client near-limit fixture meets the same thresholds with zero crash/OOM/loss/error; canary search is zero across trace/audit/artifacts/errors/model persistence. **Canonical path:** frozen production harness -> JUnit/JSON/metrics metadata allowlist -> release decision. **Expected failure:** explicit blocked protocol/task or release blocker. **Forbidden fallback:** tiny-room substitute, inferred missing platform, content-bearing evidence, receipt-byte inspection, threshold downgrade, or test-only production path.

#### Scenario: Required evidence is absent
- **WHEN** any required platform, feasibility protocol, durability/privacy/packaging check, 50-client run, or exact near-limit fixture result is absent or fails
- **THEN** private-alpha release remains blocked

#### Scenario: Feasibility MUST fails
- **WHEN** package boundary, opaque revision, Hocus admission, poisoning, y-prosemirror, durability ordering, or near-limit protocol fails
- **THEN** dependent production PRs stop until the contract is explicitly revised, strict-validated, and re-approved
