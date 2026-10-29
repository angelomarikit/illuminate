import { supabase } from './supabase'
import { isUuid } from './utils'

/** Clinic booking slots: 9:00 AM – 9:00 PM in 30-minute steps. */
export function buildClinicTimeSlots(startHour = 9, endHour = 21): string[] {
  const out: string[] = []
  for (let h = startHour; h <= endHour; h++) {
    const hh = String(h).padStart(2, '0')
    out.push(`${hh}:00`)
    if (h < endHour) out.push(`${hh}:30`)
  }
  return out
}

export const CLINIC_TIME_SLOTS = buildClinicTimeSlots()

/** Marker stored in appointments.special_note to link a calendar row to a package session. */
export function sessionSlotMarker(packageId: string, sessionNumber: number) {
  return `[session_slot:${packageId}:${sessionNumber}]`
}

/** Floor a clock time to the nearest 30-minute calendar row (e.g. 14:45 → 14:30). */
export function hourBucket(time: string): string {
  const [hs, ms = '00'] = String(time || '').slice(0, 5).split(':')
  const h = Number(hs)
  const m = Number(ms)
  if (!Number.isFinite(h)) return '09:00'
  const half = Number.isFinite(m) && m >= 30 ? 30 : 0
  return `${String(h).padStart(2, '0')}:${String(half).padStart(2, '0')}`
}

function mapSlotStatusToAppointment(
  status: string,
): 'pending' | 'confirmed' | 'completed' | 'cancelled' {
  if (status === 'finished') return 'completed'
  if (status === 'cancelled' || status === 'no_show') return 'cancelled'
  if (status === 'pending') return 'pending'
  return 'confirmed'
}

export type SyncSessionAppointmentInput = {
  packageId: string
  sessionNumber: number
  customerName: string
  serviceName: string
  staffName?: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  status: string
  notes?: string | null
  branchId?: string | null
  customerPhone?: string | null
  customerEmail?: string | null
}

/**
 * Upsert / cancel the Appointment Calendar row for one package session slot.
 * Returns appointment id when a calendar row exists (needed for supply deduction).
 */
export async function syncSessionSlotAppointment(
  input: SyncSessionAppointmentInput,
): Promise<string | null> {
  const marker = sessionSlotMarker(input.packageId, input.sessionNumber)
  const rawTime = input.scheduledTime ? String(input.scheduledTime).slice(0, 5) : ''
  const date = input.scheduledDate ? String(input.scheduledDate).slice(0, 10) : ''
  const isFinished = input.status === 'finished'
  // Finished sessions still need a calendar row for inventory deduction even without a clock time.
  const time = rawTime || (isFinished && date ? '12:00' : '')
  const shouldList =
    Boolean(date) &&
    Boolean(time) &&
    input.status !== 'cancelled' &&
    input.status !== 'no_show' &&
    input.status !== 'pending'

  const { data: existing } = await supabase
    .from('appointments')
    .select('id')
    .ilike('special_note', `%${marker}%`)
    .limit(1)
    .maybeSingle()

  if (!shouldList) {
    if (existing?.id) {
      await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          cancellation_reason:
            input.status === 'no_show' ? 'No-show (session)' : 'Session schedule cleared',
        })
        .eq('id', existing.id)
    }
    return null
  }

  const noteParts = [
    input.notes?.trim() || '',
    `Session ${input.sessionNumber}`,
    marker,
  ].filter(Boolean)
  // Keep base catalog service name (no "· Session N") so supply BOM matching works.
  const payload = {
    customer_name: input.customerName,
    service_name: input.serviceName,
    staff_name: input.staffName?.trim() || null,
    appointment_date: date,
    appointment_time: time,
    duration_min: 60,
    status: mapSlotStatusToAppointment(input.status),
    type: 'appointment' as const,
    source: 'avail_service',
    special_note: noteParts.join('\n'),
    branch_id: input.branchId && isUuid(input.branchId) ? input.branchId : null,
    customer_phone: input.customerPhone?.trim() || null,
    customer_email: input.customerEmail?.trim() || null,
  }

  if (existing?.id) {
    const { error } = await supabase.from('appointments').update(payload).eq('id', existing.id)
    if (error) throw new Error(error.message)
    return existing.id
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('appointments')
    .insert(payload)
    .select('id')
    .maybeSingle()
  if (insertErr) throw new Error(insertErr.message)
  return (inserted as { id?: string } | null)?.id ?? null
}
