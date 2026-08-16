# portable-resource-references Specification

## Purpose
Defines durable, non-authorizing provider-resource envelopes and the only trusted path that converts them to and from process-local Capability Broker resources.

## Requirements
### Requirement: Portable envelopes are versioned and bounded
A Portable Resource Reference Envelope SHALL contain only a contract version, a registered kind, a non-secret authority reference, and a kind-owned bounded identity payload. It SHALL be canonically serializable, size-bounded, durable across restart, and safe to transport across SciForge nodes; it SHALL contain no endpoint, credential, local connection, provider DTO, display metadata, or Broker handle.

#### Scenario: Valid envelope crosses a node boundary
- **WHEN** a consumer serializes and later parses a supported envelope
- **THEN** the same version, kind, authority, and logical identity SHALL be recovered without adding executable authority

#### Scenario: Runtime handle is offered as a portable reference
- **WHEN** a caller supplies a Broker `res_*`, capability handle, local connection ID, URL, or arbitrary URI where a portable envelope is required
- **THEN** validation SHALL reject it before codec, resolver, credential, or network use

### Requirement: Resource-owning packages own distinct codecs
Each portable reference kind SHALL have exactly one registered codec that validates its logical identity, canonical encoding, safe export projection, and accepted local resource kind. The package owning the business resource SHALL own that codec; the generic registry SHALL NOT define Document, Content Container, Content File, Artifact, Task, Project, or provider-specific payload schemas.

#### Scenario: Duplicate or conflicting codec is registered
- **WHEN** composition supplies two codecs for one kind or one codec claims incompatible schemas
- **THEN** composition SHALL fail before either codec is available

#### Scenario: Sibling domains register their references
- **WHEN** Shared Documents and Content Space contribute different reference kinds
- **THEN** each SHALL depend only on the generic reference contract and SHALL NOT import the other package

### Requirement: Invalid references fail before network access
Materialization SHALL validate envelope size and shape, contract version, registered kind, codec-owned identity, and locally trusted authority registration before invoking any authority resolver or provider network operation. Unknown kind, version, authority/Provider Instance, malformed identity, or embedded endpoint SHALL fail closed with zero network access.

#### Scenario: Unknown kind or version is received
- **WHEN** an envelope uses an unregistered kind or unsupported contract version
- **THEN** materialization SHALL return a bounded invalid-reference result without invoking a resolver

#### Scenario: Unknown Provider Instance is received
- **WHEN** a valid codec payload names an authority absent from the trusted local directory
- **THEN** materialization SHALL fail before DNS, HTTP, authentication, or provider contact

### Requirement: Materialization issues only local Broker references
A receiving full SciForge node SHALL materialize a valid envelope by invoking the registered authority resolver under the Host-asserted current Human Principal, reauthorizing the logical resource, and then issuing an audience- and scope-bound process-local Broker resource reference. The portable envelope SHALL never itself satisfy capability authorization.

#### Scenario: Current principal is authorized
- **WHEN** the envelope is valid, its authority is trusted, and the resolver proves the current principal may access the resource
- **THEN** the materializer SHALL issue a fresh local Broker resource reference for the codec's registered resource kind

#### Scenario: Local authority cannot be established
- **WHEN** no matching current-principal connection exists, selection is ambiguous, or provider reauthorization fails
- **THEN** no Broker resource SHALL be issued and no other principal, default administrator, or remote credential SHALL be tried

#### Scenario: Broker reference crosses restart or node boundary
- **WHEN** a stored or transported `res_*` reference is presented after restart or on another node
- **THEN** the Broker SHALL reject it rather than reinterpret it as a portable identity

### Requirement: Export is explicit and safe
Reverse export SHALL accept only an authorized live local Broker resource whose provider registered an export projection for the requesting context. It SHALL produce the codec's canonical portable envelope and SHALL expose no endpoint, credential, connection ID, raw provider DTO, provider path/name, or Broker handle.

#### Scenario: Authorized resource is exported
- **WHEN** an allowed consumer exports a live resource with a registered codec and export policy
- **THEN** the result SHALL be a schema-valid portable envelope containing only its approved authority and logical identity

#### Scenario: Agent or malformed provider requests raw identity
- **WHEN** a caller asks for raw provider identifiers, arbitrary fields, or an unregistered export
- **THEN** export SHALL fail closed without returning a partial envelope or internal resource state

### Requirement: Host composition is provider-neutral
Host core SHALL discover codecs and authority resolvers through generic composition contracts and SHALL reject duplicate ownership. It SHALL NOT route by provider kind, domain ID, MIME type, Task type, Project type, or a central feature map.

#### Scenario: New provider authority is added
- **WHEN** a trusted package contributes a compatible authority resolver
- **THEN** it SHALL participate through the generic registry without editing a Host provider switch
