import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import { isUuid } from '../lib/utils'
import type { LeaveRequest, StaffMember } from '../types'

type StaffRow = {
  id: string
  branch_id: string | null
  full_name: string
  role: string
  status: string
}

type LeaveRow = {
  id: string
  staff_name: string
  leave_type: string
  date_from: string
  date_to: string
  status: string
}

type AttendanceRow = {
  staff_id: string
  time_in: string | null
  time_out: string | null
}

export function Staff() {
  const { branchId } = useBranch()
  const [rows, setRows] = useState<StaffMember[]>([])
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [selectedStaff, setSelectedStaff] = useState('')
  const [showLeave, setShowLeave] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [leaveForm, setLeaveForm] = useState({
    staffName: '',
    type: 'Vacation' as LeaveRequest['type'],
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  })

  const load = useCallback(async () => {
    let staffQuery = supabase.from('staff').select('*').order('full_name')
    if (isUuid(branchId)) staffQuery = staffQuery.eq('branch_id', branchId)

    const today = new Date().toISOString().slice(0, 10)
    const [{ data: staffData, error: staffErr }, { data: leaveData }, { data: attendance }] =
      await Promise.all([
        staffQuery,
        supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('attendance').select('*').eq('work_date', today),
      ])

    if (staffErr) {
      setError(staffErr.message)
      return
    }

    const attendanceMap = new Map<string, AttendanceRow>()
    ;(attendance as AttendanceRow[] | null)?.forEach((a) => attendanceMap.set(a.staff_id, a))

    setRows(
      ((staffData as StaffRow[] | null) ?? []).map((s) => {
        const att = attendanceMap.get(s.id)
        return {
          id: s.id,
          name: s.full_name,
          role: s.role,
          branchId: s.branch_id ?? '',
          status: s.status as StaffMember['status'],
          timeIn: att?.time_in ? String(att.time_in).slice(0, 5) : undefined,
          timeOut: att?.time_out ? String(att.time_out).slice(0, 5) : undefined,
        }
      }),
    )

    setLeaves(
      ((leaveData as LeaveRow[] | null) ?? []).map((l) => ({
        id: l.id,
        staffName: l.staff_name,
        type: l.leave_type as LeaveRequest['type'],
        from: l.date_from,
        to: l.date_to,
        status: l.status as LeaveRequest['status'],
      })),
    )
    setError('')
  }, [branchId])

  useEffect(() => {
    load()
  }, [load])

  async function timeIn() {
    const member = rows.find((r) => r.id === selectedStaff) || rows[0]
    if (!member) {
      setError('Add staff in Supabase or select a staff member.')
      return
    }
    setSaving(true)
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    const today = now.toISOString().slice(0, 10)

    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('staff_id', member.id)
      .eq('work_date', today)
      .maybeSingle()

    if (existing) {
      await supabase.from('attendance').update({ time_in: time, time_out: null }).eq('id', existing.id)
    } else {
      await supabase.from('attendance').insert({
        staff_id: member.id,
        work_date: today,
        time_in: time,
      })
    }
    await supabase.from('staff').update({ status: 'on-duty' }).eq('id', member.id)
    setSaving(false)
    setMessage(`${member.name} timed in.`)
    await load()
  }

  async function timeOut(memberId: string) {
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    const today = now.toISOString().slice(0, 10)
    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('staff_id', memberId)
      .eq('work_date', today)
      .maybeSingle()
    if (existing) {
      await supabase.from('attendance').update({ time_out: time }).eq('id', existing.id)
    }
    await supabase.from('staff').update({ status: 'off-duty' }).eq('id', memberId)
    setMessage('Timed out.')
    await load()
  }

  async function submitLeave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error: err } = await supabase.from('leave_requests').insert({
      staff_name: leaveForm.staffName.trim(),
      leave_type: leaveForm.type,
      date_from: leaveForm.from,
      date_to: leaveForm.to,
      status: 'pending',
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setShowLeave(false)
    setMessage('Leave request submitted.')
    await load()
  }

  async function setLeaveStatus(id: string, status: LeaveRequest['status']) {
    await supabase.from('leave_requests').update({ status }).eq('id', id)
    setMessage(`Leave ${status}.`)
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="HR"
        title="Staff, Time & Leaves"
        subtitle="Time in / time out for the floor team, plus leave requests for scheduling coverage."
        actions={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setShowLeave((v) => !v)}>
              Request Leave
            </button>
            <select
              className="select"
              style={{ width: 180 }}
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
            >
              <option value="">Select staff</option>
              {rows.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="button" onClick={timeIn} disabled={saving}>
              Time In
            </button>
          </>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {showLeave ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">Leave request</h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={submitLeave}
              style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              <div className="field">
                <label>Staff name</label>
                <input
                  className="input"
                  required
                  value={leaveForm.staffName}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, staffName: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Type</label>
                <select
                  className="select"
                  value={leaveForm.type}
                  onChange={(e) =>
                    setLeaveForm((f) => ({ ...f, type: e.target.value as LeaveRequest['type'] }))
                  }
                >
                  {['Vacation', 'Sick', 'Personal', 'Emergency'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>From</label>
                <input
                  className="input"
                  type="date"
                  value={leaveForm.from}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, from: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>To</label>
                <input
                  className="input"
                  type="date"
                  value={leaveForm.to}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, to: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  Submit leave
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Today's Attendance</h2>
          </div>
          <div className="panel-body">
            {rows.length === 0 ? (
              <div className="empty-state">No staff yet. Run supabase/setup.sql to seed staff.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <strong>{member.name}</strong>
                        </td>
                        <td>{member.role}</td>
                        <td>{member.timeIn ?? '—'}</td>
                        <td>{member.timeOut ?? '—'}</td>
                        <td>
                          <span
                            className={`badge ${
                              member.status === 'on-duty'
                                ? 'badge-success'
                                : member.status === 'on-leave'
                                  ? 'badge-warning'
                                  : ''
                            }`}
                          >
                            {member.status}
                          </span>
                        </td>
                        <td>
                          {member.status === 'on-duty' ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => timeOut(member.id)}
                            >
                              Time Out
                            </button>
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

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Leave Requests</h2>
          </div>
          <div className="panel-body">
            {leaves.length === 0 ? (
              <div className="empty-state">No leave requests.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Type</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((leave) => (
                      <tr key={leave.id}>
                        <td>{leave.staffName}</td>
                        <td>{leave.type}</td>
                        <td>{leave.from}</td>
                        <td>{leave.to}</td>
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
                                onClick={() => setLeaveStatus(leave.id, 'approved')}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                onClick={() => setLeaveStatus(leave.id, 'rejected')}
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
