import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MembershipBadge } from '../../components/MembershipBadge'
import { PageHeader } from '../../components/PageHeader'
import { useAuth } from '../../context/AuthContext'
import { useLinkedCustomer } from '../../hooks/useLinkedCustomer'
import { supabase } from '../../lib/supabase'

type AppointmentRow = {
  id: string
  service_name: string
  appointment_date: string
  appointment_time: string
  status: string
  type: string
}

type LoyaltyRow = {
  id: string
  type: string
  points: number
  amount: number | null
  note: string | null
  created_at: string
}

export function ClientHome() {
  const { user } = useAuth()
  const { customer, loading } = useLinkedCustomer()
  const [upcoming, setUpcoming] = useState<AppointmentRow[]>([])

  useEffect(() => {
    async function loadAppts() {
      const name = customer?.full_name || user?.name
      if (!name) return
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('appointments')
        .select('id, service_name, appointment_date, appointment_time, status, type')
        .ilike('customer_name', name)
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true })
        .limit(5)
      setUpcoming((data as AppointmentRow[]) ?? [])
    }
    loadAppts()
  }, [customer, user])

  return (
    <div>
      <PageHeader
        kicker="Client portal"
        title={`Welcome, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle="View your care plan, points, and support. This same account is ready for the Expo mobile app later."
      />

      {loading ? <div className="empty-state">Loading your profile…</div> : null}

      {!loading && !customer ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-body">
            <strong>Profile not linked yet</strong>
            <p style={{ marginTop: 8, color: 'var(--muted)' }}>
              Ask the clinic to link your login to your customer record. You can still message support.
            </p>
          </div>
        </div>
      ) : null}

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <div className="stat-card">
          <span>Loyalty points</span>
          <strong>{customer?.points ?? 0}</strong>
        </div>
        <div className="stat-card">
          <span>Cash-in wallet</span>
          <strong>₱{Number(customer?.cash_in_balance ?? 0).toLocaleString()}</strong>
        </div>
        <div className="stat-card">
          <span>Membership</span>
          <strong style={{ display: 'block', marginTop: 6 }}>
            {customer ? (
              <MembershipBadge
                membership={customer.membership}
                expiresAt={customer.membership_expires_at}
                showExpiry
              />
            ) : (
              '—'
            )}
          </strong>
        </div>
        <div className="stat-card">
          <span>Visits</span>
          <strong>{customer?.visits ?? 0}</strong>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2 className="panel-title">Upcoming services</h2>
          <Link to="/portal/services" className="btn btn-ghost btn-sm">
            View all
          </Link>
        </div>
        <div className="panel-body">
          {upcoming.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>
              No upcoming appointments yet.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.service_name}</strong>
                        <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{row.type}</div>
                      </td>
                      <td>{row.appointment_date}</td>
                      <td>{String(row.appointment_time).slice(0, 5)}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/portal/loyalty" className="btn btn-primary btn-sm">
          My points
        </Link>
        <Link to="/portal/support" className="btn btn-ghost btn-sm">
          Contact support
        </Link>
        <Link to="/portal/settings" className="btn btn-ghost btn-sm">
          Profile settings
        </Link>
      </div>
    </div>
  )
}

export function ClientServices() {
  const { user } = useAuth()
  const { customer } = useLinkedCustomer()
  const [rows, setRows] = useState<AppointmentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const name = customer?.full_name || user?.name
      if (!name) {
        setLoading(false)
        return
      }
      setLoading(true)
      const { data } = await supabase
        .from('appointments')
        .select('id, service_name, appointment_date, appointment_time, status, type')
        .ilike('customer_name', name)
        .order('appointment_date', { ascending: false })
        .limit(40)
      setRows((data as AppointmentRow[]) ?? [])
      setLoading(false)
    }
    load()
  }, [customer, user])

  return (
    <div>
      <PageHeader
        kicker="My services"
        title="Service requests"
        subtitle="Appointments and walk-ins linked to your profile."
      />

      <div className="panel">
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">No service requests found yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.service_name}</td>
                      <td>{row.appointment_date}</td>
                      <td>{String(row.appointment_time).slice(0, 5)}</td>
                      <td>{row.type}</td>
                      <td>{row.status}</td>
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

export function ClientLoyalty() {
  const { customer, loading } = useLinkedCustomer()
  const [txns, setTxns] = useState<LoyaltyRow[]>([])

  useEffect(() => {
    async function load() {
      if (!customer) {
        setTxns([])
        return
      }
      const { data } = await supabase
        .from('loyalty_transactions')
        .select('id, type, points, amount, note, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(30)
      setTxns((data as LoyaltyRow[]) ?? [])
    }
    load()
  }, [customer])

  return (
    <div>
      <PageHeader
        kicker="Loyalty"
        title="My points & wallet"
        subtitle="Track earn, redeem, and cash-in activity."
      />

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <div className="stat-card">
          <span>Points balance</span>
          <strong>{customer?.points ?? 0}</strong>
        </div>
        <div className="stat-card">
          <span>Cash-in wallet</span>
          <strong>₱{Number(customer?.cash_in_balance ?? 0).toLocaleString()}</strong>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : !customer ? (
            <div className="empty-state">Link your customer profile to see loyalty history.</div>
          ) : txns.length === 0 ? (
            <div className="empty-state">No loyalty transactions yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>Points</th>
                    <th>Amount</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((txn) => (
                    <tr key={txn.id}>
                      <td>{new Date(txn.created_at).toLocaleString()}</td>
                      <td>{txn.type}</td>
                      <td>{txn.points}</td>
                      <td>
                        {txn.amount != null ? `₱${Number(txn.amount).toLocaleString()}` : '—'}
                      </td>
                      <td>{txn.note || '—'}</td>
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

export function ClientSupport() {
  const { user } = useAuth()
  const { customer } = useLinkedCustomer()
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)

  async function sendSupport(e: FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    setStatus('')

    const customerName = customer?.full_name || user?.name || 'Client'
    const { data: thread, error: threadError } = await supabase
      .from('chat_threads')
      .insert({
        customer_name: customerName,
        preview: message.trim().slice(0, 120),
        unread: 1,
      })
      .select('id')
      .single()

    if (threadError || !thread) {
      setSending(false)
      setStatus(threadError?.message || 'Could not start support chat.')
      return
    }

    const { error: msgError } = await supabase.from('chat_messages').insert({
      thread_id: thread.id,
      sender: 'customer',
      body: message.trim(),
    })

    setSending(false)
    if (msgError) {
      setStatus(msgError.message)
      return
    }

    setMessage('')
    setStatus('Message sent. Our team will reply in Chat Support.')
  }

  return (
    <div>
      <PageHeader
        kicker="Support"
        title="Contact customer support"
        subtitle="Send a message to the clinic team."
      />

      <div className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-body">
          <form onSubmit={sendSupport}>
            <label htmlFor="support-message">Your message</label>
            <textarea
              id="support-message"
              className="textarea"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask about appointments, packages, points, or aftercare…"
              required
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn btn-primary btn-sm" type="submit" disabled={sending}>
                {sending ? 'Sending…' : 'Send message'}
              </button>
              {status ? <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{status}</span> : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export function ClientSettings() {
  const { user } = useAuth()
  const { customer, loading } = useLinkedCustomer()

  return (
    <div>
      <PageHeader
        kicker="Profile"
        title="My settings"
        subtitle="Account details shared with the future Expo mobile app."
      />

      <div className="panel" style={{ maxWidth: 520 }}>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Account name</div>
                <strong>{user?.name}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Email</div>
                <strong>{user?.email}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Role</div>
                <strong>{user?.role}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Linked customer</div>
                <strong>{customer?.full_name ?? 'Not linked yet'}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Phone</div>
                <strong>{customer?.phone ?? '—'}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Membership</div>
                {customer ? (
                  <MembershipBadge
                    membership={customer.membership}
                    expiresAt={customer.membership_expires_at}
                    showExpiry
                  />
                ) : (
                  <strong>—</strong>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
