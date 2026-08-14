import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { formatCurrency, isUuid } from '../lib/utils'
import { hoursBetween } from '../lib/staffHr'
import { supabase } from '../lib/supabase'

type ProfileOpt = { id: string; full_name: string; role: string }
type CompRow = {
  profile_id: string
  pay_type: 'monthly' | 'daily' | 'hourly'
  base_salary: number
  hourly_rate: number
}
type PayrollRow = {
  id: string
  staff_name: string
  profile_id: string | null
  period_start: string
  period_end: string
  hours_worked: number
  base_pay: number
  allowances: number
  deductions: number
  net_pay: number
  status: 'draft' | 'approved' | 'paid'
  source: 'manual' | 'attendance'
  notes: string | null
}

function monthBounds(isoMonth: string) {
  const [y, m] = isoMonth.split('-').map(Number)
  const start = `${isoMonth}-01`
  const endDate = new Date(y, m, 0)
  const end = `${isoMonth}-${String(endDate.getDate()).padStart(2, '0')}`
  return { start, end }
}

const emptyManual = {
  profileId: '',
  staffName: '',
  hours: '',
  basePay: '',
  allowances: '',
  deductions: '',
  notes: '',
}

export function Payroll() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [profiles, setProfiles] = useState<ProfileOpt[]>([])
  const [comp, setComp] = useState<CompRow[]>([])
  const [rows, setRows] = useState<PayrollRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyManual)
  const [compForm, setCompForm] = useState({
    profileId: '',
    payType: 'monthly' as CompRow['pay_type'],
    baseSalary: '',
    hourlyRate: '',
  })

  const { start, end } = useMemo(() => monthBounds(month), [month])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [{ data: prof }, { data: compData }, { data: payData, error: payErr }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['Owner', 'Admin', 'Receptionist', 'Staff', 'HR'])
        .order('full_name'),
      supabase.from('staff_compensation').select('*'),
      supabase
        .from('payroll_entries')
        .select('*')
        .gte('period_start', start)
        .lte('period_end', end)
        .order('staff_name'),
    ])

    if (payErr) {
      setError(
        payErr.message.includes('payroll_entries') || payErr.message.includes('schema cache')
          ? `${payErr.message} — run supabase/add_hr_role.sql in Supabase.`
          : payErr.message,
      )
      setRows([])
    } else {
      setRows(
        ((payData as PayrollRow[] | null) ?? []).map((r) => ({
          ...r,
          hours_worked: Number(r.hours_worked ?? 0),
          base_pay: Number(r.base_pay ?? 0),
          allowances: Number(r.allowances ?? 0),
          deductions: Number(r.deductions ?? 0),
          net_pay: Number(r.net_pay ?? 0),
        })),
      )
    }

    setProfiles((prof as ProfileOpt[] | null) ?? [])
    setComp(
      ((compData as CompRow[] | null) ?? []).map((c) => ({
        ...c,
        base_salary: Number(c.base_salary ?? 0),
        hourly_rate: Number(c.hourly_rate ?? 0),
      })),
    )
    setLoading(false)
  }, [start, end])

  useEffect(() => {
    load()
  }, [load])

  async function saveCompensation(e: FormEvent) {
    e.preventDefault()
    if (!compForm.profileId) return
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('staff_compensation').upsert({
      profile_id: compForm.profileId,
      pay_type: compForm.payType,
      base_salary: Number(compForm.baseSalary) || 0,
      hourly_rate: Number(compForm.hourlyRate) || 0,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage('Compensation saved.')
    setCompForm({ profileId: '', payType: 'monthly', baseSalary: '', hourlyRate: '' })
    await load()
  }

  async function addManual(e: FormEvent) {
    e.preventDefault()
    const name =
      form.staffName.trim() ||
      profiles.find((p) => p.id === form.profileId)?.full_name ||
      ''
    if (!name) {
      setError('Select an account or enter a staff name.')
      return
    }
    const base = Number(form.basePay) || 0
    const allowances = Number(form.allowances) || 0
    const deductions = Number(form.deductions) || 0
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('payroll_entries').insert({
      branch_id: isUuid(branchId) ? branchId : null,
      profile_id: form.profileId || null,
      staff_name: name,
      period_start: start,
      period_end: end,
      hours_worked: Number(form.hours) || 0,
      base_pay: base,
      allowances,
      deductions,
      net_pay: base + allowances - deductions,
      status: 'draft',
      source: 'manual',
      notes: form.notes.trim() || null,
      created_by: user?.id ?? null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage('Payroll entry added.')
    setForm(emptyManual)
    setShowForm(false)
    await load()
  }

  async function generateFromAttendance() {
    setSaving(true)
    setError('')
    const { data: att, error: attErr } = await supabase
      .from('attendance')
      .select('profile_id, time_in, time_out, work_date')
      .gte('work_date', start)
      .lte('work_date', end)

    if (attErr) {
      setSaving(false)
      setError(attErr.message)
      return
    }

    const hoursByProfile = new Map<string, number>()
    for (const row of att ?? []) {
      if (!row.profile_id || !row.time_in || !row.time_out) continue
      const h = hoursBetween(row.time_in, row.time_out)
      hoursByProfile.set(row.profile_id, (hoursByProfile.get(row.profile_id) ?? 0) + h)
    }

    const inserts = []
    for (const [profileId, hours] of hoursByProfile) {
      const profile = profiles.find((p) => p.id === profileId)
      if (!profile) continue
      const c = comp.find((x) => x.profile_id === profileId)
      let base = 0
      if (c?.pay_type === 'hourly') base = hours * (c.hourly_rate || 0)
      else if (c?.pay_type === 'daily') base = Math.ceil(hours / 8) * (c.base_salary || 0)
      else base = c?.base_salary || 0

      inserts.push({
        branch_id: isUuid(branchId) ? branchId : null,
        profile_id: profileId,
        staff_name: profile.full_name,
        period_start: start,
        period_end: end,
        hours_worked: Math.round(hours * 100) / 100,
        base_pay: base,
        allowances: 0,
        deductions: 0,
        net_pay: base,
        status: 'draft' as const,
        source: 'attendance' as const,
        notes: 'Generated from time in / time out',
        created_by: user?.id ?? null,
      })
    }

    if (!inserts.length) {
      setSaving(false)
      setError('No complete attendance (time in + time out) found for this month.')
      return
    }

    const { error: err } = await supabase.from('payroll_entries').insert(inserts)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(`Created ${inserts.length} payroll draft(s) from attendance.`)
    await load()
  }

  async function setStatus(id: string, status: PayrollRow['status']) {
    const { error: err } = await supabase
      .from('payroll_entries')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(`Marked as ${status}.`)
    await load()
  }

  const totalNet = rows.reduce((s, r) => s + r.net_pay, 0)

  return (
    <div>
      <PageHeader
        kicker="HR"
        title="Payroll"
        subtitle="Base pay, allowances, and attendance-based drafts. Manual entries supported."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" type="button" onClick={generateFromAttendance} disabled={saving}>
              Generate from attendance
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Cancel' : 'Add manual entry'}
            </button>
          </div>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="field" style={{ margin: 0, maxWidth: 220 }}>
          <label>Pay period (month)</label>
          <input
            className="input"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div style={{ alignSelf: 'end', color: 'var(--muted)', fontSize: '0.9rem' }}>
          Period total net: <strong style={{ color: 'var(--ink)' }}>{formatCurrency(totalNet)}</strong>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Compensation rates</h2>
          </div>
          <div className="panel-body">
            <form onSubmit={saveCompensation} style={{ display: 'grid', gap: 10 }}>
              <div className="field">
                <label>Account</label>
                <select
                  className="select"
                  required
                  value={compForm.profileId}
                  onChange={(e) => {
                    const id = e.target.value
                    const existing = comp.find((c) => c.profile_id === id)
                    setCompForm({
                      profileId: id,
                      payType: existing?.pay_type ?? 'monthly',
                      baseSalary: existing ? String(existing.base_salary) : '',
                      hourlyRate: existing ? String(existing.hourly_rate) : '',
                    })
                  }}
                >
                  <option value="">Select staff account…</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Pay type</label>
                <select
                  className="select"
                  value={compForm.payType}
                  onChange={(e) =>
                    setCompForm((f) => ({
                      ...f,
                      payType: e.target.value as CompRow['pay_type'],
                    }))
                  }
                >
                  <option value="monthly">Monthly salary</option>
                  <option value="daily">Daily rate</option>
                  <option value="hourly">Hourly rate</option>
                </select>
              </div>
              <div className="field">
                <label>{compForm.payType === 'hourly' ? 'Hourly rate' : 'Base amount'}</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={compForm.payType === 'hourly' ? compForm.hourlyRate : compForm.baseSalary}
                  onChange={(e) =>
                    setCompForm((f) =>
                      f.payType === 'hourly'
                        ? { ...f, hourlyRate: e.target.value }
                        : { ...f, baseSalary: e.target.value },
                    )
                  }
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                Save compensation
              </button>
            </form>
          </div>
        </div>

        {showForm ? (
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Manual payroll entry</h2>
            </div>
            <div className="panel-body">
              <form onSubmit={addManual} style={{ display: 'grid', gap: 10 }}>
                <div className="field">
                  <label>System account (optional)</label>
                  <select
                    className="select"
                    value={form.profileId}
                    onChange={(e) => {
                      const id = e.target.value
                      const name = profiles.find((p) => p.id === id)?.full_name ?? ''
                      setForm((f) => ({ ...f, profileId: id, staffName: name || f.staffName }))
                    }}
                  >
                    <option value="">Manual name only…</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Staff name</label>
                  <input
                    className="input"
                    required
                    value={form.staffName}
                    onChange={(e) => setForm((f) => ({ ...f, staffName: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field">
                    <label>Hours</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={form.hours}
                      onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Base pay</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      required
                      value={form.basePay}
                      onChange={(e) => setForm((f) => ({ ...f, basePay: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Allowances</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={form.allowances}
                      onChange={(e) => setForm((f) => ({ ...f, allowances: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Deductions</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={form.deductions}
                      onChange={(e) => setForm((f) => ({ ...f, deductions: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Notes</label>
                  <input
                    className="input"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  Save entry
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">How payroll works</h2>
            </div>
            <div className="panel-body" style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
              <p style={{ marginTop: 0 }}>
                Set compensation per account, then generate drafts from time in / time out, or add
                manual rows for contractors and adjustments.
              </p>
              <p style={{ marginBottom: 0 }}>
                Approve and mark paid when ready. Only Owner, Admin, and HR can open this page.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Payroll entries · {month}</h2>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">No payroll rows for this month yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Hours</th>
                    <th>Base</th>
                    <th>Allowances</th>
                    <th>Deductions</th>
                    <th>Net</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.staff_name}</strong>
                        {r.notes ? (
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{r.notes}</div>
                        ) : null}
                      </td>
                      <td>{r.hours_worked}</td>
                      <td>{formatCurrency(r.base_pay)}</td>
                      <td>{formatCurrency(r.allowances)}</td>
                      <td>{formatCurrency(r.deductions)}</td>
                      <td>
                        <strong>{formatCurrency(r.net_pay)}</strong>
                      </td>
                      <td>{r.source}</td>
                      <td>
                        <span className="badge">{r.status}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.status === 'draft' ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => setStatus(r.id, 'approved')}
                          >
                            Approve
                          </button>
                        ) : null}
                        {r.status === 'approved' ? (
                          <button
                            className="btn btn-primary btn-sm"
                            type="button"
                            onClick={() => setStatus(r.id, 'paid')}
                          >
                            Mark paid
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
    </div>
  )
}
