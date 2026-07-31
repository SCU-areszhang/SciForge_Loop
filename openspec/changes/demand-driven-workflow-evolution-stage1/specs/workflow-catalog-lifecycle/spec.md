## ADDED Requirements

### Requirement: Immutable Workflow releases

Create Loop SHALL represent every serviceable Workflow as an immutable, workspace-scoped `WorkflowReleaseV1` containing a strict `WorkflowDefinitionV1`, one canonical `WorkflowExecutionPolicyBindingV1`, and their digests. `ProposedWorkflowReleaseV1` SHALL remain an embedded Candidate value and SHALL become an official Release only during authorized preparation.

The canonical definition SHALL contain all behavior-affecting graph, prompt, model/runtime request, tool-reference, and budget-request fields. It SHALL NOT grant execution authority and SHALL NOT contain an independently effective policy/profile reference, run history, last status/message, service enablement, editor timestamps, database paths, runtime objects, or secret values.

`WorkflowExecutionPolicyBindingV1` SHALL be the sole execution-authority value. It SHALL freeze the policy version/digest, allowed call modes, runtime/model/profile identity and digest, tool/file/network/environment/opaque-secret-reference scopes, and budget limits; it SHALL contain no secret bytes. A Candidate and the official Release minted from it SHALL bind the exact same value and digest; a `WorkflowServiceBindingV1` SHALL reference that digest and SHALL NOT contain an independent policy/profile override. Definition requests are data constrained by this authority, never an additional authority source. Any mismatch among Candidate, Release, service binding, evaluation request, Host enforcement receipt, or execution receipt SHALL fail closed.

#### Scenario: Mint a valid official Release

- **WHEN** an initial provision or authorized Promotion preparation freezes a policy-valid Workflow proposal
- **THEN** Create Loop creates one append-only Release with an opaque release ID
- **AND** stores the canonical definition and SHA-256 definition digest
- **AND** repeated reads return the same value and digest

#### Scenario: Reject non-canonical content

- **WHEN** a proposed definition contains unknown fields, run history, non-finite values, or a secret value
- **THEN** freezing fails closed
- **AND** no Release, Candidate, Catalog revision, or Anchor change is committed

### Requirement: One policy binding is enforced at every gate

Create Loop SHALL validate the exact same `WorkflowExecutionPolicyBindingV1` value and digest during initial provisioning, Candidate staging, preparation, every controlled evaluation, and every stable bound-service resolution. Preparation SHALL copy the validated Candidate value into the official Release without substitution; a service binding SHALL reference that exact digest. No action may replace it with a current default, looser policy revision, payload override, requested Agent profile, or fallback runtime. Finalization SHALL accept only the prepare and replay evidence bound to that same value.

#### Scenario: Policy changes between verification and preparation

- **WHEN** a preparation, replay, or stable execution supplies a policy/profile value or digest different from the provisioned or staged authoritative value
- **THEN** the operation fails before Release minting, Workflow dispatch, or Anchor mutation
- **AND** no default or newer permissive revision is substituted

### Requirement: Deterministic digests

Create Loop SHALL calculate definition, policy-binding, Candidate-body, service-binding, Catalog, request, and receipt digests using strict versioned-schema validation, the exact RFC 8785 JSON Canonicalization Scheme plaintext, its UTF-8 bytes, and SHA-256 lowercase hexadecimal. The canonical plaintext SHALL be the unmodified RFC 8785 JSON text with no pretty-print whitespace, wrapper, byte-order mark, platform newline, Unicode normalization, or locale-specific transformation; the digest input SHALL be exactly those UTF-8 bytes. It SHALL preserve semantic array order, serialize negative zero as the RFC 8785 plaintext `0`, and reject unknown keys, `undefined`, non-finite numbers, host objects, and secret values.

Each digest kind SHALL have one strict V1 digest-body schema. That body SHALL include its schema version and every behavior-, identity-, lineage-, policy-, or authorization-evidence-affecting field; it may exclude only the object's own digest field and fields explicitly classified as non-semantic creation metadata by that schema. The public contract SHALL publish byte-level accepted/rejected vectors containing the canonical plaintext string, UTF-8 bytes, digest, schema version, and rejection code. Both domain packages SHALL consume the same vectors; Workflow Evolution SHALL NOT implement a second canonicalizer.

#### Scenario: Equivalent definition across restarts

- **WHEN** the same strict definition is cloned, serialized, reloaded, and hashed after runtime restart
- **THEN** every calculation produces the same definition digest

#### Scenario: Behavior-affecting change

- **WHEN** any graph, prompt, model/runtime request, tool reference, or budget request changes
- **THEN** the definition digest changes
- **AND** a change to `WorkflowExecutionPolicyBindingV1` changes its separate policy-binding digest

### Requirement: Append-only Catalog revisions

Create Loop SHALL represent `WorkflowCatalogRevisionV1` as an immutable mapping from logical Workflow ID to official Release ID plus immutable `WorkflowServiceBindingV1` records, with an optional parent revision and a Catalog digest.

Every service binding SHALL contain a stable logical binding ID, logical Workflow ID, exact official Release ID, manual/agent/schedule/webhook exposure, optional route/trigger identity, the exact `WorkflowExecutionPolicyBindingV1` digest, and opaque secret references without secret bytes. Within one Catalog revision, binding IDs SHALL be unique, every non-null route/trigger identity SHALL be unique, every binding SHALL reference a Release present in that revision, and `binding.releaseId` SHALL equal the revision's `workflowId -> releaseId` mapping for `binding.workflowId`. Every mapped Workflow SHALL have at least one binding. Mutable cursors such as `nextRunAt` and last-run status SHALL remain separate operational state bound to the exact binding, Catalog, Release, and generation.

Mixed old/new binding Releases for one Workflow are invalid. `EXTEND_EXISTING` and `CREATE_NEW` SHALL additionally satisfy the closed `CatalogPatchV1` topology defined by Candidate isolation.

#### Scenario: Create a successor Catalog

- **WHEN** a valid Candidate is promoted against the current Anchor
- **THEN** Create Loop creates a new Catalog revision whose parent is the previous Anchor revision
- **AND** leaves the parent revision and every prior Release unchanged

#### Scenario: Attempt to overwrite history

- **WHEN** a caller attempts to replace an existing Release or Catalog revision under an existing ID
- **THEN** the operation fails
- **AND** the stored object remains byte-for-byte unchanged

### Requirement: Initial Catalog provisioning is explicit

