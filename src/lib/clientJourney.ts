import { supabase } from './supabase'
import { isUuid } from './utils'
import {
  AESTHETIC_POINTS,
  SOCIAL_CONSENT_TEXT_V1,
  type ClientJourney,
  type ClientJourneyStep,
  type JourneyStepNumber,
  type StepAestheticAssessment,
  type StepAftercare,
  type StepBilling,
  type StepMedicalForms,
  type StepRecordService,
  type StepReviewHistory,
  type StepSocialConsent,
  type StepSupplies,
  type StepTreatment,
  type StepTreatmentProposal,
  type StepWait,
  type StepWelcome,
  type VisitLinks,
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

function emptyProposalLine() {
  return {
    id: crypto.randomUUID(),
    description: '',
    regularPrice: '',
    discountedPrice: '',
    bestOffer: '',
  }
}

export function emptyMedicalForms(seed?: Partial<JourneyCustomerSeed> | null): StepMedicalForms {
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

export function emptyAesthetic(): StepAestheticAssessment {
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

export function emptyProposal(patientName = ''): StepTreatmentProposal {
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

export function emptySocialConsent(patientName = ''): StepSocialConsent {
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

export function emptyWelcome(): StepWelcome {
  return { reasonForVisit: '', detailsConfirmed: false, greeted: false, notes: '' }
}

export function emptyReview(): StepReviewHistory {
  return {
    historyChecked: false,
    medicationsChecked: false,
    allergiesChecked: false,
    concernRaised: false,
    concernNotes: '',
    reviewerName: '',
  }
}

export function emptyRecordService(): StepRecordService {
  return { serviceAgreed: false, serviceName: '', notes: '' }
}

export function emptyBilling(): StepBilling {
  return { paymentDone: false, paymentExplained: false, receiptNo: '', notes: '' }
}

export function emptyWait(): StepWait {
  return { waterOffered: false, expectationsSet: false, notes: '' }
}

export function emptySupplies(): StepSupplies {
  return { suppliesReady: false, extrasNoted: false, notes: '' }
}

export function emptyTreatment(): StepTreatment {
  return { handedOff: false, treatmentDone: false, notes: '' }
}

export function emptyAftercare(): StepAftercare {
  return { escortedOut: false, aftercareReviewed: false, aftercareNotes: '' }
}

/** @deprecated */
export const emptyStep1 = emptyMedicalForms
/** @deprecated */
export const emptyStep2 = emptyAesthetic
/** @deprecated */
export const emptyStep3 = emptyProposal
/** @deprecated */
export const emptyStep4 = emptySocialConsent

export function defaultPayloadForStep(
  step: JourneyStepNumber,
  seed?: Partial<JourneyCustomerSeed> | null,
): Record<string, unknown> {
  switch (step) {
    case 1:
      return emptyWelcome() as unknown as Record<string, unknown>
    case 2:
      return emptyMedicalForms(seed) as unknown as Record<string, unknown>
    case 3:
      return emptyReview() as unknown as Record<string, unknown>
    case 4:
      return emptyAesthetic() as unknown as Record<string, unknown>
    case 5:
      return emptyProposal(seed?.name ?? '') as unknown as Record<string, unknown>
    case 6:
      return emptyRecordService() as unknown as Record<string, unknown>
    case 7:
      return emptyBilling() as unknown as Record<string, unknown>
    case 8:
      return emptyWait() as unknown as Record<string, unknown>
    case 9:
      return emptySupplies() as unknown as Record<string, unknown>
    case 10:
      return emptyTreatment() as unknown as Record<string, unknown>
    case 11:
      return emptyAftercare() as unknown as Record<string, unknown>
  }
}

export function buildReturnTo(journeyId: string) {
  return `/client-journey?journeyId=${encodeURIComponent(journeyId)}`
}

export function clientsAvailHref(customerId: string, journeyId: string) {
  const qs = new URLSearchParams({
    customerId,
    avail: '1',
    returnTo: buildReturnTo(journeyId),
    journeyId,
  })
  return `/clients?${qs.toString()}`
}

export function posHref(customerId: string, journeyId: string) {
  const qs = new URLSearchParams({
    customerId,
    returnTo: buildReturnTo(journeyId),
    journeyId,
  })
  return `/pos?${qs.toString()}`
}

export function sessionsHref(packageId: string | null | undefined, journeyId: string) {
  const qs = new URLSearchParams({
    returnTo: buildReturnTo(journeyId),
    journeyId,
  })
  if (packageId && isUuid(packageId)) qs.set('packageId', packageId)
  return `/sessions?${qs.toString()}`
}

export function clientsHref(customerId: string, journeyId: string) {
  const qs = new URLSearchParams({
    customerId,
    returnTo: buildReturnTo(journeyId),
    journeyId,
  })
  return `/clients?${qs.toString()}`
}

export function registerHref(journeyId?: string) {
  if (!journeyId) return '/register-clients'
  const qs = new URLSearchParams({
    returnTo: buildReturnTo(journeyId),
    journeyId,
  })
  return `/register-clients?${qs.toString()}`
}

function normalizeJourney(row: Record<string, unknown>): ClientJourney {
  return {
    id: String(row.id),
    customer_id: String(row.customer_id),
    branch_id: (row.branch_id as string | null) ?? null,
    status: row.status as ClientJourney['status'],
    current_step: Number(row.current_step || 1) as JourneyStepNumber,
    links: (row.links as VisitLinks) || {},
    safety_paused: Boolean(row.safety_paused),
    safety_cleared_at: (row.safety_cleared_at as string | null) ?? null,
    safety_note: (row.safety_note as string | null) ?? null,
    social_consent: (row.social_consent as StepSocialConsent | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
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
  return (data as Record<string, unknown>[]).map(normalizeJourney)
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
    journey: normalizeJourney(journey as Record<string, unknown>),
    steps: ((steps as ClientJourneyStep[] | null) ?? []).map((s) => ({
      ...s,
      step_number: Number(s.step_number) as JourneyStepNumber,
    })),
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
      links: {},
      safety_paused: false,
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
        error: `${msg} — run supabase/add_client_visit_board.sql in Supabase.`,
      }
    }
    return { ok: false, error: msg }
  }
  return { ok: true, journey: normalizeJourney(data as Record<string, unknown>) }
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
          ? `${stepErr.message} — run supabase/add_client_visit_board.sql in Supabase.`
          : stepErr.message,
    }
  }

  const journeyPatch: Record<string, unknown> = {
    updated_at: now,
    updated_by: userId,
    status: opts.stepNumber === 11 && opts.markComplete ? 'completed' : 'in_progress',
  }

  if (opts.advance && opts.markComplete && opts.stepNumber < 11) {
    journeyPatch.current_step = (opts.stepNumber + 1) as JourneyStepNumber
  } else if (opts.markComplete && opts.stepNumber === 11) {
    journeyPatch.current_step = 11
  } else if (!opts.markComplete) {
    journeyPatch.current_step = opts.stepNumber
  }

  const { error: journeyErr } = await supabase
    .from('client_journeys')
    .update(journeyPatch)
    .eq('id', opts.journeyId)

  if (journeyErr) return { ok: false, error: journeyErr.message }
  return { ok: true }
}

export async function updateJourneySafety(opts: {
  journeyId: string
  safetyPaused: boolean
  safetyNote: string | null
  userId: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(opts.journeyId)) return { ok: false, error: 'Invalid journey.' }
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('client_journeys')
    .update({
      safety_paused: opts.safetyPaused,
      safety_note: opts.safetyNote,
      safety_cleared_at: opts.safetyPaused ? null : now,
      updated_at: now,
      updated_by: opts.userId && isUuid(opts.userId) ? opts.userId : null,
    })
    .eq('id', opts.journeyId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateJourneyLinks(opts: {
  journeyId: string
  links: VisitLinks
  userId: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(opts.journeyId)) return { ok: false, error: 'Invalid journey.' }
  const { data: existing } = await supabase
    .from('client_journeys')
    .select('links')
    .eq('id', opts.journeyId)
    .maybeSingle()
  const prev = ((existing as { links?: VisitLinks } | null)?.links || {}) as VisitLinks
  const { error } = await supabase
    .from('client_journeys')
    .update({
      links: { ...prev, ...opts.links },
      updated_at: new Date().toISOString(),
      updated_by: opts.userId && isUuid(opts.userId) ? opts.userId : null,
    })
    .eq('id', opts.journeyId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function saveSocialConsent(opts: {
  journeyId: string
  consent: StepSocialConsent
  userId: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(opts.journeyId)) return { ok: false, error: 'Invalid journey.' }
  const { error } = await supabase
    .from('client_journeys')
    .update({
      social_consent: opts.consent,
      updated_at: new Date().toISOString(),
      updated_by: opts.userId && isUuid(opts.userId) ? opts.userId : null,
    })
    .eq('id', opts.journeyId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export function proposalBlockedBySafety(journey: ClientJourney | null): boolean {
  if (!journey) return false
  return journey.safety_paused && !journey.safety_cleared_at
}
