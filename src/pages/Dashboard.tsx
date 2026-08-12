import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MembershipBadge } from '../components/MembershipBadge'
import { PageHeader } from '../components/PageHeader'
import { useBranch } from '../context/BranchContext'
import { formatShortDate, inDateRange, toLocalISODate } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { formatCurrency, isUuid } from '../lib/utils'

type SaleRow = {
  id: string
  receipt_no: string
  customer_name: string | null
  items: string | null
  total: number
  payment_method: string
  sold_at: string
  points_used: number
  sales_by: string | null
}

type ServicePoint = { name: string; revenue: number; units: number }
type StaffPoint = { name: string; sales: number; commission: number; count: number }
type StaffTrendPoint = { day: string; sales: number; commission: number }

type IncentiveRule = {
  incentive_type: string
  rate_percent: number
  flat_amount: number
  active: boolean
}

type IncentivePayout = {
  staff_name: string
  final_amount: number
  sales_amount: number
  period_start: string
  period_end: string
}

/** Parse POS sale `items` text into line names + units. */
function parseSaleLines(items: string | null | undefined): Array<{ name: string; units: number }> {
  const raw = (items || '').trim()
  if (!raw) return []

  const chunks = raw
    .split(/,\s+(?=[^@₱]+(?:\sx\d+|\s·\s\d+\s+sessions))/i)
    .map((s) => s.trim())
    .filter(Boolean)

  return chunks.map((chunk) => {
    const sessionMatch = chunk.match(/^(.*?)\s+·\s+(\d+)\s+sessions/i)
    if (sessionMatch) {
      return { name: sessionMatch[1].trim(), units: Math.max(1, Number(sessionMatch[2]) || 1) }
    }
    const qtyMatch = chunk.match(/^(.*?)\s+x(\d+)\s*$/i)
    if (qtyMatch) {
      return { name: qtyMatch[1].trim(), units: Math.max(1, Number(qtyMatch[2]) || 1) }
    }
    return { name: chunk.replace(/\s+@\s*₱[\d,]+.*$/i, '').trim() || chunk, units: 1 }
  })
}

function looksLikeProductItems(items: string | null | undefined) {
  const text = String(items || '').toLowerCase()
  return (
    text.includes('retail') ||
    text.includes('serum') ||
    text.includes('cream') ||
    text.includes('product') ||
    text.includes('skincare')
  )
}

