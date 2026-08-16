## Context

Authenticated OpenContent verification found candidate team-library, folder-create, upload, list, detail, and download behavior, plus a metadata-after-revocation BOLA condition and incomplete Token/session contracts. Those facts belong to one ContentSpaceProvider integration, not the Content Space domain.

See `docs/opencontent-api-verification-context.md`, `domain-capability-separation-design.md`, ADR 0025, and the Content Space-first `add-opencontent-connector` milestone.

## Goals / Non-Goals

**Goals:**

- Implement the bounded OpenContent file-space adapter without exposing vendor details.
- Keep every operation independently readiness-gated and dedicated-tenant PoC-only initially.
- Use one OpenContent connection/Client path shared through Connector.

**Non-Goals:**

- Content Space UI, Project/Task orchestration, Shared Documents, or document body semantics.
- A Document Connector port, DocumentProvider contribution, or placeholder for deferred document work.
- Production claim, shared-tenant product access, remote Task, ordinary Agent access, or Provider fallback.
- Mutable file lifecycle, generalized search, ACL/member administration, or ArtifactReference before proof.

## Decisions

### Contribute only ContentSpaceProvider

The package imports the public Content Space Provider contract and OpenContent Connector adapter port, maps strict results, and registers Provider Kind `opencontent`. It has no renderer, Broker capability, credential store, raw Client export, or document contribution.

### Keep PoC roots and operations exact

Trusted OpenContent Verification Profile binds the dedicated tenant, instance, least-privilege accounts, roots, bounds, and admitted operations. Arbitrary IDs, generalized search, personal-library defaults, and caller-selected readiness are rejected.

### Treat BOLA as production blocker

Known-ID metadata exposure after revocation prevents production catalog/materialization until OpenContent supplies a server fix or validated object-level permission oracle. Project/team shadow checks do not close the Gate.

### Separate file creation from immutable artifact

Upload-new returns ContentFileReference. ArtifactReference remains blocked until OpenContent formally guarantees immutable version identity, retention, and version-specific retrieval.

## Risks / Trade-offs

- **[SDK and service schemas differ]** → Pin build/contracts and runtime-validate selected DTOs/results.
- **[Upload retry duplicates resources]** → Use one logical invocation identity and `outcome_unknown`, never blind retry.
- **[Token appears in transfer URL]** → Keep operation blocked unless Connector retains all credential transport in main.
- **[Adapter pause breaks Content Space]** → Catalog reports Provider unavailable; mocks/other Providers/UI continue and no fallback occurs.

## Migration Plan

1. Complete Provider composition, Content Space domain, the Content Space-first Connector contracts, secure credentials, and dedicated test tenant Gates; Shared Documents and every Document package remain deferred.
2. Add package/factory/mapper mocks with all operations blocked.
3. Promote only evidence-backed exact operations to `poc_only`.
4. Keep production and excluded operations blocked until individual contracts pass.
5. Remove/pause package cleanly through generated composition.
