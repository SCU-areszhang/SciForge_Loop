## ADDED Requirements

### Requirement: Workspace identity is canonical before domain dispatch

The Host SHALL derive `WorkspaceIdentityV1` from an existing directory's validated absolute realpath and stable platform directory identity, with platform case and symlink-alias handling. It SHALL bind the opaque identity to caller context before capability or lifecycle-Host dispatch. A workspace, owner, provider provenance, operation owner, or canonical path supplied through payload, factory data, environment data, or invocation options SHALL be rejected before handler or operation lookup; it SHALL NOT be ignored or accepted as a fallback. Domains SHALL treat the identity as opaque and SHALL NOT repartition by independently normalized path text.

The same directory identity SHALL resolve to the same `WorkspaceIdentityV1` across source and packaged execution and across process restart. Replacing the directory with a different platform identity at the same path SHALL produce a different workspace identity and SHALL NOT reopen the prior workspace namespace.

#### Scenario: One directory has multiple spellings

- **WHEN** source or packaged callers use absolute, case, or symlink aliases for one directory
- **THEN** Catalog, Ledger, authorization scope, Catalog/Agent/publication operation namespaces, and Candidate lease all receive the same opaque workspace identity
- **AND** an alias never creates a second state or authorization island

#### Scenario: Workspace payload override is attempted

- **WHEN** a request supplies a workspace, owner, provider provenance, operation owner, or canonical path instead of using Host-bound context
- **THEN** the Host rejects the request before handler or operation lookup
- **AND** no workspace, operation, provider, or resource existence metadata is disclosed

#### Scenario: A path is replaced across restart

- **WHEN** a process restarts and the former path now names a different directory identity
- **THEN** the Host does not attach that directory to the prior `WorkspaceIdentityV1`
- **AND** no persisted operation or authorization scope is recovered into the replacement directory

### Requirement: Standard manifest V2 owns distribution membership and defaults

The clean target SHALL accept only strict standard `DomainPackageManifestV2` with `contractVersion: 2` for every trusted domain package participating in generated source or packaged composition. A V1 manifest, an in-memory V1-to-V2 upgrader, a V1/V2 union parser, a default-filled compatibility adapter, and a dual installed-set or dependency graph SHALL fail closed. The schema, generator, signed-inventory, and individual manifest migrations are implementation producers assigned and ordered by `tasks.md`; this requirement defines their target contract and SHALL NOT assume that the repository's current manifests already implement it.

Manifest V2 MAY contain package-owned `distribution` metadata. When present, it SHALL be a closed object containing exactly:

```text
channelId
defaultInstalled
defaultEnabled
```

`channelId` SHALL be a non-empty canonical distribution-channel identifier and both default fields SHALL be booleans. Distribution metadata SHALL be legal only for a trusted manifest with `packaging.bundled: true`. `defaultEnabled: true` with `defaultInstalled: false` SHALL fail schema validation; the same `enabled => installed` invariant SHALL hold for every persisted package-state transaction. Omission of `distribution` means the package belongs to no generated release channel and supplies no installation or enablement default.

A release configuration SHALL select exactly a `channelId` and SHALL NOT list, include, exclude, or otherwise name domain packages. The generic distribution generator SHALL select only trusted bundled Manifest V2 definitions whose package-owned `distribution.channelId` exactly matches that selected channel and SHALL project their declared defaults into one signed distribution inventory. Merely existing under `packages/domains`, being one of the current repository packages, or declaring `packaging.bundled: true` SHALL NOT enroll a package without matching distribution metadata. The Host SHALL consume only the verified signed inventory; it SHALL NOT hard-code a package count or identity list, scan all repository domain packages at runtime, or infer channel membership from package location, display name, publisher, contribution kind, or module ID.

`sciforge.official` SHALL denote the complete package cohort carried and initialized by the current official release, not a product-category label. As a restricted Manifest V2 metadata migration, all thirteen packages in the current generated composition—`@sciforge/domain-anchored-comments`, `@sciforge/domain-biology-room`, `@sciforge/domain-browser-preview`, `@sciforge/domain-change-inspector`, `@sciforge/domain-create-loop`, `@sciforge/domain-evidence-dag`, `@sciforge/domain-git-checkpoints`, `@sciforge/domain-life-science-preview`, `@sciforge/domain-paper-radar`, `@sciforge/domain-project-dag`, `@sciforge/domain-remote-ssh`, `@sciforge/domain-terminal`, and `@sciforge/domain-visual-review`—SHALL each declare:

```text
distribution: {
  channelId: "sciforge.official",
  defaultInstalled: true,
  defaultEnabled: true
}
```

The new `@sciforge/domain-workflow-evolution` package SHALL declare the same metadata when its valid package shell is added. Therefore the metadata-derived `sciforge.official` release cohort contains exactly the current thirteen packages before Workflow Evolution and fourteen afterwards. These cardinalities are migration acceptance facts, never Host or release-configuration constants; later membership changes require a reviewed package-owned metadata change, a higher signed inventory sequence, and regenerated evidence.

The six existing product-classified official Workbench packages remain exactly `@sciforge/domain-create-loop`, `@sciforge/domain-visual-review`, `@sciforge/domain-change-inspector`, `@sciforge/domain-terminal`, `@sciforge/domain-anchored-comments`, and `@sciforge/domain-git-checkpoints`. Workflow Evolution becomes the seventh product-classified Workbench package. The other seven current release-cohort packages do not become Workbench packages merely because they share the release channel; their existing product classification and visible contributions remain unchanged. The original six SHALL remain mutually independent with no runtime dependency edge among them. Workflow Evolution's explicit dependency on Create Loop is the sole Stage1 exception and does not relax that rule.

#### Scenario: Current official release inventory is generated

- **WHEN** a release selects channel `sciforge.official`
- **THEN** before Workflow Evolution is added the generator derives thirteen members from the thirteen matching trusted bundled Manifest V2 definitions and their package-owned defaults
- **AND** after Workflow Evolution is added the same generator derives fourteen members
- **AND** neither release configuration nor Host code contains either package list or either count

#### Scenario: Release cohort does not redefine product classification

- **WHEN** the seven current non-Workbench packages enter the same metadata-derived release cohort
- **THEN** their existing capability, panel, toolbar, preview, lifecycle, and product-classification behavior is preserved
- **AND** only the six named existing Workbench packages plus Workflow Evolution are classified as the seven Workbench packages

#### Scenario: Distribution defaults violate installed state

- **WHEN** a manifest or persisted state requests enabled while not installed
- **THEN** strict validation rejects the complete manifest or state transaction
- **AND** no coercion, default repair, or compatibility normalization is applied

#### Scenario: Legacy manifest reaches composition

- **WHEN** source or packaged generation receives Manifest V1 or a legacy compatibility representation
- **THEN** composition fails before inventory or graph generation
- **AND** no union parser, string-dependency adapter, or second graph is selected

### Requirement: Signed inventories are version-monotonic and use one existing trust root

The signed distribution artifact SHALL be one closed `SignedDistributionInventoryEnvelopeV1` containing exactly `kind="SIGNED_DISTRIBUTION_INVENTORY_V1"`, `schemaVersion=1`, `keyId`, `algorithm="Ed25519"`, `body`, and `signature`. Its closed `body` SHALL contain exactly `kind="DISTRIBUTION_INVENTORY_BODY_V1"`, `schemaVersion=1`, `releaseId`, `buildId`, `channelId`, positive safe-integer `inventorySequence`, and canonical sorted `members`. Each member SHALL carry the package, module/version, definition, contract-export descriptor, dependency, outbound-edge, and distribution-default bindings defined by this specification. The signature input SHALL be exactly the ASCII bytes `SciForge.SignedDistributionInventoryV1`, one `0x00` byte, and the RFC 8785 canonical JSON UTF-8 bytes of `body`; no envelope field, package file order, locale, pretty printing, transport encoding, or alternate domain separator may change those signed bytes.

Generation and verification SHALL migrate and reuse the repository's one existing official extension-package keyring and verifier behind one generic purpose-aware interface. Stage1 SHALL NOT add a parallel keyring, trust root, self-signed key, environment-selected verifier, or Workflow-specific signature path. Each public key SHALL be one closed `OfficialVerificationKeyV2` containing exactly:

```text
kind = "OFFICIAL_VERIFICATION_KEY_V2"
schemaVersion = 2
keyId
publisherId
algorithm = "Ed25519"
usage
publicKeyPem
publicKeySpkiSha256
eligibility
```

`keyId` and `publisherId` SHALL use the existing official-key identifier grammar `[a-z0-9][a-z0-9._-]{0,127}`. `publicKeySpkiSha256` SHALL be lowercase SHA-256 of the DER SubjectPublicKeyInfo decoded from the exact PEM. Key IDs and public-key fingerprints SHALL each be unique across the complete keyring; the same private/public material SHALL NOT appear under another ID or usage. `usage` SHALL be exactly one of `official-extension-package | distribution-inventory | agent-provider-trust-bundle`; a key never carries multiple usages and changing an existing key's usage, publisher, or public material is forbidden.

`eligibility` SHALL be exactly the branch corresponding to `usage`:

```text
{
  kind: "OFFICIAL_EXTENSION_PACKAGE_ELIGIBILITY_V1",
  mode: "ACTIVE" | "VERIFY_ONLY"
}

{
  kind: "DISTRIBUTION_INVENTORY_ELIGIBILITY_V1",
  mode: "ACTIVE" | "VERIFY_ONLY",
  channelId,
  minimumInventorySequence,
  maximumInventorySequenceInclusive
}

{
  kind: "AGENT_PROVIDER_TRUST_BUNDLE_ELIGIBILITY_V1",
  mode: "ACTIVE" | "VERIFY_ONLY",
  minimumBundleSequence,
  maximumBundleSequenceInclusive
}
```

Every minimum is a positive safe integer. An `ACTIVE` sequence-bearing branch SHALL have `maximum...Inclusive=null`; a `VERIFY_ONLY` branch SHALL have a positive safe-integer maximum greater than or equal to its minimum. A key in `ACTIVE` mode may verify a newly presented artifact only for its exact usage and, for an inventory, exact channel. A `VERIFY_ONLY` key SHALL verify only the exact envelope/body bytes already referenced by an accepted immutable Host record from before retirement and whose sequence lies inside its closed interval; it SHALL NOT admit a newly presented artifact even when its signature and sequence are otherwise valid. Extension-package `VERIFY_ONLY` likewise permits revalidation only of exact already-installed accepted artifact bytes, never a new installation.

The one controlled keyring migration SHALL map every pre-Stage1 existing `{keyId, publisherId, algorithm, publicKeyPem}` entry byte-for-byte to `usage="official-extension-package"` with the extension eligibility branch; it SHALL preserve its key ID, publisher, Ed25519 material, fingerprint, and existing accepted-extension behavior. Distribution and Agent bundle signing SHALL use distinct newly provisioned key IDs and distinct public-key fingerprints under their respective single usages. Migration is transactional and one-way: after it commits, the runtime accepts only the strict V2 keyring. A missing legacy key, changed publisher/material/fingerprint, duplicate fingerprint, invented distribution/Agent usage for legacy material, or V1/V2 fallback fails before extension installation, inventory verification, or provider lookup.

For each sequence-bearing usage, one keyring revision SHALL have exactly one `ACTIVE` key for the applicable channel/bundle lane. Rotation or revocation SHALL atomically change the former key to `VERIFY_ONLY`, freeze its maximum at the highest exact sequence accepted under that key, and introduce the next distinct `ACTIVE` key whose minimum is that maximum plus one. Public material, usage, and the frozen interval remain immutable. Reverification of exact historically accepted bytes uses the retained accepted record and the key's frozen sequence eligibility, so retiring the current key does not brick already accepted release evidence. Conversely, a former key cannot sign or admit any future sequence, and a newly active key cannot retroactively legitimize bytes outside its allocated interval. A gap, overlap, decreasing cutoff, future signature by a `VERIFY_ONLY` key, candidate artifact presented as “historical,” or keyring revision that cannot cover every retained accepted record fails closed.

The verifier SHALL resolve `keyId` only from that installation/release-owned V2 keyring, require exact usage `distribution-inventory`, require active candidate eligibility for the expected channel and sequence, verify the exact domain-separated signature input above, and bind Host-authoritative expected release, build, and channel before any package-state or lifecycle read. Exact retained historical evidence is reverified through the same cryptographic path but the distinct `VERIFY_ONLY` rule above; it never re-enters candidate acceptance.

The Host SHALL derive expected release metadata only from one immutable closed `HostReleaseProvenanceV1` containing exactly:

```text
kind = "HOST_RELEASE_PROVENANCE_V1"
schemaVersion = 1
releaseId
buildId
channelId
applicationVersion
semanticTrainTreeDigest
provenanceDigest
```

`releaseId`, `buildId`, and `channelId` SHALL use `[a-z0-9][a-z0-9._-]{0,127}`; `applicationVersion` SHALL be canonical release SemVer; both digests SHALL be lowercase SHA-256, and `provenanceDigest` SHALL hash RFC 8785 canonical bytes after removing only itself. The protected release controller SHALL allocate `buildId` once and maintain an immutable one-to-one binding from it to the other provenance fields. In source CI, the provenance is a generated read-only module pinned to the exact immutable semantic-parent tree and reviewed release allocation. In a packaged application it is an immutable packaged resource covered by the application's authenticated packaging/code-signing boundary and independently matched to the installed application version; settings, environment, command-line flags, the inventory, a domain package, or an adjacent mutable file SHALL NOT supply or override it.

