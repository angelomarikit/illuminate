import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { StatusMessage } from './StatusMessage'
import type { SessionPackageForModal } from './SessionScheduleModal'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { formatCurrency, isUuid, receiptNumber } from '../lib/utils'
import { supabase } from '../lib/supabase'
import './InstallmentPaymentModal.css'

type ProfileOption = {
  id: string
  full_name: string
  role?: string
}

type InstallmentStatus = 'pending' | 'finished'

type SlotDraft = {
  id: string | null
  sessionNumber: number
  scheduledDate: string
  status: InstallmentStatus
  paymentAmount: string
  attendant: string
  saleId: string | null
  notes: string
  saving: boolean
}

type Props = {
  pkg: SessionPackageForModal
  open: boolean
  onClose: () => void
  onSaved: (message: string) => void
}

function emptySlots(total: number, used: number): SlotDraft[] {
  return Array.from({ length: Math.max(1, total) }, (_, i) => {
    const n = i + 1
    return {
      id: null,
      sessionNumber: n,
      scheduledDate: '',
      status: n <= used ? ('finished' as const) : ('pending' as const),
      paymentAmount: '',
      attendant: '',
      saleId: null,
      notes: '',
      saving: false,
    }
  })
}

function toStatus(raw: string | null | undefined, fallbackFinished: boolean): InstallmentStatus {
  if (raw === 'finished') return 'finished'
  if (raw) return 'pending'
  return fallbackFinished ? 'finished' : 'pending'
}

