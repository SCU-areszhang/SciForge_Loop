# Change: Add demand-driven Workflow evolution Stage1

## Why

SciForge already has a package-owned Create Loop editor and runtime, but it has no immutable Workflow release/catalog model and no durable requirement-to-promotion controller. The current `WorkflowV1` mixes graph definition with mutable execution history, its global settings revision changes during ordinary execution, and its human approval waiters are in memory. Those mechanisms cannot prove that the object verified, promoted, replayed, and served is the same frozen artifact.

Stage1 needs a smaller, auditable target than general source-code self-modification: one workspace-scoped Workflow Catalog with one stable Anchor and at most one active Candidate, governed by durable requirements, evidence, independent verification, explicit human promotion, compare-and-swap, replay, and rollback.

## What Changes

- Add immutable `WorkflowDefinition`, `WorkflowRelease`, `WorkflowCatalogRevision`, `WorkflowCandidate`, and `AnchorPointer` contracts owned by the Create Loop domain.
- Add a package-owned Catalog store and broker capabilities for reading releases, staging candidates, release-pinned execution, compare-and-swap promotion, and rollback.
- Keep one Create Loop execution engine for draft preview, Anchor execution, and Candidate execution; migrate production callers to frozen release references and remove the superseded mutable production path.
- Add a new backend-first `@sciforge/domain-workflow-evolution` package discovered through the standard manifest and generated composition path.
- Add a SQLite Evolution Ledger, deterministic state machine, durable human/resource gates, structured document revisions, receipts, and restart recovery.
- Add the four Coverage outcomes and five GapKind outcomes, with platform/resource/policy gaps kept out of the Workflow Candidate path.
- Add `TeacherEvidencePort` with a Stage1 no-op adapter that records and returns `BYPASSED`.
- Add a fail-closed Candidate policy, private runner, bounded repair loop, independent verifier, sealed-test boundary, human Promotion gate, Anchor CAS, original-input replay, and rollback evidence.
- Add a first scientific Workflow family with 3–5 frozen Anchor releases and fixtures for every routing path.
- Add an Evolution UI only after the durable control plane and Catalog integration pass their non-UI acceptance tests.

## Capabilities

### New Capabilities

- `workflow-catalog-lifecycle`: Immutable Workflow definitions, releases, catalog revisions, candidates, Anchor generation, release-pinned execution, and CAS writes.
- `workflow-evolution-control-plane`: Durable requirements, Coverage/Gap routing, document revisions, state transitions, gates, Teacher policy, and restart recovery.
- `workflow-candidate-governance`: Candidate isolation, policy validation, Builder/Verifier separation, evidence binding, human promotion, replay, and rollback.

### Modified Capabilities

- `create-loop`: Stable service execution moves from mutable `workflowId` state to frozen `releaseId + definitionDigest`; draft preview remains an explicit non-service operation using the same execution engine.
- `official-workbench-domain-packages`: The new backend-first Workflow Evolution package is discovered and activated through its manifest without Host domain switches or feature maps.

## Impact

- Primary code:
  - `packages/domains/create-loop/**`
  - new `packages/domains/workflow-evolution/**`
- Generated integration:
  - installed domain composition
  - capability reference documentation
  - root workspace lockfile
- Storage:
  - Create Loop owns its Catalog database.
  - Workflow Evolution owns a separate Ledger database.
  - The packages never share tables or database connections.
- Public integration:
  - Workflow Evolution may import only Create Loop public contracts.
  - Production operations invoke package-owned capabilities through the Capability Broker.
- No new domain-specific IPC, preload bridge, MCP business path, Host feature map, central domain switch, or duplicate runtime is introduced.
- Stage1 does not modify SciForge source code autonomously, train models, implement real teacher distillation, run Candidate populations, or publish without a human decision.
