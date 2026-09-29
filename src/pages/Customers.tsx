import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Search, Trash2, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { AvailServiceModal } from '../components/AvailServiceModal'
import { ClientsSubnav } from '../components/ClientsSubnav'
import { MembershipBadge } from '../components/MembershipBadge'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { isClinicRole } from '../lib/roles'
import { normalizeMembership } from '../lib/membership'
import { formatCurrency } from '../lib/utils'
import { supabase } from '../lib/supabase'
import type {
  Customer,
  CustomerHistoryNote,
  CustomerLifestyle,
  CustomerMedicalConditions,
} from '../types'
import './Customers.css'

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

type CustomerRow = {
  id: string
  branch_id: string | null
  full_name: string
  phone: string | null
  email: string | null
  membership: string
  membership_expires_at: string | null
  points: number
  cash_in_balance: number | string
  visits: number
  last_visit: string | null
  age: number | null
  birthday: string | null
  sex: string | null
  address: string | null
  medical_history: string | null
  notes: string | null
  occupation: string | null
  facebook: string | null
  instagram: string | null
  medical_conditions: CustomerMedicalConditions | null
  topical_medications: string | null
  medications_intake: string | null
  lifestyle: CustomerLifestyle | null
  history_notes: CustomerHistoryNote[] | null
  signature_primary: string | null
  signature_confirm: string | null
  intake_completed_at: string | null
}

function displayOrNA(value: unknown): string {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value === 'string' && !value.trim()) return 'N/A'
  if (Array.isArray(value) && value.length === 0) return 'N/A'
  if (typeof value === 'number' && Number.isNaN(value)) return 'N/A'
  return String(value)
}

function IntakeFact({ label, value, full }: { label: string; value: string; full?: boolean }) {
  const empty = value === 'N/A'
  return (
    <div className={full ? 'crm-intake-full' : undefined}>
      <span>{label}</span>
      <strong className={empty ? 'is-empty' : undefined}>{value}</strong>
    </div>
  )
}

function IntakeText({ value }: { value: unknown }) {
  const text = displayOrNA(value)
  return <p className={`crm-intake-block${text === 'N/A' ? ' is-empty' : ''}`}>{text}</p>
}

const MEDICAL_LABELS: { key: keyof CustomerMedicalConditions; label: string }[] = [
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

const LIFESTYLE_LABELS: { key: keyof CustomerLifestyle; label: string }[] = [
  { key: 'smoking', label: 'Smoking' },
  { key: 'alcohol', label: 'Alcohol' },
  { key: 'beverages', label: 'Beverages' },
]

function formatCheckedChips(
  source: CustomerMedicalConditions | CustomerLifestyle | null | undefined,
  labels: { key: string; label: string }[],
): { chips: string[]; others: string } {
  if (!source || typeof source !== 'object') return { chips: [], others: '' }
  const chips = labels
    .filter((item) => Boolean((source as Record<string, unknown>)[item.key]))
    .map((item) => item.label)
  const others =
    typeof (source as { others?: unknown }).others === 'string'
      ? (source as { others?: string }).others?.trim() || ''
      : ''
  return { chips, others }
}

function formatBirthday(value: string | null | undefined) {
  if (!value) return 'N/A'
  const d = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.full_name,
    phone: row.phone ?? '',
    email: row.email ?? '',
    membership: normalizeMembership(row.membership),
    membershipExpiresAt: row.membership_expires_at ?? null,
    points: row.points ?? 0,
    cashInBalance: Number(row.cash_in_balance ?? 0),
    visits: row.visits ?? 0,
    lastVisit: row.last_visit ?? '—',
    branchId: row.branch_id ?? '',
    age: row.age,
    birthday: row.birthday ?? null,
    sex: row.sex ?? '',
    address: row.address ?? '',
    medicalHistory: row.medical_history ?? '',
    notes: row.notes ?? '',
    occupation: row.occupation ?? null,
    facebook: row.facebook ?? null,
    instagram: row.instagram ?? null,
    medicalConditions: row.medical_conditions ?? null,
    topicalMedications: row.topical_medications ?? null,
    medicationsIntake: row.medications_intake ?? null,
    lifestyle: row.lifestyle ?? null,
    historyNotes: Array.isArray(row.history_notes) ? row.history_notes : null,
    signaturePrimary: row.signature_primary ?? null,
    signatureConfirm: row.signature_confirm ?? null,
    intakeCompletedAt: row.intake_completed_at ?? null,
  }
}

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  birthday: '',
  sex: '',
  address: '',
  medicalHistory: '',
  notes: '',
  membership: 'Regular' as Customer['membership'],
  membershipExpiresAt: '',
}

