import { NavLink } from 'react-router-dom'
import { CalendarCheck2, UserPlus, Users } from 'lucide-react'

const links = [
  { to: '/register-clients', label: 'Register clients', icon: UserPlus, end: true },
  { to: '/clients', label: 'Clients list', icon: Users, end: true },
  { to: '/sessions', label: 'Client sessions', icon: CalendarCheck2, end: true },
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
