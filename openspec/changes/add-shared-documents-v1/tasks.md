## 0. PR 0 - Contract and Design Freeze

Every task line is a complete contract in the order `owner; exact lease; prerequisites; artifact/action; binary exit`. `lease none/read-only` forbids writes and its artifact is a review message containing a P0-P3 finding table and final recommendation. All `src/**`, `tests/**`, `scripts/**`, `sciforge.domain.json`, and package-local `package.json` paths in Domain feature PRs are relative to `packages/domains/shared-documents/`; other paths are root-relative. `${SCIFORGE_EVIDENCE_DIR}` must resolve beneath untracked `temp/shared-documents-gates/<run-id>/` and nowhere else. A lease is exclusive while its task runs; overlapping leases require the listed prerequisite order or Integrator serialization. In an exit clause, `pass`/`passes` means the named command exits 0 and every named assertion is true; `zero`/`no` means the corresponding mechanical count is exactly zero.

- [x] 0.1 SD0-00 — Integrator; lease `package.json`, `package-lock.json`; prerequisite Preflight; pin `@fission-ai/openspec@1.8.0`; exit: repository CLI reports 1.8.0.
- [x] 0.2 SD0-01 — Integrator; lease `proposal.md`; prerequisite SD0-00; define problem/scope/non-goals/private-alpha/package unit; exit: proposal unlocks specs/design.
- [x] 0.3 SD0-02 — Integrator; lease `design.md`; prerequisite SD0-01; absorb historical PLAN and Superseded decisions without local paths/chat dependency; exit: no conflicting effective decision.
- [x] 0.4 SD0-03 — Integrator; lease `specs/**`; prerequisite SD0-02; define shared documents, external URI, and Capability metadata deltas; exit: every requirement has owner, binary AC, canonical path, failure, and forbidden fallback.
- [x] 0.5 SD0-04 — Integrator; lease `design.md`; prerequisite SD0-02; freeze identity, deployment, writer matrix, revision, mutation, durability, models, privacy, limits, and artifacts; exit: no implementation-changing open question.
- [x] 0.6 SD0-05 — Integrator; lease `design.md`; prerequisite SD0-03/04; freeze PR1/PR2 fixtures, seeds, assertions, timeout, owner, evidence, matrix, and stop rule; exit: no spike runs in PR0.
- [x] 0.7 SD0-06 — Integrator; lease `tasks.md`; prerequisite SD0-03/05; map SD0-SD11 with owner/lease/prerequisite/artifact/exit; exit: PR12 is absent from the active change tasks and remains only in migration/PR-description guidance.
- [x] 0.8 SD0-07 — Reviewer (read-only); lease none/read-only; prerequisite SD0-06; deliver P0-P3 final-diff review messages covering contradictions, duplicate truth/path, leakage, Host hard-code/private imports, scope creep, public exposure, and superseded residue; exit: zero unresolved P0-P3 finding after strict revalidation.

## 1. PR 1 - Domain, Contracts, and CLI Skeleton

