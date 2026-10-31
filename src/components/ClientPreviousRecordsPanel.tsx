import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ImagePlus, Trash2, X } from 'lucide-react'
import { StatusMessage } from './StatusMessage'
import { useAuth } from '../context/AuthContext'
import { canDeleteClinicData, isClinicRole } from '../lib/roles'
import { isUuid } from '../lib/utils'
import { supabase } from '../lib/supabase'
import './ClientPreviousRecordsPanel.css'

type RecordRow = {
  id: string
  file_name: string
  file_url: string
  storage_path: string
  caption: string | null
  record_date: string | null
  uploaded_by_name: string | null
  created_at: string
}

type Props = {
  customerId: string
  customerName: string
}

export function ClientPreviousRecordsPanel({ customerId, customerName }: Props) {
  const { user } = useAuth()
  const canUpload = isClinicRole(user?.role)
  const canDelete = canDeleteClinicData(user?.role)
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [caption, setCaption] = useState('')
  const [recordDate, setRecordDate] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('customer_previous_records')
      .select(
        'id, file_name, file_url, storage_path, caption, record_date, uploaded_by_name, created_at',
      )
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
    if (err) {
      setError(
        err.message.includes('customer_previous_records') || err.message.includes('schema cache')
          ? `${err.message} — run supabase/add_customer_previous_records.sql in Supabase.`
          : err.message,
      )
      setRows([])
    } else {
      setRows((data as RecordRow[] | null) ?? [])
    }
    setLoading(false)
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !canUpload) return

    const okType = /^image\/(png|jpe?g|webp|gif)$/i.test(file.type)
    if (!okType) {
      setError('Upload a screenshot image (PNG, JPG, WEBP, or GIF).')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Image must be 12 MB or smaller.')
      return
    }

    setUploading(true)
    setError('')
    setMessage('')
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const safeExt = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
      const path = `${customerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
      const { error: uploadErr } = await supabase.storage
        .from('customer-previous-records')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || `image/${safeExt}`,
        })
      if (uploadErr) {
        throw new Error(
          uploadErr.message.includes('Bucket') || uploadErr.message.includes('not found')
            ? `${uploadErr.message} — run supabase/add_customer_previous_records.sql in Supabase.`
            : uploadErr.message,
        )
      }
      const { data: urlData } = supabase.storage.from('customer-previous-records').getPublicUrl(path)
      const { error: rowErr } = await supabase.from('customer_previous_records').insert({
        customer_id: customerId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        storage_path: path,
        caption: caption.trim() || null,
        record_date: recordDate || null,
        uploaded_by: user?.id && isUuid(user.id) ? user.id : null,
        uploaded_by_name: user?.name || null,
      })
      if (rowErr) throw new Error(rowErr.message)
      setCaption('')
      setRecordDate('')
      setMessage(`Saved previous record for ${customerName}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload screenshot.')
    } finally {
      setUploading(false)
    }
  }

  async function removeRow(row: RecordRow) {
    if (!canDelete) return
    setError('')
    const { error: delErr } = await supabase
      .from('customer_previous_records')
      .delete()
      .eq('id', row.id)
    if (delErr) {
      setError(delErr.message)
      return
    }
    await supabase.storage.from('customer-previous-records').remove([row.storage_path])
    setMessage('Previous record removed.')
    await load()
  }

  return (
    <div className="cpr-panel">
      <StatusMessage error={error} message={message} />

      <section className="cpr-intro">
        <h3>Previous records (old system)</h3>
        <p>
          Upload screenshots of paper or old-software history for this client. Files stay on their
          profile for staff to review.
        </p>
      </section>

      {canUpload ? (
        <div className="customer-consent-upload cpr-upload">
          <div className="cpr-upload-fields">
            <div className="field">
              <label htmlFor="cpr-caption">Caption (optional)</label>
              <input
                id="cpr-caption"
                className="input"
                value={caption}
                disabled={uploading}
                placeholder="e.g. 2024 treatment card, page 1"
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="cpr-date">Record date (optional)</label>
              <input
                id="cpr-date"
                className="input"
                type="date"
                value={recordDate}
                disabled={uploading}
                onChange={(e) => setRecordDate(e.target.value)}
              />
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => void onPickFile(e)}
          />
          <button
            type="button"
            className={`customer-consent-file-btn ${uploading ? 'is-busy' : ''}`}
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus size={16} />
            {uploading ? 'Uploading…' : 'Upload screenshot'}
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="cpr-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="cpr-empty">No previous-record screenshots yet.</p>
      ) : (
        <ul className="cpr-grid">
          {rows.map((row) => (
            <li key={row.id} className="cpr-card">
              <button
                type="button"
                className="cpr-thumb"
                onClick={() => setPreviewUrl(row.file_url)}
                aria-label={`View ${row.file_name}`}
              >
                <img src={row.file_url} alt={row.caption || row.file_name} loading="lazy" />
              </button>
              <div className="cpr-meta">
                <strong>{row.caption || row.file_name}</strong>
                <span>
                  {row.record_date
                    ? new Date(`${row.record_date}T12:00:00`).toLocaleDateString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'No date'}
                  {row.uploaded_by_name ? ` · ${row.uploaded_by_name}` : ''}
                </span>
              </div>
              {canDelete ? (
                <button
                  type="button"
                  className="btn-icon"
                  aria-label="Delete"
                  onClick={() => void removeRow(row)}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {previewUrl ? (
        <div
          className="confirm-modal-overlay cpr-preview-overlay"
          role="presentation"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="cpr-preview"
            role="dialog"
            aria-modal="true"
            aria-label="Previous record preview"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="btn-icon cpr-preview-close"
              aria-label="Close"
              onClick={() => setPreviewUrl(null)}
            >
              <X size={16} />
            </button>
            <img src={previewUrl} alt="Previous record" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
