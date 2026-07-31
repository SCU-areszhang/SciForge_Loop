## ADDED Requirements

### Requirement: Independent backend-first domain package

SciForge SHALL own Workflow Evolution as an independent domain package with its own contract, manifest, main entrypoint, lifecycle, capabilities, storage, and tests.

#### Scenario: Discover the package

- **WHEN** generated installed-domain composition is built
- **THEN** the package is discovered from `packages/domains/*/sciforge.domain.json`
- **AND** its main entrypoint is selected without a Host domain-ID switch or feature map

#### Scenario: Initial Stage1 activation

- **WHEN** P0–P2 are installed before product UI work
- **THEN** the package activates as backend-only
- **AND** no empty renderer facade, dedicated preload bridge, or direct Host import is created

### Requirement: Workflow Evolution capability surface is exact

The Stage1 public capability descriptors SHALL be exactly:

| Action ID | Effect | Approval | Audience | `allowedSystemOwnerScopes` |
| --- | --- | --- | --- | --- |
| `workflow-evolution.submit-requirement` | `workspace-write` | `confirmation` | UI | forbidden |
| `workflow-evolution.get-run` | `read` | none | UI, system | `sciforge.workflow-evolution` |
| `workflow-evolution.list-pending-gates` | `read` | none | UI, system | `sciforge.workflow-evolution` |
| `workflow-evolution.recheck-platform-gate` | `workspace-write` | none | UI, system | `sciforge.workflow-evolution` |
| `workflow-evolution.clarify-requirement` | `workspace-write` | none | UI | forbidden |
| `workflow-evolution.resolve-resource-gate` | `workspace-write` | none | UI | forbidden |
| `workflow-evolution.record-promotion-decision` | `workspace-write` | `confirmation` | UI | forbidden |
| `workflow-evolution.execute-promotion` | `destructive` | `confirmation` | UI | forbidden |
| `workflow-evolution.open-rollback-recovery` | `workspace-write` | `confirmation` | UI | forbidden |
| `workflow-evolution.execute-rollback` | `destructive` | `confirmation` | UI | forbidden |
| `workflow-evolution.cancel-run` | `destructive` | `confirmation` | UI | forbidden |
| `workflow-evolution.export-audit` | `external-write` | `confirmation` | UI | forbidden |

A descriptor without `system` audience SHALL reject the ACL field rather than carry an empty or inert value. The Host and provider SHALL enforce the two system-readable projections and platform recheck only for the stable manifest owner `sciforge.workflow-evolution`, before Run/Gate/command lookup. Stage1 has no Agent audience for `get-run`; Builder and Verifier receive only Controller-assembled operation inputs.

#### Scenario: Unlisted caller requests a system projection

- **WHEN** another system owner invokes `get-run`, `list-pending-gates`, or `recheck-platform-gate`
- **THEN** the request is denied before Run, Gate, or command lookup
- **AND** no existence metadata is disclosed

### Requirement: Ledger uses the Host workspace identity

Workflow Evolution SHALL partition all Ledger records, command idempotency, budgets, and Candidate leases only by opaque Host-provided `WorkspaceIdentityV1`. It SHALL reject payload workspace override and SHALL NOT canonicalize a trimmed path independently.

#### Scenario: Workspace aliases are used across restart

- **WHEN** source or packaged callers reopen one real directory through case/symlink aliases
- **THEN** they recover the same Ledger, command results, budget, gate, and Candidate lease

### Requirement: Ledger is the durable state truth

Workflow Evolution SHALL store Run/Attempt/Gate/Operation state and revisions, document revisions/digests, Controller-active Candidate leases, command intents, receipts, Agent operation handles, isolation/cancel receipts, budgets, decisions, and audit events in its package-owned SQLite Ledger.

#### Scenario: Application restarts while waiting

- **WHEN** a run is in any non-terminal state, including `WAITING_CLARIFICATION`, `WAITING_RESOURCE`, `WAITING_PLATFORM`, an authorization wait, `CANCELLING`, or `RECOVERY_REQUIRED`
- **AND** the application and package runtime restart
- **THEN** the same FSM version, run/attempt/operation revisions, resume reducer state/context, open gate, document digest, active Candidate lease, operation handle, and audit history are recovered
- **AND** the controller does not infer state from Markdown

#### Scenario: Transaction fails

- **WHEN** a state transition transaction fails before commit
- **THEN** no partial document, gate, event, or state update becomes visible

### Requirement: State transitions are explicit and fail closed

Every Evolution Run, Attempt, Gate, and Operation transition SHALL be validated against a frozen V1 enum, versioned legal-transition table, expected entity revision, terminal set, and reason/recovery matrix.

Every mutating Workflow Evolution capability SHALL require a stable `commandId`, strict request digest, and the current expected Run revision when a Run already exists. The Host SHALL derive restart-stable `CommandOwnerScopeV1` from the authenticated UI/OS principal or stable system `moduleId`; payload SHALL NOT supply it. The Ledger SHALL persist `(workspaceId, CommandOwnerScopeV1, actionId, commandId)` and the immutable response. Audience/owner checks SHALL occur before command lookup. Exact same-owner replay returns the same response; the same ID with a different digest, a stale expected revision, or a cross-owner lookup fails with zero writes and no existence disclosure.

`RunStateV1` SHALL contain the non-terminal states `RECEIVED`, `EVALUATING_COVERAGE`, `EXECUTING_ANCHOR`, `WAITING_CLARIFICATION`, `WAITING_RESOURCE`, `WAITING_PLATFORM`, `BUILDING_CANDIDATE`, `VERIFYING`, `WAITING_PROMOTION`, `WAITING_PROMOTION_AUTHORIZATION`, `PROMOTING`, `REPLAYING`, `WAITING_FINALIZE_AUTHORIZATION`, `FINALIZING`, `WAITING_ABORT_AUTHORIZATION`, `ABORTING_PROMOTION`, `WAITING_ROLLBACK_AUTHORIZATION`, `ROLLING_BACK`, `CANCELLING`, and `RECOVERY_REQUIRED`, and the terminal states `COMPLETED`, `REJECTED`, `CANCELLED`, `POLICY_BLOCKED`, `FAILED`, `STALE`, `ROLLED_BACK`, and `ROLLBACK_FAILED`.

`AttemptStateV1` SHALL be `CREATED`, `BUILDING`, `STAGED`, `EXECUTING`, `READY_FOR_VERIFICATION`, `VERIFYING`, `VERIFIED`, `REPAIRABLE_FAILED`, `FAILED`, `CANCELLED`, or `EXECUTION_UNKNOWN`.

`GateStateV1` SHALL be `OPEN`, `RESOLVED`, or `CANCELLED`; `GateKindV1` SHALL be exactly `CLARIFICATION`, `RESOURCE`, or `PLATFORM`. Promotion is represented by `PromotionDecisionV1` plus the explicit `WAITING_PROMOTION*` Run states, not by a Gate, so it cannot appear in `list-pending-gates` or the one-open-Gate constraint. `OperationStateV1` SHALL be `INTENT_RECORDED`, `IN_FLIGHT`, `CANCEL_REQUESTED`, `SUCCEEDED`, `FAILED`, `CANCELLED`, or `OUTCOME_UNKNOWN`. `RunKindV1` SHALL be `EVOLUTION` or `ROLLBACK_RECOVERY`; the former starts in `RECEIVED`, while the latter is created only by `open-rollback-recovery` directly in `WAITING_ROLLBACK_AUTHORIZATION`.

`RunEventV1` SHALL be a strict discriminated union with these event tags:

```text
REQUIREMENT_FROZEN
COVERAGE_AMBIGUOUS | COVERAGE_RESOURCE_GAP | COVERAGE_PLATFORM_GAP |
COVERAGE_POLICY_BLOCKED | COVERAGE_ANCHOR_SELECTED | COVERAGE_NEW_WORKFLOW
WAIT_GATE_RESOLVED
ANCHOR_TRIAL_COVERED | ANCHOR_TRIAL_PARTIAL | SNAPSHOT_DRIFT
CANDIDATE_READY | CANDIDATE_REPAIRABLE | CANDIDATE_TERMINAL_FAILURE
NO_CANDIDATE_STAGED | VERIFICATION_STARTED
VERIFICATION_PASSED | VERIFICATION_REPAIRABLE | VERIFICATION_TERMINAL_FAILURE
PROMOTION_REJECTED_CLOSED | PROMOTION_DECISION_APPROVED
PROMOTION_AUTHORIZATION_STARTED | FINALIZE_AUTHORIZATION_STARTED |
ABORT_AUTHORIZATION_STARTED | ROLLBACK_AUTHORIZATION_STARTED
CATALOG_RESULT_OBSERVED
CANCEL_REQUESTED | CANCELLATION_CONTAINED | CANCELLATION_UNKNOWN
RECOVERY_RESULT_OBSERVED
```

`CATALOG_RESULT_OBSERVED` and `RECOVERY_RESULT_OBSERVED` SHALL bind the exact action, operation ID, request digest, provider lookup state, optional immutable receipt/error digest, a required imported `CatalogFailureClassV1` exactly for provider `FAILED`, business outcome where applicable, pending-reservation match, and whether the required live authorization scope is still active. Payload code cannot choose a destination state.

`WAITING_PROMOTION_AUTHORIZATION` SHALL carry exactly one trusted `PromotionContinuationPhaseV1` value:

```text
PREPARE | REPLAY_OR_ABORT
```

`PREPARE` is legal only when no pending reservation exists and an approved `PromotionDecisionV1` is bound. `REPLAY_OR_ABORT` is legal only when the exact matching pending reservation exists and its replay operation authoritatively returned `NOT_FOUND`. The phase is derived by the reducer from trusted receipts; payload cannot set it. A confirmed `PROMOTION_AUTHORIZATION_STARTED` event SHALL bind the stored phase and, for `REPLAY_OR_ABORT`, the user's frozen `REPLAY` or `ABORT` choice.

`CatalogErrorCodeV1` and `CatalogFailureClassV1` SHALL be owned and versioned only by Create Loop in `@sciforge/domain-create-loop/catalog-contract`. Workflow Evolution SHALL import those types, the complete code-to-class mapping, each action's allowed terminal-code subset, and the executable fixtures from that public entrypoint; it SHALL NOT redeclare, widen, narrow, or translate either enum locally. `ComputeReservationV1` SHALL be the generic Host/SDK-owned type exported only from `@sciforge/domain-sdk/contract`; A and B SHALL import the same type and SHALL NOT define package-local aliases.

The generated B reducer SHALL accept one strict tuple:

```text
(resumeReducerState, action, providerLookupState, optional CatalogFailureClassV1,
 businessOutcome, pendingMatch, requiredDisposition, liveAuthorization,
 immutable receipt/error identity, stored trusted continuation guards)
  -> (RunEventV1, Operation transition, Attempt transition, Run destination)
```

`providerLookupState` SHALL be exactly `NOT_FOUND | IN_PROGRESS | SUCCEEDED | FAILED | CANCELLED | OUTCOME_UNKNOWN`. A failure class is required exactly when `providerLookupState=FAILED`, and its A-exported code/class pair must belong to the action's A-exported subset. Payload data cannot supply `resumeReducerState`, a failure class, a disposition, or a destination. Unknown codes, missing required receipts, owner mismatch, malformed records, an impossible provider state for an action, or an impossible action/code/class/guard combination SHALL be reduced as `IDENTITY_OR_DIGEST_CONFLICT` to `RECOVERY_REQUIRED`; they SHALL NOT be guessed into a business failure.

The following provider-state rows SHALL be part of that generated matrix before action-specific success or failure rows are applied:

| Stored resume state / action | Provider observation and guards | Event / destination and required effect |
| --- | --- | --- |
| any / `provision` | any observation | `RECOVERY_RESULT_OBSERVED -> RECOVERY_REQUIRED(IDENTITY_OR_DIGEST_CONFLICT)` because B never owns or journals provisioning |
| stored state / approval-free `stage-candidate`, `close-candidate`, non-replay `evaluate`, or `cancel-evaluation` | authoritative lookup `NOT_FOUND`; B Operation was never authoritatively `IN_FLIGHT`; exact owner/workspace/action/operation/request digests match | state-preserving `RECOVERY_RESULT_OBSERVED`; keep Operation `INTENT_RECORDED`, then the fenced reconciler may redispatch only the exact request with the same operation ID |
| any / any action | `NOT_FOUND` after B stored authoritative `IN_FLIGHT` | `RECOVERY_RESULT_OBSERVED -> RECOVERY_REQUIRED(IDENTITY_OR_DIGEST_CONFLICT)`; no redispatch |
| any / any action | `IN_PROGRESS` with matching identity | `CATALOG_RESULT_OBSERVED` or `RECOVERY_RESULT_OBSERVED -> RECOVERY_REQUIRED`; Operation is or remains `IN_FLIGHT`; no second dispatch |
| any / any action | `OUTCOME_UNKNOWN` with matching identity | result event `-> RECOVERY_REQUIRED`; Operation becomes terminal `OUTCOME_UNKNOWN`; no second dispatch |
| any / any action | `SUCCEEDED`, `FAILED`, or `CANCELLED` with a missing, malformed, foreign, or digest-mismatched receipt/error | result event `-> RECOVERY_REQUIRED(IDENTITY_OR_DIGEST_CONFLICT)` |
| any / database-only `stage-candidate`, `close-candidate`, `prepare-promotion`, `finalize-promotion`, `abort-promotion`, or `rollback` | `CANCELLED` | result event `-> RECOVERY_REQUIRED(IDENTITY_OR_DIGEST_CONFLICT)` because that provider state is impossible for an atomic database-only operation |

Matching `SUCCEEDED` and controlled-execution `CANCELLED` observations SHALL reduce as follows:

