import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileBarChart2, Search, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { canDeleteClinicData } from '../lib/roles'
import { supabase } from '../lib/supabase'
import { downloadCsv, formatCurrency, isUuid } from '../lib/utils'
import './reports.css'

type SaleRow = {
  id: string
  branch_id: string | null
  customer_name: string | null
  items: string
  total: number | string
  payment_method: string
  administered_by: string | null
  sales_by: string | null
  staff_name: string | null
  doctor_notes: string | null
  sold_at: string
  receipt_no: string
}

type PackageEmbed = {
  customer_name: string | null
  service_name: string | null
  administered_by: string | null
  doctor_notes: string | null
  sales_by: string | null
  branch_id: string | null
  package_amount?: number | string | null
}

export type ReportRow = {
  id: string
  /** Raw sales.id or client_session_slots.id for delete */
  recordId: string
  source: 'sale' | 'session'
  client: string
  service: string
  sessionDate: string
  sessionDateSort: string
  payment: number
  paymentLabel: string
  attendant: string
  remarks: string
  receiptNo?: string
}

const PAGE_SIZE = 15

function toDateInput(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonthInput() {
  const d = new Date()
  return toDateInput(new Date(d.getFullYear(), d.getMonth(), 1))
}

function formatSessionDate(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  })
}

function matchesBranch(rowBranchId: string | null | undefined, activeBranchId: string) {
  if (!isUuid(activeBranchId)) return true
  return rowBranchId === activeBranchId || rowBranchId == null
}

