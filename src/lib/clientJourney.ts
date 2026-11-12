import { supabase } from './supabase'
import { isUuid } from './utils'
import {
  AESTHETIC_POINTS,
  SOCIAL_CONSENT_TEXT_V1,
  type ClientJourney,
  type ClientJourneyStep,
  type JourneyStepNumber,
  type Step1MedicalAssessment,
  type Step2AestheticAssessment,
  type Step3TreatmentProposal,
  type Step4SocialConsent,
} from '../types/clientJourney'
import type { CustomerHistoryNote, CustomerLifestyle, CustomerMedicalConditions } from '../types'

export type JourneyCustomerSeed = {
  id: string
  name: string
  phone: string | null
  email: string | null
  sex: string | null
  address: string | null
  birthday: string | null
  age: number | null
  occupation: string | null
  facebook: string | null
  instagram: string | null
  medical_conditions: CustomerMedicalConditions | null
  topical_medications: string | null
  medications_intake: string | null
  lifestyle: CustomerLifestyle | null
  history_notes: CustomerHistoryNote[] | null
  membership: string | null
  membership_expires_at: string | null
}

function emptyProposalLine(): Step3TreatmentProposal['lines'][number] {
  return {
    id: crypto.randomUUID(),
    description: '',
    regularPrice: '',
    discountedPrice: '',
    bestOffer: '',
  }
}

export function emptyStep1(seed?: Partial<JourneyCustomerSeed> | null): Step1MedicalAssessment {
  return {
    patientName: seed?.name ?? '',
    sex: seed?.sex ?? '',
    birthday: seed?.birthday ?? '',
    age: seed?.age != null ? String(seed.age) : '',
    phone: seed?.phone ?? '',
    email: seed?.email ?? '',
    address: seed?.address ?? '',
    occupation: seed?.occupation ?? '',
    facebook: seed?.facebook ?? '',
    instagram: seed?.instagram ?? '',
    chiefComplaint: '',
    historyNotes: Array.isArray(seed?.history_notes) ? seed!.history_notes! : [],
    topicalMedications: seed?.topical_medications ?? '',
    medicalConditions: seed?.medical_conditions ?? {},
    medicationsIntake: seed?.medications_intake ?? '',
    lifestyle: seed?.lifestyle ?? {},
    assessmentNotes: '',
    skinType: '',
    treatmentGoals: '',
    doctorFindings: '',
    recommendedPlan: '',
    patientSignature: '',
    doctorSignature: '',
    assessedAt: new Date().toISOString().slice(0, 10),
  }
}

export function emptyStep2(): Step2AestheticAssessment {
  return {
    assessedAt: new Date().toISOString().slice(0, 10),
    overallNotes: '',
    points: AESTHETIC_POINTS.map((p) => ({
      id: p.id,
      label: p.label,
      score: '',
      notes: '',
    })),
    assessorName: '',
    assessorSignature: '',
  }
}

export function emptyStep3(patientName = ''): Step3TreatmentProposal {
  return {
    patientName,
    proposalDate: new Date().toISOString().slice(0, 10),
    lines: [emptyProposalLine()],
    addOns: [],
    takeHome: [
      {
        id: crypto.randomUUID(),
        description: 'Post operative medication',
        regularPrice: '',
        discountedPrice: '',
        bestOffer: '',
      },
      {
        id: crypto.randomUUID(),
        description: 'Garments',
        regularPrice: '',
        discountedPrice: 'TO FOLLOW',
        bestOffer: '',
      },
    ],
    totalRegular: '',
    totalDiscounted: '',
    totalBestOffer: '',
    mop: 'Cash / BT',
    reservationRequired: true,
    reservationFee: '50000',
    fullPaymentRequired: true,
    policyAcknowledged: false,
    patientSignature: '',
    consultantSignature: '',
    supervisorSignature: '',
    consultantName: '',
    supervisorName: '',
    notes: '',
  }
}

export function emptyStep4(patientName = ''): Step4SocialConsent {
  return {
    consentTextVersion: SOCIAL_CONSENT_TEXT_V1,
    patientName,
    signedAt: new Date().toISOString().slice(0, 10),
    allowPhoto: true,
    allowVideo: true,
    allowTagging: false,
    allowBeforeAfter: true,
    platforms: {
      facebook: true,
      instagram: true,
      tiktok: false,
      website: true,
      other: false,
    },
    otherPlatformNotes: '',
    signatureDataUrl: '',
    witnessName: '',
    witnessSignature: '',
  }
}

export function defaultPayloadForStep(
  step: JourneyStepNumber,
  seed?: Partial<JourneyCustomerSeed> | null,
): Step1MedicalAssessment | Step2AestheticAssessment | Step3TreatmentProposal | Step4SocialConsent {
  if (step === 1) return emptyStep1(seed)
  if (step === 2) return emptyStep2()
  if (step === 3) return emptyStep3(seed?.name ?? '')
  return emptyStep4(seed?.name ?? '')
}

