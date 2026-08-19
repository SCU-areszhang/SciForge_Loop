import { resourceRefIdSchema } from '@sciforge/collaboration-contracts'

const FORBIDDEN_CLOUD_TEXT = [
  /\bBearer\s+\S+/iu,
  /\b(?:token|password|secret|credential)\s*[:=]\s*\S+/iu,
  /(?:^|\s)(?:\/Users\/|\/home\/|[A-Za-z]:\\)/u,
  /(?:^|[\s"'])\.\.\//u,
  /\brrf_[A-Za-z0-9_-]+\b/u
]

export function assertCloudSafeText(value: string): void {
  if (FORBIDDEN_CLOUD_TEXT.some((pattern) => pattern.test(value))) {
    throw new Error('Cloud text contains a credential, local path, handle, or portable-reference ID.')
  }
}

export function assertAResourceRefId(value: string): void {
  if (!resourceRefIdSchema.safeParse(value).success) {
    throw new Error('Only A ResourceRef IDs may enter StructuredTaskResult.')
  }
}
