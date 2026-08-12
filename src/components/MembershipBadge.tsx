import {
  effectiveMembership,
  formatMembershipExpiry,
  membershipBadgeClass,
  type MembershipTier,
} from '../lib/membership'

type Props = {
  membership?: string | null
  expiresAt?: string | null
  showExpiry?: boolean
  className?: string
}

export function MembershipBadge({
  membership,
  expiresAt,
  showExpiry = false,
  className = '',
}: Props) {
  const tier: MembershipTier = effectiveMembership(membership, expiresAt)
  const expiryLabel =
    showExpiry && tier !== 'Regular' && expiresAt
      ? ` · until ${formatMembershipExpiry(expiresAt)}`
      : ''

  return (
    <span className={`badge ${membershipBadgeClass(tier)} ${className}`.trim()}>
      {tier}
      {expiryLabel}
    </span>
  )
}
