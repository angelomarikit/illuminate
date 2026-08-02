import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { formatCurrency } from '../data/mock'
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

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    setError('')

    let request = supabase
      .from('customers')
      .select(
        'id, branch_id, full_name, phone, email, membership, points, cash_in_balance, visits, last_visit',
      )
      .order('full_name')

    if (branchId && isUuid(branchId)) {
      request = request.eq('branch_id', branchId)
    }

    const { data, error: fetchError } = await request

    if (fetchError) {
      setError(fetchError.message)
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
        subtitle="Profiles, visit history, membership tiers, loyalty points, and cash-in wallet balances."
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

      <div className="panel">
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading clients from Supabase...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              No clients yet for this branch. Click <strong>Add Client</strong> to create one.
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
                    <tr key={client.id}>
                      <td>
                        <strong>{client.name}</strong>
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
    </div>
  )
}
