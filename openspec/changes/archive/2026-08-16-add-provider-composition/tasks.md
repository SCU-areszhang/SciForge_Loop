## 1. Public Composition Contracts

- [x] 1.1 Define strict declaration/runtime contracts for `main.document-provider-factory` and `main.content-space-provider-factory`, including contract version, bounded Provider Kind, factory value, and exact process ownership.
- [x] 1.2 Export the generic composition contracts only through approved public Domain SDK subpaths; add no Host-private or cross-process type dependency.
- [x] 1.3 Add schema tests for invalid kind/version, declaration/runtime mismatch, extra/missing contribution, and one package contributing both kinds independently.

## 2. Domain-Owned Catalogs

- [x] 2.1 Compose a Document Provider catalog consumed only by Shared Documents and a Content Space Provider catalog consumed only by Content Space.
- [x] 2.2 Reject duplicate Provider Kind, unsupported contract major, incompatible runtime value, missing installed implementation, and caller-selected package identity.
- [x] 2.3 Prove catalog/factory construction performs zero network, authentication, credential retrieval, content access, or remote mutation and uses lazy operation-time dependencies.

## 3. Instance-Pinned Routing

- [x] 3.1 Resolve trusted ProviderInstanceRef to Provider Kind through the non-secret local directory before selecting a catalog entry.
- [x] 3.2 Fail unknown/missing Provider before endpoint, credential, or network use; return bounded provider-neutral outcomes.
- [x] 3.3 Reject file-extension routing, arbitrary defaults, Provider fallback, reference reinterpretation, and silent copy/migration.

## 4. Architecture and Packaging

- [x] 4.1 Add source scans/tests forbidding vendor names, provider/domain switches, special IPC, Agent Runtime branches, raw Clients, credentials, and business capability unions in Host Core.
- [x] 4.2 Prove adding/removing a trusted integration package changes generated source and packaged catalogs without editing a central feature map.
- [x] 4.3 Prove one package can contribute both factories while either contribution can be independently absent, blocked, invalid, or removed.
- [x] 4.4 Run Domain SDK tests/typecheck, generated-composition freshness, package-boundary tests, full regression, changed-file lint, and source/packaged smoke.
