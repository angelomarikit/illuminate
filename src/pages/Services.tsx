import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { formatCurrency } from '../data/mock'
import { supabase } from '../lib/supabase'
import type { ServiceCategory, ServiceItem } from '../types'

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
    category: row.category as ServiceCategory,
    price: Number(row.price),
    durationMin: row.duration_min,
    pointsEarn: row.points_earn,
    pointsCost: row.points_cost,
    active: row.active,
    description: row.description ?? '',
  }
}

export function Services() {
  const [items, setItems] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('services')
      .select('*')
      .order('name')
    if (err) setError(err.message)
    else {
      setError('')
      setItems((data as Row[] | null)?.map(mapRow) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
    setForm(empty)
    setShowForm(false)
    setMessage('Service added.')
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

  return (
    <div>
      <PageHeader
        kicker="Catalog"
        title="Services & Products"
        subtitle="Add or remove treatments and retail items available for booking and POS checkout."
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Add Service'}
          </button>
        }
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      {showForm ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title">New service</h2>
          </div>
          <div className="panel-body">
            <form
              onSubmit={onAdd}
              style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              <div className="field">
                <label>Name</label>
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Category</label>
                <select
                  className="select"
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value as ServiceCategory }))
                  }
                >
                  {['Facials', 'Injectables', 'Laser', 'Body', 'Skincare', 'Packages'].map((c) => (
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
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Description</label>
                <textarea
                  className="textarea"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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
                        <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 2 }}>
                          {item.description}
                        </div>
                      </td>
                      <td>{item.category}</td>
                      <td>{formatCurrency(item.price)}</td>
                      <td>{item.durationMin ? `${item.durationMin} min` : '—'}</td>
                      <td>{item.pointsEarn}</td>
                      <td>{item.pointsCost}</td>
                      <td>
                        <span className={`badge ${item.active ? 'badge-success' : 'badge-danger'}`}>
                          {item.active ? 'Active' : 'Hidden'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => toggle(item)}>
                          {item.active ? 'Remove' : 'Restore'}
                        </button>
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
