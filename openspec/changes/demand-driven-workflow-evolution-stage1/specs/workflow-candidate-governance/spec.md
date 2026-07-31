## ADDED Requirements

### Requirement: Candidate policy is versioned and fail closed

Every proposed/Candidate definition SHALL be validated against one canonical `WorkflowExecutionPolicyBindingV1` at provision, before staging, before each private/replay evaluation, during Promotion preparation, and before every stable bound-service execution. The definition may request behavior but grants no execution authority. Candidate, official Release, service binding, request, `AgentProfileEnforcementReceiptV1`, and terminal `AgentExecutionReceiptV1` SHALL all bind the same execution-policy value/digest; a mismatch fails closed with no current-default or looser fallback. An AI Agent node SHALL NOT override workspace root, call mode, runtime, profile, or capability policy through its definition.

The initial policy SHALL allow only the explicitly approved Stage1 nodes, models, runtimes, tools, test-scoped opaque secret references, network/file/env scopes, budgets, and Agent profile. Automatic Candidate paths SHALL reject production secret references. The AI Agent atom SHALL be request-only and tool-less with no file, arbitrary network, env, Broker capability, secret, or child-agent access. Every undeclared capability SHALL be denied.

#### Scenario: Allowed Candidate

- **WHEN** a Candidate uses only registered and policy-allowed atoms within every bound
- **THEN** validation produces evidence bound to the exact execution-policy-binding and Candidate digests

#### Scenario: Arbitrary code or unknown capability

- **WHEN** a Candidate contains Code, Bash/Python, Custom, HTTP or research-search, schedule/webhook activation, the in-memory Human Approval node, Loop/subworkflow with mutable `workflowId`, an unknown model/tool/secret, or any child-agent creation
- **THEN** validation fails closed
- **AND** private execution and staging do not proceed

### Requirement: Candidate Runner is isolated

Candidate execution SHALL pin the Candidate/Release digest and run through the canonical Create Loop engine with an isolated workspace and policy-limited file, network, env, tool, model, and budget access.

#### Scenario: Candidate writes outside its scope

- **WHEN** a node requests a file, network, environment, tool, or external write outside the frozen policy
- **THEN** the operation is denied
- **AND** the denial is recorded as evidence
- **AND** the Anchor and frozen documents remain unchanged

#### Scenario: Candidate process fails

- **WHEN** a private Candidate execution returns an authoritative failed or timed-out operation record
- **THEN** the failure receipt is preserved
- **AND** stable Anchor service remains available

#### Scenario: Candidate execution outcome is unknown

- **WHEN** Create Loop cannot prove whether a prior controlled evaluation completed
- **THEN** the operation returns `OUTCOME_UNKNOWN`
- **AND** the Attempt becomes `EXECUTION_UNKNOWN`
- **AND** no retry, repair, verification, or promotion occurs automatically

### Requirement: Repair is bounded and cannot weaken the contract

Builder SHALL receive frozen Requirement/Gap/Change specs, public tests, and Candidate failure evidence. UI submission input may omit `totalAttemptLimit` or `sealedQueryLimit`; before computing the request digest, presenting confirmation, or creating the Run, B SHALL copy each omission from the matching field of the exact current `WorkspaceEvolutionPolicyV1`. The resolved policy values SHALL be safe integers in the existing inclusive ranges `totalAttemptLimit=1..3` and `sealedQueryLimit=1..5`; `3` and `5` are initial installation policy seeds only, not permanent omission defaults. An explicit Run value SHALL also remain within the global range and at or below the current policy value. The persisted `RunBudgetDecisionV1` SHALL contain both explicit normalized fields, with `totalAttemptLimit` including the initial Attempt; a missing or out-of-range persisted field is invalid and SHALL NOT be defaulted during recovery or execution. Public feedback SHALL be a fixed low-entropy error code or bounded public-case counterexample. Sealed feedback SHALL be only `SEALED_SUITE_FAILED`, without case ID, field, diff, membership, or oracle-derived detail. Every dispatched sealed evaluation, including unknown outcome, consumes one query, while authoritative pre-dispatch `NOT_FOUND` consumes none.

`ComputeReservationV1` SHALL be the singular generic Host/SDK reservation contract exported by `@sciforge/domain-sdk/contract`. B, Host, and Create Loop SHALL consume that exact type, validator, digest body, and shared fixtures and SHALL NOT define, re-export, copy, widen, narrow, or accept a local variant. For every Builder and Verifier operation, `reservedRequestBodyDigest` SHALL be the lowercase SHA-256 digest of the RFC 8785 canonical JSON UTF-8 bytes of the strict reservation-free Agent request body. That body SHALL NOT contain the reservation envelope, `reservationId`, `reservationDigest`, or any field derived from them; B freezes the reservation only after the body digest, and the enclosing Agent request digest may then bind the complete request. This one-way reference is the only request/reservation link and SHALL NOT form a digest cycle.

#### Scenario: Public test fails

- **WHEN** a Candidate fails a repairable public acceptance case
- **THEN** the controller records a minimal counterexample
- **AND** may start the next bounded attempt without changing acceptance criteria

#### Scenario: Repair limit reached

- **WHEN** the maximum attempts are exhausted
- **THEN** the run enters `FAILED` with `REPAIR_LIMIT_EXHAUSTED`
- **AND** no unbounded loop continues

#### Scenario: Repair creates a successor Candidate

- **WHEN** another frozen Attempt is allowed
- **THEN** Builder returns a strict proposal only
- **AND** the Controller stages a new immutable Candidate with `supersedesCandidateId`
- **AND** Create Loop atomically records the predecessor's `SUPERSEDED` disposition

