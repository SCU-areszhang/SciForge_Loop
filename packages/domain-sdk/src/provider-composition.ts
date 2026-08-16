import { z } from 'zod'

import {
  domainPackageContributionIdSchema,
  domainPackageContributionKindSchema,
  domainPackageModuleIdSchema,
  domainPackageNameSchema,
  domainPackageStableVersionSchema,
  domainPackageVersionSchema,
  type DomainPackageContributionDeclaration,
  type DomainPackageJsonValue
} from './contract.js'

export const PROVIDER_FACTORY_CONTRACT_VERSION = '1.0.0' as const
export const PROVIDER_FACTORY_SUPPORTED_CONTRACT_MAJOR = 1 as const

export const MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND =
  'main.document-provider-factory' as const
export const MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND =
  'main.content-space-provider-factory' as const
export const MAIN_PROVIDER_INSTANCE_DIRECTORY_ENTRY_CONTRIBUTION_KIND =
  'main.provider-instance-directory-entry' as const

const providerKindPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u
const providerInstanceRefPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,255}$/u
const forbiddenInstanceRefPattern =
  /(?:^|[._-])(?:conn(?:ection)?|credential|endpoint|host|origin|password|secret|token|url|uri)(?:[._-]|$)/iu

export const providerKindSchema = z.string()
  .min(3)
  .max(96)
  .regex(providerKindPattern, 'Use a bounded lowercase Provider Kind.')

export const providerInstanceRefSchema = z.string()
  .min(3)
  .max(256)
  .regex(providerInstanceRefPattern, 'Use an opaque bounded Provider Instance Reference.')
  .refine(
    (value) => !forbiddenInstanceRefPattern.test(value),
    'Provider Instance References cannot identify local access or secret material.'
  )

export const providerFactoryContributionContractSchema = z.object({
  contractVersion: domainPackageStableVersionSchema,
  providerKind: providerKindSchema
}).strict()

export const providerInstanceDirectoryEntryContributionContractSchema = z.object({
  contractVersion: domainPackageStableVersionSchema,
  providerInstanceRef: providerInstanceRefSchema,
  providerKind: providerKindSchema,
  displayName: z.string().trim().min(1).max(160)
}).strict()

export type ProviderKind = string & { readonly __brand: 'ProviderKind' }
export type ProviderInstanceRef = string & { readonly __brand: 'ProviderInstanceRef' }
export type ProviderFactoryContributionContract = z.infer<
  typeof providerFactoryContributionContractSchema
>

export type ProviderCompositionOwner = Readonly<{
  packageName: string
  moduleId: string
  moduleVersion: string
  contributionId: string
}>

export type ProviderInstanceDirectoryEntry = Readonly<{
  providerInstanceRef: ProviderInstanceRef
  providerKind: ProviderKind
  displayName?: string
}>

export type DomainMainProviderInstanceDirectorySource = Readonly<{
  list(): readonly ProviderInstanceDirectoryEntry[]
  resolve(providerInstanceRef: string): ProviderInstanceDirectoryEntry | undefined
}>

export type ProviderInstanceDirectoryEntryRuntimeValue = Readonly<{
  contributionKind: typeof MAIN_PROVIDER_INSTANCE_DIRECTORY_ENTRY_CONTRIBUTION_KIND
  contractVersion: string
  providerInstanceRef: ProviderInstanceRef
  providerKind: ProviderKind
  displayName: string
}>

export type ProviderInstanceDirectoryEntryRuntimeValueInput = Readonly<{
  contractVersion: string
  providerInstanceRef: string
  providerKind: string
  displayName: string
}>

export type ProviderFactoryHostView<HostPorts> = Readonly<{
  owner: ProviderCompositionOwner
  instance: ProviderInstanceDirectoryEntry
  ports: HostPorts
}>

export type ProviderFactoryRuntimeValue<Provider, HostPorts> = Readonly<{
  contributionKind:
    | typeof MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND
    | typeof MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND
  contractVersion: string
  providerKind: ProviderKind
  createProvider(
    hostView: ProviderFactoryHostView<HostPorts>
  ): Provider | Promise<Provider>
}>

export type ProviderFactoryRuntimeValueInput<Provider, HostPorts> = Readonly<{
  contractVersion: string
  providerKind: string
  createProvider(
    hostView: ProviderFactoryHostView<HostPorts>
  ): Provider | Promise<Provider>
}>