| Stored resume state / action | Authoritative success/contained observation and guards | Event / destination and required effect |
| --- | --- | --- |
| `BUILDING_CANDIDATE` / `stage-candidate` | matching Candidate/validation receipt and, when replacing a predecessor, the matching atomic `SUPERSEDED` receipt | `CATALOG_RESULT_OBSERVED -> BUILDING_CANDIDATE`; bind `activeCandidateId`, move Attempt to `STAGED`, and do not infer evaluation success |
| `BUILDING_CANDIDATE` / `close-candidate` | matching `STALE` receipt for the active predecessor and stored continuation `BASE_GENERATION_DRIFT` | `CATALOG_RESULT_OBSERVED -> EVALUATING_COVERAGE`; terminalize the Attempt and release the lease atomically |
| `BUILDING_CANDIDATE` or `VERIFYING` / `close-candidate` | matching `FAILED` receipt and stored terminal continuation fixed to `POLICY_BLOCKED` | `CATALOG_RESULT_OBSERVED -> POLICY_BLOCKED`; terminalize the Attempt and release the lease atomically |
| `BUILDING_CANDIDATE` or `VERIFYING` / `close-candidate` | matching `FAILED` receipt and stored terminal continuation fixed to `FAILED` | `CATALOG_RESULT_OBSERVED -> FAILED`; terminalize the Attempt and release the lease atomically |
| `WAITING_PROMOTION` / `close-candidate` | matching `REJECTED` receipt and frozen human rejection | `PROMOTION_REJECTED_CLOSED -> REJECTED`; release the lease atomically |
| `CANCELLING` / `close-candidate` | matching `CANCELLED` receipt and every other owned operation is authoritatively contained | `CANCELLATION_CONTAINED -> CANCELLED`; close any Gate and release the lease atomically |
| any / `close-candidate` | any other success/disposition/resume-continuation combination | `CATALOG_RESULT_OBSERVED -> RECOVERY_REQUIRED(IDENTITY_OR_DIGEST_CONFLICT)`; retain the lease |
| `EXECUTING_ANCHOR` / non-replay `evaluate` | matching terminal receipt; every MUST acceptance passes | `ANCHOR_TRIAL_COVERED -> COMPLETED` |
| `EXECUTING_ANCHOR` / non-replay `evaluate` | matching terminal receipt; an authoritative MUST acceptance fails | `ANCHOR_TRIAL_PARTIAL -> BUILDING_CANDIDATE` |
| `BUILDING_CANDIDATE` / private `evaluate` | matching `SUCCEEDED + PASS` receipt for the current Candidate/Attempt/reservation | `CANDIDATE_READY -> BUILDING_CANDIDATE`; move the Attempt to `READY_FOR_VERIFICATION` atomically |
| `BUILDING_CANDIDATE` / private `evaluate` | matching known repairable non-pass and another frozen Attempt can be admitted | `CANDIDATE_REPAIRABLE -> BUILDING_CANDIDATE`; terminalize the old Attempt and create exactly the next Attempt |
| `BUILDING_CANDIDATE` / private `evaluate` | matching known terminal non-pass | journal the required `close-candidate(FAILED)` continuation; remain in the stored state until its matching disposition receipt selects the fixed terminal destination |
| `VERIFYING` / public, regression, scientific, or sealed `evaluate` | matching terminal suite receipt for the current Candidate/Attempt/reservation | state-preserving `CATALOG_RESULT_OBSERVED -> VERIFYING`; bind the receipt, without declaring verification pass by itself |
| `REPLAYING` / replay `evaluate` | matching `SUCCEEDED + PASS` and matching pending | `CATALOG_RESULT_OBSERVED -> FINALIZING` with live Promotion scope, otherwise `WAITING_FINALIZE_AUTHORIZATION` |
| `REPLAYING` / replay `evaluate` | matching `SUCCEEDED + FAIL`, authoritative `FAILED`, or contained `CANCELLED`, and matching pending | `CATALOG_RESULT_OBSERVED -> ABORTING_PROMOTION` with live Promotion scope, otherwise `WAITING_ABORT_AUTHORIZATION` |
| `CANCELLING` / non-replay `evaluate` | matching terminal `SUCCEEDED`, `FAILED`, or `CANCELLED` receipt proves the target operation is contained | state-preserving `CATALOG_RESULT_OBSERVED -> CANCELLING`; the frozen cancellation reducer consumes the terminal business result only as containment and cannot turn it into verification/promotion evidence |
| `CANCELLING` / `cancel-evaluation` | cancellation receipt, or target terminal receipt, proves containment | state-preserving `CATALOG_RESULT_OBSERVED -> CANCELLING`; emit `CANCELLATION_CONTAINED` only after all owned operations and any Candidate close are authoritative |
| any / non-replay `evaluate` or `cancel-evaluation` | `CANCELLED` outside a stored cancellation/containment continuation | result event `-> RECOVERY_REQUIRED(IDENTITY_OR_DIGEST_CONFLICT)` |

For `providerLookupState=FAILED`, the following table SHALL be the total B-owned class/guard mapping. “After close” means the reducer first journals the one required `close-candidate` operation and cannot reach the named destination until its matching disposition receipt is committed; if no Candidate was ever staged, the reducer uses `NO_CANDIDATE_STAGED` and the empty-lease rule instead.

| Stored resume state / action | Imported `CatalogFailureClassV1` and guards | Event / destination |
| --- | --- | --- |
| any / `provision` | every class allowed by A for `provision` | `RECOVERY_RESULT_OBSERVED -> RECOVERY_REQUIRED(IDENTITY_OR_DIGEST_CONFLICT)` |
| `BUILDING_CANDIDATE` / `stage-candidate` | `STALE_GENERATION` | after `STALE` close when a predecessor exists, `CATALOG_RESULT_OBSERVED -> EVALUATING_COVERAGE`; otherwise the no-Candidate path goes directly to `EVALUATING_COVERAGE` |
| `BUILDING_CANDIDATE` / `stage-candidate` | `POLICY_BLOCKED` | after required `FAILED` close, `CATALOG_RESULT_OBSERVED -> POLICY_BLOCKED` |
| `BUILDING_CANDIDATE` / `stage-candidate` | `VALIDATION_REJECTED` or `PERMANENT_FAILURE` | after required `FAILED` close, `CATALOG_RESULT_OBSERVED -> FAILED` |
| `BUILDING_CANDIDATE` / `stage-candidate` | `PENDING_PROMOTION_PRESENT` or `IDENTITY_OR_DIGEST_CONFLICT` | `CATALOG_RESULT_OBSERVED -> RECOVERY_REQUIRED`; no automatic retry of the terminal Operation |
| any Candidate-bearing state / `close-candidate` | `VALIDATION_REJECTED`, `PENDING_PROMOTION_PRESENT`, `IDENTITY_OR_DIGEST_CONFLICT`, or `PERMANENT_FAILURE` | `CATALOG_RESULT_OBSERVED -> RECOVERY_REQUIRED`; the matching disposition is unproven and the Candidate lease remains held |
| `CANCELLING` / non-replay `evaluate` | any class allowed by A for `evaluate`, with an exact terminal operation/error receipt | state-preserving `CATALOG_RESULT_OBSERVED -> CANCELLING`; the receipt proves operation containment but is ineligible as verification/promotion evidence |
| `EXECUTING_ANCHOR` / non-replay `evaluate` | `STALE_GENERATION` | `SNAPSHOT_DRIFT -> EVALUATING_COVERAGE` |
| `BUILDING_CANDIDATE` or `VERIFYING` / non-replay `evaluate` | `STALE_GENERATION` | after required `STALE` close, `CATALOG_RESULT_OBSERVED -> EVALUATING_COVERAGE` |
| `EXECUTING_ANCHOR` / non-replay `evaluate` | `POLICY_BLOCKED` | `CATALOG_RESULT_OBSERVED -> POLICY_BLOCKED` |
| `BUILDING_CANDIDATE` or `VERIFYING` / non-replay `evaluate` | `POLICY_BLOCKED` | after required `FAILED` close, `CATALOG_RESULT_OBSERVED -> POLICY_BLOCKED` |
| `EXECUTING_ANCHOR` / non-replay `evaluate` | `VALIDATION_REJECTED` or `PERMANENT_FAILURE` | `CATALOG_RESULT_OBSERVED -> FAILED` |
| `BUILDING_CANDIDATE` or `VERIFYING` / non-replay `evaluate` | `VALIDATION_REJECTED` or `PERMANENT_FAILURE` | after required `FAILED` close, `CATALOG_RESULT_OBSERVED -> FAILED` |
| `EXECUTING_ANCHOR`, `BUILDING_CANDIDATE`, or `VERIFYING` / non-replay `evaluate` | `PENDING_MISMATCH` or `IDENTITY_OR_DIGEST_CONFLICT` | `CATALOG_RESULT_OBSERVED -> RECOVERY_REQUIRED`; no automatic retry of the terminal Operation |
| `REPLAYING` / replay `evaluate` | `STALE_GENERATION`, `POLICY_BLOCKED`, `VALIDATION_REJECTED`, or `PERMANENT_FAILURE`, with exact matching pending | `CATALOG_RESULT_OBSERVED -> ABORTING_PROMOTION` with live Promotion scope, otherwise `WAITING_ABORT_AUTHORIZATION` |
| `REPLAYING` / replay `evaluate` | `PENDING_MISMATCH` or `IDENTITY_OR_DIGEST_CONFLICT`, or any class without exact matching pending | `CATALOG_RESULT_OBSERVED -> RECOVERY_REQUIRED` |
| `CANCELLING` / `cancel-evaluation` | `VALIDATION_REJECTED`, `IDENTITY_OR_DIGEST_CONFLICT`, or `PERMANENT_FAILURE` | `CANCELLATION_UNKNOWN -> RECOVERY_REQUIRED`; failure does not prove target containment |
| `PROMOTING` / `prepare-promotion` | `AUTHORIZATION_REQUIRED` or `RETRYABLE_ZERO_WRITE`, with proven zero write and no foreign pending | `CATALOG_RESULT_OBSERVED -> WAITING_PROMOTION_AUTHORIZATION(PREPARE)`; release the terminal Operation's reservation exactly once, and any later confirmed new Operation gets a new reservation |
| `PROMOTING` / `prepare-promotion` | `STALE_GENERATION` | after required `STALE` close, `CATALOG_RESULT_OBSERVED -> STALE` |
| `PROMOTING` / `prepare-promotion` | `POLICY_BLOCKED` | after required `FAILED` close, `CATALOG_RESULT_OBSERVED -> POLICY_BLOCKED` |
| `PROMOTING` / `prepare-promotion` | `VALIDATION_REJECTED` or `PERMANENT_FAILURE` | after required `FAILED` close, `CATALOG_RESULT_OBSERVED -> FAILED` |
| `PROMOTING` / `prepare-promotion` | `PENDING_PROMOTION_PRESENT` or `IDENTITY_OR_DIGEST_CONFLICT` | `CATALOG_RESULT_OBSERVED -> RECOVERY_REQUIRED` |
| `FINALIZING` / `finalize-promotion` | `AUTHORIZATION_REQUIRED`, `RETRYABLE_ZERO_WRITE`, `STALE_GENERATION`, `POLICY_BLOCKED`, `VALIDATION_REJECTED`, or `PERMANENT_FAILURE`, with exact pending and proven zero write | `CATALOG_RESULT_OBSERVED -> WAITING_FINALIZE_AUTHORIZATION`; a new confirmation may finalize with a new Operation or explicitly abandon |
| `FINALIZING` / `finalize-promotion` | `PENDING_MISMATCH` or `IDENTITY_OR_DIGEST_CONFLICT`, or any class without exact pending | `CATALOG_RESULT_OBSERVED -> RECOVERY_REQUIRED` |
| `ABORTING_PROMOTION` / `abort-promotion` | `AUTHORIZATION_REQUIRED` or `RETRYABLE_ZERO_WRITE`, with exact pending and proven zero write | `CATALOG_RESULT_OBSERVED -> WAITING_ABORT_AUTHORIZATION` |
| `ABORTING_PROMOTION` / `abort-promotion` | `STALE_GENERATION`, `POLICY_BLOCKED`, `VALIDATION_REJECTED`, `PENDING_MISMATCH`, `IDENTITY_OR_DIGEST_CONFLICT`, or `PERMANENT_FAILURE` | `CATALOG_RESULT_OBSERVED -> RECOVERY_REQUIRED`; retain the pending reservation |
| `ROLLING_BACK` / `rollback` | `AUTHORIZATION_REQUIRED`, `RETRYABLE_ZERO_WRITE`, or `PENDING_PROMOTION_PRESENT`, with proven zero write | `CATALOG_RESULT_OBSERVED -> WAITING_ROLLBACK_AUTHORIZATION` |
| `ROLLING_BACK` / `rollback` | `STALE_GENERATION`, `POLICY_BLOCKED`, `VALIDATION_REJECTED`, or `PERMANENT_FAILURE`, with proven zero write | `CATALOG_RESULT_OBSERVED -> ROLLBACK_FAILED` |
| `ROLLING_BACK` / `rollback` | `IDENTITY_OR_DIGEST_CONFLICT` | `CATALOG_RESULT_OBSERVED -> RECOVERY_REQUIRED` |

Destructive-action `NOT_FOUND` SHALL use the separately enumerated promotion/rollback rows below. Every `SUCCEEDED`, `FAILED`, or `CANCELLED` combination omitted from the success and failure tables above is an impossible tuple and therefore maps to `RECOVERY_REQUIRED(IDENTITY_OR_DIGEST_CONFLICT)`.

Where the matrix names a mapped terminal Run state, `POLICY_BLOCKED` maps only to Run `POLICY_BLOCKED`; `VALIDATION_REJECTED`, `PERMANENT_FAILURE`, budget exhaustion, and Attempt-limit exhaustion map to Run `FAILED`; and `STALE_GENERATION` follows only the explicit stale/drift rows. No other failure class may choose those business terminal states.

The schemas/descriptors SHALL generate one machine-readable event/guard/adjacency/recovery matrix used directly by the reducer and exhaustive tests. The matrix, not prose or a caller-provided `resumeState`, SHALL choose the destination. The fixture suite SHALL enumerate the full Cartesian product of every A-exported action and allowed error code/class, every provider lookup state, every legal stored resume state, and every relevant pending/disposition/live-authorization/business-outcome guard partition; each tuple SHALL assert exactly one legal event/destination or the explicit impossible-tuple recovery result, and no allowed action/code pair may be absent. All omitted event/state/guard combinations are illegal zero-write transitions.

The Evolution Run matrix SHALL encode these exact non-promotion paths:

| From | `RunEventV1` / authoritative guard | To |
| --- | --- | --- |
| `RECEIVED` | `REQUIREMENT_FROZEN` | `EVALUATING_COVERAGE` |
| `EVALUATING_COVERAGE` | `COVERAGE_AMBIGUOUS` | `WAITING_CLARIFICATION` |
| `EVALUATING_COVERAGE` | `COVERAGE_RESOURCE_GAP` | `WAITING_RESOURCE` |
| `EVALUATING_COVERAGE` | `COVERAGE_PLATFORM_GAP` | `WAITING_PLATFORM` |
| `EVALUATING_COVERAGE` | `COVERAGE_POLICY_BLOCKED` | `POLICY_BLOCKED` |
| `EVALUATING_COVERAGE` | `COVERAGE_ANCHOR_SELECTED` | `EXECUTING_ANCHOR` |
| `EVALUATING_COVERAGE` | `COVERAGE_NEW_WORKFLOW` | `BUILDING_CANDIDATE` |
| `WAITING_CLARIFICATION`, `WAITING_RESOURCE`, `WAITING_PLATFORM` | `WAIT_GATE_RESOLVED` with the exact open Gate and new frozen evidence | `EVALUATING_COVERAGE` |
| `EXECUTING_ANCHOR` | `ANCHOR_TRIAL_COVERED` at the same Catalog/generation | `COMPLETED` |
| `EXECUTING_ANCHOR` | `ANCHOR_TRIAL_PARTIAL` with authoritative Release-bound MUST failure | `BUILDING_CANDIDATE` |
| `EXECUTING_ANCHOR` | `SNAPSHOT_DRIFT` before a Release-derived decision | `EVALUATING_COVERAGE` |
| `EXECUTING_ANCHOR` | controlled execution is `IN_PROGRESS`/`OUTCOME_UNKNOWN` or evidence is mismatched | `RECOVERY_REQUIRED` |
| `BUILDING_CANDIDATE` | `CANDIDATE_READY` with stage/private-evaluation receipts; current Attempt becomes durable `READY_FOR_VERIFICATION` | `BUILDING_CANDIDATE` |
| `BUILDING_CANDIDATE` | `VERIFICATION_STARTED` with current Attempt `READY_FOR_VERIFICATION`; Attempt becomes `VERIFYING` | `VERIFYING` |
| `BUILDING_CANDIDATE` | `CANDIDATE_REPAIRABLE`; current Attempt becomes `REPAIRABLE_FAILED` and budget/Attempt capacity remains | `BUILDING_CANDIDATE` |
| `BUILDING_CANDIDATE` | stage returns `STALE_GENERATION`; current Attempt is terminal and current Candidate, if any, has matching `STALE` close receipt | `EVALUATING_COVERAGE` |
| `BUILDING_CANDIDATE` | `CANDIDATE_TERMINAL_FAILURE`; current Attempt is terminal and current Candidate, if any, has the required close receipt | `FAILED` or `POLICY_BLOCKED` as fixed by the failure class |
| `BUILDING_CANDIDATE` | controlled/Agent work is `IN_PROGRESS`/`OUTCOME_UNKNOWN`, or stage/evaluation identity is mismatched | `RECOVERY_REQUIRED` |
| `VERIFYING` | `VERIFICATION_REPAIRABLE`; current Attempt becomes `REPAIRABLE_FAILED` and budget/Attempt capacity remains | `BUILDING_CANDIDATE` |
| `VERIFYING` | `VERIFICATION_PASSED` with every trusted receipt bound; one transaction freezes `VerificationReportV1` and makes the current Attempt `VERIFIED` | `WAITING_PROMOTION` |
| `VERIFYING` | `VERIFICATION_TERMINAL_FAILURE`; current Attempt becomes `FAILED` and current Candidate has the required close receipt | `FAILED` or `POLICY_BLOCKED` as fixed by the failure class |
| `VERIFYING` | Verifier/sealed/regression work is `IN_PROGRESS`/`OUTCOME_UNKNOWN` or evidence is mismatched | `RECOVERY_REQUIRED` |
| `WAITING_PROMOTION` | `PROMOTION_REJECTED_CLOSED` with matching `REJECTED` close receipt | `REJECTED` |
| `WAITING_PROMOTION` | `PROMOTION_DECISION_APPROVED` with exact Candidate/report digests | `WAITING_PROMOTION_AUTHORIZATION(PREPARE)` |
| `WAITING_PROMOTION` | rejection close is `IN_PROGRESS`/`OUTCOME_UNKNOWN` or mismatched | `RECOVERY_REQUIRED` |

