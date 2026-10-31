import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ClipboardList, Pencil, Search, Trash2 } from 'lucide-react'
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
  unit: string
}

type IssueLineRow = {
  id: string
  issue_id?: string
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
  branch_id?: string | null
  issued_at: string
  reason: string | null
  notes: string | null
  issued_by: string | null
  created_at: string
  inventory_issue_lines?: IssueLineRow[] | null
}

type LineForm = { itemId: string; qty: string; notes: string }

type RangePreset = 'today' | 'week' | 'month' | 'custom'

type AssessmentKind = 'BALANCED' | 'LACKING' | 'EXCESS'

type SheetRow = {
  id: string
  name: string
  sku: string
  unit: string
  beginning: number
  received: number
  issued: number
  /** Expected on hand = Beginning + In − Out */
  expected: number
  ending: number
  counted: boolean
  variance: number | null
  assessment: AssessmentKind | null
}

type QtyRow = { qty: number; inventory_item_id: string }

type EndingRow = {
  inventory_item_id: string
  ending_qty: number
  period_end?: string
  updated_at?: string
}

const ZERO_BRANCH = '00000000-0000-0000-0000-000000000000'

function emptyLine(): LineForm {
  return { itemId: '', qty: '1', notes: '' }
}

function branchKeyFor(branchId: string) {
  return isUuid(branchId) ? branchId : ZERO_BRANCH
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

function endOfWeek(d: Date) {
  const start = startOfWeek(d)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return end
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function matchesBranch(rowBranchId: string | null | undefined, activeBranchId: string) {
  // All-branches (non-uuid): include every row. Specific branch: exact match only —
  // including null-branch rows caused the same receive to count twice when it was
  // also saved under the active branch (In 40 instead of 20).
  if (!isUuid(activeBranchId)) return true
  return rowBranchId === activeBranchId
}

/** Normalize DB date / timestamptz to YYYY-MM-DD for calendar-day compares. */
function dateKey(value: string | null | undefined) {
  if (!value) return ''
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return toDateInput(d)
}

function isDateInRange(value: string | null | undefined, from: string, to: string) {
  const d = dateKey(value)
  if (!d || !from || !to) return false
  return d >= from && d <= to
}

type MovementHeader = { id: string; branch_id: string | null; moveDate: string }

/**
 * Load issue/receipt headers for a calendar range.
 * Filters again in JS by YYYY-MM-DD so timestamptz / locale casts cannot pull adjacent days
 * (e.g. Oct 19 receiving appearing on Oct 20).
 */
async function fetchHeadersInRange(
  table: 'inventory_issues' | 'inventory_receipts',
  dateCol: 'issued_at' | 'received_at',
  from: string,
  to: string,
  activeBranchId: string,
): Promise<MovementHeader[]> {
  let q = supabase.from(table).select(`id, branch_id, ${dateCol}`)
  // Single-day: prefer eq to avoid boundary cast issues
  if (from === to) {
    q = q.eq(dateCol, from)
  } else {
    q = q.gte(dateCol, from).lte(dateCol, to)
  }
  const { data, error } = await q
  if (error) throw error

  return ((data as Record<string, unknown>[] | null) ?? [])
    .map((row) => ({
      id: String(row.id),
      branch_id: (row.branch_id as string | null) ?? null,
      moveDate: dateKey(row[dateCol] as string),
    }))
    .filter(
      (row) =>
        matchesBranch(row.branch_id, activeBranchId) &&
        isDateInRange(row.moveDate, from, to),
    )
}

type DatedQtyRow = QtyRow & { moveDate: string; lineId: string; parentId: string }

async function fetchLinesChunked(
  table: 'inventory_issue_lines' | 'inventory_receipt_lines',
  fk: 'issue_id' | 'receipt_id',
  headers: MovementHeader[],
): Promise<DatedQtyRow[]> {
  if (!headers.length) return []
  const dateById = new Map(headers.map((h) => [h.id, h.moveDate]))
  const out: DatedQtyRow[] = []
  const chunkSize = 80
  // Unique parent ids — duplicate headers would otherwise double-count lines
  const ids = [...new Set(headers.map((h) => h.id))]
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from(table)
      .select(`id, qty, inventory_item_id, ${fk}`)
      .in(fk, chunk)
    if (error) throw error
    for (const row of (data as (QtyRow & { id?: string; [k: string]: unknown })[] | null) ?? []) {
      const parentId = String(row[fk] ?? '')
      out.push({
        lineId: String(row.id ?? `${parentId}:${row.inventory_item_id}:${row.qty}`),
        parentId,
        qty: Number(row.qty) || 0,
        inventory_item_id: row.inventory_item_id,
        moveDate: dateById.get(parentId) ?? '',
      })
    }
  }
  return out
}

type TreatmentUsageRow = {
  id: string
  branch_id: string | null
  completed_at: string
  usage_date?: string | null
  session_slot_id?: string | null
  appointment_id?: string | null
  inventory_treatment_usage_lines?:
    | { id: string; inventory_item_id: string; qty_deducted: number }[]
    | null
  client_session_slots?: { scheduled_date: string | null } | { scheduled_date: string | null }[] | null
  appointments?: { appointment_date: string | null } | { appointment_date: string | null }[] | null
}

function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function visitDateFromUsage(
  row: TreatmentUsageRow,
  slotDateById: Map<string, string>,
): string {
  // 1) Session scheduled date (source of truth for package visits)
  if (row.session_slot_id && slotDateById.has(row.session_slot_id)) {
    return slotDateById.get(row.session_slot_id) || ''
  }
  const slot = embedOne(row.client_session_slots)
  const fromSlot = dateKey(slot?.scheduled_date)
  if (fromSlot) return fromSlot

  // 2) Stored usage_date (after SQL fix)
  const fromUsage = dateKey(row.usage_date)
  if (fromUsage) return fromUsage

  // 3) Appointment calendar date
  const apt = embedOne(row.appointments)
  const fromApt = dateKey(apt?.appointment_date)
  if (fromApt) return fromApt

  // 4) Last resort: when the row was written
  return dateKey(row.completed_at)
}

/**
 * Treatment auto-deducts for Stock Assessment Out.
 * Visit day = session scheduled_date (29/30/31), NEVER the day staff clicked Save.
 */
async function fetchTreatmentUsageDatedLines(
  from: string,
  to: string,
  activeBranchId: string,
): Promise<DatedQtyRow[]> {
  // Finished slots in range → exact visit dates even when usage.completed_at is wrong
  const { data: slotRows } = await supabase
    .from('client_session_slots')
    .select('id, scheduled_date')
    .eq('status', 'finished')
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)

  const slotDateById = new Map<string, string>()
  for (const s of (slotRows as { id: string; scheduled_date: string }[] | null) ?? []) {
    const d = dateKey(s.scheduled_date)
    if (d) slotDateById.set(s.id, d)
  }
  const slotIds = [...slotDateById.keys()]

  const selectWithEmbed =
    'id, branch_id, completed_at, usage_date, session_slot_id, appointment_id, inventory_treatment_usage_lines(id, inventory_item_id, qty_deducted), client_session_slots(scheduled_date), appointments(appointment_date)'
  const selectPlain =
    'id, branch_id, completed_at, usage_date, session_slot_id, appointment_id, inventory_treatment_usage_lines(id, inventory_item_id, qty_deducted)'

  const byId = new Map<string, TreatmentUsageRow>()

  async function absorb(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    const res = await query
    if (res.error) {
      if (
        res.error.message.includes('inventory_treatment_usage') ||
        res.error.message.includes('schema cache') ||
        res.error.message.includes('usage_date') ||
        res.error.message.includes('client_session_slots') ||
        res.error.message.includes('appointments') ||
        res.error.message.includes('relationship')
      ) {
        return res.error.message
      }
      throw res.error
    }
    for (const row of (res.data as TreatmentUsageRow[] | null) ?? []) {
      byId.set(row.id, row)
    }
    return null
  }

  // A) Usages linked to finished slots in this date range (primary — fixes Out=3 on save day)
  if (slotIds.length) {
    const chunkSize = 80
    for (let i = 0; i < slotIds.length; i += chunkSize) {
      const chunk = slotIds.slice(i, i + chunkSize)
      const errMsg = await absorb(
        supabase.from('inventory_treatment_usage').select(selectWithEmbed).in('session_slot_id', chunk),
      )
      if (errMsg) {
        await absorb(
          supabase.from('inventory_treatment_usage').select(selectPlain).in('session_slot_id', chunk),
        )
      }
    }
  }

  // B) Rows stamped with usage_date in range
  {
    const errMsg = await absorb(
      supabase
        .from('inventory_treatment_usage')
        .select(selectWithEmbed)
        .gte('usage_date', from)
        .lte('usage_date', to),
    )
    if (errMsg?.includes('usage_date') || errMsg?.includes('relationship')) {
      // column / embed missing — ignore
    } else if (errMsg) {
      await absorb(
        supabase
          .from('inventory_treatment_usage')
          .select(selectPlain)
          .gte('usage_date', from)
          .lte('usage_date', to),
      )
    }
  }

  // C) Legacy: completed_at in range (only used if visit date still resolves into range)
  {
    const errMsg = await absorb(
      supabase
        .from('inventory_treatment_usage')
        .select(selectWithEmbed)
        .gte('completed_at', `${from}T00:00:00`)
        .lte('completed_at', `${to}T23:59:59.999`),
    )
    if (errMsg) {
      await absorb(
        supabase
          .from('inventory_treatment_usage')
          .select(selectPlain)
          .gte('completed_at', `${from}T00:00:00`)
          .lte('completed_at', `${to}T23:59:59.999`),
      )
    }
  }

  // Fill slot map for any extra session_slot_ids we loaded
  const missingSlotIds = [...byId.values()]
    .map((r) => r.session_slot_id)
    .filter((id): id is string => Boolean(id) && !slotDateById.has(id))
  if (missingSlotIds.length) {
    const { data: extraSlots } = await supabase
      .from('client_session_slots')
      .select('id, scheduled_date')
      .in('id', [...new Set(missingSlotIds)])
    for (const s of (extraSlots as { id: string; scheduled_date: string }[] | null) ?? []) {
      const d = dateKey(s.scheduled_date)
      if (d) slotDateById.set(s.id, d)
    }
  }

  const out: DatedQtyRow[] = []
  for (const row of byId.values()) {
    if (
      isUuid(activeBranchId) &&
      row.branch_id != null &&
      row.branch_id !== activeBranchId
    ) {
      continue
    }
    const moveDate = visitDateFromUsage(row, slotDateById)
    if (!isDateInRange(moveDate, from, to)) continue
    for (const line of row.inventory_treatment_usage_lines ?? []) {
      out.push({
        lineId: `tu:${line.id}`,
        parentId: row.id,
        qty: Number(line.qty_deducted) || 0,
        inventory_item_id: line.inventory_item_id,
        moveDate,
      })
    }
  }
  return out
}

