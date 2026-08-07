## Context

See `proposal.md` for motivation and scope. The target branch already has a manifest-generated, process-separated Domain package system and one Capability Broker surface, but it has no Yjs/Hocuspocus collaboration data plane. Existing active OpenSpec work still leaves Capability readiness/no-fallback tasks 10.2/10.4 and Domain enablement/disposal tasks 15.1/15.3/16.3 incomplete; those are Design Freeze prerequisites for PR 1, not work to absorb into PR 0.

PR 0 is contract-only. It pins OpenSpec, creates this single change, and freezes decisions and evidence protocols. It does not create the Domain package, run a collaboration spike, start a server, modify production code, or repair unrelated baseline failures. Baseline on `origin/gui` before PR 0 changes produced:

- PASS: `capability:check`, `domain-sdk:test`, `domain-packages:test`, `typecheck`, and `build`.
- Existing failure: root `test` has a host-architecture assertion (`x86_64` versus `arm64`) and a Node SQLite build without FTS5 in Paper Radar.
- Existing failure: `test:electron-smoke-support` retains a `DeepSeek-GUI` path assertion.

The implementation is a toy-project private alpha. It deliberately avoids content hashes, upload fingerprints, snapshot hashes, cross-PR SHA ledgers, signatures, and other security theater. It does not weaken the external access-control boundary, typed validation, atomic persistence, or privacy requirements.

## Goals / Non-Goals

**Goals:**

- Freeze one canonical Human path and one canonical Agent path that converge on the same live Y.Doc and persistence transaction model.
- Keep shared-document backend and optional UI in one independently ownable Domain package/version with explicit main, renderer, server, contract, and CLI entrypoints.
- Keep the Host generic: manifest discovery, Domain SDK contracts, Capability Broker, and external-URI routing only.
- Make project identity stable across local paths and operating systems while retaining caller workspace scope as a Host-only local boundary.
- Make content, server control, assets, presence, and local binding ownership disjoint and testable.
- Establish early fail-closed feasibility evidence before production collaboration work.
- Preserve all still-valid historical product intent for rich documents, Base, comments, images, presence, offline editing, sharing, exchange, durability, and load.

**Non-Goals:**

- Public-production deployment, authentication, authorization, revocation, quotas, encryption/signing, or link secrecy.
- Browser editing, Docker, built-in TLS, server discovery, multi-node clustering, or service auto-provisioning by Electron.
- Workspace-file mirroring, watcher-based synchronization, Git checkpoint truth, or any second content store.
- Version history, review/suggest mode, mentions, notifications, global undo, or permanent deletion.
- Base formula, relation, lookup, automation, grouping, aggregation, forms, personal views, or attachment fields.
- Compatibility aliases for the superseded historical design.

## Decisions

### 1. One Domain package and two release artifacts

`@sciforge/domain-shared-documents` is the unit of ownership, versioning, installation, rollback, and release. Its pure contract and model are shared; Electron imports only explicit `main` and `renderer` package entrypoints, and the independent compiled Node CLI is delivered from the same package through `bin`, exports, and an `npm pack` tarball. The manifest declares only real Electron contributions and never declares `workspace-server`; the CLI is not an Electron sidecar and is not copied into `app.asar.unpacked`.

The Host discovers the package through the existing manifest/generated composition path. Adding or removing it cannot require a central ID switch, feature map, shared-documents preload facade, or root business service. A backend-only future Domain may omit renderer contributions.

Alternative rejected: a Host feature plus separately versioned server package. That would split ownership and allow contract drift. Alternative rejected: ship the CLI as an Electron sidecar. That would create a second deployment/lifecycle model not required by v1.

### 2. Private-alpha deployment boundary

The CLI defaults to `127.0.0.1`. A non-loopback bind requires both `--deployment-mode private-alpha` and `--acknowledge-external-access-control`; a non-loopback public origin must be HTTPS. All HTTP, WS, assets, and health routes must sit behind the same operator-controlled VPN, private network, firewall allowlist, or authenticated reverse-proxy perimeter. CORS, Origin checks, UUID unpredictability, and the sharing locator are not authentication.

The CLI provides no Docker image, TLS termination, user account, token, ACL, or public-production mode. Direct exposure to the public internet is unsupported and a release blocker. Public production requires a separate OpenSpec change covering authentication, authorization, revocation, and quota.

