import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgePercent,
  Banknote,
  Briefcase,
  RefreshCw,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { formatCurrency } from '../lib/utils'
import { supabase } from '../lib/supabase'
import './my-account.css'

type Comp = {
  pay_type: 'monthly' | 'daily' | 'hourly'
  base_salary: number
  hourly_rate: number
  notes: string | null
  updated_at: string
}

type PayrollRow = {
  id: string
  period_start: string
  period_end: string
  hours_worked: number
  base_pay: number
  allowances: number
  deductions: number
  net_pay: number
  status: string
  source: string
  notes: string | null
}

type IncentiveRow = {
  id: string
  incentive_type: string
  period_start: string
  period_end: string
  sales_amount: number
  final_amount: number
  status: string
  source: string
  notes: string | null
}

type Rule = {
  id: string
  name: string
  incentive_type: string
  rate_percent: number
  flat_amount: number
}

const PAY_LABEL = {
  monthly: 'Monthly salary',
  daily: 'Daily rate',
  hourly: 'Hourly rate',
} as const

const PAY_UNIT = {
  monthly: '/ month',
  daily: '/ day',
  hourly: '/ hour',
} as const

const TYPE_LABEL: Record<string, string> = {
  service_commission: 'Service commission',
  product_incentive: 'Product incentive',
  other: 'Other',
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function formatPeriod(from: string, to: string) {
  const a = new Date(`${from}T12:00:00`)
  const b = new Date(`${to}T12:00:00`)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${from} → ${to}`
  return `${a.toLocaleDateString('en-PH', opts)} – ${b.toLocaleDateString('en-PH', {
    ...opts,
    year: 'numeric',
  })}`
}

function statusClass(status: string) {
  if (status === 'paid') return 'paid'
  if (status === 'approved') return 'approved'
  return 'draft'
}

export function MyAccount() {
  const { user } = useAuth()
  const [comp, setComp] = useState<Comp | null>(null)
  const [payroll, setPayroll] = useState<PayrollRow[]>([])
  const [incentives, setIncentives] = useState<IncentiveRow[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [profileMeta, setProfileMeta] = useState<{
    employment_status: string | null
    duty_status: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'payroll' | 'incentives'>('payroll')

  const load = useCallback(async () => {
    if (!user?.id) return
    setError('')

    const nameFilter = user.name.trim()

    const [
      { data: profile },
      { data: compData, error: compErr },
      { data: payById },
      { data: payByName },
      { data: incById },
      { data: incByName },
      { data: ruleData },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('employment_status, duty_status')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.from('staff_compensation').select('*').eq('profile_id', user.id).maybeSingle(),
      supabase
        .from('payroll_entries')
        .select('*')
        .eq('profile_id', user.id)
        .order('period_end', { ascending: false })
        .limit(12),
      nameFilter
        ? supabase
            .from('payroll_entries')
            .select('*')
            .ilike('staff_name', nameFilter)
            .order('period_end', { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [] as PayrollRow[] | null }),
      supabase
        .from('incentive_payouts')
        .select('*')
        .eq('profile_id', user.id)
        .order('period_end', { ascending: false })
        .limit(12),
      nameFilter
        ? supabase
            .from('incentive_payouts')
            .select('*')
            .ilike('staff_name', nameFilter)
            .order('period_end', { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [] as IncentiveRow[] | null }),
      supabase
        .from('incentive_rules')
        .select('id, name, incentive_type, rate_percent, flat_amount')
        .eq('active', true)
        .order('name'),
    ])

    function mergeById<T extends { id: string }>(
      a: T[] | null | undefined,
      b: T[] | null | undefined,
    ) {
      const map = new Map<string, T>()
      for (const row of [...(a ?? []), ...(b ?? [])]) map.set(row.id, row)
      return Array.from(map.values())
    }

    const payData = mergeById(payById as PayrollRow[] | null, payByName as PayrollRow[] | null)
    const incData = mergeById(incById as IncentiveRow[] | null, incByName as IncentiveRow[] | null)

    if (compErr) {
      setError(
        compErr.message.includes('staff_compensation') || compErr.message.includes('schema cache')
          ? `${compErr.message} — run supabase/add_hr_role.sql and add_account_self_view.sql.`
          : compErr.message,
      )
    }

    startTransition(() => {
      setProfileMeta(
        profile
          ? {
              employment_status: profile.employment_status ?? null,
              duty_status: profile.duty_status ?? null,
            }
          : null,
      )

      if (compData) {
        setComp({
          pay_type: compData.pay_type,
          base_salary: Number(compData.base_salary ?? 0),
          hourly_rate: Number(compData.hourly_rate ?? 0),
          notes: compData.notes ?? null,
          updated_at: compData.updated_at,
        })
      } else {
        setComp(null)
      }

      setPayroll(
        payData
          .map((r) => ({
            ...r,
            hours_worked: Number(r.hours_worked ?? 0),
            base_pay: Number(r.base_pay ?? 0),
            allowances: Number(r.allowances ?? 0),
            deductions: Number(r.deductions ?? 0),
            net_pay: Number(r.net_pay ?? 0),
          }))
          .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)))
          .slice(0, 12),
      )

      setIncentives(
        incData
          .map((r) => ({
            ...r,
            sales_amount: Number(r.sales_amount ?? 0),
            final_amount: Number(r.final_amount ?? 0),
          }))
          .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)))
          .slice(0, 12),
      )

      setRules(
        ((ruleData as Rule[] | null) ?? []).map((r) => ({
          ...r,
          rate_percent: Number(r.rate_percent ?? 0),
          flat_amount: Number(r.flat_amount ?? 0),
        })),
      )
    })

    setLoading(false)
    setRefreshing(false)
  }, [user?.id, user?.name])

  useEffect(() => {
    load()
  }, [load])

  async function onRefresh() {
    setRefreshing(true)
    await load()
  }

  const rateDisplay = comp
    ? comp.pay_type === 'hourly'
      ? formatCurrency(comp.hourly_rate)
      : formatCurrency(comp.base_salary)
    : null

  const latestPayroll = payroll[0]
  const incentiveTotal = useMemo(
    () => incentives.reduce((sum, row) => sum + row.final_amount, 0),
    [incentives],
  )

  const duty = profileMeta?.duty_status || 'off-duty'
  const dutyDot = duty === 'on-duty' ? 'on' : duty === 'on-leave' ? 'leave' : 'off'

  return (
    <div className="ma-page">
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      {loading ? (
        <div className="ma-loading">
          <div className="ma-loading-bar" />
          Loading your account…
        </div>
      ) : (
        <>
          <section className="ma-hero ma-reveal ma-reveal-1">
            <div className="ma-avatar" aria-hidden>
              {initials(user?.name || '')}
            </div>
            <div className="ma-hero-copy">
              <p className="ma-hero-kicker">My account</p>
              <h1 className="ma-hero-name">{user?.name || 'Team member'}</h1>
              <p className="ma-hero-email">{user?.email || '—'}</p>
              <div className="ma-hero-chips">
                <span className="ma-chip ma-chip-gold">{user?.role || 'Staff'}</span>
                <span className="ma-chip">
                  <Briefcase size={12} />
                  {profileMeta?.employment_status || '—'}
                </span>
                <span className="ma-chip">
                  <span className={`ma-chip-dot ${dutyDot}`} />
                  {duty.replace('-', ' ')}
                </span>
              </div>
            </div>
            <div className="ma-hero-actions">
              <button
                type="button"
                className={`ma-refresh ${refreshing ? 'is-spinning' : ''}`}
                onClick={onRefresh}
                disabled={refreshing}
              >
                <RefreshCw size={15} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </section>

          <section className="ma-stats ma-reveal ma-reveal-2">
            <article className="ma-stat">
              <div className="ma-stat-label">
                <Wallet size={14} />
                Compensation
              </div>
              <div className="ma-stat-value">{rateDisplay || 'Not set'}</div>
              <div className="ma-stat-meta">
                {comp ? PAY_LABEL[comp.pay_type] : 'Ask HR to set your rate'}
              </div>
            </article>
            <article className="ma-stat">
              <div className="ma-stat-label">
                <Banknote size={14} />
                Latest payroll
              </div>
              <div className="ma-stat-value">
                {latestPayroll ? formatCurrency(latestPayroll.net_pay) : '—'}
              </div>
              <div className="ma-stat-meta">
                {latestPayroll
                  ? `${formatPeriod(latestPayroll.period_start, latestPayroll.period_end)} · ${latestPayroll.status}`
                  : 'No payroll entries yet'}
              </div>
            </article>
            <article className="ma-stat">
              <div className="ma-stat-label">
                <BadgePercent size={14} />
                Incentives (listed)
              </div>
              <div className="ma-stat-value">{formatCurrency(incentiveTotal)}</div>
              <div className="ma-stat-meta">
                {incentives.length
                  ? `${incentives.length} payout record${incentives.length === 1 ? '' : 's'}`
                  : 'No incentive payouts yet'}
              </div>
            </article>
          </section>

          <div className="ma-body ma-reveal ma-reveal-3">
            <div className="ma-stack">
              <section className="ma-section">
                <div className="ma-section-head">
                  <h2 className="ma-section-title">
                    <Wallet size={16} />
                    Salary
                  </h2>
                </div>
                <div className="ma-section-body">
                  {!comp ? (
                    <div className="ma-empty">
                      <Wallet size={22} strokeWidth={1.5} />
                      <p>No salary on file yet. HR can set this under Payroll → Compensation rates.</p>
                    </div>
                  ) : (
                    <div className="ma-pay-hero">
                      <p className="ma-pay-type">{PAY_LABEL[comp.pay_type]}</p>
                      <p className="ma-pay-amount">
                        {rateDisplay}{' '}
                        <span className="ma-pay-unit">{PAY_UNIT[comp.pay_type]}</span>
                      </p>
                      {comp.notes ? <p className="ma-pay-notes">{comp.notes}</p> : null}
                      <p className="ma-pay-updated">
                        Updated {new Date(comp.updated_at).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <section className="ma-section">
                <div className="ma-section-head">
                  <h2 className="ma-section-title">
                    <Sparkles size={16} />
                    Incentive rules
                  </h2>
                </div>
                <div className="ma-section-body">
                  {rules.length === 0 ? (
                    <div className="ma-empty">
                      <Sparkles size={22} strokeWidth={1.5} />
                      <p>No active incentive rules published for the clinic.</p>
                    </div>
                  ) : (
                    <div className="ma-rules">
                      {rules.map((r) => (
                        <div className="ma-rule" key={r.id}>
                          <div>
                            <div className="ma-rule-name">{r.name}</div>
                            <div className="ma-rule-type">
                              {TYPE_LABEL[r.incentive_type] || r.incentive_type}
                            </div>
                          </div>
                          <div className="ma-rule-rate">
                            {r.rate_percent}%
                            {r.flat_amount > 0 ? ` + ${formatCurrency(r.flat_amount)}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <section className="ma-section ma-reveal ma-reveal-4">
              <div className="ma-section-head">
                <h2 className="ma-section-title">
                  <Banknote size={16} />
                  Activity
                </h2>
              </div>
              <div className="ma-section-body">
                <div className="ma-tabs" role="tablist" aria-label="Account activity">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'payroll'}
                    className={`ma-tab ${tab === 'payroll' ? 'active' : ''}`}
                    onClick={() => setTab('payroll')}
                  >
                    My payroll
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'incentives'}
                    className={`ma-tab ${tab === 'incentives' ? 'active' : ''}`}
                    onClick={() => setTab('incentives')}
                  >
                    My incentives
                  </button>
                </div>

                {tab === 'payroll' ? (
                  <div className="ma-panel-anim" key="payroll">
                    {payroll.length === 0 ? (
                      <div className="ma-empty">
                        <Banknote size={22} strokeWidth={1.5} />
                        <p>No payroll entries for your account yet.</p>
                      </div>
                    ) : (
                      <div className="ma-list">
                        {payroll.map((r) => (
                          <article className="ma-row" key={r.id}>
                            <div>
                              <div className="ma-row-title">
                                {formatPeriod(r.period_start, r.period_end)}
                              </div>
                              <div className="ma-row-sub">
                                {r.hours_worked ? `${r.hours_worked} hrs · ` : ''}
                                {r.source}
                                {r.notes ? ` · ${r.notes}` : ''}
                              </div>
                            </div>
                            <div className="ma-row-amount">{formatCurrency(r.net_pay)}</div>
                            <div className="ma-row-status">
                              <span className={`ma-badge ${statusClass(r.status)}`}>{r.status}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="ma-panel-anim" key="incentives">
                    {incentives.length === 0 ? (
                      <div className="ma-empty">
                        <BadgePercent size={22} strokeWidth={1.5} />
                        <p>
                          No incentive payouts yet. They appear when HR computes from POS Sales by or
                          adds a payout in your name.
                        </p>
                      </div>
                    ) : (
                      <div className="ma-list">
                        {incentives.map((r) => (
                          <article className="ma-row" key={r.id}>
                            <div>
                              <div className="ma-row-title">
                                {TYPE_LABEL[r.incentive_type] || r.incentive_type}
                              </div>
                              <div className="ma-row-sub">
                                {formatPeriod(r.period_start, r.period_end)}
                                {r.sales_amount
                                  ? ` · sales ${formatCurrency(r.sales_amount)}`
                                  : ''}
                              </div>
                            </div>
                            <div className="ma-row-amount">{formatCurrency(r.final_amount)}</div>
                            <div className="ma-row-status">
                              <span className={`ma-badge ${statusClass(r.status)}`}>{r.status}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
