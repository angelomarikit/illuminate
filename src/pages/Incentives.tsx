import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { formatCurrency, isUuid } from '../lib/utils'
import { supabase } from '../lib/supabase'

type IncentiveType = 'service_commission' | 'product_incentive' | 'other'
type Rule = {
  id: string
  name: string
  incentive_type: IncentiveType
  rate_percent: number
  flat_amount: number
  active: boolean
  notes: string | null
}
type Payout = {
  id: string
  staff_name: string
  profile_id: string | null
  incentive_type: IncentiveType
  period_start: string
  period_end: string
  sales_amount: number
  computed_amount: number
  adjustment: number
  final_amount: number
  source: 'manual' | 'pos_sales_by'
  status: 'draft' | 'approved' | 'paid'
  notes: string | null
}
type ProfileOpt = { id: string; full_name: string }

function monthBounds(isoMonth: string) {
  const [y, m] = isoMonth.split('-').map(Number)
  const start = `${isoMonth}-01`
  const endDate = new Date(y, m, 0)
  const end = `${isoMonth}-${String(endDate.getDate()).padStart(2, '0')}`
  return { start, end }
}

const TYPE_LABEL: Record<IncentiveType, string> = {
  service_commission: 'Service commission',
  product_incentive: 'Product incentive',
  other: 'Other',
}