`CANDIDATE_REPAIRABLE` is a legal state-preserving `BUILDING_CANDIDATE -> BUILDING_CANDIDATE` event; `VERIFICATION_REPAIRABLE` is `VERIFYING -> BUILDING_CANDIDATE`. Both atomically terminalize the old Attempt as `REPAIRABLE_FAILED` and create the next immutable Attempt as `CREATED`; the old Candidate remains current until a successful successor stage atomically records it `SUPERSEDED`. If the next Attempt cannot be admitted, the current Candidate must be closed before the Run terminates.

The Promotion and rollback portion of the same generated matrix SHALL apply this exact result mapping:

| From / action | Authoritative observation | To |
| --- | --- | --- |
| `WAITING_PROMOTION_AUTHORIZATION(PREPARE)` | `PROMOTION_AUTHORIZATION_STARTED` | `PROMOTING` |
| `WAITING_PROMOTION_AUTHORIZATION(REPLAY_OR_ABORT)` | `PROMOTION_AUTHORIZATION_STARTED` with frozen `REPLAY` choice | `REPLAYING` |
| `WAITING_PROMOTION_AUTHORIZATION(REPLAY_OR_ABORT)` | `PROMOTION_AUTHORIZATION_STARTED` with frozen `ABORT` choice and matching pending | `ABORTING_PROMOTION` |
| `PROMOTING` / prepare | `SUCCEEDED` with matching pending reservation | `REPLAYING` |
| `PROMOTING` / prepare | `NOT_FOUND`, `AUTHORIZATION_REQUIRED`, or `RETRYABLE_ZERO_WRITE`, with zero write and no foreign pending | `WAITING_PROMOTION_AUTHORIZATION(PREPARE)` |
| `PROMOTING` / prepare | `STALE_GENERATION`, after matching `STALE` Candidate close | `STALE` |
| `PROMOTING` / prepare | `POLICY_BLOCKED`/`VALIDATION_REJECTED`/`PERMANENT_FAILURE`, after the mapped Candidate close | `POLICY_BLOCKED` or `FAILED` |
| `PROMOTING` / prepare | `IN_PROGRESS`, `OUTCOME_UNKNOWN`, `PENDING_PROMOTION_PRESENT`, a foreign/mismatched pending guard, or `IDENTITY_OR_DIGEST_CONFLICT` | `RECOVERY_REQUIRED` |
| `REPLAYING` / replay | authoritative `NOT_FOUND` with matching pending | `WAITING_PROMOTION_AUTHORIZATION(REPLAY_OR_ABORT)` |
| `REPLAYING` / replay | `SUCCEEDED + PASS`, matching pending, live Promotion scope | `FINALIZING` |
| `REPLAYING` / replay | `SUCCEEDED + PASS`, matching pending, no live Promotion scope | `WAITING_FINALIZE_AUTHORIZATION` |
| `REPLAYING` / replay | `SUCCEEDED + FAIL`, authoritative `FAILED`, or contained `CANCELLED`, matching pending and live Promotion scope | `ABORTING_PROMOTION` |
| `REPLAYING` / replay | the same non-pass outcomes with no live Promotion scope | `WAITING_ABORT_AUTHORIZATION` |
| `REPLAYING` / replay | `IN_PROGRESS`, `OUTCOME_UNKNOWN`, foreign pending, or identity/digest mismatch | `RECOVERY_REQUIRED` |
| `WAITING_FINALIZE_AUTHORIZATION` | `FINALIZE_AUTHORIZATION_STARTED` | `FINALIZING` |
| `WAITING_FINALIZE_AUTHORIZATION` | `ABORT_AUTHORIZATION_STARTED` with a terminal passed replay and explicit abandonment reason | `ABORTING_PROMOTION` |
| `FINALIZING` / finalize | `SUCCEEDED` with atomic `PROMOTED` disposition | `COMPLETED` |
| `FINALIZING` / finalize | `NOT_FOUND`, `AUTHORIZATION_REQUIRED`, or `RETRYABLE_ZERO_WRITE`, with matching pending and zero write | `WAITING_FINALIZE_AUTHORIZATION` |
| `FINALIZING` / finalize | `IN_PROGRESS`, `OUTCOME_UNKNOWN`, `PENDING_MISMATCH`, `IDENTITY_OR_DIGEST_CONFLICT`, or a malformed success receipt | `RECOVERY_REQUIRED` |
| `FINALIZING` / finalize | another known zero-write failure while the exact pending reservation remains | `WAITING_FINALIZE_AUTHORIZATION`, where a fresh confirmation may finalize or explicitly abandon |
| `WAITING_ABORT_AUTHORIZATION` | `ABORT_AUTHORIZATION_STARTED` | `ABORTING_PROMOTION` |
| `ABORTING_PROMOTION` / abort | `SUCCEEDED` with atomic `ABORTED` disposition | `FAILED` |
| `ABORTING_PROMOTION` / abort | `NOT_FOUND`, `AUTHORIZATION_REQUIRED`, or `RETRYABLE_ZERO_WRITE`, with matching pending and zero write | `WAITING_ABORT_AUTHORIZATION` |
| `ABORTING_PROMOTION` / abort | `IN_PROGRESS`, `OUTCOME_UNKNOWN`, `PENDING_MISMATCH`, `IDENTITY_OR_DIGEST_CONFLICT`, or any failure that cannot prove the exact pending remains | `RECOVERY_REQUIRED` |
| `WAITING_ROLLBACK_AUTHORIZATION` | `ROLLBACK_AUTHORIZATION_STARTED` | `ROLLING_BACK` |
| `ROLLING_BACK` / rollback | `SUCCEEDED` with matching RollbackReceipt | `ROLLED_BACK` |
| `ROLLING_BACK` / rollback | `NOT_FOUND`, `AUTHORIZATION_REQUIRED`, `RETRYABLE_ZERO_WRITE`, or `PENDING_PROMOTION_PRESENT`, with proven zero write | `WAITING_ROLLBACK_AUTHORIZATION` |
| `ROLLING_BACK` / rollback | authoritative `STALE_GENERATION`, `POLICY_BLOCKED`, `VALIDATION_REJECTED`, or `PERMANENT_FAILURE`, with proven zero write | `ROLLBACK_FAILED` |
| `ROLLING_BACK` / rollback | `IN_PROGRESS`, `OUTCOME_UNKNOWN`, a foreign/mismatched pending guard, `IDENTITY_OR_DIGEST_CONFLICT`, or malformed receipt | `RECOVERY_REQUIRED` |

For every destructive action in this table, authoritative `NOT_FOUND` leaves the existing B Operation `INTENT_RECORDED`; a later confirmed retry uses the same operation ID and request. A terminal failed zero-write result leaves that Operation terminal and any permitted confirmed retry creates a new operation ID linked to it. No terminal Operation is reopened.

Replay `NOT_FOUND` is not background authority. It leaves the replay Operation `INTENT_RECORDED`, keeps its prebound `ComputeReservationV1` in `HELD_PENDING_REPLAY`, and enters only `WAITING_PROMOTION_AUTHORIZATION(REPLAY_OR_ABORT)`. A fresh `execute-promotion` confirmation may then either dispatch the exact approval-free replay request with the same operation/reservation IDs or explicitly abort the matching pending reservation. The Host derives `LIVE_APPROVED_OUTER_CONTROLLER` only from that current same-owner/workspace Promotion-purpose invocation, so a standalone/background `evaluate` call fails before A's handler. The pre-prepare and pending continuations cannot be confused.

An Evolution Run that has no staged Candidate may terminate without a Create Loop disposition receipt. In particular, `COVERED`, pre-stage policy/budget failure, and a first-stage stale result SHALL NOT fabricate a Candidate or close receipt. If B acquired the workspace lease but `activeCandidateId` is still null, B SHALL emit trusted `NO_CANDIDATE_STAGED` and may release that empty lease in the same Ledger transaction that transitions or terminates the Run, but only after every operation is terminal and no pending Promotion exists.

Once `activeCandidateId` is non-null, the Run SHALL NOT become terminal or release its lease until A's matching terminal disposition receipt is committed. `PROMOTED` and `ABORTED` may be carried by the atomic finalize/abort receipt; every other terminal outcome uses `close-candidate`. An unknown or mismatched close enters `RECOVERY_REQUIRED` and retains the lease. A `ROLLBACK_RECOVERY` Run never owns a Candidate lease.

The Controller's Candidate-disposition mapping SHALL be unique: a successful successor stage uses `SUPERSEDED` for the predecessor; finalization uses `PROMOTED`; provisional abort uses `ABORTED`; human rejection uses `REJECTED`; Run cancellation uses `CANCELLED`; base-generation invalidation uses `STALE`; and policy, validation, budget, Attempt-limit, or other known terminal failure uses `FAILED`. No result event may select another disposition for the same condition.

The cancellation and reconciliation portion of the generated matrix SHALL be:

| From / guard | `RunEventV1` | To |
| --- | --- | --- |
| cancellable non-Candidate waiting state; no active work, lease, pending Promotion, or unresolved destructive operation | `CANCEL_REQUESTED` | `CANCELLED` |
| lease-waiting `BUILDING_CANDIDATE`; `candidateLeaseHeld=false`, no Attempt/Operation/reservation/Candidate | `CANCEL_REQUESTED` | `CANCELLED` |
| pristine `ROLLBACK_RECOVERY` in `WAITING_ROLLBACK_AUTHORIZATION`; no rollback dispatch intent, Operation, Catalog claim, or child registration has ever existed | `CANCEL_REQUESTED` | `CANCELLED` |
| pre-pending `WAITING_PROMOTION_AUTHORIZATION(PREPARE)` with `HELD_PREPARE_RETRY`; while holding the cancellation side of B's Controller dispatch/cancel fence, the exact prepare Operation is still `INTENT_RECORDED`, fresh owner/workspace-scoped operation and pending reads prove it safe to abandon, no B dispatcher acquired that fence first and reached canonical child registration, and every other Operation is terminal | `CANCEL_REQUESTED` | `CANCELLED` in that transaction when `activeCandidateId=null`; otherwise `CANCELLING` after atomic intent abandonment/reservation release and Candidate-close journaling |
| any cancellable active-safe state, empty-lease state, or Candidate-bearing state; no pending Promotion or unresolved destructive operation | `CANCEL_REQUESTED` | `CANCELLING` |
| `CANCELLING`; every operation authoritatively terminal/contained; matching Candidate `CANCELLED` close receipt if `activeCandidateId != null` | `CANCELLATION_CONTAINED` | `CANCELLED` |
| `CANCELLING`; any cancel/terminal/close result unresolved or mismatched | `CANCELLATION_UNKNOWN` | `RECOVERY_REQUIRED` |
| `RECOVERY_REQUIRED`; terminal result is now authoritative | `RECOVERY_RESULT_OBSERVED` | exactly the destination produced by reducing that result from stored `resumeReducerState` |

`CANCEL_REQUESTED` while a pending Promotion, a prepare/rollback operation is `IN_FLIGHT` or `OUTCOME_UNKNOWN`, any other destructive operation is unresolved, or a rollback-recovery Run has ever recorded a rollback dispatch intent/Operation or registered its child SHALL be a zero-write `NON_CANCELLABLE_SAFETY_PHASE` denial. The only rollback-recovery cancellation is the pristine pre-intent row above. A non-destructive operation already terminal `OUTCOME_UNKNOWN` may be quarantined and then cancelled only if its isolation contract proves that it cannot commit a protected/external write; otherwise recovery remains non-cancellable.

Attempt edges SHALL be exactly `CREATED -> BUILDING`; `BUILDING -> {STAGED, FAILED, CANCELLED, EXECUTION_UNKNOWN}`; `STAGED -> {EXECUTING, CANCELLED}`; `EXECUTING -> {READY_FOR_VERIFICATION, REPAIRABLE_FAILED, FAILED, CANCELLED, EXECUTION_UNKNOWN}`; `READY_FOR_VERIFICATION -> VERIFYING`; and `VERIFYING -> {VERIFIED, REPAIRABLE_FAILED, FAILED, CANCELLED, EXECUTION_UNKNOWN}`. The last five named outcomes are terminal. Before private evaluation dispatch, one Ledger transaction SHALL move `STAGED -> EXECUTING` and record the operation intent; therefore a known pre-dispatch/evaluation failure is represented by `EXECUTING -> FAILED`, not an unlisted `STAGED -> FAILED`.

Gate edges SHALL be exactly `OPEN -> {RESOLVED, CANCELLED}`.

Operation edges SHALL be exactly `INTENT_RECORDED -> {IN_FLIGHT, SUCCEEDED, FAILED, CANCELLED, OUTCOME_UNKNOWN}`; `IN_FLIGHT -> {SUCCEEDED, FAILED, CANCEL_REQUESTED, OUTCOME_UNKNOWN}`; and `CANCEL_REQUESTED -> {SUCCEEDED, FAILED, CANCELLED, OUTCOME_UNKNOWN}`. Direct `INTENT_RECORDED -> SUCCEEDED` is required because a database-only Catalog operation can commit synchronously or be found committed after a crash without B ever observing `IN_FLIGHT`. The four terminal Operation outcomes SHALL have no outgoing edge.

#### Scenario: Legal transition

