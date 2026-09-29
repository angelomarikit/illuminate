import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CalendarDays, RefreshCw } from 'lucide-react'
import { ClientsSubnav } from '../components/ClientsSubnav'
import { MembershipBadge } from '../components/MembershipBadge'
import { PageHeader } from '../components/PageHeader'
import { SessionScheduleModal } from '../components/SessionScheduleModal'
import { StatusMessage } from '../components/StatusMessage'
import { useBranch } from '../context/BranchContext'
import { normalizeMembership } from '../lib/membership'
import { isUuid } from '../lib/utils'
import { supabase } from '../lib/supabase'
import './Sessions.css'

type SessionPackage = {
  id: string
  customer_id: string | null
  customer_name: string
  service_name: string
  total_sessions: number
  sessions_used: number
  package_amount: number
  discount_amount: number
  sold_on: string
  next_session_date: string | null
  sale_receipt_no: string | null
  doctor_notes: string | null
  administered_by: string | null
  consult_by: string | null
  sales_by: string | null
  notes: string | null
  status: 'active' | 'completed' | 'cancelled'
  branch_id: string | null
}

type CustomerMembership = {
  membership: string
  membershipExpiresAt: string | null
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function Sessions() {
  const { branchId } = useBranch()
  const location = useLocation()
  const [rows, setRows] = useState<SessionPackage[]>([])
  const [membershipByCustomer, setMembershipByCustomer] = useState<
    Record<string, CustomerMembership>
  >({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'all' | 'completed'>('active')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const state = location.state as { availed?: string; receipt?: string } | null
    if (state?.availed) {
      setMessage(
        state.receipt
          ? `Service availed for ${state.availed} (${state.receipt}).`
          : `Service availed for ${state.availed}.`,
      )
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    let q = supabase
      .from('client_session_packages')
      .select('*')
      .order('next_session_date', { ascending: true, nullsFirst: false })
      .order('sold_on', { ascending: false })

    if (isUuid(branchId)) {
      q = q.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }

    const { data, error: err } = await q
    if (err) {
      setError(
        err.message.includes('client_session_packages') || err.message.includes('schema cache')
          ? `${err.message} — run supabase/add_client_sessions.sql in Supabase.`
          : err.message,
      )
      setRows([])
      setMembershipByCustomer({})
    } else {
      const packages = ((data as SessionPackage[] | null) ?? []).map((row) => ({
        ...row,
        package_amount: Number(row.package_amount ?? 0),
        discount_amount: Number(row.discount_amount ?? 0),
        total_sessions: Number(row.total_sessions ?? 0),
        sessions_used: Number(row.sessions_used ?? 0),
      }))
      setRows(packages)

      const customerIds = [
        ...new Set(packages.map((p) => p.customer_id).filter((id): id is string => Boolean(id))),
      ]
      if (customerIds.length) {
        const { data: cus } = await supabase
          .from('customers')
          .select('id, membership, membership_expires_at')
          .in('id', customerIds)
        const map: Record<string, CustomerMembership> = {}
        for (const row of cus ?? []) {
          map[row.id] = {
            membership: normalizeMembership(row.membership),
            membershipExpiresAt: row.membership_expires_at ?? null,
          }
        }
        setMembershipByCustomer(map)
      } else {
        setMembershipByCustomer({})
      }
    }
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'completed') return rows.filter((r) => r.status === 'completed')
    return rows.filter((r) => r.status === 'active')
  }, [rows, filter])

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  )

  const counts = useMemo(
    () => ({
      active: rows.filter((r) => r.status === 'active').length,
      completed: rows.filter((r) => r.status === 'completed').length,
      all: rows.length,
    }),
    [rows],
  )

  async function saveDoctorNotes(pkg: SessionPackage, notes: string) {
    setSavingId(pkg.id)
    setError('')
    const { error: err } = await supabase
      .from('client_session_packages')
      .update({
        doctor_notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pkg.id)
    setSavingId(null)
    if (err) throw new Error(err.message)
    setMessage('Doctor notes saved.')
    await load()
  }

  return (
    <div className="cs-page">
      <PageHeader
        kicker="Clients"
        title="Client sessions"
        subtitle="Schedule each visit for a package and keep pending or finished status up to date."
        actions={
          <button className="btn btn-ghost cs-refresh" type="button" onClick={() => void load()}>
            <RefreshCw size={15} />
            Refresh
          </button>
        }
      />

      <ClientsSubnav />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <section className="cs-board">
        <div className="cs-board-head">
          <div className="cs-board-intro">
            <p className="cs-kicker">Packages</p>
            <h2>
              {filtered.length} package{filtered.length === 1 ? '' : 's'}
            </h2>
          </div>

          <div className="cs-filters" role="tablist" aria-label="Filter packages">
            {(
              [
                ['active', 'Active', counts.active],
                ['completed', 'Completed', counts.completed],
                ['all', 'All', counts.all],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={`cs-filter ${filter === key ? 'is-active' : ''}`}
                onClick={() => setFilter(key)}
              >
                <span>{label}</span>
                <em>{count}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="cs-board-body">
          {loading ? (
            <div className="cs-empty">Loading sessions…</div>
          ) : filtered.length === 0 ? (
            <div className="cs-empty">
              <CalendarDays size={22} aria-hidden />
              <p>
                No {filter === 'all' ? '' : `${filter} `}session packages yet. Create them from POS
                or Avail service.
              </p>
            </div>
          ) : (
            <div className="cs-directory" role="list">
              <div className="cs-directory-cols" aria-hidden>
                <span>Client</span>
                <span>Service</span>
                <span>Progress</span>
                <span>Next visit</span>
                <span>Status</span>
                <span />
              </div>

              {filtered.map((pkg) => {
                const left = Math.max(0, pkg.total_sessions - pkg.sessions_used)
                const progress =
                  pkg.total_sessions > 0
                    ? Math.min(100, Math.round((pkg.sessions_used / pkg.total_sessions) * 100))
                    : 0
                const membership = pkg.customer_id
                  ? membershipByCustomer[pkg.customer_id]
                  : undefined

                return (
                  <button
                    key={pkg.id}
                    type="button"
                    role="listitem"
                    className={`cs-row ${selectedId === pkg.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedId(pkg.id)}
                  >
                    <div className="cs-client">
                      <span className="cs-avatar" aria-hidden>
                        {initials(pkg.customer_name)}
                      </span>
                      <div className="cs-client-copy">
                        <strong>{pkg.customer_name}</strong>
                        <div className="cs-client-meta">
                          {membership ? (
                            <MembershipBadge
                              membership={membership.membership}
                              expiresAt={membership.membershipExpiresAt}
                              showExpiry
                            />
                          ) : null}
                          {pkg.sale_receipt_no ? <span>{pkg.sale_receipt_no}</span> : null}
                        </div>
                      </div>
                    </div>

                    <div className="cs-service">
                      <strong>{pkg.service_name}</strong>
                      <span>
                        Sold {formatDisplayDate(pkg.sold_on) || pkg.sold_on}
                        {pkg.sales_by ? ` · ${pkg.sales_by}` : ''}
                      </span>
                    </div>

                    <div className="cs-progress">
                      <div className="cs-progress-top">
                        <strong>
                          {left}/{pkg.total_sessions}
                        </strong>
                        <span>{pkg.sessions_used} used</span>
                      </div>
                      <div className="cs-progress-track" aria-hidden>
                        <span style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="cs-next">
                      <strong>{formatDisplayDate(pkg.next_session_date) || 'Not set'}</strong>
                      <span>{pkg.next_session_date ? 'Next session' : 'Schedule to plan visits'}</span>
                    </div>

                    <div className="cs-status">
                      <span className={`cs-status-pill is-${pkg.status}`}>{pkg.status}</span>
                    </div>

                    <span className="cs-row-action">Schedule</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {selected ? (
        <SessionScheduleModal
          pkg={selected}
          membership={
            selected.customer_id ? membershipByCustomer[selected.customer_id] ?? null : null
          }
          open={Boolean(selected)}
          onClose={() => setSelectedId(null)}
          onSaved={(msg) => {
            setMessage(msg)
            void load()
          }}
          savingNotes={savingId === selected.id}
          onSaveDoctorNotes={(notes) => saveDoctorNotes(selected, notes)}
        />
      ) : null}
    </div>
  )
}
