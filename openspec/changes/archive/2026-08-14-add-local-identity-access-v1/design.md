## Context

SciForge is an Electron application whose installed features are trusted compile-time domain packages discovered from `sciforge.domain.json` and generated into process-specific composition. Capability Broker is the canonical domain operation path; renderer-to-main domain-specific IPC is forbidden. The current caller model identifies technical callers such as windows and Agent turns but has no Human Principal, and the current application has no account UI or identity persistence.

V1 is intentionally not authentication. It selects a persistent local identity for attribution while existing local data remains installation-scoped. The future cloud adapter must fit the same generic Principal contract but will replace local IDs through explicit migration and stronger assurance.

## Goals / Non-Goals

**Goals:**

- Keep account storage, lifecycle, and UI in one independently ownable `identity-access` domain package.
- Provide one Host-asserted, versioned Principal contract that cannot be spoofed by renderer, Agent, or capability input.
- Preserve immutable user attribution for Agent turns across account changes.
- Add only the generic renderer extension points required for session-independent account UI.
- Keep Identity failure isolated from the offline Workbench.

**Non-Goals:**

- Treat username selection as authentication or authorization.
- Partition existing local application data by account.
- Add cloud services, passwords, email login, tokens, secure credentials, Device/Agent registration, Project IAM, or OpenContent integration.
- Add account deletion, identity merging, or cloud migration code in V1.
- Add identity-specific preload IPC, MCP, core feature maps, or host-private imports from the domain package.

## Decisions

### 1. Identity is a trusted compile-time domain package

Create `packages/domains/identity-access` with package-owned contracts, SQLite storage, main contributions, React UI, tests, and explicit `./main` and `./renderer` exports. Its manifest declares:

- `main.capability-factory` for Human UI account operations;
- `main.principal-provider` for the generic current-Principal source;
- `renderer.application-overlay` for the account dialog and first-run prompt;
- `renderer.workbench-toolbar-widget` for a dynamic account control;
- `renderer.lifecycle` for package-owned initial state loading and first-run presentation;
- `renderer.i18n-bundle` for account UI text.

Generated domain composition remains the only installation path. The Host learns only generic contribution contracts; it never imports the package by module ID or configures Identity endpoints.

Alternative considered: implement accounts in `src/main`, preload, and `AppShell`. Rejected because it breaks package ownership, creates a second domain transport, and hard-codes a feature into already-coupled host modules.

### 2. The domain owns one lazy Identity service shared by its contributions

`createDomainMainEntry(host)` creates a lazy accessor for one package-owned Identity service rooted at `<userData>/identity-access`. The capability factory and Principal provider close over the same accessor so there is one store, one identityVersion, one subscription source, and one disposal path. Storage initialization failures are captured as an explicit unavailable state rather than escaping into application startup.

The generic catalog resolves `main.principal-provider` contributions with a runtime guard and permits zero or one provider. More than one is an ambiguous identity authority and fails composition. A missing or unavailable provider produces no Principal.

Alternative considered: make the Identity service a `main.runtime-lifecycle` contribution. Rejected because account inspection must be available while lifecycle enablement changes, and the lazy package service already has a bounded process lifetime and disposal hook.

### 3. SQLite is the sole V1 identity store

Use the Electron Node runtime's supported `node:sqlite` implementation, validated in both source and packaged smoke tests. Do not introduce an ORM or parallel JSON/settings persistence. If the packaged runtime cannot support the required SQLite API, add one explicit direct SQLite dependency to the domain package rather than importing another package's private storage implementation.

Database path: `<userData>/identity-access/identity.sqlite`.

Schema:

```text
accounts
  user_id       TEXT PRIMARY KEY       -- UUID
  username      TEXT NOT NULL
  username_key  TEXT NOT NULL UNIQUE
  created_at    TEXT NOT NULL
  updated_at    TEXT NOT NULL

identity_state                 -- exactly one row
  singleton_id                INTEGER PRIMARY KEY CHECK (singleton_id = 1)
  current_user_id             TEXT NULL REFERENCES accounts(user_id)
  identity_version            INTEGER NOT NULL
  first_prompt_dismissed      INTEGER NOT NULL
```

