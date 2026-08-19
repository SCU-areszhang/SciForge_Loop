import {
  defineTrustedDomainPackage,
  type TrustedDomainPackageDefinition,
  type TrustedDomainPackageDefinitionInput
} from '@sciforge/domain-sdk/contract'
import manifest from '../sciforge.domain.json' with { type: 'json' }

export const domainPackageDefinition: TrustedDomainPackageDefinition =
  defineTrustedDomainPackage(manifest as TrustedDomainPackageDefinitionInput)

export const PROJECT_COORDINATOR_DOMAIN_MODULE_ID = domainPackageDefinition.module.id
export const PROJECT_COORDINATOR_SERVICE_CONTRIBUTION = domainPackageDefinition.entrypoints
  .find((entrypoint) => entrypoint.process === 'main')!
  .contributions.find((contribution) => contribution.id === 'project-coordinator.service')!
export const PROJECT_COORDINATOR_SERVICE_CONTRACT =
  domainPackageDefinition.contributionContracts[PROJECT_COORDINATOR_SERVICE_CONTRIBUTION.id]!
