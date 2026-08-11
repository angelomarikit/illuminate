import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

type FeedbackRow = {
  id: string
  client_name: string
  treatment: string
  rating: number
  quote: string
  sort_order: number
  is_published: boolean
  created_at: string
}

const empty = {
  clientName: '',
  treatment: '',
  rating: 5,
  quote: '',
  sortOrder: '0',
}

function AdminStars({
  value,
  onChange,
}: {
  value: number
  onChange?: (n: number) => void
}) {
  return (
    <span className="feedback-admin-stars" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => {
        const n = i + 1
        const filled = n <= value
        if (onChange) {
          return (
            <button
              key={n}
              type="button"
              className={filled ? 'is-filled' : 'is-empty'}
              onClick={() => onChange(n)}
              aria-label={`Set rating ${n}`}
            >
              <Star size={18} strokeWidth={1.6} fill={filled ? 'currentColor' : 'none'} />
            </button>
          )
        }
        return (
          <span key={n} className={filled ? 'is-filled' : 'is-empty'}>
            <Star size={16} strokeWidth={1.6} fill={filled ? 'currentColor' : 'none'} />
          </span>
        )
      })}
    </span>
  )
}

export function FeedbackAdmin() {
  const { user } = useAuth()
  const [items, setItems] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('client_feedback')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else {
      setError('')
      setItems((data as FeedbackRow[] | null) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    const { error: err } = await supabase.from('client_feedback').insert({
      client_name: form.clientName.trim(),
      treatment: form.treatment.trim(),
      rating: form.rating,
      quote: form.quote.trim(),
      sort_order: Number(form.sortOrder) || 0,
      is_published: true,
      created_by: user?.id ?? null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setForm(empty)
    setShowForm(false)
    setMessage('Feedback added to the landing slider.')
    await load()
  }

  async function togglePublished(row: FeedbackRow) {
    setError('')
    const { error: err } = await supabase
      .from('client_feedback')
      .update({ is_published: !row.is_published, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(row.is_published ? 'Hidden from landing page.' : 'Published on landing page.')
    await load()
  }

  async function remove(row: FeedbackRow) {
    if (!window.confirm(`Remove feedback from ${row.client_name}?`)) return
    setError('')
    const { error: err } = await supabase.from('client_feedback').delete().eq('id', row.id)
    if (err) {
      setError(err.message)
      return
    }
    setMessage('Feedback removed.')
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="Landing"
        title="Client Feedback"
        subtitle="Add star-rated reviews for the public landing slider. Only Owner and Admin can manage these."
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Add Feedback'}
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {showForm ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">New feedback</h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={onAdd}
              style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              <div className="field">
                <label>Client name</label>
                <input
                  className="input"
                  required
                  value={form.clientName}
                  onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                  placeholder="e.g. Marielle S."
                />
              </div>
              <div className="field">
                <label>Treatment</label>
                <input
                  className="input"
                  value={form.treatment}
                  onChange={(e) => setForm((f) => ({ ...f, treatment: e.target.value }))}
                  placeholder="e.g. Facial treatment"
                />
              </div>
              <div className="field">
                <label>Sort order</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Star rating</label>
                <AdminStars value={form.rating} onChange={(n) => setForm((f) => ({ ...f, rating: n }))} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Quote</label>
                <textarea
                  className="textarea"
                  required
                  rows={4}
                  value={form.quote}
                  onChange={(e) => setForm((f) => ({ ...f, quote: e.target.value }))}
                  placeholder="What the client shared about their visit…"
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Publish feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">All reviews</h2>
        </div>
        <div className="panel-body">
          {loading ? (
            <p className="muted">Loading feedback…</p>
          ) : items.length === 0 ? (
            <p className="muted">No feedback yet. Add the first review for the landing slider.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Treatment</th>
                    <th>Rating</th>
                    <th>Quote</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.client_name}</strong>
                        <div className="muted" style={{ fontSize: '0.78rem' }}>
                          Order {row.sort_order}
                        </div>
                      </td>
                      <td>{row.treatment || '—'}</td>
                      <td>
                        <AdminStars value={row.rating} />
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <span className="muted">{row.quote}</span>
                      </td>
                      <td>
                        <button
                          className="btn btn-soft btn-sm"
                          type="button"
                          onClick={() => togglePublished(row)}
                        >
                          {row.is_published ? 'Published' : 'Hidden'}
                        </button>
                      </td>
                      <td>
                        <button
                          className="btn-icon"
                          type="button"
                          aria-label={`Delete ${row.client_name}`}
                          onClick={() => remove(row)}
                        >
                          <Trash2 size={16} />
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
  )
}