export type DocumentProviderFactoryRuntimeValue<Provider, HostPorts> =
  ProviderFactoryRuntimeValue<Provider, HostPorts> & Readonly<{
    contributionKind: typeof MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND
  }>

export type ContentSpaceProviderFactoryRuntimeValue<Provider, HostPorts> =
  ProviderFactoryRuntimeValue<Provider, HostPorts> & Readonly<{
    contributionKind: typeof MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND
  }>

/**
 * A read-only projection of the standard generated main-process composition.
 * Domain packages receive this facade instead of Host-private catalog objects.
 */
export type DomainMainComposedContribution = Readonly<{
  packageName: string
  owner: Readonly<{
    moduleId: string
    moduleVersion: string
  }>
  declaration: DomainPackageContributionDeclaration
  contract?: DomainPackageJsonValue
  value: unknown
}>

export type DomainMainContributionSource = Readonly<{
  list(kind: string): readonly DomainMainComposedContribution[]
}>

export type ProviderCompositionErrorCode =
  | 'composition_not_ready'
  | 'invalid_contribution'
  | 'incompatible_contract_version'
  | 'duplicate_provider_kind'
  | 'invalid_provider_instance'
  | 'duplicate_provider_instance'
  | 'unknown_provider_instance'
  | 'missing_provider'
  | 'provider_unavailable'

export class ProviderCompositionError extends Error {
  readonly code: ProviderCompositionErrorCode

  constructor(code: ProviderCompositionErrorCode, message: string) {
    super(message.slice(0, 256))
    this.name = 'ProviderCompositionError'
    this.code = code
  }
}

export class ProviderInstanceDirectory {
  readonly #byRef = new Map<ProviderInstanceRef, ProviderInstanceDirectoryEntry>()

  constructor(entries: readonly Readonly<{
    providerInstanceRef: string
    providerKind: string
    displayName?: string
  }>[] = []) {
    for (const entry of entries) {
      let providerInstanceRef: ProviderInstanceRef
      let providerKind: ProviderKind
      try {
        providerInstanceRef = parseProviderInstanceRef(entry.providerInstanceRef)
        providerKind = parseProviderKind(entry.providerKind)
      } catch {
        throw providerCompositionError('invalid_provider_instance')
      }
      if (this.#byRef.has(providerInstanceRef)) {
        throw providerCompositionError('duplicate_provider_instance')
      }
      this.#byRef.set(providerInstanceRef, Object.freeze({
        providerInstanceRef,
        providerKind,
        ...(entry.displayName === undefined
          ? {}
          : { displayName: z.string().trim().min(1).max(160).parse(entry.displayName) })
      }))
    }
  }

  resolve(input: string): ProviderInstanceDirectoryEntry | undefined {
    const providerInstanceRef = parseProviderInstanceRef(input)
    return this.#byRef.get(providerInstanceRef)
  }

  list(): readonly ProviderInstanceDirectoryEntry[] {
    return Object.freeze([...this.#byRef.values()].sort((left, right) =>
      left.providerInstanceRef.localeCompare(right.providerInstanceRef)
    ))
  }
}

export type ProviderFactorySelection<Provider, HostPorts> = Readonly<{
  contractVersion: string
  providerKind: ProviderKind
  providerInstanceRef: ProviderInstanceRef
  owner: ProviderCompositionOwner
  createProvider(ports: HostPorts): Promise<Provider>
}>

export type ProviderFactoryCatalog<Provider, HostPorts> = Readonly<{
  list(): readonly Readonly<{
    contractVersion: string
    providerKind: ProviderKind
    owner: ProviderCompositionOwner
  }>[]
  select(
    directory: ProviderInstanceDirectory,
    providerInstanceRef: string
  ): ProviderFactorySelection<Provider, HostPorts>
}>

export function defineDocumentProviderFactory<Provider, HostPorts>(
  input: ProviderFactoryRuntimeValueInput<Provider, HostPorts>
): DocumentProviderFactoryRuntimeValue<Provider, HostPorts> {
  return defineProviderFactoryRuntimeValue(
    MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND,
    input
  ) as DocumentProviderFactoryRuntimeValue<Provider, HostPorts>
}