- [ ] 1.1 SD1-01 — Integrator; lease root `package.json`, root `package-lock.json`, package-local `package.json`, `sciforge.domain.json`, `tsconfig*.json`; prerequisite Design Freeze; create discoverable package and real scripts; exit: package validation/build commands exit 0.
- [ ] 1.2 SD1-02 — Contract Agent; lease `src/contract/**`; prerequisite SD1-01; deliver strict identity/binding/endpoint/room/result/error/pagination/precondition/operation/asset schemas; exit: contract vectors pass.
- [ ] 1.3 SD1-03 — Model Agent; lease `src/model/**`; prerequisite SD1-02; deliver collaboration envelope, branded opaque revision interface, writer types, MV primitives; exit: no authoritative `system.*` or hash.
- [ ] 1.4 SD1-04 — Build Agent; lease `src/cli.ts`, `src/server/health.ts`, `scripts/build-cli.mjs`, `package.json`; prerequisite SD1-01; deliver compiled ESM health-only CLI and Node fail-fast; exit: compiled lifecycle smoke passes.
- [ ] 1.5 SD1-05 — Integrator; lease root `package.json`, root `package-lock.json`, package-local `package.json`; prerequisite SD1-01; produce the dependency-advisor report, then pin the exact Yjs/Hocuspocus/Tiptap graph and supported Node engine; exit: dependency report has one resolved Yjs instance, zero floating direct dependency, and dependency verification exits 0.
- [ ] 1.6 SD1-06 — Integrator; lease `src/definition.ts`, `sciforge.domain.json`, root `src/shared/installed-domain-packages.ts`, root `src/main/modules/installed-domain-main.ts`, root `src/renderer/src/domain-modules/installed-domain-renderer.ts`, root `packages/workers/workspace-host/src/generated/installed-domain-workspace-server.ts`; prerequisite SD1-01; register only real contributions; exit: no no-op main/renderer/server declaration.
- [ ] 1.7 SD1-07 — Test Agent; lease `tests/contracts/**`, `tests/packaging/**`; prerequisite SD1-02-06; test manifest, identity, endpoints, opaque pass-through, CLI build/pack/install; exit: unit/integration/tarball smoke pass.
- [ ] 1.9 SD1-09 — Build Agent; lease root `scripts/domain-packages.mjs`, root `scripts/domain-packages.test.mjs`; prerequisite SD1-01; add generic dependency-ordered build before required-path validation; exit: fixture add/remove test exits 0 and Domain-ID hard-code count is zero.
- [ ] 1.10 SD1-10 — SDK Agent; lease root `packages/domain-sdk/src/{contract,main,renderer,index}.ts`, root `packages/domain-sdk/src/{contract,main,renderer}.test.ts`; prerequisite SD1-01; expose generic capability factory/i18n/lifecycle constants/types; exit: package boundary tests pass and private-import count is zero.
- [ ] 1.11 SD1-11 — CI Agent; lease `.github/workflows/**`, `scripts/shared-documents-ci.mjs`; prerequisite SD1-04/07; add Node 22.13.x quality job for build/test/tarball; exit: workflow executes real scripts.
- [ ] 1.12 SD1-12 — Spike Agent; lease `tests/feasibility/package-boundary/**`; prerequisite SD1-04/05/09; run frozen package-boundary protocol; exit: PASS evidence or blocked stop-rule result.
- [ ] 1.13 SD1-13 — Integrator; lease root `package.json`, root `package-lock.json`, package-local `package.json`, `sciforge.domain.json`, `tsconfig*.json`, root `src/shared/installed-domain-packages.ts`, root `src/main/modules/installed-domain-main.ts`, root `src/renderer/src/domain-modules/installed-domain-renderer.ts`, root `packages/workers/workspace-host/src/generated/installed-domain-workspace-server.ts`; prerequisite SD1-01-07 and SD1-09-12; integrate and refresh composition once; exit: PR1 full gate passes.
- [ ] 1.8 SD1-08 — Reviewer (read-only); lease none/read-only; prerequisite SD1-13; deliver P0-P3 review message for final PR1 diff covering root exports, private imports, duplicate process representation; exit: zero unresolved finding.

## 2. PR 2 - Test-only Feasibility Gate