Candidate disposition authority SHALL remain action-specific: only a successful successor `stage-candidate` may atomically write predecessor `SUPERSEDED`; only `finalize-promotion` may write `PROMOTED`; only `abort-promotion` may write `ABORTED`; and `close-candidate` may write only `REJECTED | CANCELLED | FAILED | STALE`. Repair, replay, generic cancellation, recovery, and late-result paths SHALL NOT substitute one disposition action or value for another.

### Requirement: Builder and Verifier use enforced isolated operations

Builder and Verifier SHALL run as separate operation-principal-scoped sibling operations created by the deterministic Controller, not as parent/child threads. They SHALL use the singular generic operation, `RequestRebuildRecipeV1`, stable-token, accepted-token-tombstone, lookup, and recovery contract normatively defined by `agent-operation-governance`; B SHALL NOT redeclare that state machine or create another request-reconstruction path. Before claiming each operation, B SHALL durably persist its owning-domain recipe and frozen canonical `ComputeReservationV1`. The recipe SHALL contain only the exact frozen domain object IDs/digests plus prompt/profile template and serializer ID/version/digest references required by the generic contract, never request/prompt bytes. Exact retry returns the same handle/status, a digest conflict creates no thread, authoritative `NOT_FOUND` may rebuild only through that recipe and the same token, and `UNQUERYABLE` becomes `OUTCOME_UNKNOWN` without resend.

Production profiles SHALL enforce request-only context, direct deterministic-Controller-only result delivery, and end-to-end raw retention `NONE` across Host/runtime/transport/remote provider with actual enforcement receipts; an unsupported hop fails before raw input dispatch. They SHALL deny native tools, Broker capabilities, arbitrary file references, arbitrary network, env/secrets, and child agents.

For Builder and Verifier, **raw** SHALL mean every request/prompt/system/context byte, runtime/provider transcript, turn, event or stream, and unparsed or partially parsed provider-result byte. No raw byte SHALL persist in the Host, runtime, transport, provider, B Ledger, filesystem, queue, log, trace, artifact, UI, or export. Raw bytes may exist only in bounded volatile buffers for the current dispatch and single delivery attempt.

Inputs/results SHALL NOT be published to sidebar/UI/thread lists, generic turn lifecycle subscribers, global artifact consumers, shared memory, goal/context ledgers or visible state, handoff history, automatic references, sibling Agent operations, or other same-owner consumers.

Builder SHALL return only the closed `CandidateProposalV1` defined below. Verifier SHALL return only the closed advisory `VerificationAssessmentV1` defined below. B's operation-principal-scoped delivery handler SHALL parse the one volatile result buffer directly into exactly one appropriate strict projection and reject the complete output on any unknown field, invalid discriminant, invalid value, ordering violation, duplicate, or size/count limit. These two schema-validated projections are the only Agent-derived business content B may persist; neither projection may contain an Agent request/system/context prompt, transcript, provider envelope, unparsed bytes, or unknown field.

The Controller SHALL derive workspace/base/generation/mode/attempt/supersession/operation/request/change/policy/budget/service-exposure/evidence fields. Invalid output SHALL retain only digest, size, and stable rejection code. Verifier SHALL NOT claim sealed pass, forge receipts, or declare promotion eligibility. Neither Agent can stage/execute a Candidate or mutate frozen state.

B's deterministic coordinator SHALL commit the validated projection, a business-consumption receipt bound to the Agent operation/request/profile/result and projection type/version/digest, and the corresponding B Operation/Attempt transition atomically in one Ledger transaction. Host Agent `SUCCEEDED` is only an authoritative runtime terminal result and SHALL NOT mean that B durably consumed the business result.

If the Host cannot prove a terminal runtime result, the Agent operation is `OUTCOME_UNKNOWN`. If the Host proves `SUCCEEDED` but B lacks the matching atomic projection/consumption receipt after restart, B SHALL atomically set its still-nonterminal B Operation to `OUTCOME_UNKNOWN`, the Attempt to `EXECUTION_UNKNOWN`, and the Run to `RECOVERY_REQUIRED`; it SHALL NOT redeliver raw output, re-query the provider, resend the operation, or start automatic repair. The Host terminal record remains `SUCCEEDED`. If the projection transaction committed but its acknowledgement was lost, reconciliation SHALL recover only the projection and receipt and SHALL NOT reconstruct or redeliver raw bytes. Cancellation, supersession, and late-result containment use the same atomic boundary: containment before commit permits only digest/size/terminal/quarantine metadata, while commit before containment permits idempotent recovery of the exact projection/receipt but cannot reopen or advance a contained Attempt.

Verifier Candidate input SHALL use the strict `VerifierInputEnvelopeV1` data boundary defined below beneath a fixed Host system policy.

#### Scenario: Runtime cannot enforce the profile

- **WHEN** a runtime lacks any required context, tool, file, network, capability, publication, or child-agent restriction
- **THEN** the operation fails before dispatch
- **AND** no permissive or legacy `run()` fallback is selected

#### Scenario: Shared-context canary exists

- **WHEN** shared memory, context ledger, visible UI state, handoff history, or automatic file references contain a canary
- **THEN** the canary is absent from Builder and Verifier inputs, outputs, thread artifacts, logs, and exports

#### Scenario: Builder or Verifier requests a denied operation

- **WHEN** either Agent requests shell/native tools, file read/write, network, env/secret, Broker discovery/invocation, or a child Agent
- **THEN** the request is denied before execution
- **AND** zero Candidate, document, Ledger-policy, or Anchor writes occur

#### Scenario: Agent output claims authority