Create Loop SHALL expose one idempotent UI-confirmed `create-loop.catalog.provision` action accepting strict `InitialCatalogProvisionV1`. One request SHALL contain 1–5 `InitialWorkflowReleaseInputV1` values derived from selected drafts or frozen fixtures and 1–5 `InitialServiceBindingPlanV1` values. Every Release input SHALL have at least one in-request binding plan, and every binding plan SHALL point to an in-request Release input and satisfy the Catalog topology and policy-binding invariants. The action SHALL atomically normalize and validate the entire batch, mint every official `WorkflowReleaseV1` and `WorkflowServiceBindingV1`, and create exactly one initial `WorkflowCatalogRevisionV1`, `AnchorPointerV1`, terminal `CatalogOperationReceiptV1`, and `InitialCatalogProvisionReceiptV1` in one SQLite transaction. At least one provisioned path SHALL be policy-valid and contain no AI Agent atom.

It SHALL NOT scan, infer, or silently import the mutable `state.json` store. Every initial Release SHALL have no parent Release. Any invalid count, duplicate identity, dangling or initial-parent Release, topology/policy mismatch, existing Anchor, or digest conflict SHALL roll back the entire batch and expose no Release, binding, Catalog, Anchor, or success receipt.

#### Scenario: Provision a valid workspace

- **WHEN** the user confirms a strict policy-valid batch containing 1–5 Releases and 1–5 bindings for a workspace with no Catalog
- **THEN** one transaction creates the complete initial Catalog/Anchor and immutable V1 receipts
- **AND** no Release or binding becomes visible before the complete batch commits

#### Scenario: Catalog already exists

- **WHEN** provisioning targets a workspace that already has an Anchor under a different operation ID
- **THEN** it fails with zero writes

#### Scenario: Draft mapping is ambiguous or contains secrets

- **WHEN** workspace ownership, secret references, service exposure, or definition normalization cannot be frozen safely
- **THEN** provisioning fails closed
- **AND** no partial Catalog object is visible

### Requirement: Workspace identity is Host canonical

Create Loop SHALL partition Catalog state only by opaque Host-provided `WorkspaceIdentityV1`, derived before dispatch from an existing directory's validated absolute realpath with platform case and symlink-alias handling. Payload input SHALL NOT override workspace identity.

#### Scenario: The same directory has aliases

- **WHEN** source or packaged callers address one directory through absolute, case, or symlink aliases
- **THEN** Create Loop resolves the same Catalog, Anchor, operation namespace, and generation

#### Scenario: Payload spoofs another workspace

- **WHEN** request data contains a workspace value different from caller context
- **THEN** the request is rejected before lookup or write

### Requirement: Consistent Catalog snapshot reads

Create Loop SHALL expose `create-loop.catalog.read-snapshot` only to the frozen Workflow Evolution lifecycle owner. Its strict `WorkflowCatalogSnapshotV1` response SHALL come from one database read transaction and contain only the Anchor generation, stable Catalog revision/digest, service bindings, and referenced Release identities/digests needed for Coverage. It SHALL never include or resolve a pending or provisional object.

#### Scenario: Controller evaluates Coverage

- **WHEN** Workflow Evolution reads the snapshot
- **THEN** every returned identity comes from one database snapshot
- **AND** no combination assembled from separate generations is returned

### Requirement: Independent Anchor generation

Create Loop SHALL store an `AnchorPointerV1` with one stable Catalog/generation and at most one bounded `PendingPromotionV1` reservation. Stable service resolution SHALL ignore the pending Catalog. Generation changes only when finalization or a bounded compensating rollback changes the stable Anchor.

`PendingPromotionV1` SHALL be immutable after preparation. It SHALL bind workspace, base generation and stable Catalog ID/digest, Candidate ID/digest, provisional Release and Catalog IDs/digests, `WorkflowExecutionPolicyBindingV1` digest, before/after mapping and binding digests, `prepareOperationId`, prepare request digest, the preallocated `replayOperationId`, replay request/input digests, the pre-created replay `ComputeReservationV1` ID/digest, and a pending digest. The prepare receipt may bind the pending digest, but the pending body SHALL NOT contain its prepare receipt digest because that would create a cyclic digest. Because the replay result does not exist at preparation time, its result/receipt digest SHALL NOT be invented or added to the reservation; finalization or abort SHALL supply and verify the terminal `ControlledEvaluationReceiptV1` against the prebound replay operation/request/input/reservation identities. The reservation SHALL never expire or clean itself in the background.

`create-loop.catalog.read-pending-promotion` SHALL be the sole pending projection and SHALL be callable only by the frozen Workflow Evolution lifecycle owner. It SHALL return strict `PendingPromotionProjectionV1` from one Anchor-row read transaction, including the pending digest and every prebound identity/digest above, but no invented replay result. UI/Agent `read-anchor`, `read-catalog`, `get-release`, stable service resolution, and `WorkflowCatalogSnapshotV1` SHALL neither reveal nor infer pending/provisional existence.

`PreparePromotionReceiptV1` SHALL bind prepare operation ID/request digest, pending digest, Candidate, policy binding, base generation, and complete before/after Workflow mapping, binding, Release, and Catalog IDs/digests. `PromotionReceiptV1` SHALL be minted only by finalization and SHALL bind the prepare and terminal passing replay receipt digests, Candidate ID/digest, opaque `verificationReportId/verificationReportDigest` and `promotionDecisionId/promotionDecisionDigest` controller attestations, finalization operation ID/request digest, complete predecessor and successor Catalog/mapping/binding/Release IDs/digests, and before/after generations. Create Loop SHALL NOT import B's document/decision types or claim to inspect its Ledger. `AbortPromotionReceiptV1` SHALL bind abort operation ID/request digest, the matching pending, terminal replay observation or authorized `NOT_FOUND` continuation, abandonment command/reason where applicable, Candidate `ABORTED` disposition receipt, and unchanged stable Anchor/generation. Each receipt's own `receiptDigest` SHALL be calculated over its strict body with that digest field excluded. These V1 receipts are immutable public-contract values; an unversioned or partially populated receipt SHALL be rejected.

The existing mutable settings revision SHALL NOT be used as the Anchor generation.

#### Scenario: Ordinary execution changes history

- **WHEN** a draft preview, Anchor run, Candidate run, schedule update, or editor save changes mutable runtime state
- **THEN** the Anchor generation remains unchanged

#### Scenario: Successful finalization

