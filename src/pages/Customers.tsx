import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { FileText, Search, Trash2, Upload, X } from 'lucide-react'
import { CareNotesPanel } from '../components/CareNotesPanel'
import { MembershipBadge } from '../components/MembershipBadge'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { isClinicRole } from '../lib/roles'
import { normalizeMembership } from '../lib/membership'
import { formatCurrency } from '../lib/utils'
import { supabase } from '../lib/supabase'
import type { Customer } from '../types'
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
}

function formatBirthday(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type VisitRow = {
  id: string
  appointment_date: string
  appointment_time: string
  service_name: string
  status: string
  source: string | null
  special_note: string | null
  medical_history: string | null
}

type SessionPkgRow = {
  id: string
  service_name: string
  total_sessions: number
  sessions_used: number
  package_amount: number
  discount_amount: number
  sold_on: string
  next_session_date: string | null
  doctor_notes: string | null
  administered_by: string | null
  consult_by: string | null
  sales_by: string | null
  status: string
  sale_receipt_no: string | null
}

type ConsentFormRow = {
  id: string
  customer_id: string
  file_name: string
  file_url: string
  storage_path: string
  note: string | null
  uploaded_by_name: string | null
  created_at: string
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
  }
}

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  birthday: '',
  membership: 'Regular' as Customer['membership'],
  membershipExpiresAt: '',
}

