import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import { isUuid } from '../lib/utils'
import type { Consultation } from '../types'
import './consultations.css'

type Row = {
  id: string
  branch_id: string | null
  customer_name: string
  treatment: string
  notes: string | null
  ai_summary: string | null
  before_image_path: string | null
  after_image_path: string | null
  consultation_date: string
}

function publicUrl(path: string | null) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  const { data } = supabase.storage.from('consultations').getPublicUrl(path)
  return data.publicUrl
}

export function Consultations() {
  const { branchId } = useBranch()
  const [rows, setRows] = useState<Consultation[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    customerName: '',
    treatment: '',
    notes: '',
    aiSummary: '',
    date: new Date().toISOString().slice(0, 10),
  })
  const [beforeFile, setBeforeFile] = useState<File | null>(null)
  const [afterFile, setAfterFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    let q = supabase.from('consultations').select('*').order('consultation_date', { ascending: false })
    if (isUuid(branchId)) q = q.eq('branch_id', branchId)
    const { data, error: err } = await q
    if (err) {
      setError(err.message)
      return
    }
    setRows(
      (data as Row[] | null)?.map((row) => ({
        id: row.id,
        customerName: row.customer_name,
        treatment: row.treatment,
        notes: row.notes ?? '',
        aiSummary: row.ai_summary ?? '',
        beforeImage: publicUrl(row.before_image_path),
        afterImage: publicUrl(row.after_image_path),
        date: row.consultation_date,
        branchId: row.branch_id ?? '',
      })) ?? [],
    )
  }, [branchId])

  useEffect(() => {
    load()
  }, [load])

  async function upload(file: File, folder: string) {
    const path = `${folder}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
    const { error: upErr } = await supabase.storage.from('consultations').upload(path, file)
    if (upErr) throw upErr
    return path
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      let beforePath: string | null = null
      let afterPath: string | null = null
      if (beforeFile) beforePath = await upload(beforeFile, 'before')
      if (afterFile) afterPath = await upload(afterFile, 'after')

      const summary =
        form.aiSummary.trim() ||
        `AI draft: ${form.treatment} for ${form.customerName}. Review clinician notes and schedule follow-up as needed.`

      const { error: err } = await supabase.from('consultations').insert({
        customer_name: form.customerName.trim(),
        treatment: form.treatment.trim(),
        notes: form.notes.trim() || null,
        ai_summary: summary,
        before_image_path: beforePath,
        after_image_path: afterPath,
        consultation_date: form.date,
        branch_id: isUuid(branchId) ? branchId : null,
      })
      if (err) throw err

      setShowForm(false)
      setForm({
        customerName: '',
        treatment: '',
        notes: '',
        aiSummary: '',
        date: new Date().toISOString().slice(0, 10),
      })
      setBeforeFile(null)
      setAfterFile(null)
      setMessage('Consultation saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save consultation.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Clinical"
        title="AI Consultations"
        subtitle="Before & after documentation with AI summaries to support treatment planning and follow-ups."
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'New Consultation'}
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {showForm ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">New consultation</h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={onSubmit}
              style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              <div className="field">
                <label>Client</label>
                <input
                  className="input"
                  required
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Treatment</label>
                <input
                  className="input"
                  required
                  value={form.treatment}
                  onChange={(e) => setForm((f) => ({ ...f, treatment: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Date</label>
                <input
                  className="input"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Before image</label>
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setBeforeFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="field">
                <label>After image</label>
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAfterFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Clinician notes</label>
                <textarea
                  className="textarea"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>AI summary (optional)</label>
                <textarea
                  className="textarea"
                  value={form.aiSummary}
                  onChange={(e) => setForm((f) => ({ ...f, aiSummary: e.target.value }))}
                  placeholder="Leave blank to auto-generate a draft summary"
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save consultation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="consult-grid">
        {rows.length === 0 ? (
          <div className="panel">
            <div className="empty-state">No consultations yet. Create one to upload before/after photos.</div>
          </div>
        ) : (
          rows.map((item) => (
            <article className="panel consult-card" key={item.id}>
              <div className="panel-body">
                <div className="consult-head">
                  <div>
                    <div className="page-kicker">{item.date}</div>
                    <h2 className="panel-title">{item.customerName}</h2>
                    <p className="page-subtitle" style={{ marginTop: 4 }}>
                      {item.treatment}
                    </p>
                  </div>
                  <span className="badge badge-neutral">AI Review</span>
                </div>

                <div className="ba-grid">
                  <figure>
                    {item.beforeImage ? (
                      <img src={item.beforeImage} alt={`${item.customerName} before`} />
                    ) : (
                      <div className="empty-state">No before image</div>
                    )}
                    <figcaption>Before</figcaption>
                  </figure>
                  <figure>
                    {item.afterImage ? (
                      <img src={item.afterImage} alt={`${item.customerName} after`} />
                    ) : (
                      <div className="empty-state">No after image</div>
                    )}
                    <figcaption>After</figcaption>
                  </figure>
                </div>

                <div className="consult-notes">
                  <strong>Clinician notes</strong>
                  <p>{item.notes || '—'}</p>
                </div>
                <div className="consult-ai">
                  <strong>AI summary</strong>
                  <p>{item.aiSummary || '—'}</p>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}
