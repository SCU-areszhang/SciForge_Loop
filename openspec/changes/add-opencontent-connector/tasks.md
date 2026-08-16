## 1. Dependency and Gate Baseline

- [ ] 1.1 Merge and archive `add-portable-resource-references`, `add-provider-composition`, and `add-secure-provider-credentials`, and verify the Host exposes a stable principal at the assurance required by each enabled profile.
- [ ] 1.2 Create a capability-scoped evidence matrix for formal OpenContent build/schema, per-user identity/authentication, Token lifecycle/revocation, API/API-browser-Skill coexistence, metadata BOLA, tenant isolation, and operation readiness.
- [ ] 1.3 Keep all network operations `blocked_by_contract` until their exact evidence and environment Gate passes; mocks, schemas, package boundaries, and contract tests may proceed.

## 2. Main-Only Package and Composition

- [ ] 2.1 Scaffold the trusted compile-time main-only Connector package with strict manifest, exact exports, tests/typecheck, lazy activation, and no renderer/Workspace Server/sidecar.
- [ ] 2.2 Add generic internal-service contribution binding for the OpenContent Content Space Provider adapter port using composition-derived consumer identity; define no Document port, optional Document method, or stub in this milestone.
- [ ] 2.3 Bind the Connector owner-scoped secure-credential facade and the generic OpenContent authority resolver without exposing either through Agent/UI/Broker discovery.
- [ ] 2.4 Add source and packaged generated-composition tests for missing, duplicate, conflicting, and unauthorized contributions.

## 3. Instance and Connection Foundation

- [ ] 3.1 Implement the trusted non-secret Provider Instance Directory with exact API/browser origin, tenant, TLS/redirect, and readiness policy.
- [ ] 3.2 Implement node-local non-secret Provider Connection metadata and current-principal-only resolution with explicit missing/ambiguous states.
- [ ] 3.3 Implement the documented per-user authentication/Token state machine only after formal lifecycle evidence passes, including single-flight renewal, logout/revocation reporting, and supersession without auto-login.
- [ ] 3.4 Add tests proving unknown instance, embedded endpoint, insufficient principal assurance, another-principal connection, and superseded sessions fail before unsafe credential/network use.

## 4. Typed Transport and Validation

- [ ] 4.1 Pin the accepted OpenContent build/contract and implement strict schemas for only selected requests, responses, business result codes, errors, pagination, and bounded receipts.
- [ ] 4.2 Implement the least-privilege token-free OpenContent Content Space Provider port; expose no raw HTTP, Token, Cookie, DTO, arbitrary endpoint, approval, document operation, or business semantic.
- [ ] 4.3 Add canonical timeouts, cancellation, limits, rate classification, TLS/origin policy, redaction, and non-secret diagnostics.
- [ ] 4.4 Add contract tests for HTTP-200 business errors, malformed/opaque payloads, SDK/service schema divergence, Token leakage, and consumer impersonation.

## 5. Materialization and Verification Profiles

- [ ] 5.1 Implement OpenContent authority resolution for portable materialization using local Directory lookup, current principal/connection, and current object authorization.
- [ ] 5.2 Keep production metadata/materialization blocked until the revoked-known-ID BOLA issue has a server fix or validated object-level permission oracle.
- [ ] 5.3 Implement a trusted dedicated-non-production Verification Profile with exact tenant, least-privilege accounts, root/resource allowlist, bounds, and operations.
- [ ] 5.4 When only a shared tenant exists, expose no product integration and validate only the fixed-account fixed-resource external harness.
- [ ] 5.5 Enforce one visibly active API node per Human for PoC and keep production blocked until API/API, API/browser, and API/Skill coexistence tests pass.

## 6. Verification

- [ ] 6.1 Run package tests/typecheck, generated composition freshness, capability-governance checks, package-boundary tests, and changed-file lint.
- [ ] 6.2 Run focused authentication, revocation, supersession, BOLA, schema, redaction, and zero-network negative suites without production data.
- [ ] 6.3 Run full regression plus source and packaged application smoke/security tests before any readiness promotion.
- [ ] 6.4 Prove removing/pausing the Connector and OpenContent Content Space adapter leaves Provider composition, Content Space mocks, other Providers, and the unified Content Space UI operational without requiring Shared Documents or any Document package.
