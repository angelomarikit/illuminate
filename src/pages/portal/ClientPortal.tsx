import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Gift,
  HeartPulse,
  LifeBuoy,
  Sparkles,
  UserRound,
  Wallet,
} from 'lucide-react'
import { MembershipBadge } from '../../components/MembershipBadge'
import { useAuth } from '../../context/AuthContext'
import { useClientBooking } from '../../context/ClientBookingContext'
import { useLinkedCustomer } from '../../hooks/useLinkedCustomer'
import { supabase } from '../../lib/supabase'
import './portal.css'

type AppointmentRow = {
  id: string
  service_name: string
  appointment_date: string
  appointment_time: string
  status: string
  type: string
  special_note: string | null
}

type LoyaltyRow = {
  id: string
  type: string
  points: number
  amount: number | null
  note: string | null
  created_at: string
}

type SessionNoteRow = {
  id: string
  service_name: string
  doctor_notes: string | null
  sold_on: string | null
  status: string | null
  sessions_used: number | null
  total_sessions: number | null
}

type CareCommentRow = {
  id: string
  author_name: string
  body: string
  created_at: string
}

function formatTime(value: string) {
  return String(value).slice(0, 5)
}

function formatDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusClass(status: string) {
  const key = status.trim().toLowerCase()
  if (key.includes('cancel')) return 'is-cancelled'
  if (key.includes('complete') || key.includes('confirm') || key === 'active') return 'is-completed'
  return 'is-pending'
}

function PortalHero({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker: string
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <header className="portal-hero">
      <p className="portal-hero-kicker">{kicker}</p>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {actions ? <div className="portal-hero-actions">{actions}</div> : null}
    </header>
  )
}

function PortalCard({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="portal-card">
      <div className="portal-card-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="portal-card-body">{children}</div>
    </section>
  )
}

