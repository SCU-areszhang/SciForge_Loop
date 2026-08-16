import {
  defineTrustedDomainPackage,
  type TrustedDomainPackageDefinition,
  type TrustedDomainPackageDefinitionInput
} from '@sciforge/domain-sdk/contract'
import manifest from '../sciforge.domain.json' with { type: 'json' }

export const domainPackageDefinition: TrustedDomainPackageDefinition =
  defineTrustedDomainPackage(manifest as TrustedDomainPackageDefinitionInput)

export const LOCAL_MOCK_PROVIDER_KIND = 'sciforge-local-mock' as const
export const LOCAL_MOCK_PROVIDER_INSTANCE_REF = 'sciforge-content-space-local' as const

export const LOCAL_MOCK_PROVIDER_FACTORY_CONTRIBUTION = contributionFor(
  'main.content-space-provider-factory'
)
export const LOCAL_MOCK_PROVIDER_INSTANCE_CONTRIBUTION = contributionFor(
  'main.provider-instance-directory-entry'
)

function contributionFor(kind: string) {
  const contribution = domainPackageDefinition.entrypoints[0]?.contributions
    .find((candidate) => candidate.kind === kind)
  if (!contribution) throw new Error(`Local mock Provider manifest is missing ${kind}.`)
  return contribution
}
