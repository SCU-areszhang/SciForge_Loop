## ADDED Requirements

### Requirement: Broker wire changes use one explicit contract version

The descriptor, registry, SDK, IPC, preload, renderer-client, and generated-document representations in this change SHALL bump `CAPABILITY_BROKER_CONTRACT_VERSION` exactly once from `1` to `2`. Every boundary SHALL carry and validate version `2`; a mixed V1/V2 descriptor, registry snapshot, invocation, or result SHALL fail closed before discovery or dispatch. No compatibility alias, default-field upgrade, or dual parser is installed.

#### Scenario: Old and new Broker surfaces are mixed

- **WHEN** any producer or consumer presents contract version `1` after the Stage1 Broker train is active
- **THEN** composition or invocation fails closed
- **AND** no descriptor is silently upgraded with permissive defaults

### Requirement: Broker V2 migration audits every existing system caller edge

Before Broker V2 composition may activate, the generated repository inventory SHALL enumerate every existing descriptor whose audience contains `system` and every manifested system-caller edge in both source and packaged composition. Each descriptor SHALL make exactly one audited V2 choice: remove the unused `system` audience, or retain it with a non-empty duplicate-free list of exact manifest-derived `allowedSystemOwnerScopes`. An unaudited descriptor, wildcard, omitted or empty ACL, inferred action-prefix owner, and repository-wide compatibility default SHALL fail generation. V2 SHALL be one repository-wide migration, not a Stage1-only exception layered over permissive existing descriptors.

The existing `sciforge.project-dag` system call to `evidence-dag.view` SHALL remain functional only through `evidence-dag.view.allowedSystemOwnerScopes: ["sciforge.project-dag"]`. Source and packaged tests SHALL prove that exact owner can discover and invoke the action and that another system owner, a payload-claimed owner, and a descriptor without the explicit ACL are denied before handler lookup.

The existing `git-checkpoints.restore` to `version-control.restore` `inherit-current-action` call SHALL migrate to the typed chain. The outer `git-checkpoints.restore` descriptor SHALL grant the exact namespaced purpose `sciforge.version-control.restore`; the inner `version-control.restore` descriptor SHALL require that same purpose and SHALL declare `allowedSystemOwnerScopes: ["sciforge.git-checkpoints"]`. The caller and outer provider owners SHALL remain manifest-derived, while the existing Host-owned `version-control.restore` definition SHALL retain the immutable `HOST_CORE` provenance for module `sciforge.version-control`; no fictitious domain manifest may be created for it. Source and packaged tests SHALL prove the positive delegation and reject a mismatched purpose, any other system owner, payload/options purpose or provenance injection, detached invocation, and invocation after the outer scope closes, all with zero inner handler dispatch.

#### Scenario: Existing read edge survives the V2 migration

- **WHEN** the manifest-derived `sciforge.project-dag` lifecycle owner discovers and invokes `evidence-dag.view` in source or packaged composition
- **THEN** the explicit owner ACL admits that existing edge
- **AND** replacing or omitting that owner in the descriptor fails generation or invocation before handler lookup

#### Scenario: Existing restore edge uses a live typed purpose

- **WHEN** a currently confirmed `git-checkpoints.restore` outer invocation grants `sciforge.version-control.restore` and its owner-bound system invoker calls `version-control.restore` in the same workspace
- **THEN** the exact inner ACL and required purpose admit the registered child
- **AND** the outer invocation waits for the child and its commit lease before settling

#### Scenario: A legacy system descriptor was not migrated

- **WHEN** source or packaged generation finds a `system` descriptor with no audited caller edge, an omitted/empty/wildcard ACL, or an implicit permissive default
- **THEN** generation fails closed
- **AND** Broker V2 cannot activate partially

### Requirement: System owner ACL is declarative and enforced before lookup

The generic capability descriptor/registry SHALL support a strict `allowedSystemOwnerScopes` field. A descriptor containing the `system` audience SHALL declare a non-empty, duplicate-free list of exact `SystemOwnerScopeV1` values. A descriptor without the `system` audience SHALL NOT declare this field, including an empty list. Registration SHALL fail closed for either invalid shape; there is no omitted-field, empty-list, wildcard, or compatibility default that means “all system owners.”

`SystemOwnerScopeV1` SHALL use the manifest's stable `moduleId`; `moduleVersion` SHALL be audit metadata only so restart reconciliation survives package upgrades. The Host SHALL derive the caller owner from the activated manifest lifecycle, never request input. System discovery SHALL omit descriptors whose ACL does not contain that owner, and invocation SHALL reject a disallowed owner before handler, operation, resource, or domain-state lookup.

The registry SHALL retain exact Host-owned `CapabilityProviderProvenanceV1` beside every capability definition. It SHALL be the closed union `{ kind: "DOMAIN_MANIFEST", moduleId, moduleVersion, definitionDigest } | { kind: "HOST_CORE", moduleId, moduleVersion, definitionDigest }`. The first branch SHALL come only from the activated generated domain manifest definition; the second SHALL come only from an immutable Host-owned core definition in generated/compile-time composition. Both branches SHALL use a stable non-empty module ID/version and a verified lowercase definition digest. A factory, wire descriptor, handler, payload, environment value, or invoke option SHALL NOT supply or replace any provenance field. Authorization checks SHALL use the retained branch's `moduleId`, never an action-ID/package prefix or caller assertion.

Caller identity remains a separate rule: every system caller SHALL still derive `SystemOwnerScopeV1` from its activated domain manifest. A `HOST_CORE` provider does not create a core system caller, relax a caller ACL, or allow a caller-supplied owner. `version-control.restore` SHALL use `HOST_CORE` provider provenance for module `sciforge.version-control`, while its Git Checkpoints caller SHALL use manifest owner `sciforge.git-checkpoints`.

#### Scenario: Registered owner invokes an action

- **WHEN** the manifest-derived owner matches one declared system owner scope
- **AND** the target definition retains its verified `DOMAIN_MANIFEST` or `HOST_CORE` provider provenance
- **THEN** normal provider, effect, approval, purpose, workspace, and schema checks continue

#### Scenario: System ACL is absent or empty

- **WHEN** a descriptor declares the `system` audience without a non-empty exact owner ACL
- **THEN** registry validation rejects the descriptor
- **AND** no permissive default is installed

#### Scenario: Non-system action declares a system ACL

- **WHEN** a descriptor without the `system` audience declares `allowedSystemOwnerScopes`
- **THEN** registry validation rejects the descriptor
- **AND** the field cannot be used as inert or misleading metadata

