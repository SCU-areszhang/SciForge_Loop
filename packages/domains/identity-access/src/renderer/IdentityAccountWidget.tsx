import { UserRound } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import type { DomainRendererApplicationHost } from '@sciforge/domain-sdk/host'
import { IDENTITY_APPLICATION_OVERLAY_ID } from '../contract.js'
import type { IdentityRendererProjection } from './projection.js'

export function IdentityAccountWidget(props: Readonly<{
  application: DomainRendererApplicationHost
  projection: IdentityRendererProjection
  className?: string
}>): React.JSX.Element {
  const { t } = useTranslation('identity')
  const snapshot = useSyncExternalStore(props.projection.subscribe, props.projection.getSnapshot)
  const label = snapshot.state?.status === 'available'
    ? snapshot.state.currentAccount?.username ?? t('login')
    : snapshot.state?.status === 'unavailable'
      ? t('unavailable')
      : t('login')
  return (
    <button
      type="button"
      className={props.className}
      aria-label={t('accountTitle')}
      onClick={() => props.application.openOverlay({
        contributionId: IDENTITY_APPLICATION_OVERLAY_ID
      })}
    >
      <UserRound aria-hidden="true" size={15} />
      <span>{label}</span>
    </button>
  )
}
