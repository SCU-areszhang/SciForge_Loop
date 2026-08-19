import { createHash } from 'node:crypto'
import type { PortableResourceReferenceCarrier } from '@sciforge/collaboration-contracts'
import type {
  DownloadedInput,
  EContentSpacePort,
  MaterializedInput,
  UploadedOutput
} from './ports.js'

export type MockContentSpaceOptions = Readonly<{
  downloadPathFor(reference: PortableResourceReferenceCarrier): string
  uploadResultFor(input: Readonly<{
    name: string
    workspaceRelativePath: string
    idempotencyKey: string
  }>): UploadedOutput
}>

export class MockContentSpacePort implements EContentSpacePort {
  private readonly materialized = new Map<string, PortableResourceReferenceCarrier>()
  private readonly uploads = new Map<string, Readonly<{
    inputHash: string
    output: UploadedOutput
  }>>()

  constructor(private readonly options: MockContentSpaceOptions) {}

  async materialize(reference: PortableResourceReferenceCarrier): Promise<MaterializedInput> {
    const handle = `local:${createHash('sha256').update(JSON.stringify(reference)).digest('hex')}`
    this.materialized.set(handle, structuredClone(reference))
    return { resourceHandle: handle, resourceKind: reference.kind.replace('-reference', '') }
  }

  async agentDownload(input: MaterializedInput): Promise<DownloadedInput> {
    const reference = this.materialized.get(input.resourceHandle)
    if (!reference) throw new Error('Mock E handle is unknown or expired.')
    return { workspaceRelativePath: this.options.downloadPathFor(reference) }
  }

  async agentUploadNew(input: Readonly<{
    outputContainer: MaterializedInput
    name: string
    workspaceRelativePath: string
    idempotencyKey: string
  }>): Promise<UploadedOutput> {
    if (!this.materialized.has(input.outputContainer.resourceHandle)) {
      throw new Error('Mock E output container handle is unknown or expired.')
    }
    const inputHash = createHash('sha256').update(JSON.stringify({
      name: input.name,
      workspaceRelativePath: input.workspaceRelativePath
    })).digest('hex')
    const existing = this.uploads.get(input.idempotencyKey)
    if (existing) {
      if (existing.inputHash !== inputHash) throw new Error('E upload idempotency key was reused with different input.')
      return existing.output
    }
    const output = this.options.uploadResultFor(input)
    this.uploads.set(input.idempotencyKey, { inputHash, output })
    return output
  }
}
