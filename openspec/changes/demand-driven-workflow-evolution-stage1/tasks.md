# Tasks: Demand-driven Workflow evolution Stage1

Owner labels:

- `[A]` Create Loop Catalog/Runtime owner
- `[B]` Workflow Evolution owner
- `[I]` integration owner
- `[A+B]` both developers must review; one author only

No P1/P2 business implementation starts until section 0 is merged into the protected integration branch.

## 0. Collaboration and contract gate

- [ ] 0.1 `[I]` Create the protected `stage1/integration` branch from `c6c6d754d8caa82ac6e82836f51292427a651ccd`, configure mentor upstream as fetch-only, record Node/npm versions, and capture baseline validation results.
- [ ] 0.2 `[I]` Add ordinary PR CI for `stage1/integration` with `npm ci`, lint, typecheck, test, and build; do not alter or invoke the upstream Release workflow.
- [ ] 0.3 `[A]` Add a Create Loop `catalog-contract` public export with strict schemas for Workflow definition, Release, Catalog revision, Candidate, Anchor pointer, execution receipt, CAS receipt, and capability descriptors.
- [ ] 0.4 `[B]` Add the Workflow Evolution contract proposal for Coverage, GapKind, Evolution states, document revisions, gates, decisions, and Teacher evidence; do not add implementation.
- [ ] 0.5 `[A+B]` Freeze workspace scope, ID rules, canonical JSON/SHA-256 test vectors, parent topology, idempotency semantics, capability effects/approval, and legal state transitions.
- [ ] 0.6 `[A+B]` Freeze Candidate node/model/tool/secret/network/file/env/budget policy and the maximum Candidate/repair/child-agent limits.
- [ ] 0.7 `[B]` Add four Coverage fixtures, all GapKind fixtures, public acceptance cases, prohibited side effects, and sealed-test ownership metadata.
- [ ] 0.8 `[A]` Add 3–5 policy-valid Anchor Workflow fixtures with deterministic definition and catalog digests.
- [ ] 0.9 `[A+B]` Review the OpenSpec requirements and mark the contract gate complete only when both workstreams can implement against schemas and fixtures without oral field assumptions.

## 1. P1 — Immutable Create Loop Catalog

- [ ] 1.1 `[A]` Implement `WorkflowDefinitionV1` normalization that excludes runtime history, service state, timestamps, secret values, and unknown fields.
- [ ] 1.2 `[A]` Implement canonical JSON and digest test vectors across clone, serialization, process, and restart boundaries.
- [ ] 1.3 `[A]` Implement append-only Workflow Release and Catalog Revision persistence in the package-owned Catalog database.
- [ ] 1.4 `[A]` Implement workspace-scoped Anchor pointer storage with a generation changed only by Catalog CAS.
- [ ] 1.5 `[A]` Implement durable idempotency records that return the original receipt for the same key/payload and reject key reuse with a different payload.
- [ ] 1.6 `[A]` Implement read Anchor, read Catalog, and get Release capabilities through the existing Create Loop capability factory.
- [ ] 1.7 `[A]` Implement Candidate staging for `EXTEND_EXISTING` and `CREATE_NEW`, binding the exact base Catalog, generation, optional base Release, request digest, and proposed definition digest.
- [ ] 1.8 `[A]` Prove that failed/invalid Candidate staging leaves the Anchor and Catalog unchanged.
- [ ] 1.9 `[A]` Implement CAS promotion with exact expected generation, Candidate/evidence/decision binding, atomic Catalog revision creation, and a durable receipt.
- [ ] 1.10 `[A]` Test two Candidates based on one generation: only the first valid CAS succeeds and every stale attempt is a zero-write failure.
- [ ] 1.11 `[A]` Implement the bounded rollback operation that accepts only the immediately preceding promotion receipt and exact current generation.
- [ ] 1.12 `[A]` Recover Releases, Catalog revisions, Candidates, idempotency results, and Anchor generation after runtime restart.

## 2. P2 — Durable Workflow Evolution control plane

Tasks 2.1–2.11 may run in parallel with section 1 after the section 0 contract gate. Unit tests use the frozen Catalog port fake.