The release input and signed body SHALL match the Host provenance's `releaseId`, `buildId`, and `channelId` exactly. The verifier SHALL authenticate and digest-check that provenance first, then pass those three expected values rather than inventory-derived values into signature verification. Because all three occur inside the domain-separated signed body, transplanting a complete otherwise valid envelope from another release, build, or channel fails before member parsing. Reusing one `buildId` for another train digest, application version, release, or channel is `NO_GO`.

Every inventory generation SHALL consume one checked, versioned, closed `DistributionInventoryReleaseInputV1` containing exactly `schemaVersion: 1`, `releaseId`, `buildId`, `channelId`, positive safe-integer `inventorySequence`, and `keyId`. It SHALL contain no package list, count, include/exclude rule, member binding, signature, or private-key material. The three release fields SHALL equal the immutable Host release provenance, and `keyId` SHALL name the exact active distribution key whose channel and sequence interval admit the allocated sequence. A protected release controller SHALL explicitly allocate and record the next sequence for that channel. A generator SHALL NOT auto-increment, infer from a checkout, derive from time or package contents, silently reuse, or mutate the release input.

Given one immutable unsigned semantic-parent tree and one exact release input, ordinary PR CI SHALL deterministically derive the complete RFC 8785 body and body digest from trusted package-owned metadata, independently verify all member bindings and any supplied envelope through the existing public keyring, and produce zero diff on a second generation. Neither a repository checkout nor an ordinary PR job SHALL have the production private key or emit a production signature. The unsigned body SHALL bind the input's release/build/channel/sequence exactly; changing the semantic-parent tree or any release-input field SHALL change or reject the body before signing.

Only a non-exportable key held by a KMS, HSM, or equivalently isolated signing service MAY issue the production Ed25519 signature. The protected release controller/build principal that checks out and tests the train, allocates the sequence, verifies provenance, and produces the canonical body SHALL be distinct from the signer principal and service. The signing service SHALL never check out, execute, build, test, train on, or inspect repository/package code; accept a repository URL, commit to fetch, archive, file path, command, member list, or mutable release configuration; or return/export private-key material. Its request surface SHALL accept only exact `usage="distribution-inventory"`, `keyId`, the canonical signature-input bytes, their SHA-256 digest, the canonical body digest, and an immutable protected approval/evidence reference whose recorded digests already bind the release input, provenance, semantic-parent tree, and allocated sequence. It SHALL independently require the key's active usage/sequence eligibility, recompute both digests, sign only those exact bytes, and return only signature plus immutable signer receipt.

Before requesting that signature, the protected build job SHALL verify the reviewed release input, explicit monotonic sequence allocation, authenticated Host provenance, exact immutable semantic-parent train identity, canonical body bytes/digest, and prior accepted channel/member security state. The signature and generated envelope SHALL land only in one mechanical child commit whose parent is that recorded unsigned semantic train; that child SHALL contain no package, manifest, definition, export, dependency, outbound-edge, release-input, provenance, or other semantic change. Final CI SHALL recompute the exact body and domain-separated signature input from the recorded parent tree, provenance, and release input, verify the child envelope and signer receipt, and reject any semantic change in the signing child or after it. The child commit identity is evidence and SHALL NOT be included in the body it signs, avoiding a commit-SHA/signature cycle. An exportable key file, signer colocated with a checkout/build/test job, signer that accepts a digest without the exact bytes, or one principal able to alter both reviewed body and signer authorization is `NO_GO`.

Every train that changes membership, package/module version, definition, contract-export binding, distribution metadata, dependency, outbound edge, release/build identity, or another signed member field SHALL use an explicitly reviewed next release input and new protected signing evidence. Missing signer evidence, unavailable protected signer, stale/reused/non-monotonic sequence, body drift, parent mismatch, key mismatch, semantic signing-child edit, or private key exposure outside the protected job SHALL be `NO_GO`; no unsigned, locally signed, fixture-signed, or oral-exception inventory may activate.

For each channel, the Host SHALL transactionally persist one `AcceptedDistributionSecurityStateV1` before activating any member. That state SHALL contain the highest accepted `inventorySequence`, its `bodyDigest`, the exact verified signed-envelope bytes and exact canonical body bytes, the authenticated `HostReleaseProvenanceV1` digest and expected release/build/channel tuple used at acceptance, the accepting key ID/usage/keyring revision/sequence-eligibility interval, and a retained per-package monotonic binding for every package ever accepted on that channel. Each retained binding SHALL contain the package name, stable module ID, highest accepted module/package release SemVer, definition digest, complete sorted contract-export descriptor digest bindings, and the source inventory sequence/body digest. It SHALL also retain a permanent bidirectional package-name-to-module-ID tombstone index reproducible from the same signed evidence. Removing a package from a later inventory SHALL NOT delete its retained binding or either direction of that identity mapping. The Host SHALL retain the exact verified signed-envelope/body/provenance evidence and key-eligibility acceptance record referenced by every current or tombstoned per-package binding, or an equivalent append-only verified record from which all such bindings and identity mappings can be reproduced without trusting a digest alone.

On startup, and before accepting a candidate higher sequence, the Host SHALL re-parse and reverify the retained signed evidence through the same purpose-aware official keyring, recompute every canonical signature input, body, provenance, and member binding, and reject any missing, non-canonical, unverifiable, or inconsistent persisted security state. An exact retained record signed by a now-`VERIFY_ONLY` distribution key remains valid only when its immutable accepted bytes, usage, channel, keyring revision, provenance tuple, and sequence match the frozen historical eligibility record; key retirement alone SHALL NOT invalidate it. Acceptance of a higher sequence, by contrast, requires the currently active key and SHALL compare every candidate member against its retained per-package binding: a lower version fails; the same version requires exact definition and complete export-descriptor digest equality; and any definition or export-descriptor change requires a strictly greater package/module version. It SHALL additionally require every previously seen package name to retain its one historical stable module ID and every previously seen stable module ID to retain its one historical package name. Neither a greater version nor absence from intermediate inventories permits reassignment in either direction. A package reintroduced after one or more absent inventories remains subject to its complete tombstoned binding. One transaction SHALL append the newly verified evidence, update the latest sequence/body, and advance only the affected per-package bindings. It SHALL NOT persist a new high-water digest without the corresponding canonical signed body and complete member evidence.

An exact same-sequence/same-digest/same-canonical-body reopen is idempotent only through its retained accepted record. A lower sequence, a same sequence with another digest or bytes, another release/build/channel/provenance binding, an unknown or wrong-usage key, a `VERIFY_ONLY` key presented for candidate acceptance, a sequence outside active eligibility, an invalid signature, or inconsistent retained evidence SHALL fail closed before package-state reconciliation, contribution construction, or lifecycle transition. A correctly signed older artifact is still a rollback and SHALL be rejected. A higher sequence does not bypass package/module version monotonicity or any member validation.

#### Scenario: A previously signed inventory is replayed

- **WHEN** the Host has accepted sequence `N` for a channel and receives a validly signed sequence lower than `N`, or sequence `N` with another body digest
- **THEN** verification fails as rollback before package or contribution lookup
- **AND** no persisted package choice, effective state, or lifecycle state changes

#### Scenario: One release input is generated twice

- **WHEN** ordinary PR CI regenerates an unsigned inventory body twice from the same immutable semantic-parent tree and exact `DistributionInventoryReleaseInputV1`
- **THEN** both canonical body byte sequences and digests are identical with zero generated diff
- **AND** neither run can access a production private key or emit a production signature

#### Scenario: A signing child changes semantics

- **WHEN** a protected signing child contains or is followed by a package, manifest, definition, export, dependency, outbound-edge, release-input, or other signed semantic change not present in its recorded unsigned parent
- **THEN** final CI recomputation rejects the envelope/train evidence before activation
- **AND** the signer cannot repair the mismatch by signing a child commit identity into its own body

#### Scenario: A removed package is reintroduced with stale bindings

- **WHEN** a package accepted at sequence `N` is absent from a later inventory and a still later signed inventory reintroduces its old or same-version-different-digest binding
- **THEN** the retained per-package binding rejects the rollback or digest drift before composition
- **AND** absence from an intermediate release does not erase version, definition, or export-descriptor history

#### Scenario: A tombstoned module identity is reassigned

- **WHEN** a higher signed sequence changes a known package's stable module ID or gives a removed package's historical module ID to another package name
- **THEN** the bidirectional identity tombstones reject the complete inventory before composition
- **AND** a greater SemVer, a valid signature, or an intermediate absence cannot reassign durable owner identity

#### Scenario: Persisted anti-rollback evidence is incomplete

- **WHEN** restart finds only a sequence/body digest, missing canonical signed body/member evidence, or a retained per-package binding inconsistent with its verified source inventory
- **THEN** the channel fails closed before package-state or lifecycle reconciliation
- **AND** the Host does not reconstruct trusted bindings from installed files, package locations, or unsigned generated output

#### Scenario: A parallel Stage1 signing key is supplied

- **WHEN** a fixture, environment value, package, or Workflow-specific verifier supplies an Ed25519 key outside the existing official keyring
- **THEN** the envelope is rejected before inventory consumption
- **AND** no second trust chain is installed

#### Scenario: Existing extension keys are migrated without privilege expansion

- **WHEN** the pre-Stage1 official extension keyring is migrated to the purpose-aware V2 keyring
- **THEN** every existing key keeps the exact key ID, publisher, Ed25519 material, fingerprint, and `official-extension-package` behavior
- **AND** none becomes eligible for `distribution-inventory` or `agent-provider-trust-bundle`
- **AND** any missing/changed legacy entry, duplicate material, or V1 compatibility fallback fails closed

#### Scenario: A key is used for the wrong purpose

- **WHEN** an extension-package key or Agent-bundle key signs distribution inventory bytes, or one public-key fingerprint is duplicated under another usage
- **THEN** purpose-aware verification rejects the artifact before release/build/member lookup
- **AND** a cryptographically valid Ed25519 signature cannot widen key authority

#### Scenario: A distribution key rotates

- **WHEN** sequence `N` was accepted under key `K1`, the next keyring revision freezes `K1` as `VERIFY_ONLY` through `N`, and distinct active key `K2` begins at `N+1`
- **THEN** restart can reverify only the exact retained `K1` envelope/body/provenance record at its historical sequence
- **AND** a new candidate signed by `K1`, including a changed body at an old sequence or any future sequence, is rejected
- **AND** sequence `N+1` can be admitted only under active `K2`

#### Scenario: An inventory is transplanted between builds

- **WHEN** a valid signed envelope from another release, build, or channel is copied beside the current application
- **THEN** its signed tuple differs from the authenticated Host `HostReleaseProvenanceV1` and verification fails before member parsing
- **AND** copying mutable metadata or setting an environment value cannot change the Host's expected tuple

#### Scenario: The signer can inspect or execute the train

- **WHEN** a proposed signing path exposes an exportable private key, colocates the signer with repository checkout/build/test execution, accepts a path or command, or accepts only a digest without the exact signature-input bytes
- **THEN** protected release signing is `NO_GO`
- **AND** no locally generated or manually supplied signature may replace the isolated signer receipt

### Requirement: Manifest V2 runtime dependencies bind one package compatibility version and exact exports

Manifest V2 `packaging.runtime.dependencies` SHALL be an array of closed objects. Every object SHALL contain exactly:

```text
packageName
minimumModuleVersion
maximumModuleVersionExclusive
requiredContractExports
```

`packageName` SHALL be a standard package name. Both version bounds SHALL be canonical release SemVer containing exactly three non-negative decimal numeric components `MAJOR.MINOR.PATCH`, with no leading zero in a multi-digit component and no prerelease, build metadata, wildcard, caret, tilde, comparator, tag, or omitted component. The minimum SHALL be numerically less than the exclusive maximum. `requiredContractExports` SHALL always be present as a duplicate-free array of canonical `./...` package export paths sorted in ascending UTF-8 byte lexical order; an empty array is valid only when the dependent consumes no public contract export. Unknown fields, duplicate dependency package names, unsorted/duplicate exports, and a string dependency entry SHALL fail Manifest V2 validation.

`module.version` SHALL be the one compatibility and release version for the complete domain package: backend, renderer UI, lifecycle, capability definitions, and every public export. It SHALL exactly equal the ordinary `package.json` version. A package SHALL NOT publish a separate backend, renderer, lifecycle, or export compatibility version. Reusing one `module.version` with another manifest definition digest or another public-contract export digest set SHALL be a signed-inventory conflict rather than an in-place compatible replacement.