- [ ] 2.1 SD2-01 — Revision Agent; lease `tests/feasibility/revision/**`; prerequisite PR1; deliver JUnit/JSON opaque-revision evidence; exit: allocation/replay/restart/pass-through assertions pass.
- [ ] 2.2 SD2-02 — Protocol Agent; lease `tests/feasibility/protocol/**`; prerequisite PR1; deliver JUnit/JSON awareness/sync/update pre-apply admission evidence; exit: no whole-frame apply assumption.
- [ ] 2.3 SD2-03 — Model Agent; lease `tests/feasibility/control-poisoning/**`; prerequisite PR1; deliver JUnit/JSON control-poisoning evidence; exit: control snapshots unchanged.
- [ ] 2.4 SD2-04 — Rich Spike Agent; lease `tests/feasibility/rich-writeback/**`; prerequisite PR1; deliver JUnit/JSON incremental y-prosemirror stable-ID evidence; exit: no whole-document fallback.
- [ ] 2.5 SD2-05 — Persistence Agent; lease `tests/feasibility/durability/**`; prerequisite PR1; deliver JUnit/JSON for every frozen crash injection point; exit: exact all-or-none/recovery matrix passes.
- [ ] 2.6 SD2-06 — Performance Agent; lease `tests/feasibility/near-limit/**`; prerequisite PR1; deliver JUnit/JSON/metrics for all five frozen fixtures; exit: p95/RSS/zero-loss budgets pass.
- [ ] 2.7 SD2-07 — Integrator; lease `packages/domains/shared-documents/package.json`, `openspec/changes/add-shared-documents-v1/**`, `${SCIFORGE_EVIDENCE_DIR}/feasibility/**` where the environment resolves only under untracked `temp/shared-documents-gates/<run-id>/`; prerequisite SD2-01-06; aggregate `test:feasibility` and apply stop procedure only if needed; exit: strict validation exits 0 and every JUnit/JSON MUST status is PASS.
- [ ] 2.8 SD2-08 — Reviewer (read-only); lease none/read-only; prerequisite SD2-07; deliver P0-P3 review message for final PR2 diff covering production graph/fallback/false guarantees/leakage; exit: zero unresolved finding and production imports no spike harness.

## 3. PR 3 - Capability Metadata Closure

- [ ] 3.1 SD3-01 — Contract Agent; lease root `packages/domain-sdk/src/agent-execution.ts`, root `packages/domain-sdk/src/agent-execution.test.ts`, root `src/shared/capability-broker.ts`; prerequisite Design Freeze and active `unify-capability-broker` tasks 10.2/10.4 complete; deliver descriptor/tool metadata and idempotency invariants; exit: typed mapping/readiness tests pass.
- [ ] 3.2 SD3-02 — Backend Agent; lease root `src/main/capabilities/**`, root `src/main/runtime/agent-runtime/runtime-capability-broker*`; prerequisite SD3-01; propagate authoritative effect/resource/version/idempotency; exit: capability Broker parity suite exits 0 and discover/observe/invoke metadata mismatches equal zero.
- [ ] 3.3 SD3-03 — Governance Agent; lease root `packages/execution-governance/src/**`; prerequisite SD3-02; record trusted before/after/changed/replayed metadata; exit: governance tests pass.
- [ ] 3.4 SD3-04 — Trace Agent; lease root `packages/full-trace/src/**`, root `src/main/services/agent-runtime-trace-service*`; prerequisite SD3-03; implement allowlist metadata-only record; exit: no content/path/URI fields.
- [ ] 3.5 SD3-05 — Test Agent; lease root `tests/capability-metadata/**`; prerequisite SD3-01-04; deliver cross-runtime audience/readiness/freshness/idempotency/canary evidence; exit: focused suites pass.
- [ ] 3.6 SD3-06 — Reviewer (read-only); lease none/read-only; prerequisite SD3-05; deliver P0-P3 final-diff review message covering Domain-ID hard-code, duplicate schema/provider, trace special case/fallback; exit: zero unresolved finding.

## 4. PR 4 - Generic External URI Foundation

