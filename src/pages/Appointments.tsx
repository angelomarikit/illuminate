import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Mail, MessageCircle, Phone, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import { isUuid } from '../lib/utils'
import type { Appointment, AppointmentStatus } from '../types'
import './appointments.css'

const hours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']

function weekDays() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric' })
    return { key, label }
  })
}

type Row = {
  id: string
  branch_id: string | null
  customer_name: string
  service_name: string
  staff_name: string | null
  appointment_date: string
  appointment_time: string
  duration_min: number
  status: string
  type: string
  customer_email: string | null
  customer_phone: string | null
  customer_age: number | null
  customer_sex: string | null
  customer_address: string | null
  medical_history: string | null
  special_note: string | null
  source: string | null
}

function mapRow(row: Row): Appointment {
  return {
    id: row.id,
    customerName: row.customer_name,
    serviceName: row.service_name,
    staffName: row.staff_name ?? '',
    date: row.appointment_date,
    time: String(row.appointment_time).slice(0, 5),
    durationMin: row.duration_min,
    status: row.status as AppointmentStatus,
    branchId: row.branch_id ?? '',
    type: row.type as Appointment['type'],
    customerEmail: row.customer_email ?? '',
    customerPhone: row.customer_phone ?? '',
    customerAge: row.customer_age,
    customerSex: row.customer_sex ?? '',
    customerAddress: row.customer_address ?? '',
    medicalHistory: row.medical_history ?? '',
    specialNote: row.special_note ?? '',
    source: row.source ?? 'clinic',
  }
}

const emptyForm = {
  customerName: '',
  serviceName: '',
  staffName: '',
  date: new Date().toISOString().slice(0, 10),
  time: '10:00',
  durationMin: '60',
}

type DecisionModal = {
  appointment: Appointment
  action: 'approve' | 'decline'
}

function phoneDigits(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 11) return `63${digits.slice(1)}`
  return digits
}

function buildEmail(apt: Appointment, approved: boolean) {
  const subject = approved
    ? `Illuminate appointment confirmed — ${apt.date} ${apt.time}`
    : `Illuminate appointment update — ${apt.date} ${apt.time}`
  const body = approved
    ? `Hi ${apt.customerName},\n\nYour ${apt.serviceName} appointment is confirmed for ${apt.date} at ${apt.time}.\n\nPlease arrive 10 minutes early.\n\n— Illuminate Medical Aesthetics`
    : `Hi ${apt.customerName},\n\nThank you for your interest in ${apt.serviceName}. Unfortunately we cannot confirm ${apt.date} at ${apt.time}. Please reply to choose another schedule.\n\n— Illuminate Medical Aesthetics`
  return `mailto:${encodeURIComponent(apt.customerEmail || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function buildSms(apt: Appointment, approved: boolean) {
  const to = phoneDigits(apt.customerPhone || '')
  const body = approved
    ? `Hi ${apt.customerName}, your Illuminate ${apt.serviceName} is confirmed for ${apt.date} at ${apt.time}. See you soon!`
    : `Hi ${apt.customerName}, we couldn't confirm ${apt.date} ${apt.time} for ${apt.serviceName}. Please message us to reschedule. — Illuminate`
  return to
    ? `sms:${to}?&body=${encodeURIComponent(body)}`
    : `sms:?&body=${encodeURIComponent(body)}`
}

