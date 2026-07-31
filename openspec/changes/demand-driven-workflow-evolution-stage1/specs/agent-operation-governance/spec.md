## ADDED Requirements

### Requirement: Agent operations are durable before thread creation

The generic Agent Execution path SHALL persist and uniquely claim `(hostDerivedOwnerId, operationId)` before creating a thread or turn. `requestDigest` and `profileDigest` SHALL be immutable comparison fields on that record, not additional key dimensions that permit another row. Concurrent exact claims SHALL converge on one operation; a digest mismatch SHALL conflict with zero dispatch.

Owner and operation principal SHALL come from Host context and SHALL be rechecked for status, cancel, reconciliation, and result delivery.

Because raw retention is `NONE`, every owning domain SHALL durably persist one versioned, non-raw `RequestRebuildRecipeV1` before the Host may dispatch the operation. The sole non-production conformance exception is the explicitly unexported, production-unregistrable probe: its test harness SHALL act as the owner and persist one synthetic recipe plus frozen synthetic dependencies in a test-only durable store that survives the exercised process restart, is inaccessible to production composition, and is destroyed after the conformance run. This exception stores no Workflow Evolution or other domain data and cannot satisfy any production B projection gate. The Host operation record SHALL bind the recipe ID/digest and the immutable request/profile digests rather than recipe contents or raw bytes; it SHALL NOT persist request or prompt bytes. `RequestRebuildRecipeV1` SHALL be a closed value with exactly:

- `kind`, fixed to `AGENT_REQUEST_REBUILD_RECIPE_V1`;
- `schemaVersion`, fixed to `1`;
- `recipeId`;
- `ownerDomainModuleId` and `ownerDomainContractDigest`;
- `frozenDomainInputs`, an array of closed `{ objectKind, objectId, objectDigest }` references;
- `promptTemplate`, a closed `{ templateId, templateDigest }` reference;
- `profileTemplate`, a closed `{ templateId, templateDigest }` reference;
- `serializer`, a closed `{ serializerId, serializerVersion, serializerDigest }` reference;
- `expectedRequestDigest`; and
- `recipeDigest`.

Every ID SHALL be a nonempty 1–128 UTF-8 byte string without control characters; each `objectKind` SHALL be a nonempty 1–64 UTF-8 byte string without control characters; `serializerVersion` SHALL be a positive safe integer; every digest SHALL be 64 lowercase hexadecimal SHA-256 characters. `frozenDomainInputs` SHALL contain at most 32 entries, sorted uniquely by the UTF-8 lexical tuple `(objectKind, objectId)`. `expectedRequestDigest` SHALL be SHA-256 over the exact final serialized dispatch bytes. `recipeDigest` SHALL be SHA-256 lowercase hexadecimal over the RFC 8785 canonical JSON UTF-8 bytes of the validated object after removing only `recipeDigest`. Unknown fields, aliases, duplicate JSON member names, duplicate or out-of-order input references, unsupported versions, invalid Unicode scalar sequences, and out-of-bound values SHALL fail closed.

The recipe SHALL contain only identifiers and digests for independently lawful durable domain values and immutable template/serializer implementations. It SHALL NOT contain request text, prompt text, messages, provider payloads, encoded/chunked request bytes, or a reversible raw-request copy. Recipe ID/digest and `expectedRequestDigest` are recovery metadata and SHALL NOT be embedded in the reservation-free body or final provider request. The owning domain SHALL keep every referenced value and exact template/profile/serializer implementation resolvable by ID/version/digest for the complete recoverable operation lifecycle; resolving a current default, a same-named newer implementation, or an alternate serializer is forbidden.

When a compute-bearing Agent operation uses `ComputeReservationV1`, Host, adapter, and owning domain SHALL consume the singular strict type and validator exported by `@sciforge/domain-sdk/contract`; they SHALL NOT define, re-export, or accept a local variant. The owning domain SHALL persist the canonical reservation, and the Host operation record SHALL bind its exact `reservationId` and `reservationDigest` as trusted metadata outside `RequestRebuildRecipeV1`. The reservation's `reservedRequestBodyDigest` SHALL cover the RFC 8785 canonical JSON UTF-8 bytes of the strict reservation-free request body. The reservation envelope is attached only after that body digest is frozen, and the final serialized dispatch bytes are then checked against the operation's immutable `requestDigest` and recipe `expectedRequestDigest`. The reservation-free body SHALL NOT contain the reservation envelope, `reservationId`, `reservationDigest`, or a field derived from them, so the reservation digest may include `reservedRequestBodyDigest` without a request/reservation digest cycle.

The generic state adjacency SHALL be exactly:

```text
CLAIMED -> DISPATCHING | FAILED | CANCELLED
DISPATCHING -> RUNNING | SUCCEEDED | FAILED | CANCELLED | OUTCOME_UNKNOWN
RUNNING -> SUCCEEDED | FAILED | CANCELLED | OUTCOME_UNKNOWN
```

`CLAIMED -> FAILED | CANCELLED` is allowed only before native dispatch. `DISPATCHING -> terminal` permits a very fast terminal adapter result or terminal result discovered during reconciliation without fabricating an observed `RUNNING` state. Terminal states have no outgoing edge.

One Host transaction SHALL atomically mint and persist the stable dispatch token as a non-reusable Host token-allocation tombstone, bind the already-persisted recipe ID/digest, and transition `CLAIMED -> DISPATCHING`. The adapter call SHALL occur only after that transaction commits; no adapter, transport, or provider call may run inside or before the committing transaction. A committed `DISPATCHING` record without its stable token/tombstone or recipe binding is invalid and SHALL fail closed without dispatch.

For Stage1, the Host SHALL pass the stable token only to the production adapter defined below. Its Host-facing interface SHALL provide atomic token-unique `createOrGet(dispatchToken, request)`, `lookup(dispatchToken)`, and `cancel(dispatchToken)`, with lookup returning exactly:

```text
NOT_FOUND | RUNNING(handle) | TERMINAL(receipt) | UNQUERYABLE
```

The adapter SHALL own a separate durable local acceptedness store keyed uniquely by `dispatchToken`; the Host operation/token-allocation record is not a substitute for that store. Its closed non-raw record SHALL bind the Host-derived owner/operation identity, dispatch token, immutable request/profile/recipe digests, optional `ComputeReservationV1` ID/digest, Host-selected provider-configuration ID/digest, state, optional provider handle identity/digest, optional terminal/cancel receipt identity/digest, lifecycle timestamps, and record digest. Its state SHALL be exactly:

```text
MAY_HAVE_BEEN_ACCEPTED | RUNNING | TERMINAL | CANCELLED | UNQUERYABLE
```

`createOrGet` SHALL serialize on that local token key. If the record does not exist, one adapter transaction SHALL validate immutable metadata and atomically commit a `MAY_HAVE_BEEN_ACCEPTED` tombstone before any dispatch-worker creation, provider-application socket/DNS/HTTP/RPC/SDK call, raw-buffer transfer, or external application send for that operation. Host attestation/revocation preflight is a separate no-raw control-plane check completed before `createOrGet`; it cannot dispatch the Agent request. Only the transaction winner may enter one subsequent single-shot transport call. Concurrent or later `createOrGet` calls that observe any record SHALL return/adopt its known status or `UNQUERYABLE`; they SHALL NOT send again. A digest/configuration conflict SHALL fail with zero send and no metadata disclosure.

“Single-shot” SHALL be measured at the provider application-request boundary, not by adapter-method count. For one token, the worker/transport/SDK SHALL start at most one application request carrying any raw request byte. Automatic request retry, redirect replay/re-POST, authentication-refresh replay, connection replay after any application byte may have been written, hedging, speculative/parallel dispatch, failover, SDK retry middleware, and hidden queue redelivery SHALL be disabled and proven disabled by the enforcement receipt. Credentials and endpoint selection SHALL be resolved before the adapter tombstone transaction; an authentication challenge or redirect after the tombstone yields `UNQUERYABLE`, not another application request. A transport that cannot expose and enforce a no-retry/no-replay single-shot primitive is unsupported. Provider-native idempotency SHALL NOT excuse more than one measured application request.