- [ ] 4.1 SD4-01 — SDK Agent; lease root `packages/domain-sdk/src/external-uri.ts`, root `packages/domain-sdk/src/external-uri.test.ts`, root `packages/domain-sdk/src/{main,renderer,index}.ts`; prerequisite PR1; define envelope, scheme/authority, results, register/dispose; exit: contract tests pass.
- [ ] 4.2 SD4-02 — Main Agent; lease root `src/main/external-uri/**`; prerequisite SD4-01; capture open-url/cold argv/second-instance into frozen bounded FIFO; exit: platform fixtures pass.
- [ ] 4.3 SD4-03 — Preload Agent; lease root `src/preload/external-uri/**`; prerequisite SD4-02; implement acknowledged FIFO/drain/fan-out/unsubscribe; exit: no Domain facade.
- [ ] 4.4 SD4-04 — Renderer Core Agent; lease root `src/renderer/src/external-uri/**`; prerequisite SD4-01/03; owner-aware match/defer/dispose; exit: routing/lifecycle tests pass.
- [ ] 4.5 SD4-05 — Build Agent; lease root `electron-builder.config.cjs`, root `electron.vite.config.ts`, root `src/main/renderer-csp*`, root `src/main/packaging-config.test.ts`, root `scripts/electron-domain-smoke-support.test.mjs`; prerequisite SD4-02; register protocol and generic network/image classes; exit: packaging/CSP tests pass and fixed shared-document domain/port count is zero.
- [ ] 4.6 SD4-06 — Test Agent; lease root `tests/external-uri/**`; prerequisite SD4-02-05; cover cold/hot/64-65/size/TTL/duplicate/no/multiple handler/workspace/platform; exit: source/packaged smoke passes.
- [ ] 4.7 SD4-07 — Renderer Core Agent; lease root `src/renderer/src/external-uri/lifecycle*`; prerequisite SD4-04; fix session/runtime/workspace binding and reverse disposal; exit: mismatch/dispose tests pass.
- [ ] 4.8 SD4-08 — Reviewer (read-only); lease none/read-only; prerequisite SD4-06/07; deliver P0-P3 final-diff review message covering business parsing, raw URI log, fixed CSP, false-auth claim; exit: zero unresolved finding.

## 5. PR 5 - Server Core

- [ ] 5.1 SD5-00 — Conformance Agent; lease none/read-only; prerequisite PR2 merged; deliver a protocol-ID-to-production-helper mapping and P0-P3 deviation table; exit: every accepted protocol ID has exactly one production helper and deviation count is zero.
- [ ] 5.2 SD5-01 — Server Agent; lease `src/server/{boot,routes,revision}/**`; prerequisite SD5-00; implement one guarded HTTP/WS server and production revision issuer; exit: startup/route/log tests pass.
- [ ] 5.3 SD5-02 — Persistence Agent; lease `src/server/persistence/**`; prerequisite SD5-00; implement exact PRAGMAs/schema/atomic transaction/store queue/lock; exit: durability tests pass.
- [ ] 5.4 SD5-03 — Collaboration Agent; lease `src/server/collaboration/**`; prerequisite SD5-01/02; implement proven admission and shared per-room queue; exit: two-client collaboration suite exits 0, all clients converge, and control-row mutation count from Human updates is zero.
- [ ] 5.5 SD5-04 — Catalog Agent; lease `src/server/catalog/**`, `src/server/lifecycle/**`; prerequisite SD5-02/03; implement registry/overlay/default/initialization/archive/restore; exit: lifecycle crash tests pass.
- [ ] 5.6 SD5-05 — Asset Agent; lease `src/server/assets/**`; prerequisite SD5-01/02; implement UUID raw upload/validation/direct comparison/atomic storage/read; exit: limits/retry/crash tests pass.
- [ ] 5.7 SD5-06 — Lifecycle Agent; lease `src/cli.ts`, `src/server/shutdown/**`; prerequisite SD5-02-05; implement signal barrier/checkpoint/exit; exit: no process/promise/WAL leak.
- [ ] 5.8 SD5-07 — Operation Agent; lease `src/server/operations/**`; prerequisite SD5-02-04; implement one shadow executor/canonical bytes/receipt retention/durable publish; exit: fault/replay tests pass.
- [ ] 5.9 SD5-08 — Test Agent; lease `tests/server/**`; prerequisite SD5-01-07; run two-client, poisoning, restart, crash, store, five-seed hard-kill, corrupt/future-state suite; exit: production durability baseline passes.
- [ ] 5.10 SD5-09 — Reviewer (read-only); lease none/read-only; prerequisite SD5-08; deliver P0-P3 final-diff review message covering truth ownership and duplicate routes/stores/engines; exit: zero unresolved finding.