/** Sum qty by item, optionally skipping days already inside a prior saved ending. */
function sumByItemInPeriod(
  rows: DatedQtyRow[] | null | undefined,
  from: string,
  to: string,
  priorEndByItem?: Record<string, string>,
) {
  const map: Record<string, number> = {}
  const seenLine = new Set<string>()
  for (const row of rows ?? []) {
    if (!isDateInRange(row.moveDate, from, to)) continue
    const priorEnd = priorEndByItem?.[row.inventory_item_id]
    // Beginning already includes activity through priorEnd — do not count again as In/Out
    if (priorEnd && row.moveDate <= priorEnd) continue
    if (seenLine.has(row.lineId)) continue
    seenLine.add(row.lineId)
    map[row.inventory_item_id] = (map[row.inventory_item_id] || 0) + Number(row.qty || 0)
  }
  return map
}

/**
 * Stocktake posts overwrite catalog `stock`, which breaks
 * Beginning ≈ stock − receipts + issues. Undo those jumps inside the
 * reconstruction window (counted − system at post time).
 */
async function fetchStocktakeDeltaByItem(
  from: string,
  to: string,
  activeBranchId: string,
): Promise<Record<string, number>> {
  const { data: headers, error: hErr } = await supabase
    .from('inventory_stocktakes')
    .select('id, branch_id, counted_on, status')
    .eq('status', 'completed')
    .gte('counted_on', from)
    .lte('counted_on', to)
  if (hErr) throw hErr

  const ids = ((headers as { id: string; branch_id: string | null; counted_on: string }[] | null) ?? [])
    .filter(
      (h) =>
        matchesBranch(h.branch_id, activeBranchId) && isDateInRange(h.counted_on, from, to),
    )
    .map((h) => h.id)
  if (!ids.length) return {}

  const deltas: Record<string, number> = {}
  const chunkSize = 80
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('inventory_stocktake_lines')
      .select('inventory_item_id, system_qty, counted_qty, line_action')
      .in('stocktake_id', chunk)
    if (error) throw error
    for (const row of (data as {
      inventory_item_id: string
      system_qty: number
      counted_qty: number | null
      line_action?: string | null
    }[] | null) ?? []) {
      if (row.line_action && row.line_action !== 'counted') continue
      if (row.counted_qty == null) continue
      const delta = Number(row.counted_qty) - Number(row.system_qty || 0)
      deltas[row.inventory_item_id] = (deltas[row.inventory_item_id] || 0) + delta
    }
  }
  return deltas
}

