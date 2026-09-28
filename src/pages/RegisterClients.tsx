import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import { isUuid } from '../lib/utils'
import type { CustomerHistoryNote, CustomerLifestyle, CustomerMedicalConditions } from '../types'
import './RegisterClients.css'

const STEPS = [
  'Profile',
  'History',
  'Topical medications',
  'Medical checklist',
  'Medications intake',
  'Lifestyle',
  'Declaration & signatures',
] as const

const MEDICAL_OPTIONS: { key: keyof CustomerMedicalConditions; label: string }[] = [
  { key: 'hypertension', label: 'Hypertension' },
  { key: 'kidney_disease', label: 'Kidney disease' },
  { key: 'skin_disease', label: 'Skin disease' },
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'stroke', label: 'Stroke' },
  { key: 'previous_surgeries', label: 'Previous surgeries' },
  { key: 'blood_disorders', label: 'Blood disorders' },
  { key: 'heart_disorders', label: 'Heart disorders' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'liver_disease', label: 'Liver disease' },
  { key: 'asthma', label: 'Asthma' },
]

const LIFESTYLE_OPTIONS: { key: keyof CustomerLifestyle; label: string }[] = [
  { key: 'smoking', label: 'Smoking' },
  { key: 'alcohol', label: 'Alcohol' },
  { key: 'beverages', label: 'Beverages' },
]

type ProfileForm = {
  name: string
  sex: string
  address: string
  phone: string
  email: string
  occupation: string
  birthday: string
  facebook: string
  instagram: string
}

