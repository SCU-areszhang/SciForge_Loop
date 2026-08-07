## Purpose

Defines authoritative metadata propagation and privacy-preserving execution evidence for governed package capabilities so every Agent runtime observes and invokes the same effects, resources, and opaque revisions.

## ADDED Requirements

### Requirement: Broker descriptors are authoritative
Discovery, observation, and invocation SHALL propagate effect, audience, resource reference, and opaque state version from registered Broker descriptors/results rather than model output or runtime adapter inference.

**Owning PR:** PR 3. **Acceptance criterion:** UI/system/Agent matrices and cross-runtime contract tests prove identical registered metadata. **Canonical path:** package capability definition -> Broker -> generic Agent tool surface -> runtime. **Expected failure:** typed missing/incompatible capability or readiness error. **Forbidden fallback:** action-ID special case, runtime-specific schema/effect, model-supplied metadata, or duplicate provider.

#### Scenario: Model claims a different effect
- **WHEN** model output claims a read effect for a registered external mutation
- **THEN** governance uses the descriptor's `external-write` effect and confirmation policy

### Requirement: External mutations require governed confirmation
Project create and document create/apply/rename/archive/restore SHALL be registered as `external-write` operations requiring confirmation, while share SHALL be `compute`; local bind/join/unbind/rebind SHALL remain UI/system-only confirmed local writes and SHALL not be Agent operations.

**Owning PR:** PR 3 metadata support; PR 6/9/10 package registrations. **Acceptance criterion:** effect/audience/approval tests pass for every operation. **Canonical path:** descriptor policy -> Broker approval -> package handler. **Expected failure:** governed denial or typed audience/approval error. **Forbidden fallback:** marking remote mutation `workspace-write`, shared-document exception, bypassed confirmation, or exposing local binding to Agent.

#### Scenario: Agent invokes document mutation
- **WHEN** an Agent invokes a registered document mutation without completed confirmation
- **THEN** the Broker denies execution before the package handler runs

### Requirement: Opaque resource freshness passes through unchanged
The Broker and runtime adapters SHALL preserve the full server-issued state version and resource identity, and document apply SHALL use server stable-entity preconditions rather than Broker whole-resource revision concurrency.

**Owning PR:** PR 3 contract; PR 6 integration. **Acceptance criterion:** resource/version propagation, pure-delete change, no-op/replay, restart, and unrelated Human edit tests pass. **Canonical path:** server observation -> package adapter -> Broker resource -> runtime and back. **Expected failure:** typed server precondition failure or expired resource handle. **Forbidden fallback:** parsing/deriving token, content hash, Agent override, or false whole-resource conflict.

#### Scenario: Unrelated Human edit precedes Agent apply
- **WHEN** a Human changes an unrelated CRDT entity after Agent observation
- **THEN** Broker does not reject solely on whole-resource revision and the server evaluates the operation's stable-entity preconditions

### Requirement: Expected Domain errors remain typed
Package adapters SHALL preserve discriminated expected Domain failures through the generic tool result, while only unexpected transport or programming failures SHALL throw.

**Owning PR:** PR 3 generic propagation; package use PR 6-10. **Acceptance criterion:** `OFFLINE`, `PRECONDITION_FAILED`, conflict, archive, limit, and expired-ID tests do not become `handler_failed`. **Canonical path:** Domain `Result` -> package main adapter -> Broker structured result. **Expected failure:** original typed code. **Forbidden fallback:** catch-all string, raw cause, runtime-specific error rewrite, or hidden retry path.

#### Scenario: Server rejects a precondition
- **WHEN** semantic apply returns `PRECONDITION_FAILED`
- **THEN** every runtime receives that typed code and no generic handler-failed error replaces it

### Requirement: Domain idempotency passes through unchanged
The Broker and every runtime adapter SHALL transmit the caller-provided domain `operationId` unchanged and SHALL preserve the package result's receipt identity, `replayed`, `changed`, and before/after opaque versions without rewriting or inferring them. A Broker invocation ID SHALL remain distinct from the domain operation ID. Retrying the same domain ID and canonical request SHALL reach the package idempotency path even when the Broker invocation ID differs.

**Owning PR:** PR 3 generic envelope/result; PR 6 shared-document integration. **Acceptance criterion:** cross-runtime initial success, response-loss retry, replay, unequal-request conflict, and invocation-ID/domain-ID distinction tests produce identical package semantics. **Canonical path:** runtime input -> Broker governed envelope -> package adapter -> domain receipt/result -> Broker/runtime result. **Expected failure:** original typed `OPERATION_ID_CONFLICT` or `OPERATION_ID_EXPIRED`. **Forbidden fallback:** generated replacement operation ID, Broker-invocation ID reuse as domain ID, replay flag inference, receipt rewrite, runtime-local retry cache, or handler bypass.

#### Scenario: Response is lost and runtime retries
- **WHEN** a runtime retries identical canonical input with the same domain `operationId` but a new Broker invocation ID
- **THEN** the package receives the original domain ID and every runtime returns the original receipt and versions with `replayed=true`

### Requirement: Metadata-only persistent evidence
Capabilities marked content-sensitive SHALL create execution evidence from an explicit metadata allowlist containing only operation/action ID, redacted resource ID, effect, changed/replayed flags, before/after opaque versions, bounded counts, latency, and typed error code.

**Owning PR:** PR 3; canary PR 9/11. **Acceptance criterion:** plaintext/Base64/error-chain canaries prove zero persistent payload leakage. **Canonical path:** trusted Broker execution envelope -> metadata allowlist -> trace/audit. **Expected failure:** privacy/release gate failure. **Forbidden fallback:** copy-then-delete redaction, args/output/structured content, error/cause text, URI, endpoint, workspace path, reversible room name, or complete locator.

#### Scenario: Sensitive mutation succeeds or fails
- **WHEN** a content-sensitive operation returns success or typed failure
- **THEN** persistent evidence contains only allowed metadata and no content-bearing input, output, or error chain

### Requirement: Readiness fails visibly without fallback
Migrated package capability surfaces SHALL distinguish valid empty discovery from transport mismatch, incompatible contract, or missing required operation and SHALL block invocation without substituting empty data or a legacy path.

**Owning PR:** PR 3, after the active `unify-capability-broker` change completes tasks 10.2 and 10.4; shared-document integration PR 6. **Acceptance criterion:** the external prerequisite is complete before PR 1 Design Freeze exits, and PR 3 readiness/version-skew/missing-operation/resource-freshness/no-fallback tests pass before PR 6. **Canonical path:** versioned readiness handshake -> package activation/UI/Agent availability. **Expected failure:** visible typed readiness failure. **Forbidden fallback:** empty list, stale cached catalog, direct IPC/service/MCP call, or package-specific readiness exception.

#### Scenario: Required capability operation is absent
- **WHEN** activation discovers an incompatible Broker contract or missing required operation
- **THEN** package activation and new invocations fail visibly and no alternate path executes