One `data-dir` permits one process; a second process fails quickly. Logs omit room names, project/workspace identity, content, and complete sharing locators.

### 3. Stable project registry and local binding

The server creates an immutable UUIDv7 `projectId`. Rooms are exactly `v1/<projectId>/catalog` and `v1/<projectId>/document/<documentId>`. An absolute workspace path is never uploaded, logged by the service, embedded in a room/link, or used as remote identity. The Capability Broker's caller-owned `workspaceId` remains independent.

The desktop package stores a local binding under package-owned user data:

```ts
type ProjectBinding = { endpointOrigin: string; projectId: string }
```

The binding key is the caller's normalized absolute workspace path. Normalization is lexical on the caller platform: no `realpath` or symlink collapse; Unicode NFC; `/` separators; no non-root trailing separator; case preserved except an uppercase Windows drive letter. Required vectors cover `/`, `/work/α project/`, a lexical symlink path, `c:\\Work\\A\\`, `C:/`, UNC roots, spaces, and canonically equivalent Unicode.

Project creation is an explicit UI/system flow that asks the server to allocate the ID. Join accepts only an existing project and requires explicit user confirmation. Unknown IDs return `PROJECT_NOT_FOUND`. Binding a workspace already bound to a different endpoint/project returns `PROJECT_BINDING_CONFLICT`; no silent switch is allowed. Unbind deletes only local binding. Rebind is an explicit confirmed replacement. A copied/cloned workspace at a new path starts unbound and may explicitly join the old project or create a new one.

Endpoint input must be an origin with no credentials, query, fragment, or extra path. Scheme/host are lowercased, default port and trailing slash removed. Plain HTTP is accepted only for exact `localhost`, IPv4 `127.0.0.0/8`, or IPv6 `::1`; non-loopback endpoints require HTTPS. Package helpers derive WS/WSS and asset URLs.

### 4. Disjoint writer matrix and truth ownership

Each project has one Catalog Y.Doc; each rich document or Base has one document Y.Doc. Ownership is:

| State | Authority | Allowed writers | Forbidden duplicate |
|---|---|---|---|
| Rich/Base/comment content and document display asset references | `rooms.state` raw Yjs state | Human WS updates; semantic engine | Markdown, JSON, CSV, preview state, control tables |
| Catalog title/order display overlay | Catalog Y.Doc | Human WS and shared Catalog reducer used by Agent rename | Control-table title copy |
| Project/resource ID, kind, schema, status, lifecycle timestamp | SQLite control rows | lifecycle/operation engine | Y.Doc `system.*` |
| Receipt, canonical request bytes, retention floor, store sequence | SQLite control rows | operation/persistence engine | Y.Doc receipt map |
| Raw asset bytes | package file asset store | asset service | SQLite BLOB, Y.Doc raw bytes, or content hash |
| MIME, byte size, dimensions, storage key, upload metadata | asset-service-owned SQLite rows | asset service | file-store sidecar metadata or Y.Doc metadata copy |
| Presence | process memory/awareness | current Human/Agent session machinery | persistence or trace |
| Workspace binding | package-owned desktop user data | confirmed UI/system flow | server or Agent input |

Catalog overlay entries only apply to resource IDs already registered in control rows. An unknown Y.Doc entry cannot create a resource. Missing overlay data for a registered resource means deterministic untitled/default order, not deletion or archive. Any `system.*` top-level data created by a malicious Human update is ignored by production code.

`catalogUpdatedAt` changes only with collaborative title/order metadata. `lifecycleUpdatedAt` changes only with active/archive lifecycle. Body edits never write the Catalog. Renderer may compose these values for display but cannot copy one authority into the other.

### 5. Server-issued opaque revision

`stateVersion` is a branded opaque string `sv1:<bootEpoch>:<sequence>`. Each server boot creates a UUIDv7 `bootEpoch` and a process-global increasing sequence. First load/observe of a resource or project list assigns a baseline token. Each accepted mutation that actually changes room content, Catalog overlay, or server-control lifecycle allocates one sequence and updates affected current tokens. Pure insert/delete/map-delete/overwrite all count as change. Rejection, no-op, awareness, and idempotent replay do not allocate.

Replay returns the original historical token plus `replayed=true`; a caller needing freshness re-observes. Restart changes `bootEpoch`, so equal content can have a different token. The token is freshness within one service boot, not a digest, integrity proof, identity, or cross-replica equality claim. Renderer, Broker, and Agent only transmit and compare the complete value; they do not parse it or derive a value from Y.Doc.

