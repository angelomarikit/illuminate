export type MembershipTier = 'Regular' | 'VIP' | 'VVIP'

const TIER_RANK: Record<MembershipTier, number> = {
  Regular: 0,
  VIP: 1,
  VVIP: 2,
}

export function normalizeMembership(value: string | null | undefined): MembershipTier {
  const raw = (value || '').trim()
  if (raw === 'VVIP' || raw === 'Luxe') return 'VVIP'
  if (raw === 'VIP' || raw === 'Glow') return 'VIP'
  return 'Regular'
}

export function isMembershipActive(
  expiresAt: string | null | undefined,
  today = new Date(),
): boolean {
  if (!expiresAt) return false
  const end = new Date(`${expiresAt.slice(0, 10)}T23:59:59`)
  if (Number.isNaN(end.getTime())) return false
  return end.getTime() >= today.getTime()
}

/** Active paid tier, or Regular when expired / unset. */
export function effectiveMembership(
  membership: string | null | undefined,
  expiresAt: string | null | undefined,
  today = new Date(),
): MembershipTier {
  const tier = normalizeMembership(membership)
  if (tier === 'Regular') return 'Regular'
  return isMembershipActive(expiresAt, today) ? tier : 'Regular'
}

export function membershipBadgeClass(tier: MembershipTier): string {
  if (tier === 'VVIP') return 'badge-vvip'
  if (tier === 'VIP') return 'badge-vip'
  return 'badge-regular'
}

export function formatMembershipExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) return ''
  const d = new Date(`${expiresAt.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return expiresAt.slice(0, 10)
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function addYears(from: Date, years: number): Date {
  const next = new Date(from)
  next.setFullYear(next.getFullYear() + years)
  return next
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Apply a POS membership purchase (1 year per quantity unit).
 * Does not downgrade an active higher tier.
 */
export function resolveMembershipAfterPurchase(
  currentMembership: string | null | undefined,
  currentExpiresAt: string | null | undefined,
  purchased: 'VIP' | 'VVIP',
  years = 1,
  today = new Date(),
): { membership: MembershipTier; membershipExpiresAt: string } {
  const qtyYears = Math.max(1, Math.floor(years) || 1)
  const stored = normalizeMembership(currentMembership)
  const active = effectiveMembership(stored, currentExpiresAt, today)

  if (TIER_RANK[purchased] < TIER_RANK[active]) {
    return {
      membership: active,
      membershipExpiresAt: (currentExpiresAt || toDateOnly(addYears(today, qtyYears))).slice(0, 10),
    }
  }

  let start = today
  if (
    active === purchased &&
    currentExpiresAt &&
    isMembershipActive(currentExpiresAt, today)
  ) {
    const exp = new Date(`${currentExpiresAt.slice(0, 10)}T12:00:00`)
    if (!Number.isNaN(exp.getTime()) && exp > today) start = exp
  }

  return {
    membership: purchased,
    membershipExpiresAt: toDateOnly(addYears(start, qtyYears)),
  }
}

export function membershipTierFromService(input: {
  membershipTier?: string | null
  category?: string
  name?: string
}): 'VIP' | 'VVIP' | null {
  const tier = (input.membershipTier || '').toUpperCase()
  if (tier === 'VVIP') return 'VVIP'
  if (tier === 'VIP') return 'VIP'
  const name = (input.name || '').toUpperCase()
  if (input.category === 'Membership' || name.includes('MEMBERSHIP')) {
    if (name.includes('VVIP')) return 'VVIP'
    if (name.includes('VIP')) return 'VIP'
  }
  return null
}