## 6. PR 6 - Walking Skeleton

- [ ] 6.1 SD6-01 — Main Agent; lease `src/main/**`; prerequisite PR3-5; implement local binding, HTTP client, capability factory/lifecycle; exit: main-module contract tests exit 0 and caller-scope negative cases all reject.
- [ ] 6.2 SD6-02 — Renderer Agent; lease `src/renderer/shell/**`; prerequisite SD6-01; implement command/toolbar/overlay/Catalog/tabs/create/join state; exit: renderer state/widget tests exit 0 with create/join audience assertions.
- [ ] 6.3 SD6-03 — Provider Agent; lease `src/renderer/provider/**`; prerequisite SD6-02; implement shared socket, room/IDB readiness and disposal; exit: StrictMode/leak suite exits 0 with zero retained provider/listener.
- [ ] 6.4 SD6-04 — Rich Model Agent; lease `src/model/rich/**`; prerequisite SD6-03; implement paragraph/stable-ID shared schema; exit: initialization-race suite exits 0 with exactly one hydrated root.
- [ ] 6.5 SD6-05 — Agent API Agent; lease `src/operations/minimal/**`; prerequisite SD6-01/04; implement create/open/read/apply/preconditions/replay; exit: bounded Agent suite exits 0 with typed rejection and replay assertions.
- [ ] 6.6 SD6-06 — Integration Agent; lease `tests/e2e/walking-skeleton/**`; prerequisite SD6-02-05; join Human and Agent on one Y.Doc; exit: canonical-path E2E exits 0 and architecture search finds no second IPC/service path.
- [ ] 6.7 SD6-07 — Test Agent; lease `tests/agents/**`, `tests/e2e/**`, `${SCIFORGE_EVIDENCE_DIR}/walking-skeleton/**`; prerequisite SD6-06; cover two paths/project, replay, restart, offline, revision semantics; exit: eight hard gates plus 2/10-client budgets exit 0.
- [ ] 6.9 SD6-09 — Conformance Agent; lease `tests/conformance/**`; prerequisite SD6-04; compare production helper to accepted PR2 fixture; exit: conformance suite exits 0 with zero fallback/drift finding.
- [ ] 6.10 SD6-10 — Integrator; lease `src/{main,renderer}.ts`, `src/definition.ts`, `sciforge.domain.json`, root `src/shared/installed-domain-packages.ts`, root `src/main/modules/installed-domain-main.ts`, root `src/renderer/src/domain-modules/installed-domain-renderer.ts`; prerequisite SD6-01-07/09; atomically activate real contributions; exit: package/full/Electron gate commands all exit 0.
- [ ] 6.8 SD6-08 — Reviewer (read-only); lease none/read-only; prerequisite SD6-10; deliver P0-P3 final-diff review message covering Y.Doc-first, overwrite, path leakage; exit: zero unresolved finding.

## 7. PR 7 - Rich Document Slice

- [ ] 7.1 SD7-01 — Contract Agent; lease `src/contract/rich/**`; prerequisite PR6; deliver node/mark/block/operation/read schemas; exit: contract command exits 0 with exact boundary vectors.
- [ ] 7.2 SD7-02 — Model Agent; lease `src/model/rich/**`; prerequisite SD7-01; implement schema/lookup/move/delete/relative positions; exit: concurrency command exits 0 with stable-ID assertions.
- [ ] 7.3 SD7-03 — Renderer Agent; lease `src/renderer/rich/**`; prerequisite SD7-02; implement frozen nodes/marks/math/table; exit: renderer UI test command exits 0.
- [ ] 7.4 SD7-04 — Undo Agent; lease `src/renderer/rich/undo*`; prerequisite SD7-02/03; implement origin-only Y.UndoManager; exit: undo suite exits 0 with remote/Agent isolation assertions.
- [ ] 7.5 SD7-05 — Agent API Agent; lease `src/operations/rich/**`; prerequisite SD7-02; implement one PM transaction/updateYFragment; exit: atomic stable-ID suite exits 0.
- [ ] 7.6 SD7-06 — Context Agent; lease `src/context/rich/**`; prerequisite SD7-02/03; implement 200-block/50k paging and explicit bounded selection; exit: privacy/bounds suite exits 0 and over-boundary vectors reject.
- [ ] 7.7 SD7-07 — Test Agent; lease `tests/rich/**`; prerequisite SD7-02-06; cover races, delete version, marks, undo, 300k/tombstone fixtures; exit: package rich gate exits 0.
- [ ] 7.8 SD7-08 — Reviewer (read-only); lease none/read-only; prerequisite SD7-07; deliver P0-P3 final-diff review message covering Host-private editor, overwrite, unstable addressing; exit: zero unresolved finding.

