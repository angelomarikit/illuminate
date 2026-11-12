import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { ClientsSubnav } from '../components/ClientsSubnav'
import { MembershipBadge } from '../components/MembershipBadge'
import { PageHeader } from '../components/PageHeader'
import { SignaturePad } from '../components/SignaturePad'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import {
  createJourney,
  emptyStep1,
  emptyStep2,
  emptyStep3,
  emptyStep4,
  listJourneysForCustomer,
  loadCustomerSeed,
  loadJourneyWithSteps,
  searchCustomersForJourney,
  upsertJourneyStep,
  type JourneyCustomerSeed,
} from '../lib/clientJourney'
import { normalizeMembership } from '../lib/membership'
import {
  JOURNEY_STEP_LABELS,
  type ClientJourney,
  type ClientJourneyStep,
  type JourneyStepNumber,
  type Step1MedicalAssessment,
  type Step2AestheticAssessment,
  type Step3TreatmentProposal,
  type Step4SocialConsent,
} from '../types/clientJourney'
import type { CustomerLifestyle, CustomerMedicalConditions } from '../types'
import './ClientJourney.css'

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

function newLine() {
  return {
    id: crypto.randomUUID(),
    description: '',
    regularPrice: '',
    discountedPrice: '',
    bestOffer: '',
  }
}

