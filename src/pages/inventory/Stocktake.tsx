import { useCallback, useEffect, useState } from 'react'
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

type PastStocktake = {
  id: string
  counted_on: string
  status: string
  counted_by: string | null
  notes: string | null
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

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    let itemQ = supabase
      .from('inventory_items')
      .select('id, name, sku, stock, unit')
      .order('name')
    let pastQ = supabase
      .from('inventory_stocktakes')
      .select('id, counted_on, status, counted_by, notes')
      .order('counted_on', { ascending: false })
      .limit(20)
    if (isUuid(branchId)) {
      itemQ = itemQ.eq('branch_id', branchId)
      pastQ = pastQ.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }
    const [{ data: items, error: itemErr }, { data: pastData, error: pastErr }] =
      await Promise.all([itemQ, pastQ])
    if (itemErr || pastErr) {
      setError(
        (itemErr || pastErr)?.message.includes('stocktake') ||
          (itemErr || pastErr)?.message.includes('schema cache')
          ? `${(itemErr || pastErr)?.message} — run supabase/add_inventory_role.sql in Supabase.`
          : (itemErr || pastErr)?.message || 'Failed to load',
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
    setPast((pastData as PastStocktake[] | null) ?? [])
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    load()
  }, [load])

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

    const payload = lines.map((line) => ({
      stocktake_id: header.id,
      inventory_item_id: line.inventory_item_id,
      system_qty: line.system_qty,
      counted_qty: Math.max(0, Number(line.counted_qty) || 0),
    }))

    const { error: linesErr } = await supabase.from('inventory_stocktake_lines').insert(payload)
    if (linesErr) {
      setSaving(false)
      setError(linesErr.message)
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

  return (
    <div>
      <PageHeader
        kicker="Inventory"
        title="Stocktaking / cycle counting"
        subtitle="Count physical stock, compare to system qty, and post variances to on-hand."
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
            onClick={completeStocktake}
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
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Counted by</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {past.map((row) => (
                    <tr key={row.id}>
                      <td>{row.counted_on}</td>
                      <td>
                        <span className="badge badge-neutral">{row.status}</span>
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
    </div>
  )
}
