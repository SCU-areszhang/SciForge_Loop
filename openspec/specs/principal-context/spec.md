# principal-context Specification

## Purpose
Defines a generic, Host-asserted Principal context with explicit assurance and immutable Agent-turn attribution so domains can consume identity without trusting renderer or Agent claims.
## Requirements
### Requirement: Principal is asserted only by the Identity provider
The Host SHALL obtain the current Principal from the single active generic Principal provider contribution. Renderer code, Agents, capability inputs, and other domains SHALL NOT declare, replace, or elevate the Principal.

#### Scenario: Identity provider supplies a local Principal
- **WHEN** a Local Account is selected and Identity is available
- **THEN** the provider exposes a Principal containing its userId, `local-selection` assurance, stable deviceId, and current identityVersion

#### Scenario: No account is selected
- **WHEN** no Local Account is selected or Identity is unavailable
- **THEN** the provider exposes no current Principal

#### Scenario: Reject duplicate Principal providers
- **WHEN** application composition resolves more than one active Principal provider
- **THEN** startup fails the Principal contribution as ambiguous rather than choosing by domain ID or registration order

### Requirement: Principal Assurance is explicit and non-escalating
V1 SHALL emit only `local-selection` assurance. Future cloud-authorized capabilities SHALL require `cloud-authenticated` and SHALL reject a missing Principal or `local-selection`; username selection, installation identity, renderer identity, Agent identity, and provider login SHALL NOT elevate assurance.

#### Scenario: Cloud capability receives local assurance
- **WHEN** a future cloud Project, OpenContent, remote Task, or other remote-authority capability receives a Principal with `local-selection`
- **THEN** it rejects the operation as requiring cloud authentication

#### Scenario: Caller attempts assurance elevation
- **WHEN** a renderer, Agent, or capability payload supplies a userId or stronger assurance
- **THEN** the Host ignores or rejects the supplied identity and uses only the provider snapshot

### Requirement: Capability caller receives Host-injected Principal
After applying the same trusted-sender policy used for ordinary application IPC, the main process SHALL inject the current Principal snapshot into capability caller context. The injected context SHALL contain no credentials, account list, username, or mutable Identity store handle.

#### Scenario: Trusted renderer invokes a capability
- **WHEN** a trusted renderer invokes the capability broker while a Local Account is selected
- **THEN** the broker receives the Host-injected Principal snapshot associated with that invocation

#### Scenario: Signed-out renderer invokes a local capability
- **WHEN** a trusted renderer invokes a local capability with no selected account
- **THEN** the broker receives no Principal and the local capability proceeds or rejects according to its own declared identity requirement

#### Scenario: Untrusted sender invokes capability IPC
- **WHEN** a renderer sender fails the shared trusted-sender policy
- **THEN** capability IPC rejects the request before readiness, discovery, binding, invocation, events, or Identity processing

### Requirement: Agent turns retain immutable Principal attribution
At Agent-turn start, the Host SHALL snapshot `userId`, `assurance`, `deviceId`, and `identityVersion` into the turn identity. Account selection, rename, exit, database failure, or later Principal changes SHALL NOT rebind or rewrite an in-flight turn; only subsequent turns receive the new snapshot.

#### Scenario: Switch account during a running turn
- **WHEN** a turn started for user A and Human UI selects user B before the turn completes
- **THEN** the running turn's messages, results, and attribution retain user A's Principal snapshot and a new turn receives user B's snapshot

#### Scenario: Exit account during a running turn
- **WHEN** Human UI exits the selected account while a turn is running
- **THEN** the turn retains its start snapshot and later turns start without a Principal

#### Scenario: Rename account during a running turn
- **WHEN** the current Local Account is renamed while a turn is running
- **THEN** the turn retains the immutable userId and identityVersion snapshot without being rebound by the display-name change

### Requirement: Identity version orders Principal state
The Identity provider SHALL expose a monotonically increasing identityVersion for committed identity state changes. Principal snapshots and Principal-change notifications SHALL use this version so consumers can reject stale or reordered state without using timestamps or usernames as identity.

#### Scenario: Commit a Principal-changing operation
- **WHEN** trusted Human UI creates and selects, selects, renames the selected account, exits, or resets identity state
- **THEN** the provider commits the new state and publishes a Principal snapshot or absence with a higher identityVersion

#### Scenario: Receive stale Principal notification
- **WHEN** a consumer has observed identityVersion N and later receives a notification below N
- **THEN** the consumer ignores the stale notification

### Requirement: Principal subscription follows generic lifecycle
The generic Principal provider SHALL support current snapshot and change subscription through Host contracts, and subscription cleanup SHALL be tied to the consuming lifecycle. Identity SHALL NOT add a second Principal registry, identity-specific preload IPC, MCP surface, or renderer-owned store as another authority.

#### Scenario: Subscribe to Principal changes
- **WHEN** an authorized Host consumer subscribes and Human UI changes account selection
- **THEN** the consumer receives the committed versioned Principal change exactly through the canonical provider path

#### Scenario: Dispose a Principal subscription
- **WHEN** the consuming lifecycle ends
- **THEN** the subscription is released and receives no later Identity events

### Requirement: Cloud identity migration is explicit
A future cloud adapter SHALL obtain a canonical cloud userId only after cloud authentication, explicitly associate the selected local userId as a migration alias, and migrate owned references transactionally. It SHALL NOT accept a client-generated local userId, username, or email match as proof of cloud identity.

#### Scenario: Migrate a selected local identity
- **WHEN** a future user completes cloud authentication and confirms migration of the selected Local Account
- **THEN** the cloud-issued canonical userId becomes authoritative and the former local userId remains only as a traceable migration alias

#### Scenario: Decline or fail migration
- **WHEN** cloud authentication, user confirmation, or transactional reference migration fails
- **THEN** the system preserves the local identity and does not partially claim or rewrite it as a cloud user