export function ClientHome() {
  const { user } = useAuth()
  const { customer, loading } = useLinkedCustomer()
  const { openBooking, bookingVersion } = useClientBooking()
  const [upcoming, setUpcoming] = useState<AppointmentRow[]>([])
  const [notes, setNotes] = useState<SessionNoteRow[]>([])
  const firstName = user?.name?.split(' ')[0] || 'there'

  useEffect(() => {
    async function loadAppts() {
      if (!customer && !user?.name) return
      const today = new Date().toISOString().slice(0, 10)
      let query = supabase
        .from('appointments')
        .select(
          'id, service_name, appointment_date, appointment_time, status, type, special_note',
        )
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true })
        .limit(5)

      if (customer?.id) {
        query = query.eq('customer_id', customer.id)
      } else if (customer?.full_name || user?.name) {
        query = query.ilike('customer_name', customer?.full_name || user?.name || '')
      }

      const { data } = await query
      setUpcoming((data as AppointmentRow[]) ?? [])
    }
    loadAppts()
  }, [customer, user, bookingVersion])

  useEffect(() => {
    async function loadNotes() {
      if (!customer?.id) {
        setNotes([])
        return
      }
      const { data } = await supabase
        .from('client_session_packages')
        .select(
          'id, service_name, doctor_notes, sold_on, status, sessions_used, total_sessions',
        )
        .eq('customer_id', customer.id)
        .not('doctor_notes', 'is', null)
        .order('sold_on', { ascending: false })
        .limit(3)
      setNotes(((data as SessionNoteRow[]) ?? []).filter((n) => n.doctor_notes?.trim()))
    }
    loadNotes()
  }, [customer])

  return (
    <div className="portal-page">
      <PortalHero
        kicker="My Illuminate"
        title={`Welcome, ${firstName}`}
        subtitle="Your personal care space — appointments, wallet, loyalty rewards, and doctor notes in one place."
        actions={
          <>
            <button type="button" className="portal-btn portal-btn-primary" onClick={openBooking}>
              Book a visit
            </button>
            <Link to="/portal/appointments" className="portal-btn portal-btn-ghost">
              View appointments
            </Link>
          </>
        }
      />

      {loading ? <div className="portal-empty">Loading your profile…</div> : null}

      {!loading && !customer ? (
        <div className="portal-alert">
          <strong>Profile not linked yet</strong>
          <p>
            Ask the clinic to link your login, or book again from the website with the same email.
            You can still message support anytime.
          </p>
        </div>
      ) : null}

      <div className="portal-stats">
        <div className="portal-stat">
          <div className="portal-stat-top">
            <span className="portal-stat-label">Loyalty points</span>
            <span className="portal-stat-icon">
              <Gift size={16} />
            </span>
          </div>
          <strong className="portal-stat-value">{customer?.points ?? 0}</strong>
        </div>
        <div className="portal-stat">
          <div className="portal-stat-top">
            <span className="portal-stat-label">Cash-in wallet</span>
            <span className="portal-stat-icon">
              <Wallet size={16} />
            </span>
          </div>
          <strong className="portal-stat-value">
            ₱{Number(customer?.cash_in_balance ?? 0).toLocaleString()}
          </strong>
        </div>
        <div className="portal-stat">
          <div className="portal-stat-top">
            <span className="portal-stat-label">Membership</span>
            <span className="portal-stat-icon">
              <Sparkles size={16} />
            </span>
          </div>
          <div className="portal-stat-value is-badge">
            {customer ? (
              <MembershipBadge
                membership={customer.membership}
                expiresAt={customer.membership_expires_at}
                showExpiry
              />
            ) : (
              '—'
            )}
          </div>
        </div>
        <div className="portal-stat">
          <div className="portal-stat-top">
            <span className="portal-stat-label">Visits</span>
            <span className="portal-stat-icon">
              <HeartPulse size={16} />
            </span>
          </div>
          <strong className="portal-stat-value">{customer?.visits ?? 0}</strong>
        </div>
      </div>

      <div className="portal-grid-2">
        <PortalCard
          title="Upcoming appointments"
          action={
            <Link to="/portal/appointments" className="portal-btn portal-btn-ghost portal-btn-sm">
              View all
            </Link>
          }
        >
          {upcoming.length === 0 ? (
            <div className="portal-empty">
              No upcoming appointments yet.
              <button type="button" className="portal-btn portal-btn-ghost portal-btn-sm" onClick={openBooking}>
                Book a visit
              </button>
            </div>
          ) : (
            <div className="portal-appt-list">
              {upcoming.map((row) => (
                <article key={row.id} className="portal-appt">
                  <div>
                    <h3 className="portal-appt-title">{row.service_name}</h3>
                    <p className="portal-appt-meta">
                      {formatDate(row.appointment_date)} · {formatTime(row.appointment_time)}
                    </p>
                  </div>
                  <span className={`portal-status ${statusClass(row.status)}`}>{row.status}</span>
                </article>
              ))}
            </div>
          )}
        </PortalCard>

        <PortalCard
          title="Doctor notes"
          action={
            <Link to="/portal/notes" className="portal-btn portal-btn-ghost portal-btn-sm">
              Open notes
            </Link>
          }
        >
          {notes.length === 0 ? (
            <div className="portal-empty">Notes from your sessions will appear here.</div>
          ) : (
            <div className="portal-note-list">
              {notes.map((note) => (
                <article key={note.id} className="portal-note">
                  <strong>{note.service_name}</strong>
                  <div className="portal-note-meta">
                    {note.sold_on ? formatDate(note.sold_on) : '—'}
                    {note.total_sessions != null
                      ? ` · ${note.sessions_used ?? 0}/${note.total_sessions} sessions`
                      : ''}
                  </div>
                  <p>{note.doctor_notes}</p>
                </article>
              ))}
            </div>
          )}
        </PortalCard>
      </div>

      <div className="portal-quick">
        <Link to="/portal/wallet" className="portal-quick-link">
          <span className="portal-stat-icon">
            <Wallet size={16} />
          </span>
          <span>Wallet & cash-in</span>
          <small>Check balance and request top-ups</small>
        </Link>
        <Link to="/portal/loyalty" className="portal-quick-link">
          <span className="portal-stat-icon">
            <Gift size={16} />
          </span>
          <span>My points</span>
          <small>Track earn and redeem activity</small>
        </Link>
        <Link to="/portal/support" className="portal-quick-link">
          <span className="portal-stat-icon">
            <LifeBuoy size={16} />
          </span>
          <span>Contact support</span>
          <small>Message the clinic team</small>
        </Link>
        <Link to="/portal/settings" className="portal-quick-link">
          <span className="portal-stat-icon">
            <UserRound size={16} />
          </span>
          <span>Profile settings</span>
          <small>Review your account details</small>
        </Link>
      </div>
    </div>
  )
}

