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
import {
  appointments,
  customers,
  formatCurrency,
  inventory,
  kpi,
  sales,
  salesTrend,
} from '../data/mock'
import { useBranch } from '../context/BranchContext'

export function Dashboard() {
  const { branchId, branchName } = useBranch()
  const lowStock = inventory.filter(
    (item) => item.branchId === branchId && item.stock <= item.reorderLevel,
  )
  const todayAppts = appointments.filter((a) => a.branchId === branchId && a.date === '2026-08-02')
  const recentSales = sales.filter((s) => s.branchId === branchId).slice(0, 5)
  const topClients = [...customers]
    .filter((c) => c.branchId === branchId)
    .sort((a, b) => b.points - a.points)
    .slice(0, 4)

  return (
    <div>
      <PageHeader
        kicker="Overview"
        title="Clinic Dashboard"
        subtitle={`Live snapshot for ${branchName} — appointments, revenue, stock, and loyalty.`}
      />

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Today's Sales</div>
          <div className="stat-value">{formatCurrency(kpi.todaySales)}</div>
          <div className="stat-meta">
            <span className="badge badge-success">+12%</span>
            vs yesterday
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Appointments</div>
          <div className="stat-value">{todayAppts.length || kpi.todayAppointments}</div>
          <div className="stat-meta">
            <span className="badge">{kpi.occupancy}% booked</span>
            room occupancy
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">New Clients</div>
          <div className="stat-value">{kpi.newCustomers}</div>
          <div className="stat-meta">walk-ins + bookings</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Points Redeemed</div>
          <div className="stat-value">{kpi.pointsRedeemed}</div>
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesTrend}>
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
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Today's Schedule</h2>
            </div>
            <div className="panel-body">
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
                        <td>{apt.time}</td>
                        <td>{apt.customerName}</td>
                        <td>{apt.serviceName}</td>
                        <td>
                          <span className="badge">{apt.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                      <td>{sale.receiptNo}</td>
                      <td>{sale.customerName}</td>
                      <td>{formatCurrency(sale.total)}</td>
                      <td>
                        <span className="badge">{sale.paymentMethod}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Loyalty Leaders</h2>
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
                  {topClients.map((client) => (
                    <tr key={client.id}>
                      <td>{client.name}</td>
                      <td>
                        <span className="badge badge-neutral">{client.membership}</span>
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
      </div>
    </div>
  )
}
