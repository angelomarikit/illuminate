import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Menu, Search, ShoppingBag } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { supabase } from '../../lib/supabase'
import { isUuid } from '../../lib/utils'

type TopbarProps = {
  onMenu: () => void
}

export function Topbar({ onMenu }: TopbarProps) {
  const { branchId, setBranchId, branches, isStoreOpen, setStoreOpen, storeToggleSaving } =
    useBranch()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [openNotes, setOpenNotes] = useState(false)
  const [notes, setNotes] = useState<string[]>([])
  const [toggleError, setToggleError] = useState('')

  useEffect(() => {
    async function loadNotes() {
      const today = new Date().toISOString().slice(0, 10)
      let aptQ = supabase
        .from('appointments')
        .select('customer_name, appointment_time, status')
        .eq('appointment_date', today)
        .limit(5)
      let invQ = supabase.from('inventory_items').select('name, stock, reorder_level').limit(20)
      if (isUuid(branchId)) {
        aptQ = aptQ.eq('branch_id', branchId)
        invQ = invQ.eq('branch_id', branchId)
      }
      const [{ data: appts }, { data: inv }] = await Promise.all([aptQ, invQ])
      const next: string[] = []
      appts?.forEach((a) => {
        next.push(
          `${String(a.appointment_time).slice(0, 5)} · ${a.customer_name} (${a.status})`,
        )
      })
      inv
        ?.filter((i) => i.stock <= i.reorder_level)
        .slice(0, 5)
        .forEach((i) => next.push(`Low stock: ${i.name} (${i.stock})`))
      setNotes(next.length ? next : ['No alerts right now.'])
    }
    loadNotes()
  }, [branchId])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  async function handleStoreToggle() {
    setToggleError('')
    try {
      await setStoreOpen(!isStoreOpen)
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Could not update store status.')
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="btn-icon menu-toggle" onClick={onMenu} aria-label="Open menu">
          <Menu size={18} />
        </button>
        <div className="topbar-search">
          <Search size={16} />
          <input className="search-input" placeholder="Search clients, services, receipts..." />
        </div>
      </div>

      <div className="topbar-right">
        <div className="store-branch-stack">
          <button
            type="button"
            className={`store-toggle ${isStoreOpen ? 'is-open' : 'is-closed'}`}
            onClick={handleStoreToggle}
            disabled={storeToggleSaving}
            aria-pressed={isStoreOpen}
            title={isStoreOpen ? 'Store is open — click to close' : 'Store is closed — click to open'}
          >
            <span className="store-toggle-track" aria-hidden="true">
              <span className="store-toggle-thumb" />
            </span>
            <span className="store-toggle-label">
              {storeToggleSaving ? 'Saving...' : isStoreOpen ? 'Store Open' : 'Store Closed'}
            </span>
          </button>
          <select
            className="select branch-select"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            aria-label="Branch"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id} disabled={branch.status === 'coming-soon'}>
                {branch.name}
                {branch.status === 'coming-soon' ? ' (Soon)' : ''}
                {branch.isOpen === false ? ' · Closed' : ''}
              </option>
            ))}
          </select>
          {toggleError ? <span className="store-toggle-error">{toggleError}</span> : null}
        </div>
        <Link to="/pos" className="btn btn-primary btn-sm">
          <ShoppingBag size={15} />
          Open POS
        </Link>
        <div style={{ position: 'relative' }}>
          <button
            className="btn-icon"
            aria-label="Notifications"
            type="button"
            onClick={() => setOpenNotes((v) => !v)}
          >
            <Bell size={18} />
          </button>
          {openNotes ? (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 46,
                width: 280,
                background: '#fff',
                border: '1px solid var(--line)',
                borderRadius: 12,
                boxShadow: 'var(--shadow)',
                padding: 10,
                zIndex: 50,
              }}
            >
              <strong style={{ fontSize: '0.85rem' }}>Notifications</strong>
              <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
                {notes.map((note) => (
                  <li
                    key={note}
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--muted)',
                      padding: '6px 0',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleLogout} type="button">
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </header>
  )
}
