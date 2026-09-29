import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, ImageIcon, Receipt, X } from 'lucide-react'
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
  soldAtIso: string
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
    soldAtIso: row.sold_at,
  }
}

function formatSaleDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatSaleTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function paymentTone(method: string) {
  const m = method.toLowerCase()
  if (m.includes('cash')) return 'cash'
  if (m.includes('gcash') || m.includes('maya') || m.includes('online')) return 'digital'
  if (m.includes('card') || m.includes('credit') || m.includes('debit')) return 'card'
  if (m.includes('mixed')) return 'mixed'
  return 'other'
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function Sales() {
  const { branchId } = useBranch()
  const [rows, setRows] = useState<SaleView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<SaleView | null>(null)
  const [query, setQuery] = useState('')

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (s) =>
        s.receiptNo.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.items.toLowerCase().includes(q) ||
        s.salesBy.toLowerCase().includes(q) ||
        s.staffName.toLowerCase().includes(q) ||
        s.paymentMethod.toLowerCase().includes(q),
    )
  }, [rows, query])

  const totals = useMemo(() => {
    const sum = filtered.reduce((acc, s) => acc + s.total, 0)
    const withProof = filtered.filter((s) => s.paymentProofUrl).length
    return { sum, withProof, count: filtered.length }
  }, [filtered])

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
    <div className="sp-page">
      <PageHeader
        kicker="Sales Proof"
        title="Receipts & Transactions"
        subtitle="Audit trail for completed checkouts — payment mix, points used, and payment screenshots."
        actions={
          <button
            className="btn btn-ghost sp-export"
            type="button"
            onClick={exportCsv}
            disabled={!rows.length}
          >
            <Download size={15} />
            Export CSV
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <section className="sp-board">
        <div className="sp-board-head">
          <div className="sp-board-intro">
            <p className="sp-kicker">Ledger</p>
            <h2>
              {totals.count} receipt{totals.count === 1 ? '' : 's'}
            </h2>
            <p className="sp-board-sub">
              {formatCurrency(totals.sum)} total · {totals.withProof} with proof
            </p>
          </div>

          <label className="sp-search">
            <Receipt size={16} aria-hidden />
            <input
              type="search"
              placeholder="Search receipt, client, items, or staff"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div className="sp-board-body">
          {loading ? (
            <div className="sp-empty">Loading sales…</div>
          ) : filtered.length === 0 ? (
            <div className="sp-empty">
              <Receipt size={22} aria-hidden />
              <p>
                {rows.length === 0
                  ? 'No sales yet. Complete a checkout in POS.'
                  : 'No receipts match your search.'}
              </p>
            </div>
          ) : (
            <div className="sp-directory" role="list">
              <div className="sp-directory-cols" aria-hidden>
                <span>Receipt</span>
                <span>Client</span>
                <span>Items</span>
                <span>Total</span>
                <span>Payment</span>
                <span />
              </div>

              {filtered.map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  role="listitem"
                  className={`sp-row ${selected?.id === sale.id ? 'is-active' : ''}`}
                  onClick={() => setSelected(sale)}
                >
                  <div className="sp-receipt">
                    <strong>{sale.receiptNo}</strong>
                    <span>
                      {formatSaleDate(sale.soldAtIso)} · {formatSaleTime(sale.soldAtIso)}
                    </span>
                  </div>

                  <div className="sp-client">
                    <span className="sp-avatar" aria-hidden>
                      {initials(sale.customerName)}
                    </span>
                    <div className="sp-client-copy">
                      <strong>{sale.customerName}</strong>
                      <span>{sale.salesBy || sale.staffName || 'Unassigned'}</span>
                    </div>
                  </div>

                  <div className="sp-items">
                    <strong>{sale.items}</strong>
                    <span>
                      {sale.discountAmount > 0
                        ? `Discount ${formatCurrency(sale.discountAmount)}`
                        : 'No discount'}
                    </span>
                  </div>

                  <div className="sp-total">
                    <strong>{formatCurrency(sale.total)}</strong>
                    <span>
                      {sale.pointsUsed > 0 ? `${sale.pointsUsed} pts used` : 'Full tender'}
                    </span>
                  </div>

                  <div className="sp-payment">
                    <span className={`sp-pay-pill is-${paymentTone(sale.paymentMethod)}`}>
                      {sale.paymentMethod}
                    </span>
                    {sale.paymentProofUrl ? (
                      <span className="sp-proof-pill">
                        <ImageIcon size={12} aria-hidden />
                        Proof
                      </span>
                    ) : (
                      <span className="sp-proof-none">No proof</span>
                    )}
                  </div>

                  <span className="sp-row-action">View</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {selected ? (
        <div
          className="sp-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null)
          }}
        >
          <div
            className="sp-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sales-detail-title"
          >
            <div className="sp-modal-head">
              <div>
                <p className="sp-kicker">Sales proof</p>
                <h2 id="sales-detail-title">{selected.receiptNo}</h2>
                <p className="sp-modal-sub">
                  {formatSaleDate(selected.soldAtIso)} · {formatSaleTime(selected.soldAtIso)}
                </p>
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

            <div className="sp-modal-body">
              <div className="sp-modal-summary">
                <div>
                  <span>Total</span>
                  <strong>{formatCurrency(selected.total)}</strong>
                </div>
                <div>
                  <span>Payment</span>
                  <strong>{selected.paymentMethod}</strong>
                </div>
                <div>
                  <span>Discount</span>
                  <strong>
                    {selected.discountAmount > 0
                      ? formatCurrency(selected.discountAmount)
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span>Points</span>
                  <strong>{selected.pointsUsed || '—'}</strong>
                </div>
              </div>

              <div className="sp-modal-grid">
                <div>
                  <span>Client</span>
                  <strong>{selected.customerName}</strong>
                </div>
                <div>
                  <span>Sales by</span>
                  <strong>{selected.salesBy || '—'}</strong>
                </div>
                <div>
                  <span>Logged staff</span>
                  <strong>{selected.staffName || '—'}</strong>
                </div>
                <div>
                  <span>Wallet used</span>
                  <strong>
                    {selected.walletUsed > 0 ? formatCurrency(selected.walletUsed) : '—'}
                  </strong>
                </div>
                <div className="sp-modal-span">
                  <span>Items</span>
                  <strong>{selected.items}</strong>
                </div>
              </div>

              <div className="sp-modal-proof">
                <h3>Payment screenshot</h3>
                {selected.paymentProofUrl ? (
                  <a
                    href={selected.paymentProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="sp-modal-proof-link"
                  >
                    <img
                      src={selected.paymentProofUrl}
                      alt={`Payment proof for ${selected.receiptNo}`}
                    />
                    <span>Open full image</span>
                  </a>
                ) : (
                  <p className="sp-modal-proof-empty">
                    No payment screenshot was attached for this sale.
                  </p>
                )}
              </div>
            </div>

            <div className="sp-modal-foot">
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