- **WHEN** Builder supplies Controller-owned identity/policy fields or Verifier declares a pass/receipt/eligibility
- **THEN** strict parsing rejects the complete output as an unknown/unauthorized-field violation
- **AND** stores only digest, size, and stable rejection code with zero Candidate stage
- **AND** the Controller recalculates every authoritative field from trusted state

#### Scenario: Raw result is lost before business commit

- **WHEN** a Builder or Verifier raw result was delivered, or the Host already recorded `SUCCEEDED`, but the process exits before B atomically commits its validated projection and consumption receipt
- **THEN** restart does not redeliver, reconstruct, re-query, or resend the raw result
- **AND** an unproven Host terminal result is `OUTCOME_UNKNOWN`
- **AND** a proven Host `SUCCEEDED` result without the B receipt makes the B Operation `OUTCOME_UNKNOWN`, the Attempt `EXECUTION_UNKNOWN`, and the Run `RECOVERY_REQUIRED`

#### Scenario: Acknowledgement is lost after business commit

- **WHEN** the projection, consumption receipt, and Operation/Attempt transition committed but the process exits before acknowledging delivery
- **THEN** restart recovers only that exact projection and receipt
- **AND** no raw bytes or duplicate domain transition are produced

#### Scenario: Cancellation or supersession races with delivery

- **WHEN** cancellation, supersession, or outcome containment linearizes before the projection transaction
- **THEN** no Agent-derived business projection is persisted and only digest, size, terminal metadata, and quarantine reason remain
- **WHEN** the projection transaction linearizes first
- **THEN** reconciliation may recover only that exact projection and receipt
- **AND** it cannot reopen or advance the contained Attempt

### Requirement: Agent business projections use closed V1 wire schemas

`CandidateProposalV1` and `VerificationAssessmentV1` SHALL be B-owned strict wire schemas exported by `@sciforge/domain-workflow-evolution/contract`. B SHALL use one validator/projector implementation for volatile Agent delivery, persisted projection reload, consumption-receipt verification, and executable accepted/rejected vectors.

`CandidateProposalV1` SHALL be one JSON object whose received UTF-8 document and validated RFC 8785 canonical JSON form are each at most 262,144 bytes, with exactly:

```text
{
  kind: "CANDIDATE_PROPOSAL_V1",
  schemaVersion: 1,
  proposedDefinition: WorkflowDefinitionV1,
  rationale: string
}
```

`proposedDefinition` SHALL validate through the singular closed `WorkflowDefinitionV1` imported from `@sciforge/domain-create-loop/catalog-contract`; B SHALL NOT copy, widen, or normalize a second definition schema. Its nested strings, arrays, ordering, and bounds SHALL remain those of that canonical contract, and the complete proposal SHALL still fit the projection byte limit above. `rationale` SHALL contain 0–4,096 UTF-8 bytes and valid Unicode scalar values without C0/C1 control characters other than horizontal tab, line feed, or carriage return. There is no proposal-supplied identity, digest, policy, reservation, evidence, eligibility, operation, Candidate, service-exposure, or receipt field.

`VerificationAssessmentV1` SHALL be one JSON object whose received UTF-8 document and validated RFC 8785 canonical JSON form are each at most 32,768 bytes, with exactly:

```text
{
  kind: "VERIFICATION_ASSESSMENT_V1",
  schemaVersion: 1,
  recommendation: "CONTINUE" | "REPAIR" | "STOP",
  risks: string[],
  evidenceRefs: { receiptId: string, receiptDigest: string }[]
}
```

`risks` SHALL contain 0–16 unique strings, each 1–512 UTF-8 bytes with the same Unicode/control-character rule as `rationale`, sorted by the UTF-8 lexical byte order of the complete string. `evidenceRefs` SHALL contain 1–32 unique closed objects, each with only `receiptId` and `receiptDigest`, sorted by the UTF-8 lexical tuple `(receiptId, receiptDigest)`. `receiptId` SHALL be 1–128 UTF-8 bytes without control characters; `receiptDigest` SHALL be exactly 64 lowercase hexadecimal SHA-256 characters. Every reference SHALL exactly equal a receipt reference allowlisted in the dispatched `VerifierInputEnvelopeV1`; a reference not in that frozen input fails projection. `recommendation` is advisory only and SHALL NOT represent sealed acceptance, `VerificationReportV1` validity, Promotion eligibility, or mutation authority.

At every B-owned object level, both schemas SHALL reject unknown keys, aliases, duplicate JSON member names, `null`, unsupported versions or discriminants, invalid Unicode scalar sequences, invalid digests, out-of-order or duplicate arrays, non-canonical enum spellings, and values outside any bound. `proposedDefinition` SHALL recursively reject unknown or invalid content according to its imported A-owned schema, including any field-specific nullability rule; B SHALL NOT impose a divergent nested rule. Array order is canonical as specified above, except semantic arrays nested in `WorkflowDefinitionV1`, whose canonical A-owned order SHALL be preserved rather than re-sorted by B.

For each accepted projection, `projectionDigest` SHALL be SHA-256 lowercase hexadecimal over the exact UTF-8 bytes of its RFC 8785 canonical JSON form after strict validation. The digest body is the complete projection object shown above; it excludes nothing because the wire projection contains no digest, receipt, runtime metadata, or creation metadata field. Any Agent-supplied `projectionDigest` is therefore an unknown field and fails validation. The separate business-consumption receipt SHALL bind exactly the Host Agent operation ID, immutable request/profile/result digests, projection `kind`, `schemaVersion`, and computed `projectionDigest`; it SHALL neither add authority to the projection nor retain raw result bytes.

#### Scenario: Builder projection is accepted

