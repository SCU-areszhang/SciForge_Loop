## Why

Shared Documents and Content Space need replaceable provider implementations without turning Host Core into a vendor router or creating a universal optional-method Provider. The repository already has manifest/generated contribution composition; this change adds two domain-specific Provider factory contracts on that canonical path.

## What Changes

- Add `main.document-provider-factory` and `main.content-space-provider-factory` contribution contracts with explicit versions and strict declaration/runtime validation.
- Let trusted compile-time integration packages contribute one or both implementations independently.
- Add separate domain-owned Provider catalogs with duplicate/incompatibility rejection, lazy factory use, and no network activity during composition.
- Resolve a trusted Provider Instance to its declared Provider Kind before selecting a compatible factory.
- Pin every resource operation to its Provider Instance and prohibit automatic fallback, extension-based routing, and silent cross-provider copying.
- Keep Host Core free of vendor names, Provider IDs, business capability IDs, domain switches, raw Clients, and credentials.
- Exclude runtime Provider installation, marketplace discovery, signatures, sandboxing, dynamic upgrades, and compatibility shims.

## Capabilities

### New Capabilities

- `provider-composition`: Trusted compile-time DocumentProvider and ContentSpaceProvider factory contributions, domain-owned catalogs, instance-pinned routing, and provider-neutral lifecycle/error behavior.

### Modified Capabilities

None.

## Impact

- Adds generic public SDK contribution contracts and process-local catalog composition, not a third business domain.
- Provides the required composition baseline for `add-content-space-v1` and `add-shared-documents-v1`.
- Allows OpenContent, future SciForge services, and other third parties to add integration packages without Host Core, Agent Runtime, renderer IPC, or business-contract changes.
- V1 accepts only bundled, reviewed trusted compile-time Provider packages.
