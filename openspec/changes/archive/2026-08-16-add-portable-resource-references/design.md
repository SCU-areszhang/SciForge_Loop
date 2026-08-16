## Context

The Capability Broker already issues opaque `res_*` references bound to process state, audience, scope, expiry, and provider observation. Those handles are executable local bindings, while cloud records and cross-node handoffs need durable identity only. ADR 0018 fixes the separation; this change supplies the generic contract before provider-specific codecs arrive.

## Goals / Non-Goals

**Goals:**

- Provide one canonical parse, validate, materialize, and export path.
- Let resource owners contribute codecs without adding business unions to Host core.
- Guarantee that unknown input fails before provider network access.
- Preserve the Broker as the only issuer of executable local resource references.

**Non-Goals:**

- Defining Document, Container, File, Artifact, Project, Task, or OpenContent DTOs.
- Persisting or making `res_*`/`cap_*` handles portable.
- Storing credentials, selecting a Human Principal, or implementing provider authentication.
- Adding a second capability registry, provider registry, IPC, or MCP path.

## Decisions

### Split pure envelopes from main-only materialization

A small shared package owns the envelope schema, codec contract, canonical serialization, and bounded error model. A main-only service owns the installed codec/resolver registries and Broker issuance. This keeps cloud-side storage able to validate envelope bounds without gaining credentials or executable materialization.

Alternative rejected: adding portable fields to the current Broker handle. That would merge durable identity with process-local authority and make stale cross-node handles appear executable.

### Keep logical schemas with resource owners

The generic package validates only the envelope. Shared Documents owns the DocumentReference codec; Content Space owns ContentContainerReference, ContentFileReference, and ArtifactReference codecs. Registration pairs one kind with one codec and fails on duplicates.

Alternative rejected: a central union of all resource kinds. It would require core edits for each domain and create cross-domain ownership.

### Compose an authority-resolver SPI

After local structural validation and authority-directory lookup, the materializer invokes the resolver registered for that trusted authority. A Provider integration package or its private Connector may supply the resolver; OpenContent Connector is one optional example. The resolver receives Host principal context from trusted composition, not caller input, and returns a bounded authorization result plus provider-owned local resource registration.

Alternative rejected: letting a portable envelope name an endpoint or resolver. That would create an SSRF and authority-confusion surface.

### Export through provider-owned projections

Only trusted provider registration can map a live local resource back to an envelope. Agent/model callers receive the portable value only through an explicitly allowed higher-level consumer path; they cannot ask the Broker to dump internal state.

## Risks / Trade-offs

- **[Codec kind squatting or duplicate ownership]** → Fail generated composition and runtime registry construction on every duplicate.
- **[Authority lookup accidentally performs network I/O]** → Separate local directory validation from resolver invocation and test zero-network rejection canaries.
- **[A codec leaks display metadata or provider paths]** → Require strict schemas, canonical serialization, bounded fields, and negative export tests.
- **[Cross-process type drift]** → Keep one pure contract package and validate generated source and packaged composition.

## Migration Plan

1. Land the generic contracts and registry with no provider codecs.
2. Integrate local Broker issuance/export through the existing resource path.
3. Add architecture and fail-before-network tests.
4. Let later resource-owner changes register codecs and authority resolvers.
5. Reject any future persistence of Broker handles; no compatibility decoder is introduced.
