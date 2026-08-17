import { NavLink } from 'react-router-dom'
import { ClipboardCheck, LayoutList, Package, PackagePlus, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isElevatedRole } from '../lib/roles'

const links = [
  { to: '/inventory/ops', label: 'Ops board', icon: LayoutList, end: false, elevatedOnly: true },
  { to: '/inventory', label: 'Stock catalog', icon: Package, end: true, elevatedOnly: false },
  { to: '/inventory/stocktake', label: 'Stocktake', icon: ClipboardCheck, end: false, elevatedOnly: false },
  { to: '/inventory/receiving', label: 'Receiving', icon: PackagePlus, end: false, elevatedOnly: false },
  { to: '/inventory/reorder', label: 'Reorder', icon: RefreshCw, end: false, elevatedOnly: false },
]

export function InventorySubnav() {
  const { user } = useAuth()
  const elevated = isElevatedRole(user?.role)
  const visible = links.filter((link) => !link.elevatedOnly || elevated)

  return (
    <div className="chips" style={{ marginBottom: 16 }}>
      {visible.map(({ to, label, icon: Icon, end }) => (
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