function ageFromBirthday(birthday: string) {
  if (!birthday) return null
  const born = new Date(`${birthday}T12:00:00`)
  if (Number.isNaN(born.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - born.getFullYear()
  const md = today.getMonth() - born.getMonth()
  if (md < 0 || (md === 0 && today.getDate() < born.getDate())) age -= 1
  return age > 0 ? age : null
}

function SignaturePad({
  label,
  value,
  locked,
  onChange,
}: {
  label: string
  value: string
  locked?: boolean
  onChange: (dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const width = parent.clientWidth
    const height = 160
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.floor(width * ratio)
    canvas.height = Math.floor(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, width, height)
      img.src = value
    }
  }, [value])

  useEffect(() => {
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  function pos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (locked) return
    drawing.current = true
    last.current = pos(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || locked) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !last.current) return
    const next = pos(e)
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
    last.current = next
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }

  function clear() {
    if (locked) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    onChange('')
  }

  return (
    <div className="rc-sign-block">
      <div className="rc-sign-label-row">
        <label>{label}</label>
        {!locked ? (
          <button className="btn btn-ghost btn-sm" type="button" onClick={clear}>
            Reset
          </button>
        ) : (
          <span className="rc-muted">Confirmed</span>
        )}
      </div>
      <div className={`rc-sign-frame ${locked ? 'is-locked' : ''}`}>
        <canvas
          ref={canvasRef}
          className="rc-sign-canvas"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
    </div>
  )
}

export function RegisterClients() {
  const navigate = useNavigate()
  const { branchId } = useBranch()
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState<ProfileForm>({
    name: '',
    sex: '',
    address: '',
    phone: '',
    email: '',
    occupation: '',
    birthday: '',
    facebook: '',
    instagram: '',
  })
  const [historyNotes, setHistoryNotes] = useState<CustomerHistoryNote[]>([])
  const [historyDraft, setHistoryDraft] = useState('')
  const [topicalMedications, setTopicalMedications] = useState('')
  const [medical, setMedical] = useState<CustomerMedicalConditions>({})
  const [medicationsIntake, setMedicationsIntake] = useState('')
  const [lifestyle, setLifestyle] = useState<CustomerLifestyle>({})
  const [signaturePrimary, setSignaturePrimary] = useState('')
  const [signaturePrimaryLocked, setSignaturePrimaryLocked] = useState(false)
  const [signatureConfirm, setSignatureConfirm] = useState('')

  function validateStep(): string {
    if (step === 0) {
      if (!profile.name.trim()) return 'Name is required.'
      if (!profile.phone.trim()) return 'Contact number is required.'
      if (!profile.email.trim() || !profile.email.includes('@')) return 'A valid email is required.'
    }
    if (step === 6) {
      if (!signaturePrimary) return 'Please provide the first signature and confirm it.'
      if (!signaturePrimaryLocked) return 'Confirm the first signature before finishing.'
      if (!signatureConfirm) return 'Please provide the confirmation signature.'
    }
    return ''
  }

  function goNext() {
    setError('')
    const err = validateStep()
    if (err) {
      setError(err)
      return
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function goBack() {
    setError('')
    setStep((s) => Math.max(s - 1, 0))
  }

  function addHistory() {
    const text = historyDraft.trim()
    if (!text) {
      setError('Enter a history note before adding.')
      return
    }
    setError('')
    setHistoryNotes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, created_at: new Date().toISOString() },
    ])
    setHistoryDraft('')
  }

  async function onFinish(e: FormEvent) {
    e.preventDefault()
    const err = validateStep()
    if (err) {
      setError(err)
      return
    }
    setSaving(true)
    setError('')
    setMessage('')

    const birthday = profile.birthday || null
    const age = ageFromBirthday(profile.birthday || '')

    const { error: insertErr } = await supabase.from('customers').insert({
      full_name: profile.name.trim(),
      sex: profile.sex.trim() || null,
      address: profile.address.trim() || null,
      phone: profile.phone.trim(),
      email: profile.email.trim().toLowerCase(),
      occupation: profile.occupation.trim() || null,
      birthday,
      age,
      facebook: profile.facebook.trim() || null,
      instagram: profile.instagram.trim() || null,
      history_notes: historyNotes,
      topical_medications: topicalMedications.trim() || null,
      medical_conditions: medical,
      medications_intake: medicationsIntake.trim() || null,
      lifestyle,
      signature_primary: signaturePrimary || null,
      signature_confirm: signatureConfirm || null,
      intake_completed_at: new Date().toISOString(),
      membership: 'Regular',
      points: 0,
      cash_in_balance: 0,
      visits: 0,
      branch_id: isUuid(branchId) ? branchId : null,
    })

    setSaving(false)
    if (insertErr) {
      setError(
        insertErr.message.includes('occupation') ||
          insertErr.message.includes('history_notes') ||
          insertErr.message.includes('schema cache')
          ? `${insertErr.message} — run supabase/add_customer_intake.sql in Supabase.`
          : insertErr.message,
      )
      return
    }

    setMessage('Client registered successfully.')
    navigate('/customers', { state: { registered: profile.name.trim() } })
  }

  return (
    <div className="rc-page">
      <PageHeader
        kicker="Clinic"
        title="Register Clients"
        subtitle="Multi-step client intake with medical history, lifestyle checklist, and signatures."
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="rc-steps" aria-label="Registration steps">
        {STEPS.map((label, index) => (
          <div
            key={label}
            className={`rc-step-chip ${index === step ? 'is-active' : ''} ${index < step ? 'is-done' : ''}`}
          >
            <span>{index + 1}</span>
            {label}
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{STEPS[step]}</h2>
        </div>
        <div className="panel-body">
          {step === 0 ? (
            <div className="rc-grid">
              <div className="field">
                <label>
                  Name <span className="req">*</span>
                </label>
                <input
                  className="input"
                  required
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Sex</label>
                <select
                  className="select"
                  value={profile.sex}
                  onChange={(e) => setProfile((p) => ({ ...p, sex: e.target.value }))}
                >
                  <option value="">Select</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
              <div className="field rc-span-2">
                <label>Address</label>
                <input
                  className="input"
                  value={profile.address}
                  onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>
                  Contact <span className="req">*</span>
                </label>
                <input
                  className="input"
                  type="tel"
                  required
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>
                  Email <span className="req">*</span>
                </label>
                <input
                  className="input"
                  type="email"
                  required
                  value={profile.email}
                  onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Occupation</label>
                <input
                  className="input"
                  value={profile.occupation}
                  onChange={(e) => setProfile((p) => ({ ...p, occupation: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Birthdate</label>
                <input
                  className="input"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={profile.birthday}
                  onChange={(e) => setProfile((p) => ({ ...p, birthday: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Facebook</label>
                <input
                  className="input"
                  value={profile.facebook}
                  onChange={(e) => setProfile((p) => ({ ...p, facebook: e.target.value }))}
                  placeholder="Profile URL or username"
                />
              </div>
              <div className="field">
                <label>Instagram</label>
                <input
                  className="input"
                  value={profile.instagram}
                  onChange={(e) => setProfile((p) => ({ ...p, instagram: e.target.value }))}
                  placeholder="@handle"
                />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="rc-stack">
              <p className="rc-name-banner">
                Client: <strong>{profile.name.trim() || '—'}</strong>
              </p>
              <div className="rc-history-composer">
                <div className="field">
                  <label>History note</label>
                  <textarea
                    className="textarea rc-history-textarea"
                    rows={4}
                    value={historyDraft}
                    onChange={(e) => setHistoryDraft(e.target.value)}
                    placeholder="Add a medical or treatment history note"
                  />
                </div>
                <div className="rc-history-actions">
                  <button className="btn btn-primary" type="button" onClick={addHistory}>
                    Add history
                  </button>
                </div>
              </div>
              {historyNotes.length === 0 ? (
                <p className="rc-muted">No history notes yet.</p>
              ) : (
                <ul className="rc-history-list">
                  {historyNotes.map((note) => (
                    <li key={note.id}>
                      <div>{note.text}</div>
                      <button
                        className="btn-link"
                        type="button"
                        onClick={() =>
                          setHistoryNotes((prev) => prev.filter((n) => n.id !== note.id))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="field">
              <label>Topical medications</label>
              <textarea
                className="textarea"
                rows={5}
                value={topicalMedications}
                onChange={(e) => setTopicalMedications(e.target.value)}
                placeholder="Describe topical medications currently used"
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="rc-stack">
              <p className="rc-muted">Please check what applies.</p>
              <div className="rc-check-grid">
                {MEDICAL_OPTIONS.map((opt) => (
                  <label key={opt.key} className="rc-check">
                    <input
                      type="checkbox"
                      checked={Boolean(medical[opt.key])}
                      onChange={(e) =>
                        setMedical((prev) => ({ ...prev, [opt.key]: e.target.checked }))
                      }
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <div className="field">
                <label>Others</label>
                <input
                  className="input"
                  value={medical.others || ''}
                  onChange={(e) => setMedical((prev) => ({ ...prev, others: e.target.value }))}
                />
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="field">
              <label>Medications / herbal drug intake</label>
              <textarea
                className="textarea"
                rows={5}
                value={medicationsIntake}
                onChange={(e) => setMedicationsIntake(e.target.value)}
                placeholder="List medications or herbal drugs currently taken"
              />
            </div>
          ) : null}

          {step === 5 ? (
            <div className="rc-stack">
              <p className="rc-muted">Please check what applies.</p>
              <div className="rc-check-grid">
                {LIFESTYLE_OPTIONS.map((opt) => (
                  <label key={opt.key} className="rc-check">
                    <input
                      type="checkbox"
                      checked={Boolean(lifestyle[opt.key])}
                      onChange={(e) =>
                        setLifestyle((prev) => ({ ...prev, [opt.key]: e.target.checked }))
                      }
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <div className="field">
                <label>Others</label>
                <input
                  className="input"
                  value={lifestyle.others || ''}
                  onChange={(e) => setLifestyle((prev) => ({ ...prev, others: e.target.value }))}
                />
              </div>
            </div>
          ) : null}

          {step === 6 ? (
            <form className="rc-stack" onSubmit={(e) => void onFinish(e)}>
              <div className="rc-declaration">
                <p>
                  I hereby declare that I am in good physical and mental health and that I have no
                  known medical conditions that would prevent me from safely receiving aesthetic or
                  clinical treatments, other than those I have disclosed in this form. I confirm that
                  the information I provided is true and complete to the best of my knowledge, and I
                  consent to its use for my care at this clinic. I also acknowledge that the packages
                  or treatments I will avail are non-refundable and non-transferable.
                </p>
              </div>

              <SignaturePad
                label="Signature"
                value={signaturePrimary}
                locked={signaturePrimaryLocked}
                onChange={(v) => {
                  setSignaturePrimary(v)
                  setSignaturePrimaryLocked(false)
                }}
              />
              <div className="rc-sign-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={!signaturePrimary || signaturePrimaryLocked}
                  onClick={() => setSignaturePrimaryLocked(true)}
                >
                  Confirm
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setSignaturePrimary('')
                    setSignaturePrimaryLocked(false)
                  }}
                >
                  Reset
                </button>
              </div>

              <SignaturePad
                label="Sign again (confirmation)"
                value={signatureConfirm}
                onChange={setSignatureConfirm}
              />

              <div className="rc-nav">
                <button className="btn btn-ghost" type="button" onClick={goBack} disabled={saving}>
                  Back
                </button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Finish'}
                </button>
              </div>
            </form>
          ) : null}

          {step < 6 ? (
            <div className="rc-nav">
              <button className="btn btn-ghost" type="button" onClick={goBack} disabled={step === 0}>
                Back
              </button>
              <button className="btn btn-primary" type="button" onClick={goNext}>
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
