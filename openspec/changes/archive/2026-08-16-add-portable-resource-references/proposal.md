## Why

SciForge needs durable provider-resource identities that can cross contexts, restarts, and nodes without turning the Capability Broker's process-local `res_*` handles into persisted authority. A generic fail-closed envelope and materialization boundary is required before Shared Documents, Content Space, or cloud associations can safely exchange provider references.

## What Changes

- Add a versioned, bounded, non-secret Portable Resource Reference Envelope.
- Add registered, kind-specific codecs; each resource-owning domain owns its logical reference schema and codec, while this change owns only the generic registry and lifecycle.
- Add a full-node materialization pipeline that validates kind, version, payload, and trusted authority before any network request, then reauthorizes and issues a process-local Broker resource reference.
- Add safe reverse export from an authorized local Broker resource to an approved portable envelope.
- Reject unknown kind, version, Provider Instance, malformed identity, unauthorized export, and any persisted or transported `res_*`/`cap_*` handle.
- Keep Host core free of provider-kind switches and business-resource unions.

## Capabilities

### New Capabilities

- `portable-resource-references`: Versioned envelopes, registered codecs, trusted materialization, safe export, and strict separation from local Broker references.

### Modified Capabilities

None.

## Impact

- Adds generic pure contracts and main-process registry/materialization extension points at a shared package/SDK boundary.
- Adds a generic codec contribution path used later by Shared Documents and Content Space without either package importing the other.
- Requires integration with the existing Capability Broker resource issuance path but does not change Broker handles into durable values.
- Provides the identity/materialization prerequisite for `add-provider-composition`, `add-content-space-v1`, `add-shared-documents-v1`, and later Provider integrations.
