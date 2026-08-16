## Why

OpenContent has candidate directory and ordinary-file APIs suitable for a tightly isolated PoC, but that provider-specific evidence must not live inside Content Space. A separate adapter package lets the OpenContent track pause, advance, or fail without changing the provider-neutral domain or UI.

## What Changes

- Add trusted compile-time main-only `opencontent-content-space-provider`.
- Implement ContentSpaceProvider for Provider Kind `opencontent` and register `main.content-space-provider-factory` through generated composition.
- Consume only the composition-bound token-free Content Space port from `opencontent-connector`.
- Map OpenContent folders/files/results into strict Content Space schemas, references, errors, capabilities, and readiness without leaking DTOs.
- Admit only dedicated-tenant PoC operations: allowlisted container selection, bounded navigation, create-folder, upload-new, download, ContentFileReference, and safe provider portal when separately proven.
- Keep ArtifactReference, production metadata/materialization, remote Task, ordinary Agent, overwrite/update/move/delete/share/ACL/rollback/search, and arbitrary known-ID resolution blocked or absent.

## Capabilities

### New Capabilities

- `opencontent-content-space-provider`: OpenContent implementation of ContentSpaceProvider with isolated PoC evidence, strict readiness, and file-space safety Gates.

### Modified Capabilities

None.

## Impact

- Adds one optional integration package; it changes no Host switch, Agent Runtime branch, Content Space UI, or domain contract.
- Depends on `add-provider-composition`, `add-content-space-v1`, `add-opencontent-connector`, and Portable Resource References.
- Depends on the Content Space-first Connector milestone only. `add-shared-documents-v1`, a Document Connector port, and `add-opencontent-document-provider-v1` are explicitly not prerequisites.
- May be omitted or paused while Content Space mocks and other Providers continue.
