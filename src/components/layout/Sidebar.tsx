import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import logo from '../../assets/logo-sidebar.png'
import { useAuth } from '../../context/AuthContext'
import { roleLabel } from '../../lib/roles'
import { navForRole, type NavItem } from '../../navigation'

type SidebarProps = {
  open: boolean
  onNavigate?: () => void
}

function pathMatches(pathname: string, target: string) {
  const clean = pathname.replace(/\/+$/, '') || '/'
  const want = target.replace(/\/+$/, '') || '/'
  return clean === want
}

function childIsActive(pathname: string, children: NavItem[]) {
  return children.some((child) => pathMatches(pathname, child.path))
}

function NavGroup({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const location = useLocation()
  const children = item.children ?? []
  const active = childIsActive(location.pathname, children)
  const [expanded, setExpanded] = useState(active)

  useEffect(() => {
    if (active) setExpanded(true)
  }, [active])

  const Icon = item.icon

  return (
    <div className={`nav-group ${expanded ? 'is-open' : ''} ${active ? 'is-active' : ''}`}>
      <button
        type="button"
        className={`nav-group-toggle ${expanded ? 'is-open' : ''} ${active ? 'is-active' : ''}`}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <Icon />
        <span>{item.label}</span>
        <ChevronDown className="nav-chevron" size={16} aria-hidden />
      </button>
      {expanded ? (
        <div className="nav-group-children" role="group" aria-label={item.label}>
          {children.map((child) => {
            const ChildIcon = child.icon
            return (
              <NavLink
                key={child.path}
                to={child.path}
                end
                className={({ isActive }) => `nav-link nav-sublink ${isActive ? 'active' : ''}`}
                onClick={onNavigate}
              >
                <ChildIcon />
                <span>{child.label}</span>
              </NavLink>
            )
          })}
        </div>
      ) : null}
    </div>
  )
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
        {navForRole(user?.role).map((section) => (
          <div className="nav-section" key={section.title}>
            <div className="nav-section-label">{section.title}</div>
            {section.items.map((item) => {
              if (item.children?.length) {
                return <NavGroup key={item.path + item.label} item={item} onNavigate={onNavigate} />
              }
              const Icon = item.icon
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end
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
            <strong>{user?.name ?? 'Guest'}</strong>
            <span>{user?.role === 'Client' ? 'Client portal' : roleLabel(user?.role)}</span>
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