export function Customers() {
  const { branchId } = useBranch()
  const { user } = useAuth()
  const canManageConsent = isClinicRole(user?.role)
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [visitsLoading, setVisitsLoading] = useState(false)
  const [packages, setPackages] = useState<SessionPkgRow[]>([])
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [activePkgId, setActivePkgId] = useState<string | null>(null)
  const [savingNotes, setSavingNotes] = useState(false)
  const [consentForms, setConsentForms] = useState<ConsentFormRow[]>([])
  const [consentLoading, setConsentLoading] = useState(false)
  const [consentUploading, setConsentUploading] = useState(false)
  const [consentNote, setConsentNote] = useState('')

  const selected = useMemo(
    () => rows.find((c) => c.id === selectedId) ?? null,
    [rows, selectedId],
  )

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    setError('')

    let request = supabase
      .from('customers')
      .select(
        'id, branch_id, full_name, phone, email, membership, membership_expires_at, points, cash_in_balance, visits, last_visit, age, birthday, sex, address, medical_history, notes',
      )
      .order('full_name')

    if (branchId && isUuid(branchId)) {
      request = request.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }

    const { data, error: fetchError } = await request

    if (fetchError) {
      setError(
        fetchError.message.includes('birthday')
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

  useEffect(() => {
    async function loadVisits() {
      if (!selected) {
        setVisits([])
        return
      }
      setVisitsLoading(true)
      let q = supabase
        .from('appointments')
        .select(
          'id, appointment_date, appointment_time, service_name, status, source, special_note, medical_history',
        )
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false })
        .limit(20)

      q = q.or(
        [
          `customer_id.eq.${selected.id}`,
          selected.email ? `customer_email.ilike.${selected.email}` : null,
          selected.phone ? `customer_phone.eq.${selected.phone}` : null,
        ]
          .filter(Boolean)
          .join(','),
      )

      const { data, error: visitErr } = await q
      if (visitErr) {
        const { data: byName } = await supabase
          .from('appointments')
          .select(
            'id, appointment_date, appointment_time, service_name, status, source, special_note, medical_history',
          )
          .eq('customer_name', selected.name)
          .order('appointment_date', { ascending: false })
          .limit(20)
        setVisits((byName as VisitRow[] | null) ?? [])
      } else {
        setVisits((data as VisitRow[] | null) ?? [])
      }
      setVisitsLoading(false)
    }
    loadVisits()
  }, [selected])

  const loadPackages = useCallback(async (customerId: string) => {
    setPackagesLoading(true)
    const { data } = await supabase
      .from('client_session_packages')
      .select(
        'id, service_name, total_sessions, sessions_used, package_amount, discount_amount, sold_on, next_session_date, doctor_notes, administered_by, consult_by, sales_by, status, sale_receipt_no',
      )
      .eq('customer_id', customerId)
      .order('sold_on', { ascending: false })
    const mapped =
      ((data as SessionPkgRow[] | null) ?? []).map((row) => ({
        ...row,
        package_amount: Number(row.package_amount ?? 0),
        discount_amount: Number(row.discount_amount ?? 0),
        total_sessions: Number(row.total_sessions ?? 0),
        sessions_used: Number(row.sessions_used ?? 0),
      })) ?? []
    setPackages(mapped)
    setActivePkgId((current) => current && mapped.some((p) => p.id === current) ? current : mapped[0]?.id ?? null)
    setPackagesLoading(false)
  }, [])

  useEffect(() => {
    if (!selected) {
      setPackages([])
      setActivePkgId(null)
      return
    }
    void loadPackages(selected.id)
  }, [selected, loadPackages])

  const loadConsentForms = useCallback(async (customerId: string) => {
    setConsentLoading(true)
    const { data, error: err } = await supabase
      .from('customer_consent_forms')
      .select('id, customer_id, file_name, file_url, storage_path, note, uploaded_by_name, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
    if (err) {
      setConsentForms([])
      if (
        err.message.includes('customer_consent_forms') ||
        err.message.includes('schema cache')
      ) {
        setError(`${err.message} — run supabase/add_customer_consent_forms.sql in Supabase.`)
      }
    } else {
      setConsentForms((data as ConsentFormRow[] | null) ?? [])
    }
    setConsentLoading(false)
  }, [])

  useEffect(() => {
    if (!selected) {
      setConsentForms([])
      setConsentNote('')
      return
    }
    void loadConsentForms(selected.id)
  }, [selected, loadConsentForms])

  async function uploadConsentForm(file: File | null) {
    if (!selected || !canManageConsent || !file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Consent form must be a PDF file.')
      return
    }
    setConsentUploading(true)
    setError('')
    setMessage('')
    const safeName = file.name.replace(/[^\w.\-() ]+/g, '_').slice(0, 120)
    const path = `${selected.id}/${Date.now()}-${safeName}`
    const { error: uploadErr } = await supabase.storage
      .from('customer-consent-forms')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/pdf',
      })
    if (uploadErr) {
      setConsentUploading(false)
      setError(
        uploadErr.message.includes('Bucket') || uploadErr.message.includes('not found')
          ? `${uploadErr.message} — run supabase/add_customer_consent_forms.sql in Supabase.`
          : uploadErr.message,
      )
      return
    }
    const { data: urlData } = supabase.storage.from('customer-consent-forms').getPublicUrl(path)
    const { error: insertErr } = await supabase.from('customer_consent_forms').insert({
      customer_id: selected.id,
      file_name: file.name,
      file_url: urlData.publicUrl,
      storage_path: path,
      note: consentNote.trim() || null,
      uploaded_by: user?.id ?? null,
      uploaded_by_name: user?.name ?? null,
    })
    setConsentUploading(false)
    if (insertErr) {
      setError(
        insertErr.message.includes('customer_consent_forms') ||
          insertErr.message.includes('schema cache')
          ? `${insertErr.message} — run supabase/add_customer_consent_forms.sql in Supabase.`
          : insertErr.message,
      )
      return
    }
    setConsentNote('')
    setMessage(`Consent form “${file.name}” attached to ${selected.name}.`)
    await loadConsentForms(selected.id)
  }

  async function deleteConsentForm(formRow: ConsentFormRow) {
    if (!canManageConsent) return
    const ok = window.confirm(`Remove consent form “${formRow.file_name}”?`)
    if (!ok) return
    setError('')
    setMessage('')
    await supabase.storage.from('customer-consent-forms').remove([formRow.storage_path])
    const { error: delErr } = await supabase
      .from('customer_consent_forms')
      .delete()
      .eq('id', formRow.id)
    if (delErr) {
      setError(delErr.message)
      return
    }
    setMessage('Consent form removed.')
    if (selected) await loadConsentForms(selected.id)
  }

  const activePkg = useMemo(
    () => packages.find((p) => p.id === activePkgId) ?? null,
    [packages, activePkgId],
  )

  async function saveDoctorNotes(notes: string) {
    if (!activePkg) return
    setSavingNotes(true)
    const { error: err } = await supabase
      .from('client_session_packages')
      .update({
        doctor_notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', activePkg.id)
    setSavingNotes(false)
    if (err) throw new Error(err.message)
    if (selected) await loadPackages(selected.id)
  }

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

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

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

    const { error: insertError } = await supabase.from('customers').insert({
      full_name: name,
      phone,
      email,
      birthday,
      age,
      membership,
      membership_expires_at: membershipExpiresAt,
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

    setForm(emptyForm)
    setShowForm(false)
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
        kicker="CRM"
        title="Client Management"
        subtitle="Clean client profiles with membership, wallet, sessions, and consent forms."
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Add Client'}
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {showForm ? (
        <section className="crm-compose">
          <div className="crm-compose-head">
            <div>
              <p className="crm-kicker">New client</p>
              <h2>Add to CRM</h2>
            </div>
          </div>
          <form className="crm-compose-form" onSubmit={onAdd}>
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
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save client'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className={`crm-shell ${selected ? 'has-detail' : ''}`}>
        <section className="crm-list">
          <div className="crm-list-head">
            <div>
              <p className="crm-kicker">Directory</p>
              <h2>
                {filtered.length} client{filtered.length === 1 ? '' : 's'}
              </h2>
            </div>
            <label className="crm-search">
              <Search size={15} strokeWidth={2} aria-hidden />
              <input
                type="search"
                placeholder="Search name, phone, or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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
              <div className="crm-table-wrap">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Contact</th>
                      <th>Membership</th>
                      <th>Wallet</th>
                      <th>Visits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((client) => (
                      <tr
                        key={client.id}
                        className={selectedId === client.id ? 'is-active' : ''}
                        onClick={() => setSelectedId(client.id)}
                      >
                        <td>
                          <div className="crm-person">
                            <span className="crm-avatar" aria-hidden>
                              {initials(client.name)}
                            </span>
                            <div>
                              <strong>{client.name}</strong>
                              <span>
                                {[client.sex, client.age ? `${client.age}y` : null, formatBirthday(client.birthday)]
                                  .filter(Boolean)
                                  .join(' · ') || 'Profile'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="crm-contact">
                            <strong>{client.phone || '—'}</strong>
                            <span>{client.email || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <MembershipBadge
                            membership={client.membership}
                            expiresAt={client.membershipExpiresAt}
                            showExpiry
                          />
                        </td>
                        <td>
                          <div className="crm-contact">
                            <strong>{formatCurrency(client.cashInBalance)}</strong>
                            <span>{client.points} pts</span>
                          </div>
                        </td>
                        <td>
                          <div className="crm-contact">
                            <strong>{client.visits}</strong>
                            <span>{client.lastVisit}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {selected ? (
          <aside className="crm-detail">
            <div className="crm-detail-hero">
              <span className="crm-avatar crm-avatar-lg" aria-hidden>
                {initials(selected.name)}
              </span>
              <div className="crm-detail-hero-copy">
                <p className="crm-kicker">Client profile</p>
                <h2>{selected.name}</h2>
                <MembershipBadge
                  membership={selected.membership}
                  expiresAt={selected.membershipExpiresAt}
                  showExpiry
                />
              </div>
              <button
                className="btn-icon crm-detail-close"
                type="button"
                aria-label="Close details"
                onClick={() => setSelectedId(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="crm-stat-row">
              <div className="crm-stat">
                <span>Points</span>
                <strong>{selected.points}</strong>
              </div>
              <div className="crm-stat">
                <span>Wallet</span>
                <strong>{formatCurrency(selected.cashInBalance)}</strong>
              </div>
              <div className="crm-stat">
                <span>Visits</span>
                <strong>{selected.visits}</strong>
              </div>
            </div>

            <div className="crm-detail-scroll">
              <section className="crm-section">
                <h3>Profile</h3>
                <div className="crm-facts">
                  <div>
                    <span>Email</span>
                    <strong>{selected.email || '—'}</strong>
                  </div>
                  <div>
                    <span>Phone</span>
                    <strong>{selected.phone || '—'}</strong>
                  </div>
                  <div>
                    <span>Birthday</span>
                    <strong>{formatBirthday(selected.birthday)}</strong>
                  </div>
                  <div>
                    <span>Age / Sex</span>
                    <strong>
                      {[selected.age ? `${selected.age}` : null, selected.sex || null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </strong>
                  </div>
                  <div className="crm-fact-full">
                    <span>Address</span>
                    <strong>{selected.address || '—'}</strong>
                  </div>
                  <div className="crm-fact-full">
                    <span>Medical history</span>
                    <strong>{selected.medicalHistory || '—'}</strong>
                  </div>
                  <div className="crm-fact-full">
                    <span>Notes / goals</span>
                    <strong>{selected.notes || '—'}</strong>
                  </div>
                </div>
              </section>

              <section className="crm-section">
                <h3>Treatment sessions</h3>
                {packagesLoading ? (
                  <p className="crm-muted">Loading sessions…</p>
                ) : packages.length === 0 ? (
                  <p className="crm-muted">
                    No session packages yet. Create them from POS with sessions advised.
                  </p>
                ) : (
                  <div className="crm-stack">
                    <select
                      className="select"
                      value={activePkgId ?? ''}
                      onChange={(e) => setActivePkgId(e.target.value)}
                    >
                      {packages.map((p) => {
                        const left = Math.max(0, p.total_sessions - p.sessions_used)
                        return (
                          <option key={p.id} value={p.id}>
                            {p.service_name} · {left} left · {p.sold_on}
                          </option>
                        )
                      })}
                    </select>
                    {activePkg ? (
                      <div className="crm-session-card">
                        <div className="crm-facts">
                          <div>
                            <span>Sessions left</span>
                            <strong>
                              {Math.max(0, activePkg.total_sessions - activePkg.sessions_used)} /{' '}
                              {activePkg.total_sessions}
                            </strong>
                          </div>
                          <div>
                            <span>Next session</span>
                            <strong>{activePkg.next_session_date || '—'}</strong>
                          </div>
                          <div>
                            <span>Package</span>
                            <strong>
                              {formatCurrency(activePkg.package_amount)}
                              {activePkg.discount_amount
                                ? ` (−${formatCurrency(activePkg.discount_amount)})`
                                : ''}
                            </strong>
                          </div>
                          <div>
                            <span>Sales by</span>
                            <strong>{activePkg.sales_by || '—'}</strong>
                          </div>
                          <div>
                            <span>Administered by</span>
                            <strong>{activePkg.administered_by || '—'}</strong>
                          </div>
                          <div>
                            <span>Consult by</span>
                            <strong>{activePkg.consult_by || '—'}</strong>
                          </div>
                        </div>
                        <p className="crm-session-meta">
                          {activePkg.status}
                          {activePkg.sale_receipt_no ? ` · ${activePkg.sale_receipt_no}` : ''}
                        </p>
                      </div>
                    ) : null}
                    {activePkg ? (
                      <CareNotesPanel
                        customerId={selected.id}
                        sessionPackageId={activePkg.id}
                        doctorNotes={activePkg.doctor_notes ?? ''}
                        savingNotes={savingNotes}
                        compact
                        onSaveDoctorNotes={saveDoctorNotes}
                      />
                    ) : null}
                  </div>
                )}
              </section>

              <section className="crm-section">
                <h3>Consent forms</h3>
                {canManageConsent ? (
                  <div className="customer-consent-upload">
                    <div className="field" style={{ margin: 0 }}>
                      <label htmlFor="consent-note">Note (optional)</label>
                      <input
                        id="consent-note"
                        className="input"
                        placeholder="e.g. Laser consent · signed today"
                        value={consentNote}
                        onChange={(e) => setConsentNote(e.target.value)}
                        disabled={consentUploading}
                      />
                    </div>
                    <label
                      className={`customer-consent-file-btn ${consentUploading ? 'is-busy' : ''}`}
                    >
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        hidden
                        disabled={consentUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          e.target.value = ''
                          void uploadConsentForm(file)
                        }}
                      />
                      <Upload size={15} />
                      {consentUploading ? 'Uploading…' : 'Upload PDF consent'}
                    </label>
                  </div>
                ) : (
                  <p className="crm-muted">Only clinic staff can upload consent forms.</p>
                )}

                {consentLoading ? (
                  <p className="crm-muted">Loading consent forms…</p>
                ) : consentForms.length === 0 ? (
                  <p className="crm-muted">No consent form attachments yet.</p>
                ) : (
                  <ul className="customer-consent-list">
                    {consentForms.map((formRow) => (
                      <li key={formRow.id} className="customer-consent-item">
                        <FileText size={16} aria-hidden />
                        <div className="customer-consent-copy">
                          <a href={formRow.file_url} target="_blank" rel="noreferrer">
                            {formRow.file_name}
                          </a>
                          <span>
                            {new Date(formRow.created_at).toLocaleString()}
                            {formRow.uploaded_by_name ? ` · ${formRow.uploaded_by_name}` : ''}
                            {formRow.note ? ` · ${formRow.note}` : ''}
                          </span>
                        </div>
                        {canManageConsent ? (
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label={`Delete ${formRow.file_name}`}
                            onClick={() => void deleteConsentForm(formRow)}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="crm-section">
                <h3>Appointments</h3>
                {visitsLoading ? (
                  <p className="crm-muted">Loading visits…</p>
                ) : visits.length === 0 ? (
                  <p className="crm-muted">No linked appointments yet.</p>
                ) : (
                  <div className="crm-visit-list">
                    {visits.map((v) => (
                      <article key={v.id} className="crm-visit-card">
                        <strong>
                          {v.appointment_date} · {String(v.appointment_time).slice(0, 5)}
                        </strong>
                        <p>{v.service_name}</p>
                        <span>
                          {v.status}
                          {v.source === 'web' ? ' · website' : ''}
                          {v.special_note ? ` · ${v.special_note}` : ''}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