export function Customers() {
  const { branchId } = useBranch()
  const { user } = useAuth()
  const location = useLocation()
  const canManageConsent = isClinicRole(user?.role)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [availOpen, setAvailOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => rows.find((c) => c.id === selectedId) ?? null,
    [rows, selectedId],
  )

  useEffect(() => {
    const registered = (location.state as { registered?: string } | null)?.registered
    if (registered) {
      setMessage(`Client registered: ${registered}`)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    setError('')

    let request = supabase
      .from('customers')
      .select(
        'id, branch_id, full_name, phone, email, membership, membership_expires_at, points, cash_in_balance, visits, last_visit, age, birthday, sex, address, medical_history, notes, occupation, facebook, instagram, medical_conditions, topical_medications, medications_intake, lifestyle, history_notes, signature_primary, signature_confirm, intake_completed_at',
      )
      .order('full_name')

    if (branchId && isUuid(branchId)) {
      request = request.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }

    const { data, error: fetchError } = await request

    if (fetchError) {
      setError(
        fetchError.message.includes('occupation') ||
          fetchError.message.includes('history_notes') ||
          fetchError.message.includes('signature_primary') ||
          fetchError.message.includes('schema cache')
          ? `${fetchError.message} — run supabase/add_customer_intake.sql in Supabase.`
          : fetchError.message.includes('birthday')
            ? `${fetchError.message} — run supabase/add_customer_birthday.sql in Supabase.`
            : fetchError.message.includes('age') || fetchError.message.includes('medical_history')
              ? `${fetchError.message} — run supabase/fix_public_booking_flow.sql in Supabase.`
              : fetchError.message,
      )
      setRows([])
    } else {
      setRows((data as CustomerRow[] | null)?.map(mapCustomer) ?? [])
    }

    setLoading(false)
  }, [branchId])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    )
  }, [rows, query])

  const PAGE_SIZE = 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, currentPage])

  useEffect(() => {
    setPage(1)
  }, [query, branchId])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function openCreate() {
    setError('')
    setMessage('')
    setEditingId(null)
    setConfirmDelete(false)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(client: Customer) {
    if (!canManageConsent) return
    setError('')
    setMessage('')
    setConfirmDelete(false)
    setEditingId(client.id)
    setForm({
      name: client.name,
      phone: client.phone,
      email: client.email,
      birthday: client.birthday ? client.birthday.slice(0, 10) : '',
      sex: client.sex || '',
      address: client.address || '',
      medicalHistory: client.medicalHistory || '',
      notes: client.notes || '',
      membership: normalizeMembership(client.membership),
      membershipExpiresAt: client.membershipExpiresAt
        ? client.membershipExpiresAt.slice(0, 10)
        : '',
    })
    setShowForm(true)
  }

  function closeForm() {
    if (saving) return
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    const name = form.name.trim()
    const phone = form.phone.trim()
    const email = form.email.trim().toLowerCase()
    if (!name || !phone || !email) {
      setSaving(false)
      setError('Full name, email, and phone number are required.')
      return
    }

    const birthday = form.birthday || null
    let age: number | null = null
    if (birthday) {
      const born = new Date(`${birthday}T12:00:00`)
      const today = new Date()
      age = today.getFullYear() - born.getFullYear()
      const md = today.getMonth() - born.getMonth()
      if (md < 0 || (md === 0 && today.getDate() < born.getDate())) age -= 1
    }

    const membership = normalizeMembership(form.membership)
    const membershipExpiresAt =
      membership === 'Regular' ? null : form.membershipExpiresAt || null

    if (membership !== 'Regular' && !membershipExpiresAt) {
      setError('Set membership expiry for VIP / VVIP, or leave membership as Regular.')
      setSaving(false)
      return
    }

    const payload = {
      full_name: name,
      phone,
      email,
      birthday,
      age,
      sex: form.sex.trim() || null,
      address: form.address.trim() || null,
      medical_history: form.medicalHistory.trim() || null,
      notes: form.notes.trim() || null,
      membership,
      membership_expires_at: membershipExpiresAt,
    }

    if (editingId) {
      const { error: updateError } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', editingId)

      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }

      setMessage(`Updated client: ${name}.`)
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
      await loadCustomers()
      return
    }

    const { error: insertError } = await supabase.from('customers').insert({
      ...payload,
      branch_id: branchId && isUuid(branchId) ? branchId : null,
      points: 0,
      cash_in_balance: 0,
      visits: 0,
    })

    setSaving(false)
    if (insertError) {
      setError(
        insertError.message.includes('membership_expires_at') ||
          insertError.message.includes('schema cache')
          ? `${insertError.message} — run supabase/add_membership_subscription.sql in Supabase.`
          : insertError.message.includes('birthday')
            ? `${insertError.message} — run supabase/add_customer_birthday.sql in Supabase.`
            : insertError.message,
      )
      return
    }

    setMessage(`Added client: ${name}.`)
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    await loadCustomers()
  }

  async function onDeleteClient() {
    if (!selected || !canManageConsent) return
    setDeleting(true)
    setError('')
    setMessage('')

    await supabase.from('sales').update({ customer_id: null }).eq('customer_id', selected.id)
    await supabase
      .from('appointments')
      .update({ customer_id: null })
      .eq('customer_id', selected.id)

    const { error: deleteError } = await supabase.from('customers').delete().eq('id', selected.id)
    setDeleting(false)

    if (deleteError) {
      setError(
        deleteError.message.includes('foreign key') || deleteError.message.includes('violates')
          ? `Cannot delete this client because related records still reference them. ${deleteError.message}`
          : deleteError.message,
      )
      return
    }

    setMessage(`Deleted client: ${selected.name}.`)
    setConfirmDelete(false)
    setProfileModalOpen(false)
    setShowForm(false)
    setEditingId(null)
    setSelectedId(null)
    await loadCustomers()
  }

  function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return (
    <div className="crm-page">
      <PageHeader
        kicker="Clients"
        title="Clients list"
        subtitle="Clean client profiles with membership, wallet, sessions, and consent forms."
        actions={
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => (showForm ? closeForm() : openCreate())}
          >
            {showForm ? 'Cancel' : 'Add Client'}
          </button>
        }
      />

      <ClientsSubnav />
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {showForm ? (
        <section className="crm-compose">
          <div className="crm-compose-head">
            <div>
              <p className="crm-kicker">{editingId ? 'Edit client' : 'New client'}</p>
              <h2>{editingId ? 'Update CRM profile' : 'Add to CRM'}</h2>
            </div>
          </div>
          <form className="crm-compose-form" onSubmit={onSave}>
            <p className="form-req-note">
              Fields marked with <span className="req" aria-hidden="true">*</span> are required.
            </p>
            <div className="crm-compose-grid">
              <div className="field">
                <label>
                  Full name <span className="req" aria-hidden="true">*</span>
                </label>
                <input
                  className="input"
                  required
                  aria-required="true"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>
                  Phone <span className="req" aria-hidden="true">*</span>
                </label>
                <input
                  className="input"
                  type="tel"
                  required
                  aria-required="true"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>
                  Email <span className="req" aria-hidden="true">*</span>
                </label>
                <input
                  className="input"
                  type="email"
                  required
                  aria-required="true"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Birthday</label>
                <input
                  className="input"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.birthday}
                  onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Sex</label>
                <select
                  className="select"
                  value={form.sex}
                  onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))}
                >
                  <option value="">Select</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Address</label>
                <input
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Medical history</label>
                <textarea
                  className="input"
                  rows={2}
                  value={form.medicalHistory}
                  onChange={(e) => setForm((f) => ({ ...f, medicalHistory: e.target.value }))}
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Notes / goals</label>
                <textarea
                  className="input"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Membership</label>
                <select
                  className="select"
                  value={form.membership}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      membership: e.target.value as Customer['membership'],
                      membershipExpiresAt:
                        e.target.value === 'Regular' ? '' : f.membershipExpiresAt,
                    }))
                  }
                >
                  <option value="Regular">Regular</option>
                  <option value="VIP">VIP</option>
                  <option value="VVIP">VVIP</option>
                </select>
              </div>
              {form.membership !== 'Regular' ? (
                <div className="field">
                  <label>
                    Membership expires <span className="req" aria-hidden="true">*</span>
                  </label>
                  <input
                    className="input"
                    type="date"
                    required
                    value={form.membershipExpiresAt}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, membershipExpiresAt: e.target.value }))
                    }
                  />
                </div>
              ) : null}
            </div>
            <p className="form-req-note">
              VIP / VVIP are normally sold on POS (₱5,000 / ₱10,000 · 1 year). Staff can tag manually
              here when needed.
            </p>
            <div className="crm-compose-actions">
              <button className="btn btn-ghost" type="button" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Save changes' : 'Save client'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="crm-shell">
        <section className="crm-list">
          <div className="crm-list-head">
            <div className="crm-list-intro">
              <p className="crm-kicker">Directory</p>
              <h2>
                {filtered.length} client{filtered.length === 1 ? '' : 's'}
              </h2>
            </div>
            <label className="crm-search">
              <Search size={17} strokeWidth={2} aria-hidden />
              <input
                type="search"
                placeholder="Search by name, phone, or email"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
              />
            </label>
          </div>

          <div className="crm-list-body">
            {loading ? (
              <div className="crm-empty">Loading clients…</div>
            ) : filtered.length === 0 ? (
              <div className="crm-empty">
                No clients yet for this branch. Bookings create clients automatically — or use{' '}
                <strong>Add Client</strong>.
              </div>
            ) : (
              <div className="crm-directory" role="list">
                <div className="crm-directory-cols" aria-hidden>
                  <span>Client</span>
                  <span>Contact</span>
                  <span>Membership</span>
                  <span>Wallet</span>
                  <span>Visits</span>
                  <span />
                </div>
                {paged.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    role="listitem"
                    className={`crm-client-row ${selectedId === client.id ? 'is-active' : ''}`}
                    onClick={() => {
                      setSelectedId(client.id)
                      setProfileModalOpen(true)
                      setConfirmDelete(false)
                    }}
                  >
                    <div className="crm-person">
                      <span className="crm-avatar" aria-hidden>
                        {initials(client.name)}
                      </span>
                      <div className="crm-person-copy">
                        <strong className="crm-person-name">{client.name}</strong>
                        <span className="crm-person-meta">
                          {[
                            client.sex || null,
                            client.age ? `${client.age}y` : null,
                            client.birthday ? formatBirthday(client.birthday) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Profile incomplete'}
                        </span>
                      </div>
                    </div>

                    <div className="crm-contact">
                      <strong>{client.phone || '—'}</strong>
                      <span>{client.email || 'No email'}</span>
                    </div>

                    <div className="crm-row-badge">
                      <MembershipBadge
                        membership={client.membership}
                        expiresAt={client.membershipExpiresAt}
                        showExpiry
                      />
                    </div>

                    <div className="crm-metric crm-metric-wallet">
                      <strong>{formatCurrency(client.cashInBalance)}</strong>
                      <span>{client.points} pts</span>
                    </div>

                    <div className="crm-metric crm-metric-visits">
                      <strong>{client.visits}</strong>
                      <span>{client.lastVisit && client.lastVisit !== '—' ? client.lastVisit : 'No visits'}</span>
                    </div>

                    <span className="crm-row-action" aria-hidden>
                      View
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!loading && filtered.length > 0 ? (
              <div className="crm-pagination">
                <p>
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="crm-pagination-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="crm-pagination-page">
                    Page {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
      {profileModalOpen && selected ? (
        <div
          className="confirm-modal-overlay crm-intake-overlay"
          role="presentation"
          onClick={() => {
            setProfileModalOpen(false)
            setSelectedId(null)
          }}
        >
          <div
            className="confirm-modal crm-intake-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-intake-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="crm-intake-head">
              <div className="crm-intake-head-copy">
                <p className="confirm-modal-kicker">Client intake</p>
                <h2 id="client-intake-title" className="confirm-modal-title">
                  {selected.name}
                </h2>
                <div className="crm-intake-head-meta">
                  <MembershipBadge
                    membership={selected.membership}
                    expiresAt={selected.membershipExpiresAt}
                    showExpiry
                  />
                  <span>
                    Completed:{' '}
                    {selected.intakeCompletedAt
                      ? new Date(selected.intakeCompletedAt).toLocaleString('en-PH')
                      : 'N/A'}
                  </span>
                </div>
              </div>
              <button
                className="btn-icon"
                type="button"
                aria-label="Close"
                onClick={() => {
                  setProfileModalOpen(false)
                  setSelectedId(null)
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="crm-intake-body">
              <section className="crm-intake-card">
                <h3>Profile</h3>
                <div className="crm-intake-facts">
                  <IntakeFact label="Name" value={displayOrNA(selected.name)} full />
                  <IntakeFact label="Sex" value={displayOrNA(selected.sex)} />
                  <IntakeFact label="Contact" value={displayOrNA(selected.phone)} />
                  <IntakeFact label="Email" value={displayOrNA(selected.email)} full />
                  <IntakeFact label="Occupation" value={displayOrNA(selected.occupation)} />
                  <IntakeFact
                    label="Birthdate"
                    value={selected.birthday ? formatBirthday(selected.birthday) : 'N/A'}
                  />
                  <IntakeFact label="Facebook" value={displayOrNA(selected.facebook)} />
                  <IntakeFact label="Instagram" value={displayOrNA(selected.instagram)} />
                  <IntakeFact label="Address" value={displayOrNA(selected.address)} full />
                </div>
              </section>

              <div className="crm-intake-grid">
                <section className="crm-intake-card">
                  <h3>History</h3>
                  {!selected.historyNotes || selected.historyNotes.length === 0 ? (
                    <p className="crm-intake-na">N/A</p>
                  ) : (
                    <ul className="crm-intake-history">
                      {selected.historyNotes.map((note) => (
                        <li key={note.id || note.created_at + note.text}>
                          <div>{note.text}</div>
                          {note.created_at ? (
                            <span>{new Date(note.created_at).toLocaleString('en-PH')}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="crm-intake-card">
                  <h3>Topical medications</h3>
                  <IntakeText value={selected.topicalMedications} />
                </section>

                <section className="crm-intake-card">
                  <h3>Medical checklist</h3>
                  {(() => {
                    const { chips, others } = formatCheckedChips(
                      selected.medicalConditions,
                      MEDICAL_LABELS,
                    )
                    if (chips.length === 0 && !others) {
                      return <p className="crm-intake-na">N/A</p>
                    }
                    return (
                      <div className="crm-intake-chips">
                        {chips.map((chip) => (
                          <span key={chip} className="crm-intake-chip">
                            {chip}
                          </span>
                        ))}
                        {others ? (
                          <span className="crm-intake-chip is-other">Others: {others}</span>
                        ) : null}
                      </div>
                    )
                  })()}
                </section>

                <section className="crm-intake-card">
                  <h3>Medications / herbal intake</h3>
                  <IntakeText value={selected.medicationsIntake} />
                </section>

                <section className="crm-intake-card">
                  <h3>Lifestyle</h3>
                  {(() => {
                    const { chips, others } = formatCheckedChips(
                      selected.lifestyle,
                      LIFESTYLE_LABELS,
                    )
                    if (chips.length === 0 && !others) {
                      return <p className="crm-intake-na">N/A</p>
                    }
                    return (
                      <div className="crm-intake-chips">
                        {chips.map((chip) => (
                          <span key={chip} className="crm-intake-chip">
                            {chip}
                          </span>
                        ))}
                        {others ? (
                          <span className="crm-intake-chip is-other">Others: {others}</span>
                        ) : null}
                      </div>
                    )
                  })()}
                </section>

                <section className="crm-intake-card">
                  <h3>Signatures</h3>
                  <div className="crm-intake-signs">
                    <div>
                      <span>Primary</span>
                      {selected.signaturePrimary ? (
                        <img src={selected.signaturePrimary} alt="Primary signature" />
                      ) : (
                        <p className="crm-intake-na">N/A</p>
                      )}
                    </div>
                    <div>
                      <span>Confirmation</span>
                      {selected.signatureConfirm ? (
                        <img src={selected.signatureConfirm} alt="Confirmation signature" />
                      ) : (
                        <p className="crm-intake-na">N/A</p>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <div className="crm-intake-foot">
              <button
                className="btn crm-btn-close"
                type="button"
                onClick={() => {
                  setProfileModalOpen(false)
                  setSelectedId(null)
                }}
              >
                Close
              </button>
              {canManageConsent ? (
                <>
                  <button
                    className="btn crm-btn-edit"
                    type="button"
                    onClick={() => {
                      setProfileModalOpen(false)
                      openEdit(selected)
                    }}
                  >
                    <Pencil size={15} />
                    Edit
                  </button>
                  <button
                    className="btn crm-btn-delete"
                    type="button"
                    onClick={() => {
                      setConfirmDelete(true)
                      setError('')
                      setMessage('')
                    }}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                  <button
                    className="btn crm-btn-avail"
                    type="button"
                    onClick={() => setAvailOpen(true)}
                  >
                    Avail service
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {availOpen && selected ? (
        <AvailServiceModal
          customer={selected}
          open={availOpen}
          onClose={() => setAvailOpen(false)}
          onSuccess={(receipt) => {
            setMessage('Service availed for ' + selected.name + ' (' + receipt + ').')
            setAvailOpen(false)
            setProfileModalOpen(false)
            setSelectedId(null)
            void loadCustomers()
          }}
        />
      ) : null}

      {confirmDelete && selected ? (
        <div
          className="confirm-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!deleting) setConfirmDelete(false)
          }}
        >
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-client-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div>
                <p className="confirm-modal-kicker">Delete client</p>
                <h2 id="delete-client-title" className="confirm-modal-title">
                  Remove from CRM?
                </h2>
              </div>
              <button
                className="btn-icon"
                type="button"
                aria-label="Close"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="confirm-modal-body">
              <p className="confirm-modal-text">
                Delete <strong>{selected.name}</strong>
                {selected.email ? ` (${selected.email})` : ''}? Sales history is kept, but this CRM
                profile and attached consent forms will be removed.
              </p>
            </div>
            <div className="confirm-modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={deleting}
                style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => void onDeleteClient()}
              >
                {deleting ? 'Deleting…' : 'Delete client'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}
