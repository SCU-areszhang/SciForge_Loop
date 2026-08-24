#!/usr/bin/env node

import { resolve4, resolve6 } from 'node:dns/promises'
import { lstat, readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const contractVersion = 1
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const manifestPath = fileURLToPath(new URL('../infra/run0/run0-manifest.json', import.meta.url))
const forbiddenPath = fileURLToPath(
  new URL('../infra/run0/public-a-forbidden-resources.json', import.meta.url)
)
const resourceKeys = Object.freeze([
  'composeProjects',
  'containers',
  'networks',
  'networkCidrs',
  'volumes',
  'databases',
  'roles',
  'secretPaths',
  'backupDirectories'
])
const pathResourceKeys = new Set(['secretPaths', 'backupDirectories'])
const allowedTopLevelInventoryKeys = new Set([
  'contractVersion',
  'captureMode',
  'placeholder',
  'capturedAt',
  'completeResourceCategories',
  'listenersComplete',
  'resources',
  'listeners'
])
const allowedListenerKeys = new Set(['protocol', 'address', 'port', 'ownerRef'])

class PreflightInputError extends Error {
  constructor(code) {
    super(code)
    this.name = 'PreflightInputError'
    this.code = code
  }
}

function parseArguments(argv) {
  const parsed = { inventory: undefined, dnsObservation: undefined, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help') {
      parsed.help = true
      continue
    }
    if (argument === '--inventory' || argument === '--dns-observation') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new PreflightInputError(`${argument.slice(2).replaceAll('-', '_')}_path_required`)
      }
      parsed[argument === '--inventory' ? 'inventory' : 'dnsObservation'] = value
      index += 1
      continue
    }
    throw new PreflightInputError('unknown_argument')
  }
  return parsed
}

function assertExactKeys(value, allowedKeys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PreflightInputError(code)
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new PreflightInputError(code)
    }
  }
}

function assertBoundedString(value, code, maximumLength = 512) {
  const containsControlCharacter = typeof value === 'string' && Array.from(
    value,
    (character) => character.codePointAt(0)
  ).some((codePoint) => codePoint <= 31 || codePoint === 127)
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength ||
    containsControlCharacter
  ) {
    throw new PreflightInputError(code)
  }
}

async function readSecureJson(absolutePath, label, { requireCurrentOwner = false } = {}) {
  if (!isAbsolute(absolutePath)) {
    throw new PreflightInputError(`${label}_path_must_be_absolute`)
  }
  const metadata = await lstat(absolutePath).catch(() => undefined)
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink()) {
    throw new PreflightInputError(`${label}_must_be_regular_file`)
  }
  if ((metadata.mode & 0o022) !== 0) {
    throw new PreflightInputError(`${label}_must_not_be_group_or_other_writable`)
  }
  if (
    requireCurrentOwner &&
    typeof process.getuid === 'function' &&
    metadata.uid !== process.getuid()
  ) {
    throw new PreflightInputError(`${label}_must_be_owned_by_current_user`)
  }
  if (requireCurrentOwner && metadata.nlink !== 1) {
    throw new PreflightInputError(`${label}_must_have_one_hard_link`)
  }
  if (metadata.size > 128 * 1024) {
    throw new PreflightInputError(`${label}_too_large`)
  }
  const source = await readFile(absolutePath, 'utf8')
  try {
    return JSON.parse(source)
  } catch {
    throw new PreflightInputError(`${label}_invalid_json`)
  }
}

function validateResourceObject(resources, label) {
  assertExactKeys(resources, new Set(resourceKeys), `${label}_resources_invalid`)
  for (const key of resourceKeys) {
    const values = resources[key]
    if (!Array.isArray(values) || values.length > 10_000) {
      throw new PreflightInputError(`${label}_${key}_invalid`)
    }
    for (const value of values) {
      assertBoundedString(value, `${label}_${key}_invalid`)
      if (pathResourceKeys.has(key) && !isAbsolute(value)) {
        throw new PreflightInputError(`${label}_${key}_must_be_absolute`)
      }
    }
    if (new Set(values).size !== values.length) {
      throw new PreflightInputError(`${label}_${key}_duplicates`)
    }
  }
}

