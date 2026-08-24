# OpenContent Connector

Owns existing-account enrollment, Principal-bound connection state, secure Token use, pinned OpenContent schemas, and main-process transport. It exposes no Content Space or Shared Documents business semantics.

Public enrollment is intentionally a non-secret action. The renderer and
capability input carry only the selected `providerInstanceRef`. On supported
packaged macOS builds, the Connector-owned in-process native adapter collects
the account and password with AppKit, authenticates through the canonical
package-private client, and stores the resulting Provider session directly in
the macOS Keychain. The Host, Domain SDK, Electron IPC, renderer, logs, and
capability receipts never receive the account secret or Provider Token. The
private runtime admits one enrollment at a time, honours Human cancellation,
bounds the network exchange, and drops credential references immediately after
authentication. Missing native support, an unsupported platform, or an
unavailable Keychain fails closed as a bounded public status; there is no
environment, file, subprocess, renderer, or Host credential fallback.

The package manifest declares one private deployment-configuration contract:
contract version `1`, source path
`.sciforge/private/deployments/opencontent-connector.json`, packaged Resources
path `domain-deployments/opencontent-connector.json`, a `4096`-byte ceiling,
and `publicRelease: forbidden`. The sidecar is strict JSON containing only
`contractVersion`, the exact Provider Instance declared by the installed
manifest contribution, and an absolute HTTPS `origin`. Activation requests
no-follow semantics where the
platform exposes them and always binds the opened descriptor to the pre-open
regular-file identity. It checks that descriptor before and after a
`4097`-byte-bounded read, rejects identity, size, modification-time,
change-time, or birth-time drift, closes it, and freezes the parsed value.
Missing, oversized, malformed, non-canonical, non-HTTPS, or
symlinked configuration makes Provider-backed calls unavailable before package
settings, native vault, network, or supplier-process access; local unbind and
session retirement remain available. The integration-owned unavailable view
exposes that same local cleanup only after explicit Human confirmation; it does
not contact the Provider or delete remote files. Provider discovery, capability
definitions, and the internal service descriptor remain registered.
There is no environment, argv, caller, renderer, package-setting,
alternate-path, default Provider Instance, or fallback endpoint channel.

Local and packaged-private builds use one generic domain-package deployment
composition that preserves every manifest declaration and activates a copy only
when its source exists. Electron Builder captures that immutable composition
once; after packing it requires each active target to match the captured size
and SHA-256 receipt and each inactive target to be absent. Official public
releases reject every active deployment configuration marked `forbidden`. The
sidecar is outside the package's npm `files` allowlist and its isolated packaged
namespace does not create a supplier overlay.

The Connector owns the SciForge-authored supplier wire contract, asset
verification, isolated process transport, and runtime snapshot mechanism. Its
public `./main-contract` exposes only the token-free Provider facade and typed
supplier invocations; asset resolution, command running, process control, and
snapshots are package-private. Optional supplier assets remain outside the
public workspace and lockfile. Source mode resolves them only below the absolute Host-injected
repository root at
`internal/opencontent/packages/opencontent-skill-assets/assets/opencontent-base-1.0.1`;
before returning that location, the Connector uses the public generic integrity
module to verify the exact `opencontent-attachment-assets` receipt identity,
`internal/opencontent` root, version `1.0.1`, complete inventory, and file digests;
packaged mode resolves them only from
`resources/opencontent/opencontent-base-1.0.1`. Neither mode searches private
`node_modules`, walks ancestors, or falls back to the other mode. Missing or
invalid, changed, extra, unreceipted, or wrong-version assets fail closed before
supplier dispatch.

Probe templates cross the Connector/Provider contract only as a non-authorizing
locator, source invocation ID, and SHA-256 content digest. The Connector keeps
the bytes in a bounded ten-minute in-memory store and separately binds them to
the live Principal, Provider Instance, external binding attestation, document,
and document hash. A plan can consume the locator once only after all of those
facts are revalidated through the current supplier session; possession alone
does not authorize access or dispatch.

The pinned CLI characterization freezes 86 inventory commands and the exact
50-command admitted adapter union. Inventory is not an execution allowlist or
packaged-live claim. The supplier `download`, `file-list`, `kbox-list`,
`file-internal-link`, `meta-modeldata`, and `collab-link` commands remain
inventory-only and cannot reach the process transport; ordinary download and
directory listing use the typed Connector facade, while native PDF export uses
`native-document:export`. Separately, the token-free typed Team Administration facade
exposes no public member-role/ownership operation and no revision/CAS field; the
supplier Team surface provides no atomic expected-state input for SciForge to
promote into an Administration concurrency promise.

Connection records and native-vault sessions are bound to their exact Provider Instance.
The Connector never reuses a Token across Provider Instance identities and
retains bounded cleanup metadata until the owning current Principal can delete
an obsolete session from secure storage.

## Provider binding attestation

The Connector is the authority for the current node-local OpenContent
Connection. It can issue a token-free v2 binding attestation containing the
exact Provider Instance and complete Principal plus two opaque SHA-256 values:
one identifies the authenticated external subject and one identifies the local
Connection revision. Raw external account identifiers, credentials, and the
Connection ID do not cross the facade as admission input or portable authority.
The public Team-administration contract likewise exposes only bounded DTOs,
schemas, constants, and a token-free bound interface. Credential-bearing
requests, sessions, transport construction, and binding stay package-private to
the Connector main process and are not exported from the public `./main` entry.

An attestation observed during Content Space admission is not sufficient by
itself. The pinned Provider passes that exact expected attestation back through
the same Connector facade for every business operation. Immediately before
remote dispatch, the Connector revalidates the Host Principal, authenticates
the actual current session, observes the current external account, recomputes
the opaque values, and requires an exact match. Unbind, rebind, credential
replacement, stable external `id`/`identityId` change, or Connection-revision
drift fails before the Provider operation or Connector-owned supplier
subprocess. Account and display-name metadata may refresh without changing
binding continuity.

See the [attachment distribution boundary](../../../docs/opencontent-attachment-distribution.md)
for installation, integrity, packaging, and public-release rules, and the
[Content Space architecture guide](../../../docs/content-space-architecture.md)
for the complete call chain.
