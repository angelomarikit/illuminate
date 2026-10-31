import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { CareNotesPanel } from './CareNotesPanel'
import { MembershipBadge } from './MembershipBadge'
import { StaffAssignField } from './StaffAssignField'
import { StatusMessage } from './StatusMessage'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { formatCurrency, isUuid } from '../lib/utils'
import { syncSessionSlotAppointment } from '../lib/sessionAppointments'
import { supabase } from '../lib/supabase'
import './SessionScheduleModal.css'

type ProfileOption = { id: string; full_name: string; role?: string }

export type SessionPackageForModal = {
  id: string
  customer_id: string | null
  customer_name: string
  service_id?: string | null
  service_name: string
  total_sessions: number
  sessions_used: number
  package_amount: number
  discount_amount: number
  sold_on: string
  next_session_date: string | null
  sale_receipt_no: string | null
  doctor_notes: string | null
  administered_by: string | null
  consult_by: string | null
  sales_by: string | null
  status: 'active' | 'completed' | 'cancelled'
  branch_id?: string | null
}

export type SessionSlotStatus = 'pending' | 'scheduled' | 'finished' | 'cancelled' | 'no_show'

type SlotDraft = {
  id: string | null
  sessionNumber: number
  scheduledDate: string
  scheduledTime: string
  status: SessionSlotStatus
  notes: string
  handledBy: string
  incentiveAmount: string
}

type MembershipInfo = {
  membership: string
  membershipExpiresAt: string | null
} | null

type Props = {
  pkg: SessionPackageForModal
  membership?: MembershipInfo
  open: boolean
  onClose: () => void
  onSaved: (message: string) => void
  onSaveDoctorNotes: (notes: string) => Promise<void>
  savingNotes?: boolean
}

const STATUS_OPTIONS: { value: SessionSlotStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'finished', label: 'Finished' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
]

function emptySlots(total: number, used: number, defaultHandler = ''): SlotDraft[] {
  return Array.from({ length: Math.max(1, total) }, (_, i) => {
    const n = i + 1
    return {
      id: null,
      sessionNumber: n,
      scheduledDate: '',
      scheduledTime: '',
      status: n <= used ? ('finished' as const) : ('pending' as const),
      notes: '',
      handledBy: defaultHandler,
      incentiveAmount: '',
    }
  })
}

