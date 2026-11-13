import { NavLink } from 'react-router-dom'
import { NotebookPen, Users } from 'lucide-react'

const links = [
  { to: '/clients', label: 'Clients list', icon: Users, end: true },
  { to: '/client-journey', label: 'Client journey', icon: NotebookPen, end: true },
]

export function ClientsSubnav() {
  return (
    <div className="chips" style={{ marginBottom: 16 }}>
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `chip ${isActive ? 'active' : ''}`}
        >
          <Icon size={14} style={{ marginRight: 6 }} />
          {label}
        </NavLink>
      ))}
    </div>
  )
}
