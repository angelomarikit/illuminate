import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { formatCurrency } from '../lib/utils'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import { downloadCsv, isUuid } from '../lib/utils'
import type { SaleRecord } from '../types'
import './sales.css'

type Row = {
  id: string
  branch_id: string | null
  receipt_no: string
  customer_name: string | null
  items: string
  total: number | string
  payment_method: string
  points_used: number
  wallet_used?: number | string | null
  staff_name: string | null
  sales_by: string | null
  discount_amount?: number | string | null
  payment_proof_url?: string | null
  sold_at: string
}

type SaleView = SaleRecord & {
  salesBy: string
  discountAmount: number
  walletUsed: number
  paymentProofUrl: string | null
}

function mapRow(row: Row): SaleView {
  return {
    id: row.id,
    receiptNo: row.receipt_no,
    customerName: row.customer_name ?? 'Walk-in',
    items: row.items,
    total: Number(row.total),
    paymentMethod: row.payment_method as SaleRecord['paymentMethod'],
    pointsUsed: row.points_used,
    date: new Date(row.sold_at).toLocaleString(),
    staffName: row.staff_name ?? '',
    branchId: row.branch_id ?? '',
    salesBy: row.sales_by ?? '',
    discountAmount: Number(row.discount_amount ?? 0),
    walletUsed: Number(row.wallet_used ?? 0),
    paymentProofUrl: row.payment_proof_url ?? null,
  }
}

export function Sales() {
  const { branchId } = useBranch()
  const [rows, setRows] = useState<SaleView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<SaleView | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('sales').select('*').order('sold_at', { ascending: false })
    if (isUuid(branchId)) q = q.eq('branch_id', branchId)
    const { data, error: err } = await q
    if (err) setError(err.message)
    else {
      setError('')
      setRows((data as Row[] | null)?.map(mapRow) ?? [])
    }
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selected) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(null)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [selected])

  function exportCsv() {
    downloadCsv(
      `illuminate-sales-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Receipt',
        'Date',
        'Client',
        'Items',
        'Total',
        'Discount',
        'Payment',
        'Points Used',
        'Sales by',
        'Logged staff',
        'Payment proof',
      ],
      rows.map((s) => [
        s.receiptNo,
        s.date,
        s.customerName,
        s.items,
        s.total,
        s.discountAmount,
        s.paymentMethod,
        s.pointsUsed,
        s.salesBy,
        s.staffName,
        s.paymentProofUrl || '',
      ]),
    )
    setMessage('CSV downloaded.')
  }

  return (
    <div>
      <PageHeader
        kicker="Sales Proof"
        title="Receipts & Transactions"
        subtitle="Audit trail for completed checkouts — payment mix, points used, and payment screenshots."
        actions={
          <button className="btn btn-ghost" type="button" onClick={exportCsv} disabled={!rows.length}>
            Export CSV
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="panel">
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading sales...</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">No sales yet. Complete a checkout in POS.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Discount</th>
                    <th>Payment</th>
                    <th>Proof</th>
                    <th>Sales by</th>
                    <th>Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((sale) => (
                    <tr
                      key={sale.id}
                      className="sales-row-clickable"
                      onClick={() => setSelected(sale)}
                    >
                      <td>
                        <strong>{sale.receiptNo}</strong>
                      </td>
                      <td>{sale.date}</td>
                      <td>{sale.customerName}</td>
                      <td>{sale.items}</td>
                      <td>{formatCurrency(sale.total)}</td>
                      <td>
                        {sale.discountAmount > 0 ? formatCurrency(sale.discountAmount) : '—'}
                      </td>
                      <td>
                        <span className="badge">{sale.paymentMethod}</span>
                      </td>
                      <td>
                        {sale.paymentProofUrl ? (
                          <span className="badge badge-success">Attached</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{sale.salesBy || '—'}</td>
                      <td>{sale.staffName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <div
          className="sales-detail-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null)
          }}
        >
          <div
            className="sales-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sales-detail-title"
          >
            <div className="sales-detail-head">
              <div>
                <p className="sales-detail-kicker">Sales proof</p>
                <h2 id="sales-detail-title">{selected.receiptNo}</h2>
              </div>
              <button
                type="button"
                className="btn-icon"
                aria-label="Close"
                onClick={() => setSelected(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="sales-detail-grid">
              <div>
                <span>Date</span>
                <strong>{selected.date}</strong>
              </div>
              <div>
                <span>Client</span>
                <strong>{selected.customerName}</strong>
              </div>
              <div>
                <span>Payment</span>
                <strong>{selected.paymentMethod}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatCurrency(selected.total)}</strong>
              </div>
              <div>
                <span>Discount</span>
                <strong>
                  {selected.discountAmount > 0 ? formatCurrency(selected.discountAmount) : '—'}
                </strong>
              </div>
              <div>
                <span>Points used</span>
                <strong>{selected.pointsUsed || '—'}</strong>
              </div>
              <div>
                <span>Wallet used</span>
                <strong>
                  {selected.walletUsed > 0 ? formatCurrency(selected.walletUsed) : '—'}
                </strong>
              </div>
              <div>
                <span>Sales by</span>
                <strong>{selected.salesBy || '—'}</strong>
              </div>
              <div className="sales-detail-span">
                <span>Items</span>
                <strong>{selected.items}</strong>
              </div>
            </div>

            <div className="sales-detail-proof">
              <h3>Payment screenshot</h3>
              {selected.paymentProofUrl ? (
                <a
                  href={selected.paymentProofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="sales-detail-proof-link"
                >
                  <img src={selected.paymentProofUrl} alt={`Payment proof for ${selected.receiptNo}`} />
                  <span>Open full image</span>
                </a>
              ) : (
                <p className="muted">No payment screenshot was attached for this sale.</p>
              )}
            </div>

            <div className="sales-detail-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