Consequently, adapter `NOT_FOUND` SHALL mean only that the separate local acceptedness store has no record for the token. Because the canonical transport cannot start before the `MAY_HAVE_BEEN_ACCEPTED` transaction commits, this is authoritative proof that this adapter lane performed no worker/provider send for that token. Once any adapter record exists, lookup SHALL never return `NOT_FOUND`, even if the worker died before sending, the provider returns 404, provider state is eventually invisible, retention expired, or a native provider lookup reports no job. A bare `MAY_HAVE_BEEN_ACCEPTED` record or any loss of conclusive status SHALL yield `UNQUERYABLE` and no resend.

After the tombstone commits, the winning call SHALL transfer the bounded raw request once to the isolated worker defined below and invoke that one single-shot provider application request. A matching provider response may advance the same local record to `RUNNING`, `TERMINAL`, or `CANCELLED`. A transport error, redirect, authentication challenge, process crash, timeout, missing response, ambiguous provider result, or inability to commit the returned handle/receipt SHALL advance or reconcile it only to `UNQUERYABLE`, unless an optional provider-native authoritative lookup proves the exact same token is `RUNNING` or `TERMINAL`. Native provider idempotency/lookup MAY strengthen outcome recovery and provider-side deduplication, but Stage1 duplicate-send safety SHALL depend only on the local pre-send tombstone plus the single-shot transport and SHALL NOT require, assume, or emulate provider idempotency. Recovery SHALL never call the external send path again after a local tombstone exists.

The local acceptedness record SHALL survive Host/adapter/worker restart, package upgrade, provider-object cleanup, terminal cleanup, and packaged application relaunch for at least the full Host operation, terminal-receipt, domain-delivery, containment, and reconciliation lifecycle. A dispatch token SHALL never be recycled. The store SHALL persist no raw request/result, prompt, transcript, provider payload, reversible encoding, session, or arbitrary provider metadata. The local tombstone proves only “the canonical lane will not send this token twice”; it does not prove provider acceptance, provider result, remote deletion, or remote zero retention.

On restart in `DISPATCHING`, one Host-fenced reconciler SHALL perform authoritative lookup before any create call and apply exactly:

- `RUNNING(handle)`: adopt the same handle and transition to `RUNNING`;
- `TERMINAL(receipt)`: validate and adopt the same receipt and transition directly to its matching terminal state;
- `UNQUERYABLE`: transition to terminal `OUTCOME_UNKNOWN` with no rebuild or resend; or
- `NOT_FOUND`: because no adapter tombstone/send exists, ask the owning domain to resolve the exact `RequestRebuildRecipeV1`, rebuild the reservation-free body and final request deterministically into bounded volatile buffers, validate `reservedRequestBodyDigest` when present, validate the resolved profile against immutable `profileDigest`, and compare the final bytes with the Host record's immutable `requestDigest` and the recipe's `expectedRequestDigest`. Only an exact match permits the first atomic `createOrGet` with the same stable token; that call still must commit its separate adapter tombstone before its one send.

If `NOT_FOUND` is authoritative but the recipe, a frozen domain value, template, profile, serializer, or canonical `ComputeReservationV1` is unavailable or digest-mismatched, or rebuilt bytes do not match the stored request digest, the Host SHALL transition `DISPATCHING -> FAILED` with stable failure code `REQUEST_REBUILD_UNAVAILABLE`; no create, thread, turn, transport, or provider dispatch occurs. The same failure before initial dispatch uses `CLAIMED -> FAILED`. There is no current-template, alternate-profile, serializer, different-token, blind-retry, or raw-history fallback.

On restart in `RUNNING`, lookup `RUNNING`/`TERMINAL` is adopted, `UNQUERYABLE` becomes `OUTCOME_UNKNOWN`, and an impossible `NOT_FOUND` also becomes `OUTCOME_UNKNOWN` with no rebuild or resend. Any unknown result is terminal and never dispatched again. The adapter's local unique constraint SHALL make simultaneous callers converge on one acceptedness record and at most one external send; Host fencing is additional concurrency control, not a substitute for adapter uniqueness across process failure. A missing atomic local store, pre-send tombstone, token-unique `createOrGet`, lookup, cancel, or recipe-rebuild capability fails before initial dispatch.

Dispatch, reconstruction, reconciliation, and cancellation SHALL share the same Host operation fence. Cancellation that wins while `CLAIMED` transitions to `CANCELLED` with zero native dispatch. In `DISPATCHING`, authoritative adapter `NOT_FOUND` permits the fenced cancellation winner to transition to `CANCELLED` without reconstruction, tombstone, worker, or send. If the same-token `MAY_HAVE_BEEN_ACCEPTED` commit wins first, cancellation SHALL address only that adapter record/token and may transition to `CANCELLED` only from an authoritative adapter cancel/terminal receipt. A tombstone without an authoritative handle/cancel/terminal receipt becomes `UNQUERYABLE`, even when the worker had not yet sent. `RUNNING` follows the same authoritative cancel rule. `UNQUERYABLE`, or any impossible `NOT_FOUND` after a local adapter record exists, becomes `OUTCOME_UNKNOWN`; cancellation SHALL NOT infer containment, mint another token, or reopen a terminal operation.

#### Scenario: Crash after dispatch state commits but before adapter call

- **WHEN** an executable failpoint terminates the Host after the transaction commits `DISPATCHING`, the stable token, and recipe binding but before the first adapter call
- **THEN** restart lookup proves authoritative `NOT_FOUND`
- **AND** the owning domain rebuilds the request only into volatile buffers from the exact recipe and frozen dependencies
- **AND** matching body/final request digests permit the first `createOrGet` with the already-committed token
- **AND** that call commits one separate adapter tombstone before making at most one external send

#### Scenario: Crash after adapter tombstone but before external send

- **WHEN** an executable failpoint terminates the adapter after `MAY_HAVE_BEEN_ACCEPTED` commits but before worker creation or network/provider send
- **THEN** restart returns `UNQUERYABLE`, never `NOT_FOUND`
- **AND** no request rebuild, worker creation, external resend, or new token occurs
- **AND** the measured external-send count remains zero while the Host operation becomes `OUTCOME_UNKNOWN`

#### Scenario: Crash after external send but before handle commit

- **WHEN** an executable failpoint terminates the worker, adapter, or Host after the one external send but before the matching handle/terminal receipt commits
- **THEN** a configured provider-native authoritative lookup may recover and adopt the exact `RUNNING(handle)` or `TERMINAL(receipt)`
- **AND** without such conclusive evidence the adapter returns `UNQUERYABLE` and the Host records `OUTCOME_UNKNOWN`
- **AND** neither branch rebuilds or resends raw request bytes
- **AND** the measured external-send count remains exactly one

#### Scenario: Concurrent createOrGet races

- **WHEN** two processes or fenced reconcilers concurrently invoke exact `createOrGet` for one token
- **THEN** the adapter's durable unique constraint commits exactly one `MAY_HAVE_BEEN_ACCEPTED` record
- **AND** at most one winner enters the isolated worker/external-send path
- **AND** every loser returns/adopts the existing state or `UNQUERYABLE` without sending

#### Scenario: Transport attempts an implicit replay

- **WHEN** redirects, authentication refresh, connection failure after a possible write, SDK retry, hedging, failover, or queue redelivery would issue another provider application request for the same token
- **THEN** the single-shot transport suppresses that replay and returns `UNQUERYABLE`
- **AND** a provider-facing application-request counter records at most one request carrying any raw byte across crash, timeout, cancellation, and concurrency fixtures
- **AND** native provider idempotency cannot make a two-request fixture pass

#### Scenario: Request rebuild is unavailable