PR 1 creates only the branded type and package-owned issuer interface. PR 2 proves behavior with a test issuer. PR 5 adds the only production issuer. There is no content/state-vector hash, golden hash vector, or hash performance gate.

### 6. Canonical Human, Agent, and Capability paths

Human content path: package renderer model -> Y.Doc transaction -> Hocuspocus WS/WSS -> live room -> queued persistence. Agent path: runtime-neutral `discover/observe/invoke` -> Capability Broker -> package main adapter -> HTTP(S) semantic endpoint -> per-room semantic engine -> atomic SQLite commit -> same live room -> WS broadcast. Raw Yjs updates never travel through Electron IPC, MCP stdio, SSE, Agent events, or Workspace Host.

The service exposes exactly these v1 routes, with no aliases:

| Transport | Route | Purpose |
|---|---|---|
| WS/WSS | `/v1/collaboration` | Hocuspocus Human collaboration |
| POST | `/v1/operations` | audience-gated semantic/lifecycle operations: UI/system project create/lookup and registered document operations |
| PUT | `/v1/assets/:assetId` | raw bounded asset upload |
| GET | `/v1/assets/:assetId` | validated asset retrieval |
| GET | `/v1/health` | readiness/liveness response |

Human durability ordering is `WS admission -> per-room queue -> live Y.Doc/store sequence -> broadcast -> debounced SQLite store`; its accepted update becomes live before the queued store. Agent durability ordering is `Broker/HTTP -> per-room queue -> shadow -> atomic room+receipt/control commit -> synchronous live apply -> broadcast -> response`. While an Agent durable commit is pending, all subsequent Human and Agent mutations for that room wait in the same queue.

Project create and document create/apply/rename/archive/restore are `external-write + confirmation`; project create is UI/system only. Share only computes a locator and has `compute` effect. Join/bind/unbind/rebind are confirmed package-local userData writes, UI/system only, and absent from Agent tools. Human offline rename and Agent online rename share one Catalog reducer/validator. Create/archive/restore are server lifecycle operations and unavailable offline.

Sharing `/v1/operations` as transport never widens an operation's registered audience. Project create and project lookup are UI/system-only service operations; Agent discovery does not expose them. Join/bind/unbind/rebind never call a remote mutation route and remain local binding flows. Document operations are exposed only according to their Capability descriptors.

Broker whole-resource revision concurrency for document apply is `none`; stable-entity preconditions are checked by the server to avoid unrelated CRDT edits causing false conflicts. Broker still owns caller/resource/effect/approval/idempotency envelope. Expected domain failures return a discriminated `Result` with typed codes; only unexpected transport/programming failures throw. `PRECONDITION_FAILED`, `OFFLINE`, and other expected results cannot collapse into `handler_failed`.

### 7. Atomic semantic mutation and idempotency

An Agent request uses UUIDv7 `operationId`, contains at most 100 semantic operations, and is at most 1 MiB. The package encodes validated DTOs into deterministic UTF-8 JSON: schema-declared object order, omitted `undefined`, preserved array order, sorted map-like keys, then `JSON.stringify`. No general canonicalization or hashing library is added.

Within the per-room queue, the engine clones the latest live snapshot to a shadow Y.Doc; validates stable-entity preconditions, all operations, server-control preconditions, and limits; applies the complete batch to shadow; and computes one delta. Any failure returns zero content/control/version/receipt change. It never mutates live state in a loop and relies on an exception as rollback.

On success, one SQLite transaction durably writes the complete room BLOB and separate receipt/control rows, invalidates older delayed stores, then commits. Only after commit does an uninterruptible, synchronous, non-throwing, no-`await` critical section apply the validated delta to the live Y.Doc and publish. The response is sent last. Human/Agent mutations for that room queue behind a pending Agent durable commit. A crash after durable commit but before live apply recovers from SQLite; a non-crash path after commit has no new failure point.

The last 5,000 receipts retain canonical request bytes. A repeated ID with `Buffer.equals` bytes returns the original receipt. Different bytes return `OPERATION_ID_CONFLICT`. An ID below the retained floor with a trimmed receipt returns `OPERATION_ID_EXPIRED`, never a fresh execution. Trimming removes bytes and receipt together. These bounded bytes are never used to restore content or copied into log, trace, audit, or model context.