- **WHEN** a command supplies the current run revision and a legal transition
- **THEN** state, run revision, related records, and audit event commit atomically

#### Scenario: Illegal or stale transition

- **WHEN** a command requests an illegal transition or supplies a stale run revision
- **THEN** the command fails
- **AND** the Ledger remains unchanged

#### Scenario: Another principal reuses a command ID

- **WHEN** a UI or system caller supplies a command ID previously used under another `CommandOwnerScopeV1`
- **THEN** owner checks reject before idempotency or Run lookup
- **AND** no command, Run, or response existence is disclosed

#### Scenario: Unknown FSM version

- **WHEN** runtime code encounters a run, attempt, gate, or operation with an unsupported FSM version
- **THEN** it fails closed without reinterpreting or rewriting the record

#### Scenario: Repair attempt

- **WHEN** an Attempt reaches `REPAIRABLE_FAILED` and frozen budget remains
- **THEN** the controller creates immutable Attempt `attemptNo + 1` in `CREATED`
- **AND** never reopens or mutates the previous Attempt
- **AND** keeps the previous Candidate current until the new Builder proposal is independently staged
- **AND** only that successful stage creates the successor Candidate and atomically records the predecessor `SUPERSEDED`

#### Scenario: Attempt budget is exhausted

- **WHEN** the exact Gate 0 total Attempt limit is reached
- **THEN** the current Candidate, if any, is first closed `FAILED`
- **AND** the Run deterministically enters `FAILED` with `REPAIR_LIMIT_EXHAUSTED`
- **AND** an unknown close remains `RECOVERY_REQUIRED` with the lease held

### Requirement: Structured three-document contract

Workflow Evolution SHALL store append-only structured revisions of `RequirementSpecV1`, `ChangeSpecV1`, and `VerificationReportV1`.

Each revision SHALL include schema version, owner, sequence, frozen state, content digest, and creation metadata.

`GapRecordV1`, Coverage evidence, attempts, gates, operations, decisions, and receipts SHALL be typed Ledger entities rather than additional mutable documents. A platform-capability request SHALL be a typed `ChangeSpecV1` variant.

Persistent documents and `ReplayInputEnvelopeV1` SHALL reject credential/secret bytes and raw sealed-test material. They may contain only redacted values or opaque resource/secret references with digests and validity metadata.

#### Scenario: Clarification changes a requirement

- **WHEN** a human clarifies an AMBIGUOUS requirement
- **THEN** the controller appends a new `RequirementSpecV1` revision
- **AND** retains the previous frozen revision

#### Scenario: Markdown is edited

- **WHEN** the pure deterministic renderer is run again after any previously saved projection is deleted or changed
- **THEN** the Ledger state and structured document digest remain unchanged
- **AND** the same redacted projection is regenerated without the P2 renderer itself performing a filesystem write

#### Scenario: Input cannot be persisted and replayed safely

- **WHEN** the original input cannot be represented as non-sensitive canonical JSON or a durable valid resource reference
- **THEN** the controller records `RESOURCE_GAP`
- **AND** promotion is unavailable

### Requirement: Coverage has four evidence-based outcomes

Coverage SHALL be exactly `COVERED`, `AMBIGUOUS`, `PARTIAL`, or `NOT_COVERED`.

`CoverageEvidenceV1` SHALL be a discriminated union. `COVERED`/`PARTIAL` bind workspace, one consistent Catalog revision/digest/generation, exact Release/definition, snapshot/input/policy, and authoritative Anchor-trial receipt digests. `AMBIGUOUS` binds the frozen Requirement revision and missing/contradictory-field evidence without an invented Release. `NOT_COVERED` binds the consistent snapshot/search plus Requirement/input digests and does not require a Release or execution receipt. Coverage SHALL remain unset while a possible Anchor is executing.

#### Scenario: COVERED

- **WHEN** the frozen Anchor Release actually runs
- **AND** every MUST acceptance passes with no prohibited side effect
- **THEN** the controller records `COVERED`
- **AND** completes with the release-pinned execution receipt
- **AND** creates no Candidate

#### Scenario: Anchor changes before a release-derived decision

- **WHEN** the controller rereads the consistent Catalog snapshot before committing `COVERED`, `PARTIAL`, or another Release-derived decision
- **AND** the generation or Catalog digest no longer matches the evaluated snapshot
- **THEN** it discards the verdict and reevaluates
- **AND** does not record the old Release as current coverage

#### Scenario: AMBIGUOUS

- **WHEN** intent, acceptance, or constraints cannot form one executable contract
- **THEN** the controller persists `WAITING_CLARIFICATION`
- **AND** resumes only after a new `RequirementSpecV1` revision is committed

#### Scenario: PARTIAL

- **WHEN** a close Release exists but a required acceptance cannot be met
- **THEN** the controller records a `WORKFLOW_DELTA` Gap bound to that exact Release

#### Scenario: NOT_COVERED

- **WHEN** no Catalog Release covers the requirement
- **THEN** the controller performs the Expressibility Check before selecting a GapKind

#### Scenario: Trial outcome is unknown

- **WHEN** infrastructure failure, timeout, crash, or missing authoritative receipt leaves execution outcome unknown
- **THEN** Coverage remains unset
- **AND** the Run enters `RECOVERY_REQUIRED`
- **AND** no Candidate or automatic retry is created

### Requirement: GapKind is independent from Teacher policy

GapKind SHALL be exactly `WORKFLOW_DELTA`, `NEW_WORKFLOW`, `PLATFORM_CAPABILITY_GAP`, `RESOURCE_GAP`, or `POLICY_BLOCKED`.

#### Scenario: Existing atoms can express the requirement

- **WHEN** registered, authorized, Candidate-allowed atoms can safely express a NOT_COVERED requirement
- **THEN** the GapKind may be `NEW_WORKFLOW`

#### Scenario: A required atom is missing

- **WHEN** a necessary Tool, Node, Connector, Runner, or governance capability is absent
- **THEN** the GapKind is `PLATFORM_CAPABILITY_GAP`
- **AND** no Workflow Candidate is staged

#### Scenario: Resource or policy prevents work

- **WHEN** data, credentials, permission, environment, legal, safety, or organization policy blocks execution
- **THEN** the controller enters the corresponding durable wait/block state
- **AND** does not generate code or a Workflow to bypass the condition

### Requirement: Stage1 admission and budget are bounded

Stage1 SHALL accept new requirements from UI only. B SHALL own and version `WorkspaceEvolutionPolicyV1`, `RunBudgetInputV1`, `RunBudgetDecisionV1`, and `ModelPriceTableV1` in `@sciforge/domain-workflow-evolution/contract`.

Reviewed, versioned assets shipped inside the B package SHALL be the sole production source of `WorkspaceEvolutionPolicyV1` installation seeds and `ModelPriceTableV1` values. On a workspace Ledger's first activation, B SHALL select the currently installed reviewed asset version, strictly validate its schemas and digests, and idempotently append the immutable seed rows, the bound asset-version activation record, and their explicit current pointers in one transaction. Reopening that Ledger with the same package asset version SHALL neither overwrite an existing row nor silently move a current pointer. A package upgrade SHALL NOT rerun installation seeding; it may change current values only through an explicit, package-reviewed, versioned, append-only migration that inserts new immutable rows and atomically advances the applicable current pointer. No migration may rewrite prior policy/price records or any accepted Run's frozen `RunBudgetDecisionV1`.

Capability payloads, environment variables, runtime flags, process-local configuration, and hard-coded transient defaults SHALL NOT create, replace, or repair a production policy or price table. A missing current workspace policy, missing current price table, invalid asset or pointer, expired table, digest/currency mismatch, or absent selected-model row SHALL fail closed. No newer package asset may be substituted into an existing Run decision during dispatch or recovery.

The persisted `WorkspaceEvolutionPolicyV1` body SHALL contain only required fields: `schemaVersion`, opaque Host-derived `workspaceId`, `workspacePolicyId`, nonempty sorted `allowedRuntimeProfileIds`, nonempty sorted `allowedModelIds`, `modelPriceTableId`, `modelPriceTableDigest`, `maxQueuedOrNonTerminalRuns`, the same eight named numeric fields as `RunBudgetDecisionV1`, and `workspacePolicyDigest`. Each of those eight policy values is both the workspace default and the per-Run ceiling; it SHALL be within the matching inclusive range below and SHALL be seeded to the table's Stage1 default value on initial policy creation. `maxQueuedOrNonTerminalRuns` SHALL be a safe integer in `1..8`, with installation default `2`. A policy digest SHALL be lowercase SHA-256 over RFC 8785 canonical JSON of the body excluding `workspacePolicyDigest`.

`RunBudgetInputV1` on `submit-requirement` MAY omit any of the eight numeric budget fields and MAY omit or request nonempty subsets of the policy's allowed runtime/model IDs. An omitted numeric field copies the matching current policy value; an explicit numeric value must be no greater than that policy ceiling. An omitted allowlist copies the complete corresponding policy allowlist, while an explicitly empty list is invalid. Before the command request digest is computed and before the confirmation summary is presented, B SHALL reject unknown keys, resolve the exact current workspace policy and price table, apply those defaults, validate global ranges and policy ceilings/allowlists, sort/deduplicate allowlists, and produce one canonical `RunBudgetDecisionV1`. Therefore semantically identical omitted/defaulted inputs yield the same normalized request digest and confirmation text.

Every persisted `RunBudgetDecisionV1` SHALL contain all of these required fields; defaults SHALL never be applied while reading or recovering a Run:

| Required field | Inclusive range | Stage1 installation policy seed |
| --- | ---: | ---: |
| `maxModelCalls` | `1..64` | `16` |
| `maxInputTokens` | `1..1_000_000` | `100_000` |
| `maxOutputTokens` | `1..200_000` | `20_000` |
| `maxCostUsdMicros` | `0..100_000_000` | `5_000_000` |
| `maxWallTimeMs` | `1_000..3_600_000` | `600_000` |
| `maxConcurrentOperations` | `1..4` | `1` |
| `totalAttemptLimit` | `1..3` | `3` |
| `sealedQueryLimit` | `1..5` | `5` |

Every value in the seed column, including `totalAttemptLimit=3` and `sealedQueryLimit=5`, is only an installation seed for the first current workspace policy. It is not a submit-time or recovery fallback. Submission omission always copies the corresponding value from the current persisted workspace policy, and a persisted decision with an omitted field is invalid.

In addition to those eight safe integers, the persisted decision SHALL require `schemaVersion`, `workspacePolicyId`, `workspacePolicyDigest`, nonempty sorted `allowedRuntimeProfileIds`, nonempty sorted `allowedModelIds`, `modelPriceTableId`, `modelPriceTableDigest`, literal `currency="USD"`, `priceTableExpiresAt`, and `runBudgetDecisionDigest`. The price-table ID/digest/currency/expiry fields SHALL exactly equal the resolved `ModelPriceTableV1`. Its digest SHALL be lowercase SHA-256 over RFC 8785 canonical JSON of the body excluding `runBudgetDecisionDigest`. The decision is immutable after Run creation and no field may be increased or replaced during recovery.

`ModelPriceTableV1` SHALL contain required `schemaVersion`, `modelPriceTableId`, literal `currency="USD"`, `expiresAt`, nonempty model rows sorted uniquely by `modelId`, and `modelPriceTableDigest`. Each strict row SHALL contain `modelId`, `perCallUsdMicros`, `inputUsdMicrosPerMillionTokens`, and `outputUsdMicrosPerMillionTokens` as nonnegative safe integers. Its digest SHALL use the same RFC 8785/lowercase-SHA-256 rule while excluding its own digest. Cost SHALL be calculated only in integer USD micro-units as:

```text
calls * perCallUsdMicros
+ ceil(inputTokens * inputUsdMicrosPerMillionTokens / 1_000_000)
+ ceil(outputTokens * outputUsdMicrosPerMillionTokens / 1_000_000)
```

Every multiplication, addition, and ceiling division SHALL use checked integer arithmetic without binary floating point; overflow or a result outside the safe-integer domain SHALL fail closed before a Run or operation is created. A missing table, digest/currency mismatch, expired `expiresAt`, or missing selected-model row SHALL fail before Run creation and SHALL be rechecked before each dispatch. If that check first fails after Run creation, no operation is dispatched and the Run follows the fixed `BUDGET_EXHAUSTED` terminal path after any required Candidate close.

For `maxQueuedOrNonTerminalRuns`, “queued/non-terminal” SHALL mean exactly every `RunKindV1=EVOLUTION` Run in the workspace whose `RunStateV1` is not in the frozen terminal set; a lease-waiting `BUILDING_CANDIDATE` Run is included, and there is no separate undefined `QUEUED` state. `ROLLBACK_RECOVERY` Runs are excluded from this ordinary admission count and are bounded only by the independent tuple-specific safety-recovery rule below. Before creating an Evolution Run, submission SHALL count that exact set and enforce the limit in the same write transaction that creates the Run, frozen decision, first document revision, and audit event. A transaction observing count strictly below `limit` may create exactly one Evolution Run; its resulting count is therefore at most `limit`. A transaction observing count equal to or greater than `limit` is denied. Concurrent submissions SHALL serialize on that predicate, so an admission transaction can never move the ordinary non-terminal Evolution count above its evaluated `limit`; if a later policy migration lowers the current limit below an existing count, subsequent submissions remain denied rather than receiving a `limit + 1` exception.

`totalAttemptLimit` includes the initial Attempt. Creating an Attempt whose `attemptNo` would exceed that frozen value is denied and, after any required Candidate close, yields `FAILED/REPAIR_LIMIT_EXHAUSTED`. Every sealed controlled-evaluation dispatch consumes one query, including a terminal failure or unknown outcome, while an authoritative pre-dispatch `NOT_FOUND` consumes none.

The persisted budget authorizes only bounded non-destructive computation; it SHALL NOT be treated as a Host grant for Promotion, finalization, abort, or rollback.

`maxWallTimeMs` SHALL mean cumulative active compute time for the Run, not an absolute wall-clock deadline and not time spent in a human/resource/platform/authorization wait or while the application is stopped. Before dispatch, one Ledger transaction SHALL reserve the operation's worst-case calls/input-output tokens/cost/active-compute milliseconds and one concurrency slot using the frozen price-table identity. Concurrent operations sum their reserved milliseconds. A matching terminal usage receipt charges its authoritative active-compute milliseconds and releases the unused reservation; `IN_PROGRESS` retains it and `OUTCOME_UNKNOWN` charges the full reserved milliseconds. Restart reconstructs totals only from persisted reservations and authoritative usage receipts, never from process clocks. A runtime/profile that cannot enforce and receipt the frozen call/token/active-time ceilings or provide a configured worst-case price SHALL fail before dispatch. Concurrent reservations SHALL never exceed the frozen Run decision or its workspace-policy ceiling.

Every Builder, Catalog evaluation (private, public, regression, scientific, sealed, or replay), and Verifier dispatch SHALL carry its own generic `@sciforge/domain-sdk/contract` `ComputeReservationV1` ID/digest and hard aggregate limits. A/Host SHALL enforce Catalog-evaluation reservations before internal model calls and return aggregate actual usage bound to them. For an approval-free compute-bearing exact request whose operation lookup is authoritative pre-dispatch `NOT_FOUND`, the same reservation remains held against that operation/request, charges zero actual usage and zero sealed query, and is reused by the fenced exact redispatch; it may be released only in the same Ledger transaction that safely abandons that still-`INTENT_RECORDED` operation. A terminal usage result settles it, while `IN_PROGRESS` retains and `OUTCOME_UNKNOWN` charges the full amount.

