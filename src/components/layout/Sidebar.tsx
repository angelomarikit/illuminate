import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import logo from '../../assets/logo-sidebar.png'
import { useAuth } from '../../context/AuthContext'
import { navSections } from '../../navigation'

type SidebarProps = {
  open: boolean
  onNavigate?: () => void
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const initials =
    user?.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? 'IM'

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <img src={logo} alt="Illuminate" className="brand-logo" />
      </div>

      <nav>
        {navSections.map((section) => (
          <div className="nav-section" key={section.title}>
            <div className="nav-section-label">{section.title}</div>
            {section.items.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  onClick={onNavigate}
                >
                  <Icon />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="avatar">{initials}</div>
          <div>
            <strong>{user?.name ?? 'Staff'}</strong>
            <span>{user?.role ?? 'Team member'}</span>
          </div>
        </div>
        <button className="logout-btn" onClick={handleLogout} type="button">
          <LogOut size={16} />
          Log out
        </button>
      </div>
    </aside>
  )
}
