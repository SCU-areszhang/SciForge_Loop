import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { DomainRendererFileTransferHost } from '@sciforge/domain-sdk/file-transfer'
import type {
  ArtifactReference,
  ContentContainerReference,
  ContentSpaceCapabilityState,
  ContentSpaceContainerSummary,
  ContentSpaceEntrySummary
} from '../contract.js'
import { issueArtifactReference } from '../contract.js'
import type { ContentSpaceCapabilityClient } from './capability-client.js'

const PAGE_SIZE = 50
const MAX_NAVIGATION_DEPTH = 32

export type ContentSpacePanelProps = Readonly<{
  active: boolean
  client: ContentSpaceCapabilityClient
  fileTransfers?: DomainRendererFileTransferHost
  className?: string
  onCollapse?: () => void
}>

type ProviderInstanceItem = Readonly<{ providerInstanceRef: string; label: string }>

export function ContentSpacePanel({
  active,
  client,
  fileTransfers,
  className,
  onCollapse
}: ContentSpacePanelProps): ReactElement {
  const [instances, setInstances] = useState<readonly ProviderInstanceItem[]>([])
  const [providerInstanceRef, setProviderInstanceRef] = useState('')
  const [containers, setContainers] = useState<readonly ContentSpaceContainerSummary[]>([])
  const [parent, setParent] = useState<ContentContainerReference | null>(null)
  const [history, setHistory] = useState<readonly ContentContainerReference[]>([])
  const [entries, setEntries] = useState<readonly ContentSpaceEntrySummary[]>([])
  const [capabilities, setCapabilities] = useState<readonly ContentSpaceCapabilityState[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<Extract<ContentSpaceEntrySummary, {
    kind: 'file'
  }> | null>(null)
  const [fixedReference, setFixedReference] = useState<ArtifactReference | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    let current = true
    setLoading(true)
    setError(null)
    void client.listProviderInstances().then((result) => {
      if (current) setInstances(result.items)
    }).catch((cause) => {
      if (current) setError(boundedError(cause))
    }).finally(() => {
      if (current) setLoading(false)
    })
    return () => { current = false }
  }, [active, client])

  const loadEntries = useCallback(async (
    target: ContentContainerReference,
    cursor?: string,
    append = false
  ) => {
    setLoading(true)
    setError(null)
    try {
      const page = await client.listEntries(target, { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) })
      setEntries((existing) => append ? [...existing, ...page.items] : page.items)
      setNextCursor(page.nextCursor)
    } catch (cause) {
      setError(boundedError(cause))
    } finally {
      setLoading(false)
    }
  }, [client])

  const selectProvider = async (selected: string) => {
    setProviderInstanceRef(selected)
    setContainers([])
    setParent(null)
    setHistory([])
    setEntries([])
    setCapabilities([])
    setNextCursor(undefined)
    setSelectedFile(null)
    setFixedReference(null)
    setError(null)
    if (!selected) return
    setLoading(true)
    try {
      const [readiness, containerPage] = await Promise.all([
        client.describeCapabilities(selected),
        client.listContainers(selected, { limit: PAGE_SIZE })
      ])
      setCapabilities(readiness.items)
      setContainers(containerPage.items)
    } catch (cause) {
      setError(boundedError(cause))
    } finally {
      setLoading(false)
    }
  }

  const selectContainer = async (containerId: string) => {
    const selected = containers.find(({ reference }) => reference.containerId === containerId)
    if (!selected) {
      setParent(null)
      setEntries([])
      setHistory([])
      return
    }
    setParent(selected.reference)
    setHistory([])
    await loadEntries(selected.reference)
  }

  const enterContainer = async (reference: ContentContainerReference) => {
    if (!parent || history.length >= MAX_NAVIGATION_DEPTH) {
      if (history.length >= MAX_NAVIGATION_DEPTH) {
        setError('Navigation depth is limited to 32 folders.')
      }
      return
    }
    setHistory((current) => [...current, parent])
    setParent(reference)
    await loadEntries(reference)
  }

  const goBack = async () => {
    const previous = history.at(-1)
    if (!previous) return
    setHistory((current) => current.slice(0, -1))
    setParent(previous)
    await loadEntries(previous)
  }

  const uploadNew = async () => {
    if (!parent || !fileTransfers || !operationReady(capabilities, 'upload-new')) return
    setProgress('Selecting upload source…')
    setError(null)
    try {
      const selected = await fileTransfers.pickUploadSource({
        title: 'Upload a new Content Space file',
        maxBytes: 16 * 1024 * 1024
      })
      if (selected.cancelled) {
        setProgress(null)
        return
      }
      setProgress(`Uploading ${selected.name}…`)
      await client.uploadNew(parent, selected.name, selected.handle)
      await loadEntries(parent)
      setProgress(`Uploaded ${selected.name}.`)
    } catch (cause) {
      setProgress(null)
      setError(boundedError(cause))
    }
  }

  const createFixedReference = async () => {
    if (!selectedFile || !operationReady(capabilities, 'observe-immutable-version')) return
    setProgress('Verifying immutable version…')
    setError(null)
    try {
      const observation = await client.observeImmutableVersion(selectedFile.reference)
      if (!observation.proven) {
        setFixedReference(null)
        setError(`Fixed reference unavailable: ${observation.reasonCode}`)
      } else {
        setFixedReference(issueArtifactReference(observation.proof))
      }
    } catch (cause) {
      setError(boundedError(cause))
    } finally {
      setProgress(null)
    }
  }

  const downloadSelected = async () => {
    if (!selectedFile || !fileTransfers || !operationReady(capabilities, 'download')) return
    setProgress('Selecting download destination…')
    setError(null)
    try {
      const selected = await fileTransfers.pickDownloadDestination({
        title: 'Download Content Space file',
        suggestedName: selectedFile.label
      })
      if (selected.cancelled) {
        setProgress(null)
        return
      }
      setProgress(`Downloading to ${selected.label}…`)
      await client.download(fixedReference ?? selectedFile.reference, selected.handle)
      setProgress(`Downloaded ${selected.label}.`)
    } catch (cause) {
      setProgress(null)
      setError(boundedError(cause))
    }
  }

  const openPortal = async () => {
    const reference = fixedReference ?? selectedFile?.reference ?? parent
    if (!reference || !operationReady(capabilities, 'portal-target')) return
    setProgress('Opening Provider portal…')
    setError(null)
    try {
      await client.openPortal(reference)
    } catch (cause) {
      setError(boundedError(cause))
    } finally {
      setProgress(null)
    }
  }

  return (
    <section className={className} aria-label="Content Space" data-active={active ? 'true' : 'false'}>
      <header>
        <h2>Content Space</h2>
        {onCollapse ? <button type="button" onClick={onCollapse}>Collapse</button> : null}
      </header>

      <label>
        Provider Instance
        <select
          aria-label="Provider Instance"
          value={providerInstanceRef}
          onChange={(event) => { void selectProvider(event.currentTarget.value) }}
        >
          <option value="">Select a Provider Instance</option>
          {instances.map((instance) => (
            <option key={instance.providerInstanceRef} value={instance.providerInstanceRef}>
              {instance.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Container
        <select
          aria-label="Content container"
          value={parent && history.length === 0 ? parent.containerId : ''}
          disabled={!providerInstanceRef || containers.length === 0}
          onChange={(event) => { void selectContainer(event.currentTarget.value) }}
        >
          <option value="">Select a container</option>
          {containers.map((container) => (
            <option key={container.reference.containerId} value={container.reference.containerId}>
              {container.label}
            </option>
          ))}
        </select>
      </label>

      {capabilities.length > 0 ? (
        <ul aria-label="Content Space readiness">
          {capabilities.map((capability) => (
            <li key={capability.operation}>
              {capability.operation}: {capability.readiness}
            </li>
          ))}
        </ul>
      ) : null}

      <nav aria-label="Content Space navigation">
        <button type="button" disabled={history.length === 0 || loading} onClick={() => { void goBack() }}>
          Back
        </button>
        <span>{parent ? `${history.length + 1} / ${MAX_NAVIGATION_DEPTH}` : 'No container selected'}</span>
      </nav>

      <div aria-label="Content Space transfers">
        <button
          type="button"
          disabled={!parent || !fileTransfers || !operationReady(capabilities, 'upload-new') || loading}
          onClick={() => { void uploadNew() }}
        >
          Upload new
        </button>
        <button
          type="button"
          disabled={!selectedFile || !fileTransfers || !operationReady(capabilities, 'download') || loading}
          onClick={() => { void downloadSelected() }}
        >
          Download
        </button>
        <button
          type="button"
          disabled={!(selectedFile || parent) || !operationReady(capabilities, 'portal-target') || loading}
          onClick={() => { void openPortal() }}
        >
          Open portal
        </button>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p role="status">Loading…</p> : null}
      {progress ? <p role="status">{progress}</p> : null}
      {!loading && parent && entries.length === 0 ? <p>This container is empty.</p> : null}

      <ul aria-label="Content entries">
        {entries.map((entry) => (
          <li key={`${entry.kind}:${entry.kind === 'container'
            ? entry.reference.containerId
            : entry.reference.fileId}`}>
            {entry.kind === 'container' ? (
              <button type="button" onClick={() => { void enterContainer(entry.reference) }}>
                Folder: {entry.label}
              </button>
            ) : (
              <button
                type="button"
                aria-pressed={selectedFile?.reference.fileId === entry.reference.fileId}
                onClick={() => {
                  setSelectedFile(entry)
                  setFixedReference(null)
                }}
              >
                File: {entry.label} ({entry.size} bytes)
              </button>
            )}
          </li>
        ))}
      </ul>

      {nextCursor && parent ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => { void loadEntries(parent, nextCursor, true) }}
        >
          Load more
        </button>
      ) : null}

      {selectedFile ? (
        <aside aria-label="Selected Content Space resource">
          <h3>{selectedFile.label}</h3>
          <p>Live reference: {selectedFile.reference.providerInstanceRef} / {selectedFile.reference.fileId}</p>
          <button
            type="button"
            disabled={!operationReady(capabilities, 'observe-immutable-version')}
            onClick={() => { void createFixedReference() }}
          >
            Create fixed reference
          </button>
          {fixedReference ? (
            <p>
              Fixed reference: {fixedReference.providerInstanceRef} / {fixedReference.fileId} /
              {' '}{fixedReference.immutableVersionId}
            </p>
          ) : <p>Fixed reference: not issued</p>}
        </aside>
      ) : null}
    </section>
  )
}

function operationReady(
  capabilities: readonly ContentSpaceCapabilityState[],
  operation: ContentSpaceCapabilityState['operation']
): boolean {
  return capabilities.some((capability) =>
    capability.operation === operation && capability.readiness === 'production_ready'
  )
}

function boundedError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : 'Content Space operation failed.'
  return message.trim().slice(0, 256) || 'Content Space operation failed.'
}