The Manifest V2 cutover SHALL preserve the current visible `1.0.0` module compatibility version of every existing package. For each of the nine current packages whose ordinary `package.json` is still `0.1.0` while its manifest is `1.0.0`, the migration SHALL raise `package.json.version` to `1.0.0`; it SHALL NOT lower the manifest to `0.1.0`. Relative to the highest previously accepted signed inventory for the same package, any change to `definitionDigest` or any bound contract-export descriptor digest SHALL require a numerically greater canonical release SemVer in both `package.json.version` and `module.version`. A lower version, or the same version with either digest changed, SHALL fail signed-inventory generation and verification. Unchanged semantic bindings MAY retain the same version on an idempotent rebuild.

Version satisfaction SHALL use only numeric release-SemVer tuple comparison:

```text
minimumModuleVersion <= provider.module.version < maximumModuleVersionExclusive
```

No npm range interpretation, lexical comparison, prerelease precedence, compatibility heuristic, current-major default, or provider-selected override is permitted.

For every declared public contract export, the generator SHALL emit one target-neutral `CanonicalContractExportDescriptorV1` and carry its exact bytes unchanged in source and packaged artifacts. Its closed body SHALL contain exactly:

```text
kind = "CANONICAL_CONTRACT_EXPORT_DESCRIPTOR_V1"
schemaVersion = 1
packageName
moduleId
moduleVersion
exportPath
contractExports
implementationSurfaceDigest
typeSurfaceDigest
```

`contractExports` SHALL be a duplicate-free array sorted by UTF-8 byte lexical `exportName`; every closed entry SHALL contain exactly `exportName`, `exportKind`, `contractVersion`, and lowercase SHA-256 `contractDigest`. `implementationSurfaceDigest` SHALL cover the generator's canonical target-neutral runtime export/implementation surface model, and `typeSurfaceDigest` SHALL cover its canonical public declaration/type surface model. Both surface models and the descriptor body SHALL use closed versioned schemas, RFC 8785 canonical JSON UTF-8 bytes, and lowercase SHA-256. `contractExportDigest` SHALL be SHA-256 over the exact canonical descriptor bytes. It SHALL NOT be a direct byte comparison between TypeScript source and transformed/bundled JavaScript.

The source and packaged pipelines SHALL independently resolve the ordinary package export and regenerate the same canonical contract, implementation, and type surface models. The descriptor bytes SHALL be copied without transformation. Tree shaking, conditional-export selection, bundling, declaration emission, source-map-based resolution, source maps, or other transforms SHALL NOT add, remove, rename, redirect, or change a public contract export or either surface digest; descriptor-byte drift, surface drift, missing descriptor, or artifact tampering SHALL fail before dependent construction. Build-only bytes outside these canonical models are not substituted for the descriptor and cannot make a mismatched surface pass.

For every package in a signed distribution inventory, the generator SHALL bind its standard package name to the provider's stable `moduleId`, `module.version`, manifest `definitionDigest`, and the canonical descriptor digest for every declared public contract export. Each `requiredContractExports` path SHALL exist in the provider's ordinary package exports and in that signed inventory binding, and the source or packaged artifact loaded for it SHALL reproduce the bound descriptor and surface digests. Dependency validation SHALL fail for a missing, unsigned, non-bundled, duplicate, version-out-of-range, definition-digest-mismatched, export-missing, descriptor-byte-mismatched, implementation-surface-mismatched, or type-surface-mismatched provider. Source and packaged composition SHALL consume the same Manifest V2 schema, one validator implementation, and one signed-inventory binding; they SHALL NOT build alternate graphs or silently substitute another installed version/export.

The existing Project DAG dependency SHALL migrate to this exact object:

```text
{
  packageName: "@sciforge/domain-evidence-dag",
  minimumModuleVersion: "1.0.0",
  maximumModuleVersionExclusive: "2.0.0",
  requiredContractExports: ["./contract"]
}
```

Workflow Evolution SHALL declare this exact dependency object:

```text
{
  packageName: "@sciforge/domain-create-loop",
  minimumModuleVersion: "1.0.0",
  maximumModuleVersionExclusive: "2.0.0",
  requiredContractExports: ["./catalog-contract"]
}
```

Each dependent SHALL also retain the provider as an ordinary production `package.json` dependency. Create Loop SHALL publicly export `./catalog-contract`. These two migrated edges and every other Manifest V2 dependency SHALL use the same generic schema and validator; no edge-specific Host rule is allowed.

#### Scenario: Workflow Evolution dependency is compatible

- **WHEN** the signed inventory binds Create Loop module version `1.1.0`, its matching definition/export digests, and public `./catalog-contract`
- **THEN** the numeric tuple satisfies `[1.0.0, 2.0.0)` and the generated graph admits the Workflow Evolution edge
- **AND** source and packaged composition bind the same provider module, definition, and export digest

#### Scenario: Provider is outside the release interval

- **WHEN** the selected provider's `module.version` is `2.0.0`, malformed, or otherwise outside the declared numeric interval
- **THEN** dependency validation fails before dependent activation
- **AND** no npm-range coercion, lexical comparison, or compatibility fallback admits it

#### Scenario: Required export drifts

- **WHEN** a required export is absent, its canonical descriptor bytes differ, or its resolved contract, implementation, or type surface differs from the signed inventory binding
- **THEN** source and packaged composition reject the dependent before registration
- **AND** matching package name and module version alone are insufficient

#### Scenario: A semantic package changes without a version increase

- **WHEN** a manifest definition or bound contract-export descriptor changes while package and module versions remain the same as the highest accepted inventory, or the version moves backwards
- **THEN** generation and verification fail before package-state reconciliation
- **AND** no same-version digest drift or downgrade is accepted

#### Scenario: Legacy string dependency is supplied

- **WHEN** Manifest V2 contains `"@sciforge/domain-create-loop"` or another string in `packaging.runtime.dependencies`
- **THEN** strict schema validation fails
- **AND** no legacy union branch, inferred version range, inferred export list, or dual graph is created

### Requirement: Manifest V2 declares every outbound system capability edge

Every Manifest V2 SHALL contain package-owned `outboundSystemCapabilities`, including an explicit empty array when the package makes no system capability call. It SHALL be an array of closed edge objects containing exactly:

```text
actionId
targetProviderModuleId
authorizationPurposeMode
authorizationPurpose
```

`actionId` and `targetProviderModuleId` SHALL be exact non-empty canonical identifiers. `authorizationPurposeMode` SHALL be exactly `none | inherit-current-action`. Mode `none` SHALL require `authorizationPurpose: null`; mode `inherit-current-action` SHALL require one exact non-empty namespaced authorization-purpose value. Omission, an empty value, a non-null value in `none` mode, `null` in inherited mode, a wildcard, pattern, prefix, alias, default, or unknown field SHALL fail Manifest V2 validation.

Edges SHALL be duplicate-free and sorted by the ascending UTF-8 byte lexical tuple `(actionId, targetProviderModuleId, authorizationPurposeMode, authorizationPurpose-with-null-before-string)`. The manifest generator SHALL retain the exact declared edges in the signed distribution inventory and bind them to the caller package's module ID, module version, and definition digest. A factory, handler, payload, invoke option, action prefix, target descriptor, or Host default SHALL NOT add, widen, or infer an outbound edge.

Generation SHALL mechanically cross-validate every edge against the exact target provider definition and descriptor in the same signed capability/provider inventory, including immutable `HOST_CORE` definitions. The target provider module ID and action ID SHALL match; the target descriptor SHALL include `system` audience; its exact non-empty `allowedSystemOwnerScopes` SHALL contain the caller manifest's stable module ID; and its required-purpose metadata SHALL match the edge pair exactly. Mode `none` is valid only when the target has no `requiredAuthorizationPurpose`. Mode `inherit-current-action` is valid only when the target's singular `requiredAuthorizationPurpose` exactly equals the edge's `authorizationPurpose`. A missing target, ambiguous provider, caller-owner mismatch, audience mismatch, ACL mismatch, purpose mismatch, or duplicate edge SHALL fail signed-inventory generation.

The owner-bound Host system invoker SHALL admit only an exact edge already present in the verified signed inventory for its activated caller manifest. Runtime invocation SHALL match action, target provider module ID, authorization mode, and purpose value before target handler or operation lookup. The target descriptor's ordinary ACL/purpose checks SHALL still run; an outbound declaration is necessary but never sufficient to bypass them. Source and packaged applications SHALL consume the same generated edge inventory and validator. There SHALL be no permissive default, runtime repository scan, inferred caller inventory, compatibility allowlist, or second system-call graph.

The task-assigned Manifest V2 migration SHALL enumerate and review every existing system caller edge before V2 activation. This requirement deliberately defines no package- or action-specific exception: existing and future callers use the same declaration, signed-inventory cross-check, and runtime enforcement.

#### Scenario: A declared system edge is valid

- **WHEN** a caller manifest declares one exact sorted edge whose target provider, system audience, caller ACL, and purpose metadata all match
- **THEN** generation signs that edge into the caller's inventory binding
- **AND** the owner-bound system invoker may attempt only that exact call subject to all ordinary target authorization checks

#### Scenario: A caller omits its outbound edge

- **WHEN** package code or factory output attempts a system capability call absent from its signed `outboundSystemCapabilities`
- **THEN** the Host rejects it before target descriptor, handler, resource, or operation lookup
- **AND** a matching target-side ACL alone does not create caller authority

#### Scenario: Purpose metadata differs

- **WHEN** an outbound edge uses `none` for a purpose-requiring target or supplies an inherited value different from the target's exact required purpose
- **THEN** signed-inventory generation fails
- **AND** no wildcard, default, payload override, or runtime downgrade is accepted

#### Scenario: Outbound inventory is unsorted or inferred

- **WHEN** edges are duplicated, out of canonical tuple order, omitted in favor of runtime scanning, or inferred from action prefixes or target ACLs
- **THEN** Manifest V2 generation fails closed
- **AND** source and packaged composition do not produce an alternate caller graph

### Requirement: One signed-inventory graph governs lifecycle and effective package state

The Host SHALL persist user choices `installed` and `enabled` separately from Host-derived effective availability, keyed by standard package name and reconciled only against the verified signed distribution inventory. The Host SHALL never rewrite a persisted `enabled: true` choice merely because a dependency is unavailable. A package with `installed: true` and `enabled: true` whose complete dependency/version/export closure is invalid SHALL have effective reason `DEPENDENCY_UNAVAILABLE`, admit no contribution, and preserve both durable choices for later reconciliation. Explicit uninstall SHALL atomically make `enabled: false` to preserve `enabled => installed`.

Fresh state for channel `sciforge.official` SHALL initialize every member of the verified signed inventory from its package-owned defaults, not from a Host list: thirteen members before Workflow Evolution is present and fourteen afterwards. Upgrade from the pre-Stage1 generated composition SHALL preserve every existing package's explicit installed/enabled choice and all thirteen packages' effective visible capability, panel, toolbar, preview, and lifecycle behavior; it SHALL initialize only a never-seen package from its signed defaults. Introducing Workflow Evolution SHALL add only that never-seen fourteenth choice and SHALL NOT re-enable a previously disabled Create Loop. If Create Loop is disabled, missing, failed, removed, version-incompatible, or export-incompatible while Workflow Evolution's durable choices remain `installed: true, enabled: true`, Workflow Evolution SHALL be effectively `DEPENDENCY_UNAVAILABLE` with zero live contribution; revalidation MAY activate it after the exact dependency becomes available without changing that preserved enabled choice. Explicitly disabling or uninstalling Workflow Evolution SHALL NOT disable or uninstall Create Loop or any other release-cohort package.

The Host SHALL create a separate system invoker from each effectively activated manifest lifecycle owner. Authorization and operation owner scope SHALL use the manifest's unique stable `moduleId`; `module.version` remains audit/compatibility metadata and SHALL NOT change same-owner durable operation identity. Duplicate stable module IDs, duplicate packages, or a package-to-module mapping that is not one-to-one SHALL fail composition.

The generic installed-set/runtime composition path SHALL derive one graph from the signed inventory and the closed Manifest V2 dependency objects. For `main.runtime-lifecycle`, it SHALL activate dependencies before dependents and dispose in exact reverse topological order. Among simultaneously ready nodes, the deterministic tie-break SHALL be ascending UTF-8 byte lexical order of unique stable `moduleId`; numeric contribution priority SHALL NOT override or tie-break lifecycle order. Renderer and every other contribution kind retain their independent ordering contracts but SHALL use the same effective package set.

Each effective package SHALL use the one durable `PackageLifecycleStateV1` FSM:

```text
INACTIVE -> ACTIVATING
ACTIVATING -> ACTIVE | QUIESCING
ACTIVE -> QUIESCING
QUIESCING -> DISPOSING | TEARDOWN_FAILED
DISPOSING -> INACTIVE | TEARDOWN_FAILED
TEARDOWN_FAILED -> QUIESCING
```

Starting a package from `INACTIVE` SHALL first atomically create one durable `PackageLifecycleAttemptV1` and enter `ACTIVATING`. The Host SHALL generate its non-reusable `lifecycleAttemptId`, bind the exact signed package/module/version/definition/export set, current Host-generated `processEpoch`, and a monotonically increasing attempt revision, and reject package, payload, factory, or environment attempts to supply any of those values. Every later lifecycle transition SHALL use expected-attempt-revision compare-and-swap under the one generic lifecycle controller; each transition that acquires execution or recovery ownership SHALL durably replace the attempt's owning process epoch with the current Host epoch in the same transaction. A retry of teardown keeps the same lifecycle attempt ID; a later reactivation creates a new attempt ID.