export function Reports() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const canDelete = canDeleteClinicData(user?.role)
  const [fromDate, setFromDate] = useState(startOfMonthInput)
  const [toDate, setToDate] = useState(() => toDateInput(new Date()))
  const [appliedFrom, setAppliedFrom] = useState(startOfMonthInput)
  const [appliedTo, setAppliedTo] = useState(() => toDateInput(new Date()))

  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const from = appliedFrom
    const to = appliedTo
    if (!from || !to || from > to) {
      setError('Choose a valid From / To date range.')
      setRows([])
      setLoading(false)
      return
    }

    // Local calendar day bounds (clinic timezone), then convert for timestamptz compare.
    const fromIso = new Date(`${from}T00:00:00`).toISOString()
    const toIso = new Date(`${to}T23:59:59.999`).toISOString()

    const { data: salesData, error: salesErr } = await supabase
      .from('sales')
      .select(
        'id, branch_id, customer_name, items, total, payment_method, administered_by, sales_by, staff_name, doctor_notes, sold_at, receipt_no',
      )
      .gte('sold_at', fromIso)
      .lte('sold_at', toIso)
      .order('sold_at', { ascending: false })

    if (salesErr) {
      setError(
        salesErr.message.includes('schema cache') || salesErr.message.includes('sales')
          ? `${salesErr.message} — confirm sales + add_pos_attribution.sql are applied.`
          : salesErr.message,
      )
      setRows([])
      setLoading(false)
      return
    }

    const salesInRange = ((salesData as SaleRow[] | null) ?? []).filter((s) =>
      matchesBranch(s.branch_id, branchId),
    )

    // Original package receipts must not count when installment payments exist for that package
    // (otherwise Reports = full package price + installment = double count).
    const installmentPlanReceipts = new Set<string>()
    const receiptNos = [
      ...new Set(salesInRange.map((s) => s.receipt_no).filter(Boolean)),
    ]
    for (let i = 0; i < receiptNos.length; i += 80) {
      const chunk = receiptNos.slice(i, i + 80)
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

    const saleRows: ReportRow[] = salesInRange.map((s) => {
      const day = new Date(s.sold_at)
      const dayStr = Number.isNaN(day.getTime()) ? s.sold_at.slice(0, 10) : toDateInput(day)
      const isInstallmentLine = /installment/i.test(s.items || '')
      const isPackageBookedOnPlan =
        !isInstallmentLine && installmentPlanReceipts.has(s.receipt_no)
      const rawPay = Number(s.total) || 0
      return {
        id: `sale-${s.id}`,
        recordId: s.id,
        source: 'sale' as const,
        client: s.customer_name?.trim() || 'Walk-in',
        service: s.items || '—',
        sessionDate: formatSessionDate(dayStr),
        sessionDateSort: dayStr,
        payment: isPackageBookedOnPlan ? 0 : rawPay,
        paymentLabel: isPackageBookedOnPlan
          ? 'Package booked · paid via installments'
          : isInstallmentLine
            ? `${s.payment_method || 'Cash'} · installment`
            : s.payment_method || 'Cash',
        attendant:
          s.administered_by?.trim() || s.sales_by?.trim() || s.staff_name?.trim() || '—',
        remarks: isPackageBookedOnPlan
          ? [s.doctor_notes?.trim(), `List price ${rawPay.toLocaleString('en-PH')}`]
              .filter(Boolean)
              .join(' · ')
          : s.doctor_notes?.trim() || '',
        receiptNo: s.receipt_no,
      }
    })

    // Finished package visits (₱0 payment) — two-step load avoids empty nested embeds.
    const slotRows: ReportRow[] = []
    const { data: slotHeaders, error: slotsErr } = await supabase
      .from('client_session_slots')
      .select('id, package_id, scheduled_date, session_number, status, notes')
      .eq('status', 'finished')
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date', { ascending: false })

    if (!slotsErr) {
      type SlotHeader = {
        id: string
        package_id: string
        scheduled_date: string | null
        session_number: number
        notes: string | null
      }
      const headers = (slotHeaders as SlotHeader[] | null) ?? []
      const packageIds = [...new Set(headers.map((h) => h.package_id).filter(Boolean))]
      const pkgById = new Map<string, PackageEmbed & { id: string }>()

      for (let i = 0; i < packageIds.length; i += 80) {
        const chunk = packageIds.slice(i, i + 80)
        const { data: pkgs } = await supabase
          .from('client_session_packages')
          .select(
            'id, customer_name, service_name, administered_by, doctor_notes, sales_by, branch_id, package_amount',
          )
          .in('id', chunk)
        for (const pkg of (pkgs as (PackageEmbed & { id: string })[] | null) ?? []) {
          pkgById.set(pkg.id, pkg)
        }
      }

      for (const slot of headers) {
        if (!slot.scheduled_date) continue
        const pkg = pkgById.get(slot.package_id)
        if (!matchesBranch(pkg?.branch_id, branchId)) continue
        slotRows.push({
          id: `slot-${slot.id}`,
          recordId: slot.id,
          source: 'session',
          client: pkg?.customer_name?.trim() || 'Client',
          service: pkg?.service_name?.trim()
            ? `${pkg.service_name} · session ${slot.session_number}`
            : `Session ${slot.session_number}`,
          sessionDate: formatSessionDate(slot.scheduled_date),
          sessionDateSort: slot.scheduled_date,
          payment: 0,
          paymentLabel: 'Package session',
          attendant: pkg?.administered_by?.trim() || pkg?.sales_by?.trim() || '—',
          remarks: (slot.notes || pkg?.doctor_notes || '').trim(),
        })
      }
    } else if (
      !slotsErr.message.includes('client_session_slots') &&
      !slotsErr.message.includes('schema cache')
    ) {
      setError(slotsErr.message)
    }

    const merged = [...saleRows, ...slotRows].sort((a, b) => {
      if (a.sessionDateSort !== b.sessionDateSort) {
        return a.sessionDateSort < b.sessionDateSort ? 1 : -1
      }
      return a.client.localeCompare(b.client)
    })

    setRows(merged)
    setPage(1)
    setLoading(false)
  }, [appliedFrom, appliedTo, branchId])

  useEffect(() => {
    void load()
  }, [load])

  function onGetReports() {
    setMessage('')
    setError('')
    if (fromDate === appliedFrom && toDate === appliedTo) {
      void load()
      return
    }
    setAppliedFrom(fromDate)
    setAppliedTo(toDate)
  }

  async function deleteReportRow(row: ReportRow) {
    if (!canDelete) {
      setError('Only Admin or Owner can delete report records.')
      return
    }
    const kind = row.source === 'sale' ? 'sale receipt' : 'package visit'
    const ok = window.confirm(
      `Delete this ${kind}?\n\n${row.client}\n${row.service}\n${row.sessionDate}` +
        (row.payment > 0 ? `\nPayment: ${row.payment}` : '') +
        '\n\nThis cannot be undone.',
    )
    if (!ok) return

    setDeletingId(row.id)
    setError('')
    setMessage('')

    if (row.source === 'sale') {
      // Clear installment slot links before deleting the sale
      await supabase
        .from('client_session_slots')
        .update({ sale_id: null, payment_amount: 0 })
        .eq('sale_id', row.recordId)

      const { error: delErr } = await supabase.from('sales').delete().eq('id', row.recordId)
      setDeletingId(null)
      if (delErr) {
        setError(delErr.message)
        return
      }
      setMessage(`Deleted sale${row.receiptNo ? ` ${row.receiptNo}` : ''}.`)
    } else {
      const { data: slot, error: findErr } = await supabase
        .from('client_session_slots')
        .select('id, package_id, sale_id, status')
        .eq('id', row.recordId)
        .maybeSingle()

      if (findErr || !slot) {
        setDeletingId(null)
        setError(findErr?.message || 'Session visit not found.')
        return
      }

      const slotRow = slot as {
        id: string
        package_id: string
        sale_id: string | null
        status: string
      }

      if (slotRow.sale_id) {
        await supabase.from('sales').delete().eq('id', slotRow.sale_id)
      }

      // Reset visit so it no longer appears as a finished package visit in Reports
      const { error: updErr } = await supabase
        .from('client_session_slots')
        .update({
          status: 'pending',
          scheduled_date: null,
          scheduled_time: null,
          payment_amount: 0,
          attendant: null,
          sale_id: null,
          notes: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', slotRow.id)

      if (updErr) {
        setDeletingId(null)
        setError(updErr.message)
        return
      }

      const { data: siblings } = await supabase
        .from('client_session_slots')
        .select('status')
        .eq('package_id', slotRow.package_id)
      const finished = ((siblings as { status: string }[] | null) ?? []).filter(
        (s) => s.status === 'finished',
      ).length
      await supabase
        .from('client_session_packages')
        .update({
          sessions_used: finished,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', slotRow.package_id)

      setDeletingId(null)
      setMessage('Deleted package visit from reports.')
    }

    await load()
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.client.toLowerCase().includes(q) ||
        r.service.toLowerCase().includes(q) ||
        r.attendant.toLowerCase().includes(q) ||
        r.remarks.toLowerCase().includes(q) ||
        r.paymentLabel.toLowerCase().includes(q) ||
        (r.receiptNo || '').toLowerCase().includes(q),
    )
  }, [rows, query])

  const totalSales = useMemo(
    () => filtered.reduce((sum, r) => sum + r.payment, 0),
    [filtered],
  )

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function exportCsv() {
    downloadCsv(
      `illuminate-reports-${appliedFrom}-to-${appliedTo}.csv`,
      ['Client', 'Service Availed', 'Session Date', 'Payment', 'Payment Method', 'Attendant', 'Remarks', 'Source', 'Receipt'],
      filtered.map((r) => [
        r.client,
        r.service,
        r.sessionDate,
        r.payment,
        r.paymentLabel,
        r.attendant,
        r.remarks,
        r.source,
        r.receiptNo || '',
      ]),
    )
    setMessage('Report CSV downloaded.')
  }

  return (
    <div className="reports-page">
      <PageHeader
        kicker="Reports"
        title="Sales & session reports"
        subtitle="Same view as the classic Reports page — date range, total sales, services availed, attendants, and remarks from POS and Avail Service."
        actions={
          <button
            className="btn btn-ghost"
            type="button"
            onClick={exportCsv}
            disabled={!filtered.length}
          >
            <Download size={15} style={{ marginRight: 6 }} />
            Export
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="panel reports-filters">
        <div className="panel-body reports-filters-body">
          <div className="reports-date-card">
            <label htmlFor="reports-from">From</label>
            <input
              id="reports-from"
              className="input"
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="reports-date-card">
            <label htmlFor="reports-to">To</label>
            <input
              id="reports-to"
              className="input"
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="button" onClick={onGetReports} disabled={loading}>
            {loading ? 'Loading…' : 'Get Reports'}
          </button>
          <label className="reports-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder="Search client, service, attendant…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
            />
          </label>
        </div>
      </div>

      <div className="reports-total">
        <FileBarChart2 size={22} aria-hidden />
        <div>
          <p className="reports-total-label">Total sales</p>
          <p className="reports-total-value">{formatCurrency(totalSales)}</p>
          <p className="reports-total-meta">
            {filtered.length} row{filtered.length === 1 ? '' : 's'} · {appliedFrom} → {appliedTo}
            {isUuid(branchId) ? ' · this branch' : ' · all branches'}
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="panel-title" style={{ margin: 0 }}>
            Reports (Page {safePage} of {pageCount})
          </h2>
          <div className="reports-pager">
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading reports…</div>
          ) : pageRows.length === 0 ? (
            <div className="empty-state">
              No sales or finished sessions in this range. Complete a POS checkout or Avail Service,
              or finish a scheduled session visit.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table reports-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Service Availed</th>
                    <th>Session Date</th>
                    <th>Payment</th>
                    <th>Attendant</th>
                    <th>Remarks</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.client}</strong>
                        {row.source === 'session' ? (
                          <div className="reports-muted">Package visit</div>
                        ) : row.receiptNo ? (
                          <div className="reports-muted">{row.receiptNo}</div>
                        ) : null}
                      </td>
                      <td>{row.service}</td>
                      <td>{row.sessionDate}</td>
                      <td>
                        <strong>
                          {row.payment.toLocaleString('en-PH', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}
                        </strong>
                        <div className="reports-muted">{row.paymentLabel}</div>
                      </td>
                      <td>{row.attendant}</td>
                      <td>{row.remarks || '—'}</td>
                      <td>
                        {canDelete ? (
                          <button
                            type="button"
                            className="btn reports-delete-btn btn-sm"
                            disabled={deletingId === row.id}
                            aria-label={`Delete ${row.client} ${row.service}`}
                            title="Delete from reports (Admin only)"
                            onClick={() => void deleteReportRow(row)}
                          >
                            <Trash2 size={14} aria-hidden />
                            {deletingId === row.id ? '…' : 'Delete'}
                          </button>
                        ) : (
                          <span className="reports-muted">—</span>
                        )}
                      </td>
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
