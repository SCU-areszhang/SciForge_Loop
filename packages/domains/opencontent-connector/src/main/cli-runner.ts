import { z } from 'zod'

import {
  principalSnapshotSchema,
  samePrincipalSnapshot,
  type PrincipalSnapshot
} from '@sciforge/domain-sdk/principal'

import {
  assertOpenContentSkillBundledAssetsPresent,
  type OpenContentSkillBundledAssetLocation
} from './bundled-assets.js'
import {
  type OpenContentSupplierCommandTransport,
  type OpenContentSupplierInvocation
} from '../main-contract.js'
import {
  openContentExternalBindingAttestationSchema,
  type OpenContentExternalBindingAttestation
} from '../contract.js'
import {
  DOCFLOW_NATIVE_DOCUMENT_COMMANDS,
  docflowCommandInvocationSchema
} from '../supplier-docflow-protocol.js'
import {
  OPENCONTENT_EXTENDED_OPERATION_COMMANDS,
  openContentExtendedCommandInvocationSchema
} from '../supplier-extended-operation-protocol.js'

/** The complete named-command surface shipped by the pinned OpenContent CLI snapshot. */
export const OPENCONTENT_CLI_COMMANDS = Object.freeze([
  'file-search',
  'file-rag-scope',
  'file-info',
  'file-internal-link',
  'file-edit',
  'sec-level-list',
  'file-list',
  'folder-info',
  'create-folder',
  'folder-edit',
  'upload',
  'download',
  'attach-list',
  'attach-remove',
  'relation-create',
  'relation-list',
  'relation-remove',
  'publish',
  'create-share',
  'my-publish-list',
  'cancel-publish',
  'my-share-list',
  'cancel-share',
  'rename',
  'copy',
  'move',
  'delete',
  'file-tag-list',
  'file-tag-set',
  'file-tag-delete',
  'create-shortcut',
  'meta-info',
  'meta-types',
  'meta-attrs',
  'meta-modeldata',
  'meta-edit',
  'docflow-import',
  'docflow-export',
  'docflow-create',
  'docflow-update',
  'docflow-insert',
  'docflow-edit',
  'docflow-undo',
  'docflow-redo',
  'docflow-image-upload',
  'docflow-image-download',
  'docflow-read',
  'docflow-last-delivery',
  'docflow-probe',
  'docflow-plan',
  'docflow-failure-list',
  'docflow-failure-get',
  'docflow-failure-prune',
  'docflow-failure-recovery',
  'docflow-comment-create',
  'docflow-comment-list',
  'docflow-comment-get',
  'docflow-comment-reply',
  'docflow-comment-solve',
  'docflow-comment-reopen',
  'docflow-comment-delete',
  'user-info',
  'search-position',
  'search-department',
  'search-user',
  'search-user-group',
  'team-create',
  'team-list',
  'team-edit',
  'team-stick',
  'team-unstick',
  'team-users',
  'team-member-add',
  'team-member-remove',
  'collab-list',
  'collab-search',
  'collab-link',
  'kbox-list',
  'albums',
  'album-files',
  'favorite-add',
  'favorite-remove',
  'recent-files',
  'perm-cates',
  'perm-list',
  'perm-set'
] as const)

const openContentCliCommandSchema = z.enum(OPENCONTENT_CLI_COMMANDS)
export type OpenContentCliCommand = z.infer<typeof openContentCliCommandSchema>

const nativeDocumentCommands = new Set<string>(DOCFLOW_NATIVE_DOCUMENT_COMMANDS)
const extendedCommands = new Set<string>(OPENCONTENT_EXTENDED_OPERATION_COMMANDS)

export const OPENCONTENT_CLI_ADMITTED_COMMANDS = Object.freeze(
  OPENCONTENT_CLI_COMMANDS.filter(
    (command) => nativeDocumentCommands.has(command) || extendedCommands.has(command)
  )
)

/**
 * One command envelope for the two canonical adapters. The wider snapshot
 * inventory is deliberately not an execution allowlist: raw HTTP methods,
 * local diagnostic/cache commands, and commands owned by typed SDK paths are
 * absent from this union.
 */
export const openContentCliInvocationSchema = z.union([
  docflowCommandInvocationSchema,
  openContentExtendedCommandInvocationSchema
])

export const OPENCONTENT_CLI_RUNNER_PROTOCOL = 'opencontentCliRunner:v1' as const
export const OPENCONTENT_CLI_MAX_STDOUT_BYTES = 4 * 1024 * 1024
export const OPENCONTENT_CLI_MAX_STDERR_BYTES = 64 * 1024

const boundedSecretSchema = z.string().min(1).max(16_384)

/**
 * Ephemeral material resolved from the already-admitted Provider Connection.
 * It must exist only for one bound runner and must never enter argv, output,
 * errors, trace fields, or persistent storage.
 */
export const openContentCliConnectionMaterialSchema = z.object({
  site: z.string().url().max(4_096),
  systemUserToken: boundedSecretSchema
}).strict().readonly()
type OpenContentCliConnectionMaterial = z.infer<
  typeof openContentCliConnectionMaterialSchema
