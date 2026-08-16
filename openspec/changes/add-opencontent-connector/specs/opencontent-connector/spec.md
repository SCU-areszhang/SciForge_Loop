## Purpose

Defines the single main-only OpenContent integration package that owns trusted instance configuration, per-Human local connections, authentication, validated transport, and least-privilege typed ports for OpenContent Provider adapters.

## ADDED Requirements

### Requirement: Connector is an independently composed main-only package
SciForge SHALL deliver `opencontent-connector` as a trusted compile-time package discovered through the standard manifest and generated composition path. It SHALL expose only a main entrypoint and SHALL register no renderer, Agent, MCP, public business capability, Workspace Server, bundled sidecar, or runtime-installable entrypoint.

#### Scenario: Connector is installed
- **WHEN** generated composition processes its valid manifest
- **THEN** only its main integration contributions SHALL be installed without a central OpenContent feature map

#### Scenario: Connector is missing or duplicated
- **WHEN** a dependent adapter has no compatible Connector or composition finds conflicting Connector contributions
- **THEN** the adapter SHALL be unavailable and no fallback client SHALL be constructed

### Requirement: Connector uniquely owns OpenContent connection infrastructure
The Connector SHALL be the sole owner of OpenContent Provider Instance configuration, node-local named Provider Connections, OpenContent authentication and Token lifecycle, OpenContent credential namespace, upstream schema validation, and canonical OpenContent transport. The OpenContent Content Space Provider, future OpenContent adapters, and business domains SHALL NOT independently log in, renew, store, revoke, or retrieve Tokens.

#### Scenario: Content Space adapter uses one Human connection
- **WHEN** the OpenContent Content Space Provider operates for one Human Principal and Provider Instance
- **THEN** it SHALL resolve the Connector-owned local connection through its composition-bound typed port

#### Scenario: Consumer requests raw infrastructure
- **WHEN** a consumer asks for raw HTTP, Token, Cookie, credential record, provider DTO, arbitrary endpoint, or another consumer's operation
- **THEN** no such callable Connector contract SHALL exist

### Requirement: Provider Instance Directory is trusted and non-secret
The Connector SHALL map each stable Provider Instance Reference to locally approved provider identity, exact API/browser origins, tenant policy, TLS and redirect policy, and verification/readiness profile. Directory entries SHALL be managed only through trusted local configuration and SHALL contain no Provider Connection, Human credential, Token, Cookie, or business resource identity.

#### Scenario: Registered instance is resolved
- **WHEN** an authorized typed consumer uses a known Provider Instance Reference
- **THEN** the Connector SHALL use only the Directory's trusted endpoint and tenant policy

#### Scenario: Reference embeds or names an unknown endpoint
- **WHEN** portable or business input contains an endpoint or unknown instance
- **THEN** the Connector SHALL reject it before DNS, HTTP, authentication, or Directory mutation

### Requirement: Connections are local and Human-specific
A Provider Connection SHALL be a node-local binding between one Host-asserted Human Principal and one Provider Instance, with non-secret local metadata stored separately from credentials. The resolver SHALL use only the current principal's matching connection and SHALL return explicit missing, ambiguous, reauthentication-required, superseded, revoked, disabled, or access-denied outcomes.

#### Scenario: One unambiguous connection is available
- **WHEN** the current principal has one approved matching connection
- **THEN** the Connector SHALL use that connection without exposing its secret to the consumer

#### Scenario: Connection is missing or ambiguous
- **WHEN** none matches or several match without a trusted default/selection
- **THEN** the Connector SHALL require Human action and SHALL NOT select another principal, administrator, or arbitrary connection

### Requirement: Authentication and Token lifecycle fail closed
The Connector SHALL implement only a formally supported per-user authentication flow and its documented issue, expiry, renewal, rotation, logout, revocation, and stable failure semantics. It SHALL use the Host secure-credential facade bound to the Connector owner and SHALL never place credentials in URLs, renderer, capabilities, logs, Tasks, or cross-node messages.

#### Scenario: Formal production lifecycle is incomplete
- **WHEN** stable Human/provider subject binding, Token TTL/renewal/rotation, logout/revocation, or distinct expired/superseded/revoked/disabled outcomes are unproven
- **THEN** production OpenContent authentication SHALL remain `blocked_by_contract`

#### Scenario: Another session supersedes a Token
- **WHEN** another API node, browser, SSO flow, refresh, or future Skill invalidates the local Token
- **THEN** the connection SHALL become superseded, any uncertain write SHALL stop, and Human action SHALL be required without silent re-login

