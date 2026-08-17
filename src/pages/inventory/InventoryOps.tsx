import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardCheck,
  PackagePlus,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import { InventorySubnav } from '../../components/InventorySubnav'
import { PageHeader } from '../../components/PageHeader'
import { StatusMessage } from '../../components/StatusMessage'
import { useBranch } from '../../context/BranchContext'
import { supabase } from '../../lib/supabase'
import { isUuid } from '../../lib/utils'
import './inventory-ops.css'

type ItemSnap = { name: string; sku: string; unit: string; stock: number }

type ReorderRow = {
  id: string
  inventory_item_id: string
  qty_requested: number
  status: 'open' | 'ordered' | 'received' | 'cancelled'
  notes: string | null
  requested_by: string | null
  created_at: string
  inventory_items?: ItemSnap | ItemSnap[] | null
}

type ReceiptRow = {
  id: string
  received_at: string
  supplier: string | null
  reference_no: string | null
  received_by: string | null
  created_at: string
}

type StocktakeRow = {
  id: string
  counted_on: string
  status: string
  counted_by: string | null
  notes: string | null
}

type LowStockRow = {
  id: string
  name: string
  sku: string
  stock: number
  reorder_level: number
  unit: string
}

function itemFromReorder(row: ReorderRow): ItemSnap | null {
  const snap = row.inventory_items
  if (!snap) return null
  return Array.isArray(snap) ? snap[0] ?? null : snap
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value.length <= 10 ? `${value}T12:00:00` : value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function InventoryOps() {
  const { branchId } = useBranch()
  const [reorders, setReorders] = useState<ReorderRow[]>([])
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [stocktakes, setStocktakes] = useState<StocktakeRow[]>([])
  const [lowStock, setLowStock] = useState<LowStockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    let reorderQ = supabase
      .from('inventory_reorder_requests')
      .select(
        'id, inventory_item_id, qty_requested, status, notes, requested_by, created_at, inventory_items(name, sku, unit, stock)',
      )
      .in('status', ['open', 'ordered'])
      .order('created_at', { ascending: false })
      .limit(40)

    let receiptQ = supabase
      .from('inventory_receipts')
      .select('id, received_at, supplier, reference_no, received_by, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    let stocktakeQ = supabase
      .from('inventory_stocktakes')
      .select('id, counted_on, status, counted_by, notes')
      .order('counted_on', { ascending: false })
      .limit(20)

    let lowQ = supabase
      .from('inventory_items')
      .select('id, name, sku, stock, reorder_level, unit')
      .order('name')
      .limit(200)

    if (isUuid(branchId)) {
      reorderQ = reorderQ.or(`branch_id.eq.${branchId},branch_id.is.null`)
      receiptQ = receiptQ.or(`branch_id.eq.${branchId},branch_id.is.null`)
      stocktakeQ = stocktakeQ.or(`branch_id.eq.${branchId},branch_id.is.null`)
      lowQ = lowQ.eq('branch_id', branchId)
    }

    const [reorderRes, receiptRes, stocktakeRes, lowRes] = await Promise.all([
      reorderQ,
      receiptQ,
      stocktakeQ,
      lowQ,
    ])

    const firstErr =
      reorderRes.error || receiptRes.error || stocktakeRes.error || lowRes.error
    if (firstErr) {
      setError(
        firstErr.message.includes('schema cache') || firstErr.message.includes('inventory_')
          ? `${firstErr.message} — run supabase/add_inventory_role.sql in Supabase.`
          : firstErr.message,
      )
    }

    setReorders((reorderRes.data as unknown as ReorderRow[] | null) ?? [])
    setReceipts((receiptRes.data as ReceiptRow[] | null) ?? [])
    setStocktakes((stocktakeRes.data as StocktakeRow[] | null) ?? [])
    setLowStock(
      ((lowRes.data as LowStockRow[] | null) ?? []).filter(
        (row) => Number(row.stock) <= Number(row.reorder_level),
      ),
    )
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const openCount = useMemo(
    () => reorders.filter((r) => r.status === 'open').length,
    [reorders],
  )
  const orderedCount = useMemo(
    () => reorders.filter((r) => r.status === 'ordered').length,
    [reorders],
  )

  async function setReorderStatus(id: string, status: ReorderRow['status']) {
    setBusyId(id)
    setError('')
    setMessage('')
    const { error: err } = await supabase
      .from('inventory_reorder_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    setBusyId('')
    if (err) {
      setError(err.message)
      return
    }
    setMessage(`Reorder marked ${status}.`)
    await load()
  }

  return (
    <div className="inv-ops">
      <PageHeader
        kicker="Inventory"
        title="Ops board"
        subtitle="Owner/Admin view of reorder requests, receiving, and stocktakes — plus low-stock alerts."
      />
      <InventorySubnav />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="inv-ops-stats">
        <div className="inv-ops-stat">
          <span>Open reorders</span>
          <strong>{loading ? '—' : openCount}</strong>
        </div>
        <div className="inv-ops-stat">
          <span>Ordered / in transit</span>
          <strong>{loading ? '—' : orderedCount}</strong>
        </div>
        <div className="inv-ops-stat is-warn">
          <span>Low stock SKUs</span>
          <strong>{loading ? '—' : lowStock.length}</strong>
        </div>
        <div className="inv-ops-stat">
          <span>Recent receipts</span>
          <strong>{loading ? '—' : receipts.length}</strong>
        </div>
      </div>

      <div className="inv-ops-grid">
        <section className="inv-ops-panel">
          <header className="inv-ops-panel-head">
            <div>
              <p className="inv-ops-kicker">
                <RefreshCw size={14} /> Reorder requests
              </p>
              <h2>Needs attention</h2>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/inventory/reorder">
              Open queue <ArrowRight size={14} />
            </Link>
          </header>
          <div className="inv-ops-panel-body">
            {loading ? (
              <p className="inv-ops-empty">Loading…</p>
            ) : reorders.length === 0 ? (
              <p className="inv-ops-empty">No open or ordered requests.</p>
            ) : (
              <ul className="inv-ops-list">
                {reorders.map((row) => {
                  const item = itemFromReorder(row)
                  return (
                    <li key={row.id} className="inv-ops-row">
                      <div className="inv-ops-row-main">
                        <strong>{item?.name || 'Item'}</strong>
                        <span>
                          Qty {row.qty_requested}
                          {item?.unit ? ` ${item.unit}` : ''}
                          {item ? ` · on hand ${item.stock}` : ''}
                          {row.requested_by ? ` · ${row.requested_by}` : ''}
                        </span>
                        {row.notes ? <em>{row.notes}</em> : null}
                      </div>
                      <div className="inv-ops-row-actions">
                        <span className={`inv-ops-pill status-${row.status}`}>{row.status}</span>
                        {row.status === 'open' ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busyId === row.id}
                            onClick={() => void setReorderStatus(row.id, 'ordered')}
                          >
                            Mark ordered
                          </button>
                        ) : null}
                        {row.status === 'ordered' ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busyId === row.id}
                            onClick={() => void setReorderStatus(row.id, 'received')}
                          >
                            Mark received
                          </button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="inv-ops-panel">
          <header className="inv-ops-panel-head">
            <div>
              <p className="inv-ops-kicker">
                <PackagePlus size={14} /> Receiving
              </p>
              <h2>Latest deliveries</h2>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/inventory/receiving">
              Log receipt <ArrowRight size={14} />
            </Link>
          </header>
          <div className="inv-ops-panel-body">
            {loading ? (
              <p className="inv-ops-empty">Loading…</p>
            ) : receipts.length === 0 ? (
              <p className="inv-ops-empty">No receipts logged yet.</p>
            ) : (
              <ul className="inv-ops-list">
                {receipts.map((row) => (
                  <li key={row.id} className="inv-ops-row">
                    <div className="inv-ops-row-main">
                      <strong>{row.supplier?.trim() || 'Supplier not set'}</strong>
                      <span>
                        {formatDate(row.received_at)}
                        {row.reference_no ? ` · Ref ${row.reference_no}` : ''}
                        {row.received_by ? ` · ${row.received_by}` : ''}
                      </span>
                    </div>
                    <span className="inv-ops-pill">Received</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="inv-ops-panel">
          <header className="inv-ops-panel-head">
            <div>
              <p className="inv-ops-kicker">
                <ClipboardCheck size={14} /> Stocktake
              </p>
              <h2>Count history</h2>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/inventory/stocktake">
              New count <ArrowRight size={14} />
            </Link>
          </header>
          <div className="inv-ops-panel-body">
            {loading ? (
              <p className="inv-ops-empty">Loading…</p>
            ) : stocktakes.length === 0 ? (
              <p className="inv-ops-empty">No stocktakes yet.</p>
            ) : (
              <ul className="inv-ops-list">
                {stocktakes.map((row) => (
                  <li key={row.id} className="inv-ops-row">
                    <div className="inv-ops-row-main">
                      <strong>{formatDate(row.counted_on)}</strong>
                      <span>
                        {row.counted_by || 'Counted'}
                        {row.notes ? ` · ${row.notes}` : ''}
                      </span>
                    </div>
                    <span className={`inv-ops-pill status-${row.status}`}>{row.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="inv-ops-panel inv-ops-low">
        <header className="inv-ops-panel-head">
          <div>
            <p className="inv-ops-kicker">
              <AlertTriangle size={14} /> Low stock
            </p>
            <h2>Below reorder level</h2>
          </div>
          <Link className="btn btn-primary btn-sm" to="/inventory/reorder">
            Create reorder
          </Link>
        </header>
        <div className="inv-ops-panel-body">
          {loading ? (
            <p className="inv-ops-empty">Loading…</p>
          ) : lowStock.length === 0 ? (
            <p className="inv-ops-empty">All items are above reorder level.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>On hand</th>
                    <th>Reorder at</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                        <div className="inv-ops-sub">{row.sku}</div>
                      </td>
                      <td>
                        {row.stock} {row.unit}
                      </td>
                      <td>
                        {row.reorder_level} {row.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
