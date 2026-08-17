export type ClientNoticeKind =
  | 'booking_received'
  | 'booking_approved'
  | 'booking_declined'
  | 'booking_cancelled'
  | 'appointment_soon'
  | 'wallet_topup'

export type ClientNotice = {
  key: string
  kind: ClientNoticeKind
  title: string
  body: string
  href: string
  createdAt: string
  unread: boolean
  source: 'db' | 'derived'
}

export const KIND_LABEL: Record<ClientNoticeKind, string> = {
  booking_received: 'Booking',
  booking_approved: 'Approved',
  booking_declined: 'Declined',
  booking_cancelled: 'Cancelled',
  appointment_soon: 'Upcoming',
  wallet_topup: 'Wallet',
}

function formatTime(hhmm: string) {
  const [hs, ms = '00'] = String(hhmm).slice(0, 5).split(':')
  let h = Number(hs)
  if (!Number.isFinite(h)) return hhmm
  const period = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${ms} ${period}`
}

function minutesUntilToday(hhmm: string, now = new Date()) {
  const [hs, ms = '0'] = String(hhmm).slice(0, 5).split(':')
  const h = Number(hs)
  const m = Number(ms)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const target = new Date(now)
  target.setHours(h, m, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 60000)
}

type Apt = {
  id: string
  service_name: string
  appointment_date: string
  appointment_time: string
  status: string
}

/** Upcoming visits within 2 hours (same spirit as staff web inbox). */
export function buildUpcomingNotices(input: {
  todayIso: string
  appointments: Apt[]
  ackedKeys: Set<string>
  now?: Date
}): ClientNotice[] {
  const now = input.now ?? new Date()
  const items: ClientNotice[] = []

  for (const apt of input.appointments) {
    if (apt.appointment_date !== input.todayIso) continue
    if (['cancelled', 'declined', 'completed'].includes(apt.status)) continue
    const mins = minutesUntilToday(apt.appointment_time, now)
    if (mins == null || mins < 0 || mins > 120) continue
    const key = `appointment_soon:${apt.id}`
    items.push({
      key,
      kind: 'appointment_soon',
      title: mins <= 30 ? 'Visit starting soon' : 'Visit in under 2 hours',
      body: `${apt.service_name} at ${formatTime(String(apt.appointment_time))}`,
      href: '/(tabs)/appointments',
      createdAt: `${apt.appointment_date}T${String(apt.appointment_time).slice(0, 8)}`,
      unread: !input.ackedKeys.has(key),
      source: 'derived',
    })
  }

  return items
}