function validateInventory(inventory) {
  assertExactKeys(inventory, allowedTopLevelInventoryKeys, 'inventory_shape_invalid')
  if (inventory.contractVersion !== contractVersion) {
    throw new PreflightInputError('inventory_contract_version_invalid')
  }
  if (inventory.captureMode !== 'read-only') {
    throw new PreflightInputError('inventory_capture_mode_must_be_read_only')
  }
  if (inventory.placeholder === true) {
    throw new PreflightInputError('inventory_placeholder_rejected')
  }
  assertBoundedString(inventory.capturedAt, 'inventory_captured_at_invalid', 64)
  const capturedAt = Date.parse(inventory.capturedAt)
  if (Number.isNaN(capturedAt)) {
    throw new PreflightInputError('inventory_captured_at_invalid')
  }
  const inventoryAgeMilliseconds = Date.now() - capturedAt
  if (inventoryAgeMilliseconds < -5 * 60_000 || inventoryAgeMilliseconds > 30 * 60_000) {
    throw new PreflightInputError('inventory_capture_is_stale')
  }
  if (
    !Array.isArray(inventory.completeResourceCategories) ||
    inventory.completeResourceCategories.length !== resourceKeys.length ||
    resourceKeys.some((key) => !inventory.completeResourceCategories.includes(key)) ||
    new Set(inventory.completeResourceCategories).size !== resourceKeys.length
  ) {
    throw new PreflightInputError('inventory_resource_categories_incomplete')
  }
  if (inventory.listenersComplete !== true) {
    throw new PreflightInputError('inventory_listeners_incomplete')
  }
  validateResourceObject(inventory.resources, 'inventory')
  if (!Array.isArray(inventory.listeners) || inventory.listeners.length > 1024) {
    throw new PreflightInputError('inventory_listeners_invalid')
  }
  for (const listener of inventory.listeners) {
    assertExactKeys(listener, allowedListenerKeys, 'inventory_listener_invalid')
    if (listener.protocol !== 'tcp') {
      throw new PreflightInputError('inventory_listener_protocol_invalid')
    }
    assertBoundedString(listener.address, 'inventory_listener_address_invalid', 128)
    if (!Number.isInteger(listener.port) || listener.port < 1 || listener.port > 65_535) {
      throw new PreflightInputError('inventory_listener_port_invalid')
    }
    assertBoundedString(listener.ownerRef, 'inventory_listener_owner_ref_invalid', 256)
  }
}

function parseIpv4Cidr(value, code) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d|[12]\d|3[0-2])$/u.exec(value)
  if (!match) {
    throw new PreflightInputError(code)
  }
  const octets = match.slice(1, 5).map(Number)
  if (octets.some((octet) => octet > 255)) {
    throw new PreflightInputError(code)
  }
  const prefix = Number(match[5])
  const address = octets.reduce((result, octet) => (result << 8n) + BigInt(octet), 0n)
  const hostBits = 32n - BigInt(prefix)
  const size = 1n << hostBits
  const start = (address / size) * size
  return { start, end: start + size - 1n }
}

function cidrsOverlap(left, right) {
  return left.start <= right.end && right.start <= left.end
}

