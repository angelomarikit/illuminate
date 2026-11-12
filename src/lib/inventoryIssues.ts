import { supabase } from './supabase'
import { isUuid } from './utils'

export type IssueLineInput = {
  inventory_item_id: string
  qty: number
  notes?: string | null
}

export type InventoryItemOpt = {
  id: string
  name: string
  sku: string
  stock: number
  unit: string
}

async function applyStockDelta(itemId: string, delta: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (delta === 0) return { ok: true }
  const { data } = await supabase
    .from('inventory_items')
    .select('stock, name')
    .eq('id', itemId)
    .maybeSingle()
  const row = data as { stock?: number; name?: string } | null
  const current = Number(row?.stock ?? 0)
  const next = Math.max(0, current + delta)
  if (delta < 0 && Math.abs(delta) > current) {
    return {
      ok: false,
      error: `Not enough stock for ${row?.name || 'item'} (on hand: ${current}).`,
    }
  }
  const { data: updated, error: updErr } = await supabase
    .from('inventory_items')
    .update({ stock: next })
    .eq('id', itemId)
    .select('id')
    .maybeSingle()
  if (updErr || !updated?.id) {
    return {
      ok: false,
      error:
        updErr?.message ||
        'Stock change did not persist. Use an Owner/Admin/Inventory account.',
    }
  }
  return { ok: true }
}

/** Load existing extra-supply issue lines keyed by session_slot_id. */
export async function loadExtraIssuesBySlotIds(
  slotIds: string[],
): Promise<Record<string, IssueLineInput[]>> {
  const ids = slotIds.filter((id) => isUuid(id))
  if (!ids.length) return {}

  const { data, error } = await supabase
    .from('inventory_issues')
    .select('id, session_slot_id, inventory_issue_lines(inventory_item_id, qty, notes)')
    .in('session_slot_id', ids)

  if (error || !data) return {}

  const out: Record<string, IssueLineInput[]> = {}
  for (const row of data as {
    session_slot_id: string | null
    inventory_issue_lines?: { inventory_item_id: string; qty: number; notes: string | null }[] | null
  }[]) {
    if (!row.session_slot_id) continue
    out[row.session_slot_id] = (row.inventory_issue_lines ?? [])
      .filter((l) => l.inventory_item_id && Number(l.qty) > 0)
      .map((l) => ({
        inventory_item_id: l.inventory_item_id,
        qty: Math.max(0, Number(l.qty) || 0),
        notes: l.notes,
      }))
  }
  return out
}

/**
 * Create or replace the single extras issue for a finished session slot.
 * Restores previous line stock, then deducts the new lines (idempotent re-save).
 * Pass empty lines to clear extras and restore stock.
 */
export async function upsertSessionExtraSupplies(opts: {
  sessionSlotId: string
  branchId: string | null
  issuedAt: string
  reason: string
  notes?: string | null
  issuedBy: string | null
  createdBy: string | null
  lines: IssueLineInput[]
}): Promise<{ ok: true; issueId: string | null } | { ok: false; error: string }> {
  if (!isUuid(opts.sessionSlotId)) {
    return { ok: false, error: 'Invalid session slot id.' }
  }

  const valid = opts.lines
    .map((l) => ({
      inventory_item_id: l.inventory_item_id,
      qty: Math.max(0, Number(l.qty) || 0),
      notes: l.notes?.trim() || null,
    }))
    .filter((l) => l.inventory_item_id && l.qty > 0)

  const { data: existing } = await supabase
    .from('inventory_issues')
    .select('id, inventory_issue_lines(inventory_item_id, qty)')
    .eq('session_slot_id', opts.sessionSlotId)
    .maybeSingle()

  const existingId = (existing as { id?: string } | null)?.id ?? null
  const prevLines =
    (
      existing as {
        inventory_issue_lines?: { inventory_item_id: string; qty: number }[] | null
      } | null
    )?.inventory_issue_lines ?? []

  // Restore previous extras to stock before applying new set
  for (const line of prevLines) {
    const restored = await applyStockDelta(line.inventory_item_id, Number(line.qty) || 0)
    if (restored.ok === false) return { ok: false, error: restored.error }
  }

  if (!valid.length) {
    if (existingId) {
      const { error: delErr } = await supabase.from('inventory_issues').delete().eq('id', existingId)
      if (delErr) return { ok: false, error: delErr.message }
    }
    return { ok: true, issueId: null }
  }

  // Validate stock against current (post-restore) levels
  for (const line of valid) {
    const { data } = await supabase
      .from('inventory_items')
      .select('stock, name')
      .eq('id', line.inventory_item_id)
      .maybeSingle()
    const row = data as { stock?: number; name?: string } | null
    const current = Number(row?.stock ?? 0)
    if (line.qty > current) {
      // Re-apply previous deduct so we don't leave stock inflated after a failed validation
      for (const prev of prevLines) {
        await applyStockDelta(prev.inventory_item_id, -(Number(prev.qty) || 0))
      }
      return {
        ok: false,
        error: `Not enough stock for ${row?.name || 'item'} (on hand: ${current}).`,
      }
    }
  }

  let issueId = existingId
  if (existingId) {
    const { error: headerErr } = await supabase
      .from('inventory_issues')
      .update({
        branch_id: opts.branchId && isUuid(opts.branchId) ? opts.branchId : null,
        issued_at: opts.issuedAt,
        reason: opts.reason || null,
        notes: opts.notes?.trim() || null,
        issued_by: opts.issuedBy,
        session_slot_id: opts.sessionSlotId,
      })
      .eq('id', existingId)
    if (headerErr) {
      if (headerErr.message.includes('session_slot_id')) {
        return {
          ok: false,
          error: `${headerErr.message} — run supabase/add_session_extra_supplies.sql in Supabase.`,
        }
      }
      return { ok: false, error: headerErr.message }
    }
    await supabase.from('inventory_issue_lines').delete().eq('issue_id', existingId)
  } else {
    const { data: issue, error: issueErr } = await supabase
      .from('inventory_issues')
      .insert({
        branch_id: opts.branchId && isUuid(opts.branchId) ? opts.branchId : null,
        issued_at: opts.issuedAt,
        reason: opts.reason || null,
        notes: opts.notes?.trim() || null,
        issued_by: opts.issuedBy,
        created_by: opts.createdBy && isUuid(opts.createdBy) ? opts.createdBy : null,
        session_slot_id: opts.sessionSlotId,
      })
      .select('id')
      .single()

    if (issueErr || !issue) {
      // Roll previous lines back onto stock failure path already restored; re-deduct old if we had any
      for (const prev of prevLines) {
        await applyStockDelta(prev.inventory_item_id, -(Number(prev.qty) || 0))
      }
      const msg = issueErr?.message || 'Could not save extra supplies.'
      if (msg.includes('session_slot_id') || msg.includes('inventory_issues')) {
        return {
          ok: false,
          error: `${msg} — run supabase/add_session_extra_supplies.sql (and add_inventory_issues.sql) in Supabase.`,
        }
      }
      return { ok: false, error: msg }
    }
    issueId = (issue as { id: string }).id
  }

  const { error: linesErr } = await supabase.from('inventory_issue_lines').insert(
    valid.map((l) => ({ ...l, issue_id: issueId })),
  )
  if (linesErr) {
    return { ok: false, error: linesErr.message }
  }

  for (const line of valid) {
    const deducted = await applyStockDelta(line.inventory_item_id, -line.qty)
    if (deducted.ok === false) return { ok: false, error: deducted.error }
  }

  return { ok: true, issueId: issueId ?? null }
}