`ACTIVATING` SHALL permit only package construction and registration into a Host-private attempt-scoped staging container. Staged capability, main, renderer, readiness, event, subscription, worker, timer, child, and other contribution/resource registrations SHALL be tagged with that lifecycle attempt, inert or paused, undiscoverable, uninvokable, unrendered, and unable to accept external or background work. Construction SHALL NOT directly start unregistered I/O, a child, timer, worker, listener, subscription, renderer, event source, or other autonomous effect. Any resource acquisition that may survive or affect state outside the process SHALL first commit its attempt-scoped durable claim, use only the Host-mediated staged registration, and remain non-admitting until package publication. After construction and registration complete, the Host SHALL freeze the staged set but SHALL NOT publish from an unlocked dependency observation. A construction, registration, validation, or publish failure SHALL leave the staged set invisible, enter the same `QUIESCING` cleanup path, and prevent dependents from starting; it SHALL NOT use a rollback-only second lifecycle.

The lifecycle controller SHALL own one durable, revisioned, immutable Host projection per published package, not merely an in-memory pointer. `PublishedPackageSnapshotV1` SHALL be a closed object containing exactly:

```text
kind = "PUBLISHED_PACKAGE_SNAPSHOT_V1"
schemaVersion = 1
snapshotRevision
packageName
moduleId
moduleVersion
lifecycleAttemptId
lifecycleAttemptRevision
processEpoch
definitionDigest
contractExportDescriptorDigests
providerSnapshotBindings
lifecycleResourceDeclarations
contributions
snapshotDigest
```

`snapshotRevision` SHALL be a Host-allocated, package-monotonic positive safe integer that is never reused. Export digests and provider bindings SHALL be complete, duplicate-free, and sorted by UTF-8 byte order. Each provider binding SHALL contain exactly package name, module ID, module version, provider snapshot revision/digest, definition digest, and the required export descriptor digests. Each contribution projection SHALL contain exactly `contributionId`, `contributionKind`, `target="MAIN"|"RENDERER"`, `entrypointExport`, and `descriptorDigest`, and SHALL be sorted by `(target, contributionKind, contributionId)`. `snapshotDigest` SHALL be lowercase SHA-256 over RFC 8785 canonical bytes after removing only itself. The Host SHALL derive this projection only from the verified signed inventory, generated composition, frozen attempt-scoped staging set, and Host-owned resource claims; a package, renderer, payload, or mutable registry cannot supply or amend it.

The durable lifecycle transaction that commits `ACTIVATING -> ACTIVE` SHALL also insert the complete immutable snapshot revision and set it as that package's sole current authoritative projection. Main and renderer registries are revision-checked materialized caches of that projection, never separate sources of package membership or lifecycle truth. They SHALL NOT infer visibility from a manifest scan, database state without the snapshot, cached package list, contribution-by-contribution flag, or eager import/registration.

Before final publication, the Host SHALL send the complete candidate projection to the Main registry adapter and every currently connected renderer instance that targets one of its contributions. Each adapter SHALL resolve and verify its generated entrypoints into a private revision-scoped staging registry with zero public registration and return one closed `PackageSnapshotAckV1` containing exactly `kind="PACKAGE_SNAPSHOT_ACK_V1"`, `schemaVersion=1`, `consumerKind="MAIN"|"RENDERER"`, Host-minted `consumerInstanceId`, current `processEpoch`, current Host-minted `connectionEpoch`, `snapshotRevision`, `snapshotDigest`, and `phase="STAGED"|"APPLIED"|"WITHDRAWN"`. A stale epoch, wrong digest/revision/target set, partial staging, eager public registration, or missing required `STAGED` acknowledgement fails activation and enters cleanup with no authoritative snapshot.

One generic graph lifecycle commit lock SHALL serialize only final package publication and dependency-driven unpublication across the complete verified graph. Under that lock, dependent activation SHALL re-read every exact provider's authoritative published snapshot and require its expected package, module, attempt ID, attempt revision, version, definition, export, and snapshot bindings to remain `ACTIVE`; it SHALL revalidate the dependent's signed binding, frozen staged set, resource declarations/claims, and required current-epoch `STAGED` acknowledgements in the same critical section. It SHALL then transactionally commit expected-revision `ACTIVATING -> ACTIVE` plus the complete snapshot revision as the sole authoritative package-publication linearization. A failed validation or durable CAS publishes nothing.

After that one commit, the Host SHALL issue only a revision-bound publish token for the exact snapshot to each already staged adapter. Each adapter SHALL replace its entire package projection atomically—never contribution by contribution—then return `APPLIED`; its local admission requires both the Host's still-current authoritative revision and its matching applied revision. Main application of the revision is required before Main reports the package ready. A renderer that is absent, disconnected, or has not applied the current revision exposes no renderer contribution but does not invent a different package state; reconnect recovery below may materialize the same authoritative revision. A same-process failure before a required Main `APPLIED` acknowledgement closes the snapshot gate and traverses `ACTIVE -> QUIESCING`; a process crash exposes no surviving Main cache and startup applies the prior-epoch normalization below. Partial snapshots, a second renderer-specific publish FSM, an unlocked check-then-publish sequence, and a package-specific dependency lock are forbidden.

Only the current authoritative `ACTIVE` snapshot plus a matching locally applied revision admits discovery, invocation, rendering, events, background work, external child/resource admission, or any contribution from the package. No state other than `ACTIVATING` may construct or register the private staged set, and no local registry may expose a revision before the Host publish token. Quiescence SHALL acquire the same graph lifecycle commit lock, which prevents an `ACTIVATING` dependent from passing its final provider check or publishing. While holding it, the controller SHALL recompute the provider's complete transitive set of currently published dependents, close each authoritative snapshot admission gate and atomically clear its current-projection reference in exact reverse topological order, commit each expected-revision `ACTIVE -> QUIESCING` transition, and only then close/unpublish the provider and commit its transition. Closing that Host gate and clearing the one revisioned projection is the sole unpublication linearization; adapters then atomically remove the whole matching local revision and return `WITHDRAWN`. A failed durable transition remains unpublished and retries fail closed; a crash between unpublication and local removal leaves the Host gate closed, so stale UI or Main cache cannot admit work.

Stale references SHALL atomically acquire-check the current authoritative snapshot's attempt ID, attempt revision, snapshot revision, snapshot digest, and local applied revision and fail rather than invoke an unpublished contribution. Admissions that won before closure are in-flight resources drained by the existing quiescence barrier. Disposal SHALL wait for `WITHDRAWN` from every still-live Main/renderer consumer that acknowledged `APPLIED`; an authoritatively terminated/disconnected renderer instance has no surviving registry, while an unacknowledged still-live consumer is nonzero resource evidence and causes `TEARDOWN_FAILED`. A dependent whose frozen staging completed before provider closure but which did not publish before the graph lock was acquired SHALL fail its final provider check and enter its own cleanup path with zero public contribution.

On renderer connection or reconnect, the Host SHALL mint a new `connectionEpoch`; the renderer SHALL discard every prior staged/applied package revision before requesting a full projection. If the package still has a current authoritative `ACTIVE` snapshot, the Host sends that complete revision, the renderer privately stages it, rechecks currentness, receives one revision-bound publish token, atomically applies the whole package projection, and returns `STAGED` then `APPLIED`. If no current revision exists it applies an empty projection and returns `WITHDRAWN`. A renderer SHALL NOT eagerly import or register packages from generated composition, its prior cache, durable choices, or a manifest before this handshake. On Main-process restart, all prior Main/renderer acknowledgements and publish tokens are invalid; no prior-epoch snapshot is replayed, and the startup normalization matrix governs whether a new activation may later allocate a new revision.

Disabling, removing, failing, or changing the active version/definition/export binding of a dependency SHALL use that graph-locked reverse-topological unpublication before any drain or disposal. After releasing the graph lock, the controller SHALL wait through the canonical authorization/child barriers until every in-flight child is contained, every package-owned subscription/listener/timer/worker/renderer/main resource is zero, and no new work can enter. Only then may it enter `DISPOSING` and invoke the provider disposer. A successful bounded disposer reaches `INACTIVE`; only after every dependent is `INACTIVE` may the dependency be disposed, replaced, or reactivated.

Manifest V2 SHALL describe lifecycle cleanup through signed package-owned generic resource declarations, not package-specific recovery programs. Every lifecycle contribution SHALL carry a canonical sorted `lifecycleResources` array of closed `PackageLifecycleResourceDeclarationV1` objects containing exactly:

```text
kind = "PACKAGE_LIFECYCLE_RESOURCE_DECLARATION_V1"
schemaVersion = 1
resourceKey
resourceType
maximumConcurrent
```

`resourceKey` SHALL be a package-unique stable identifier using `[a-z0-9][a-z0-9._-]{0,127}`, declarations SHALL be duplicate-free and sorted by `resourceKey`, and `maximumConcurrent` SHALL be a positive safe integer bounded by the generic resource type. `resourceType` SHALL be exactly one of `HOST_CONTRIBUTION_REGISTRATION | HOST_REGISTRAR_CHILD | HOST_EVENT_SUBSCRIPTION | HOST_TIMER | HOST_WORKER | HOST_NETWORK_LISTENER | HOST_DURABLE_LEASE | PROCESS_LOCAL_DISPOSER`. Each type selects one fixed Host cleanup primitive: remove the complete snapshot registration; revoke/drain the canonical child registrar; unsubscribe by Host token; cancel/join a Host timer or worker; close/drain a Host-created network listener and prove its acceptor/socket absent; release/prove absent the exact Host durable-lease key; or, for `PROCESS_LOCAL_DISPOSER`, invoke the activation-returned closure in the owning process and after authoritatively proved process death treat only that process-local resource as absent. A declaration SHALL NOT name a domain handler, script, command, class, cleanup export, arbitrary method, or package-specific recovery algorithm.

The Host SHALL own the singular versioned `PackageLifecycleRecoveryContractV1`. Its implementation is the generic mapping above plus the canonical snapshot/registrar/authorization barriers; packages do not implement, export, or load a recovery contract. Each lifecycle attempt SHALL bind the Host recovery-contract version/digest and exact signed resource-declaration digest. Before any declared resource acquisition, the Host SHALL transactionally create or advance one attempt-scoped `PackageLifecycleResourceClaimV1` binding exact attempt ID, declaration key/type, Host-minted resource identity, state/revision, owning process epoch, and generic cleanup token/digest. An undeclared resource, direct acquisition outside its Host primitive, resource count above the declared maximum, arbitrary cleanup payload, or acquisition before its claim fails before the effect. Claims are teardown evidence inside the one lifecycle attempt, not another lifecycle FSM, registry, or admission path, and are cleared only after the matching Host primitive proves the exact resource stopped, drained, released, or authoritatively absent.

The 0.8M migration of the thirteen existing packages SHALL be metadata-only: it SHALL classify each existing lifecycle contribution and activation-returned disposer using only the generic declarations, without changing a handler, payload, business policy, domain database semantic, or adding thirteen package recovery implementations. Existing in-memory disposer closures SHALL be declared `PROCESS_LOCAL_DISPOSER`; after migration they may own only process-local effects. Before this controller may activate, the separately reviewed 0.10R restricted train SHALL replace every existing Host registration, child, event subscription, timer, worker, network listener, or durable/external lease acquisition with its declared canonical Host primitive and pre-acquisition claim while preserving domain behavior. If an existing lifecycle actually requires an undeclared durable/external cleanup semantic that cannot be represented by these fixed primitives, the train is `NO_GO` until the owning package separately removes that semantic; `[I]` SHALL NOT encode it in Host code or invent a package recovery callback during either migration.

An activation-returned in-memory disposer closure MAY accelerate same-process cleanup for its declared process-local resource, but it SHALL NOT be the sole teardown authority or evidence for any Host registration, child, timer, worker, subscription, renderer projection, or durable/external lease. After process loss, the Host SHALL run the same canonical recovery contract from retained signed declarations and durable claims without activating or importing domain code. Missing/mismatched declaration or recovery-contract binding, an unknown generic cleanup token, or a claim that cannot be proved absent leaves cleanup `TEARDOWN_FAILED`; the Host SHALL NOT invoke a newer package's code, infer a durable/external cleanup from missing memory, or add a package/domain-specific branch.

A disposer throw, hang, timeout, process crash before prior-owner termination is proved, nonzero resource claim, missing Main/renderer withdrawal acknowledgement from a still-live consumer, or lost teardown acknowledgement SHALL durably enter or remain `TEARDOWN_FAILED`. In that state admission remains closed, the dependency is not disposed/replaced/reactivated, and no dependent is reported inactive or available. The only controlled retry SHALL acquire exclusive recovery ownership for the same attempt and expected revision, validate the exact Host recovery-contract and signed declaration bindings, atomically traverse `TEARDOWN_FAILED -> QUIESCING` with the current process epoch, rerun deterministic generic quiescence reconciliation, and proceed through `DISPOSING` only after zero children/resources and required snapshot withdrawals are proved. Recovery failure, ambiguity, timeout, or nonzero evidence SHALL atomically return to or remain `TEARDOWN_FAILED`. It SHALL NOT skip to `INACTIVE`, start another disposer concurrently, synthesize a success acknowledgement, execute package cleanup code after restart, or create a compatibility cleanup path.

