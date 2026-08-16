## Context

OpenContent has verified candidate file-space endpoints and partial SDK documentation, but documented schemas differ from the observed service and Token/session behavior remains only partly stated. ADR 0017 assigns all provider-specific connection infrastructure to one main-only Connector. ADR 0024 keeps the business domains dependent only on their Provider catalogs. ADR 0025 stages the Content Space port first and defers the independently authorized Document port until after Shared Documents.

## Goals / Non-Goals

**Goals:**

- Compose one provider-specific integration owner without a Host feature switch.
- Establish one local per-Human connection and a least-privilege Content Space adapter port that a future independently authorized Document port can reuse.
- Pin and validate all provider transport at the package boundary.
- Make PoC and production readiness explicit and operation-specific.

**Non-Goals:**

- Owning Shared Document revisions/edits or Content Space file/artifact semantics.
- Registering an Agent/UI capability, approval flow, raw client, or provider DTO surface.
- Provisioning OpenContent accounts or making OpenContent a SciForge identity authority.
- Integrating the undelivered OpenContent Skill.

## Decisions

### Ship a trusted main-only domain package as integration infrastructure

The package uses the standard manifest and generated main composition but has no business capability factory or renderer entry. A generic internal-service contribution is bound to allowlisted consumers. This keeps package/version ownership consistent with the repository while preventing public Agent discovery.

Alternative rejected: a Host-private service under `src/main`. That would make core own OpenContent and require central provider-specific configuration.

### Separate directory, connection metadata, and secret material

The Provider Instance Directory contains trusted non-secret instance and endpoint policy. The Connector's local store contains non-secret connection metadata. Secret material is stored only through the Connector-owner facade from `add-secure-provider-credentials`. The three stores use stable references but have distinct confidentiality and lifecycle.

Alternative rejected: a single registry containing endpoints, users, and Tokens. It would confuse portable authority with local authentication and increase leak impact.

### Bind the Content Space port during composition

`opencontent-content-space-provider` receives only its token-free interface. The generated composition root knows the installed package identity and binds it; there is no runtime `consumerId` argument and no Broker-as-private-bus. Content Space never receives this port.

The Document adapter port is not part of this milestone. A later change may add it to the same Connector only after Shared Documents exists, with its own declaration, authorization, readiness, and tests. This milestone defines no empty interface, optional Document method, or stub package.

Alternative rejected: export a generic OpenContent client. It would leak provider DTOs, let domains bypass readiness, and duplicate business error mapping.

### Keep business semantics outside transport

Connector DTOs are narrow transport facts proven by pinned schemas. In this milestone, the OpenContent Content Space Provider adapter maps container/file/artifact semantics. Future document revision/structured semantics remain outside the Connector and outside this change. The Connector owns authentication and upstream result validation only.

### Use one session state machine per local connection

Concurrent consumers share a single-flight lifecycle for a connection. States distinguish missing, usable, renewing, expired, superseded, revoked, disabled, and access-denied. Supersession is terminal for the current credential until explicit Human action; it is not an automatic login trigger.

### Treat current evidence as profile-scoped

The verification profile is trusted composition/configuration, never caller input. Dedicated-tenant PoC can admit only exact operations. Shared-tenant work stays outside product surfaces. Production remains blocked by formal identity/auth/session and metadata-authorization Gates.

## Risks / Trade-offs

- **[Future Document work blocks Content Space]** → Ship only the Content Space port now; add the independent Document port later without a stub or optional-method union.
- **[Observed service diverges from SDK]** → Pin tested builds and runtime schemas; fail on unknown payloads.
- **[New login invalidates existing work]** → Model supersession explicitly, stop uncertain writes, and require Human action.
- **[Known-ID metadata remains readable after revocation]** → Keep production metadata/materialization blocked until server-side evidence closes BOLA.
- **[Connector becomes a hidden public API]** → Architecture tests forbid Agent/UI/MCP/raw HTTP exports and unauthorized consumers.

## Migration Plan

1. Merge portable references and secure credentials first; ensure Host principal contracts exist.
2. Scaffold the main-only package and composition-bound Content Space adapter port.
3. Implement directory, connection state, typed port mocks, and schema fixtures with all operations blocked.
4. Add the dedicated verification profile and only then admit evidence-backed `poc_only` operations.
5. Keep production operations blocked until all external Gates pass.
6. Roll back by disabling the Content Space port and using the Connector's one explicit logout/revocation workflow; business packages never retain a Token fallback.
7. Pausing/removing this optional track leaves provider-neutral domain packages and other Provider contributions operational.
8. After `add-shared-documents-v1`, use a separate change to add the independently declared and authorized Document adapter port to this same Connector; do not retrofit a generic client or compatibility alias.
