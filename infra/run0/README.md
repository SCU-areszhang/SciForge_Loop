# SciForge isolated Run-0 artifacts

This directory is the reviewable, non-secret delivery source for the isolated
multi-user meeting Run-0. It is intentionally separate from both the local
developer Keycloak stack and the existing A deployment.

The frozen public endpoints are:

- Cloud: `https://cloud-run0.sciforge.cn`
- Identity: `https://login-run0.sciforge.cn`
- OIDC issuer: `https://login-run0.sciforge.cn/realms/SciForge-Run0`

There is no fallback issuer, realm, database, container, credential, edge, or
HTTP origin. An unavailable Run-0 endpoint is a blocking condition.

## Artifact ownership

| Artifact | Exact Compose project | Owned durable state |
| --- | --- | --- |
| `compose.edge.yaml` | `sciforge-run0-edge` | none; TLS material is injected from Run-0-only files |
| `compose.identity.yaml` | `sciforge-run0-identity` | `sciforge-run0-identity-db-data`, identity backup directory |
| `compose.cloud.yaml` | `sciforge-run0-cloud` | `sciforge-run0-cloud-db-data`, Cloud backup directory |

The edge project owns `sciforge-run0-edge-backplane`. Identity and Cloud each
own a different `internal: true` database network and join only the backplane
through their application container. Neither PostgreSQL container joins the
backplane or publishes a host port.

[`run0-manifest.json`](./run0-manifest.json) is the machine-readable source for
all candidate names, origins, CIDRs, secret paths, and backup paths.
[`public-a-forbidden-resources.json`](./public-a-forbidden-resources.json)
contains only non-secret names established by repository facts and the
redacted read-only audit. It deliberately does not guess unknown A database or
role names; the preflight requires an explicit complete inventory for those.

## Secrets and release inputs

No secret value is present in Git. Before any future approved deployment, a
Human operator must create the exact root-only files listed in
`run0-manifest.json`. In particular:

- the Cloud database password and the corresponding libpq `pgpass` file are
  distinct file inputs;
- Keycloak reads its database password and bootstrap administrator values from
  files through `keycloak/run-keycloak-from-secrets.sh`;
- the edge reads a certificate and private key covering both exact Run-0
  hostnames;
- optional provider credentials remain under the Run-0 provider secret
  directory and are referenced by the non-secret provider configuration;
- OpenContent Human credentials are not server secrets and stay in each
  Human's Desktop native secure storage.

`SCIFORGE_RUN0_CLOUD_IMAGE` and `SCIFORGE_RUN0_EDGE_IMAGE` must identify
reviewed immutable images by digest. The Cloud image contract is that its
entrypoint runs `sciforge-collaboration-server`; the `operations` profile adds
the explicit `migrate` command. Neither image variable has a default.

## Safety preflight

The only repository preflight is read-only:

```sh
node scripts/run0-preflight.mjs \
  --inventory /absolute/root-only/run0-read-only-inventory.json
```

It does not run Docker, SSH, HTTP, a database client, a migration, a service
manager, or a file writer. It reads the explicitly supplied inventory, checks
every candidate name and CIDR against both that inventory and the static deny
set, performs DNS resolution for only the two Run-0 hostnames, and writes one
JSON result to stdout. The inventory must attest that every resource category
and TCP listener was captured with read-only operations, be no more than 30
minutes old, be owned by the invoking user, have one hard link, and deny
group/other writes. The checked-in
`read-only-inventory.example.json` has `placeholder: true` and is always
rejected.

For deterministic repository tests only, `--dns-observation` accepts an
`evidenceClass: offline-fixture` document. Even a fully resolved fixture can
produce only `offline_validated`; it cannot claim live DNS or deployment
readiness.

Result precedence is:

1. any name/path/CIDR collision: `unsafe_resource_overlap`;
2. either exact hostname unresolved or resolver unavailable: `awaiting_dns`;
3. any observed TCP 443 listener: `awaiting_ingress`;
4. otherwise: `ready_for_explicit_deploy` for live DNS, or
   `offline_validated` for a fixture.

An `awaiting_*` result exits with status 2, unsafe/invalid input exits with
status 1, and a clean preflight exits with status 0. None of those statuses
authorizes deployment.

## Operation profiles are not defaults

The normal Compose projects do not run migrations or backups implicitly.
`cloud-migrate`, `cloud-backup`, and `identity-backup` exist only in the
explicit `operations` profile. Their commands name only Run-0 databases,
roles, containers, and backup directories. The bind mounts set
`create_host_path: false`, so a misspelled or absent protected directory fails
instead of creating an unexpected host path.

No Compose command has been executed for this change. Starting the edge is
currently unsafe because the read-only audit found the existing A edge on
`0.0.0.0:443`. Do not stop, reload, replace, or edit that edge. A separately
approved ingress design is required before Run-0 can leave
`awaiting_ingress`.

## Offline verification

From the repository root:

```sh
node --test scripts/run0-artifacts.test.mjs scripts/run0-preflight.test.mjs
```

These tests validate the artifacts and preflight behavior only. They do not
prove DNS, TLS, issuer Discovery, JIT User creation, Device/Agent enrollment,
migration, health, backup, restore, or a packaged multi-device meeting.

The current evidence state is therefore:

- OpenSpec 7.3: **blocked** (`awaiting_dns`; TCP 443 also awaits an ingress
  decision);
- OpenSpec 7.4: **not_run** (no stack deployment, migration, health, backup,
  or isolated restore has occurred).

See [the Run-0 status and future handoff](../../docs/run0-isolated-stack.md)
for the evidence boundary and the non-mutation handoff checklist.