- **WHEN** `DISPATCHING` lookup authoritatively proves `NOT_FOUND` but any frozen recipe dependency is unavailable or either request-body/final-request digest mismatches
- **THEN** the operation becomes terminal `FAILED/REQUEST_REBUILD_UNAVAILABLE`
- **AND** native dispatch count remains zero

#### Scenario: Provider cleanup hides an accepted token

- **WHEN** provider GC, 404, eventual invisibility, or retention expiry prevents lookup from observing a token that may have been accepted
- **THEN** the local tombstone prevents `NOT_FOUND` and lookup returns `UNQUERYABLE`
- **AND** the operation becomes terminal `OUTCOME_UNKNOWN` without request rebuild, create, or resend

#### Scenario: Provider has no native idempotency

- **WHEN** an allowlisted attested provider offers no native idempotency or authoritative job lookup and the one send has an ambiguous response
- **THEN** the local tombstone keeps measured external-send count exactly one and lookup returns `UNQUERYABLE`
- **AND** the Host records `OUTCOME_UNKNOWN` without resend
- **AND** duplicate-send safety does not depend on inventing provider idempotency, while the independent real zero-retention attestation remains mandatory

#### Scenario: Cancellation races with request rebuild

- **WHEN** cancellation and `DISPATCHING + NOT_FOUND` recovery contend on the same operation fence
- **THEN** cancellation-first produces authoritative `CANCELLED` with zero adapter tombstone and zero send
- **AND** adapter-tombstone-first uses the one existing token and requires an authoritative adapter cancel/terminal receipt
- **AND** an unaddressable tombstone yields `UNQUERYABLE`, even if its worker had not sent yet
- **AND** neither order permits another token, blind resend, or inferred cancellation

#### Scenario: Dispatch lookup is unavailable

- **WHEN** the production adapter cannot provide its separate durable token-unique store, pre-send tombstone, atomic `createOrGet`, authoritative lookup, or cancel
- **THEN** the profile is unsupported and fails before initial native dispatch
- **AND** no legacy or blind-retry path is selected

#### Scenario: Payload spoofs an owner

- **WHEN** input claims another owner or principal
- **THEN** the Host-derived identity wins or the request is rejected
- **AND** no cross-owner status/result is disclosed

### Requirement: Stage1 has one attested ephemeral production Agent lane

Stage1 SHALL have exactly one production implementation of the generic Agent-operation adapter: package `@sciforge/agent-operation-adapter` at `packages/agent-operation-adapter`. The repository root `package.json` SHALL contain `dependencies["@sciforge/agent-operation-adapter"]` as a normal workspace runtime dependency, not a dev, optional, peer, test-only, dynamic-path, or packaged-only dependency. Source and packaged Host composition SHALL resolve the same package exports. The Host SHALL depend only on its generic adapter/profile contracts; no Host-private second adapter, domain-specific dispatch path, test bypass, runtime-name switch, or fallback lane may coexist.

That package SHALL own the production local acceptedness store and the only Stage1 transport/profile producer, whose exact profile kind SHALL be `ATTESTED_EPHEMERAL_V1`. Builder and Verifier real-Agent operations SHALL use that profile or fail before raw input dispatch. The package and profile remain generic: no Workflow Evolution business schema, provider-vendor branch, model-specific domain behavior, or domain-owned credential/configuration logic may enter them.

The Host SHALL select one strict `AttestedEphemeralProviderConfigV1` only from the currently verified signed bundle and bind its ID/version/digest into the immutable Agent operation/profile and adapter tombstone. The config SHALL be a closed object containing exactly:

```text
kind = "ATTESTED_EPHEMERAL_PROVIDER_CONFIG_V1"
schemaVersion = 1
configId
configVersion
providerId
endpointOrigin
endpointOriginDigest
tenantAccountDigest
region
modelIds
apiMode
transport = { transportId, transportVersion, transportDigest }
credentialRef
maxRequestBytes
maxResultBytes
timeoutMs
deniedSurfaces
attestationPolicy
configDigest
```

`configId`, `providerId`, `region`, `apiMode`, `transportId`, and `credentialRef` SHALL be `1..128` UTF-8 bytes without controls; `configVersion` and `transportVersion` SHALL be positive safe integers. `endpointOrigin` SHALL be one canonical absolute HTTPS origin of at most `512` ASCII bytes with normalized lowercase IDNA host, explicit non-default port only, and no userinfo, path other than `/`, query, or fragment; `endpointOriginDigest` SHALL be lowercase SHA-256 of its UTF-8 bytes. `tenantAccountDigest`, `transportDigest`, and every other named digest SHALL be 64 lowercase hexadecimal SHA-256 characters. `modelIds` SHALL contain `1..128` unique `1..128` UTF-8-byte values sorted lexically by UTF-8 bytes. `maxRequestBytes` and `maxResultBytes` SHALL be safe integers in `1..16_777_216`; `timeoutMs` SHALL be a safe integer in `1_000..3_600_000`.

`deniedSurfaces` SHALL be exactly the UTF-8-byte-sorted set `CHILD_AGENT`, `CLIPBOARD`, `CRASH_UPLOAD`, `FILESYSTEM`, `GENERIC_EVENT`, `LOG`, `SESSION_HISTORY`, `SHARED_CONTEXT`, `SHARED_MEMORY`, `SHELL_TOOL`, `TRACE`, and `UNALLOWLISTED_NETWORK`; it cannot omit or add a value. `attestationPolicy` SHALL be the closed `RemoteZeroRetentionAttestationPolicyV1` below. `configDigest` SHALL be lowercase SHA-256 over RFC 8785 canonical JSON UTF-8 bytes after removing only `configDigest`; it therefore covers the complete static policy but never a live `RemoteZeroRetentionAttestationV1`, challenge nonce, verification response, revocation response, `verifiedAt`, or `attestationDigest`. Unknown/duplicate members, aliases, invalid Unicode, duplicate/out-of-order values, unsupported versions, non-canonical origin/number/encoding, live evidence in the static config, or digest mismatch SHALL fail before credential resolution. Domain payloads, prompts, rebuild recipes, Agent output, and B policy documents SHALL NOT select or override any config or policy field.

`RemoteZeroRetentionAttestationPolicyV1` SHALL be a closed object containing exactly:

```text
kind = "REMOTE_ZERO_RETENTION_ATTESTATION_POLICY_V1"
schemaVersion = 1
policyId
policyVersion
issuerId
verificationPolicy
revocationAuthorityId
revocationAuthorityVersion
maxStatementAgeMs
maxClockSkewMs
requiredRequestRetention = "NONE"
requiredResponseRetention = "NONE"
requiredProviderLogTraceRetention = "NONE"
requiredTrainingUse = "NONE"
requiredHumanReview = "NONE"
requiredSecondaryUse = "NONE"
policyDigest
```

`verificationPolicy` SHALL be exactly one closed discriminated branch:

```text
{
  kind: "SIGNED_STATEMENT_POLICY",
  schemaVersion: 1,
  statementEndpointOrigin,
  statementEndpointOriginDigest,
  issuerKeyId,
  trustRootId,
  trustRootVersion
}

{
  kind: "OFFICIAL_VERIFICATION_API_POLICY",
  schemaVersion: 1,
  verificationEndpointOrigin,
  verificationEndpointOriginDigest,
  verifierId,
  verifierVersion,
  trustRootId,
  trustRootVersion
}
```

Policy IDs, issuer/verifier/key IDs, versions, origins, origin digests, and every other named digest use the exact config rules above. `maxStatementAgeMs` SHALL be a safe integer in `1_000..86_400_000`; `maxClockSkewMs` SHALL be a safe integer in `0..300_000`. Every required retention/use member SHALL be present and equal the fixed string `NONE`; it is not a caller-selectable preference. `policyDigest` SHALL be lowercase SHA-256 over RFC 8785 canonical JSON UTF-8 bytes after removing only `policyDigest`. An unknown/duplicate member, wrong branch member, alternate endpoint, zero/missing version, unsupported branch, non-canonical origin, non-`NONE` required value, out-of-range time, or digest mismatch SHALL fail before provider or credential selection.

