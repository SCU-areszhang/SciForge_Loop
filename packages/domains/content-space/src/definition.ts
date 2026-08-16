import {
  defineTrustedDomainPackage,
  type TrustedDomainPackageDefinition,
  type TrustedDomainPackageDefinitionInput
} from '@sciforge/domain-sdk/contract'
import manifest from '../sciforge.domain.json' with { type: 'json' }

export const domainPackageDefinition: TrustedDomainPackageDefinition =
  defineTrustedDomainPackage(manifest as TrustedDomainPackageDefinitionInput)

export const CONTENT_SPACE_DOMAIN_MODULE_ID = domainPackageDefinition.module.id
export const CONTENT_SPACE_DOMAIN_PACKAGE_NAME = domainPackageDefinition.packageName

export const CONTENT_SPACE_CAPABILITY_FACTORY_CONTRIBUTION = contributionFor(
  'main',
  'main.capability-factory'
)
export const CONTENT_SPACE_CONTAINER_REFERENCE_CODEC_CONTRIBUTION = contributionFor(
  'main',
  'main.portable-resource-codec',
  'content-space.container-reference-codec'
)
export const CONTENT_SPACE_FILE_REFERENCE_CODEC_CONTRIBUTION = contributionFor(
  'main',
  'main.portable-resource-codec',
  'content-space.file-reference-codec'
)
export const CONTENT_SPACE_ARTIFACT_REFERENCE_CODEC_CONTRIBUTION = contributionFor(
  'main',
  'main.portable-resource-codec',
  'content-space.artifact-reference-codec'
)
export const CONTENT_SPACE_PORTABLE_AUTHORITY_RESOLVER_CONTRIBUTION = contributionFor(
  'main',
  'main.portable-authority-resolver',
  'content-space.provider-instance-authority'
)
export const CONTENT_SPACE_RENDERER_RIGHT_PANEL_CONTRIBUTION = contributionFor(
  'renderer',
  'renderer.workbench-right-panel'
)
export const CONTENT_SPACE_RENDERER_RIGHT_PANEL_CONTRACT =
  domainPackageDefinition.contributionContracts[
    CONTENT_SPACE_RENDERER_RIGHT_PANEL_CONTRIBUTION.id
  ]!
export const CONTENT_SPACE_RENDERER_COMMAND_CONTRIBUTION = contributionFor(
  'renderer',
  'renderer.command'
)
export const CONTENT_SPACE_RENDERER_TOOLBAR_ACTION_CONTRIBUTION = contributionFor(
  'renderer',
  'renderer.workbench-toolbar-action'
)
export const CONTENT_SPACE_RENDERER_TOOLBAR_ACTION_CONTRACT =
  domainPackageDefinition.contributionContracts[
    CONTENT_SPACE_RENDERER_TOOLBAR_ACTION_CONTRIBUTION.id
  ]!

function contributionFor(
  process: 'main' | 'renderer',
  kind: string,
  id?: string
) {
  const contribution = domainPackageDefinition.entrypoints
    .find((entrypoint) => entrypoint.process === process)
    ?.contributions.find((candidate) =>
      candidate.kind === kind && (id === undefined || candidate.id === id)
    )
  if (!contribution) {
    throw new Error(`Content Space manifest is missing ${process}:${kind}.`)
  }
  return contribution
}
