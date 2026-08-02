import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import { isUuid } from '../lib/utils'
import type { InventoryItem } from '../types'

type Row = {
  id: string
  branch_id: string | null
  name: string
  sku: string
  category: string
  stock: number
  reorder_level: number
  unit: string
  expiry: string | null
}

const emptyItem = {
  name: '',
  sku: '',
  category: 'Supplies',
  stock: '0',
  reorderLevel: '5',
  unit: 'pc',
  expiry: '',
}

function mapRow(row: Row): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    stock: row.stock,
    reorderLevel: row.reorder_level,
    unit: row.unit,
    branchId: row.branch_id ?? '',
    expiry: row.expiry ?? undefined,
  }
}

export function Inventory() {
  const { branchId } = useBranch()
  const [rows, setRows] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'none' | 'add' | 'adjust'>('none')
  const [form, setForm] = useState(emptyItem)
  const [adjustId, setAdjustId] = useState('')
  const [adjustQty, setAdjustQty] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('inventory_items').select('*').order('name')
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

  const stats = useMemo(
    () => ({
      skus: rows.length,
      low: rows.filter((i) => i.stock <= i.reorderLevel).length,
      injectables: rows.filter((i) => i.category === 'Injectables').length,
      retail: rows.filter((i) => i.category === 'Retail').length,
    }),
    [rows],
  )

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('inventory_items').insert({
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category,
      stock: Number(form.stock) || 0,
      reorder_level: Number(form.reorderLevel) || 0,
      unit: form.unit.trim() || 'pc',
      expiry: form.expiry || null,
      branch_id: isUuid(branchId) ? branchId : null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setForm(emptyItem)
    setMode('none')
    setMessage('Inventory item added.')
    await load()
  }

  async function onAdjust(e: FormEvent) {
    e.preventDefault()
    const item = rows.find((r) => r.id === adjustId)
    if (!item) {
      setError('Select an item to adjust.')
      return
    }
    setSaving(true)
    setError('')
    const nextStock = Math.max(0, item.stock + (Number(adjustQty) || 0))
    const { error: err } = await supabase
      .from('inventory_items')
      .update({ stock: nextStock })
      .eq('id', item.id)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setAdjustQty('0')
    setMode('none')
    setMessage(`Stock updated for ${item.name}.`)
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="Stock"
        title="Inventory"
        subtitle="Track injectables, consumables, and retail products with reorder alerts and expiry dates."
        actions={
          <>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setMode((m) => (m === 'adjust' ? 'none' : 'adjust'))}
            >
              Adjust Stock
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setMode((m) => (m === 'add' ? 'none' : 'add'))}
            >
              Add Item
            </button>
          </>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {mode === 'add' ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">Add inventory item</h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={onAdd}
              style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              <div className="field">
                <label>Name</label>
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>SKU</label>
                <input
                  className="input"
                  required
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Category</label>
                <input
                  className="input"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Unit</label>
                <input
                  className="input"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Stock</label>
                <input
                  className="input"
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Reorder level</label>
                <input
                  className="input"
                  type="number"
                  value={form.reorderLevel}
                  onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Expiry</label>
                <input
                  className="input"
                  type="date"
                  value={form.expiry}
                  onChange={(e) => setForm((f) => ({ ...f, expiry: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {mode === 'adjust' ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">Adjust stock</h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={onAdjust}
              style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr auto', alignItems: 'end' }}
            >
              <div className="field">
                <label>Item</label>
                <select
                  className="select"
                  required
                  value={adjustId}
                  onChange={(e) => setAdjustId(e.target.value)}
                >
                  <option value="">Select item</option>
                  {rows.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.stock} {item.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Change (+/-)</label>
                <input
                  className="input"
                  type="number"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Apply'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">SKUs</div>
          <div className="stat-value">{stats.skus}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Low Stock</div>
          <div className="stat-value">{stats.low}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Injectables</div>
          <div className="stat-value">{stats.injectables}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Retail</div>
          <div className="stat-value">{stats.retail}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading inventory...</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">No inventory items yet. Click Add Item.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Stock</th>
                    <th>Reorder At</th>
                    <th>Expiry</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const low = item.stock <= item.reorderLevel
                    return (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                        </td>
                        <td>{item.sku}</td>
                        <td>{item.category}</td>
                        <td>
                          {item.stock} {item.unit}
                        </td>
                        <td>
                          {item.reorderLevel} {item.unit}
                        </td>
                        <td>{item.expiry ?? '—'}</td>
                        <td>
                          <span className={`badge ${low ? 'badge-danger' : 'badge-success'}`}>
                            {low ? 'Reorder' : 'Healthy'}
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
    </div>
  )
}
