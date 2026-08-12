import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Search, X } from 'lucide-react'
import { CareNotesPanel } from '../components/CareNotesPanel'
import { MembershipBadge } from '../components/MembershipBadge'
import { PageHeader } from '../components/PageHeader'
import { normalizeMembership } from '../lib/membership'
import { formatCurrency } from '../lib/utils'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import type { Customer } from '../types'

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
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
    loadPackages(selected.id)
  }, [selected, loadPackages])

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

  return (
    <div>
      <PageHeader
        kicker="CRM"
        title="Client Management"
        subtitle="Profiles, website booking details, visit history, membership, points, and cash-in balances."
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Add Client'}
          </button>
        }
      />

      {error ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-body" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">New client</h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={onAdd}
              style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              <p className="form-req-note">
                Fields marked with <span className="req" aria-hidden="true">*</span> are required.
              </p>
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
              <div style={{ gridColumn: '1 / -1' }}>
                <p className="form-req-note" style={{ marginBottom: 8 }}>
                  VIP / VVIP are normally sold on POS (₱5,000 / ₱10,000 · 1 year). Staff can tag
                  manually here when needed.
                </p>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            className="search-input"
            placeholder="Search by name, phone, or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selected ? 'minmax(0, 1.2fr) minmax(280px, 0.9fr)' : '1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div className="panel">
          <div className="panel-body">
            {loading ? (
              <div className="empty-state">Loading clients from Supabase...</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                No clients yet for this branch. Website bookings create clients automatically —
                or click <strong>Add Client</strong>.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Contact</th>
                      <th>Birthday</th>
                      <th>Membership</th>
                      <th>Points</th>
                      <th>Cash-in Wallet</th>
                      <th>Visits</th>
                      <th>Last Visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((client) => (
                      <tr
                        key={client.id}
                        onClick={() => setSelectedId(client.id)}
                        style={{
                          cursor: 'pointer',
                          background:
                            selectedId === client.id ? 'rgba(184, 149, 74, 0.08)' : undefined,
                        }}
                      >
                        <td>
                          <strong>{client.name}</strong>
                          {client.sex || client.age ? (
                            <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                              {[client.sex, client.age ? `${client.age}y` : ''].filter(Boolean).join(' · ')}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div>{client.phone || '—'}</div>
                          <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                            {client.email || '—'}
                          </div>
                        </td>
                        <td>{formatBirthday(client.birthday)}</td>
                        <td>
                          <MembershipBadge
                            membership={client.membership}
                            expiresAt={client.membershipExpiresAt}
                            showExpiry
                          />
                        </td>
                        <td>{client.points}</td>
                        <td>{formatCurrency(client.cashInBalance)}</td>
                        <td>{client.visits}</td>
                        <td>{client.lastVisit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {selected ? (
          <div className="panel">
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <h2 className="panel-title" style={{ margin: 0 }}>
                  {selected.name}
                </h2>
                <MembershipBadge
                  membership={selected.membership}
                  expiresAt={selected.membershipExpiresAt}
                  showExpiry
                />
              </div>
              <button
                className="btn-icon"
                type="button"
                aria-label="Close details"
                onClick={() => setSelectedId(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
              <div>
                <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                  Profile from booking
                </div>
                <div style={{ display: 'grid', gap: 8, fontSize: '0.92rem' }}>
                  <div>
                    <strong>Membership:</strong>{' '}
                    <MembershipBadge
                      membership={selected.membership}
                      expiresAt={selected.membershipExpiresAt}
                      showExpiry
                    />
                  </div>
                  <div>
                    <strong>Email:</strong> {selected.email || '—'}
                  </div>
                  <div>
                    <strong>Phone:</strong> {selected.phone || '—'}
                  </div>
                  <div>
                    <strong>Birthday:</strong> {formatBirthday(selected.birthday)}
                  </div>
                  <div>
                    <strong>Age / Sex:</strong>{' '}
                    {[selected.age ? `${selected.age}` : null, selected.sex || null]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                  <div>
                    <strong>Address:</strong> {selected.address || '—'}
                  </div>
                  <div>
                    <strong>Medical history:</strong> {selected.medicalHistory || '—'}
                  </div>
                  <div>
                    <strong>Notes / goals:</strong> {selected.notes || '—'}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                  Treatment sessions
                </div>
                {packagesLoading ? (
                  <p style={{ color: 'var(--muted)', margin: 0 }}>Loading sessions…</p>
                ) : packages.length === 0 ? (
                  <p style={{ color: 'var(--muted)', margin: 0 }}>
                    No session packages yet. Create them from POS with sessions advised.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
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
                      <div
                        style={{
                          padding: '10px 12px',
                          border: '1px solid var(--line)',
                          borderRadius: 12,
                          display: 'grid',
                          gap: 6,
                          fontSize: '0.9rem',
                        }}
                      >
                        <div>
                          <strong>Sessions left:</strong>{' '}
                          {Math.max(0, activePkg.total_sessions - activePkg.sessions_used)} /{' '}
                          {activePkg.total_sessions}
                        </div>
                        <div>
                          <strong>Next session:</strong> {activePkg.next_session_date || '—'}
                        </div>
                        <div>
                          <strong>Package / discount:</strong>{' '}
                          {formatCurrency(activePkg.package_amount)}
                          {activePkg.discount_amount
                            ? ` (−${formatCurrency(activePkg.discount_amount)})`
                            : ''}
                        </div>
                        <div>
                          <strong>Administered by:</strong> {activePkg.administered_by || '—'}
                        </div>
                        <div>
                          <strong>Consult by:</strong> {activePkg.consult_by || '—'}
                        </div>
                        <div>
                          <strong>Sales by:</strong> {activePkg.sales_by || '—'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                          {activePkg.status}
                          {activePkg.sale_receipt_no ? ` · ${activePkg.sale_receipt_no}` : ''}
                        </div>
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
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                  Appointments
                </div>
                {visitsLoading ? (
                  <p style={{ color: 'var(--muted)', margin: 0 }}>Loading visits…</p>
                ) : visits.length === 0 ? (
                  <p style={{ color: 'var(--muted)', margin: 0 }}>No linked appointments yet.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {visits.map((v) => (
                      <div
                        key={v.id}
                        style={{
                          padding: '10px 12px',
                          border: '1px solid var(--line)',
                          borderRadius: 12,
                          background: 'var(--surface-muted, #fafafa)',
                        }}
                      >
                        <strong>
                          {v.appointment_date} · {String(v.appointment_time).slice(0, 5)}
                        </strong>
                        <div style={{ fontSize: '0.88rem' }}>{v.service_name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>
                          {v.status}
                          {v.source === 'web' ? ' · website' : ''}
                          {v.special_note ? ` · ${v.special_note}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