- **WHEN** an authorized finalization supplies the exact pending preparation/replay receipts, current generation, and valid bound evidence
- **THEN** the Anchor changes atomically to the successor Catalog
- **AND** generation becomes exactly the prior stable generation plus one

#### Scenario: Provisional preparation

- **WHEN** an authorized preparation supplies the exact current generation and no pending reservation exists
- **THEN** Create Loop mints the official Release and creates the successor Catalog and pending reservation atomically
- **AND** the stable Anchor, generation, and service resolution remain unchanged

#### Scenario: Authorized provisional abort

- **WHEN** an authorized abort supplies the matching pending preparation and either replay operation `SUCCEEDED` with a trusted non-pass assessment, authoritative operation `FAILED`, contained `CANCELLED`, or a terminal `SUCCEEDED + PASS` receipt plus fresh explicit operator-abandonment command/reason
- **THEN** only that pending reservation is removed
- **AND** the Candidate receives `ABORTED` in the same transaction
- **AND** the stable Anchor and generation remain unchanged

#### Scenario: Replay operation is not found

- **WHEN** the prebound `POST_PROMOTION_REPLAY` operation lookup is authoritatively `NOT_FOUND`
- **THEN** no background worker, lifecycle reconciliation, or standalone approval-free capability may dispatch replay or abort
- **AND** only a fresh UI-confirmed `workflow-evolution.execute-promotion` handler may choose either exact replay or explicit abort
- **AND** the Host derives `LIVE_APPROVED_OUTER_CONTROLLER` only from that current same-owner/workspace Promotion-purpose invocation before permitting the otherwise approval-free `evaluate` dispatch
- **AND** any replay dispatch uses the original `replayOperationId`, request digest, input digest, pending digest, provisional Release, and still-held `ComputeReservationV1` without modification

#### Scenario: Replay is in progress or unknown

- **WHEN** the matching replay operation is `IN_PROGRESS` or `OUTCOME_UNKNOWN`
- **THEN** finalization and abort are both denied
- **AND** the pending reservation remains unchanged for explicit recovery

#### Scenario: Operator abandons a passed provisional result

- **WHEN** replay passed but a fresh Promotion-purpose UI confirmation explicitly chooses abandonment with the matching receipt and reason
- **THEN** Create Loop aborts the pending reservation and records Candidate `ABORTED` atomically
- **AND** the old stable Anchor remains current

### Requirement: Stale promotion fails atomically

Catalog preparation/finalization and rollback SHALL require `expectedGeneration` and SHALL perform a zero-write failure when the current generation differs. Only generation mismatch is classified as `STALE`; authorization, owner, evidence, pending-reservation, digest, or storage failures use distinct fail-closed codes.

#### Scenario: Two Candidates share one base

- **WHEN** a provider-level concurrency fixture creates two immutable Candidate artifacts from generation N
- **AND** the first Candidate successfully finalizes to generation N+1
- **THEN** preparation of the second Candidate with expected generation N fails as stale
- **AND** no new Release, Catalog revision, pointer change, or promotion receipt is committed for the stale request
- **AND** this defense-in-depth fixture does not create two controller-active Candidate leases in Workflow Evolution

### Requirement: Catalog terminal errors have one total reducer mapping

`CatalogErrorCodeV1` and `CatalogFailureClassV1` SHALL have exactly one owner: Create Loop (A). Create Loop SHALL define both closed V1 types, the total mapping, each per-action allowed-code subset, and their executable fixtures once and export them from `@sciforge/domain-create-loop/catalog-contract`. Workflow Evolution (B) SHALL import those exact exports and SHALL NOT redefine either type, copy the mapping, or maintain a second action/code table.

The Create Loop public contract SHALL export this complete `CatalogErrorCodeV1 -> CatalogFailureClassV1` mapping for every B-facing terminal error:

| `CatalogErrorCodeV1` | `CatalogFailureClassV1` |
| --- | --- |
| `CATALOG_STALE_GENERATION` | `STALE_GENERATION` |
| `CATALOG_POLICY_BLOCKED` | `POLICY_BLOCKED` |
| `CATALOG_VALIDATION_REJECTED` | `VALIDATION_REJECTED` |
| `CATALOG_AUTHORIZATION_REQUIRED` | `AUTHORIZATION_REQUIRED` |
| `CATALOG_RETRYABLE_ZERO_WRITE` | `RETRYABLE_ZERO_WRITE` |
| `CATALOG_PENDING_PROMOTION_PRESENT` | `PENDING_PROMOTION_PRESENT` |
| `CATALOG_PENDING_MISMATCH` | `PENDING_MISMATCH` |
| `CATALOG_IDENTITY_OR_DIGEST_CONFLICT` | `IDENTITY_OR_DIGEST_CONFLICT` |
| `CATALOG_PERMANENT_FAILURE` | `PERMANENT_FAILURE` |

Each action descriptor SHALL export its exact allowed-code subset:

| Action | Allowed terminal codes |
| --- | --- |
| `provision` | `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_RETRYABLE_ZERO_WRITE`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `stage-candidate` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_PENDING_PROMOTION_PRESENT`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `close-candidate` | `CATALOG_VALIDATION_REJECTED`, `CATALOG_PENDING_PROMOTION_PRESENT`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `evaluate` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_PENDING_MISMATCH`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `cancel-evaluation` | `CATALOG_VALIDATION_REJECTED`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `prepare-promotion` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_AUTHORIZATION_REQUIRED`, `CATALOG_RETRYABLE_ZERO_WRITE`, `CATALOG_PENDING_PROMOTION_PRESENT`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `finalize-promotion` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_AUTHORIZATION_REQUIRED`, `CATALOG_RETRYABLE_ZERO_WRITE`, `CATALOG_PENDING_MISMATCH`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `abort-promotion` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_AUTHORIZATION_REQUIRED`, `CATALOG_RETRYABLE_ZERO_WRITE`, `CATALOG_PENDING_MISMATCH`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `rollback` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_AUTHORIZATION_REQUIRED`, `CATALOG_RETRYABLE_ZERO_WRITE`, `CATALOG_PENDING_PROMOTION_PRESENT`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |

Authorization for `stage-candidate`, `close-candidate`, `evaluate`, and `cancel-evaluation` is resolved by the Broker before the provider handler. The provider SHALL contain any transient storage retry internally and SHALL return either a committed result or an allowed terminal permanent/validation/business error; those four approval-free actions SHALL NOT surface `CATALOG_RETRYABLE_ZERO_WRITE`. Destructive actions retain the explicit authorization and retryable-zero-write codes needed by the live-confirmation continuation reducer.