async function fetchIssueLinesDetailed(issueIds: string[]): Promise<IssueLineRow[]> {
  if (!issueIds.length) return []
  const out: IssueLineRow[] = []
  const chunkSize = 80
  for (let i = 0; i < issueIds.length; i += chunkSize) {
    const chunk = issueIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('inventory_issue_lines')
      .select('id, inventory_item_id, qty, notes, issue_id, inventory_items(name, sku, unit)')
      .in('issue_id', chunk)
    if (error) throw error
    out.push(...((data as IssueLineRow[] | null) ?? []))
  }
  return out
}

function itemFromLine(line: IssueLineRow) {
  const snap = line.inventory_items
  if (!snap) return null
  return Array.isArray(snap) ? snap[0] ?? null : snap
}

/** Variance = Expected − Count. Positive ⇒ LACKING, negative ⇒ EXCESS. */
function assessVariance(variance: number): AssessmentKind {
  if (variance === 0) return 'BALANCED'
  if (variance > 0) return 'LACKING'
  return 'EXCESS'
}

function assessmentBadge(kind: AssessmentKind | null) {
  if (!kind) return 'badge sa-badge-pending'
  if (kind === 'BALANCED') return 'badge badge-success'
  if (kind === 'LACKING') return 'badge badge-danger'
  return 'badge badge-warning'
}

