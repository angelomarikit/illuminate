import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Facebook,
  Instagram,
  Star,
  X,
  Youtube,
} from 'lucide-react'
import logo from '../assets/logo-transparent.png'
import galleryVLift from '../assets/gallery/v-lift.png'
import gallerySlimming from '../assets/gallery/slimming-body.png'
import galleryHeadSpa from '../assets/gallery/head-spa.png'
import galleryLaser from '../assets/gallery/laser-solutions.png'
import galleryBarbie from '../assets/gallery/barbie-series.png'
import galleryGluta from '../assets/gallery/gluta-drips.png'
import galleryAcne from '../assets/gallery/acne-scar.png'
import galleryAcneResults from '../assets/gallery/acne-scar-results.png'
import galleryFacial from '../assets/gallery/facial-care.png'
import galleryFacialAlt from '../assets/gallery/facial-care-alt.png'
import galleryMakeup from '../assets/gallery/semi-permanent-makeup.png'
import { supabase } from '../lib/supabase'
import './landing.css'

const SERVICE_GALLERY = [
  {
    id: 'facial-care',
    title: 'Facial Care',
    blurb: 'Hydra, Signature, Oxygeneo & glow treatments',
    image: galleryFacial,
  },
  {
    id: 'gluta-drips',
    title: 'Gluta Drips',
    blurb: 'Derma-approved whitening & wellness drips',
    image: galleryGluta,
  },
  {
    id: 'v-lift',
    title: 'V-Lift & Anti-Aging',
    blurb: 'HIFU, Thermage, Botox & contouring',
    image: galleryVLift,
  },
  {
    id: 'laser',
    title: 'Advanced Laser',
    blurb: 'PicoWay, diode hair removal & carbon laser',
    image: galleryLaser,
  },
  {
    id: 'acne-scar',
    title: 'Acne Scar & Melasma',
    blurb: 'Microneedling, Pico, CO2 & resurfacing',
    image: galleryAcne,
  },
  {
    id: 'slimming',
    title: 'Slimming & Body Contour',
    blurb: 'Emsculpt, cryolipolysis & tummy tuck HIFU',
    image: gallerySlimming,
  },
  {
    id: 'head-spa',
    title: 'Head Spa Scalp Solution',
    blurb: 'Deep cleanse, nourish & renew packages',
    image: galleryHeadSpa,
  },
  {
    id: 'barbie',
    title: 'Barbie Series',
    blurb: 'Nose, arms, legs & face contour packages',
    image: galleryBarbie,
  },
  {
    id: 'makeup',
    title: 'Semi-Permanent Make-up',
    blurb: 'Ombre brows, fairy lips, eyeliner & blush',
    image: galleryMakeup,
  },
  {
    id: 'acne-results',
    title: 'Acne Scar Results',
    blurb: 'Clinical before & after outcomes',
    image: galleryAcneResults,
  },
  {
    id: 'facial-menu',
    title: 'Facial Menu',
    blurb: 'Full facial care menu with pricing',
    image: galleryFacialAlt,
  },
] as const

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

type FeedbackItem = {
  id: string
  name: string
  treatment: string
  rating: number
  quote: string
}

const FALLBACK_FEEDBACK: FeedbackItem[] = [
  {
    id: 'fallback-1',
    name: 'Marielle S.',
    treatment: 'Skin rejuvenation',
    rating: 5,
    quote:
      'The consultation felt unhurried and precise. My skin looked clearer within weeks — and the booking process was effortless.',
  },
  {
    id: 'fallback-2',
    name: 'Andrea L.',
    treatment: 'Aesthetic consult',
    rating: 5,
    quote:
      'Private, calm, and thoroughly professional. They explained every step so I always knew what to expect.',
  },
  {
    id: 'fallback-3',
    name: 'Kristine D.',
    treatment: 'Facial treatment',
    rating: 4,
    quote:
      'Beautiful results without looking overdone. The team confirmed my appointment quickly and made the visit feel personal.',
  },
]

function StarRating({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="landing-stars" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < value
        return (
          <Star
            key={i}
            size={size}
            strokeWidth={1.75}
            className={filled ? 'is-filled' : 'is-empty'}
            fill={filled ? '#b8954a' : 'none'}
            color="#b8954a"
          />
        )
      })}
    </span>
  )
}

type ServiceOption = { id: string; name: string; category: string; duration_min: number }

