## 1. Dependency and Package Contracts

- [x] 1.1 Complete/archive `add-portable-resource-references` and `add-provider-composition` before runtime integration.
- [x] 1.2 Scaffold the trusted compile-time Content Space package with strict manifest, definition/main/renderer exports, tests/typecheck, lazy activation, and no Workspace Server or sidecar.
- [x] 1.3 Define provider-neutral readiness, bounded errors/receipts, Content Container Reference, Content File Reference, and gated Artifact Reference schemas/codecs.
- [x] 1.4 Define ContentSpaceProvider and consume only `main.content-space-provider-factory` contributions through a domain-owned catalog.
- [x] 1.5 Close the Provider Instance Directory composition prerequisite with a strict generic manifest/runtime entry contract, duplicate rejection, lazy read-only Host projection, generated composition tests, and no Provider Kind/default switch.

## 2. Provider-Neutral Service and Mock

- [x] 2.1 Implement mock-backed contracts for capability discovery, container selection, bounded navigation, create-folder, upload-new, download, portal target, and immutable-version observation.
- [x] 2.2 Route all callers through one Content Space Broker/domain service path and the pinned Provider Instance; expose no Provider factory, Connector, raw Client, endpoint, or credential.
- [x] 2.3 Add negative tests for duplicate/missing/incompatible Provider, extension-based routing, Provider fallback, overwrite/update/move/delete/share/ACL/rollback, premature ArtifactReference, and cross-provider identity reuse.
- [x] 2.4 Add package-boundary tests forbidding Shared Documents, vendor DTOs, integration packages, Project, Task, Coordinator, Workspace, and Host-private imports.

## 3. Unified Content Space UI

- [x] 3.1 Implement provider-neutral Provider Instance/container selection and bounded directory/file list driven only by public Content Space schemas.
- [x] 3.2 Implement upload-new, download, resource selection, live/fixed reference, progress, bounded error, and readiness presentation without Provider-specific branches.
- [x] 3.3 Resolve any portal target as a short-lived opaque main-validated handle through the canonical external-browser path; allow no Provider renderer injection or raw URL.
- [x] 3.4 Prove blocked/unsupported capabilities are driven by the trusted capability matrix and cannot be promoted by renderer input or filename extension.

## 4. Reference and Write Governance

- [x] 4.1 Require current Provider authorization, explicit container target, bounds, cancellation, and one logical invocation identity for create-folder/upload-new.
- [x] 4.2 Return typed conflict or `outcome_unknown` instead of overwrite, silent target change, or blind retry.
- [x] 4.3 Download only through a generic Host-owned destination path with current reauthorization and no token-bearing renderer/browser URL.
- [x] 4.4 Issue ArtifactReference only after the selected Provider proves immutable version identity, retention, and version-specific retrieval.

## 5. Verification

- [x] 5.1 Run package tests/typecheck, Provider catalog tests, codec/materialization tests, generated composition freshness, capability governance, package boundaries, and changed-file lint.
- [x] 5.2 Run mock UI/service tests for missing Provider, blocked readiness, collision, uncertain outcome, cancellation, unsafe portal target, and no fallback.
- [x] 5.3 Run full regression plus source and packaged application smoke/security tests before enabling any real Provider operation.