Before lifecycle-controller initialization, the Host SHALL acquire the same exclusive single-Main-process ownership for the application/userData instance used by the publisher and SHALL authoritatively prove that the prior owner process has terminated. Only then may it create a new non-reusable process epoch, treat prior-epoch process-local handles as dead, take lifecycle recovery ownership, or run the normalization matrix. A different epoch value by itself is not termination evidence. If exclusive ownership or prior-owner termination is uncertain, no package contribution is published, no recovery CAS is attempted, and every affected package remains fail closed; the Host SHALL NOT initialize a second lifecycle controller or infer zero resources from missing memory.

At each successfully owned Main-process startup, the Host SHALL publish no contribution from a prior epoch and normalize every durable package lifecycle record with expected-revision transitions according to this exact matrix:

| Durable state owned by a prior process epoch | Startup normalization | Required continuation |
| --- | --- | --- |
| `INACTIVE` | remain `INACTIVE` | no prior contribution or disposer is reconstructed |
| `ACTIVATING` | atomically enter `QUIESCING` | discard the unpublished staging container and run the bound Host generic recovery contract for that interrupted attempt |
| `ACTIVE` | atomically clear the prior snapshot projection and enter `QUIESCING` | invalidate every prior acknowledgement/token and reconcile every retained generic claim before the preserved enabled choice may create a new activation attempt |
| `QUIESCING` | remain `QUIESCING` while current-epoch recovery ownership is acquired by revision CAS | continue the same attempt's deterministic quiescence reconciliation |
| `DISPOSING` | atomically enter `TEARDOWN_FAILED` because the prior acknowledgement is unknown | use only the controlled `TEARDOWN_FAILED -> QUIESCING` retry |
| `TEARDOWN_FAILED` | remain `TEARDOWN_FAILED` until the bound Host recovery-contract/declaration digests and exclusive retry ownership validate, then atomically enter `QUIESCING` | retry the same attempt; any failure returns to or remains `TEARDOWN_FAILED` |

Only a successful idempotent disposal acknowledgement bound to the same lifecycle attempt, current process epoch, Host recovery-contract version/digest, signed resource-declaration digest, zero-claim proof, required snapshot-withdrawal acknowledgements, and expected revision may commit `DISPOSING -> INACTIVE`. Reactivation SHALL then revalidate persisted choices, the monotonic verified signed inventory and retained security state, the complete graph, numeric version intervals, definition/export descriptor digests, outbound edges, and package-to-module mapping before topological startup. No domain-ID switch, feature-specific Host configuration, numeric-priority fallback, alternate packaged graph, parallel enablement store, package-specific recovery branch, or second lifecycle FSM is allowed.

#### Scenario: Workflow Evolution starts and stops

- **WHEN** generated source or packaged composition activates or disposes the compatible enabled packages
- **THEN** Create Loop activates before Workflow Evolution and Workflow Evolution disposes before Create Loop
- **AND** Workflow Evolution's owner-bound Catalog adapter never observes a missing live Create Loop dependency
- **AND** caller identity cannot be supplied by payload

#### Scenario: Disabled Create Loop preserves the dependent choice

- **WHEN** Create Loop is explicitly disabled while Workflow Evolution is durably installed and enabled
- **THEN** Workflow Evolution's persisted `installed: true, enabled: true` choice remains unchanged
- **AND** its effective reason is `DEPENDENCY_UNAVAILABLE` and every main, renderer, capability, readiness, event, subscription, and background contribution is absent
- **AND** Create Loop is not silently re-enabled

#### Scenario: Dependency returns compatibly

- **WHEN** Create Loop later becomes installed/enabled with a signed version, definition, and `./catalog-contract` digest satisfying the frozen dependency object
- **THEN** the Host revalidates the full graph and may activate Workflow Evolution from its preserved enabled choice
- **AND** it does not synthesize a new user choice or use a stale provider binding

#### Scenario: Independent nodes need a deterministic order

- **WHEN** two `main.runtime-lifecycle` nodes are simultaneously ready and neither depends on the other
- **THEN** activation orders them by ascending UTF-8 bytes of unique stable `moduleId`
- **AND** disposal uses the exact reverse order regardless of numeric contribution priority

#### Scenario: Dependency is invalid

- **WHEN** a dependency is absent, duplicated, unsigned, non-bundled, version/definition/export-incompatible, or cyclic, or two packages claim one stable `moduleId`
- **THEN** the dependent is excluded from the effective set before activation and reports `DEPENDENCY_UNAVAILABLE`
- **AND** neither numeric priority nor a hard-coded domain order is used as fallback
- **AND** unrelated independent packages retain their prior installed, enabled, and effective state

#### Scenario: A dependency fails or changes while active

- **WHEN** Create Loop fails or its package is disabled, removed, or switched to another active version/definition/export binding
- **THEN** dependent admission closes and Workflow Evolution reaches zero live contributions before Create Loop is disposed or replaced
- **AND** Workflow Evolution's durable installed/enabled choices are preserved
- **AND** later activation occurs only after the complete signed graph and contract bindings validate again

#### Scenario: Existing release cohort survives the V2 cutover

- **WHEN** the persisted pre-cutover composition contains the current thirteen packages and their explicit states
- **THEN** migration retains all thirteen choices and every previously visible capability, panel, toolbar, preview, and lifecycle contribution
- **AND** adding Workflow Evolution changes only the never-seen fourteenth package state
- **AND** no second inventory or lifecycle graph restores a missing contribution

#### Scenario: A disposer fails

- **WHEN** a dependent disposer throws, hangs, times out, crashes, or leaves a registered resource or child
- **THEN** its lifecycle is `TEARDOWN_FAILED`, all admission remains closed, and its dependency is not disposed or replaced
- **AND** restart or operator retry re-enters the same quiesce/zero-resource/dispose sequence before any reactivation

#### Scenario: Staged activation is atomic

- **WHEN** a package constructs and registers contributions while its attempt is `ACTIVATING`
- **THEN** those registrations exist only in the attempt-scoped staging container and no caller can discover, invoke, render, or receive events from them
- **AND** Main and connected renderer consumers stage and acknowledge the same complete snapshot revision without exposing it
- **AND** one transaction commits the immutable Host projection with `ACTIVE`, while any pre-publish failure exposes none of it and enters `QUIESCING`

#### Scenario: A provider quiesces while its dependent is activating

- **WHEN** Workflow Evolution has frozen its staged set but Create Loop competes to enter `QUIESCING` before Workflow Evolution publishes
- **THEN** the one graph lifecycle commit lock orders exactly one outcome: dependent publication wins first and is then included in reverse-topological unpublication, or provider closure wins first and the dependent's final provider check fails
- **AND** no ordering exposes Workflow Evolution while its exact Create Loop snapshot is absent or closing

#### Scenario: A process exits with an active package

- **WHEN** restart observes an `ACTIVE` lifecycle attempt owned by the prior process epoch
- **THEN** no prior-epoch contribution is republished and the Host atomically normalizes the attempt to `QUIESCING`
- **AND** the bound Host generic recovery contract reconciles the signed declarations and attempt-scoped claims before disposal can reach `INACTIVE` and a new activation attempt may begin

#### Scenario: A disposer acknowledgement is lost

- **WHEN** restart observes `DISPOSING` from the prior epoch after the external cleanup may or may not have completed
- **THEN** the Host records `TEARDOWN_FAILED` rather than inferring success from the missing disposer closure
- **AND** the sole controlled retry enters `QUIESCING`, invokes the same idempotent Host generic recovery contract for the same attempt, and reaches `INACTIVE` only with a new bound acknowledgement

#### Scenario: Existing packages receive metadata-only recovery declarations

- **WHEN** 0.8M migrates the thirteen existing packages, including every package that contributes lifecycle behavior
- **THEN** it adds only signed generic resource declarations matching their current Host registrations and process-local disposers
- **AND** it changes no domain handler, payload, business state, database semantic, or package-owned cleanup code
- **AND** any lifecycle that cannot fit the fixed Host primitives blocks the train instead of creating a Host domain switch or custom recovery export

#### Scenario: A lifecycle acquires an undeclared resource

- **WHEN** activation attempts to start a timer, worker, network listener, subscription, child, contribution, durable lease, or process-local disposer without its matching signed declaration and pre-acquisition Host claim
- **THEN** the Host rejects the acquisition before the effect
- **AND** neither a late claim nor a package-specific cleanup callback repairs the attempt

#### Scenario: A renderer reconnects while a package is active

- **WHEN** a renderer with a new Host-minted connection epoch reconnects while one authoritative package snapshot remains `ACTIVE`
- **THEN** it first discards every prior local revision, privately stages the complete current Host projection, rechecks currentness, and atomically applies only that revision
- **AND** it returns matching `STAGED` and `APPLIED` acknowledgements before exposing the renderer surface
- **AND** it never eagerly registers from a manifest, generated package list, durable enabled choice, or prior cache

#### Scenario: A snapshot acknowledgement is stale or lost

- **WHEN** Main or a still-live renderer returns a wrong/stale revision, digest, process epoch, or connection epoch, or fails to acknowledge withdrawal
- **THEN** the acknowledgement cannot publish, preserve, or remove any other revision
- **AND** activation fails before publication or teardown remains `TEARDOWN_FAILED` as applicable
- **AND** no contribution-by-contribution fallback is used

### Requirement: Capability provider provenance has one closed Host-owned source

`CapabilityProviderProvenanceV1` SHALL be the exact closed union:

```text
{ kind: "DOMAIN_MANIFEST", moduleId, moduleVersion, definitionDigest }
| { kind: "HOST_CORE", moduleId, moduleVersion, definitionDigest }
```

For `DOMAIN_MANIFEST`, all three values SHALL come from the activated generated domain manifest definition. For `HOST_CORE`, all three values SHALL come from an immutable Host-owned core definition in generated/compile-time composition. Each `moduleId` and `moduleVersion` SHALL be a non-empty stable identifier and each `definitionDigest` SHALL be lowercase hexadecimal SHA-256 over the RFC 8785 canonical JSON UTF-8 bytes of that definition's versioned serializable body, excluding only the digest field itself and excluding handlers, factories, runtime objects, payloads, options, and environment data. Generation and registration SHALL verify the digest and reject duplicate action IDs, duplicate provider module IDs in one source set, mutable core definitions, and a digest mismatch.

The registry SHALL retain this provenance beside every registered capability definition. A factory, handler, caller, payload, invoke option, action-ID prefix, display name, package name, or mutable registry label SHALL NOT provide, replace, or weaken it. Caller owner identity remains separately derived from the caller's activated domain manifest; the `HOST_CORE` branch does not create a core caller identity or let a system caller bypass its manifest-derived ACL.

#### Scenario: A domain capability is registered

- **WHEN** generated composition registers a capability contributed by an activated domain package
- **THEN** its retained provenance is the exact verified `DOMAIN_MANIFEST` branch
- **AND** factory output cannot change its module ID, version, or definition digest

#### Scenario: A Host core capability is registered

- **WHEN** generated composition registers `version-control.restore`
- **THEN** its retained provenance is the immutable `HOST_CORE` definition for module `sciforge.version-control`
- **AND** the Git Checkpoints caller owner still comes only from activated manifest module `sciforge.git-checkpoints`
- **AND** no fabricated domain manifest or action-prefix inference is used

#### Scenario: Provider provenance is supplied at runtime

- **WHEN** a factory, payload, environment value, or invocation option supplies provider kind, module ID, module version, or definition digest
- **THEN** registration or invocation rejects the override
- **AND** no handler or operation lookup occurs under the claimed provenance

### Requirement: Lifecycle owners can prove exact current capability readiness

The generic lifecycle Host contract SHALL expose an owner-bound and workspace-bound read-only `CapabilityReadinessReaderV1`. `CapabilityReadinessRequestV1` SHALL be a strict object containing exactly `schemaVersion: 1` and `entries`. `CapabilityReadinessEvidenceBodyV1` SHALL have that same exact top-level shape. Each request and evidence entry SHALL contain exactly:

- `actionId`;
- `descriptorContractVersion`;
- `inputSchemaVersion`;
- `inputSchemaDigest`;
- `outputSchemaVersion`;
- `outputSchemaDigest`;
- `enforcementProfileVersion`;
- `enforcementProfileDigest`;
- `enabled`;
- `providerModuleId`;
- `providerProvenanceKind`; and
- `providerDefinitionDigest`.

Descriptor and schema versions SHALL be positive safe integers. The two enforcement-profile fields SHALL be either a matching positive-version/lowercase-digest pair or explicit `null`/`null`; omission, `null` paired with non-null, and non-null paired with `null` are invalid. Every digest SHALL be lowercase hexadecimal SHA-256. `providerProvenanceKind` SHALL be exactly `DOMAIN_MANIFEST | HOST_CORE`, and the provider module, kind, and definition digest SHALL be projected from retained `CapabilityProviderProvenanceV1`; caller input cannot assert them.

