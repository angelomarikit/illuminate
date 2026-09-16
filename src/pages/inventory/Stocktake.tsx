import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { InventorySubnav } from '../../components/InventorySubnav'
import { PageHeader } from '../../components/PageHeader'
import { StatusMessage } from '../../components/StatusMessage'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { supabase } from '../../lib/supabase'
import { isUuid } from '../../lib/utils'

type ItemRow = {
  id: string
  name: string
  sku: string
  stock: number
  unit: string
}

type CountLine = {
  inventory_item_id: string
  name: string
  sku: string
  unit: string
  system_qty: number
  counted_qty: string
}

type PastLine = {
  id: string
  system_qty: number
  counted_qty: number | null
  item_name: string | null
  item_sku: string | null
  item_unit: string | null
  line_action: string | null
  inventory_items?: { name: string; sku: string; unit: string } | { name: string; sku: string; unit: string }[] | null
}

type PastStocktake = {
  id: string
  counted_on: string
  status: string
  counted_by: string | null
  notes: string | null
  inventory_stocktake_lines?: PastLine[] | null
}

function lineProduct(line: PastLine) {
  const embed = line.inventory_items
  const item = Array.isArray(embed) ? embed[0] : embed
  return {
    name: line.item_name || item?.name || 'Unknown item',
    sku: line.item_sku || item?.sku || '—',
    unit: line.item_unit || item?.unit || '',
  }
}

