import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardList, Trash2 } from 'lucide-react'
import { SessionScheduleModal, type SessionPackageForModal } from './SessionScheduleModal'
import { StatusMessage } from './StatusMessage'
import { formatCurrency } from '../lib/utils'
import { supabase } from '../lib/supabase'
import './ClientRecordsPanel.css'

const PAGE_SIZE = 8

type PackageRow = {
  id: string
  customer_id: string | null
  customer_name: string
  service_name: string
  total_sessions: number
  sessions_used: number
  package_amount: number
  discount_amount: number
  sold_on: string
  next_session_date: string | null
  sale_receipt_no: string | null
  doctor_notes: string | null
  administered_by: string | null
  consult_by: string | null
  sales_by: string | null
  notes: string | null
  status: 'active' | 'completed' | 'cancelled'
  branch_id: string | null
}

type SaleRow = {
  id: string
  receipt_no: string
  items: string
  total: number
  sold_at: string
  payment_method: string | null
}

export type ClientRecord = {
  key: string
  kind: 'package' | 'sale'
  service: string
  dateAvailed: string
  totalPrice: number
  paymentsMade: number
  sessionsLeft: number | null
  totalSessions: number | null
  notes: string
  package: PackageRow | null
  receiptNo: string | null
  saleId: string | null
}

type Props = {
  customerId: string
  customerName: string
  membership: string
  membershipExpiresAt: string | null
  refreshKey?: number
}