export function defineContentSpaceProviderFactory<Provider, HostPorts>(
  input: ProviderFactoryRuntimeValueInput<Provider, HostPorts>
): ContentSpaceProviderFactoryRuntimeValue<Provider, HostPorts> {
  return defineProviderFactoryRuntimeValue(
    MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND,
    input
  ) as ContentSpaceProviderFactoryRuntimeValue<Provider, HostPorts>
}

export function defineProviderInstanceDirectoryEntry(
  input: ProviderInstanceDirectoryEntryRuntimeValueInput
): ProviderInstanceDirectoryEntryRuntimeValue {
  if (!isRecord(input) || Object.keys(input).sort().join(',') !==
    'contractVersion,displayName,providerInstanceRef,providerKind') {
    throw providerCompositionError('invalid_contribution')
  }
  const parsed = providerInstanceDirectoryEntryContributionContractSchema.safeParse(input)
  if (!parsed.success || contractMajor(parsed.data.contractVersion) !==
    PROVIDER_FACTORY_SUPPORTED_CONTRACT_MAJOR) {
    throw providerCompositionError(parsed.success
      ? 'incompatible_contract_version'
      : 'invalid_contribution')
  }
  return Object.freeze({
    contributionKind: MAIN_PROVIDER_INSTANCE_DIRECTORY_ENTRY_CONTRIBUTION_KIND,
    contractVersion: parsed.data.contractVersion,
    providerInstanceRef: parseProviderInstanceRef(parsed.data.providerInstanceRef),
    providerKind: parseProviderKind(parsed.data.providerKind),
    displayName: parsed.data.displayName
  })
}

export function createProviderInstanceDirectory(
  source: DomainMainContributionSource
): ProviderInstanceDirectory {
  const entries = source.list(MAIN_PROVIDER_INSTANCE_DIRECTORY_ENTRY_CONTRIBUTION_KIND)
    .map(validateOwnedProviderInstanceDirectoryEntry)
    .map(({ runtime }) => ({
      providerInstanceRef: runtime.providerInstanceRef,
      providerKind: runtime.providerKind,
      displayName: runtime.displayName
    }))
  return new ProviderInstanceDirectory(entries)
}

export function createDocumentProviderFactoryCatalog<Provider, HostPorts>(
  source: DomainMainContributionSource
): ProviderFactoryCatalog<Provider, HostPorts> {
  return createProviderFactoryCatalog(
    source,
    MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND
  )
}

export function createContentSpaceProviderFactoryCatalog<Provider, HostPorts>(
  source: DomainMainContributionSource
): ProviderFactoryCatalog<Provider, HostPorts> {
  return createProviderFactoryCatalog(
    source,
    MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND
  )
}

export function parseProviderKind(input: unknown): ProviderKind {
  return providerKindSchema.parse(input) as ProviderKind
}

export function parseProviderInstanceRef(input: unknown): ProviderInstanceRef {
  return providerInstanceRefSchema.parse(input) as ProviderInstanceRef
}

function defineProviderFactoryRuntimeValue<Provider, HostPorts>(
  contributionKind:
    | typeof MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND
    | typeof MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND,
  input: ProviderFactoryRuntimeValueInput<Provider, HostPorts>
): ProviderFactoryRuntimeValue<Provider, HostPorts> {
  if (!isProviderFactoryRuntimeValueInput(input)) {
    throw providerCompositionError('invalid_contribution')
  }
  const runtime = {
    contributionKind,
    contractVersion: input.contractVersion,
    providerKind: input.providerKind,
    createProvider: input.createProvider
  }
  if (!isProviderFactoryRuntimeValue(runtime)) {
    throw providerCompositionError('invalid_contribution')
  }
  return Object.freeze({
    contributionKind,
    contractVersion: runtime.contractVersion,
    providerKind: parseProviderKind(runtime.providerKind),
    createProvider: runtime.createProvider
  })
}

function isProviderFactoryRuntimeValueInput<Provider, HostPorts>(
  value: unknown
): value is ProviderFactoryRuntimeValueInput<Provider, HostPorts> {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).sort()
  return keys.length === 3 && keys.join(',') === 'contractVersion,createProvider,providerKind' &&
    domainPackageStableVersionSchema.safeParse(value.contractVersion).success &&
    providerKindSchema.safeParse(value.providerKind).success &&
    typeof value.createProvider === 'function'
}