Request and evidence entries SHALL be duplicate-free and sorted by `actionId` in ascending UTF-8 byte lexical order. Unknown fields, alternate names, out-of-order entries, duplicate action IDs, and unsupported versions SHALL fail strict validation. `CapabilityReadinessEvidenceV1` SHALL contain exactly the immutable Host-derived `body` and `evidenceDigest`. The Host SHALL compute `evidenceDigest` as lowercase hexadecimal SHA-256 over the exact UTF-8 bytes of the RFC 8785 canonical JSON representation of the complete versioned evidence body.

The reader SHALL treat the request entries only as frozen expectations and SHALL read current actual values from the canonical generated registry, schema registry, and enforcement-profile registry. For each requested action that is registered and discoverable by the bound owner, it SHALL return the current actual entry even when that entry differs from the expectation. A missing or undiscoverable action SHALL be omitted without a fabricated sentinel or provenance value. A registered disabled action SHALL be returned with `enabled: false`. The capability set is ready only when the returned entry set and every returned field exactly equal the request; missing, disabled, version drift, schema/profile drift, provenance drift, or definition-digest drift is `STILL_BLOCKED`, never partial success.

The Host SHALL derive caller owner and `WorkspaceIdentityV1`; any supplied owner, workspace, registry content, schema/profile content, provenance, enabled state, or claimed readiness digest SHALL be rejected. Discovery ACLs SHALL be applied before evidence is returned, and the reader SHALL disclose no handler, registry object, private descriptor, or capability outside the caller's discoverable set. Workflow Evolution's platform-gate reducer SHALL consume only these public schemas and evidence and SHALL NOT import Host-private registry or IPC code.

#### Scenario: Platform capability becomes ready

- **WHEN** Workflow Evolution rechecks an open Platform Gate with its frozen exact readiness request
- **THEN** the Host reads current generated registry/schema/profile state under the Workflow Evolution owner and workspace
- **AND** returns the exact immutable current body and lowercase evidence digest
- **AND** exact equality with the frozen request is sufficient evidence for the deterministic reducer

#### Scenario: Required capability is missing or disabled

- **WHEN** a required action is absent, undiscoverable, or currently disabled
- **THEN** absence is represented only by an omitted evidence entry and disablement only by `enabled: false`
- **AND** no sentinel provenance is invented and the Platform Gate remains `STILL_BLOCKED`

#### Scenario: Required capability has drifted

- **WHEN** any descriptor, input/output schema, nullable enforcement profile, enabled state, provider module, provenance kind, or provider definition digest differs from the frozen request
- **THEN** the Host returns the discoverable current actual entry
- **AND** the mismatch remains `STILL_BLOCKED` rather than being normalized, defaulted, or accepted

#### Scenario: Readiness evidence shape is non-canonical

- **WHEN** a request or evidence body changes entry order, duplicates an action, omits one side of the nullable profile pair, uses a non-lowercase digest, or adds an unknown field
- **THEN** strict validation fails
- **AND** no equivalent evidence digest or Gate resolution is produced

#### Scenario: Payload claims readiness

- **WHEN** payload supplies registry contents, owner, workspace, provider provenance, enabled state, or a claimed readiness digest
- **THEN** the Host rejects those values before registry lookup
- **AND** no caller-supplied evidence can resolve the Gate

### Requirement: The Host consumes the singular SDK compute reservation contract

`ComputeReservationV1` SHALL be owned and exported only by `@sciforge/domain-sdk/contract`. Its complete closed field set, units, bounds, `reservedRequestBodyDigest` envelope exclusion, `reservationDigest` own-field exclusion, RFC 8785/SHA-256 rules, and accepted/rejected byte vectors SHALL be the singular normative contract defined by `workflow-catalog-lifecycle`. The Host, Create Loop, and Workflow Evolution SHALL import that exact SDK schema, validator, canonicalizer, and shared fixtures. This capability SHALL NOT copy or redefine its field list, vector, digest body, alias, re-export, widened parser, fallback digest, or domain-local variant.

The Host SHALL validate the SDK value and its bound workspace, owner, action, operation, reservation-free request body, budget scope/revision, Run-budget decision, model price table, and enforceable limits before compute/model dispatch. Validation in source and packaged applications and after process restart SHALL produce the same canonical bytes, digest, and rejection result.

#### Scenario: One canonical reservation crosses package boundaries

- **WHEN** Workflow Evolution creates a reservation and Create Loop or the Host validates it in source or packaged execution, in another process, or after restart
- **THEN** all parties use the SDK schema and reproduce the exact canonical bytes and digest
- **AND** no domain-owned reservation shape or digest cycle exists

#### Scenario: Reservation envelope is included in the reserved request digest

- **WHEN** a caller computes `reservedRequestBodyDigest` over a request containing its reservation envelope
- **THEN** validation fails before compute or model dispatch
- **AND** no alternate digest order or compatibility parser is attempted

### Requirement: Opaque workspaces have one live-authorized durable publisher

The generic lifecycle Host contract SHALL expose `WorkspacePublisherV1.publishNewFile` and `WorkspacePublisherV1.readPublication`. `WorkspacePublicationRequestV1` SHALL contain exactly caller-stable `publicationId`, `relativePath`, `mediaType`, `contentDigest`, and bounded mutable `bytes`. `WorkspacePublicationLookupRequestV1` SHALL contain exactly `publicationId`. Both methods SHALL derive the current opaque `WorkspaceIdentityV1` and `OperationOwnerScopeV1`; the caller SHALL never receive or reconstruct the canonical workspace path.

Stage1 publication targets SHALL be one validated filename directly beneath the workspace root identity. `relativePath` SHALL contain one non-empty filename and no `/`, `\`, alternate separator, empty/dot segment, `.` or `..`, drive/device prefix, NUL, platform device name, or parent component. Multi-segment targets are invalid before child registration or native dispatch. This restriction applies only to domains choosing `WorkspacePublisherV1`; it does not globally redefine other domain-owned path contracts. Nested publisher targets and movable-parent ancestry are outside Stage1 and SHALL NOT be emulated with path checks.

On Windows, the filename validator SHALL additionally reject every character in `<>:"/\|?*`, every code point from U+0000 through U+001F, and a trailing U+0020 space or U+002E dot. It SHALL case-insensitively reject the complete reserved DOS-device basename set `CON`, `PRN`, `AUX`, `NUL`, `COM1` through `COM9`, `COM¹`, `COM²`, `COM³`, `LPT1` through `LPT9`, `LPT¹`, `LPT²`, and `LPT³`. The device comparison SHALL use the basename before the first dot, so an extension never makes a reserved device safe; for example, `NUL.txt` remains invalid. Validation SHALL reject rather than trim or normalize an invalid name. The colon prohibition SHALL reject every alternate-data-stream spelling, including `file:stream` and `file::$DATA`, before child registration or native dispatch.

`WORKSPACE_PUBLICATION_AUTHORIZATION_PURPOSE_V1` SHALL be the exact value `sciforge.workspace-publisher.export-audit`. `publishNewFile` SHALL be callable only inside a currently confirmed outer capability invocation with `effect=external-write`, that exact registered granted purpose, the same Host-derived provider/caller owner, and the exact same workspace. The publisher SHALL consume the canonical Host-private `LiveChildRegistrarV1` and its typed `registerWorkspacePublicationChild(...)` variant normatively defined by `capability-broker`. The Broker SHALL atomically register the publication as the outer invocation's child before publication-operation lookup, byte copying, temporary-file creation, or native dispatch. The publisher SHALL NOT define a second registrar, admission state machine, closure barrier, revocation primitive, child set, or settlement wait; the durable publication phases below are operation recovery state, not authorization state. Payload, options, persisted state, or a prior receipt SHALL NOT supply or recreate the purpose, owner, workspace, live token, or process epoch.

The Host SHALL give the registered child a non-serializable `WorkspacePublicationGuardV1`. Immediately before the atomic no-overwrite publication, the publisher SHALL call `enterPublish()` and hold its non-serializable `WorkspacePublicationLeaseV1` through atomic publication, final file/digest verification, root-directory durability flush where supported, and durable success receipt commit. `enterPublish()`, successful outer-handler return, throw, cancellation, and revocation SHALL use the one admission linearization primitive owned by the canonical registrar. Successful-return-first SHALL close admission, deny `enterPublish()`, produce no final file, leave the durable operation strictly before `PUBLISHING`, and make the registered child attempt settle; it SHALL NOT publish merely because registration or staging happened earlier. Lease-first SHALL close later admission and force successful return or failure settlement to wait for that registered lease to finish success or failure. Throw/cancel/revoke-first SHALL likewise deny entry and produce no final file. A plain `isLive()` check followed by publication is invalid.

The publisher SHALL additionally own one atomic per-operation execution fence keyed exactly by `(WorkspaceIdentityV1, OperationOwnerScopeV1, publicationId)` and the current durable operation revision. This fence is concurrency control only. It SHALL NOT authorize a write, replace or extend the canonical `LiveChildRegistrarV1`, mint a confirmation, recreate an ended outer scope, or add another publication FSM. Acquisition is legal only after the current confirmed invocation has registered its canonical publication child. One Host transaction SHALL use expected revision to bind the winning execution attempt to a Host-generated execution-attempt ID and current process epoch before that attempt performs any publication-state transition or native filesystem call.

The application SHALL retain its existing single-Main-process ownership boundary for the relevant application/userData instance, including rejection of a packaged second instance before publisher initialization. Inside that sole Main process, the publisher SHALL maintain one non-evicting single-flight entry for each executing publication key. Two concurrent fresh confirmations or resumes for one publication ID SHALL therefore yield exactly one execution-fence winner. A loser SHALL make zero filesystem/native calls and, after the winner settles, may only read and adopt the resulting durable state under its own current read authority. The winner SHALL hold the execution fence through its staging/resume/reconciliation attempt and its durable state update.

A process crash ends the old process-local single-flight. A later sole Main process may take over an execution-attempt record from another process epoch only under a fresh matching confirmation, a new canonical child registration, current package/read authority, and an expected-revision CAS after reconciling the durable operation. It SHALL NOT infer that an old authorization survived or run background recovery. Within one live process epoch an execution-fence record SHALL not be stolen, timed out, or LRU-evicted; reaching a bounded safety capacity fails new publication execution closed rather than evicting an active or completed guard record.

After `enterPublish()` returns the lease and before any native no-replace call, the Host SHALL use an expected-revision transaction held under the matching publisher execution fence to move the exact durable operation from `TEMP_STAGED` to `PUBLISHING`. That transaction SHALL bind one Host-generated unique durable `publishAttemptId` to the currently leased registered child attempt and the current publisher execution-attempt ID/process epoch, together with the existing temp nonce, persisted temp identity, content digest, and final `relativePath`. It SHALL succeed only while the current process holds both the exact registered publication lease and the matching per-operation execution fence and after root-handle-relative no-follow checks prove that the staged temp is still the same regular, non-reparse, single-link persisted identity with the exact digest and that the final name is absent. A transaction failure, identity/digest/link-count/type drift, existing final, or execution-fence loss SHALL make zero native publish calls. The durable `publishAttemptId` and publisher execution-attempt metadata are correlation, crash recovery, and concurrency evidence only: neither is the registrar's non-serializable child identity, live token, or authorization, and neither can recreate a lease. The `PUBLISHING` phase is a durable external-write fence, not another registrar or admission state machine.

The Host SHALL persist publication idempotency under exactly `(WorkspaceIdentityV1, OperationOwnerScopeV1, publicationId)`. `WorkspacePublicationRequestDigestBodyV1` SHALL contain exactly `schemaVersion: 1`, `publicationId`, `relativePath`, `mediaType`, and `contentDigest`; its `requestDigest` SHALL be lowercase SHA-256 over RFC 8785 canonical JSON UTF-8 bytes. The supplied bytes SHALL hash exactly to `contentDigest`. Reusing a publication ID with another request digest SHALL record Host-private `REQUEST_DIGEST_CONFLICT`, return only public class `REQUEST_REJECTED`, make zero filesystem change, and leave the original operation unchanged.

The durable operation SHALL store status/digests/receipt or failure metadata and, from request, staging, or execution-fence data, only `relativePath`, `mediaType`, `contentDigest`, Host-computed safe-integer `byteLength`, one opaque active `tempNonce`, an opaque platform-stable file identity, the current/last publisher execution-attempt ID/process epoch/revision, and the `PUBLISHING`-only `publishAttemptId`. The Host SHALL generate one unpredictable nonce unique within the workspace publication namespace and persist it in the same atomic transaction that first creates `IN_PROGRESS/CLAIMED`; `CLAIMED` is always nonce-present, and the operation SHALL NOT rotate or replace that nonce. The stable file identity is absent in `CLAIMED`, required in `TEMP_STAGED` and `PUBLISHING`, and retained by a terminal outcome only when its lineage reached `TEMP_STAGED`. The `publishAttemptId` is absent in `CLAIMED` and `TEMP_STAGED`, required in `PUBLISHING`, and retained by a terminal outcome if and only if its lineage reached `PUBLISHING`. The operation SHALL never persist, log, trace, event, cache, serialize, or place the raw content bytes in an idempotency record. The nonce, platform identity, publisher execution-attempt metadata, publish-attempt identity, filesystem observations, and exact diagnostic code are Host-private metadata. The platform identity SHALL be stable for the life of a file object, such as POSIX device/inode identity or Windows volume/file ID.

