import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { FolderPlus, Plus, Trash2, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { isElevatedRole } from '../lib/roles'
import { formatCurrency } from '../lib/utils'
import { supabase } from '../lib/supabase'
import type { ServiceCategory, ServiceItem } from '../types'
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
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [categoryName, setCategoryName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<
    | { type: 'service'; item: ServiceItem }
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

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, error: err }, { data: catData, error: catErr }] = await Promise.all([
      supabase.from('services').select('*').order('name'),
      supabase
        .from('service_categories')
        .select('id, name, sort_order, active')
        .eq('active', true)
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
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!showForm && !showCategoryForm && !confirmDelete) return
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
  }, [showForm, showCategoryForm, confirmDelete, saving, savingCategory, deleting, categoryOptions])

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
        title="Services & Products"
        subtitle="Add or remove treatments and retail items available for booking and POS checkout."
        actions={
          <>
            {canManageCategories ? (
              <button className="btn btn-ghost" type="button" onClick={openCategoryModal}>
                <FolderPlus size={15} />
                Categories
              </button>
            ) : null}
            <button className="btn btn-primary" type="button" onClick={openServiceModal}>
              <Plus size={15} />
              Add Service
            </button>
          </>
        }
      />

      {error && !showForm && !showCategoryForm && !confirmDelete ? (
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
                    {confirmDelete.type === 'service' ? 'Delete service' : 'Delete category'}
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