function createProviderFactoryCatalog<Provider, HostPorts>(
  source: DomainMainContributionSource,
  contributionKind:
    | typeof MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND
    | typeof MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND
): ProviderFactoryCatalog<Provider, HostPorts> {
  const byKind = new Map<ProviderKind, OwnedProviderFactory<Provider, HostPorts>>()
  for (const contribution of source.list(contributionKind)) {
    const owned = validateOwnedProviderFactory<Provider, HostPorts>(
      contributionKind,
      contribution
    )
    if (byKind.has(owned.runtime.providerKind)) {
      throw providerCompositionError('duplicate_provider_kind')
    }
    byKind.set(owned.runtime.providerKind, owned)
  }

  const list = Object.freeze([...byKind.values()]
    .sort((left, right) => left.runtime.providerKind.localeCompare(right.runtime.providerKind))
    .map((owned) => Object.freeze({
      contractVersion: owned.runtime.contractVersion,
      providerKind: owned.runtime.providerKind,
      owner: owned.owner
    })))

  return Object.freeze({
    list: () => list,
    select: (directory: ProviderInstanceDirectory, rawProviderInstanceRef: string) => {
      if (!(directory instanceof ProviderInstanceDirectory)) {
        throw providerCompositionError('invalid_provider_instance')
      }
      let instance: ProviderInstanceDirectoryEntry | undefined
      try {
        instance = directory.resolve(rawProviderInstanceRef)
      } catch {
        throw providerCompositionError('invalid_provider_instance')
      }
      if (!instance) throw providerCompositionError('unknown_provider_instance')
      const owned = byKind.get(instance.providerKind)
      if (!owned) throw providerCompositionError('missing_provider')

      return Object.freeze({
        contractVersion: owned.runtime.contractVersion,
        providerKind: owned.runtime.providerKind,
        providerInstanceRef: instance.providerInstanceRef,
        owner: owned.owner,
        createProvider: async (ports: HostPorts): Promise<Provider> => {
          try {
            return await owned.runtime.createProvider(Object.freeze({
              owner: owned.owner,
              instance,
              ports
            }))
          } catch (error) {
            if (error instanceof ProviderCompositionError) throw error
            throw providerCompositionError('provider_unavailable')
          }
        }
      })
    }
  })
}

type OwnedProviderFactory<Provider, HostPorts> = Readonly<{
  owner: ProviderCompositionOwner
  runtime: ProviderFactoryRuntimeValue<Provider, HostPorts>
}>

function validateOwnedProviderFactory<Provider, HostPorts>(
  expectedKind: string,
  contribution: DomainMainComposedContribution
): OwnedProviderFactory<Provider, HostPorts> {
  try {
    const declaration = contribution.declaration
    domainPackageNameSchema.parse(contribution.packageName)
    domainPackageModuleIdSchema.parse(contribution.owner.moduleId)
    domainPackageVersionSchema.parse(contribution.owner.moduleVersion)
    domainPackageContributionIdSchema.parse(declaration.id)
    domainPackageContributionKindSchema.parse(declaration.kind)
    if (declaration.kind !== expectedKind) throw new Error('Contribution kind drifted.')

    const contract = providerFactoryContributionContractSchema.parse(contribution.contract)
    if (contractMajor(contract.contractVersion) !== PROVIDER_FACTORY_SUPPORTED_CONTRACT_MAJOR) {
      throw providerCompositionError('incompatible_contract_version')
    }
    if (declaration.version !== contract.contractVersion) {
      throw new Error('Declaration version does not match its canonical contract.')
    }
    if (!isProviderFactoryRuntimeValue<Provider, HostPorts>(contribution.value)) {
      throw new Error('Runtime factory value is invalid.')
    }
    if (contribution.value.contributionKind !== expectedKind ||
      contribution.value.contractVersion !== contract.contractVersion ||
      contribution.value.providerKind !== contract.providerKind) {
      throw new Error('Runtime factory value does not match its canonical contract.')
    }

    return Object.freeze({
      owner: Object.freeze({
        packageName: contribution.packageName,
        moduleId: contribution.owner.moduleId,
        moduleVersion: contribution.owner.moduleVersion,
        contributionId: declaration.id
      }),
      runtime: contribution.value
    })
  } catch (error) {
    if (error instanceof ProviderCompositionError) throw error
    throw providerCompositionError('invalid_contribution')
  }
}