### 8. Hocuspocus admission and lifecycle

PR 2 must establish the exact protocol-aware hook/order that identifies awareness, Sync Step 1/2, and incremental update payloads before live apply. The production server follows that proven path. A whole Hocuspocus frame is never passed directly to `Y.applyUpdate`; a post-apply comparison is not described as pre-apply admission. If strict admission cannot be proven, the change is revised before PR 5 rather than adding fallback.

Project/resource creation uses a recoverable `initializing -> active` control state. Restart finishes or fails initialization explicitly; load/migration/store failure never becomes an empty room. Archive is reversible, disconnects live clients, blocks new Human/Agent writes, and keeps Y.Doc/assets. Restore re-enables connection and permits cached Yjs updates to merge.

### 9. SQLite durability and shutdown

The service uses one control/state `node:sqlite` connection. On every open it sets and verifies `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`, and `wal_autocheckpoint=1000`; mismatch fails closed. Persistence defaults to 500 ms debounce and at most 1,500 ms max debounce.

Clean shutdown stops accepts/writes, completes a room flush barrier, then runs `PRAGMA wal_checkpoint(TRUNCATE)`. Success requires the single integer tuple `busy=0, logFrames=0, checkpointedFrames=0` and a zero-length WAL before closing. `busy=1` is failure and produces nonzero exit.

Hard-kill recovery keeps the main DB and `-wal`; `-shm` is a transient index and may be absent or stale. The measured SLA boundary is kill time `T`: every update independently observed from the server before `T-2s` must recover from server SQLite alone, without the original writer reconnecting. PR 5 runs five fixed seeds before PR 11 repeats the final matrix.

### 10. Rich document model

Rich content is a shared ProseMirror/Yjs schema with paragraph, H1-H3, ordered/unordered/task lists, quote, code, link, simple table, math, marks, image placeholder/reference, and stable UUID block IDs. Initialization waits for IndexedDB hydration and, when online, initial provider sync; no path creates a default paragraph early. Server Agent edits locate stable IDs, build one ProseMirror transaction, and use the PR 2-proven y-prosemirror incremental writeback. Whole Markdown/HTML/JSON overwrite is forbidden.

Local undo uses origin-scoped `Y.UndoManager` and never undoes remote or Agent transactions. Rich reads page at 200 blocks/50,000 characters. The composer exposes only a user-selected bounded excerpt for the current call; no selection, closed overlay, offline, or abort returns no items.

### 11. Base model

A Base Y.Doc contains at most 20 tables; a table at most 2,000 records, 50 fields, and 20 named shared views. Table/field/record/view identity is stable UUID, never array index or display name. A package order helper compares composite fractional order keys and stable tie-breakers; UI, Agent, and export share it and never assume a generated key is unique.

Text cells use `Y.Text`. Number, single-select, multi-select, date, and checkbox use multi-value candidates. Concurrent unequal normalized values are retained; equivalent values collapse. An unresolved conflict is excluded from filter/sort, blocks export, and can only be resolved by a Human. Agent reports `CELL_CONFLICT_REQUIRES_HUMAN`. A batch is rejected only when its targeted cell conflicts, not because another cell does. Field type changes are allowed only if all cells in that field are empty; otherwise return typed failure with no implicit conversion.

Views support field order/width/hidden, AND filters, and at most five sort keys. Fixed-size row/column virtualization uses 10-row and 3-column overscan. Formula, relation, lookup, automation, grouping, aggregation, forms, personal views, and attachment fields remain absent.

### 12. Comments, assets, presence, and offline behavior

Comments live in the target document Y.Doc and support stable thread/reply IDs, plain text, actor/timestamps, create/reply/resolve/reopen, four target kinds, orphan reasons, and Human retarget. Rich live ranges use `Y.RelativePosition`; export uses `blockId + block-local offsets + quote` and reconstructs positions only after stable content IDs exist. Agent cannot retarget.

Clients preallocate UUID `assetId`. Upload is `PUT /v1/assets/:assetId` with raw bytes, bounded `Content-Length`, allowed MIME, magic-byte validation, at most 10 MiB and 8192x8192. Storage is temp -> validate -> fsync -> rename -> DB commit. Optional display filename is metadata only. Same-ID retry returns the old result only if bounded metadata and bytes match exactly; otherwise typed conflict. No content hash, fingerprint, arbitrary attachment, data URL, or workspace-file fallback exists.

