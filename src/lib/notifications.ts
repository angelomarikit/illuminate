import type { AppRole } from './roles'
import { normalizeRole } from './roles'

export type NotificationKind =
  | 'appointment_soon'
  | 'booking_pending'
  | 'leave_pending'
  | 'low_stock'

export type AppNotification = {
  key: string
  kind: NotificationKind
  title: string
  body: string
  href: string
  createdAt: string
  unread: boolean
}

const ROLE_KINDS: Record<AppRole, NotificationKind[]> = {
  Staff: ['appointment_soon', 'booking_pending'],
  HR: ['leave_pending'],
  Inventory: ['low_stock'],
  Owner: ['appointment_soon', 'booking_pending', 'leave_pending', 'low_stock'],
  Admin: ['appointment_soon', 'booking_pending', 'leave_pending', 'low_stock'],
  Client: [],
}

export function kindsForRole(role: string | null | undefined): NotificationKind[] {
  return ROLE_KINDS[normalizeRole(role)] ?? []
}

/** Minutes until HH:mm today (local). Negative if already passed. */
export function minutesUntilTimeToday(hhmm: string, now = new Date()): number | null {
  const [hs, ms = '0'] = String(hhmm).slice(0, 5).split(':')
  const h = Number(hs)
  const m = Number(ms)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const target = new Date(now)
  target.setHours(h, m, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 60000)
}

export function formatStandardTime(hhmm: string): string {
  const [hs, ms = '00'] = String(hhmm).slice(0, 5).split(':')
  let h = Number(hs)
  if (!Number.isFinite(h)) return hhmm
  const period = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${ms} ${period}`
}

type AptRow = {
  id: string
  customer_name: string
  service_name: string
  appointment_date: string
  appointment_time: string
  status: string
}

type LeaveRow = {
  id: string
  staff_name: string | null
  leave_type: string
  date_from: string
  date_to: string
  status: string
  created_at?: string | null
}

type InvRow = {
  id: string
  name: string
  stock: number
  reorder_level: number
  unit?: string | null
}

export function buildNotifications(input: {
  role: string | null | undefined
  todayIso: string
  now?: Date
  appointments?: AptRow[]
  leaves?: LeaveRow[]
  inventory?: InvRow[]
  ackedKeys: Set<string>
}): AppNotification[] {
  const kinds = new Set(kindsForRole(input.role))
  const now = input.now ?? new Date()
  const items: AppNotification[] = []

  if (kinds.has('appointment_soon') && input.appointments) {
    for (const apt of input.appointments) {
      if (apt.appointment_date !== input.todayIso) continue
      if (['cancelled', 'declined', 'completed'].includes(apt.status)) continue
      const mins = minutesUntilTimeToday(apt.appointment_time, now)
      if (mins == null || mins < 0 || mins > 120) continue
      const key = `appointment_soon:${apt.id}`
      const when = formatStandardTime(String(apt.appointment_time).slice(0, 5))
      items.push({
        key,
        kind: 'appointment_soon',
        title: mins <= 30 ? 'Booking starting soon' : 'Booking in under 2 hours',
        body: `${apt.customer_name} · ${apt.service_name} at ${when}`,
        href: '/appointments',
        createdAt: `${apt.appointment_date}T${String(apt.appointment_time).slice(0, 8)}`,
        unread: !input.ackedKeys.has(key),
      })
    }
  }

  if (kinds.has('booking_pending') && input.appointments) {
    for (const apt of input.appointments) {
      if (apt.status !== 'pending') continue
      const key = `booking_pending:${apt.id}`
      const when = formatStandardTime(String(apt.appointment_time).slice(0, 5))
      items.push({
        key,
        kind: 'booking_pending',
        title: 'Website booking needs approval',
        body: `${apt.customer_name} · ${apt.service_name} · ${apt.appointment_date} ${when}`,
        href: '/appointments',
        createdAt: apt.appointment_date,
        unread: !input.ackedKeys.has(key),
      })
    }
  }

  if (kinds.has('leave_pending') && input.leaves) {
    for (const leave of input.leaves) {
      if (leave.status !== 'pending') continue
      const key = `leave_pending:${leave.id}`
      items.push({
        key,
        kind: 'leave_pending',
        title: 'Leave application pending',
        body: `${leave.staff_name || 'Staff'} · ${leave.leave_type} (${leave.date_from} → ${leave.date_to})`,
        href: '/staff',
        createdAt: leave.created_at || leave.date_from,
        unread: !input.ackedKeys.has(key),
      })
    }
  }

  if (kinds.has('low_stock') && input.inventory) {
    for (const item of input.inventory) {
      if (Number(item.stock) > Number(item.reorder_level)) continue
      const key = `low_stock:${item.id}`
      items.push({
        key,
        kind: 'low_stock',
        title: 'Restock needed',
        body: `${item.name} is at ${item.stock}${item.unit ? ` ${item.unit}` : ''} (threshold ${item.reorder_level})`,
        href: '/inventory/reorder',
        createdAt: input.todayIso,
        unread: !input.ackedKeys.has(key),
      })
    }
  }

  return items.sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}
