## Purpose

Defines the optional OpenContent implementation of ContentSpaceProvider and its isolated PoC/readiness Gates.

## ADDED Requirements

### Requirement: Adapter is independently composed
SciForge SHALL deliver `opencontent-content-space-provider` as an optional trusted compile-time main-only package that registers exactly one `main.content-space-provider-factory` for Provider Kind `opencontent`. It SHALL register no DocumentProvider, renderer, Agent tool, IPC, MCP, Workspace Server, or public Connector surface.

#### Scenario: Adapter is paused
- **WHEN** the package is omitted or disabled
- **THEN** Content Space, unified UI, mocks, and other ContentSpaceProviders SHALL continue while OpenContent instances report unavailable

### Requirement: Adapter consumes only bounded Connector port
The adapter SHALL use only its composition-bound token-free OpenContent Connector port and SHALL expose only ContentSpaceProvider types. It SHALL NOT access/store/refresh credentials, issue raw HTTP, accept arbitrary endpoint, expose provider DTO, or call the document adapter.

#### Scenario: Raw infrastructure is requested
- **WHEN** adapter code or caller requests Token, Cookie, raw Client/DTO, another consumer port, or endpoint
- **THEN** no such public contract SHALL exist and no OpenContent operation SHALL occur

#### Scenario: Document stack is absent
- **WHEN** Shared Documents, the Document Connector port, and the OpenContent Document Provider are not installed or implemented
- **THEN** the Content Space adapter SHALL still compose through its own port without a Document stub, optional method, or fallback

### Requirement: OpenContent PoC is dedicated and bounded
Product-integrated PoC SHALL require a dedicated non-production OpenContent tenant, least-privilege test users, exact Provider Instance/root/resource allowlist, one active API node per Human, and locally initiated operations. Shared-tenant access SHALL remain an external fixed-account/fixed-resource verification harness with no ordinary UI, Agent, or remote Task surface.

#### Scenario: Dedicated tenant Gate is absent
- **WHEN** only shared tenant or unbounded resources are available
- **THEN** the adapter SHALL expose no product-integrated operation regardless of successful harness calls

### Requirement: Only verified file-space operations may become PoC-only
Allowlisted container selection, bounded direct-child navigation, create-folder, upload-new, bounded download, ContentFileReference, and safe provider portal SHALL each begin `blocked_by_contract` and MAY become `poc_only` only after exact schema, identity, authority, bounds, transport, and outcome evidence passes. None SHALL initially be `production_ready`.

#### Scenario: One operation passes evidence
- **WHEN** upload-new passes while portal contract remains incomplete
- **THEN** only upload-new MAY be `poc_only`; portal and other incomplete operations remain blocked

### Requirement: Metadata BOLA blocks production
The adapter SHALL NOT mark catalog, metadata, reference resolution, or materialization `production_ready` while a revoked user can obtain folder/file metadata by known ID. SciForge Project membership, cached team membership, allowlists, or prior access SHALL NOT substitute for provider object authorization.

#### Scenario: Revoked metadata remains readable
- **WHEN** the target OpenContent build reproduces known-ID metadata access after revocation
- **THEN** production metadata operations SHALL remain `blocked_by_contract` until a server fix or validated object-level oracle closes the issue

### Requirement: Artifact Reference remains gated
The adapter SHALL issue only ContentFileReference until OpenContent formally guarantees immutable version identity, retention, and version-specific retrieval. File ID/GUID, current FileVerId, checksum, or upload receipt alone SHALL not enable ArtifactReference.

#### Scenario: Upload returns a version field
- **WHEN** immutability and retention semantics are not formally proven
- **THEN** the version field SHALL remain adapter-private evidence and ArtifactReference SHALL remain blocked

### Requirement: Excluded and fallback paths remain absent
The adapter SHALL expose no overwrite/update, move, rename, delete, share, ACL/member administration, rollback, generalized search, arbitrary-ID metadata resolve, remote Task, ordinary Agent, shared administrator, DOM automation, private API, token-bearing caller URL, or Provider fallback.

#### Scenario: OpenContent is unavailable
- **WHEN** another ContentSpaceProvider is installed
- **THEN** the adapter/domain SHALL return the pinned OpenContent outcome and SHALL NOT copy or route the resource to the other Provider
