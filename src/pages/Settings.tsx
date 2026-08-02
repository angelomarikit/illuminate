import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import type { Branch } from '../types'

type SettingsRow = {
  brand_name: string
  support_email: string
  timezone: string
  currency: string
  earn_rate: string
  redeem_rate: string
  cash_in_rule: string
}

export function Settings() {
  const { branches: contextBranches } = useBranch()
  const [branches, setBranches] = useState<Branch[]>(contextBranches)
  const [profile, setProfile] = useState({
    brandName: 'Illuminate Medical Aesthetics',
    supportEmail: 'hello@illuminatemedical.ph',
    timezone: 'Asia/Manila',
    currency: 'PHP',
  })
  const [rules, setRules] = useState({
    earnRate: '1 point per ₱10 spent',
    redeemRate: '1 point = ₱10 service credit',
    cashInRule: 'Enabled for all memberships',
  })
  const [showBranchForm, setShowBranchForm] = useState(false)
  const [branchForm, setBranchForm] = useState({
    name: '',
    address: '',
    status: 'active' as Branch['status'],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const [{ data: settings }, { data: branchRows }] = await Promise.all([
      supabase.from('clinic_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('branches').select('*').order('name'),
    ])

    if (settings) {
      const s = settings as SettingsRow
      setProfile({
        brandName: s.brand_name,
        supportEmail: s.support_email,
        timezone: s.timezone,
        currency: s.currency,
      })
      setRules({
        earnRate: s.earn_rate,
        redeemRate: s.redeem_rate,
        cashInRule: s.cash_in_rule,
      })
    }

    if (branchRows?.length) {
      setBranches(
        branchRows.map((b) => ({
          id: b.id,
          name: b.name,
          address: b.address ?? '',
          status: b.status as Branch['status'],
        })),
      )
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('clinic_settings').upsert({
      id: 1,
      brand_name: profile.brandName,
      support_email: profile.supportEmail,
      timezone: profile.timezone,
      currency: profile.currency,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (err) setError(err.message)
    else setMessage('Clinic profile saved.')
  }

  async function saveRules(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('clinic_settings').upsert({
      id: 1,
      earn_rate: rules.earnRate,
      redeem_rate: rules.redeemRate,
      cash_in_rule: rules.cashInRule,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (err) setError(err.message)
    else setMessage('Loyalty rules saved.')
  }

  async function addBranch(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('branches').insert({
      name: branchForm.name.trim(),
      address: branchForm.address.trim(),
      status: branchForm.status,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setBranchForm({ name: '', address: '', status: 'active' })
    setShowBranchForm(false)
    setMessage('Branch added. Refresh if it does not appear in the top bar yet.')
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="System"
        title="Settings"
        subtitle="Brand, branch readiness, loyalty rules, and clinic defaults connected to Supabase."
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Clinic Profile</h2>
          </div>
          <form className="panel-body stack" onSubmit={saveProfile}>
            <div className="field">
              <label>Brand Name</label>
              <input
                className="input"
                value={profile.brandName}
                onChange={(e) => setProfile((p) => ({ ...p, brandName: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Support Email</label>
              <input
                className="input"
                value={profile.supportEmail}
                onChange={(e) => setProfile((p) => ({ ...p, supportEmail: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Timezone</label>
              <select
                className="select"
                value={profile.timezone}
                onChange={(e) => setProfile((p) => ({ ...p, timezone: e.target.value }))}
              >
                <option value="Asia/Manila">Asia/Manila</option>
              </select>
            </div>
            <div className="field">
              <label>Currency</label>
              <select
                className="select"
                value={profile.currency}
                onChange={(e) => setProfile((p) => ({ ...p, currency: e.target.value }))}
              >
                <option value="PHP">PHP</option>
              </select>
            </div>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} type="submit" disabled={saving}>
              Save Profile
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Branches</h2>
          </div>
          <div className="panel-body">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Address</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((branch) => (
                    <tr key={branch.id}>
                      <td>
                        <strong>{branch.name}</strong>
                      </td>
                      <td>{branch.address}</td>
                      <td>
                        <span
                          className={`badge ${
                            branch.status === 'active' ? 'badge-success' : 'badge-warning'
                          }`}
                        >
                          {branch.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="btn btn-ghost"
              style={{ marginTop: 14 }}
              type="button"
              onClick={() => setShowBranchForm((v) => !v)}
            >
              {showBranchForm ? 'Cancel' : 'Add Branch'}
            </button>
            {showBranchForm ? (
              <form
                onSubmit={addBranch}
                style={{ marginTop: 14, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}
              >
                <div className="field">
                  <label>Name</label>
                  <input
                    className="input"
                    required
                    value={branchForm.name}
                    onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select
                    className="select"
                    value={branchForm.status}
                    onChange={(e) =>
                      setBranchForm((f) => ({ ...f, status: e.target.value as Branch['status'] }))
                    }
                  >
                    <option value="active">active</option>
                    <option value="coming-soon">coming-soon</option>
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Address</label>
                  <input
                    className="input"
                    value={branchForm.address}
                    onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  Save branch
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Loyalty Rules</h2>
          </div>
          <form className="panel-body stack" onSubmit={saveRules}>
            <div className="field">
              <label>Earn Rate</label>
              <input
                className="input"
                value={rules.earnRate}
                onChange={(e) => setRules((r) => ({ ...r, earnRate: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Redeem Rate</label>
              <input
                className="input"
                value={rules.redeemRate}
                onChange={(e) => setRules((r) => ({ ...r, redeemRate: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Cash-in Wallet</label>
              <input
                className="input"
                value={rules.cashInRule}
                onChange={(e) => setRules((r) => ({ ...r, cashInRule: e.target.value }))}
              />
            </div>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} type="submit" disabled={saving}>
              Save Rules
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Supabase Connection</h2>
          </div>
          <div className="panel-body stack">
            <div className="field">
              <label>Project URL</label>
              <input
                className="input"
                value={import.meta.env.VITE_SUPABASE_URL ?? ''}
                readOnly
              />
            </div>
            <div className="field">
              <label>Anon Key</label>
              <input className="input" value="Stored in .env (hidden)" disabled />
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              Connected via environment variables. Run <code>supabase/setup.sql</code> in your
              Supabase SQL Editor if tables are missing.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