#### Scenario: Another owner invokes an action

- **WHEN** another lifecycle owner discovers or invokes the descriptor, or supplies a claimed owner in payload
- **THEN** discovery omits it and invocation rejects before handler, operation, resource, or domain-state lookup
- **AND** no protected state or existence metadata is exposed

#### Scenario: Provider provenance is spoofed

- **WHEN** a definition factory, payload, environment value, or invoke option claims a provider kind, module ID, module version, or definition digest
- **THEN** the Host rejects the override before discovery, handler, or operation lookup
- **AND** authorization continues to use only the retained registry provenance without disclosing the registered provider

#### Scenario: Host core provider is authorized without a fake manifest

- **WHEN** manifest owner `sciforge.git-checkpoints` invokes the registered `version-control.restore` child with the exact ACL and purpose
- **THEN** the caller owner comes from the activated Git Checkpoints manifest and the inner provider owner comes from the retained `HOST_CORE` branch
- **AND** no domain-manifest alias, action-prefix inference, or factory override participates

### Requirement: Every confirmation-required invocation uses one Host-minted current-epoch flow

Every top-level invocation of a descriptor whose exact retained registered `approval` is `confirmation` SHALL use the single Host-orchestrated protected-invocation flow below, regardless of effect, scope, or whether its authenticated audience is `ui` or `agent`. This includes `workspace-write` actions such as `workflow-evolution.submit-requirement`, `workflow-evolution.record-promotion-decision`, and `workflow-evolution.open-rollback-recovery`, as well as every confirmation-required `destructive` or `external-write` action. The ordinary UI or Agent capability client, generic invoke endpoint, preload, Agent-tool bridge, and IPC router SHALL reject a direct invocation of any `approval=confirmation` descriptor before handler, operation, resource, or system-child lookup. Effect classification, a renderer confirmation dialog, an Agent assertion, a caller boolean, or an old destructive-only/external-write-only branch SHALL NOT bypass this rule. A protected system child is admitted only by the typed live inherited-authorization chain in the next requirement; it does not create a second top-level confirmation path.

For this requirement, `authenticatedCallerChannel` means the Host-owned live channel and operation principal for one authenticated top-level `ui` or `agent` caller. When that channel is established, the Host SHALL mint one `ProtectedInvocationCreationScopeV1` from exactly 32 cryptographically random bytes encoded as 43 unpadded base64url ASCII characters. The Host SHALL bind that opaque scope to the current `processEpoch`, exact channel/principal, caller audience, and manifest/Host-derived caller owner; target workspace/resource identity is bound per entry by `ProtectedInvocationScopeBindingV1`, not by the channel scope. The creation scope is correlation only, not approval, invocation identity, or permission. It is injected through the existing authenticated channel bootstrap as the exact closed output `{ contractVersion: 2, creationScope }`, not through a capability invocation or second confirmation path. The Host SHALL retain exactly one scope for that live channel and return the same output on an exact repeated bootstrap for that channel; no protected creation is accepted before bootstrap completes, and channel teardown invalidates the scope. The canonical UI or Agent client SHALL generate a stable `ProtectedInvocationRequestIdV1` as one lowercase RFC 4122 UUIDv4 for each protected initiation and SHALL retain both values unchanged for retries of that initiation. The Host SHALL reject a malformed ID, a creation scope on another channel/principal or caller owner, or a scope from another process epoch before protected-entry lookup. Neither a UI/Agent client nor the Host may silently substitute a new scope or request ID after failure or restart.

The only creation operation SHALL be `createOrGetProtectedInvocation`. Its exact closed request contains only `{ contractVersion: 2, creationScope, requestId, actionId, request }`, where `request` is the existing strict V2 invocation body with `actionId` and `invocationId` removed: exactly `{ input, resource?, expectedRevision? }`. `input` SHALL pass the registered action schema on first creation; `resource` and `expectedRevision` retain their existing strict Broker V2 schemas and conditional rules. Unknown fields and any caller-supplied scope binding, workspace identity, owner, effect, approval, provider identity, challenge, invocation ID, reference, or process epoch are rejected.

At registry registration, the Host SHALL mint one non-serializable `providerRegistrationId` unique to that live registration, including for Host-core registrations, and bind it to the retained `CapabilityProviderProvenanceV1`, descriptor version, effect, approval, input/output schemas, handler, and package lifecycle resource where applicable. Neither factory data nor wire input may supply or reuse this ID. On a first creation key, before deriving a target scope or resolving a resource, the Host SHALL resolve that retained registered descriptor and registration. The descriptor SHALL have contract version `2`, include the authenticated audience, and have exact `approval=confirmation`; otherwise `createOrGetProtectedInvocation` fails before entry creation, target/resource resolution, preview, or handler lookup and never becomes a second execution path for an approval-free action.

Only after those checks pass, the Host SHALL derive exactly one closed Host-private `ProtectedInvocationScopeBindingV1` from the retained descriptor and authenticated caller context:

```text
{ kind: "GLOBAL" }
| { kind: "WORKSPACE", workspaceIdentity: WorkspaceIdentityV1 }
| { kind: "RESOURCE", resourceRef, resourceKind, semanticRevision,
    workspaceIdentity: WorkspaceIdentityV1 | null }
```

`GLOBAL` is required for a registered `scope=global` descriptor and SHALL NOT require or bind a workspace even when the caller happens to have one. `WORKSPACE` is required for `scope=workspace` and uses the canonical Host-derived `WorkspaceIdentityV1`. `RESOURCE` is required for `scope=resource`; the Host SHALL validate and resolve the existing opaque resource handle, retain its Host `resourceRef`, exact registered kind and semantic revision, and include canonical workspace identity only when that resource is workspace-bound. The scope union is never wire input or output. A scope/handle mismatch fails before entry creation, and the confirmation preview renders a safe representation of this exact target rather than assuming every action has a workspace.

The Host creation key SHALL be exactly `(processEpoch, authenticatedCallerChannel, creationScope, requestId)`. The immutable caller-comparison tuple SHALL be exactly `(contractVersion, callerAudience, callerOwner, ProtectedInvocationScopeBindingV1, actionId, requestDigest)`. The immutable dispatch binding SHALL be exactly `(providerRegistrationId, providerProvenanceKind, providerOwner, providerModuleVersion, providerDefinitionDigest, descriptorVersion, effect, approval="confirmation")`. The Host SHALL compute `requestDigest` from the RFC 8785 UTF-8 bytes of the exact strict `{ input, resource?, expectedRevision? }` body. The entry SHALL retain both tuples, the exact canonical request, and no caller-selected authority.