- **WHEN** Builder returns the exact `CANDIDATE_PROPOSAL_V1` object within every canonical definition, string, and byte bound
- **THEN** the strict projector computes its complete-body RFC 8785 digest
- **AND** the coordinator may atomically persist only that projection and its bound consumption receipt

#### Scenario: Verifier projection attempts to add authority

- **WHEN** Verifier adds a pass/eligibility field, uses a non-allowlisted evidence reference, changes array order, duplicates an item, or exceeds any bound
- **THEN** the complete `VerificationAssessmentV1` result is rejected
- **AND** only result digest, size, and stable rejection code may persist

### Requirement: VerifierInputEnvelopeV1 is a strict data boundary

`VerifierInputEnvelopeV1` SHALL be the only request body delivered to Verifier beneath the fixed Host-owned system policy. It SHALL be a closed schema with exactly these top-level fields and discriminant:

- `kind`, fixed to `VERIFIER_INPUT_V1`;
- `schemaVersion`, fixed to `1`;
- `subject`, containing exactly `workspaceIdentityDigest`, `runId`, `attemptId`, `candidateId`, `candidateDigest`, `definitionDigest`, `workflowExecutionPolicyBindingDigest`, and `runBudgetDecisionDigest`;
- `candidateSnapshot`, containing exactly `untrustedDefinition` and `untrustedRationale`;
- `frozenSpecDigests`, containing exactly `requirementSpecDigest`, `gapSpecDigest`, and `changeSpecDigest`; and
- `evidenceRefs`, containing exactly `publicAcceptance`, `sealedSuite`, `anchorRegression`, `scientificChecks`, and `builderOperation`.

Every `evidenceRefs` item SHALL be an opaque closed `{ receiptId, receiptDigest }` value; `sealedSuite` and `builderOperation` SHALL each be one required value, and the other fields SHALL be ordered bounded arrays. Every object, string, definition body, rationale, and array SHALL obey the explicit byte/count limits exported with B's V1 contract schema. Unknown keys, aliases, alternate discriminants, out-of-order duplicate IDs, invalid digests, and out-of-bound values SHALL fail before Verifier dispatch.

Only B's deterministic coordinator may construct the envelope from the frozen Candidate, B Ledger facts, and validated A/Host receipt identities. The fixed Host system policy SHALL remain outside the envelope and SHALL NOT be synthesized from Candidate data. Candidate-controlled prompts, rationale, text, and workflow fields SHALL remain nested under `candidateSnapshot` as quoted untrusted data; they SHALL NOT become a system/developer instruction, context configuration, automatic reference, tool, file input, URI dereference, Broker request, or runtime option. `evidenceRefs` SHALL disclose no raw evidence, sealed case/oracle/membership data, transcript, file path, or automatic attachment.

#### Scenario: Candidate contains prompt injection

- **WHEN** Candidate-controlled text asks Verifier to change policy, reveal context, accept a forged receipt, or ignore the system contract
- **THEN** the data-only envelope keeps it non-executable
- **AND** positive-control tests prove no instruction/context/tool boundary changes

#### Scenario: Envelope contains an extra field or executable reference

- **WHEN** a Verifier request contains an unknown field, alternate discriminant, raw evidence, file/URI reference, automatic attachment, tool request, or Candidate-controlled runtime option
- **THEN** strict envelope validation fails before Agent dispatch
- **AND** no permissive context-building or legacy request path is selected

### Requirement: Sealed oracles stay in a trusted harness

Raw sealed oracles, expected answers, assertions, case metadata, and suite membership SHALL be readable only by B's trusted sealed-test registry/harness. They SHALL NOT enter any Agent/model prompt, workspace, thread, artifact, Markdown projection, log, run projection, or audit export.

A sealed input SHALL be synthetic/non-secret and may enter only the exact Candidate controlled-evaluation payload. For a Candidate LLM/AI Agent atom, the Host SHALL use an ephemeral digest-only `SEALED_EVALUATION` profile with only the selected model transport and no tools, research search, arbitrary network, files, env, context injection, cross-operation publication, or raw prompt/result retention.

The canonical `evaluate` descriptor SHALL declare `EvaluationResultDeliveryV1`. Its fixed Host-derived mapping SHALL be `STANDARD_CONTROLLER -> STANDARD_CONTROLLER_RESULT`, `LIVE_APPROVED_OUTER_CONTROLLER -> STANDARD_CONTROLLER_RESULT`, and `TRUSTED_SEALED_HARNESS -> TRANSIENT_HARNESS_COMPARE`. `ControlledEvaluationPurposeV1=CANDIDATE_SEALED` is valid only for the registered trusted-harness profile's current Host-minted operation principal; that invocation class is invalid for every non-sealed purpose. `PROMOTION_REPLAY` is valid only under Host-derived `LIVE_APPROVED_OUTER_CONTROLLER` while a current same-owner/workspace Promotion-purpose `execute-promotion` invocation is active. Payload/options cannot choose the class, principal, channel, or policy.

For the sealed purpose, raw Candidate output is delivered only in memory to that exact principal, excluded from Broker cache/trace/events/logs/generic subscribers/IPC replay/persistent return storage, compared, and contained. Every hop SHALL use a bounded single-owner mutable byte buffer transferred without immutable strings/structured clones/fan-out copies and clear its owned buffer in `finally` for success/error/cancel/timeout. A hop that cannot prove this SHALL use a dedicated ephemeral process destroyed after comparison; if neither is enforceable, dispatch fails before execution. A/B/Broker persist only digests and aggregate receipt evidence. A remote model transport SHALL additionally provide an actual provider zero-retention enforcement receipt. This remains the same action/provider handler and creates no caller-selected fallback.

