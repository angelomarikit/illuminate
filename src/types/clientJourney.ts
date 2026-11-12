import type { CustomerLifestyle, CustomerMedicalConditions, CustomerHistoryNote } from './index'

export type JourneyStatus = 'draft' | 'in_progress' | 'completed'

export const JOURNEY_STEP_LABELS = [
  'Medical & assessment',
  '16-point aesthetic',
  'Treatment proposal',
  'Social media consent',
] as const

export type JourneyStepNumber = 1 | 2 | 3 | 4

export type Step1MedicalAssessment = {
  patientName: string
  sex: string
  birthday: string
  age: string
  phone: string
  email: string
  address: string
  occupation: string
  facebook: string
  instagram: string
  chiefComplaint: string
  historyNotes: CustomerHistoryNote[]
  topicalMedications: string
  medicalConditions: CustomerMedicalConditions
  medicationsIntake: string
  lifestyle: CustomerLifestyle
  assessmentNotes: string
  skinType: string
  treatmentGoals: string
  doctorFindings: string
  recommendedPlan: string
  patientSignature: string
  doctorSignature: string
  assessedAt: string
}

export const AESTHETIC_POINTS: { id: string; label: string }[] = [
  { id: 'skin_quality', label: 'Skin quality / texture' },
  { id: 'forehead', label: 'Forehead lines' },
  { id: 'glabella', label: 'Glabella' },
  { id: 'temples', label: 'Temporal hollow' },
  { id: 'brows', label: 'Brow position' },
  { id: 'upper_eyelid', label: 'Upper eyelid' },
  { id: 'tear_trough', label: 'Lower eyelid / tear trough' },
  { id: 'crows_feet', label: "Crow's feet" },
  { id: 'cheeks', label: 'Midface / cheeks' },
  { id: 'nose', label: 'Nose shape' },
  { id: 'nasolabial', label: 'Nasolabial folds' },
  { id: 'lips', label: 'Lips volume / shape' },
  { id: 'marionette', label: 'Marionette lines' },
  { id: 'jawline', label: 'Jawline' },
  { id: 'chin', label: 'Chin projection' },
  { id: 'neck', label: 'Neck / submental' },
]

export type AestheticPointEntry = {
  id: string
  label: string
  score: string
  notes: string
}

export type Step2AestheticAssessment = {
  assessedAt: string
  overallNotes: string
  points: AestheticPointEntry[]
  assessorName: string
  assessorSignature: string
}

export type ProposalLine = {
  id: string
  description: string
  regularPrice: string
  discountedPrice: string
  bestOffer: string
}

export type Step3TreatmentProposal = {
  patientName: string
  proposalDate: string
  lines: ProposalLine[]
  addOns: ProposalLine[]
  takeHome: ProposalLine[]
  totalRegular: string
  totalDiscounted: string
  totalBestOffer: string
  mop: string
  reservationRequired: boolean
  reservationFee: string
  fullPaymentRequired: boolean
  policyAcknowledged: boolean
  patientSignature: string
  consultantSignature: string
  supervisorSignature: string
  consultantName: string
  supervisorName: string
  notes: string
}

export type Step4SocialConsent = {
  consentTextVersion: string
  patientName: string
  signedAt: string
  allowPhoto: boolean
  allowVideo: boolean
  allowTagging: boolean
  allowBeforeAfter: boolean
  platforms: {
    facebook: boolean
    instagram: boolean
    tiktok: boolean
    website: boolean
    other: boolean
  }
  otherPlatformNotes: string
  signatureDataUrl: string
  witnessName: string
  witnessSignature: string
}

export type JourneyStepPayload =
  | Step1MedicalAssessment
  | Step2AestheticAssessment
  | Step3TreatmentProposal
  | Step4SocialConsent

export type ClientJourney = {
  id: string
  customer_id: string
  branch_id: string | null
  status: JourneyStatus
  current_step: JourneyStepNumber
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type ClientJourneyStep = {
  id: string
  journey_id: string
  step_number: JourneyStepNumber
  payload: JourneyStepPayload
  completed_at: string | null
  completed_by: string | null
  created_at: string
  updated_at: string
}

export const SOCIAL_CONSENT_TEXT_V1 = `I hereby grant Illuminate Aesthetic Clinic permission to capture, use, and publish photographs and/or video recordings of me for marketing, education, and social media purposes. I understand that my likeness may appear on the clinic's official channels and that I may withdraw this consent in writing for future publications. Past publications made in good faith prior to withdrawal may remain in circulation.`
