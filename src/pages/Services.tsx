import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { FolderPlus, Layers, Plus, Trash2, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { isElevatedRole } from '../lib/roles'
import { formatCurrency } from '../lib/utils'
import { supabase } from '../lib/supabase'
import type { ServiceCategory, ServiceItem, ServiceSeries } from '../types'
import './services.css'

type Row = {
  id: string
  name: string
  category: string
  price: number | string
  duration_min: number
  points_earn: number
  points_cost: number
  active: boolean
  description: string | null
}

type CategoryRow = {
  id: string
  name: string
  sort_order: number
  active: boolean
}

const DEFAULT_CATEGORIES = [
  'Facials',
  'Injectables',
  'Laser',
  'Body',
  'Skincare',
  'Packages',
  'Membership',
]

const empty = {
  name: '',
  category: 'Facials' as ServiceCategory,
  price: '',
  durationMin: '60',
  pointsEarn: '0',
  pointsCost: '0',
  description: '',
}

type SeriesItemDraft = {
  key: string
  category: string
  serviceId: string
  sessions: string
}

function newSeriesItemDraft(partial?: Partial<SeriesItemDraft>): SeriesItemDraft {
  return {
    key: crypto.randomUUID(),
    category: '',
    serviceId: '',
    sessions: '1',
    ...partial,
  }
}

function draftsForAllCategories(
  categoryNames: string[],
  activeServices: { id: string; category: string; price: number }[],
): SeriesItemDraft[] {
  const names = categoryNames.length ? categoryNames : ['']
  return names.map((category) => {
    const first = activeServices.find((s) => !category || s.category === category)
    return newSeriesItemDraft({
      category,
      serviceId: first?.id || '',
    })
  })
}

const emptySeries = {
  name: '',
  description: '',
  items: [newSeriesItemDraft()] as SeriesItemDraft[],
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

function mapRow(row: Row): ServiceItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    durationMin: row.duration_min,
    pointsEarn: row.points_earn,
    pointsCost: row.points_cost,
    active: row.active,
    description: row.description ?? '',
  }
}

