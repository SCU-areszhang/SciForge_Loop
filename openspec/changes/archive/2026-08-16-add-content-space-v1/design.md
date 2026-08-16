## Context

ADR 0010 separates ordinary file/artifact semantics from collaborative documents. ADR 0024 separates ContentSpaceProvider from DocumentProvider and composes integrations through domain-specific factory contributions. Content Space must therefore remain usable with mocks or any compatible Provider while OpenContent is paused.

See `domain-capability-separation-design.md`, `docs/contexts/content-space/CONTEXT.md`, and `openspec/changes/add-provider-composition/`.

## Goals / Non-Goals

**Goals:**

- Define one cohesive provider-neutral Content Space contract and domain package.
- Provide one unified file-management UI independent of vendor implementation.
- Keep live file references distinct from immutable artifacts.
- Make Provider capability and readiness visible and fail closed.

**Non-Goals:**

- Provider authentication, Connector/Client/schema code, vendor endpoints, or provider-specific policy.
- Collaborative-document bodies, revisions, edits, or document editor UI.
- Project/Task orchestration, Workspace projection, Git, bidirectional sync, or automatic Provider migration.
- Runtime Provider installation or Provider-specific renderer injection.

## Decisions

### Own the ContentSpaceProvider SPI

The package exports a strict ContentSpaceProvider contract for capability description, containers, entries, create-folder, upload-new, download, portal target, and immutable-version observation. It consumes only the Content Space Provider catalog and never imports an integration package.

### Compose trusted Provider Instances generically

The archived Provider Composition implementation accepts an already-built `ProviderInstanceDirectory` but did not provide a standard way for a compile-time integration package to contribute selectable instances. Add one generic `main.provider-instance-directory-entry` declaration/runtime contract and a lazy read-only Domain SDK Host projection. Host composition validates exact declaration/runtime agreement and duplicate instance ownership; Content Space receives only the resulting directory projection and never reads integration packages or a Provider-specific map. Provider factory creation remains impossible until one trusted directory entry has been selected.

Alternative rejected: deriving one default instance from each Provider Kind. It would merge Provider Kind with Provider Instance, create an implicit default Provider, and prevent independently trusted deployments of the same implementation.

### Keep the UI provider-neutral

Content Space renderer owns the common Provider/container selector, directory/file list, upload, download, resource selection, and reference/readiness/error presentation. Provider integrations contribute backend factories only. Optional vendor portal launch is represented by a safe opaque target, not arbitrary renderer code.

### Route every operation through the domain

Renderer and Agent callers use Content Space capabilities through the canonical Broker/domain service. The service validates reference, readiness, current authority, bounds, and operation policy before selecting the pinned Provider. There is no raw Provider/Connector path.

### Keep upload-new separate from mutable lifecycle

V1 defines create-folder and upload-new. Existing-name collision or uncertain outcome stops; overwrite/update/move/delete/share/ACL/rollback require later explicit changes. This is domain behavior, while exact remote correctness depends on the selected Provider readiness.

### Define but gate ArtifactReference

Content Space owns ArtifactReference semantics, but only an immutable version identity with retention and version-specific retrieval may be issued. A mutable file ID, digest alone, or upload receipt remains a ContentFileReference.

### Do not own consumer associations

Content Space returns references. Cloud Collaboration owns `Project.contentSpaceRef` and Task Artifact associations without being imported by this package.

## Risks / Trade-offs

- **[Generic UI leaks vendor fields]** → UI renders bounded domain summaries/capabilities only; provider DTOs fail package-boundary tests.
- **[Provider capability is inferred from extension]** → Query the selected Provider/resource capability profile; extension is display metadata only.
- **[Upload is mistaken for immutable artifact]** → Keep distinct schemas and block ArtifactReference issuance until formal immutability proof.
- **[Provider outage triggers fallback]** → Reference remains pinned; return unavailable/human action and never contact another Provider.

## Migration Plan

1. Complete Portable Resource References and Provider composition.
2. Add contracts, codecs, domain service, catalogs, mock Provider, and boundary tests.
3. Add provider-neutral renderer UI over mock/bounded domain data.
4. Integrate Provider packages independently; none becomes a domain compile-time dependency.
5. Promote each operation only from selected Provider evidence; remove package cleanly through generated composition with no compatibility path.
