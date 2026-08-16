import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { DomainMainHost, DomainRendererHost } from '@sciforge/domain-sdk/host'
import { createDomainMainEntry } from './main/index.js'
import { createDomainRendererEntry } from './renderer/index.js'
import { domainPackageDefinition } from './definition.js'

describe('Content Space package installation', () => {
  it('declares only trusted compile-time definition/main/renderer entrypoints', () => {
    expect(domainPackageDefinition.kind).toBe('trusted-compile-time')
    expect(domainPackageDefinition.entrypoints.map(({ process }) => process)).toEqual([
      'main',
      'renderer'
    ])
    expect(domainPackageDefinition.entrypoints.some(({ process }) =>
      process === 'workspace-server'
    )).toBe(false)
    expect(domainPackageDefinition.packaging).toEqual({
      bundled: true,
      runtime: { requiredPaths: ['src'], dependencies: [] }
    })
  })

  it('constructs process entries without activating capabilities or renderer work', () => {
    const defineCapability = vi.fn(() => {
      throw new Error('capabilities must stay lazy during package composition')
    })
    const mainHost = {
      getUserDataDir: () => '/private/tmp/sciforge-content-space-test',
      defineCapability,
      mainContributions: { list: () => [] },
      providerInstances: { list: () => [], resolve: () => undefined }
    } satisfies DomainMainHost
    const invoke = vi.fn(async () => {
      throw new Error('renderer must not invoke during package composition')
    })
    const rendererHost = {
      capabilityInvoker: {
        observe: vi.fn(async () => {
          throw new Error('renderer must not observe during package composition')
        }),
        invoke
      },
      openExternal: vi.fn()
    } satisfies DomainRendererHost

    const mainEntry = createDomainMainEntry(mainHost)
    const rendererEntry = createDomainRendererEntry(rendererHost)

    expect(mainEntry.contributions).toHaveLength(5)
    expect(rendererEntry.contributions).toHaveLength(3)
    expect(defineCapability).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('contains no sidecar, workspace server, or dynamic plugin path', () => {
    const packageRoot = resolve(import.meta.dirname, '..')
    const sources = [
      'sciforge.domain.json',
      'src/definition.ts',
      'src/main/index.ts',
      'src/renderer/index.tsx'
    ].map((path) => readFileSync(resolve(packageRoot, path), 'utf8')).join('\n')

    expect(sources).not.toMatch(/workspace-server|sidecar|createRequire|import\s*\([^)]*package/u)
  })
})
