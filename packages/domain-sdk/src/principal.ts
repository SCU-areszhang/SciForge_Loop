import { z } from 'zod'

export const MAIN_PRINCIPAL_PROVIDER_CONTRIBUTION_KIND =
  'main.principal-provider' as const

export const principalAssuranceSchema = z.enum([
  'local-selection',
  'cloud-authenticated'
])

export const principalSnapshotSchema = z.object({
  userId: z.string().uuid(),
  assurance: principalAssuranceSchema,
  deviceId: z.string().trim().min(1).max(256),
  identityVersion: z.number().int().nonnegative()
}).strict().readonly()

export const principalContextSnapshotSchema = z.object({
  identityVersion: z.number().int().nonnegative(),
  principal: principalSnapshotSchema.nullable()
}).strict().superRefine((snapshot, context) => {
  if (
    snapshot.principal &&
    snapshot.principal.identityVersion !== snapshot.identityVersion
  ) {
    context.addIssue({
      code: 'custom',
      path: ['principal', 'identityVersion'],
      message: 'Principal and context identity versions must match.'
    })
  }
}).readonly()

export type PrincipalAssurance = z.infer<typeof principalAssuranceSchema>
export type PrincipalSnapshot = z.infer<typeof principalSnapshotSchema>
export type PrincipalContextSnapshot = z.infer<typeof principalContextSnapshotSchema>
export type PrincipalSubscriptionDisposer = () => void
export type PrincipalContextListener = (snapshot: PrincipalContextSnapshot) => void

export type DomainMainPrincipalProvider = Readonly<{
  current(): PrincipalSnapshot | undefined
  snapshot(): PrincipalContextSnapshot
  subscribe(listener: PrincipalContextListener): PrincipalSubscriptionDisposer
}>

export function definePrincipalSnapshot(input: PrincipalSnapshot): PrincipalSnapshot {
  return principalSnapshotSchema.parse(input)
}

export function definePrincipalContextSnapshot(
  input: PrincipalContextSnapshot
): PrincipalContextSnapshot {
  return principalContextSnapshotSchema.parse(input)
}

export function isDomainMainPrincipalProvider(
  value: unknown
): value is DomainMainPrincipalProvider {
  if (!isRecord(value)) return false
  return Object.keys(value).every((key) => ['current', 'snapshot', 'subscribe'].includes(key)) &&
    typeof value.current === 'function' &&
    typeof value.snapshot === 'function' &&
    typeof value.subscribe === 'function'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
