## 1. Generic Contracts

- [x] 1.1 Define the bounded versioned envelope, canonical serialization, closed errors, codec contract, authority-resolver contract, and export projection in one provider-neutral public package.
- [x] 1.2 Add strict size/count/string bounds and reject URLs, credentials, connection IDs, provider DTOs, `res_*`, and `cap_*` values in portable positions.
- [x] 1.3 Add contract tests for canonical round trips, unsupported versions, malformed identity, and bounded failures.

## 2. Composition Registries

- [x] 2.1 Add generic codec and authority-resolver contribution contracts with exact single ownership and duplicate rejection.
- [x] 2.2 Bind contributions through standard generated source and packaged composition without provider/domain switches.
- [x] 2.3 Add architecture tests proving the generic package has no Document, Content Space, OpenContent, Project, Task, or MIME-type routing union.

## 3. Materialization and Export

- [x] 3.1 Implement the validate-envelope → codec → local authority lookup pipeline and prove every structural/unknown-authority failure occurs before resolver/network invocation.
- [x] 3.2 Pass Host-asserted principal context to the registered resolver and issue local resources only through the existing Capability Broker resource path.
- [x] 3.3 Implement provider-owned safe export projections for live authorized Broker resources without a generic raw-resource dump.
- [x] 3.4 Add lifecycle tests proving Broker references expire with process/audience/scope and never cross restart or node boundaries.

## 4. Verification

- [x] 4.1 Add codec conflict, forged authority, endpoint injection, SSRF canary, unauthorized export, and cross-node/restart negative tests.
- [x] 4.2 Run package typecheck/tests, generated composition freshness, package-boundary tests, root regression tests, and changed-file lint.
- [x] 4.3 Validate both source and packaged application composition paths before marking the change complete.