The trusted deterministic harness, not the LLM Verifier, SHALL be sealed acceptance authority. Oracle/expected output/assertions/suite membership SHALL remain in harness memory/private registry. The harness SHALL invoke Create Loop controlled evaluation and write one trusted Ledger `SealedSuiteReceiptV1` containing opaque receipt ID, suite revision/digest, Candidate and `WorkflowExecutionPolicyBindingV1` digests, ordered evaluation operation/`ControlledEvaluationReceiptV1` digests, aggregate outcome/counts, harness version, issuer owner, and receipt digest. A crash after evaluation but before this record commits SHALL be sealed `OUTCOME_UNKNOWN`.

Verifier SHALL receive the frozen Candidate snapshot and opaque receipt ID only; the deterministic Controller SHALL load/validate the trusted record. No signature/attestation field is required or accepted. Audit export SHALL include only opaque receipt ID/digest and aggregate outcome/counts, never per-case IDs/outcomes/membership.

#### Scenario: Builder requests sealed material

- **WHEN** Builder or any operation it could initiate requests sealed input, oracle, suite membership, or canary
- **THEN** access is denied and audited

#### Scenario: Sealed receipt is forged or changed

- **WHEN** suite, Candidate, execution-policy binding, ordered controlled-evaluation receipt, issuer owner, receipt digest, or aggregate outcome does not match the trusted Ledger record
- **THEN** `VerificationReportV1` creation fails closed

#### Scenario: Harness crashes before receipt commit

- **WHEN** controlled evaluation may have completed but the trusted suite receipt did not commit
- **THEN** the sealed result is `OUTCOME_UNKNOWN`
- **AND** no inferred pass, automatic retry, repair detail, or promotion is allowed

#### Scenario: Sensitive result delivery cannot be enforced

- **WHEN** Broker/runtime/provider cannot enforce transient-only delivery, no cache/trace/event, memory zeroization, or remote zero retention
- **THEN** sealed evaluation fails before Candidate/model dispatch
- **AND** no permissive ordinary-result fallback is selected

#### Scenario: Invocation class or purpose is spoofed

- **WHEN** payload/options selects a trusted class/target/channel, a standard Controller requests `CANDIDATE_SEALED`, or a trusted harness requests a non-sealed purpose
- **THEN** the action fails before Candidate/model execution
- **AND** no raw result channel is created

#### Scenario: Verifier attempts mutation

- **WHEN** Verifier returns Candidate edits or requests Candidate, frozen-document, Ledger-policy, or Anchor mutation
- **THEN** strict output validation or capability policy rejects it
- **AND** every frozen digest remains unchanged

### Requirement: Agent attempts are durable and ambiguity is quarantined

The Controller SHALL persist Agent operation ID, request/profile/input digest, owner/principal relation, handle, state, actual runtime/model/usage receipt, cancel receipt, and result digest.

#### Scenario: Dispatch acknowledgement is lost

- **WHEN** the process exits after an Agent may have started but before B stores the returned handle
- **THEN** restart reconciles by the same operation ID
- **AND** never creates a second thread/turn

#### Scenario: Agent result is unknown or superseded

- **WHEN** dispatch/completion cannot be proven or a newer Attempt already exists
- **THEN** the Attempt is `EXECUTION_UNKNOWN` or remains terminal superseded
- **AND** late output stores only digest, size, terminal metadata, and quarantine reason
- **AND** cannot reopen the Attempt or enter `VerificationReportV1` or Promotion

### Requirement: VerificationReportV1 binds exact evidence

Promotion eligibility SHALL require a frozen `VerificationReportV1` bound to the exact Candidate and `WorkflowExecutionPolicyBindingV1` digests, public acceptance results, opaque sealed-suite receipt, Anchor regression corpus, scientific checks, Builder/Verifier operation and isolation receipts, actual runtime/model/usage evidence, and residual risks.

#### Scenario: Candidate changes after verification

- **WHEN** any Candidate definition or execution-policy-binding input changes after verification
- **THEN** its digest no longer matches the `VerificationReportV1`
- **AND** promotion is rejected until independent verification is repeated

#### Scenario: Any contributing operation is unknown

- **WHEN** a Builder, Candidate, sealed-harness, Verifier, or regression operation is `OUTCOME_UNKNOWN`, `EXECUTION_UNKNOWN`, superseded, or digest-mismatched
- **THEN** no valid `VerificationReportV1` or promotion eligibility can be produced

### Requirement: Human decision is mandatory

No Candidate SHALL promote without a persisted human `PromotionDecisionV1` bound to the Candidate and `VerificationReportV1` digests.

The decision is a Ledger business fact only. It SHALL NOT contain, represent, or reactivate a Host authorization grant.

#### Scenario: Verification passes without human approval

- **WHEN** every automated check passes but no valid `PromotionDecisionV1` exists
- **THEN** the run remains `WAITING_PROMOTION`
- **AND** no Anchor capability is invoked

#### Scenario: Human rejects

- **WHEN** the human records a rejection
- **THEN** `record-promotion-decision` persists only the business decision and returns
- **AND** the deterministic Controller's ordinary approval-free saga obtains A's idempotent matching `REJECTED` Candidate-close receipt
- **AND** atomically records Run `REJECTED` and releases the Candidate lease
- **AND** the Anchor remains unchanged

#### Scenario: Human approves

- **WHEN** an approval decision is persisted
- **THEN** the Run enters `WAITING_PROMOTION_AUTHORIZATION`
- **AND** no Catalog write occurs until a separately confirmed `execute-promotion` action is active

### Requirement: Promotion uses a live owner-bound authorization

