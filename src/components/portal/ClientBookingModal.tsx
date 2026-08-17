import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLinkedCustomer } from '../../hooks/useLinkedCustomer'
import { supabase } from '../../lib/supabase'
import './client-booking-modal.css'

const TIME_SLOTS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
]

type ServiceOption = { id: string; name: string; duration_min: number }

type Props = {
  open: boolean
  onClose: () => void
  onBooked: () => void
}

function toKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function buildMonthCells(month: Date) {
  const first = startOfMonth(month)
  const startPad = first.getDay()
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: Array<{ date: Date | null; key: string }> = []
  for (let i = 0; i < startPad; i += 1) cells.push({ date: null, key: `pad-${i}` })
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day)
    cells.push({ date, key: toKey(date) })
  }
  return cells
}

export function ClientBookingModal({ open, onClose, onBooked }: Props) {
  const { user } = useAuth()
  const { customer } = useLinkedCustomer()

  const [step, setStep] = useState<'schedule' | 'details' | 'success'>('schedule')
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [booked, setBooked] = useState<Set<string>>(new Set())
  const [services, setServices] = useState<ServiceOption[]>([])
  const [serviceName, setServiceName] = useState('')
  const [customService, setCustomService] = useState('')
  const [specialNote, setSpecialNote] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const cells = useMemo(() => buildMonthCells(month), [month])
  const todayKey = toKey(new Date())

  const fullName = customer?.full_name || user?.name || ''
  const email = (customer?.email || user?.email || '').toLowerCase()

  const selectedLabel =
    selectedDate && selectedTime
      ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-PH', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }) + ` · ${selectedTime}`
      : 'Select a date & time'

  useEffect(() => {
    if (!open) return
    setStep('schedule')
    setSelectedDate('')
    setSelectedTime('')
    setServiceName('')
    setCustomService('')
    setSpecialNote('')
    setPhone(customer?.phone || '')
    setError('')
    setMonth(startOfMonth(new Date()))
  }, [open, customer?.phone])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    async function loadServices() {
      const { data } = await supabase
        .from('services')
        .select('id, name, duration_min')
        .eq('active', true)
        .order('name')
      setServices((data as ServiceOption[] | null) ?? [])
    }
    loadServices()
  }, [open])

  useEffect(() => {
    if (!open) return
    async function loadSlots() {
      const from = toKey(startOfMonth(month))
      const to = toKey(new Date(month.getFullYear(), month.getMonth() + 1, 0))
      const { data } = await supabase.rpc('list_booked_slots', {
        from_date: from,
        to_date: to,
      })
      const next = new Set<string>()
      ;(data as { appointment_date: string; appointment_time: string }[] | null)?.forEach((row) => {
        next.add(`${row.appointment_date}|${String(row.appointment_time).slice(0, 5)}`)
      })
      setBooked(next)
    }
    loadSlots()
  }, [open, month])

  const availableTimes = TIME_SLOTS.filter((slot) => {
    if (!selectedDate) return true
    return !booked.has(`${selectedDate}|${slot}`)
  })

  function selectDate(date: Date) {
    const key = toKey(date)
    if (key < todayKey) return
    setSelectedDate(key)
    setSelectedTime('')
    setError('')
  }

  function continueToDetails() {
    if (!selectedDate || !selectedTime) {
      setError('Please choose a date and time first.')
      return
    }
    setError('')
    setStep('details')
  }

  async function submitBooking(e: FormEvent) {
    e.preventDefault()
    if (!selectedDate || !selectedTime) {
      setError('Please choose a date and time.')
      return
    }
    if (!fullName.trim() || !email) {
      setError('Your account profile is missing name or email. Update settings or contact support.')
      return
    }
    const phoneValue = phone.trim()
    if (!phoneValue) {
      setError('Phone number is required.')
      return
    }

    const catalogService = serviceName.trim()
    const custom = customService.trim()
    const serviceLabel = custom || catalogService || 'Consultation'
    const duration = services.find((s) => s.name === catalogService)?.duration_min || 60

    setSaving(true)
    setError('')

    const { error: err } = await supabase.rpc('submit_client_portal_booking', {
      p_phone: phoneValue,
      p_service_name: serviceLabel,
      p_special_note: specialNote.trim() || null,
      p_appointment_date: selectedDate,
      p_appointment_time: selectedTime,
      p_duration_min: duration,
      p_source: 'portal',
    })

    setSaving(false)
    if (err) {
      setError(
        err.message.includes('submit_client_portal_booking') ||
          err.message.includes('schema cache') ||
          err.message.includes('function')
          ? `${err.message} — re-run supabase/fix_authenticated_client_booking.sql in Supabase.`
          : err.message,
      )
      return
    }

    setBooked((prev) => new Set(prev).add(`${selectedDate}|${selectedTime}`))
    onBooked()
    setStep('success')
  }

  if (!open) return null

  return (
    <div
      className="cbm-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="cbm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cbm-title"
      >
        <header className="cbm-head">
          <div>
            <p className="cbm-eyebrow">Book a visit</p>
            <h2 id="cbm-title">
              {step === 'success'
                ? 'Request submitted'
                : step === 'details'
                  ? 'Confirm details'
                  : 'Select date & time'}
            </h2>
            {step !== 'success' ? <p className="cbm-slot">{selectedLabel}</p> : null}
          </div>
          <button type="button" className="cbm-close" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {step === 'schedule' ? (
          <div className="cbm-body">
            <div className="cbm-cal-head">
              <button
                type="button"
                className="cbm-nav"
                aria-label="Previous month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft size={16} />
              </button>
              <h3>
                {month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
              </h3>
              <button
                type="button"
                className="cbm-nav"
                aria-label="Next month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="cbm-weekdays">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <span key={`${d}-${i}`}>{d}</span>
              ))}
            </div>

            <div className="cbm-grid">
              {cells.map((cell) => {
                if (!cell.date) return <div key={cell.key} className="cbm-empty" />
                const key = cell.key
                const disabled = key < todayKey
                const selected = selectedDate === key
                const isToday = key === todayKey
                return (
                  <button
                    key={key}
                    type="button"
                    className={[
                      'cbm-day',
                      selected ? 'is-selected' : '',
                      disabled ? 'is-disabled' : '',
                      isToday ? 'is-today' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={disabled}
                    onClick={() => selectDate(cell.date!)}
                  >
                    {cell.date.getDate()}
                  </button>
                )
              })}
            </div>

            <p className="cbm-times-label">Available hours</p>
            <div className="cbm-times">
              {(selectedDate ? availableTimes : TIME_SLOTS).map((slot) => {
                const taken = selectedDate ? booked.has(`${selectedDate}|${slot}`) : false
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`cbm-time${selectedTime === slot ? ' is-selected' : ''}`}
                    disabled={!selectedDate || taken}
                    onClick={() => setSelectedTime(slot)}
                  >
                    {slot}
                  </button>
                )
              })}
            </div>

            {error ? <p className="cbm-error">{error}</p> : null}

            <div className="cbm-foot">
              <button type="button" className="cbm-btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="cbm-btn-primary" onClick={continueToDetails}>
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === 'details' ? (
          <form className="cbm-body" onSubmit={submitBooking}>
            <p className="cbm-hint">
              Booking as your Client account. We&apos;ll attach this visit to your existing profile.
            </p>

            <div className="cbm-fields">
              <div className="cbm-field">
                <label>Full name</label>
                <input value={fullName} readOnly />
              </div>
              <div className="cbm-field">
                <label>Email</label>
                <input type="email" value={email} readOnly />
              </div>
              <div className="cbm-field cbm-field-full">
                <label htmlFor="cbm-phone">
                  Phone <span className="cbm-req">*</span>
                </label>
                <input
                  id="cbm-phone"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="cbm-field cbm-field-full">
                <label htmlFor="cbm-service">Service</label>
                <select
                  id="cbm-service"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                >
                  <option value="">Select a service (optional)</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.name}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cbm-field cbm-field-full">
                <label htmlFor="cbm-custom">Custom service</label>
                <input
                  id="cbm-custom"
                  value={customService}
                  onChange={(e) => setCustomService(e.target.value)}
                  placeholder="Type a custom service if needed"
                />
              </div>
              <div className="cbm-field cbm-field-full">
                <label htmlFor="cbm-note">Special note / goals</label>
                <textarea
                  id="cbm-note"
                  rows={3}
                  value={specialNote}
                  onChange={(e) => setSpecialNote(e.target.value)}
                  placeholder="What would you like us to focus on?"
                />
              </div>
            </div>

            {error ? <p className="cbm-error">{error}</p> : null}

            <div className="cbm-foot">
              <button
                type="button"
                className="cbm-btn-ghost"
                onClick={() => {
                  setError('')
                  setStep('schedule')
                }}
              >
                Back
              </button>
              <button type="submit" className="cbm-btn-primary" disabled={saving}>
                {saving ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </form>
        ) : null}

        {step === 'success' ? (
          <div className="cbm-body cbm-success">
            <div className="cbm-success-icon" aria-hidden="true">
              <Check size={20} strokeWidth={2.25} />
            </div>
            <h3>Successfully submitted</h3>
            <p>
              Your booking request for <strong>{selectedLabel}</strong> was received. You can track
              it under Appointments.
            </p>
            <div className="cbm-foot cbm-foot-center">
              <button type="button" className="cbm-btn-primary" onClick={onClose}>
                Done
              </button>
              <button
                type="button"
                className="cbm-btn-ghost"
                onClick={() => {
                  setStep('schedule')
                  setSelectedDate('')
                  setSelectedTime('')
                  setServiceName('')
                  setCustomService('')
                  setSpecialNote('')
                  setError('')
                }}
              >
                Book another
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