Human awareness is throttled to 100 ms and never persisted. Agent transient presence is derived from Broker `callerId + invocationId`, has start/end cleanup and 15-second TTL, and never accepts model-supplied identity. Content, comments, awareness, raw updates, paths, endpoints, and locators are excluded from persistent logs/traces/audits.

Offline is Renderer/Human-only and only for cached resources after IndexedDB hydration. Human may edit content/comments/Base and Catalog title/order. Offline create/share/archive/restore/upload are disabled. Agent read/write returns `OFFLINE` and creates no local queue, receipt, or fallback. Cleanup order is observers/timers -> awareness -> Editor -> provider -> IndexedDB persistence without `clearData()` -> Y.Doc -> final shared socket/Blob URL release.

### 13. Sharing, URI ingress, and snapshot exchange

The v1 locator is `sciforge://shared-documents/open?v=1&endpoint=<origin>&projectId=<uuid>&documentId=<uuid>`. It contains no workspace path or credential and is a locator, not authorization. System deep link and manual paste call one package parser. The Host only validates/routs a generic `sciforge:` envelope; it does not parse the business query, add `sciforge:` to external-browser allowlists, or let renderer content navigation form a second ingress.

The generic external-URI layer captures macOS `open-url`, cold argv, and early `second-instance` through two bounded FIFO stages. Main owns OS capture before preload availability; preload owns delivery before renderer subscription. Each stage holds at most 64 envelopes, each envelope is at most 8 KiB UTF-8, and each envelope expires five minutes after its original main-process capture time. An oversize, expired, or capacity-exceeding newest envelope is rejected; existing older entries are never evicted to admit it. Main transfers in order to preload and deletes only after preload acceptance; preload delivers in order and deletes only after renderer acknowledgement. Overflow/expiry telemetry contains only stage, reason, bounded counts, and age bucket—never the raw URI. `deferred` routing retries only after local workspace identity changes and uses a separate renderer coordinator FIFO with the same capacity, size, original-capture TTL, and reject-newest policy. Exact ingress envelopes are delivered once; a subsequent equivalent locator may intentionally refocus.

Markdown/CSV/ZIP are explicit snapshots, never runtime truth or watched mirrors. Rich ZIP and multi-table Base ZIP use `manifest.json` plus machine-readable structural data as import authority; readable Markdown/CSV is exchange material. Imports fully validate and build shadow Y.Doc/control state before atomic `initializing -> active` publication. IDs are preserved when conflict-free. Existing document IDs or unequal bytes under the same asset ID return `IMPORT_ID_CONFLICT`; no overwrite or random remap.

### 14. Limits, privacy, and release evidence

Limits are one package validator shared by UI model, semantic engine, import, and server admission: 500 resources/project; Rich 300,000 characters and 200 images; Base limits above; request 1 MiB/100 operations; room encoded full state 20 MiB. The room byte limit wins over nominal counts, so simultaneous theoretical maxima are not promised.

The 50-client loopback gate uses 50 isolated Node child clients plus server, 30-second warmup, 120-second measurement, at least 1,000 1-KiB updates, and seeds `1103, 2207, 3301, 4409, 5519`. Sender timing starts before mutation; every receiver reports apply by IPC. All receiver samples retain IPC overhead. Broadcast p95 is below 200 ms, server measurement RSS below 512 MiB, and errors/missing receivers/leaks are zero.

Near-limit evidence covers the five deterministic fixtures frozen below. Each uses 10 clients, 5 seconds warmup, 20 seconds measurement, at least 200 accepted 1-KiB updates during measurement, a forced store every 2 seconds, and a 60-second fail-closed timeout for each load/sync/measure/store/restart phase. It records visible/encoded size, cold load, full sync, broadcast, forced store, restart, RSS/heap, and event-loop p50/p95/p99/max. Broadcast/RSS retain the same thresholds; crash, OOM, lost update, and unhandled error are zero.

Persistent evidence stores only redacted IDs, counts, status, timings, and resource metrics. A selected-content canary may occur only in the transient current model input; selected and unselected canaries, comments, awareness, and raw updates never appear in full-trace, audit, evidence artifacts, error chains, or persistent model context. The sole bounded persistence exception is the canonical request bytes stored with an idempotency receipt for direct byte comparison; those bytes are never used for recovery and never copied to logs, traces, audits, evidence, errors, or model context, and are deleted atomically with the receipt.