An ACL/owner denial occurs before Catalog lookup and is not a Catalog terminal record. A code outside an action's subset, an unknown code, a missing required receipt, or a malformed code/class pair SHALL be rejected as an impossible contract result; B SHALL quarantine it as `IDENTITY_OR_DIGEST_CONFLICT` rather than guess a business outcome. The exported fixture set SHALL contain one executable positive fixture for every legal `(action, CatalogErrorCodeV1)` pair in the table, assert the exact mapped `CatalogFailureClassV1`, contain negative fixtures for every excluded action/code pair plus unknown or malformed code/class pairs, and fail completeness checks whenever an action or either closed V1 type changes without corresponding fixtures. The Create Loop provider conformance tests and Workflow Evolution reducer tests SHALL consume those same fixtures directly from `@sciforge/domain-create-loop/catalog-contract`.

#### Scenario: Provider returns an impossible action/code pair

- **WHEN** an action returns a terminal error code outside its declared subset
- **THEN** the shared executable fixture rejects the result
- **AND** Workflow Evolution enters `RECOVERY_REQUIRED` with `IDENTITY_OR_DIGEST_CONFLICT`

### Requirement: Rollback creates a bounded compensating revision

Rollback SHALL accept only a matching finalized `PromotionReceiptV1` and the exact current generation, and SHALL reject with zero writes while a `PendingPromotionV1` exists. Preparation and rollback SHALL serialize on the same workspace Anchor row: preparation SHALL reject any existing pending reservation, rollback SHALL reject any existing pending reservation, and no transaction SHALL commit both a pending reservation and a rollback mutation/receipt. Rollback SHALL create a new Catalog revision whose parent is the current failed Catalog and whose mappings/service bindings copy the immediately previous stable Catalog recorded by that receipt.

The immutable `RollbackReceiptV1` SHALL bind the source `PromotionReceiptV1`, rollback operation ID/request digest, before/after mapping, binding, Release, Catalog IDs/digests, and generations. Its own `receiptDigest` SHALL be excluded from its canonical body. The historical Candidate remains `PROMOTED`; rollback SHALL NOT rewrite its disposition. Schedule/webhook cursors SHALL be reinitialized or reconciled under the new generation rather than copied, and every dispatcher SHALL enforce a generation fence.

#### Scenario: Valid rollback

- **WHEN** the current Anchor is exactly the finalized Catalog named by the receipt
- **AND** owner, workspace, generation, and receipt digests match
- **THEN** one compensating revision becomes the stable Anchor
- **AND** generation becomes exactly the prior stable generation plus one with an immutable `RollbackReceiptV1`
- **AND** operational cursors cannot dispatch under the superseded generation

#### Scenario: Arbitrary target or stale receipt

- **WHEN** a caller supplies a target Catalog, non-immediate receipt, wrong workspace/owner, or stale generation
- **THEN** rollback fails with zero writes

### Requirement: Candidate isolation

A staged `WorkflowCandidateV1` SHALL bind the exact base Catalog ID/digest/generation, proposal mode, optional base Release, normalized `ProposedWorkflowReleaseV1` body digest, one canonical `WorkflowExecutionPolicyBindingV1`, bounded `CatalogPatchV1` / `ServiceBindingPlanV1`, and request/change/evidence digests. The B Controller SHALL derive authoritative identity and policy-binding fields; Create Loop SHALL independently normalize/revalidate and write Candidate, `CandidateValidationReceiptV1`, and an optional predecessor disposition atomically. Invalid, stale, policy-denied, topology-invalid, or conflicting proposals SHALL create no artifact.

Create Loop SHALL retain Candidate artifacts as immutable history and SHALL expose their canonical snapshot through the public system read contract. Workflow Evolution alone owns the workspace-scoped active-Candidate lease and SHALL NOT mirror that state into the Catalog.

`CandidateDispositionV1` SHALL be exactly `SUPERSEDED`, `PROMOTED`, `REJECTED`, `CANCELLED`, `FAILED`, `STALE`, or `ABORTED`, with at most one terminal disposition. Authority SHALL be action-specific and non-overlapping:

- `stage-candidate` may append `SUPERSEDED` only while atomically creating the exact successor Candidate named by `supersedesCandidateId`;
- `finalize-promotion` alone may append `PROMOTED`, in the same transaction as Anchor advancement and `PromotionReceiptV1`;
- `abort-promotion` alone may append `ABORTED`, in the same transaction as pending removal and `AbortPromotionReceiptV1`;
- `close-candidate` may append only `REJECTED`, `CANCELLED`, `FAILED`, or `STALE`.

No payload, owner, retry, or generic close path may request a disposition owned by another action. Exact retry SHALL return the original `CandidateDispositionReceiptV1`; a conflicting action or disposition SHALL fail with zero writes.

Every disposition-producing transaction SHALL serialize with the workspace Anchor row and the Candidate row. `prepare-promotion` SHALL verify in its own transaction that the Candidate has no terminal disposition before installing `PendingPromotionV1`. While any pending reservation exists, `stage-candidate` and `close-candidate` SHALL fail with `PENDING_PROMOTION_PRESENT` and zero Candidate/Catalog/disposition writes; their immutable terminal zero-write error receipt may commit. In particular they cannot supersede or close the pending reservation's Candidate. Only matching `finalize-promotion` or `abort-promotion`, under the live protected commit lease, may assign that Candidate's `PROMOTED` or `ABORTED` disposition and remove/advance the pending state atomically.

`CatalogPatchV1` and `ServiceBindingPlanV1` SHALL describe one of exactly two closed topologies:

- `EXTEND_EXISTING` SHALL identify exactly one mapped logical Workflow and its exact base Release. The successor Catalog SHALL change only that one `workflowId -> releaseId` mapping and rebind every existing service-binding record for that Workflow to the proposed successor Release under the same stable logical binding IDs. Exposure, policy-binding digest, opaque secret references, route/trigger identities, and every other binding field SHALL remain byte-for-byte equal; every unrelated mapping, Release reference, and binding SHALL remain byte-for-byte equal.
- `CREATE_NEW` SHALL have no base Release, add exactly one new logical Workflow mapping and one new unique manual-only service binding, and change no existing mapping or binding. The new binding SHALL have no Agent/schedule/webhook exposure or trigger identity and SHALL use the Candidate's exact policy-binding digest.

Deleting a Workflow, splitting one Workflow across old/new Releases, changing a route/trigger or exposure, adding a second binding, or modifying an unrelated Catalog entry SHALL fail at staging and again at preparation with zero writes.

