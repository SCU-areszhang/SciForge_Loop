## Purpose

Defines a generic, package-contributed external-URI ingress so installed Domain packages can receive bounded operating-system links without Host business parsing, feature IDs, or parallel browser navigation paths.

## ADDED Requirements

### Requirement: Generic owner-scoped URI handlers
The renderer SDK SHALL expose owner-aware handlers matched deterministically by scheme and authority, with `handled`, `deferred`, and `rejected` results and idempotent reverse-order disposal.

**Owning PR:** PR 4. **Acceptance criterion:** registration, duplicate/mismatch, ordering, result, and disposal tests pass without a Domain ID in Host core. **Canonical path:** manifest contribution -> renderer registry/coordinator -> package handler. **Expected failure:** typed registration/routing rejection. **Forbidden fallback:** central feature map, shared-document switch, package-private import, or a second handler registry.

#### Scenario: Package handler lifecycle
- **WHEN** an enabled package registers a valid scheme/authority handler and is subsequently disabled
- **THEN** matching envelopes route to that handler while active and no callback runs after disposal

### Requirement: Bounded OS delivery queue
Main and preload SHALL implement two ordered handoff FIFOs: main captures macOS `open-url`, cold-start argv, and early `second-instance` before preload availability; preload holds accepted envelopes until renderer subscription and acknowledgement. Each stage SHALL hold at most 64 envelopes of at most 8 KiB UTF-8, using the original main-capture timestamp and a five-minute TTL. Oversize, expired, or capacity-exceeding newest envelopes SHALL be rejected; existing older entries SHALL never be evicted to admit a new one. Main SHALL delete only after preload acceptance, and preload SHALL delete only after renderer acknowledgement.

**Owning PR:** PR 4. **Acceptance criterion:** cold/hot/early delivery, exact 64/65 capacity, 8-KiB boundary, five-minute expiry, handoff acknowledgement, listener setup, drain/live fan-out, unsubscribe, and shutdown tests pass on macOS/Windows/Linux argument forms. **Canonical path:** OS ingress -> generic main FIFO -> acknowledged preload FIFO -> renderer coordinator. **Expected failure:** typed `URI_TOO_LARGE`, `URI_QUEUE_FULL`, or `URI_EXPIRED` plus telemetry containing only stage/reason/bounded count/age bucket. **Forbidden fallback:** package-specific IPC/preload facade, content/time deduplication, evict-oldest, reset TTL at handoff, raw URI telemetry, unbounded queue, or direct business execution in main/preload.

#### Scenario: URI arrives before renderer readiness
- **WHEN** a valid generic envelope arrives before preload and renderer subscribers are ready
- **THEN** it remains bounded and ordered and is delivered exactly once when readiness is established

#### Scenario: FIFO capacity is exhausted
- **WHEN** a stage already holds 64 unexpired envelopes and a sixty-fifth arrives
- **THEN** the newest envelope is rejected with `URI_QUEUE_FULL`, all 64 older envelopes retain order, and telemetry contains no URI

### Requirement: Deferred routing follows local workspace identity
A `deferred` envelope SHALL retry only after the current Host workspace identity changes. The renderer coordinator SHALL hold at most 64 deferred envelopes, each at most 8 KiB and expiring five minutes after original main capture; oversize, expired, or capacity-exceeding newest envelopes SHALL be rejected without evicting older entries.

**Owning PR:** PR 4 foundation; PR 10 shared-document handler. **Acceptance criterion:** workspace switch, repeated equivalent link, 64/65 overflow, original-capture five-minute expiry, and no-handler tests pass. **Canonical path:** renderer coordinator FIFO -> current Host workspace -> same package handler. **Expected failure:** `URI_QUEUE_FULL`, `URI_EXPIRED`, or handler rejection. **Forbidden fallback:** polling, reset TTL, evict-oldest, endpoint/workspace business parsing in Host, silent package binding, or retry on unrelated render/layout events.

#### Scenario: Workspace switch resolves deferred link
- **WHEN** a handler defers because the current workspace is not eligible and the user changes workspace
- **THEN** the coordinator retries the same envelope against the current handler set

### Requirement: One package business parser and safe ingress
The shared-document package SHALL use one parser for OS envelopes and manual paste. The Host SHALL NOT parse its query, open `sciforge:` through the system browser, or accept renderer content navigation as another ingress.

**Owning PR:** PR 4 generic guard; PR 10 parser. **Acceptance criterion:** parser parity and `will-navigate`/external-protocol guards pass. **Canonical path:** OS/manual input -> generic envelope -> one package parser. **Expected failure:** typed malformed/version/endpoint/ID rejection. **Forbidden fallback:** second parser, query double-decode, `SAFE_EXTERNAL_PROTOCOLS` entry, `shell.openExternal`, or domain-specific Host branch.

#### Scenario: Renderer content contains a sciforge link
- **WHEN** rendered content attempts to navigate to `sciforge:`
- **THEN** existing navigation protection blocks it and no alternate ingress is created

### Requirement: Generic network policy is not authorization
Host CSP support SHALL be limited to generic required HTTP/HTTPS/WS/WSS connections and remote images without fixed shared-document origins, and documentation/tests SHALL NOT present CSP, CORS, Origin, UUID, or URI secrecy as authentication.

**Owning PR:** PR 4; release audit PR 11. **Acceptance criterion:** source/packaged build and policy audit pass with no fixed domain/port or public-security claim. **Canonical path:** generic Host packaging/CSP -> package endpoint validation -> private perimeter. **Expected failure:** build/policy/release blocker. **Forbidden fallback:** allowlisted concrete service, arbitrary executable protocol, or unauthenticated-public claim.

#### Scenario: Package uses a valid private endpoint
- **WHEN** an installed package connects to an endpoint allowed by its own contract
- **THEN** generic CSP permits the network class without the Host knowing that package's service origin
