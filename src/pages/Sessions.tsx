import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { CareNotesPanel } from '../components/CareNotesPanel'
import { MembershipBadge } from '../components/MembershipBadge'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useBranch } from '../context/BranchContext'
import { normalizeMembership } from '../lib/membership'
import { formatCurrency, isUuid } from '../lib/utils'
import { supabase } from '../lib/supabase'

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

export function Sessions() {
  const { branchId } = useBranch()
  const [rows, setRows] = useState<SessionPackage[]>([])
  const [membershipByCustomer, setMembershipByCustomer] = useState<
    Record<string, CustomerMembership>
  >({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'all' | 'completed'>('active')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'completed') return rows.filter((r) => r.status === 'completed')
    return rows.filter((r) => r.status === 'active')
  }, [rows, filter])

  async function useSession(pkg: SessionPackage) {
    if (pkg.status !== 'active') return
    const left = pkg.total_sessions - pkg.sessions_used
    if (left <= 0) return

    setSavingId(pkg.id)
    setError('')
    const nextUsed = pkg.sessions_used + 1
    const completed = nextUsed >= pkg.total_sessions
    const { error: err } = await supabase
      .from('client_session_packages')
      .update({
        sessions_used: nextUsed,
        status: completed ? 'completed' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', pkg.id)
    setSavingId(null)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(
      completed
        ? `${pkg.customer_name} finished all sessions for ${pkg.service_name}.`
        : `Session used for ${pkg.customer_name}. ${pkg.total_sessions - nextUsed} left.`,
    )
    await load()
  }

  async function saveNextSession(pkg: SessionPackage, date: string) {
    setSavingId(pkg.id)
    setError('')
    const { error: err } = await supabase
      .from('client_session_packages')
      .update({
        next_session_date: date || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pkg.id)
    setSavingId(null)
    if (err) {
      setError(err.message)
      return
    }
    setMessage('Next session date saved.')
    await load()
  }

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
    <div>
      <PageHeader
        kicker="Clinic"
        title="Client Sessions"
        subtitle="Track session packages, staff attribution, doctor notes, and remaining visits."
        actions={
          <button className="btn btn-ghost" type="button" onClick={() => load()}>
            Refresh
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="chips" style={{ marginBottom: 16 }}>
        {(
          [
            ['active', 'Active'],
            ['completed', 'Completed'],
            ['all', 'All'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`chip ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Session packages</h2>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading sessions…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              No session packages yet. When checking out in POS, set sessions advised and package
              amount under a service.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Service</th>
                    <th>Sold on</th>
                    <th>Next session</th>
                    <th>Sessions left</th>
                    <th>Sales by</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pkg) => {
                    const left = Math.max(0, pkg.total_sessions - pkg.sessions_used)
                    const open = expandedId === pkg.id
                    return (
                      <Fragment key={pkg.id}>
                        <tr>
                          <td>
                            <button
                              type="button"
                              className="btn-link"
                              style={{
                                background: 'none',
                                border: 0,
                                padding: 0,
                                cursor: 'pointer',
                                color: 'inherit',
                                textAlign: 'left',
                                font: 'inherit',
                              }}
                              onClick={() => setExpandedId(open ? null : pkg.id)}
                            >
                              <strong>{pkg.customer_name}</strong>
                            </button>
                            {pkg.customer_id && membershipByCustomer[pkg.customer_id] ? (
                              <div style={{ marginTop: 4 }}>
                                <MembershipBadge
                                  membership={membershipByCustomer[pkg.customer_id].membership}
                                  expiresAt={
                                    membershipByCustomer[pkg.customer_id].membershipExpiresAt
                                  }
                                  showExpiry
                                />
                              </div>
                            ) : null}
                            {pkg.sale_receipt_no ? (
                              <div className="muted" style={{ fontSize: '0.78rem' }}>
                                {pkg.sale_receipt_no}
                              </div>
                            ) : null}
                          </td>
                          <td>{pkg.service_name}</td>
                          <td>{pkg.sold_on}</td>
                          <td>
                            <input
                              className="input"
                              type="date"
                              style={{ height: 34, minWidth: 140 }}
                              value={pkg.next_session_date ?? ''}
                              disabled={pkg.status !== 'active' || savingId === pkg.id}
                              onChange={(e) => saveNextSession(pkg, e.target.value)}
                            />
                          </td>
                          <td>
                            <strong>
                              {left} / {pkg.total_sessions}
                            </strong>
                            <div className="muted" style={{ fontSize: '0.78rem' }}>
                              Used {pkg.sessions_used}
                            </div>
                          </td>
                          <td>{pkg.sales_by || '—'}</td>
                          <td>
                            <span
                              className={`badge ${
                                pkg.status === 'active'
                                  ? 'badge-success'
                                  : pkg.status === 'completed'
                                    ? 'badge-neutral'
                                    : 'badge-warning'
                              }`}
                            >
                              {pkg.status}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => setExpandedId(open ? null : pkg.id)}
                            >
                              {open ? 'Hide' : 'Details'}
                            </button>{' '}
                            {pkg.status === 'active' && left > 0 ? (
                              <button
                                className="btn btn-primary btn-sm"
                                type="button"
                                disabled={savingId === pkg.id}
                                onClick={() => useSession(pkg)}
                              >
                                {savingId === pkg.id ? 'Saving…' : 'Use 1 session'}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                        {open ? (
                          <tr>
                            <td colSpan={8}>
                              <div
                                style={{
                                  display: 'grid',
                                  gap: 14,
                                  padding: '8px 4px 12px',
                                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)',
                                }}
                              >
                                <div style={{ display: 'grid', gap: 8, fontSize: '0.92rem' }}>
                                  <div>
                                    <strong>Package amount:</strong>{' '}
                                    {formatCurrency(pkg.package_amount)}
                                  </div>
                                  <div>
                                    <strong>Discount:</strong>{' '}
                                    {formatCurrency(pkg.discount_amount || 0)}
                                  </div>
                                  <div>
                                    <strong>Administered by:</strong> {pkg.administered_by || '—'}
                                  </div>
                                  <div>
                                    <strong>Consult by:</strong> {pkg.consult_by || '—'}
                                  </div>
                                  <div>
                                    <strong>Sales by:</strong> {pkg.sales_by || '—'}
                                  </div>
                                </div>
                                <CareNotesPanel
                                  customerId={pkg.customer_id}
                                  sessionPackageId={pkg.id}
                                  doctorNotes={pkg.doctor_notes ?? ''}
                                  savingNotes={savingId === pkg.id}
                                  compact
                                  onSaveDoctorNotes={(notes) => saveDoctorNotes(pkg, notes)}
                                />
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