export function ClientJourney() {
  const { user } = useAuth()
  const { branchId } = useBranch()

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<JourneyCustomerSeed[]>([])
  const [searching, setSearching] = useState(false)
  const [customer, setCustomer] = useState<JourneyCustomerSeed | null>(null)
  const [journeys, setJourneys] = useState<ClientJourney[]>([])
  const [journey, setJourney] = useState<ClientJourney | null>(null)
  const [steps, setSteps] = useState<ClientJourneyStep[]>([])
  const [step, setStep] = useState<JourneyStepNumber>(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [step1, setStep1] = useState<Step1MedicalAssessment>(emptyStep1())
  const [step2, setStep2] = useState<Step2AestheticAssessment>(emptyStep2())
  const [step3, setStep3] = useState<Step3TreatmentProposal>(emptyStep3())
  const [step4, setStep4] = useState<Step4SocialConsent>(emptyStep4())

  const completedSteps = useMemo(() => {
    const set = new Set<number>()
    for (const s of steps) {
      if (s.completed_at) set.add(s.step_number)
    }
    return set
  }, [steps])

  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      return
    }
    setSearching(true)
    setHits(await searchCustomersForJourney(q, branchId))
    setSearching(false)
  }, [query, branchId])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void runSearch()
    }, 280)
    return () => window.clearTimeout(t)
  }, [runSearch])

  function applyPayloads(seed: JourneyCustomerSeed | null, loaded: ClientJourneyStep[]) {
    const byStep = new Map(loaded.map((s) => [s.step_number, s.payload]))
    setStep1((byStep.get(1) as Step1MedicalAssessment | undefined) ?? emptyStep1(seed))
    setStep2((byStep.get(2) as Step2AestheticAssessment | undefined) ?? emptyStep2())
    setStep3(
      (byStep.get(3) as Step3TreatmentProposal | undefined) ?? emptyStep3(seed?.name ?? ''),
    )
    setStep4((byStep.get(4) as Step4SocialConsent | undefined) ?? emptyStep4(seed?.name ?? ''))
  }

  async function openCustomer(c: JourneyCustomerSeed) {
    setError('')
    setMessage('')
    setLoading(true)
    const seed = (await loadCustomerSeed(c.id)) ?? c
    setCustomer(seed)
    setHits([])
    setQuery(seed.name)

    const list = await listJourneysForCustomer(seed.id)
    setJourneys(list)
    const open = list.find((j) => j.status !== 'completed') ?? list[0] ?? null
    if (open) {
      await openJourney(open.id, seed)
    } else {
      setJourney(null)
      setSteps([])
      setStep(1)
      applyPayloads(seed, [])
    }
    setLoading(false)
  }

  async function openJourney(journeyId: string, seed = customer) {
    setLoading(true)
    setError('')
    const packed = await loadJourneyWithSteps(journeyId)
    if (!packed) {
      setError('Could not load journey.')
      setLoading(false)
      return
    }
    setJourney(packed.journey)
    setSteps(packed.steps)
    setStep(packed.journey.current_step)
    applyPayloads(seed, packed.steps)
    setLoading(false)
  }

  async function startNewJourney() {
    if (!customer) return
    setSaving(true)
    setError('')
    setMessage('')
    const result = await createJourney({
      customerId: customer.id,
      branchId,
      userId: user?.id ?? null,
    })
    if (result.ok === false) {
      setError(result.error)
      setSaving(false)
      return
    }
    const list = await listJourneysForCustomer(customer.id)
    setJourneys(list)
    setJourney(result.journey)
    setSteps([])
    setStep(1)
    applyPayloads(customer, [])
    setMessage('New journey started.')
    setSaving(false)
  }

  async function saveCurrent(opts: { markComplete: boolean; advance: boolean }) {
    if (!journey || !customer) {
      setError('Select a client and open or start a journey first.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')

    const payload =
      step === 1
        ? step1
        : step === 2
          ? step2
          : step === 3
            ? step3
            : step4

    if (opts.markComplete) {
      if (step === 3 && !step3.policyAcknowledged) {
        setError('Patient must acknowledge the reservation & cancellation policy.')
        setSaving(false)
        return
      }
      if (step === 4 && !step4.signatureDataUrl) {
        setError('Patient signature is required to complete social media consent.')
        setSaving(false)
        return
      }
    }

    const result = await upsertJourneyStep({
      journeyId: journey.id,
      stepNumber: step,
      payload: payload as unknown as Record<string, unknown>,
      markComplete: opts.markComplete,
      userId: user?.id ?? null,
      advance: opts.advance,
    })

    if (result.ok === false) {
      setError(result.error)
      setSaving(false)
      return
    }

    const packed = await loadJourneyWithSteps(journey.id)
    if (packed) {
      setJourney(packed.journey)
      setSteps(packed.steps)
      if (opts.advance && opts.markComplete && step < 4) {
        setStep((step + 1) as JourneyStepNumber)
      }
    }
    const list = await listJourneysForCustomer(customer.id)
    setJourneys(list)
    setMessage(
      opts.markComplete
        ? step === 4
          ? 'Journey completed.'
          : `Step ${step} saved. Continue to the next step.`
        : `Step ${step} draft saved.`,
    )
    setSaving(false)
  }

  function clearClient() {
    setCustomer(null)
    setJourney(null)
    setJourneys([])
    setSteps([])
    setStep(1)
    setQuery('')
    setHits([])
    applyPayloads(null, [])
    setMessage('')
    setError('')
  }

  return (
    <div className="cj-page">
      <PageHeader
        kicker="Clinic"
        title="Client journey"
        subtitle="Digitized pathway: medical & assessment → 16-point → treatment proposal → social media consent."
      />
      <ClientsSubnav />
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {!customer ? (
        <section className="cj-picker">
          <p className="cj-muted">Search an existing client to open or start their clinical journey.</p>
          <div className="cj-picker-row">
            <input
              className="input"
              placeholder="Search name, phone, or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void runSearch()
                }
              }}
            />
            <button className="btn btn-secondary" type="button" onClick={() => void runSearch()}>
              <Search size={16} aria-hidden />
              Search
            </button>
          </div>
          {searching ? <p className="cj-muted">Searching…</p> : null}
          {hits.length > 0 ? (
            <ul className="cj-results">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="cj-result" onClick={() => void openCustomer(h)}>
                    <div>
                      <strong>{h.name}</strong>
                      <span>
                        {[h.phone, h.email].filter(Boolean).join(' · ') || 'No contact on file'}
                      </span>
                    </div>
                    <MembershipBadge
                      membership={normalizeMembership(h.membership)}
                      expiresAt={h.membership_expires_at}
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim().length >= 2 && !searching ? (
            <p className="cj-muted">No clients matched. Register the client first, then return here.</p>
          ) : null}
        </section>
      ) : (
        <>
          <div className="cj-client-banner">
            <div>
              <h2>{customer.name}</h2>
              <p>
                {[customer.phone, customer.email, customer.sex].filter(Boolean).join(' · ') ||
                  'Client selected'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <MembershipBadge
                membership={normalizeMembership(customer.membership)}
                expiresAt={customer.membership_expires_at}
              />
              <button className="btn btn-ghost" type="button" onClick={clearClient} disabled={saving}>
                Change client
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void startNewJourney()}
                disabled={saving || loading}
              >
                <Plus size={16} aria-hidden />
                New journey
              </button>
            </div>
          </div>

          {journeys.length > 0 ? (
            <div className="cj-journey-list">
              {journeys.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className={`cj-journey-chip ${journey?.id === j.id ? 'is-active' : ''}`}
                  onClick={() => void openJourney(j.id)}
                  disabled={loading || saving}
                >
                  {new Date(j.created_at).toLocaleDateString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  · {j.status}
                </button>
              ))}
            </div>
          ) : (
            <p className="cj-muted">No journeys yet. Start a new journey for this client.</p>
          )}

          {journey ? (
            <>
              <div className="cj-steps">
                {JOURNEY_STEP_LABELS.map((label, index) => {
                  const n = (index + 1) as JourneyStepNumber
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`cj-step-chip ${step === n ? 'is-active' : ''} ${
                        completedSteps.has(n) ? 'is-done' : ''
                      }`}
                      onClick={() => setStep(n)}
                      disabled={saving}
                    >
                      <span>{n}</span>
                      {label}
                    </button>
                  )
                })}
              </div>

              <section className="cj-panel">
                <h3>
                  Step {step}: {JOURNEY_STEP_LABELS[step - 1]}
                </h3>

                {loading ? (
                  <p className="cj-muted">Loading…</p>
                ) : step === 1 ? (
                  <Step1Form value={step1} onChange={setStep1} disabled={saving} />
                ) : step === 2 ? (
                  <Step2Form value={step2} onChange={setStep2} disabled={saving} />
                ) : step === 3 ? (
                  <Step3Form value={step3} onChange={setStep3} disabled={saving} />
                ) : (
                  <Step4Form value={step4} onChange={setStep4} disabled={saving} />
                )}

                <div className="cj-nav">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={saving || step === 1}
                    onClick={() => setStep((s) => Math.max(1, s - 1) as JourneyStepNumber)}
                  >
                    Back
                  </button>
                  <div className="cj-nav-right">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={saving}
                      onClick={() => void saveCurrent({ markComplete: false, advance: false })}
                    >
                      Save draft
                    </button>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void saveCurrent({
                          markComplete: true,
                          advance: step < 4,
                        })
                      }
                    >
                      {step === 4 ? 'Complete journey' : 'Save & continue'}
                    </button>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <p className="cj-muted">
              {loading ? 'Loading…' : 'Click New journey to begin the 4-step clinical pathway.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Step1Form({
  value,
  onChange,
  disabled,
}: {
  value: Step1MedicalAssessment
  onChange: (v: Step1MedicalAssessment) => void
  disabled?: boolean
}) {
  function patch(p: Partial<Step1MedicalAssessment>) {
    onChange({ ...value, ...p })
  }

  return (
    <div className="cj-grid">
      <div className="field">
        <label>Patient name</label>
        <input
          className="input"
          disabled={disabled}
          value={value.patientName}
          onChange={(e) => patch({ patientName: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Assessment date</label>
        <input
          className="input"
          type="date"
          disabled={disabled}
          value={value.assessedAt}
          onChange={(e) => patch({ assessedAt: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Sex</label>
        <select
          className="select"
          disabled={disabled}
          value={value.sex}
          onChange={(e) => patch({ sex: e.target.value })}
        >
          <option value="">Select</option>
          <option value="Female">Female</option>
          <option value="Male">Male</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div className="field">
        <label>Birthday</label>
        <input
          className="input"
          type="date"
          disabled={disabled}
          value={value.birthday}
          onChange={(e) => patch({ birthday: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Age</label>
        <input
          className="input"
          disabled={disabled}
          value={value.age}
          onChange={(e) => patch({ age: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Phone</label>
        <input
          className="input"
          disabled={disabled}
          value={value.phone}
          onChange={(e) => patch({ phone: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Email</label>
        <input
          className="input"
          disabled={disabled}
          value={value.email}
          onChange={(e) => patch({ email: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Occupation</label>
        <input
          className="input"
          disabled={disabled}
          value={value.occupation}
          onChange={(e) => patch({ occupation: e.target.value })}
        />
      </div>
      <div className="field cj-span-2">
        <label>Address</label>
        <input
          className="input"
          disabled={disabled}
          value={value.address}
          onChange={(e) => patch({ address: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Facebook</label>
        <input
          className="input"
          disabled={disabled}
          value={value.facebook}
          onChange={(e) => patch({ facebook: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Instagram</label>
        <input
          className="input"
          disabled={disabled}
          value={value.instagram}
          onChange={(e) => patch({ instagram: e.target.value })}
        />
      </div>
      <div className="field cj-span-2">
        <label>Chief complaint / reason for visit</label>
        <textarea
          className="input"
          rows={2}
          disabled={disabled}
          value={value.chiefComplaint}
          onChange={(e) => patch({ chiefComplaint: e.target.value })}
        />
      </div>
      <div className="field cj-span-2">
        <label>History notes</label>
        <textarea
          className="input"
          rows={3}
          disabled={disabled}
          value={value.historyNotes.map((n) => n.text).join('\n')}
          onChange={(e) =>
            patch({
              historyNotes: e.target.value
                .split('\n')
                .map((t) => t.trim())
                .filter(Boolean)
                .map((text, i) => ({
                  id: value.historyNotes[i]?.id ?? crypto.randomUUID(),
                  text,
                  created_at: value.historyNotes[i]?.created_at ?? new Date().toISOString(),
                })),
            })
          }
          placeholder="One note per line"
        />
      </div>
      <div className="cj-span-2">
        <div className="cj-section-label">Medical checklist</div>
        <div className="cj-check-grid">
          {MEDICAL_OPTIONS.map((opt) => (
            <label key={opt.key} className="cj-check">
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(value.medicalConditions[opt.key])}
                onChange={(e) =>
                  patch({
                    medicalConditions: {
                      ...value.medicalConditions,
                      [opt.key]: e.target.checked,
                    },
                  })
                }
              />
              {opt.label}
            </label>
          ))}
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>Other conditions</label>
          <input
            className="input"
            disabled={disabled}
            value={value.medicalConditions.others ?? ''}
            onChange={(e) =>
              patch({
                medicalConditions: { ...value.medicalConditions, others: e.target.value },
              })
            }
          />
        </div>
      </div>
      <div className="field cj-span-2">
        <label>Topical medications</label>
        <textarea
          className="input"
          rows={2}
          disabled={disabled}
          value={value.topicalMedications}
          onChange={(e) => patch({ topicalMedications: e.target.value })}
        />
      </div>
      <div className="field cj-span-2">
        <label>Medications intake</label>
        <textarea
          className="input"
          rows={2}
          disabled={disabled}
          value={value.medicationsIntake}
          onChange={(e) => patch({ medicationsIntake: e.target.value })}
        />
      </div>
      <div className="cj-span-2">
        <div className="cj-section-label">Lifestyle</div>
        <div className="cj-check-grid">
          {LIFESTYLE_OPTIONS.map((opt) => (
            <label key={opt.key} className="cj-check">
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(value.lifestyle[opt.key])}
                onChange={(e) =>
                  patch({
                    lifestyle: { ...value.lifestyle, [opt.key]: e.target.checked },
                  })
                }
              />
              {opt.label}
            </label>
          ))}
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>Lifestyle notes</label>
          <input
            className="input"
            disabled={disabled}
            value={value.lifestyle.others ?? ''}
            onChange={(e) =>
              patch({ lifestyle: { ...value.lifestyle, others: e.target.value } })
            }
          />
        </div>
      </div>
      <div className="field">
        <label>Skin type</label>
        <input
          className="input"
          disabled={disabled}
          value={value.skinType}
          onChange={(e) => patch({ skinType: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Treatment goals</label>
        <input
          className="input"
          disabled={disabled}
          value={value.treatmentGoals}
          onChange={(e) => patch({ treatmentGoals: e.target.value })}
        />
      </div>
      <div className="field cj-span-2">
        <label>Assessment notes</label>
        <textarea
          className="input"
          rows={2}
          disabled={disabled}
          value={value.assessmentNotes}
          onChange={(e) => patch({ assessmentNotes: e.target.value })}
        />
      </div>
      <div className="field cj-span-2">
        <label>Doctor findings</label>
        <textarea
          className="input"
          rows={2}
          disabled={disabled}
          value={value.doctorFindings}
          onChange={(e) => patch({ doctorFindings: e.target.value })}
        />
      </div>
      <div className="field cj-span-2">
        <label>Recommended plan</label>
        <textarea
          className="input"
          rows={2}
          disabled={disabled}
          value={value.recommendedPlan}
          onChange={(e) => patch({ recommendedPlan: e.target.value })}
        />
      </div>
      <div className="cj-span-2">
        <SignaturePad
          label="Patient signature"
          value={value.patientSignature}
          onChange={(patientSignature) => patch({ patientSignature })}
        />
      </div>
      <div className="cj-span-2">
        <SignaturePad
          label="Doctor signature"
          value={value.doctorSignature}
          onChange={(doctorSignature) => patch({ doctorSignature })}
        />
      </div>
    </div>
  )
}

function Step2Form({
  value,
  onChange,
  disabled,
}: {
  value: Step2AestheticAssessment
  onChange: (v: Step2AestheticAssessment) => void
  disabled?: boolean
}) {
  return (
    <div className="cj-grid">
      <div className="field">
        <label>Assessment date</label>
        <input
          className="input"
          type="date"
          disabled={disabled}
          value={value.assessedAt}
          onChange={(e) => onChange({ ...value, assessedAt: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Assessor</label>
        <input
          className="input"
          disabled={disabled}
          value={value.assessorName}
          onChange={(e) => onChange({ ...value, assessorName: e.target.value })}
        />
      </div>
      <div className="cj-span-2 cj-points">
        <div className="cj-section-label">16-point aesthetic assessment</div>
        {value.points.map((point, index) => (
          <div className="cj-point-row" key={point.id}>
            <div className="field">
              <label>{point.label}</label>
              <input className="input" disabled value={point.label} readOnly />
            </div>
            <div className="field">
              <label>Score</label>
              <input
                className="input"
                disabled={disabled}
                placeholder="0–5"
                value={point.score}
                onChange={(e) => {
                  const points = value.points.map((p, i) =>
                    i === index ? { ...p, score: e.target.value } : p,
                  )
                  onChange({ ...value, points })
                }}
              />
            </div>
            <div className="field">
              <label>Notes</label>
              <input
                className="input"
                disabled={disabled}
                value={point.notes}
                onChange={(e) => {
                  const points = value.points.map((p, i) =>
                    i === index ? { ...p, notes: e.target.value } : p,
                  )
                  onChange({ ...value, points })
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="field cj-span-2">
        <label>Overall notes</label>
        <textarea
          className="input"
          rows={3}
          disabled={disabled}
          value={value.overallNotes}
          onChange={(e) => onChange({ ...value, overallNotes: e.target.value })}
        />
      </div>
      <div className="cj-span-2">
        <SignaturePad
          label="Assessor signature"
          value={value.assessorSignature}
          onChange={(assessorSignature) => onChange({ ...value, assessorSignature })}
        />
      </div>
    </div>
  )
}

function Step3Form({
  value,
  onChange,
  disabled,
}: {
  value: Step3TreatmentProposal
  onChange: (v: Step3TreatmentProposal) => void
  disabled?: boolean
}) {
  function patch(p: Partial<Step3TreatmentProposal>) {
    onChange({ ...value, ...p })
  }

  function renderLines(
    key: 'lines' | 'addOns' | 'takeHome',
    title: string,
  ) {
    const rows = value[key]
    return (
      <div className="cj-span-2">
        <div className="cj-section-label">{title}</div>
        <div className="cj-proposal-table">
          {rows.map((row, index) => (
            <div className="cj-proposal-row" key={row.id}>
              <div className="field">
                <label>Description</label>
                <input
                  className="input"
                  disabled={disabled}
                  value={row.description}
                  onChange={(e) => {
                    const next = rows.map((r, i) =>
                      i === index ? { ...r, description: e.target.value } : r,
                    )
                    patch({ [key]: next })
                  }}
                />
              </div>
              <div className="field">
                <label>Regular</label>
                <input
                  className="input"
                  disabled={disabled}
                  value={row.regularPrice}
                  onChange={(e) => {
                    const next = rows.map((r, i) =>
                      i === index ? { ...r, regularPrice: e.target.value } : r,
                    )
                    patch({ [key]: next })
                  }}
                />
              </div>
              <div className="field">
                <label>Discounted</label>
                <input
                  className="input"
                  disabled={disabled}
                  value={row.discountedPrice}
                  onChange={(e) => {
                    const next = rows.map((r, i) =>
                      i === index ? { ...r, discountedPrice: e.target.value } : r,
                    )
                    patch({ [key]: next })
                  }}
                />
              </div>
              <div className="field">
                <label>Best offer</label>
                <input
                  className="input"
                  disabled={disabled}
                  value={row.bestOffer}
                  onChange={(e) => {
                    const next = rows.map((r, i) =>
                      i === index ? { ...r, bestOffer: e.target.value } : r,
                    )
                    patch({ [key]: next })
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={disabled || rows.length <= 1}
                onClick={() => patch({ [key]: rows.filter((_, i) => i !== index) })}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled}
          onClick={() => patch({ [key]: [...rows, newLine()] })}
        >
          Add line
        </button>
      </div>
    )
  }

  return (
    <div className="cj-grid">
      <div className="field">
        <label>Patient</label>
        <input
          className="input"
          disabled={disabled}
          value={value.patientName}
          onChange={(e) => patch({ patientName: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Proposal date</label>
        <input
          className="input"
          type="date"
          disabled={disabled}
          value={value.proposalDate}
          onChange={(e) => patch({ proposalDate: e.target.value })}
        />
      </div>
      {renderLines('lines', 'Treatment proposal')}
      {renderLines('addOns', 'Possible add-ons')}
      {renderLines('takeHome', 'Take-home regimen')}
      <div className="field">
        <label>Total regular ₱</label>
        <input
          className="input"
          disabled={disabled}
          value={value.totalRegular}
          onChange={(e) => patch({ totalRegular: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Total discounted ₱</label>
        <input
          className="input"
          disabled={disabled}
          value={value.totalDiscounted}
          onChange={(e) => patch({ totalDiscounted: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Total best offer ₱</label>
        <input
          className="input"
          disabled={disabled}
          value={value.totalBestOffer}
          onChange={(e) => patch({ totalBestOffer: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Mode of payment</label>
        <input
          className="input"
          disabled={disabled}
          value={value.mop}
          onChange={(e) => patch({ mop: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Reservation fee ₱</label>
        <input
          className="input"
          disabled={disabled}
          value={value.reservationFee}
          onChange={(e) => patch({ reservationFee: e.target.value })}
        />
      </div>
      <div className="field" style={{ display: 'flex', alignItems: 'end' }}>
        <label className="cj-check">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.reservationRequired}
            onChange={(e) => patch({ reservationRequired: e.target.checked })}
          />
          Reservation required
        </label>
      </div>
      <div className="field" style={{ display: 'flex', alignItems: 'end' }}>
        <label className="cj-check">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.fullPaymentRequired}
            onChange={(e) => patch({ fullPaymentRequired: e.target.checked })}
          />
          Full payment required
        </label>
      </div>
      <div className="field cj-span-2">
        <label className="cj-check">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.policyAcknowledged}
            onChange={(e) => patch({ policyAcknowledged: e.target.checked })}
          />
          Patient acknowledges reservation & cancellation policy (₱50,000 reservation; non-refundable
          but deductible; reschedule/cancel terms apply)
        </label>
      </div>
      <div className="field cj-span-2">
        <label>Notes</label>
        <textarea
          className="input"
          rows={2}
          disabled={disabled}
          value={value.notes}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Clinic consultant</label>
        <input
          className="input"
          disabled={disabled}
          value={value.consultantName}
          onChange={(e) => patch({ consultantName: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Clinic supervisor</label>
        <input
          className="input"
          disabled={disabled}
          value={value.supervisorName}
          onChange={(e) => patch({ supervisorName: e.target.value })}
        />
      </div>
      <div className="cj-span-2">
        <SignaturePad
          label="Patient conforme"
          value={value.patientSignature}
          onChange={(patientSignature) => patch({ patientSignature })}
        />
      </div>
      <div className="cj-span-2">
        <SignaturePad
          label="Clinic consultant signature"
          value={value.consultantSignature}
          onChange={(consultantSignature) => patch({ consultantSignature })}
        />
      </div>
      <div className="cj-span-2">
        <SignaturePad
          label="Clinic supervisor signature"
          value={value.supervisorSignature}
          onChange={(supervisorSignature) => patch({ supervisorSignature })}
        />
      </div>
    </div>
  )
}

function Step4Form({
  value,
  onChange,
  disabled,
}: {
  value: Step4SocialConsent
  onChange: (v: Step4SocialConsent) => void
  disabled?: boolean
}) {
  function patch(p: Partial<Step4SocialConsent>) {
    onChange({ ...value, ...p })
  }

  return (
    <div className="cj-grid">
      <div className="cj-span-2">
        <div className="cj-section-label">Consent letter</div>
        <div className="cj-consent-box">{value.consentTextVersion}</div>
      </div>
      <div className="field">
        <label>Patient name</label>
        <input
          className="input"
          disabled={disabled}
          value={value.patientName}
          onChange={(e) => patch({ patientName: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Signed date</label>
        <input
          className="input"
          type="date"
          disabled={disabled}
          value={value.signedAt}
          onChange={(e) => patch({ signedAt: e.target.value })}
        />
      </div>
      <div className="cj-span-2">
        <div className="cj-section-label">Permissions</div>
        <div className="cj-check-grid">
          {(
            [
              ['allowPhoto', 'Allow photos'],
              ['allowVideo', 'Allow video'],
              ['allowTagging', 'Allow tagging / naming'],
              ['allowBeforeAfter', 'Allow before & after'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="cj-check">
              <input
                type="checkbox"
                disabled={disabled}
                checked={value[key]}
                onChange={(e) => patch({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="cj-span-2">
        <div className="cj-section-label">Channels</div>
        <div className="cj-check-grid">
          {(
            [
              ['facebook', 'Facebook'],
              ['instagram', 'Instagram'],
              ['tiktok', 'TikTok'],
              ['website', 'Website'],
              ['other', 'Other'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="cj-check">
              <input
                type="checkbox"
                disabled={disabled}
                checked={value.platforms[key]}
                onChange={(e) =>
                  patch({
                    platforms: { ...value.platforms, [key]: e.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="field cj-span-2">
        <label>Other platform notes</label>
        <input
          className="input"
          disabled={disabled}
          value={value.otherPlatformNotes}
          onChange={(e) => patch({ otherPlatformNotes: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Witness name</label>
        <input
          className="input"
          disabled={disabled}
          value={value.witnessName}
          onChange={(e) => patch({ witnessName: e.target.value })}
        />
      </div>
      <div className="cj-span-2">
        <SignaturePad
          label="Patient signature"
          value={value.signatureDataUrl}
          onChange={(signatureDataUrl) => patch({ signatureDataUrl })}
        />
      </div>
      <div className="cj-span-2">
        <SignaturePad
          label="Witness signature"
          value={value.witnessSignature}
          onChange={(witnessSignature) => patch({ witnessSignature })}
        />
      </div>
    </div>
  )
}
