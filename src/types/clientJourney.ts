import type { CustomerLifestyle, CustomerMedicalConditions, CustomerHistoryNote } from './index'

export type JourneyStatus = 'draft' | 'in_progress' | 'completed'

export type JourneyStepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export const JOURNEY_STEP_LABELS = [
  'Welcome & register',
  'Complete client forms',
  'Review medical history',
  '16-point assessment',
  'Personalized proposal',
  'Confirm & record service',
  'Complete billing',
  'Wait comfortably',
  'Prepare supplies',
  'Provider performs treatment',
  'Usher out & aftercare',
] as const

export const JOURNEY_STEP_HINTS = [
  'Greet warmly; confirm the client’s details and reason for visit.',
  'Patient Assessment Form and Medical History Form.',
  'Check history, medications, allergies and any safety concerns.',
  'Complete the assessment and document relevant findings.',
  'Explain suitable options, expected costs and next steps.',
  'Once the client agrees, document the selected service.',
  'Process payment and explain the bill clearly.',
  'Offer water and let the client know what to expect.',
  'Set up the correct supplies for the assigned service provider.',
  'Hand over clearly; provider confirms plan and delivers the service.',
  'Escort the client and review aftercare instructions.',
] as const

export type VisitLinks = {
  saleId?: string | null
  saleReceiptNo?: string | null
  packageId?: string | null
  sessionSlotId?: string | null
  appointmentId?: string | null
}

/** Board step 2 — medical + patient assessment (legacy clinical step 1) */
export type StepMedicalForms = {
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

/** Board step 4 */
export type StepAestheticAssessment = {
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

/** Board step 5 */
export type StepTreatmentProposal = {
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

/** Optional — not a board step */
export type StepSocialConsent = {
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

export type StepWelcome = {
  reasonForVisit: string
  detailsConfirmed: boolean
  greeted: boolean
  notes: string
}

export type StepReviewHistory = {
  historyChecked: boolean
  medicationsChecked: boolean
  allergiesChecked: boolean
  concernRaised: boolean
  concernNotes: string
  reviewerName: string
}

export type StepRecordService = {
  serviceAgreed: boolean
  serviceName: string
  notes: string
}

export type StepBilling = {
  paymentDone: boolean
  paymentExplained: boolean
  receiptNo: string
  notes: string
}

export type StepWait = {
  waterOffered: boolean
  expectationsSet: boolean
  notes: string
}

export type StepSupplies = {
  suppliesReady: boolean
  extrasNoted: boolean
  notes: string
}

export type StepTreatment = {
  handedOff: boolean
  treatmentDone: boolean
  notes: string
}

export type StepAftercare = {
  escortedOut: boolean
  aftercareReviewed: boolean
  aftercareNotes: string
}

export type JourneyStepPayload =
  | StepWelcome
  | StepMedicalForms
  | StepReviewHistory
  | StepAestheticAssessment
  | StepTreatmentProposal
  | StepRecordService
  | StepBilling
  | StepWait
  | StepSupplies
  | StepTreatment
  | StepAftercare
  | Record<string, unknown>

export type ClientJourney = {
  id: string
  customer_id: string
  branch_id: string | null
  status: JourneyStatus
  current_step: JourneyStepNumber
  links: VisitLinks
  safety_paused: boolean
  safety_cleared_at: string | null
  safety_note: string | null
  social_consent: StepSocialConsent | null
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

/** @deprecated Use StepMedicalForms */
export type Step1MedicalAssessment = StepMedicalForms
/** @deprecated Use StepAestheticAssessment */
export type Step2AestheticAssessment = StepAestheticAssessment
/** @deprecated Use StepTreatmentProposal */
export type Step3TreatmentProposal = StepTreatmentProposal
/** @deprecated Use StepSocialConsent */
export type Step4SocialConsent = StepSocialConsent