export function ClientAppointments() {
  const { user } = useAuth()
  const { customer } = useLinkedCustomer()
  const { openBooking, bookingVersion } = useClientBooking()
  const [rows, setRows] = useState<AppointmentRow[]>([])
  const [tab, setTab] = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!customer?.id && !customer?.full_name && !user?.name && !user?.email) {
        setLoading(false)
        return
      }
      setLoading(true)
      let query = supabase
        .from('appointments')
        .select(
          'id, service_name, appointment_date, appointment_time, status, type, special_note',
        )
        .order('appointment_date', { ascending: false })
        .limit(60)

      if (customer?.id) {
        query = query.eq('customer_id', customer.id)
      } else if (user?.email) {
        query = query.ilike('customer_email', user.email)
      } else {
        query = query.ilike('customer_name', customer?.full_name || user?.name || '')
      }

      const { data } = await query
      setRows((data as AppointmentRow[]) ?? [])
      setLoading(false)
    }
    load()
  }, [customer, user, bookingVersion])

  const today = new Date().toISOString().slice(0, 10)
  const filtered = rows.filter((row) => {
    if (tab === 'all') return true
    if (tab === 'upcoming') {
      return row.appointment_date >= today && !['cancelled', 'completed'].includes(row.status)
    }
    return row.appointment_date < today || ['cancelled', 'completed'].includes(row.status)
  })

  return (
    <div className="portal-page">
      <PortalHero
        kicker="Appointments"
        title="My appointments"
        subtitle="Stay on top of pending, confirmed, completed, and cancelled visits."
        actions={
          <button type="button" className="portal-btn portal-btn-primary" onClick={openBooking}>
            Book again
          </button>
        }
      />

      <div className="portal-tabs">
        {(
          [
            ['upcoming', 'Upcoming'],
            ['past', 'Past'],
            ['all', 'All'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`portal-tab${tab === key ? ' is-active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <PortalCard title={`${filtered.length} booking${filtered.length === 1 ? '' : 's'}`}>
        {loading ? (
          <div className="portal-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="portal-empty">
            No appointments in this list yet.
            <button type="button" className="portal-btn portal-btn-ghost portal-btn-sm" onClick={openBooking}>
              Book a visit
            </button>
          </div>
        ) : (
          <div className="portal-appt-list">
            {filtered.map((row) => (
              <article key={row.id} className="portal-appt">
                <div>
                  <h3 className="portal-appt-title">{row.service_name}</h3>
                  <p className="portal-appt-meta">
                    {formatDate(row.appointment_date)} · {formatTime(row.appointment_time)}
                    {row.special_note ? ` · ${row.special_note}` : ''}
                  </p>
                </div>
                <span className={`portal-status ${statusClass(row.status)}`}>{row.status}</span>
              </article>
            ))}
          </div>
        )}
      </PortalCard>
    </div>
  )
}

export function ClientServices() {
  const { customer } = useLinkedCustomer()
  const [packages, setPackages] = useState<SessionNoteRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!customer?.id) {
        setPackages([])
        setLoading(false)
        return
      }
      setLoading(true)
      const { data } = await supabase
        .from('client_session_packages')
        .select(
          'id, service_name, doctor_notes, sold_on, status, sessions_used, total_sessions',
        )
        .eq('customer_id', customer.id)
        .order('sold_on', { ascending: false })
        .limit(40)
      setPackages((data as SessionNoteRow[]) ?? [])
      setLoading(false)
    }
    load()
  }, [customer])

  return (
    <div className="portal-page">
      <PortalHero
        kicker="My packages"
        title="Session packages"
        subtitle="Treatments purchased at the clinic and how many sessions you have left."
      />

      <PortalCard title="Your packages">
        {loading ? (
          <div className="portal-empty">Loading…</div>
        ) : !customer ? (
          <div className="portal-empty">Link your customer profile to see packages.</div>
        ) : packages.length === 0 ? (
          <div className="portal-empty">No session packages yet.</div>
        ) : (
          <div className="portal-appt-list">
            {packages.map((row) => (
              <article key={row.id} className="portal-appt">
                <div>
                  <h3 className="portal-appt-title">{row.service_name}</h3>
                  <p className="portal-appt-meta">
                    Sold {row.sold_on ? formatDate(row.sold_on) : '—'} · {row.sessions_used ?? 0}/
                    {row.total_sessions ?? 0} sessions used
                  </p>
                </div>
                <span className={`portal-status ${statusClass(row.status || 'active')}`}>
                  {row.status || 'active'}
                </span>
              </article>
            ))}
          </div>
        )}
      </PortalCard>
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
    <div className="portal-page">
      <PortalHero
        kicker="Loyalty"
        title="My points"
        subtitle="Earn rewards with every visit. Redeem points toward services at the clinic."
      />

      <div className="portal-stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <div className="portal-stat">
          <div className="portal-stat-top">
            <span className="portal-stat-label">Points balance</span>
            <span className="portal-stat-icon">
              <Gift size={16} />
            </span>
          </div>
          <strong className="portal-stat-value">{customer?.points ?? 0}</strong>
        </div>
        <div className="portal-stat">
          <div className="portal-stat-top">
            <span className="portal-stat-label">Cash-in wallet</span>
            <span className="portal-stat-icon">
              <Wallet size={16} />
            </span>
          </div>
          <strong className="portal-stat-value">
            ₱{Number(customer?.cash_in_balance ?? 0).toLocaleString()}
          </strong>
        </div>
      </div>

      <PortalCard title="Recent activity">
        {loading ? (
          <div className="portal-empty">Loading…</div>
        ) : !customer ? (
          <div className="portal-empty">Link your customer profile to see loyalty history.</div>
        ) : txns.length === 0 ? (
          <div className="portal-empty">No loyalty transactions yet.</div>
        ) : (
          <div className="portal-table-wrap">
            <table className="portal-table">
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
                    <td style={{ textTransform: 'capitalize' }}>{txn.type}</td>
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
      </PortalCard>
    </div>
  )
}

export function ClientWallet() {
  const { user } = useAuth()
  const { customer, loading } = useLinkedCustomer()
  const [txns, setTxns] = useState<LoyaltyRow[]>([])
  const [cashInNote, setCashInNote] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)

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
        .ilike('type', '%cash%')
        .order('created_at', { ascending: false })
        .limit(20)
      setTxns((data as LoyaltyRow[]) ?? [])
    }
    load()
  }, [customer])

  async function requestCashIn(e: FormEvent) {
    e.preventDefault()
    const pesos = Number(amount)
    if (!Number.isFinite(pesos) || pesos <= 0) {
      setStatus('Enter a valid cash-in amount.')
      return
    }
    setSending(true)
    setStatus('')

    const customerName = customer?.full_name || user?.name || 'Client'
    if (!user?.id) {
      setSending(false)
      setStatus('Sign in required.')
      return
    }
    const body = [
      `Cash-in request: ₱${pesos.toLocaleString()}`,
      cashInNote.trim() ? `Note: ${cashInNote.trim()}` : null,
      `Email: ${user?.email || customer?.email || '—'}`,
      `Phone: ${customer?.phone || '—'}`,
    ]
      .filter(Boolean)
      .join('\n')

    const { data: thread, error: threadError } = await supabase
      .from('chat_threads')
      .insert({
        customer_name: customerName,
        preview: `Cash-in ₱${pesos.toLocaleString()}`.slice(0, 120),
        unread: 1,
        user_id: user.id,
        customer_id: customer?.id ?? null,
        category: 'cashin',
        priority: 'high',
      })
      .select('id')
      .single()

    if (threadError || !thread) {
      setSending(false)
      setStatus(threadError?.message || 'Could not send cash-in request.')
      return
    }

    const { error: msgError } = await supabase.from('chat_messages').insert({
      thread_id: thread.id,
      sender: 'customer',
      body,
      kind: 'cashin',
      cashin_status: 'pending',
    })

    setSending(false)
    if (msgError) {
      setStatus(msgError.message)
      return
    }

    setAmount('')
    setCashInNote('')
    setStatus('Request sent. Reception will confirm your cash-in at the clinic.')
  }

  return (
    <div className="portal-page">
      <PortalHero
        kicker="Wallet"
        title="Cash-in balance"
        subtitle="Use wallet funds for services at the clinic. Request a cash-in and settle at the front desk."
      />

      <div className="portal-stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <div className="portal-stat">
          <div className="portal-stat-top">
            <span className="portal-stat-label">Available balance</span>
            <span className="portal-stat-icon">
              <Wallet size={16} />
            </span>
          </div>
          <strong className="portal-stat-value">
            ₱{Number(customer?.cash_in_balance ?? 0).toLocaleString()}
          </strong>
        </div>
        <div className="portal-stat">
          <div className="portal-stat-top">
            <span className="portal-stat-label">Loyalty points</span>
            <span className="portal-stat-icon">
              <Gift size={16} />
            </span>
          </div>
          <strong className="portal-stat-value">{customer?.points ?? 0}</strong>
        </div>
      </div>

      <div className="portal-grid-2">
        <PortalCard title="Request cash-in">
          <form className="portal-form" onSubmit={requestCashIn}>
            <div>
              <label htmlFor="cash-in-amount">Amount (₱)</label>
              <input
                id="cash-in-amount"
                className="input"
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="cash-in-note">Note (optional)</label>
              <textarea
                id="cash-in-note"
                className="textarea"
                rows={3}
                value={cashInNote}
                onChange={(e) => setCashInNote(e.target.value)}
                placeholder="Preferred payment method, visit date, etc."
              />
            </div>
            <div className="portal-form-actions">
              <button
                className="portal-btn portal-btn-primary"
                type="submit"
                disabled={sending || loading}
              >
                {sending ? 'Sending…' : 'Send request'}
              </button>
              {status ? <span className="portal-form-status">{status}</span> : null}
            </div>
          </form>
        </PortalCard>

        <PortalCard title="Cash-in activity">
          {!customer ? (
            <div className="portal-empty">Link your profile to see wallet activity.</div>
          ) : txns.length === 0 ? (
            <div className="portal-empty">No cash-in transactions yet.</div>
          ) : (
            <div className="portal-txn-list">
              {txns.map((txn) => (
                <article key={txn.id} className="portal-note">
                  <strong>
                    {txn.amount != null ? `₱${Number(txn.amount).toLocaleString()}` : txn.type}
                  </strong>
                  <div className="portal-note-meta">
                    {new Date(txn.created_at).toLocaleString()} · {txn.type}
                  </div>
                  {txn.note ? <p>{txn.note}</p> : null}
                </article>
              ))}
            </div>
          )}
        </PortalCard>
      </div>
    </div>
  )
}

export function ClientNotes() {
  const { customer, loading } = useLinkedCustomer()
  const [packages, setPackages] = useState<SessionNoteRow[]>([])
  const [comments, setComments] = useState<CareCommentRow[]>([])

  useEffect(() => {
    async function load() {
      if (!customer?.id) {
        setPackages([])
        setComments([])
        return
      }
      const [pkgRes, commentRes] = await Promise.all([
        supabase
          .from('client_session_packages')
          .select(
            'id, service_name, doctor_notes, sold_on, status, sessions_used, total_sessions',
          )
          .eq('customer_id', customer.id)
          .order('sold_on', { ascending: false })
          .limit(40),
        supabase
          .from('client_care_comments')
          .select('id, author_name, body, created_at')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(40),
      ])
      setPackages(
        ((pkgRes.data as SessionNoteRow[]) ?? []).filter((p) => p.doctor_notes?.trim()),
      )
      setComments((commentRes.data as CareCommentRow[]) ?? [])
    }
    load()
  }, [customer])

  return (
    <div className="portal-page">
      <PortalHero
        kicker="Care notes"
        title="Doctor notes"
        subtitle="Personalized advice from your clinicians after each visit."
      />

      {loading ? <div className="portal-empty">Loading…</div> : null}

      <div className="portal-grid-2">
        <PortalCard title="Session doctor notes">
          {!customer ? (
            <div className="portal-empty">Link your profile to see notes.</div>
          ) : packages.length === 0 ? (
            <div className="portal-empty">No doctor notes recorded yet.</div>
          ) : (
            <div className="portal-note-list">
              {packages.map((pkg) => (
                <article key={pkg.id} className="portal-note">
                  <strong>{pkg.service_name}</strong>
                  <div className="portal-note-meta">
                    {pkg.sold_on ? formatDate(pkg.sold_on) : '—'}
                    {pkg.total_sessions != null
                      ? ` · ${pkg.sessions_used ?? 0}/${pkg.total_sessions} sessions`
                      : ''}
                  </div>
                  <p>{pkg.doctor_notes}</p>
                </article>
              ))}
            </div>
          )}
        </PortalCard>

        <PortalCard title="Care comments">
          {!customer ? (
            <div className="portal-empty">Link your profile to see care comments.</div>
          ) : comments.length === 0 ? (
            <div className="portal-empty">No care comments yet.</div>
          ) : (
            <div className="portal-note-list">
              {comments.map((c) => (
                <article key={c.id} className="portal-note">
                  <strong>{c.author_name}</strong>
                  <div className="portal-note-meta">
                    {new Date(c.created_at).toLocaleString()}
                  </div>
                  <p>{c.body}</p>
                </article>
              ))}
            </div>
          )}
        </PortalCard>
      </div>
    </div>
  )
}

export function ClientSupport() {
  const { user } = useAuth()
  const { customer } = useLinkedCustomer()
  const [threads, setThreads] = useState<
    Array<{
      id: string
      preview: string | null
      category: string
      priority: string
      updated_at: string
    }>
  >([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<
    Array<{
      id: string
      sender: string
      body: string | null
      image_url?: string | null
      kind?: string | null
      cashin_status?: string | null
      created_at: string
    }>
  >([])
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadThreads = useCallback(async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('chat_threads')
      .select('id, preview, category, priority, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    if (error) {
      setStatus(
        error.message.includes('user_id')
          ? `${error.message} — ask clinic to run add_chat_conversation_tags.sql`
          : error.message,
      )
      setLoading(false)
      return
    }
    const list = data ?? []
    setThreads(list)
    setActiveId((prev) => (prev && list.some((t) => t.id === prev) ? prev : list[0]?.id ?? null))
    setLoading(false)
  }, [user?.id])

  const loadMessages = useCallback(async (threadId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, sender, body, image_url, kind, cashin_status, created_at')
      .eq('thread_id', threadId)
      .order('created_at')
    setMessages(data ?? [])
  }, [])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (activeId) void loadMessages(activeId)
    else setMessages([])
  }, [activeId, loadMessages])

  async function sendSupport(e: FormEvent) {
    e.preventDefault()
    if (!message.trim() || !user?.id) return
    setSending(true)
    setStatus('')

    const customerName = customer?.full_name || user?.name || 'Client'
    let threadId = activeId

    if (!threadId) {
      const { data: thread, error: threadError } = await supabase
        .from('chat_threads')
        .insert({
          customer_name: customerName,
          preview: message.trim().slice(0, 120),
          unread: 1,
          user_id: user.id,
          customer_id: customer?.id ?? null,
          category: 'support',
          priority: 'normal',
        })
        .select('id')
        .single()

      if (threadError || !thread) {
        setSending(false)
        setStatus(threadError?.message || 'Could not start support chat.')
        return
      }
      threadId = thread.id
      setActiveId(thread.id)
    }

    const { error: msgError } = await supabase.from('chat_messages').insert({
      thread_id: threadId,
      sender: 'customer',
      body: message.trim(),
      kind: 'message',
    })

    if (msgError) {
      setSending(false)
      setStatus(msgError.message)
      return
    }

    await supabase
      .from('chat_threads')
      .update({
        preview: message.trim().slice(0, 120),
        unread: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId)

    setMessage('')
    setSending(false)
    setStatus('Message sent. Replies will appear in this conversation.')
    await loadThreads()
    await loadMessages(threadId)
  }

  return (
    <div className="portal-page">
      <PortalHero
        kicker="Support"
        title="Chat with the clinic"
        subtitle="Send a message and read staff replies in the same conversation."
      />

      <PortalCard title="Your conversations">
        {loading ? (
          <div className="portal-empty">Loading…</div>
        ) : threads.length === 0 ? (
          <div className="portal-empty">No conversations yet — write a message below to start.</div>
        ) : (
          <div className="portal-note-list" style={{ marginBottom: 16 }}>
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                className="portal-note"
                style={{
                  textAlign: 'left',
                  width: '100%',
                  cursor: 'pointer',
                  border:
                    t.id === activeId ? '1px solid rgba(184,149,74,0.55)' : '1px solid transparent',
                }}
                onClick={() => setActiveId(t.id)}
              >
                <strong>
                  {(t.category || 'support').toUpperCase()} · {(t.priority || 'normal').toUpperCase()}
                </strong>
                <div className="portal-note-meta">{new Date(t.updated_at).toLocaleString()}</div>
                <p>{t.preview || 'Conversation'}</p>
              </button>
            ))}
          </div>
        )}

        <div className="portal-note-list" style={{ marginBottom: 16, maxHeight: 360, overflow: 'auto' }}>
          {messages.length === 0 ? (
            <div className="portal-empty">No messages in this thread yet.</div>
          ) : (
            messages.map((m) => (
              <article key={m.id} className="portal-note">
                <strong>{m.sender === 'staff' ? 'Clinic' : 'You'}</strong>
                <div className="portal-note-meta">{new Date(m.created_at).toLocaleString()}</div>
                {m.body ? <p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p> : null}
                {m.image_url ? (
                  <p>
                    <a href={m.image_url} target="_blank" rel="noreferrer">
                      View attachment
                    </a>
                  </p>
                ) : null}
                {m.kind === 'cashin' && m.cashin_status ? (
                  <div className="portal-note-meta">Cash-in: {m.cashin_status.replace('_', ' ')}</div>
                ) : null}
              </article>
            ))
          )}
        </div>

        <form className="portal-form" onSubmit={sendSupport}>
          <div>
            <label htmlFor="support-message">Your message</label>
            <textarea
              id="support-message"
              className="textarea"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask about appointments, packages, points, or aftercare…"
              required
            />
          </div>
          <div className="portal-form-actions">
            <button className="portal-btn portal-btn-primary" type="submit" disabled={sending}>
              {sending ? 'Sending…' : activeId ? 'Send reply' : 'Start conversation'}
            </button>
            {status ? <span className="portal-form-status">{status}</span> : null}
          </div>
        </form>
      </PortalCard>
    </div>
  )
}

export function ClientSettings() {
  const { user } = useAuth()
  const { customer, loading } = useLinkedCustomer()

  return (
    <div className="portal-page">
      <PortalHero
        kicker="Profile"
        title="My settings"
        subtitle="Your Client portal account details. Clinic staff cannot open these pages."
      />

      <PortalCard title="Account details">
        {loading ? (
          <div className="portal-empty">Loading…</div>
        ) : (
          <div className="portal-profile-grid">
            <div className="portal-profile-row">
              <span>Account name</span>
              <strong>{user?.name}</strong>
            </div>
            <div className="portal-profile-row">
              <span>Email</span>
              <strong>{user?.email}</strong>
            </div>
            <div className="portal-profile-row">
              <span>Linked customer</span>
              <strong>{customer?.full_name ?? 'Not linked yet'}</strong>
            </div>
            <div className="portal-profile-row">
              <span>Phone</span>
              <strong>{customer?.phone ?? '—'}</strong>
            </div>
            <div className="portal-profile-row">
              <span>Membership</span>
              <strong>
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
            <div className="portal-profile-row">
              <span>Points / wallet</span>
              <strong>
                {customer?.points ?? 0} pts · ₱
                {Number(customer?.cash_in_balance ?? 0).toLocaleString()}
              </strong>
            </div>
            <p className="portal-form-status" style={{ margin: 0 }}>
              To update personal details, message support or ask Reception at your next visit.
            </p>
          </div>
        )}
      </PortalCard>
    </div>
  )
}
