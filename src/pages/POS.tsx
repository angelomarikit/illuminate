import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { MembershipBadge } from '../components/MembershipBadge'
import { PageHeader } from '../components/PageHeader'
import { StaffAssignField } from '../components/StaffAssignField'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import {
  membershipTierFromService,
  normalizeMembership,
  resolveMembershipAfterPurchase,
} from '../lib/membership'
import { supabase } from '../lib/supabase'
import { formatCurrency, isUuid, receiptNumber } from '../lib/utils'
import type { Customer, ServiceCategory, ServiceItem } from '../types'
import './pos.css'

type CartLine = {
  item: ServiceItem
  qty: number
  sessionsAdvised: number
  packageAmount: string
  nextSessionDate: string
  /** True when staff typed a one-off service + price (not from catalog). */
  isCustom?: boolean
}

type ProfileOption = { id: string; full_name: string; role: string }
type CartSection = 'items' | 'staff' | 'pay'

const FALLBACK_CATEGORIES = [
  'Facials',
  'Injectables',
  'Laser',
  'Body',
  'Skincare',
  'Packages',
  'Membership',
]

function lineTotal(line: CartLine) {
  const sessions = Number(line.sessionsAdvised) || 0
  if (sessions >= 1) {
    return Math.max(0, Number(line.packageAmount) || 0)
  }
  return line.item.price * line.qty
}