## 8. PR 8 - Base Slice

- [ ] 8.1 SD8-01 — Contract Agent; lease `src/contract/base/**`; prerequisite PR6; deliver entity/view/cell/limit/operation schemas; exit: Base contract command exits 0 with exact limit vectors.
- [ ] 8.2 SD8-02 — Model Agent; lease `src/model/base/core/**`; prerequisite SD8-01; implement Y.Map layout/order/normalization/indexes; exit: convergence/order command exits 0.
- [ ] 8.3 SD8-03 — Conflict Agent; lease `src/model/base/conflicts/**`; prerequisite SD8-02; implement Y.Text/MV/equivalence/Human resolution; exit: conflict suite exits 0 with all unequal/equivalent vectors asserted.
- [ ] 8.4 SD8-04 — Grid Agent; lease `src/renderer/base/grid/**`; prerequisite SD8-02; implement fixed two-axis virtualization/edit/keyboard/selection; exit: viewport suite exits 0 with frozen overscan counts.
- [ ] 8.5 SD8-05 — View Agent; lease `src/model/base/views/**`, `src/renderer/base/views/**`; prerequisite SD8-02/04; implement field presentation/AND filter/5-sort/20-view; exit: derived-state suite exits 0 with limit rejection.
- [ ] 8.6 SD8-06 — Agent API Agent; lease `src/operations/base/**`; prerequisite SD8-02/03; implement stable semantic operations and targeted conflict rejection; exit: Base Agent suite exits 0.
- [ ] 8.7 SD8-07 — Test Agent; lease `tests/base/**`; prerequisite SD8-02-06; cover concurrency, 2k x 50, 20-table, near-20-MiB, conflict/paging; exit: package Base gate exits 0.
- [ ] 8.9 SD8-09 — Context Agent; lease `src/context/base/**`; prerequisite SD8-04/05; implement explicit bounded selected-row context; exit: privacy/bounds suite exits 0 and over-boundary vectors reject.
- [ ] 8.8 SD8-08 — Reviewer (read-only); lease none/read-only; prerequisite SD8-07/09; deliver P0-P3 final-diff review message covering LWW/index/name/unsupported scope; exit: zero unresolved finding.

## 9. PR 9 - Collaboration, Assets, Presence, Offline