- [ ] 2.1 `[B]` Create backend-only `@sciforge/domain-workflow-evolution` with its manifest, pure contract, definition, main capability factory, runtime lifecycle, tests, and README.
- [ ] 2.2 `[B]` Implement a package-owned SQLite Ledger with schema versioning, foreign keys, workspace partitioning, short transactions, and clean lifecycle disposal.
- [ ] 2.3 `[B]` Persist Evolution runs, state/revision, command intents, receipts, attempts, gates, decisions, document revisions, audit events, and exact Anchor/Candidate references.
- [ ] 2.4 `[B]` Implement the versioned legal-transition table and reject illegal or stale-revision transitions without partial writes.
- [ ] 2.5 `[B]` Implement append-only RequirementSpec, ChangeSpec, and VerificationReport structured revisions with owner, freeze state, schema version, and digest.
- [ ] 2.6 `[B]` Implement deterministic Markdown projections under the domain-owned run directory; prove Markdown deletion or mutation cannot change Ledger state.
- [ ] 2.7 `[B]` Implement submit requirement, get run, list pending gates, clarify requirement, resolve resource gate, and record promotion decision capabilities.
- [ ] 2.8 `[B]` Resolve an AMBIGUOUS gate in one transaction that closes the old gate, appends a RequirementSpec revision, advances run revision/state, and appends an audit event.
- [ ] 2.9 `[B]` Implement `TeacherEvidencePort` and the Stage1 no-op adapter with stable job refs, `BYPASSED` status, and idempotent cancel.
- [ ] 2.10 `[B]` Record Teacher `BYPASSED` evidence and continue without creating a Candidate or granting promotion authority.
- [ ] 2.11 `[B]` Restart the domain runtime and prove that open gates, run state, document revisions/digests, intents, and audit history recover exactly.

## 3. P1/P2 integration gate

- [ ] 3.1 `[B]` Implement the single production `WorkflowCatalogPort` adapter using Create Loop public capability descriptors and `DomainMainSystemCapabilityInvoker`.
- [ ] 3.2 `[B]` Keep the fake adapter test-only and prove no production entrypoint imports or selects it.
- [ ] 3.3 `[A+B]` Add real capability integration tests for read, staging, durable idempotency, successful CAS, stale CAS, restart reconciliation, and rollback receipt binding.
- [ ] 3.4 `[I]` Generate installed-domain composition and capability documentation; update the lockfile once after both package changes are present.
- [ ] 3.5 `[I]` Audit for Host domain IDs, private cross-package imports, direct Catalog database reads, special IPC/preload/MCP paths, and duplicate service implementations.

## 4. P3 — COVERED path

- [ ] 4.1 `[A]` Extract one internal Create Loop execution engine that accepts a frozen definition, policy, workspace, and input without resolving mutable Workflow state during the run.
- [ ] 4.2 `[A]` Add release-pinned execution requiring `releaseId + definitionDigest` and produce an immutable receipt that extends the public execution-governance receipt with release/input/evidence references.
- [ ] 4.3 `[B]` Implement Requirement freeze, Catalog retrieval, controlled Anchor trial, acceptance evidence, and the COVERED decision path.
- [ ] 4.4 `[B]` Complete a COVERED run only after every MUST acceptance passes and no forbidden side effect is recorded.
- [ ] 4.5 `[A+B]` Prove COVERED executes the frozen Anchor Release, returns its receipt, and creates no Candidate.
- [ ] 4.6 `[B]` Route failed Anchor acceptance to a persisted GapSpec rather than silently lowering acceptance.

## 5. P4 — Candidate path

- [ ] 5.1 `[A]` Implement a versioned, fail-closed Candidate policy validator with exact allowed node, tool, model, secret, network, file, env, budget, Loop, and Agent constraints.
- [ ] 5.2 `[A]` Implement the private Candidate Runner using the same execution engine, frozen Candidate digest, isolated workspace, and bounded side effects.
- [ ] 5.3 `[B]` Implement the Expressibility Check and route only `WORKFLOW_DELTA` and `NEW_WORKFLOW` to Candidate staging.
- [ ] 5.4 `[B]` Route `PLATFORM_CAPABILITY_GAP`, `RESOURCE_GAP`, and `POLICY_BLOCKED` to their durable non-Candidate states.
- [ ] 5.5 `[B]` Implement Builder attempts from frozen Requirement/Gap/Change specs, public tests, and bounded counterexample repair.
- [ ] 5.6 `[B]` Enforce one active Candidate per workspace and the frozen 2–3 repair-attempt limit.
- [ ] 5.7 `[A+B]` Prove Candidate validation/execution/repair failures never modify the Anchor and stable Anchor service remains available.

## 6. P5 — Verification, promotion, replay, and rollback