One Host atomic `createOrGet` operation SHALL behave as follows:

1. if the creation key is absent, the registered descriptor passes the confirmation-only checks above, and capacity is available, the Host mints the invocation ID, an independent 32-random-byte unpadded-base64url `ProtectedInvocationReferenceV1`, and a Host-private challenge, commits one `AWAITING_CONFIRMATION` entry containing both immutable tuples and the exact canonical request, registers that nonterminal entry as a provider lifecycle/admission resource, and only then opens the trusted Host confirmation surface;
2. if the key already exists, its contract version, action, request digest, and creation-scope-bound caller fields match the stored caller-comparison tuple, and the current caller remains authorized for the stored target-scope binding, the Host returns the one current `ProtectedInvocationCreateAckV1` snapshot with the same retained target scope and reference without resolving or adopting a replacement provider, opening another preview, consuming another confirmation, registering a child, or dispatching a handler;
3. if the key exists but any caller-reproducible comparison field differs, the Host returns one generic `PROTECTED_INVOCATION_REQUEST_MISMATCH` before exposing the reference, state, result, or existence of the original tuple and leaves that entry unchanged; and
4. concurrent exact creates linearize to one created entry and one preview, while all losers execute the exact-match branch.

For an existing creation key, the Host SHALL validate the closed outer request shape, recompute the canonical request digest, and compare the action/digest plus the creation-scope-bound caller fields to the stored caller-comparison tuple. For a stored `WORKSPACE` target or workspace-bound `RESOURCE` target, it SHALL also derive and match the current canonical caller `WorkspaceIdentityV1`; for `GLOBAL` or a resource with `workspaceIdentity: null`, it SHALL neither require nor bind a workspace. It SHALL otherwise use the stored `ProtectedInvocationScopeBindingV1` and SHALL NOT re-resolve a current provider, re-normalize under a replacement schema, or require a now-expired resource handle merely to return the original acknowledgement. A different resource handle or revision changes the request digest and therefore mismatches; an identical request can still recover its reference or terminal result after provider quiescence without making the old provider executable.

Provider quiescence, unregistration, disablement, or replacement SHALL close protected admission before the registration changes, atomically cancel every bound `AWAITING_CONFIRMATION` entry, request canonical cancellation/containment for every bound dispatched entry, and wait until every such entry is terminal and has released its provider lifecycle/admission resource. A terminal entry may retain only its immutable public acknowledgement and correlation digests until process teardown; it SHALL NOT retain an executable handler or keep a provider active. Approval and, again, the dispatch-admission transition SHALL revalidate the exact live `providerRegistrationId`, complete retained provenance/definition binding, descriptor version/effect/approval, caller, target scope, request digest, and epoch. Unexpected drift terminalizes the entry as `FAILED` with zero handler dispatch. A same-module, same-version, or same-definition replacement is still a different registration and cannot adopt an old confirmation.

`ProtectedInvocationCreateAckV1` SHALL be the closed union below, with no unknown fields. `CapabilityInvocationResult` is the existing strict action-schema- and result-policy-governed public success envelope carried under Broker contract version `2`; the protected surface SHALL omit its optional invocation ID and every other Host-private field. Each non-success branch exposes only its fixed public code, with no message, cause, stack, provider diagnostic, challenge, tuple, or internal identity.

```text
{ contractVersion: 2, requestId, reference,
  state: "AWAITING_CONFIRMATION", confirmationExpiresAt }
| { contractVersion: 2, requestId, reference,
    state: "DISPATCHING" | "IN_FLIGHT" | "CANCELLING" }
| { contractVersion: 2, requestId, reference,
    state: "SUCCEEDED", result: CapabilityInvocationResult }
| { contractVersion: 2, requestId, reference,
    state: "DENIED", error: { code: "CONFIRMATION_DENIED" } }
| { contractVersion: 2, requestId, reference,
    state: "EXPIRED", error: { code: "CONFIRMATION_EXPIRED" } }
| { contractVersion: 2, requestId, reference,
    state: "CANCELLED", error: { code: "PROTECTED_INVOCATION_CANCELLED" } }
| { contractVersion: 2, requestId, reference,
    state: "FAILED", error: { code: "CAPABILITY_INVOCATION_FAILED" } }
| { contractVersion: 2, requestId, reference,
    state: "OUTCOME_UNKNOWN",
    error: { code: "PROTECTED_INVOCATION_OUTCOME_UNKNOWN" } }
```

`confirmationExpiresAt` SHALL be a canonical UTC RFC 3339 timestamp used only for display. The authoritative expiry SHALL use a Host monotonic deadline selected when the entry is created from one configured duration in the closed range 30,000–600,000 milliseconds. The creation commit SHALL precede both preview rendering and acknowledgement, so loss of the first create response cannot lose the creation correlation: an exact retry with the same scope, request ID, action, and request obtains the same reference and current result. A reference is still correlation authority only and its wire shape exposes none of its bindings. The Host SHALL index it only by `(processEpoch, authenticatedCallerChannel, reference)`; it SHALL NOT perform a global reference lookup and then disclose whether a channel or tuple mismatch occurred.

The Host SHALL render the exact action, safe target-scope representation, effect, and request-digest preview through its trusted confirmation surface and capture `APPROVE | DENY` only against the Host-private challenge. No ordinary UI, Agent, preload, Agent-tool, or IPC operation accepts the decision. Approval SHALL atomically validate both immutable tuples, the exact live provider registration, unexpired deadline, challenge, caller channel/principal, and current epoch; bind and consume one non-serializable single-use confirmation receipt; and transition the same entry from `AWAITING_CONFIRMATION` to `DISPATCHING`. That entry is the sole idempotency/single-flight record; approval SHALL NOT create a parallel store or accept a second payload. The Host then dispatches only the exact stored request. The transition `DISPATCHING -> IN_FLIGHT` SHALL revalidate the same registration and binding and is the one handler-dispatch admission linearization point.

The exact closed entry FSM SHALL be:

```text
AWAITING_CONFIRMATION -> DENIED | EXPIRED | CANCELLED | FAILED | DISPATCHING
DISPATCHING           -> IN_FLIGHT | CANCELLING | FAILED
IN_FLIGHT             -> CANCELLING | SUCCEEDED | FAILED | OUTCOME_UNKNOWN
CANCELLING            -> CANCELLED | SUCCEEDED | FAILED | OUTCOME_UNKNOWN
```