The exact `WorkspacePublicationLookupStateV1` values SHALL be:

```text
NOT_FOUND | IN_PROGRESS | SUCCEEDED | FAILED | CANCELLED | OUTCOME_UNKNOWN
```

An `IN_PROGRESS` record SHALL carry exact phase `CLAIMED | TEMP_STAGED | PUBLISHING`. The only forward phase/terminal edges SHALL be:

```text
CLAIMED    -> TEMP_STAGED | FAILED | CANCELLED | OUTCOME_UNKNOWN
TEMP_STAGED -> PUBLISHING | FAILED | CANCELLED | OUTCOME_UNKNOWN
PUBLISHING -> SUCCEEDED | FAILED | OUTCOME_UNKNOWN
```

No phase may move backward, and `SUCCEEDED` is reachable only from durable `PUBLISHING`. `SUCCEEDED` SHALL carry immutable `WorkspacePublicationReceiptV1`; the Host-private durable `FAILED` record SHALL carry one exact `WorkspacePublicationFailureCodeV1`; other variants SHALL NOT invent a receipt. The exact private diagnostic codes SHALL be:

```text
INVALID_REQUEST
REQUEST_DIGEST_CONFLICT
CONTENT_DIGEST_MISMATCH
CONFINEMENT_VIOLATION
TEMP_IDENTITY_CONFLICT
DESTINATION_IDENTITY_CONFLICT
NATIVE_UNAVAILABLE
IO_FAILURE
```

`WorkspacePublicationReceiptV1` SHALL be a closed public object containing exactly:

```text
schemaVersion = 1
publicationId
requestDigest
relativePath
mediaType
contentDigest
byteLength
phase = "SUCCEEDED"
```

`byteLength` SHALL be the Host-computed safe-integer length of the bytes whose digest equals `contentDigest`. The receipt SHALL NOT contain a canonical path, workspace identity, owner identity, timestamp, nonce, file identity, link/occupancy observation, `publishAttemptId`, publisher execution-attempt metadata, process epoch, revision, native handle, private diagnostic code, or arbitrary metadata.

The public `WorkspacePublicationFailureClassV1` SHALL be the exact minimal union:

```text
REQUEST_REJECTED | PUBLICATION_FAILED | OUTCOME_UNCERTAIN
```

The Host SHALL retain exact private diagnostics for recovery and privileged Host audit, but every domain/renderer/IPC/event/public-method projection SHALL map `INVALID_REQUEST`, `REQUEST_DIGEST_CONFLICT`, `CONTENT_DIGEST_MISMATCH`, and `CONFINEMENT_VIOLATION` to `REQUEST_REJECTED`; map `TEMP_IDENTITY_CONFLICT`, `DESTINATION_IDENTITY_CONFLICT`, `NATIVE_UNAVAILABLE`, and `IO_FAILURE` to `PUBLICATION_FAILED`; and map every private reason for durable `OUTCOME_UNKNOWN` to `OUTCOME_UNCERTAIN`. In particular, `TEMP_IDENTITY_CONFLICT` and all nonce presence/type/identity observations SHALL never cross the public boundary. A private code SHALL NOT be embedded in text, nested metadata, logs returned to the caller, or an alternate error channel.

Lookup meaning SHALL be fixed as follows:

| Lookup state | Exact meaning |
| --- | --- |
| `NOT_FOUND` | No durable claim exists in the authorized namespace. |
| `IN_PROGRESS/CLAIMED` | The exact request is durably claimed, no trusted staging result is public, and no terminal receipt exists. |
| `IN_PROGRESS/TEMP_STAGED` | Staging is durably recorded, no publish fence is public, and no terminal receipt exists. |
| `IN_PROGRESS/PUBLISHING` | A durable publish fence exists, while native publication and/or its durable terminal receipt remain unproved. |
| `SUCCEEDED` | A prior durable `PUBLISHING` fence exists, the final identity and digest matched that fence, root durability was flushed where supported, and the immutable success receipt is durable. |
| `FAILED` | A known terminal failure for the canonical request is durable with one Host-private closed diagnostic code and no unaccounted final file. A conflicting retry error SHALL NOT replace the original operation's state. |
| `CANCELLED` | Cancellation/closure won before `enterPublish()`, the Host proved the final absent, and either the `CLAIMED` nonce path was absent or the exact persisted-identity `TEMP_STAGED` temp was safely removed/invalidated; it is terminal and non-resumable. A `CLAIMED` operation whose nonce path exists cannot become `CANCELLED`. |
| `OUTCOME_UNKNOWN` | The Host cannot prove either final identity-plus-digest success or safe absence; it is terminal for automatic dispatch. |

`readPublication` SHALL be read-only and SHALL require no historical confirmation, but it SHALL perform current owner/workspace authorization before lookup and expose only the caller's exact namespace. Cross-owner/workspace lookup SHALL be rejected before lookup with no existence disclosure. Its closed `WorkspacePublicationPublicResultV1` SHALL be exactly one of:

```text
{ schemaVersion: 1, publicationId, phase: "NOT_FOUND" }

{ schemaVersion: 1, publicationId, requestDigest, relativePath, mediaType,
  contentDigest, byteLength,
  phase: "CLAIMED" | "TEMP_STAGED" | "PUBLISHING" | "SUCCEEDED" | "CANCELLED" }

{ schemaVersion: 1, publicationId, requestDigest, relativePath, mediaType,
  contentDigest, byteLength,
  phase: "FAILED" | "OUTCOME_UNKNOWN",
  failureClass: WorkspacePublicationFailureClassV1 }
```

For `SUCCEEDED`, that public result SHALL be byte-for-byte the closed `WorkspacePublicationReceiptV1`. For `FAILED`, `failureClass` SHALL be only `REQUEST_REJECTED | PUBLICATION_FAILED`; for `OUTCOME_UNKNOWN`, it SHALL be exactly `OUTCOME_UNCERTAIN`. No other variant may carry `failureClass`. These are the complete public field allowlists: unknown fields, a nested private result, or an alternate error/details object SHALL fail serialization.

`readPublication` SHALL return the original immutable terminal public projection for exact same-owner lookup. For non-terminal operations it SHALL report only the flattened durable public phase and the allowlisted request-level fields above. It SHALL never expose `tempNonce`, any platform file identity, publisher execution-attempt ID/epoch/revision, `publishAttemptId`, native handle, canonical workspace path, owner/workspace identity, private diagnostic code, or private absence/occupancy/type/link observation. It SHALL NOT transition `CLAIMED`, `TEMP_STAGED`, or `PUBLISHING`, inspect or mutate bytes, flush a root, sign a receipt, register a child, acquire an execution fence, or enter a publication lease. Neither lookup nor a persisted result grants permission to resume. `publishNewFile` SHALL return the same closed receipt on success and only the corresponding generalized public failure class on failure; it SHALL NOT expose a private diagnostic through its result, thrown message, IPC payload, or event.

The Host SHALL atomically persist the namespace, request digest, unique active temp nonce, and `CLAIMED` phase before invoking any native temporary-file create. The native port SHALL accept only that already persisted nonce and the retained workspace-root identity handle; it SHALL NOT generate an unpersisted candidate nonce. After the claim transaction commits, the Host SHALL first prove with a root-handle-relative no-follow lookup that the exact nonce path is absent, then create it exclusively. If it is present, the Host SHALL NOT open it for write, truncate, adopt, relink, rename, or delete it, even when it is a regular file, has the requested digest, or is a hard link, symbolic link, or Windows reparse point. The operation SHALL fail closed as `TEMP_IDENTITY_CONFLICT` when the conflicting object and safe final absence are authoritative, or as `OUTCOME_UNKNOWN` when identity/type/absence cannot be proved; the existing object SHALL remain untouched.

Only the handle returned by the successful exclusive create in the current process may be written and flushed. The Host SHALL verify the content digest, acquire the stable temp-file identity, and, immediately before committing, prove by root-handle-relative no-follow inspection that the nonce path is still the same regular, non-reparse, single-link file identity held by that handle. It SHALL then atomically persist `TEMP_STAGED` with the same nonce, identity, and digest while that exact handle remains bound. A path swap, extra hard link, type change, or identity drift before the commit fails closed without adopting, rewriting, or deleting the observed object. Before `enterPublish()`, `TEMP_STAGED` recovery SHALL require the exact persisted temp identity and digest and an absent final. After `enterPublish()` succeeds, the Host SHALL commit the `PUBLISHING` fence described above before it may call the native no-replace primitive. It SHALL never infer success from final-path existence or content bytes alone. A final file with identical bytes but another identity is `DESTINATION_IDENTITY_CONFLICT`, not idempotent success.

A crash or ended confirmation before the atomic claim transaction commits yields `NOT_FOUND` and cannot have invoked native create. A crash after claim commit but before native create, after exclusive create returns, after the first byte is written, after the temp flush completes, after stable identity is read, or immediately before the `TEMP_STAGED` transaction commits yields `IN_PROGRESS/CLAIMED` with the same persisted nonce and no trusted temp identity. Of those windows, only claim-commit-before-create can be resumed when the exact nonce path is authoritatively absent; every post-create window leaves an existing untrusted nonce path that SHALL be retained and failed closed without filesystem mutation. A crash after `TEMP_STAGED` but before successful lease entry, or after lease entry but before the `PUBLISHING` transaction commits, yields `IN_PROGRESS/TEMP_STAGED` and cannot have called native publish. A crash after the `PUBLISHING` transaction commits but before native publish, or after native publish but before the durable receipt, yields `IN_PROGRESS/PUBLISHING`.

`NOT_FOUND` or an inactive `IN_PROGRESS` operation MAY resume only inside a new matching confirmed outer invocation, with the same publication ID and exact request digest. `CLAIMED` recovery may exclusively create only when the exact nonce path and final are authoritatively absent; any exact nonce-path presence follows the no-touch failure rule above. `TEMP_STAGED` recovery may reuse only the exact persisted nonce, identity, and digest, and it SHALL require the final absent before a fresh registered child may win `enterPublish()` and commit `PUBLISHING`. If any final exists while the durable phase is only `CLAIMED` or `TEMP_STAGED`, the Host SHALL produce `DESTINATION_IDENTITY_CONFLICT` or `OUTCOME_UNKNOWN` and SHALL NOT infer success or sign a receipt, even when the final has the same identity and digest as the temp because of an external rename or hard link.

Only a durable `PUBLISHING` record permits final identity-plus-digest crash reconciliation. Every such reconciliation SHALL hold both a fresh canonical publication lease and the matching per-operation execution fence. If its final is absent and the exact staged regular, non-reparse, single-link identity/digest remains, a fresh matching confirmation may continue the same durable publish attempt. If its final is present, the Host SHALL use root-handle-relative no-follow inspection to prove that it is a regular, non-reparse, single-link file whose stable identity and content digest exactly equal the fenced values, and SHALL separately prove the exact persisted nonce path is absent. Only after all of those facts hold may it flush the root and atomically commit the immutable `SUCCEEDED` receipt without a second native publish.

A final hard link, link count other than one, symlink, reparse point, type/identity/digest drift, or still-present nonce path after the publish fence is `DESTINATION_IDENTITY_CONFLICT` when authoritative or `OUTCOME_UNKNOWN` when ambiguous; none may be flushed or signed as success. The same proof SHALL run immediately after a native no-replace call before root flush and success COMMIT, not only during restart. A different/missing/ambiguous fenced object also becomes conflict/unknown. `readPublication` alone performs none of these actions. Recovery and cleanup SHALL NOT enumerate the directory, glob or prefix-scan for possible temps, guess a nonce, select a newest file, generate a second active nonce, or write a second active temp. Every resume keeps the original final filename and durable publish-attempt identity. Terminal `FAILED`, `CANCELLED`, or `OUTCOME_UNKNOWN` SHALL NOT redispatch. No background task, lookup call, old invocation ID, receipt, or ended confirmation may create a final or second file.

#### Scenario: Workflow Evolution publishes an audit

- **WHEN** a user confirms `workflow-evolution.export-audit` and its same-owner/workspace handler calls `publishNewFile` with the exact export purpose and a valid root filename
- **THEN** the Broker registers the publication child before dispatch and the Host durably claims its publication ID before staging
- **AND** successful `enterPublish()` is followed by durable `PUBLISHING` before one atomic no-overwrite publication
- **AND** the caller receives only the immutable receipt and non-canonical filename metadata

#### Scenario: A claimed nonce path is occupied

- **WHEN** Host-private recovery records `TEMP_IDENTITY_CONFLICT` because the claimed nonce path is occupied
- **THEN** the caller can receive only phase `FAILED`, the request-level public fields, and generalized class `PUBLICATION_FAILED`
- **AND** no public result, receipt, error, event, or returned log reveals that a nonce path existed or reveals its type, identity, link count, name, or diagnostic code

#### Scenario: Successful handler return wins publication admission