The bundle's `RemoteAttestationTrustRootV1` SHALL be a closed object containing exactly:

```text
kind = "REMOTE_ATTESTATION_TRUST_ROOT_V1"
schemaVersion = 1
trustRootId
trustRootVersion
verificationKind
algorithm
publicKeySpkiDerBase64Url
publicKeySpkiSha256
notBefore
notAfter
trustRootDigest
```

`verificationKind` SHALL be `SIGNED_STATEMENT | OFFICIAL_VERIFICATION_API | SIGNED_REVOCATION_LIST_V1 | OFFICIAL_STATUS_API_V1`; `algorithm` SHALL be `Ed25519 | ECDSA_P256_SHA256 | RSA_PSS_SHA256`. The canonical unpadded base64url SPKI value SHALL decode to `32..8192` bytes and match `publicKeySpkiSha256`. A policy verification branch SHALL reference a root with the corresponding first or second kind; a revocation authority SHALL reference a root with the corresponding third or fourth kind. One descriptor cannot be silently reinterpreted for another verification kind. The bundle's `RemoteAttestationRevocationAuthorityV1` SHALL contain exactly:

```text
kind = "REMOTE_ATTESTATION_REVOCATION_AUTHORITY_V1"
schemaVersion = 1
authorityId
authorityVersion
protocol
endpointOrigin
endpointOriginDigest
trustRootId
trustRootVersion
maxResponseBytes
maxStalenessMs
authorityDigest
```

`protocol` SHALL be `SIGNED_LIST_V1 | OFFICIAL_STATUS_API_V1`; `maxResponseBytes` SHALL be a safe integer in `1..1_048_576`, and `maxStalenessMs` in `1_000..86_400_000`. All IDs use the config ID bounds, versions are positive safe integers, origins use the same canonical HTTPS rule, and `notBefore`/`notAfter` plus every bundle timestamp SHALL use canonical UTC RFC 3339 millisecond form `YYYY-MM-DDTHH:mm:ss.sssZ` with `notBefore < notAfter`. Each descriptor's final digest SHALL be lowercase SHA-256 over RFC 8785 canonical bytes after removing only that final digest. Unknown fields, duplicate IDs/versions, unsupported algorithms/protocols, invalid time order, non-canonical key bytes/origin, or digest mismatch fail closed.

The installation allowlist and its verification material SHALL come only from one closed `SignedAgentProviderTrustBundleV1`. Its signed body SHALL contain exactly:

```text
kind = "AGENT_PROVIDER_TRUST_BUNDLE_V1"
schemaVersion = 1
bundleId
bundleSequence
issuedAt
expiresAt
qualificationRecordDigest
providerConfigs
trustRoots
revocationAuthorities
```

`bundleId` uses the config ID bounds, `bundleSequence` is a positive safe integer, `qualificationRecordDigest` is lowercase SHA-256 of the immutable accepted 0.11P qualification record, and `issuedAt < expiresAt <= issuedAt + 30 days`. Arrays SHALL be non-empty, duplicate-free, and strictly UTF-8-byte sorted by `(configId, configVersion)`, `(trustRootId, trustRootVersion)`, and `(authorityId, authorityVersion)` respectively. Every config's `attestationPolicy.verificationPolicy` SHALL reference exactly one bundled trust-root ID/version of the matching verification kind, its `attestationPolicy` SHALL reference exactly one bundled revocation-authority ID/version, and that authority SHALL reference exactly one bundled trust-root ID/version of the matching revocation kind. Every descriptor SHALL be referenced; dangling or unused entries fail closed. A `RemoteZeroRetentionAttestationV1`, verification or revocation response, nonce, `verifiedAt`, `attestationDigest`, or other operation-time evidence anywhere in the signed body or envelope is an unknown member and invalidates the complete bundle.

The envelope SHALL contain exactly `kind="SIGNED_AGENT_PROVIDER_TRUST_BUNDLE_V1"`, `schemaVersion=1`, `body`, lowercase SHA-256 `bodyDigest`, `keyId`, `algorithm="Ed25519"`, and `signature`. `bodyDigest` SHALL cover the exact RFC 8785 canonical body UTF-8 bytes. The signature input SHALL be the exact ASCII bytes `SciForge.SignedAgentProviderTrustBundleV1` followed by one `0x00` byte and those canonical body bytes. `signature` SHALL be canonical unpadded base64url decoding to exactly 64 bytes. For candidate acceptance, `keyId` SHALL resolve through the one strict `OfficialVerificationKeyV2` keyring to the exact `agent-provider-trust-bundle` usage in `ACTIVE` mode and the candidate `bundleSequence` SHALL lie in that key's allocated eligibility interval. An inventory-only key cannot sign this bundle and a bundle-only key cannot sign an inventory. Adding the closed `distribution-inventory` and `agent-provider-trust-bundle` usages SHALL NOT rename, widen, revoke, replace, or reinterpret the existing `official-extension-package` usage or its migrated keys: an official-extension-package-only key remains valid only for the pre-existing extension-package verification path and cannot sign either new artifact, and neither new key usage can sign an extension package. No parallel keyring/root, unsigned local allowlist, settings/environment override, or domain-owned bundle exists.

Every bundle production SHALL consume one checked closed `AgentProviderTrustBundleReleaseInputV1` containing exactly `schemaVersion=1`, `bundleId`, positive safe-integer `bundleSequence`, `issuedAt`, `expiresAt`, `keyId`, and `qualificationRecordDigest`. Its values SHALL equal the body and envelope bindings exactly. It contains no provider/config/trust/revocation list, credential, live evidence, signature, private material, or override. One protected controller SHALL explicitly allocate the next bundle sequence and bind the immutable accepted qualification record plus reviewed static config/policy/root/authority semantic-parent tree. A generator SHALL NOT infer or increment the sequence, select a key, widen the qualification, or synthesize a list from mutable settings.

Ordinary PR CI SHALL deterministically generate the exact canonical body and signature-input bytes twice from that immutable semantic parent and release input with zero diff and no production private-key access. Only a non-exportable key held by a KMS, HSM, or equivalently isolated signing service MAY sign. The controller/build principal that checks out, validates, and packages repository code SHALL be distinct from the signer principal; the signing service SHALL never fetch, check out, execute, build, test, or inspect train code, accept a repository URL/commit/archive/path/command/mutable configuration, or export private material. Its request SHALL contain only exact `usage="agent-provider-trust-bundle"`, `keyId`, canonical signature-input bytes and their digest, `bodyDigest`, and an immutable approval/evidence reference already binding the release input, qualification digest, semantic-parent digest, and allocated sequence. The service SHALL independently enforce the active exact-usage sequence interval, recompute both digests, and return only the signature plus immutable signer receipt.

The signature/envelope SHALL land only in one mechanical child whose parent is the recorded unsigned semantic train and which contains no qualification, config, policy, trust, revocation, release-input, package, or other semantic edit. Final CI SHALL regenerate from the recorded parent/input, verify the signer receipt and packaged source/release bytes, and reject child or later semantic drift. An exportable key file, a signer colocated with train code, a digest-only signer that does not receive the exact bytes, or one principal able to alter both reviewed bytes and signer authorization is `NO_GO`.

The Host SHALL durably retain the highest accepted bundle sequence, digest, exact envelope/body bytes, accepting key ID/usage/keyring revision/eligibility interval, and complete config/trust/revocation bindings. On every startup it SHALL reparse, recanonicalize, rehash, and reverify that retained evidence before provider selection. An exact retained envelope accepted before key retirement MAY reverify under that key's frozen `VERIFY_ONLY` interval, but a `VERIFY_ONLY` key SHALL never admit a newly presented candidate even if its signature is valid. An identical same-sequence retained body is idempotent; a lower sequence, same-sequence byte drift, expired bundle, unknown/wrong-usage key, candidate signed by a `VERIFY_ONLY` key, sequence outside eligibility, invalid signature, incomplete high-water, duplicate/out-of-order entry, config/trust/revocation drift, or source/packaged bundle mismatch fails before credential resolution. Rotation requires a distinct higher-sequence `ACTIVE` key interval and preserves every in-flight operation's bound digests; a newly revoked or unverifiable configuration admits no new raw dispatch, and an already sent operation without authoritative terminal evidence becomes `OUTCOME_UNKNOWN` without resend or fallback.

