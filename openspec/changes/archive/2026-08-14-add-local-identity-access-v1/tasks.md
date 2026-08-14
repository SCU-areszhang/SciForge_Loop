## 1. Generic Identity and UI Contracts

- [x] 1.1 Add immutable Principal snapshot, assurance, identityVersion, and Principal-provider contribution contracts and runtime guards to `@sciforge/domain-sdk`.
- [x] 1.2 Add generic `renderer.application-overlay` and `renderer.workbench-toolbar-widget` contracts, owner-bound Host controls, exports, and contract tests.
- [x] 1.3 Extend capability caller schemas with an optional Host-injected Principal while keeping renderer and Agent request inputs unable to declare it.

## 2. Host Composition and Trusted Transport

- [x] 2.1 Resolve zero or one Principal provider from the canonical domain catalog, reject duplicates, and expose current/snapshot/subscribe through a generic main-owned context.
- [x] 2.2 Extract one trusted renderer sender policy and apply it to ordinary application IPC and every capability IPC request/event/subscription channel before constructing callers.
- [x] 2.3 Inject the current immutable Principal snapshot into UI, system, and Agent capability caller contexts without exposing usernames, account lists, or Identity service handles.
- [x] 2.4 Implement canonical renderer registries for application overlays and toolbar widgets with ownership validation, atomic registration rollback, and reverse-order disposal.
- [x] 2.5 Render application overlays generically in `AppShell` and toolbar widgets generically in `WorkbenchTopBar`, with no Identity imports or domain-ID branches.
- [x] 2.6 Add focused catalog, sender-spoofing, caller-injection, overlay ownership, widget rendering, composition rollback, and lifecycle-disposal tests.

## 3. Identity Domain Package Foundation

- [x] 3.1 Create `packages/domains/identity-access` with package metadata, manifest, explicit definition/main/renderer exports, package-owned scripts, and no ambiguous root export.
- [x] 3.2 Define package-owned account, Identity status, capability input/output, username validation, and UI state schemas with stable capability and contribution IDs.
- [x] 3.3 Declare the capability factory, Principal provider, application overlay, toolbar widget, renderer lifecycle, and i18n contributions in the package manifest and definition tests.
- [x] 3.4 Generate installed domain composition and verify source and packaged dependency discovery contain Identity only through manifest-generated entry sets.

## 4. SQLite Identity Persistence

- [x] 4.1 Implement the package-owned SQLite store at `<userData>/identity-access/identity.sqlite` with transactional migrations, `PRAGMA user_version`, accounts, singleton Identity state, and deterministic disposal.
- [x] 4.2 Implement UUID account creation, Unicode username validation/normalization, case-insensitive installation-local uniqueness, list/select/rename/exit, automatic selection restore, and monotonic identityVersion updates.
- [x] 4.3 Implement explicit unavailable state for open/integrity/migration failures without recreating, renaming, truncating, or replacing the original database.
- [x] 4.4 Implement timestamped exclusive backup and destructive reset so reset proceeds only after backup verification, canonical confirmation, and the UI's explicit second confirmation.
- [x] 4.5 Add storage/service tests for migrations, restart persistence, duplicates, multilingual names, invalid names, idempotency, concurrent operations, version ordering, corruption, backup failure, reset, and no account deletion.
- [x] 4.6 Validate `node:sqlite` in the source and packaged Electron runtimes; add one direct package dependency only if the packaged runtime cannot satisfy the tested contract.

## 5. Main Identity Capabilities and Principal Provider

- [x] 5.1 Build one lazy package-owned Identity service shared by the main capability factory and Principal provider with one subscription source and disposal path.
- [x] 5.2 Implement UI-only inspect, list, create, select, rename, exit, first-prompt dismissal, and backup/reset capabilities through Capability Broker with correct effects, approvals, idempotency, and output validation.
- [x] 5.3 Enforce Human UI audience in handlers, omit account capabilities from Agent discovery, reject untrusted senders before handlers, and keep diagnostics free of username and complete Principal payloads.
- [x] 5.4 Emit no Principal while signed out or unavailable and emit versioned `local-selection` snapshots containing only userId, deviceId, assurance, and identityVersion after committed changes.
- [x] 5.5 Add focused main-entry, capability, anti-enumeration, Human-only mutation, provider uniqueness, subscription, stale-version, failure-isolation, and logging-redaction tests.

## 6. Account Entry UI

- [x] 6.1 Implement a package-owned renderer capability client and non-authoritative account UI projection that reloads from main and never persists identity authority in renderer storage.
- [x] 6.2 Implement an accessible toolbar account widget that shows Login or the current username and opens the package's application overlay without requiring a Thread or Workspace.
- [x] 6.3 Implement account list, explicit create confirmation, select, rename, exit, local non-isolation notice, and clear `local-selection` wording in the overlay.
- [x] 6.4 Implement the dismissible first-launch prompt, persist its dismissal through the Identity capability, and avoid repeated automatic prompting while retaining the toolbar entry.
- [x] 6.5 Implement Identity-unavailable presentation and the backup-first, double-confirmed reset flow only in recovery mode; expose no normal delete/reset control.
- [x] 6.6 Add package-owned Chinese/English i18n resources plus renderer tests for no-account, restored account, switch, rename conflict, exit, first-prompt dismissal, unavailable recovery, accessibility, and cleanup.

## 7. Immutable Agent-Turn Attribution

- [x] 7.1 Extend generic Agent runtime turn identity and persisted event/trace envelopes with an optional immutable Principal snapshot for signed-in turns.
- [x] 7.2 Snapshot the current Principal exactly once at turn start and propagate that snapshot through turn messages, results, capability calls, artifact events, and audit projections without later global Identity lookup.
- [x] 7.3 Preserve in-flight attribution across account select, rename, exit, Identity failure, and stale Principal notifications; apply the new snapshot only to subsequent turns.
- [x] 7.4 Add runtime, Codex/Claude adapter, event persistence, artifact, trace, account-switch, and signed-out regression tests proving one turn cannot be rebound between users.

## 8. Boundary and Regression Verification

- [x] 8.1 Run domain SDK tests/typecheck, Identity package tests/typecheck, generated composition freshness, domain boundary tests, and capability governance checks.
- [x] 8.2 Audit for identity-specific IPC/preload APIs, Host-private imports, core domain-ID switches, renderer-owned Principal authority, duplicate account stores, account deletion, and cloud/OpenContent/Project placeholders.
- [x] 8.3 Run focused changed-area lint/type checks followed by the full regression suite, documenting any pre-existing failures separately from change failures.
- [x] 8.4 Run source Electron smoke tests and packaged Electron build/smoke tests, verifying SQLite persistence, overlays/widgets, Principal injection, offline startup, restart restore, and rollback-safe preservation of the Identity database.
- [x] 8.5 Re-read the final implementation against the three capability specs and Identity ADRs 0011-0016 and 0019, then update architecture documentation to describe only the canonical final paths.