- [ ] 6.1 `[B]` Launch Verifier as an independent sibling principal, not a Builder child, with read-only Candidate access and sealed-test visibility.
- [ ] 6.2 `[B]` Prevent Builder access to sealed tests and prevent Verifier mutation of the Candidate, frozen documents, Ledger policy, or Anchor.
- [ ] 6.3 `[B]` Freeze VerificationReport with new-requirement, Anchor-corpus, policy, scientific, residual-risk, and recommendation evidence.
- [ ] 6.4 `[B]` Persist an explicit human PromotionDecision tied to the exact Candidate and VerificationReport digests.
- [ ] 6.5 `[B]` Request Create Loop CAS only after all deterministic gates and a valid current host authorization pass.
- [ ] 6.6 `[A]` Reject missing evidence, missing decision, stale generation, digest mismatch, unauthorized callers, and unknown Candidate IDs atomically.
- [ ] 6.7 `[B]` Replay the original input against the newly promoted Anchor and persist the release-pinned replay receipt.
- [ ] 6.8 `[B]` On replay failure, invoke only the bounded rollback capability and retain failure, promotion, and rollback evidence.
- [ ] 6.9 `[A+B]` Fault-inject crashes before/after Catalog CAS and before/after Ledger receipt commit; prove reconciliation reaches one auditable terminal state without double promotion.

## 7. Canonical execution-path migration

- [ ] 7.1 `[A]` Route Anchor service, scheduler, webhook, agent, and renderer stable execution through release-pinned definitions and the single execution engine.
- [ ] 7.2 `[A]` Keep draft preview explicit and ensure its results cannot be used as frozen promotion evidence.
- [ ] 7.3 `[A]` Delete the superseded mutable `workflowId` production execution action and all aliases, forwarding branches, duplicate state updates, and fallback registrations after caller migration.
- [ ] 7.4 `[A]` Ensure `WorkflowV1` or its replacement is an editor draft only; Release/Catalog and Ledger are the version/evolution facts.
- [ ] 7.5 `[A+B]` Audit that verification object, promotion object, replay object, and stable service object share the same `releaseId + definitionDigest`.

## 8. P6 — Pilot and productization

- [ ] 8.1 `[A+B]` Freeze one scientific Workflow family and 3–5 Anchor Releases covering literature review, synthesis, novelty checking, and pre-submission review.
- [ ] 8.2 `[B]` Add package-owned Evolution renderer contributions that read and invoke only capabilities; do not duplicate state or parse Markdown.
- [ ] 8.3 `[B]` Present run state, requirements, gaps, gates, attempts, VerificationReport, decisions, replay, rollback, and audit export.
- [ ] 8.4 `[A]` Present immutable Release/Catalog/Candidate identity and digest information through Create Loop package-owned surfaces where required.
- [ ] 8.5 `[A+B]` Add E2E fixtures for COVERED, AMBIGUOUS, PARTIAL, NEW_WORKFLOW, PLATFORM_CAPABILITY_GAP, RESOURCE_GAP, and POLICY_BLOCKED.
- [ ] 8.6 `[A+B]` Add restart, stale-CAS, policy denial, sealed-test isolation, verifier read-only, replay failure, rollback, and audit-export E2E coverage.
- [ ] 8.7 `[B]` Export all model/runtime versions, digests, tests, costs, human decisions, and receipts needed for an auditable Stage1 run.

## 9. Verification and mentor handoff

- [ ] 9.1 `[A]` Pass Create Loop focused tests and typecheck.
- [ ] 9.2 `[B]` Pass Workflow Evolution focused tests and typecheck.
- [ ] 9.3 `[I]` Pass domain package generation/check/test/typecheck and capability generation/check.
- [ ] 9.4 `[I]` Pass changed-file lint, root typecheck, full tests, and production build.
- [ ] 9.5 `[I]` Pass source Electron domain smoke after runtime/composition changes.
- [ ] 9.6 `[I]` Pass packaged Electron smoke and license audit for the delivery milestone.
- [ ] 9.7 `[I]` Audit for old entrypoints, mutable production Workflow execution, private cross-boundary imports, duplicate runtimes/stores/transports, Host hard-coding, stale generated files, and dead migration files.
- [ ] 9.8 `[A+B]` Prepare mentor handoff with baseline/final SHAs, commit range, ownership map, OpenSpec status, validation evidence, UI media, residual risks, and recommended merge order.