Promotion replay is the one explicit lifecycle exception. `ReplayReservationStateV1` SHALL be `HELD_PREPARE`, `HELD_PREPARE_RETRY`, `HELD_PENDING_REPLAY`, `SETTLED`, or `RELEASED`. B creates the reservation as `HELD_PREPARE` before `prepare-promotion` and binds it into that exact request. Prepare `NOT_FOUND` leaves the same still-`INTENT_RECORDED` request and reservation as `HELD_PREPARE_RETRY`, because a later confirmed retry must reuse both identities. A terminal zero-write prepare failure releases it exactly once; any permitted new prepare operation creates a new reservation. Prepare success copies it into `PendingPromotionV1` and changes it to `HELD_PENDING_REPLAY`. Replay `NOT_FOUND` stays held and unavailable to other work; a fresh confirmed exact replay reuses it. Terminal replay settles actual/full usage, while a matching terminal abort releases an undispatched held reservation exactly once. A safely cancelled pre-pending Run may release `HELD_PREPARE_RETRY` only in the same Ledger transaction that abandons the still-`INTENT_RECORDED` intent, records zero usage/query, and freezes cancellation; any active Candidate is closed and its lease released only at the later matching close-receipt boundary.

#### Scenario: Budget bounds are invalid

- **WHEN** submission supplies any integer below its minimum, above its maximum, non-integral, unsafe, unknown, or inconsistent with the workspace allowlists
- **THEN** the command fails before Run/document/reservation creation

#### Scenario: Budget boundary matrix is exhaustive

- **WHEN** executable fixtures evaluate minimum, maximum, one-below, one-above, defaulted, unsafe-integer, and wrong-type input for every numeric policy/budget field
- **THEN** every inclusive boundary and installation policy seed is accepted exactly as specified
- **AND** every invalid value fails before Run/document/reservation creation

#### Scenario: Package assets seed and migrate policy

- **WHEN** a workspace Ledger first activates one reviewed B package asset version
- **THEN** one transaction appends its validated policy/price rows and current pointers
- **WHEN** the same asset version is opened again
- **THEN** no row, pointer, or existing Run decision is overwritten
- **WHEN** a later package version is activated
- **THEN** only its explicit append-only migration may append new rows and advance the applicable current pointer

#### Scenario: Submission omits the repair limits

- **WHEN** `RunBudgetInputV1` omits `totalAttemptLimit` or `sealedQueryLimit`
- **THEN** normalization copies the exact values from the current persisted workspace policy
- **AND** it does not substitute the installation seeds `3` or `5`

#### Scenario: Price calculation is exact

- **WHEN** fixtures exercise fractional-million token rounding, the maximum allowed values, and multiplication/addition overflow
- **THEN** USD-micro cost is computed with checked integer ceiling arithmetic and no floating-point rounding
- **AND** overflow fails closed before Run or operation creation

#### Scenario: Pending replay remains undispatched

- **WHEN** preparation committed but replay lookup is authoritatively `NOT_FOUND`
- **THEN** the replay reservation remains `HELD_PENDING_REPLAY`
- **AND** concurrent work cannot reuse its capacity
- **AND** only matching replay terminal settlement or matching terminal abort may settle/release it

#### Scenario: Workspace admission is full

- **WHEN** an Evolution submission observes a non-terminal Evolution count equal to or greater than `maxQueuedOrNonTerminalRuns`, including the `limit + 1` fixture
- **THEN** it returns stable `ADMISSION_LIMIT_EXCEEDED`
- **AND** creates no Run, budget, document, or audit side effect beyond the denied command receipt

#### Scenario: Workspace admission serializes at the boundary

- **WHEN** fixtures submit at ordinary Evolution counts `limit - 1` and `limit`, and race two Evolution submissions from `limit - 1`
- **THEN** one admissible transaction may move the count from `limit - 1` to exactly `limit`
- **AND** the transaction that then observes `limit` is denied
- **AND** the Ledger never commits more than `limit` ordinary non-terminal Evolution Runs

#### Scenario: Safety recovery is outside ordinary admission

- **WHEN** the ordinary Evolution count is already `limit`
- **AND** a confirmed rollback-recovery open satisfies its independent exact-tuple safety constraints
- **THEN** the one recovery Run may be admitted without changing the ordinary Evolution count
- **AND** it cannot be used to submit or queue ordinary Evolution work

#### Scenario: Price table cannot authorize the operation

- **WHEN** the selected table is missing, expired, digest- or currency-mismatched, lacks the selected model row, or overflows checked cost arithmetic
- **THEN** no Run is created when detected during submission
- **AND** no operation is dispatched when detected after Run creation
- **AND** recovery does not substitute a newer table or a different model silently

#### Scenario: Agent attempts recursive submission

- **WHEN** an Agent or system caller invokes `submit-requirement`
- **THEN** the call is denied before a Run is created

#### Scenario: Budget would be exceeded

- **WHEN** the next operation would exceed any frozen admission or budget bound
- **THEN** the operation is not dispatched
- **AND** the Run deterministically enters `FAILED` with `BUDGET_EXHAUSTED` after any active Candidate is safely closed
- **AND** increasing the limit requires a newly submitted Run

#### Scenario: Provider does not report actual usage

- **WHEN** the runtime enforces the frozen ceiling but cannot return authoritative actual token/cost usage
- **THEN** the receipt records `usageStatus=UNAVAILABLE`
- **AND** the Ledger charges the full reserved worst-case amount rather than reporting requested configuration as actual usage

### Requirement: One controller-active Candidate lease per workspace

After deterministic Coverage/Gap routing selects `WORKFLOW_DELTA` or `NEW_WORKFLOW`, Workflow Evolution SHALL move the Run to `BUILDING_CANDIDATE` and conditionally acquire one transactional Candidate lease per workspace before creating the initial Attempt, reserving compute, dispatching Builder, or staging any Candidate. It SHALL persist `candidateLeaseHeld` separately from optional `activeCandidateId` and retain the lease through Builder work, verification, and the complete promotion/finalize/safe-abort saga once a Candidate is staged.

A Run that loses the unique-lease race SHALL remain in `BUILDING_CANDIDATE` with `candidateLeaseHeld=false` and `activeCandidateId=null`. It SHALL have no Attempt, Operation, or compute reservation and perform zero Agent, controlled-evaluation, or Catalog dispatch. Lease waiters SHALL be ordered deterministically by persisted `(createdAt ASC, runId ASC)`. After startup and after any lease-release transaction commits, one package-fenced event-driven scan SHALL select the oldest still-eligible waiter, then in one conditional Ledger transaction verify its current Run revision/state and the absence of another lease, set `candidateLeaseHeld=true`, and create exactly its initial immutable Attempt in `CREATED`. A stale, cancelled, terminal, or already-claimed waiter makes that conditional transaction a no-op and the fenced scan may continue to the next eligible row. There SHALL be no timer polling, busy loop, or second lease scheduler.

If `activeCandidateId` is null because no Candidate has yet been staged, B may release the empty lease without an A disposition only after every owned operation is terminal and no pending Promotion exists. If `activeCandidateId` is non-null, the lease can be released only in the same B transaction that stores A's matching terminal disposition receipt and enters the intended terminal state. A later `ROLLBACK_RECOVERY` run SHALL have no Candidate lease and SHALL preserve the original Candidate's `PROMOTED` disposition.

#### Scenario: Concurrent lane acquisition

- **WHEN** two Runs concurrently request the active Candidate lease for one workspace
- **THEN** at most one transaction succeeds
- **AND** the losing Run remains `BUILDING_CANDIDATE` with `candidateLeaseHeld=false`, no Attempt/Operation, and zero Agent, controlled-evaluation, or Catalog dispatch

#### Scenario: Lease release wakes the oldest waiter

- **WHEN** the current lease is released and multiple eligible Runs are waiting
- **THEN** the fenced post-commit scan selects the lowest persisted `(createdAt, runId)` tuple
- **AND** one conditional transaction both claims the lease and creates that Run's one initial Attempt
- **AND** concurrent scans cannot create a second lease or duplicate Attempt

#### Scenario: Restart recovers the lease queue

- **WHEN** the process restarts with no held workspace lease and one or more eligible lease waiters
- **THEN** the startup fenced scan applies the same FIFO conditional-claim transaction
- **AND** it performs no periodic polling or busy-loop retries

#### Scenario: A lease waiter is cancelled

- **WHEN** `cancel-run` wins the expected-revision transaction for a lease-waiting Run before its conditional claim
- **THEN** that Run enters `CANCELLED` with no Attempt, Operation, reservation, Candidate close, or lease
- **AND** a concurrent or later scan skips it
- **WHEN** the conditional lease-and-initial-Attempt transaction wins first
- **THEN** cancellation follows the ordinary authoritative containment protocol

#### Scenario: Lease admission is exactly once

- **WHEN** fixtures race startup scans, lease-release scans, duplicate wakeups, and cancellation at the conditional claim
- **THEN** every eligible Run has at most one initial Attempt and every workspace has at most one held lease
- **AND** only the transaction winner may reserve or dispatch work

#### Scenario: Repair creates a successor

- **WHEN** a repairable Attempt produces a new proposal
- **THEN** B retains the same workspace lease
- **AND** asks Create Loop to stage a new immutable Candidate that supersedes the prior artifact

#### Scenario: Candidate close result is unknown

- **WHEN** terminal work requires a disposition but its A-owned close result cannot be proven
- **THEN** the Run remains `RECOVERY_REQUIRED`
- **AND** the lease remains held until the authoritative receipt is reconciled

#### Scenario: Work ends before the first Candidate is staged

- **WHEN** Builder admission, budget, policy, validation, or stale-base handling ends or reroutes the Run while `candidateLeaseHeld=true` and `activeCandidateId=null`
- **THEN** B closes or reroutes the Run and releases the lease in one Ledger transaction after all operations are terminal
- **AND** it records that no Candidate was staged
- **AND** it does not call `close-candidate` or fabricate a disposition receipt

#### Scenario: COVERED needs no Candidate lease

- **WHEN** an Anchor trial proves `COVERED`
- **THEN** the Run completes with `candidateLeaseHeld=false` and `activeCandidateId=null`
- **AND** no Candidate disposition is required

### Requirement: Candidate orchestration has one durable sequence

For `WORKFLOW_DELTA` or `NEW_WORKFLOW`, B SHALL use exactly: Attempt `CREATED -> BUILDING` → strict Builder proposal → Catalog stage intent/receipt → Attempt `STAGED` → atomic evaluation intent plus Attempt `EXECUTING` → `CANDIDATE_PRIVATE` evaluation → `READY_FOR_VERIFICATION`, `REPAIRABLE_FAILED`, `FAILED`, `CANCELLED`, or `EXECUTION_UNKNOWN`. B SHALL derive workspace/base/generation/mode/attempt/supersession/operation/request/change/policy/budget/service-exposure/evidence fields; Builder SHALL NOT supply them as authority.

A Builder/pre-stage failure uses `BUILDING -> FAILED | CANCELLED | EXECUTION_UNKNOWN`. An authoritative private-evaluation business failure uses `EXECUTING -> REPAIRABLE_FAILED` only when the frozen failure taxonomy and remaining Attempt budget permit repair; a non-repairable failure uses `FAILED`, authoritative containment uses `CANCELLED`, and ambiguity uses `EXECUTION_UNKNOWN`. Run termination still obeys the conditional Candidate-close invariant.

#### Scenario: Candidate private evaluation passes

- **WHEN** A returns matching stage and authoritative private-evaluation receipts
- **THEN** B stores both receipts and advances the Attempt to `READY_FOR_VERIFICATION` atomically

#### Scenario: Stage or evaluation response is lost

- **WHEN** B cannot prove the Catalog operation outcome
- **THEN** it performs owner-checked read-only reconciliation
- **AND** never creates a second Candidate/evaluation or advances from inferred evidence

#### Scenario: Private evaluation requests repair

- **WHEN** an Attempt reaches `REPAIRABLE_FAILED` and frozen budget remains
- **THEN** the Run consumes the legal state-preserving `CANDIDATE_REPAIRABLE` event
- **AND** creates the next immutable Attempt
- **AND** keeps the current Candidate and lease until a successor stage atomically records `SUPERSEDED`

#### Scenario: Stage observes a stale base

- **WHEN** `stage-candidate` authoritatively returns `STALE_GENERATION`
- **THEN** the current Attempt becomes `FAILED` with `BASE_GENERATION_DRIFT`
- **AND** any previously active Candidate is first closed `STALE`
- **AND** the lease is released and the Run returns to `EVALUATING_COVERAGE`
- **AND** no stale proposal is staged or reused

### Requirement: Verification evidence has one total reduction

B SHALL reduce verification through one generated total matrix over the current Candidate/Attempt and every required trusted public, regression, scientific, sealed-harness, Verifier projection/consumption, isolation, runtime/model, usage, policy, and budget receipt identity. Its closed result type SHALL be exactly `VerificationReductionV1 = PASS | REPAIR | FATAL | UNKNOWN`, with no default or payload-defined branch. The LLM Verifier assessment is advisory input only; neither it nor payload code may choose a branch, declare acceptance, or create a report. Every valid tuple SHALL select exactly one of the following outcomes, and every omitted, malformed, foreign, late, or digest-mismatched tuple SHALL select `UNKNOWN`:

1. `PASS` requires every current required authoritative acceptance outcome and trusted receipt to pass and match, plus no unresolved blocker in the advisory Verifier projection. One Ledger transaction SHALL append and freeze the bound `VerificationReportV1`, transition the current Attempt `VERIFYING -> VERIFIED`, transition the Run `VERIFYING -> WAITING_PROMOTION`, and append the audit event. The Candidate and lease remain current.
2. `REPAIR` requires a known result in the exact frozen, bounded public-repair taxonomy and all budget plus `totalAttemptLimit` capacity needed for another Attempt. One Ledger transaction SHALL transition the current Attempt to `REPAIRABLE_FAILED`, create exactly the next immutable Attempt in `CREATED`, transition the Run to `BUILDING_CANDIDATE`, and retain the current Candidate and lease until a successor stage proves `SUPERSEDED`.
3. `FATAL` covers a known policy, security, isolation, forgery, authoritative supersession, or other frozen non-repairable result, and a repairable result for which another Attempt cannot be admitted. B SHALL first journal and obtain the matching A-owned `close-candidate(FAILED)` receipt. Only the transaction that stores that receipt may transition the Attempt to `FAILED`, transition the Run to its frozen fatal destination, and release the lease. An unknown or mismatched close instead enters `RECOVERY_REQUIRED` and retains the Candidate and lease.
4. `UNKNOWN` covers any required operation/evidence outcome that is unknown, unqueryable, missing after an irreversible boundary, late, foreign, digest-mismatched, or carries an unexpected/mismatched supersession identity. The Run SHALL enter `RECOVERY_REQUIRED`; an outcome-unprovable Attempt becomes `EXECUTION_UNKNOWN`. No `VerificationReportV1`, repair Attempt, Candidate close inferred from the bad evidence, Promotion decision eligibility, or dispatch is created, and the Candidate lease remains held.

