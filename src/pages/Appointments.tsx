import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import {
  Ban,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageCircle,
  Phone,
  X,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useBranch } from '../context/BranchContext'
import {
  addDays,
  buildMonthCells,
  formatShortDate,
  inDateRange,
  parseLocalISODate,
  startOfMonth,
  toLocalISODate,
} from '../lib/dates'
import { supabase } from '../lib/supabase'
import { isUuid } from '../lib/utils'
import type { Appointment, AppointmentStatus } from '../types'
import './appointments.css'

const hours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']

const CALENDAR_COLORS = [
  '#b8954a',
  '#1a1a1a',
  '#7a9e7e',
  '#c4787a',
  '#6b8cae',
  '#d4a017',
  '#8b6b8b',
  '#5a9a8a',
] as const

const CANCEL_REASON_PRESETS = [
  'Client request',
  'No-show',
  'Schedule conflict',
  'Staff unavailable',
  'Medical / health',
  'Other',
] as const

type BoardMode = 'day' | 'week' | 'month'

function formatStandardTime(hhmm: string): string {
  const [hs, ms = '00'] = String(hhmm).slice(0, 5).split(':')
  let h = Number(hs)
  if (!Number.isFinite(h)) return hhmm
  const period = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${ms} ${period}`
}

function contrastingInk(hex: string): string {
  const raw = hex.replace('#', '')
  if (raw.length !== 6) return '#111111'
  const r = parseInt(raw.slice(0, 2), 16)
  const g = parseInt(raw.slice(2, 4), 16)
  const b = parseInt(raw.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#111111' : '#ffffff'
}

function boardDaysFrom(startIso: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const key = addDays(startIso, i)
    const d = parseLocalISODate(key)
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
  calendar_color?: string | null
  cancellation_reason?: string | null
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
    calendarColor: row.calendar_color || CALENDAR_COLORS[0],
    cancellationReason: row.cancellation_reason ?? '',
  }
}

const emptyForm = {
  customerName: '',
  serviceName: '',
  customService: '',
  staffName: '',
  date: toLocalISODate(),
  time: '10:00',
  durationMin: '60',
  notes: '',
  calendarColor: CALENDAR_COLORS[0] as string,
}

type ServiceOption = { id: string; name: string; durationMin: number }
type StaffOption = { id: string; fullName: string }

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
  const when = `${apt.date} ${formatStandardTime(apt.time)}`
  const subject = approved
    ? `Illuminate appointment confirmed — ${when}`
    : `Illuminate appointment update — ${when}`
  const body = approved
    ? `Hi ${apt.customerName},\n\nYour ${apt.serviceName} appointment is confirmed for ${apt.date} at ${formatStandardTime(apt.time)}.\n\nPlease arrive 10 minutes early.\n\n— Illuminate Medical Aesthetics`
    : `Hi ${apt.customerName},\n\nThank you for your interest in ${apt.serviceName}. Unfortunately we cannot confirm ${apt.date} at ${formatStandardTime(apt.time)}. Please reply to choose another schedule.\n\n— Illuminate Medical Aesthetics`
  return `mailto:${encodeURIComponent(apt.customerEmail || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function buildSms(apt: Appointment, approved: boolean) {
  const to = phoneDigits(apt.customerPhone || '')
  const when = `${apt.date} ${formatStandardTime(apt.time)}`
  const body = approved
    ? `Hi ${apt.customerName}, your Illuminate ${apt.serviceName} is confirmed for ${when}. See you soon!`
    : `Hi ${apt.customerName}, we couldn't confirm ${when} for ${apt.serviceName}. Please message us to reschedule. — Illuminate`
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [decision, setDecision] = useState<DecisionModal | null>(null)
  const [decisionSaving, setDecisionSaving] = useState(false)
  const [boardMode, setBoardMode] = useState<BoardMode>('week')
  const [focusDate, setFocusDate] = useState(toLocalISODate)
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [listTab, setListTab] = useState<'active' | 'completed' | 'cancelled'>('active')
  const [completedFrom, setCompletedFrom] = useState('')
  const [completedTo, setCompletedTo] = useState('')
  const [cancelledFrom, setCancelledFrom] = useState('')
  const [cancelledTo, setCancelledTo] = useState('')
  const [historyApt, setHistoryApt] = useState<Appointment | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  const [rescheduleMode, setRescheduleMode] = useState(false)
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const isEditing = Boolean(editingId)
  const editingAppointment = useMemo(
    () => (editingId ? rows.find((row) => row.id === editingId) ?? null : null),
    [editingId, rows],
  )
  const isCompleted = editingAppointment?.status === 'completed'

  const boardDays = useMemo(() => {
    if (boardMode === 'day') return boardDaysFrom(focusDate, 1)
    return boardDaysFrom(focusDate, 7)
  }, [boardMode, focusDate])

  const monthCells = useMemo(() => buildMonthCells(monthCursor), [monthCursor])

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
    let cancelled = false
    async function loadOptions() {
      const [{ data: svc }, { data: staff }] = await Promise.all([
        supabase.from('services').select('id, name, duration_min').eq('active', true).order('name'),
        supabase
          .from('profiles')
          .select('id, full_name')
          .in('role', ['Receptionist', 'Staff'])
          .order('full_name'),
      ])
      if (cancelled) return
      setServiceOptions(
        (svc ?? []).map((row) => ({
          id: row.id as string,
          name: row.name as string,
          durationMin: Number(row.duration_min) || 60,
        })),
      )
      setStaffOptions(
        (staff ?? []).map((row) => ({
          id: row.id as string,
          fullName: (row.full_name as string) || 'Staff',
        })),
      )
    }
    void loadOptions()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!decision && formType === 'none' && !historyApt && !cancelTarget) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (cancelTarget && !cancelSaving) closeCancelModal()
      else if (decision && !decisionSaving) setDecision(null)
      else if (historyApt) setHistoryApt(null)
      else if (formType !== 'none' && !saving) {
        setFormType('none')
        setEditingId(null)
        setForm(emptyForm)
        setRescheduleMode(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [decision, decisionSaving, formType, saving, historyApt, cancelTarget, cancelSaving])

  function openBookingForm(
    type: 'appointment' | 'walk-in',
    opts?: { date?: string; time?: string },
  ) {
    setError('')
    setMessage('')
    setEditingId(null)
    setRescheduleMode(false)
    setForm({
      ...emptyForm,
      date: opts?.date || toLocalISODate(),
      time: opts?.time || '10:00',
      calendarColor: CALENDAR_COLORS[0],
    })
    setFormType(type)
  }

  function openEditBooking(apt: Appointment) {
    setError('')
    setMessage('')
    setEditingId(apt.id)
    setRescheduleMode(false)
    setFormType(apt.type === 'walk-in' ? 'walk-in' : 'appointment')
    const inCatalog = serviceOptions.some((s) => s.name === apt.serviceName)
    setForm({
      customerName: apt.customerName,
      serviceName: inCatalog ? apt.serviceName : '',
      customService: inCatalog ? '' : apt.serviceName,
      staffName: apt.staffName || '',
      date: apt.date,
      time: apt.time,
      durationMin: String(apt.durationMin || 60),
      notes: apt.specialNote || '',
      calendarColor: apt.calendarColor || CALENDAR_COLORS[0],
    })
  }

  function closeBookingForm() {
    if (saving) return
    setFormType('none')
    setEditingId(null)
    setForm(emptyForm)
    setRescheduleMode(false)
  }

  function startReschedule() {
    setRescheduleMode(true)
    window.setTimeout(() => dateInputRef.current?.focus(), 40)
  }

  function openCancelModal(apt?: Appointment | null) {
    const target = apt ?? editingAppointment
    if (!target) return
    setCancelTarget(target)
    setCancelReason('')
    setError('')
  }

  function closeCancelModal() {
    if (cancelSaving) return
    setCancelTarget(null)
    setCancelReason('')
  }

  function applyService(name: string) {
    const match = serviceOptions.find((s) => s.name === name)
    setForm((f) => ({
      ...f,
      serviceName: name,
      durationMin: match ? String(match.durationMin) : f.durationMin,
    }))
  }

  const pending = useMemo(() => rows.filter((a) => a.status === 'pending'), [rows])

  const filtered = useMemo(() => {
    const isActiveStatus = (status: string) =>
      status !== 'pending' &&
      status !== 'completed' &&
      status !== 'cancelled' &&
      status !== 'declined'

    const base =
      filter === 'pending'
        ? pending
        : rows.filter((a) => {
            if (filter === 'all') return isActiveStatus(a.status)
            return a.type === filter && isActiveStatus(a.status)
          })
    return base.filter((a) => inDateRange(a.date, rangeFrom, rangeTo))
  }, [rows, filter, pending, rangeFrom, rangeTo])

  const completedBookings = useMemo(() => {
    return rows
      .filter((a) => a.status === 'completed' && inDateRange(a.date, completedFrom, completedTo))
      .slice()
      .sort((a, b) => {
        const byDate = b.date.localeCompare(a.date)
        if (byDate !== 0) return byDate
        return b.time.localeCompare(a.time)
      })
  }, [rows, completedFrom, completedTo])

  const cancelledBookings = useMemo(() => {
    return rows
      .filter((a) => a.status === 'cancelled' && inDateRange(a.date, cancelledFrom, cancelledTo))
      .slice()
      .sort((a, b) => {
        const byDate = b.date.localeCompare(a.date)
        if (byDate !== 0) return byDate
        return b.time.localeCompare(a.time)
      })
  }, [rows, cancelledFrom, cancelledTo])

  const boardAppointments = useMemo(
    () =>
      rows.filter(
        (a) => a.status !== 'declined' && a.status !== 'cancelled' && inDateRange(a.date, rangeFrom, rangeTo),
      ),
    [rows, rangeFrom, rangeTo],
  )

  const countByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of boardAppointments) {
      map.set(a.date, (map.get(a.date) ?? 0) + 1)
    }
    return map
  }, [boardAppointments])

  function shiftBoard(delta: number) {
    if (boardMode === 'month') {
      setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
      return
    }
    setFocusDate((d) => addDays(d, boardMode === 'day' ? delta : delta * 7))
  }

  function goToday() {
    const today = toLocalISODate()
    setFocusDate(today)
    setMonthCursor(startOfMonth(new Date()))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const type = formType === 'walk-in' ? 'walk-in' : 'appointment'
    const wasEditing = Boolean(editingId)
    const wasRescheduling = rescheduleMode
    const catalogService = form.serviceName.trim()
    const customService = form.customService.trim()
    const serviceLabel = customService || catalogService
    if (!serviceLabel) {
      setSaving(false)
      setError('Select a service or type a custom service.')
      return
    }
    const payload = {
      customer_name: form.customerName.trim(),
      service_name: serviceLabel,
      staff_name: form.staffName.trim() || null,
      appointment_date: form.date,
      appointment_time: form.time,
      duration_min: Number(form.durationMin) || 60,
      special_note: form.notes.trim() || null,
      calendar_color: form.calendarColor || CALENDAR_COLORS[0],
    }

    const { error: err } = editingId
      ? await supabase.from('appointments').update(payload).eq('id', editingId)
      : await supabase.from('appointments').insert({
          ...payload,
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
    setEditingId(null)
    setRescheduleMode(false)
    setMessage(
      wasEditing
        ? wasRescheduling
          ? 'Booking rescheduled.'
          : 'Booking updated.'
        : type === 'walk-in'
          ? 'Walk-in added.'
          : 'Booking created.',
    )
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

  async function markBookingCompleted() {
    if (!editingId || saving) return
    setSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', editingId)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setFormType('none')
    setEditingId(null)
    setForm(emptyForm)
    setRescheduleMode(false)
    setMessage('Booking marked completed.')
    await load()
  }

  async function confirmCancelAppointment(e: FormEvent) {
    e.preventDefault()
    if (!cancelTarget || cancelSaving) return
    const reason = cancelReason.trim()
    if (!reason) {
      setError('Please share why this appointment is cancelled.')
      return
    }
    setCancelSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancellation_reason: reason,
      })
      .eq('id', cancelTarget.id)
    setCancelSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setCancelTarget(null)
    setCancelReason('')
    setFormType('none')
    setEditingId(null)
    setForm(emptyForm)
    setRescheduleMode(false)
    setListTab('cancelled')
    setMessage('Appointment cancelled.')
    await load()
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
      .insert({ ...payload, membership: 'Regular', points: 0, cash_in_balance: 0, visits: 0 })
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
              onClick={() => openBookingForm('walk-in')}
            >
              Walk-in
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => openBookingForm('appointment')}
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
                          {apt.date} · {formatStandardTime(apt.time)}
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

      <div className="appt-toolbar">
        <div className="chips" style={{ marginBottom: 0 }}>
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
        <div className="appt-range">
          <div className="field" style={{ margin: 0 }}>
            <label>From</label>
            <input
              className="input"
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>To</label>
            <input
              className="input"
              type="date"
              value={rangeTo}
              min={rangeFrom || undefined}
              onChange={(e) => setRangeTo(e.target.value)}
            />
          </div>
          {rangeFrom || rangeTo ? (
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              style={{ alignSelf: 'end' }}
              onClick={() => {
                setRangeFrom('')
                setRangeTo('')
              }}
            >
              Clear range
            </button>
          ) : null}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header appt-board-header">
          <h2 className="panel-title">
            {boardMode === 'day'
              ? 'Daily board'
              : boardMode === 'month'
                ? 'Month board'
                : 'Week board'}
          </h2>
          <div className="appt-board-controls">
            <div className="chips" style={{ margin: 0 }}>
              {(['day', 'week', 'month'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`chip ${boardMode === mode ? 'active' : ''}`}
                  onClick={() => {
                    setBoardMode(mode)
                    if (mode === 'month') {
                      setMonthCursor(startOfMonth(parseLocalISODate(focusDate)))
                    }
                  }}
                >
                  {mode === 'day' ? 'Day' : mode === 'week' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>
            <div className="appt-board-nav">
              <button className="btn-icon" type="button" aria-label="Previous" onClick={() => shiftBoard(-1)}>
                <ChevronLeft size={16} />
              </button>
              {boardMode === 'day' ? (
                <input
                  className="input appt-focus-date"
                  type="date"
                  value={focusDate}
                  onChange={(e) => setFocusDate(e.target.value || toLocalISODate())}
                />
              ) : (
                <strong className="appt-board-label">
                  {boardMode === 'month'
                    ? monthCursor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
                    : `${formatShortDate(boardDays[0]?.key || focusDate)} – ${formatShortDate(
                        boardDays[boardDays.length - 1]?.key || focusDate,
                      )}`}
                </strong>
              )}
              <button className="btn-icon" type="button" aria-label="Next" onClick={() => shiftBoard(1)}>
                <ChevronRight size={16} />
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={goToday}>
                Today
              </button>
            </div>
          </div>
        </div>
        <div className="panel-body calendar-wrap">
          {boardMode === 'month' ? (
            <div className="month-board">
              <div className="month-board-head">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="month-board-grid">
                {monthCells.map((cell) => {
                  if (!cell.date) {
                    return <div className="month-board-cell is-empty" key={cell.key} />
                  }
                  const count = countByDay.get(cell.key) ?? 0
                  const isFocus = cell.key === focusDate
                  const isToday = cell.key === toLocalISODate()
                  const inRange = inDateRange(cell.key, rangeFrom, rangeTo)
                  return (
                    <button
                      type="button"
                      key={cell.key}
                      className={`month-board-cell ${isFocus ? 'is-focus' : ''} ${
                        isToday ? 'is-today' : ''
                      } ${rangeFrom || rangeTo ? (inRange ? 'in-range' : 'out-range') : ''}`}
                      onClick={() => {
                        setFocusDate(cell.key)
                        setBoardMode('day')
                      }}
                    >
                      <span className="month-board-day">{cell.date.getDate()}</span>
                      {count > 0 ? (
                        <span className="month-board-count">
                          {count} booking{count === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className="month-board-count is-muted">—</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div
              className={`calendar-grid ${boardMode === 'day' ? 'is-day' : 'is-week'}`}
              style={{ '--cal-cols': boardDays.length } as CSSProperties}
            >
              <div className="calendar-corner" />
              {boardDays.map((day) => (
                <button
                  type="button"
                  className={`calendar-day-head is-clickable ${
                    day.key === focusDate ? 'is-focus' : ''
                  }`}
                  key={day.key}
                  onClick={() => {
                    setFocusDate(day.key)
                    setBoardMode('day')
                  }}
                >
                  {day.label}
                </button>
              ))}
              {hours.map((hour) => (
                <div className="calendar-row" key={hour}>
                  <div className="calendar-hour">{formatStandardTime(hour)}</div>
                  {boardDays.map((day) => {
                    const slots = boardAppointments.filter(
                      (a) => a.date === day.key && a.time === hour,
                    )
                    const compact = slots.length >= 3
                    return (
                      <div
                        className={`calendar-cell ${slots.length ? 'has-bookings' : ''}`}
                        key={`${day.key}-${hour}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Add booking ${formatShortDate(day.key)} ${formatStandardTime(hour)}`}
                        onClick={() => openBookingForm('appointment', { date: day.key, time: hour })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openBookingForm('appointment', { date: day.key, time: hour })
                          }
                        }}
                      >
                        {slots.length > 1 ? (
                          <div className="calendar-cell-meta">
                            <span className="calendar-cell-count">{slots.length}</span>
                          </div>
                        ) : null}
                        <div className="calendar-cell-stack">
                          {slots.map((slot) => {
                            const bg = slot.calendarColor || CALENDAR_COLORS[0]
                            const done = slot.status === 'completed'
                            return (
                              <button
                                key={slot.id}
                                type="button"
                                className={`calendar-event ${compact ? 'is-compact' : ''} ${
                                  slot.status === 'pending' ? 'is-pending' : ''
                                } ${done ? 'is-completed' : ''}`}
                                style={{
                                  background: bg,
                                  color: contrastingInk(bg),
                                }}
                                title={`${done ? 'Completed · ' : ''}Edit ${slot.customerName} · ${slot.serviceName}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditBooking(slot)
                                }}
                              >
                                {done ? (
                                  <span className="calendar-event-check" aria-label="Completed">
                                    <Check size={10} strokeWidth={2.75} />
                                  </span>
                                ) : null}
                                <strong>{slot.customerName}</strong>
                                <span>{slot.serviceName}</span>
                                <em>{done ? 'Completed' : slot.status}</em>
                              </button>
                            )
                          })}
                        </div>
                        {!slots.length ? (
                          <span className="calendar-cell-hint">Book</span>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header booking-list-header">
          <h2 className="panel-title">Booking List</h2>
          <div className="chips booking-list-tabs" style={{ margin: 0 }}>
            <button
              type="button"
              className={`chip ${listTab === 'active' ? 'active' : ''}`}
              onClick={() => setListTab('active')}
            >
              Active
              {rangeFrom || rangeTo ? ` · ${rangeFrom || '…'} → ${rangeTo || '…'}` : ''}
            </button>
            <button
              type="button"
              className={`chip ${listTab === 'completed' ? 'active' : ''}`}
              onClick={() => setListTab('completed')}
            >
              Completed services ({completedBookings.length})
            </button>
            <button
              type="button"
              className={`chip ${listTab === 'cancelled' ? 'active' : ''}`}
              onClick={() => setListTab('cancelled')}
            >
              Cancelled ({cancelledBookings.length})
            </button>
          </div>
        </div>
        <div className="panel-body">
          {listTab === 'completed' || listTab === 'cancelled' ? (
            <div className="completed-list-toolbar">
              <div className="field" style={{ margin: 0 }}>
                <label>From</label>
                <input
                  className="input"
                  type="date"
                  value={listTab === 'completed' ? completedFrom : cancelledFrom}
                  onChange={(e) =>
                    listTab === 'completed'
                      ? setCompletedFrom(e.target.value)
                      : setCancelledFrom(e.target.value)
                  }
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>To</label>
                <input
                  className="input"
                  type="date"
                  value={listTab === 'completed' ? completedTo : cancelledTo}
                  min={
                    (listTab === 'completed' ? completedFrom : cancelledFrom) || undefined
                  }
                  onChange={(e) =>
                    listTab === 'completed'
                      ? setCompletedTo(e.target.value)
                      : setCancelledTo(e.target.value)
                  }
                />
              </div>
              {(listTab === 'completed' ? completedFrom || completedTo : cancelledFrom || cancelledTo) ? (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  style={{ alignSelf: 'end' }}
                  onClick={() => {
                    if (listTab === 'completed') {
                      setCompletedFrom('')
                      setCompletedTo('')
                    } else {
                      setCancelledFrom('')
                      setCancelledTo('')
                    }
                  }}
                >
                  Clear range
                </button>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <div className="empty-state">Loading appointments...</div>
          ) : listTab === 'completed' ? (
            completedBookings.length === 0 ? (
              <div className="empty-state">No completed services in this date range.</div>
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
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedBookings.map((apt) => (
                      <tr
                        key={apt.id}
                        className="completed-row"
                        onClick={() => setHistoryApt(apt)}
                      >
                        <td>{apt.date}</td>
                        <td>{formatStandardTime(apt.time)}</td>
                        <td>
                          <strong>{apt.customerName}</strong>
                        </td>
                        <td>{apt.serviceName}</td>
                        <td>{apt.staffName || '—'}</td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setHistoryApt(apt)
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : listTab === 'cancelled' ? (
            cancelledBookings.length === 0 ? (
              <div className="empty-state">No cancelled appointments in this date range.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Client</th>
                      <th>Service</th>
                      <th>Reason</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancelledBookings.map((apt) => (
                      <tr
                        key={apt.id}
                        className="completed-row"
                        onClick={() => setHistoryApt(apt)}
                      >
                        <td>{apt.date}</td>
                        <td>{formatStandardTime(apt.time)}</td>
                        <td>
                          <strong>{apt.customerName}</strong>
                        </td>
                        <td>{apt.serviceName}</td>
                        <td style={{ maxWidth: 220 }}>
                          <span className="cancelled-reason-preview">
                            {apt.cancellationReason || '—'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setHistoryApt(apt)
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
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
                      <td>{formatStandardTime(apt.time)}</td>
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
                              onClick={() => openEditBooking(apt)}
                            >
                              Edit
                            </button>
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

      {formType !== 'none' ? (
        <div className="confirm-modal-overlay booking-modal-overlay" role="presentation">
          <div
            className="booking-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-modal-title"
          >
            <div className="booking-modal-top">
              <div className="booking-modal-accent" aria-hidden />
              <div className="booking-modal-head">
                <div>
                  <p className="booking-modal-kicker">
                    {isEditing
                      ? 'Edit booking'
                      : formType === 'walk-in'
                        ? 'Walk-in'
                        : 'New booking'}
                  </p>
                  <h2 id="booking-modal-title" className="booking-modal-title">
                    {isEditing ? form.customerName || 'Update booking' : 'Schedule a session'}
                  </h2>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  aria-label="Close"
                  disabled={saving}
                  onClick={closeBookingForm}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="booking-modal-schedule">
                <span>{formatShortDate(form.date)}</span>
                <span className="booking-modal-dot" aria-hidden />
                <span>{formatStandardTime(form.time)}</span>
                {formType === 'walk-in' ? (
                  <>
                    <span className="booking-modal-dot" aria-hidden />
                    <span>Walk-in</span>
                  </>
                ) : null}
              </div>
            </div>

            <form className="booking-modal-form" onSubmit={onSubmit}>
              <div className="booking-modal-body">
                {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
                {isEditing && rescheduleMode ? (
                  <div className="booking-reschedule-banner">
                    <CalendarClock size={16} />
                    <span>Choose a new date and time, then save to reschedule this booking.</span>
                  </div>
                ) : null}
                <div className="booking-modal-grid">
                  <div className="field booking-span-2">
                    <label>Client</label>
                    <input
                      className="input"
                      required
                      autoFocus={!rescheduleMode}
                      placeholder="Client full name"
                      value={form.customerName}
                      onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                    />
                  </div>

                  <div className="field booking-span-2">
                    <label>Service</label>
                    <select
                      className="select"
                      value={form.serviceName}
                      onChange={(e) => applyService(e.target.value)}
                    >
                      <option value="">Select a service (optional)</option>
                      {form.serviceName &&
                      !serviceOptions.some((s) => s.name === form.serviceName) ? (
                        <option value={form.serviceName}>{form.serviceName}</option>
                      ) : null}
                      {serviceOptions.map((svc) => (
                        <option key={svc.id} value={svc.name}>
                          {svc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field booking-span-2">
                    <label htmlFor="appt-custom-service">Custom service</label>
                    <input
                      id="appt-custom-service"
                      className="input"
                      value={form.customService}
                      onChange={(e) => setForm((f) => ({ ...f, customService: e.target.value }))}
                      placeholder="Type a custom service if needed"
                    />
                    <p className="booking-field-hint">
                      Same as website / portal booking — custom text overrides the menu selection when
                      filled.
                    </p>
                  </div>

                  <div className="field booking-span-2">
                    <label>Staff</label>
                    {staffOptions.length ? (
                      <div className="booking-staff-grid" role="group" aria-label="Staff">
                        {staffOptions.map((member) => {
                          const selected = form.staffName === member.fullName
                          return (
                            <button
                              key={member.id}
                              type="button"
                              className={`booking-staff-swatch ${selected ? 'is-selected' : ''}`}
                              aria-pressed={selected}
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  staffName: selected ? '' : member.fullName,
                                }))
                              }
                            >
                              <span className="booking-staff-initial" aria-hidden>
                                {member.fullName.trim().charAt(0).toUpperCase() || 'S'}
                              </span>
                              <span className="booking-staff-name">{member.fullName}</span>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="booking-field-hint">No Receptionist role accounts found yet.</p>
                    )}
                    {form.staffName &&
                    !staffOptions.some((s) => s.fullName === form.staffName) ? (
                      <p className="booking-field-hint">
                        Current: {form.staffName} (not in Staff list)
                      </p>
                    ) : null}
                  </div>

                  <div className={`field ${rescheduleMode ? 'is-reschedule-focus' : ''}`}>
                    <label>Date</label>
                    <input
                      ref={dateInputRef}
                      className="input"
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) => {
                        setRescheduleMode(true)
                        setForm((f) => ({ ...f, date: e.target.value }))
                      }}
                    />
                  </div>
                  <div className={`field ${rescheduleMode ? 'is-reschedule-focus' : ''}`}>
                    <label>Time</label>
                    <select
                      className="select"
                      value={form.time}
                      onChange={(e) => {
                        setRescheduleMode(true)
                        setForm((f) => ({ ...f, time: e.target.value }))
                      }}
                    >
                      {!hours.includes(form.time) ? (
                        <option value={form.time}>{formatStandardTime(form.time)}</option>
                      ) : null}
                      {hours.map((h) => (
                        <option key={h} value={h}>
                          {formatStandardTime(h)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Duration (min)</label>
                    <input
                      className="input"
                      type="number"
                      min={15}
                      step={15}
                      value={form.durationMin}
                      onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Calendar color</label>
                    <div className="booking-color-grid" role="group" aria-label="Calendar color">
                      {CALENDAR_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`booking-color-swatch ${
                            form.calendarColor === color ? 'is-selected' : ''
                          }`}
                          style={{ background: color }}
                          aria-label={`Color ${color}`}
                          aria-pressed={form.calendarColor === color}
                          onClick={() => setForm((f) => ({ ...f, calendarColor: color }))}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="field booking-span-2">
                    <label>Notes</label>
                    <textarea
                      className="input booking-notes"
                      rows={3}
                      placeholder="Allergies, preferences, prep notes…"
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="booking-modal-actions">
                {isEditing ? (
                  <div className="booking-modal-actions-start">
                    {!isCompleted ? (
                      <button
                        className="btn booking-complete-btn"
                        type="button"
                        disabled={saving}
                        onClick={() => void markBookingCompleted()}
                      >
                        <Check size={15} strokeWidth={2.75} />
                        Completed
                      </button>
                    ) : (
                      <span className="booking-completed-badge">
                        <Check size={14} strokeWidth={2.75} />
                        Completed
                      </span>
                    )}
                    <button
                      className={`btn btn-ghost booking-reschedule-btn ${
                        rescheduleMode ? 'is-active' : ''
                      }`}
                      type="button"
                      disabled={saving}
                      onClick={startReschedule}
                    >
                      <CalendarClock size={15} />
                      Reschedule
                    </button>
                    <button
                      className="btn btn-ghost booking-cancel-ghost"
                      type="button"
                      disabled={saving || isCompleted}
                      onClick={() => openCancelModal()}
                    >
                      <Ban size={15} />
                      Cancel appointment
                    </button>
                  </div>
                ) : null}
                <div className="booking-modal-actions-end">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={saving}
                    onClick={closeBookingForm}
                  >
                    Close
                  </button>
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    {saving
                      ? 'Saving...'
                      : isEditing
                        ? rescheduleMode
                          ? 'Save reschedule'
                          : 'Save changes'
                        : 'Save booking'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {historyApt ? (
        <div
          className="confirm-modal-overlay booking-modal-overlay"
          role="presentation"
          onClick={() => setHistoryApt(null)}
        >
          <div
            className="booking-modal history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="booking-modal-top">
              <div className="booking-modal-accent" aria-hidden />
              <div className="booking-modal-head">
                <div>
                  <p className="booking-modal-kicker">
                    {historyApt.status === 'cancelled' ? 'Cancelled appointment' : 'Completed service'}
                  </p>
                  <h2 id="history-modal-title" className="booking-modal-title">
                    {historyApt.customerName}
                  </h2>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  aria-label="Close"
                  onClick={() => setHistoryApt(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="booking-modal-schedule">
                {historyApt.status === 'cancelled' ? (
                  <span className="history-cancelled-pill">
                    <Ban size={12} strokeWidth={2.75} />
                    Cancelled
                  </span>
                ) : (
                  <span className="history-done-pill">
                    <Check size={12} strokeWidth={2.75} />
                    Completed
                  </span>
                )}
                <span className="booking-modal-dot" aria-hidden />
                <span>{formatShortDate(historyApt.date)}</span>
                <span className="booking-modal-dot" aria-hidden />
                <span>{formatStandardTime(historyApt.time)}</span>
              </div>
            </div>

            <div className="booking-modal-body">
              <div className="history-meta">
                <div>
                  <span className="history-label">Service</span>
                  <strong>{historyApt.serviceName}</strong>
                </div>
                <div>
                  <span className="history-label">Staff</span>
                  <strong>{historyApt.staffName || '—'}</strong>
                </div>
                <div>
                  <span className="history-label">Duration</span>
                  <strong>{historyApt.durationMin || 60} min</strong>
                </div>
                <div>
                  <span className="history-label">Type</span>
                  <strong>{historyApt.source === 'web' ? 'Website' : historyApt.type}</strong>
                </div>
                {historyApt.customerPhone ? (
                  <div>
                    <span className="history-label">Phone</span>
                    <strong>{historyApt.customerPhone}</strong>
                  </div>
                ) : null}
                {historyApt.customerEmail ? (
                  <div>
                    <span className="history-label">Email</span>
                    <strong>{historyApt.customerEmail}</strong>
                  </div>
                ) : null}
                {historyApt.status === 'cancelled' && historyApt.cancellationReason ? (
                  <div className="history-span-2">
                    <span className="history-label">Cancellation reason</span>
                    <strong className="history-notes">{historyApt.cancellationReason}</strong>
                  </div>
                ) : null}
                {historyApt.specialNote ? (
                  <div className="history-span-2">
                    <span className="history-label">Notes</span>
                    <strong className="history-notes">{historyApt.specialNote}</strong>
                  </div>
                ) : null}
                {historyApt.medicalHistory ? (
                  <div className="history-span-2">
                    <span className="history-label">Medical history</span>
                    <strong className="history-notes">{historyApt.medicalHistory}</strong>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="booking-modal-actions">
              {historyApt.status !== 'cancelled' ? (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    const apt = historyApt
                    setHistoryApt(null)
                    openEditBooking(apt)
                  }}
                >
                  Open in editor
                </button>
              ) : (
                <span />
              )}
              <div className="booking-modal-actions-end">
                <button className="btn btn-primary" type="button" onClick={() => setHistoryApt(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="confirm-modal-overlay booking-modal-overlay" role="presentation">
          <div
            className="booking-modal cancel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-modal-title"
          >
            <div className="booking-modal-top">
              <div className="booking-modal-accent" aria-hidden />
              <div className="booking-modal-head">
                <div>
                  <p className="booking-modal-kicker">Cancel appointment</p>
                  <h2 id="cancel-modal-title" className="booking-modal-title">
                    {cancelTarget.customerName}
                  </h2>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  aria-label="Close"
                  disabled={cancelSaving}
                  onClick={closeCancelModal}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="booking-modal-schedule">
                <span>{formatShortDate(cancelTarget.date)}</span>
                <span className="booking-modal-dot" aria-hidden />
                <span>{formatStandardTime(cancelTarget.time)}</span>
                <span className="booking-modal-dot" aria-hidden />
                <span>{cancelTarget.serviceName}</span>
              </div>
            </div>

            <form className="booking-modal-form" onSubmit={confirmCancelAppointment}>
              <div className="booking-modal-body">
                {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
                <p className="cancel-modal-copy">
                  Tell us why this appointment is being cancelled. This is saved for clinic records.
                </p>
                <div className="cancel-reason-presets" role="group" aria-label="Common reasons">
                  {CANCEL_REASON_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`cancel-reason-chip ${
                        cancelReason === preset ||
                        (preset !== 'Other' && cancelReason.startsWith(`${preset} —`))
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() =>
                        setCancelReason(preset === 'Other' ? '' : preset)
                      }
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>Reason</label>
                  <textarea
                    className="input booking-notes"
                    required
                    rows={4}
                    autoFocus
                    placeholder="Why is this appointment cancelled?"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="booking-modal-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={cancelSaving}
                  onClick={closeCancelModal}
                >
                  Keep appointment
                </button>
                <div className="booking-modal-actions-end">
                  <button className="btn booking-delete-btn" type="submit" disabled={cancelSaving}>
                    <Ban size={15} />
                    {cancelSaving ? 'Cancelling...' : 'Confirm cancel'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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
                    {decision.appointment.date} at{' '}
                    {formatStandardTime(decision.appointment.time)}
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
