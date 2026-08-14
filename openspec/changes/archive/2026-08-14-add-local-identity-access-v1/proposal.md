## Why

SciForge has no product-owned user identity: installation IDs, renderer callers, Agent turns, and external provider accounts cannot reliably identify the person to whom future Projects, Agents, devices, or OpenContent bindings belong. V1 needs a deliberately limited local identity entry that provides stable attribution without blocking offline work or pretending that username selection is cloud authentication.

## What Changes

- Add a trusted compile-time `identity-access` domain package with main and renderer entrypoints.
- Persist multiple Local Accounts and the current Local Identity Session in an application-owned SQLite database.
- Let trusted Human UI list, create, select, rename, and exit Local Accounts; restore the last selection automatically and keep all existing local features usable when no account is selected.
- Contribute a generic main-process Principal provider and inject an immutable Principal snapshot with explicit `local-selection` assurance into trusted capability callers and Agent turns.
- Add a non-blocking toolbar account entry and a dismissible first-run prompt.
- Fail Identity closed without blocking the Workbench when its database is unavailable; require a successful backup and explicit confirmation before resetting identity data.
- Keep existing chats, Workspaces, settings, credentials, files, and tools installation-scoped rather than partitioning them by Local Account.
- Exclude passwords, cloud sessions, cloud APIs, Device/Agent registration, Project authorization, OpenContent provisioning/binding, account deletion, and local security isolation from V1.

## Capabilities

### New Capabilities

- `local-identity-access`: Local Account lifecycle, SQLite persistence, automatic selection restoration, account UI, failure recovery, and explicit non-authentication/non-isolation semantics.
- `principal-context`: Generic Host-provided Principal snapshots, assurance levels, trusted caller injection, immutable Agent-turn attribution, and anti-spoofing rules.
- `application-ui-contributions`: Generic session-independent application overlays and renderable Workbench toolbar widgets required by cross-session domain UI such as account controls.

### Modified Capabilities

None.

## Impact

- Adds `packages/domains/identity-access` and refreshes manifest-driven main/renderer composition.
- Extends generic domain SDK/catalog contracts with one Principal-provider contribution and session-independent renderer UI slots instead of adding identity-specific host configuration or IPC.
- Extends capability caller and Agent-turn identity contracts with Host-injected Principal snapshots and trusted-sender enforcement.
- Adds a direct, supported SQLite dependency only if the packaged Electron Node runtime cannot provide the required `node:sqlite` contract consistently.
- Adds focused domain, SDK, broker, runtime-attribution, UI, persistence, corruption, composition, type, lint, and source/packaged smoke verification.
