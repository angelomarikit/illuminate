import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { type AppRole, normalizeRole } from '../lib/roles'
import {
  type DutyStatus,
  type EmploymentStatus,
  type LeaveType,
  creditColumnForLeave,
  creditKeyForLeave,
  formatHours,
  hoursBetween,
  leaveDays,
  todayDateString,
} from '../lib/staffHr'
import { supabase } from '../lib/supabase'

type AccountRow = {
  id: string
  full_name: string
  email: string | null
  role: AppRole
  employment_status: EmploymentStatus
  duty_status: DutyStatus
  leave_credits_vacation: number
  leave_credits_sick: number
  leave_credits_personal: number
  leave_credits_emergency: number
}

type LeaveRow = {
  id: string
  profile_id: string | null
  staff_name: string
  leave_type: LeaveType
  date_from: string
  date_to: string
  days: number
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
}

type AttendanceRow = {
  id: string
  profile_id: string | null
  time_in: string | null
  time_out: string | null
}

type RoleChangePending = {
  account: AccountRow
  nextRole: AppRole
}

const ROLE_ACCESS: Record<AppRole, string> = {
  Owner: 'Full access — dashboard, HR approvals, settings, and all clinic tools.',
  Admin: 'Elevated access — dashboard, HR approvals, settings, and all clinic tools.',
  Staff: 'Clinic operations — POS, bookings, inventory, expenses, chat, and My Work.',
  Client: 'Client portal only — services, loyalty points, support, and profile.',
}