const emptyForm = {
  clientType: 'new' as 'new' | 'existing',
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  birthday: '',
  age: '',
  sex: '',
  address: '',
  serviceName: '',
  customService: '',
  medicalHistory: '',
  specialNote: '',
}

function ageFromBirthday(iso: string): string {
  if (!iso) return ''
  const born = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(born.getTime())) return ''
  const today = new Date()
  let years = today.getFullYear() - born.getFullYear()
  const monthDiff = today.getMonth() - born.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) years -= 1
  return years >= 0 && years <= 120 ? String(years) : ''
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

export function Landing() {
  const [services, setServices] = useState<ServiceOption[]>([])
  const [feedback, setFeedback] = useState<FeedbackItem[]>(FALLBACK_FEEDBACK)
  const [slide, setSlide] = useState(0)
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [booked, setBooked] = useState<Set<string>>(new Set())
  const [form, setForm] = useState(emptyForm)
  const [step, setStep] = useState<'schedule' | 'details' | 'success'>('schedule')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState<number | null>(null)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [galleryPaused, setGalleryPaused] = useState(false)
  const galleryTrackRef = useRef<HTMLDivElement>(null)

  const cells = useMemo(() => buildMonthCells(month), [month])
  const todayKey = toKey(new Date())
  const activeFeedback = feedback[slide] ?? feedback[0]
  const averageRating = useMemo(() => {
    if (!feedback.length) return 5
    const sum = feedback.reduce((acc, item) => acc + item.rating, 0)
    return Math.round((sum / feedback.length) * 10) / 10
  }, [feedback])

  const goNextSlide = useEffectEvent(() => {
    setSlide((i) => (feedback.length ? (i + 1) % feedback.length : 0))
  })

  const scrollGalleryTo = useEffectEvent((index: number) => {
    const track = galleryTrackRef.current
    const target = track?.querySelectorAll<HTMLElement>('.landing-gallery-item')[index]
    if (track && target) {
      track.scrollTo({ left: Math.max(0, target.offsetLeft - 4), behavior: 'smooth' })
    }
  })

  const goGallery = useEffectEvent((direction: 1 | -1) => {
    setGalleryIndex((i) => {
      const next = (i + direction + SERVICE_GALLERY.length) % SERVICE_GALLERY.length
      requestAnimationFrame(() => scrollGalleryTo(next))
      return next
    })
  })

  useEffect(() => {
    async function boot() {
      const [{ data: serviceRows }, { data: feedbackRows }] = await Promise.all([
        supabase
          .from('services')
          .select('id, name, category, duration_min')
          .eq('active', true)
          .order('name'),
        supabase
          .from('client_feedback')
          .select('id, client_name, treatment, rating, quote')
          .eq('is_published', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
      ])

      const mapped = (serviceRows as ServiceOption[] | null) ?? []
      setServices(mapped)

      const reviews =
        (
          feedbackRows as
            | {
                id: string
                client_name: string
                treatment: string
                rating: number
                quote: string
              }[]
            | null
        )?.map((row) => ({
          id: row.id,
          name: row.client_name,
          treatment: row.treatment,
          rating: row.rating,
          quote: row.quote,
        })) ?? []

      if (reviews.length) {
        setFeedback(reviews)
        setSlide(0)
      }
    }
    boot()
  }, [])

  useEffect(() => {
    if (feedback.length <= 1) return
    const timer = window.setInterval(() => goNextSlide(), 6500)
    return () => window.clearInterval(timer)
  }, [feedback.length])

  useEffect(() => {
    if (galleryOpen !== null || galleryPaused) return
    const timer = window.setInterval(() => goGallery(1), 4200)
    return () => window.clearInterval(timer)
  }, [galleryOpen, galleryPaused])

  useEffect(() => {
    if (galleryOpen === null) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setGalleryOpen(null)
      if (e.key === 'ArrowRight') {
        setGalleryOpen((i) => (i === null ? i : (i + 1) % SERVICE_GALLERY.length))
      }
      if (e.key === 'ArrowLeft') {
        setGalleryOpen((i) =>
          i === null ? i : (i - 1 + SERVICE_GALLERY.length) % SERVICE_GALLERY.length,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [galleryOpen])

  useEffect(() => {
    if (step !== 'details' && step !== 'success') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (step === 'details') setStep('schedule')
      if (step === 'success') {
        setStep('schedule')
        setSelectedDate('')
        setSelectedTime('')
        setForm(emptyForm)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [step])

  const activeGallery =
    galleryOpen !== null ? SERVICE_GALLERY[galleryOpen] ?? null : null

  useEffect(() => {
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
  }, [month])

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
    const email = form.email.trim().toLowerCase()
    const phone = form.phone.trim()
    if (!email || !phone) {
      setError('Email address and phone number are required.')
      return
    }
    const isExisting = form.clientType === 'existing'
    if (!isExisting) {
      if (form.password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      if (form.password !== form.confirmPassword) {
        setError('Password confirmation does not match.')
        return
      }
      if (!form.birthday) {
        setError('Birthday is required for new clients.')
        return
      }
    }

    const customService = form.customService.trim()
    const catalogService = form.serviceName.trim()
    const serviceLabel = customService || catalogService || 'Consultation'
    const duration = services.find((s) => s.name === catalogService)?.duration_min || 60

    setSaving(true)
    setError('')

    const birthday = isExisting ? null : form.birthday || null
    const ageNum = isExisting
      ? null
      : form.age
        ? Number(form.age)
        : Number(ageFromBirthday(birthday || ''))
    const age =
      ageNum != null && Number.isFinite(ageNum) && ageNum > 0 ? ageNum : null

    const { error: err } = await supabase.rpc('submit_public_booking_register', {
      p_full_name: form.fullName.trim(),
      p_email: email,
      p_phone: phone,
      p_password: isExisting ? '' : form.password,
      p_is_existing_client: isExisting,
      p_age: age,
      p_sex: isExisting ? null : form.sex || null,
      p_address: isExisting ? null : form.address.trim() || null,
      p_service_name: serviceLabel,
      p_medical_history: isExisting ? null : form.medicalHistory.trim() || null,
      p_special_note: form.specialNote.trim() || null,
      p_appointment_date: selectedDate,
      p_appointment_time: selectedTime,
      p_duration_min: duration,
      p_birthday: birthday,
    })

    setSaving(false)
    if (err) {
      setError(
        err.message.includes('submit_public_booking_register') ||
          err.message.includes('schema cache') ||
          err.message.includes('function')
          ? `${err.message} — re-run supabase/add_receptionist_and_client_booking.sql in Supabase.`
          : err.message,
      )
      return
    }

    setBooked((prev) => new Set(prev).add(`${selectedDate}|${selectedTime}`))
    setStep('success')
  }

  const selectedLabel =
    selectedDate && selectedTime
      ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-PH', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }) + ` · ${selectedTime}`
      : 'Select a date & time'

  return (
    <div className="landing">
      <header className={`landing-nav ${menuOpen ? 'is-open' : ''}`}>
        <a className="landing-brand" href="#top" aria-label="Illuminate home">
          <img src={logo} alt="Illuminate" />
        </a>

        <nav className="landing-nav-links" aria-label="Primary">
          <a href="#book" onClick={() => setMenuOpen(false)}>
            Reserve
          </a>
          <a href="#gallery" onClick={() => setMenuOpen(false)}>
            Services
          </a>
          <a href="#feedback" onClick={() => setMenuOpen(false)}>
            Feedback
          </a>
          <Link to="/login" onClick={() => setMenuOpen(false)}>
            Login
          </Link>
          <Link to="/register" className="landing-nav-register" onClick={() => setMenuOpen(false)}>
            Register
          </Link>
        </nav>

        <button
          className="landing-menu-btn"
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
        </button>
      </header>

      <main id="top">
        <section className="landing-hero" id="book">
          <div className="landing-hero-frame">
            <div className="landing-hero-copy">
              <p className="landing-brand-mark">Illuminate Medical Aesthetics</p>
              <h1>Beauty, clarified.</h1>
              <p className="landing-hero-sub">
                Reserve your private session. Choose a date and time — our team will confirm your
                visit.
              </p>
              <div className="landing-hero-meta">
                <span>Doctor-led care</span>
                <span>By appointment</span>
                <span>Confirmed by our team</span>
              </div>
            </div>

            <div className="landing-calendar" aria-label="Booking calendar">
              <div className="landing-cal-brand">
                <img src={logo} alt="" aria-hidden="true" />
              </div>

              <div className="landing-cal-top">
                <div>
                  <p className="landing-cal-eyebrow">Private booking</p>
                  <h2>Select your visit</h2>
                </div>
                <p className="landing-cal-selected">{selectedLabel}</p>
              </div>

              <div className="landing-cal-head">
                <button
                  type="button"
                  className="landing-cal-nav"
                  aria-label="Previous month"
                  onClick={() =>
                    setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
                  }
                >
                  <ChevronLeft size={16} />
                </button>
                <h3>
                  {month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
                </h3>
                <button
                  type="button"
                  className="landing-cal-nav"
                  aria-label="Next month"
                  onClick={() =>
                    setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
                  }
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="landing-cal-weekdays">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <span key={`${d}-${i}`}>{d}</span>
                ))}
              </div>

              <div className="landing-cal-grid">
                {cells.map((cell) => {
                  if (!cell.date) return <div key={cell.key} className="landing-cal-empty" />
                  const key = cell.key
                  const disabled = key < todayKey
                  const selected = selectedDate === key
                  const isToday = key === todayKey
                  return (
                    <button
                      key={key}
                      type="button"
                      className={[
                        'landing-cal-day',
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

              <div className="landing-cal-times">
                <p className="landing-cal-times-label">Available hours</p>
                <div className="landing-time-grid">
                  {(selectedDate ? availableTimes : TIME_SLOTS).map((slot) => {
                    const taken = selectedDate
                      ? booked.has(`${selectedDate}|${slot}`)
                      : false
                    return (
                      <button
                        key={slot}
                        type="button"
                        className={`landing-time ${
                          selectedTime === slot ? 'is-selected' : ''
                        }`}
                        disabled={!selectedDate || taken}
                        onClick={() => setSelectedTime(slot)}
                      >
                        {slot}
                      </button>
                    )
                  })}
                </div>
              </div>

              {error && step === 'schedule' ? (
                <p className="landing-error">{error}</p>
              ) : null}

              <button
                type="button"
                className="landing-cal-btn"
                onClick={continueToDetails}
              >
                Continue
              </button>
            </div>
          </div>
        </section>

        {step === 'details' ? (
          <div
            className="landing-booking-modal"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setStep('schedule')
            }}
          >
            <div
              className="landing-booking-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="booking-modal-title"
              id="details"
            >
              <header className="landing-booking-dialog-head">
                <div className="landing-booking-dialog-intro">
                  <p className="landing-booking-eyebrow">Almost there</p>
                  <h2 id="booking-modal-title">Your details</h2>
                  <p className="landing-booking-slot">{selectedLabel}</p>
                  <p className="landing-booking-sub">
                    {form.clientType === 'new'
                      ? 'Create your Client portal account and submit your visit request.'
                      : 'We’ll match your email to your existing client profile and book this visit.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="landing-booking-close"
                  aria-label="Close booking form"
                  onClick={() => setStep('schedule')}
                >
                  <X size={18} />
                </button>
              </header>

              <form className="landing-booking-form" onSubmit={submitBooking}>
                <div className="landing-booking-dialog-body">
                  {error ? <p className="landing-error">{error}</p> : null}

                  <p className="landing-req-note">
                    Fields marked with <span className="req" aria-hidden="true">
                      *
                    </span>{' '}
                    are required.
                  </p>

                  <div className="landing-field landing-field-full">
                    <span className="landing-swatch-label">
                      Client type <span className="req" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <div
                      className="landing-client-swatches"
                      role="radiogroup"
                      aria-label="Client type"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={form.clientType === 'new'}
                        className={`landing-client-swatch${form.clientType === 'new' ? ' is-active' : ''}`}
                        onClick={() => setForm((f) => ({ ...f, clientType: 'new' }))}
                      >
                        I&apos;m a new client
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={form.clientType === 'existing'}
                        className={`landing-client-swatch${form.clientType === 'existing' ? ' is-active' : ''}`}
                        onClick={() => setForm((f) => ({ ...f, clientType: 'existing' }))}
                      >
                        I&apos;m an existing client
                      </button>
                    </div>
                    {form.clientType === 'existing' ? (
                      <p className="landing-client-hint">
                        Use the email on your client profile. Password is not needed here — birthday,
                        age, address, and medical history are also skipped.
                      </p>
                    ) : (
                      <p className="landing-client-hint">
                        New clients register a portal password here so you can log in after booking.
                      </p>
                    )}
                  </div>

                  <div className="landing-field">
                    <label htmlFor="bk-name">
                      Full name <span className="req" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      id="bk-name"
                      required
                      aria-required="true"
                      autoFocus
                      value={form.fullName}
                      onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                    />
                  </div>
                  <div className="landing-field">
                    <label htmlFor="bk-email">
                      Email <span className="req" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      id="bk-email"
                      type="email"
                      required
                      aria-required="true"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className="landing-field">
                    <label htmlFor="bk-phone">
                      Phone <span className="req" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      id="bk-phone"
                      required
                      aria-required="true"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>

                  {form.clientType === 'new' ? (
                    <>
                      <div className="landing-field">
                        <label htmlFor="bk-password">
                          Password <span className="req" aria-hidden="true">
                            *
                          </span>
                        </label>
                        <input
                          id="bk-password"
                          type="password"
                          required
                          aria-required="true"
                          minLength={8}
                          autoComplete="new-password"
                          value={form.password}
                          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                          placeholder="At least 8 characters"
                        />
                      </div>
                      <div className="landing-field">
                        <label htmlFor="bk-confirm">
                          Confirm password <span className="req" aria-hidden="true">
                            *
                          </span>
                        </label>
                        <input
                          id="bk-confirm"
                          type="password"
                          required
                          aria-required="true"
                          minLength={8}
                          autoComplete="new-password"
                          value={form.confirmPassword}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, confirmPassword: e.target.value }))
                          }
                        />
                      </div>
                    </>
                  ) : null}

                  {form.clientType === 'new' ? (
                    <>
                      <div className="landing-field">
                        <label htmlFor="bk-birthday">
                          Birthday <span className="req" aria-hidden="true">
                            *
                          </span>
                        </label>
                        <input
                          id="bk-birthday"
                          type="date"
                          required
                          aria-required="true"
                          max={new Date().toISOString().slice(0, 10)}
                          value={form.birthday}
                          onChange={(e) => {
                            const birthday = e.target.value
                            setForm((f) => ({
                              ...f,
                              birthday,
                              age: ageFromBirthday(birthday) || f.age,
                            }))
                          }}
                        />
                      </div>
                      <div className="landing-field">
                        <label htmlFor="bk-age">
                          Age <span className="req" aria-hidden="true">
                            *
                          </span>
                        </label>
                        <input
                          id="bk-age"
                          type="number"
                          min={1}
                          max={120}
                          required
                          aria-required="true"
                          value={form.age}
                          onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                        />
                      </div>
                      <div className="landing-field">
                        <label htmlFor="bk-sex">
                          Sex <span className="req" aria-hidden="true">
                            *
                          </span>
                        </label>
                        <select
                          id="bk-sex"
                          required
                          aria-required="true"
                          value={form.sex}
                          onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))}
                        >
                          <option value="">Select</option>
                          <option value="Female">Female</option>
                          <option value="Male">Male</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                      </div>
                      <div className="landing-field landing-field-full">
                        <label htmlFor="bk-address">
                          Address <span className="req" aria-hidden="true">
                            *
                          </span>
                        </label>
                        <input
                          id="bk-address"
                          required
                          aria-required="true"
                          value={form.address}
                          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                        />
                      </div>
                    </>
                  ) : null}

                  <div className="landing-field landing-field-full">
                    <label htmlFor="bk-service">Service</label>
                    <select
                      id="bk-service"
                      value={form.serviceName}
                      onChange={(e) => setForm((f) => ({ ...f, serviceName: e.target.value }))}
                    >
                      <option value="">Select a service (optional)</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.name}>
                          {service.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="landing-field landing-field-full">
                    <label htmlFor="bk-custom-service">Custom service</label>
                    <input
                      id="bk-custom-service"
                      value={form.customService}
                      onChange={(e) => setForm((f) => ({ ...f, customService: e.target.value }))}
                      placeholder="Type a custom service if needed"
                    />
                  </div>
                  {form.clientType === 'new' ? (
                    <div className="landing-field landing-field-full">
                      <label htmlFor="bk-history">Medical history / allergies</label>
                      <textarea
                        id="bk-history"
                        rows={3}
                        value={form.medicalHistory}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, medicalHistory: e.target.value }))
                        }
                        placeholder="Medications, allergies, previous procedures…"
                      />
                    </div>
                  ) : null}
                  <div className="landing-field landing-field-full">
                    <label htmlFor="bk-note">Special note / goals</label>
                    <textarea
                      id="bk-note"
                      rows={3}
                      value={form.specialNote}
                      onChange={(e) => setForm((f) => ({ ...f, specialNote: e.target.value }))}
                      placeholder="What would you like us to focus on?"
                    />
                  </div>
                </div>

                <footer className="landing-booking-dialog-foot">
                  <button
                    type="button"
                    className="landing-booking-secondary"
                    onClick={() => setStep('schedule')}
                  >
                    Change date or time
                  </button>
                  <button className="landing-cal-btn landing-booking-submit" type="submit" disabled={saving}>
                    {saving ? 'Sending…' : 'Submit request'}
                  </button>
                </footer>
              </form>
            </div>
          </div>
        ) : null}

        {step === 'success' ? (
          <div
            className="landing-booking-modal"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setStep('schedule')
                setSelectedDate('')
                setSelectedTime('')
                setForm(emptyForm)
              }
            }}
          >
            <div
              className="landing-booking-success"
              role="dialog"
              aria-modal="true"
              aria-labelledby="booking-success-title"
            >
              <button
                type="button"
                className="landing-booking-close landing-booking-success-close"
                aria-label="Close"
                onClick={() => {
                  setStep('schedule')
                  setSelectedDate('')
                  setSelectedTime('')
                  setForm(emptyForm)
                }}
              >
                <X size={18} />
              </button>

              <div className="landing-booking-success-brand">
                <img src={logo} alt="Illuminate" />
              </div>

              <div className="landing-booking-success-mark" aria-hidden="true">
                <span className="landing-booking-success-ring" />
                <Check size={20} strokeWidth={2.25} />
              </div>

              <p className="landing-booking-eyebrow">Request received</p>
              <h2 id="booking-success-title">Successfully submitted</h2>
              <p className="landing-booking-success-copy">
                Thank you. Our team will review your visit and follow up shortly.
              </p>

              <div className="landing-booking-success-meta">
                <span className="landing-booking-success-meta-label">Reserved for</span>
                <strong>{selectedLabel}</strong>
              </div>

              <p className="landing-booking-success-hint">
                Please log in to your Client account to view and manage this booking.
              </p>

              <div className="landing-booking-success-actions">
                <Link to="/login" className="landing-booking-success-primary">
                  Log in to your account
                </Link>
                <button
                  type="button"
                  className="landing-booking-success-ghost"
                  onClick={() => {
                    setStep('schedule')
                    setSelectedDate('')
                    setSelectedTime('')
                    setForm(emptyForm)
                  }}
                >
                  Reserve another date
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="landing-gallery" id="gallery" aria-labelledby="gallery-heading">
          <div className="landing-gallery-inner">
            <header className="landing-gallery-head">
              <div>
                <p className="landing-gallery-eyebrow">Treatment lookbook</p>
                <h2 id="gallery-heading">Our services, in detail.</h2>
                <p className="landing-gallery-sub">
                  Slide through signature menus — tap a poster for the full view.
                </p>
              </div>

              <div className="landing-gallery-controls">
                <button
                  type="button"
                  className="landing-gallery-nav"
                  aria-label="Previous services"
                  onClick={() => goGallery(-1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  className="landing-gallery-nav"
                  aria-label="Next services"
                  onClick={() => goGallery(1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </header>

            <div
              className="landing-gallery-slider"
              onMouseEnter={() => setGalleryPaused(true)}
              onMouseLeave={() => setGalleryPaused(false)}
              onFocusCapture={() => setGalleryPaused(true)}
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setGalleryPaused(false)
                }
              }}
            >
              <div
                className="landing-gallery-track"
                ref={galleryTrackRef}
                aria-label="Service posters"
              >
                {SERVICE_GALLERY.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`landing-gallery-item ${index === galleryIndex ? 'is-active' : ''}`}
                    style={{ animationDelay: `${Math.min(index, 6) * 0.06}s` }}
                    onClick={() => setGalleryOpen(index)}
                    aria-label={`View ${item.title}`}
                  >
                    <span className="landing-gallery-thumb">
                      <img src={item.image} alt="" loading="lazy" draggable={false} />
                    </span>
                    <span className="landing-gallery-meta">
                      <span className="landing-gallery-title">{item.title}</span>
                      <span className="landing-gallery-blurb">{item.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="landing-gallery-progress" aria-hidden="true">
                <span
                  key={`${galleryIndex}-${galleryPaused ? 'p' : 'r'}`}
                  className={`landing-gallery-progress-bar ${galleryPaused || galleryOpen !== null ? 'is-paused' : ''}`}
                />
              </div>

              <div className="landing-gallery-dots" role="tablist" aria-label="Gallery position">
                {SERVICE_GALLERY.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={index === galleryIndex}
                    aria-label={`Go to ${item.title}`}
                    className={`landing-gallery-dot ${index === galleryIndex ? 'is-active' : ''}`}
                    onClick={() => {
                      setGalleryIndex(index)
                      scrollGalleryTo(index)
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="landing-feedback" id="feedback" aria-labelledby="feedback-heading">
          <div className="landing-feedback-inner">
            <header className="landing-feedback-head">
              <p className="landing-feedback-eyebrow">Client feedback</p>
              <h2 id="feedback-heading">Trusted by those who value quiet excellence.</h2>
              <p className="landing-feedback-sub">
                Real visits. Honest ratings. Slide through what clients notice most about Illuminate.
              </p>

              <div className="landing-feedback-score">
                <span className="landing-feedback-score-num">{averageRating.toFixed(1)}</span>
                <div>
                  <StarRating value={Math.round(averageRating)} size={18} />
                  <p>Average from recent client reviews</p>
                </div>
              </div>
            </header>

            <div className="landing-feedback-slider" aria-roledescription="carousel">
              {activeFeedback ? (
                <article
                  key={activeFeedback.id}
                  className="landing-feedback-slide"
                  aria-live="polite"
                >
                  <div className="landing-feedback-item-top">
                    <StarRating value={activeFeedback.rating} size={18} />
                    <span>{activeFeedback.treatment || 'Client visit'}</span>
                  </div>
                  <blockquote>“{activeFeedback.quote}”</blockquote>
                  <cite>{activeFeedback.name}</cite>
                </article>
              ) : null}

              {feedback.length > 1 ? (
                <div className="landing-feedback-controls">
                  <button
                    type="button"
                    className="landing-feedback-nav"
                    aria-label="Previous review"
                    onClick={() =>
                      setSlide((i) => (i - 1 + feedback.length) % feedback.length)
                    }
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div className="landing-feedback-dots" role="tablist" aria-label="Feedback slides">
                    {feedback.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={index === slide}
                        aria-label={`Show review ${index + 1}`}
                        className={`landing-feedback-dot ${index === slide ? 'is-active' : ''}`}
                        onClick={() => setSlide(index)}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    className="landing-feedback-nav"
                    aria-label="Next review"
                    onClick={() => setSlide((i) => (i + 1) % feedback.length)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>Illuminate Medical Aesthetics</span>
        <div className="landing-footer-actions">
          <Link className="landing-footer-link" to="/privacy">
            Privacy Policy
          </Link>
          <div className="landing-socials" aria-label="Social media">
            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
            >
              <Instagram size={18} strokeWidth={1.6} />
            </a>
            <a
              href="https://www.facebook.com/"
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook"
            >
              <Facebook size={18} strokeWidth={1.6} />
            </a>
            <a href="https://www.youtube.com/" target="_blank" rel="noreferrer" aria-label="YouTube">
              <Youtube size={18} strokeWidth={1.6} />
            </a>
          </div>
        </div>
      </footer>

      {activeGallery ? (
        <div
          className="landing-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={activeGallery.title}
          onClick={() => setGalleryOpen(null)}
        >
          <div
            className="landing-lightbox-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="landing-lightbox-bar">
              <div>
                <p className="landing-lightbox-eyebrow">Service menu</p>
                <h3>{activeGallery.title}</h3>
              </div>
              <button
                type="button"
                className="landing-lightbox-close"
                aria-label="Close gallery"
                onClick={() => setGalleryOpen(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="landing-lightbox-stage">
              <button
                type="button"
                className="landing-lightbox-nav is-prev"
                aria-label="Previous service"
                onClick={() =>
                  setGalleryOpen((i) =>
                    i === null ? i : (i - 1 + SERVICE_GALLERY.length) % SERVICE_GALLERY.length,
                  )
                }
              >
                <ChevronLeft size={18} />
              </button>

              <img src={activeGallery.image} alt={activeGallery.title} />

              <button
                type="button"
                className="landing-lightbox-nav is-next"
                aria-label="Next service"
                onClick={() =>
                  setGalleryOpen((i) => (i === null ? i : (i + 1) % SERVICE_GALLERY.length))
                }
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <p className="landing-lightbox-caption">
              {activeGallery.blurb}
              <span>
                {(galleryOpen ?? 0) + 1} / {SERVICE_GALLERY.length}
              </span>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