- **WHEN** a registered publication child is claimed or staged, but successful outer-handler return wins the canonical registrar's admission linearization before `enterPublish()`
- **THEN** `enterPublish()` is denied and no final file is created
- **AND** the child attempt settles under the registrar barrier, no `PUBLISHING` fence exists, and no later final-path identity or digest can be signed as success for that attempt

#### Scenario: Publication lease wins successful handler return

- **WHEN** `enterPublish()` wins the canonical registrar's admission linearization before successful outer-handler return
- **THEN** the Host durably commits the exact `PUBLISHING` fence before native no-replace and return closes later admission but cannot settle the outer invocation until the lease finishes atomic publication, flush, verification, and durable operation settlement
- **AND** no second publisher admission state machine participates

#### Scenario: Publication entry races failure settlement

- **WHEN** `enterPublish()` races outer throw, cancellation, or revocation
- **THEN** revoke-first produces no final file and preserves only a safe durable recovery point, while lease-first makes outer settlement await publication, flush, verification, and receipt
- **AND** exactly one Host atomic order wins

#### Scenario: Response is lost after publication

- **WHEN** durable `PUBLISHING` precedes atomic final publication and the process exits before the success receipt is committed
- **THEN** read-only public restart lookup reports only phase `PUBLISHING` and the allowlisted request fields
- **AND** a fresh matching confirmed resume may commit `SUCCEEDED` only if root-handle-relative no-follow checks prove a regular non-reparse single-link final with the exact fenced identity/digest, prove the exact nonce path absent, and the required durability flush succeeds
- **AND** identical bytes under a different file identity record Host-private `DESTINATION_IDENTITY_CONFLICT` while the public result exposes only `PUBLICATION_FAILED`

#### Scenario: Publication is interrupted before publish entry

- **WHEN** restart finds `CLAIMED` or `TEMP_STAGED` with no `PUBLISHING` fence
- **THEN** `readPublication` reports flattened public phase `CLAIMED` or `TEMP_STAGED` without publishing
- **AND** only a fresh same-owner/workspace export confirmation may resume the exact request
- **AND** `CLAIMED` resumes only when its nonce path is absent, while `TEMP_STAGED` resumes only from its persisted identity/digest with the final absent

#### Scenario: Every pre-staging kill window is closed

- **WHEN** a real subprocess is killed after claim commit before native create, after native create, after the first written byte, after temp flush, after identity read, or immediately before `TEMP_STAGED` commit
- **THEN** public `readPublication` reports only phase `CLAIMED` and the allowlisted request fields and performs no recovery write
- **AND** Host-private persisted-state and filesystem fixtures prove the same original nonce remains bound without exposing it through the public lookup
- **AND** a fresh matching confirmed resume may exclusively create only in the claim-before-create case whose nonce path is absent
- **AND** every post-create case sees an existing path without persisted identity, retains it, and reaches `TEMP_IDENTITY_CONFLICT` or `OUTCOME_UNKNOWN` with zero filesystem write, adoption, deletion, or final publication
- **AND** the matrix proves zero directory enumeration, guessed nonce, second active temp, premature final file, or inferred success

#### Scenario: A foreign object occupies a claimed nonce path

- **WHEN** `CLAIMED` has no persisted temp identity and its exact nonce path names a foreign regular file, a regular file with the requested digest, a hard link, a symbolic link, or a Windows reparse point
- **THEN** root-handle-relative no-follow inspection fails the operation closed as `TEMP_IDENTITY_CONFLICT` or `OUTCOME_UNKNOWN`
- **AND** the Host performs zero byte write, truncation, adoption, relink, rename, deletion, native final publish, or success-receipt commit
- **AND** the foreign object remains untouched

#### Scenario: A staged temp reaches the final name before publish entry

- **WHEN** an external actor renames the exact `TEMP_STAGED` object to the final name or creates a hard link there before `enterPublish()` wins and before durable `PUBLISHING`
- **THEN** the same identity and digest at the final name are insufficient for success
- **AND** the operation becomes `DESTINATION_IDENTITY_CONFLICT` or `OUTCOME_UNKNOWN` with no receipt, cleanup deletion, or native publish

#### Scenario: Closure wins before the publishing fence

- **WHEN** `OPEN -> CLOSING_SUCCESS` or `OPEN -> REVOKING` wins the canonical registrar race while the operation is `TEMP_STAGED`
- **THEN** `enterPublish()` fails, `PUBLISHING` is never committed, and the native no-replace call count is zero
- **AND** a later external rename, hard link, same identity, or same digest at the final name cannot turn that contained child attempt into `SUCCEEDED`

#### Scenario: Publishing crash states are unambiguous

- **WHEN** the process is killed after `enterPublish()` succeeds but before the `PUBLISHING` transaction commits
- **THEN** Host-private recovery observes `IN_PROGRESS/TEMP_STAGED`, public lookup reports only phase `TEMP_STAGED`, the final is absent, and only a fresh confirmation may compete for a new canonical lease
- **WHEN** the process is killed after durable `PUBLISHING` but before native no-replace
- **THEN** Host-private recovery retains the exact `IN_PROGRESS/PUBLISHING` attempt/temp/digest/final binding and no final file, while public lookup reports only phase `PUBLISHING` and allowlisted request fields
- **WHEN** the process is killed after native no-replace but before root flush or receipt commit
- **THEN** only a root-relative no-follow proof of regular non-reparse single-link exact fenced final identity/digest plus exact nonce-path absence under a fresh confirmed lease and matching execution fence may reconcile to `SUCCEEDED`
- **AND** neither `CLAIMED` nor `TEMP_STAGED` can use that reconciliation rule

#### Scenario: Post-fence filesystem identity is not singular

- **WHEN** after durable `PUBLISHING` the final is a hard link, symlink, reparse point, non-regular file, has link count other than one, or the exact nonce path still exists
- **THEN** neither immediate completion nor crash reconciliation flushes or signs success
- **AND** the operation becomes `DESTINATION_IDENTITY_CONFLICT` or `OUTCOME_UNKNOWN` without deleting or adopting either object

#### Scenario: Concurrent fresh resumes target one publication

- **WHEN** two currently confirmed invocations concurrently resume the same owner/workspace/publication ID and durable revision
- **THEN** exactly one per-operation execution-fence attempt may reach staging, reconciliation, or native publication
- **AND** the loser makes zero filesystem/native calls and may adopt only the winner's later durable state
- **AND** the native no-replace call count is at most one for that live-process race

#### Scenario: A second packaged instance starts

- **WHEN** another packaged application process attempts to initialize the same application/userData publisher while the Main process owns the existing single-instance lock
- **THEN** the second instance is rejected before publisher initialization
- **AND** it cannot acquire an execution fence, register a publication child, or call native publication

#### Scenario: A multi-segment path is requested

- **WHEN** a publisher caller supplies traversal, a separator, a parent component, a device prefix/name, or any nested path
- **THEN** request validation fails before child/native dispatch
- **AND** no component walk or movable-parent safety claim is used as a fallback

#### Scenario: A Windows filename is unsafe

- **WHEN** a Windows publication filename contains a forbidden punctuation/control character, ends in a space or dot, has any reserved device basename with any casing or extension, or uses an alternate-data-stream spelling such as `file:stream`
- **THEN** request validation fails before child registration, publication-operation lookup, or native dispatch
- **AND** no trimming, ADS open, device open, or compatibility spelling is attempted

#### Scenario: Publication ID is reused differently

- **WHEN** the same owner/workspace reuses a publication ID with another filename, media type, or content digest
- **THEN** the Host records private `REQUEST_DIGEST_CONFLICT` but returns only public class `REQUEST_REJECTED` with zero filesystem change
- **AND** the original operation, temp identity, final file, and receipt remain unchanged

### Requirement: Workspace publication uses one physical native package

The sole implementation of `WorkspacePublisherNativePortV1` SHALL be the N-API addon package at repository path `packages/workspace-publisher-native` with npm name `@sciforge/workspace-publisher-native`. The root workspace list SHALL include that path, the root application SHALL declare its exact version as an ordinary production dependency, and the root lockfile SHALL resolve that same workspace artifact. There SHALL be no JavaScript rename fallback, second helper package, domain-owned implementation, or developer-machine binary fallback.

The addon SHALL freeze Node-API ABI version `8` for source builds, rebuilds, target prebuilds, loaders, and probes. Build/rebuild scripts SHALL distinguish a source development build from a target Electron rebuild and from selection of a target prebuild, verify ABI/platform/architecture metadata, and fail rather than silently use the host machine's artifact. Release CI SHALL build and execute real probes for exactly macOS arm64, macOS x64, Windows x64, and Linux x64 prebuild targets. macOS arm64 and x64 SHALL use isolated per-architecture build and staging roots; assembling one architecture SHALL NOT copy, rename, or validate the other architecture's binary.

The package's published `files` allowlist SHALL contain the loader and required per-target addon assets. `electron-vite` SHALL externalize this native production dependency rather than bundling its binary. Electron Builder `files` SHALL include the package and root `asarUnpack` SHALL place every loadable `.node` asset outside ASAR. `beforePack` SHALL load the exact source/selected-target addon, verify Node-API ABI/platform/architecture, and execute a real exclusive-publication probe. `afterPack` SHALL load from the emitted application's unpacked resource path, verify the emitted binary's ABI/platform/architecture, and execute the same real probe. Runtime startup and release CI SHALL use the same loader/probe contract. A mocked function, metadata-only inspection, `require.resolve` without loading, or successful build without an actual no-overwrite probe is insufficient.

For the Stage1 single-root-filename model, the addon SHALL retain the already validated workspace root identity handle and operate on temporary and final names relative to that handle. Native create SHALL accept the exact previously persisted nonce and SHALL run only after a no-follow/reparse-safe root-relative absence proof. When the durable phase is `CLAIMED`, an existing nonce path has no trusted identity and every native surface SHALL refuse to open it for write, adopt it, rename it, link it, or delete it regardless of type, link count, or digest. Identity-checked reuse or cleanup is available only from `TEMP_STAGED` or `PUBLISHING` and only when the exact persisted stable identity matches. No native API SHALL accept a caller path, enumerate or search the root for possible temps, infer a temp from a prefix or timestamp, or mint another nonce.

The Host SHALL invoke the final native no-replace method only while holding the current canonical `WorkspacePublicationLeaseV1` and only after reading the exact durable `PUBLISHING` record whose publish-attempt ID, nonce, temp identity, content digest, and final name match the call. The addon SHALL require all of those bound values and SHALL reject any missing or mismatched fence input before the platform primitive. The fence input is not a second authorization token or state machine and cannot substitute for the live canonical lease. `CLAIMED` and `TEMP_STAGED` SHALL have no native final-publish entrypoint.

Final publication SHALL use:

- macOS SHALL use descriptor-relative `renameatx_np(..., RENAME_EXCL)`;
- Linux SHALL use descriptor-relative `renameat2(..., RENAME_NOREPLACE)`; and
- Windows SHALL use `SetFileInformationByHandle` with `FileRenameInfoEx`, the retained root-directory handle, fail-if-exists/no-replace semantics, and reparse-point-safe opens and identity checks equivalent to the POSIX no-follow boundary.

The addon SHALL create the temporary file exclusively beneath that same root handle only for a nonce-bearing `CLAIMED` call after the exact absence proof, and it SHALL flush that file before staging. It SHALL invoke atomic final publication without replacement only from the fenced `PUBLISHING` call. macOS/Linux SHALL fsync the root descriptor where supported; Windows SHALL use the corresponding file/root durability flush supported by the filesystem. A missing symbol, unsupported kernel/filesystem semantic, load error, ABI/architecture mismatch, ASAR error, reparse-safe handle failure, missing/mismatched `PUBLISHING` fence, or inability to prove exclusive no-overwrite behavior SHALL produce `NATIVE_UNAVAILABLE` before accepting/writing domain bytes or `IO_FAILURE` after an already claimed attempt as applicable. It SHALL fail closed and SHALL NOT use path-string existence checks, ordinary rename, overwrite-capable flags, copy-and-delete, or another platform's binary.

#### Scenario: Every supported artifact is release-probed

- **WHEN** release CI builds the four supported platform/architecture targets
- **THEN** each target loads a Node-API ABI 8 addon of the exact target architecture and performs a real create/flush/no-overwrite probe
- **AND** the two macOS targets are assembled and probed from isolated staging roots

#### Scenario: Packaged application loads the native port

- **WHEN** `afterPack` or packaged runtime loads Workspace Publisher
- **THEN** it loads the exact target addon from the emitted unpacked application resources
- **AND** ABI, architecture, root-relative create, existing-target rejection, and real atomic publication probes pass without a source-tree fallback

#### Scenario: Platform primitive is unavailable

- **WHEN** the addon cannot load or the current kernel/filesystem cannot prove the required root-handle-relative exclusive primitive
- **THEN** publication fails closed before a final file appears
- **AND** no path-based check/rename, copy, overwrite, or compatibility implementation runs

#### Scenario: Destination creation races atomic publish

- **WHEN** another actor creates the root-level destination after staging but before the platform atomic call
- **THEN** the platform primitive fails without replacing that destination
- **AND** a same-content destination with another stable identity is reported as conflict rather than success