function aggregateTopServices(sales: SaleRow[], limit = 8): ServicePoint[] {
  const map = new Map<string, ServicePoint>()
  for (const sale of sales) {
    const lines = parseSaleLines(sale.items)
    if (!lines.length) {
      const name = 'Unspecified'
      const cur = map.get(name) ?? { name, revenue: 0, units: 0 }
      cur.revenue += Number(sale.total || 0)
      cur.units += 1
      map.set(name, cur)
      continue
    }
    const totalUnits = lines.reduce((sum, l) => sum + l.units, 0) || 1
    const saleTotal = Number(sale.total || 0)
    for (const line of lines) {
      const cur = map.get(line.name) ?? { name: line.name, revenue: 0, units: 0 }
      cur.revenue += saleTotal * (line.units / totalUnits)
      cur.units += line.units
      map.set(line.name, cur)
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((row) => ({ ...row, revenue: Math.round(row.revenue) }))
}

function estimateCommissionFromRules(
  sales: SaleRow[],
  rules: IncentiveRule[],
): Map<string, number> {
  const serviceRule = rules.find((r) => r.active && r.incentive_type === 'service_commission')
  const productRule = rules.find((r) => r.active && r.incentive_type === 'product_incentive')
  const byStaff = new Map<string, { service: number; product: number }>()

  for (const sale of sales) {
    const staff = (sale.sales_by || '').trim()
    if (!staff) continue
    const total = Number(sale.total || 0)
    const cur = byStaff.get(staff) ?? { service: 0, product: 0 }
    if (looksLikeProductItems(sale.items)) cur.product += total
    else cur.service += total
    byStaff.set(staff, cur)
  }

  const commission = new Map<string, number>()
  for (const [staff, agg] of byStaff) {
    let amount = 0
    if (serviceRule && agg.service > 0) {
      amount += (agg.service * (serviceRule.rate_percent || 0)) / 100 + (serviceRule.flat_amount || 0)
    }
    if (productRule && agg.product > 0) {
      amount += (agg.product * (productRule.rate_percent || 0)) / 100 + (productRule.flat_amount || 0)
    }
    if (amount > 0) commission.set(staff, amount)
  }
  return commission
}

function commissionForSale(sale: SaleRow, rules: IncentiveRule[]): number {
  const staff = (sale.sales_by || '').trim()
  if (!staff) return 0
  const total = Number(sale.total || 0)
  if (total <= 0) return 0
  const serviceRule = rules.find((r) => r.active && r.incentive_type === 'service_commission')
  const productRule = rules.find((r) => r.active && r.incentive_type === 'product_incentive')
  if (looksLikeProductItems(sale.items)) {
    if (!productRule) return 0
    return (total * (productRule.rate_percent || 0)) / 100
  }
  if (!serviceRule) return 0
  return (total * (serviceRule.rate_percent || 0)) / 100
}

/** Daily POS sales + commission for line trend (time series). */
function buildStaffTrend(
  sales: SaleRow[],
  rules: IncentiveRule[],
  commissionByStaff: Map<string, number>,
  usePayoutShare: boolean,
): StaffTrendPoint[] {
  const daySales = new Map<string, number>()
  const dayCommission = new Map<string, number>()
  const totalSales = sales.reduce((sum, s) => sum + Number(s.total || 0), 0) || 1
  const totalCommission = Array.from(commissionByStaff.values()).reduce((a, b) => a + b, 0)

  for (const sale of sales) {
    const key = String(sale.sold_at).slice(0, 10)
    const amount = Number(sale.total || 0)
    daySales.set(key, (daySales.get(key) || 0) + amount)
    if (usePayoutShare) {
      dayCommission.set(key, (dayCommission.get(key) || 0) + (totalCommission * amount) / totalSales)
    } else {
      dayCommission.set(key, (dayCommission.get(key) || 0) + commissionForSale(sale, rules))
    }
  }

  return Array.from(daySales.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({
      day: key.slice(5),
      sales: Math.round(daySales.get(key) || 0),
      commission: Math.round(dayCommission.get(key) || 0),
    }))
}

type AppointmentRow = {
  id: string
  customer_name: string
  service_name: string
  appointment_date: string
  appointment_time: string
  status: string
}

type InventoryRow = {
  id: string
  name: string
  sku: string
  stock: number
  unit: string
  reorder_level: number
}

type CustomerRow = {
  id: string
  full_name: string
  membership: string
  membership_expires_at?: string | null
  points: number
  cash_in_balance: number
  created_at?: string
}

type TrendPoint = { month: string; revenue: number; expenses: number }

function defaultRange() {
  const to = toLocalISODate()
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - 6)
  return { from: toLocalISODate(fromDate), to }
}

export function Dashboard() {
  const { branchId, branchName } = useBranch()
  const today = toLocalISODate()
  const initial = useMemo(() => defaultRange(), [])
  const [rangeFrom, setRangeFrom] = useState(initial.from)
  const [rangeTo, setRangeTo] = useState(initial.to)
  const [loading, setLoading] = useState(true)
  const [rangeSalesTotal, setRangeSalesTotal] = useState(0)
  const [rangeAppts, setRangeAppts] = useState<AppointmentRow[]>([])
  const [newClients, setNewClients] = useState(0)
  const [pointsRedeemed, setPointsRedeemed] = useState(0)
  const [lowStock, setLowStock] = useState<InventoryRow[]>([])
  const [recentSales, setRecentSales] = useState<SaleRow[]>([])
  const [topClients, setTopClients] = useState<CustomerRow[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [topServices, setTopServices] = useState<ServicePoint[]>([])
  const [topStaff, setTopStaff] = useState<StaffPoint[]>([])
  const [staffTrend, setStaffTrend] = useState<StaffTrendPoint[]>([])
  const [commissionSource, setCommissionSource] = useState<'payouts' | 'rules' | 'none'>('none')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const from = rangeFrom || today
      const to = rangeTo || today
      const safeFrom = from <= to ? from : to
      const safeTo = from <= to ? to : from

      let salesQ = supabase
        .from('sales')
        .select(
          'id, receipt_no, customer_name, items, total, payment_method, sold_at, points_used, sales_by',
        )
        .gte('sold_at', `${safeFrom}T00:00:00`)
        .lte('sold_at', `${safeTo}T23:59:59`)
        .order('sold_at', { ascending: false })
        .limit(500)
      let apptQ = supabase
        .from('appointments')
        .select(
          'id, customer_name, service_name, appointment_date, appointment_time, status, branch_id',
        )
        .gte('appointment_date', safeFrom)
        .lte('appointment_date', safeTo)
        .order('appointment_date')
        .order('appointment_time')
      let invQ = supabase
        .from('inventory_items')
        .select('id, name, sku, stock, unit, reorder_level')
        .limit(100)
      let custQ = supabase
        .from('customers')
        .select(
          'id, full_name, membership, membership_expires_at, points, cash_in_balance, created_at',
        )
        .order('points', { ascending: false })
        .limit(100)
      let expenseQ = supabase
        .from('expenses')
        .select('amount, expense_date')
        .gte('expense_date', safeFrom)
        .lte('expense_date', safeTo)
      let payoutQ = supabase
        .from('incentive_payouts')
        .select('staff_name, final_amount, sales_amount, period_start, period_end')
        .lte('period_start', safeTo)
        .gte('period_end', safeFrom)
      let rulesQ = supabase
        .from('incentive_rules')
        .select('incentive_type, rate_percent, flat_amount, active')
        .eq('active', true)

      if (isUuid(branchId)) {
        salesQ = salesQ.eq('branch_id', branchId)
        apptQ = apptQ.or(`branch_id.eq.${branchId},branch_id.is.null`)
        invQ = invQ.eq('branch_id', branchId)
        custQ = custQ.eq('branch_id', branchId)
        expenseQ = expenseQ.eq('branch_id', branchId)
        payoutQ = payoutQ.or(`branch_id.eq.${branchId},branch_id.is.null`)
      }

      const [
        { data: salesData },
        { data: apptData },
        { data: invData },
        { data: custData },
        { data: expenseData },
        { data: payoutData },
        { data: rulesData },
      ] = await Promise.all([salesQ, apptQ, invQ, custQ, expenseQ, payoutQ, rulesQ])

      const sales = (salesData as SaleRow[]) ?? []
      setRangeSalesTotal(sales.reduce((sum, s) => sum + Number(s.total || 0), 0))
      setPointsRedeemed(sales.reduce((sum, s) => sum + Number(s.points_used || 0), 0))
      setRecentSales(sales.slice(0, 8))
      setRangeAppts((apptData as AppointmentRow[]) ?? [])
      setTopServices(aggregateTopServices(sales))

      const byMap = new Map<string, StaffPoint>()
      for (const s of sales) {
        const name = (s.sales_by || 'Unassigned').trim() || 'Unassigned'
        const cur = byMap.get(name) ?? { name, sales: 0, commission: 0, count: 0 }
        cur.sales += Number(s.total || 0)
        cur.count += 1
        byMap.set(name, cur)
      }

      const payouts = (payoutData as IncentivePayout[] | null) ?? []
      const rules = ((rulesData as IncentiveRule[] | null) ?? []).map((r) => ({
        ...r,
        rate_percent: Number(r.rate_percent ?? 0),
        flat_amount: Number(r.flat_amount ?? 0),
      }))

      const commissionByStaff = new Map<string, number>()
      if (payouts.length) {
        for (const p of payouts) {
          const name = (p.staff_name || '').trim()
          if (!name) continue
          commissionByStaff.set(name, (commissionByStaff.get(name) || 0) + Number(p.final_amount || 0))
        }
        setCommissionSource('payouts')
      } else if (rules.length) {
        const estimated = estimateCommissionFromRules(sales, rules)
        for (const [name, amount] of estimated) {
          commissionByStaff.set(name, amount)
        }
        setCommissionSource(estimated.size ? 'rules' : 'none')
      } else {
        setCommissionSource('none')
      }

      for (const [name, amount] of commissionByStaff) {
        const cur = byMap.get(name) ?? { name, sales: 0, commission: 0, count: 0 }
        cur.commission = Math.round(amount)
        byMap.set(name, cur)
      }

      setTopStaff(
        Array.from(byMap.values())
          .sort((a, b) => b.sales - a.sales || b.commission - a.commission)
          .slice(0, 8)
          .map((row) => ({
            ...row,
            sales: Math.round(row.sales),
            commission: Math.round(row.commission),
          })),
      )
      setStaffTrend(
        buildStaffTrend(sales, rules, commissionByStaff, commissionByStaff.size > 0 && payouts.length > 0),
      )

      const customers = (custData as CustomerRow[]) ?? []
      setTopClients(customers.slice(0, 4))
      setNewClients(
        customers.filter((c) =>
          inDateRange(String(c.created_at || '').slice(0, 10), safeFrom, safeTo),
        ).length,
      )

      setLowStock(
        ((invData as InventoryRow[]) ?? []).filter((item) => item.stock <= item.reorder_level),
      )

      const dayMap = new Map<string, TrendPoint>()
      for (const s of sales) {
        const key = String(s.sold_at).slice(0, 10)
        const cur = dayMap.get(key) ?? { month: key.slice(5), revenue: 0, expenses: 0 }
        cur.revenue += Number(s.total || 0)
        dayMap.set(key, cur)
      }
      for (const e of (expenseData as { amount: number; expense_date: string }[]) ?? []) {
        const key = String(e.expense_date).slice(0, 10)
        const cur = dayMap.get(key) ?? { month: key.slice(5), revenue: 0, expenses: 0 }
        cur.expenses += Number(e.amount || 0)
        dayMap.set(key, cur)
      }
      const sorted = Array.from(dayMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, point]) => point)
      setTrend(sorted)
      setLoading(false)
    }

    load()
  }, [branchId, rangeFrom, rangeTo, today])

  const rangeLabel = useMemo(() => {
    const from = rangeFrom || today
    const to = rangeTo || today
    if (from === to) return formatShortDate(from)
    return `${formatShortDate(from)} – ${formatShortDate(to)}`
  }, [rangeFrom, rangeTo, today])

  const subtitle = useMemo(
    () =>
      loading
        ? `Loading data for ${branchName}…`
        : `${branchName} · ${rangeLabel}`,
    [loading, branchName, rangeLabel],
  )

  function setPreset(days: number) {
    const to = toLocalISODate()
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - (days - 1))
    setRangeFrom(toLocalISODate(fromDate))
    setRangeTo(to)
  }

  return (
    <div>
      <PageHeader kicker="Overview" title="Clinic Dashboard" subtitle={subtitle} />

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
          <div className="field" style={{ margin: 0 }}>
            <label>From</label>
            <input
              className="input"
              type="date"
              value={rangeFrom}
              max={rangeTo || undefined}
              onChange={(e) => setRangeFrom(e.target.value)}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>To</label>
            <input
              className="input"
              type="date"
              value={rangeTo}
              min={rangeFrom || undefined}
              onChange={(e) => setRangeTo(e.target.value)}
            />
          </div>
          <div className="chips" style={{ margin: 0 }}>
            <button type="button" className="chip" onClick={() => setPreset(1)}>
              Today
            </button>
            <button type="button" className="chip" onClick={() => setPreset(7)}>
              7 days
            </button>
            <button type="button" className="chip" onClick={() => setPreset(30)}>
              30 days
            </button>
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Sales</div>
          <div className="stat-value">{formatCurrency(rangeSalesTotal)}</div>
          <div className="stat-meta">{rangeLabel}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Appointments</div>
          <div className="stat-value">{rangeAppts.length}</div>
          <div className="stat-meta">in selected range</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">New Clients</div>
          <div className="stat-value">{newClients}</div>
          <div className="stat-meta">registered in range</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Points Redeemed</div>
          <div className="stat-value">{pointsRedeemed}</div>
          <div className="stat-meta">
            <span className="badge badge-warning">{lowStock.length} low stock</span>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Top sales services</h2>
          </div>
          <div className="panel-body">
            {topServices.length === 0 ? (
              <div className="empty-state">No POS line items in this date range.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Service</th>
                      <th>Units</th>
                      <th>Revenue</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topServices.map((row, index) => {
                      const totalRev = topServices.reduce((sum, s) => sum + s.revenue, 0) || 1
                      const share = Math.round((row.revenue / totalRev) * 100)
                      return (
                        <tr key={row.name}>
                          <td>{index + 1}</td>
                          <td>
                            <strong>{row.name}</strong>
                          </td>
                          <td>{row.units}</td>
                          <td>{formatCurrency(row.revenue)}</td>
                          <td>{share}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {topServices.length > 0 ? (
              <p style={{ margin: '10px 0 0', color: 'var(--muted)', fontSize: '0.8rem' }}>
                From POS receipts · revenue split by line qty in each sale
              </p>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Sales & commission trend</h2>
          </div>
          <div className="panel-body" style={{ height: 320 }}>
            {staffTrend.length === 0 ? (
              <div className="empty-state">No POS sales in this range to chart.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={staffTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ececec" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#6b6b6b', fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: '#6b6b6b', fontSize: 12 }}
                    tickFormatter={(v) =>
                      v >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(value, key) => [
                      formatCurrency(Number(value)),
                      key === 'commission' ? 'Commission' : 'POS sales',
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e6e6e6',
                      boxShadow: 'none',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name="POS sales"
                    stroke="#0a0a0a"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#0a0a0a' }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="commission"
                    name="Commission"
                    stroke="#b8954a"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#b8954a' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div
            className="panel-body"
            style={{ paddingTop: 0, color: 'var(--muted)', fontSize: '0.8rem' }}
          >
            Daily POS sales with commission
            {commissionSource === 'payouts'
              ? ' (HR payouts allocated by daily sales share)'
              : commissionSource === 'rules'
                ? ' (estimated from active HR rules × Sales by)'
                : ' — add incentive rules or payouts to show commission'}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Revenue vs Expenses</h2>
          </div>
          <div className="panel-body" style={{ height: 300 }}>
            {trend.every((t) => t.revenue === 0 && t.expenses === 0) ? (
              <div className="empty-state">No sales/expenses in this date range.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ececec" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#6b6b6b', fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: '#6b6b6b', fontSize: 12 }}
                    tickFormatter={(v) =>
                      v >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(value, key) => [
                      formatCurrency(Number(value)),
                      key === 'expenses' ? 'Expenses' : 'Revenue',
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e6e6e6',
                      boxShadow: 'none',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#0a0a0a"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#0a0a0a' }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke="#9a9a9a"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#9a9a9a' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Schedule in range</h2>
            </div>
            <div className="panel-body">
              {rangeAppts.length === 0 ? (
                <div className="empty-state">No appointments in this date range.</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Client</th>
                        <th>Service</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rangeAppts.slice(0, 12).map((apt) => (
                        <tr key={apt.id}>
                          <td>{apt.appointment_date}</td>
                          <td>{String(apt.appointment_time).slice(0, 5)}</td>
                          <td>{apt.customer_name}</td>
                          <td>{apt.service_name}</td>
                          <td>
                            <span className="badge">{apt.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Low Stock Alerts</h2>
            </div>
            <div className="panel-body">
              {lowStock.length === 0 ? (
                <div className="empty-state">All stock levels are healthy.</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>SKU</th>
                        <th>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStock.map((item) => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>{item.sku}</td>
                          <td>
                            <span className="badge badge-danger">
                              {item.stock} {item.unit}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Staff leaderboard</h2>
          </div>
          <div className="panel-body">
            {topStaff.length === 0 ? (
              <div className="empty-state">No sales attributed in this range.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sales by</th>
                      <th>Txns</th>
                      <th>POS sales</th>
                      <th>Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topStaff.map((row) => (
                      <tr key={row.name}>
                        <td>
                          <strong>{row.name}</strong>
                        </td>
                        <td>{row.count}</td>
                        <td>{formatCurrency(row.sales)}</td>
                        <td>{formatCurrency(row.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Transactions in range</h2>
          </div>
          <div className="panel-body">
            {recentSales.length === 0 ? (
              <div className="empty-state">No sales in this date range.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Client</th>
                      <th>Sales by</th>
                      <th>Total</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSales.map((sale) => (
                      <tr key={sale.id}>
                        <td>{sale.receipt_no}</td>
                        <td>{sale.customer_name || '—'}</td>
                        <td>{sale.sales_by || '—'}</td>
                        <td>{formatCurrency(Number(sale.total))}</td>
                        <td>
                          <span className="badge">{sale.payment_method}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <h2 className="panel-title">Loyalty Leaders</h2>
        </div>
        <div className="panel-body">
          {topClients.length === 0 ? (
            <div className="empty-state">No customers yet.</div>
          ) : (
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
                  {topClients.map((client) => (
                    <tr key={client.id}>
                      <td>{client.full_name}</td>
                      <td>
                        <MembershipBadge
                          membership={client.membership}
                          expiresAt={client.membership_expires_at}
                        />
                      </td>
                      <td>{client.points}</td>
                      <td>{formatCurrency(Number(client.cash_in_balance))}</td>
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