Promotion SHALL run only inside the UI-approved `workflow-evolution.execute-promotion` destructive handler for the same workspace and exact Promotion authorization purpose. The handler SHALL revalidate the current Run revision and every bound digest, journal each operation, and synchronously await the protected Create Loop prepare/finalize/abort actions with `inherit-current-action`.

Create Loop SHALL accept the system call only from the Host-derived Workflow Evolution lifecycle owner. It SHALL validate its own Candidate/base/`WorkflowExecutionPolicyBindingV1` receipts and preserve B's report/decision digests as controller attestation; it SHALL NOT claim to read B's Ledger.

The generic Broker SHALL register every inherited child before dispatch and prevent outer settlement until registered children are terminal. Provider commit entry SHALL atomically acquire a Host `enterCommit()` lease held through COMMIT/rollback and linearized against outer return/throw/cancel/revoke: revoke-first denies the lease with zero writes; commit-first forces outer settlement to wait. Late registration is rejected, and detached or fire-and-forget work cannot acquire a commit lease after revocation.

For each exact pre-pending `prepare-promotion` Operation, B SHALL own one Controller dispatch/cancel fence keyed by the exact workspace identity, Run ID, and B Operation ID. This fence serializes only B's prepare-dispatch admission and its competing Ledger cancellation transaction. While holding the dispatch side, B SHALL re-read the exact Ledger Run, Operation, and reservation revisions and digests, then invoke the prepare action only through the canonical public owner-bound invoker. The Host/Broker SHALL atomically register the inherited child on that one invocation path before handler dispatch. B SHALL retain its fence until either child registration fails before dispatch or the registered child reaches the canonical Broker-contained settlement boundary. A controller, reconciler, restart path, timer, command handler, adapter, or test SHALL NOT dispatch the prepare action outside that path.

The Host/Broker exclusively owns `LiveChildRegistrarV1`, the live token and process-epoch binding, inherited-child registration, the `enterCommit()` lease, provider-handler dispatch, revocation, child containment, and settlement. B SHALL NOT receive, share, implement, serialize, or hold any Host registrar, live token, commit lease, Host fence, or equivalent liveness primitive. In particular, B's Controller fence does not inspect or prove Host-private registrar state and does not replace or extend the canonical Broker child barrier.

The cancellation side MAY commit only while holding the mutually exclusive side of B's Controller fence. Inside that fence it SHALL re-read the exact Ledger facts and perform fresh owner/workspace-scoped `read-operation` and `read-pending-promotion` calls. Only an authoritative `NOT_FOUND` result, no pending Promotion, matching identities/digests, and an exact still-`INTENT_RECORDED` Operation permit one Ledger transaction to terminalize the prepare intent, record zero usage/query consumption, release its reservation exactly once, and freeze cancellation before releasing the fence. If that transaction rolls back, cancellation has not won. If the dispatch side registered the canonical child first, cancellation SHALL NOT commit abandonment or release the reservation; it waits for that child to settle and then reduces only current authoritative provider state. A registered child that settles with authoritative `NOT_FOUND` and no pending state leaves the exact Operation and reservation frozen so a later cancellation or prepare retry may contend again through a fresh B fence acquisition.

A process exit destroys the prior process's volatile B fence and Host scope. Restart SHALL first reconcile the exact owner/workspace-scoped A operation and pending Promotion, then establish a new B fence and re-read the Ledger before deciding whether to cancel or retry. Missing Host memory, registrar state, token, lease, handler state, or process epoch is never evidence that dispatch did not occur. Only authoritative `NOT_FOUND` plus no pending state permits the fresh fence acquisition to proceed toward cancellation or an exact retry.

#### Scenario: Persisted approval without a current grant

- **WHEN** Candidate/evidence/decision digests match but no approved destructive outer handler is active
- **THEN** every prepare/finalize/abort/rollback call is denied with zero Catalog writes

#### Scenario: Current authorized preparation

- **WHEN** Candidate/evidence/decision digests match, policy and regressions pass, the owner/workspace are exact, current authorization is valid, generation is current, and no pending Promotion exists
- **THEN** one prepare CAS creates a provisional successor and pending reservation
- **AND** the stable Anchor and service resolution remain unchanged

#### Scenario: Outer handler has settled

- **WHEN** a detached Promise, timer, or callback runs after the approved outer handler returned or threw
- **THEN** inherited authorization is invalid
- **AND** the protected Catalog call is denied

#### Scenario: Fire-and-forget child was dispatched

- **WHEN** outer code dispatches an inherited child without awaiting its Promise
- **THEN** the registered-child barrier still prevents outer settlement before the child is terminal
- **AND** a revoked scope cannot commit a protected Catalog mutation

#### Scenario: Cancel wins B's prepare-dispatch fence

- **WHEN** an eligible pre-pending prepare cancellation races a fresh dispatcher for the same exact B Operation
- **AND** the cancellation side acquires B's Controller fence first and, while holding it, proves owner-scoped `NOT_FOUND`, no pending Promotion, and matching Ledger identities and digests
- **THEN** its one Ledger transaction terminalizes the prepare intent, records zero usage/query consumption, releases the exact reservation once, and freezes cancellation before releasing the fence
- **AND** every later dispatcher re-reads that terminal result and makes zero owner-bound invocations, child registrations, and prepare-handler dispatches

#### Scenario: Registered prepare child wins before A handler

- **WHEN** B's dispatcher acquires its Controller fence and the canonical Broker registers the exact prepare child before provider-handler dispatch
- **AND** `cancel-run` attempts to acquire the cancellation side
- **THEN** cancellation cannot commit abandonment or release the reservation while the registered child is unsettled
- **AND** B retains its fence through canonical child settlement, after which cancellation reduces only the current authoritative provider operation and pending state
- **AND** the Host/Broker alone governs handler dispatch, `enterCommit()`, revocation, containment, and settlement