export function Staff() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [leaves, setLeaves] = useState<LeaveRow[]>([])
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [roleChange, setRoleChange] = useState<RoleChangePending | null>(null)
  const [roleSaving, setRoleSaving] = useState(false)

  const load = useCallback(async () => {
    const today = todayDateString()
    const [{ data: profileData, error: profileErr }, { data: leaveData }, { data: attData }] =
      await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, full_name, email, role, employment_status, duty_status, leave_credits_vacation, leave_credits_sick, leave_credits_personal, leave_credits_emergency',
          )
          .order('full_name'),
        supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('attendance').select('id, profile_id, time_in, time_out').eq('work_date', today),
      ])

    if (profileErr) {
      setError(profileErr.message)
      return
    }

    setAccounts(
      ((profileData as AccountRow[] | null) ?? []).map((row) => ({
        ...row,
        role: normalizeRole(row.role),
        employment_status: row.employment_status || 'probation',
        duty_status: row.duty_status || 'off-duty',
        leave_credits_vacation: Number(row.leave_credits_vacation ?? 0),
        leave_credits_sick: Number(row.leave_credits_sick ?? 0),
        leave_credits_personal: Number(row.leave_credits_personal ?? 0),
        leave_credits_emergency: Number(row.leave_credits_emergency ?? 0),
      })),
    )
    setLeaves((leaveData as LeaveRow[]) ?? [])
    setAttendance((attData as AttendanceRow[]) ?? [])
    setError('')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!roleChange) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !roleSaving) setRoleChange(null)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [roleChange, roleSaving])

  async function patchAccount(id: string, patch: Record<string, unknown>, success: string) {
    const { error: err } = await supabase.from('profiles').update(patch).eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(success)
    await load()
  }

  function requestRoleChange(account: AccountRow, nextRole: AppRole) {
    if (nextRole === account.role) return
    setError('')
    setRoleChange({ account, nextRole })
  }

  function closeRoleModal() {
    if (roleSaving) return
    setRoleChange(null)
  }

  async function confirmRoleChange() {
    if (!roleChange) return
    setRoleSaving(true)
    setError('')
    const { account, nextRole } = roleChange
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: nextRole })
      .eq('id', account.id)
    setRoleSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setRoleChange(null)
    setMessage(
      `Role updated: ${account.full_name} is now ${nextRole}. They should log out and back in to refresh pages.`,
    )
    await load()
  }

  async function setLeaveStatus(leave: LeaveRow, status: 'approved' | 'rejected') {
    setSaving(true)
    setError('')

    if (status === 'approved' && leave.profile_id) {
      const member = accounts.find((a) => a.id === leave.profile_id)
      if (member) {
        const key = creditKeyForLeave(leave.leave_type)
        const column = creditColumnForLeave(leave.leave_type)
        const current = {
          vacation: member.leave_credits_vacation,
          sick: member.leave_credits_sick,
          personal: member.leave_credits_personal,
          emergency: member.leave_credits_emergency,
        }[key]
        const days = leave.days || leaveDays(leave.date_from, leave.date_to)
        if (current < days) {
          setSaving(false)
          setError(`Not enough ${leave.leave_type} credits (${current} left, needs ${days}).`)
          return
        }
        const { error: creditErr } = await supabase
          .from('profiles')
          .update({ [column]: current - days })
          .eq('id', member.id)
        if (creditErr) {
          setSaving(false)
          setError(creditErr.message)
          return
        }

        const today = todayDateString()
        if (leave.date_from <= today && leave.date_to >= today) {
          await supabase.from('profiles').update({ duty_status: 'on-leave' }).eq('id', member.id)
        }
      }
    }

    const { error: err } = await supabase.from('leave_requests').update({ status }).eq('id', leave.id)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(`Leave ${status}.`)
    await load()
  }

  const attendanceByProfile = new Map(
    attendance.filter((a) => a.profile_id).map((a) => [a.profile_id as string, a]),
  )
  const clinicAccounts = accounts.filter((a) => a.role !== 'Client')

  return (
    <div>
      <PageHeader
        kicker="HR"
        title="Staff & Attendance"
        subtitle="All registered accounts. Role controls which pages they can open. Time in/out appears when they clock from the topbar."
        actions={
          <button className="btn btn-ghost" type="button" onClick={() => load()}>
            Refresh
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2 className="panel-title">Registered accounts</h2>
        </div>
        <div className="panel-body">
          {accounts.length === 0 ? (
            <div className="empty-state">
              No registered accounts yet. Users appear here after they sign up.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Employment</th>
                    <th>Duty</th>
                    <th>Vacation</th>
                    <th>Sick</th>
                    <th>Personal</th>
                    <th>Emergency</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>{account.email || '—'}</td>
                      <td>
                        <input
                          className="input"
                          style={{ height: 34, minWidth: 120 }}
                          defaultValue={account.full_name}
                          key={`${account.id}-name-${account.full_name}`}
                          onBlur={(e) => {
                            const next = e.target.value.trim()
                            if (!next || next === account.full_name) return
                            patchAccount(account.id, { full_name: next }, 'Name updated.')
                          }}
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          style={{ minWidth: 120, height: 34 }}
                          value={account.employment_status}
                          onChange={(e) =>
                            patchAccount(
                              account.id,
                              { employment_status: e.target.value },
                              'Employment status updated.',
                            )
                          }
                        >
                          <option value="probation">Probation</option>
                          <option value="regular">Regular</option>
                          <option value="contract">Contract</option>
                          <option value="separated">Separated</option>
                        </select>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            account.duty_status === 'on-duty'
                              ? 'badge-success'
                              : account.duty_status === 'on-leave'
                                ? 'badge-warning'
                                : ''
                          }`}
                        >
                          {account.duty_status}
                        </span>
                      </td>
                      {(
                        [
                          ['leave_credits_vacation', account.leave_credits_vacation],
                          ['leave_credits_sick', account.leave_credits_sick],
                          ['leave_credits_personal', account.leave_credits_personal],
                          ['leave_credits_emergency', account.leave_credits_emergency],
                        ] as const
                      ).map(([col, value]) => (
                        <td key={col}>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            style={{ width: 72, height: 34, padding: '0 8px' }}
                            defaultValue={value}
                            key={`${account.id}-${col}-${value}`}
                            onBlur={(e) => {
                              const next = Number(e.target.value)
                              if (Number.isNaN(next) || next === value) return
                              patchAccount(account.id, { [col]: next }, 'Leave credits updated.')
                            }}
                          />
                        </td>
                      ))}
                      <td>
                        <select
                          className="select"
                          style={{ minWidth: 120, height: 34 }}
                          value={account.role}
                          onChange={(e) =>
                            requestRoleChange(account, normalizeRole(e.target.value))
                          }
                        >
                          <option value="Owner">Owner</option>
                          <option value="Admin">Admin</option>
                          <option value="Staff">Staff</option>
                          <option value="Client">Client</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {roleChange ? (
        <div
          className="confirm-modal-overlay"
          role="presentation"
          onClick={closeRoleModal}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeRoleModal()
          }}
        >
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-change-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div>
                <p className="confirm-modal-kicker">Confirm role change</p>
                <h2 id="role-change-title" className="confirm-modal-title">
                  Change access for {roleChange.account.full_name}?
                </h2>
              </div>
              <button
                className="btn-icon"
                type="button"
                aria-label="Close"
                onClick={closeRoleModal}
                disabled={roleSaving}
              >
                <X size={16} />
              </button>
            </div>

            <div className="confirm-modal-body">
              <p className="confirm-modal-text">
                You are about to update this registered account&apos;s role. This controls which
                pages they can open in the system.
              </p>

              <div className="confirm-modal-meta">
                <div>
                  <span className="confirm-modal-label">Account</span>
                  <strong>{roleChange.account.email || roleChange.account.full_name}</strong>
                </div>
                <div className="confirm-modal-role-row">
                  <div>
                    <span className="confirm-modal-label">Current role</span>
                    <strong className="confirm-modal-role">{roleChange.account.role}</strong>
                  </div>
                  <span className="confirm-modal-arrow" aria-hidden="true">
                    →
                  </span>
                  <div>
                    <span className="confirm-modal-label">New role</span>
                    <strong className="confirm-modal-role is-next">{roleChange.nextRole}</strong>
                  </div>
                </div>
              </div>

              <div className="confirm-modal-note">
                <span className="confirm-modal-label">Access after change</span>
                <p>{ROLE_ACCESS[roleChange.nextRole]}</p>
              </div>
            </div>

            <div className="confirm-modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={closeRoleModal}
                disabled={roleSaving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={confirmRoleChange}
                disabled={roleSaving}
              >
                {roleSaving ? 'Updating…' : `Confirm ${roleChange.nextRole}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Today&apos;s attendance</h2>
          </div>
          <div className="panel-body">
            {clinicAccounts.length === 0 ? (
              <div className="empty-state">No clinic accounts yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>Hours</th>
                      <th>Duty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clinicAccounts.map((account) => {
                      const att = attendanceByProfile.get(account.id)
                      const hours = hoursBetween(att?.time_in, att?.time_out)
                      return (
                        <tr key={account.id}>
                          <td>
                            <strong>{account.full_name}</strong>
                          </td>
                          <td>{account.email || '—'}</td>
                          <td>{att?.time_in ? String(att.time_in).slice(0, 5) : '—'}</td>
                          <td>{att?.time_out ? String(att.time_out).slice(0, 5) : '—'}</td>
                          <td>{hours ? formatHours(hours) : '—'}</td>
                          <td>
                            <span
                              className={`badge ${
                                account.duty_status === 'on-duty'
                                  ? 'badge-success'
                                  : account.duty_status === 'on-leave'
                                    ? 'badge-warning'
                                    : ''
                              }`}
                            >
                              {account.duty_status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Leave approvals</h2>
          </div>
          <div className="panel-body">
            {leaves.length === 0 ? (
              <div className="empty-state">No leave requests yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Days</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((leave) => (
                      <tr key={leave.id}>
                        <td>
                          <strong>{leave.staff_name}</strong>
                          {leave.reason ? (
                            <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                              {leave.reason}
                            </div>
                          ) : null}
                        </td>
                        <td>{leave.leave_type}</td>
                        <td>
                          {leave.date_from} → {leave.date_to}
                        </td>
                        <td>{leave.days || leaveDays(leave.date_from, leave.date_to)}</td>
                        <td>
                          <span
                            className={`badge ${
                              leave.status === 'approved'
                                ? 'badge-success'
                                : leave.status === 'pending'
                                  ? 'badge-warning'
                                  : 'badge-danger'
                            }`}
                          >
                            {leave.status}
                          </span>
                        </td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          {leave.status === 'pending' ? (
                            <>
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                disabled={saving}
                                onClick={() => setLeaveStatus(leave, 'approved')}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                disabled={saving}
                                onClick={() => setLeaveStatus(leave, 'rejected')}
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
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
  )
}