export async function searchCustomersForJourney(
  query: string,
  branchId: string | null,
): Promise<JourneyCustomerSeed[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const { data, error } = await supabase
    .from('customers')
    .select(
      'id, name, phone, email, sex, address, birthday, age, occupation, facebook, instagram, medical_conditions, topical_medications, medications_intake, lifestyle, history_notes, membership, membership_expires_at, branch_id',
    )
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
    .order('name')
    .limit(40)

  if (error || !data) return []
  const rows = data as (JourneyCustomerSeed & { branch_id?: string | null })[]
  if (!isUuid(branchId)) return rows
  return rows.filter((r) => !r.branch_id || r.branch_id === branchId).slice(0, 20)
}

export async function loadCustomerSeed(customerId: string): Promise<JourneyCustomerSeed | null> {
  if (!isUuid(customerId)) return null
  const { data, error } = await supabase
    .from('customers')
    .select(
      'id, name, phone, email, sex, address, birthday, age, occupation, facebook, instagram, medical_conditions, topical_medications, medications_intake, lifestyle, history_notes, membership, membership_expires_at',
    )
    .eq('id', customerId)
    .maybeSingle()
  if (error || !data) return null
  return data as JourneyCustomerSeed
}

export async function listJourneysForCustomer(customerId: string): Promise<ClientJourney[]> {
  if (!isUuid(customerId)) return []
  const { data, error } = await supabase
    .from('client_journeys')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data as ClientJourney[]
}

export async function loadJourneyWithSteps(journeyId: string): Promise<{
  journey: ClientJourney
  steps: ClientJourneyStep[]
} | null> {
  if (!isUuid(journeyId)) return null
  const { data: journey, error } = await supabase
    .from('client_journeys')
    .select('*')
    .eq('id', journeyId)
    .maybeSingle()
  if (error || !journey) return null

  const { data: steps } = await supabase
    .from('client_journey_steps')
    .select('*')
    .eq('journey_id', journeyId)
    .order('step_number')

  return {
    journey: journey as ClientJourney,
    steps: (steps as ClientJourneyStep[] | null) ?? [],
  }
}

export async function createJourney(opts: {
  customerId: string
  branchId: string | null
  userId: string | null
}): Promise<{ ok: true; journey: ClientJourney } | { ok: false; error: string }> {
  if (!isUuid(opts.customerId)) return { ok: false, error: 'Invalid customer.' }

  const { data, error } = await supabase
    .from('client_journeys')
    .insert({
      customer_id: opts.customerId,
      branch_id: opts.branchId && isUuid(opts.branchId) ? opts.branchId : null,
      status: 'draft',
      current_step: 1,
      created_by: opts.userId && isUuid(opts.userId) ? opts.userId : null,
      updated_by: opts.userId && isUuid(opts.userId) ? opts.userId : null,
    })
    .select('*')
    .single()

  if (error || !data) {
    const msg = error?.message || 'Could not create journey.'
    if (msg.includes('client_journeys') || msg.includes('schema cache')) {
      return {
        ok: false,
        error: `${msg} — run supabase/add_client_journey.sql in Supabase.`,
      }
    }
    return { ok: false, error: msg }
  }
  return { ok: true, journey: data as ClientJourney }
}

export async function upsertJourneyStep(opts: {
  journeyId: string
  stepNumber: JourneyStepNumber
  payload: Record<string, unknown>
  markComplete: boolean
  userId: string | null
  advance?: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(opts.journeyId)) return { ok: false, error: 'Invalid journey.' }

  const now = new Date().toISOString()
  const userId = opts.userId && isUuid(opts.userId) ? opts.userId : null

  const { data: existing } = await supabase
    .from('client_journey_steps')
    .select('id, completed_at, completed_by')
    .eq('journey_id', opts.journeyId)
    .eq('step_number', opts.stepNumber)
    .maybeSingle()

  const existingRow = existing as {
    id?: string
    completed_at?: string | null
    completed_by?: string | null
  } | null

  const stepRow: Record<string, unknown> = {
    journey_id: opts.journeyId,
    step_number: opts.stepNumber,
    payload: opts.payload,
    updated_at: now,
  }
  if (opts.markComplete) {
    stepRow.completed_at = now
    stepRow.completed_by = userId
  } else if (!existingRow?.id) {
    stepRow.completed_at = null
    stepRow.completed_by = null
  }

  const { error: stepErr } = existingRow?.id
    ? await supabase.from('client_journey_steps').update(stepRow).eq('id', existingRow.id)
    : await supabase.from('client_journey_steps').insert(stepRow)

  if (stepErr) {
    return {
      ok: false,
      error:
        stepErr.message.includes('client_journey') || stepErr.message.includes('schema cache')
          ? `${stepErr.message} — run supabase/add_client_journey.sql in Supabase.`
          : stepErr.message,
    }
  }

  const nextStep = opts.advance
    ? Math.min(4, opts.stepNumber + (opts.markComplete ? 1 : 0))
    : undefined

  const journeyPatch: Record<string, unknown> = {
    updated_at: now,
    updated_by: userId,
    status: opts.stepNumber === 4 && opts.markComplete ? 'completed' : 'in_progress',
  }
  if (nextStep != null) journeyPatch.current_step = nextStep
  else if (opts.markComplete && opts.stepNumber < 4) {
    journeyPatch.current_step = (opts.stepNumber + 1) as JourneyStepNumber
  }

  const { error: journeyErr } = await supabase
    .from('client_journeys')
    .update(journeyPatch)
    .eq('id', opts.journeyId)

  if (journeyErr) return { ok: false, error: journeyErr.message }
  return { ok: true }
}
