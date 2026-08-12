import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, LogOut, Menu, Search, ShoppingBag } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { useStaffSession } from '../../context/StaffSessionContext'
import {
  homePathForRole,
  isClinicRole,
  isInternalRole,
  isInventoryAccessRole,
  normalizeRole,
} from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import { isUuid } from '../../lib/utils'

type TopbarProps = {
  onMenu: () => void
}

export function Topbar({ onMenu }: TopbarProps) {
  const { branchId, setBranchId, branches, isStoreOpen, setStoreOpen, storeToggleSaving } =
    useBranch()
  const { user, logout } = useAuth()
  const {
    staffRecord,
    todayAttendance,
    isClockedIn,
    clockBusy,
    clockError,
    clockIn,
    clockOut,
  } = useStaffSession()
  const navigate = useNavigate()
  const [openNotes, setOpenNotes] = useState(false)
  const [openBranchMenu, setOpenBranchMenu] = useState(false)
  const [notes, setNotes] = useState<string[]>([])
  const [toggleError, setToggleError] = useState('')
  const branchMenuRef = useRef<HTMLDivElement>(null)
  const appRole = normalizeRole(user?.role)
  const showClinicControls = isClinicRole(user?.role)
  const showInternalShell = isInternalRole(user?.role)
  const showInventoryAlerts = isInventoryAccessRole(user?.role)
  const showTimeClock = appRole === 'Staff' && Boolean(staffRecord)
  const activeBranch = branches.find((b) => b.id === branchId) ?? branches[0]

  useEffect(() => {
    async function loadNotes() {
      const today = new Date().toISOString().slice(0, 10)
      const next: string[] = []

      if (showClinicControls) {
        let aptQ = supabase
          .from('appointments')
          .select('customer_name, appointment_time, status')
          .eq('appointment_date', today)
          .limit(5)
        if (isUuid(branchId)) aptQ = aptQ.eq('branch_id', branchId)
        const { data: appts } = await aptQ
        appts?.forEach((a) => {
          next.push(
            `${String(a.appointment_time).slice(0, 5)} · ${a.customer_name} (${a.status})`,
          )
        })
      }

      if (showInventoryAlerts) {
        let invQ = supabase.from('inventory_items').select('name, stock, reorder_level').limit(20)
        if (isUuid(branchId)) invQ = invQ.eq('branch_id', branchId)
        const { data: inv } = await invQ
        inv
          ?.filter((i) => i.stock <= i.reorder_level)
          .slice(0, 5)
          .forEach((i) => next.push(`Low stock: ${i.name} (${i.stock})`))
      }

      setNotes(next.length ? next : ['No alerts right now.'])
    }
    loadNotes()
  }, [branchId, showClinicControls, showInventoryAlerts])

  useEffect(() => {
    if (!openBranchMenu) return
    function onPointerDown(e: MouseEvent) {
      if (!branchMenuRef.current?.contains(e.target as Node)) {
        setOpenBranchMenu(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenBranchMenu(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openBranchMenu])

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
        {showClinicControls ? (
          <div className="topbar-search">
            <Search size={16} />
            <input className="search-input" placeholder="Search clients, services, receipts..." />
          </div>
        ) : null}
      </div>

      <div className="topbar-right">
        {showTimeClock ? (
          <div className={`time-clock-control ${isClockedIn ? 'is-in' : 'is-out'}`}>
            <div className="time-clock-copy">
              <span className="time-clock-kicker">My shift</span>
              <span className="time-clock-text">
                {isClockedIn
                  ? `In ${todayAttendance?.timeIn ? String(todayAttendance.timeIn).slice(0, 5) : ''}`
                  : todayAttendance?.timeOut
                    ? `Out ${String(todayAttendance.timeOut).slice(0, 5)}`
                    : 'Not timed in'}
              </span>
            </div>
            <button
              type="button"
              className={`time-clock-switch ${isClockedIn ? 'is-in' : 'is-out'}`}
              disabled={clockBusy}
              onClick={() => (isClockedIn ? clockOut() : clockIn())}
              aria-pressed={isClockedIn}
              title={isClockedIn ? 'Time out' : 'Time in'}
            >
              <span className="time-clock-thumb" aria-hidden="true" />
            </button>
            {clockError ? <span className="time-clock-error">{clockError}</span> : null}
          </div>
        ) : null}

        {showInternalShell ? (
          <>
            <div className="store-branch-control" ref={branchMenuRef}>
              {showClinicControls ? (
                <div className="store-status-row">
                  <div className="store-status-copy">
                    <span className="store-status-kicker">Store</span>
                    <span className={`store-status-text ${isStoreOpen ? 'is-open' : 'is-closed'}`}>
                      {storeToggleSaving ? 'Saving…' : isStoreOpen ? 'Open' : 'Closed'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`store-switch ${isStoreOpen ? 'is-open' : 'is-closed'}`}
                    onClick={handleStoreToggle}
                    disabled={storeToggleSaving}
                    aria-pressed={isStoreOpen}
                    aria-label={isStoreOpen ? 'Close store' : 'Open store'}
                    title={
                      isStoreOpen
                        ? 'Store is open — click to close'
                        : 'Store is closed — click to open'
                    }
                  >
                    <span className="store-switch-thumb" aria-hidden="true" />
                  </button>
                </div>
              ) : null}

              <div className="branch-picker">
                <button
                  type="button"
                  className={`branch-picker-trigger ${openBranchMenu ? 'is-open' : ''}`}
                  aria-haspopup="listbox"
                  aria-expanded={openBranchMenu}
                  aria-label="Choose branch"
                  onClick={() => setOpenBranchMenu((v) => !v)}
                >
                  <span className="branch-picker-label">
                    {activeBranch?.name || (branches.length ? 'Select branch' : 'No branches')}
                  </span>
                  <ChevronDown size={15} />
                </button>

                {openBranchMenu ? (
                  <ul className="branch-picker-menu" role="listbox" aria-label="Branches">
                    {branches.length === 0 ? (
                      <li className="branch-picker-empty">No branches found</li>
                    ) : (
                      branches.map((branch) => {
                        const disabled = branch.status === 'coming-soon'
                        const selected = branch.id === (activeBranch?.id ?? branchId)
                        return (
                          <li key={branch.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`branch-picker-option ${selected ? 'is-selected' : ''}`}
                              disabled={disabled}
                              onClick={() => {
                                if (disabled) return
                                setBranchId(branch.id)
                                setOpenBranchMenu(false)
                              }}
                            >
                              <span>
                                {branch.name}
                                {disabled ? ' (Soon)' : ''}
                              </span>
                              <em>{branch.isOpen === false ? 'Closed' : 'Open'}</em>
                            </button>
                          </li>
                        )
                      })
                    )}
                  </ul>
                ) : null}
              </div>

              {toggleError ? <span className="store-toggle-error">{toggleError}</span> : null}
            </div>
            {showClinicControls ? (
              <>
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
              </>
            ) : (
              <Link to="/payroll" className="btn btn-primary btn-sm">
                Payroll
              </Link>
            )}
          </>
        ) : (
          <Link to={homePathForRole(user?.role)} className="btn btn-ghost btn-sm">
            My Care
          </Link>
        )}
        <button className="btn btn-ghost btn-sm" onClick={handleLogout} type="button">
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </header>
  )
}