#### Scenario: Agent calls Anchor storage directly

- **WHEN** Builder, Verifier, Teacher, UI, or another Agent attempts to write the Anchor pointer or Catalog database directly
- **THEN** the operation is unavailable or denied

#### Scenario: Another system domain impersonates the controller

- **WHEN** a different domain invokes a protected Catalog action or supplies a fake controller ID in payload
- **THEN** the Host-derived owner mismatch is rejected with zero writes

### Requirement: Provisional promotion must replay before activation

The Controller SHALL replay the original frozen `ReplayInputEnvelopeV1` against the provisional Release through controlled evaluation while stable service continues resolving the old Anchor.

A matching pending reservation SHALL never expire automatically. Its replay `ComputeReservationV1` is created before preparation and frozen into the replay request and pending digest. Replay operation `SUCCEEDED` plus business acceptance `PASS` permits finalization under a live Promotion scope or enters `WAITING_FINALIZE_AUTHORIZATION`. From that wait, a fresh Promotion-purpose UI confirmation may instead explicitly abandon the passed provisional result and abort with a matching receipt and reason. Operation `SUCCEEDED` plus acceptance `FAIL`, authoritative operation `FAILED`, or contained `CANCELLED` permits abort under a live scope or enters `WAITING_ABORT_AUTHORIZATION`. `IN_PROGRESS` or `OUTCOME_UNKNOWN` enters/stays `RECOVERY_REQUIRED` and retains the full reservation. Replay `NOT_FOUND` enters `WAITING_PROMOTION_AUTHORIZATION` with `PromotionContinuationPhaseV1=REPLAY_OR_ABORT`, leaves the reservation `HELD_PENDING_REPLAY`, and permits only a fresh `execute-promotion` confirmation to dispatch the exact approval-free replay request or explicitly authorize abort. The Host must derive `LIVE_APPROVED_OUTER_CONTROLLER` from that current invocation before replay dispatch. Foreign/mismatched pending state is always `RECOVERY_REQUIRED`.

Before any pending Promotion exists, a confirmed `cancel-run` MAY safely abandon `HELD_PREPARE_RETRY` only when it holds the cancellation side of B's Controller fence, the exact prepare Operation remains `INTENT_RECORDED`, and fresh owner/workspace-scoped operation and pending reads authoritatively prove `NOT_FOUND` and no pending Promotion. While still holding that B-owned fence, one Ledger transaction SHALL terminalize the prepare intent, record zero usage/query consumption, release the reservation exactly once, and enter the ordinary `CANCELLING` protocol. That transaction relies only on the mutually exclusive B dispatch path and authoritative public reads; it SHALL NOT inspect, acquire, or make claims about a Host registrar, live token, lease, handler handoff, or other Host-private state. A staged Candidate still requires the matching `close-candidate(CANCELLED)` receipt before the Run becomes `CANCELLED` or its lease is released. Generic cancellation SHALL NOT write `ABORTED`. If the dispatch side already registered a child, pending state exists, or prepare/replay/finalize/abort is `IN_PROGRESS`, `OUTCOME_UNKNOWN`, mismatched, or otherwise not authoritatively contained, `cancel-run` SHALL make zero abandonment/reservation writes, wait for canonical child settlement when one exists, and retain every pending/held reservation until authoritative reconciliation permits the next state.

#### Scenario: Replay passes

- **WHEN** replay satisfies the original `RequirementSpecV1` acceptance
- **THEN** a currently authorized handler invokes finalization with the prepare and replay receipts, or the Run waits in `WAITING_FINALIZE_AUTHORIZATION`
- **AND** one CAS advances the stable Anchor generation to the exact provisional Catalog
- **AND** the run completes with prepare, replay, and finalization receipts

#### Scenario: Replay fails

- **WHEN** replay fails acceptance or a prohibited side effect occurs
- **THEN** a currently authorized handler aborts only the pending reservation, or the Run waits in `WAITING_ABORT_AUTHORIZATION`
- **AND** records replay failure and abort receipt
- **AND** records Candidate `ABORTED` in the same A-owned transaction
- **AND** the old stable Anchor remains current

#### Scenario: Process stops before continuation

- **WHEN** preparation, replay, finalization, or abort may have occurred but its receipt was not stored in the Ledger
- **THEN** restart performs read-only operation reconciliation
- **AND** any uncommitted destructive continuation waits for a fresh UI confirmation
- **AND** the provisional Catalog is never used by stable service

#### Scenario: Replay remains unknown

- **WHEN** replay lookup is `IN_PROGRESS` or `OUTCOME_UNKNOWN`
- **THEN** the Run remains `RECOVERY_REQUIRED`
- **AND** no background finalize, abort, cancel-run, or duplicate replay occurs

#### Scenario: Pre-pending prepare retry is safely cancelled

- **WHEN** the replay reservation is `HELD_PREPARE_RETRY`, no pending Promotion exists, and fresh owner/workspace-scoped reads under B's Controller fence prove the exact `INTENT_RECORDED` prepare Operation was never accepted
- **AND** the cancellation side acquired B's fence before any dispatcher invoked the canonical owner-bound path
- **THEN** one Ledger transaction terminalizes the prepare intent, records zero usage/query consumption, freezes cancellation, and releases its reservation exactly once
- **AND** the Run follows the ordinary containment and `close-candidate(CANCELLED)` protocol
- **AND** no replay, generic abort, or direct Candidate disposition is dispatched

