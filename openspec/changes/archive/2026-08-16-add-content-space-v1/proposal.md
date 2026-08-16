## Why

SciForge needs one provider-neutral Content Space capability and file-management UI for directories, ordinary files, uploads, downloads, selections, and fixed artifacts. Provider-specific authentication, Client behavior, evidence, and readiness belong to independently composed ContentSpaceProvider integrations rather than this business domain.

## What Changes

- Add the trusted compile-time `content-space` domain package with explicit contract, main, and provider-neutral renderer entrypoints.
- Define the ContentSpaceProvider SPI and consume only `main.content-space-provider-factory` contributions from `add-provider-composition`.
- Define Content Container, Content File, and gated immutable Artifact references and register their codecs through Portable Resource References.
- Add the unified Content Space UI for Provider Instance/container selection, bounded navigation, upload-new, download, selection, and reference/readiness presentation.
- Route UI and Agent-admitted operations through the same Content Space Capability Broker handlers and selected Provider; UI never calls Provider or Connector directly.
- Close the Provider Composition prerequisite with a generic trusted Provider Instance Directory entry contribution and read-only Host projection, so integrations can add/remove selectable instances without a Host or domain switch.
- Keep Project/Task associations, Shared Documents, Provider credentials, vendor DTOs, Provider Connectors, Workspace projection, overwrite, and cross-provider migration outside the domain.

## Capabilities

### New Capabilities

- `content-space`: Provider-neutral Provider selection, container navigation, upload-new, download, live file references, fixed artifact Gates, unified UI, and bounded errors/readiness.

### Modified Capabilities

- `provider-composition`: Add standard compile-time Provider Instance Directory entry composition and a lazy read-only Host projection; Content Space still consumes only its own Provider factory catalog for Provider implementations.

## Impact

- Adds `packages/domains/content-space` through standard manifest/generated composition.
- Depends on `add-portable-resource-references` and `add-provider-composition`, not on OpenContent or any other Provider integration.
- Enables mock-backed contracts and UI independently of Provider network readiness.
- OpenContent behavior is owned by the separate `add-opencontent-content-space-provider-v1` track.
