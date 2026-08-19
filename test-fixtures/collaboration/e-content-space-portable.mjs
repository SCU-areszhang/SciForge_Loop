// Test-only bridge to E's integrated public contract. No schema or parser is
// reimplemented here: every value and function is re-exported from the exact
// Content Space package now present on the A branch.
export {
  ARTIFACT_REFERENCE_KIND,
  CONTENT_CONTAINER_REFERENCE_KIND,
  CONTENT_FILE_REFERENCE_KIND,
  parsePortableArtifactReference,
  parsePortableContentContainerReference,
  parsePortableContentFileReference,
  toPortableArtifactReference,
  toPortableContentContainerReference,
  toPortableContentFileReference
} from '@sciforge/domain-content-space/contract'