export function Appointments() {
  const { branchId } = useBranch()
  const [filter, setFilter] = useState<'all' | 'appointment' | 'walk-in' | 'pending'>('all')
  const [rows, setRows] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [formType, setFormType] = useState<'none' | 'appointment' | 'walk-in'>('none')
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [decision, setDecision] = useState<DecisionModal | null>(null)
  const [decisionSaving, setDecisionSaving] = useState(false)
  const days = useMemo(() => weekDays(), [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('appointments')
      .select('*')
      .order('appointment_date')
      .order('appointment_time')
    // Include unassigned / website bookings (null branch) so pending requests always appear
    if (isUuid(branchId)) {
      q = q.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }
    const { data, error: err } = await q
    if (err) setError(err.message)
    else {
      setError('')
      setRows((data as Row[] | null)?.map(mapRow) ?? [])
    }
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!decision) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !decisionSaving) setDecision(null)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [decision, decisionSaving])

  const pending = useMemo(() => rows.filter((a) => a.status === 'pending'), [rows])

  const filtered = useMemo(() => {
    if (filter === 'pending') return pending
    return rows.filter((a) => {
      if (filter === 'all') return a.status !== 'pending'
      return a.type === filter && a.status !== 'pending'
    })
  }, [rows, filter, pending])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const type = formType === 'walk-in' ? 'walk-in' : 'appointment'
    const { error: err } = await supabase.from('appointments').insert({
      customer_name: form.customerName.trim(),
      service_name: form.serviceName.trim(),
      staff_name: form.staffName.trim() || null,
      appointment_date: form.date,
      appointment_time: form.time,
      duration_min: Number(form.durationMin) || 60,
      status: type === 'walk-in' ? 'walk-in' : 'confirmed',
      type,
      source: 'clinic',
      branch_id: isUuid(branchId) ? branchId : null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setForm(emptyForm)
    setFormType('none')
    setMessage(type === 'walk-in' ? 'Walk-in added.' : 'Booking created.')
    await load()
  }

  async function updateStatus(id: string, status: AppointmentStatus) {
    const { error: err } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (err) setError(err.message)
    else {
      setMessage(`Status updated to ${status}.`)
      await load()
    }
  }

  async function upsertCustomerFromAppointment(apt: Appointment) {
    const email = apt.customerEmail?.trim().toLowerCase() || null
    const phone = apt.customerPhone?.trim() || null
    if (!email && !phone && !apt.customerName.trim()) return null

    let existingId: string | null = null
    if (email) {
      const { data } = await supabase
        .from('customers')
        .select('id')
        .ilike('email', email)
        .limit(1)
        .maybeSingle()
      existingId = data?.id ?? null
    }
    if (!existingId && phone) {
      const { data } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', phone)
        .limit(1)
        .maybeSingle()
      existingId = data?.id ?? null
    }

    const payload = {
      full_name: apt.customerName.trim(),
      email,
      phone,
      age: apt.customerAge ?? null,
      sex: apt.customerSex || null,
      address: apt.customerAddress || null,
      medical_history: apt.medicalHistory || null,
      notes: apt.specialNote || null,
      last_visit: apt.date,
      branch_id: isUuid(branchId) ? branchId : isUuid(apt.branchId) ? apt.branchId : null,
    }

    if (existingId) {
      const { error: updErr } = await supabase.from('customers').update(payload).eq('id', existingId)
      if (updErr) throw updErr
      return existingId
    }

    const { data, error: insErr } = await supabase
      .from('customers')
      .insert({ ...payload, membership: 'Standard', points: 0, cash_in_balance: 0, visits: 0 })
      .select('id')
      .single()
    if (insErr) throw insErr
    return data.id as string
  }

  async function confirmDecision(notify: 'email' | 'sms' | 'none') {
    if (!decision) return
    setDecisionSaving(true)
    setError('')
    const apt = decision.appointment
    const nextStatus: AppointmentStatus =
      decision.action === 'approve' ? 'confirmed' : 'declined'

    try {
      let customerId: string | null = null
      if (decision.action === 'approve') {
        customerId = await upsertCustomerFromAppointment(apt)
      }

      const patch: Record<string, unknown> = { status: nextStatus }
      if (customerId) patch.customer_id = customerId
      if (isUuid(branchId) && !apt.branchId) patch.branch_id = branchId

      const { error: err } = await supabase
        .from('appointments')
        .update(patch)
        .eq('id', apt.id)
      if (err) throw err

      if (notify === 'email' && apt.customerEmail) {
        window.location.href = buildEmail(apt, decision.action === 'approve')
      } else if (notify === 'sms' && apt.customerPhone) {
        window.open(buildSms(apt, decision.action === 'approve'), '_blank')
      }

      setMessage(
        decision.action === 'approve'
          ? 'Appointment approved and saved to Customers.'
          : 'Appointment declined.',
      )
      setDecision(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update appointment.')
    } finally {
      setDecisionSaving(false)
    }
  }

  function statusBadge(status: string) {
    if (status === 'pending') return 'badge badge-warning'
    if (status === 'declined' || status === 'cancelled') return 'badge badge-danger'
    if (status === 'confirmed' || status === 'completed' || status === 'checked-in') {
      return 'badge badge-success'
    }
    return 'badge'
  }

  return (
    <div>
      <PageHeader
        kicker="Booking"
        title="Appointment Calendar"
        subtitle="Approve website booking requests, manage the week board, and handle walk-ins."
        actions={
          <>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setFormType((t) => (t === 'walk-in' ? 'none' : 'walk-in'))}
            >
              Walk-in
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setFormType((t) => (t === 'appointment' ? 'none' : 'appointment'))}
            >
              New Booking
            </button>
          </>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {pending.length ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">Pending website requests ({pending.length})</h2>
          </div>
          <div className="panel-body">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Client</th>
                    <th>Contact</th>
                    <th>Service</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((apt) => (
                    <tr key={apt.id}>
                      <td>
                        <strong>
                          {apt.date} · {apt.time}
                        </strong>
                      </td>
                      <td>
                        <strong>{apt.customerName}</strong>
                        <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                          {[apt.customerSex, apt.customerAge ? `${apt.customerAge}y` : '']
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </td>
                      <td>
                        <div>{apt.customerEmail || '—'}</div>
                        <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                          {apt.customerPhone || '—'}
                        </div>
                      </td>
                      <td>{apt.serviceName}</td>
                      <td style={{ maxWidth: 240 }}>
                        <div style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'grid', gap: 2 }}>
                          {apt.customerAddress ? <span>Addr: {apt.customerAddress}</span> : null}
                          {apt.medicalHistory ? <span>Hx: {apt.medicalHistory}</span> : null}
                          {apt.specialNote ? <span>Note: {apt.specialNote}</span> : null}
                          {!apt.customerAddress && !apt.medicalHistory && !apt.specialNote
                            ? '—'
                            : null}
                        </div>
                      </td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          type="button"
                          onClick={() => setDecision({ appointment: apt, action: 'approve' })}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => setDecision({ appointment: apt, action: 'decline' })}
                        >
                          Decline
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {formType !== 'none' ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">
              {formType === 'walk-in' ? 'New walk-in' : 'New booking'}
            </h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={onSubmit}
              style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              <div className="field">
                <label>Client</label>
                <input
                  className="input"
                  required
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Service</label>
                <input
                  className="input"
                  required
                  value={form.serviceName}
                  onChange={(e) => setForm((f) => ({ ...f, serviceName: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Staff</label>
                <input
                  className="input"
                  value={form.staffName}
                  onChange={(e) => setForm((f) => ({ ...f, staffName: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Duration (min)</label>
                <input
                  className="input"
                  type="number"
                  value={form.durationMin}
                  onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Date</label>
                <input
                  className="input"
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Time</label>
                <select
                  className="select"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                >
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="chips" style={{ marginBottom: 16 }}>
        {(['all', 'pending', 'appointment', 'walk-in'] as const).map((item) => (
          <button
            key={item}
            className={`chip ${filter === item ? 'active' : ''}`}
            onClick={() => setFilter(item)}
            type="button"
          >
            {item === 'all'
              ? 'Scheduled'
              : item === 'pending'
                ? `Pending (${pending.length})`
                : item === 'walk-in'
                  ? 'Walk-in'
                  : 'Appointments'}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2 className="panel-title">Week Board</h2>
        </div>
        <div className="panel-body calendar-wrap">
          <div className="calendar-grid">
            <div className="calendar-corner" />
            {days.map((day) => (
              <div className="calendar-day-head" key={day.key}>
                {day.label}
              </div>
            ))}
            {hours.map((hour) => (
              <div className="calendar-row" key={hour}>
                <div className="calendar-hour">{hour}</div>
                {days.map((day) => {
                  const slot = rows.find(
                    (a) =>
                      a.date === day.key &&
                      a.time === hour &&
                      a.status !== 'declined' &&
                      a.status !== 'cancelled',
                  )
                  return (
                    <div className="calendar-cell" key={`${day.key}-${hour}`}>
                      {slot ? (
                        <div
                          className={`calendar-event ${slot.type} ${
                            slot.status === 'pending' ? 'is-pending' : ''
                          }`}
                        >
                          <strong>{slot.customerName}</strong>
                          <span>{slot.serviceName}</span>
                          <em>{slot.status}</em>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Booking List</h2>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading appointments...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">No bookings in this view yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Client</th>
                    <th>Service</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((apt) => (
                    <tr key={apt.id}>
                      <td>{apt.date}</td>
                      <td>{apt.time}</td>
                      <td>
                        <strong>{apt.customerName}</strong>
                        {apt.customerPhone ? (
                          <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                            {apt.customerPhone}
                          </div>
                        ) : null}
                      </td>
                      <td>{apt.serviceName}</td>
                      <td>
                        <span className="badge">{apt.source === 'web' ? 'website' : apt.type}</span>
                      </td>
                      <td>
                        <span className={statusBadge(apt.status)}>{apt.status}</span>
                      </td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {apt.status === 'pending' ? (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              type="button"
                              onClick={() => setDecision({ appointment: apt, action: 'approve' })}
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => setDecision({ appointment: apt, action: 'decline' })}
                            >
                              Decline
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => updateStatus(apt.id, 'checked-in')}
                            >
                              Check in
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => updateStatus(apt.id, 'completed')}
                            >
                              Complete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {decision ? (
        <div className="confirm-modal-overlay" role="presentation" onClick={() => !decisionSaving && setDecision(null)}>
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appt-decision-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div>
                <p className="confirm-modal-kicker">
                  {decision.action === 'approve' ? 'Approve booking' : 'Decline booking'}
                </p>
                <h2 id="appt-decision-title" className="confirm-modal-title">
                  {decision.appointment.customerName}
                </h2>
              </div>
              <button
                className="btn-icon"
                type="button"
                aria-label="Close"
                disabled={decisionSaving}
                onClick={() => setDecision(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="confirm-modal-body">
              <p className="confirm-modal-text">
                {decision.action === 'approve'
                  ? 'Confirm this session, then notify the client by email or phone message.'
                  : 'Decline this request, then optionally notify the client with a polite update.'}
              </p>

              <div className="confirm-modal-meta">
                <div>
                  <span className="confirm-modal-label">Schedule</span>
                  <strong>
                    {decision.appointment.date} at {decision.appointment.time}
                  </strong>
                </div>
                <div>
                  <span className="confirm-modal-label">Service</span>
                  <strong>{decision.appointment.serviceName}</strong>
                </div>
                <div>
                  <span className="confirm-modal-label">Email</span>
                  <strong>{decision.appointment.customerEmail || '—'}</strong>
                </div>
                <div>
                  <span className="confirm-modal-label">Phone</span>
                  <strong>{decision.appointment.customerPhone || '—'}</strong>
                </div>
                {decision.appointment.medicalHistory ? (
                  <div>
                    <span className="confirm-modal-label">Medical history</span>
                    <strong>{decision.appointment.medicalHistory}</strong>
                  </div>
                ) : null}
                {decision.appointment.specialNote ? (
                  <div>
                    <span className="confirm-modal-label">Special note</span>
                    <strong>{decision.appointment.specialNote}</strong>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="confirm-modal-actions appt-decision-actions">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={decisionSaving}
                onClick={() => confirmDecision('none')}
              >
                {decision.action === 'approve' ? 'Approve only' : 'Decline only'}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={decisionSaving || !decision.appointment.customerPhone}
                onClick={() => confirmDecision('sms')}
              >
                <MessageCircle size={15} />
                {decision.action === 'approve' ? 'Approve + SMS' : 'Decline + SMS'}
              </button>
              <a
                className="btn btn-ghost"
                href={
                  decision.appointment.customerPhone
                    ? `tel:${decision.appointment.customerPhone}`
                    : undefined
                }
                aria-disabled={!decision.appointment.customerPhone}
                style={{
                  pointerEvents: decision.appointment.customerPhone ? 'auto' : 'none',
                  opacity: decision.appointment.customerPhone ? 1 : 0.5,
                }}
              >
                <Phone size={15} />
                Call
              </a>
              <button
                className="btn btn-primary"
                type="button"
                disabled={decisionSaving || !decision.appointment.customerEmail}
                onClick={() => confirmDecision('email')}
              >
                <Mail size={15} />
                {decision.action === 'approve' ? 'Approve + Email' : 'Decline + Email'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