export function Incentives() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const [tab, setTab] = useState<'payouts' | 'rules'>('payouts')
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [rules, setRules] = useState<Rule[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [profiles, setProfiles] = useState<ProfileOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [ruleForm, setRuleForm] = useState({
    name: '',
    incentive_type: 'service_commission' as IncentiveType,
    rate_percent: '5',
    flat_amount: '0',
  })
  const [manualForm, setManualForm] = useState({
    profileId: '',
    staffName: '',
    incentive_type: 'service_commission' as IncentiveType,
    salesAmount: '',
    amount: '',
    notes: '',
  })

  const { start, end } = useMemo(() => monthBounds(month), [month])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [{ data: ruleData, error: ruleErr }, { data: payData }, { data: prof }] =
      await Promise.all([
        supabase.from('incentive_rules').select('*').order('name'),
        supabase
          .from('incentive_payouts')
          .select('*')
          .gte('period_start', start)
          .lte('period_end', end)
          .order('staff_name'),
        supabase
          .from('profiles')
          .select('id, full_name')
          .in('role', ['Owner', 'Admin', 'Staff', 'HR'])
          .order('full_name'),
      ])

    if (ruleErr) {
      setError(
        ruleErr.message.includes('incentive') || ruleErr.message.includes('schema cache')
          ? `${ruleErr.message} — run supabase/add_hr_role.sql in Supabase.`
          : ruleErr.message,
      )
    }

    setRules(
      ((ruleData as Rule[] | null) ?? []).map((r) => ({
        ...r,
        rate_percent: Number(r.rate_percent ?? 0),
        flat_amount: Number(r.flat_amount ?? 0),
      })),
    )
    setPayouts(
      ((payData as Payout[] | null) ?? []).map((p) => ({
        ...p,
        sales_amount: Number(p.sales_amount ?? 0),
        computed_amount: Number(p.computed_amount ?? 0),
        adjustment: Number(p.adjustment ?? 0),
        final_amount: Number(p.final_amount ?? 0),
      })),
    )
    setProfiles((prof as ProfileOpt[] | null) ?? [])
    setLoading(false)
  }, [start, end])

  useEffect(() => {
    load()
  }, [load])

  async function saveRule(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('incentive_rules').insert({
      name: ruleForm.name.trim(),
      incentive_type: ruleForm.incentive_type,
      rate_percent: Number(ruleForm.rate_percent) || 0,
      flat_amount: Number(ruleForm.flat_amount) || 0,
      active: true,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage('Incentive rule saved.')
    setRuleForm({ name: '', incentive_type: 'service_commission', rate_percent: '5', flat_amount: '0' })
    await load()
  }

  async function addManual(e: FormEvent) {
    e.preventDefault()
    const name =
      manualForm.staffName.trim() ||
      profiles.find((p) => p.id === manualForm.profileId)?.full_name ||
      ''
    if (!name) {
      setError('Select an account or enter a name.')
      return
    }
    const amount = Number(manualForm.amount) || 0
    const sales = Number(manualForm.salesAmount) || 0
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('incentive_payouts').insert({
      branch_id: isUuid(branchId) ? branchId : null,
      profile_id: manualForm.profileId || null,
      staff_name: name,
      incentive_type: manualForm.incentive_type,
      period_start: start,
      period_end: end,
      sales_amount: sales,
      computed_amount: amount,
      adjustment: 0,
      final_amount: amount,
      source: 'manual',
      status: 'draft',
      notes: manualForm.notes.trim() || null,
      created_by: user?.id ?? null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage('Manual incentive added.')
    setManualForm({
      profileId: '',
      staffName: '',
      incentive_type: 'service_commission',
      salesAmount: '',
      amount: '',
      notes: '',
    })
    await load()
  }

  async function computeFromSalesBy() {
    const activeRules = rules.filter((r) => r.active)
    if (!activeRules.length) {
      setError('Add at least one active incentive rule first.')
      return
    }

    setSaving(true)
    setError('')
    let salesQ = supabase
      .from('sales')
      .select('total, sales_by, sold_at, items')
      .gte('sold_at', `${start}T00:00:00`)
      .lte('sold_at', `${end}T23:59:59`)
    if (isUuid(branchId)) salesQ = salesQ.eq('branch_id', branchId)

    const { data: sales, error: salesErr } = await salesQ
    if (salesErr) {
      setSaving(false)
      setError(salesErr.message)
      return
    }

    type Agg = { staff: string; serviceTotal: number; productTotal: number }
    const byStaff = new Map<string, Agg>()
    for (const sale of sales ?? []) {
      const staff = String(sale.sales_by || '').trim()
      if (!staff) continue
      const items = String(sale.items || '').toLowerCase()
      const total = Number(sale.total || 0)
      const cur = byStaff.get(staff) ?? { staff, serviceTotal: 0, productTotal: 0 }
      const looksProduct =
        items.includes('retail') ||
        items.includes('serum') ||
        items.includes('cream') ||
        items.includes('product')
      if (looksProduct) cur.productTotal += total
      else cur.serviceTotal += total
      byStaff.set(staff, cur)
    }

    const serviceRule = activeRules.find((r) => r.incentive_type === 'service_commission')
    const productRule = activeRules.find((r) => r.incentive_type === 'product_incentive')
    const inserts = []

    for (const agg of byStaff.values()) {
      const profile = profiles.find(
        (p) => p.full_name.trim().toLowerCase() === agg.staff.toLowerCase(),
      )
      if (serviceRule && agg.serviceTotal > 0) {
        const computed =
          (agg.serviceTotal * (serviceRule.rate_percent || 0)) / 100 + (serviceRule.flat_amount || 0)
        inserts.push({
          branch_id: isUuid(branchId) ? branchId : null,
          profile_id: profile?.id ?? null,
          staff_name: agg.staff,
          incentive_type: 'service_commission' as const,
          rule_id: serviceRule.id,
          period_start: start,
          period_end: end,
          sales_amount: agg.serviceTotal,
          computed_amount: computed,
          adjustment: 0,
          final_amount: computed,
          source: 'pos_sales_by' as const,
          status: 'draft' as const,
          notes: `From POS Sales by · ${serviceRule.name}`,
          created_by: user?.id ?? null,
        })
      }
      if (productRule && agg.productTotal > 0) {
        const computed =
          (agg.productTotal * (productRule.rate_percent || 0)) / 100 + (productRule.flat_amount || 0)
        inserts.push({
          branch_id: isUuid(branchId) ? branchId : null,
          profile_id: profile?.id ?? null,
          staff_name: agg.staff,
          incentive_type: 'product_incentive' as const,
          rule_id: productRule.id,
          period_start: start,
          period_end: end,
          sales_amount: agg.productTotal,
          computed_amount: computed,
          adjustment: 0,
          final_amount: computed,
          source: 'pos_sales_by' as const,
          status: 'draft' as const,
          notes: `From POS Sales by · ${productRule.name}`,
          created_by: user?.id ?? null,
        })
      }
    }

    if (!inserts.length) {
      setSaving(false)
      setError('No POS sales with “Sales by” found for this month.')
      return
    }

    const { error: err } = await supabase.from('incentive_payouts').insert(inserts)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(`Created ${inserts.length} incentive draft(s) from POS Sales by.`)
    await load()
  }

  async function setStatus(id: string, status: Payout['status']) {
    const { error: err } = await supabase
      .from('incentive_payouts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(`Marked as ${status}.`)
    await load()
  }

  async function toggleRule(rule: Rule) {
    const { error: err } = await supabase
      .from('incentive_rules')
      .update({ active: !rule.active, updated_at: new Date().toISOString() })
      .eq('id', rule.id)
    if (err) {
      setError(err.message)
      return
    }
    await load()
  }

  const totalFinal = payouts.reduce((s, p) => s + p.final_amount, 0)

  return (
    <div>
      <PageHeader
        kicker="HR"
        title="Incentives & commission"
        subtitle="Service and product incentives from POS Sales by — or add amounts manually."
        actions={
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving}
            onClick={computeFromSalesBy}
          >
            Compute from POS Sales by
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="chips" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`chip ${tab === 'payouts' ? 'active' : ''}`}
          onClick={() => setTab('payouts')}
        >
          Payouts
        </button>
        <button
          type="button"
          className={`chip ${tab === 'rules' ? 'active' : ''}`}
          onClick={() => setTab('rules')}
        >
          Rules
        </button>
      </div>

      {tab === 'payouts' ? (
        <>
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <div className="field" style={{ margin: 0, maxWidth: 220 }}>
              <label>Period (month)</label>
              <input
                className="input"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <div style={{ alignSelf: 'end', color: 'var(--muted)' }}>
              Period incentives:{' '}
              <strong style={{ color: 'var(--ink)' }}>{formatCurrency(totalFinal)}</strong>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <h2 className="panel-title">Manual incentive</h2>
            </div>
            <div className="panel-body">
              <form
                onSubmit={addManual}
                style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
              >
                <div className="field">
                  <label>System account</label>
                  <select
                    className="select"
                    value={manualForm.profileId}
                    onChange={(e) => {
                      const id = e.target.value
                      const name = profiles.find((p) => p.id === id)?.full_name ?? ''
                      setManualForm((f) => ({
                        ...f,
                        profileId: id,
                        staffName: name || f.staffName,
                      }))
                    }}
                  >
                    <option value="">Manual name…</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Name</label>
                  <input
                    className="input"
                    required
                    value={manualForm.staffName}
                    onChange={(e) => setManualForm((f) => ({ ...f, staffName: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Type</label>
                  <select
                    className="select"
                    value={manualForm.incentive_type}
                    onChange={(e) =>
                      setManualForm((f) => ({
                        ...f,
                        incentive_type: e.target.value as IncentiveType,
                      }))
                    }
                  >
                    <option value="service_commission">Service commission</option>
                    <option value="product_incentive">Product incentive</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="field">
                  <label>Related sales amount</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={manualForm.salesAmount}
                    onChange={(e) => setManualForm((f) => ({ ...f, salesAmount: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Incentive amount</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    required
                    value={manualForm.amount}
                    onChange={(e) => setManualForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Notes</label>
                  <input
                    className="input"
                    value={manualForm.notes}
                    onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    Add manual payout
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Payouts · {month}</h2>
            </div>
            <div className="panel-body">
              {loading ? (
                <div className="empty-state">Loading…</div>
              ) : payouts.length === 0 ? (
                <div className="empty-state">
                  No payouts yet. Compute from POS Sales by, or add manually.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Staff</th>
                        <th>Type</th>
                        <th>Sales</th>
                        <th>Incentive</th>
                        <th>Source</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.staff_name}</strong>
                            {p.notes ? (
                              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                                {p.notes}
                              </div>
                            ) : null}
                          </td>
                          <td>{TYPE_LABEL[p.incentive_type]}</td>
                          <td>{formatCurrency(p.sales_amount)}</td>
                          <td>
                            <strong>{formatCurrency(p.final_amount)}</strong>
                          </td>
                          <td>{p.source === 'pos_sales_by' ? 'POS Sales by' : 'Manual'}</td>
                          <td>
                            <span className="badge">{p.status}</span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {p.status === 'draft' ? (
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                onClick={() => setStatus(p.id, 'approved')}
                              >
                                Approve
                              </button>
                            ) : null}
                            {p.status === 'approved' ? (
                              <button
                                className="btn btn-primary btn-sm"
                                type="button"
                                onClick={() => setStatus(p.id, 'paid')}
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
        </>
      ) : (
        <div className="grid-2">
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">New rule</h2>
            </div>
            <div className="panel-body">
              <form onSubmit={saveRule} style={{ display: 'grid', gap: 10 }}>
                <div className="field">
                  <label>Name</label>
                  <input
                    className="input"
                    required
                    placeholder="e.g. Service commission 5%"
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Type</label>
                  <select
                    className="select"
                    value={ruleForm.incentive_type}
                    onChange={(e) =>
                      setRuleForm((f) => ({
                        ...f,
                        incentive_type: e.target.value as IncentiveType,
                      }))
                    }
                  >
                    <option value="service_commission">Service commission</option>
                    <option value="product_incentive">Product incentive</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="field">
                  <label>Rate %</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={ruleForm.rate_percent}
                    onChange={(e) => setRuleForm((f) => ({ ...f, rate_percent: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Flat amount (optional)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={ruleForm.flat_amount}
                    onChange={(e) => setRuleForm((f) => ({ ...f, flat_amount: e.target.value }))}
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  Save rule
                </button>
              </form>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Active rules</h2>
            </div>
            <div className="panel-body">
              {rules.length === 0 ? (
                <div className="empty-state">No rules yet.</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Rate</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>{TYPE_LABEL[r.incentive_type]}</td>
                          <td>
                            {r.rate_percent}%
                            {r.flat_amount > 0 ? ` + ${formatCurrency(r.flat_amount)}` : ''}
                          </td>
                          <td>
                            <span className={`badge ${r.active ? 'badge-success' : 'badge-neutral'}`}>
                              {r.active ? 'active' : 'off'}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => toggleRule(r)}
                            >
                              {r.active ? 'Disable' : 'Enable'}
                            </button>
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
      )}
    </div>
  )
}