### Requirement: Content Space consumer port is composition-bound and least privilege
The Content Space-first Connector milestone SHALL expose one narrow typed port for the exact transport needs of `opencontent-content-space-provider`. Generated composition SHALL bind the port to that allowlisted adapter package identity; runtime input cannot name, select, or impersonate a consumer. Business domains SHALL have no Connector port. A Document adapter port SHALL be added only by a later independently reviewed change after Shared Documents; this milestone SHALL define no Document port, optional Document methods, or stub.

#### Scenario: OpenContent Content Space Provider invokes an allowed operation
- **WHEN** its bound port requests an allowed list, folder-create, upload, download, or portal-target transport operation
- **THEN** the Connector SHALL validate instance, principal, connection, readiness, request, and response and return only the bounded token-free transport result

#### Scenario: Document stack is deferred
- **WHEN** Shared Documents and the OpenContent Document Provider are absent
- **THEN** Connector construction and the Content Space port SHALL remain complete without an empty Document port or placeholder package

#### Scenario: Unauthorized package knows an operation name
- **WHEN** another trusted package attempts to call a port
- **THEN** access SHALL fail before credential or network use because knowledge of an identifier is not authorization

### Requirement: Every upstream schema and outcome is validated
The Connector SHALL pin the accepted OpenContent build/contract and runtime-validate every selected request, response, business result, error, pagination cursor, and bounded receipt. HTTP success SHALL NOT override a non-success OpenContent business result, and undocumented `object|string` payloads SHALL NOT pass as domain data.

#### Scenario: HTTP 200 contains business failure
- **WHEN** OpenContent returns HTTP 200 with a non-success `result`
- **THEN** the Connector SHALL return a bounded failure and SHALL NOT treat it as successful data

#### Scenario: Response violates the pinned schema
- **WHEN** a selected endpoint returns unknown, malformed, or secret-bearing data
- **THEN** the Connector SHALL return `provider_contract_violation`, redact unsafe detail, and SHALL NOT forward the raw DTO

### Requirement: Portable materialization uses the Connector resolver
The Connector SHALL contribute an OpenContent authority resolver to the generic Portable Resource Reference materializer. It SHALL resolve only a locally registered Provider Instance, current Human Principal, and that principal's local connection, reauthorize the logical resource with current provider permissions, and return no endpoint or credential to the generic registry.

#### Scenario: Revoked or unauthorized reference is materialized
- **WHEN** the provider no longer authorizes the current Human for the logical resource
- **THEN** no local Broker resource SHALL be issued and no other connection SHALL be tried

### Requirement: Readiness and verification profiles cannot be promoted by callers
Every Connector operation SHALL be exactly `poc_only`, `blocked_by_contract`, or `production_ready`. A trusted OpenContent Verification Profile SHALL only narrow an exact non-production Provider Instance, tenant, accounts, root/container allowlist, limits, and operations; renderer, Agent, Task, environment text, or ordinary configuration SHALL NOT promote readiness.

#### Scenario: Dedicated non-production profile passes
- **WHEN** tenant isolation, least-privilege accounts, stable Host Principal, secure enrollment, and operation-specific evidence pass
- **THEN** only exact locally initiated allowlisted operations MAY execute as `poc_only`

#### Scenario: Only a shared tenant exists
- **WHEN** no dedicated non-production tenant is available
- **THEN** product-integrated Connector access SHALL remain disabled and only a fixed-account fixed-resource external verification harness MAY contact OpenContent

#### Scenario: Session coexistence is unproven
- **WHEN** same-Human API/API, API/browser, or API/future-Skill coexistence is not formally documented and verified
- **THEN** production readiness SHALL remain `blocked_by_contract` and PoC SHALL permit at most one visibly active API node per Human

### Requirement: Metadata authorization fails closed
The Connector SHALL preserve provider object-level anti-enumeration and current authorization for catalog, metadata, reference resolution, and materialization. Known identifiers, SciForge Project membership, team membership cached by SciForge, or a previously valid Token SHALL not substitute for provider authorization.

#### Scenario: Revoked user can still query metadata by known ID
- **WHEN** the target OpenContent build exposes folder, list, or file metadata after access revocation
- **THEN** production metadata and materialization operations SHALL remain `blocked_by_contract` until a server-side fix or validated permission oracle closes the BOLA condition

### Requirement: OpenContent Content Space track is optional and pausable
The Connector and OpenContent Content Space Provider adapter SHALL be optional trusted compile-time packages. Their absence, pause, or blocked readiness SHALL NOT prevent Provider composition, Content Space, its mock Providers, other Providers, or the unified Content Space UI from starting. Shared Documents and the OpenContent Document Provider are deferred independent changes and SHALL NOT be prerequisites for this milestone.

#### Scenario: Mentor pauses OpenContent work
- **WHEN** the OpenContent Connector and Content Space adapter are omitted or disabled from the reviewed build set
- **THEN** generic Provider contracts/catalogs and non-OpenContent Providers SHALL continue without compatibility shim, Host switch, or fallback