#### Scenario: Extend an existing Workflow

- **WHEN** the proposal mode is `EXTEND_EXISTING`
- **THEN** the Candidate identifies the exact existing Workflow and base Release
- **AND** replaces only that one canonical mapping and rebinds every existing stable logical binding ID for that Workflow to the proposed Release while preserving exposure, policy-binding digest, secret references, route, trigger, and all other fields
- **AND** leaves all unrelated mappings and bindings byte-for-byte unchanged
- **AND** does not mutate that Release or the Anchor

#### Scenario: Create a new Workflow

- **WHEN** the proposal mode is `CREATE_NEW`
- **THEN** the Candidate has no base Release
- **AND** uses a new logical Workflow ID
- **AND** proposes exactly one unique manual-only service binding
- **AND** has no agent/schedule/webhook stable-service exposure

#### Scenario: Candidate expands service exposure

- **WHEN** `EXTEND_EXISTING` changes any existing exposure or `CREATE_NEW` proposes Agent/schedule/webhook exposure
- **THEN** staging or Promotion fails with zero Catalog writes
- **AND** the change requires a separate explicit user-confirmed service-binding action outside Candidate automation

#### Scenario: Candidate fails validation or execution

- **WHEN** staging, policy validation, private execution, or repair fails
- **THEN** the current Anchor remains readable and serviceable
- **AND** no stable Catalog mapping changes

#### Scenario: Repair supersedes a Candidate

- **WHEN** the Controller stages a valid repair with `supersedesCandidateId`
- **THEN** one transaction appends the new Candidate and an immutable `SUPERSEDED` disposition for the exact predecessor
- **AND** neither Candidate artifact is edited

#### Scenario: Candidate work ends without a successor

- **WHEN** the Controller ends Candidate work without a successor because of rejection, cancellation, known failure, or stale generation
- **THEN** the idempotent `close-candidate` action appends the matching allowed immutable `CandidateDispositionReceiptV1`
- **AND** an exact retry returns that receipt
- **AND** Workflow Evolution SHALL NOT make its Run terminal or release its active-Candidate lease until it has durably stored that matching receipt

#### Scenario: Close attempts a protected disposition

- **WHEN** `close-candidate` requests `SUPERSEDED`, `PROMOTED`, or `ABORTED`
- **THEN** it fails with zero writes
- **AND** only the owning successor/finalize/abort transaction may create that disposition

#### Scenario: Close or supersede races with preparation

- **WHEN** `prepare-promotion` races with `close-candidate` or a successor `stage-candidate`
- **THEN** Anchor/Candidate-row serialization gives one atomic order
- **AND** prepare-first makes stage/close return `PENDING_PROMOTION_PRESENT` with zero writes
- **AND** stage/close-first makes preparation revalidate the resulting disposition/base and fail with zero pending/Release/Catalog writes

#### Scenario: Run ends without ever staging a Candidate

- **WHEN** a Candidate-building Run reaches a safe terminal or cancellation outcome after all operations settle but no Candidate was ever staged
- **THEN** Workflow Evolution makes no `close-candidate` request
- **AND** Create Loop creates no phantom Candidate or disposition
- **AND** Workflow Evolution commits its B-owned `NO_CANDIDATE_STAGED` release event and releases the build lease in one Ledger transaction
- **AND** a Coverage, clarification, resource, platform, or policy path that never acquired a build lease has no lease or Catalog close to release

### Requirement: Stable service is gated by the current binding

Stable service SHALL never accept an arbitrary Release, Candidate, provisional Catalog, definition, policy, or profile override. `create-loop.catalog.execute-bound-service` SHALL accept strict `ExecuteBoundServiceRequestV1` containing a stable logical `bindingId`, `expectedGeneration`, input envelope, and stable operation identity only inside the action's current UI/Agent confirmation. `create-loop.catalog.dispatch-bound-service` SHALL accept strict `DispatchBoundServiceRequestV1` containing binding/generation, input envelope, frozen trigger/event identity, and durable dispatch operation identity only from the Create Loop lifecycle owner for an already user-approved schedule/webhook binding.

Before any Workflow node or model transport runs, Create Loop SHALL resolve one `StableBindingResolutionV1` from a transactionally consistent current stable Anchor and verify exact generation, caller exposure, route/trigger identity, Catalog/Release/definition digests, `WorkflowExecutionPolicyBindingV1` digest, and the Host-produced `AgentProfileEnforcementReceiptV1` when the definition contains an AI Agent atom. That pre-dispatch receipt SHALL identify the actually selected runtime/model/profile and the enforced file/network/environment/tool/capability/secret/child-agent restrictions; requested configuration or a post-hoc self-report is insufficient. Missing or mismatched enforcement evidence SHALL fail before graph dispatch.

The run SHALL remain pinned to that frozen resolution. Its terminal `StableBindingExecutionReceiptV1` SHALL bind the operation, binding, Catalog, Release, definition, policy binding, caller/trigger identity, generation, outcome, and actual `AgentExecutionReceiptV1` runtime/model/profile/usage evidence where applicable. A post-execution receipt mismatch SHALL fail the operation and SHALL NOT be published as successful output; no downstream Workflow node may consume an AI Agent result until its actual receipt matches the pre-dispatch enforcement receipt and bound policy/profile digest. Provisional, unbound, stale-generation, caller-ineligible, arbitrary, or policy-mismatched Releases SHALL fail closed.

#### Scenario: Current binding executes

- **WHEN** an approved caller requests a binding exposed to that caller at the current stable generation
- **THEN** Create Loop resolves and verifies the exact Release and definition through the stable Anchor
- **AND** pre-dispatch enforcement and terminal execution receipts bind the binding, Catalog, Release, definition, policy binding, caller class, and generation

#### Scenario: Unbound or provisional Release is known

- **WHEN** a UI, Agent, scheduler, or webhook supplies or discovers a Release not resolved by its valid current binding
- **THEN** stable execution is unavailable
- **AND** the provisional or unbound Release is not executed

#### Scenario: Scheduled dispatch is replayed

- **WHEN** Create Loop dispatches the same frozen binding generation and trigger/event idempotency identity again
- **THEN** the canonical standing-binding operation returns the original durable result or status
- **AND** no second external effect is inferred or dispatched

#### Scenario: Definition changes after run starts

- **WHEN** a draft or later Catalog revision changes while a pinned run is active
- **THEN** the active run continues using its frozen definition
- **AND** its receipt remains bound to that frozen digest