`DENIED`, `EXPIRED`, `CANCELLED`, `SUCCEEDED`, `FAILED`, and `OUTCOME_UNKNOWN` are terminal. Approval, denial, cancellation, monotonic expiry, and fail-closed provider-binding invalidation SHALL use one atomic transition; whichever leaves `AWAITING_CONFIRMATION` first wins, and every loser is a no-op that returns the winning state. No transition returns to `AWAITING_CONFIRMATION`, `DISPATCHING`, or `IN_FLIGHT`.

The one cancellation operation SHALL be `cancelProtectedInvocation({ contractVersion: 2, creationScope, requestId })`; it requires the exact originating channel, current scope, creation key, and current authorization for the stored target-scope binding under the same workspace/null rules as exact create retry, and accepts no action, request, reference, decision, invocation ID, or reason field. From `AWAITING_CONFIRMATION` it atomically enters terminal `CANCELLED`, invalidates the challenge, closes the preview, and performs zero handler lookup. If cancellation wins from `DISPATCHING` before the `IN_FLIGHT` handler-dispatch admission point, it enters `CANCELLING` and then terminal `CANCELLED` with zero handler dispatch. From `IN_FLIGHT` it enters `CANCELLING` and invokes only the canonical cancellation/revocation and `LiveChildRegistrarV1` containment path; final state reflects the authoritative attempt outcome and therefore may still be `SUCCEEDED`, `FAILED`, or `OUTCOME_UNKNOWN`. Cancellation returns the same closed acknowledgement union. Repeated cancellation and cancellation after terminal settlement only return the same current snapshot/result; they never dispatch, redispatch, reconstruct approval, or alter a terminal result. An unknown, wrong-channel, stale-scope, target-unauthorized, or mismatched cancellation fails generically before protected lookup.

Failure to open the trusted preview, or closing it without a decision, SHALL act as the same pre-dispatch cancellation. Authenticated caller-channel teardown SHALL atomically cancel an `AWAITING_CONFIRMATION` entry or request canonical cancellation/containment for a nonterminal dispatched entry, but SHALL retain the entry and all single-flight/settlement state until process teardown; it SHALL NOT rebind the entry or result to a later UI or Agent channel. Process teardown SHALL first invalidate every creation scope, reference, challenge, and unconsumed receipt, then drive the existing canonical cancellation, child-containment, and lease barriers for live attempts. No protected entry, reference, result, or creation key is persisted into the next process epoch.

The two observation requests SHALL be exactly `readProtectedInvocation({ contractVersion: 2, reference })` and `replayProtectedInvocation({ contractVersion: 2, reference })`; both are strict closed objects and reject unknown fields. The originating caller may use the first to receive the current `ProtectedInvocationCreateAckV1` snapshot of the existing entry and the second to await and return that same union in a terminal state in the same still-live process. Both require the exact originating authenticated channel/principal, creation-scope-bound caller audience/owner, current process epoch, and current authorization for the stored target-scope binding under the same workspace/null rules as exact create retry. The exact `createOrGetProtectedInvocation` retry is the bootstrap recovery route when the first acknowledgement—and therefore the reference—was lost. Creation, cancellation, read, and replay expose no other protected response shape or result channel. All operations resolve the one existing entry; none may create or confirm another invocation, reopen a preview, register another child, call the handler again, or execute another effect. A reference on another channel, a reference combined with another request, a reference supplied to generic invoke, or an unknown reference SHALL fail before protected lookup and disclose no protected existence.

Every created entry, including denied, expired, pre-dispatch-cancelled, consumed, and settled entries, SHALL remain non-evicting until the current process lifetime ends. A bounded-capacity implementation SHALL admit an exact retry of an existing key but reject a genuinely new creation when safe capacity is exhausted; it SHALL NOT LRU-evict, expire-and-reuse, overwrite, or recycle any creation key, reference, consumed receipt, invocation identity, result, or entry to make room.

A process restart creates a new epoch and invalidates an old creation scope, request retry, reference, invocation ID, challenge, receipt, and single-flight identity before entry, handler, operation, resource, or system-child lookup. The canonical client SHALL surface the interrupted initiation and SHALL NOT automatically obtain a new scope, reuse its request ID, replay the request, or expose an old result. Continuing any unfinished effect requires an explicit new user initiation with a new current-epoch scope, fresh request ID, Host preview, Host-minted invocation ID, and fresh confirmation, followed only by the capability's explicit durable reconciliation path. Restart SHALL NOT replay an old result, redispatch in background, or infer that authorization survived.

#### Scenario: The initial create acknowledgement is lost

- **WHEN** the Host committed the creation entry but the caller received neither `ProtectedInvocationCreateAckV1` nor its reference
- **AND** the same live channel retries `createOrGetProtectedInvocation` with the identical creation scope, request ID, action, and request
- **THEN** the Host returns the original reference and current snapshot or immutable settled result
- **AND** it opens no second preview and the handler, child registration, and protected effect still execute at most once

#### Scenario: A creation request ID is reused with different input

- **WHEN** the same live channel and creation scope reuse one request ID with a different valid action or request digest
- **THEN** the Host returns only `PROTECTED_INVOCATION_REQUEST_MISMATCH` before exposing the original reference, state, result, or existence
- **AND** the original entry and confirmation flow remain unchanged, while a wrong caller owner or target context is rejected earlier by creation-scope validation

#### Scenario: A confirmation-required workspace write is invoked

- **WHEN** the renderer initiates `workflow-evolution.submit-requirement`, `workflow-evolution.record-promotion-decision`, or `workflow-evolution.open-rollback-recovery`
- **THEN** the action uses `createOrGetProtectedInvocation` and the trusted Host confirmation surface exactly like every other `approval=confirmation` action
- **AND** generic invoke, renderer confirmation data, and the former destructive/external-write-only branch all fail before handler lookup

#### Scenario: An Agent or global action requires confirmation

- **WHEN** an authenticated Agent initiates a registered Agent-audience action with `approval=confirmation`, or a UI/Agent caller initiates a global confirmation-required action
- **THEN** its canonical client uses the same channel-bound creation scope, stable request ID, `createOrGetProtectedInvocation`, and trusted Host user-confirmation surface
- **AND** the Agent supplies no approval, a global action binds `{ kind: "GLOBAL" }` with no fabricated workspace, and neither case uses generic invoke

#### Scenario: Protected creation targets an approval-free action