The executable fixture set SHALL enumerate the Cartesian evidence partitions for all-trusted-pass, every repairable taxonomy value with budget/Attempt capacity present and absent, every fatal value, every required receipt absent/mismatched/superseded, and every operation lookup outcome. Each fixture SHALL assert exactly one branch and its transaction/close/lease boundary.

#### Scenario: All trusted verification evidence passes

- **WHEN** the total reducer receives the exact current Candidate/Attempt and every required matching trusted pass/consumption/usage receipt
- **THEN** one transaction freezes `VerificationReportV1`, makes the Attempt `VERIFIED`, and makes the Run `WAITING_PROMOTION`
- **AND** no intermediate state exposes a report without the matching Attempt and Run transitions

#### Scenario: Verification is repairable

- **WHEN** a known verification failure is in the frozen repairable taxonomy
- **AND** all required budget and Attempt capacity remains
- **THEN** one transaction preserves the old Attempt as `REPAIRABLE_FAILED`, creates the next Attempt, and returns the Run to `BUILDING_CANDIDATE`
- **AND** the current Candidate and lease remain held

#### Scenario: Verification is fatal

- **WHEN** verification has a known fatal result or cannot admit another required repair Attempt
- **THEN** B closes the active Candidate as `FAILED` before terminalizing the Attempt or Run
- **AND** only the matching close-receipt transaction releases the lease

#### Scenario: Verification evidence is not trustworthy

- **WHEN** a required operation or evidence receipt is unknown, unqueryable, missing, superseded, foreign, or digest-mismatched
- **THEN** the Run enters `RECOVERY_REQUIRED`
- **AND** no report, repair, Promotion eligibility, or inferred Candidate disposition is produced

### Requirement: Human and resource gates are durable

Long-lived clarification, resource, platform, and promotion-decision waits SHALL be Ledger records, not Create Loop in-memory approval waiters. A Gate never reopens; a new question creates a new Gate, and a database constraint permits at most one open Gate per Run.

Current Host authorization is not a durable Gate and SHALL never be serialized.

#### Scenario: Resolve a clarification gate

- **WHEN** a user resolves an open clarification gate with the current run revision
- **THEN** one transaction closes the gate, appends the `RequirementSpecV1` revision, advances state/revision, and appends an audit event

#### Scenario: Clarification transaction fails at any boundary

- **WHEN** failure is injected after gate close, document append, run update, audit append, or before COMMIT
- **THEN** closing and reopening SQLite exposes the complete before-image only

#### Scenario: Response is lost after clarification COMMIT

- **WHEN** COMMIT succeeds but the process exits before returning the response
- **THEN** restart exposes the complete after-image
- **AND** an exact retry returns the original result without a second document revision

#### Scenario: Resolve the same gate twice

- **WHEN** a caller repeats resolution of a closed gate
- **THEN** the operation returns the original idempotent result or fails as already resolved
- **AND** never creates two revisions

Provider identity and readiness SHALL use the canonical Host contracts defined by `official-workbench-domain-packages`. The Host-owned `CapabilityProviderProvenanceV1` closed union SHALL be exactly `{ kind:"DOMAIN_MANIFEST", moduleId, moduleVersion, definitionDigest } | { kind:"HOST_CORE", moduleId, moduleVersion, definitionDigest }`; both branches are retained from the generated domain manifest or an immutable Host-core definition, respectively, and a factory, payload, environment value, or invocation option cannot replace them.

Each strict `CapabilityReadinessRequestV1.entries` item and returned evidence entry SHALL contain exactly `actionId`, `descriptorContractVersion`, `inputSchemaVersion`, `inputSchemaDigest`, `outputSchemaVersion`, `outputSchemaDigest`, `enforcementProfileVersion`, `enforcementProfileDigest`, `enabled`, `providerModuleId`, `providerProvenanceKind`, and `providerDefinitionDigest`. The two enforcement-profile fields SHALL be either a matching non-null version/digest pair or explicit `null`/`null`; omission or a mixed pair is invalid. Entries SHALL reject duplicates and be sorted by `actionId` in ascending UTF-8 byte lexical order. The Host evidence digest SHALL be lowercase hexadecimal SHA-256 over the UTF-8 bytes of the RFC 8785 canonical JSON evidence body. B SHALL import and validate those Host schemas rather than define a local readiness/provenance shape or canonicalizer.

Workflow Evolution SHALL expose `workflow-evolution.recheck-platform-gate` as a package-owned `workspace-write`, approval-free UI/system action. Its input SHALL contain only command identity, expected Run revision, and the exact open PLATFORM Gate identity. The Controller SHALL call the generic owner/workspace-bound `CapabilityReadinessReaderV1` with the Gate's frozen exact readiness entries, then persist the returned `CapabilityReadinessEvidenceV1`. It SHALL NOT import Host-private registry/IPC code, read generated files as live state, or accept payload readiness or provenance assertions.

#### Scenario: Required platform capability is now registered

- **WHEN** `recheck-platform-gate` obtains matching current `CapabilityReadinessEvidenceV1`
- **THEN** one transaction resolves the PLATFORM Gate, stores the registry evidence, emits `WAIT_GATE_RESOLVED`, and returns the Run to `EVALUATING_COVERAGE`

#### Scenario: Required platform capability is still absent

- **WHEN** the registry does not satisfy the frozen PLATFORM Gate
- **THEN** the action returns stable `STILL_BLOCKED`
- **AND** the Gate and Run remain unchanged apart from the idempotent denied-command receipt

#### Scenario: Readiness provenance or contract drifts

- **WHEN** a current capability differs in descriptor contract version, input/output schema version or digest, nullable profile version/digest, provider module, provenance kind, provider definition digest, or enabled state
- **THEN** its readiness evidence does not satisfy the frozen PLATFORM Gate
- **AND** B neither accepts a payload substitute nor resolves the Gate

#### Scenario: A Host-core capability is required

- **WHEN** a frozen PLATFORM Gate requires a capability registered by immutable Host core rather than a domain manifest
- **THEN** readiness binds the retained `HOST_CORE` provenance branch and its definition digest
- **AND** no fabricated domain manifest or action-ID prefix is accepted as provenance

### Requirement: Stage1 Teacher does not block

Workflow Evolution SHALL define `TeacherEvidencePort.request`, `.status`, and `.cancel`, and install a Stage1 adapter whose status is `BYPASSED`. It SHALL return a stable job reference, make exact request/cancel retries idempotent, and invoke neither Agent Execution nor Catalog operations.

#### Scenario: Workflow evidence requested

- **WHEN** a Workflow Gap requests Teacher evidence in Stage1
- **THEN** the adapter returns a stable job reference and `BYPASSED`
- **AND** the controller records the result and continues
- **AND** Agent Execution and every Catalog mutation are called zero times by the Teacher adapter

#### Scenario: Teacher attempts promotion

- **WHEN** any Teacher result or adapter requests an Anchor mutation
- **THEN** the request is rejected
- **AND** Teacher receives no promotion authority

### Requirement: Cross-package commands recover after crashes

Workflow Evolution SHALL journal every Catalog operation it owns—stage/close Candidate, controlled evaluation/cancel, prepare/finalize/abort Promotion, and rollback—as `intent -> lookup/invoke -> immutable receipt -> transition`. Initial provisioning is A-owned UI work; B SHALL only read the resulting stable snapshot and SHALL NOT fabricate a retrospective provision intent.

Every request SHALL carry the same stable `operationId` in its payload and Broker delivery key. Before invocation, B SHALL commit an `INTENT_RECORDED` Operation containing the exact request digest, source Run/Attempt revisions, generated matrix version, `resumeReducerState`, and the complete trusted event context needed to reduce the eventual receipt. `resumeReducerState` is the state in which the authoritative result event is re-applied; it is not a caller-selected destination.

B SHALL NOT mark an Operation `IN_FLIGHT` merely because it started an IPC/Promise call. It becomes `IN_FLIGHT` only after Create Loop authoritatively reports `IN_PROGRESS`. A synchronous terminal result or a committed result discovered after restart may transition directly from `INTENT_RECORDED` to the matching terminal Operation state.

Reconciliation SHALL call `read-operation` before dispatch and SHALL distinguish approval-free idempotent work, currently authorized destructive work, and unknown outcomes. One Ledger transaction SHALL store a newly observed terminal receipt/error, transition the Operation, construct `RECOVERY_RESULT_OBSERVED` from the stored trusted context, and invoke the same generated reducer used by the live result path. Reconciliation cannot supply an arbitrary target or bypass a terminal guard.

#### Scenario: Catalog committed before Ledger receipt

- **WHEN** the process stops after Create Loop commits a mutation but before Workflow Evolution stores the receipt
- **THEN** restart reconciliation uses the durable idempotency key and read capabilities
- **AND** stores the one existing result without repeating the mutation

#### Scenario: Catalog did not commit

- **WHEN** an `INTENT_RECORDED` Operation lookup authoritatively returns `NOT_FOUND` for approval-free stage/close/evaluate/cancel-evaluation work
- **THEN** restart reconciliation may retry the exact request with the same operation ID after disposable-workspace cleanup
- **AND** when the exact request is compute-bearing, reuses the same still-held `ComputeReservationV1`, with zero actual usage/query charged for `NOT_FOUND`
- **AND** reaches at most one committed Catalog result
- **AND** the Operation remains `INTENT_RECORDED` until an authoritative provider state is observed

#### Scenario: A previously in-flight operation disappears

- **WHEN** B previously stored authoritative `IN_FLIGHT` and a later owner-checked lookup returns `NOT_FOUND`
- **THEN** the Run enters `RECOVERY_REQUIRED` with `IDENTITY_OR_DIGEST_CONFLICT`
- **AND** no retry is dispatched because a durable provider operation cannot legitimately disappear

#### Scenario: Destructive operation was not committed

- **WHEN** lookup returns `NOT_FOUND` for prepare/finalize/abort Promotion or rollback
- **THEN** the generated action/result matrix returns prepare to `WAITING_PROMOTION_AUTHORIZATION(PREPARE)` and finalize/abort/rollback to `WAITING_FINALIZE_AUTHORIZATION`, `WAITING_ABORT_AUTHORIZATION`, or `WAITING_ROLLBACK_AUTHORIZATION`
- **AND** background system code does not retry
- **AND** a fresh relevant confirmation may dispatch the still-`INTENT_RECORDED` exact request with the same operation ID

#### Scenario: Operation is still in progress

- **WHEN** lookup returns `IN_PROGRESS`
- **THEN** the B Operation is or remains `IN_FLIGHT`
- **AND** the Run enters or remains `RECOVERY_REQUIRED`
- **AND** later read-only polling may observe its authoritative terminal result
- **AND** no second dispatch, inferred receipt, verification evidence, or promotion occurs

#### Scenario: Operation outcome is unknowable

- **WHEN** lookup returns `OUTCOME_UNKNOWN`
- **THEN** the B Operation becomes terminal `OUTCOME_UNKNOWN`
- **AND** the Run enters or remains `RECOVERY_REQUIRED`
- **AND** no second dispatch, inferred receipt, verification evidence, or promotion occurs
- **AND** a late result is quarantined rather than reduced into the Run

#### Scenario: Recovery observes a terminal result

- **WHEN** read-only reconciliation observes `SUCCEEDED`, `FAILED`, or `CANCELLED`
- **THEN** one Ledger transaction stores the immutable result and emits `RECOVERY_RESULT_OBSERVED`
- **AND** the generated reducer consumes it from the stored `resumeReducerState` and trusted event context
- **AND** reaches only the same destination that an identical live result would have reached

#### Scenario: Matching pending Promotion is reconciled

- **WHEN** a matching pending reservation exists
- **THEN** replay `NOT_FOUND` enters `WAITING_PROMOTION_AUTHORIZATION(REPLAY_OR_ABORT)` and may be exactly replayed or explicitly aborted only under a fresh confirmation with the frozen choice
- **AND** replay operation `SUCCEEDED` plus business acceptance `PASS` waits for or uses a current finalize scope, unless a fresh Promotion-purpose confirmation explicitly abandons and aborts it with a reason
- **AND** replay operation `SUCCEEDED` plus acceptance `FAIL`, authoritative operation `FAILED`, or contained `CANCELLED` waits for or uses a current abort scope
- **AND** replay `IN_PROGRESS`/`OUTCOME_UNKNOWN` remains `RECOVERY_REQUIRED`
- **AND** the pending reservation never expires in the background

### Requirement: Agent dispatch is durable and fail closed

Builder and Verifier SHALL use the singular generic Agent operation, stable-token, accepted-token-tombstone, lookup, and recovery contract normatively defined by `agent-operation-governance`. Workflow Evolution SHALL NOT redeclare its state machine or introduce a second request-reconstruction path. It SHALL supply and consume only that contract's canonical durable/versioned/non-raw `RequestRebuildRecipeV1` behavior.

For a generic Agent operation in `DISPATCHING`, only the canonical adapter result `NOT_FOUND` that proves the stable token was never accepted may enter request rebuild. The owning domain may deterministically rebuild the request in volatile memory from its durable recipe and frozen dependencies; the Host SHALL compare the result with the immutable stored `requestDigest` before same-token `createOrGet`. If the recipe or any frozen dependency is unavailable, or the rebuilt digest mismatches, the generic Agent operation SHALL become terminal `FAILED` with `REQUEST_REBUILD_UNAVAILABLE` and the adapter dispatch count SHALL remain zero. `UNQUERYABLE` SHALL become terminal `OUTCOME_UNKNOWN` with zero resend. `NOT_FOUND` observed for an already-`RUNNING` operation is likewise impossible and becomes `OUTCOME_UNKNOWN`, not request rebuild. Provider GC/404, eventual invisibility, retention expiry, or a missing accepted-token tombstone SHALL be classified as `UNQUERYABLE`, never as authoritative `NOT_FOUND`.

Stage1 SHALL use request-only context, Controller-only direct result delivery, and raw retention `NONE`. “Raw” SHALL mean the complete Agent request, prompts, conversation/transcript, transport frames, unparsed provider output bytes, and provider-specific payload or metadata. Raw data SHALL never be persisted by Host, runtime, transport, provider, B Ledger, logs, telemetry, audit, or export. No input/result SHALL reach sidebar/UI, thread list, generic turn events, artifact consumers, shared memory, goal/context state, handoff/reference systems, sibling principals, or other same-owner consumers. Late/unknown/superseded output SHALL persist only digest, size, terminal metadata, and quarantine reason.

The only allowed B domain persistence derived from a successful Agent result SHALL be one bounded, strict, schema-validated projection: `CandidateProposalV1` for Builder or `VerificationAssessmentV1` for Verifier. These B-owned projection schemas SHALL reject unknown fields and SHALL contain no raw request, prompt, transcript, provider bytes/metadata, hidden reasoning, secret, or arbitrary attachment. `CandidateProposalV1` may contain only the normalized proposed definition/body plus bounded rationale; `VerificationAssessmentV1` may contain only bounded advisory risks, allowlisted evidence references, and recommendation. Neither projection carries authority owned by Host, A, the Controller, the sealed harness, or the frozen Run.

