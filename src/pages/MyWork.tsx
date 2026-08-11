import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Clock3, CalendarDays, Hourglass, BriefcaseBusiness } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useStaffSession } from '../context/StaffSessionContext'
import {
  type LeaveType,
  formatHours,
  hoursBetween,
  leaveDays,
  todayDateString,
} from '../lib/staffHr'
import { supabase } from '../lib/supabase'

type LeaveRow = {
  id: string
  leave_type: LeaveType
  date_from: string
  date_to: string
  days: number
  reason: string | null
  status: string
}

type AttendanceHistory = {
  id: string
  work_date: string
  time_in: string | null
  time_out: string | null
}

function statusBadge(status: string) {
  if (status === 'approved' || status === 'on-duty') return 'badge badge-success'
  if (status === 'pending' || status === 'on-leave' || status === 'probation') return 'badge badge-warning'
  if (status === 'rejected') return 'badge badge-danger'
  return 'badge'
}

export function MyWork() {
  const {
    loading,
    staffRecord,
    todayAttendance,
    isClockedIn,
    hoursTodayLabel,
    clockIn,
    clockOut,
    clockBusy,
    clockError,
    refresh,
  } = useStaffSession()

  const [leaves, setLeaves] = useState<LeaveRow[]>([])
  const [history, setHistory] = useState<AttendanceHistory[]>([])
  const [showLeave, setShowLeave] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [leaveForm, setLeaveForm] = useState({
    type: 'Vacation' as LeaveType,
    from: todayDateString(),
    to: todayDateString(),
    reason: '',
  })

  const loadMine = useCallback(async () => {
    if (!staffRecord) {
      setLeaves([])
      setHistory([])
      return
    }

    const [{ data: leaveData }, { data: attData }] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('*')
        .eq('profile_id', staffRecord.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('attendance')
        .select('id, work_date, time_in, time_out')
        .eq('profile_id', staffRecord.id)
        .order('work_date', { ascending: false })
        .limit(30),
    ])

    setLeaves((leaveData as LeaveRow[]) ?? [])
    setHistory((attData as AttendanceHistory[]) ?? [])
  }, [staffRecord])

  useEffect(() => {
    loadMine()
  }, [loadMine])

  const monthHours = useMemo(() => {
    const month = todayDateString().slice(0, 7)
    return history
      .filter((row) => row.work_date.startsWith(month))
      .reduce((sum, row) => sum + hoursBetween(row.time_in, row.time_out), 0)
  }, [history])

  async function submitLeave(e: FormEvent) {
    e.preventDefault()
    if (!staffRecord) return
    const days = leaveDays(leaveForm.from, leaveForm.to)
    const creditMap = {
      Vacation: staffRecord.credits.vacation,
      Sick: staffRecord.credits.sick,
      Personal: staffRecord.credits.personal,
      Emergency: staffRecord.credits.emergency,
    }
    if (creditMap[leaveForm.type] < days) {
      setError(
        `Not enough ${leaveForm.type} credits. You have ${creditMap[leaveForm.type]}, need ${days}.`,
      )
      return
    }

    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('leave_requests').insert({
      profile_id: staffRecord.id,
      staff_name: staffRecord.fullName,
      leave_type: leaveForm.type,
      date_from: leaveForm.from,
      date_to: leaveForm.to,
      days,
      reason: leaveForm.reason.trim() || null,
      status: 'pending',
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setShowLeave(false)
    setMessage('Leave request submitted for Owner/Admin approval.')
    await Promise.all([loadMine(), refresh()])
  }

  if (loading) {
    return <div className="empty-state">Loading your work profile…</div>
  }

  if (!staffRecord) {
    return (
      <div>
        <PageHeader
          kicker="My work"
          title="Staff profile not linked"
          subtitle="Ask an Owner/Admin to set up your account under Staff & Attendance."
        />
      </div>
    )
  }

  const timeInLabel = todayAttendance?.timeIn
    ? String(todayAttendance.timeIn).slice(0, 5)
    : '—'
  const timeOutLabel = todayAttendance?.timeOut
    ? String(todayAttendance.timeOut).slice(0, 5)
    : '—'

  return (
    <div className="my-work">
      <PageHeader
        kicker="My work"
        title={staffRecord.fullName}
        subtitle="Track your shift, leave credits, and attendance in one place."
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setShowLeave((v) => !v)}>
            {showLeave ? 'Close' : 'Request Leave'}
          </button>
        }
      />

      {error || clockError ? (
        <StatusMessage type="error">{error || clockError}</StatusMessage>
      ) : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <section className="my-work-hero">
        <div className="my-work-hero-main">
          <div className="my-work-hero-copy">
            <p className="my-work-eyebrow">Current shift</p>
            <h2 className="my-work-hero-title">
              {isClockedIn ? "You're timed in" : 'Ready to start'}
            </h2>
            <p className="my-work-hero-sub">
              Use the topbar toggle or the button here. Owner/Admin can see your in/out on Staff &
              Attendance.
            </p>
          </div>
          <button
            className={`btn ${isClockedIn ? 'btn-ghost' : 'btn-primary'} my-work-hero-btn`}
            type="button"
            disabled={clockBusy}
            onClick={() => (isClockedIn ? clockOut() : clockIn())}
          >
            <Clock3 size={16} />
            {clockBusy ? 'Saving…' : isClockedIn ? 'Time Out' : 'Time In'}
          </button>
        </div>

        <div className="my-work-hero-times">
          <div className="my-work-time-block">
            <span className="my-work-time-label">Time in</span>
            <strong className="my-work-time-value">{timeInLabel}</strong>
          </div>
          <div className="my-work-time-divider" aria-hidden="true" />
          <div className="my-work-time-block">
            <span className="my-work-time-label">Time out</span>
            <strong className="my-work-time-value">{timeOutLabel}</strong>
          </div>
          <div className="my-work-time-divider" aria-hidden="true" />
          <div className="my-work-time-block">
            <span className="my-work-time-label">Hours today</span>
            <strong className="my-work-time-value">{hoursTodayLabel}</strong>
          </div>
        </div>
      </section>

      <section className="my-work-stats">
        <article className="my-work-stat">
          <div className="my-work-stat-icon">
            <BriefcaseBusiness size={18} />
          </div>
          <div className="my-work-stat-copy">
            <span className="my-work-stat-label">Employment</span>
            <strong className="my-work-stat-value">
              <span className={statusBadge(staffRecord.employmentStatus)}>
                {staffRecord.employmentStatus}
              </span>
            </strong>
          </div>
        </article>
        <article className="my-work-stat">
          <div className="my-work-stat-icon">
            <Clock3 size={18} />
          </div>
          <div className="my-work-stat-copy">
            <span className="my-work-stat-label">Duty status</span>
            <strong className="my-work-stat-value">
              <span className={statusBadge(staffRecord.status)}>{staffRecord.status}</span>
            </strong>
          </div>
        </article>
        <article className="my-work-stat">
          <div className="my-work-stat-icon">
            <Hourglass size={18} />
          </div>
          <div className="my-work-stat-copy">
            <span className="my-work-stat-label">Hours today</span>
            <strong className="my-work-stat-value">{hoursTodayLabel}</strong>
          </div>
        </article>
        <article className="my-work-stat">
          <div className="my-work-stat-icon">
            <CalendarDays size={18} />
          </div>
          <div className="my-work-stat-copy">
            <span className="my-work-stat-label">Hours this month</span>
            <strong className="my-work-stat-value">{formatHours(monthHours)}</strong>
          </div>
        </article>
      </section>

      <section className="panel my-work-credits">
        <div className="panel-header">
          <h2 className="panel-title">Leave credits</h2>
        </div>
        <div className="panel-body">
          <div className="my-work-credit-grid">
            {(
              [
                ['Vacation', staffRecord.credits.vacation],
                ['Sick', staffRecord.credits.sick],
                ['Personal', staffRecord.credits.personal],
                ['Emergency', staffRecord.credits.emergency],
              ] as const
            ).map(([label, value]) => (
              <div className="my-work-credit-card" key={label}>
                <span className="my-work-stat-label">{label}</span>
                <strong className="my-work-credit-value">{value}</strong>
                <span className="my-work-credit-unit">days left</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {showLeave ? (
        <section className="panel my-work-leave-form">
          <div className="panel-header">
            <h2 className="panel-title">Request leave</h2>
          </div>
          <div className="panel-body">
            <form className="my-work-form" onSubmit={submitLeave}>
              <div className="field">
                <label htmlFor="leave-type">Type</label>
                <select
                  id="leave-type"
                  className="select"
                  value={leaveForm.type}
                  onChange={(e) =>
                    setLeaveForm((f) => ({ ...f, type: e.target.value as LeaveType }))
                  }
                >
                  {(['Vacation', 'Sick', 'Personal', 'Emergency'] as LeaveType[]).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="leave-days">Days</label>
                <input
                  id="leave-days"
                  className="input"
                  readOnly
                  value={leaveDays(leaveForm.from, leaveForm.to)}
                />
              </div>
              <div className="field">
                <label htmlFor="leave-from">From</label>
                <input
                  id="leave-from"
                  className="input"
                  type="date"
                  value={leaveForm.from}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, from: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="leave-to">To</label>
                <input
                  id="leave-to"
                  className="input"
                  type="date"
                  value={leaveForm.to}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, to: e.target.value }))}
                />
              </div>
              <div className="field my-work-form-full">
                <label htmlFor="leave-reason">Reason</label>
                <textarea
                  id="leave-reason"
                  className="textarea"
                  rows={3}
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Optional note for Owner/Admin"
                />
              </div>
              <div className="my-work-form-full">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Submitting…' : 'Submit leave request'}
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      <section className="my-work-split">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">My leave requests</h2>
          </div>
          <div className="panel-body">
            {leaves.length === 0 ? (
              <div className="empty-state">No leave requests yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Days</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((leave) => (
                      <tr key={leave.id}>
                        <td>{leave.leave_type}</td>
                        <td>
                          {leave.date_from} → {leave.date_to}
                        </td>
                        <td>{leave.days}</td>
                        <td>
                          <span className={statusBadge(leave.status)}>{leave.status}</span>
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
            <h2 className="panel-title">Recent attendance</h2>
          </div>
          <div className="panel-body">
            {history.length === 0 ? (
              <div className="empty-state">No attendance yet. Time in to start your first shift.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id}>
                        <td>{row.work_date}</td>
                        <td>{row.time_in ? String(row.time_in).slice(0, 5) : '—'}</td>
                        <td>{row.time_out ? String(row.time_out).slice(0, 5) : '—'}</td>
                        <td>
                          {row.time_in && row.time_out
                            ? formatHours(hoursBetween(row.time_in, row.time_out))
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