Every configuration SHALL carry only opaque `credentialRef`. The Host-private `HostCredentialVaultV1` SHALL expose only `acquireForAgent({ credentialRef, providerConfigDigest, operationPrincipal }) -> CredentialLeaseV1`; it SHALL have no enumerate, generic read, write, delete, export, or domain/renderer/IPC method. The Host derives installation/account/operation scope and verifies the current bundle/config before calling it. Its only private failures SHALL be `CREDENTIAL_NOT_FOUND | CREDENTIAL_SCOPE_MISMATCH | CREDENTIAL_VAULT_UNAVAILABLE | CREDENTIAL_FORMAT_INVALID | CREDENTIAL_LEASE_EXPIRED`; all map to one non-disclosing public `AGENT_PROVIDER_UNAVAILABLE`.

`CredentialLeaseV1` SHALL be non-serializable, operation-bound, single-use, and hold at most `16_384` bytes in locked/non-pageable mutable memory. `transferToWorker()` may succeed once and SHALL detach/clear the Host buffer; `dispose()` SHALL be idempotent and clear any untransferred bytes. Expiry, success, failure, cancellation, timeout, worker crash, transfer error, or any validation mismatch SHALL invoke `dispose()` in `finally`, and the worker SHALL independently clear its received buffer before exit. macOS uses Keychain, Windows uses Credential Manager, and Linux uses Secret Service or an equivalent OS credential facility; a backend that returns only immutable strings, logs secrets, lacks account scoping, or cannot prove cleanup makes the profile unsupported.

Secret bytes SHALL never be stored in repository files, package data, settings JSON, application-read environment/config files, manifests, signed bundles, databases, logs, traces, receipts, crash artifacts, or domain state. Protected CI MAY provision an ephemeral OS-vault entry through platform secret injection before launching the source or packaged app; the application still resolves only the opaque reference, and evidence exposes only allowlisted digests.

After the signed bundle, selected config, static policy, trust roots, and revocation authority have been fully validated, but before `HostCredentialVaultV1.acquireForAgent`, an adapter tombstone, worker creation, protected raw allocation, or raw reconstruction, the Host SHALL dynamically obtain one current `RemoteZeroRetentionAttestationV1` under that exact policy. `SIGNED_STATEMENT_POLICY` obtains the statement and its verification branch only from `statementEndpointOrigin`; `OFFICIAL_VERIFICATION_API_POLICY` first generates a fresh unpredictable 32-byte challenge nonce and obtains the statement plus challenge response only from `verificationEndpointOrigin`. These public verification operations receive no provider credential, domain payload, prompt/result, rebuild input, operation secret, or alternate endpoint. A nonce is single-attempt, is never reused across attestation and revocation checks, and is cleared after verification.

The live attestation SHALL NOT be a member of `AttestedEphemeralProviderConfigV1`, `SignedAgentProviderTrustBundleV1`, either static digest body, or the retained bundle high-water record. The Host MAY retain a validated live attestation only in bounded Host-private memory until the earliest of statement expiry, policy freshness expiry, bundle expiry, trust-root expiry, or configuration rotation; every admitted operation SHALL still perform a current revocation check. After full validation and before credential resolution, the Host SHALL commit one immutable operation-scoped binding of `policyDigest`, `attestationDigest`, `statementDigest`, verification kind/root, and `revocationEvidenceDigest` into the selected profile/enforcement record. The one subsequent pre-send adapter tombstone SHALL copy those exact digests. Any binding conflict or lost/partial binding fails closed and cannot select a second attestation or provider lane.

`RemoteZeroRetentionAttestationV1` SHALL be a closed object containing exactly `kind="REMOTE_ZERO_RETENTION_ATTESTATION_V1"`, `schemaVersion=1`, `statement`, `verification`, and `attestationDigest`. Its closed `statement` SHALL contain exactly:

```text
kind = "REMOTE_ZERO_RETENTION_STATEMENT_V1"
schemaVersion = 1
attestationId
attestationVersion
issuerId
providerId
endpointOriginDigest
tenantAccountDigest
region
modelIds
apiMode
requestRetention = "NONE"
responseRetention = "NONE"
providerLogTraceRetention = "NONE"
trainingUse = "NONE"
humanReview = "NONE"
secondaryUse = "NONE"
issuedAt
expiresAt
revocationAuthorityId
revocationAuthorityVersion
revocationStatusId
revocationStatusVersion
statementDigest
```

IDs/strings, versions, timestamps, model sorting, and digests use the exact config/bundle rules above; `issuedAt < expiresAt`, the statement lifetime SHALL be at most 24 hours, and every retention/use field is the fixed string `NONE`. `statementDigest` SHALL be lowercase SHA-256 over RFC 8785 canonical statement JSON after removing only `statementDigest`.

`verification` SHALL be exactly one closed discriminated branch:

```text
{
  kind: "SIGNED_STATEMENT",
  schemaVersion: 1,
  issuerKeyId,
  algorithm,
  signature,
  certificateChainDigests,
  trustRootId,
  trustRootVersion
}

{
  kind: "OFFICIAL_VERIFICATION_API",
  schemaVersion: 1,
  verifierId,
  verifierVersion,
  challengeNonce,
  authenticatedResponseDigest,
  responseAlgorithm,
  responseSignature,
  verifierEndpointOriginDigest,
  certificateChainDigests,
  trustRootId,
  trustRootVersion,
  verifiedAt
}
```

Algorithms SHALL use the trust-root enum. The `SIGNED_STATEMENT` signature input is the exact ASCII bytes `SciForge.RemoteZeroRetentionStatementV1`, one `0x00` byte, and the canonical statement bytes including `statementDigest`. Its branch kind, `issuerKeyId`, and trust-root ID/version SHALL exactly equal the signed policy and referenced root.

For `OFFICIAL_VERIFICATION_API`, the authenticated response bytes SHALL be the exact RFC 8785 canonical JSON UTF-8 bytes of one closed `RemoteZeroRetentionVerificationResponseV1` containing exactly:

```text
kind = "REMOTE_ZERO_RETENTION_VERIFICATION_RESPONSE_V1"
schemaVersion = 1
verifierId
verifierVersion
challengeNonce
statementDigest
verifiedAt
```

Every response value SHALL equal the corresponding verification-branch, Host challenge, validated statement, and signed-policy value. `authenticatedResponseDigest` SHALL be lowercase SHA-256 of those exact response bytes. The response signature input SHALL be the exact ASCII bytes `SciForge.RemoteZeroRetentionVerificationResponseV1`, one `0x00` byte, the Host's decoded 32-byte random challenge nonce, and those canonical response bytes. `verifierEndpointOriginDigest` SHALL equal the signed policy endpoint digest; the response branch and referenced trust root SHALL both have kind `OFFICIAL_VERIFICATION_API`.

Nonces and signatures use canonical unpadded base64url. Ed25519 and ECDSA-P256 signatures decode to exactly 64 raw bytes, with ECDSA using IEEE P1363 `r || s`; RSA-PSS-SHA256 decodes to the pinned modulus length `256..1024` bytes and uses a 32-byte salt. `certificateChainDigests` contains `1..8` lowercase SHA-256 values in leaf-to-root order with no duplicate. Every verification identity/version/root and algorithm must match the exact signed policy and one exact bundle descriptor; `verifiedAt` uses the canonical timestamp form, is allowed only on the API branch, and SHALL be within `maxClockSkewMs` of Host verification time.

`attestationDigest` SHALL be lowercase SHA-256 over RFC 8785 canonical JSON UTF-8 bytes of the complete validated attestation after removing only `attestationDigest`. Unknown/duplicate members, an extra branch field, unsupported algorithm/encoding, invalid nonce/signature length, chain/root mismatch, timestamp drift, non-canonical ordering/bytes, or any digest mismatch fails closed.

