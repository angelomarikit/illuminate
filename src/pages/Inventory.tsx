import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { InventorySubnav } from '../components/InventorySubnav'
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
  unit_cost?: number | null
  selling_price?: number | null
}

type ServiceOpt = { id: string; name: string; category: string }
type ServiceLink = {
  id: string
  service_id: string
  inventory_item_id: string
  qty_per_service: number
  services?: { name: string } | { name: string }[] | null
}

const emptyItem = {
  name: '',
  sku: '',
  category: 'Supplies',
  stock: '0',
  reorderLevel: '5',
  unit: 'pc',
  expiry: '',
  unitCost: '0',
  sellingPrice: '0',
}

function mapRow(row: Row): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    stock: Number(row.stock) || 0,
    reorderLevel: Number(row.reorder_level) || 0,
    unit: row.unit,
    branchId: row.branch_id ?? '',
    expiry: row.expiry ?? undefined,
    unitCost: Number(row.unit_cost) || 0,
    sellingPrice: Number(row.selling_price) || 0,
  }
}

function serviceName(link: ServiceLink) {
  const s = link.services
  if (Array.isArray(s)) return s[0]?.name || '—'
  return s?.name || '—'
}

function persistenceHint(message: string) {
  if (message.includes('unit_cost') || message.includes('selling_price')) {
    return `${message} — run supabase/add_inventory_persistence.sql in Supabase.`
  }
  if (message.includes('deleted_at')) {
    return `${message} — run supabase/add_stocktake_line_snapshots.sql in Supabase.`
  }
  if (message.includes('is_inventory_access') || message.includes('policy')) {
    return `${message} — run supabase/add_inventory_role.sql and use an Owner/Admin/Inventory account.`
  }
  return message
}

