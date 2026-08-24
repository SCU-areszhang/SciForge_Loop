import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const manifestUrl = new URL('../infra/run0/run0-manifest.json', import.meta.url)
const forbiddenUrl = new URL('../infra/run0/public-a-forbidden-resources.json', import.meta.url)
const cloudComposeUrl = new URL('../infra/run0/compose.cloud.yaml', import.meta.url)
const identityComposeUrl = new URL('../infra/run0/compose.identity.yaml', import.meta.url)
const edgeComposeUrl = new URL('../infra/run0/compose.edge.yaml', import.meta.url)
const caddyUrl = new URL('../infra/run0/edge/Caddyfile', import.meta.url)
const realmUrl = new URL('../infra/run0/keycloak/realm-sciforge-run0.json', import.meta.url)
const keycloakEntrypointUrl = new URL(
  '../infra/run0/keycloak/run-keycloak-from-secrets.sh',
  import.meta.url
)
const preflightUrl = new URL('./run0-preflight.mjs', import.meta.url)

async function json(url) {
  return JSON.parse(await readFile(url, 'utf8'))
}

test('Run-0 manifest freezes exact origins and an independent resource namespace', async () => {
  const [manifest, forbidden] = await Promise.all([json(manifestUrl), json(forbiddenUrl)])
  assert.equal(manifest.environment, 'run0')
  assert.equal(manifest.mutationPolicy, 'explicit-only')
  assert.equal(manifest.cloudOrigin, 'https://cloud-run0.sciforge.cn')
  assert.deepEqual(manifest.oidc, {
    issuer: 'https://login-run0.sciforge.cn/realms/SciForge-Run0',
    realm: 'SciForge-Run0',
    audience: 'sciforge-cloud-api',
    desktopClientId: 'sciforge-desktop',
    desktopRedirectUri: 'http://127.0.0.1:43110/oidc/callback',
    pkceMethod: 'S256'
  })

  const nameKeys = ['composeProjects', 'containers', 'networks', 'volumes', 'databases', 'roles']
  const candidateNames = new Set(nameKeys.flatMap((key) => manifest.resources[key]))
  const forbiddenNames = new Set(nameKeys.flatMap((key) => forbidden.resources[key]))
  for (const candidate of candidateNames) {
    assert.match(candidate, /(?:^|[-_])run0(?:[-_]|$)/u)
    assert.equal(forbiddenNames.has(candidate), false)
  }
  assert.deepEqual(manifest.resources.networkCidrs, [
    '172.29.48.0/29',
    '172.29.49.0/29',
    '172.29.50.0/29'
  ])
  assert.ok(manifest.resources.secretPaths.every((path) => path.startsWith('/etc/sciforge-run0/')))
  assert.ok(
    manifest.resources.backupDirectories.every(
      (path) => path.startsWith('/var/backups/sciforge-run0/')
    )
  )
})