The current revocation result SHALL be represented only by a closed `RemoteAttestationRevocationEvidenceV1` containing exactly `kind="REMOTE_ATTESTATION_REVOCATION_EVIDENCE_V1"`, `schemaVersion=1`, `status`, `verification`, and `revocationEvidenceDigest`. Its `status` SHALL contain exactly:

```text
kind = "REMOTE_ATTESTATION_REVOCATION_STATUS_V1"
schemaVersion = 1
authorityId
authorityVersion
attestationId
attestationVersion
revocationStatusId
revocationStatusVersion
status = "GOOD" | "REVOKED"
thisUpdate
nextUpdate
statusDigest
```

Every identity/version SHALL exactly match the policy, authority, and attestation statement. `thisUpdate < nextUpdate`; both use the canonical timestamp form. `statusDigest` SHALL be lowercase SHA-256 over RFC 8785 canonical status JSON UTF-8 bytes after removing only `statusDigest`.

Revocation `verification` SHALL be exactly one closed branch matching the referenced authority's `protocol`:

```text
{
  kind: "SIGNED_LIST_V1",
  schemaVersion: 1,
  algorithm,
  signature,
  certificateChainDigests,
  trustRootId,
  trustRootVersion
}

{
  kind: "OFFICIAL_STATUS_API_V1",
  schemaVersion: 1,
  challengeNonce,
  authenticatedResponseDigest,
  responseAlgorithm,
  responseSignature,
  endpointOriginDigest,
  certificateChainDigests,
  trustRootId,
  trustRootVersion,
  verifiedAt
}
```

For `SIGNED_LIST_V1`, the signature input SHALL be the exact ASCII bytes `SciForge.RemoteAttestationRevocationStatusV1`, one `0x00` byte, and the canonical status bytes including `statusDigest`. For `OFFICIAL_STATUS_API_V1`, the Host SHALL create a fresh independent 32-byte random nonce and the authenticated response bytes SHALL be exact RFC 8785 canonical JSON UTF-8 bytes of one closed object containing exactly `kind="REMOTE_ATTESTATION_REVOCATION_RESPONSE_V1"`, `schemaVersion=1`, `challengeNonce`, `statusDigest`, and `verifiedAt`. Those values SHALL equal the Host challenge, validated status, and verification branch; `authenticatedResponseDigest` SHALL be lowercase SHA-256 of those exact bytes. The response signature input SHALL be the exact ASCII bytes `SciForge.RemoteAttestationRevocationResponseV1`, one `0x00` byte, the decoded Host nonce, and those canonical response bytes. `endpointOriginDigest` SHALL equal the signed authority endpoint digest. Algorithms, signature/nonce encodings and sizes, chain ordering, and `verifiedAt` use the exact attestation-verification rules above; the referenced root SHALL match the authority and have the corresponding revocation verification kind.

`revocationEvidenceDigest` SHALL be lowercase SHA-256 over RFC 8785 canonical JSON UTF-8 bytes of the complete validated evidence after removing only `revocationEvidenceDigest`. A usable result requires `status="GOOD"`, `thisUpdate <= now < nextUpdate`, `now - thisUpdate <= maxStalenessMs`, an API `verifiedAt` within policy `maxClockSkewMs` where applicable, total fetched bytes no greater than `maxResponseBytes`, and an exact current authority/root/protocol/endpoint binding. Unknown/duplicate/extra branch members, a reused or mismatched nonce, wrong status/attestation/authority identity, stale or future response, `REVOKED`, unavailable lookup, signature/chain/root mismatch, non-canonical bytes, or digest mismatch fails closed.

Before credential resolution, adapter tombstone, worker creation, protected allocation, or raw transfer, the Host SHALL use the currently verified signed policy and its installation-pinned bundled roots—not fields supplied by the domain or untrusted evidence—to verify the statement digest, selected policy branch, signature or official challenge response, certificate chain/endpoint, issuer, exact provider/endpoint/tenant/region/model/API scope, and current revocation evidence. The statement fields `requestRetention`, `responseRetention`, `providerLogTraceRetention`, `trainingUse`, `humanReview`, and `secondaryUse` SHALL respectively equal the signed policy fields `requiredRequestRetention`, `requiredResponseRetention`, `requiredProviderLogTraceRetention`, `requiredTrainingUse`, `requiredHumanReview`, and `requiredSecondaryUse`. The statement SHALL satisfy `issuedAt < expiresAt`, lifetime at most 24 hours, `issuedAt <= now + maxClockSkewMs`, `now - issuedAt <= maxStatementAgeMs`, and `now < expiresAt`. Any missing field, unsupported version/algorithm, fixture/mock key, local self-signature, chain/trust-root mismatch, signature/nonce mismatch, stale/future/expired statement, revoked/unavailable/stale evidence, policy/configuration mismatch, or incomplete operation binding SHALL fail with stable `REMOTE_ZERO_RETENTION_ATTESTATION_INVALID` before an adapter tombstone, credential acquisition, worker, protected allocation, or raw transfer.

Before raw bytes leave the Host, the `ATTESTED_EPHEMERAL_V1` producer SHALL return one immutable, versioned `AgentProfileEnforcementReceiptV1` that binds the Host operation/principal, request/profile/config/policy digests, exact `attestationDigest` and statement digest, adapter package/version/digest, worker executable/version/digest, transport version/digest, enforced buffer/time/single-shot limits, exact denied surfaces, verification kind, pinned trust-root ID/version, verification time, exact `revocationEvidenceDigest`, and result `VALID`. The immutable operation-scoped attestation binding and adapter tombstone SHALL carry the same policy/attestation/statement/revocation digests; any mismatch fails before send. A requested flag, provider name, static configuration file, local digest, mock receipt, or self-asserted “no retention” string is not evidence. The isolated worker/provider transport SHALL return a matching versioned `AgentExecutionReceiptV1` for success, failure, cancellation, or timeout, binding actual provider configuration and enforcement status without raw bytes. Missing or mismatched terminal enforcement evidence makes the operation `OUTCOME_UNKNOWN`; it never permits resend or a weaker lane.

Raw request/result bytes SHALL cross the production lane only as bounded, single-owner, transferable mutable byte buffers into or out of one destroy-on-completion isolated worker process. Transfer SHALL detach the sender's buffer; conversion to immutable strings, structured-clone copies, fan-out, or shared buffers is forbidden. Every Host, adapter, worker, transport, or Controller delivery process while it can hold raw bytes SHALL disable core dumps, application/OS crash reporting, minidumps, diagnostic heap snapshots, and automatic crash upload; enter the platform's non-dumpable mode; and back raw buffers with locked/non-pageable memory or an equivalent OS-protected allocation excluded from swap and crash capture. Those protections SHALL be active and Host-verified before any raw allocation or reconstruction; their platform evidence and exact lifetime SHALL be bound into the enforcement receipt before raw bytes leave the Host.

The worker SHALL have no disk/filesystem persistence, session/thread history, generic event publication, trace, log, cache, artifact, clipboard, shared memory/context, child-agent, shell/tool, or non-allowlisted network surface. It SHALL clear each owned buffer in `finally` and terminate after the one result transfer or after failure, cancellation, timeout, or crash containment. The Host SHALL clear/detach its final result buffer immediately after the single Controller-only delivery attempt. A platform that cannot enforce process isolation, transferable ownership, bounded protected memory, non-dumpable/no-crash-report state, worker destruction, and every denied surface SHALL mark `ATTESTED_EPHEMERAL_V1` unsupported before raw allocation or dispatch.

The current persistent Codex lane, persistent Claude lane, every FullTrace-enabled lane, and any runtime that keeps session/thread/turn history SHALL be explicitly unsupported for `ATTESTED_EPHEMERAL_V1`. They SHALL NOT be wrapped, configured, or claimed as equivalent, and there SHALL be no automatic/manual fallback from the production profile to those lanes.