Package-owned migrations use transactions and `PRAGMA user_version`. Every state mutation is transactional and increments `identity_version`; reads return an immutable snapshot. SQLite is opened and used only in main. No username or account list is copied to AppSettings or renderer localStorage.

Alternative considered: JSON in AppSettings. Rejected because uniqueness, transactional selection updates, schema migration, backup/recovery, and future ownership references require a database boundary, while settings already contain unrelated installation configuration.

### 4. Username normalization is deterministic and separate from user identity

Generate user IDs with `crypto.randomUUID()`. Normalize username presentation with Unicode NFC and trimming, validate 1-64 Unicode code points against letters, numbers, ASCII spaces, hyphens, and underscores, and derive `username_key` using locale-independent lowercase comparison. Persist the original normalized presentation and enforce the derived key with a database uniqueness constraint.

Renaming updates username fields and identityVersion but never userId. A missing username entered from the selector requires an explicit create confirmation; selecting and creating are separate capability calls so a typo cannot silently create identity.

### 5. Account operations use Capability Broker only

Define UI-only, global capabilities for:

```text
identity.local.inspect
identity.local.list-accounts
identity.local.create-account
identity.local.select-account
identity.local.rename-account
identity.local.exit-account
identity.local.dismiss-first-prompt
identity.local.backup-and-reset
```

Read operations use `effect: read`. Ordinary mutations use `effect: external-write`, required idempotency, UI audience, and no Agent exposure. Backup-and-reset is destructive, requires the Broker's canonical Human confirmation, and still performs the package-level second confirmation state before execution. Handlers verify that caller audience is trusted Human UI; the registry does not expose account definitions to Agents.

The package does not expose account deletion. Exit clears only `current_user_id`. Diagnostics can include operation, outcome, and opaque userId but not username or complete Principal payload.

Alternative considered: add identity-specific IPC. Rejected because it would duplicate sender validation and bypass the canonical capability policy, discovery, idempotency, and tracing path.

### 6. Principal is a generic Host contract with explicit assurance

Add a generic immutable schema in domain SDK:

```ts
type PrincipalSnapshot = Readonly<{
  userId: string
  assurance: 'local-selection' | 'cloud-authenticated'
  deviceId: string
  identityVersion: number
}>
```

The Identity provider exposes `current()` and `subscribe(listener)`. V1 uses the existing stable installation ID as `deviceId`; it remains device attribution and never becomes user identity. The provider emits only `local-selection` and publishes a higher identityVersion after committed identity state changes. Consumers ignore older versions.

Extend capability caller context with an optional Host-injected `principal`. Renderer and Agent request schemas do not accept it. Extract the existing trusted renderer sender policy into one main-owned function and apply it identically to ordinary app IPC and every capability IPC channel before caller construction. The main process snapshots the provider value and passes it to Broker; no credential, username, account list, or service handle crosses this boundary.

Alternative considered: let each domain call `identity.local.inspect`. Rejected because it creates time-of-check races, exposes account presentation data, and lets domains disagree on the current authority.

### 7. Agent turns snapshot Principal once

At `AgentRuntimeHost` turn start, snapshot the current Principal and attach it to the immutable generic turn identity and persisted event/trace attribution. Existing signed-out turns carry no Principal. Messages, results, artifact events, capability calls, and audit projections derived from that turn use the captured snapshot, never a later global lookup.

Selecting, renaming, exiting, or losing Identity while the turn runs cannot change its attribution. New turns receive the latest snapshot. Future `cloud-authenticated` capabilities must revalidate the current cloud Principal at execution/apply time in addition to retaining the turn's historical attribution; this future authorization check is not implemented by V1.

Alternative considered: resolve current Principal for every event. Rejected because an account switch would silently assign one turn to multiple users.

### 8. Renderer gains generic session-independent UI slots

Add two generic domain SDK contribution kinds and canonical renderer registries:

- `renderer.application-overlay`: a package-owned view rendered by `AppShell` without a Workbench session, controlled through an owner-bound `DomainRendererApplicationHost` open/close surface;
- `renderer.workbench-toolbar-widget`: a compact package-owned React view rendered in `WorkbenchTopBar`, independent of Thread/Workspace selection.

The installed renderer contribution assembler validates contracts and values, enforces owner identity, registers atomically, and disposes in reverse. `AppShell` and `WorkbenchTopBar` render generic registry results only; neither imports Identity components or switches on Identity IDs.

The Identity renderer package keeps a non-authoritative UI projection populated through its capability client. Its widget displays `Login` or the current username and opens the application overlay. On the first successful inspection with zero accounts and an undismissed prompt, package lifecycle opens the same overlay in first-run mode. Dismissal is persisted through the Identity capability so it is not shown repeatedly. Identity-unavailable mode offers backup-and-reset recovery; normal UI has no delete/reset action.

Alternative considered: reuse `renderer.workbench-global-overlay`. Rejected because that surface requires session ownership and cannot present the first-run account entry with no Thread or Workspace. A package-mounted ad hoc React root was also rejected because it would bypass Host ownership and disposal.

### 9. Recovery never silently changes identity

If open, integrity validation, or migration fails, retain the database path and error classification, close partial handles, expose unavailable state, and return no Principal. Do not rename, truncate, recreate, or replace the database automatically.

Recovery is available only from the unavailable overlay. The reset flow copies the original database to a non-existing timestamped backup in the package data directory, verifies the backup exists, obtains the Broker confirmation plus the UI's explicit second confirmation, then atomically establishes a new database. Any backup failure aborts reset. New user IDs are created only by later explicit account creation.

### 10. Cloud migration remains a contract, not a V1 implementation

Keep `PrincipalSnapshot` and account presentation contracts independent from SQLite. A future adapter will authenticate by email code, receive a cloud canonical userId, ask the user to migrate the selected Local Account, transactionally update owned references, and retain the local ID only as a migration alias. It cannot claim cloud authority from local userId, username, installation ID, or email equality.

No cloud adapter, migration table, alias table, email field, token field, or placeholder provider is added in V1.

## Risks / Trade-offs

- [Local username selection can be mistaken for secure login] -> UI and contracts label its assurance as `local-selection`, explain the lack of local isolation, and prohibit cloud-authorized consumers from accepting it.
- [SQLite support differs between development Node and packaged Electron] -> Run source and packaged smoke tests; use one explicit domain dependency only if the bundled runtime fails the contract.
- [Principal injection expands a high-value shared contract] -> Keep the value immutable and credential-free, reject renderer/Agent claims, validate all capability senders, and add anti-spoof and stale-version tests.
- [Account switching during active turns creates attribution races] -> Capture the complete Principal snapshot at turn start and never consult mutable global identity for historical events.
- [A corrupt database could orphan future ownership references] -> Fail closed, preserve the original, require successful backup plus explicit reset confirmation, and never auto-generate replacement IDs.
- [Generic UI slots increase Host surface area] -> Keep contracts minimal, owner-bound, manifest-driven, atomically registered, and free from identity-specific fields.
- [V1 has no per-account privacy] -> State the boundary in UI and documentation; recommend separate OS accounts for local isolation.

## Migration Plan

1. Extend domain SDK, renderer composition, and capability trusted-sender contracts with tests while no Principal provider is installed; absence remains a valid signed-out state.
2. Add the `identity-access` package, generate composition, and verify the package is the sole Principal provider.
3. Add SQLite schema/migrations and package capabilities; verify restart, username conflicts, idempotency, corruption, backup, and reset behavior.
4. Add application overlay and toolbar widget UI, first-run dismissal, accessibility, and account state handling.
5. Capture Principal at Agent-turn start and propagate it through messages/results/events/trace attribution.
6. Run generated-composition, capability-governance, boundary, type, lint, full regression, source Electron, and packaged Electron checks.

Rollback removes the domain package and regenerates composition; generic Principal/UI contracts can remain unused. Do not delete `<userData>/identity-access/identity.sqlite`, so rollback and reinstall cannot silently destroy user IDs.
