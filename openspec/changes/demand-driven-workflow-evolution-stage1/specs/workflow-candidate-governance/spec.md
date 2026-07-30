# Workflow Candidate governance

## Requirements

### Requirement: Candidate policy is versioned and fail closed

Every Candidate SHALL be validated against a frozen policy version before staging and before each private execution.

The initial policy SHALL allow only the explicitly approved Stage1 nodes, models, runtimes, tools, secret references, network/file/env scopes, budgets, sequential Loop bounds, and child-agent bounds. Every undeclared capability SHALL be denied.

#### Scenario: Allowed Candidate

- **WHEN** a Candidate uses only registered and policy-allowed atoms within every bound
- **THEN** validation produces evidence bound to the policy version and Candidate digest

#### Scenario: Arbitrary code or unknown capability

- **WHEN** a Candidate contains Code, Bash/Python, Custom, unapproved HTTP writes, an unknown model/tool/secret, a parallel Loop, or an unbounded Agent Loop
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

- **WHEN** a private Candidate execution crashes or times out
- **THEN** the failure receipt is preserved
- **AND** stable Anchor service remains available

### Requirement: Repair is bounded and cannot weaken the contract

Builder SHALL receive frozen Requirement/Gap/Change specs, public tests, and Candidate failure evidence, and SHALL perform no more than the frozen 2–3 repair attempts.

#### Scenario: Public test fails

- **WHEN** a Candidate fails a repairable public acceptance case
- **THEN** the controller records a minimal counterexample
- **AND** may start the next bounded attempt without changing acceptance criteria

#### Scenario: Repair limit reached

- **WHEN** the maximum attempts are exhausted
- **THEN** the run enters a durable terminal or human-decision state
- **AND** no unbounded loop continues

### Requirement: Builder and Verifier are independent

Verifier SHALL run as a sibling principal created by the Controller and SHALL NOT be a Builder child.

#### Scenario: Builder requests sealed tests

- **WHEN** Builder or a Builder child requests sealed-test content
- **THEN** access is denied and audited

#### Scenario: Verifier attempts mutation

- **WHEN** Verifier requests Candidate, frozen-document, Ledger-policy, or Anchor mutation
- **THEN** access is denied and audited

### Requirement: VerificationReport binds exact evidence

Promotion eligibility SHALL require a frozen VerificationReport bound to the exact Candidate digest, policy digest, public acceptance results, sealed-test results, Anchor regression corpus, scientific checks, and residual risks.

#### Scenario: Candidate changes after verification

- **WHEN** any Candidate definition or policy input changes after verification
- **THEN** its digest no longer matches the VerificationReport
- **AND** promotion is rejected until independent verification is repeated

### Requirement: Human decision is mandatory

No Candidate SHALL promote without a persisted human PromotionDecision bound to the Candidate and VerificationReport digests.

#### Scenario: Verification passes without human approval

- **WHEN** every automated check passes but no valid PromotionDecision exists
- **THEN** the run remains `WAITING_PROMOTION`
- **AND** no Anchor capability is invoked

#### Scenario: Human rejects

- **WHEN** the human records a rejection
- **THEN** the controller records `REJECTED` or an explicit repair request
- **AND** the Anchor remains unchanged

### Requirement: Promotion uses one authorized CAS

Promotion SHALL use the Create Loop compare-and-swap capability with exact expected generation and current Host authorization.

#### Scenario: All gates pass

- **WHEN** Candidate/evidence/decision digests match, policy and regressions pass, the current authorization is valid, and generation is current
- **THEN** one CAS creates the successor Catalog and advances the Anchor generation

#### Scenario: Agent calls Anchor storage directly

- **WHEN** Builder, Verifier, Teacher, UI, or another Agent attempts to write the Anchor pointer or Catalog database directly
- **THEN** the operation is unavailable or denied

### Requirement: New Anchor must replay the original input

The Controller SHALL replay the original frozen input against the newly promoted Anchor before completing the Evolution run.

#### Scenario: Replay passes

- **WHEN** replay satisfies the original RequirementSpec acceptance
- **THEN** the run completes with the pinned replay receipt
- **AND** the new Anchor remains current

#### Scenario: Replay fails

- **WHEN** replay fails acceptance or a prohibited side effect occurs
- **THEN** the Controller invokes the bounded rollback operation
- **AND** records replay failure, promotion receipt, and rollback receipt

### Requirement: Rollback is bounded and auditable

Rollback SHALL restore only the immediately previous Anchor referenced by the matching promotion receipt and SHALL require the exact current generation.

#### Scenario: Valid rollback

- **WHEN** replay of a just-promoted Anchor fails
- **AND** the promotion receipt and current generation match
- **THEN** one canonical Catalog write restores the previous Catalog
- **AND** advances generation with an immutable rollback receipt

#### Scenario: Arbitrary rollback target

- **WHEN** a caller supplies an unrelated Catalog revision, stale generation, or mismatched promotion receipt
- **THEN** rollback fails with zero writes

### Requirement: Non-Workflow gaps never create a Candidate

The governance path SHALL stage Candidates only for `WORKFLOW_DELTA` and `NEW_WORKFLOW`.

#### Scenario: Platform capability is missing

- **WHEN** the GapKind is `PLATFORM_CAPABILITY_GAP`
- **THEN** Workflow Evolution records a PlatformCapabilitySpec/task reference
- **AND** waits for the capability to be developed and registered before reevaluating the original requirement

#### Scenario: Resource or policy gap

- **WHEN** the GapKind is `RESOURCE_GAP` or `POLICY_BLOCKED`
- **THEN** the run waits or terminates according to policy
- **AND** does not stage or privately execute a Workflow Candidate