function formatLongDate(value: string | null | undefined) {
  if (!value) return '—'
  const raw = value.slice(0, 10)
  const d = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatMoney(n: number) {
  return n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function ClientRecordsPanel({
  customerId,
  customerName,
  membership,
  membershipExpiresAt,
  refreshKey = 0,
}: Props) {
  const [records, setRecords] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [schedulePkg, setSchedulePkg] = useState<SessionPackageForModal | null>(null)
  const [savingNotes, setSavingNotes] = useState(false)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const [{ data: pkgs, error: pkgErr }, { data: sales, error: saleErr }] = await Promise.all([
      supabase
        .from('client_session_packages')
        .select(
          'id, customer_id, customer_name, service_name, total_sessions, sessions_used, package_amount, discount_amount, sold_on, next_session_date, sale_receipt_no, doctor_notes, administered_by, consult_by, sales_by, notes, status, branch_id',
        )
        .eq('customer_id', customerId)
        .order('sold_on', { ascending: false }),
      supabase
        .from('sales')
        .select('id, receipt_no, items, total, sold_at, payment_method')
        .eq('customer_id', customerId)
        .order('sold_at', { ascending: false }),
    ])

    if (pkgErr || saleErr) {
      const msg = pkgErr?.message || saleErr?.message || 'Could not load records'
      setError(
        msg.includes('client_session_packages') || msg.includes('schema cache')
          ? `${msg} — run supabase/add_client_sessions.sql in Supabase.`
          : msg,
      )
      setRecords([])
      setLoading(false)
      return
    }

    const packages = ((pkgs as PackageRow[] | null) ?? []).map((row) => ({
      ...row,
      package_amount: Number(row.package_amount ?? 0),
      discount_amount: Number(row.discount_amount ?? 0),
      total_sessions: Number(row.total_sessions ?? 0),
      sessions_used: Number(row.sessions_used ?? 0),
    }))

    const saleRows = ((sales as SaleRow[] | null) ?? []).map((row) => ({
      ...row,
      total: Number(row.total ?? 0),
    }))

    const saleByReceipt = new Map(saleRows.map((s) => [s.receipt_no, s]))
    const receiptsUsedByPackage = new Set(
      packages.map((p) => p.sale_receipt_no).filter((r): r is string => Boolean(r)),
    )

    const packageRecords: ClientRecord[] = packages.map((pkg) => {
      const linked = pkg.sale_receipt_no ? saleByReceipt.get(pkg.sale_receipt_no) : undefined
      const totalPrice = pkg.package_amount
      const paymentsMade = linked ? linked.total : pkg.package_amount
      const sessionsLeft = Math.max(0, pkg.total_sessions - pkg.sessions_used)
      const notes =
        [pkg.doctor_notes, pkg.notes, linked?.items && linked.items !== pkg.service_name ? linked.items : null]
          .filter(Boolean)
          .join(' · ') || '—'

      return {
        key: `pkg-${pkg.id}`,
        kind: 'package',
        service: pkg.service_name || 'Service package',
        dateAvailed: pkg.sold_on,
        totalPrice,
        paymentsMade,
        sessionsLeft,
        totalSessions: pkg.total_sessions,
        notes,
        package: pkg,
        receiptNo: pkg.sale_receipt_no,
        saleId: linked?.id ?? null,
      }
    })

    // Product / one-off sales not already represented by a session package
    const saleOnlyRecords: ClientRecord[] = saleRows
      .filter((sale) => !receiptsUsedByPackage.has(sale.receipt_no))
      .map((sale) => ({
        key: `sale-${sale.id}`,
        kind: 'sale' as const,
        service: sale.items || 'Sale',
        dateAvailed: sale.sold_at?.slice(0, 10) || sale.sold_at,
        totalPrice: sale.total,
        paymentsMade: sale.total,
        sessionsLeft: 0,
        totalSessions: 0,
        notes: sale.payment_method ? `Paid via ${sale.payment_method}` : '—',
        package: null,
        receiptNo: sale.receipt_no,
        saleId: sale.id,
      }))

    const merged = [...packageRecords, ...saleOnlyRecords].sort((a, b) =>
      String(b.dateAvailed).localeCompare(String(a.dateAvailed)),
    )

    setRecords(merged)
    setPage(1)
    setLoading(false)
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return records.slice(start, start + PAGE_SIZE)
  }, [records, currentPage])

  const totals = useMemo(() => {
    const paid = records.reduce((sum, r) => sum + r.paymentsMade, 0)
    const packages = records.filter((r) => r.kind === 'package').length
    const openSessions = records.reduce(
      (sum, r) => sum + (r.kind === 'package' ? r.sessionsLeft ?? 0 : 0),
      0,
    )
    return { paid, packages, openSessions, count: records.length }
  }, [records])

  async function saveDoctorNotes(notes: string) {
    if (!schedulePkg) return
    setSavingNotes(true)
    setError('')
    const { error: err } = await supabase
      .from('client_session_packages')
      .update({
        doctor_notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedulePkg.id)
    setSavingNotes(false)
    if (err) throw new Error(err.message)
    setMessage('Doctor notes saved.')
    await load()
  }

  async function deleteRecord(row: ClientRecord) {
    const label = row.service.length > 60 ? `${row.service.slice(0, 57)}…` : row.service
    const ok = window.confirm(
      `Delete this record?\n\n${label}\n\nThis removes it from the client history` +
        (row.receiptNo || row.saleId
          ? ' and deletes the linked Sales Proof / receipt.'
          : '.') +
        '\nThis cannot be undone.',
    )
    if (!ok) return

    setDeletingKey(row.key)
    setError('')
    setMessage('')

    if (row.package?.id) {
      const { error: pkgErr } = await supabase
        .from('client_session_packages')
        .delete()
        .eq('id', row.package.id)
      if (pkgErr) {
        setDeletingKey(null)
        setError(
          pkgErr.message.includes('client_session_packages') || pkgErr.message.includes('schema cache')
            ? `${pkgErr.message} — run supabase/add_client_sessions.sql in Supabase.`
            : pkgErr.message,
        )
        return
      }
    }

    let saleErr: { message: string } | null = null
    if (row.saleId) {
      const res = await supabase.from('sales').delete().eq('id', row.saleId)
      saleErr = res.error
    } else if (row.receiptNo) {
      const res = await supabase.from('sales').delete().eq('receipt_no', row.receiptNo)
      saleErr = res.error
    }

    setDeletingKey(null)
    if (saleErr) {
      setError(
        `${saleErr.message} — package/session was removed, but the sales receipt could not be deleted.`,
      )
      await load()
      return
    }

    if (schedulePkg && row.package && schedulePkg.id === row.package.id) {
      setSchedulePkg(null)
    }
    setMessage(
      row.receiptNo || row.saleId
        ? 'Record deleted from history and Sales Proof.'
        : 'Record deleted from history.',
    )
    await load()
  }

  return (
    <div className="client-records">
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="client-records-summary">
        <div>
          <span>Records</span>
          <strong>{totals.count}</strong>
        </div>
        <div>
          <span>Packages</span>
          <strong>{totals.packages}</strong>
        </div>
        <div>
          <span>Sessions left</span>
          <strong>{totals.openSessions}</strong>
        </div>
        <div>
          <span>Total paid</span>
          <strong>{formatCurrency(totals.paid)}</strong>
        </div>
      </div>

      <div className="client-records-panel">
        <div className="client-records-panel-head">
          <div>
            <p className="client-records-kicker">History</p>
            <h3>
              <ClipboardList size={16} aria-hidden />
              Records list
            </h3>
          </div>
          <p>
            Page {currentPage} of {totalPages}
          </p>
        </div>

        {loading ? (
          <div className="client-records-empty">Loading records…</div>
        ) : records.length === 0 ? (
          <div className="client-records-empty">
            No services or products availed yet. Use <strong>Avail service</strong> or POS to add
            one.
          </div>
        ) : (
          <div className="client-records-table-wrap">
            <table className="client-records-table">
              <thead>
                <tr>
                  <th>Service / treatment</th>
                  <th>Date availed</th>
                  <th>Total price</th>
                  <th>Payments made</th>
                  <th>Sessions left</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paged.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong className="client-records-service">{row.service}</strong>
                      <span className="client-records-kind">
                        {row.kind === 'package' ? 'Session package' : 'Sale / product'}
                        {row.receiptNo ? ` · ${row.receiptNo}` : ''}
                      </span>
                    </td>
                    <td>{formatLongDate(row.dateAvailed)}</td>
                    <td className="client-records-num">{formatMoney(row.totalPrice)}</td>
                    <td className="client-records-num">{formatMoney(row.paymentsMade)}</td>
                    <td>
                      {row.kind === 'package' ? (
                        <span className="client-records-sessions">
                          <strong>{row.sessionsLeft}</strong>
                          <span>
                            of {row.totalSessions ?? 0}
                          </span>
                        </span>
                      ) : (
                        <span className="client-records-muted">0</span>
                      )}
                    </td>
                    <td>
                      <p className="client-records-notes" title={row.notes}>
                        {row.notes}
                      </p>
                    </td>
                    <td>
                      <div className="client-records-actions">
                        {row.package ? (
                          <button
                            type="button"
                            className="btn client-records-view-btn"
                            disabled={deletingKey === row.key}
                            onClick={() =>
                              setSchedulePkg({
                                id: row.package!.id,
                                customer_id: row.package!.customer_id,
                                customer_name: row.package!.customer_name || customerName,
                                service_name: row.package!.service_name,
                                total_sessions: row.package!.total_sessions,
                                sessions_used: row.package!.sessions_used,
                                package_amount: row.package!.package_amount,
                                discount_amount: row.package!.discount_amount,
                                sold_on: row.package!.sold_on,
                                next_session_date: row.package!.next_session_date,
                                sale_receipt_no: row.package!.sale_receipt_no,
                                doctor_notes: row.package!.doctor_notes,
                                administered_by: row.package!.administered_by,
                                consult_by: row.package!.consult_by,
                                sales_by: row.package!.sales_by,
                                status: row.package!.status,
                                branch_id: row.package!.branch_id,
                              })
                            }
                          >
                            View sessions
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn client-records-delete-btn"
                          disabled={deletingKey === row.key}
                          aria-label={`Delete ${row.service}`}
                          title="Delete record and linked sale"
                          onClick={() => void deleteRecord(row)}
                        >
                          <Trash2 size={14} aria-hidden />
                          {deletingKey === row.key ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && records.length > 0 ? (
          <div className="client-records-pager">
            <button
              type="button"
              className="btn client-records-pager-btn"
              disabled={currentPage <= 1}
              aria-label="Previous page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="btn client-records-pager-btn"
              disabled={currentPage >= totalPages}
              aria-label="Next page"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        ) : null}
      </div>

      {schedulePkg ? (
        <SessionScheduleModal
          pkg={schedulePkg}
          membership={{
            membership,
            membershipExpiresAt,
          }}
          open={Boolean(schedulePkg)}
          onClose={() => setSchedulePkg(null)}
          onSaved={(msg) => {
            setMessage(msg)
            setSchedulePkg(null)
            void load()
          }}
          savingNotes={savingNotes}
          onSaveDoctorNotes={saveDoctorNotes}
        />
      ) : null}
    </div>
  )
}