- **WHEN** `createOrGetProtectedInvocation` names a retained descriptor whose approval is `none` or `system`
- **THEN** the Host rejects it before entry creation, preview, handler, operation, resource, or system-child lookup
- **AND** the protected surface cannot become a second execution route for that action

#### Scenario: A user approves the Host preview

- **WHEN** the Host-created entry is `AWAITING_CONFIRMATION` and the trusted Host confirmation surface records approval for its private challenge before the monotonic deadline
- **THEN** one atomic transition consumes the private receipt and dispatches only the exact request already stored in that entry
- **AND** no UI/Agent payload, generic IPC invocation, or second request can supply approval, an invocation ID, or replacement bytes

#### Scenario: Cancellation races approval or dispatch

- **WHEN** cancellation races Host approval while the entry is awaiting confirmation
- **THEN** exactly one transition wins; cancel-first performs zero handler lookup, while approval-first consumes the receipt at most once
- **AND** cancellation after dispatch admission uses only canonical containment and never claims that an already completed effect was cancelled

#### Scenario: Confirmation expires before a decision

- **WHEN** the Host monotonic deadline wins while the entry is still `AWAITING_CONFIRMATION`
- **THEN** the entry becomes terminal `EXPIRED`, its challenge and preview are invalidated, and zero handler lookup occurs
- **AND** an exact create retry returns that same terminal result instead of creating a new entry

#### Scenario: Exact result replay occurs in the same process

- **WHEN** the originating caller presents the Host-issued reference to read or replay in the same still-live process after confirmation was consumed
- **THEN** the Broker awaits or returns only that invocation entry's current snapshot or immutable result
- **AND** no live authorization is reconstructed and no handler or child is dispatched again

#### Scenario: Provider registration changes before dispatch

- **WHEN** the bound provider quiesces, unregisters, disables, or is replaced while its protected entry is awaiting confirmation or dispatched
- **THEN** the Host closes admission, terminalizes or canonically contains that exact entry, and releases the provider lifecycle resource before replacement
- **AND** a new registration cannot consume the old challenge or receipt, while an exact create/read retry may return only the retained old terminal acknowledgement

#### Scenario: A protected observation request is not V2-closed

- **WHEN** read or replay omits `contractVersion: 2`, adds any field beyond `reference`, or presents the reference from another caller channel or epoch
- **THEN** the Host rejects it before protected-entry lookup
- **AND** no state, result, provider, or target-scope existence is disclosed

#### Scenario: Caller channel teardown occurs

- **WHEN** the originating authenticated channel closes before or after dispatch
- **THEN** the Host uses the same FSM and canonical containment path, retains the entry until process teardown, and never rebinds it to a new channel
- **AND** a later UI or Agent channel cannot use the request ID or reference to learn the state or result

#### Scenario: A protected creation is retried after restart

- **WHEN** a caller presents an old creation scope, request ID retry, reference, invocation ID, challenge, receipt, or single-flight identity after the process epoch changed
- **THEN** the Broker rejects it before entry, handler, operation, resource, or system-child lookup
- **AND** it neither leaks the old result nor silently turns the retry into a new confirmed invocation

#### Scenario: A caller spoofs approval or safe capacity is exhausted

- **WHEN** a UI/Agent caller or payload supplies approval or an invocation ID, or all protected entries within the current process are at the configured safe bound
- **THEN** a genuinely new admission fails before lookup and dispatch while an exact existing-key retry remains readable
- **AND** no creation key, consumed confirmation, invocation entry, or immutable result is evicted, replaced, or reused

### Requirement: Inherited authorization is one typed, live, non-replayable chain

An outer descriptor MAY declare one `grantedAuthorizationPurpose`. A protected inner descriptor SHALL declare one `requiredAuthorizationPurpose`. Each field is either absent or one exact non-empty namespaced value; arrays, wildcards, aliases, and empty values SHALL fail registry validation. For capability-to-capability `inherit-current-action`, a granting outer descriptor SHALL have `effect=destructive` and `approval=confirmation`, while a requiring inner descriptor SHALL have `effect=destructive`, `approval=confirmation`, the `system` audience, and a valid non-empty system-owner ACL. The sole non-destructive grant admitted by V2 SHALL be a confirmed `external-write` outer descriptor granting exact `sciforge.workspace-publisher.export-audit` to the Host Workspace Publisher registration described below; it SHALL NOT authorize a capability handler or `enterCommit()`. Any other effect/purpose combination SHALL fail registry validation. Payload and invoke options SHALL NOT add, select, or override either field. Inheritance requires exact value equality and a currently approved exact outer invocation.

For every `inherit-current-action` dispatch, the Host SHALL create one non-serializable `InheritedAuthorizationChainV1` containing:

- `outerProviderOwnerScope`, retained from the approved outer definition's `CapabilityProviderProvenanceV1.moduleId`;
- `innerCallerOwnerScope`, derived from the system invoker's activated manifest lifecycle;
- `innerProviderOwnerScope`, retained from the target inner definition's `CapabilityProviderProvenanceV1.moduleId`;
- the exact `WorkspaceIdentityV1`;
- exact `outerActionId`, `outerInvocationId`, and `innerActionId`;
- outer and inner effects, both of which SHALL be `destructive`;
- the one exact authorization purpose;
- an unforgeable Host-owned `liveScopeToken`; and
- the Host-generated `processEpoch` unique to the current process lifetime.

For the Stage1 Workflow Evolution to Create Loop chain, `outerProviderOwnerScope` and `innerCallerOwnerScope` SHALL both be `sciforge.workflow-evolution`, while `innerProviderOwnerScope` SHALL be `sciforge.create-loop`. The inner descriptor's `allowedSystemOwnerScopes` SHALL contain `sciforge.workflow-evolution`. The Broker SHALL compare every field above before dispatch; display names, versions, package/action prefixes, and payload strings are not owner evidence.

The `liveScopeToken` SHALL exist only in Host memory, be bound to one process epoch and outer invocation, and be unavailable to JSON serialization, persistence, logs, payloads, options, receipts, or idempotency records. The inner provider SHALL receive only a Host-owned commit guard bound to this chain. Immediately before opening the protected database commit, it SHALL atomically call `enterCommit()` and hold the returned non-serializable commit lease through SQLite COMMIT/rollback. `enterCommit()` SHALL be only the capability-child typed facade over the canonical `LiveChildRegistrarV1` lease-entry transition defined below; it SHALL NOT implement a second liveness check, mutex, or admission path.

