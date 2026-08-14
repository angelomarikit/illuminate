import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, Eye, EyeOff, RefreshCw, UserPlus, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { type AppRole, normalizeRole, roleLabel } from '../lib/roles'
import { supabase } from '../lib/supabase'

type ProvisionRow = {
  id: string
  user_id: string
  full_name: string
  email: string
  phone: string | null
  birthday: string | null
  age: number | null
  gender: string | null
  address: string | null
  role: string
  created_by_name: string
  created_at: string
}

type FormState = {
  fullName: string
  email: string
  phone: string
  birthday: string
  age: string
  gender: string
  address: string
  role: AppRole
  password: string
  createdByName: string
}

function ageFromBirthday(birthday: string) {
  if (!birthday) return ''
  const born = new Date(`${birthday}T12:00:00`)
  if (Number.isNaN(born.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - born.getFullYear()
  const md = today.getMonth() - born.getMonth()
  if (md < 0 || (md === 0 && today.getDate() < born.getDate())) age -= 1
  return age > 0 ? String(age) : ''
}

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (n) => chars[n % chars.length]).join('')
}

function formatCreatedAt(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function CreateAccount() {
  const { user } = useAuth()
  const callerRole = normalizeRole(user?.role)
  const [rows, setRows] = useState<ProvisionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showSuccess, setShowSuccess] = useState<{
    fullName: string
    email: string
    role: string
    password: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [revealSavingId, setRevealSavingId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})

  const roleOptions = useMemo(() => {
    const all: AppRole[] = ['Receptionist', 'Inventory', 'HR', 'Admin', 'Owner', 'Client']
    if (callerRole === 'Owner') return all
    if (callerRole === 'Admin') return all.filter((r) => r !== 'Owner')
    return all.filter((r) => r !== 'Owner' && r !== 'Admin')
  }, [callerRole])

  const emptyForm = useCallback(
    (): FormState => ({
      fullName: '',
      email: '',
      phone: '',
      birthday: '',
      age: '',
      gender: '',
      address: '',
      role: 'Receptionist',
      password: generatePassword(),
      createdByName: user?.name || '',
    }),
    [user?.name],
  )

  const [form, setForm] = useState<FormState>(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('provisioned_accounts')
      .select(
        'id, user_id, full_name, email, phone, birthday, age, gender, address, role, created_by_name, created_at',
      )
      .order('created_at', { ascending: false })
    if (err) {
      setError(
        err.message.includes('provisioned_accounts') || err.message.includes('schema cache')
          ? `${err.message} — run supabase/add_create_account.sql in Supabase.`
          : err.message,
      )
      setRows([])
    } else {
      setRows((data as ProvisionRow[] | null) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setFormError('')
    setForm(emptyForm())
    setShowPassword(false)
    setShowCreate(true)
  }

  function closeCreate() {
    if (saving) return
    setShowCreate(false)
    setFormError('')
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.createdByName.trim()) {
      setFormError('Who created this account is required.')
      return
    }
    if (form.password.trim().length < 8) {
      setFormError('Password must be at least 8 characters.')
      return
    }

    setSaving(true)
    const { data, error: err } = await supabase.rpc('create_clinic_account', {
      p_full_name: form.fullName.trim(),
      p_email: form.email.trim(),
      p_phone: form.phone.trim(),
      p_birthday: form.birthday || null,
      p_age: form.age ? Number(form.age) : null,
      p_gender: form.gender || null,
      p_address: form.address.trim() || null,
      p_role: form.role,
      p_password: form.password,
      p_created_by_name: form.createdByName.trim(),
    })
    setSaving(false)

    if (err) {
      setFormError(
        err.message.includes('create_clinic_account') || err.message.includes('schema cache')
          ? `${err.message} — run supabase/add_create_account.sql in Supabase.`
          : err.message,
      )
      return
    }

    const result = data as {
      full_name?: string
      email?: string
      role?: string
      password?: string
    } | null

    setShowCreate(false)
    setShowSuccess({
      fullName: result?.full_name || form.fullName.trim(),
      email: result?.email || form.email.trim(),
      role: result?.role || form.role,
      password: result?.password || form.password,
    })
    await load()
  }

  async function revealAccountPassword(row: ProvisionRow) {
    if (revealed[row.id]) {
      setRevealed((prev) => {
        const next = { ...prev }
        delete next[row.id]
        return next
      })
      return
    }

    setRevealSavingId(row.id)
    setError('')
    const { data, error: rpcErr } = await supabase.rpc('reveal_provisioned_password', {
      p_provision_id: row.id,
    })
    setRevealSavingId(null)

    if (rpcErr) {
      setError(rpcErr.message)
      return
    }

    setRevealed((prev) => ({ ...prev, [row.id]: String(data || '') }))
  }

  return (
    <div>
      <PageHeader
        kicker="HR"
        title="Create account"
        subtitle="Provision clinic logins for staff, HR, inventory, and other roles. Accounts are ready to sign in immediately."
        actions={
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <UserPlus size={16} />
            New account
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Provisioned accounts</h2>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading accounts…</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              No provisioned accounts yet. Click <strong>New account</strong> to create one.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Role</th>
                    <th>Created by</th>
                    <th>Password</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const plain = revealed[row.id]
                    return (
                      <tr key={row.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatCreatedAt(row.created_at)}</td>
                        <td>
                          <strong>{row.full_name}</strong>
                          <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                            {[row.gender, row.age != null ? `${row.age}y` : null]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </div>
                        </td>
                        <td>
                          <div>{row.email}</div>
                          <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                            {row.phone || '—'}
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-neutral">{roleLabel(row.role)}</span>
                        </td>
                        <td>{row.created_by_name}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <code
                              style={{
                                fontSize: '0.85rem',
                                letterSpacing: plain ? '0.02em' : '0.12em',
                              }}
                            >
                              {plain || '••••••••••••'}
                            </code>
                            <button
                              className="btn-icon"
                              type="button"
                              aria-label={plain ? 'Hide password' : 'Reveal password'}
                              title={plain ? 'Hide password' : 'Reveal password'}
                              disabled={revealSavingId === row.id}
                              onClick={() => void revealAccountPassword(row)}
                            >
                              {plain ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ marginTop: 12, fontSize: '0.82rem' }}>
            Passwords are masked by default — use the eye icon to show or hide them.
            {callerRole === 'HR' ? ' HR cannot create Owner or Admin accounts.' : null}
          </p>
        </div>
      </div>

      {showCreate ? (
        <div className="confirm-modal-overlay" role="presentation">
          <form
            className="confirm-modal"
            style={{
              maxWidth: 640,
              width: 'min(640px, calc(100vw - 32px))',
              maxHeight: 'min(90vh, 900px)',
              overflow: 'auto',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-account-title"
            onSubmit={onCreate}
          >
            <div className="confirm-modal-header">
              <div>
                <p className="confirm-modal-kicker">Provision login</p>
                <h2 id="create-account-title" className="confirm-modal-title">
                  Create new account
                </h2>
              </div>
              <button
                className="btn-icon"
                type="button"
                aria-label="Close"
                onClick={closeCreate}
                disabled={saving}
              >
                <X size={16} />
              </button>
            </div>

            <div className="confirm-modal-body">
              <p className="confirm-modal-text">
                The account is created in Auth with email confirmed, so the person can sign in right
                away with the password below.
              </p>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  marginTop: 14,
                }}
              >
                <p className="form-req-note" style={{ gridColumn: '1 / -1' }}>
                  Fields marked with <span className="req" aria-hidden="true">*</span> are required.
                </p>

                <div className="field">
                  <label>
                    Full name <span className="req">*</span>
                  </label>
                  <input
                    className="input"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>
                    Email <span className="req">*</span>
                  </label>
                  <input
                    className="input"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>
                    Phone number <span className="req">*</span>
                  </label>
                  <input
                    className="input"
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>
                    Role <span className="req">*</span>
                  </label>
                  <select
                    className="select"
                    required
                    value={form.role}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, role: e.target.value as AppRole }))
                    }
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Birthday</label>
                  <input
                    className="input"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={form.birthday}
                    onChange={(e) => {
                      const birthday = e.target.value
                      setForm((f) => ({
                        ...f,
                        birthday,
                        age: ageFromBirthday(birthday) || f.age,
                      }))
                    }}
                  />
                </div>
                <div className="field">
                  <label>Age</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={120}
                    value={form.age}
                    onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Gender</label>
                  <select
                    className="select"
                    value={form.gender}
                    onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                  >
                    <option value="">Select</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div className="field">
                  <label>
                    Who created this account <span className="req">*</span>
                  </label>
                  <input
                    className="input"
                    required
                    value={form.createdByName}
                    onChange={(e) => setForm((f) => ({ ...f, createdByName: e.target.value }))}
                    placeholder="Your name"
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Address</label>
                  <input
                    className="input"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>
                    Password <span className="req">*</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        className="input"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        style={{ paddingRight: 42, width: '100%' }}
                      />
                      <button
                        className="btn-icon"
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((v) => !v)}
                        style={{
                          position: 'absolute',
                          right: 4,
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => {
                        setForm((f) => ({ ...f, password: generatePassword() }))
                        setShowPassword(true)
                      }}
                    >
                      <RefreshCw size={15} />
                      Generate
                    </button>
                  </div>
                </div>
              </div>

              {formError ? (
                <p style={{ color: 'var(--danger)', margin: '12px 0 0', fontSize: '0.9rem' }}>
                  {formError}
                </p>
              ) : null}
            </div>

            <div className="confirm-modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={closeCreate}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showSuccess ? (
        <div
          className="confirm-modal-overlay"
          role="presentation"
          onClick={() => setShowSuccess(null)}
        >
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-success-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div>
                <p className="confirm-modal-kicker">Success</p>
                <h2 id="create-success-title" className="confirm-modal-title">
                  Account created
                </h2>
              </div>
              <button
                className="btn-icon"
                type="button"
                aria-label="Close"
                onClick={() => setShowSuccess(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="confirm-modal-body">
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  marginBottom: 14,
                }}
              >
                <CheckCircle2 size={28} color="#2f9e6b" />
                <p className="confirm-modal-text" style={{ margin: 0 }}>
                  <strong>{showSuccess.fullName}</strong> can sign in now with the credentials below.
                  Share them securely.
                </p>
              </div>
              <div className="confirm-modal-meta">
                <div>
                  <span className="confirm-modal-label">Email</span>
                  <strong>{showSuccess.email}</strong>
                </div>
                <div>
                  <span className="confirm-modal-label">Role</span>
                  <strong>{roleLabel(showSuccess.role)}</strong>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span className="confirm-modal-label">Password</span>
                  <strong style={{ fontFamily: 'ui-monospace, monospace' }}>
                    {showSuccess.password}
                  </strong>
                </div>
              </div>
            </div>
            <div className="confirm-modal-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setShowSuccess(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}