### 15. Frozen PR 1 and PR 2 feasibility protocols

All protocols use Node 22.13.x or >=24 supported by repository dependencies, exact locked packages, temporary data directories, dynamic ports, no production manifest wiring for PR 2, JUnit plus JSON summary, and fail-closed cleanup. Evidence includes protocol ID, dependency versions, seed, fixture, timeout, assertions, measured values, status, and first failure; never content or local paths.

| Protocol / owner | Fixed fixture and input | Assertions / timeout | Stop rule |
|---|---|---|---|
| PR1 package boundary / Build Agent | Deterministic fresh package skeleton; health-only compiled CLI; packed tarball; Electron main/renderer metafiles; seed `N/A—deterministic` | Build, install, launch, health, clean exit; server-only imports absent from renderer; 120 s | Stop PR1 if CLI is not independently installable or generic Domain build cannot produce all artifacts |
| PR2 opaque revision / Revision Agent | One catalog, one Rich room; insert, delete, map-delete, overwrite, Catalog/lifecycle, no-op, awareness, rejection, replay, restart; seed 1103 | Exact allocation/non-allocation and replay semantics; monotonic within boot; new bootEpoch; client pass-through; 60 s | Stop PR5/6; revise the revision contract, never add hash fallback |
| PR2 Hocus admission / Protocol Agent | Encoded awareness, Sync Step 1/2, incremental update, malformed/oversize variants; seed 2207 | True update identified and admitted before live apply; full frames never passed to `Y.applyUpdate`; 60 s | Stop production WS work if hook/order cannot satisfy pre-apply admission |
| PR2 control poisoning / Model Agent | Crafted `system.*`, unknown Catalog entries, delete/replace/nested/pending/out-of-order/restart updates; seed 3301 | Control-row snapshots byte-for-byte unchanged except legitimate content store; 60 s | Stop PR5/6 if Human data can influence control authority |
| PR2 y-prosemirror / Rich Agent | Paragraph/list/marks/stable-block-ID schema and concurrent unrelated edit; seed 4409 | Incremental target change, stable IDs/marks retained, unrelated edit retained, no whole-doc payload; 60 s | Stop Rich/Agent chain; no Markdown/JSON overwrite fallback |
| PR2 durability ordering / Persistence Agent | Shadow batch, room+receipt transaction, old delayed store, response loss; injection matrix below; seed 5519 | Exact per-injection state, durable-before-live, stale store cannot overwrite, retry returns original receipt; 120 s per injection | Stop server work if ordering cannot be made atomic |
| PR2 near-limit probe / Performance Agent | Five final-capacity fixtures below; 10 clients; 5 s warmup; 20 s measurement; >=200 accepted 1-KiB updates; forced store every 2 s; seeds 1103/2207/3301 | Target encoded range, load/sync/broadcast/store/restart, event-loop/RSS; p95 <200 ms, RSS <512 MiB, zero crash/OOM/loss/error; 60 s per phase | Stop PR5/6 if frozen limits cannot meet budgets; revise contract before continuing |

The durability protocol injects one process termination at each named point and then restarts from server SQLite plus WAL, without writer IndexedDB:

| Injection point | Required post-restart state and retry result |
|---|---|
| Before transaction | room, control, receipt, and version all unchanged; retry executes once |
| After room write, before receipt | transaction rolls back; all state unchanged; retry executes once |
| After receipt write, before commit | transaction rolls back; all state unchanged; retry executes once |
| After commit, before live apply | room/control/receipt/version are durable and recoverable; pre-crash live apply may be absent; retry returns original receipt with `replayed=true` |
| After live apply, before response | complete success is durable and visible after restart; retry returns original receipt with `replayed=true` and allocates no version |
| Older debounced Human store scheduled before Agent commit; callback released after commit | store-sequence guard rejects the stale callback; committed Agent room/control/receipt/version remain byte-for-byte unchanged and retry returns the same replay receipt |

