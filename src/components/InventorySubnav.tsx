import { NavLink } from 'react-router-dom'
import { ClipboardCheck, Package, PackagePlus, RefreshCw } from 'lucide-react'

const links = [
  { to: '/inventory', label: 'Stock catalog', icon: Package, end: true },
  { to: '/inventory/stocktake', label: 'Stocktake', icon: ClipboardCheck, end: false },
  { to: '/inventory/receiving', label: 'Receiving', icon: PackagePlus, end: false },
  { to: '/inventory/reorder', label: 'Reorder', icon: RefreshCw, end: false },
]

export function InventorySubnav() {
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
