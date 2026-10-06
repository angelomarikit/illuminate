import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, X } from 'lucide-react'
import { StaffAssignField } from './StaffAssignField'
import { StatusMessage } from './StatusMessage'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { syncSessionSlotAppointment } from '../lib/sessionAppointments'
import { formatCurrency, isUuid, receiptNumber } from '../lib/utils'
import { supabase } from '../lib/supabase'
import type { Customer, ServiceItem, ServiceSeries, ServiceSeriesItem } from '../types'
import './AvailServiceModal.css'

const SCHEDULE_HOURS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
]

type ProfileOption = {
  id: string
  full_name: string
  role?: string
}

type SeriesServiceEmbed = { name: string } | { name: string }[] | null

type SeriesItemDbRow = {
  id: string
  category: string
  service_id: string | null
  price_per_session: number | string
  sessions: number
  sort_order: number
  services: SeriesServiceEmbed
}

type SeriesDbRow = {
  id: string
  name: string
  description: string | null
  special_package: number | string | null
  active: boolean
  service_series_items: SeriesItemDbRow[] | null
}

function embedServiceName(services: SeriesServiceEmbed) {
  if (!services) return null
  if (Array.isArray(services)) return services[0]?.name ?? null
  return services.name ?? null
}

type AvailLine = {
  seriesName: string | null
  category: string
  serviceId: string | null
  serviceName: string
  pricePerSession: number
  sessions: number
  packageAmount: number
}

type Props = {
  customer: Customer
  open: boolean
  onClose: () => void
  onSuccess?: (receiptNo: string) => void
}