### Requirement: Controlled evaluation cannot escape its evidence boundary

Create Loop SHALL expose one Workflow-Evolution-owner-only controlled evaluation action accepting strict `ControlledEvaluationRequestV1` with:

- `ControlledEvaluationModeV1 = ANCHOR_TRIAL | CANDIDATE_PRIVATE | POST_PROMOTION_REPLAY`;
- `ControlledEvaluationPurposeV1 = COVERAGE_TRIAL | CANDIDATE_PUBLIC_ACCEPTANCE | CANDIDATE_REGRESSION | CANDIDATE_SCIENTIFIC | CANDIDATE_SEALED | PROMOTION_REPLAY`.

The allowed pairs SHALL be exact: `ANCHOR_TRIAL/COVERAGE_TRIAL`; `CANDIDATE_PRIVATE` with one of the four `CANDIDATE_*` purposes; and `POST_PROMOTION_REPLAY/PROMOTION_REPLAY`. All other pairs fail before execution. The action plus its owner-only `cancel-evaluation` action remain the sole controlled execution path.

Mode enablement SHALL be phased by the Create Loop owner: P3 enables only `ANCHOR_TRIAL`, P4 enables `CANDIDATE_PRIVATE`, and P5 enables `POST_PROMOTION_REPLAY`; an unenabled mode SHALL fail closed. The action SHALL pin the exact Release or Candidate, input, `WorkflowExecutionPolicyBindingV1`, and evidence-workspace digests. It SHALL apply the same pre-dispatch `AgentProfileEnforcementReceiptV1` and post-execution `AgentExecutionReceiptV1` checks as stable execution when an AI Agent atom is present. It SHALL permit only compute/model inference within the frozen budget and writes inside a disposable evidence workspace. It SHALL reject external-write/destructive nodes, connectors, tools, network mutations, production databases/instruments, uncontrolled env/secrets, and writes outside the evidence workspace before dispatch.

`ComputeReservationV1` SHALL be the singular generic Host/SDK contract value owned and exported solely by `@sciforge/domain-sdk/contract`. Its canonical V1 wire object SHALL be closed and contain exactly these required fields:

- `kind`, fixed to `COMPUTE_RESERVATION_V1`;
- `schemaVersion`, fixed to `1`;
- `reservationId`;
- `workspaceIdentityDigest`;
- `operationOwnerScope`;
- `budgetScopeId`;
- `budgetScopeRevision`;
- `actionId`;
- `operationId`;
- `reservedRequestBodyDigest`;
- `runBudgetDecisionId`;
- `runBudgetDecisionDigest`;
- `modelPriceTableId`;
- `modelPriceTableDigest`;
- `maxModelCalls`;
- `maxInputTokens`;
- `maxOutputTokens`;
- `maxCostUsdMicros`;
- `maxActiveComputeMs`;
- `maxConcurrentOperations`; and
- `reservationDigest`.

Unknown fields, aliases, omitted required fields, alternate discriminants, and unsupported schema versions SHALL be rejected. `reservationDigest` SHALL be SHA-256 lowercase hexadecimal over the exact UTF-8 bytes of the RFC 8785 canonical JSON body formed by removing only `reservationDigest` from the validated wire object; no other field may be omitted from that digest body. `reservedRequestBodyDigest` SHALL separately be SHA-256 lowercase hexadecimal over the RFC 8785 canonical JSON UTF-8 bytes of the strict operation request body before the complete reservation envelope is attached. It SHALL NOT cover the reservation envelope, `reservationId`, or `reservationDigest`; the enclosing Catalog request digest may cover the completed request after the reservation is frozen. This ordering SHALL prevent a request/reservation digest cycle.

The SDK contract SHALL publish shared executable accepted/rejected byte vectors covering the exact field set, canonical plaintext and UTF-8 bytes, lowercase digest, own-digest exclusion, unknown-field rejection, request-body envelope exclusion, and mutation of every identity, budget, price-table, operation, and limit field. Host, Create Loop (A), and Workflow Evolution (B) SHALL consume those same vectors and the SDK validator directly. A and B SHALL NOT redefine, re-export, copy, widen, or narrow the schema, digest body, canonicalizer, or fixtures in either domain contract.

Every evaluation SHALL require one SDK-valid `ComputeReservationV1` whose worst-case aggregate calls, tokens, cost, active-compute time, and concurrency are enforceable before any internal model dispatch. After the SDK validation, Create Loop SHALL compare the reservation with the Host-bound workspace and owner, the current descriptor action and durable operation, the reservation-free strict request body, and B's exact frozen budget-scope revision, Run-budget decision, and model-price-table identities/digests. The per-operation maxima SHALL fit the frozen remaining Run decision and policy ceilings; no current default, newer budget revision or price table, different operation/request, or looser limit may be substituted.

Create Loop SHALL only consume and contextually validate this SDK-owned value and return its existing governed Catalog errors. A wire/schema/canonicality failure SHALL return `CATALOG_VALIDATION_REJECTED`; after caller ACL succeeds, any cross-workspace, owner, action, operation, request-body, budget-scope/decision, price-table, reservation-identity, or digest substitution SHALL return `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`; an otherwise valid reservation whose frozen limits cannot be enforced or fit policy SHALL return `CATALOG_POLICY_BLOCKED`. Each failure SHALL occur before engine/model dispatch and before Candidate, pending, Release, Catalog, or Anchor mutation, apart from the action's immutable terminal operation/error record. The terminal `ControlledEvaluationReceiptV1` SHALL bind the exact reservation ID/digest and aggregate actual usage.

#### Scenario: SDK reservation is accepted without a domain copy

- **WHEN** `evaluate` receives the SDK-valid canonical reservation matching the exact Host workspace/owner, action, operation, reservation-free request body, frozen budget decision, and price table
- **THEN** Create Loop validates it through the SDK contract and its contextual guards
- **AND** any dispatch and terminal usage receipt remain bound to that exact reservation ID/digest

#### Scenario: Reservation wire object is widened

- **WHEN** a reservation contains an unknown field, alias, missing field, alternate version, non-canonical digest body, uppercase digest, or reservation envelope inside `reservedRequestBodyDigest`
- **THEN** Create Loop returns `CATALOG_VALIDATION_REJECTED` before engine/model dispatch
- **AND** the shared SDK rejection vector is consumed without a Catalog-owned schema or canonicalizer

#### Scenario: Reservation binding is substituted