test('three Compose projects isolate edge, Identity, Cloud, databases, and operation profiles', async () => {
  const [cloud, identity, edge] = await Promise.all([
    readFile(cloudComposeUrl, 'utf8'),
    readFile(identityComposeUrl, 'utf8'),
    readFile(edgeComposeUrl, 'utf8')
  ])
  assert.match(edge, /^name: sciforge-run0-edge$/mu)
  assert.match(identity, /^name: sciforge-run0-identity$/mu)
  assert.match(cloud, /^name: sciforge-run0-cloud$/mu)

  assert.match(edge, /0\.0\.0\.0:443:443/u)
  assert.match(edge, /name: sciforge-run0-edge-backplane/u)
  assert.match(identity, /name: sciforge-run0-identity-internal/u)
  assert.match(cloud, /name: sciforge-run0-cloud-internal/u)
  assert.match(identity, /name: sciforge-run0-identity-db-data/u)
  assert.match(cloud, /name: sciforge-run0-cloud-db-data/u)
  assert.match(identity, /POSTGRES_DB: sciforge_run0_identity/u)
  assert.match(identity, /POSTGRES_USER: sciforge_run0_identity/u)
  assert.match(cloud, /POSTGRES_DB: sciforge_run0_collaboration/u)
  assert.match(cloud, /POSTGRES_USER: sciforge_run0_cloud/u)
  assert.match(identity, /profiles: \["operations"\]/u)
  assert.match(cloud, /profiles: \["operations"\]/u)

  assert.doesNotMatch(identity, /(?:^|\s)-\s*["']?(?:0\.0\.0\.0:)?(?:5432|8080|9000):/mu)
  assert.doesNotMatch(cloud, /(?:^|\s)-\s*["']?(?:0\.0\.0\.0:)?(?:5432|8787):/mu)
  assert.doesNotMatch(`${cloud}\n${identity}\n${edge}`, /sciforge-keycloak|sciforge-collaboration-private/u)
})

test('Cloud and Keycloak pin the Run-0 issuer without an old-issuer fallback', async () => {
  const [cloud, identity, caddy, realm] = await Promise.all([
    readFile(cloudComposeUrl, 'utf8'),
    readFile(identityComposeUrl, 'utf8'),
    readFile(caddyUrl, 'utf8'),
    json(realmUrl)
  ])
  const sources = `${cloud}\n${identity}\n${caddy}\n${JSON.stringify(realm)}`
  assert.match(
    cloud,
    /SCIFORGE_COLLABORATION_OIDC_ISSUER: https:\/\/login-run0\.sciforge\.cn\/realms\/SciForge-Run0/u
  )
  assert.match(identity, /KC_HOSTNAME: https:\/\/login-run0\.sciforge\.cn/u)
  assert.match(caddy, /^cloud-run0\.sciforge\.cn \{$/mu)
  assert.match(caddy, /^login-run0\.sciforge\.cn \{$/mu)
  assert.doesNotMatch(sources, /login-test\.sciforge\.cn|cloud-test\.sciforge\.cn/u)
  assert.doesNotMatch(cloud, /OIDC_ISSUER(?::-|-)\$?\{/u)
})

test('Run-0 Realm enables self-registration and only S256 authorization-code Desktop login', async () => {
  const realm = await json(realmUrl)
  assert.equal(realm.realm, 'SciForge-Run0')
  assert.equal(realm.registrationAllowed, true)
  assert.equal(realm.verifyEmail, false)
  assert.equal(Object.hasOwn(realm, 'users'), false)

  const desktop = realm.clients.find((client) => client.clientId === 'sciforge-desktop')
  assert.ok(desktop)
  assert.equal(desktop.publicClient, true)
  assert.equal(desktop.standardFlowEnabled, true)
  assert.equal(desktop.implicitFlowEnabled, false)
  assert.equal(desktop.directAccessGrantsEnabled, false)
  assert.equal(desktop.serviceAccountsEnabled, false)
  assert.equal(desktop.attributes['pkce.code.challenge.method'], 'S256')
  assert.deepEqual(desktop.redirectUris, ['http://127.0.0.1:43110/oidc/callback'])
  assert.ok(desktop.protocolMappers.some((mapper) => (
    mapper.protocolMapper === 'oidc-audience-mapper' &&
    mapper.config['included.client.audience'] === 'sciforge-cloud-api' &&
    mapper.config['access.token.claim'] === 'true'
  )))

  const api = realm.clients.find((client) => client.clientId === 'sciforge-cloud-api')
  assert.ok(api)
  assert.equal(api.bearerOnly, true)
  assert.equal(api.standardFlowEnabled, false)
  assert.doesNotMatch(
    JSON.stringify(realm),
    /"(?:clientSecret|secret|password|apiKey|privateKey)"\s*:/iu
  )
})

test('secrets are file references and the offline preflight has no mutation transport', async () => {
  const [cloud, identity, edge, entrypoint, preflight] = await Promise.all([
    readFile(cloudComposeUrl, 'utf8'),
    readFile(identityComposeUrl, 'utf8'),
    readFile(edgeComposeUrl, 'utf8'),
    readFile(keycloakEntrypointUrl, 'utf8'),
    readFile(preflightUrl, 'utf8')
  ])
  assert.match(cloud, /SCIFORGE_RUN0_CLOUD_DB_PASSWORD_FILE/u)
  assert.match(cloud, /SCIFORGE_RUN0_CLOUD_DB_PGPASS_FILE/u)
  assert.match(identity, /SCIFORGE_RUN0_IDENTITY_DB_PASSWORD_FILE/u)
  assert.match(identity, /SCIFORGE_RUN0_IDENTITY_BOOTSTRAP_ADMIN_PASSWORD_FILE/u)
  assert.match(edge, /SCIFORGE_RUN0_EDGE_TLS_PRIVATE_KEY_FILE/u)
  assert.match(entrypoint, /read_secret KC_DB_PASSWORD/u)
  assert.doesNotMatch(entrypoint, /printf[^\n]*(?:KC_DB_PASSWORD|KC_BOOTSTRAP_ADMIN_PASSWORD)/u)
  assert.doesNotMatch(preflight, /node:(?:child_process|http|https|net)|\b(?:execFile|spawn|writeFile|mkdir|rm)\s*\(/u)
  assert.doesNotMatch(
    `${cloud}\n${identity}\n${edge}`,
    /^\s+(?:POSTGRES_PASSWORD|KC_DB_PASSWORD|KC_BOOTSTRAP_ADMIN_PASSWORD|PGPASSWORD):/mu
  )
})
