import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { InventorySubnav } from '../../components/InventorySubnav'
import { PageHeader } from '../../components/PageHeader'
import { StatusMessage } from '../../components/StatusMessage'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { supabase } from '../../lib/supabase'
import { isUuid } from '../../lib/utils'

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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [supplier, setSupplier] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    let itemQ = supabase
      .from('inventory_items')
      .select('id, name, sku, stock, unit')
      .order('name')
    let receiptQ = supabase
      .from('inventory_receipts')
      .select('id, received_at, supplier, reference_no, notes, received_by, created_at')
      .order('received_at', { ascending: false })
      .limit(40)
    if (isUuid(branchId)) {
      itemQ = itemQ.eq('branch_id', branchId)
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
    setItems((itemData as ItemOpt[] | null) ?? [])
    setReceipts((receiptData as ReceiptRow[] | null) ?? [])
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
      const item = items.find((i) => i.id === line.inventory_item_id)
      if (!item) continue
      const patch: { stock: number; expiry?: string } = {
        stock: item.stock + line.qty,
      }
      if (line.expiry) patch.expiry = line.expiry
      await supabase.from('inventory_items').update(patch).eq('id', item.id)
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
          ) : receipts.length === 0 ? (
            <div className="empty-state">No receipts logged yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>Reference</th>
                    <th>Received by</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td>{r.received_at}</td>
                      <td>{r.supplier || '—'}</td>
                      <td>{r.reference_no || '—'}</td>
                      <td>{r.received_by || '—'}</td>
                      <td>{r.notes || '—'}</td>
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
