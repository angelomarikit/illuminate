import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { formatCurrency } from '../lib/utils'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import { downloadCsv, isUuid } from '../lib/utils'
import type { SaleRecord } from '../types'

type Row = {
  id: string
  branch_id: string | null
  receipt_no: string
  customer_name: string | null
  items: string
  total: number | string
  payment_method: string
  points_used: number
  staff_name: string | null
  sales_by: string | null
  discount_amount?: number | string | null
  sold_at: string
}

type SaleView = SaleRecord & { salesBy: string; discountAmount: number }

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
  }
}

export function Sales() {
  const { branchId } = useBranch()
  const [rows, setRows] = useState<SaleView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

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
    load()
  }, [load])

  function exportCsv() {
    downloadCsv(
      `illuminate-sales-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Receipt', 'Date', 'Client', 'Items', 'Total', 'Discount', 'Payment', 'Points Used', 'Sales by', 'Logged staff'],
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
      ]),
    )
    setMessage('CSV downloaded.')
  }

  return (
    <div>
      <PageHeader
        kicker="Sales Proof"
        title="Receipts & Transactions"
        subtitle="Audit trail for completed checkouts — payment mix, points used, and issuing staff."
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
                    <th>Sales by</th>
                    <th>Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((sale) => (
                    <tr key={sale.id}>
                      <td>
                        <strong>{sale.receiptNo}</strong>
                      </td>
                      <td>{sale.date}</td>
                      <td>{sale.customerName}</td>
                      <td>{sale.items}</td>
                      <td>{formatCurrency(sale.total)}</td>
                      <td>
                        {sale.discountAmount > 0
                          ? formatCurrency(sale.discountAmount)
                          : '—'}
                      </td>
                      <td>
                        <span className="badge">{sale.paymentMethod}</span>
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
    </div>
  )
}
