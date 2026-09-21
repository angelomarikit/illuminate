import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ClipboardList, Pencil, Trash2 } from 'lucide-react'
import { InventorySubnav } from '../../components/InventorySubnav'
import { PageHeader } from '../../components/PageHeader'
import { StatusMessage } from '../../components/StatusMessage'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { supabase } from '../../lib/supabase'
import { isUuid } from '../../lib/utils'
import './StockAssessment.css'

type ItemRow = {
  id: string
  name: string
  sku: string
  stock: number
  reorder_level: number
  unit: string
}

type IssueLineRow = {
  id: string
  inventory_item_id: string
  qty: number
  notes: string | null
  inventory_items?:
    | { name: string; sku: string; unit: string }
    | { name: string; sku: string; unit: string }[]
    | null
}

type IssueRow = {
  id: string
  issued_at: string
  reason: string | null
  notes: string | null
  issued_by: string | null
  created_at: string
  inventory_issue_lines?: IssueLineRow[] | null
}

type LineForm = { itemId: string; qty: string; notes: string }

type RangePreset = 'week' | 'month' | 'custom'

type SheetRow = {
  id: string
  name: string
  sku: string
  unit: string
  beginning: number
  received: number
  totalAvailable: number
  issued: number
  ending: number
  required: number
  variance: number
  assessment: 'BALANCED' | 'LACKING' | 'EXCESS'
}

type QtyRow = { qty: number; inventory_item_id: string }

function emptyLine(): LineForm {
  return { itemId: '', qty: '1', notes: '' }
}