- [ ] 9.1 SD9-01 — Comment Model Agent; lease `src/model/comments/**`; prerequisite PR7/8; implement thread/reply/state/targets; exit: comment model suite exits 0.
- [ ] 9.2 SD9-02 — Rich Comment Agent; lease `src/renderer/rich/comments/**`; prerequisite SD9-01; implement relative range/quote/orphan/retarget; exit: Rich movement/orphan suite exits 0.
- [ ] 9.3 SD9-03 — Base Comment Agent; lease `src/renderer/base/comments/**`; prerequisite SD9-01; implement cell/orphan/selection; exit: Base deletion/orphan suite exits 0.
- [ ] 9.4 SD9-04 — Asset Agent; lease `src/renderer/assets/**`, `src/model/assets/**`; prerequisite PR5/7; implement upload/read/cache/placeholder/image attrs; exit: image bounds/retry/cache suite exits 0.
- [ ] 9.5 SD9-05 — Presence Agent; lease `src/renderer/presence/**`; prerequisite PR6; implement 100 ms awareness; exit: throttle/no-persist suite exits 0.
- [ ] 9.6 SD9-06 — Agent Presence Agent; lease `src/main/agent-presence/**`; prerequisite PR6; implement trusted start/end and 15 s TTL; exit: TTL/exception cleanup suite exits 0.
- [ ] 9.7 SD9-07 — Offline Agent; lease `src/renderer/offline/**`; prerequisite SD9-01-06; implement cached edits/rename parity/disabled operations/archive reconnect rules; exit: offline convergence/disposal suite exits 0.
- [ ] 9.8 SD9-08 — Test Agent; lease `tests/privacy/**`, `tests/collaboration/**`; prerequisite SD9-01-07; establish `test:privacy`; exit: anchor/asset/presence/offline/archive matrix exits 0 with zero canary leak.
- [ ] 9.10 SD9-10 — Lifecycle API Agent; lease `src/operations/lifecycle/**`; prerequisite PR5/6; implement rename/archive/restore through engine; exit: confirmation/replay suite exits 0.
- [ ] 9.11 SD9-11 — Comment API Agent; lease `src/operations/comments/**`; prerequisite SD9-01/PR5; implement create/reply/resolve/reopen, no retarget; exit: replay/precondition suite exits 0.
- [ ] 9.12 SD9-12 — Agent Test Agent; lease `tests/agents/collaboration/**`, `tests/e2e/collaboration/**`; prerequisite SD9-10/11; cover approval, archive disconnect, typed results; exit: Agent/E2E commands exit 0.
- [ ] 9.9 SD9-09 — Reviewer (read-only); lease none/read-only; prerequisite SD9-08/12; deliver P0-P3 final-diff review message covering content trace, Agent identity, control copy; exit: zero unresolved finding.

## 10. PR 10 - Sharing and Exchange

- [ ] 10.1 SD10-01 — Link Contract Agent; lease `src/contract/sharing/**`; prerequisite PR4/9; define exact locator/origin rules; exit: malformed/platform vector command exits 0.
- [ ] 10.2 SD10-02 — Renderer Agent; lease `src/renderer/sharing/**`; prerequisite SD10-01; connect OS/manual ingress and explicit join/open; exit: parser parity suite exits 0.
- [ ] 10.3 SD10-03 — Binding Agent; lease `src/main/binding/**`; prerequisite SD10-01/02; complete create/join/unbind/rebind/copy/clone/conflict; exit: binding state-machine suite exits 0 with every transition asserted.
- [ ] 10.4 SD10-04 — Share Agent; lease `src/operations/share/**`; prerequisite SD10-01; generate round-trip compute locator; exit: effect/audience suite exits 0.
- [ ] 10.5 SD10-05 — Rich Exchange Agent; lease `src/exchange/rich/**`; prerequisite PR7/9; implement Markdown and structural ZIP round-trip; exit: Rich IDs/comments/assets round-trip suite exits 0.
- [ ] 10.6 SD10-06 — Base Exchange Agent; lease `src/exchange/base/**`; prerequisite PR8/9; implement CSV/multi-CSV ZIP; exit: Base fields/views/IDs/comments round-trip suite exits 0.
- [ ] 10.7 SD10-07 — Conflict Agent; lease `src/exchange/validation/**`; prerequisite SD10-06; reject unresolved scalar export; exit: unresolved-conflict suite exits 0 with zero exported bytes.
- [ ] 10.8 SD10-08 — Test Agent; lease `tests/sharing/**`, `tests/exchange/**`; prerequisite SD10-01-07; run endpoint/path/platform/corruption/limit/effect matrix; exit: sharing/exchange E2E gate exits 0.
- [ ] 10.9 SD10-09 — Reviewer (read-only); lease none/read-only; prerequisite SD10-08; deliver P0-P3 final-diff review message covering watcher/mirror, Host parsing, attachments, path/auth claims; exit: zero unresolved finding.