function pathsOverlap(left, right) {
  const normalizedLeft = resolve(left)
  const normalizedRight = resolve(right)
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}${sep}`) ||
    normalizedRight.startsWith(`${normalizedLeft}${sep}`)
  )
}

function findResourceCollisions(candidate, observed, forbidden) {
  const collisions = []
  const nameKeys = resourceKeys.filter((key) => key !== 'networkCidrs' && !pathResourceKeys.has(key))
  const deniedNames = new Set(nameKeys.flatMap((key) => [...observed[key], ...forbidden[key]]))
  for (const key of resourceKeys) {
    if (key === 'networkCidrs') {
      continue
    }
    if (pathResourceKeys.has(key)) {
      for (const candidatePath of candidate[key]) {
        for (const observedPath of [...observed[key], ...forbidden[key]]) {
          if (pathsOverlap(candidatePath, observedPath)) {
            collisions.push({ category: key, candidate: candidatePath })
          }
        }
      }
      continue
    }
    for (const candidateName of candidate[key]) {
      if (deniedNames.has(candidateName)) {
        collisions.push({ category: key, candidate: candidateName })
      }
    }
  }

  const observedCidrs = [...observed.networkCidrs, ...forbidden.networkCidrs].map((cidr) => ({
    source: cidr,
    range: parseIpv4Cidr(cidr, 'observed_network_cidr_invalid')
  }))
  for (const candidateCidr of candidate.networkCidrs) {
    const candidateRange = parseIpv4Cidr(candidateCidr, 'candidate_network_cidr_invalid')
    if (observedCidrs.some(({ range }) => cidrsOverlap(candidateRange, range))) {
      collisions.push({ category: 'networkCidrs', candidate: candidateCidr })
    }
  }
  return collisions
}

async function validateRepositoryArtifacts(manifest, forbidden) {
  if (
    manifest.contractVersion !== contractVersion ||
    manifest.environment !== 'run0' ||
    manifest.mutationPolicy !== 'explicit-only' ||
    manifest.cloudOrigin !== 'https://cloud-run0.sciforge.cn' ||
    manifest.oidc?.issuer !== 'https://login-run0.sciforge.cn/realms/SciForge-Run0' ||
    manifest.oidc?.realm !== 'SciForge-Run0' ||
    manifest.oidc?.audience !== 'sciforge-cloud-api' ||
    manifest.oidc?.pkceMethod !== 'S256'
  ) {
    throw new PreflightInputError('run0_manifest_contract_invalid')
  }
  validateResourceObject(manifest.resources, 'candidate')
  validateResourceObject(forbidden.resources, 'forbidden')
  for (const key of resourceKeys) {
    if (key === 'networkCidrs' || pathResourceKeys.has(key)) {
      continue
    }
    if (manifest.resources[key].some((name) => !/(?:^|[-_])run0(?:[-_]|$)/u.test(name))) {
      throw new PreflightInputError('candidate_resource_missing_run0_namespace')
    }
  }

  if (!Array.isArray(manifest.composeFiles) || manifest.composeFiles.length !== 3) {
    throw new PreflightInputError('run0_compose_file_set_invalid')
  }
  const artifactSources = []
  for (const repositoryPath of [
    ...manifest.composeFiles,
    'infra/run0/edge/Caddyfile',
    'infra/run0/keycloak/realm-sciforge-run0.json'
  ]) {
    const absolutePath = resolve(repositoryRoot, repositoryPath)
    const repositoryRelative = relative(repositoryRoot, absolutePath)
    if (repositoryRelative.startsWith('..') || isAbsolute(repositoryRelative)) {
      throw new PreflightInputError('run0_artifact_path_escape')
    }
    artifactSources.push(await readFile(absolutePath, 'utf8'))
  }
  const joinedArtifacts = artifactSources.join('\n')
  for (const forbiddenOrigin of forbidden.forbiddenOrigins) {
    if (joinedArtifacts.includes(forbiddenOrigin)) {
      throw new PreflightInputError('forbidden_origin_present_in_run0_artifacts')
    }
  }
  if (
    joinedArtifacts.includes('OIDC_ISSUER:-') ||
    joinedArtifacts.includes('OIDC_ISSUER-') ||
    joinedArtifacts.includes('login-test.sciforge.cn')
  ) {
    throw new PreflightInputError('oidc_issuer_fallback_present')
  }
}

function validateDnsObservation(observation, hostnames) {
  const allowedKeys = new Set(['contractVersion', 'evidenceClass', 'hosts'])
  assertExactKeys(observation, allowedKeys, 'dns_observation_shape_invalid')
  if (
    observation.contractVersion !== contractVersion ||
    observation.evidenceClass !== 'offline-fixture' ||
    !observation.hosts ||
    typeof observation.hosts !== 'object' ||
    Array.isArray(observation.hosts)
  ) {
    throw new PreflightInputError('dns_observation_invalid')
  }
  if (
    Object.keys(observation.hosts).length !== hostnames.length ||
    hostnames.some((hostname) => !Object.hasOwn(observation.hosts, hostname))
  ) {
    throw new PreflightInputError('dns_observation_hosts_invalid')
  }
  return hostnames.map((hostname) => {
    const value = observation.hosts[hostname]
    assertExactKeys(value, new Set(['status', 'addressCount']), 'dns_observation_host_invalid')
    if (!['resolved', 'nxdomain', 'error'].includes(value.status)) {
      throw new PreflightInputError('dns_observation_status_invalid')
    }
    if (!Number.isInteger(value.addressCount) || value.addressCount < 0 || value.addressCount > 64) {
      throw new PreflightInputError('dns_observation_address_count_invalid')
    }
    if ((value.status === 'resolved') !== (value.addressCount > 0)) {
      throw new PreflightInputError('dns_observation_resolution_invalid')
    }
    return { hostname, status: value.status, addressCount: value.addressCount }
  })
}

async function resolveHostname(hostname) {
  const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname)])
  const addresses = results.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
  if (addresses.length > 0) {
    return { hostname, status: 'resolved', addressCount: addresses.length }
  }
  const failureCodes = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason?.code)
  const expectedAbsence = failureCodes.every((code) => code === 'ENOTFOUND' || code === 'ENODATA')
  return { hostname, status: expectedAbsence ? 'nxdomain' : 'error', addressCount: 0 }
}

function machineResult({
  status,
  inventory,
  dnsSource,
  dnsResults,
  resourceCollisions,
  ingressConflicts,
  isolationStatus
}) {
  const environmentBlocked = status === 'awaiting_dns' || status === 'awaiting_ingress'
  return {
    contractVersion,
    status,
    environment: 'run0',
    cloudOrigin: 'https://cloud-run0.sciforge.cn',
    issuer: 'https://login-run0.sciforge.cn/realms/SciForge-Run0',
    safety: {
      captureMode: inventory.captureMode,
      mutationsAttempted: false,
      publicDeploymentMutated: false,
      fallbackUsed: false,
      explicitInventoryVerified: true
    },
    isolation: {
      status: isolationStatus,
      collisionCount: resourceCollisions.length,
      collisions: resourceCollisions
    },
    dns: {
      source: dnsSource,
      status: dnsResults.every((result) => result.status === 'resolved') ? 'resolved' : 'blocked',
      hosts: dnsResults
    },
    ingress: {
      status: ingressConflicts.length === 0 ? 'available' : 'blocked',
      publishedPort: 443,
      conflictCount: ingressConflicts.length
    },
    openspecTasks: {
      '7.1': 'artifacts_ready_for_review',
      '7.2': isolationStatus === 'passed' ? 'preflight_passed' : 'blocked',
      '7.3': environmentBlocked ? 'blocked' : 'not_run',
      '7.4': 'not_run'
    }
  }
}

async function run(argv) {
  const arguments_ = parseArguments(argv)
  if (arguments_.help) {
    process.stdout.write(
      'Usage: node scripts/run0-preflight.mjs --inventory /absolute/read-only-inventory.json [--dns-observation /absolute/offline-fixture.json]\n'
    )
    return 0
  }
  if (!arguments_.inventory) {
    throw new PreflightInputError('explicit_inventory_required')
  }

  const [manifest, forbidden, inventory] = await Promise.all([
    readSecureJson(manifestPath, 'manifest'),
    readSecureJson(forbiddenPath, 'forbidden_resources'),
    readSecureJson(arguments_.inventory, 'inventory', { requireCurrentOwner: true })
  ])
  validateInventory(inventory)
  await validateRepositoryArtifacts(manifest, forbidden)

  const resourceCollisions = findResourceCollisions(
    manifest.resources,
    inventory.resources,
    forbidden.resources
  )
  const hostnames = manifest.ingress.hostnames
  let dnsSource = 'live-read-only-resolver'
  let dnsResults
  if (arguments_.dnsObservation) {
    dnsSource = 'offline-fixture'
    const observation = await readSecureJson(arguments_.dnsObservation, 'dns_observation', {
      requireCurrentOwner: true
    })
    dnsResults = validateDnsObservation(observation, hostnames)
  } else {
    dnsResults = await Promise.all(hostnames.map(resolveHostname))
  }

  const ingressConflicts = inventory.listeners.filter((listener) => (
    listener.protocol === 'tcp' && listener.port === manifest.ingress.publishedPort
  ))

  let status
  let isolationStatus
  let exitCode
  if (resourceCollisions.length > 0) {
    status = 'unsafe_resource_overlap'
    isolationStatus = 'failed'
    exitCode = 1
  } else if (dnsResults.some((result) => result.status !== 'resolved')) {
    status = 'awaiting_dns'
    isolationStatus = 'passed'
    exitCode = 2
  } else if (ingressConflicts.length > 0) {
    status = 'awaiting_ingress'
    isolationStatus = 'passed'
    exitCode = 2
  } else if (dnsSource === 'offline-fixture') {
    status = 'offline_validated'
    isolationStatus = 'passed'
    exitCode = 0
  } else {
    status = 'ready_for_explicit_deploy'
    isolationStatus = 'passed'
    exitCode = 0
  }

  process.stdout.write(`${JSON.stringify(machineResult({
    status,
    inventory,
    dnsSource,
    dnsResults,
    resourceCollisions,
    ingressConflicts,
    isolationStatus
  }), null, 2)}\n`)
  return exitCode
}

try {
  process.exitCode = await run(process.argv.slice(2))
} catch (error) {
  const code = error instanceof PreflightInputError ? error.code : 'preflight_internal_error'
  process.stdout.write(`${JSON.stringify({
    contractVersion,
    status: 'invalid_preflight_input',
    code,
    safety: {
      mutationsAttempted: false,
      publicDeploymentMutated: false,
      fallbackUsed: false
    },
    openspecTasks: {
      '7.3': 'blocked',
      '7.4': 'not_run'
    }
  }, null, 2)}\n`)
  process.exitCode = 1
}
