## 1. Package and Dependencies

- [ ] 1.1 Complete/archive `add-provider-composition`, `add-content-space-v1`, the Content Space-first `add-opencontent-connector`, Portable Resource References, secure credentials, and required Host principal baseline; do not require `add-shared-documents-v1`, a Document Connector port, or `add-opencontent-document-provider-v1`.
- [ ] 1.2 Scaffold main-only trusted compile-time adapter package with strict manifest, exact exports, tests/typecheck, lazy factory, and no renderer/Workspace Server/Agent/MCP/IPC.
- [ ] 1.3 Register one `main.content-space-provider-factory` for Provider Kind `opencontent`; add no DocumentProvider contribution.
- [ ] 1.4 Bind only the composition-authorized OpenContent Connector Content Space port, prove construction without any Document port/package, and expose no raw Client/Token/DTO.

## 2. Strict Mapping and Readiness

- [ ] 2.1 Pin accepted OpenContent build/schemas and map selected container/list/create-folder/upload/download/portal results into bounded Content Space types/errors.
- [ ] 2.2 Implement capability/readiness projection with all operations blocked by default and caller promotion impossible.
- [ ] 2.3 Add HTTP-200 business-error, malformed DTO, schema drift, Token leakage, unknown instance, wrong principal, and consumer impersonation tests.

## 3. Dedicated-Tenant PoC

- [ ] 3.1 Require exact dedicated non-production tenant, least-privilege accounts, allowlisted roots/resources, stable Host Principal, secure enrollment, and one active API node per Human.
- [ ] 3.2 Implement only allowlisted container selection, bounded direct-child navigation, create-folder, upload-new, bounded download, and ContentFileReference as separately admitted `poc_only` operations.
- [ ] 3.3 Keep safe provider portal blocked until exact credential-free origin/path/redirect and main opaque-handle behavior pass.
- [ ] 3.4 If only shared tenant exists, expose no product UI/Agent/remote Task and retain only fixed-account/fixed-resource external verification harness.

## 4. Negative Gates

- [ ] 4.1 Keep production metadata/materialization blocked until BOLA fix/oracle; reject Project/team shadow ACL compensation.
- [ ] 4.2 Keep ArtifactReference blocked until immutable version/retention/version retrieval pass.
- [ ] 4.3 Reject overwrite/update/move/rename/delete/share/ACL/member/rollback/search/arbitrary-ID/remote Task/ordinary Agent and all Provider fallback.
- [ ] 4.4 Test collision, uncertain upload, cancellation, revoked access, token-bearing download, portal tampering, package pause/removal, and no contact with another Provider.

## 5. Verification

- [ ] 5.1 Run adapter tests/typecheck, Connector contract tests, Provider catalog tests, generated composition freshness, boundary/governance checks, and changed-file lint.
- [ ] 5.2 Run full regression plus source and packaged smoke/security tests before readiness promotion.
