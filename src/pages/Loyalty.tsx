import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { MembershipBadge } from '../components/MembershipBadge'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { normalizeMembership } from '../lib/membership'
import { formatCurrency } from '../lib/utils'
import { supabase } from '../lib/supabase'
import type { Customer, LoyaltyTxn } from '../types'

export function Loyalty() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [txns, setTxns] = useState<LoyaltyTxn[]>([])
  const [mode, setMode] = useState<'none' | 'cash-in' | 'adjust'>('none')
  const [customerId, setCustomerId] = useState('')
  const [amount, setAmount] = useState('')
  const [points, setPoints] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const [{ data: cus }, { data: loyalty }] = await Promise.all([
      supabase.from('customers').select('*').order('full_name'),
      supabase
        .from('loyalty_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    const mapped =
      cus?.map((row) => ({
        id: row.id,
        name: row.full_name,
        phone: row.phone ?? '',
        email: row.email ?? '',
        points: row.points ?? 0,
        cashInBalance: Number(row.cash_in_balance ?? 0),
        visits: row.visits ?? 0,
        lastVisit: row.last_visit ?? '—',
        membership: normalizeMembership(row.membership),
        membershipExpiresAt: row.membership_expires_at ?? null,
        branchId: row.branch_id ?? '',
      })) ?? []

    setCustomers(mapped)
    setCustomerId((id) => id || mapped[0]?.id || '')
    setTxns(
      loyalty?.map((row) => ({
        id: row.id,
        customerName: row.customer_name,
        type: row.type,
        points: row.points,
        amount: row.amount != null ? Number(row.amount) : undefined,
        date: new Date(row.created_at).toLocaleDateString(),
        note: row.note ?? '',
      })) ?? [],
    )
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totalPoints = useMemo(() => customers.reduce((s, c) => s + c.points, 0), [customers])
  const totalWallet = useMemo(
    () => customers.reduce((s, c) => s + c.cashInBalance, 0),
    [customers],
  )

  async function onCashIn(e: FormEvent) {
    e.preventDefault()
    const customer = customers.find((c) => c.id === customerId)
    if (!customer) return
    const value = Number(amount)
    if (!value || value <= 0) {
      setError('Enter a valid cash-in amount.')
      return
    }
    setSaving(true)
    setError('')
    const nextWallet = customer.cashInBalance + value
    const { error: err } = await supabase
      .from('customers')
      .update({ cash_in_balance: nextWallet })
      .eq('id', customer.id)
    if (!err) {
      await supabase.from('loyalty_transactions').insert({
        customer_id: customer.id,
        customer_name: customer.name,
        type: 'cash-in',
        points: 0,
        amount: value,
        note: note.trim() || 'Cash-in wallet top-up',
      })
    }
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setMode('none')
    setAmount('')
    setNote('')
    setMessage(`Cash-in of ${formatCurrency(value)} saved for ${customer.name}.`)
    await load()
  }

  async function onAdjust(e: FormEvent) {
    e.preventDefault()
    const customer = customers.find((c) => c.id === customerId)
    if (!customer) return
    const delta = Number(points)
    if (!delta) {
      setError('Enter points to add (positive) or deduct (negative).')
      return
    }
    setSaving(true)
    setError('')
    const nextPoints = Math.max(0, customer.points + delta)
    const { error: err } = await supabase
      .from('customers')
      .update({ points: nextPoints })
      .eq('id', customer.id)
    if (!err) {
      await supabase.from('loyalty_transactions').insert({
        customer_id: customer.id,
        customer_name: customer.name,
        type: delta >= 0 ? 'earn' : 'redeem',
        points: Math.abs(delta),
        note: note.trim() || 'Manual points adjustment',
      })
    }
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setMode('none')
    setPoints('')
    setNote('')
    setMessage('Points updated.')
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="Retention"
        title="Loyalty & Cash-in Points"
        subtitle="Earn points on treatments, redeem for services, and top up cash-in wallets for package flexibility."
        actions={
          <>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setMode((m) => (m === 'cash-in' ? 'none' : 'cash-in'))}
            >
              Cash In
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setMode((m) => (m === 'adjust' ? 'none' : 'adjust'))}
            >
              Adjust Points
            </button>
          </>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {mode !== 'none' ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">{mode === 'cash-in' ? 'Cash in wallet' : 'Adjust points'}</h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={mode === 'cash-in' ? onCashIn : onAdjust}
              style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              <div className="field">
                <label>Client</label>
                <select
                  className="select"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {mode === 'cash-in' ? (
                <div className="field">
                  <label>Amount</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              ) : (
                <div className="field">
                  <label>Points (+/-)</label>
                  <input
                    className="input"
                    type="number"
                    required
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                  />
                </div>
              )}
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Note</label>
                <input
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Points in Circulation</div>
          <div className="stat-value">{totalPoints.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cash-in Wallets</div>
          <div className="stat-value">{formatCurrency(totalWallet)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Members</div>
          <div className="stat-value">{customers.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rule</div>
          <div className="stat-value" style={{ fontSize: '1.15rem', lineHeight: 1.3 }}>
            ₱10 = 1 pt
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Member Balances</h2>
          </div>
          <div className="panel-body">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Tier</th>
                    <th>Points</th>
                    <th>Wallet</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((client) => (
                    <tr key={client.id}>
                      <td>{client.name}</td>
                      <td>
                        <MembershipBadge
                          membership={client.membership}
                          expiresAt={client.membershipExpiresAt}
                        />
                      </td>
                      <td>{client.points}</td>
                      <td>{formatCurrency(client.cashInBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Recent Point Activity</h2>
          </div>
          <div className="panel-body">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Type</th>
                    <th>Value</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((txn) => (
                    <tr key={txn.id}>
                      <td>{txn.date}</td>
                      <td>{txn.customerName}</td>
                      <td>
                        <span className="badge">{txn.type}</span>
                      </td>
                      <td>
                        {txn.type === 'cash-in'
                          ? formatCurrency(txn.amount ?? 0)
                          : `${txn.type === 'redeem' ? '-' : '+'}${txn.points} pts`}
                      </td>
                      <td>{txn.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