function toDateInput(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfWeek(d: Date) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function sumByItem(rows: QtyRow[] | null | undefined) {
  const map: Record<string, number> = {}
  for (const row of rows ?? []) {
    map[row.inventory_item_id] = (map[row.inventory_item_id] || 0) + Number(row.qty || 0)
  }
  return map
}

function itemFromLine(line: IssueLineRow) {
  const snap = line.inventory_items
  if (!snap) return null
  return Array.isArray(snap) ? snap[0] ?? null : snap
}

function assessVariance(variance: number): SheetRow['assessment'] {
  if (variance === 0) return 'BALANCED'
  if (variance < 0) return 'LACKING'
  return 'EXCESS'
}

function assessmentBadge(kind: SheetRow['assessment']) {
  if (kind === 'BALANCED') return 'badge badge-success'
  if (kind === 'LACKING') return 'badge badge-danger'
  return 'badge badge-warning'
}

export function StockAssessment() {
  const { user } = useAuth()
  const { branchId } = useBranch()

  const [preset, setPreset] = useState<RangePreset>('week')
  const [rangeStart, setRangeStart] = useState(() => toDateInput(startOfWeek(new Date())))
  const [rangeEnd, setRangeEnd] = useState(() => toDateInput(new Date()))

  const [items, setItems] = useState<ItemRow[]>([])
  const [issues, setIssues] = useState<IssueRow[]>([])
  const [receivedByItem, setReceivedByItem] = useState<Record<string, number>>({})
  const [issuedByItem, setIssuedByItem] = useState<Record<string, number>>({})
  const [recvSinceStart, setRecvSinceStart] = useState<Record<string, number>>({})
  const [issuedSinceStart, setIssuedSinceStart] = useState<Record<string, number>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingRequiredId, setSavingRequiredId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [issuedAt, setIssuedAt] = useState(() => toDateInput(new Date()))
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null)

  function applyPreset(next: RangePreset) {
    setPreset(next)
    const now = new Date()
    if (next === 'week') {
      setRangeStart(toDateInput(startOfWeek(now)))
      setRangeEnd(toDateInput(now))
    } else if (next === 'month') {
      setRangeStart(toDateInput(startOfMonth(now)))
      setRangeEnd(toDateInput(endOfMonth(now)))
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    let itemQ = supabase
      .from('inventory_items')
      .select('id, name, sku, stock, reorder_level, unit')
      .is('deleted_at', null)
      .order('name')

    let issueQ = supabase
      .from('inventory_issues')
      .select(
        'id, issued_at, reason, notes, issued_by, created_at, inventory_issue_lines(id, inventory_item_id, qty, notes, inventory_items(name, sku, unit))',
      )
      .order('issued_at', { ascending: false })
      .limit(80)

    if (isUuid(branchId)) {
      itemQ = itemQ.eq('branch_id', branchId)
      issueQ = issueQ.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }

    const todayStr = toDateInput(new Date())

    // Query headers (not nested line filters) so branch .or() parses correctly.
    let receiptSinceQ = supabase
      .from('inventory_receipts')
      .select('id, received_at, inventory_receipt_lines(qty, inventory_item_id)')
      .gte('received_at', rangeStart)
      .lte('received_at', todayStr)

    let issueSinceQ = supabase
      .from('inventory_issues')
      .select('id, issued_at, inventory_issue_lines(qty, inventory_item_id)')
      .gte('issued_at', rangeStart)
      .lte('issued_at', todayStr)

    let receiptPeriodQ = supabase
      .from('inventory_receipts')
      .select('id, received_at, inventory_receipt_lines(qty, inventory_item_id)')
      .gte('received_at', rangeStart)
      .lte('received_at', rangeEnd)

    let issuePeriodQ = supabase
      .from('inventory_issues')
      .select('id, issued_at, inventory_issue_lines(qty, inventory_item_id)')
      .gte('issued_at', rangeStart)
      .lte('issued_at', rangeEnd)

    if (isUuid(branchId)) {
      const branchOr = `branch_id.eq.${branchId},branch_id.is.null`
      receiptSinceQ = receiptSinceQ.or(branchOr)
      issueSinceQ = issueSinceQ.or(branchOr)
      receiptPeriodQ = receiptPeriodQ.or(branchOr)
      issuePeriodQ = issuePeriodQ.or(branchOr)
    }

    const [
      { data: itemData, error: itemErr },
      { data: issueData, error: issueErr },
      { data: recvSinceData, error: recvSinceErr },
      { data: issuedSinceData, error: issuedSinceErr },
      { data: recvPeriodData, error: recvPeriodErr },
      { data: issuedPeriodData, error: issuedPeriodErr },
    ] = await Promise.all([
      itemQ,
      issueQ,
      receiptSinceQ,
      issueSinceQ,
      receiptPeriodQ,
      issuePeriodQ,
    ])

    const firstErr =
      itemErr || issueErr || recvSinceErr || issuedSinceErr || recvPeriodErr || issuedPeriodErr

    if (firstErr) {
      const msg = firstErr.message
      setError(
        msg.includes('inventory_issues') ||
          msg.includes('inventory_issue_lines') ||
          msg.includes('schema cache')
          ? `${msg} — run supabase/add_inventory_issues.sql in Supabase.`
          : msg,
      )
    }

    type HeaderWithLines = {
      inventory_receipt_lines?: QtyRow[] | null
      inventory_issue_lines?: QtyRow[] | null
    }

    function flattenReceiptLines(rows: HeaderWithLines[] | null | undefined): QtyRow[] {
      const out: QtyRow[] = []
      for (const row of rows ?? []) {
        for (const line of row.inventory_receipt_lines ?? []) {
          out.push({ qty: Number(line.qty) || 0, inventory_item_id: line.inventory_item_id })
        }
      }
      return out
    }

    function flattenIssueLines(rows: HeaderWithLines[] | null | undefined): QtyRow[] {
      const out: QtyRow[] = []
      for (const row of rows ?? []) {
        for (const line of row.inventory_issue_lines ?? []) {
          out.push({ qty: Number(line.qty) || 0, inventory_item_id: line.inventory_item_id })
        }
      }
      return out
    }

    setItems((itemData as ItemRow[] | null) ?? [])
    setIssues((issueData as IssueRow[] | null) ?? [])
    setRecvSinceStart(sumByItem(flattenReceiptLines(recvSinceData as HeaderWithLines[] | null)))
    setIssuedSinceStart(sumByItem(flattenIssueLines(issuedSinceData as HeaderWithLines[] | null)))
    setReceivedByItem(sumByItem(flattenReceiptLines(recvPeriodData as HeaderWithLines[] | null)))
    setIssuedByItem(sumByItem(flattenIssueLines(issuedPeriodData as HeaderWithLines[] | null)))
    setLoading(false)
  }, [branchId, rangeStart, rangeEnd])

  useEffect(() => {
    void load()
  }, [load])

  const sheetRows = useMemo<SheetRow[]>(() => {
    return items.map((item) => {
      const beginning =
        Number(item.stock) - (recvSinceStart[item.id] || 0) + (issuedSinceStart[item.id] || 0)
      const received = receivedByItem[item.id] || 0
      const issued = issuedByItem[item.id] || 0
      const totalAvailable = beginning + received
      const ending = totalAvailable - issued
      const required = Number(item.reorder_level) || 0
      const variance = ending - required
      return {
        id: item.id,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        beginning,
        received,
        totalAvailable,
        issued,
        ending,
        required,
        variance,
        assessment: assessVariance(variance),
      }
    })
  }, [items, recvSinceStart, issuedSinceStart, receivedByItem, issuedByItem])

  function updateLine(index: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  function resetIssueForm() {
    setEditingIssueId(null)
    setIssuedAt(toDateInput(new Date()))
    setReason('')
    setNotes('')
    setLines([emptyLine()])
  }

  function openEditIssue(issue: IssueRow) {
    setEditingIssueId(issue.id)
    setIssuedAt(issue.issued_at)
    setReason(issue.reason || '')
    setNotes(issue.notes || '')
    const issueLines = issue.inventory_issue_lines ?? []
    setLines(
      issueLines.length
        ? issueLines.map((l) => ({
            itemId: l.inventory_item_id,
            qty: String(l.qty),
            notes: l.notes || '',
          }))
        : [emptyLine()],
    )
    setMessage('')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function applyStockDelta(itemId: string, delta: number) {
    if (delta === 0) return
    const { data } = await supabase
      .from('inventory_items')
      .select('stock')
      .eq('id', itemId)
      .maybeSingle()
    const current = Number((data as { stock?: number } | null)?.stock ?? 0)
    const next = Math.max(0, current + delta)
    await supabase.from('inventory_items').update({ stock: next }).eq('id', itemId)
  }

  async function onSaveIssue(e: FormEvent) {
    e.preventDefault()
    const valid = lines
      .map((l) => ({
        inventory_item_id: l.itemId,
        qty: Math.max(0, Number(l.qty) || 0),
        notes: l.notes.trim() || null,
      }))
      .filter((l) => l.inventory_item_id && l.qty > 0)

    if (!valid.length) {
      setError('Add at least one issued item with quantity.')
      return
    }

    for (const line of valid) {
      const item = items.find((i) => i.id === line.inventory_item_id)
      if (!item) continue
      if (!editingIssueId && line.qty > item.stock) {
        setError(`Not enough stock for ${item.name} (on hand: ${item.stock}).`)
        return
      }
    }

    setSaving(true)
    setError('')
    setMessage('')

    if (editingIssueId) {
      const previous = issues.find((i) => i.id === editingIssueId)
      const prevLines = previous?.inventory_issue_lines ?? []

      for (const line of prevLines) {
        await applyStockDelta(line.inventory_item_id, Number(line.qty) || 0)
      }

      const { error: headerErr } = await supabase
        .from('inventory_issues')
        .update({
          issued_at: issuedAt,
          reason: reason.trim() || null,
          notes: notes.trim() || null,
          issued_by: user?.name ?? null,
        })
        .eq('id', editingIssueId)

      if (headerErr) {
        setSaving(false)
        setError(headerErr.message)
        await load()
        return
      }

      await supabase.from('inventory_issue_lines').delete().eq('issue_id', editingIssueId)
      const { error: linesErr } = await supabase.from('inventory_issue_lines').insert(
        valid.map((l) => ({ ...l, issue_id: editingIssueId })),
      )
      if (linesErr) {
        setSaving(false)
        setError(linesErr.message)
        await load()
        return
      }

      for (const line of valid) {
        const { data } = await supabase
          .from('inventory_items')
          .select('stock, name')
          .eq('id', line.inventory_item_id)
          .maybeSingle()
        const row = data as { stock?: number; name?: string } | null
        const current = Number(row?.stock ?? 0)
        if (line.qty > current) {
          setSaving(false)
          setError(
            `Not enough stock for ${row?.name || 'item'} after restoring previous issue.`,
          )
          await load()
          return
        }
        await supabase
          .from('inventory_items')
          .update({ stock: current - line.qty })
          .eq('id', line.inventory_item_id)
      }

      setSaving(false)
      setMessage('Issue updated and stock adjusted.')
      resetIssueForm()
      await load()
      return
    }

    const { data: issue, error: issueErr } = await supabase
      .from('inventory_issues')
      .insert({
        branch_id: isUuid(branchId) ? branchId : null,
        issued_at: issuedAt,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
        issued_by: user?.name ?? null,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()

    if (issueErr || !issue) {
      setSaving(false)
      setError(
        issueErr?.message.includes('inventory_issues')
          ? `${issueErr.message} — run supabase/add_inventory_issues.sql in Supabase.`
          : issueErr?.message || 'Could not save issue',
      )
      return
    }

    const { error: linesErr } = await supabase.from('inventory_issue_lines').insert(
      valid.map((l) => ({ ...l, issue_id: issue.id })),
    )
    if (linesErr) {
      setSaving(false)
      setError(linesErr.message)
      return
    }

    for (const line of valid) {
      await applyStockDelta(line.inventory_item_id, -line.qty)
    }

    setSaving(false)
    setMessage(`Issued/used logged · ${valid.length} line(s) deducted from stock.`)
    resetIssueForm()
    await load()
  }

  async function onDeleteIssue(issue: IssueRow) {
    const ok = window.confirm(
      `Delete issue from ${issue.issued_at}? Stock quantities will be restored.`,
    )
    if (!ok) return
    setError('')
    setMessage('')
    const issueLines = issue.inventory_issue_lines ?? []
    for (const line of issueLines) {
      await applyStockDelta(line.inventory_item_id, Number(line.qty) || 0)
    }
    const { error: delErr } = await supabase.from('inventory_issues').delete().eq('id', issue.id)
    if (delErr) {
      setError(delErr.message)
      await load()
      return
    }
    if (editingIssueId === issue.id) resetIssueForm()
    setMessage('Issue deleted and stock restored.')
    await load()
  }

  async function saveRequired(itemId: string, value: number) {
    setSavingRequiredId(itemId)
    setError('')
    const next = Math.max(0, value)
    const { error: updErr } = await supabase
      .from('inventory_items')
      .update({ reorder_level: next })
      .eq('id', itemId)
    setSavingRequiredId(null)
    if (updErr) {
      setError(updErr.message)
      return
    }
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, reorder_level: next } : item)),
    )
    setMessage('Required stock (reorder level) updated.')
  }

  return (
    <div className="stock-assessment-page">
      <PageHeader
        kicker="Inventory"
        title="Stock assessment"
        subtitle="Period sheet: beginning, received, issued/used, ending, required stock, and BALANCED / LACKING / EXCESS."
      />
      <InventorySubnav />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2 className="panel-title">Period</h2>
        </div>
        <div className="panel-body sa-period">
          <div className="sa-presets">
            <button
              className={`btn btn-sm ${preset === 'week' ? 'btn-primary' : 'btn-ghost'}`}
              type="button"
              onClick={() => applyPreset('week')}
            >
              This week
            </button>
            <button
              className={`btn btn-sm ${preset === 'month' ? 'btn-primary' : 'btn-ghost'}`}
              type="button"
              onClick={() => applyPreset('month')}
            >
              This month
            </button>
            <button
              className={`btn btn-sm ${preset === 'custom' ? 'btn-primary' : 'btn-ghost'}`}
              type="button"
              onClick={() => setPreset('custom')}
            >
              Custom range
            </button>
          </div>
          <div className="sa-range-fields">
            <div className="field">
              <label htmlFor="sa-from">From</label>
              <input
                id="sa-from"
                className="input"
                type="date"
                value={rangeStart}
                onChange={(e) => {
                  setPreset('custom')
                  setRangeStart(e.target.value)
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="sa-to">To</label>
              <input
                id="sa-to"
                className="input"
                type="date"
                value={rangeEnd}
                min={rangeStart}
                onChange={(e) => {
                  setPreset('custom')
                  setRangeEnd(e.target.value)
                }}
              />
            </div>
          </div>
          <p className="sa-hint">
            Beginning is reconstructed from current stock minus receipts/issues since the start
            date. Received and Issued/Used are totals inside the selected range.
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2 className="panel-title">
            <ClipboardList size={16} style={{ marginRight: 8, verticalAlign: -2 }} />
            Assessment sheet
          </h2>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading assessment…</div>
          ) : sheetRows.length === 0 ? (
            <div className="empty-state">No inventory items for this branch.</div>
          ) : (
            <div className="table-wrap sa-table-wrap">
              <table className="data-table sa-table">
                <thead>
                  <tr>
                    <th>Product / Item</th>
                    <th>Beginning</th>
                    <th>Stock received</th>
                    <th>Total available</th>
                    <th>Issued / Used</th>
                    <th>Ending</th>
                    <th>Required stock</th>
                    <th>Variance</th>
                    <th>Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  {sheetRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                        <div className="sa-muted">
                          {row.sku}
                          {row.unit ? ` · ${row.unit}` : ''}
                        </div>
                      </td>
                      <td>{row.beginning}</td>
                      <td>{row.received}</td>
                      <td>{row.totalAvailable}</td>
                      <td>{row.issued}</td>
                      <td>{row.ending}</td>
                      <td>
                        <div className="sa-required">
                          <input
                            className="input"
                            type="number"
                            min={0}
                            defaultValue={row.required}
                            key={`${row.id}-${row.required}`}
                            onBlur={(e) => {
                              const next = Math.max(0, Number(e.target.value) || 0)
                              if (next !== row.required) void saveRequired(row.id, next)
                            }}
                            disabled={savingRequiredId === row.id}
                            aria-label={`Required stock for ${row.name}`}
                          />
                        </div>
                      </td>
                      <td>{row.variance > 0 ? `+${row.variance}` : row.variance}</td>
                      <td>
                        <span className={assessmentBadge(row.assessment)}>{row.assessment}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2 className="panel-title">
            {editingIssueId ? 'Edit issued / used' : 'Log issued / used'}
          </h2>
        </div>
        <div className="panel-body">
          <form onSubmit={(e) => void onSaveIssue(e)} style={{ display: 'grid', gap: 14 }}>
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              }}
            >
              <div className="field">
                <label>Issued date</label>
                <input
                  className="input"
                  type="date"
                  required
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Reason</label>
                <input
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Treatment use, waste, transfer…"
                />
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
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {lines.map((line, index) => (
                <div
                  key={index}
                  style={{
                    display: 'grid',
                    gap: 10,
                    gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.2fr) auto',
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
                          {item.name} · on hand {item.stock}
                          {item.unit ? ` ${item.unit}` : ''}
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
                    <label>Line note</label>
                    <input
                      className="input"
                      value={line.notes}
                      onChange={(e) => updateLine(index, { notes: e.target.value })}
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

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                Add line
              </button>
              {editingIssueId ? (
                <button className="btn btn-ghost" type="button" onClick={resetIssueForm}>
                  Cancel edit
                </button>
              ) : null}
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving
                  ? 'Saving…'
                  : editingIssueId
                    ? 'Update issue & stock'
                    : 'Log issue & deduct stock'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Recent issued / used</h2>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : issues.length === 0 ? (
            <div className="empty-state">No issued / used logs yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Items</th>
                    <th>Reason</th>
                    <th>By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => {
                    const issueLines = issue.inventory_issue_lines ?? []
                    return (
                      <tr key={issue.id}>
                        <td>{issue.issued_at}</td>
                        <td>
                          {issueLines.length === 0
                            ? '—'
                            : issueLines.map((line) => {
                                const snap = itemFromLine(line)
                                return (
                                  <div key={line.id}>
                                    {snap?.name || 'Item'} · {line.qty}
                                    {snap?.unit ? ` ${snap.unit}` : ''}
                                  </div>
                                )
                              })}
                        </td>
                        <td>
                          {issue.reason || '—'}
                          {issue.notes ? <div className="sa-muted">{issue.notes}</div> : null}
                        </td>
                        <td>{issue.issued_by || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn-icon"
                              type="button"
                              aria-label="Edit issue"
                              title="Edit"
                              onClick={() => openEditIssue(issue)}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="btn-icon"
                              type="button"
                              aria-label="Delete issue"
                              title="Delete"
                              onClick={() => void onDeleteIssue(issue)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
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