export function POS() {
  const { branchId } = useBranch()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [category, setCategory] = useState<string>('All')
  const [cart, setCart] = useState<CartLine[]>([])
  const [services, setServices] = useState<ServiceItem[]>([])
  const [catalogCategories, setCatalogCategories] = useState<string[]>(FALLBACK_CATEGORIES)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [customerId, setCustomerId] = useState('')
  const [usePoints, setUsePoints] = useState(0)
  const [useWallet, setUseWallet] = useState(0)
  const [discount, setDiscount] = useState('')
  const [doctorNotes, setDoctorNotes] = useState('')
  const [administeredBy, setAdministeredBy] = useState('')
  const [consultBy, setConsultBy] = useState('')
  const [salesBy, setSalesBy] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [mobilePane, setMobilePane] = useState<'menu' | 'order'>('menu')
  const [openSection, setOpenSection] = useState<CartSection>('items')
  const [sessionOpenIds, setSessionOpenIds] = useState<Record<string, boolean>>({})
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customOpen, setCustomOpen] = useState(false)

  const load = useCallback(async () => {
    const [svcRes, cusRes, profRes, catsRes] = await Promise.all([
      supabase.from('services').select('*').eq('active', true).order('name'),
      supabase.from('customers').select('*').order('full_name'),
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['Owner', 'Admin', 'Receptionist', 'Staff'])
        .order('full_name'),
      supabase
        .from('service_categories')
        .select('name')
        .eq('active', true)
        .order('sort_order')
        .order('name'),
    ])

    const svc = svcRes.data
    const cus = cusRes.data
    const prof = profRes.data
    const cats = catsRes.error ? null : catsRes.data

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
        membershipTier:
          (row.membership_tier as ServiceItem['membershipTier']) ||
          membershipTierFromService({
            category: row.category,
            name: row.name,
          }),
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
        membership: normalizeMembership(row.membership),
        membershipExpiresAt: row.membership_expires_at ?? null,
        branchId: row.branch_id ?? '',
      })) ?? []

    if (isUuid(branchId)) {
      mappedCustomers = mappedCustomers.filter((c) => !c.branchId || c.branchId === branchId)
    }

    const fromTable = (cats ?? []).map((row) => row.name as string).filter(Boolean)
    const fromServices = [...new Set(mappedServices.map((s) => s.category).filter(Boolean))]
    const merged = [...fromTable]
    for (const name of fromServices) {
      if (!merged.some((c) => c.toLowerCase() === name.toLowerCase())) merged.push(name)
    }
    setCatalogCategories(merged.length ? merged : FALLBACK_CATEGORIES)

    setServices(mappedServices)
    setCustomers(mappedCustomers)
    setProfiles((prof as ProfileOption[] | null) ?? [])
    setCustomerId((current) => current || mappedCustomers[0]?.id || '')
    setSalesBy((current) => current || user?.name || '')
  }, [branchId, user?.name])

  const categories = useMemo(() => ['All', ...catalogCategories], [catalogCategories])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(
    () => services.filter((s) => category === 'All' || s.category === category),
    [services, category],
  )

  const customer = customers.find((c) => c.id === customerId)
  const subtotal = cart.reduce((sum, line) => sum + lineTotal(line), 0)
  const discountAmount = Math.min(subtotal, Math.max(0, Number(discount) || 0))
  const pointsValue = usePoints * 10
  const payable = Math.max(subtotal - discountAmount - pointsValue - useWallet, 0)
  const earnPoints = cart.reduce((sum, line) => sum + line.item.pointsEarn * line.qty, 0)
  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0)

  const staffSummary = [administeredBy, consultBy, salesBy].filter(Boolean).length
  const staffFilled = Boolean(salesBy.trim())

  function toggleSection(section: CartSection) {
    setOpenSection(section)
  }

  function addToCart(item: ServiceItem) {
    setCart((prev) => {
      const existing = prev.find((line) => line.item.id === item.id && !line.isCustom)
      if (existing) {
        return prev.map((line) =>
          line.item.id === item.id && !line.isCustom ? { ...line, qty: line.qty + 1 } : line,
        )
      }
      return [
        ...prev,
        {
          item,
          qty: 1,
          sessionsAdvised: 0,
          packageAmount: '',
          nextSessionDate: '',
        },
      ]
    })
    setOpenSection('items')
  }

  function openCustomService() {
    setError('')
    setCustomName('')
    setCustomPrice('')
    setCustomOpen(true)
  }

  function addCustomService() {
    const name = customName.trim()
    const price = Number(customPrice)
    if (!name) {
      setError('Enter a custom service name.')
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Enter a valid custom price (0 or more).')
      return
    }

    setError('')
    const item: ServiceItem = {
      id: `custom-${crypto.randomUUID()}`,
      name,
      category: 'Custom',
      price,
      durationMin: 0,
      pointsEarn: 0,
      pointsCost: 0,
      active: true,
      description: 'Custom service requested by client',
      membershipTier: null,
    }
    setCart((prev) => [
      ...prev,
      {
        item,
        qty: 1,
        sessionsAdvised: 0,
        packageAmount: '',
        nextSessionDate: '',
        isCustom: true,
      },
    ])
    setCustomName('')
    setCustomPrice('')
    setCustomOpen(false)
    setOpenSection('items')
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      setMobilePane('order')
    }
  }

  function updateCustomPrice(id: string, nextPrice: string) {
    const price = Number(nextPrice)
    setCart((prev) =>
      prev.map((line) =>
        line.item.id === id && line.isCustom
          ? {
              ...line,
              item: {
                ...line.item,
                price: Number.isFinite(price) && price >= 0 ? price : line.item.price,
              },
            }
          : line,
      ),
    )
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) => (line.item.id === id ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0),
    )
  }

  function updateLine(id: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((line) => (line.item.id === id ? { ...line, ...patch } : line)))
  }

  function clearCart() {
    setCart([])
    setUsePoints(0)
    setUseWallet(0)
    setDiscount('')
    setDoctorNotes('')
    setAdministeredBy('')
    setConsultBy('')
    setSalesBy(user?.name || '')
    setSessionOpenIds({})
    setOpenSection('items')
  }

  async function completeSale() {
    if (!cart.length) return
    if (!customer) {
      setError('Select a client or add customers first.')
      setMobilePane('order')
      setOpenSection('items')
      return
    }
    if (usePoints > customer.points) {
      setError('Not enough loyalty points.')
      setOpenSection('pay')
      return
    }
    if (useWallet > customer.cashInBalance) {
      setError('Not enough wallet balance.')
      setOpenSection('pay')
      return
    }
    if (!salesBy.trim()) {
      setError('Enter who made the sale (Sales by).')
      setMobilePane('order')
      setOpenSection('staff')
      return
    }

    for (const line of cart) {
      const sessions = Number(line.sessionsAdvised) || 0
      if (sessions >= 1 && !(Number(line.packageAmount) > 0)) {
        setError(`Enter package amount for ${line.item.name} (${sessions} sessions).`)
        setOpenSection('items')
        return
      }
    }

    setSaving(true)
    setError('')
    const items = cart
      .map((l) => {
        const sessions = Number(l.sessionsAdvised) || 0
        if (sessions >= 1) {
          return `${l.item.name} · ${sessions} sessions @ ${formatCurrency(Number(l.packageAmount) || 0)}`
        }
        return `${l.item.name} x${l.qty}`
      })
      .join(', ')
    const paymentMethod =
      usePoints > 0 && useWallet > 0
        ? 'Mixed'
        : usePoints > 0 && payable === 0
          ? 'Points'
          : payable > 0
            ? 'Cash'
            : 'Mixed'

    const receipt = receiptNumber()
    const attribution = {
      discount_amount: discountAmount,
      doctor_notes: doctorNotes.trim() || null,
      administered_by: administeredBy.trim() || null,
      consult_by: consultBy.trim() || null,
      sales_by: salesBy.trim(),
    }

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
      ...attribution,
    })

    if (saleErr) {
      setSaving(false)
      setError(
        saleErr.message.includes('sales_by') ||
          saleErr.message.includes('discount_amount') ||
          saleErr.message.includes('schema cache')
          ? `${saleErr.message} — run supabase/add_pos_attribution.sql in Supabase.`
          : saleErr.message,
      )
      return
    }

    const sessionRows = cart
      .filter((l) => (Number(l.sessionsAdvised) || 0) >= 1)
      .map((l) => ({
        branch_id: isUuid(branchId) ? branchId : null,
        customer_id: customer.id,
        customer_name: customer.name,
        service_id: isUuid(l.item.id) ? l.item.id : null,
        service_name: l.item.name,
        total_sessions: Number(l.sessionsAdvised),
        sessions_used: 0,
        package_amount: Number(l.packageAmount) || 0,
        sold_on: new Date().toISOString().slice(0, 10),
        next_session_date: l.nextSessionDate || null,
        sale_receipt_no: receipt,
        status: 'active',
        ...attribution,
      }))

    if (sessionRows.length) {
      const { error: sessionErr } = await supabase.from('client_session_packages').insert(sessionRows)
      if (sessionErr) {
        setSaving(false)
        setError(
          sessionErr.message.includes('client_session_packages') ||
            sessionErr.message.includes('schema cache')
            ? `${sessionErr.message} — run supabase/add_client_sessions.sql and add_pos_attribution.sql.`
            : sessionErr.message,
        )
        return
      }
    }

    const nextPoints = customer.points - usePoints + earnPoints
    const nextWallet = customer.cashInBalance - useWallet

    let nextMembership = normalizeMembership(customer.membership)
    let nextMembershipExpires = customer.membershipExpiresAt ?? null
    const membershipLines = cart
      .map((l) => ({
        tier: membershipTierFromService({
          membershipTier: l.item.membershipTier,
          category: l.item.category,
          name: l.item.name,
        }),
        qty: l.qty,
      }))
      .filter((l): l is { tier: 'VIP' | 'VVIP'; qty: number } => Boolean(l.tier))

    for (const line of membershipLines) {
      const resolved = resolveMembershipAfterPurchase(
        nextMembership,
        nextMembershipExpires,
        line.tier,
        line.qty,
      )
      nextMembership = resolved.membership
      nextMembershipExpires = resolved.membershipExpiresAt
    }

    const customerUpdate: Record<string, unknown> = {
      points: nextPoints,
      cash_in_balance: nextWallet,
      visits: customer.visits + 1,
      last_visit: new Date().toISOString().slice(0, 10),
    }
    if (membershipLines.length) {
      customerUpdate.membership = nextMembership
      customerUpdate.membership_expires_at = nextMembershipExpires
    }

    const { error: custErr } = await supabase
      .from('customers')
      .update(customerUpdate)
      .eq('id', customer.id)

    if (custErr) {
      setSaving(false)
      setError(
        custErr.message.includes('membership_expires_at') ||
          custErr.message.includes('schema cache')
          ? `${custErr.message} — run supabase/add_membership_subscription.sql in Supabase.`
          : custErr.message,
      )
      return
    }

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
    const membershipNote = membershipLines.length
      ? ` Client tagged ${nextMembership} until ${nextMembershipExpires}.`
      : ''
    setMessage(
      sessionRows.length
        ? `Sale completed. Receipt ${receipt}. Session package saved — track under Client Sessions.${membershipNote}`
        : `Sale completed. Receipt ${receipt}.${membershipNote}`,
    )
    await load()
    setTimeout(() => navigate(sessionRows.length ? '/sessions' : '/sales'), 900)
  }

  return (
    <div className="pos-page">
      <PageHeader
        kicker="Front Desk"
        title="Point of Sale"
        subtitle="Build the order from the menu, or add a custom service with its own price, then checkout."
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="pos-mobile-tabs" role="tablist" aria-label="POS views">
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'menu'}
          className={`pos-mobile-tab ${mobilePane === 'menu' ? 'active' : ''}`}
          onClick={() => setMobilePane('menu')}
        >
          Services
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'order'}
          className={`pos-mobile-tab ${mobilePane === 'order' ? 'active' : ''}`}
          onClick={() => setMobilePane('order')}
        >
          Order
          {cartCount > 0 ? <span className="pos-mobile-badge">{cartCount}</span> : null}
        </button>
      </div>

      <div className={`pos-layout pos-pane-${mobilePane}`}>
        <section className="panel pos-catalog">
          <div className="panel-body pos-catalog-body">
            <div className="pos-chips">
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
              <button
                type="button"
                className="pos-card pos-card-custom"
                onClick={openCustomService}
              >
                <div className="pos-card-cat">Custom</div>
                <div className="pos-card-name">Custom service</div>
                <div className="pos-card-meta">Ask + set price</div>
                <div className="pos-card-price">Set price</div>
              </button>
              {filtered.length === 0 ? (
                <div className="empty-state pos-grid-empty">No other active services in this category.</div>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="pos-card"
                    onClick={() => {
                      addToCart(item)
                      if (
                        typeof window !== 'undefined' &&
                        window.matchMedia('(max-width: 900px)').matches
                      ) {
                        setMobilePane('order')
                      }
                    }}
                  >
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
        </section>

        <aside className="panel pos-cart">
          <div className="pos-cart-shell">
            <div className="pos-cart-top">
              <div className="pos-cart-heading">
                <div>
                  <p className="pos-cart-kicker">Checkout</p>
                  <h2 className="pos-cart-title">Current order</h2>
                </div>
                <button className="btn btn-ghost btn-sm" type="button" onClick={clearCart}>
                  Clear
                </button>
              </div>

              <div className="field pos-client-field">
                <label>Client</label>
                <select
                  className="select"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  {customers.length === 0 ? <option value="">No clients yet</option> : null}
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {normalizeMembership(c.membership)} · {c.points} pts ·{' '}
                      {formatCurrency(c.cashInBalance)}
                    </option>
                  ))}
                </select>
                {customer ? (
                  <div style={{ marginTop: 8 }}>
                    <MembershipBadge
                      membership={customer.membership}
                      expiresAt={customer.membershipExpiresAt}
                      showExpiry
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="pos-cart-scroll">
              <div className="pos-accordion">
                <button
                  type="button"
                  className={`pos-acc-head ${openSection === 'items' ? 'open' : ''}`}
                  onClick={() => toggleSection('items')}
                >
                  <span>
                    Items
                    <em>{cartCount ? `${cartCount} in cart` : 'Empty'}</em>
                  </span>
                  <ChevronDown size={16} />
                </button>
                {openSection === 'items' ? (
                  <div className="pos-acc-body">
                    <div className="pos-lines">
                      {cart.length === 0 ? (
                        <div className="pos-empty">
                          <ShoppingBag size={22} strokeWidth={1.5} />
                          <p>Tap a service to start the order.</p>
                        </div>
                      ) : (
                        cart.map((line) => {
                          const sessions = Number(line.sessionsAdvised) || 0
                          const hasPackage = sessions >= 1
                          const isMembership = Boolean(
                            membershipTierFromService({
                              membershipTier: line.item.membershipTier,
                              category: line.item.category,
                              name: line.item.name,
                            }),
                          )
                          const sessionUiOpen =
                            !isMembership && (sessionOpenIds[line.item.id] ?? hasPackage)
                          return (
                            <div className="pos-line" key={line.item.id}>
                              <div className="pos-line-top">
                                <div className="pos-line-info">
                                  <strong>
                                    {line.item.name}
                                    {line.isCustom ? (
                                      <span className="pos-line-custom-tag">Custom</span>
                                    ) : null}
                                  </strong>
                                  <span>
                                    {isMembership
                                      ? `${formatCurrency(line.item.price)} · 1 year / unit`
                                      : hasPackage
                                        ? `Package ${formatCurrency(Number(line.packageAmount) || 0)}`
                                        : `${formatCurrency(line.item.price)} each`}
                                  </span>
                                </div>
                                <div className="pos-qty">
                                  {!hasPackage ? (
                                    <>
                                      <button
                                        className="btn-icon"
                                        type="button"
                                        onClick={() => updateQty(line.item.id, -1)}
                                      >
                                        <Minus size={14} />
                                      </button>
                                      <span>{line.qty}</span>
                                      <button
                                        className="btn-icon"
                                        type="button"
                                        onClick={() => updateQty(line.item.id, 1)}
                                      >
                                        <Plus size={14} />
                                      </button>
                                    </>
                                  ) : (
                                    <span className="pos-line-total">
                                      {formatCurrency(lineTotal(line))}
                                    </span>
                                  )}
                                  <button
                                    className="btn-icon"
                                    type="button"
                                    aria-label="Remove"
                                    onClick={() => updateQty(line.item.id, -line.qty)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>

                              {line.isCustom && !hasPackage ? (
                                <div className="field pos-custom-price-edit">
                                  <label htmlFor={`custom-price-${line.item.id}`}>
                                    Custom price
                                  </label>
                                  <input
                                    id={`custom-price-${line.item.id}`}
                                    className="input"
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={line.item.price}
                                    onChange={(e) =>
                                      updateCustomPrice(line.item.id, e.target.value)
                                    }
                                  />
                                </div>
                              ) : null}

                              {isMembership ? (
                                <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.8rem' }}>
                                  Tags this client as {line.item.membershipTier || 'member'} for 1
                                  year per unit (renews from current expiry if already active).
                                </p>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className={`pos-session-toggle ${sessionUiOpen ? 'active' : ''}`}
                                    onClick={() =>
                                      setSessionOpenIds((prev) => ({
                                        ...prev,
                                        [line.item.id]: !sessionUiOpen,
                                      }))
                                    }
                                  >
                                    {hasPackage
                                      ? `${sessions} sessions advised`
                                      : 'Add doctor-advised sessions'}
                                  </button>

                                  {sessionUiOpen ? (
                                    <div className="pos-session-fields">
                                      <div className="field">
                                        <label>Sessions</label>
                                        <input
                                          className="input"
                                          type="number"
                                          min={0}
                                          placeholder="0"
                                          value={line.sessionsAdvised || ''}
                                          onChange={(e) =>
                                            updateLine(line.item.id, {
                                              sessionsAdvised: Math.max(
                                                0,
                                                Number(e.target.value) || 0,
                                              ),
                                            })
                                          }
                                        />
                                      </div>
                                      <div className="field">
                                        <label>Package ₱</label>
                                        <input
                                          className="input"
                                          type="number"
                                          min={0}
                                          placeholder="Amount"
                                          disabled={!hasPackage}
                                          value={line.packageAmount}
                                          onChange={(e) =>
                                            updateLine(line.item.id, {
                                              packageAmount: e.target.value,
                                            })
                                          }
                                        />
                                      </div>
                                      <div className="field pos-session-date">
                                        <label>Next session</label>
                                        <input
                                          className="input"
                                          type="date"
                                          disabled={!hasPackage}
                                          value={line.nextSessionDate}
                                          onChange={(e) =>
                                            updateLine(line.item.id, {
                                              nextSessionDate: e.target.value,
                                            })
                                          }
                                        />
                                      </div>
                                    </div>
                                  ) : null}
                                </>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="pos-accordion">
                <button
                  type="button"
                  className={`pos-acc-head ${openSection === 'staff' ? 'open' : ''} ${!staffFilled ? 'needs' : ''}`}
                  onClick={() => toggleSection('staff')}
                >
                  <span>
                    Staff & notes
                    <em>
                      {staffFilled
                        ? `${staffSummary}/3 set · Sales: ${salesBy}`
                        : 'Sales by required'}
                    </em>
                  </span>
                  <ChevronDown size={16} />
                </button>
                {openSection === 'staff' ? (
                  <div className="pos-acc-body">
                    <div className="pos-staff-grid">
                      <StaffAssignField
                        compact
                        label="Administered by"
                        value={administeredBy}
                        onChange={setAdministeredBy}
                        profiles={profiles}
                      />
                      <StaffAssignField
                        compact
                        label="Consult by"
                        value={consultBy}
                        onChange={setConsultBy}
                        profiles={profiles}
                      />
                      <StaffAssignField
                        compact
                        required
                        label="Sales by"
                        value={salesBy}
                        onChange={setSalesBy}
                        profiles={profiles}
                        hint="Counts toward dashboard sales."
                      />
                    </div>
                    <div className="field">
                      <label>Doctor&apos;s notes</label>
                      <textarea
                        className="input pos-notes"
                        rows={3}
                        value={doctorNotes}
                        onChange={(e) => setDoctorNotes(e.target.value)}
                        placeholder="Treatment plan, precautions…"
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="pos-accordion">
                <button
                  type="button"
                  className={`pos-acc-head ${openSection === 'pay' ? 'open' : ''}`}
                  onClick={() => toggleSection('pay')}
                >
                  <span>
                    Payment
                    <em>
                      {discountAmount || usePoints || useWallet
                        ? `−${formatCurrency(discountAmount + pointsValue + useWallet)} applied`
                        : 'Discount, points, wallet'}
                    </em>
                  </span>
                  <ChevronDown size={16} />
                </button>
                {openSection === 'pay' ? (
                  <div className="pos-acc-body">
                    <div className="pos-pay-grid">
                      <div className="field">
                        <label>Discount</label>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          placeholder="0"
                          value={discount}
                          onChange={(e) => setDiscount(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>Points (max {customer?.points ?? 0})</label>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={customer?.points ?? 0}
                          value={usePoints}
                          onChange={(e) =>
                            setUsePoints(
                              Math.min(
                                customer?.points ?? 0,
                                Math.max(0, Number(e.target.value) || 0),
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="field pos-pay-full">
                        <label>Wallet (max {formatCurrency(customer?.cashInBalance ?? 0)})</label>
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
                  </div>
                ) : null}
              </div>
            </div>

            <div className="pos-cart-footer">
              <div className="pos-totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{formatCurrency(subtotal)}</strong>
                </div>
                {discountAmount > 0 ? (
                  <div>
                    <span>Discount</span>
                    <strong>-{formatCurrency(discountAmount)}</strong>
                  </div>
                ) : null}
                {pointsValue > 0 ? (
                  <div>
                    <span>Points</span>
                    <strong>-{formatCurrency(pointsValue)}</strong>
                  </div>
                ) : null}
                {useWallet > 0 ? (
                  <div>
                    <span>Wallet</span>
                    <strong>-{formatCurrency(useWallet)}</strong>
                  </div>
                ) : null}
                <div className="pos-due">
                  <span>Amount due</span>
                  <strong>{formatCurrency(payable)}</strong>
                </div>
                {earnPoints > 0 ? (
                  <div className="pos-earn">
                    <span>Points to earn</span>
                    <strong>+{earnPoints}</strong>
                  </div>
                ) : null}
              </div>

              <button
                className="btn btn-primary pos-checkout-btn"
                type="button"
                disabled={cart.length === 0 || saving}
                onClick={completeSale}
              >
                {saving ? 'Processing…' : 'Complete sale'}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {customOpen ? (
        <div
          className="pos-custom-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCustomOpen(false)
          }}
        >
          <div
            className="pos-custom-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-custom-modal-title"
          >
            <div className="pos-custom-modal-head">
              <div>
                <p className="pos-custom-kicker">Custom service</p>
                <h3 id="pos-custom-modal-title">Add to order</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                aria-label="Close"
                onClick={() => setCustomOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="pos-custom-copy">
              Enter what the client asked for and the price you will charge. Available for
              Receptionist, Admin, and Owner on POS.
            </p>
            <div className="field">
              <label htmlFor="pos-custom-name">Service name</label>
              <input
                id="pos-custom-name"
                className="input"
                autoFocus
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Spot treatment, add-on peel…"
              />
            </div>
            <div className="field">
              <label htmlFor="pos-custom-price">Custom price (₱)</label>
              <input
                id="pos-custom-price"
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="pos-custom-modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setCustomOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={addCustomService}>
                Add to order
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