- **WHEN** a validly shaped reservation substitutes another workspace, owner, action, operation, request body, budget scope/revision/decision, price table, reservation identity, or digest
- **THEN** Create Loop returns `CATALOG_IDENTITY_OR_DIGEST_CONFLICT` before engine/model dispatch
- **AND** no current value, default, or permissive fallback is substituted

The descriptor's `EvaluationResultDeliveryV1` SHALL use the Host-derived mapping `STANDARD_CONTROLLER -> STANDARD_CONTROLLER_RESULT`, `LIVE_APPROVED_OUTER_CONTROLLER -> STANDARD_CONTROLLER_RESULT`, and `TRUSTED_SEALED_HARNESS -> TRANSIENT_HARNESS_COMPARE`. Only the registered Workflow Evolution trusted-harness profile's current Host-minted operation principal may use `CANDIDATE_SEALED`, and that principal may use no other purpose. `POST_PROMOTION_REPLAY/PROMOTION_REPLAY` requires `LIVE_APPROVED_OUTER_CONTROLLER`, which the Host may derive only inside a current same-owner/workspace UI-approved `execute-promotion` invocation with the exact Promotion purpose; ordinary/background Controller context is rejected. Payload/options cannot select the invocation class, principal, channel, or delivery policy. Sealed transient bytes are never cached, traced, published, logged, replayed through IPC, or persisted; ordinary evaluation cannot request that channel.

The replay `ComputeReservationV1` SHALL be created and frozen by B before `prepare-promotion`, included in the exact replay request digest, and copied into `PendingPromotionV1` when preparation commits. If preparation is authoritatively `NOT_FOUND`, the same still-intended prepare retry SHALL retain that reservation; a terminal zero-write prepare failure may release it and any later new operation must use a new reservation. Once pending exists, replay `NOT_FOUND` SHALL leave the reservation in `HELD_PENDING_REPLAY` and unavailable to other work; `IN_PROGRESS`/`OUTCOME_UNKNOWN` retain its full worst-case amount. Only a terminal replay result settles actual/full usage, or a matching terminal abort receipt releases an undispatched held reservation exactly once.

Before the generic Agent operation/profile gate passes, every executable definition SHALL be schema-proven to contain no AI Agent. Afterwards, an AI Agent atom SHALL use only the Host-enforced bound profile, and its actual receipt SHALL match the expected profile digest.

#### Scenario: Safe controlled evaluation

- **WHEN** a policy-valid frozen input is evaluated in one controlled mode
- **THEN** the canonical execution engine produces a durable receipt bound to every pinned digest
- **AND** no stable Catalog or external resource is changed

#### Scenario: Mode, purpose, or invocation class conflicts

- **WHEN** the request uses an unlisted mode/purpose pair, a standard Controller requests `CANDIDATE_SEALED` or `PROMOTION_REPLAY`, or the trusted harness requests a non-sealed purpose
- **THEN** the action fails before engine/model dispatch
- **AND** no caller-selected delivery fallback exists

#### Scenario: Replay was not dispatched

- **WHEN** a matching pending replay lookup is authoritatively `NOT_FOUND`
- **THEN** its exact reservation remains held and cannot fund another operation
- **AND** a fresh confirmed replay reuses the same reservation, operation ID, and request digest

#### Scenario: Evaluation requests an external effect

- **WHEN** any selected atom could mutate an external or destructive resource
- **THEN** evaluation fails before that atom is dispatched
- **AND** the denial is recorded
- **AND** the caller must route the requirement to a resource/policy gate or explicit user-approved service path

#### Scenario: Evaluation cancellation is uncertain

- **WHEN** `cancel-evaluation` cannot prove cancellation or a terminal result
- **THEN** it returns `OUTCOME_UNKNOWN`
- **AND** the caller cannot report cancellation, retry evaluation, verify, or promote

### Requirement: One Workflow execution engine

Draft preview, Anchor execution, and isolated Candidate execution SHALL use one package-owned graph execution engine with explicit call modes and policies.

#### Scenario: Candidate requires isolation

- **WHEN** a Candidate is privately executed
- **THEN** the canonical engine receives the Candidate's frozen definition and isolated policy/workspace
- **AND** no copied Candidate-specific runtime implementation is selected

#### Scenario: Production caller migration completes

- **WHEN** renderer, Agent, schedule, and webhook stable callers use current-Anchor binding execution
- **THEN** the superseded mutable production action and every alias, forwarder, duplicate registration, and fallback are removed
- **AND** draft preview remains explicitly non-service evidence

### Requirement: Durable mutation idempotency

Every mutating Catalog input SHALL contain a caller-stable `operationId`. Create Loop SHALL compute the strict request digest and use `(workspaceId, OperationOwnerScopeV1, actionId, operationId)` as the durable namespace.

`OperationOwnerScopeV1` SHALL be Host-derived and restart-stable: stable manifest `moduleId` for system callers (`moduleVersion` is audit-only), stable authenticated user/OS principal for UI, and Host-minted durable operation principal for Agent. Agent mutation without that principal SHALL fail; no audience-wide fallback exists. An ephemeral window/thread ID or payload field SHALL NOT define it. Owner ACL SHALL be checked before lookup, claim, or write. `read-operation` SHALL disclose only the exact requester's own namespace/action: Create Loop and Workflow Evolution system owners may read only their respective system namespaces, and a UI/Agent principal may read only that same Host-derived principal namespace.