export function Stocktake() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const [lines, setLines] = useState<CountLine[]>([])
  const [past, setPast] = useState<PastStocktake[]>([])
  const [notes, setNotes] = useState('')
  const [countedOn, setCountedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CountLine | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    let itemQ = supabase
      .from('inventory_items')
      .select('id, name, sku, stock, unit')
      .is('deleted_at', null)
      .order('name')
    let pastQ = supabase
      .from('inventory_stocktakes')
      .select(
        `id, counted_on, status, counted_by, notes,
         inventory_stocktake_lines (
           id, system_qty, counted_qty, item_name, item_sku, item_unit, line_action,
           inventory_items (name, sku, unit)
         )`,
      )
      .order('counted_on', { ascending: false })
      .limit(20)
    if (isUuid(branchId)) {
      itemQ = itemQ.eq('branch_id', branchId)
      pastQ = pastQ.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }
    const [{ data: items, error: itemErr }, { data: pastData, error: pastErr }] =
      await Promise.all([itemQ, pastQ])
    if (itemErr || pastErr) {
      const msg = (itemErr || pastErr)?.message || 'Failed to load'
      setError(
        msg.includes('deleted_at') || msg.includes('item_name') || msg.includes('line_action')
          ? `${msg} — run supabase/add_stocktake_line_snapshots.sql in Supabase.`
          : msg.includes('stocktake') || msg.includes('schema cache')
            ? `${msg} — run supabase/add_inventory_role.sql in Supabase.`
            : msg,
      )
    }
    setLines(
      ((items as ItemRow[] | null) ?? []).map((item) => ({
        inventory_item_id: item.id,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        system_qty: item.stock,
        counted_qty: String(item.stock),
      })),
    )
    setPast((pastData as unknown as PastStocktake[] | null) ?? [])
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const affectedPastRows = useMemo(() => {
    const rows: Array<{
      key: string
      counted_on: string
      counted_by: string | null
      notes: string | null
      status: string
      line: PastLine
      product: ReturnType<typeof lineProduct>
      variance: number
      action: string
    }> = []

    for (const stocktake of past) {
      for (const line of stocktake.inventory_stocktake_lines ?? []) {
        const action = line.line_action || 'counted'
        const counted = Number(line.counted_qty ?? 0)
        const variance = counted - Number(line.system_qty || 0)
        const affected = action === 'deleted' || variance !== 0
        if (!affected) continue
        rows.push({
          key: `${stocktake.id}-${line.id}`,
          counted_on: stocktake.counted_on,
          counted_by: stocktake.counted_by,
          notes: stocktake.notes,
          status: stocktake.status,
          line,
          product: lineProduct(line),
          variance,
          action,
        })
      }
    }
    return rows
  }, [past])

  async function completeStocktake() {
    if (!lines.length) {
      setError('No inventory items to count.')
      return
    }
    setSaving(true)
    setError('')

    const { data: header, error: headerErr } = await supabase
      .from('inventory_stocktakes')
      .insert({
        branch_id: isUuid(branchId) ? branchId : null,
        status: 'draft',
        counted_on: countedOn,
        notes: notes.trim() || null,
        counted_by: user?.name ?? null,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()

    if (headerErr || !header) {
      setSaving(false)
      setError(
        headerErr?.message.includes('stocktake')
          ? `${headerErr.message} — run supabase/add_inventory_role.sql.`
          : headerErr?.message || 'Could not start stocktake',
      )
      return
    }

    const payload = lines
      .map((line) => {
        const counted_qty = Math.max(0, Number(line.counted_qty) || 0)
        return {
          stocktake_id: header.id,
          inventory_item_id: line.inventory_item_id,
          system_qty: line.system_qty,
          counted_qty,
          item_name: line.name,
          item_sku: line.sku,
          item_unit: line.unit,
          line_action: 'counted' as const,
        }
      })
      .filter((line) => line.counted_qty !== line.system_qty)

    if (!payload.length) {
      await supabase.from('inventory_stocktakes').delete().eq('id', header.id)
      setSaving(false)
      setError('No quantity changes to post. Update a counted qty first, or delete an item.')
      return
    }

    const { error: linesErr } = await supabase.from('inventory_stocktake_lines').insert(payload)
    if (linesErr) {
      setSaving(false)
      setError(
        linesErr.message.includes('item_name') || linesErr.message.includes('line_action')
          ? `${linesErr.message} — run supabase/add_stocktake_line_snapshots.sql in Supabase.`
          : linesErr.message,
      )
      return
    }

    for (const line of payload) {
      await supabase
        .from('inventory_items')
        .update({ stock: line.counted_qty })
        .eq('id', line.inventory_item_id)
    }

    const { error: doneErr } = await supabase
      .from('inventory_stocktakes')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', header.id)

    setSaving(false)
    if (doneErr) {
      setError(doneErr.message)
      return
    }

    setNotes('')
    setMessage('Cycle count completed. On-hand stock updated to counted quantities.')
    await load()
  }

  async function confirmDeleteItem() {
    if (!deleteTarget) return
    setDeleting(true)
    setError('')
    setMessage('')

    const { data: header, error: headerErr } = await supabase
      .from('inventory_stocktakes')
      .insert({
        branch_id: isUuid(branchId) ? branchId : null,
        status: 'completed',
        counted_on: countedOn,
        notes: `Deleted item during stocktake: ${deleteTarget.name}`,
        counted_by: user?.name ?? null,
        created_by: user?.id ?? null,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (headerErr || !header) {
      setDeleting(false)
      setError(
        headerErr?.message.includes('stocktake')
          ? `${headerErr.message} — run supabase/add_inventory_role.sql.`
          : headerErr?.message || 'Could not record deletion.',
      )
      return
    }

    const { error: lineErr } = await supabase.from('inventory_stocktake_lines').insert({
      stocktake_id: header.id,
      inventory_item_id: deleteTarget.inventory_item_id,
      system_qty: deleteTarget.system_qty,
      counted_qty: 0,
      item_name: deleteTarget.name,
      item_sku: deleteTarget.sku,
      item_unit: deleteTarget.unit,
      line_action: 'deleted',
      notes: 'Item removed from inventory during stocktake',
    })

    if (lineErr) {
      setDeleting(false)
      setError(
        lineErr.message.includes('item_name') || lineErr.message.includes('line_action')
          ? `${lineErr.message} — run supabase/add_stocktake_line_snapshots.sql in Supabase.`
          : lineErr.message,
      )
      return
    }

    const { error: delErr } = await supabase
      .from('inventory_items')
      .update({ deleted_at: new Date().toISOString(), stock: 0 })
      .eq('id', deleteTarget.inventory_item_id)

    setDeleting(false)
    if (delErr) {
      setError(
        delErr.message.includes('deleted_at')
          ? `${delErr.message} — run supabase/add_stocktake_line_snapshots.sql in Supabase.`
          : delErr.message,
      )
      return
    }

    setMessage(`Deleted “${deleteTarget.name}” from inventory. Recorded in past stocktakes.`)
    setDeleteTarget(null)
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="Inventory"
        title="Stocktaking / cycle counting"
        subtitle="Count physical stock, compare to system qty, post variances, or delete items with history."
      />
      <InventorySubnav />
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Count date</label>
            <input
              className="input"
              type="date"
              value={countedOn}
              onChange={(e) => setCountedOn(e.target.value)}
            />
          </div>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
            <label>Notes</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cycle count / location notes"
            />
          </div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving || loading || !lines.length}
            onClick={() => void completeStocktake()}
          >
            {saving ? 'Posting…' : 'Complete count & update stock'}
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2 className="panel-title">Count sheet</h2>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading items…</div>
          ) : lines.length === 0 ? (
            <div className="empty-state">Add items in Stock catalog first.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th>System qty</th>
                    <th>Counted qty</th>
                    <th>Variance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const counted = Math.max(0, Number(line.counted_qty) || 0)
                    const variance = counted - line.system_qty
                    return (
                      <tr key={line.inventory_item_id}>
                        <td>
                          <strong>{line.name}</strong>
                        </td>
                        <td>{line.sku}</td>
                        <td>
                          {line.system_qty} {line.unit}
                        </td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            style={{ height: 34, maxWidth: 120 }}
                            value={line.counted_qty}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((row) =>
                                  row.inventory_item_id === line.inventory_item_id
                                    ? { ...row, counted_qty: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              variance === 0
                                ? 'badge-success'
                                : variance < 0
                                  ? 'badge-danger'
                                  : 'badge-warning'
                            }`}
                          >
                            {variance > 0 ? `+${variance}` : variance}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label={`Delete ${line.name}`}
                            title="Delete item"
                            disabled={saving || deleting}
                            onClick={() => {
                              setError('')
                              setMessage('')
                              setDeleteTarget(line)
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Past stocktakes</h2>
        </div>
        <div className="panel-body">
          {past.length === 0 ? (
            <div className="empty-state">No completed counts yet.</div>
          ) : affectedPastRows.length === 0 ? (
            <div className="empty-state">No quantity changes or deletions recorded yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>System</th>
                    <th>Counted</th>
                    <th>Change</th>
                    <th>Action</th>
                    <th>Counted by</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {affectedPastRows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.counted_on}</td>
                      <td>
                        <strong>{row.product.name}</strong>
                      </td>
                      <td>{row.product.sku}</td>
                      <td>
                        {row.line.system_qty} {row.product.unit}
                      </td>
                      <td>
                        {row.line.counted_qty ?? '—'} {row.product.unit}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            row.action === 'deleted'
                              ? 'badge-danger'
                              : row.variance < 0
                                ? 'badge-danger'
                                : 'badge-warning'
                          }`}
                        >
                          {row.action === 'deleted'
                            ? 'removed'
                            : row.variance > 0
                              ? `+${row.variance}`
                              : row.variance}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            row.action === 'deleted' ? 'badge-danger' : 'badge-neutral'
                          }`}
                        >
                          {row.action}
                        </span>
                      </td>
                      <td>{row.counted_by || '—'}</td>
                      <td>{row.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {deleteTarget ? (
        <div
          className="confirm-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!deleting) setDeleteTarget(null)
          }}
        >
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stocktake-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div>
                <p className="confirm-modal-kicker">Stocktake</p>
                <h2 id="stocktake-delete-title" className="confirm-modal-title">
                  Delete item?
                </h2>
              </div>
              <button
                type="button"
                className="btn-icon"
                aria-label="Close"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="confirm-modal-body">
              <p className="confirm-modal-text">
                Are you sure you want to delete this item?
              </p>
              <div className="confirm-modal-meta">
                <div>
                  <span className="confirm-modal-label">Product</span>
                  <strong>{deleteTarget.name}</strong>
                </div>
                <div>
                  <span className="confirm-modal-label">SKU</span>
                  <strong>{deleteTarget.sku || '—'}</strong>
                </div>
                <div>
                  <span className="confirm-modal-label">On hand</span>
                  <strong>
                    {deleteTarget.system_qty} {deleteTarget.unit}
                  </strong>
                </div>
              </div>
              <div className="confirm-modal-note">
                <p>
                  This removes it from the stock catalog and records the deletion in past
                  stocktakes so you can still track the product name and quantity.
                </p>
              </div>
            </div>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={deleting}
                onClick={() => void confirmDeleteItem()}
              >
                {deleting ? 'Deleting…' : 'Yes, delete item'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