export function SessionScheduleModal({
  pkg,
  membership,
  open,
  onClose,
  onSaved,
  onSaveDoctorNotes,
  savingNotes,
}: Props) {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const [slots, setSlots] = useState<SlotDraft[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      const [{ data, error: err }, { data: profileRows }] = await Promise.all([
        supabase
          .from('client_session_slots')
          .select(
            'id, session_number, scheduled_date, scheduled_time, status, notes, handled_by, incentive_amount',
          )
          .eq('package_id', pkg.id)
          .order('session_number'),
        supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('role', ['Owner', 'Admin', 'Receptionist', 'Staff', 'Inventory', 'HR'])
          .order('full_name'),
      ])

      if (cancelled) return

      setProfiles((profileRows as ProfileOption[] | null) ?? [])
      const defaultHandler = pkg.administered_by?.trim() || ''

      if (err) {
        if (err.message.includes('handled_by') || err.message.includes('incentive_amount')) {
          setError(
            `${err.message} — run supabase/add_session_staff_incentives.sql in Supabase.`,
          )
        } else if (
          err.message.includes('client_session_slots') ||
          err.message.includes('schema cache')
        ) {
          setError(`${err.message} — run supabase/add_client_session_slots.sql in Supabase.`)
        } else {
          setError(err.message)
        }
        setSlots(emptySlots(pkg.total_sessions, pkg.sessions_used, defaultHandler))
      } else if (!data?.length) {
        setSlots(emptySlots(pkg.total_sessions, pkg.sessions_used, defaultHandler))
      } else {
        const byNum = new Map(data.map((row) => [row.session_number as number, row]))
        const total = Math.max(pkg.total_sessions, data.length)
        setSlots(
          Array.from({ length: total }, (_, i) => {
            const n = i + 1
            const row = byNum.get(n) as
              | {
                  id?: string
                  scheduled_date?: string
                  scheduled_time?: string
                  status?: string
                  notes?: string
                  handled_by?: string | null
                  incentive_amount?: number | null
                }
              | undefined
            const timeRaw = row?.scheduled_time ? String(row.scheduled_time) : ''
            const incentive = Number(row?.incentive_amount ?? 0)
            return {
              id: row?.id ?? null,
              sessionNumber: n,
              scheduledDate: row?.scheduled_date ? String(row.scheduled_date).slice(0, 10) : '',
              scheduledTime: timeRaw ? timeRaw.slice(0, 5) : '',
              status:
                (row?.status as SessionSlotStatus) ||
                (n <= pkg.sessions_used ? 'finished' : 'pending'),
              notes: row?.notes ?? '',
              handledBy: (row?.handled_by as string) || defaultHandler,
              incentiveAmount: incentive > 0 ? String(incentive) : '',
            }
          }),
        )
      }
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [open, pkg.id, pkg.total_sessions, pkg.sessions_used, pkg.administered_by])

  const finishedCount = useMemo(
    () => slots.filter((s) => s.status === 'finished').length,
    [slots],
  )
  const scheduledCount = useMemo(
    () => slots.filter((s) => s.status === 'scheduled' || (s.status === 'pending' && s.scheduledDate)).length,
    [slots],
  )
  const left = Math.max(0, pkg.total_sessions - finishedCount)

  function updateSlot(sessionNumber: number, patch: Partial<SlotDraft>) {
    setSlots((prev) =>
      prev.map((slot) => (slot.sessionNumber === sessionNumber ? { ...slot, ...patch } : slot)),
    )
  }

  async function saveAll() {
    setSaving(true)
    setError('')

    const payload = slots.map((slot) => ({
      // Always send id — some production tables lack gen_random_uuid() default on id
      id: slot.id || crypto.randomUUID(),
      package_id: pkg.id,
      session_number: slot.sessionNumber,
      scheduled_date: slot.scheduledDate || null,
      scheduled_time: slot.scheduledTime ? `${slot.scheduledTime}:00` : null,
      status: slot.status,
      notes: slot.notes.trim() || null,
      handled_by: slot.handledBy.trim() || null,
      incentive_amount: Math.max(0, Number(slot.incentiveAmount) || 0),
      updated_at: new Date().toISOString(),
    }))

    const { data: upserted, error: upsertErr } = await supabase
      .from('client_session_slots')
      .upsert(payload, { onConflict: 'package_id,session_number' })
      .select('id, session_number, handled_by, incentive_amount, status, scheduled_date')

    if (upsertErr) {
      setSaving(false)
      setError(
        upsertErr.message.includes('handled_by') || upsertErr.message.includes('incentive_amount')
          ? `${upsertErr.message} — run supabase/add_session_staff_incentives.sql in Supabase.`
          : upsertErr.message.includes('client_session_slots') ||
              upsertErr.message.includes('schema cache')
            ? `${upsertErr.message} — run supabase/add_client_session_slots.sql in Supabase.`
            : upsertErr.message,
      )
      return
    }

    const slotsByNumber = new Map(
      ((upserted as { id: string; session_number: number }[] | null) ?? []).map((row) => [
        row.session_number,
        row.id,
      ]),
    )
    setSlots((prev) =>
      prev.map((slot) => ({
        ...slot,
        id: slotsByNumber.get(slot.sessionNumber) || slot.id,
      })),
    )

    const nextDate =
      slots
        .filter((s) => s.status !== 'finished' && s.status !== 'cancelled' && s.scheduledDate)
        .map((s) => s.scheduledDate)
        .sort()[0] ?? null

    const allDone = finishedCount >= pkg.total_sessions
    const { error: pkgErr } = await supabase
      .from('client_session_packages')
      .update({
        sessions_used: finishedCount,
        next_session_date: nextDate,
        status: allDone ? 'completed' : pkg.status === 'cancelled' ? 'cancelled' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', pkg.id)

    if (pkgErr) {
      setSaving(false)
      setError(pkgErr.message)
      return
    }

    let customerPhone: string | null = null
    let customerEmail: string | null = null
    if (pkg.customer_id && isUuid(pkg.customer_id)) {
      const { data: cust } = await supabase
        .from('customers')
        .select('phone, email')
        .eq('id', pkg.customer_id)
        .maybeSingle()
      customerPhone = (cust as { phone?: string } | null)?.phone ?? null
      customerEmail = (cust as { email?: string } | null)?.email ?? null
    }

    const deductNotes: string[] = []
    const finishedCountSaved = slots.filter((s) => s.status === 'finished').length
    if (finishedCountSaved > 0) {
      deductNotes.push(
        `${finishedCountSaved} finished session(s): linked supplies auto-deduct from inventory (once each).`,
      )
    }
    try {
      for (const slot of slots) {
        const slotId = slotsByNumber.get(slot.sessionNumber) || slot.id
        const handler = slot.handledBy.trim() || pkg.administered_by?.trim() || null
        await syncSessionSlotAppointment({
          packageId: pkg.id,
          sessionNumber: slot.sessionNumber,
          customerName: pkg.customer_name,
          serviceName: pkg.service_name,
          staffName: handler,
          scheduledDate: slot.scheduledDate || null,
          scheduledTime: slot.scheduledTime || null,
          status: slot.status,
          notes: slot.notes.trim() || null,
          branchId: pkg.branch_id ?? null,
          customerPhone,
          customerEmail,
        })

        const incentiveAmt = Math.max(0, Number(slot.incentiveAmount) || 0)
        if (slot.status === 'finished' && slotId && handler && incentiveAmt > 0) {
          const visitDate = slot.scheduledDate || new Date().toISOString().slice(0, 10)
          const profileId = profiles.find((p) => p.full_name === handler)?.id ?? null
          const payout = {
            branch_id:
              pkg.branch_id && isUuid(pkg.branch_id)
                ? pkg.branch_id
                : isUuid(branchId)
                  ? branchId
                  : null,
            profile_id: profileId,
            staff_name: handler,
            incentive_type: 'service_commission' as const,
            period_start: visitDate,
            period_end: visitDate,
            sales_amount: 0,
            computed_amount: incentiveAmt,
            adjustment: 0,
            final_amount: incentiveAmt,
            source: 'session_finished',
            status: 'draft',
            notes: `${pkg.service_name} · Session ${slot.sessionNumber} · ${pkg.customer_name}`,
            session_slot_id: slotId,
            created_by: user?.id && isUuid(user.id) ? user.id : null,
          }
          const { data: existingInc } = await supabase
            .from('incentive_payouts')
            .select('id')
            .eq('session_slot_id', slotId)
            .maybeSingle()
          const { error: incErr } = existingInc?.id
            ? await supabase.from('incentive_payouts').update(payout).eq('id', existingInc.id)
            : await supabase.from('incentive_payouts').insert(payout)
          if (incErr) {
            deductNotes.push(
              `Session ${slot.sessionNumber}: incentive not saved — run supabase/add_session_staff_incentives.sql (${incErr.message})`,
            )
          } else {
            deductNotes.push(
              `Session ${slot.sessionNumber}: ₱${incentiveAmt.toLocaleString('en-PH')} incentive draft for ${handler}`,
            )
          }
        }
      }
    } catch (syncErr) {
      setSaving(false)
      setError(syncErr instanceof Error ? syncErr.message : 'Could not sync session to calendar.')
      return
    }

    setSaving(false)

    const base = `Saved ${slots.length} sessions for ${pkg.customer_name} · ${finishedCount} finished · ${left} left.`
    const uniqueNotes = [...new Set(deductNotes)]
    onSaved(uniqueNotes.length ? `${base}\n${uniqueNotes.join('\n')}` : base)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="confirm-modal-overlay ssm-overlay"
      role="presentation"
      onClick={() => {
        if (!saving) onClose()
      }}
    >
      <div
        className="confirm-modal ssm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-schedule-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ssm-head">
          <div className="ssm-head-copy">
            <p className="confirm-modal-kicker">Client sessions</p>
            <h2 id="session-schedule-title" className="confirm-modal-title">
              Schedule {pkg.customer_name}
            </h2>
            <div className="ssm-head-meta">
              {membership ? (
                <MembershipBadge
                  membership={membership.membership}
                  expiresAt={membership.membershipExpiresAt}
                  showExpiry
                />
              ) : null}
              <span>{pkg.service_name}</span>
              {pkg.sale_receipt_no ? <span>{pkg.sale_receipt_no}</span> : null}
            </div>
          </div>
          <button
            className="btn-icon"
            type="button"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="ssm-body">
          {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

          <div className="ssm-summary">
            <div>
              <span>Sessions</span>
              <strong>
                {left} left · {finishedCount}/{pkg.total_sessions} finished
              </strong>
            </div>
            <div>
              <span>Package</span>
              <strong>{formatCurrency(pkg.package_amount)}</strong>
            </div>
            <div>
              <span>Sold on</span>
              <strong>{pkg.sold_on}</strong>
            </div>
            <div>
              <span>Planned</span>
              <strong>{scheduledCount} dated</strong>
            </div>
          </div>

          <p className="ssm-hint">
            Set a date for each visit and mark status as Pending, Scheduled, or Finished. Saving
            updates remaining sessions. When you mark <strong>Finished</strong>, linked supplies
            are deducted from inventory automatically (once per session).
          </p>

          {loading ? (
            <p className="ssm-loading">Loading session slots…</p>
          ) : (
            <div className="ssm-slot-list">
              {slots.map((slot) => (
                <article
                  key={slot.sessionNumber}
                  className={`ssm-slot-card is-${slot.status}`}
                >
                  <div className="ssm-slot-num">
                    <CalendarDays size={16} aria-hidden />
                    <span>Session {slot.sessionNumber}</span>
                  </div>
                  <div className="ssm-slot-grid">
                    <div className="field">
                      <label htmlFor={`slot-date-${slot.sessionNumber}`}>Date</label>
                      <input
                        id={`slot-date-${slot.sessionNumber}`}
                        className="input"
                        type="date"
                        value={slot.scheduledDate}
                        disabled={saving}
                        onChange={(e) => {
                          const date = e.target.value
                          updateSlot(slot.sessionNumber, {
                            scheduledDate: date,
                            status:
                              date && slot.status === 'pending' ? 'scheduled' : slot.status,
                          })
                        }}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`slot-time-${slot.sessionNumber}`}>Time</label>
                      <input
                        id={`slot-time-${slot.sessionNumber}`}
                        className="input"
                        type="time"
                        value={slot.scheduledTime}
                        disabled={saving}
                        onChange={(e) =>
                          updateSlot(slot.sessionNumber, { scheduledTime: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`slot-status-${slot.sessionNumber}`}>Status</label>
                      <select
                        id={`slot-status-${slot.sessionNumber}`}
                        className="select"
                        value={slot.status}
                        disabled={saving}
                        onChange={(e) =>
                          updateSlot(slot.sessionNumber, {
                            status: e.target.value as SessionSlotStatus,
                          })
                        }
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field ssm-slot-notes">
                      <label htmlFor={`slot-notes-${slot.sessionNumber}`}>Notes</label>
                      <input
                        id={`slot-notes-${slot.sessionNumber}`}
                        className="input"
                        value={slot.notes}
                        disabled={saving}
                        placeholder="Optional"
                        onChange={(e) =>
                          updateSlot(slot.sessionNumber, { notes: e.target.value })
                        }
                      />
                    </div>
                    <div className="ssm-slot-staff">
                      <StaffAssignField
                        compact
                        label="Handled by (staff)"
                        value={slot.handledBy}
                        profiles={profiles}
                        required={slot.status === 'finished'}
                        onChange={(value) =>
                          updateSlot(slot.sessionNumber, { handledBy: value })
                        }
                      />
                      <div className="field">
                        <label htmlFor={`slot-incentive-${slot.sessionNumber}`}>
                          Incentive ₱ (optional)
                        </label>
                        <input
                          id={`slot-incentive-${slot.sessionNumber}`}
                          className="input"
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={saving}
                          placeholder="0"
                          value={slot.incentiveAmount}
                          onChange={(e) =>
                            updateSlot(slot.sessionNumber, { incentiveAmount: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="ssm-staff">
            <div>
              <span>Administered by</span>
              <strong>{pkg.administered_by || '—'}</strong>
            </div>
            <div>
              <span>Consult by</span>
              <strong>{pkg.consult_by || '—'}</strong>
            </div>
            <div>
              <span>Sales by</span>
              <strong>{pkg.sales_by || '—'}</strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>{formatCurrency(pkg.discount_amount || 0)}</strong>
            </div>
          </div>

          <CareNotesPanel
            customerId={pkg.customer_id}
            sessionPackageId={pkg.id}
            doctorNotes={pkg.doctor_notes ?? ''}
            savingNotes={Boolean(savingNotes)}
            compact
            onSaveDoctorNotes={onSaveDoctorNotes}
          />
        </div>

        <div className="ssm-foot">
          <button className="btn btn-ghost" type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving || loading}
            onClick={() => void saveAll()}
          >
            {saving ? 'Saving…' : `Save schedule (${slots.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
