import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { formatCurrency } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import { isUuid, receiptNumber } from '../lib/utils'
import type { Customer, ServiceCategory, ServiceItem } from '../types'
import './pos.css'

type CartLine = { item: ServiceItem; qty: number }

const categories: Array<ServiceCategory | 'All'> = [
  'All',
  'Facials',
  'Injectables',
  'Laser',
  'Body',
  'Skincare',
  'Packages',
]

export function POS() {
  const { branchId } = useBranch()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [category, setCategory] = useState<(typeof categories)[number]>('All')
  const [cart, setCart] = useState<CartLine[]>([])
  const [services, setServices] = useState<ServiceItem[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [usePoints, setUsePoints] = useState(0)
  const [useWallet, setUseWallet] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const [{ data: svc }, { data: cus }] = await Promise.all([
      supabase.from('services').select('*').eq('active', true).order('name'),
      supabase.from('customers').select('*').order('full_name'),
    ])

    const mappedServices: ServiceItem[] =
      svc?.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category as ServiceCategory,
        price: Number(row.price),
        durationMin: row.duration_min,
        pointsEarn: row.points_earn,
        pointsCost: row.points_cost,
        active: row.active,
        description: row.description ?? '',
      })) ?? []

    let mappedCustomers: Customer[] =
      cus?.map((row) => ({
        id: row.id,
        name: row.full_name,
        phone: row.phone ?? '',
        email: row.email ?? '',
        points: row.points ?? 0,
        cashInBalance: Number(row.cash_in_balance ?? 0),
        visits: row.visits ?? 0,
        lastVisit: row.last_visit ?? '—',
        membership: (row.membership as Customer['membership']) || 'Standard',
        branchId: row.branch_id ?? '',
      })) ?? []

    if (isUuid(branchId)) {
      mappedCustomers = mappedCustomers.filter((c) => !c.branchId || c.branchId === branchId)
    }

    setServices(mappedServices)
    setCustomers(mappedCustomers)
    setCustomerId((current) => current || mappedCustomers[0]?.id || '')
  }, [branchId])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(
    () => services.filter((s) => category === 'All' || s.category === category),
    [services, category],
  )

  const customer = customers.find((c) => c.id === customerId)
  const subtotal = cart.reduce((sum, line) => sum + line.item.price * line.qty, 0)
  const pointsValue = usePoints * 10
  const payable = Math.max(subtotal - pointsValue - useWallet, 0)
  const earnPoints = cart.reduce((sum, line) => sum + line.item.pointsEarn * line.qty, 0)

  function addToCart(item: ServiceItem) {
    setCart((prev) => {
      const existing = prev.find((line) => line.item.id === item.id)
      if (existing) {
        return prev.map((line) =>
          line.item.id === item.id ? { ...line, qty: line.qty + 1 } : line,
        )
      }
      return [...prev, { item, qty: 1 }]
    })
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) => (line.item.id === id ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0),
    )
  }

  function clearCart() {
    setCart([])
    setUsePoints(0)
    setUseWallet(0)
  }

  async function completeSale() {
    if (!cart.length) return
    if (!customer) {
      setError('Select a client or add customers first.')
      return
    }
    if (usePoints > customer.points) {
      setError('Not enough loyalty points.')
      return
    }
    if (useWallet > customer.cashInBalance) {
      setError('Not enough wallet balance.')
      return
    }

    setSaving(true)
    setError('')
    const items = cart.map((l) => `${l.item.name} x${l.qty}`).join(', ')
    const paymentMethod =
      usePoints > 0 && useWallet > 0
        ? 'Mixed'
        : usePoints > 0 && payable === 0
          ? 'Points'
          : payable > 0
            ? 'Cash'
            : 'Mixed'

    const receipt = receiptNumber()
    const { error: saleErr } = await supabase.from('sales').insert({
      receipt_no: receipt,
      customer_name: customer.name,
      customer_id: customer.id,
      items,
      total: payable,
      payment_method: paymentMethod,
      points_used: usePoints,
      wallet_used: useWallet,
      staff_name: user?.name ?? 'Staff',
      branch_id: isUuid(branchId) ? branchId : null,
    })

    if (saleErr) {
      setSaving(false)
      setError(saleErr.message)
      return
    }

    const nextPoints = customer.points - usePoints + earnPoints
    const nextWallet = customer.cashInBalance - useWallet
    await supabase
      .from('customers')
      .update({
        points: nextPoints,
        cash_in_balance: nextWallet,
        visits: customer.visits + 1,
        last_visit: new Date().toISOString().slice(0, 10),
      })
      .eq('id', customer.id)

    if (earnPoints > 0) {
      await supabase.from('loyalty_transactions').insert({
        customer_id: customer.id,
        customer_name: customer.name,
        type: 'earn',
        points: earnPoints,
        note: `Earned from ${receipt}`,
      })
    }
    if (usePoints > 0) {
      await supabase.from('loyalty_transactions').insert({
        customer_id: customer.id,
        customer_name: customer.name,
        type: 'redeem',
        points: usePoints,
        note: `Redeemed on ${receipt}`,
      })
    }
    if (useWallet > 0) {
      await supabase.from('loyalty_transactions').insert({
        customer_id: customer.id,
        customer_name: customer.name,
        type: 'cash-in',
        points: 0,
        amount: -useWallet,
        note: `Wallet used on ${receipt}`,
      })
    }

    setSaving(false)
    clearCart()
    setMessage(`Sale completed. Receipt ${receipt}`)
    await load()
    setTimeout(() => navigate('/sales'), 800)
  }

  return (
    <div>
      <PageHeader
        kicker="Front Desk"
        title="Point of Sale"
        subtitle="Checkout services and retail, apply loyalty points or cash-in wallet, then issue sales proof."
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="pos-layout">
        <div className="panel pos-catalog">
          <div className="panel-body">
            <div className="chips" style={{ marginBottom: 16 }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`chip ${category === cat ? 'active' : ''}`}
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="pos-grid">
              {filtered.length === 0 ? (
                <div className="empty-state">No active services. Add some in Services.</div>
              ) : (
                filtered.map((item) => (
                  <button key={item.id} type="button" className="pos-card" onClick={() => addToCart(item)}>
                    <div className="pos-card-cat">{item.category}</div>
                    <div className="pos-card-name">{item.name}</div>
                    <div className="pos-card-meta">
                      {item.durationMin > 0 ? `${item.durationMin} min` : 'Retail'}
                    </div>
                    <div className="pos-card-price">{formatCurrency(item.price)}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="panel pos-cart">
          <div className="panel-header">
            <h2 className="panel-title">Current Order</h2>
            <button className="btn btn-ghost btn-sm" type="button" onClick={clearCart}>
              Clear
            </button>
          </div>
          <div className="panel-body pos-cart-body">
            <div className="field">
              <label>Client</label>
              <select
                className="select"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                {customers.length === 0 ? <option value="">No clients yet</option> : null}
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.points} pts · {formatCurrency(c.cashInBalance)} wallet
                  </option>
                ))}
              </select>
            </div>

            <div className="pos-lines">
              {cart.length === 0 ? (
                <div className="empty-state">Tap a service or product to begin checkout.</div>
              ) : (
                cart.map((line) => (
                  <div className="pos-line" key={line.item.id}>
                    <div>
                      <strong>{line.item.name}</strong>
                      <div className="pos-line-meta">{formatCurrency(line.item.price)}</div>
                    </div>
                    <div className="pos-qty">
                      <button className="btn-icon" type="button" onClick={() => updateQty(line.item.id, -1)}>
                        <Minus size={14} />
                      </button>
                      <span>{line.qty}</span>
                      <button className="btn-icon" type="button" onClick={() => updateQty(line.item.id, 1)}>
                        <Plus size={14} />
                      </button>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => updateQty(line.item.id, -line.qty)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pos-redeem">
              <div className="field">
                <label>Redeem Points (max {customer?.points ?? 0})</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={customer?.points ?? 0}
                  value={usePoints}
                  onChange={(e) =>
                    setUsePoints(
                      Math.min(customer?.points ?? 0, Math.max(0, Number(e.target.value) || 0)),
                    )
                  }
                />
              </div>
              <div className="field">
                <label>Use Wallet (max {formatCurrency(customer?.cashInBalance ?? 0)})</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={customer?.cashInBalance ?? 0}
                  value={useWallet}
                  onChange={(e) =>
                    setUseWallet(
                      Math.min(
                        customer?.cashInBalance ?? 0,
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    )
                  }
                />
              </div>
            </div>

            <div className="pos-totals">
              <div>
                <span>Subtotal</span>
                <strong>{formatCurrency(subtotal)}</strong>
              </div>
              <div>
                <span>Points credit</span>
                <strong>-{formatCurrency(pointsValue)}</strong>
              </div>
              <div>
                <span>Wallet</span>
                <strong>-{formatCurrency(useWallet)}</strong>
              </div>
              <div className="pos-due">
                <span>Amount Due</span>
                <strong>{formatCurrency(payable)}</strong>
              </div>
              <div>
                <span>Points to earn</span>
                <strong>+{earnPoints}</strong>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              type="button"
              disabled={cart.length === 0 || saving}
              onClick={completeSale}
            >
              {saving ? 'Processing...' : 'Complete Sale & Print Proof'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
