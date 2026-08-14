import {
  MAIN_PRINCIPAL_PROVIDER_CONTRIBUTION_KIND,
  definePrincipalContextSnapshot,
  definePrincipalSnapshot,
  isDomainMainPrincipalProvider,
  type PrincipalContextListener,
  type PrincipalContextSnapshot,
  type PrincipalSnapshot,
  type PrincipalSubscriptionDisposer
} from '@sciforge/domain-sdk/principal'
import type { DomainModuleCatalog } from './modules/catalog'

export type MainPrincipalContext = Readonly<{
  current(): PrincipalSnapshot | undefined
  snapshot(): PrincipalContextSnapshot
  subscribe(listener: PrincipalContextListener): PrincipalSubscriptionDisposer
}>

const EMPTY_PRINCIPAL_CONTEXT = definePrincipalContextSnapshot({
  identityVersion: 0,
  principal: null
})

export function createMainPrincipalContext(
  catalog: DomainModuleCatalog
): MainPrincipalContext {
  const contributions = catalog.listContributions(
    MAIN_PRINCIPAL_PROVIDER_CONTRIBUTION_KIND,
    isDomainMainPrincipalProvider
  )
  if (contributions.length > 1) {
    throw new Error(
      `Application composition has ${contributions.length} Principal providers; expected zero or one.`
    )
  }
  const provider = contributions[0]?.value

  return Object.freeze({
    current: () => {
      const principal = provider?.current()
      return principal ? definePrincipalSnapshot(principal) : undefined
    },
    snapshot: () => provider
      ? definePrincipalContextSnapshot(provider.snapshot())
      : EMPTY_PRINCIPAL_CONTEXT,
    subscribe: (listener) => {
      if (!provider) return () => undefined
      let latestVersion = -1
      return provider.subscribe((rawSnapshot) => {
        const snapshot = definePrincipalContextSnapshot(rawSnapshot)
        if (snapshot.identityVersion <= latestVersion) return
        latestVersion = snapshot.identityVersion
        listener(snapshot)
      })
    }
  })
}
