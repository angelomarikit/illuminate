import { toLocalISODate } from './dates'
import { supabase } from './supabase'
import { isUuid } from './utils'

export type SaleForTotal = {
  id: string
  branch_id: string | null
  receipt_no: string
  customer_name: string | null
  items: string | null
  total: number
  payment_method: string
  sold_at: string
  points_used: number
  sales_by: string | null
  administered_by?: string | null
  staff_name?: string | null
  doctor_notes?: string | null
  /** Cash recognized for clinic sales (installment-safe). */
  recognizedTotal: number
  /** True when package list price was zeroed because installments exist. */
  packageBookedOnPlan: boolean
  isInstallmentLine: boolean
}

/** Local calendar day → timestamptz bounds (Philippine clinic day). */
export function localRangeToSoldAtIso(fromDate: string, toDate: string) {
  const fromIso = new Date(`${fromDate}T00:00:00`).toISOString()
  const toIso = new Date(`${toDate}T23:59:59.999`).toISOString()
  return { fromIso, toIso }
}

export function matchesSalesBranch(
  rowBranchId: string | null | undefined,
  activeBranchId: string | null | undefined,
) {
  if (!activeBranchId || !isUuid(activeBranchId)) return true
  return rowBranchId === activeBranchId || rowBranchId == null
}

export function localDayKeyFromSoldAt(soldAt: string) {
  const d = new Date(soldAt)
  if (Number.isNaN(d.getTime())) return String(soldAt).slice(0, 10)
  return toLocalISODate(d)
}

async function fetchAllSalesInSoldAtRange(fromIso: string, toIso: string) {
  const pageSize = 1000
  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < 50000; from += pageSize) {
    const { data, error } = await supabase
      .from('sales')
      .select(
        'id, branch_id, customer_name, items, total, payment_method, administered_by, sales_by, staff_name, doctor_notes, sold_at, receipt_no, points_used',
      )
      .gte('sold_at', fromIso)
      .lte('sold_at', toIso)
      .order('sold_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const batch = (data as Record<string, unknown>[] | null) ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

async function receiptsWithInstallmentPlans(receiptNos: string[]) {
  const installmentPlanReceipts = new Set<string>()
  const unique = [...new Set(receiptNos.filter(Boolean))]
  for (let i = 0; i < unique.length; i += 80) {
    const chunk = unique.slice(i, i + 80)
    const { data: pkgs } = await supabase
      .from('client_session_packages')
      .select('id, sale_receipt_no')
      .in('sale_receipt_no', chunk)
    const pkgRows =
      (pkgs as { id: string; sale_receipt_no: string | null }[] | null) ?? []
    if (!pkgRows.length) continue
    const pkgIds = pkgRows.map((p) => p.id)
    const { data: paySlots } = await supabase
      .from('client_session_slots')
      .select('package_id, payment_amount')
      .in('package_id', pkgIds)
      .gt('payment_amount', 0)
    const pkgsWithInstallments = new Set(
      ((paySlots as { package_id: string }[] | null) ?? []).map((s) => s.package_id),
    )
    for (const pkg of pkgRows) {
      if (pkg.sale_receipt_no && pkgsWithInstallments.has(pkg.id)) {
        installmentPlanReceipts.add(pkg.sale_receipt_no)
      }
    }
  }
  return installmentPlanReceipts
}

/**
 * Clinic-recognized sales for a local date range + active branch.
 * Same rules for Dashboard and Reports:
 * - local-day ISO sold_at window
 * - branch match includes null branch_id
 * - package list-price zeroed when installment payments exist on that receipt
 * - paginated (no 500-row cap)
 */
export async function loadRecognizedSales(opts: {
  fromDate: string
  toDate: string
  branchId: string | null
}): Promise<{ sales: SaleForTotal[]; total: number; error: string | null }> {
  const from = opts.fromDate
  const to = opts.toDate
  if (!from || !to || from > to) {
    return { sales: [], total: 0, error: 'Choose a valid From / To date range.' }
  }

  try {
    const { fromIso, toIso } = localRangeToSoldAtIso(from, to)
    const raw = await fetchAllSalesInSoldAtRange(fromIso, toIso)
    const inBranch = raw.filter((s) =>
      matchesSalesBranch(s.branch_id as string | null, opts.branchId),
    )

    const installmentPlanReceipts = await receiptsWithInstallmentPlans(
      inBranch.map((s) => String(s.receipt_no || '')),
    )

    const sales: SaleForTotal[] = inBranch.map((s) => {
      const items = (s.items as string | null) ?? null
      const receiptNo = String(s.receipt_no || '')
      const isInstallmentLine = /installment/i.test(items || '')
      const packageBookedOnPlan =
        !isInstallmentLine && Boolean(receiptNo) && installmentPlanReceipts.has(receiptNo)
      const rawPay = Number(s.total) || 0
      return {
        id: String(s.id),
        branch_id: (s.branch_id as string | null) ?? null,
        receipt_no: receiptNo,
        customer_name: (s.customer_name as string | null) ?? null,
        items,
        total: rawPay,
        payment_method: String(s.payment_method || 'Cash'),
        sold_at: String(s.sold_at || ''),
        points_used: Number(s.points_used || 0),
        sales_by: (s.sales_by as string | null) ?? null,
        administered_by: (s.administered_by as string | null) ?? null,
        staff_name: (s.staff_name as string | null) ?? null,
        doctor_notes: (s.doctor_notes as string | null) ?? null,
        recognizedTotal: packageBookedOnPlan ? 0 : rawPay,
        packageBookedOnPlan,
        isInstallmentLine,
      }
    })

    const total = sales.reduce((sum, s) => sum + s.recognizedTotal, 0)
    return { sales, total, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not load sales.'
    return {
      sales: [],
      total: 0,
      error:
        msg.includes('schema cache') || msg.includes('sales')
          ? `${msg} — confirm sales + add_pos_attribution.sql are applied.`
          : msg,
    }
  }
}
