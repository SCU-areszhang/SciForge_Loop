# content-space Specification

## Purpose
Defines the provider-neutral Content Space domain, ContentSpaceProvider contract, unified file-management UI, ordinary-file operations, and immutable-artifact boundary.
## Requirements
### Requirement: Content Space is an independent provider-neutral domain
SciForge SHALL deliver Content Space as a trusted compile-time domain package through standard manifest/generated composition. Its public contract SHALL contain only Content Space and generic SDK/reference terms and SHALL NOT import Shared Documents, vendor DTOs, integration packages, Cloud Collaboration, Project, Task, Coordinator, Workspace, or Host-private source types.

#### Scenario: Provider integration changes
- **WHEN** one compatible ContentSpaceProvider package is added, removed, paused, or replaced
- **THEN** Content Space public contracts and Host Core SHALL require no vendor-specific edit

### Requirement: Content Space owns ContentSpaceProvider
Content Space SHALL own a strict ContentSpaceProvider contract covering capability description, container/entry observation, bounded navigation, create-folder, upload-new, download, portal target, and immutable-version observation. It SHALL consume only compatible `main.content-space-provider-factory` contributions from its domain-owned catalog.

#### Scenario: Package implements document capabilities too
- **WHEN** the same integration package also contributes DocumentProvider
- **THEN** the two contributions SHALL remain independently validated and Content Space SHALL NOT observe document operations

### Requirement: Content Space owns typed portable references
Content Space SHALL own strict codecs for Content Container Reference and Content File Reference and the Artifact Reference schema/issuance rule. Each reference SHALL identify one Provider Instance and provider resource without endpoint, path, display metadata, credential, access binding, permission, or Broker handle.

#### Scenario: Reference crosses a node boundary
- **WHEN** a Content Space reference is persisted or transported
- **THEN** it SHALL use Portable Resource Reference Envelope and require local materialization and current Provider authorization

### Requirement: Artifact Reference requires immutable provider version
Content Space SHALL issue ArtifactReference only when the selected Provider guarantees immutable version identity, retention, and version-specific retrieval for the exact bytes. Current file identity, mutable latest, optional version field, checksum alone, or upload receipt SHALL not satisfy the contract.

#### Scenario: Upload succeeds without immutability proof
- **WHEN** upload-new completes but the Provider cannot prove immutable version semantics
- **THEN** the result SHALL remain ContentFileReference and SHALL NOT populate a completed Task artifact association

### Requirement: Content Space uses a provider-neutral UI
The Content Space renderer SHALL provide common Provider/container selection, bounded directory/file list, upload, download, resource selection, reference display, readiness, and bounded errors using only public Content Space schemas. It SHALL NOT contain vendor switches, DTOs, endpoints, credentials, raw Clients, arbitrary Provider renderer code, or direct Provider calls.

#### Scenario: Two Providers are installed
- **WHEN** both declare compatible Content Space capabilities
- **THEN** the same UI SHALL present their provider-neutral instances and operations from trusted capability data without vendor-specific branches

### Requirement: Every operation follows one governed path
Renderer, Agent, and system callers SHALL invoke Content Space only through its canonical Broker/domain service. The service SHALL validate reference, readiness, current authority, bounds, operation policy, and pinned Provider before invoking ContentSpaceProvider.

#### Scenario: UI tries to call Provider directly
- **WHEN** renderer supplies a factory ID, endpoint, raw Provider operation, Connector command, or credential
- **THEN** no such public path SHALL exist and no Provider call SHALL occur

### Requirement: Readiness is explicit per operation
Every operation SHALL be exactly `poc_only`, `blocked_by_contract`, or `production_ready`, constrained by the Provider contribution, Provider Instance policy, resource capability, platform Gate, and audience policy. Caller input, renderer state, Agent request, Task, extension, or ordinary configuration SHALL NOT promote it.

#### Scenario: Operation is unavailable
- **WHEN** any effective Gate is blocked
- **THEN** the operation SHALL be absent from discovery or fail before provider contact with a bounded unavailable result

### Requirement: Navigation and transfers are bounded
Container/entry listing SHALL use bounded pagination and cancellation. Create-folder and upload-new SHALL require an authorized explicit parent, bounded Human-approved metadata, and one logical invocation identity. Download SHALL require current authorization, bounds, cancellation, and a Host-owned destination path.

#### Scenario: Upload would overwrite or outcome is uncertain
- **WHEN** satisfying the request would overwrite a resource or the Provider cannot prove whether creation completed
- **THEN** Content Space SHALL return typed conflict or `outcome_unknown` without blind retry or silent target change

#### Scenario: Download requires bearer URL exposure
- **WHEN** bytes cannot be delivered without exposing a credential through renderer, browser, log, or portable reference
- **THEN** download SHALL remain blocked rather than use that transport

### Requirement: Provider reference never falls back
A Content Space reference SHALL remain bound to its Provider Instance. Missing, blocked, unavailable, or unauthorized behavior SHALL NOT invoke another Provider, infer from extension, choose an arbitrary default, reinterpret identity, or silently copy bytes.

#### Scenario: Pinned Provider is offline
- **WHEN** another ContentSpaceProvider is installed and could store similar files
- **THEN** Content Space SHALL return the pinned Provider outcome and SHALL NOT contact the other Provider

### Requirement: Excluded V1 operations remain absent
V1 SHALL NOT expose overwrite/update, move, rename, delete, share, ACL/member administration, rollback, generalized migration, Workspace projection, Git sync, or provider-specific fallback through the Content Space public surface.

#### Scenario: Excluded operation is invoked
- **WHEN** a caller attempts an excluded action through an identifier, raw Provider, Connector, browser automation, or malformed input
- **THEN** it SHALL fail without remote mutation or an alternate path