## 11. PR 11 - Hardening and Release Gate

- [ ] 11.1 SD11-01 — Load Agent; lease `tests/load/**`, `${SCIFORGE_EVIDENCE_DIR}/load/**`; prerequisite PR10; run frozen 50-client and all five exact near-limit matrices; exit: every JUnit/JSON status PASS, p95 <200 ms, RSS <512 MiB, and zero crash/OOM/loss/error.
- [ ] 11.2 SD11-02 — Fault Agent; lease `tests/faults/**`, `${SCIFORGE_EVIDENCE_DIR}/faults/**`; prerequisite PR10; run network/update/poisoning/hard-kill/WAL/SHM/disk/checkpoint faults; exit: fault command exits 0 and every recovery invariant is true.
- [ ] 11.3 SD11-03 — Lifecycle Agent; lease `tests/lifecycle/**`, `${SCIFORGE_EVIDENCE_DIR}/lifecycle/**`; prerequisite PR10; test tab/overlay/workspace/package/app disposal; exit: lifecycle command exits 0 with zero retained listener/timer/socket/doc.
- [ ] 11.4 SD11-04 — Privacy Agent; lease `tests/privacy/release/**`, `${SCIFORGE_EVIDENCE_DIR}/privacy/**`; prerequisite PR10; run selected/unselected/content/comment/awareness/raw canaries; exit: privacy command exits 0 and persistent canary count is zero.
- [ ] 11.5 SD11-05 — Packaging Agent; lease `tests/packaging/**`, `${SCIFORGE_EVIDENCE_DIR}/packaging/**`; prerequisite PR10; verify CLI tarball, source/unpacked Electron, and installed protocol on three platforms; exit: each platform JUnit/JSON reports real OS launcher PASS.
- [ ] 11.6 SD11-06 — Architecture Agent; lease `tests/architecture/**`, `${SCIFORGE_EVIDENCE_DIR}/architecture/**`; prerequisite PR10; audit composition, governance, imports, hard-code, dead paths generically; exit: architecture command exits 0 with zero violation.
- [ ] 11.7 SD11-07 — Docs Agent; lease package-local `README.md`, `docs/private-alpha-runbook.md`; prerequisite PR10; document perimeter, proxy/firewall, backup/restore, SHM, limits; exit: documentation lint exits 0 and direct-public prohibition assertion is present.
- [ ] 11.8 SD11-08 — Product Test Agent; lease `${SCIFORGE_EVIDENCE_DIR}/uat/**`; prerequisite SD11-01-07; validate Human/Codex/Claude/child Agent; exit: UAT JSON contains PASS for every actor and canonical-path assertion.
- [ ] 11.10 SD11-10 — CI Agent; lease `.github/workflows/**`; prerequisite SD11-01-05; expand final matrix and make releases depend on it; exit: every required matrix job reports success and uploads redacted evidence.
- [ ] 11.11 SD11-11 — Evidence Agent; lease `tests/evidence/**`, root `packages/domain-sdk/src/evidence.ts`, root `packages/domain-sdk/src/evidence.test.ts`, `${SCIFORGE_EVIDENCE_DIR}/schema/**`; prerequisite SD11-01-08/10; produce redacted JUnit/JSON/metrics and generic package audit; exit: schema/retention/privacy commands exit 0 with zero canary leak.
- [ ] 11.12 SD11-12 — Integrator; lease root `scripts/installed-domain-protocol-smoke.mjs`, root `scripts/installed-domain-protocol-smoke.test.mjs`; prerequisite SD11-05; add manifest-discovered installed-protocol runner without Domain ID; exit: three-platform package smoke JSON statuses all PASS.
- [ ] 11.9 SD11-09 — Reviewer (read-only); lease none/read-only; prerequisite SD11-08/10/11/12; deliver P0-P3 final-diff SHALL/AC traceability report and release recommendation; exit: zero unresolved blocker.