The durable local pre-send tombstone and the remote zero-retention attestation SHALL be independent mandatory controls. The tombstone proves only that the canonical adapter will make at most one external send for a token; it cannot prove remote non-retention. The attestation/enforcement receipts prove the configured worker/transport/provider retention contract; they cannot replace the local tombstone, token uniqueness, lookup, cancel, or `OUTCOME_UNKNOWN` behavior.

At least one real allowlisted, remotely attested provider configuration SHALL first pass the production package's separate pre-P4 Agent-activation source and packaged conformance gate through the exact Host → `@sciforge/agent-operation-adapter` → `ATTESTED_EPHEMERAL_V1` path using only the unexported probe above. This gate is not part of the basic P1/P2 foundation gate: its failure does not block pure Ledger/FSM/reducer development or the backend package merge, but it keeps every real Builder/Verifier dispatch and `CANDIDATE_PRIVATE` route fail closed. Its evidence proves the generic adapter/profile, tombstones, single-shot transport, attestation, synthetic recipe recovery, and raw-isolation boundaries; it SHALL NOT claim a production B consumer or bounded Builder projection. The same configuration SHALL later execute the P4 real-Agent Candidate gate through B's real owner/recipe/projection path before Agent-driven Candidate work activates. Mock providers, loopback transports, fake attestations, fixture-only adapters, and directly invoked package internals SHALL NOT satisfy either Agent gate. If no such configuration is available or the applicable source/packaged/P4 conformance assertion fails, Stage1 Agent-driven Candidate work SHALL be `NO_GO`; it SHALL NOT be marked ready and SHALL NOT fall back to a persistent lane.

The repository SHALL provide one protected real-provider E2E workflow owned by `[I]`. For every OS/architecture declared supported by `ATTESTED_EPHEMERAL_V1`, it SHALL install the exact immutable source train, build the release artifact, provision only an ephemeral OS-vault credential, and run the same conformance assertions once against source composition and once by launching the exact packaged artifact. The workflow SHALL bind its redacted evidence digest to the train SHA, signed provider/trust-bundle digest, provider scope, artifact digest, platform/architecture, commands, and result. Ordinary PR jobs receive no provider credentials. A platform lacking any required isolation, vault, attestation, revocation, source, or packaged assertion SHALL be recorded as `UNSUPPORTED/NO_GO` for Agent Candidate work and SHALL NOT borrow evidence from another platform.

#### Scenario: Domain payload requests another provider or lane

- **WHEN** a domain payload, prompt, rebuild recipe, or Agent output names a provider configuration, endpoint, transport, credential, retention mode, or persistent runtime
- **THEN** the Host-selected allowlisted `ATTESTED_EPHEMERAL_V1` configuration remains authoritative or the operation is rejected
- **AND** no raw bytes, worker, adapter tombstone, or provider request are created for the spoofed selection

#### Scenario: Provider bundle rolls back or settings supply a trust override

- **WHEN** the presented bundle has a lower sequence, same-sequence body drift, invalid/expired signature, or any settings/environment/domain-supplied provider or trust override
- **THEN** provider selection fails before credential resolution, adapter tombstone, worker creation, or raw allocation
- **AND** the previously accepted complete canonical bundle state is neither overwritten nor weakened

#### Scenario: Protected signer and Host independently canonicalize the bundle

- **WHEN** the protected signer and a source or packaged Host receive the same immutable release input and qualified config/trust/revocation records
- **THEN** they independently produce the same strictly sorted closed body, RFC 8785 bytes, body digest, domain-separated signature input, and verified envelope
- **AND** the signed body binds the exact immutable `qualificationRecordDigest`
- **AND** an unknown field, duplicate, ordering change, timestamp/origin/key encoding drift, wrong key usage, or changed descriptor digest fails before provider or credential lookup

#### Scenario: Bundle signer can inspect or execute the train

- **WHEN** the signing principal can export the key, check out or execute train code, accept a repository/path/command/mutable configuration, sign only a caller-supplied digest without the exact canonical bytes, or alter both reviewed bytes and signer authorization
- **THEN** protected bundle production is `NO_GO` and no envelope or packaged artifact is accepted
- **AND** only the isolated exact-usage `ACTIVE` KMS/HSM signing service may return a signature and immutable signer receipt for the pre-approved bytes

#### Scenario: Static bundle attempts to carry live attestation evidence

- **WHEN** a provider config, signed body, or envelope contains a `RemoteZeroRetentionAttestationV1`, `challengeNonce`, verification/revocation response, `verifiedAt`, `attestationDigest`, or any other operation-time evidence instead of only the closed static policy and descriptors
- **THEN** closed-schema and canonical-signature validation reject the complete bundle before high-water acceptance, provider selection, or credential resolution
- **AND** the Host obtains fresh attestation and current revocation evidence only after validating the bundle/config and before credential acquisition, protected allocation, adapter tombstone, worker creation, or raw transfer
- **AND** the resulting `attestationDigest` and `revocationEvidenceDigest` bind the one immutable operation, enforcement receipt, and adapter tombstone without entering `configDigest` or the signed bundle

#### Scenario: Credential reference cannot be resolved safely

- **WHEN** the opaque credential reference is absent from the platform OS vault, resolves under another installation/account, or would require reading plaintext settings, environment, or repository files
- **THEN** dispatch fails before worker creation and raw request transfer
- **AND** no secret or protected-operation existence is logged or returned

#### Scenario: Credential lease exits on every path

- **WHEN** credential acquisition or transfer is followed by success, provider failure, cancellation, timeout, validation error, worker crash, or Host exception
- **THEN** the Host invokes idempotent lease disposal and the worker clears any transferred credential bytes before exit
- **AND** scans find no credential canary or reversible encoding in application memory surviving the lease, logs, traces, crashes, settings, environment snapshots, files, databases, receipts, or domain state

#### Scenario: Persistent runtime is offered

- **WHEN** Codex, Claude, FullTrace, or another session/thread-history lane is the only available runtime
- **THEN** `ATTESTED_EPHEMERAL_V1` is unsupported and dispatch fails before raw input leaves the Host
- **AND** no wrapper, weaker retention setting, or fallback is selected

#### Scenario: Remote attestation is missing or invalid

- **WHEN** the selected remote configuration lacks a current Host-verifiable zero-retention attestation or its canonical statement, signature/challenge response, chain, pinned trust root, revocation/freshness, scope, provider/endpoint/tenant/region/model/API binding, or expiry is invalid
- **THEN** profile production fails before worker creation and raw transfer
- **AND** returns stable `REMOTE_ZERO_RETENTION_ATTESTATION_INVALID`
- **AND** the local tombstone is not misreported as privacy evidence

#### Scenario: The separate pre-P4 gate proves only the generic real source and packaged lane

- **WHEN** the pre-P4 Agent readiness gate is evaluated after 0.11P, 0.11S, 0.11A, and the legacy-consumer migration
- **THEN** source and packaged tests each resolve the root runtime dependency and dispatch through the same production adapter/profile to at least one real allowlisted attested remote configuration
- **AND** official issuer evidence under an installation-pinned non-fixture trust root passes signature/challenge, scope, freshness, and revocation verification
- **AND** the unexported probe's test-only durable recipe store proves the generic authoritative-`NOT_FOUND` same-token reconstruction boundary without persisting domain data
- **AND** the resulting Host-verified enforcement/execution receipts, operation identity, adapter tombstone, provider configuration, and provider-facing application-request count match
- **AND** no production B projection, B delivery-COMMIT boundary, or Candidate activation is claimed
- **AND** the basic P1/P2 foundation remains independent of this gate
- **AND** absence of that evidence is `NO_GO`

#### Scenario: P4 proves the production B projection path