>

export const openContentCliSessionBindingSchema = z.object({
  principal: principalSnapshotSchema,
  providerInstanceRef: z.string().trim().min(3).max(256),
  bindingAttestation: openContentExternalBindingAttestationSchema,
  invocationId: z.string()
    .trim()
    .min(16)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]+$/u)
}).strict().superRefine((binding, context) => {
  if (binding.bindingAttestation.providerInstanceRef !== binding.providerInstanceRef) {
    context.addIssue({
      code: 'custom',
      path: ['bindingAttestation', 'providerInstanceRef'],
      message: 'The current binding must target the configured Provider Instance.'
    })
  }
  if (!samePrincipalSnapshot(binding.bindingAttestation.principal, binding.principal)) {
    context.addIssue({
      code: 'custom',
      path: ['bindingAttestation', 'principal'],
      message: 'The current binding must attest the exact Principal.'
    })
  }
}).readonly()

export type OpenContentCliSessionBinding = z.infer<
  typeof openContentCliSessionBindingSchema
>

export type OpenContentCliProcessRequest = Readonly<{
  protocol: typeof OPENCONTENT_CLI_RUNNER_PROTOCOL
  entrypoint: string
  invocation: OpenContentSupplierInvocation
  connectionMaterial: OpenContentCliConnectionMaterial
  /** Trusted facts from the exact live Connector session; never serialized to the child. */
  sessionBinding: OpenContentCliSessionBinding
  deadlineAt: string
  signal: AbortSignal
  /** Ephemeral Host Principal lease guard; never serialized or exposed to the child. */
  assertPrincipalCurrent(): void | Promise<void>
  limits: Readonly<{
    stdoutBytes: typeof OPENCONTENT_CLI_MAX_STDOUT_BYTES
    stderrBytes: typeof OPENCONTENT_CLI_MAX_STDERR_BYTES
  }>
}>

/**
 * The one privileged subprocess seam. Its implementation must use shell:false,
 * a runner-owned temporary working directory, a minimal environment, bounded
 * capture, and recursive cleanup. It may execute only request.entrypoint.
 */
export interface OpenContentCliProcessPort {
  run(request: OpenContentCliProcessRequest): Promise<unknown>
}

export type OpenContentCliExecutionContext = Readonly<{
  principal: PrincipalSnapshot
  providerInstanceRef: string
  bindingAttestation: OpenContentExternalBindingAttestation
  invocationId: string
  deadlineAt: string
  signal: AbortSignal
  assertPrincipalCurrent(): void | Promise<void>
}>

export type OpenContentCliRunnerBinding = Readonly<{
  assets: OpenContentSkillBundledAssetLocation
  execution: OpenContentCliExecutionContext
  connectionMaterial: OpenContentCliConnectionMaterial
  processPort: OpenContentCliProcessPort
}>

/**
 * Binds the fixed package asset, current Principal assertion, and ephemeral connection once.
 * Agent-facing invocation data contains no executable, argv, environment,
 * endpoint, credential, cwd, or local path fields.
 */
export function createOpenContentCliRunner(
  binding: OpenContentCliRunnerBinding
): OpenContentSupplierCommandTransport {
  const connectionMaterial = Object.freeze(
    openContentCliConnectionMaterialSchema.parse(binding.connectionMaterial)
  )
  const assets = assertOpenContentSkillBundledAssetsPresent(binding.assets)
  const sessionBinding = Object.freeze(openContentCliSessionBindingSchema.parse({
    principal: binding.execution.principal,
    providerInstanceRef: binding.execution.providerInstanceRef,
    bindingAttestation: binding.execution.bindingAttestation,
    invocationId: binding.execution.invocationId
  }))

  return Object.freeze({
    async invoke(input: OpenContentSupplierInvocation): Promise<unknown> {
      const invocation = openContentCliInvocationSchema.parse(input)
      if (invocation.invocationId !== sessionBinding.invocationId) {
        throw new TypeError('The supplier invocation is not bound to the current Provider operation.')
      }
      await binding.execution.assertPrincipalCurrent()
      if (binding.execution.signal.aborted) {
        throw new DOMException('OpenContent CLI invocation was cancelled.', 'AbortError')
      }

      return binding.processPort.run(Object.freeze({
        protocol: OPENCONTENT_CLI_RUNNER_PROTOCOL,
        entrypoint: assets.cliEntrypoint,
        invocation,
        connectionMaterial,
        sessionBinding,
        deadlineAt: binding.execution.deadlineAt,
        signal: binding.execution.signal,
        assertPrincipalCurrent: binding.execution.assertPrincipalCurrent,
        limits: Object.freeze({
          stdoutBytes: OPENCONTENT_CLI_MAX_STDOUT_BYTES,
          stderrBytes: OPENCONTENT_CLI_MAX_STDERR_BYTES
        })
      }))
    }
  })
}