`enterCommit()` and every outer closure event—successful handler return, throw, cancellation, or revocation—SHALL be linearized by that one Host-owned synchronization primitive. If closure wins, `enterCommit()` fails and the provider performs zero protected writes. If `enterCommit()` wins, the later closure closes admission to every later lease and waits for that registered lease/child to commit or roll back before the outer invocation can settle. A plain `isLive()` check followed by an unguarded commit is invalid because it leaves a check-to-COMMIT race. A process restart creates a new epoch and invalidates every prior token/lease.

The Broker SHALL register each inherited child before dispatch and govern it through the exact registrar FSM below. A successful return, throw, cancellation, or revocation SHALL atomically close both new-child registration and lease entry for every registered child that has not acquired a lease. Closure SHALL cancel or terminalize every such unentered child and wait for its terminal containment; only a child whose `enterCommit()` linearized first may continue its protected transaction, and settlement SHALL wait for that lease to commit or roll back and release. Detached timers/Promises cannot register after closure, and fire-and-forget work cannot acquire a commit lease after any closing transition.

Persisted decisions, invocation IDs, operation IDs, request digests, receipts, serialized contexts, and durable domain records SHALL NOT recreate or extend this authorization. Only the preceding Host-owned invocation entry may await or return an exact replay result, and only within the same still-live process epoch; it SHALL NOT run a protected handler or protected commit. Result-delivery policy still applies: `TRANSIENT_HARNESS_COMPARE` replay returns only its durable digest/status receipt, never raw output. A missing or uncommitted protected mutation after settlement, or any continuation after restart, requires a newly approved outer invocation and a new chain.

#### Scenario: Workflow Evolution invokes Create Loop

- **WHEN** the approved outer provider is Workflow Evolution, its owner-bound system invoker is the inner caller, the target provider is Create Loop, workspace/action/invocation/effects match, and the single purposes are equal
- **THEN** the Broker creates a live chain for that outer invocation and process epoch
- **AND** Create Loop may commit only while its Host-owned guard remains live

#### Scenario: Purpose metadata is attached to an incompatible descriptor

- **WHEN** a granting descriptor is neither a confirmation-approved destructive capability parent nor the exact confirmation-approved external-write Workspace Publisher parent, or a requiring capability descriptor is not destructive, confirmation-approved, system-audience, and owner-scoped
- **THEN** registry validation rejects the descriptor
- **AND** no inheritance path is installed

#### Scenario: Successful outer action has a child

- **WHEN** a protected child is registered before the outer handler returns
- **THEN** successful return closes registration and unentered lease admission in one transition
- **AND** an unentered child is cancelled or terminalized, while a child holding a lease is awaited, before the outer action settles

#### Scenario: Outer action fails

- **WHEN** the outer handler throws, or the outer invocation is cancelled or revoked, before a child acquires its commit lease
- **THEN** the registrar enters `REVOKING` and wins the lease-entry linearization race
- **AND** `enterCommit()` fails with zero protected writes

#### Scenario: Successful return wins before commit entry

- **WHEN** successful outer return and a registered child's `enterCommit()` are released at the same injected boundary
- **AND** the return transition linearizes first
- **THEN** the registrar enters `CLOSING_SUCCESS`, denies the commit lease, and cancels or terminalizes the unentered child
- **AND** the provider performs zero protected writes and the registrar reaches `SETTLED` only after terminal containment

#### Scenario: Commit entry wins before successful return

- **WHEN** successful outer return and a registered child's `enterCommit()` are released at the same injected boundary
- **AND** `enterCommit()` linearizes first
- **THEN** the registrar records the lease before entering `CLOSING_SUCCESS`
- **AND** successful settlement waits for the registered transaction's COMMIT/rollback, terminal state, and lease release

#### Scenario: Commit entry races adverse outer closure

- **WHEN** provider commit entry races with outer throw, cancellation, or revocation
- **THEN** exactly one Host atomic order wins
- **AND** closure-first produces zero writes, while commit-first forces outer settlement to wait for the registered lease's COMMIT/rollback and release

#### Scenario: Owner or provider relation does not match

- **WHEN** the outer provider, inner caller, inner provider, allowed system owner, workspace, action, invocation, or effect differs from the typed chain
- **THEN** inheritance is denied before inner handler dispatch
- **AND** no protected state or existence metadata is exposed

#### Scenario: Purpose does not match

- **WHEN** a Promotion, rollback, cancellation, or other action attempts to inherit into a child requiring another purpose
- **THEN** inheritance is denied with zero handler dispatch

#### Scenario: Authorization metadata is supplied by a caller

- **WHEN** payload, invoke options, persisted data, or a serialized callback supplies a purpose, owner, process epoch, or live token
- **THEN** the invocation is rejected before child registration or handler/operation lookup
- **AND** it cannot create a child or pass a commit guard

#### Scenario: Fire-and-forget child was dispatched

- **WHEN** an inherited child dispatches before the outer handler returns but its Promise is not awaited by domain code
- **THEN** automatic registration still blocks successful outer settlement until the child is terminal
- **AND** the successful-return closing transition prevents a delayed protected commit unless `enterCommit()` already linearized first

#### Scenario: Exact result replay occurs in the same live process

- **WHEN** the Host-owned invocation entry receives the exact bound replay after the outer scope settled but while its process epoch remains live
- **THEN** no live authorization is reconstructed and only the immutable settled result is returned without handler dispatch
- **AND** every uncommitted protected mutation requires a fresh approved outer invocation

#### Scenario: Prior authorization is presented after restart

- **WHEN** a prior invocation ID, operation ID, receipt, serialized context, or durable record is presented after the process epoch changed
- **THEN** no old result is replayed and no live authorization is reconstructed
- **AND** rejection occurs before handler, operation, resource, or system-child lookup

### Requirement: Workspace publication uses the canonical live child registrar

The Broker SHALL own one Host-private `LiveChildRegistrarV1` for both protected capability children and Workspace Publisher children. Its exact closed outer-scope FSM is:

```text
OPEN -> CLOSING_SUCCESS -> SETTLED
OPEN -> REVOKING       -> SETTLED
```

`OPEN` is the only state that admits either a new child registration or a lease entry by an already registered child. While the registrar is `OPEN`, a successful outer handler return SHALL atomically transition it to `CLOSING_SUCCESS`; an outer throw, cancellation, or revocation SHALL atomically transition it to `REVOKING`. The first closing transition wins. A later outer signal MAY change the outer response outcome, but it SHALL NOT add a registrar state, reopen admission, or weaken the already established containment and wait barrier. `CLOSING_SUCCESS` and `REVOKING` SHALL reach `SETTLED` only after every registered child attempt is process-locally terminal and every acquired lease is released; there are no other transitions. Registrar-child terminality records completion of that process attempt and its containment only; it SHALL NOT fabricate or rewrite a durable Catalog, evaluation, or publication operation outcome. In particular, a contained publication attempt may be terminal to the registrar while its exact durable `TEMP_STAGED` operation remains resumable under a later fresh live scope.

