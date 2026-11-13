import { SignaturePad } from '../SignaturePad'
import type {
  StepAestheticAssessment,
  StepMedicalForms,
  StepSocialConsent,
  StepTreatmentProposal,
} from '../../types/clientJourney'
import type { CustomerLifestyle, CustomerMedicalConditions } from '../../types'

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

export function MedicalFormsEditor({
  value,
  onChange,
  disabled,
}: {
  value: StepMedicalForms
  onChange: (v: StepMedicalForms) => void
  disabled?: boolean
}) {
  function patch(p: Partial<StepMedicalForms>) {
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

export function AestheticFormsEditor({
  value,
  onChange,
  disabled,
}: {
  value: StepAestheticAssessment
  onChange: (v: StepAestheticAssessment) => void
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

export function ProposalFormsEditor({
  value,
  onChange,
  disabled,
}: {
  value: StepTreatmentProposal
  onChange: (v: StepTreatmentProposal) => void
  disabled?: boolean
}) {
  function patch(p: Partial<StepTreatmentProposal>) {
    onChange({ ...value, ...p })
  }

  function renderLines(key: 'lines' | 'addOns' | 'takeHome', title: string) {
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
          Patient acknowledges reservation & cancellation policy
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

export function SocialConsentEditor({
  value,
  onChange,
  disabled,
}: {
  value: StepSocialConsent
  onChange: (v: StepSocialConsent) => void
  disabled?: boolean
}) {
  function patch(p: Partial<StepSocialConsent>) {
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
