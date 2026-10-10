import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MessageSquareText, RefreshCw, Send } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { invokeSendSms } from '../lib/sms'
import { supabase } from '../lib/supabase'
import './SmsReminders.css'

type SmsSettings = {
  confirmation_enabled: boolean
  reminder_enabled: boolean
  reminder_minutes_before: number
  confirmation_template: string
  reminder_template: string
  updated_at?: string
}

type SmsLog = {
  id: string
  appointment_id: string | null
  customer_name: string | null
  phone: string
  kind: 'confirmation' | 'reminder' | 'test'
  message: string
  status: 'queued' | 'sent' | 'failed'
  itexmo_reference_id: string | null
  error: string | null
  scheduled_for: string | null
  sent_at: string | null
  created_at: string
}

const PRESETS = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '1 day', value: 1440 },
] as const

const DEFAULT_SETTINGS: SmsSettings = {
  confirmation_enabled: true,
  reminder_enabled: true,
  reminder_minutes_before: 60,
  confirmation_template:
    'Hi {name}, your {service} is confirmed on {date} at {time}. - Illuminate Medical Aesthetics',
  reminder_template:
    'Reminder: {name}, your {service} is coming up ({date} {time}). See you soon! - Illuminate',
}

function formatWhen(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function SmsReminders() {
  const [settings, setSettings] = useState<SmsSettings>(DEFAULT_SETTINGS)
  const [logs, setLogs] = useState<SmsLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [runningReminders, setRunningReminders] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [testKind, setTestKind] = useState<'confirmation' | 'reminder'>('confirmation')
  const [customMinutes, setCustomMinutes] = useState('60')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [{ data: settingsRow, error: settingsErr }, { data: logRows, error: logsErr }] =
      await Promise.all([
        supabase.from('sms_settings').select('*').eq('id', 1).maybeSingle(),
        supabase
          .from('sms_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(80),
      ])

    if (settingsErr || logsErr) {
      const msg = settingsErr?.message || logsErr?.message || 'Load failed'
      setError(
        msg.includes('sms_settings') || msg.includes('sms_logs') || msg.includes('schema cache')
          ? `${msg} — run supabase/add_sms_reminders.sql in Supabase.`
          : msg,
      )
    } else if (settingsRow) {
      const s = settingsRow as SmsSettings
      setSettings(s)
      setCustomMinutes(String(s.reminder_minutes_before || 60))
    }
    setLogs((logRows as SmsLog[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onSaveSettings(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    const minutes = Math.max(5, Math.min(10080, Math.floor(Number(customMinutes) || 60)))
    const payload = {
      confirmation_enabled: settings.confirmation_enabled,
      reminder_enabled: settings.reminder_enabled,
      reminder_minutes_before: minutes,
      confirmation_template: settings.confirmation_template.trim(),
      reminder_template: settings.reminder_template.trim(),
      updated_at: new Date().toISOString(),
    }
    const { error: updErr } = await supabase.from('sms_settings').update(payload).eq('id', 1)
    setSaving(false)
    if (updErr) {
      setError(
        updErr.message.includes('sms_settings')
          ? `${updErr.message} — run supabase/add_sms_reminders.sql in Supabase.`
          : updErr.message,
      )
      return
    }
    setSettings((s) => ({ ...s, ...payload }))
    setCustomMinutes(String(minutes))
    setMessage('SMS settings saved.')
  }

  async function onSendTest(e: FormEvent) {
    e.preventDefault()
    if (!testPhone.trim()) {
      setError('Enter a phone number to test (09XXXXXXXXX).')
      return
    }
    setTesting(true)
    setError('')
    setMessage('')
    const result = await invokeSendSms('send_test', {
      phone: testPhone.trim(),
      templateKind: testKind,
    })
    setTesting(false)
    if (!result.ok) {
      setError(result.error || 'Test SMS failed. Check Edge Function secrets and deploy.')
      await load()
      return
    }
    setMessage(`Test SMS sent to ${result.phone || testPhone}.`)
    await load()
  }

  async function onRunRemindersNow() {
    setRunningReminders(true)
    setError('')
    setMessage('')
    const result = await invokeSendSms('send_due_reminders')
    setRunningReminders(false)
    if (result.error && !result.ok) {
      setError(result.error)
      await load()
      return
    }
    if (result.skipped) {
      setMessage(`Reminders skipped (${result.reason || 'disabled'}).`)
    } else {
      setMessage(`Reminder run finished · sent ${result.sent ?? 0}.`)
    }
    await load()
  }

  async function onCheckSecrets() {
    setError('')
    setMessage('')
    const result = await invokeSendSms('check_secrets')
    if (!result.ok && result.error) {
      setError(result.error)
      return
    }
    const r = result as {
      login?: string
      loginLength?: number
      passwordLength?: number
      apiCode?: string
    }
    setMessage(
      `Secrets loaded · login="${r.login || ''}" (${r.loginLength ?? 0} chars) · passwordLen=${r.passwordLength ?? 0} · apiCode=${r.apiCode || '(missing)'}`,
    )
  }

  return (
    <div className="sms-page">
      <PageHeader
        kicker="System"
        title="SMS reminders"
        subtitle="Itexmo booking confirmations and appointment reminders. Credentials stay in Edge Function secrets — never in the browser."
        actions={
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} style={{ marginRight: 6 }} />
            Refresh
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <form className="panel" style={{ marginBottom: 16 }} onSubmit={(e) => void onSaveSettings(e)}>
        <div className="panel-header">
          <h2 className="panel-title">
            <MessageSquareText size={16} style={{ marginRight: 8, verticalAlign: -2 }} />
            Templates &amp; timeline
          </h2>
        </div>
        <div className="panel-body sms-settings-grid">
          <div className="sms-toggles">
            <label className="sms-check">
              <input
                type="checkbox"
                checked={settings.confirmation_enabled}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, confirmation_enabled: e.target.checked }))
                }
              />
              Send confirmation SMS when a booking is confirmed
            </label>
            <label className="sms-check">
              <input
                type="checkbox"
                checked={settings.reminder_enabled}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, reminder_enabled: e.target.checked }))
                }
              />
              Send reminder SMS before the appointment
            </label>
          </div>

          <div className="field">
            <label>Reminder lead time</label>
            <div className="sms-presets">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`btn btn-sm ${
                    Number(customMinutes) === p.value ? 'btn-primary' : 'btn-ghost'
                  }`}
                  onClick={() => setCustomMinutes(String(p.value))}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="sms-custom-minutes">
              <input
                className="input"
                type="number"
                min={5}
                max={10080}
                step={5}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
              />
              <span>minutes before appointment</span>
            </div>
            <p className="sms-hint">
              Example: 60 = about 1 hour before. Cron should call the reminder runner every few
              minutes.
            </p>
          </div>

          <div className="field">
            <label htmlFor="sms-confirm-tpl">Confirmation message</label>
            <textarea
              id="sms-confirm-tpl"
              className="textarea"
              rows={4}
              value={settings.confirmation_template}
              onChange={(e) =>
                setSettings((s) => ({ ...s, confirmation_template: e.target.value }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor="sms-remind-tpl">Reminder message</label>
            <textarea
              id="sms-remind-tpl"
              className="textarea"
              rows={4}
              value={settings.reminder_template}
              onChange={(e) => setSettings((s) => ({ ...s, reminder_template: e.target.value }))}
            />
          </div>

          <p className="sms-hint">
            Placeholders: {'{name}'}, {'{service}'}, {'{date}'}, {'{time}'}, {'{branch}'}. Avoid
            emoji/special characters (Itexmo GSM-7BIT).
          </p>

          <div className="sms-actions">
            <button className="btn btn-primary" type="submit" disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={runningReminders || loading}
              onClick={() => void onRunRemindersNow()}
            >
              {runningReminders ? 'Running…' : 'Run due reminders now'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => void onCheckSecrets()}>
              Check Itexmo secrets
            </button>
          </div>
        </div>
      </form>

      <form className="panel" style={{ marginBottom: 16 }} onSubmit={(e) => void onSendTest(e)}>
        <div className="panel-header">
          <h2 className="panel-title">Test send</h2>
        </div>
        <div className="panel-body sms-test-grid">
          <div className="field">
            <label htmlFor="sms-test-phone">Phone</label>
            <input
              id="sms-test-phone"
              className="input"
              type="tel"
              placeholder="09XXXXXXXXX"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="sms-test-kind">Template</label>
            <select
              id="sms-test-kind"
              className="select"
              value={testKind}
              onChange={(e) => setTestKind(e.target.value as 'confirmation' | 'reminder')}
            >
              <option value="confirmation">Confirmation</option>
              <option value="reminder">Reminder</option>
            </select>
          </div>
          <div className="sms-actions">
            <button className="btn btn-primary" type="submit" disabled={testing}>
              <Send size={14} style={{ marginRight: 6 }} />
              {testing ? 'Sending…' : 'Send test SMS'}
            </button>
          </div>
        </div>
      </form>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Message log</h2>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="empty-state">No SMS sent yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Kind</th>
                    <th>To</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Message</th>
                    <th>Ref / error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id}>
                      <td>{formatWhen(row.sent_at || row.created_at)}</td>
                      <td>
                        <span className="badge">{row.kind}</span>
                      </td>
                      <td>{row.phone}</td>
                      <td>{row.customer_name || '—'}</td>
                      <td>
                        <span
                          className={`badge ${
                            row.status === 'sent'
                              ? 'badge-success'
                              : row.status === 'failed'
                                ? 'badge-danger'
                                : 'badge-warning'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="sms-msg-cell">{row.message}</td>
                      <td className="sms-ref-cell">
                        {row.itexmo_reference_id || row.error || '—'}
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
