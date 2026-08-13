import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Menu, Search, ShoppingBag } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { useStaffSession } from '../../context/StaffSessionContext'
import {
  homePathForRole,
  isClinicRole,
  isHrAccessRole,
  isInternalRole,
  normalizeRole,
} from '../../lib/roles'
import { NotificationBell } from './NotificationBell'

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
  const [openBranchMenu, setOpenBranchMenu] = useState(false)
  const [toggleError, setToggleError] = useState('')
  const branchMenuRef = useRef<HTMLDivElement>(null)
  const appRole = normalizeRole(user?.role)
  const showClinicControls = isClinicRole(user?.role)
  const showInternalShell = isInternalRole(user?.role)
  const showHrShortcut = isHrAccessRole(user?.role) && !showClinicControls
  const showTimeClock = appRole === 'Staff' && Boolean(staffRecord)
  const activeBranch = branches.find((b) => b.id === branchId) ?? branches[0]

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
              <Link to="/pos" className="btn btn-primary btn-sm">
                <ShoppingBag size={15} />
                Open POS
              </Link>
            ) : showHrShortcut ? (
              <Link to="/payroll" className="btn btn-primary btn-sm">
                Payroll
              </Link>
            ) : (
              <Link to="/inventory" className="btn btn-primary btn-sm">
                Inventory
              </Link>
            )}

            <NotificationBell />
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
