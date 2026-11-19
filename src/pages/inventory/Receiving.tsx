import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { InventorySubnav } from '../../components/InventorySubnav'
import { PageHeader } from '../../components/PageHeader'
import { StatusMessage } from '../../components/StatusMessage'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { supabase } from '../../lib/supabase'
import { inventoryCatalogBranchOrFilter, isUuid } from '../../lib/utils'

type ItemOpt = { id: string; name: string; sku: string; stock: number; unit: string }
type ReceiptRow = {
  id: string
  received_at: string
  supplier: string | null
  reference_no: string | null
  notes: string | null
  received_by: string | null
  created_at: string
}
type ReceiptLineView = {
  key: string
  receiptId: string
  received_at: string
  supplier: string | null
  reference_no: string | null
  received_by: string | null
  notes: string | null
  itemName: string
  qty: number
  unit: string
}
type LineForm = { itemId: string; qty: string; unitCost: string; lotNo: string; expiry: string }

const emptyLine = (): LineForm => ({
  itemId: '',
  qty: '1',
  unitCost: '0',
  lotNo: '',
  expiry: '',
})

export function Receiving() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const [items, setItems] = useState<ItemOpt[]>([])
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [receiptLines, setReceiptLines] = useState<ReceiptLineView[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [supplier, setSupplier] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [receivedAt, setReceivedAt] = useState(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  })
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    let itemQ = supabase
      .from('inventory_items')
      .select('id, name, sku, stock, unit')
      .is('deleted_at', null)
      .order('name')
    let receiptQ = supabase
      .from('inventory_receipts')
      .select('id, received_at, supplier, reference_no, notes, received_by, created_at')
      .order('received_at', { ascending: false })
      .limit(40)
    const itemBranchOr = inventoryCatalogBranchOrFilter(branchId)
    if (itemBranchOr) {
      itemQ = itemQ.or(itemBranchOr)
      receiptQ = receiptQ.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }
    const [{ data: itemData, error: itemErr }, { data: receiptData, error: receiptErr }] =
      await Promise.all([itemQ, receiptQ])
    if (itemErr || receiptErr) {
      setError(
        (itemErr || receiptErr)?.message.includes('inventory_receipts') ||
          (itemErr || receiptErr)?.message.includes('schema cache')
          ? `${(itemErr || receiptErr)?.message} — run supabase/add_inventory_role.sql in Supabase.`
          : (itemErr || receiptErr)?.message || 'Failed to load',
      )
    }
    const receiptRows = (receiptData as ReceiptRow[] | null) ?? []
    setItems((itemData as ItemOpt[] | null) ?? [])
    setReceipts(receiptRows)

    // Flatten receipt lines so Recent receipts can show Item + Quantity.
    if (receiptRows.length) {
      const receiptIds = receiptRows.map((r) => r.id)
      const byReceipt = new Map(receiptRows.map((r) => [r.id, r]))
      const lineViews: ReceiptLineView[] = []
      for (let i = 0; i < receiptIds.length; i += 80) {
        const chunk = receiptIds.slice(i, i + 80)
        const { data: lineData } = await supabase
          .from('inventory_receipt_lines')
          .select('id, receipt_id, qty, inventory_items(name, unit)')
          .in('receipt_id', chunk)
          .order('created_at', { ascending: true })
        for (const line of (lineData as {
          id: string
          receipt_id: string
          qty: number
          inventory_items?: { name?: string; unit?: string } | { name?: string; unit?: string }[] | null
        }[] | null) ?? []) {
          const header = byReceipt.get(line.receipt_id)
          if (!header) continue
          const itemEmbed = Array.isArray(line.inventory_items)
            ? line.inventory_items[0]
            : line.inventory_items
          lineViews.push({
            key: line.id,
            receiptId: line.receipt_id,
            received_at: header.received_at,
            supplier: header.supplier,
            reference_no: header.reference_no,
            received_by: header.received_by,
            notes: header.notes,
            itemName: itemEmbed?.name?.trim() || 'Unknown item',
            qty: Number(line.qty) || 0,
            unit: itemEmbed?.unit?.trim() || 'pc',
          })
        }
      }
      // Keep newest receipts first (same order as headers).
      const order = new Map(receiptIds.map((id, idx) => [id, idx]))
      lineViews.sort(
        (a, b) => (order.get(a.receiptId) ?? 0) - (order.get(b.receiptId) ?? 0),
      )
      setReceiptLines(lineViews)
    } else {
      setReceiptLines([])
    }

    setLoading(false)
  }, [branchId])

  useEffect(() => {
    load()
  }, [load])

  function updateLine(index: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const valid = lines
      .map((l) => ({
        inventory_item_id: l.itemId,
        qty: Math.max(0, Number(l.qty) || 0),
        unit_cost: Math.max(0, Number(l.unitCost) || 0),
        lot_no: l.lotNo.trim() || null,
        expiry: l.expiry || null,
      }))
      .filter((l) => l.inventory_item_id && l.qty > 0)

    if (!valid.length) {
      setError('Add at least one received item with quantity.')
      return
    }

    setSaving(true)
    setError('')
    const { data: receipt, error: receiptErr } = await supabase
      .from('inventory_receipts')
      .insert({
        branch_id: isUuid(branchId) ? branchId : null,
        received_at: receivedAt,
        supplier: supplier.trim() || null,
        reference_no: referenceNo.trim() || null,
        notes: notes.trim() || null,
        received_by: user?.name ?? null,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()

    if (receiptErr || !receipt) {
      setSaving(false)
      setError(
        receiptErr?.message.includes('inventory_receipts')
          ? `${receiptErr.message} — run supabase/add_inventory_role.sql.`
          : receiptErr?.message || 'Could not save receipt',
      )
      return
    }

    const { error: linesErr } = await supabase.from('inventory_receipt_lines').insert(
      valid.map((l) => ({ ...l, receipt_id: receipt.id })),
    )
    if (linesErr) {
      setSaving(false)
      setError(linesErr.message)
      return
    }

    for (const line of valid) {
      const { data: currentRow, error: readErr } = await supabase
        .from('inventory_items')
        .select('id, stock')
        .eq('id', line.inventory_item_id)
        .maybeSingle()
      if (readErr || !currentRow) {
        setSaving(false)
        setError(
          readErr?.message ||
            'Could not read current stock after receipt. Re-check catalog permissions.',
        )
        await load()
        return
      }
      const nextStock = Math.max(0, Number(currentRow.stock) || 0) + line.qty
      const patchWithCost: { stock: number; expiry?: string; unit_cost?: number } = {
        stock: nextStock,
        unit_cost: line.unit_cost,
      }
      if (line.expiry) patchWithCost.expiry = line.expiry
      let { data: updated, error: updErr } = await supabase
        .from('inventory_items')
        .update(patchWithCost)
        .eq('id', line.inventory_item_id)
        .select('id')
        .maybeSingle()
      // Catalog price columns require add_inventory_persistence.sql; still update stock if missing.
      if (updErr?.message.includes('unit_cost')) {
        const stockOnly: { stock: number; expiry?: string } = { stock: nextStock }
        if (line.expiry) stockOnly.expiry = line.expiry
        ;({ data: updated, error: updErr } = await supabase
          .from('inventory_items')
          .update(stockOnly)
          .eq('id', line.inventory_item_id)
          .select('id')
          .maybeSingle())
      }
      if (updErr || !updated?.id) {
        setSaving(false)
        setError(
          updErr?.message ||
            'Stock update did not persist after receipt. Use Owner/Admin/Inventory access.',
        )
        await load()
        return
      }
    }

    setSaving(false)
    setSupplier('')
    setReferenceNo('')
    setNotes('')
    setLines([emptyLine()])
    setMessage(`Receipt logged · ${valid.length} line(s) added to stock.`)
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="Inventory"
        title="Receiving & logging"
        subtitle="Log supplier deliveries and increase on-hand stock for clinic supplies."
      />
      <InventorySubnav />
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2 className="panel-title">New receipt</h2>
        </div>
        <div className="panel-body">
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <div className="field">
                <label>Received date</label>
                <input
                  className="input"
                  type="date"
                  required
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Supplier</label>
                <input
                  className="input"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Vendor name"
                />
              </div>
              <div className="field">
                <label>Reference / DR #</label>
                <input
                  className="input"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {lines.map((line, index) => (
                <div
                  key={index}
                  style={{
                    display: 'grid',
                    gap: 10,
                    gridTemplateColumns: 'minmax(0, 2fr) repeat(4, minmax(0, 1fr)) auto',
                    alignItems: 'end',
                  }}
                >
                  <div className="field">
                    <label>Item</label>
                    <select
                      className="select"
                      required
                      value={line.itemId}
                      onChange={(e) => updateLine(index, { itemId: e.target.value })}
                    >
                      <option value="">Select</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.sku}
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
                      value={line.qty}
                      onChange={(e) => updateLine(index, { qty: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Unit cost</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={line.unitCost}
                      onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Lot</label>
                    <input
                      className="input"
                      value={line.lotNo}
                      onChange={(e) => updateLine(index, { lotNo: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Expiry</label>
                    <input
                      className="input"
                      type="date"
                      value={line.expiry}
                      onChange={(e) => updateLine(index, { expiry: e.target.value })}
                    />
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={lines.length === 1}
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="field">
              <label>Notes</label>
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                Add line
              </button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Log receipt & update stock'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Recent receipts</h2>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : receiptLines.length === 0 ? (
            <div className="empty-state">
              {receipts.length === 0
                ? 'No receipts logged yet.'
                : 'Receipts found, but no line items to show.'}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Supplier</th>
                    <th>Reference</th>
                    <th>Received by</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptLines.map((row) => (
                    <tr key={row.key}>
                      <td>{row.received_at}</td>
                      <td>
                        <strong>{row.itemName}</strong>
                      </td>
                      <td>
                        {row.qty} {row.unit}
                      </td>
                      <td>{row.supplier || '—'}</td>
                      <td>{row.reference_no || '—'}</td>
                      <td>{row.received_by || '—'}</td>
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
