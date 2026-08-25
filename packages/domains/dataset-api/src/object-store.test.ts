import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import {
  createDatasetObjectStoreService,
  createDatasetObjectStoreServiceWithConnector
} from './object-store.js'
import { createDatasetS3Connector } from './main/connectors/dataset-connectors.internal.js'

test('registers an anonymous S3-compatible store in the strict v2 registry', async (context) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'sciforge-object-store-'))
  context.after(() => rm(workspaceRoot, { recursive: true, force: true }))
  const service = createDatasetObjectStoreService({ workspaceRoot })
  const registered = await service.register({
    id: 'public-corpus',
    endpoint: 'https://objects.example.org',
    bucket: 'public-data',
    prefix: '/corpus/releases/'
  })
  assert.deepEqual(registered.source.authentication, { mode: 'anonymous', status: 'ready' })
  assert.equal(registered.source.prefix, 'corpus/releases')
  const registryText = await readFile(
    join(workspaceRoot, '.sciforge', 'datasets', 'object-stores.json'),
    'utf8'
  )
  assert.equal(JSON.parse(registryText).version, 2)
  assert.doesNotMatch(registryText, /credentialEnv|accessKey|secretAccessKey|sessionToken/i)
  const listed = await service.list({})
  assert.deepEqual(listed.stores[0]?.authentication, { mode: 'anonymous', status: 'ready' })
})

test('the production anonymous S3 Connector sends no process credential authority', async (context) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'sciforge-object-anonymous-'))
  context.after(() => rm(workspaceRoot, { recursive: true, force: true }))
  const canary = 'dataset-anonymous-s3-process-canary'
  const previousAccessKey = process.env.AWS_ACCESS_KEY_ID
  const previousSecret = process.env.AWS_SECRET_ACCESS_KEY
  process.env.AWS_ACCESS_KEY_ID = canary
  process.env.AWS_SECRET_ACCESS_KEY = canary
  context.after(() => {
    if (previousAccessKey === undefined) delete process.env.AWS_ACCESS_KEY_ID
    else process.env.AWS_ACCESS_KEY_ID = previousAccessKey
    if (previousSecret === undefined) delete process.env.AWS_SECRET_ACCESS_KEY
    else process.env.AWS_SECRET_ACCESS_KEY = previousSecret
  })
  const server = createServer((request, response) => {
    assert.equal(request.method, 'GET')
    assert.equal(request.headers.authorization, undefined)
    assert.equal(request.headers['x-amz-security-token'], undefined)
    assert.equal(JSON.stringify({ url: request.url, headers: request.headers }).includes(canary), false)
    response.setHeader('content-type', 'application/xml')
    response.end([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
      '<Name>public-data</Name><Prefix></Prefix><KeyCount>1</KeyCount><MaxKeys>10</MaxKeys>',
      '<IsTruncated>false</IsTruncated>',
      '<Contents><Key>release/public.json</Key><Size>17</Size><ETag>"public-etag"</ETag></Contents>',
      '</ListBucketResult>'
    ].join(''))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const service = createDatasetObjectStoreService({ workspaceRoot })
  await service.register({
    id: 'anonymous-store',
    endpoint: `http://127.0.0.1:${address.port}`,
    bucket: 'public-data',
    allowInsecureHttp: true
  })
  const result = await service.listObjects({ sourceId: 'anonymous-store', maxKeys: 10 })
  assert.equal(result.objects[0]?.key, 'release/public.json')
  assert.equal(JSON.stringify(result).includes(canary), false)
})