`VerifierInputEnvelopeV1` SHALL be the B-owned strict data-only schema exported from `@sciforge/domain-workflow-evolution/contract` and normatively defined by `workflow-candidate-governance`. Its closed top-level fields SHALL be exactly `kind="VERIFIER_INPUT_V1"`, `schemaVersion=1`, `subject`, `candidateSnapshot`, `frozenSpecDigests`, and `evidenceRefs`; their exact nested fields, bounds, ordering, and receipt-reference shapes SHALL be the single schema exported with that contract. It SHALL reject unknown keys, instructions/context configuration, automatic references, tools, file inputs, secret/resource payloads, sealed case IDs/membership/inputs/oracles/expected outputs/per-case outcomes, and any caller-supplied eligibility or policy decision. Candidate-controlled definition, rationale, prompt, or text within `candidateSnapshot` SHALL be quoted as untrusted data beneath the fixed Host system policy. The Host Agent dispatch record SHALL bind the envelope digest, Agent profile digest, and the generic `@sciforge/domain-sdk/contract` `ComputeReservationV1` ID/digest as trusted operation metadata; those Host fields are not added to or selected by the data envelope.

A Host Agent-operation status of `SUCCEEDED` SHALL mean only that the transport/runtime completed; it SHALL NOT mean that B consumed a valid business result. The B delivery handler SHALL parse raw bytes in ephemeral memory, validate exactly one allowed projection, and in one Ledger transaction persist that projection plus immutable projection receipt and advance the B Operation/Attempt/Run through the generated reducer. Only that committed projection receipt proves business consumption. Schema rejection SHALL commit only digest, size, stable rejection code, and the fixed failure transition; it SHALL NOT persist the rejected bytes.

If the Host has delivered raw output or recorded terminal `SUCCEEDED` but B crashes before the projection transaction commits, raw retention `NONE` means the bytes SHALL NOT be retained or redelivered. On restart, absence of the matching committed projection receipt SHALL make the B Operation terminal `OUTCOME_UNKNOWN`, the Attempt `EXECUTION_UNKNOWN`, and the Run `RECOVERY_REQUIRED`; B SHALL NOT retry the Agent, reconstruct a projection from metadata, or adopt a late delivery. If the projection transaction committed but the process crashed before acknowledging delivery, restart SHALL recover and consume only the committed projection and receipt idempotently; the raw payload SHALL NOT be requested or delivered again. Cancellation, supersession, and reconciliation SHALL use these same two crash-window rules.

#### Scenario: Process exits after dispatch but before B stores the handle

- **WHEN** Workflow Evolution restarts
- **THEN** it resolves the same operation by ID and does not create a second thread/turn

#### Scenario: Agent request cannot be rebuilt

- **WHEN** canonical reconciliation proves a `DISPATCHING` stable token was never accepted
- **AND** the canonical request recipe or a frozen dependency is unavailable, or the rebuilt request digest mismatches
- **THEN** the generic Agent operation becomes `FAILED/REQUEST_REBUILD_UNAVAILABLE`
- **AND** no adapter request, thread, or turn is dispatched

#### Scenario: Agent lookup is unqueryable

- **WHEN** canonical lookup cannot prove never-accepted, running, or terminal state for the stable token
- **THEN** the generic Agent operation becomes terminal `OUTCOME_UNKNOWN`
- **AND** B makes its Attempt `EXECUTION_UNKNOWN` and Run `RECOVERY_REQUIRED`
- **AND** no rebuild, resend, or second thread occurs

#### Scenario: Raw result is delivered before the projection commits

- **WHEN** the Host operation is terminal `SUCCEEDED` or raw output reaches the Controller-only handler
- **AND** B crashes before the strict projection and projection receipt commit
- **THEN** restart records B Operation `OUTCOME_UNKNOWN`, Attempt `EXECUTION_UNKNOWN`, and Run `RECOVERY_REQUIRED`
- **AND** raw output is neither retained, redelivered, reconstructed, nor retried

#### Scenario: Projection commits before acknowledgement

- **WHEN** the strict projection, projection receipt, and B state transition commit atomically
- **AND** B crashes before acknowledging result delivery
- **THEN** restart consumes the one committed projection receipt idempotently
- **AND** requests no raw redelivery and creates no second Agent operation

#### Scenario: Cancellation races with raw delivery

- **WHEN** cancellation or supersession is frozen before a projection transaction commits
- **THEN** a late raw result is not projected or adopted
- **AND** only digest, size, terminal metadata, and quarantine reason may persist
- **AND** an unproven consumption/containment outcome follows `OUTCOME_UNKNOWN -> EXECUTION_UNKNOWN -> RECOVERY_REQUIRED`
- **WHEN** the projection transaction commits before cancellation or supersession is frozen
- **THEN** reconciliation may recover only that exact projection and receipt idempotently
- **AND** the projection cannot reopen or advance the subsequently contained Attempt

#### Scenario: Prior Agent outcome cannot be proven

- **WHEN** no authoritative handle/status can establish whether dispatch or completion occurred
- **THEN** the Attempt becomes `EXECUTION_UNKNOWN`
- **AND** the Run becomes `RECOVERY_REQUIRED`
- **AND** automatic retry, late-result adoption, `VerificationReportV1` creation, and Promotion are prohibited

#### Scenario: Isolation profile is unsupported

- **WHEN** the selected runtime cannot enforce request-only context and every frozen tool/file/network/env/capability/child-agent denial
- **THEN** dispatch fails before thread creation
- **AND** no legacy `run()` or permissive runtime fallback is selected

#### Scenario: Operation ID is reused with different input

- **WHEN** the owner reuses an operation ID with another request or profile digest
- **THEN** Agent Execution returns a conflict
- **AND** creates no thread or turn

### Requirement: Cancellation waits for authoritative containment

Cancellation SHALL close a non-Candidate waiting Gate atomically only when no pending Promotion, active Candidate, or unresolved destructive operation exists. Active safe work, an empty Candidate lease, or any Run with `activeCandidateId != null` SHALL enter `CANCELLING` while its operation-specific cancellation is contained.

Every first or retry `prepare-promotion` dispatch and every pre-pending prepare-cancellation proof SHALL enter the same singular B Controller dispatch fence keyed by the exact workspace, Run, and B Operation identities. The controller, reconciler, restart resume path, timer, and command handler SHALL NOT register or dispatch that prepare operation outside this fence. This fence controls only B's dispatch admission; inherited child registration, revocation, and settlement remain the canonical Host/Broker behavior normatively defined by `capability-broker` and SHALL NOT be reimplemented by B.

The prepare dispatcher SHALL acquire the dispatch side, re-read the exact Ledger Run/Operation/reservation revisions and digests, and, while still holding it, either register the inherited child through the canonical Broker registrar or perform zero handler dispatch. It SHALL retain its fence lease until registration has failed before handler dispatch or the registered child has reached the canonical contained settlement boundary. The cancellation path SHALL acquire the mutually exclusive cancellation side and retain it while it re-reads those same Ledger facts, performs the current owner/workspace-scoped `read-operation` and `read-pending-promotion` checks, and commits or rejects the abandonment transaction. A `NOT_FOUND`/no-pending observation taken before acquiring the fence, after releasing it, or through another lookup/dispatch path is not cancellation evidence.

Exactly one race order SHALL win. If cancellation acquires the fence first, its Ledger transaction freezes cancellation and terminalizes the prepare intent before release; every later dispatcher re-read observes that result and cannot register a child or dispatch. If the prepare dispatcher registers the canonical child first, cancellation cannot commit abandonment or release the reservation; it waits for that registered child to settle and then reduces only the resulting current authoritative provider state. No interleaving may both release `HELD_PREPARE_RETRY` and register or dispatch its prepare child.

The executable B race fixture SHALL force both linearization orders at the fence boundary. It SHALL prove cancel-first yields zero child registrations and zero prepare handler dispatches, while child-registration-first retains the reservation until the one registered child settles and authoritative reconciliation completes; every fixture SHALL assert that reservation release and prepare dispatch are mutually exclusive.

A pre-pending Promotion Run carrying `HELD_PREPARE_RETRY` is cancellable only while the cancellation side of that shared fence is held, the exact prepare Operation remains `INTENT_RECORDED`, current authoritative lookup proves the operation was never claimed or committed, no `PendingPromotionV1` exists, every other owned Operation is terminal, and every identity/digest matches. One Ledger transaction SHALL freeze cancellation, transition that abandoned prepare Operation to `CANCELLED`, record zero actual usage and zero sealed-query consumption, and transition the replay reservation exactly once to `RELEASED`. When `activeCandidateId=null`, that transaction SHALL also enter Run `CANCELLED`, close any Gate, and release any empty Candidate lease. When a Candidate exists, the same transaction instead enters `CANCELLING` and journals the exact `close-candidate(CANCELLED)` intent; only a later transaction that stores A's matching `CANCELLED` disposition receipt may enter Run `CANCELLED` and release the Candidate lease. If the close is unknown or mismatched, the Run enters `RECOVERY_REQUIRED` with the lease held; the already-proven safe reservation release is not reversed.

Once `PendingPromotionV1` exists, or a prepare Operation is `IN_FLIGHT`, `OUTCOME_UNKNOWN`, claimed without a provable never-accepted result, or known committed, cancellation SHALL fail with `NON_CANCELLABLE_SAFETY_PHASE` and zero writes. `HELD_PENDING_REPLAY` is never a cancellable pre-pending reservation.

A `ROLLBACK_RECOVERY` Run in `WAITING_ROLLBACK_AUTHORIZATION` may be cleanly cancelled in one transaction only before any rollback dispatch intent, B Operation, Catalog claim, or inherited child registration has ever existed and before any rollback result is ambiguous or committed. After any such intent/Operation/child exists, every state of that recovery Run is non-cancellable, including a later `NOT_FOUND` return to `WAITING_ROLLBACK_AUTHORIZATION`; reconciliation or an authorized retry must resolve it. Only this clean pre-intent cancellation is eligible for the tuple-reopen rule, and an authoritative permanent `ROLLBACK_FAILED` tuple is never eligible.

The cancellation reducer SHALL perform this ordered protocol:

1. freeze the cancel command and reject new work;
2. request cancellation/containment for each active Agent, evaluation, and Teacher operation using its stable operation ID;
3. wait until every such operation is authoritatively terminal or cancelled;
4. if `activeCandidateId != null`, journal and reconcile `close-candidate(CANCELLED)`;
5. only after a matching close receipt, or immediately when `activeCandidateId=null`, atomically enter `CANCELLED`, close any open Gate, and release B's lease.

`CANCELLING` SHALL enter `RECOVERY_REQUIRED` if any cancel/terminal/close result is `IN_PROGRESS`, `OUTCOME_UNKNOWN`, missing, or mismatched. The Run and lease cannot report cancellation while containment or Candidate disposition is unproven.

#### Scenario: Active operation cancellation is acknowledged

- **WHEN** the authoritative operation status proves cancellation or a known terminal result
- **AND** there is no active Candidate
- **THEN** the Run may enter `CANCELLED` after every other active operation is also contained
- **AND** every late/superseded output remains ineligible as evidence

#### Scenario: A never-claimed prepare retry is cancelled

- **WHEN** a pre-pending prepare remains exactly `INTENT_RECORDED` with `HELD_PREPARE_RETRY`
- **AND** the cancellation side of B's Controller dispatch/cancel fence is held while fresh owner/workspace-scoped reads prove never-accepted, no pending Promotion, and no B dispatcher acquired the fence first and reached canonical child registration
- **THEN** one transaction safely abandons the intent, records zero usage/query, releases the reservation once, and freezes cancellation
- **AND** with no active Candidate that same transaction enters Run `CANCELLED` and releases any empty lease
- **AND** with an active Candidate it journals the required close and only the later matching `CANCELLED` close-receipt transaction enters Run `CANCELLED` and releases the lease

#### Scenario: Prepare child registration races pre-pending cancellation

- **WHEN** a fresh prepare dispatcher and `cancel-run` concurrently target the same `INTENT_RECORDED` prepare Operation and `HELD_PREPARE_RETRY`
- **THEN** cancellation-first commits the terminal abandoned intent before any canonical child registration or handler dispatch
- **AND** child-registration-first prevents abandonment and reservation release until the canonical registered child settles and current authoritative provider state is reduced
- **AND** no execution admits both outcomes or relies on a stale `NOT_FOUND`/no-pending observation

#### Scenario: Prepare or pending state cannot be cancelled

- **WHEN** prepare is `IN_FLIGHT`, `OUTCOME_UNKNOWN`, unproven after claim, or committed, or any `PendingPromotionV1` exists
- **THEN** `cancel-run` returns `NON_CANCELLABLE_SAFETY_PHASE`
- **AND** makes zero state, reservation, Candidate, or lease writes

#### Scenario: Pristine rollback recovery is cancelled

- **WHEN** a recovery Run is still `WAITING_ROLLBACK_AUTHORIZATION` and has no rollback dispatch intent, Operation, Catalog claim, or registered child
- **THEN** one transaction cleanly enters `CANCELLED`
- **AND** a later confirmed open may use the guarded tuple-reopen rule
- **WHEN** any rollback dispatch intent, Operation, or child has existed
- **THEN** cancellation is denied even if the Run later returns to `WAITING_ROLLBACK_AUTHORIZATION`

#### Scenario: Candidate-bearing cancellation is contained

- **WHEN** every active operation is authoritatively terminal/cancelled
- **AND** A returns the matching `CANCELLED` disposition receipt for `activeCandidateId`
- **THEN** B stores that receipt, enters Run `CANCELLED`, and releases the Candidate lease in one Ledger transaction

#### Scenario: Candidate close during cancellation is unknown

- **WHEN** `close-candidate(CANCELLED)` is `IN_PROGRESS`, `OUTCOME_UNKNOWN`, missing, or mismatched
- **THEN** the Run enters `RECOVERY_REQUIRED`
- **AND** retains its Candidate lease
- **AND** does not report `CANCELLED`

#### Scenario: Cancellation result is unknown

- **WHEN** no authoritative cancel or terminal receipt is available
- **THEN** the Run enters `RECOVERY_REQUIRED`
- **AND** does not report `CANCELLED`

#### Scenario: Safety-critical Catalog saga is active

- **WHEN** `cancel-run` is requested while `pendingPromotion != null`, a destructive operation is unresolved, a rollback dispatch intent/Operation/child has existed, or state is `PROMOTING`, `REPLAYING`, `WAITING_FINALIZE_AUTHORIZATION`, `FINALIZING`, `WAITING_ABORT_AUTHORIZATION`, `ABORTING_PROMOTION`, `ROLLING_BACK`, or matching `RECOVERY_REQUIRED`
- **THEN** it fails with `NON_CANCELLABLE_SAFETY_PHASE`
- **AND** makes zero state writes

### Requirement: Rollback recovery has one explicit entry

`workflow-evolution.open-rollback-recovery` SHALL be the sole UI-confirmed, idempotent entry for later finalized-Anchor regression. It SHALL validate and bind one finalized PromotionReceipt plus its exact failed stable generation and create `RunKindV1=ROLLBACK_RECOVERY` directly in `WAITING_ROLLBACK_AUTHORIZATION`, with no Candidate lease and no Catalog call. `execute-rollback` SHALL operate only on that Run under a fresh rollback-purpose confirmation.

`RollbackRecoveryTupleV1` SHALL be the canonical finalized-official-version/failure tuple `(workspaceId, promotionReceiptId, failedGeneration)`: the immutable receipt identity is accepted only after its bound successor official Catalog/Release identities, digests, and after-generation prove the finalized official version being recovered. It SHALL NOT be widened to a command ID, Run ID, arbitrary historical revision, batch, or wildcard.