export function InstallmentPaymentModal({ pkg, open, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const { branchId } = useBranch()

  const [slots, setSlots] = useState<SlotDraft[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingPkg, setSavingPkg] = useState(false)

  const [totalPrice, setTotalPrice] = useState(String(pkg.package_amount || 0))
  const [soldOn, setSoldOn] = useState(pkg.sold_on?.slice(0, 10) || '')
  const [notes, setNotes] = useState(pkg.doctor_notes || '')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setMessage('')
    setTotalPrice(String(pkg.package_amount || 0))
    setSoldOn(pkg.sold_on?.slice(0, 10) || '')
    setNotes(pkg.doctor_notes || '')

    const [slotsRes, profRes] = await Promise.all([
      supabase
        .from('client_session_slots')
        .select(
          'id, session_number, scheduled_date, status, notes, payment_amount, attendant, sale_id',
        )
        .eq('package_id', pkg.id)
        .order('session_number'),
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .order('full_name'),
    ])

    setProfiles((profRes.data as ProfileOption[] | null) ?? [])

    if (slotsRes.error) {
      if (
        slotsRes.error.message.includes('client_session_slots') ||
        slotsRes.error.message.includes('schema cache') ||
        slotsRes.error.message.includes('payment_amount')
      ) {
        setError(
          `${slotsRes.error.message} — run supabase/add_client_session_slots.sql and add_session_installments.sql.`,
        )
      } else {
        setError(slotsRes.error.message)
      }
      setSlots(emptySlots(pkg.total_sessions, pkg.sessions_used))
      setLoading(false)
      return
    }

    const data = slotsRes.data ?? []
    if (!data.length) {
      setSlots(emptySlots(pkg.total_sessions, pkg.sessions_used))
    } else {
      const byNum = new Map(data.map((row) => [Number(row.session_number), row]))
      const total = Math.max(pkg.total_sessions, data.length)
      setSlots(
        Array.from({ length: total }, (_, i) => {
          const n = i + 1
          const row = byNum.get(n)
          return {
            id: (row?.id as string) ?? null,
            sessionNumber: n,
            scheduledDate: row?.scheduled_date ? String(row.scheduled_date).slice(0, 10) : '',
            status: toStatus(row?.status as string | undefined, n <= pkg.sessions_used),
            paymentAmount:
              row?.payment_amount !== undefined && row?.payment_amount !== null
                ? String(Number(row.payment_amount) || 0)
                : '',
            attendant: (row?.attendant as string) ?? '',
            saleId: (row?.sale_id as string) ?? null,
            notes: (row?.notes as string) ?? '',
            saving: false,
          }
        }),
      )
    }
    setLoading(false)
  }, [pkg.id, pkg.package_amount, pkg.sold_on, pkg.doctor_notes, pkg.total_sessions, pkg.sessions_used])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  const packageTotal = Math.max(0, Number(totalPrice) || 0)
  const paidTotal = useMemo(
    () => slots.reduce((sum, s) => sum + Math.max(0, Number(s.paymentAmount) || 0), 0),
    [slots],
  )
  const balance = Math.max(0, packageTotal - paidTotal)
  const finishedCount = useMemo(
    () => slots.filter((s) => s.status === 'finished').length,
    [slots],
  )

  function updateSlot(sessionNumber: number, patch: Partial<SlotDraft>) {
    setSlots((prev) =>
      prev.map((slot) => (slot.sessionNumber === sessionNumber ? { ...slot, ...patch } : slot)),
    )
  }

  async function syncPackageSessionsUsed(nextSlots: SlotDraft[]) {
    const finished = nextSlots.filter((s) => s.status === 'finished').length
    const nextDate =
      nextSlots
        .filter((s) => s.status !== 'finished' && s.scheduledDate)
        .map((s) => s.scheduledDate)
        .sort()[0] ?? null
    const allDone = finished >= pkg.total_sessions
    await supabase
      .from('client_session_packages')
      .update({
        sessions_used: finished,
        next_session_date: nextDate,
        status: allDone ? 'completed' : pkg.status === 'cancelled' ? 'cancelled' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', pkg.id)
  }

  async function updatePackageHeader() {
    setSavingPkg(true)
    setError('')
    setMessage('')
    const amount = Math.max(0, Number(totalPrice) || 0)
    const date = soldOn || pkg.sold_on?.slice(0, 10) || null
    if (!date) {
      setSavingPkg(false)
      setError('Date availed is required.')
      return
    }

    const { error: pkgErr } = await supabase
      .from('client_session_packages')
      .update({
        package_amount: amount,
        sold_on: date,
        doctor_notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pkg.id)

    if (pkgErr) {
      setSavingPkg(false)
      setError(pkgErr.message)
      return
    }

    if (pkg.sale_receipt_no) {
      // If installments already recorded, keep original receipt at ₱0 so Reports
      // does not double-count package list price + installment payments.
      const hasInstallments = slots.some((s) => Math.max(0, Number(s.paymentAmount) || 0) > 0)
      await supabase
        .from('sales')
        .update({
          total: hasInstallments ? 0 : amount,
          sold_at: new Date(`${date}T12:00:00`).toISOString(),
          doctor_notes: notes.trim() || null,
          ...(hasInstallments
            ? { payment_method: 'Installment plan' }
            : {}),
        })
        .eq('receipt_no', pkg.sale_receipt_no)
    }

    setSavingPkg(false)
    setMessage('Package details updated.')
    onSaved('Package details updated.')
  }

  async function saveSlotRow(sessionNumber: number) {
    const slot = slots.find((s) => s.sessionNumber === sessionNumber)
    if (!slot) return

    setError('')
    setMessage('')
    updateSlot(sessionNumber, { saving: true })

    const payment = Math.max(0, Number(slot.paymentAmount) || 0)
    const slotId = slot.id || crypto.randomUUID()
    let saleId = slot.saleId

    try {
      if (payment > 0) {
        const soldAtIso = new Date(
          `${slot.scheduledDate || soldOn || new Date().toISOString().slice(0, 10)}T12:00:00`,
        ).toISOString()
        const items = `${pkg.service_name} · session ${sessionNumber} installment`
        const attendantName = slot.attendant.trim() || user?.name || null

        if (saleId) {
          const { error: updSaleErr } = await supabase
            .from('sales')
            .update({
              items,
              total: payment,
              sold_at: soldAtIso,
              administered_by: attendantName,
              staff_name: user?.name ?? 'Staff',
              doctor_notes: notes.trim() || null,
            })
            .eq('id', saleId)
          if (updSaleErr) throw updSaleErr
        } else {
          const receipt = receiptNumber()
          const { data: sale, error: insSaleErr } = await supabase
            .from('sales')
            .insert({
              receipt_no: receipt,
              customer_name: pkg.customer_name,
              customer_id: pkg.customer_id && isUuid(pkg.customer_id) ? pkg.customer_id : null,
              items,
              total: payment,
              payment_method: 'Cash',
              points_used: 0,
              wallet_used: 0,
              staff_name: user?.name ?? 'Staff',
              branch_id: isUuid(pkg.branch_id || '')
                ? pkg.branch_id
                : isUuid(branchId)
                  ? branchId
                  : null,
              payment_proof_url: null,
              sold_at: soldAtIso,
              discount_amount: 0,
              doctor_notes: notes.trim() || null,
              administered_by: attendantName,
              consult_by: null,
              sales_by: user?.name ?? attendantName,
            })
            .select('id')
            .single()
          if (insSaleErr || !sale) throw insSaleErr || new Error('Could not create installment sale')
          saleId = sale.id as string
        }

        // Zero the original package sale so Reports / Sales Proof do not count
        // full list price + installment payments.
        if (pkg.sale_receipt_no) {
          await supabase
            .from('sales')
            .update({
              total: 0,
              payment_method: 'Installment plan',
              doctor_notes: notes.trim() || null,
            })
            .eq('receipt_no', pkg.sale_receipt_no)
        }
      } else if (saleId) {
        await supabase.from('sales').delete().eq('id', saleId)
        saleId = null
      }

      const payload = {
        id: slotId,
        package_id: pkg.id,
        session_number: sessionNumber,
        scheduled_date: slot.scheduledDate || null,
        scheduled_time: null as string | null,
        status: slot.status === 'finished' ? 'finished' : 'pending',
        notes: slot.notes.trim() || null,
        payment_amount: payment,
        attendant: slot.attendant.trim() || null,
        sale_id: saleId,
        updated_at: new Date().toISOString(),
      }

      const { error: upsertErr } = await supabase.from('client_session_slots').upsert(payload, {
        onConflict: 'package_id,session_number',
      })
      if (upsertErr) {
        throw new Error(
          upsertErr.message.includes('payment_amount') || upsertErr.message.includes('schema cache')
            ? `${upsertErr.message} — run supabase/add_session_installments.sql in Supabase.`
            : upsertErr.message,
        )
      }

      const nextSlots = slots.map((s) =>
        s.sessionNumber === sessionNumber
          ? {
              ...s,
              id: slotId,
              saleId,
              paymentAmount: payment ? String(payment) : '',
              saving: false,
            }
          : s,
      )
      setSlots(nextSlots)
      await syncPackageSessionsUsed(nextSlots)
      setMessage(`Session ${sessionNumber} saved${payment > 0 ? ' · sale updated' : ''}.`)
      onSaved(`Session ${sessionNumber} installment saved.`)
    } catch (e) {
      updateSlot(sessionNumber, { saving: false })
      setError(e instanceof Error ? e.message : 'Could not save session installment')
    }
  }

  async function deleteSlotRow(sessionNumber: number) {
    const slot = slots.find((s) => s.sessionNumber === sessionNumber)
    if (!slot || slot.status === 'finished') return

    const ok = window.confirm(
      `Delete session ${sessionNumber}?\n\nThis clears the pending visit` +
        (slot.saleId || Number(slot.paymentAmount) > 0
          ? ' and deletes its installment sale.'
          : '.'),
    )
    if (!ok) return

    setError('')
    setMessage('')
    updateSlot(sessionNumber, { saving: true })

    try {
      if (slot.saleId) {
        await supabase.from('sales').delete().eq('id', slot.saleId)
      }

      if (slot.id) {
        const { error: delErr } = await supabase
          .from('client_session_slots')
          .delete()
          .eq('id', slot.id)
        if (delErr) throw delErr
      }

      const nextSlots = slots.map((s) =>
        s.sessionNumber === sessionNumber
          ? {
              ...s,
              id: null,
              scheduledDate: '',
              status: 'pending' as const,
              paymentAmount: '',
              attendant: '',
              saleId: null,
              notes: '',
              saving: false,
            }
          : s,
      )
      setSlots(nextSlots)
      await syncPackageSessionsUsed(nextSlots)
      setMessage(`Session ${sessionNumber} cleared.`)
      onSaved(`Session ${sessionNumber} cleared.`)
    } catch (e) {
      updateSlot(sessionNumber, { saving: false })
      setError(e instanceof Error ? e.message : 'Could not delete session')
    }
  }

  if (!open) return null

  return (
    <div
      className="confirm-modal-overlay ipm-overlay"
      role="presentation"
      onClick={() => {
        if (!savingPkg) onClose()
      }}
    >
      <div
        className="confirm-modal ipm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="installment-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ipm-head">
          <div>
            <p className="confirm-modal-kicker">Installments</p>
            <h2 id="installment-title" className="confirm-modal-title">
              Update · {pkg.service_name}
            </h2>
            <p className="ipm-sub">{pkg.customer_name}</p>
          </div>
          <button
            className="btn-icon"
            type="button"
            aria-label="Close"
            disabled={savingPkg}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="ipm-body">
          {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
          {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

          <section className="ipm-package">
            <div className="ipm-fields">
              <div className="field">
                <label htmlFor="ipm-total">Total price</label>
                <input
                  id="ipm-total"
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  disabled={savingPkg || loading}
                />
              </div>
              <div className="field">
                <label htmlFor="ipm-date">Date availed</label>
                <input
                  id="ipm-date"
                  className="input"
                  type="date"
                  value={soldOn}
                  onChange={(e) => setSoldOn(e.target.value)}
                  disabled={savingPkg || loading}
                />
              </div>
              <div className="field ipm-notes-field">
                <label htmlFor="ipm-notes">Notes</label>
                <textarea
                  id="ipm-notes"
                  className="textarea"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={savingPkg || loading}
                  placeholder="Package notes"
                />
              </div>
            </div>
            <button
              className="btn btn-primary"
              type="button"
              disabled={savingPkg || loading}
              onClick={() => void updatePackageHeader()}
            >
              {savingPkg ? 'Updating…' : 'Update'}
            </button>
          </section>

          <div className="ipm-summary">
            <div>
              <span>Paid</span>
              <strong>{formatCurrency(paidTotal)}</strong>
            </div>
            <div>
              <span>Balance</span>
              <strong>{formatCurrency(balance)}</strong>
            </div>
            <div>
              <span>Sessions done</span>
              <strong>
                {finishedCount}/{pkg.total_sessions}
              </strong>
            </div>
            {pkg.sale_receipt_no ? (
              <div>
                <span>Original receipt</span>
                <strong>{pkg.sale_receipt_no}</strong>
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="empty-state">Loading sessions…</div>
          ) : (
            <div className="table-wrap ipm-table-wrap">
              <table className="data-table ipm-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Session date</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Attendant</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => (
                    <tr key={slot.sessionNumber}>
                      <td>{slot.sessionNumber}</td>
                      <td>
                        <input
                          className="input"
                          type="date"
                          value={slot.scheduledDate}
                          disabled={slot.saving}
                          onChange={(e) =>
                            updateSlot(slot.sessionNumber, { scheduledDate: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          value={slot.status}
                          disabled={slot.saving}
                          onChange={(e) =>
                            updateSlot(slot.sessionNumber, {
                              status: e.target.value as InstallmentStatus,
                            })
                          }
                        >
                          <option value="pending">Pending</option>
                          <option value="finished">Done</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="0"
                          value={slot.paymentAmount}
                          disabled={slot.saving}
                          onChange={(e) =>
                            updateSlot(slot.sessionNumber, { paymentAmount: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          value={
                            profiles.some((p) => p.full_name === slot.attendant)
                              ? slot.attendant
                              : slot.attendant
                                ? '__manual__'
                                : ''
                          }
                          disabled={slot.saving}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === '__manual__') {
                              const name = window.prompt('Attendant name', slot.attendant) || ''
                              updateSlot(slot.sessionNumber, { attendant: name.trim() })
                              return
                            }
                            updateSlot(slot.sessionNumber, { attendant: v })
                          }}
                        >
                          <option value="">Select…</option>
                          {profiles.map((p) => (
                            <option key={p.id} value={p.full_name}>
                              {p.full_name}
                            </option>
                          ))}
                          <option value="__manual__">
                            {slot.attendant &&
                            !profiles.some((p) => p.full_name === slot.attendant)
                              ? `Manual: ${slot.attendant}`
                              : 'Manual…'}
                          </option>
                        </select>
                      </td>
                      <td>
                        <div className="ipm-row-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            type="button"
                            disabled={slot.saving}
                            onClick={() => void saveSlotRow(slot.sessionNumber)}
                          >
                            {slot.saving ? '…' : 'Update'}
                          </button>
                          {slot.status !== 'finished' ? (
                            <button
                              className="btn ipm-delete-btn btn-sm"
                              type="button"
                              disabled={slot.saving}
                              aria-label={`Delete session ${slot.sessionNumber}`}
                              title="Delete pending session"
                              onClick={() => void deleteSlotRow(slot.sessionNumber)}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
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
