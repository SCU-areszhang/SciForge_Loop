## Context

The generic contribution catalog already composes installed domain-package declarations and runtime values. Existing provider-specific drafts coupled Content Space and Shared Documents directly to OpenContent Connector ports. ADR 0024 instead establishes two domain-owned Provider Contracts and independently registered factories; a vendor Connector, when needed, sits below its Provider adapters.

See `domain-capability-separation-design.md`, `CONTEXT-MAP.md`, `docs/contexts/provider-integration/CONTEXT.md`, ADR 0010, ADR 0018, and ADR 0024.

## Goals / Non-Goals

**Goals:**

- Add one canonical compile-time composition path for DocumentProvider and ContentSpaceProvider factories.
- Keep catalogs, Provider semantics, readiness, and UI owned by their business domains.
- Permit one integration package to contribute either or both contracts independently.
- Make unknown, missing, duplicate, incompatible, and unavailable Provider outcomes fail closed.

**Non-Goals:**

- A universal Provider API or a central union of operations.
- Provider authentication, credentials, transport, document/file semantics, or UI.
- Runtime third-party installation, code loading, sandboxing, signing, permissions, or upgrades.
- Automatic fallback, replication, migration, or provider-selection policy.

## Decisions

### Add two explicit contribution kinds

The public Domain SDK defines `main.document-provider-factory` and `main.content-space-provider-factory`. Each declaration and runtime value carries a supported contract version and one Provider Kind. A package may declare both; generated composition and runtime validation treat them as unrelated contributions.

Alternative rejected: `main.provider-factory` with optional methods. It would merge distinct domain semantics and make capability presence depend on runtime probing.

### Keep catalogs in their owning domains

Shared Documents consumes only Document Provider contributions. Content Space consumes only Content Space Provider contributions. Host Core registers generic entries but performs no Provider Kind, vendor, extension, resource, or capability routing.

Alternative rejected: one Host ProviderRegistry. It would become a central feature map and force Host changes for domain semantics.

### Compose factories, not active sessions

A factory is created and validated without network, login, credential retrieval, content access, or remote mutation. Actual Provider runtime/service creation is lazy and receives an owner-bound minimal host view. Human access resolution occurs at operation time under trusted main context, not during catalog construction.

Alternative rejected: ESM singleton or package-load side effects. They make lifecycle, packaged composition, duplicate detection, and tests nondeterministic.

### Route through trusted instance identity

ProviderInstanceRef is validated through the non-secret trusted Provider Instance Directory. Its Provider Kind selects the matching domain catalog entry. Caller data cannot name a package, factory, endpoint, or fallback order.

### Never reinterpret a pinned reference

A reference remains bound to one Provider Instance. Provider unavailability returns a bounded unavailable/human-action result. Import/export or migration to another Provider is a separate future governed operation that creates a new reference.

## Risks / Trade-offs

- **[Two contribution contracts add SDK surface]** → The split is intentional and prevents a universal union from coupling two business domains.
- **[A package contributes one valid and one invalid factory]** → Validate and register each contribution independently; failure of one does not manufacture the other.
- **[Catalog construction triggers vendor work]** → Factories and tests must prove zero network, credential, and remote side effects during composition.
- **[Provider removal leaves references]** → Materialization returns provider unavailable; it never rewrites or falls back.
- **[Dynamic plugins are expected]** → V1 documentation and UI call out trusted compile-time scope; plugin hosting requires a later ADR/OpenSpec.

## Migration Plan

1. Land the public contribution declarations/runtime schemas and pure tests.
2. Compose process-local domain catalogs from generated installed packages.
3. Add duplicate, version, missing, removal, zero-side-effect, and packaged-composition tests.
4. Let Content Space and Shared Documents define their SPI values and consume only their catalog.
5. Let later integration packages contribute adapters; add no compatibility aliases or central switches.
