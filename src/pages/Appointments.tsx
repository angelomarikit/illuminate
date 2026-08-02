import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
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

export function Appointments() {
  const { branchId } = useBranch()
  const [filter, setFilter] = useState<'all' | 'appointment' | 'walk-in'>('all')
  const [rows, setRows] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [formType, setFormType] = useState<'none' | 'appointment' | 'walk-in'>('none')
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const days = useMemo(() => weekDays(), [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('appointments')
      .select('*')
      .order('appointment_date')
      .order('appointment_time')
    if (isUuid(branchId)) q = q.eq('branch_id', branchId)
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

  const filtered = useMemo(
    () => rows.filter((a) => filter === 'all' || a.type === filter),
    [rows, filter],
  )

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

  return (
    <div>
      <PageHeader
        kicker="Booking"
        title="Appointment Calendar"
        subtitle="Manage booked sessions and walk-ins for front desk operations."
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
        {(['all', 'appointment', 'walk-in'] as const).map((item) => (
          <button
            key={item}
            className={`chip ${filter === item ? 'active' : ''}`}
            onClick={() => setFilter(item)}
            type="button"
          >
            {item === 'all' ? 'All' : item === 'walk-in' ? 'Walk-in' : 'Appointments'}
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
                  const slot = filtered.find((a) => a.date === day.key && a.time === hour)
                  return (
                    <div className="calendar-cell" key={`${day.key}-${hour}`}>
                      {slot ? (
                        <div className={`calendar-event ${slot.type}`}>
                          <strong>{slot.customerName}</strong>
                          <span>{slot.serviceName}</span>
                          <em>{slot.staffName}</em>
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
            <div className="empty-state">No bookings yet. Create a walk-in or new booking.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Client</th>
                    <th>Service</th>
                    <th>Staff</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((apt) => (
                    <tr key={apt.id}>
                      <td>{apt.date}</td>
                      <td>{apt.time}</td>
                      <td>{apt.customerName}</td>
                      <td>{apt.serviceName}</td>
                      <td>{apt.staffName || '—'}</td>
                      <td>
                        <span className="badge">{apt.type}</span>
                      </td>
                      <td>
                        <span className="badge badge-success">{apt.status}</span>
                      </td>
                      <td style={{ display: 'flex', gap: 6 }}>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