export function StockAssessment() {
  const { user } = useAuth()
  const { branchId } = useBranch()

  const [preset, setPreset] = useState<RangePreset>('today')
  const [rangeStart, setRangeStart] = useState(() => toDateInput(new Date()))
  const [rangeEnd, setRangeEnd] = useState(() => toDateInput(new Date()))

  const [items, setItems] = useState<ItemRow[]>([])
  const [issues, setIssues] = useState<IssueRow[]>([])
  const [receivedByItem, setReceivedByItem] = useState<Record<string, number>>({})
  const [issuedByItem, setIssuedByItem] = useState<Record<string, number>>({})
  const [recvSinceStart, setRecvSinceStart] = useState<Record<string, number>>({})
  const [issuedSinceStart, setIssuedSinceStart] = useState<Record<string, number>>({})
  /** Prior period ending counts used as Beginning when available. */
  const [priorBeginningByItem, setPriorBeginningByItem] = useState<Record<string, number>>({})
  /** Net stocktake adjustments (counted − system) from rangeStart through today. */
  const [stocktakeDeltaByItem, setStocktakeDeltaByItem] = useState<Record<string, number>>({})
  const loadSeqRef = useRef(0)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /** Manual physical counts keyed by item id (string so empty input stays blank). Loaded/saved in DB. */
  const [endingByItem, setEndingByItem] = useState<Record<string, string>>({})
  const [endingSavingId, setEndingSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [issuedAt, setIssuedAt] = useState(() => toDateInput(new Date()))
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null)

  function applyPreset(next: RangePreset) {
    setPreset(next)
    const now = new Date()
    if (next === 'today') {
      const t = toDateInput(now)
      setRangeStart(t)
      setRangeEnd(t)
    } else if (next === 'week') {
      setRangeStart(toDateInput(startOfWeek(now)))
      setRangeEnd(toDateInput(endOfWeek(now)))
    } else if (next === 'month') {
      setRangeStart(toDateInput(startOfMonth(now)))
      setRangeEnd(toDateInput(endOfMonth(now)))
    }
  }

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    setError('')
    // Clear movement totals immediately so a prior wider range cannot linger on screen
    setReceivedByItem({})
    setIssuedByItem({})
    setRecvSinceStart({})
    setIssuedSinceStart({})
    setStocktakeDeltaByItem({})

    let itemQ = supabase
      .from('inventory_items')
      .select('id, name, sku, stock, unit')
      .is('deleted_at', null)
      .order('name')

    // Headers only — no nested embed, no .or() (both have caused empty Used totals).
    let issueHeaderQ = supabase
      .from('inventory_issues')
      .select('id, branch_id, issued_at, reason, notes, issued_by, created_at')
      .order('issued_at', { ascending: false })
      .limit(120)

    if (isUuid(branchId)) {
      itemQ = itemQ.eq('branch_id', branchId)
    }

    const todayStr = toDateInput(new Date())
    const bKey = branchKeyFor(branchId)
    // Snapshot range for this request — ignore stale responses after period changes
    const from = rangeStart
    const to = rangeEnd

    const [
      { data: itemData, error: itemErr },
      { data: issueHeaderData, error: issueErr },
      { data: endingExactData, error: endingExactErr },
      { data: endingFallbackData, error: endingFallbackErr },
      { data: priorEndingData, error: priorEndingErr },
    ] = await Promise.all([
      itemQ,
      issueHeaderQ,
      supabase
        .from('inventory_assessment_endings')
        .select('inventory_item_id, ending_qty, period_end, updated_at')
        .eq('branch_key', bKey)
        .eq('period_start', from)
        .eq('period_end', to),
      supabase
        .from('inventory_assessment_endings')
        .select('inventory_item_id, ending_qty, period_end, updated_at')
        .eq('branch_key', bKey)
        .eq('period_start', from)
        .order('updated_at', { ascending: false }),
      // Latest ending whose period ended before this range → carry-forward Beginning
      supabase
        .from('inventory_assessment_endings')
        .select('inventory_item_id, ending_qty, period_end, updated_at')
        .eq('branch_key', bKey)
        .lt('period_end', from)
        .order('period_end', { ascending: false })
        .order('updated_at', { ascending: false }),
    ])

    if (seq !== loadSeqRef.current) return

    const priorMap: Record<string, number> = {}
    const priorEndMap: Record<string, string> = {}
    if (!priorEndingErr) {
      for (const row of (priorEndingData as EndingRow[] | null) ?? []) {
        if (priorMap[row.inventory_item_id] !== undefined) continue
        priorMap[row.inventory_item_id] = Math.max(0, Number(row.ending_qty) || 0)
        const pe = dateKey(row.period_end)
        if (pe) priorEndMap[row.inventory_item_id] = pe
      }
    }

    let lineErr: Error | null = null
    let recvSinceLines: DatedQtyRow[] = []
    let issuedSinceLines: DatedQtyRow[] = []
    let recvPeriodLines: DatedQtyRow[] = []
    let issuedPeriodLines: DatedQtyRow[] = []
    let stocktakeDeltas: Record<string, number> = {}
    let recentIssues: IssueRow[] = []

    try {
      const issueHeaders = ((issueHeaderData as IssueRow[] | null) ?? []).filter((row) =>
        matchesBranch(row.branch_id, branchId),
      )

      const [
        recvSinceHeaders,
        issuedSinceHeaders,
        recvPeriodHeaders,
        issuedPeriodHeaders,
        detailedLines,
        stDeltas,
      ] = await Promise.all([
        fetchHeadersInRange('inventory_receipts', 'received_at', from, todayStr, branchId),
        fetchHeadersInRange('inventory_issues', 'issued_at', from, todayStr, branchId),
        fetchHeadersInRange('inventory_receipts', 'received_at', from, to, branchId),
        fetchHeadersInRange('inventory_issues', 'issued_at', from, to, branchId),
        fetchIssueLinesDetailed(issueHeaders.map((h) => h.id)),
        // Undo stocktake stock overwrites so Beginning is not pulled negative
        fetchStocktakeDeltaByItem(from, todayStr, branchId).catch(() => ({})),
      ])

      if (seq !== loadSeqRef.current) return
      stocktakeDeltas = stDeltas

      const [recvSince, issuedSince, recvPeriod, issuedPeriod, treatSince, treatPeriod] =
        await Promise.all([
          fetchLinesChunked('inventory_receipt_lines', 'receipt_id', recvSinceHeaders),
          fetchLinesChunked('inventory_issue_lines', 'issue_id', issuedSinceHeaders),
          fetchLinesChunked('inventory_receipt_lines', 'receipt_id', recvPeriodHeaders),
          fetchLinesChunked('inventory_issue_lines', 'issue_id', issuedPeriodHeaders),
          fetchTreatmentUsageDatedLines(from, todayStr, branchId),
          fetchTreatmentUsageDatedLines(from, to, branchId),
        ])

      recvSinceLines = recvSince
      issuedSinceLines = [...issuedSince, ...treatSince]
      recvPeriodLines = recvPeriod
      issuedPeriodLines = [...issuedPeriod, ...treatPeriod]

      const linesByIssue = new Map<string, IssueLineRow[]>()
      for (const line of detailedLines) {
        const key = line.issue_id || ''
        if (!key) continue
        const list = linesByIssue.get(key) ?? []
        list.push(line)
        linesByIssue.set(key, list)
      }
      recentIssues = issueHeaders.slice(0, 80).map((h) => ({
        ...h,
        inventory_issue_lines: linesByIssue.get(h.id) ?? [],
      }))
    } catch (e) {
      lineErr = e instanceof Error ? e : new Error('Could not load receipt/issue lines')
    }

    if (seq !== loadSeqRef.current) return

    const endingErr = endingExactErr || endingFallbackErr || priorEndingErr
    const errors: string[] = []
    for (const err of [itemErr, issueErr, lineErr, endingErr]) {
      if (!err) continue
      const msg = err.message
      if (
        msg.includes('inventory_assessment_endings') ||
        (msg.includes('schema cache') && msg.toLowerCase().includes('ending'))
      ) {
        errors.push(`${msg} — run supabase/add_inventory_persistence.sql in Supabase SQL Editor.`)
      } else if (
        msg.includes('inventory_issues') ||
        msg.includes('inventory_issue_lines') ||
        msg.includes('inventory_receipt') ||
        msg.includes('schema cache')
      ) {
        errors.push(`${msg} — run supabase/add_inventory_issues.sql in Supabase SQL Editor.`)
      } else {
        errors.push(msg)
      }
    }
    if (errors.length) setError([...new Set(errors)].join(' · '))

    setItems((itemData as ItemRow[] | null) ?? [])
    setIssues(recentIssues)
    // Reconstruction window: activity from range start through today (strict calendar days)
    setRecvSinceStart(sumByItemInPeriod(recvSinceLines, from, todayStr))
    setIssuedSinceStart(sumByItemInPeriod(issuedSinceLines, from, todayStr))
    // Period In/Out: only days inside the selected range, and never days already in Beginning
    setReceivedByItem(sumByItemInPeriod(recvPeriodLines, from, to, priorEndMap))
    setIssuedByItem(sumByItemInPeriod(issuedPeriodLines, from, to, priorEndMap))

    const endingMap: Record<string, string> = {}
    if (!endingExactErr) {
      for (const row of (endingExactData as EndingRow[] | null) ?? []) {
        endingMap[row.inventory_item_id] = String(Number(row.ending_qty) || 0)
      }
    }
    // Fill gaps from same period_start (handles prior saves keyed with period_end = today)
    if (!endingFallbackErr) {
      for (const row of (endingFallbackData as EndingRow[] | null) ?? []) {
        if (endingMap[row.inventory_item_id] !== undefined) continue
        endingMap[row.inventory_item_id] = String(Number(row.ending_qty) || 0)
      }
    }
    setEndingByItem(endingMap)
    setPriorBeginningByItem(priorMap)
    setStocktakeDeltaByItem(stocktakeDeltas)
    setLoading(false)
  }, [branchId, rangeStart, rangeEnd])

  useEffect(() => {
    void load()
  }, [load])

  // Keep the issue form date inside the selected assessment period.
  useEffect(() => {
    setIssuedAt((prev) => {
      if (prev >= rangeStart && prev <= rangeEnd) return prev
      const today = toDateInput(new Date())
      if (today >= rangeStart && today <= rangeEnd) return today
      return rangeEnd
    })
  }, [rangeStart, rangeEnd])

  function endingMigrationHint(msg: string, code?: string) {
    if (
      msg.includes('inventory_assessment_endings') ||
      msg.includes('schema cache') ||
      msg.includes('permission') ||
      code === '42501' ||
      code === '42P01'
    ) {
      return `${msg} — run supabase/add_inventory_persistence.sql in Supabase SQL Editor (Owner/Admin/Inventory role required).`
    }
    return msg
  }

  async function writeEndingRow(payload: {
    branch_key: string
    branch_id: string | null
    period_start: string
    period_end: string
    inventory_item_id: string
    ending_qty: number
    updated_by: string | null
    updated_at: string
  }) {
    const { error: upsertErr } = await supabase
      .from('inventory_assessment_endings')
      .upsert(payload, { onConflict: 'branch_key,period_start,period_end,inventory_item_id' })
    if (!upsertErr) return null

    // Fallback when upsert/onConflict is unavailable: update then insert.
    const { data: existing, error: findErr } = await supabase
      .from('inventory_assessment_endings')
      .select('id')
      .eq('branch_key', payload.branch_key)
      .eq('period_start', payload.period_start)
      .eq('period_end', payload.period_end)
      .eq('inventory_item_id', payload.inventory_item_id)
      .maybeSingle()

    if (findErr && !findErr.message.includes('inventory_assessment_endings')) {
      // keep upsert error if table is missing
    }

    const existingId = (existing as { id?: string } | null)?.id
    if (existingId) {
      const { error: updErr } = await supabase
        .from('inventory_assessment_endings')
        .update({
          ending_qty: payload.ending_qty,
          updated_by: payload.updated_by,
          updated_at: payload.updated_at,
          branch_id: payload.branch_id,
        })
        .eq('id', existingId)
      return updErr
    }

    const { error: insErr } = await supabase.from('inventory_assessment_endings').insert(payload)
    return insErr || upsertErr
  }

  async function persistEnding(itemId: string, raw: string) {
    const bKey = branchKeyFor(branchId)
    setEndingSavingId(itemId)
    setError('')

    // Blank count = not counted yet — remove any saved ending for this period.
    if (raw === '' || raw.trim() === '') {
      const { error: delErr } = await supabase
        .from('inventory_assessment_endings')
        .delete()
        .eq('branch_key', bKey)
        .eq('period_start', rangeStart)
        .eq('period_end', rangeEnd)
        .eq('inventory_item_id', itemId)
      setEndingSavingId(null)
      if (delErr && !delErr.message.includes('inventory_assessment_endings')) {
        setError(endingMigrationHint(delErr.message, delErr.code))
        return
      }
      setEndingByItem((prev) => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
      setMessage('Count cleared · not counted')
      return
    }

    const qty = Math.max(0, Math.floor(Number(raw) || 0))
    const payload = {
      branch_key: bKey,
      branch_id: isUuid(branchId) ? branchId : null,
      period_start: rangeStart,
      period_end: rangeEnd,
      inventory_item_id: itemId,
      ending_qty: qty,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    }
    const writeErr = await writeEndingRow(payload)
    setEndingSavingId(null)
    if (writeErr) {
      setError(endingMigrationHint(writeErr.message, writeErr.code))
      return
    }
    setEndingByItem((prev) => ({ ...prev, [itemId]: String(qty) }))
    setMessage(`Count saved · ${qty}`)
  }

  const sheetRows = useMemo<SheetRow[]>(() => {
    return items.map((item) => {
      // Catalog stock is often overwritten by Stocktake; remove that jump so Beginning
      // reflects ledger qty at period start (e.g. 30) instead of nonsense like -10.
      const reconstructed =
        Number(item.stock) -
        (recvSinceStart[item.id] || 0) +
        (issuedSinceStart[item.id] || 0) -
        (stocktakeDeltaByItem[item.id] || 0)
      const prior = priorBeginningByItem[item.id]
      const beginning = prior !== undefined ? prior : reconstructed
      const received = receivedByItem[item.id] || 0
      const issued = issuedByItem[item.id] || 0
      const expected = beginning + received - issued
      const endingRaw = endingByItem[item.id]
      const counted = endingRaw !== undefined && endingRaw !== ''
      const ending = counted ? Math.max(0, Number(endingRaw) || 0) : 0
      const variance = counted ? expected - ending : null
      return {
        id: item.id,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        beginning,
        received,
        issued,
        expected,
        ending,
        counted,
        variance,
        assessment: counted && variance !== null ? assessVariance(variance) : null,
      }
    })
  }, [
    items,
    recvSinceStart,
    issuedSinceStart,
    stocktakeDeltaByItem,
    priorBeginningByItem,
    receivedByItem,
    issuedByItem,
    endingByItem,
  ])

  const filteredSheetRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sheetRows
    return sheetRows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        (row.unit || '').toLowerCase().includes(q),
    )
  }, [sheetRows, searchQuery])

  async function saveAllEndings() {
    const countedRows = sheetRows.filter((row) => {
      const raw = endingByItem[row.id]
      return raw !== undefined && raw !== ''
    })
    if (!countedRows.length) {
      setError('Enter at least one Count before saving.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    const bKey = branchKeyFor(branchId)
    const rows = countedRows.map((row) => {
      const raw = endingByItem[row.id]
      const qty = Math.max(0, Math.floor(Number(raw) || 0))
      return {
        branch_key: bKey,
        branch_id: isUuid(branchId) ? branchId : null,
        period_start: rangeStart,
        period_end: rangeEnd,
        inventory_item_id: row.id,
        ending_qty: qty,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      }
    })
    const { error: upsertErr } = await supabase
      .from('inventory_assessment_endings')
      .upsert(rows, { onConflict: 'branch_key,period_start,period_end,inventory_item_id' })
    if (upsertErr) {
      let failed: { message: string; code?: string } | null = null
      for (const row of rows) {
        const err = await writeEndingRow(row)
        if (err) {
          failed = err
          break
        }
      }
      setSaving(false)
      if (failed) {
        setError(endingMigrationHint(failed.message, failed.code))
        return
      }
    } else {
      setSaving(false)
    }
    const nextMap: Record<string, string> = {}
    for (const row of rows) {
      nextMap[row.inventory_item_id] = String(row.ending_qty)
    }
    setEndingByItem((prev) => ({ ...prev, ...nextMap }))
    setMessage(`Saved count for ${rows.length} item(s).`)
  }

  function updateLine(index: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  function defaultIssuedDate() {
    const today = toDateInput(new Date())
    if (today >= rangeStart && today <= rangeEnd) return today
    return rangeEnd
  }

  function resetIssueForm() {
    setEditingIssueId(null)
    setIssuedAt(defaultIssuedDate())
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
    if (delta === 0) return true
    const { data } = await supabase
      .from('inventory_items')
      .select('stock')
      .eq('id', itemId)
      .maybeSingle()
    const current = Number((data as { stock?: number } | null)?.stock ?? 0)
    const next = Math.max(0, current + delta)
    const { data: updated, error: updErr } = await supabase
      .from('inventory_items')
      .update({ stock: next })
      .eq('id', itemId)
      .select('id')
      .maybeSingle()
    if (updErr || !updated?.id) {
      setError(
        updErr?.message ||
          'Stock change did not persist. Use an Owner/Admin/Inventory account.',
      )
      return false
    }
    return true
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
        const ok = await applyStockDelta(line.inventory_item_id, Number(line.qty) || 0)
        if (!ok) {
          setSaving(false)
          await load()
          return
        }
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
      const ok = await applyStockDelta(line.inventory_item_id, -line.qty)
      if (!ok) {
        setSaving(false)
        await load()
        return
      }
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
      const restored = await applyStockDelta(line.inventory_item_id, Number(line.qty) || 0)
      if (!restored) {
        await load()
        return
      }
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

  return (
    <div className="stock-assessment-page">
      <PageHeader
        kicker="Inventory"
        title="Stock assessment"
        subtitle="Daily count sheet: opening, in, out, expected on hand, physical count, then BALANCED / LACKING / EXCESS."
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
              className={`btn btn-sm ${preset === 'today' ? 'btn-primary' : 'btn-ghost'}`}
              type="button"
              onClick={() => applyPreset('today')}
            >
              Today
            </button>
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
            In = receiving in this range only · Out = issued/used <em>and</em> treatment
            auto-deducts on the <strong>visit date</strong> (session date), not the day you
            clicked Save · Expected = Beginning + In − Out · Count = physical ending. Beginning =
            last saved count before this range, or ledger opening.
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <h2 className="panel-title" style={{ flex: 1, margin: 0 }}>
            <ClipboardList size={16} style={{ marginRight: 8, verticalAlign: -2 }} />
            Count sheet
          </h2>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={saving || loading || !sheetRows.length}
            onClick={() => void saveAllEndings()}
          >
            {saving ? 'Saving…' : 'Save counts'}
          </button>
        </div>
        <div className="panel-body">
          <label className="sa-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder="Search item or SKU…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>

          {loading ? (
            <div className="empty-state">Loading assessment…</div>
          ) : sheetRows.length === 0 ? (
            <div className="empty-state">No inventory items for this branch.</div>
          ) : filteredSheetRows.length === 0 ? (
            <div className="empty-state">No items match your search.</div>
          ) : (
            <div className="table-wrap sa-table-wrap">
              <table className="data-table sa-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Beginning</th>
                    <th>In</th>
                    <th>Out</th>
                    <th title="Beginning + In − Out">Expected</th>
                    <th>Count</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSheetRows.map((row) => (
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
                      <td>
                        <strong>{row.issued}</strong>
                      </td>
                      <td className="sa-expected-cell">
                        <strong>{row.expected}</strong>
                      </td>
                      <td>
                        <div className="sa-ending">
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={endingByItem[row.id] ?? ''}
                            onChange={(e) => {
                              const next = e.target.value
                              setEndingByItem((prev) => ({ ...prev, [row.id]: next }))
                            }}
                            onBlur={(e) => {
                              void persistEnding(row.id, e.target.value)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur()
                              }
                            }}
                            placeholder="—"
                            aria-label={`Physical count for ${row.name}`}
                            disabled={endingSavingId === row.id}
                          />
                          {endingSavingId === row.id ? (
                            <div className="sa-muted">Saving…</div>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {row.assessment ? (
                          <span
                            className={assessmentBadge(row.assessment)}
                            title={
                              row.variance !== null
                                ? `Expected ${row.expected} − Count ${row.ending} = ${row.variance}`
                                : undefined
                            }
                          >
                            {row.assessment}
                          </span>
                        ) : (
                          <span className={assessmentBadge(null)}>Not counted</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="sa-hint" style={{ marginTop: 12 }}>
            Enter Count, then press Enter or click outside (or Save counts). Status stays “Not
            counted” until a count is entered — including 0. Out includes issues + treatment
            auto-deducts dated{' '}
            {rangeStart} → {rangeEnd}.
          </p>
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
                    const inPeriod =
                      issue.issued_at >= rangeStart && issue.issued_at <= rangeEnd
                    return (
                      <tr key={issue.id}>
                        <td>
                          {issue.issued_at}
                          {!inPeriod ? (
                            <div className="sa-muted">Outside period · not in Used</div>
                          ) : (
                            <div className="sa-muted">In period · counted in Used</div>
                          )}
                        </td>
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
