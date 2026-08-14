## Purpose

Provides a persistent, non-blocking local user identity entry for attribution and future ownership references without claiming authentication, local data isolation, or cloud authority.

## ADDED Requirements

### Requirement: Local Accounts have stable opaque identity
The system SHALL assign every Local Account a randomly generated, immutable UUID `userId`. The system SHALL treat `username` as a mutable display name rather than an identity key or authentication factor.

#### Scenario: Create a Local Account
- **WHEN** trusted Human UI confirms creation with a valid username
- **THEN** the system persists a new Local Account with a unique UUID userId and selects it as the current account

#### Scenario: Rename without changing identity
- **WHEN** trusted Human UI renames an existing Local Account to an available valid username
- **THEN** the system updates the username while preserving the account's userId

### Requirement: Usernames obey installation-local rules
The system SHALL trim leading and trailing whitespace, compare usernames case-insensitively within the current SciForge installation, accept Chinese and other Unicode letters, numbers, internal spaces, hyphens, and underscores, and require a normalized length from 1 through 64 characters. The system SHALL reject duplicate or invalid normalized usernames without changing identity state.

#### Scenario: Reject case-insensitive duplicate
- **WHEN** an account named `Alice` exists and Human UI tries to create or rename another account to ` alice `
- **THEN** the system rejects the operation as a username conflict

#### Scenario: Accept multilingual username
- **WHEN** Human UI submits a unique username containing valid Chinese characters, numbers, spaces, hyphens, or underscores within the length limit
- **THEN** the system accepts its trimmed form

#### Scenario: Reject invalid username
- **WHEN** Human UI submits an empty, overlength, control-character-bearing, or otherwise disallowed username
- **THEN** the system returns a validation error and leaves all accounts unchanged

### Requirement: Local Identity Session is restored and exited explicitly
The system SHALL persist the currently selected Local Account, restore it automatically on restart, and expose no current Principal after Human UI exits it. Exiting SHALL clear only the selection and SHALL NOT delete the account or any local application data.

#### Scenario: Restore selected account
- **WHEN** SciForge restarts after a Local Account was selected and not exited
- **THEN** the system restores that account as the current Local Identity Session with `local-selection` assurance

#### Scenario: Exit current account
- **WHEN** trusted Human UI exits the current Local Account
- **THEN** the system clears the current Principal while preserving the account for future selection

#### Scenario: Continue without an account
- **WHEN** no Local Account is selected
- **THEN** chat, Workspaces, models, tools, settings, and other existing local features remain usable

### Requirement: Account mutations are Human-only
The system SHALL allow only trusted Human UI callers to list, create, select, rename, or exit Local Accounts. Agents, renderer-supplied identity payloads, and other domains SHALL NOT create, select, rename, exit, enumerate, or override Local Accounts.

#### Scenario: Trusted Human UI changes selection
- **WHEN** a trusted Human UI caller selects an existing Local Account
- **THEN** the system updates the current Local Identity Session and publishes the resulting Principal change

#### Scenario: Agent attempts account mutation
- **WHEN** an Agent caller attempts to invoke an account mutation or account-list operation
- **THEN** the system rejects the call without changing identity state or disclosing the account list

#### Scenario: Untrusted renderer attempts account mutation
- **WHEN** an account mutation arrives from a renderer sender that fails the shared trusted-sender policy
- **THEN** the system rejects the call before invoking the Identity domain

### Requirement: Local Accounts do not partition local application data
The system SHALL treat Local Accounts as attribution identities rather than local data tenants. Switching or exiting accounts SHALL NOT hide, reassign, move, copy, upload, or change access to chats, Workspaces, files, model settings, API keys, tool configuration, or other installation-scoped data.

#### Scenario: Switch accounts with an open Workspace
- **WHEN** Human UI switches from one Local Account to another while a Workspace is open
- **THEN** the Workspace remains open and unchanged while only the current Principal changes

#### Scenario: Explain local isolation boundary
- **WHEN** the account UI presents Local Account selection or switching
- **THEN** it clearly states that Local Accounts do not isolate local data and separate operating-system accounts are required for local privacy isolation

### Requirement: Account entry is visible but non-blocking
The Identity domain SHALL contribute an account control through the standard renderer contribution path. On the first launch with no accounts, the system SHALL present a dismissible, non-blocking prompt explaining that local functionality does not require an account; dismissing it SHALL allow normal Workbench use and SHALL prevent repeated automatic prompting.

#### Scenario: First launch without accounts
- **WHEN** the Workbench first becomes available and no Local Accounts exist
- **THEN** the system presents the dismissible account prompt without blocking local use

#### Scenario: Use persistent account control
- **WHEN** the prompt is dismissed or a later account operation is needed
- **THEN** the toolbar account control remains available and shows either a login label or the current username

### Requirement: Identity persistence fails closed without blocking SciForge
The system SHALL preserve Local Accounts and selection across restarts in an application-owned local database. If the identity database cannot be opened, validated, or migrated, Identity SHALL become unavailable with no Principal while the rest of SciForge remains usable. The system SHALL NOT silently recreate the database or assign replacement user IDs.

#### Scenario: Identity database is unavailable
- **WHEN** the identity database is corrupt, incompatible, or cannot be opened
- **THEN** Identity reports an unavailable state, exposes no Principal, preserves the original database, and allows the Workbench to continue

#### Scenario: Reset after successful backup
- **WHEN** the unavailable-state UI successfully copies the original database to a timestamped backup and the user confirms the destructive identity reset a second time
- **THEN** the system creates a fresh identity database with no accounts selected

#### Scenario: Refuse reset when backup fails
- **WHEN** the original database cannot be copied to the timestamped backup
- **THEN** the system refuses to reset or overwrite identity data

### Requirement: V1 account lifecycle is deliberately limited
V1 SHALL expose current-user query, account listing, account creation, account selection, username rename, account exit, Principal subscription, and unavailable-database recovery. V1 SHALL NOT expose account deletion, passwords, cloud authentication or sessions, cloud APIs, Device or Agent registration, Project authorization, OpenContent provisioning or binding, or local per-account data isolation.

#### Scenario: Request an excluded V1 operation
- **WHEN** a caller requests account deletion, cloud login, Project authorization, OpenContent binding, or Device or Agent registration through Identity V1
- **THEN** the operation is absent or rejected as unsupported rather than implemented through a fallback path

### Requirement: V1 does not create a durable identity audit ledger
The system SHALL NOT create a separate V1 audit table for account create, select, rename, or exit history. Diagnostic logs MAY record operation type, outcome, and opaque userId, but SHALL NOT record username, future email, credentials, or complete Principal payloads.

#### Scenario: Log a local identity operation
- **WHEN** a Local Account operation succeeds or fails and diagnostic logging is enabled
- **THEN** any log record omits username and other human-readable or secret identity attributes