Leaving `OPEN` SHALL be one indivisible Host operation that closes both new-child registration and lease admission for every registered child that has not yet acquired a lease. It SHALL cancel or terminalize each such unentered child and await its terminal containment. A registered child whose lease entry linearized first is not interrupted inside its protected effect; the registrar SHALL await its terminal state and lease release. Registration closure followed by a separate lease-admission closure, or the reverse, is forbidden.

The registrar SHALL expose one Host-private canonical lease-entry transition. It atomically verifies the current process epoch, registrar state `OPEN`, registered child identity/kind, and that the child has never acquired a lease, then marks that child leased. The Host-owned commit guard's `enterCommit()` and `WorkspacePublicationGuardV1.enterPublish()` SHALL be fixed typed facades over this same transition, differing only in child/lease kind and the protected effect held by the lease. Neither facade may implement a child-specific liveness flag, mutex, closure path, or fallback. The commit lease is held through database COMMIT/rollback; the publication lease is held through final publication durability and the durable publication operation outcome.

The typed `registerCapabilityChild(...)` and `registerWorkspacePublicationChild(...)` operations SHALL likewise share the same outer-scope FSM, process epoch, child set, closure barrier, and settlement wait. They are variants of one registrar, not domain-callable authorization APIs or parallel dispatch paths. A domain receives neither registrar, live token, guard constructor, nor serialized registration; invoking the owner-bound `WorkspacePublisherV1.publishNewFile` is the only public way to request the publication variant.

The `workflow-evolution.export-audit` descriptor SHALL have `effect=external-write`, `approval=confirmation`, UI audience, and singular `grantedAuthorizationPurpose="sciforge.workspace-publisher.export-audit"`. The Host Workspace Publisher registration SHALL require that exact purpose. Registration SHALL verify all of:

- the outer definition's retained `CapabilityProviderProvenanceV1.moduleId`;
- the publisher caller owner derived from its activated manifest, exactly equal to that outer provider module ID;
- the exact Host-bound `WorkspaceIdentityV1`;
- outer action and invocation IDs;
- outer effect `external-write` and current confirmation;
- exact publication ID and purpose;
- current process epoch and unforgeable live-scope token; and
- child kind `WORKSPACE_PUBLICATION`.

The Broker SHALL atomically register that child before publication-operation namespace lookup, byte copying, temporary-file creation, or native dispatch. A wrong owner, workspace, action, effect, purpose, publication ID, epoch, or closed admission SHALL fail before publication lookup and disclose no operation or destination existence. Factory data, payload, options, persisted operation data, lookup result, receipt, callback, or an earlier invocation SHALL NOT supply or recreate any field.

Successful outer return SHALL enter `CLOSING_SUCCESS`; outer throw, cancellation, or revocation SHALL enter `REVOKING`. Either transition SHALL atomically close registration and unentered publish-lease admission, cancel or terminalize every publication attempt that has not entered publish, and wait for its terminal containment. Only an attempt whose canonical lease entry linearized first may continue publication, and outer settlement SHALL wait for its terminal outcome and lease release. A detached Promise, timer, microtask, callback, or fire-and-forget call after closure cannot register or reach publication-operation lookup.

The registered child SHALL receive only Host-created `WorkspacePublicationGuardV1`. Its `enterPublish()` SHALL return a non-serializable `WorkspacePublicationLeaseV1` through the canonical lease-entry transition above and SHALL therefore linearize against outer return, throw, cancellation, and revocation using the same synchronization primitive as registration closure. If closure wins, `enterPublish()` fails and no final file is published; an already durable claim or staged temp remains only in the precise resumable state defined by the canonical publisher contract. If `enterPublish()` wins, later closure closes admission and outer settlement waits through atomic no-overwrite publication, final identity/digest verification, root durability flush where supported, durable receipt/failure commit, terminal state, and lease release.

The Broker SHALL NOT infer publication success, persist content bytes, or maintain a second publication idempotency store. The Host publication operation registry defined by `official-workbench-domain-packages` remains the sole durable namespace and `readPublication` remains the sole durable lookup. Its caller-stable publication ID and request digest are correlation/idempotency identities, not authorization. `readPublication` MAY report a prior result under current owner/workspace read authority but SHALL NOT register a child, enter publish, resume work, or mint a live scope.

A resumable `NOT_FOUND` or inactive `IN_PROGRESS` publication MAY be redispatched only by a new same-owner/workspace confirmed outer invocation granting the exact export purpose and using the exact publication ID/request digest. That invocation creates a new live child registration and process-epoch scope while reusing the one durable operation. Terminal `FAILED`, `CANCELLED`, or `OUTCOME_UNKNOWN` SHALL NOT redispatch. There is no background, compatibility, or direct-native resume path.

#### Scenario: Confirmed audit export registers before dispatch

- **WHEN** the currently confirmed `workflow-evolution.export-audit` handler calls its owner-bound Workspace Publisher in the same workspace
- **THEN** the Broker verifies the exact external-write purpose and atomically registers a `WORKSPACE_PUBLICATION` child before operation lookup or native work
- **AND** the publisher receives only the Host-created `WorkspacePublicationGuardV1`

#### Scenario: Publisher purpose or owner is injected

- **WHEN** payload, options, factory data, persisted state, or a serialized callback supplies an export purpose, provider/caller owner, workspace, live token, epoch, or publication registration
- **THEN** the Broker rejects the invocation before publication-operation lookup
- **AND** no operation, temp, destination, or receipt existence is disclosed

#### Scenario: Successful return wins before publication entry

- **WHEN** successful outer return and a registered publication child's `enterPublish()` are released at the same injected boundary
- **AND** the return transition linearizes first
- **THEN** the registrar enters `CLOSING_SUCCESS`, denies the publication lease, and cancels or terminalizes the unentered child
- **AND** no final file is published; an exact durable `TEMP_STAGED` operation remains governed only by the publisher recovery contract

#### Scenario: Publication entry wins before successful return