test('uses the private semantic S3 Connector without exposing credential inputs', async (context) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'sciforge-object-access-'))
  context.after(() => rm(workspaceRoot, { recursive: true, force: true }))
  const canary = 'dataset-s3-env-canary-must-not-cross'
  const previousCanary = process.env.DATASET_S3_CONNECTOR_CANARY
  process.env.DATASET_S3_CONNECTOR_CANARY = canary
  context.after(() => {
    if (previousCanary === undefined) delete process.env.DATASET_S3_CONNECTOR_CANARY
    else process.env.DATASET_S3_CONNECTOR_CANARY = previousCanary
  })
  const commands: Array<{ name: string; input: Record<string, unknown> }> = []
  const payload = Buffer.from('{"gene":"TP53"}\n')
  const connector = createDatasetS3Connector({
    clientFactory: (source) => {
      assert.equal(JSON.stringify(source).includes(canary), false)
      assert.equal('credentials' in source, false)
      return {
        async send(command: any) {
          const name = command.constructor.name
          commands.push({ name, input: command.input })
          if (name === 'ListObjectsV2Command') {
            return {
              $metadata: { httpStatusCode: 200 },
              Contents: [{
                Key: 'en-database-ncbi-gene/release/gene.jsonl',
                Size: payload.byteLength,
                ETag: '"fixture-etag"',
                LastModified: new Date('2026-01-02T03:04:05Z')
              }],
              KeyCount: 1,
              IsTruncated: false
            }
          }
          if (name === 'HeadObjectCommand') {
            return {
              $metadata: { httpStatusCode: 200 },
              ContentLength: payload.byteLength,
              ContentType: 'application/x-ndjson',
              ETag: '"fixture-etag"',
              LastModified: new Date('2026-01-02T03:04:05Z')
            }
          }
          if (name === 'GetObjectCommand') {
            return {
              $metadata: { httpStatusCode: 206 },
              Body: Readable.from([payload]),
              ContentLength: payload.byteLength,
              ContentRange: `bytes 0-${payload.byteLength - 1}/${payload.byteLength}`,
              ContentType: 'application/x-ndjson',
              ETag: '"fixture-etag"'
            }
          }
          throw new Error(`Unexpected command ${name}`)
        }
      }
    }
  })
  const service = createDatasetObjectStoreServiceWithConnector({ workspaceRoot, connector })
  await service.register({
    id: 'public-ncbi',
    endpoint: 'https://objects.example.org',
    bucket: 'public-corpus',
    prefix: 'en-database-ncbi-gene'
  })
  const objects = await service.listObjects({ sourceId: 'public-ncbi', prefix: 'release/', maxKeys: 10 })
  assert.equal(objects.objects[0]?.relativeKey, 'release/gene.jsonl')
  assert.equal(objects.objects[0]?.etag, 'fixture-etag')
  const metadata = await service.metadata({ sourceId: 'public-ncbi', key: 'release/gene.jsonl' })
  assert.equal(metadata.metadata.size, payload.byteLength)
  const downloaded = await service.rawData({
    sourceId: 'public-ncbi',
    key: 'release/gene.jsonl',
    outputFileName: 'public-gene.jsonl',
    expectedFormat: 'json',
    range: { start: 0, end: payload.byteLength - 1 }
  })
  assert.equal(await readFile(downloaded.artifact.path, 'utf8'), payload.toString())
  assert.equal(downloaded.response.rangeSatisfied, true)
  const manifest = JSON.parse(await readFile(downloaded.artifact.manifestPath, 'utf8'))
  assert.equal(JSON.stringify(manifest).includes(canary), false)
  assert.doesNotMatch(JSON.stringify({ commands, objects, metadata, downloaded }), /credential|authorization|cookie/i)
  assert.deepEqual(commands.map((command) => command.name), [
    'ListObjectsV2Command',
    'HeadObjectCommand',
    'GetObjectCommand'
  ])
})

test('fails closed for bound object stores before constructing an S3 client', async (context) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'sciforge-object-bound-'))
  context.after(() => rm(workspaceRoot, { recursive: true, force: true }))
  let clients = 0
  const service = createDatasetObjectStoreServiceWithConnector({
    workspaceRoot,
    connector: createDatasetS3Connector({
      clientFactory: () => {
        clients += 1
        return { send: async () => ({}) }
      }
    })
  })
  await service.register({
    id: 'private-data',
    endpoint: 'https://objects.example.org',
    bucket: 'private-data',
    credentialBindingId: 'binding:dataset:s3:test'
  })
  const listed = await service.list({})
  assert.deepEqual(listed.stores[0]?.authentication, { mode: 'bound', status: 'unavailable' })
  await assert.rejects(
    service.listObjects({ sourceId: 'private-data' }),
    /native secure-store enrollment is not configured/
  )
  assert.equal(clients, 0)
})

test('rejects insecure endpoints, legacy credential fields, and v1 registries', async (context) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'sciforge-object-policy-'))
  context.after(() => rm(workspaceRoot, { recursive: true, force: true }))
  const service = createDatasetObjectStoreService({ workspaceRoot })
  await assert.rejects(service.register({
    id: 'private-data',
    endpoint: 'http://objects.example.org',
    bucket: 'private-data'
  }), /allowInsecureHttp=true/)
  await assert.rejects(service.register({
    id: 'legacy-input',
    endpoint: 'https://objects.example.org',
    bucket: 'private-data',
    credentialEnv: { accessKeyId: 'PRIVATE_ACCESS', secretAccessKey: 'PRIVATE_SECRET' }
  }), /unrecognized key/i)
  await assert.rejects(service.register({
    id: 'userinfo',
    endpoint: 'https://user:password@objects.example.org',
    bucket: 'private-data'
  }), /must not contain credentials/)

  const registryPath = join(workspaceRoot, '.sciforge', 'datasets', 'object-stores.json')
  await mkdir(dirname(registryPath), { recursive: true })
  await writeFile(registryPath, JSON.stringify({
    version: 1,
    sources: [{
      id: 'legacy',
      name: 'Legacy',
      endpoint: 'https://objects.example.org',
      bucket: 'private-data',
      region: 'us-east-1',
      forcePathStyle: true,
      allowInsecureHttp: false,
      credentialEnv: {
        accessKeyId: 'DATASET_ACCESS_CANARY',
        secretAccessKey: 'DATASET_SECRET_CANARY'
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }]
  }))
  await assert.rejects(service.list({}), /Failed to read Dataset object store registry/)
})
