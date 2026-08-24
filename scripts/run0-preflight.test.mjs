import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const scriptPath = new URL('./run0-preflight.mjs', import.meta.url)
const resourceKeys = [
  'composeProjects',
  'containers',
  'networks',
  'networkCidrs',
  'volumes',
  'databases',
  'roles',
  'secretPaths',
  'backupDirectories'
]

function inventory(overrides = {}) {
  return {
    contractVersion: 1,
    captureMode: 'read-only',
    capturedAt: new Date().toISOString(),
    completeResourceCategories: resourceKeys,
    listenersComplete: true,
    resources: Object.fromEntries(resourceKeys.map((key) => [key, []])),
    listeners: [],
    ...overrides
  }
}

function dnsObservation(status = 'resolved') {
  const addressCount = status === 'resolved' ? 1 : 0
  return {
    contractVersion: 1,
    evidenceClass: 'offline-fixture',
    hosts: {
      'cloud-run0.sciforge.cn': { status, addressCount },
      'login-run0.sciforge.cn': { status, addressCount }
    }
  }
}

async function invoke({ inventoryValue, dnsValue }) {
  const directory = await mkdtemp(join(tmpdir(), 'sciforge-run0-preflight-'))
  try {
    const inventoryPath = join(directory, 'inventory.json')
    const dnsPath = join(directory, 'dns.json')
    await Promise.all([
      writeFile(inventoryPath, `${JSON.stringify(inventoryValue)}\n`, { mode: 0o600 }),
      writeFile(dnsPath, `${JSON.stringify(dnsValue)}\n`, { mode: 0o600 })
    ])
    const result = spawnSync(
      process.execPath,
      [scriptPath.pathname, '--inventory', inventoryPath, '--dns-observation', dnsPath],
      { encoding: 'utf8' }
    )
    return { result, output: JSON.parse(result.stdout) }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('NXDOMAIN produces machine-readable awaiting_dns without issuer fallback', async () => {
  const { result, output } = await invoke({
    inventoryValue: inventory(),
    dnsValue: dnsObservation('nxdomain')
  })
  assert.equal(result.status, 2)
  assert.equal(output.status, 'awaiting_dns')
  assert.equal(output.dns.status, 'blocked')
  assert.equal(output.safety.mutationsAttempted, false)
  assert.equal(output.safety.publicDeploymentMutated, false)
  assert.equal(output.safety.fallbackUsed, false)
  assert.equal(output.openspecTasks['7.3'], 'blocked')
  assert.equal(output.openspecTasks['7.4'], 'not_run')
  assert.equal(output.issuer, 'https://login-run0.sciforge.cn/realms/SciForge-Run0')
})

test('an existing TCP 443 owner produces awaiting_ingress after DNS is available', async () => {
  const { result, output } = await invoke({
    inventoryValue: inventory({
      listeners: [{
        protocol: 'tcp',
        address: '0.0.0.0',
        port: 443,
        ownerRef: 'redacted:a-public-edge'
      }]
    }),
    dnsValue: dnsObservation('resolved')
  })
  assert.equal(result.status, 2)
  assert.equal(output.status, 'awaiting_ingress')
  assert.equal(output.ingress.status, 'blocked')
  assert.equal(output.ingress.conflictCount, 1)
  assert.equal(output.openspecTasks['7.3'], 'blocked')
  assert.equal(output.openspecTasks['7.4'], 'not_run')
})

test('offline fixtures can validate isolation but cannot claim live deployment readiness', async () => {
  const { result, output } = await invoke({
    inventoryValue: inventory(),
    dnsValue: dnsObservation('resolved')
  })
  assert.equal(result.status, 0)
  assert.equal(output.status, 'offline_validated')
  assert.equal(output.isolation.status, 'passed')
  assert.equal(output.dns.source, 'offline-fixture')
  assert.equal(output.openspecTasks['7.3'], 'not_run')
  assert.equal(output.openspecTasks['7.4'], 'not_run')
})

test('any observed candidate resource name fails isolation before deployment', async () => {
  const collidingResources = Object.fromEntries(resourceKeys.map((key) => [key, []]))
  collidingResources.composeProjects = ['sciforge-run0-cloud']
  const { result, output } = await invoke({
    inventoryValue: inventory({ resources: collidingResources }),
    dnsValue: dnsObservation('resolved')
  })
  assert.equal(result.status, 1)
  assert.equal(output.status, 'unsafe_resource_overlap')
  assert.equal(output.isolation.status, 'failed')
  assert.deepEqual(output.isolation.collisions, [{
    category: 'composeProjects',
    candidate: 'sciforge-run0-cloud'
  }, {
    category: 'containers',
    candidate: 'sciforge-run0-cloud'
  }])
  assert.equal(output.openspecTasks['7.4'], 'not_run')
})

test('an overlapping observed network CIDR fails isolation', async () => {
  const overlappingResources = Object.fromEntries(resourceKeys.map((key) => [key, []]))
  overlappingResources.networkCidrs = ['172.29.48.4/30']
  const { result, output } = await invoke({
    inventoryValue: inventory({ resources: overlappingResources }),
    dnsValue: dnsObservation('resolved')
  })
  assert.equal(result.status, 1)
  assert.equal(output.status, 'unsafe_resource_overlap')
  assert.deepEqual(output.isolation.collisions, [{
    category: 'networkCidrs',
    candidate: '172.29.48.0/29'
  }])
})

test('a stale inventory is rejected instead of authorizing mutation from old facts', async () => {
  const { result, output } = await invoke({
    inventoryValue: inventory({ capturedAt: '2000-01-01T00:00:00Z' }),
    dnsValue: dnsObservation('resolved')
  })
  assert.equal(result.status, 1)
  assert.equal(output.status, 'invalid_preflight_input')
  assert.equal(output.code, 'inventory_capture_is_stale')
  assert.equal(output.openspecTasks['7.4'], 'not_run')
})

test('the repository example cannot be mistaken for an observed inventory', () => {
  const result = spawnSync(
    process.execPath,
    [
      scriptPath.pathname,
      '--inventory',
      new URL('../infra/run0/read-only-inventory.example.json', import.meta.url).pathname
    ],
    { encoding: 'utf8' }
  )
  const output = JSON.parse(result.stdout)
  assert.equal(result.status, 1)
  assert.equal(output.status, 'invalid_preflight_input')
  assert.equal(output.code, 'inventory_placeholder_rejected')
  assert.equal(output.openspecTasks['7.3'], 'blocked')
  assert.equal(output.openspecTasks['7.4'], 'not_run')
})

test('preflight refuses to run without an explicit inventory path', () => {
  const result = spawnSync(process.execPath, [scriptPath.pathname], { encoding: 'utf8' })
  const output = JSON.parse(result.stdout)
  assert.equal(result.status, 1)
  assert.equal(output.code, 'explicit_inventory_required')
  assert.equal(output.safety.mutationsAttempted, false)
})
