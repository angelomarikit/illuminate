import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
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
  reorder_level: number
  unit: string
}

type ReorderRow = {
  id: string
  inventory_item_id: string
  qty_requested: number
  status: 'open' | 'ordered' | 'received' | 'cancelled'
  notes: string | null
  requested_by: string | null
  created_at: string
  inventory_items?: { name: string; sku: string; unit: string; stock: number } | null
}

export function Reorder() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const [items, setItems] = useState<ItemRow[]>([])
  const [requests, setRequests] = useState<ReorderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    let itemQ = supabase
      .from('inventory_items')
      .select('id, name, sku, stock, reorder_level, unit')
      .order('name')
    let reqQ = supabase
      .from('inventory_reorder_requests')
      .select(
        'id, inventory_item_id, qty_requested, status, notes, requested_by, created_at, inventory_items(name, sku, unit, stock)',
      )
      .order('created_at', { ascending: false })
      .limit(80)
    if (isUuid(branchId)) {
      itemQ = itemQ.eq('branch_id', branchId)
      reqQ = reqQ.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }
    const [{ data: itemData, error: itemErr }, { data: reqData, error: reqErr }] =
      await Promise.all([itemQ, reqQ])
    if (itemErr || reqErr) {
      setError(
        (itemErr || reqErr)?.message.includes('reorder') ||
          (itemErr || reqErr)?.message.includes('schema cache')
          ? `${(itemErr || reqErr)?.message} — run supabase/add_inventory_role.sql in Supabase.`
          : (itemErr || reqErr)?.message || 'Failed to load',
      )
    }
    const mappedItems = (itemData as ItemRow[] | null) ?? []
    setItems(mappedItems)
    setRequests((reqData as ReorderRow[] | null) ?? [])
    setItemId((current) => {
      if (current && mappedItems.some((i) => i.id === current)) return current
      const low = mappedItems.find((i) => i.stock <= i.reorder_level)
      return (low || mappedItems[0])?.id || ''
    })
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    load()
  }, [load])

  const lowStock = useMemo(
    () => items.filter((i) => i.stock <= i.reorder_level),
    [items],
  )

  async function createFromLow() {
    if (!lowStock.length) {
      setError('No low-stock items right now.')
      return
    }
    setSaving(true)
    setError('')
    const inserts = lowStock.map((item) => ({
      branch_id: isUuid(branchId) ? branchId : null,
      inventory_item_id: item.id,
      qty_requested: Math.max(1, item.reorder_level * 2 - item.stock),
      status: 'open' as const,
      notes: 'Auto from low-stock alert',
      requested_by: user?.name ?? null,
      created_by: user?.id ?? null,
    }))
    const { error: err } = await supabase.from('inventory_reorder_requests').insert(inserts)
    setSaving(false)
    if (err) {
      setError(
        err.message.includes('reorder')
          ? `${err.message} — run supabase/add_inventory_role.sql.`
          : err.message,
      )
      return
    }
    setMessage(`Created ${inserts.length} reorder request(s) from low stock.`)
    await load()
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const amount = Math.max(1, Number(qty) || 0)
    if (!itemId) {
      setError('Select an item.')
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('inventory_reorder_requests').insert({
      branch_id: isUuid(branchId) ? branchId : null,
      inventory_item_id: itemId,
      qty_requested: amount,
      status: 'open',
      notes: notes.trim() || null,
      requested_by: user?.name ?? null,
      created_by: user?.id ?? null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setQty('')
    setNotes('')
    setMessage('Reorder request created.')
    await load()
  }

  async function setStatus(id: string, status: ReorderRow['status']) {
    const { error: err } = await supabase
      .from('inventory_reorder_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(`Request marked ${status}.`)
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="Inventory"
        title="Reordering"
        subtitle="Raise purchase requests for low stock and track ordered / received status."
        actions={
          <button
            className="btn btn-ghost"
            type="button"
            disabled={saving || !lowStock.length}
            onClick={createFromLow}
          >
            Create from low stock ({lowStock.length})
          </button>
        }
      />
      <InventorySubnav />
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2 className="panel-title">New reorder request</h2>
        </div>
        <div className="panel-body">
          <form
            onSubmit={onAdd}
            style={{ display: 'grid', gap: 12, gridTemplateColumns: '2fr 1fr 2fr auto', alignItems: 'end' }}
          >
            <div className="field">
              <label>Item</label>
              <select
                className="select"
                required
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              >
                <option value="">Select</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · on hand {item.stock} {item.unit}
                    {item.stock <= item.reorder_level ? ' · LOW' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Qty</label>
              <input
                className="input"
                type="number"
                min={1}
                required
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Notes</label>
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Supplier preference, urgency…"
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Request'}
            </button>
          </form>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Reorder queue</h2>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : requests.length === 0 ? (
            <div className="empty-state">No reorder requests yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>On hand</th>
                    <th>Status</th>
                    <th>Requested by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((row) => {
                    const item = Array.isArray(row.inventory_items)
                      ? row.inventory_items[0]
                      : row.inventory_items
                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{item?.name || '—'}</strong>
                          <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                            {item?.sku}
                          </div>
                        </td>
                        <td>
                          {row.qty_requested} {item?.unit || ''}
                        </td>
                        <td>
                          {item?.stock ?? '—'} {item?.unit || ''}
                        </td>
                        <td>
                          <span className="badge badge-neutral">{row.status}</span>
                        </td>
                        <td>{row.requested_by || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {row.status === 'open' ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => setStatus(row.id, 'ordered')}
                            >
                              Mark ordered
                            </button>
                          ) : null}{' '}
                          {row.status === 'ordered' ? (
                            <button
                              className="btn btn-primary btn-sm"
                              type="button"
                              onClick={() => setStatus(row.id, 'received')}
                            >
                              Mark received
                            </button>
                          ) : null}{' '}
                          {row.status === 'open' || row.status === 'ordered' ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => setStatus(row.id, 'cancelled')}
                            >
                              Cancel
                            </button>
                          ) : null}
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
    </div>
  )
}