- **WHEN** successful outer return and a registered publication child's `enterPublish()` are released at the same injected boundary
- **AND** `enterPublish()` linearizes first
- **THEN** the registrar records the publication lease before entering `CLOSING_SUCCESS`
- **AND** successful settlement waits through no-overwrite publication or rollback, durable operation outcome, terminal state, and lease release

#### Scenario: Publication entry races adverse outer closure

- **WHEN** `enterPublish()` races outer throw, cancellation, or revocation
- **THEN** closure-first produces no final file, while publish-first forces settlement to wait through publication durability, operation settlement, and lease release
- **AND** the common Host synchronization primitive produces one atomic order

#### Scenario: Detached export tries to register

- **WHEN** a Promise, timer, microtask, callback, or fire-and-forget export reaches the publisher after the outer handler closed child admission
- **THEN** registration fails before publication-operation lookup or native dispatch
- **AND** neither a persisted publication ID nor a prior receipt reopens the scope

#### Scenario: Interrupted publication is resumed

- **WHEN** `readPublication` reports an exactly resumable absent or staged state after the prior outer confirmation ended
- **THEN** read-only lookup itself performs no dispatch
- **AND** only a fresh matching confirmation can register a new child and resume the one durable publication operation
- **AND** no second operation namespace, temporary file, or final filename is selected

### Requirement: Sensitive result policy is enforced on the canonical action

A capability descriptor MAY declare strict `EvaluationResultDeliveryV1` as a fixed mapping from Host-owned `EvaluationInvocationClassV1` to result policy:

```text
STANDARD_CONTROLLER             -> STANDARD_CONTROLLER_RESULT
LIVE_APPROVED_OUTER_CONTROLLER  -> STANDARD_CONTROLLER_RESULT
TRUSTED_SEALED_HARNESS          -> TRANSIENT_HARNESS_COMPARE
```

The Host SHALL derive the invocation class and exact operation principal from the active owner-bound invoker/profile; payload and invoke options SHALL NOT supply the class, target principal, channel, or policy. `TRUSTED_SEALED_HARNESS` SHALL be available only to the registered Workflow Evolution trusted-harness profile and its current Host-minted operation principal. `LIVE_APPROVED_OUTER_CONTROLLER` SHALL be available only while the same Workflow Evolution owner/workspace is executing a currently approved `workflow-evolution.execute-promotion` outer invocation whose registered granted purpose is the exact Promotion purpose.

The Broker SHALL atomically register a nested replay evaluation as that live outer invocation's child before target handler dispatch. The replay child has no protected-effect lease: it SHALL NOT call either `enterCommit()` or `enterPublish()`. Any outer return, throw, cancellation, or revocation SHALL use the common registrar FSM. Closure-before-registration yields zero replay handler dispatch; closure of a registered but nonterminal replay cancels or contains that unentered child and waits for terminal cleanup; a replay already terminal before closure remains terminal. A detached timer, Promise, callback, or persisted invocation reference that attempts registration after admission closes SHALL fail with zero replay handler dispatch. This class proves current invocation context only; it does not turn the approval-free `evaluate` action into a protected Catalog write.

The canonical controlled-evaluation request separately binds strict `ControlledEvaluationPurposeV1`. `CANDIDATE_SEALED` is valid only with `TRUSTED_SEALED_HARNESS`; that trusted class is invalid for every non-sealed purpose. `PROMOTION_REPLAY` is valid only with `LIVE_APPROVED_OUTER_CONTROLLER`; standard Controller context is invalid for replay. All other non-sealed purposes require `STANDARD_CONTROLLER`. A mismatch fails before handler dispatch.

`TRANSIENT_HARNESS_COMPARE` SHALL deliver raw output only to that exact current trusted operation principal and SHALL disable Broker idempotency result caching, tracing, event publication, logs, generic subscribers, IPC replay, and persistent return storage while preserving durable digest/status receipts. Exact replay returns only the durable receipt. There is one action and one provider handler; the mapping does not create a sealed action or caller-selected fallback.

Every raw hop SHALL use a bounded single-owner mutable byte buffer with ownership transfer, never an immutable string, JSON/structured clone, or fan-out copy. A, runtime/transport, Broker, and B SHALL clear any buffer they own in `finally` on success, error, cancellation, and timeout. If a hop cannot prove single-copy ownership/clearing, it SHALL run inside a dedicated ephemeral process whose termination is part of result containment; if neither mechanism is enforceable, dispatch fails before sealed execution.

#### Scenario: Sealed evaluation uses transient delivery

- **WHEN** Host context is the registered trusted-harness operation principal and the request purpose is `CANDIDATE_SEALED`
- **THEN** the raw result reaches only the trusted harness in memory
- **AND** every Broker-owned persistent or published surface contains only digest/status metadata

#### Scenario: Payload requests sealed delivery

- **WHEN** payload/options supplies an invocation class, target principal, result policy, or `CANDIDATE_SEALED` under a standard Controller principal
- **THEN** dispatch fails before the handler
- **AND** no raw result channel is created

#### Scenario: Trusted harness requests a non-sealed purpose

- **WHEN** a trusted-harness operation principal invokes the action for a non-sealed evaluation purpose
- **THEN** dispatch fails before execution
- **AND** it is not downgraded to ordinary result delivery

#### Scenario: Promotion replay has no current confirmation

- **WHEN** a standard or background Controller requests `POST_PROMOTION_REPLAY/PROMOTION_REPLAY` outside a live matching approved Promotion outer invocation
- **THEN** the Host cannot derive `LIVE_APPROVED_OUTER_CONTROLLER`
- **AND** dispatch fails before the Catalog handler even though the inner evaluation action itself is approval-free

#### Scenario: Promotion replay races outer settlement

- **WHEN** replay child registration or execution races with outer return, throw, cancellation, or revocation
- **THEN** closure-before-registration produces zero replay handler dispatch
- **AND** registration-before-closure admits the lease-free child, after which closure cancels or contains it and waits for terminal cleanup
- **AND** a detached closure cannot recreate the invocation class or register after the outer scope closes

#### Scenario: Runtime cannot enforce result policy

- **WHEN** any required no-cache/no-trace/no-event/no-store boundary is unavailable
- **THEN** dispatch fails before execution
- **AND** no ordinary-result fallback is selected

#### Scenario: A transient hop cannot control raw copies

- **WHEN** a provider/runtime/transport/Broker hop would materialize an immutable string, structured clone, uncontrolled copy, or uncleared error payload
- **THEN** the sealed call uses a destroy-on-completion isolated process or fails before execution
- **AND** success, error, cancellation, and timeout never leave a replayable raw copy
