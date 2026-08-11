import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { formatCurrency } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import { isUuid } from '../lib/utils'
import type { Expense } from '../types'

type Row = {
  id: string
  branch_id: string | null
  category: string
  description: string
  amount: number | string
  paid_by: string | null
  expense_date: string
}

function mapRow(row: Row): Expense {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    amount: Number(row.amount),
    paidBy: row.paid_by ?? '',
    date: row.expense_date,
    branchId: row.branch_id ?? '',
  }
}

export function Expenses() {
  const { branchId } = useBranch()
  const { user } = useAuth()
  const [rows, setRows] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    category: 'Supplies',
    description: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    paidBy: user?.name ?? '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    if (isUuid(branchId)) q = q.eq('branch_id', branchId)
    const { data, error: err } = await q
    if (err) setError(err.message)
    else {
      setError('')
      setRows((data as Row[] | null)?.map(mapRow) ?? [])
    }
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    load()
  }, [load])

  const total = useMemo(() => rows.reduce((sum, e) => sum + e.amount, 0), [rows])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('expenses').insert({
      category: form.category,
      description: form.description.trim(),
      amount: Number(form.amount),
      paid_by: form.paidBy.trim() || user?.name || null,
      expense_date: form.date,
      branch_id: isUuid(branchId) ? branchId : null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setShowForm(false)
    setForm((f) => ({ ...f, description: '', amount: '' }))
    setMessage('Expense logged.')
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="Finance"
        title="Expenses"
        subtitle="Track clinic operating costs by category and branch for cleaner month-end reporting."
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Log Expense'}
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {showForm ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">Log expense</h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={onSubmit}
              style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              <div className="field">
                <label>Category</label>
                <select
                  className="select"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {['Supplies', 'Utilities', 'Marketing', 'Maintenance', 'Payroll', 'Other'].map(
                    (c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="field">
                <label>Amount</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  required
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Description</label>
                <input
                  className="input"
                  required
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Date</label>
                <input
                  className="input"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Paid by</label>
                <input
                  className="input"
                  value={form.paidBy}
                  onChange={(e) => setForm((f) => ({ ...f, paidBy: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Period Total</div>
          <div className="stat-value">{formatCurrency(total)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Entries</div>
          <div className="stat-value">{rows.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top Category</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>
            {rows[0]?.category ?? '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg / Entry</div>
          <div className="stat-value">
            {formatCurrency(rows.length ? total / rows.length : 0)}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading expenses...</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">No expenses yet. Click Log Expense.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Paid By</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((expense) => (
                    <tr key={expense.id}>
                      <td>{expense.date}</td>
                      <td>
                        <span className="badge">{expense.category}</span>
                      </td>
                      <td>{expense.description}</td>
                      <td>{expense.paidBy || '—'}</td>
                      <td>{formatCurrency(expense.amount)}</td>
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
