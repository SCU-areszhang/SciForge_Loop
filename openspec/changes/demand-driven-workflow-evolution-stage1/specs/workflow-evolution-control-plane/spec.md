# Workflow Evolution control plane

## Requirements

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

### Requirement: Ledger is the durable state truth

Workflow Evolution SHALL store run state, revisions, document revisions/digests, gates, attempts, command intents, receipts, approvals, decisions, and audit events in its package-owned SQLite Ledger.

#### Scenario: Application restarts while waiting

- **WHEN** a run is in `WAITING_HUMAN` or `WAITING_RESOURCE`
- **AND** the application and package runtime restart
- **THEN** the same run revision, open gate, document digest, and audit history are recovered
- **AND** the controller does not infer state from Markdown

#### Scenario: Transaction fails

- **WHEN** a state transition transaction fails before commit
- **THEN** no partial document, gate, event, or state update becomes visible

### Requirement: State transitions are explicit and fail closed

Every Evolution state transition SHALL be validated against a versioned legal-transition table and an expected run revision.

#### Scenario: Legal transition

- **WHEN** a command supplies the current run revision and a legal transition
- **THEN** state, run revision, related records, and audit event commit atomically

#### Scenario: Illegal or stale transition

- **WHEN** a command requests an illegal transition or supplies a stale run revision
- **THEN** the command fails
- **AND** the Ledger remains unchanged

### Requirement: Structured three-document contract

Workflow Evolution SHALL store append-only structured revisions of `RequirementSpec`, `ChangeSpec`, and `VerificationReport`.

Each revision SHALL include schema version, owner, sequence, frozen state, content digest, and creation metadata.

#### Scenario: Clarification changes a requirement

- **WHEN** a human clarifies an AMBIGUOUS requirement
- **THEN** the controller appends a new RequirementSpec revision
- **AND** retains the previous frozen revision

#### Scenario: Markdown is edited

- **WHEN** a human-readable Markdown projection is deleted or changed outside the controller
- **THEN** the Ledger state and structured document digest remain unchanged
- **AND** the projection can be regenerated deterministically

### Requirement: Coverage has four evidence-based outcomes

Coverage SHALL be exactly `COVERED`, `AMBIGUOUS`, `PARTIAL`, or `NOT_COVERED`.

#### Scenario: COVERED

- **WHEN** the frozen Anchor Release actually runs
- **AND** every MUST acceptance passes with no prohibited side effect
- **THEN** the controller records `COVERED`
- **AND** completes with the release-pinned execution receipt
- **AND** creates no Candidate

#### Scenario: AMBIGUOUS

- **WHEN** intent, acceptance, or constraints cannot form one executable contract
- **THEN** the controller persists `WAITING_HUMAN`
- **AND** resumes only after a new RequirementSpec revision is committed

#### Scenario: PARTIAL

- **WHEN** a close Release exists but a required acceptance cannot be met
- **THEN** the controller records a `WORKFLOW_DELTA` Gap bound to that exact Release

#### Scenario: NOT_COVERED

- **WHEN** no Catalog Release covers the requirement
- **THEN** the controller performs the Expressibility Check before selecting a GapKind

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

### Requirement: Human and resource gates are durable

Long-lived clarification, resource, and promotion waits SHALL be Ledger records, not Create Loop in-memory approval waiters.

#### Scenario: Resolve a clarification gate

- **WHEN** a user resolves an open clarification gate with the current run revision
- **THEN** one transaction closes the gate, appends the RequirementSpec revision, advances state/revision, and appends an audit event

#### Scenario: Resolve the same gate twice

- **WHEN** a caller repeats resolution of a closed gate
- **THEN** the operation returns the original idempotent result or fails as already resolved
- **AND** never creates two revisions

### Requirement: Stage1 Teacher does not block

Workflow Evolution SHALL define `TeacherEvidencePort` and install a Stage1 adapter whose status is `BYPASSED`.

#### Scenario: Workflow evidence requested

- **WHEN** a Workflow Gap requests Teacher evidence in Stage1
- **THEN** the adapter returns a stable job reference and `BYPASSED`
- **AND** the controller records the result and continues

#### Scenario: Teacher attempts promotion

- **WHEN** any Teacher result or adapter requests an Anchor mutation
- **THEN** the request is rejected
- **AND** Teacher receives no promotion authority

### Requirement: Cross-package commands recover after crashes

Workflow Evolution SHALL persist a command intent before invoking a mutating Catalog capability and persist the resulting receipt before advancing its state.

#### Scenario: Catalog committed before Ledger receipt

- **WHEN** the process stops after Create Loop commits a mutation but before Workflow Evolution stores the receipt
- **THEN** restart reconciliation uses the durable idempotency key and read capabilities
- **AND** stores the one existing result without repeating the mutation

#### Scenario: Catalog did not commit

- **WHEN** the process stops before the Catalog mutation commits
- **THEN** restart reconciliation may retry the same idempotent request
- **AND** reaches at most one committed Catalog result

### Requirement: Product UI is a capability client

Workflow Evolution UI SHALL be added only after backend acceptance and SHALL read and mutate state only through package-owned capabilities.

#### Scenario: UI displays a run

- **WHEN** the user opens an Evolution run
- **THEN** the UI renders the capability snapshot and document projections
- **AND** does not read SQLite, parse Markdown for state, or maintain a second state machine
