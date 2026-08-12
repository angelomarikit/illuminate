import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export type CareComment = {
  id: string
  customer_id: string | null
  session_package_id: string | null
  author_name: string
  body: string
  created_at: string
}

type Props = {
  customerId?: string | null
  sessionPackageId?: string | null
  doctorNotes: string
  onSaveDoctorNotes: (notes: string) => Promise<void>
  savingNotes?: boolean
  compact?: boolean
}

export function CareNotesPanel({
  customerId,
  sessionPackageId,
  doctorNotes,
  onSaveDoctorNotes,
  savingNotes,
  compact,
}: Props) {
  const { user } = useAuth()
  const [draft, setDraft] = useState(doctorNotes)
  const [comments, setComments] = useState<CareComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft(doctorNotes)
  }, [doctorNotes])

  const loadComments = useCallback(async () => {
    if (!customerId && !sessionPackageId) {
      setComments([])
      return
    }
    setLoading(true)
    setError('')
    let q = supabase
      .from('client_care_comments')
      .select('id, customer_id, session_package_id, author_name, body, created_at')
      .order('created_at', { ascending: true })

    if (sessionPackageId) {
      q = q.eq('session_package_id', sessionPackageId)
    } else if (customerId) {
      q = q.eq('customer_id', customerId)
    }

    const { data, error: err } = await q
    setLoading(false)
    if (err) {
      setError(
        err.message.includes('client_care_comments') || err.message.includes('schema cache')
          ? `${err.message} — run supabase/add_pos_attribution.sql in Supabase.`
          : err.message,
      )
      setComments([])
      return
    }
    setComments((data as CareComment[]) ?? [])
  }, [customerId, sessionPackageId])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  async function saveNotes() {
    setError('')
    try {
      await onSaveDoctorNotes(draft)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save notes')
    }
  }

  async function postComment() {
    const body = newComment.trim()
    if (!body) return
    if (!customerId && !sessionPackageId) return
    setPosting(true)
    setError('')
    const { error: err } = await supabase.from('client_care_comments').insert({
      customer_id: customerId || null,
      session_package_id: sessionPackageId || null,
      author_name: user?.name ?? 'Staff',
      body,
    })
    setPosting(false)
    if (err) {
      setError(err.message)
      return
    }
    setNewComment('')
    await loadComments()
  }

  return (
    <div style={{ display: 'grid', gap: compact ? 10 : 12 }}>
      <div>
        <div
          style={{
            fontSize: '0.72rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 6,
          }}
        >
          Doctor&apos;s notes
        </div>
        <textarea
          className="input"
          rows={compact ? 3 : 4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Doctor advice, treatment plan, precautions…"
          style={{ resize: 'vertical', minHeight: compact ? 72 : 96 }}
        />
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          style={{ marginTop: 8 }}
          disabled={savingNotes || draft === doctorNotes}
          onClick={saveNotes}
        >
          {savingNotes ? 'Saving…' : 'Save notes'}
        </button>
      </div>

      <div>
        <div
          style={{
            fontSize: '0.72rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 6,
          }}
        >
          Comments
        </div>
        {loading ? (
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.88rem' }}>Loading…</p>
        ) : comments.length === 0 ? (
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.88rem' }}>No comments yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            {comments.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  background: 'var(--surface-muted, #fafafa)',
                  fontSize: '0.88rem',
                }}
              >
                <div style={{ fontWeight: 600 }}>{c.author_name}</div>
                <div style={{ marginTop: 2 }}>{c.body}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
                  {new Date(c.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
        <textarea
          className="input"
          rows={2}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment for staff…"
          style={{ resize: 'vertical' }}
        />
        <button
          className="btn btn-primary btn-sm"
          type="button"
          style={{ marginTop: 8 }}
          disabled={posting || !newComment.trim()}
          onClick={postComment}
        >
          {posting ? 'Posting…' : 'Add comment'}
        </button>
      </div>

      {error ? (
        <p style={{ color: 'var(--danger)', margin: 0, fontSize: '0.85rem' }}>{error}</p>
      ) : null}
    </div>
  )
}