function todayLabel() {
  return new Date().toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function mapSeries(row: SeriesDbRow): ServiceSeries {
  const items = (row.service_series_items ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((item) => ({
      id: item.id,
      seriesId: row.id,
      category: item.category,
      serviceId: item.service_id,
      serviceName: embedServiceName(item.services),
      pricePerSession: Number(item.price_per_session ?? 0),
      sessions: Number(item.sessions ?? 1),
      sortOrder: item.sort_order,
    }))
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    specialPackage:
      row.special_package === null || row.special_package === undefined
        ? null
        : Number(row.special_package),
    active: row.active,
    items,
  }
}

export function AvailServiceModal({ customer, open, onClose, onSuccess }: Props) {
  const navigate = useNavigate()
  const { branchId } = useBranch()
  const { user } = useAuth()

  const [services, setServices] = useState<ServiceItem[]>([])
  const [seriesList, setSeriesList] = useState<ServiceSeries[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [seriesId, setSeriesId] = useState('')
  /** Category lines kept for this avail (user can remove some). */
  const [keptLineIds, setKeptLineIds] = useState<string[]>([])
  /** Manual overrides for series line price / sessions / package total. */
  const [lineEdits, setLineEdits] = useState<
    Record<string, { pricePerSession: string; sessions: string; packageAmount: string }>
  >({})

  const [category, setCategory] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [pricePerSession, setPricePerSession] = useState('')
  const [specialPackage, setSpecialPackage] = useState('')
  const [manualTotal, setManualTotal] = useState('')
  const [sessions, setSessions] = useState('1')
  const [attendant, setAttendant] = useState('')
  const [notes, setNotes] = useState('')
  const [scheduleDate, setScheduleDate] = useState(() => todayIso())
  const [scheduleTime, setScheduleTime] = useState('10:00')

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      setSeriesId('')
      setKeptLineIds([])
      setLineEdits({})
      setCategory('')
      setServiceId('')
      setPricePerSession('')
      setSpecialPackage('')
      setManualTotal('')
      setSessions('1')
      setAttendant('')
      setNotes('')
      setScheduleDate(todayIso())
      setScheduleTime('10:00')

      const [svcRes, catsRes, profRes, seriesRes] = await Promise.all([
        supabase
          .from('services')
          .select(
            'id, name, category, price, duration_min, points_earn, points_cost, active, description, membership_tier',
          )
          .eq('active', true)
          .order('name'),
        supabase
          .from('service_categories')
          .select('name')
          .eq('active', true)
          .order('sort_order')
          .order('name'),
        supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('role', ['Owner', 'Admin', 'Receptionist', 'Staff'])
          .order('full_name'),
        supabase
          .from('service_series')
          .select(
            'id, name, description, special_package, active, service_series_items(id, category, service_id, price_per_session, sessions, sort_order, services(name))',
          )
          .eq('active', true)
          .order('sort_order')
          .order('name'),
      ])

      if (cancelled) return

      if (svcRes.error) {
        setError(svcRes.error.message)
        setServices([])
      } else {
        setServices(
          svcRes.data?.map((row) => ({
            id: row.id,
            name: row.name,
            category: row.category,
            price: Number(row.price),
            durationMin: row.duration_min,
            pointsEarn: row.points_earn,
            pointsCost: row.points_cost,
            active: row.active,
            description: row.description ?? '',
            membershipTier: (row.membership_tier as ServiceItem['membershipTier']) || null,
          })) ?? [],
        )
      }

      const fromTable = (catsRes.data ?? []).map((row) => row.name as string).filter(Boolean)
      const fromServices = [
        ...new Set((svcRes.data ?? []).map((s) => s.category as string).filter(Boolean)),
      ]
      const merged = [...fromTable]
      for (const name of fromServices) {
        if (!merged.some((c) => c.toLowerCase() === name.toLowerCase())) merged.push(name)
      }
      setCategories(merged)
      if (merged[0]) setCategory(merged[0])

      setProfiles((profRes.data as ProfileOption[] | null) ?? [])

      if (seriesRes.error) {
        if (
          !(
            seriesRes.error.message.includes('service_series') ||
            seriesRes.error.message.includes('schema cache')
          )
        ) {
          setError(seriesRes.error.message)
        }
        setSeriesList([])
      } else {
        setSeriesList(((seriesRes.data as SeriesDbRow[] | null) ?? []).map(mapSeries))
      }

      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [open])

  const selectedSeries = useMemo(
    () => seriesList.find((s) => s.id === seriesId) ?? null,
    [seriesList, seriesId],
  )

  const keptLines = useMemo(() => {
    if (!selectedSeries) return []
    return selectedSeries.items.filter((line) => keptLineIds.includes(line.id))
  }, [selectedSeries, keptLineIds])

  function seedLineEdits(items: ServiceSeriesItem[]) {
    const next: Record<string, { pricePerSession: string; sessions: string; packageAmount: string }> =
      {}
    for (const line of items) {
      next[line.id] = {
        pricePerSession: '',
        sessions: String(line.sessions ?? 1),
        packageAmount: '',
      }
    }
    setLineEdits(next)
  }

  function resolvedLine(line: ServiceSeriesItem) {
    const edit = lineEdits[line.id]
    const price = Math.max(0, Number(edit?.pricePerSession) || 0)
    const sess = Math.max(1, Math.floor(Number(edit?.sessions ?? line.sessions) || 1))
    const packageOverride = Math.max(0, Number(edit?.packageAmount) || 0)
    return {
      ...line,
      pricePerSession: price,
      sessions: sess,
      packageAmount: packageOverride > 0 ? packageOverride : Number((price * sess).toFixed(2)),
    }
  }

  const filteredServices = useMemo(
    () => services.filter((s) => !category || s.category === category),
    [services, category],
  )

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  )

  const sessionCount = Math.max(0, Math.floor(Number(sessions) || 0))
  const unitPrice = Math.max(0, Number(pricePerSession) || 0)
  const specialAmount = Math.max(0, Number(specialPackage) || 0)
  const typedTotal = Math.max(0, Number(manualTotal) || 0)
  const computedTotal = Number((unitPrice * sessionCount).toFixed(2))
  const singleTotal =
    typedTotal > 0 ? typedTotal : specialAmount > 0 ? specialAmount : computedTotal

  const keptTotal = useMemo(
    () => keptLines.reduce((sum, line) => sum + resolvedLine(line).packageAmount, 0),
    [keptLines, lineEdits],
  )

  function onChooseSeries(nextId: string) {
    setError('')
    if (!nextId) {
      setSeriesId('')
      setKeptLineIds([])
      setLineEdits({})
      return
    }
    const plan = seriesList.find((s) => s.id === nextId) ?? null
    setSeriesId(nextId)
    const items = plan?.items ?? []
    setKeptLineIds(items.map((line) => line.id))
    seedLineEdits(items)
  }

  function removeKeptLine(lineId: string) {
    setKeptLineIds((prev) => prev.filter((id) => id !== lineId))
  }

  function restoreAllLines() {
    if (!selectedSeries) return
    setKeptLineIds(selectedSeries.items.map((line) => line.id))
    seedLineEdits(selectedSeries.items)
  }

  function updateLineEdit(
    lineId: string,
    patch: Partial<{ pricePerSession: string; sessions: string; packageAmount: string }>,
  ) {
    setLineEdits((prev) => {
      const base = prev[lineId] ?? {
        pricePerSession: '0',
        sessions: '1',
        packageAmount: '',
      }
      return { ...prev, [lineId]: { ...base, ...patch } }
    })
  }

  function buildManualLine(): AvailLine | null {
    const service = selectedService
    if (!service && !serviceId) return null
    const name = service?.name || services.find((s) => s.id === serviceId)?.name || category
    const packageAmount = singleTotal
    const price =
      sessionCount > 0 && packageAmount > 0
        ? Number((packageAmount / sessionCount).toFixed(2))
        : unitPrice
    return {
      seriesName: null,
      category,
      serviceId: service?.id || serviceId || null,
      serviceName: name,
      pricePerSession: price,
      sessions: sessionCount,
      packageAmount,
    }
  }

  function buildKeptLines(): AvailLine[] {
    if (!selectedSeries) return []
    return keptLines.map((line) => {
      const resolved = resolvedLine(line)
      return {
        seriesName: selectedSeries.name,
        category: line.category,
        serviceId: line.serviceId,
        serviceName: line.serviceName || line.category,
        pricePerSession: resolved.pricePerSession,
        sessions: resolved.sessions,
        packageAmount: resolved.packageAmount,
      }
    })
  }

  async function persistAvail(lines: AvailLine[]) {
    if (!lines.length) {
      setError('Nothing to avail. Keep at least one category, or fill the manual form.')
      return
    }
    if (lines.some((l) => l.sessions < 1 || !(l.packageAmount > 0))) {
      setError('Each availed line needs sessions ≥ 1 and a price greater than 0.')
      return
    }
    if (!attendant.trim()) {
      setError('Select or enter an attendant.')
      return
    }
    if (!scheduleDate) {
      setError('Choose a schedule date for the Appointment Calendar.')
      return
    }
    if (!scheduleTime) {
      setError('Choose a schedule time for the Appointment Calendar.')
      return
    }

    setSaving(true)
    setError('')

    const receipt = receiptNumber()
    const soldOn = todayIso()
    const salesBy = user?.name?.trim() || attendant.trim()
    const attribution = {
      discount_amount: 0,
      doctor_notes: notes.trim() || null,
      administered_by: attendant.trim(),
      consult_by: null as string | null,
      sales_by: salesBy,
    }

    const saleTotal = lines.reduce((sum, line) => sum + line.packageAmount, 0)
    const itemsLabel = lines
      .map((line) => {
        const prefix = line.seriesName ? `${line.seriesName} · ${line.category}` : line.category
        return `${prefix} · ${line.serviceName} · ${line.sessions} sessions @ ${formatCurrency(line.packageAmount)}`
      })
      .join(', ')

    const { error: saleErr } = await supabase.from('sales').insert({
      receipt_no: receipt,
      customer_name: customer.name,
      customer_id: customer.id,
      items: itemsLabel,
      total: saleTotal,
      payment_method: 'Cash',
      points_used: 0,
      wallet_used: 0,
      staff_name: user?.name ?? 'Staff',
      branch_id: isUuid(branchId) ? branchId : null,
      payment_proof_url: null,
      ...attribution,
    })

    if (saleErr) {
      setSaving(false)
      setError(
        saleErr.message.includes('sales_by') ||
          saleErr.message.includes('discount_amount') ||
          saleErr.message.includes('schema cache')
          ? `${saleErr.message} — run supabase/add_pos_attribution.sql in Supabase.`
          : saleErr.message,
      )
      return
    }

    const packageRows = lines.map((line) => ({
      branch_id: isUuid(branchId) ? branchId : null,
      customer_id: customer.id,
      customer_name: customer.name,
      service_id: line.serviceId && isUuid(line.serviceId) ? line.serviceId : null,
      service_name: line.seriesName
        ? `${line.seriesName} · ${line.category} (${line.serviceName})`
        : line.serviceName,
      total_sessions: line.sessions,
      sessions_used: 0,
      package_amount: line.packageAmount,
      sold_on: soldOn,
      next_session_date: scheduleDate,
      sale_receipt_no: receipt,
      status: 'active',
      ...attribution,
    }))

    const { data: insertedPackages, error: sessionErr } = await supabase
      .from('client_session_packages')
      .insert(packageRows)
      .select('id, service_name, total_sessions')

    if (sessionErr) {
      setSaving(false)
      setError(
        sessionErr.message.includes('client_session_packages') ||
          sessionErr.message.includes('schema cache')
          ? `${sessionErr.message} — run supabase/add_client_sessions.sql and add_pos_attribution.sql.`
          : sessionErr.message,
      )
      return
    }

    const packages = (insertedPackages ?? []) as {
      id: string
      service_name: string
      total_sessions: number
    }[]

    for (const pkg of packages) {
      const slotPayload = {
        package_id: pkg.id,
        session_number: 1,
        scheduled_date: scheduleDate,
        scheduled_time: `${scheduleTime}:00`,
        status: 'scheduled',
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const { error: slotErr } = await supabase.from('client_session_slots').upsert(slotPayload, {
        onConflict: 'package_id,session_number',
      })
      if (slotErr) {
        setSaving(false)
        setError(
          slotErr.message.includes('client_session_slots') || slotErr.message.includes('schema cache')
            ? `${slotErr.message} — run supabase/add_client_session_slots.sql in Supabase.`
            : slotErr.message,
        )
        return
      }

      await syncSessionSlotAppointment({
        packageId: pkg.id,
        sessionNumber: 1,
        customerName: customer.name,
        serviceName: pkg.service_name,
        staffName: attendant.trim(),
        scheduledDate: scheduleDate,
        scheduledTime: scheduleTime,
        status: 'scheduled',
        notes: notes.trim() || null,
        branchId,
        customerPhone: customer.phone,
        customerEmail: customer.email,
      })
    }

    await supabase
      .from('customers')
      .update({
        visits: (customer.visits ?? 0) + 1,
        last_visit: soldOn,
      })
      .eq('id', customer.id)

    setSaving(false)
    onSuccess?.(receipt)
    onClose()
    navigate('/sessions', {
      state: { availed: customer.name, receipt },
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (selectedSeries) {
      await persistAvail(buildKeptLines())
      return
    }
    const line = buildManualLine()
    if (!line) {
      setError('Select a series, or fill category and service manually.')
      return
    }
    await persistAvail([line])
  }

  if (!open) return null

  return (
    <div
      className="confirm-modal-overlay avail-overlay"
      role="presentation"
    >
      <div
        className="confirm-modal avail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avail-service-title"
      >
        <div className="avail-head">
          <div>
            <p className="confirm-modal-kicker">Sales</p>
            <h2 id="avail-service-title" className="confirm-modal-title">
              Avail service
            </h2>
          </div>
          <button
            className="btn-icon"
            type="button"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <form className="avail-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="avail-body">
          {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

          <div className="avail-meta">
            <div>
              <span>Client</span>
              <strong>{customer.name}</strong>
            </div>
            <div>
              <span>Date today</span>
              <strong>{todayLabel()}</strong>
            </div>
          </div>

          <div className="avail-series-pick">
            <div className="field" style={{ margin: 0 }}>
              <label>Series (optional)</label>
              <select
                className="select"
                value={seriesId}
                disabled={loading}
                onChange={(e) => onChooseSeries(e.target.value)}
              >
                <option value="">No series — fill form manually</option>
                {seriesList.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                    {plan.items.length ? ` (${plan.items.length} categories)` : ''}
                  </option>
                ))}
              </select>
            </div>
            <p className="avail-hint">
              Choose a series to load its services below. Enter the package price manually for this
              avail, remove any category you don’t want, then confirm.
            </p>
          </div>

          {loading ? (
            <p className="avail-loading">Loading…</p>
          ) : selectedSeries ? (
            <>
              <div className="avail-list-block">
                <div className="avail-list-title-row">
                  <div className="avail-list-title">
                    Categories in {selectedSeries.name} ({keptLines.length} of{' '}
                    {selectedSeries.items.length} selected)
                  </div>
                  {keptLineIds.length < selectedSeries.items.length ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={restoreAllLines}
                    >
                      Restore all
                    </button>
                  ) : null}
                </div>

                {selectedSeries.items.length === 0 ? (
                  <p className="avail-loading">This series has no category lines yet.</p>
                ) : keptLines.length === 0 ? (
                  <div className="avail-empty-kept">
                    <p>All categories were removed for this avail.</p>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={restoreAllLines}>
                      Restore all categories
                    </button>
                  </div>
                ) : (
                  <div className="avail-card-list">
                    {keptLines.map((line, index) => {
                      const edit = lineEdits[line.id] ?? {
                        pricePerSession: '',
                        sessions: String(line.sessions),
                        packageAmount: '',
                      }
                      const resolved = resolvedLine(line)
                      return (
                        <article key={line.id} className="avail-cat-card">
                          <div className="avail-cat-card-head">
                            <span>
                              Category {index + 1}: {line.category}
                            </span>
                            <button
                              type="button"
                              className="avail-remove-btn"
                              onClick={() => removeKeptLine(line.id)}
                              aria-label={`Remove ${line.category}`}
                            >
                              <Trash2 size={14} />
                              Remove
                            </button>
                          </div>
                          <div className="avail-cat-card-grid">
                            <div>
                              <span>Service</span>
                              <strong>{line.serviceName || '—'}</strong>
                            </div>
                            <div className="field" style={{ margin: 0 }}>
                              <label htmlFor={`avail-sess-${line.id}`}>Sessions</label>
                              <input
                                id={`avail-sess-${line.id}`}
                                className="input"
                                type="number"
                                min="1"
                                step="1"
                                value={edit.sessions}
                                onChange={(e) =>
                                  updateLineEdit(line.id, {
                                    sessions: e.target.value,
                                    packageAmount: '',
                                  })
                                }
                              />
                            </div>
                            <div className="field" style={{ margin: 0 }}>
                              <label htmlFor={`avail-price-${line.id}`}>Price / session *</label>
                              <input
                                id={`avail-price-${line.id}`}
                                className="input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={edit.pricePerSession}
                                onChange={(e) =>
                                  updateLineEdit(line.id, {
                                    pricePerSession: e.target.value,
                                    packageAmount: '',
                                  })
                                }
                                placeholder="Enter price"
                                required
                              />
                            </div>
                            <div className="field" style={{ margin: 0 }}>
                              <label htmlFor={`avail-pkg-${line.id}`}>Package total</label>
                              <input
                                id={`avail-pkg-${line.id}`}
                                className="input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  edit.packageAmount !== ''
                                    ? edit.packageAmount
                                    : resolved.packageAmount > 0
                                      ? String(resolved.packageAmount)
                                      : ''
                                }
                                onChange={(e) =>
                                  updateLineEdit(line.id, { packageAmount: e.target.value })
                                }
                                placeholder="Or enter total"
                              />
                            </div>
                          </div>
                          <p className="avail-hint" style={{ marginTop: 8 }}>
                            Series has no stored price — enter the clinic package amount manually.
                          </p>
                        </article>
                      )
                    })}
                  </div>
                )}

                <div className="avail-all-banner">
                  Will avail {keptLines.length} categor
                  {keptLines.length === 1 ? 'y' : 'ies'} — total{' '}
                  <strong>{formatCurrency(keptTotal)}</strong>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="avail-list-block">
                <div className="avail-list-title">Manual service</div>
                <p className="avail-loading">
                  No series selected. Fill category and service below, or choose a series above.
                </p>
              </div>

              <div className="avail-grid">
                <div className="field">
                  <label>Category</label>
                  <select
                    className="select"
                    value={category}
                    onChange={(e) => {
                      const next = e.target.value
                      setCategory(next)
                      const first = services.find((s) => s.category === next)
                      setServiceId(first?.id || '')
                      setPricePerSession(first ? String(first.price) : '')
                    }}
                    required
                  >
                    <option value="">Select category…</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Selected service</label>
                  <select
                    className="select"
                    value={serviceId}
                    onChange={(e) => {
                      const id = e.target.value
                      setServiceId(id)
                      const svc = services.find((s) => s.id === id)
                      if (svc) {
                        setPricePerSession(String(svc.price))
                        setManualTotal('')
                        setSpecialPackage('')
                      }
                    }}
                    required
                  >
                    <option value="">Select service…</option>
                    {(filteredServices.length ? filteredServices : services).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {formatCurrency(s.price)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Price per session</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pricePerSession}
                    onChange={(e) => {
                      setPricePerSession(e.target.value)
                      setManualTotal('')
                      setSpecialPackage('')
                    }}
                    required
                  />
                </div>

                <div className="field">
                  <label>Special package</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={specialPackage}
                    onChange={(e) => {
                      setSpecialPackage(e.target.value)
                      setManualTotal(e.target.value)
                    }}
                    placeholder="Optional package total"
                  />
                </div>

                <div className="field">
                  <label>Sessions</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    value={sessions}
                    onChange={(e) => {
                      setSessions(e.target.value)
                      setManualTotal('')
                    }}
                    required
                  />
                </div>

                <div className="field">
                  <label>Total price</label>
                  <input
                    className="input avail-total-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualTotal !== '' ? manualTotal : String(singleTotal || '')}
                    onChange={(e) => {
                      setManualTotal(e.target.value)
                      setSpecialPackage(e.target.value)
                    }}
                    placeholder="Enter amount"
                    required
                  />
                  <p className="avail-hint">
                    {typedTotal > 0 || specialAmount > 0
                      ? 'Using manually entered total'
                      : `${formatCurrency(unitPrice)} × ${sessionCount || 0} sessions — edit to log a custom price`}
                  </p>
                </div>
              </div>
            </>
          )}

          <div className="avail-grid">
            <div className="field">
              <label htmlFor="avail-schedule-date">Schedule date *</label>
              <input
                id="avail-schedule-date"
                className="input"
                type="date"
                required
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="avail-schedule-time">Schedule time *</label>
              <select
                id="avail-schedule-time"
                className="select"
                required
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              >
                {SCHEDULE_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <p className="avail-hint avail-span-2">
              First session is listed on the Appointment Calendar at this date and time. Additional
              sessions can be scheduled later under Client Sessions.
            </p>

            <div className="avail-span-2">
              <StaffAssignField
                label="Attendant"
                value={attendant}
                onChange={setAttendant}
                profiles={profiles}
                compact
                required
                hint="Same as Administered by on Sessions / POS"
              />
            </div>

            <div className="field avail-span-2">
              <label>Notes</label>
              <textarea
                className="textarea"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </div>
          </div>

          <div className="avail-foot">
            <button className="btn btn-ghost" type="button" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving || loading}>
              {saving
                ? 'Saving…'
                : selectedSeries
                  ? `Confirm avail (${keptLines.length}) · ${formatCurrency(keptTotal)}`
                  : 'Confirm avail'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