export function Inventory() {
  const { branchId } = useBranch()
  const [rows, setRows] = useState<InventoryItem[]>([])
  const [services, setServices] = useState<ServiceOpt[]>([])
  const [links, setLinks] = useState<ServiceLink[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'none' | 'add' | 'adjust' | 'link'>('none')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyItem)
  const [form, setForm] = useState(emptyItem)
  const [adjustId, setAdjustId] = useState('')
  const [adjustQty, setAdjustQty] = useState('0')
  const [linkItemId, setLinkItemId] = useState('')
  const [linkServiceId, setLinkServiceId] = useState('')
  const [linkQty, setLinkQty] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('inventory_items').select('*').is('deleted_at', null).order('name')
    if (isUuid(branchId)) q = q.eq('branch_id', branchId)
    const [{ data, error: err }, { data: svc }, { data: linkData, error: linkErr }] =
      await Promise.all([
        q,
        supabase.from('services').select('id, name, category').eq('active', true).order('name'),
        supabase
          .from('service_inventory')
          .select('id, service_id, inventory_item_id, qty_per_service, services(name)'),
      ])
    if (err) {
      setError(persistenceHint(err.message))
    } else {
      setError('')
      setRows((data as Row[] | null)?.map(mapRow) ?? [])
    }
    if (linkErr && !linkErr.message.includes('schema cache')) {
      if (linkErr.message.includes('service_inventory')) {
        setError(`${linkErr.message} — run supabase/add_inventory_role.sql in Supabase.`)
      }
    }
    setServices((svc as ServiceOpt[] | null) ?? [])
    setLinks((linkData as ServiceLink[] | null) ?? [])
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(
    () => ({
      skus: rows.length,
      low: rows.filter((i) => i.stock <= i.reorderLevel).length,
      injectables: rows.filter((i) => i.category === 'Injectables').length,
      retail: rows.filter((i) => i.category === 'Retail').length,
      linked: new Set(links.map((l) => l.inventory_item_id)).size,
    }),
    [rows, links],
  )

  const linksByItem = useMemo(() => {
    const map = new Map<string, ServiceLink[]>()
    for (const link of links) {
      const list = map.get(link.inventory_item_id) ?? []
      list.push(link)
      map.set(link.inventory_item_id, list)
    }
    return map
  }, [links])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const basePayload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category,
      stock: Math.max(0, Number(form.stock) || 0),
      reorder_level: Math.max(0, Number(form.reorderLevel) || 0),
      unit: form.unit.trim() || 'pc',
      expiry: form.expiry || null,
      branch_id: isUuid(branchId) ? branchId : null,
    }
    const withPrices = {
      ...basePayload,
      unit_cost: Math.max(0, Number(form.unitCost) || 0),
      selling_price: Math.max(0, Number(form.sellingPrice) || 0),
    }
    let { data, error: err } = await supabase
      .from('inventory_items')
      .insert(withPrices)
      .select('id')
      .maybeSingle()
    if (
      err &&
      (err.message.includes('unit_cost') || err.message.includes('selling_price'))
    ) {
      ;({ data, error: err } = await supabase
        .from('inventory_items')
        .insert(basePayload)
        .select('id')
        .maybeSingle())
      if (!err && data?.id) {
        setSaving(false)
        setForm(emptyItem)
        setMode('none')
        setMessage(
          'Item saved. Run supabase/add_inventory_persistence.sql to enable unit cost / selling price columns.',
        )
        await load()
        return
      }
    }
    setSaving(false)
    if (err) {
      setError(persistenceHint(err.message))
      return
    }
    if (!data?.id) {
      setError(
        'Item was not saved. Confirm you are signed in as Owner, Admin, or Inventory Specialist, then run supabase/add_inventory_persistence.sql if needed.',
      )
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
    const { data, error: err } = await supabase
      .from('inventory_items')
      .update({ stock: nextStock })
      .eq('id', item.id)
      .select('id, stock')
      .maybeSingle()
    setSaving(false)
    if (err) {
      setError(persistenceHint(err.message))
      return
    }
    if (!data?.id) {
      setError(
        'Stock adjust did not persist. Use an Owner/Admin/Inventory account and confirm RLS migrations are applied.',
      )
      return
    }
    setAdjustQty('0')
    setMode('none')
    setMessage(`Stock updated for ${item.name}.`)
    await load()
  }

  async function onLink(e: FormEvent) {
    e.preventDefault()
    if (!linkItemId || !linkServiceId) {
      setError('Select a service and inventory item.')
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('service_inventory').insert({
      service_id: linkServiceId,
      inventory_item_id: linkItemId,
      qty_per_service: Math.max(0.01, Number(linkQty) || 1),
    })
    setSaving(false)
    if (err) {
      setError(
        err.message.includes('service_inventory')
          ? `${err.message} — run supabase/add_inventory_role.sql.`
          : err.message,
      )
      return
    }
    setLinkQty('1')
    setMode('none')
    setMessage('Item linked to service.')
    await load()
  }

  function openEdit(item: InventoryItem) {
    setError('')
    setMessage('')
    setEditingId(item.id)
    setEditForm({
      name: item.name,
      sku: item.sku,
      category: item.category,
      stock: String(item.stock),
      reorderLevel: String(item.reorderLevel),
      unit: item.unit,
      expiry: item.expiry ? item.expiry.slice(0, 10) : '',
      unitCost: String(item.unitCost ?? 0),
      sellingPrice: String(item.sellingPrice ?? 0),
    })
  }

  function closeEdit() {
    if (saving) return
    setEditingId(null)
    setEditForm(emptyItem)
  }

  async function onEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingId) return
    const name = editForm.name.trim()
    const sku = editForm.sku.trim()
    if (!name || !sku) {
      setError('Name and SKU are required.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    const basePatch = {
      name,
      sku,
      category: editForm.category.trim() || 'Supplies',
      stock: Math.max(0, Number(editForm.stock) || 0),
      reorder_level: Math.max(0, Number(editForm.reorderLevel) || 0),
      unit: editForm.unit.trim() || 'pc',
      expiry: editForm.expiry || null,
    }
    const withPrices = {
      ...basePatch,
      unit_cost: Math.max(0, Number(editForm.unitCost) || 0),
      selling_price: Math.max(0, Number(editForm.sellingPrice) || 0),
    }
    let { data, error: err } = await supabase
      .from('inventory_items')
      .update(withPrices)
      .eq('id', editingId)
      .select('id, stock, reorder_level')
      .maybeSingle()
    if (
      err &&
      (err.message.includes('unit_cost') || err.message.includes('selling_price'))
    ) {
      ;({ data, error: err } = await supabase
        .from('inventory_items')
        .update(basePatch)
        .eq('id', editingId)
        .select('id, stock, reorder_level')
        .maybeSingle())
      if (!err && data?.id) {
        setMessage(
          'Stock/reorder saved. Run supabase/add_inventory_persistence.sql to enable price columns.',
        )
        setEditingId(null)
        setEditForm(emptyItem)
        setSaving(false)
        await load()
        return
      }
    }
    setSaving(false)
    if (err) {
      setError(persistenceHint(err.message))
      return
    }
    if (!data?.id) {
      setError(
        'Update did not persist (0 rows). Sign in as Owner/Admin/Inventory and run supabase/add_inventory_persistence.sql if needed.',
      )
      return
    }
    setMessage(`Updated item: ${name}.`)
    setEditingId(null)
    setEditForm(emptyItem)
    await load()
  }

  async function unlink(id: string) {
    const { error: err } = await supabase.from('service_inventory').delete().eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    setMessage('Service link removed.')
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="Inventory"
        title="Stock catalog"
        subtitle="Clinic supplies linked to services — managed by Inventory Specialists (and Owner/Admin)."
        actions={
          <>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setMode((m) => (m === 'link' ? 'none' : 'link'))}
            >
              Link to service
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setMode((m) => (m === 'adjust' ? 'none' : 'adjust'))}
            >
              Adjust stock
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setMode((m) => (m === 'add' ? 'none' : 'add'))}
            >
              Add item
            </button>
          </>
        }
      />

      <InventorySubnav />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {mode === 'add' ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">Add inventory item</h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={(e) => void onAdd(e)}
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
                  min={0}
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Reorder level</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.reorderLevel}
                  onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Unit cost</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.unitCost}
                  onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Selling price</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.sellingPrice}
                  onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
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
              onSubmit={(e) => void onAdjust(e)}
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: '1fr 1fr auto',
                alignItems: 'end',
              }}
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

      {mode === 'link' ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">Link item to clinic service</h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={(e) => void onLink(e)}
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: '1fr 1fr 120px auto',
                alignItems: 'end',
              }}
            >
              <div className="field">
                <label>Inventory item</label>
                <select
                  className="select"
                  required
                  value={linkItemId}
                  onChange={(e) => setLinkItemId(e.target.value)}
                >
                  <option value="">Select item</option>
                  {rows.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Service</label>
                <select
                  className="select"
                  required
                  value={linkServiceId}
                  onChange={(e) => setLinkServiceId(e.target.value)}
                >
                  <option value="">Select service</option>
                  {services.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name} · {svc.category}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Qty / service</label>
                <input
                  className="input"
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  value={linkQty}
                  onChange={(e) => setLinkQty(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Link'}
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
          <div className="stat-label">Low stock</div>
          <div className="stat-value">{stats.low}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Linked to services</div>
          <div className="stat-value">{stats.linked}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Injectables / retail</div>
          <div className="stat-value">
            {stats.injectables}/{stats.retail}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading inventory...</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">No inventory items yet. Click Add item.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Stock</th>
                    <th>Reorder at</th>
                    <th>Unit cost</th>
                    <th>Sell price</th>
                    <th>Linked services</th>
                    <th>Expiry</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const low = item.stock <= item.reorderLevel
                    const itemLinks = linksByItem.get(item.id) ?? []
                    return (
                      <tr
                        key={item.id}
                        className="inv-catalog-row"
                        style={{ cursor: 'pointer' }}
                        onClick={() => openEdit(item)}
                        title="Click to view / edit item"
                      >
                        <td>
                          <strong>{item.name}</strong>
                          <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                            Click to edit
                          </div>
                        </td>
                        <td>{item.sku}</td>
                        <td>{item.category}</td>
                        <td>
                          {item.stock} {item.unit}
                        </td>
                        <td>
                          {item.reorderLevel} {item.unit}
                        </td>
                        <td>{Number(item.unitCost ?? 0).toFixed(2)}</td>
                        <td>{Number(item.sellingPrice ?? 0).toFixed(2)}</td>
                        <td>
                          {itemLinks.length === 0 ? (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          ) : (
                            <div style={{ display: 'grid', gap: 4 }}>
                              {itemLinks.map((link) => (
                                <div
                                  key={link.id}
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <span className="badge badge-neutral">
                                    {serviceName(link)} · {link.qty_per_service}
                                  </span>
                                  <button
                                    className="btn-link"
                                    type="button"
                                    style={{
                                      background: 'none',
                                      border: 0,
                                      padding: 0,
                                      color: 'var(--muted)',
                                      cursor: 'pointer',
                                      fontSize: '0.78rem',
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void unlink(link.id)
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
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
      {editingId ? (
        <div
          className="confirm-modal-overlay"
          role="presentation"
          onClick={closeEdit}
        >
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-inventory-title"
            style={{ width: 'min(640px, 100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div>
                <p className="confirm-modal-kicker">Stock catalog</p>
                <h2 id="edit-inventory-title" className="confirm-modal-title">
                  Edit item
                </h2>
              </div>
              <button
                className="btn-icon"
                type="button"
                aria-label="Close"
                disabled={saving}
                onClick={closeEdit}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={(e) => void onEdit(e)}>
              <div className="confirm-modal-body">
                <p className="confirm-modal-text">
                  Updates write to the database. Refresh will reload these saved values.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  }}
                >
                  <div className="field">
                    <label>Name</label>
                    <input
                      className="input"
                      required
                      autoFocus
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>SKU</label>
                    <input
                      className="input"
                      required
                      value={editForm.sku}
                      onChange={(e) => setEditForm((f) => ({ ...f, sku: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Category</label>
                    <input
                      className="input"
                      list="inv-edit-categories"
                      value={editForm.category}
                      onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                    />
                    <datalist id="inv-edit-categories">
                      <option value="Supplies" />
                      <option value="Injectables" />
                      <option value="Retail" />
                      <option value="Consumables" />
                    </datalist>
                  </div>
                  <div className="field">
                    <label>Unit</label>
                    <input
                      className="input"
                      value={editForm.unit}
                      onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Quantity (stock)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      required
                      value={editForm.stock}
                      onChange={(e) => setEditForm((f) => ({ ...f, stock: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Reorder level</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={editForm.reorderLevel}
                      onChange={(e) => setEditForm((f) => ({ ...f, reorderLevel: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Unit cost</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={editForm.unitCost}
                      onChange={(e) => setEditForm((f) => ({ ...f, unitCost: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Selling price</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={editForm.sellingPrice}
                      onChange={(e) => setEditForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                    />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Expiry</label>
                    <input
                      className="input"
                      type="date"
                      value={editForm.expiry}
                      onChange={(e) => setEditForm((f) => ({ ...f, expiry: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="confirm-modal-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={saving}
                  onClick={closeEdit}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