export function Services() {
  const { user } = useAuth()
  const canManageCategories = isElevatedRole(user?.role)
  const [items, setItems] = useState<ServiceItem[]>([])
  const [series, setSeries] = useState<ServiceSeries[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showSeriesForm, setShowSeriesForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [seriesForm, setSeriesForm] = useState(emptySeries)
  const [categoryName, setCategoryName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingSeries, setSavingSeries] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<
    | { type: 'service'; item: ServiceItem }
    | { type: 'series'; item: ServiceSeries }
    | { type: 'category'; id: string; name: string; count: number }
    | null
  >(null)

  const categoryOptions = useMemo(() => {
    const names = categories.filter((c) => c.active).map((c) => c.name)
    if (!names.length) return DEFAULT_CATEGORIES
    return names
  }, [categories])

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      const key = item.category || 'Uncategorized'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [items])

  const activeServices = useMemo(() => items.filter((s) => s.active), [items])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, error: err }, { data: catData, error: catErr }, seriesRes] = await Promise.all([
      supabase.from('services').select('*').order('name'),
      supabase
        .from('service_categories')
        .select('id, name, sort_order, active')
        .eq('active', true)
        .order('sort_order')
        .order('name'),
      supabase
        .from('service_series')
        .select(
          'id, name, description, special_package, active, service_series_items(id, category, service_id, price_per_session, sessions, sort_order, services(name))',
        )
        .order('sort_order')
        .order('name'),
    ])
    if (err) setError(err.message)
    else if (catErr) {
      // Table may not exist yet — fall back to defaults without blocking services.
      setError('')
      setCategories([])
      setItems((data as Row[] | null)?.map(mapRow) ?? [])
    } else {
      setError('')
      const cats = (catData as CategoryRow[] | null) ?? []
      setCategories(cats)
      setItems((data as Row[] | null)?.map(mapRow) ?? [])
      const first = cats[0]?.name
      if (first) {
        setForm((f) => (cats.some((c) => c.name === f.category) ? f : { ...f, category: first }))
      }
    }

    if (seriesRes.error) {
      if (
        seriesRes.error.message.includes('service_series') ||
        seriesRes.error.message.includes('schema cache')
      ) {
        setSeries([])
        if (!err && !catErr) {
          setError(
            `${seriesRes.error.message} — run supabase/add_service_series.sql in Supabase.`,
          )
        }
      } else {
        setError(seriesRes.error.message)
        setSeries([])
      }
    } else {
      setSeries(((seriesRes.data as SeriesDbRow[] | null) ?? []).map(mapSeries))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!showForm && !showSeriesForm && !showCategoryForm && !confirmDelete) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (confirmDelete && !deleting) {
        setConfirmDelete(null)
        return
      }
      if (showCategoryForm && !savingCategory) {
        setShowCategoryForm(false)
        setCategoryName('')
        return
      }
      if (showSeriesForm && !savingSeries) {
        setShowSeriesForm(false)
        setSeriesForm(emptySeries)
        return
      }
      if (showForm && !saving) {
        setShowForm(false)
        setForm({ ...empty, category: categoryOptions[0] || 'Facials' })
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [
    showForm,
    showSeriesForm,
    showCategoryForm,
    confirmDelete,
    saving,
    savingSeries,
    savingCategory,
    deleting,
    categoryOptions,
  ])

  function openCategoryModal() {
    setCategoryName('')
    setError('')
    setShowCategoryForm(true)
  }

  function closeCategoryModal() {
    if (savingCategory) return
    setShowCategoryForm(false)
    setCategoryName('')
  }

  function openServiceModal() {
    setError('')
    setForm({ ...empty, category: categoryOptions[0] || 'Facials' })
    setShowForm(true)
  }

  function closeServiceModal() {
    if (saving) return
    setShowForm(false)
    setForm({ ...empty, category: categoryOptions[0] || 'Facials' })
  }

  function openSeriesModal() {
    if (!canManageCategories) return
    setError('')
    setSeriesForm({
      name: '',
      description: '',
      items: draftsForAllCategories(categoryOptions, activeServices),
    })
    setShowSeriesForm(true)
  }

  function closeSeriesModal() {
    if (savingSeries) return
    setShowSeriesForm(false)
    setSeriesForm(emptySeries)
  }

  function updateSeriesItem(key: string, patch: Partial<SeriesItemDraft>) {
    setSeriesForm((f) => ({
      ...f,
      items: f.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }))
  }

  function addSeriesCategoryLine() {
    const used = new Set(seriesForm.items.map((item) => item.category).filter(Boolean))
    const nextCategory = categoryOptions.find((c) => !used.has(c)) || ''
    const first = activeServices.find((s) => !nextCategory || s.category === nextCategory)
    setSeriesForm((f) => ({
      ...f,
      items: [
        ...f.items,
        newSeriesItemDraft({
          category: nextCategory,
          serviceId: first?.id || '',
        }),
      ],
    }))
  }

  function removeSeriesCategoryLine(key: string) {
    setSeriesForm((f) => ({
      ...f,
      items: f.items.filter((item) => item.key !== key),
    }))
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    const { error: err } = await supabase.from('services').insert({
      name: form.name.trim(),
      category: form.category,
      price: Number(form.price),
      duration_min: Number(form.durationMin) || 0,
      points_earn: Number(form.pointsEarn) || 0,
      points_cost: Number(form.pointsCost) || 0,
      description: form.description.trim() || null,
      active: true,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setForm({ ...empty, category: categoryOptions[0] || 'Facials' })
    setShowForm(false)
    setMessage('Service added.')
    await load()
  }

  async function onAddSeries(e: FormEvent) {
    e.preventDefault()
    if (!canManageCategories) return
    const name = seriesForm.name.trim()
    if (!name) {
      setError('Enter a series name.')
      return
    }

    const prepared = seriesForm.items.map((item, index) => ({
      category: item.category.trim(),
      service_id: item.serviceId || null,
      price_per_session: 0,
      sessions: Math.max(1, Math.floor(Number(item.sessions) || 0)),
      sort_order: (index + 1) * 10,
    }))

    if (prepared.length === 0) {
      setError('Add at least one category line to this series (or keep some from the list).')
      return
    }
    if (prepared.some((item) => !item.category)) {
      setError('Each line needs a category. Remove blank lines or pick a category.')
      return
    }
    const missingService = prepared.filter((item) => !item.service_id)
    if (missingService.length) {
      setError(
        `Pick a service or remove these categories: ${missingService
          .map((item) => item.category)
          .join(', ')}.`,
      )
      return
    }

    setSavingSeries(true)
    setMessage('')
    setError('')

    const { data: created, error: err } = await supabase
      .from('service_series')
      .insert({
        name,
        description: seriesForm.description.trim() || null,
        special_package: null,
        active: true,
        created_by: user?.id ?? null,
        // Legacy flat columns (nullable after re-running add_service_series.sql)
        category: prepared[0]?.category ?? null,
        service_id: prepared[0]?.service_id ?? null,
        price_per_session: null,
        sessions: prepared[0]?.sessions ?? null,
      })
      .select('id')
      .single()

    if (err || !created) {
      setSavingSeries(false)
      setError(
        err?.message.includes('service_series') || err?.message.includes('schema cache')
          ? `${err?.message ?? 'Could not create series'} — run supabase/add_service_series.sql in Supabase.`
          : err?.message || 'Could not create series.',
      )
      return
    }

    const { error: itemsErr } = await supabase.from('service_series_items').insert(
      prepared.map((item) => ({
        series_id: created.id,
        ...item,
      })),
    )

    setSavingSeries(false)
    if (itemsErr) {
      await supabase.from('service_series').delete().eq('id', created.id)
      setError(
        itemsErr.message.includes('service_series_items') || itemsErr.message.includes('schema cache')
          ? `${itemsErr.message} — re-run supabase/add_service_series.sql in Supabase.`
          : itemsErr.message,
      )
      return
    }

    setShowSeriesForm(false)
    setSeriesForm(emptySeries)
    setMessage(`Series “${name}” created with ${prepared.length} categor${prepared.length === 1 ? 'y' : 'ies'}.`)
    await load()
  }

  async function onAddCategory(e: FormEvent) {
    e.preventDefault()
    if (!canManageCategories) return
    const name = categoryName.trim()
    if (!name) {
      setError('Enter a category name.')
      return
    }
    setSavingCategory(true)
    setMessage('')
    setError('')
    const { error: err } = await supabase.from('service_categories').insert({
      name,
      sort_order: 100 + categories.length * 10,
      active: true,
      created_by: user?.id ?? null,
    })
    setSavingCategory(false)
    if (err) {
      setError(
        err.message.includes('duplicate') || err.code === '23505'
          ? 'That category already exists.'
          : err.message,
      )
      return
    }
    setCategoryName('')
    setShowCategoryForm(false)
    setForm((f) => ({ ...f, category: name }))
    setMessage(`Category “${name}” created. You can add services under it now.`)
    await load()
  }

  async function toggle(item: ServiceItem) {
    setError('')
    const { error: err } = await supabase
      .from('services')
      .update({ active: !item.active })
      .eq('id', item.id)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(item.active ? 'Service hidden from POS.' : 'Service restored.')
    await load()
  }

  async function toggleSeries(item: ServiceSeries) {
    setError('')
    const { error: err } = await supabase
      .from('service_series')
      .update({ active: !item.active })
      .eq('id', item.id)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(item.active ? 'Series hidden from POS / Avail.' : 'Series restored.')
    await load()
  }

  async function confirmDeleteAction() {
    if (!canManageCategories || !confirmDelete) return
    setDeleting(true)
    setError('')
    setMessage('')

    if (confirmDelete.type === 'service') {
      const { error: err } = await supabase
        .from('services')
        .delete()
        .eq('id', confirmDelete.item.id)
      setDeleting(false)
      if (err) {
        setError(
          err.message.includes('foreign key') || err.code === '23503'
            ? `Cannot delete “${confirmDelete.item.name}” because it is linked to sales, sessions, or inventory. Hide it instead.`
            : err.message,
        )
        setConfirmDelete(null)
        return
      }
      setConfirmDelete(null)
      setMessage(`Service “${confirmDelete.item.name}” deleted.`)
      await load()
      return
    }

    if (confirmDelete.type === 'series') {
      const { error: err } = await supabase
        .from('service_series')
        .delete()
        .eq('id', confirmDelete.item.id)
      setDeleting(false)
      if (err) {
        setError(err.message)
        setConfirmDelete(null)
        return
      }
      setConfirmDelete(null)
      setMessage(`Series “${confirmDelete.item.name}” deleted.`)
      await load()
      return
    }

    const { id, name, count } = confirmDelete
    if (count > 0) {
      // Soft-remove from catalog so existing services keep their label.
      const { error: err } = await supabase
        .from('service_categories')
        .update({ active: false })
        .eq('id', id)
      setDeleting(false)
      if (err) {
        setError(err.message)
        setConfirmDelete(null)
        return
      }
      setConfirmDelete(null)
      setMessage(
        `Category “${name}” removed from the catalog. ${count} existing service${count === 1 ? '' : 's'} still show that category label.`,
      )
      await load()
      return
    }

    const { error: err } = await supabase.from('service_categories').delete().eq('id', id)
    setDeleting(false)
    if (err) {
      // Fallback soft-delete if hard delete is blocked
      const { error: softErr } = await supabase
        .from('service_categories')
        .update({ active: false })
        .eq('id', id)
      if (softErr) {
        setError(err.message)
        setConfirmDelete(null)
        return
      }
      setConfirmDelete(null)
      setMessage(`Category “${name}” removed.`)
      await load()
      return
    }
    setConfirmDelete(null)
    setMessage(`Category “${name}” deleted.`)
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="Catalog"
        title="Services and Series"
        subtitle="Manage treatments, retail items, and multi-session series plans for POS and Avail service."
        actions={
          <>
            {canManageCategories ? (
              <button className="btn btn-ghost" type="button" onClick={openCategoryModal}>
                <FolderPlus size={15} />
                Categories
              </button>
            ) : null}
            {canManageCategories ? (
              <button className="btn btn-ghost" type="button" onClick={openSeriesModal}>
                <Layers size={15} />
                Create Series
              </button>
            ) : null}
            <button className="btn btn-primary" type="button" onClick={openServiceModal}>
              <Plus size={15} />
              Add Service
            </button>
          </>
        }
      />

      {error && !showForm && !showSeriesForm && !showCategoryForm && !confirmDelete ? (
        <StatusMessage type="error">{error}</StatusMessage>
      ) : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="panel">
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading services...</div>
          ) : items.length === 0 ? (
            <div className="empty-state">No services yet. Run supabase/setup.sql or add one.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Duration</th>
                    <th>Earn Pts</th>
                    <th>Redeem Pts</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        {item.description ? (
                          <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                            {item.description}
                          </div>
                        ) : null}
                      </td>
                      <td>{item.category}</td>
                      <td>{formatCurrency(item.price)}</td>
                      <td>{item.durationMin}m</td>
                      <td>{item.pointsEarn}</td>
                      <td>{item.pointsCost}</td>
                      <td>
                        <span className={`badge ${item.active ? 'badge-success' : ''}`}>
                          {item.active ? 'Active' : 'Hidden'}
                        </span>
                      </td>
                      <td>
                        <div className="svc-row-actions">
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => toggle(item)}
                          >
                            {item.active ? 'Hide' : 'Restore'}
                          </button>
                          {canManageCategories ? (
                            <button
                              className="btn btn-ghost btn-sm svc-delete-btn"
                              type="button"
                              onClick={() => {
                                setError('')
                                setConfirmDelete({ type: 'service', item })
                              }}
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Series plans</h2>
            <p className="svc-panel-sub">
              A series is a plan of category + service lines. Prices are set manually on Avail /
              POS.
            </p>
          </div>
          {canManageCategories ? (
            <button className="btn btn-primary" type="button" onClick={openSeriesModal}>
              <Layers size={15} />
              Create Series
            </button>
          ) : null}
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="empty-state">Loading series…</div>
          ) : series.length === 0 ? (
            <div className="empty-state">
              No series yet. Owner/Admin can create a plan that appears in POS and Avail service.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Series</th>
                    <th>Services in series</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((plan) => {
                    return (
                      <tr key={plan.id}>
                        <td>
                          <strong>{plan.name}</strong>
                          {plan.description ? (
                            <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                              {plan.description}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {plan.items.length === 0 ? (
                            '—'
                          ) : (
                            <ul className="svc-series-lines">
                              {plan.items.map((line) => (
                                <li key={line.id}>
                                  <strong>{line.category}</strong>
                                  <span>
                                    {line.serviceName || '—'}
                                    {line.sessions > 1 ? ` · ${line.sessions} sessions` : ''}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${plan.active ? 'badge-success' : ''}`}>
                            {plan.active ? 'Active' : 'Hidden'}
                          </span>
                        </td>
                        <td>
                          <div className="svc-row-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => void toggleSeries(plan)}
                            >
                              {plan.active ? 'Hide' : 'Restore'}
                            </button>
                            {canManageCategories ? (
                              <button
                                className="btn btn-ghost btn-sm svc-delete-btn"
                                type="button"
                                onClick={() => {
                                  setError('')
                                  setConfirmDelete({ type: 'series', item: plan })
                                }}
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            ) : null}
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

      {showForm ? (
        <div className="confirm-modal-overlay svc-modal-overlay" role="presentation">
          <div
            className="svc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-modal-title"
          >
            <div className="svc-modal-top">
              <div className="svc-modal-accent" aria-hidden />
              <div className="svc-modal-head">
                <div>
                  <p className="svc-modal-kicker">Catalog</p>
                  <h2 id="service-modal-title" className="svc-modal-title">
                    Add service
                  </h2>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  aria-label="Close"
                  disabled={saving}
                  onClick={closeServiceModal}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <form className="svc-modal-form" onSubmit={onAdd}>
              <div className="svc-modal-body">
                {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
                <div className="svc-modal-grid">
                  <div className="field svc-span-2">
                    <label>Name</label>
                    <input
                      className="input"
                      required
                      autoFocus
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="field svc-span-2">
                    <div className="svc-field-label-row">
                      <label>Category</label>
                      {canManageCategories ? (
                        <button
                          type="button"
                          className="svc-inline-link"
                          onClick={openCategoryModal}
                        >
                          <FolderPlus size={13} />
                          Manage categories
                        </button>
                      ) : null}
                    </div>
                    <select
                      className="select"
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    >
                      {!categoryOptions.includes(form.category) && form.category ? (
                        <option value={form.category}>{form.category}</option>
                      ) : null}
                      {categoryOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Price</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      required
                      value={form.price}
                      onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Duration (min)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={form.durationMin}
                      onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Earn points</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={form.pointsEarn}
                      onChange={(e) => setForm((f) => ({ ...f, pointsEarn: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Redeem points</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={form.pointsCost}
                      onChange={(e) => setForm((f) => ({ ...f, pointsCost: e.target.value }))}
                    />
                  </div>
                  <div className="field svc-span-2">
                    <label>Description</label>
                    <textarea
                      className="textarea"
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="svc-modal-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={saving}
                  onClick={closeServiceModal}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {canManageCategories && showSeriesForm ? (
        <div className="confirm-modal-overlay svc-modal-overlay" role="presentation">
          <div
            className="svc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="series-modal-title"
          >
            <div className="svc-modal-top">
              <div className="svc-modal-accent" aria-hidden />
              <div className="svc-modal-head">
                <div>
                  <p className="svc-modal-kicker">Series plan</p>
                  <h2 id="series-modal-title" className="svc-modal-title">
                    Create series
                  </h2>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  aria-label="Close"
                  disabled={savingSeries}
                  onClick={closeSeriesModal}
                >
                  <X size={16} />
                </button>
              </div>
              <p className="svc-modal-lead">
                A series is a combination of services. Add category lines inside it (category name +
                service). Those lines show in POS and Avail service.
              </p>
            </div>

            <form className="svc-modal-form" onSubmit={(e) => void onAddSeries(e)}>
              <div className="svc-modal-body">
                {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
                <div className="svc-modal-grid">
                  <div className="field svc-span-2">
                    <label>Series name</label>
                    <input
                      className="input"
                      required
                      autoFocus
                      placeholder="e.g. Derma-approved Gluta Drips"
                      value={seriesForm.name}
                      onChange={(e) => setSeriesForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>

                  <div className="field svc-span-2">
                    <div className="svc-field-label-row">
                      <label>Categories in this series</label>
                      <button type="button" className="svc-inline-link" onClick={addSeriesCategoryLine}>
                        <Plus size={13} />
                        Add category
                      </button>
                    </div>
                    <p className="svc-field-hint">
                      All catalog categories start listed here. Remove any you don’t want in this
                      series.
                    </p>
                    <div className="svc-series-item-list">
                      {seriesForm.items.length === 0 ? (
                        <p className="svc-field-hint">
                          No categories left. Use Add category to put one back.
                        </p>
                      ) : null}
                      {seriesForm.items.map((line, index) => (
                        <div key={line.key} className="svc-series-item">
                          <div className="svc-series-item-head">
                            <span>Category {index + 1}</span>
                            <button
                              type="button"
                              className="svc-inline-link"
                              onClick={() => removeSeriesCategoryLine(line.key)}
                            >
                              Remove
                            </button>
                          </div>
                          <div className="svc-series-item-grid">
                            <div className="field">
                              <label>Category name</label>
                              <select
                                className="select"
                                required
                                value={line.category}
                                onChange={(e) => {
                                  const category = e.target.value
                                  const first = activeServices.find((s) => s.category === category)
                                  updateSeriesItem(line.key, {
                                    category,
                                    serviceId: first?.id || '',
                                  })
                                }}
                              >
                                <option value="">Select category…</option>
                                {categoryOptions.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                                {line.category && !categoryOptions.includes(line.category) ? (
                                  <option value={line.category}>{line.category}</option>
                                ) : null}
                              </select>
                            </div>
                            <div className="field">
                              <label>Service</label>
                              <select
                                className="select"
                                required
                                value={line.serviceId}
                                onChange={(e) => {
                                  const serviceId = e.target.value
                                  updateSeriesItem(line.key, { serviceId })
                                }}
                              >
                                <option value="">
                                  {line.category
                                    ? activeServices.some((s) => s.category === line.category)
                                      ? 'Select service…'
                                      : 'No services in this category'
                                    : 'Select category first…'}
                                </option>
                                {activeServices
                                  .filter((s) => !line.category || s.category === line.category)
                                  .map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div className="field">
                              <label>Sessions</label>
                              <input
                                className="input"
                                type="number"
                                min="1"
                                step="1"
                                required
                                value={line.sessions}
                                onChange={(e) =>
                                  updateSeriesItem(line.key, { sessions: e.target.value })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="form-req-note svc-span-2">
                    Series only stores the services in the plan. Prices are entered manually when
                    availing or selling.
                  </p>
                  <div className="field svc-span-2">
                    <label>Description</label>
                    <textarea
                      className="textarea"
                      rows={2}
                      value={seriesForm.description}
                      onChange={(e) =>
                        setSeriesForm((f) => ({ ...f, description: e.target.value }))
                      }
                      placeholder="Optional plan notes"
                    />
                  </div>
                </div>
              </div>
              <div className="svc-modal-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={savingSeries}
                  onClick={closeSeriesModal}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={savingSeries}>
                  {savingSeries ? 'Saving…' : 'Save series'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {canManageCategories && showCategoryForm ? (
        <div
          className="confirm-modal-overlay svc-modal-overlay svc-category-overlay"
          role="presentation"
        >
          <div
            className="svc-modal svc-category-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-modal-title"
          >
            <div className="svc-modal-top">
              <div className="svc-modal-accent" aria-hidden />
              <div className="svc-modal-head">
                <div>
                  <p className="svc-modal-kicker">Owner / Admin</p>
                  <h2 id="category-modal-title" className="svc-modal-title">
                    Service categories
                  </h2>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  aria-label="Close"
                  disabled={savingCategory}
                  onClick={closeCategoryModal}
                >
                  <X size={16} />
                </button>
              </div>
              <p className="svc-modal-lead">
                Add or remove categories used for services. Deleting a category hides it from new
                services; existing services keep their current label.
              </p>
            </div>

            <form className="svc-modal-form" onSubmit={onAddCategory}>
              <div className="svc-modal-body">
                {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

                <div className="svc-category-create">
                  <div className="field" style={{ margin: 0, flex: 1 }}>
                    <label>New category name</label>
                    <input
                      className="input"
                      required
                      autoFocus
                      placeholder="e.g. Wellness, IV Therapy"
                      value={categoryName}
                      onChange={(e) => setCategoryName(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={savingCategory}
                    style={{ alignSelf: 'end' }}
                  >
                    {savingCategory ? 'Saving...' : 'Add category'}
                  </button>
                </div>

                <div className="svc-category-list-wrap">
                  <div className="svc-category-list-head">
                    <span>Existing categories</span>
                    <em>{categories.length}</em>
                  </div>
                  {categories.length === 0 ? (
                    <div className="svc-category-empty">No categories yet.</div>
                  ) : (
                    <ul className="svc-category-list">
                      {categories.map((cat) => {
                        const count = categoryCounts.get(cat.name) ?? 0
                        return (
                          <li key={cat.id} className="svc-category-item">
                            <span className="svc-category-mark" aria-hidden />
                            <div className="svc-category-copy">
                              <strong>{cat.name}</strong>
                              <span>
                                {count} service{count === 1 ? '' : 's'}
                              </span>
                            </div>
                            <button
                              className="btn btn-ghost btn-sm svc-delete-btn"
                              type="button"
                              disabled={savingCategory || deleting}
                              onClick={() => {
                                setError('')
                                setConfirmDelete({
                                  type: 'category',
                                  id: cat.id,
                                  name: cat.name,
                                  count,
                                })
                              }}
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>

              <div className="svc-modal-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={savingCategory}
                  onClick={closeCategoryModal}
                >
                  Done
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {canManageCategories && confirmDelete ? (
        <div className="confirm-modal-overlay svc-modal-overlay" role="presentation">
          <div
            className="svc-modal svc-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <div className="svc-modal-top">
              <div className="svc-modal-accent is-danger" aria-hidden />
              <div className="svc-modal-head">
                <div>
                  <p className="svc-modal-kicker">Owner / Admin</p>
                  <h2 id="delete-confirm-title" className="svc-modal-title">
                    {confirmDelete.type === 'service'
                      ? 'Delete service'
                      : confirmDelete.type === 'series'
                        ? 'Delete series'
                        : 'Delete category'}
                  </h2>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  aria-label="Close"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <p className="svc-modal-lead">
                {confirmDelete.type === 'service' ? (
                  <>
                    Permanently delete <strong>{confirmDelete.item.name}</strong>? This cannot be
                    undone. If it is linked to past sales, use Hide instead.
                  </>
                ) : confirmDelete.type === 'series' ? (
                  <>
                    Permanently delete series <strong>{confirmDelete.item.name}</strong>? Past sales
                    and session packages are kept.
                  </>
                ) : confirmDelete.count > 0 ? (
                  <>
                    Remove category <strong>{confirmDelete.name}</strong> from the catalog?{' '}
                    {confirmDelete.count} service{confirmDelete.count === 1 ? '' : 's'} still use
                    this label and will keep it.
                  </>
                ) : (
                  <>
                    Permanently delete category <strong>{confirmDelete.name}</strong>?
                  </>
                )}
              </p>
            </div>
            <div className="svc-modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="btn svc-btn-danger"
                type="button"
                disabled={deleting}
                onClick={() => void confirmDeleteAction()}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

