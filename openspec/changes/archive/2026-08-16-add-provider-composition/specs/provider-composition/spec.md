## Purpose

Defines trusted compile-time composition of separate DocumentProvider and ContentSpaceProvider implementations without a universal Provider API or Host vendor routing.

## ADDED Requirements

### Requirement: Provider contracts remain domain-specific
SciForge SHALL define separate DocumentProvider and ContentSpaceProvider contracts. It SHALL NOT define a universal Provider contract containing optional document, file, storage, launch, or vendor operations.

#### Scenario: One application supports both domains
- **WHEN** a trusted integration package implements both Provider Contracts
- **THEN** it SHALL register two independent contributions with separate contract validation, capabilities, readiness, and tests

### Requirement: Provider factories use standard generated composition
V1 Provider implementations SHALL be trusted compile-time packages discovered through manifest/generated composition as `main.document-provider-factory` and/or `main.content-space-provider-factory`. Adding or removing one SHALL require no Host feature map, Provider Kind switch, vendor-specific IPC, Agent Runtime branch, or runtime code loader.

#### Scenario: New Provider package is added
- **WHEN** a reviewed package contributes one compatible factory
- **THEN** the owning domain catalog SHALL discover it through generated composition without a vendor-specific core edit

#### Scenario: Runtime plugin is offered
- **WHEN** an unbundled package attempts runtime installation or dynamic code execution
- **THEN** V1 composition SHALL reject it because plugin signing, sandboxing, permissions, upgrades, and isolation are outside this contract

### Requirement: Each domain owns its Provider catalog
Shared Documents SHALL consume only the Document Provider catalog and Content Space SHALL consume only the Content Space Provider catalog. Host Core SHALL only compose generic contribution entries and SHALL NOT understand domain operations, Provider capabilities, resource kinds, extensions, or vendor identities.

#### Scenario: Content Provider is installed without Document Provider
- **WHEN** one package contributes only ContentSpaceProvider
- **THEN** Content Space MAY discover it while Shared Documents remains unaffected and SHALL NOT infer document capability

### Requirement: Contribution ownership and versions fail closed
Each contribution SHALL declare one bounded Provider Kind and supported contract version, and its runtime value SHALL match exactly. A catalog SHALL reject duplicate Provider Kind ownership, unknown contract major, missing/extra runtime contribution, incompatible value, or caller-selected owner identity before Provider use.

#### Scenario: Two packages claim the same Provider Kind
- **WHEN** both claim the same domain-specific Provider contribution
- **THEN** that catalog SHALL fail closed rather than select by priority, load order, or last registration

#### Scenario: Package contributes two kinds and one is invalid
- **WHEN** one package has a valid ContentSpaceProvider contribution and an invalid DocumentProvider contribution
- **THEN** the invalid contribution SHALL NOT be reinterpreted as valid or merged into a universal Provider

### Requirement: Composition has no remote side effects
Provider catalog and factory construction SHALL perform no network call, login, credential retrieval, content read, remote resource creation, or Provider session activation. Provider operation dependencies SHALL be resolved lazily under trusted main context.

#### Scenario: SciForge starts while a Provider is offline
- **WHEN** installed Provider infrastructure is unreachable
- **THEN** unrelated SciForge domains and other Provider contributions SHALL still compose, while the affected Provider reports bounded unavailability at operation time

### Requirement: Routing is pinned to trusted Provider Instance
A domain operation SHALL select a factory only after a trusted non-secret Provider Instance Directory resolves ProviderInstanceRef to its Provider Kind. Caller input and portable identity SHALL NOT supply an endpoint, package ID, connection, credential, or fallback order.

#### Scenario: Provider Instance is unknown
- **WHEN** a valid resource reference names an unregistered Provider Instance
- **THEN** routing SHALL fail before Provider factory invocation, endpoint resolution, credential use, or network access

### Requirement: Provider failure never causes automatic fallback
A resource reference SHALL remain bound to its Provider Instance. Missing, blocked, unavailable, or unauthorized Provider behavior SHALL return a bounded failure or Human-action disposition and SHALL NOT invoke another Provider, reinterpret identity, infer from extension, use an arbitrary default, or silently copy the resource.

#### Scenario: Pinned Provider is unavailable
- **WHEN** another compatible Provider is installed but the referenced Provider is unavailable
- **THEN** SciForge SHALL stop with the pinned Provider outcome and SHALL NOT contact the other Provider

#### Scenario: Cross-provider migration is requested
- **WHEN** a user wants the resource moved to another Provider
- **THEN** a separate explicit governed migration/import/export contract SHALL be required and any successful destination SHALL receive a new reference