The Broker delivery idempotency key SHALL NOT be used as this durable identity. Create Loop SHALL expose `read-operation` returning strict `CatalogOperationLookupV1` with exactly `NOT_FOUND`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED`, `CANCELLED`, or `OUTCOME_UNKNOWN`; terminal results SHALL include an immutable versioned receipt or error record.

For database-only provision, stage/close, prepare/finalize/abort, and rollback operations, operation claim, all validation/state changes, and terminal `CatalogOperationReceiptV1` SHALL commit in the same SQLite transaction. Before COMMIT a crash yields `NOT_FOUND`; after COMMIT it yields the terminal receipt. These actions SHALL NOT expose or leave durable orphan `IN_PROGRESS` or `OUTCOME_UNKNOWN`. Controlled/external execution SHALL commit its operation claim before downstream dispatch; `OUTCOME_UNKNOWN` is reserved for downstream outcomes that cannot be proven.

#### Scenario: Exact retry after process failure

- **WHEN** a caller repeats a committed request with the same operation ID and payload
- **THEN** Create Loop returns the original result receipt
- **AND** does not repeat the mutation

#### Scenario: Key reused with different payload

- **WHEN** a caller reuses an operation ID with a different request digest
- **THEN** the request fails closed
- **AND** no Catalog state changes

#### Scenario: Response is lost after commit

- **WHEN** Create Loop commits an operation but Workflow Evolution does not persist the returned receipt
- **THEN** `read-operation` returns the original terminal receipt after runtime restart
- **AND** reconciliation does not dispatch the operation again

#### Scenario: Prior process left an ambiguous controlled or external operation

- **WHEN** restart finds a prior controlled/external operation whose downstream authoritative outcome cannot be proven
- **THEN** `read-operation` returns `OUTCOME_UNKNOWN`
- **AND** no retry or inferred receipt is produced

#### Scenario: External service execution is ambiguous

- **WHEN** an external effect may have occurred before its terminal receipt was committed
- **THEN** the operation is `OUTCOME_UNKNOWN`
- **AND** it is never automatically retried or accepted as promotion evidence

### Requirement: Catalog writes have one authority

All Catalog reads and writes used by UI, system, and Agent callers SHALL use package-owned Create Loop Capability Broker definitions. The stable Create Loop and Workflow Evolution manifest owner scopes SHALL be exactly `sciforge.create-loop` and `sciforge.workflow-evolution`. Every system-audience descriptor SHALL declare an exact non-empty `allowedSystemOwnerScopes` list; wildcard, audience-only, payload-derived, display-name, package-version, action-prefix, or provider-default system access SHALL be invalid contract registration.

The exact V1 system ACL SHALL be:

- `create-loop.catalog.read-snapshot`, `create-loop.catalog.get-candidate`, `create-loop.catalog.read-pending-promotion`, `create-loop.catalog.stage-candidate`, `create-loop.catalog.close-candidate`, `create-loop.catalog.evaluate`, `create-loop.catalog.cancel-evaluation`, `create-loop.catalog.prepare-promotion`, `create-loop.catalog.finalize-promotion`, `create-loop.catalog.abort-promotion`, and `create-loop.catalog.rollback`: only `sciforge.workflow-evolution`;
- `create-loop.catalog.read-operation`: `sciforge.create-loop` and `sciforge.workflow-evolution`, each restricted to its own `OperationOwnerScopeV1`; UI/Agent are allowed only under the same-principal namespace rule and are not system-owner ACL entries;
- `create-loop.catalog.dispatch-bound-service`: only `sciforge.create-loop`;
- `create-loop.catalog.read-anchor`, `create-loop.catalog.read-catalog`, and `create-loop.catalog.get-release`: UI/Agent only; Workflow Evolution SHALL use `create-loop.catalog.read-snapshot`, and these descriptors SHALL NOT register a system audience or `allowedSystemOwnerScopes`;
- `create-loop.catalog.provision`: UI only, and `create-loop.catalog.execute-bound-service`: UI/Agent only; neither SHALL register a system audience or `allowedSystemOwnerScopes`.

The Host and provider SHALL enforce audience and owner ACL before handler, operation, Candidate, pending, Release, Catalog, or Anchor lookup. Rejection SHALL disclose no existence metadata. UI/Agent principals remain subject to their descriptor audience and Host-derived principal checks and SHALL NOT be converted into system owners.

#### Scenario: Workflow Evolution requests a mutation

- **WHEN** Workflow Evolution stages/closes/evaluates a Candidate or prepares/finalizes/aborts/rolls back a Promotion
- **THEN** it invokes the public Create Loop capability contract through the system capability invoker
- **AND** it does not import the Catalog store/service/runtime or read the database directly

#### Scenario: Add the capability surface

- **WHEN** the Catalog capability set is installed
- **THEN** it is contributed by the Create Loop manifest/entrypoint
- **AND** no domain-specific IPC, preload method, MCP business handler, Host feature map, or central domain switch is added

#### Scenario: Another domain calls an owner-scoped read

- **WHEN** any unlisted manifest owner invokes an owner-scoped action
- **THEN** the request is denied before operation or Catalog lookup
- **AND** no existence metadata is disclosed

### Requirement: Destructive Catalog writes require a live inherited grant

Preparation, finalization, provisional abort, and rollback SHALL be callable by the system invoker only inside a matching currently approved destructive outer action for the same workspace, from the Host-derived Workflow Evolution lifecycle owner, and with the exact namespaced authorization purpose exported by the Create Loop public contract.

#### Scenario: Historical decision without current authorization

- **WHEN** persisted opaque `promotionDecisionId`/`promotionDecisionDigest` controller attestations or a prior invocation ID exist but no approved outer action is currently active
- **THEN** every protected destructive action is denied with zero Catalog writes

#### Scenario: Approved outer action settles

- **WHEN** an approved outer handler returns successfully
- **THEN** the Broker closes child registration and waits for every already registered inherited child to reach a terminal result before the outer action settles
- **AND** every later detached timer, Promise, or callback is unable to register or inherit the old authorization

#### Scenario: Approved outer action throws or is cancelled

- **WHEN** the approved outer handler throws or is cancelled
- **THEN** revoke and the provider's Host `enterCommit()` lease race at one linearization point
- **AND** revoke-first denies commit with zero protected writes
- **AND** commit-first forces outer settlement to wait for the registered transaction's COMMIT/rollback and terminal receipt

#### Scenario: Fire-and-forget child starts before return

- **WHEN** outer code calls an inherited protected operation without awaiting its Promise
- **AND** the child dispatches before the outer handler returns
- **THEN** automatic child registration prevents outer settlement until that child is terminal
- **AND** a barrier-delayed commit cannot occur after a successful settlement or revoked failure settlement

#### Scenario: Matching current action

- **WHEN** a UI-approved destructive Workflow Evolution handler synchronously awaits a protected operation for the same workspace
- **AND** the outer action declares the exact Promotion or rollback purpose required by the inner Catalog contract
- **THEN** the Host may propagate only that current action's grant
- **AND** Create Loop still validates operation identity, generation, Candidate, decision, and evidence digests

#### Scenario: Wrong destructive purpose

- **WHEN** `workflow-evolution.cancel-run`, `workflow-evolution.execute-rollback`, `workflow-evolution.execute-promotion`, or another destructive action attempts an inner operation requiring a different authorization purpose
- **THEN** inheritance is denied with zero Catalog writes

#### Scenario: Another domain uses the shared system surface

- **WHEN** a system caller whose manifest/lifecycle owner is not the frozen Workflow Evolution controller requests a protected action
- **THEN** Create Loop rejects it even if payload fields claim the controller identity
- **AND** no Catalog state changes
