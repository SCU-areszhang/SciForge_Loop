# Workflow Catalog lifecycle

## Requirements

### Requirement: Immutable Workflow releases

Create Loop SHALL represent every serviceable Workflow as an immutable, workspace-scoped `WorkflowRelease` containing a strict canonical definition and definition digest.

The canonical definition SHALL contain all behavior-affecting graph, prompt, model/runtime binding, tool-reference, policy, and budget-reference fields. It SHALL NOT contain run history, last status/message, service enablement, editor timestamps, database paths, runtime objects, or secret values.

#### Scenario: Freeze a valid definition

- **WHEN** a policy-valid Workflow draft is frozen
- **THEN** Create Loop creates one append-only Release with an opaque release ID
- **AND** stores the canonical definition and SHA-256 definition digest
- **AND** repeated reads return the same value and digest

#### Scenario: Reject non-canonical content

- **WHEN** a proposed definition contains unknown fields, run history, non-finite values, or a secret value
- **THEN** freezing fails closed
- **AND** no Release, Candidate, Catalog revision, or Anchor change is committed

### Requirement: Deterministic digests

Create Loop SHALL calculate definition and Catalog digests using the frozen schema version, UTF-8 canonical JSON, and lowercase SHA-256 hexadecimal.

#### Scenario: Equivalent definition across restarts

- **WHEN** the same strict definition is cloned, serialized, reloaded, and hashed after runtime restart
- **THEN** every calculation produces the same definition digest

#### Scenario: Behavior-affecting change

- **WHEN** any graph, prompt, model/runtime binding, tool reference, policy, or budget reference changes
- **THEN** the definition digest changes

### Requirement: Append-only Catalog revisions

Create Loop SHALL represent a Catalog revision as an immutable mapping from logical Workflow ID to Release ID, with an optional parent revision and a Catalog digest.

#### Scenario: Create a successor Catalog

- **WHEN** a valid Candidate is promoted against the current Anchor
- **THEN** Create Loop creates a new Catalog revision whose parent is the previous Anchor revision
- **AND** leaves the parent revision and every prior Release unchanged

#### Scenario: Attempt to overwrite history

- **WHEN** a caller attempts to replace an existing Release or Catalog revision under an existing ID
- **THEN** the operation fails
- **AND** the stored object remains byte-for-byte unchanged

### Requirement: Independent Anchor generation

Create Loop SHALL store an `AnchorPointer` whose generation changes only through the canonical Catalog compare-and-swap write.

The existing mutable settings revision SHALL NOT be used as the Anchor generation.

#### Scenario: Ordinary execution changes history

- **WHEN** a draft preview, Anchor run, Candidate run, schedule update, or editor save changes mutable runtime state
- **THEN** the Anchor generation remains unchanged

#### Scenario: Successful promotion

- **WHEN** an authorized promotion supplies the exact current generation and valid bound evidence
- **THEN** the Anchor changes atomically to the successor Catalog
- **AND** generation increases monotonically

### Requirement: Stale promotion fails atomically

Catalog promotion SHALL require `expectedGeneration` and SHALL perform a zero-write failure when the current generation differs.

#### Scenario: Two Candidates share one base

- **WHEN** two Candidates were created from generation N
- **AND** the first Candidate successfully promotes to generation N+1
- **THEN** promotion of the second Candidate with expected generation N fails as stale
- **AND** no new Release, Catalog revision, pointer change, or promotion receipt is committed for the stale request

### Requirement: Candidate isolation

A staged Candidate SHALL bind the exact base Catalog revision, base generation, proposal mode, proposed Release digest, request/change digest, and optional base Release.

#### Scenario: Extend an existing Workflow

- **WHEN** the proposal mode is `EXTEND_EXISTING`
- **THEN** the Candidate identifies the exact existing Workflow and base Release
- **AND** does not mutate that Release or the Anchor

#### Scenario: Create a new Workflow

- **WHEN** the proposal mode is `CREATE_NEW`
- **THEN** the Candidate has no base Release
- **AND** uses a new logical Workflow ID

#### Scenario: Candidate fails validation or execution

- **WHEN** staging, policy validation, private execution, or repair fails
- **THEN** the current Anchor remains readable and serviceable
- **AND** no stable Catalog mapping changes

### Requirement: Release-pinned execution

Stable service and promotion evidence SHALL execute an exact `releaseId + definitionDigest`, not resolve mutable Workflow state by logical ID during the run.

#### Scenario: Anchor executes

- **WHEN** the controller requests the current Anchor Release
- **THEN** Create Loop verifies the stored digest before execution
- **AND** the execution receipt identifies the same Release and digest

#### Scenario: Definition changes after run starts

- **WHEN** a draft or later Catalog revision changes while a pinned run is active
- **THEN** the active run continues using its frozen definition
- **AND** its receipt remains bound to that frozen digest

### Requirement: One Workflow execution engine

Draft preview, Anchor execution, and isolated Candidate execution SHALL use one package-owned graph execution engine with explicit call modes and policies.

#### Scenario: Candidate requires isolation

- **WHEN** a Candidate is privately executed
- **THEN** the canonical engine receives the Candidate's frozen definition and isolated policy/workspace
- **AND** no copied Candidate-specific runtime implementation is selected

#### Scenario: Production caller migration completes

- **WHEN** renderer, agent, schedule, and webhook stable callers use release-pinned execution
- **THEN** the superseded mutable production action and every alias, forwarder, duplicate registration, and fallback are removed
- **AND** draft preview remains explicitly non-service evidence

### Requirement: Durable mutation idempotency

Every mutating Catalog capability SHALL persist an idempotency key, request digest, and immutable result receipt.

#### Scenario: Exact retry after process failure

- **WHEN** a caller repeats a committed request with the same idempotency key and payload
- **THEN** Create Loop returns the original result receipt
- **AND** does not repeat the mutation

#### Scenario: Key reused with different payload

- **WHEN** a caller reuses an idempotency key with a different request digest
- **THEN** the request fails closed
- **AND** no Catalog state changes

### Requirement: Catalog writes have one authority

All Catalog reads and writes used by UI, system, and agent callers SHALL use package-owned Create Loop Capability Broker definitions.

#### Scenario: Workflow Evolution requests a mutation

- **WHEN** Workflow Evolution stages or promotes a Candidate
- **THEN** it invokes the public Create Loop capability contract through the system capability invoker
- **AND** it does not import the Catalog store/service/runtime or read the database directly

#### Scenario: Add the capability surface

- **WHEN** the Catalog capability set is installed
- **THEN** it is contributed by the Create Loop manifest/entrypoint
- **AND** no domain-specific IPC, preload method, MCP business handler, Host feature map, or central domain switch is added