The PR2 and PR11 near-limit generators reuse these exact final-capacity fixtures. `xorshift32` uses unsigned 32-bit state and, in order, `x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0`. Every fixture starts its own entity counter at 1 and assigns stable IDs in creation order as lowercase UUID strings `00000000-0000-4000-8000-<counter as 12 lowercase hex digits>`. Text payload character `i` is `abcdefghijklmnopqrstuvwxyz[next() % 26]`. Rich fixtures use exactly 300 paragraph blocks of exactly 1,000 visible UTF-16 code units each; the first 200 paragraphs are each followed by one image-reference block, and blocks/images receive IDs in document order. Dense Base uses one table, 50 text fields, then 2,000 records; every one of its 100,000 `Y.Text` cells is initialized with exactly 16 generated lowercase characters. Multi-table Base creates 20 tables in order, each with 50 text fields, 100 records, and 20 named shared views; every one of its 100,000 `Y.Text` cells is initialized with exactly 16 generated lowercase characters, and each view contains field order only with no filters/sorts/hidden fields. Table, field, record, and view IDs follow their creation order through the single fixture counter. Near-limit Base appends to those `Y.Text` cells with one `Y.Text.insert(currentLength, generated256)` transaction per visited cell. Encoded-size ranges are measured with `Y.encodeStateAsUpdate` after fixture construction and before clients connect; a fixture outside its range is `fixture-invalid`, not a performance sample.

| Fixture | Seed | Deterministic construction and target |
|---|---:|---|
| Fresh Rich | 1103 | exactly 300,000 visible UTF-16 code units in stable-ID paragraph blocks and exactly 200 image references; encoded state <=20 MiB |
| Churned Rich | 1103 | start from Fresh Rich; xorshift32(seed) selects `block = next() % blockCount` and `offset = next() % (blockLength + 1)`; insert exactly 1,024 lowercase ASCII characters from successive `next() % 26`, then delete those same 1,024 characters; encode after each pair and stop at the first state >=19.0 MiB; result must be <=19.5 MiB |
| Dense Base | 2207 | one table, 2,000 records, 50 fields, exactly 100,000 populated scalar cells; encoded state <=20 MiB |
| Multi-table Base | 3301 | 20 tables, each 100 records and 50 fields, exactly 100,000 populated scalar cells and 20 views/table; encoded state <=20 MiB |
| Near-limit Base | 3301 | start from Multi-table Base; traverse table, record, then field by stable-ID lexical order in repeated round-robin passes; append exactly 256 lowercase ASCII characters from xorshift32(seed) to each visited scalar cell; encode after each full cell append and stop at the first state >=19.0 MiB; result must be <=19.5 MiB and within every count limit |

Failure matrix categories are `fixture-invalid`, `protocol-unobservable`, `assertion-failed`, `timeout`, `resource-budget`, `dependency-incompatible`, and `environment-unsupported`. Only `fixture-invalid` may be corrected without contract review. Any other MUST failure marks the affected OpenSpec task blocked, keeps a minimal reproduction, and stops dependent production PRs. The Integrator may change proposal/design/spec/tasks in PR 2 only through an explicit maintenance review, strict revalidation, and renewed maintainer confirmation; no fallback or threshold downgrade is implicit.

## Superseded decisions

