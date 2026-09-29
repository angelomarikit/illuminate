import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { CareNotesPanel } from './CareNotesPanel'
import { MembershipBadge } from './MembershipBadge'
import { StatusMessage } from './StatusMessage'
import { formatCurrency } from '../lib/utils'
import { supabase } from '../lib/supabase'
import './SessionScheduleModal.css'

export type SessionPackageForModal = {
  id: string
  customer_id: string | null
  customer_name: string
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
}

export type SessionSlotStatus = 'pending' | 'scheduled' | 'finished' | 'cancelled' | 'no_show'

type SlotDraft = {
  id: string | null
  sessionNumber: number
  scheduledDate: string
  scheduledTime: string
  status: SessionSlotStatus
  notes: string
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

function emptySlots(total: number, used: number): SlotDraft[] {
  return Array.from({ length: Math.max(1, total) }, (_, i) => {
    const n = i + 1
    return {
      id: null,
      sessionNumber: n,
      scheduledDate: '',
      scheduledTime: '',
      status: n <= used ? ('finished' as const) : ('pending' as const),
      notes: '',
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
  const [slots, setSlots] = useState<SlotDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      const { data, error: err } = await supabase
        .from('client_session_slots')
        .select('id, session_number, scheduled_date, scheduled_time, status, notes')
        .eq('package_id', pkg.id)
        .order('session_number')

      if (cancelled) return

      if (err) {
        if (
          err.message.includes('client_session_slots') ||
          err.message.includes('schema cache')
        ) {
          setError(`${err.message} — run supabase/add_client_session_slots.sql in Supabase.`)
          setSlots(emptySlots(pkg.total_sessions, pkg.sessions_used))
        } else {
          setError(err.message)
          setSlots(emptySlots(pkg.total_sessions, pkg.sessions_used))
        }
      } else if (!data?.length) {
        setSlots(emptySlots(pkg.total_sessions, pkg.sessions_used))
      } else {
        const byNum = new Map(data.map((row) => [row.session_number as number, row]))
        const total = Math.max(pkg.total_sessions, data.length)
        setSlots(
          Array.from({ length: total }, (_, i) => {
            const n = i + 1
            const row = byNum.get(n)
            const timeRaw = row?.scheduled_time ? String(row.scheduled_time) : ''
            return {
              id: (row?.id as string) ?? null,
              sessionNumber: n,
              scheduledDate: row?.scheduled_date ? String(row.scheduled_date).slice(0, 10) : '',
              scheduledTime: timeRaw ? timeRaw.slice(0, 5) : '',
              status: (row?.status as SessionSlotStatus) || (n <= pkg.sessions_used ? 'finished' : 'pending'),
              notes: (row?.notes as string) ?? '',
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
  }, [open, pkg.id, pkg.total_sessions, pkg.sessions_used])

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
      ...(slot.id ? { id: slot.id } : {}),
      package_id: pkg.id,
      session_number: slot.sessionNumber,
      scheduled_date: slot.scheduledDate || null,
      scheduled_time: slot.scheduledTime ? `${slot.scheduledTime}:00` : null,
      status: slot.status,
      notes: slot.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }))

    const { error: upsertErr } = await supabase.from('client_session_slots').upsert(payload, {
      onConflict: 'package_id,session_number',
    })

    if (upsertErr) {
      setSaving(false)
      setError(
        upsertErr.message.includes('client_session_slots') || upsertErr.message.includes('schema cache')
          ? `${upsertErr.message} — run supabase/add_client_session_slots.sql in Supabase.`
          : upsertErr.message,
      )
      return
    }

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

    setSaving(false)
    if (pkgErr) {
      setError(pkgErr.message)
      return
    }

    onSaved(
      `Saved ${slots.length} sessions for ${pkg.customer_name} · ${finishedCount} finished · ${left} left.`,
    )
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
            updates remaining sessions on the package.
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