#### Scenario: Promotion safety work cannot be cancelled

- **WHEN** a canonical prepare child is registered but unsettled, pending Promotion exists, or any prepare/replay/finalize/abort outcome is `IN_PROGRESS`, `OUTCOME_UNKNOWN`, or mismatched
- **THEN** `cancel-run` makes zero abandonment/reservation writes, retains pending state, Candidate disposition, lease, and held reservation, and waits for canonical child settlement when applicable
- **AND** authoritative reconciliation returns `NON_CANCELLABLE_SAFETY_PHASE` for every still-pending, in-progress, unknown, or mismatched result
- **AND** only authoritative prepare `NOT_FOUND` plus no pending Promotion may later contend again through B's Controller fence

#### Scenario: Prepare dispatch/cancel safety survives kill boundaries

- **WHEN** a real process is killed at each boundary before and after the cancel-side Ledger COMMIT, after canonical prepare-child registration but before provider-handler dispatch, and after handler dispatch but before A claims the operation
- **THEN** restart with the same Ledger and Catalog first performs exact owner/workspace-scoped operation and pending reads, then establishes a new B Controller fence and re-reads the Ledger before any cancel or retry decision
- **AND** a cancel-first COMMIT makes every later dispatcher observe the terminalized intent and produce zero child registrations and prepare-handler dispatches
- **AND** a pre-COMMIT cancel kill produces no fabricated cancellation or reservation release
- **AND** a child-first kill is never classified from missing Host registrar, token, lease, handler, or process-epoch memory: exact owner-scoped operation and pending reads determine `NOT_FOUND`, in-progress, terminal, or unknown recovery
- **AND** every tested interleaving has no duplicate protected prepare mutation and exactly one retained or released replay reservation according to authoritative reconciliation

#### Scenario: Human abandons after replay passed

- **WHEN** a terminal passed replay is pending and the user gives a fresh Promotion-purpose confirmation with an abandonment reason
- **THEN** the Controller invokes the one authorized abort continuation
- **AND** the old Anchor remains stable and the Candidate becomes `ABORTED`

### Requirement: Rollback is bounded and auditable

Rollback of a later finalized-Anchor regression SHALL run in a `ROLLBACK_RECOVERY` run and restore only the immediately previous stable mapping referenced by the matching finalized PromotionReceipt. The sole `workflow-evolution.open-rollback-recovery` UI action SHALL idempotently create or return the one Run for `(workspaceId, promotionReceiptId, failedGeneration)` directly in `WAITING_ROLLBACK_AUTHORIZATION`, with no Candidate lease or Catalog call. A partial unique constraint SHALL permit at most one non-terminal recovery Run for that tuple. A tuple already proven `ROLLED_BACK` or closed by an authoritative permanent `ROLLBACK_FAILED` SHALL never reopen; only a prior cleanly `CANCELLED` recovery with no ambiguous/committed rollback may be reopened by a distinct fresh confirmation. Rollback SHALL require no pending Promotion, the exact current generation, owner-bound controller identity, and a fresh UI-approved rollback-purpose `execute-rollback` action.

#### Scenario: Valid rollback

- **WHEN** a finalized Anchor later requires recovery
- **AND** the finalized PromotionReceipt and current generation match
- **THEN** one canonical Catalog write creates a compensating Catalog revision whose parent is the current failed Catalog and whose mapping copies the receipt's immediate predecessor
- **AND** advances generation with an immutable rollback receipt
- **AND** preserves the historical Candidate's `PROMOTED` disposition

#### Scenario: Arbitrary rollback target

- **WHEN** a caller supplies an unrelated Catalog revision, stale generation, or mismatched promotion receipt
- **THEN** rollback fails with zero writes

#### Scenario: Pending Promotion blocks rollback

- **WHEN** any pending Promotion exists
- **THEN** rollback fails with zero Catalog writes
- **AND** the recovery Run cannot report `ROLLED_BACK`

#### Scenario: Historical approval is reused

- **WHEN** the rollback recovery has a prior `PromotionDecisionV1` or old invocation ID but no fresh current confirmation
- **THEN** rollback remains `WAITING_ROLLBACK_AUTHORIZATION`
- **AND** no Catalog call is dispatched

#### Scenario: Rollback fails or is unknown

- **WHEN** rollback is authoritatively `NOT_FOUND`, authorization-required, retryable zero-write, or blocked by a pending Promotion with zero Catalog mutation
- **THEN** the recovery Run returns to `WAITING_ROLLBACK_AUTHORIZATION`
- **AND** no background retry occurs
- **WHEN** rollback has a permanent validation/provider failure receipt with proven zero write
- **THEN** the recovery Run enters `ROLLBACK_FAILED`
- **WHEN** rollback outcome cannot be proven
- **THEN** the recovery run enters `RECOVERY_REQUIRED`
- **AND** neither case is reported as `ROLLED_BACK` or automatically retried

### Requirement: Non-Workflow gaps never create a Candidate

The governance path SHALL stage Candidates only for `WORKFLOW_DELTA` and `NEW_WORKFLOW`.

#### Scenario: Platform capability is missing

- **WHEN** the GapKind is `PLATFORM_CAPABILITY_GAP`
- **THEN** Workflow Evolution records a typed platform-capability `ChangeSpecV1` variant with task/reference
- **AND** waits for the capability to be developed and registered before reevaluating the original requirement

#### Scenario: Resource or policy gap

- **WHEN** the GapKind is `RESOURCE_GAP` or `POLICY_BLOCKED`
- **THEN** the run waits or terminates according to policy
- **AND** does not stage or privately execute a Workflow Candidate