| Historical PLAN decision | Effective v1 decision | Reason / evidence owner |
|---|---|---|
| Public center with no auth; anyone with link edits | Private-alpha perimeter, loopback default, explicit guarded non-loopback; direct public is blocked | A locator is not authentication; PR11 deployment evidence |
| Absolute normalized workspace path is project ID and room component | Server UUIDv7 `projectId`; path is local binding key only | Cross-platform collaboration and path privacy; PR1/6/10 tests |
| First valid link automatically binds | Explicit confirmed join; conflict never silently switches | Prevent accidental project/endpoint reassignment; PR10 tests |
| Catalog Y.Doc owns lifecycle/schema/identity | Catalog owns display overlay; SQLite owns identity/schema/lifecycle | Human raw updates cannot be an authority boundary; PR2/5 poisoning tests |
| Document `system` Y.Map owns kind/schema/Agent receipts | No authoritative `system.*`; control rows own schema and receipts | One disjoint writer matrix; PR2/5 tests |
| Receipt and content share one Y.Doc transaction | Room BLOB plus separate receipt/control rows share one SQLite transaction | Durable idempotency across response loss and restart; PR2/5 tests |
| `stateVersion` comes from state vector/content hash | Server opaque `sv1:<bootEpoch>:<sequence>` | Freshness without hashing or cross-copy claims; PR2/6 tests |
| Operation or asset fingerprint/hash | Canonical request bytes or bounded direct byte comparison | Toy-project simplicity and exact retry semantics; PR5/9 tests |
| `POST /v1/assets` multipart-style upload | `PUT /v1/assets/:assetId` raw bounded bytes | Client-owned retry identity and simple validation; PR5/9 tests |
| Asset Y.Doc stores URL/width/height | Y.Doc stores display reference/attrs; asset DB owns raw-storage metadata | Eliminate duplicated authority; PR9 tests |
| Hocuspocus direct connection is assumed safe | Protocol-aware pre-apply admission must first pass PR2 | Avoid whole-frame and post-check false guarantees |
| Technical spikes occur during server/Rich implementation | PR1 package gate plus independent PR2 test-only gate | Fail before production investment |
| Max debounce equals 2 seconds | 500 ms debounce, <=1,500 ms maximum, measured 2-second SLA | Leave scheduling margin; PR5/11 durability |
| Clean shutdown only waits for `Server.destroy()` | Flush barrier plus verified TRUNCATE checkpoint tuple and zero WAL | Observable zero-loss shutdown; PR5/11 |
| Hard-kill recovery may rely on writer IndexedDB reconnect | Server-only DB+WAL recovers every independently observed `T-2s` update | Separates server durability from client repair |
| Late 50-client tiny-room benchmark is sufficient | Early 2/10-client gates plus final 50-client and near-limit matrices | Small-room success does not prove persistence near capacity |
| Live RelativePosition bytes are exported directly | ZIP uses block-local anchor and reconstructs RelativePosition | Relative positions are Y.Doc-specific; PR10 round trip |
| Heavy baseline/merge/review SHA ledger and content/hash checks | Branch/worktree/status, real artifacts, ordinary Git history; no manual SHA ledger | Toy-project workflow; all PR Integrators |

Historical intent retained without change includes: one Catalog and one Y.Doc per document, Y.Doc-first content, stable IDs, rich/Base feature surface, multi-value scalar conflicts, explicit snapshot import/export, cached Human offline editing, reversible archive, Agent stable semantic operations, bounded reads/context, 50-client target, no Host domain hard-code, and no second truth source.

## Risks / Trade-offs

- [No application-layer auth in v1] -> Fail closed to loopback unless operator explicitly acknowledges a real private perimeter; block public-production claims.
- [Full-room BLOB persistence can become expensive near 20 MiB] -> Early PR2 probe, PR5 production durability baseline, and PR11 near-limit matrix; revise limits before production work if budgets fail.
- [Strict per-room Agent durability pauses Human mutation briefly] -> Serialize only the affected room and retain debounced Human persistence outside Agent durable batches.
- [Boot-scoped revisions are not cross-restart comparable] -> Treat them only as opaque freshness tokens and require re-observation after restart/replay.
- [Catalog display metadata and control lifecycle can temporarily compose into partial UI] -> Deterministic defaults plus explicit initializing/active/archive state; never copy authority between stores.
- [Cached clients can reconnect with old updates after restore] -> Archive blocks connection; restore intentionally resumes CRDT merge and validators enforce current schema/limits.
- [Node 23 is unsupported by some target dependencies] -> Quality gates use Node 22.13.x or >=24; local Node 23 evidence is diagnostic only.
- [Existing target test failures can obscure regressions] -> Record exact baseline failures and compare focused PR0 validation; do not repair them in this change.

## Migration Plan

1. PR 0 freezes this change and strict-validates all artifacts; no runtime migration occurs.
2. PR 1 creates the package/contract/CLI skeleton and exact dependency graph, then passes the package-boundary gate.
3. PR 2 runs test-only feasibility. A MUST failure stops dependent PRs and triggers the frozen change procedure.
4. PR 3 and PR 4 add only generic Capability metadata and external URI foundations.
5. PR 5 adds the server/control plane; PR 6 proves the canonical Human+Agent walking skeleton before Rich/Base expansion.
6. PR 7-10 add complete feature slices without replacing the canonical paths.
7. PR 11 supplies durability, privacy, load, packaging, installed-protocol, and private-alpha evidence.
8. After PR 11 is merged and every task/acceptance criterion is complete, PR 12 archives the change without `--skip-specs`.

Each PR is independently reversible only if no merged downstream depends on it. Otherwise revert in reverse dependency order. Before reverting a persistence-schema PR, verify the prior binary can read current data or restore a SQLite-safe backup. No compatibility shim or dual registration is introduced for rollback.