- **WHEN** the P4 real-Agent Candidate gate is evaluated
- **THEN** the same source and packaged production adapter/profile path uses B's real durable recipe owner and first production Builder consumer
- **AND** the bounded `CandidateProposalV1` projection, consumption receipt, and both projection-COMMIT crash boundaries match
- **AND** generic non-production probe evidence cannot substitute for this production B evidence
- **AND** absence of the real provider, B recipe owner, or projection evidence is `NO_GO`

#### Scenario: Raw surfaces remain empty

- **WHEN** source and packaged conformance inject unique request/result canaries and exercise success, provider failure, cancellation, timeout, crash before send, crash after send, and result-delivery failure
- **THEN** scans find no complete canary or bounded high-entropy canary fragment in Host/adapter/domain databases, workspace/temp/package/adapter-worker-runtime files, OS and application core/minidump/crash-report/crash-upload directories, swap/page-capture fixtures, sessions, thread/turn history, events, traces, logs, caches, artifacts, queues, or surviving worker state
- **AND** scanners recursively decode every reversible representation enabled by the transport/log/runtime stack, including raw bytes, UTF-8, JSON escapes, base64, hexadecimal, percent/URL encoding, chunks/fragments, gzip, deflate, Brotli, and Zstandard, within bounded test limits
- **AND** the isolated worker has terminated and every transferable source buffer is detached or cleared
- **AND** provider-facing instrumentation proves at most one application request carrying raw bytes per token
- **AND** only allowlisted digests, bounded metadata, tombstones, and versioned enforcement/terminal receipts remain locally; remote non-retention is proven by the independently verified real provider attestation, not by the local scan

### Requirement: Agent profiles enforce operation-principal isolation

The generic Agent profile SHALL support request-only context, Controller-only direct result delivery, end-to-end raw retention `NONE`, hard runtime/model/token/time limits, and explicit denial of native tools, file, arbitrary network, env/secrets, Broker capabilities, shared memory/context/publication, and child agents.

For this contract, **raw** means the complete request and prompt bytes, every system/user/context message, runtime or provider transcript/turn/event/stream, and every unparsed or partially parsed provider-result byte. End-to-end raw retention `NONE` means no Host, adapter, transport, provider, domain, log, trace, queue, database, filesystem, artifact, or export may persist those bytes. Raw data may exist only in bounded single-owner mutable volatile buffers required for the current initial or fenced recovery dispatch and one result-delivery attempt. Every buffer owner SHALL clear its buffer in `finally` on success, failure, cancellation, timeout, or digest mismatch. Deterministic reconstruction from `RequestRebuildRecipeV1` does not permit caching, logging, immutable-string conversion, fan-out copying, or persistence of reconstructed bytes.

`NONE` SHALL cover Host, runtime adapter, transport, and remote model/provider retention rather than only local persistence. Before dispatch, every selected hop SHALL return a versioned enforcement receipt proving the required no-retention mode and prohibited surfaces; a requested setting or provider name is insufficient. A runtime/transport/provider that cannot enforce and attest `NONE` is unsupported and fails before sending raw input. There is no Host-only interpretation or permissive fallback.

Inputs/results SHALL NOT be published to sidebar/UI/thread lists, generic turn events, artifact consumers, shared memory, goal/context ledgers, visible state, handoff/reference systems, sibling principals, or other same-owner consumers. Unsupported runtimes SHALL fail before thread creation with no legacy fallback.

#### Scenario: A denied surface contains a canary

- **WHEN** any shared/publication/context surface contains the positive-control canary
- **THEN** the canary is absent from operation input, output, artifacts, logs, and export

#### Scenario: Remote provider cannot prove no retention

- **WHEN** the selected runtime, transport, or model provider cannot enforce and receipt end-to-end raw retention `NONE`
- **THEN** the Agent operation fails before raw input leaves the Host
- **AND** no alternative provider or weaker Host-only mode is selected automatically

#### Scenario: A late result arrives

- **WHEN** an operation is cancelled, superseded, or outcome-contained before a result arrives
- **THEN** only digest, size, terminal metadata, and quarantine reason persist
- **AND** no raw payload is published or adopted

### Requirement: Raw delivery and domain consumption are separately durable

A generic Agent `SUCCEEDED` state SHALL mean only that the runtime produced an authoritative terminal receipt. It SHALL NOT mean that the owning domain parsed, accepted, or durably consumed the result.

For Stage1 Builder and Verifier operations, the only persistable business content derived from an Agent result SHALL be a strict, bounded, schema-validated `CandidateProposalV1` or `VerificationAssessmentV1` projection produced in B's operation-principal-scoped delivery handler. Their exact closed fields, nested structures, bounds, ordering, RFC 8785 digest bodies, and consumption-receipt bindings SHALL be normatively owned by `workflow-candidate-governance` and exported by `@sciforge/domain-workflow-evolution/contract`; the generic Host SHALL NOT copy or widen either business schema. The handler SHALL parse directly from the one volatile result buffer, reject the complete result on any unknown field, invalid discriminant, invalid value, ordering, duplicate, or size/count limit, and exclude Agent request/system/context prompts, transcripts, provider envelopes, unparsed bytes, and unknown fields from the projection. This whitelisted projection is domain data, not permission to retain any raw request, transcript, or provider-result representation.

B's deterministic coordinator SHALL commit the validated projection, a business-consumption receipt bound to the Agent operation/request/profile/result and projection type/version/digest, and the corresponding B Operation/Attempt transition in one Ledger transaction. Until that transaction commits, no later B state may treat the Agent output as consumed. An acknowledgement sent after commit is transport bookkeeping only; it SHALL NOT be a second state transition.

If the Host cannot prove an authoritative terminal runtime result, the generic Agent operation is `OUTCOME_UNKNOWN`. If the Host already proves `SUCCEEDED` but B cannot find the matching atomic projection/consumption receipt after restart, B SHALL treat business delivery as unknown and atomically set its still-nonterminal B Operation to `OUTCOME_UNKNOWN`, the Attempt to `EXECUTION_UNKNOWN`, and the Run to `RECOVERY_REQUIRED`; the Host terminal record remains unchanged. Neither case permits result redelivery, provider re-query, operation resend, automatic repair, or a new operation under the same logical Attempt. If the projection transaction committed before an acknowledgement was lost, reconciliation SHALL recover only the persisted projection and consumption receipt and SHALL NOT request or reconstruct raw bytes.

Cancellation, supersession, and late-result containment SHALL use the same linearized boundary. If containment wins before the projection transaction, the handler SHALL refuse projection persistence and retain only digest, size, terminal metadata, and quarantine reason. If the projection transaction committed first, reconciliation may recover that exact projection and receipt idempotently, but the result SHALL NOT reopen or advance a subsequently cancelled or superseded Attempt.

#### Scenario: Process dies after raw delivery but before business commit

- **WHEN** a volatile Builder or Verifier result was delivered, or the Host already recorded `SUCCEEDED`, but the process exits before B commits the validated projection and consumption receipt
- **THEN** restart does not redeliver, re-query, resend, or reconstruct the raw result
- **AND** an unproven Host terminal outcome is `OUTCOME_UNKNOWN`
- **AND** a proven Host `SUCCEEDED` result without the B receipt makes the B Operation `OUTCOME_UNKNOWN`, the Attempt `EXECUTION_UNKNOWN`, and the Run `RECOVERY_REQUIRED`

#### Scenario: Process dies after business commit but before acknowledgement

- **WHEN** B atomically committed the projection, consumption receipt, and Operation/Attempt transition but the process exits before acknowledging delivery
- **THEN** restart recovers the exact committed projection and receipt
- **AND** no raw bytes are redelivered or reconstructed
- **AND** the domain transition is not applied a second time

#### Scenario: Cancellation races with result delivery

- **WHEN** cancellation, supersession, or outcome containment linearizes before the projection transaction
- **THEN** no `CandidateProposalV1` or `VerificationAssessmentV1` is persisted
- **AND** only digest, size, terminal metadata, and quarantine reason may persist
- **WHEN** the projection transaction linearizes first
- **THEN** reconciliation may recover only that exact projection and receipt
- **AND** the result cannot reopen or advance the contained Attempt
