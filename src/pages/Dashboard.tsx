import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '../components/PageHeader'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import { formatCurrency, isUuid } from '../lib/utils'

type SaleRow = {
  id: string
  receipt_no: string
  customer_name: string | null
  total: number
  payment_method: string
  sold_at: string
  points_used: number
}

type AppointmentRow = {
  id: string
  customer_name: string
  service_name: string
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
  points: number
  cash_in_balance: number
}

type TrendPoint = { month: string; revenue: number; expenses: number }

export function Dashboard() {
  const { branchId, branchName } = useBranch()
  const [loading, setLoading] = useState(true)
  const [todaySalesTotal, setTodaySalesTotal] = useState(0)
  const [todayAppts, setTodayAppts] = useState<AppointmentRow[]>([])
  const [newClients, setNewClients] = useState(0)
  const [pointsRedeemed, setPointsRedeemed] = useState(0)
  const [lowStock, setLowStock] = useState<InventoryRow[]>([])
  const [recentSales, setRecentSales] = useState<SaleRow[]>([])
  const [topClients, setTopClients] = useState<CustomerRow[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)
      const monthStart = new Date()
      monthStart.setDate(1)
      const from = new Date()
      from.setMonth(from.getMonth() - 5)
      from.setDate(1)

      let salesQ = supabase
        .from('sales')
        .select('id, receipt_no, customer_name, total, payment_method, sold_at, points_used')
        .order('sold_at', { ascending: false })
        .limit(200)
      let apptQ = supabase
        .from('appointments')
        .select('id, customer_name, service_name, appointment_time, status')
        .eq('appointment_date', today)
        .order('appointment_time')
      let invQ = supabase
        .from('inventory_items')
        .select('id, name, sku, stock, unit, reorder_level')
        .limit(100)
      let custQ = supabase
        .from('customers')
        .select('id, full_name, membership, points, cash_in_balance, created_at')
        .order('points', { ascending: false })
        .limit(50)
      let expenseQ = supabase
        .from('expenses')
        .select('amount, expense_date')
        .gte('expense_date', from.toISOString().slice(0, 10))
      let salesTrendQ = supabase
        .from('sales')
        .select('total, sold_at')
        .gte('sold_at', from.toISOString())

      if (isUuid(branchId)) {
        salesQ = salesQ.eq('branch_id', branchId)
        apptQ = apptQ.eq('branch_id', branchId)
        invQ = invQ.eq('branch_id', branchId)
        custQ = custQ.eq('branch_id', branchId)
        expenseQ = expenseQ.eq('branch_id', branchId)
        salesTrendQ = salesTrendQ.eq('branch_id', branchId)
      }

      const [
        { data: salesData },
        { data: apptData },
        { data: invData },
        { data: custData },
        { data: expenseData },
        { data: salesTrendData },
      ] = await Promise.all([salesQ, apptQ, invQ, custQ, expenseQ, salesTrendQ])

      const sales = (salesData as SaleRow[]) ?? []
      const todaySales = sales.filter((s) => String(s.sold_at).slice(0, 10) === today)
      setTodaySalesTotal(todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0))
      setPointsRedeemed(todaySales.reduce((sum, s) => sum + Number(s.points_used || 0), 0))
      setRecentSales(sales.slice(0, 5))
      setTodayAppts((apptData as AppointmentRow[]) ?? [])

      const customers = (custData as (CustomerRow & { created_at?: string })[]) ?? []
      setTopClients(customers.slice(0, 4))
      setNewClients(customers.filter((c) => String(c.created_at || '').slice(0, 10) === today).length)

      setLowStock(
        ((invData as InventoryRow[]) ?? []).filter((item) => item.stock <= item.reorder_level),
      )

      const months: TrendPoint[] = []
      for (let i = 5; i >= 0; i -= 1) {
        const d = new Date()
        d.setDate(1)
        d.setMonth(d.getMonth() - i)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = d.toLocaleString('en-US', { month: 'short' })
        const revenue = ((salesTrendData as { total: number; sold_at: string }[]) ?? [])
          .filter((s) => String(s.sold_at).startsWith(key))
          .reduce((sum, s) => sum + Number(s.total || 0), 0)
        const expenses = ((expenseData as { amount: number; expense_date: string }[]) ?? [])
          .filter((e) => String(e.expense_date).startsWith(key))
          .reduce((sum, e) => sum + Number(e.amount || 0), 0)
        months.push({ month: label, revenue, expenses })
      }
      setTrend(months)
      setLoading(false)
    }

    load()
  }, [branchId])

  const subtitle = useMemo(
    () =>
      loading
        ? `Loading live data for ${branchName}…`
        : `Live snapshot for ${branchName} — appointments, revenue, stock, and loyalty.`,
    [loading, branchName],
  )

  return (
    <div>
      <PageHeader kicker="Overview" title="Clinic Dashboard" subtitle={subtitle} />

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Today&apos;s Sales</div>
          <div className="stat-value">{formatCurrency(todaySalesTotal)}</div>
          <div className="stat-meta">from live sales records</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Appointments</div>
          <div className="stat-value">{todayAppts.length}</div>
          <div className="stat-meta">scheduled today</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">New Clients</div>
          <div className="stat-value">{newClients}</div>
          <div className="stat-meta">registered today</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Points Redeemed</div>
          <div className="stat-value">{pointsRedeemed}</div>
          <div className="stat-meta">
            <span className="badge badge-warning">{lowStock.length} low stock</span>
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
              <div className="empty-state">No sales/expenses yet for the last 6 months.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ececec" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#6b6b6b', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#6b6b6b', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e6e6e6',
                      boxShadow: 'none',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="revenue" fill="#0a0a0a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="#bdbdbd" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Today&apos;s Schedule</h2>
            </div>
            <div className="panel-body">
              {todayAppts.length === 0 ? (
                <div className="empty-state">No appointments for today.</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Client</th>
                        <th>Service</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayAppts.map((apt) => (
                        <tr key={apt.id}>
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
            <h2 className="panel-title">Recent Transactions</h2>
          </div>
          <div className="panel-body">
            {recentSales.length === 0 ? (
              <div className="empty-state">No sales yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Client</th>
                      <th>Total</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSales.map((sale) => (
                      <tr key={sale.id}>
                        <td>{sale.receipt_no}</td>
                        <td>{sale.customer_name || '—'}</td>
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

        <div className="panel">
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
                          <span className="badge badge-neutral">{client.membership}</span>
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
    </div>
  )
}
