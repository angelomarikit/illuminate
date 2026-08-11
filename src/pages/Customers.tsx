import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Search, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
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
  points: number
  cash_in_balance: number | string
  visits: number
  last_visit: string | null
  age: number | null
  sex: string | null
  address: string | null
  medical_history: string | null
  notes: string | null
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

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.full_name,
    phone: row.phone ?? '',
    email: row.email ?? '',
    membership: (row.membership as Customer['membership']) || 'Standard',
    points: row.points ?? 0,
    cashInBalance: Number(row.cash_in_balance ?? 0),
    visits: row.visits ?? 0,
    lastVisit: row.last_visit ?? '—',
    branchId: row.branch_id ?? '',
    age: row.age,
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
  membership: 'Standard' as Customer['membership'],
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
        'id, branch_id, full_name, phone, email, membership, points, cash_in_balance, visits, last_visit, age, sex, address, medical_history, notes',
      )
      .order('full_name')

    if (branchId && isUuid(branchId)) {
      request = request.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }

    const { data, error: fetchError } = await request

    if (fetchError) {
      setError(
        fetchError.message.includes('age') || fetchError.message.includes('medical_history')
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
        // Fallback: match by customer name if email/phone filters fail
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

    const { error: insertError } = await supabase.from('customers').insert({
      full_name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      membership: form.membership,
      branch_id: branchId && isUuid(branchId) ? branchId : null,
      points: 0,
      cash_in_balance: 0,
      visits: 0,
    })

    setSaving(false)

    if (insertError) {
      setError(insertError.message)
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
              <div className="field">
                <label>Full name</label>
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Phone</label>
                <input
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Email</label>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
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
                    }))
                  }
                >
                  <option value="Standard">Standard</option>
                  <option value="Glow">Glow</option>
                  <option value="Luxe">Luxe</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
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
                        <td>
                          <span className="badge badge-neutral">{client.membership}</span>
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
              <h2 className="panel-title">{selected.name}</h2>
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
                    <strong>Email:</strong> {selected.email || '—'}
                  </div>
                  <div>
                    <strong>Phone:</strong> {selected.phone || '—'}
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