This safety lane is independent of and excluded from `maxQueuedOrNonTerminalRuns`. A Ledger partial unique constraint SHALL permit at most one non-terminal `ROLLBACK_RECOVERY` Run for each exact tuple, while permanent closure records SHALL make the bound explicit. Exact replay of the same open command returns the same Run. A prior `ROLLED_BACK` or authoritative permanent `ROLLBACK_FAILED` record SHALL block every later open for that tuple. Only a prior pristine pre-intent `CANCELLED` recovery may permit one later user-confirmed Run, and only when no Ledger-known later finalization or RollbackReceipt invalidates the tuple. Thus the independent safety lane is bounded per exact failed finalized version and cannot bypass ordinary admission to launch Evolution work.

`NOT_FOUND`, `AUTHORIZATION_REQUIRED`, `RETRYABLE_ZERO_WRITE`, or `PENDING_PROMOTION_PRESENT` with proven zero Catalog writes SHALL return the same Run to `WAITING_ROLLBACK_AUTHORIZATION`. The next attempt requires a new rollback-purpose confirmation. `NOT_FOUND` retains the existing `INTENT_RECORDED` Operation and exact operation ID; a terminal failed zero-write receipt (`AUTHORIZATION_REQUIRED`, `RETRYABLE_ZERO_WRITE`, or `PENDING_PROMOTION_PRESENT`) requires a new operation ID linked to the failed Operation because terminal Operations cannot reopen. Only authoritative `STALE_GENERATION`, `POLICY_BLOCKED`, `VALIDATION_REJECTED`, or `PERMANENT_FAILURE` with proven zero write may enter `ROLLBACK_FAILED`. An ambiguous result remains `RECOVERY_REQUIRED` and never opens another Run.

#### Scenario: Open a valid rollback recovery

- **WHEN** the user confirms one exact finalized-official-version/failure tuple with no non-terminal, successful, or permanently failed recovery for that tuple
- **THEN** one recovery Run is created in `WAITING_ROLLBACK_AUTHORIZATION`
- **AND** no Anchor, Candidate, or Catalog state changes
- **AND** the ordinary Evolution admission count is unchanged

#### Scenario: Retryable rollback attempt fails before a write

- **WHEN** rollback returns `AUTHORIZATION_REQUIRED` or `RETRYABLE_ZERO_WRITE` with an authoritative terminal zero-write receipt
- **THEN** the same recovery Run returns to `WAITING_ROLLBACK_AUTHORIZATION`
- **AND** no background retry occurs
- **AND** a new `execute-rollback` confirmation uses a new Catalog operation ID

#### Scenario: Rollback was never claimed

- **WHEN** rollback lookup authoritatively returns `NOT_FOUND`
- **THEN** the same recovery Run returns to `WAITING_ROLLBACK_AUTHORIZATION`
- **AND** a new confirmation may dispatch the exact still-intended request with the same operation ID

#### Scenario: A waiting recovery is cancelled and later reopened

- **WHEN** a rollback-recovery Run is cleanly cancelled before any rollback dispatch intent, Operation, or child exists
- **AND** no Ledger-known later finalization or RollbackReceipt invalidates its tuple
- **THEN** a later distinct confirmed open command may create one new recovery Run
- **AND** the cancelled command remains immutable history
- **AND** the later `execute-rollback` still requires A to prove that the exact failed Anchor is current

#### Scenario: A recovery tuple is permanently closed

- **WHEN** an exact tuple already has `ROLLED_BACK` or an authoritative permanent `ROLLBACK_FAILED`
- **THEN** every later `open-rollback-recovery` for that tuple is denied
- **AND** no new Run, ordinary admission count change, Candidate lease, or Catalog call occurs

#### Scenario: Pending Promotion exists

- **WHEN** rollback is requested while Create Loop reports any pending Promotion
- **THEN** rollback dispatch is denied with zero Catalog writes
- **AND** the same Run remains `WAITING_ROLLBACK_AUTHORIZATION` after its idempotent denial receipt

### Requirement: Audit export uses the canonical live publisher

`workflow-evolution.export-audit` SHALL generate only bounded redacted audit bytes and consume the singular Host `WorkspacePublisherV1` contract normatively defined by `official-workbench-domain-packages`. Workflow Evolution SHALL NOT redeclare the Host publication request, provenance, durable namespace/state/receipt, live confirmation guard, `WorkspacePublicationLeaseV1`, `WorkspacePublicationGuardV1.enterPublish()`, native confinement/no-overwrite behavior, `readPublication`, or recovery matrix, and SHALL NOT implement a package-local publisher or fallback.

Before the first Host invocation, one Ledger transaction SHALL commit the export intent and B-owned `AuditPublicationRebuildRecipeV1`. The export intent SHALL bind the current command owner/workspace, one durable `publicationId`, the exact redacted content digest and byte length, relative target, media type, and Host publication-request digest. It SHALL also bind the rebuild recipe ID/digest and one immutable bounded redacted projection record created in that same transaction. Neither the recipe nor that projection record is a Host publication operation or an alternate publisher.

`AuditPublicationRebuildRecipeV1` SHALL be a closed object containing exactly:

- `kind`, fixed to `AUDIT_PUBLICATION_REBUILD_RECIPE_V1`;
- `schemaVersion`, fixed to `1`;
- `recipeId`, `exportIntentId`, `publicationId`, `workspaceIdentityDigest`, and `runId`;
- `projectionRecord`, containing exactly `recordId`, positive safe-integer `recordRevision`, and lowercase-hex SHA-256 `recordDigest` for the immutable redacted projection record;
- `sourceRecords`, a non-empty, duplicate-free list sorted by UTF-8 byte lexical `(recordKind, recordId)` and then numeric revision, whose entries contain exactly `recordKind`, `recordId`, positive safe-integer `recordRevision`, and lowercase-hex SHA-256 `recordDigest`;
- `projectionImplementation`, containing exactly stable `implementationId`, `implementationVersion`, and lowercase-hex SHA-256 `implementationDigest`;
- `serializerImplementation`, containing exactly stable `implementationId`, `implementationVersion`, and lowercase-hex SHA-256 `implementationDigest`;
- `relativePath`, `mediaType`, positive safe-integer `expectedByteLength`, and lowercase-hex SHA-256 `expectedContentDigest`; and
- `recipeDigest`, computed as lowercase-hex SHA-256 over RFC 8785 canonical JSON UTF-8 bytes of the complete object excluding only `recipeDigest`.

`AuditSourceRecordKindV1` SHALL be exactly `RUN | ATTEMPT | GATE | OPERATION | STRUCTURED_DOCUMENT_REVISION | GAP_RECORD | BUDGET_DECISION | HUMAN_DECISION | TRUSTED_RECEIPT | AUDIT_EVENT`. Every source reference SHALL identify the exact Ledger revision consumed to create the immutable projection record and SHALL be validated inside the same initial transaction snapshot; unknown kinds, unknown fields, aliases, duplicate or out-of-order references, mutable/current-row shortcuts, missing revisions, or digest mismatches SHALL abort that transaction before any publisher call. The frozen projection record SHALL contain only the closed redacted structured audit projection and its exact source references, never raw Agent/provider data, sealed membership/cases/oracles, secrets, or publication bytes. A later rebuild validates the frozen projection record and its embedded reference manifest; it SHALL NOT dereference mutable current rows or require them to still equal those historical references.

The recipe, its immutable projection record, and the exact content-addressed projection and serializer implementations SHALL remain addressable for the entire recoverable lifetime of the export intent. A fresh confirmed resume SHALL load only those frozen facts, validate every recipe/projection/implementation identity and digest, serialize the frozen projection with that exact serializer, and require both `expectedByteLength` and `expectedContentDigest` to match before invoking the Host with the already-bound publication identity and request digest. It SHALL NOT project current Ledger rows, substitute a current implementation with the same name, adopt a later record revision, persist raw publication bytes, or choose a new publication ID/name. An unavailable or mismatched frozen fact fails closed with zero Host write.

The executable B restart fixture SHALL capture the first volatile serialized bytes in test-only memory, commit the intent/recipe/projection, commit later Ledger revisions, close and reopen the real Ledger, and resume under a fresh confirmation. It SHALL assert byte-for-byte equality with the first serialization in addition to length and digest equality, then prove the canonical Host receives the same publication ID, relative target, media type, content digest, and request digest exactly once. Production code and fixtures SHALL NOT satisfy this assertion by persisting or reading raw publication bytes from the Ledger.

The current confirmed `export-audit` invocation is the sole external-write authority; B SHALL register and invoke the canonical publication child under that live scope exactly as the Host contract requires. Losing the response or restarting SHALL cause B to call only owner/workspace-bound `readPublication` with the same publication identity. A matching immutable publication receipt is adopted idempotently; conflict, terminal failure, or ambiguity SHALL NOT be reported as export success and SHALL NOT trigger an automatic second publication, alternate path, new filename, overwrite, or package-local recovery. A Host `NOT_FOUND` or canonically resumable non-terminal state does not itself grant a write: any later Host invocation requires a current fresh `export-audit` confirmation and the exact recipe reconstruction above.

#### Scenario: Audit publication response is lost

- **WHEN** B committed its export intent and the process exits before it receives the Host publication result
- **THEN** restart performs only canonical `readPublication` for the same owner/workspace/publication identity
- **AND** adopts only the exact matching immutable receipt
- **AND** creates at most one final file and never retries under another path or identifier

#### Scenario: Ledger advances before exact audit resume

- **WHEN** the export intent, rebuild recipe, and immutable redacted projection record committed before the first publisher call
- **AND** later Run, Operation, receipt, or audit-event revisions commit before a process restart and fresh export confirmation
- **AND** canonical `readPublication` reports the exact operation as `NOT_FOUND` or resumable
- **THEN** B rebuilds bytes only from the frozen projection record and exact recipe-bound projection/serializer implementations
- **AND** the rebuilt bytes are byte-for-byte equal to the first serialization and their byte length, content digest, publication identity, and Host request digest equal the original frozen values before the canonical publisher is invoked
- **AND** the later Ledger revisions neither enter the resumed file nor cause a second publication, alternate filename, or current-state regeneration

#### Scenario: Audit rebuild fact is unavailable or mismatched

- **WHEN** a frozen record revision, projection/serializer implementation, byte length, content digest, or recipe digest cannot be loaded and verified exactly
- **THEN** the fresh confirmation fails with zero Host publisher invocation
- **AND** B neither serializes current Ledger state nor changes the frozen publication identity or target

#### Scenario: Export confirmation is revoked

- **WHEN** the confirmed outer export invocation is returned, thrown, cancelled, or revoked while publication is racing
- **THEN** the canonical Host publication guard and `enterPublish()` settlement rules decide the outcome
- **AND** B neither performs a liveness check followed by an unguarded write nor reimplements that race

### Requirement: Redacted Agent usage export is one closed canonical projection

`RedactedAgentUsageProjectionV1` SHALL be the sole Agent-usage object admitted to audit export. It SHALL be a closed JSON object containing exactly:

- `schemaVersion`, fixed to `1`;
- `runtimeVersion`, `modelVersion`, and `profileVersion`, each a non-empty `1..128` UTF-8 byte string without control characters;
- `status`, exactly `SUCCEEDED | FAILED | CANCELLED | OUTCOME_UNKNOWN`;
- safe-integer `inputTokens`, `outputTokens`, `costUsdMicros`, and `latencyMs`, each non-negative and no greater than the matching frozen `RunBudgetDecisionV1` total (`maxInputTokens`, `maxOutputTokens`, `maxCostUsdMicros`, and `maxWallTimeMs`);
- `receiptDigests`, a non-empty array of at most `128` lowercase SHA-256 values, strictly sorted and unique by UTF-8 bytes; and
- `projectionDigest`, lowercase SHA-256 over the RFC 8785 canonical JSON UTF-8 bytes of the validated object after removing only `projectionDigest`.

Every version, status, total, and receipt digest SHALL be derived only from the exact Host-verified allowlisted enforcement/execution/usage receipts already bound to the B Operation and frozen Run budget. A renderer field, Agent result, provider payload, current configuration default, or export option SHALL NOT supply or override any projection value.

Parsing SHALL reject unknown or duplicate JSON members, aliases, unsupported versions, invalid Unicode scalar sequences, non-safe or non-canonical numbers, missing fields, out-of-bound totals, duplicate or out-of-order receipt digests, and digest mismatch. No handle, thread, turn, principal, provider/configuration/endpoint identity, request or result byte, prompt, transcript, internal correlation metadata, sealed-suite membership or per-case data, oracle, secret/resource reference, authorization metadata, path, or direct database representation can be represented by this schema. B SHALL own this schema, canonicalizer, and accepted/rejected vectors in its public contract; Host and A SHALL neither copy nor widen it.

#### Scenario: Canonical usage projection is exported

- **WHEN** B serializes Agent usage for an audit export
- **THEN** every value is validated against the exact closed field set, frozen Run budget, sorting rules, and canonical digest above
- **AND** independently rebuilt RFC 8785 bytes and `projectionDigest` are identical

#### Scenario: Usage projection contains extra or sensitive data

- **WHEN** a projection contains an unknown field, forbidden identity/raw/sealed/secret data, an out-of-bound total, duplicate/out-of-order receipt digest, or non-canonical/digest-mismatched bytes
- **THEN** B rejects the complete projection before persisting the export projection or invoking the Host publisher
- **AND** no permissive stripping, alias, alternate serializer, or fallback export is used

### Requirement: Product UI is a capability client

Workflow Evolution UI SHALL be added only after backend acceptance and SHALL read and mutate state only through package-owned capabilities.

#### Scenario: UI displays a run

- **WHEN** the user opens an Evolution run
- **THEN** the UI renders the capability snapshot and document projections
- **AND** does not read SQLite, parse Markdown for state, or maintain a second state machine

#### Scenario: Agent reads a Run

- **WHEN** an Agent attempts `get-run` in Stage1
- **THEN** the audience is unavailable
- **AND** Builder/Verifier receive only Controller-assembled operation inputs

#### Scenario: Audit is exported

- **WHEN** the user confirms `workflow-evolution.export-audit`, an `external-write` UI action, for a relative target accepted by the canonical Host publisher contract
- **THEN** B persists its intent and invokes only the canonical live Host publisher contract
- **AND** the export uses `RedactedAgentUsageProjectionV1` with allowlisted runtime/model/profile versions, status, aggregate tokens/cost/latency, and receipt digests
- **AND** contains no handle/thread/turn/principal, provider payload, prompt/result, sealed suite membership, per-case ID/outcome, sealed input/oracle, secret bytes, or direct database representation

### Requirement: System capability identity is owner-bound

The Host SHALL derive a separate system invoker identity from each activated manifest/lifecycle owner. Workflow Evolution SHALL receive its owner-bound invoker; caller identity SHALL NOT be supplied by request input.

#### Scenario: Another domain calls a protected Catalog action

- **WHEN** any system domain other than the frozen Workflow Evolution controller invokes its protected Catalog operation
- **THEN** Create Loop rejects the caller with zero writes

#### Scenario: Workflow Evolution uses the production adapter

- **WHEN** the owner-bound Workflow Evolution lifecycle invokes the Catalog contract
- **THEN** the Broker audit records that manifest owner identity
- **AND** no shared `domain-runtime` identity or caller-controlled impersonation is used