function validateOwnedProviderInstanceDirectoryEntry(
  contribution: DomainMainComposedContribution
): Readonly<{
  owner: ProviderCompositionOwner
  runtime: ProviderInstanceDirectoryEntryRuntimeValue
}> {
  try {
    const declaration = contribution.declaration
    domainPackageNameSchema.parse(contribution.packageName)
    domainPackageModuleIdSchema.parse(contribution.owner.moduleId)
    domainPackageVersionSchema.parse(contribution.owner.moduleVersion)
    domainPackageContributionIdSchema.parse(declaration.id)
    if (declaration.kind !== MAIN_PROVIDER_INSTANCE_DIRECTORY_ENTRY_CONTRIBUTION_KIND) {
      throw new Error('Contribution kind drifted.')
    }
    const contract = providerInstanceDirectoryEntryContributionContractSchema.parse(
      contribution.contract
    )
    if (contractMajor(contract.contractVersion) !== PROVIDER_FACTORY_SUPPORTED_CONTRACT_MAJOR) {
      throw providerCompositionError('incompatible_contract_version')
    }
    if (declaration.version !== contract.contractVersion ||
      !isProviderInstanceDirectoryEntryRuntimeValue(contribution.value) ||
      contribution.value.contractVersion !== contract.contractVersion ||
      contribution.value.providerInstanceRef !== contract.providerInstanceRef ||
      contribution.value.providerKind !== contract.providerKind ||
      contribution.value.displayName !== contract.displayName) {
      throw new Error('Provider Instance contribution does not match its contract.')
    }
    return Object.freeze({
      owner: Object.freeze({
        packageName: contribution.packageName,
        moduleId: contribution.owner.moduleId,
        moduleVersion: contribution.owner.moduleVersion,
        contributionId: declaration.id
      }),
      runtime: contribution.value
    })
  } catch (error) {
    if (error instanceof ProviderCompositionError) throw error
    throw providerCompositionError('invalid_contribution')
  }
}

function isProviderInstanceDirectoryEntryRuntimeValue(
  value: unknown
): value is ProviderInstanceDirectoryEntryRuntimeValue {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !==
    'contractVersion,contributionKind,displayName,providerInstanceRef,providerKind') return false
  return value.contributionKind === MAIN_PROVIDER_INSTANCE_DIRECTORY_ENTRY_CONTRIBUTION_KIND &&
    providerInstanceDirectoryEntryContributionContractSchema.safeParse({
      contractVersion: value.contractVersion,
      providerInstanceRef: value.providerInstanceRef,
      providerKind: value.providerKind,
      displayName: value.displayName
    }).success
}

function isProviderFactoryRuntimeValue<Provider, HostPorts>(
  value: unknown
): value is ProviderFactoryRuntimeValue<Provider, HostPorts> {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).sort()
  return keys.length === 4 &&
    keys.join(',') === 'contractVersion,contributionKind,createProvider,providerKind' &&
    (value.contributionKind === MAIN_DOCUMENT_PROVIDER_FACTORY_CONTRIBUTION_KIND ||
      value.contributionKind === MAIN_CONTENT_SPACE_PROVIDER_FACTORY_CONTRIBUTION_KIND) &&
    domainPackageStableVersionSchema.safeParse(value.contractVersion).success &&
    providerKindSchema.safeParse(value.providerKind).success &&
    typeof value.createProvider === 'function'
}

function contractMajor(version: string): number {
  return Number(version.split('.')[0])
}

function providerCompositionError(
  code: ProviderCompositionErrorCode
): ProviderCompositionError {
  const messages: Record<ProviderCompositionErrorCode, string> = {
    composition_not_ready: 'Main contribution composition is not ready.',
    invalid_contribution: 'Provider factory contribution is invalid.',
    incompatible_contract_version: 'Provider factory contract version is incompatible.',
    duplicate_provider_kind: 'Provider Kind ownership conflicts in this catalog.',
    invalid_provider_instance: 'Provider Instance Reference is invalid.',
    duplicate_provider_instance: 'Provider Instance Reference ownership conflicts.',
    unknown_provider_instance: 'Provider Instance Reference is not trusted locally.',
    missing_provider: 'The pinned Provider implementation is not installed.',
    provider_unavailable: 'The pinned Provider is unavailable.'
  }
  return new ProviderCompositionError(code, messages[code])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
