import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  CalendarDays,
  Wallet,
  ClipboardList,
  Clock3,
  QrCode,
  MessageSquare,
  Settings,
  Receipt,
  Gift,
  HeartPulse,
  LifeBuoy,
  UserRound,
  Star,
  CalendarCheck2,
  Banknote,
  BadgePercent,
  CircleUserRound,
  ClipboardCheck,
  PackagePlus,
  RefreshCw,
  LayoutList,
  UserPlus,
  NotebookPen,
} from 'lucide-react'
import { type AppRole, canAccessPath, normalizeRole } from './lib/roles'

export type NavItem = {
  label: string
  path: string
  icon: LucideIcon
  roles: AppRole[]
  children?: NavItem[]
}

export type NavSection = {
  title: string
  items: NavItem[]
}

const INV: AppRole[] = ['Owner', 'Admin', 'Inventory']
const CLINIC: AppRole[] = ['Owner', 'Admin', 'Receptionist']

export const navSections: NavSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['Owner', 'Admin'] },
      { label: 'POS / Sales', path: '/pos', icon: ShoppingBag, roles: CLINIC },
      { label: 'Sales Proof', path: '/sales', icon: Receipt, roles: CLINIC },
      {
        label: 'Appointments',
        path: '/appointments',
        icon: CalendarDays,
        roles: CLINIC,
      },
    ],
  },
  {
    title: 'Clinic',
    items: [
      {
        label: 'Clients',
        path: '/clients',
        icon: Users,
        roles: CLINIC,
        children: [
          {
            label: 'Register clients',
            path: '/register-clients',
            icon: UserPlus,
            roles: CLINIC,
          },
          {
            label: 'Clients list',
            path: '/clients',
            icon: Users,
            roles: CLINIC,
          },
          {
            label: 'Client sessions',
            path: '/sessions',
            icon: CalendarCheck2,
            roles: CLINIC,
          },
        ],
      },
      { label: 'Services and Series', path: '/services', icon: ClipboardList, roles: CLINIC },
      { label: 'Loyalty & Points', path: '/loyalty', icon: Gift, roles: CLINIC },
      { label: 'QR Check-in', path: '/qr-checkin', icon: QrCode, roles: CLINIC },
    ],
  },
  {
    title: 'Inventory',
    items: [
      {
        label: 'Ops board',
        path: '/inventory/ops',
        icon: LayoutList,
        roles: ['Owner', 'Admin'],
      },
      { label: 'Stock catalog', path: '/inventory', icon: Package, roles: INV },
      { label: 'Stocktake', path: '/inventory/stocktake', icon: ClipboardCheck, roles: INV },
      { label: 'Receiving', path: '/inventory/receiving', icon: PackagePlus, roles: INV },
      { label: 'Stock assessment', path: '/inventory/assessment', icon: ClipboardList, roles: INV },
      { label: 'Reorder', path: '/inventory/reorder', icon: RefreshCw, roles: INV },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Expenses', path: '/expenses', icon: Wallet, roles: CLINIC },
      {
        label: 'My Work',
        path: '/my-work',
        icon: Clock3,
        roles: ['Receptionist'],
      },
      { label: 'Chat Support', path: '/chat', icon: MessageSquare, roles: CLINIC },
    ],
  },
  {
    title: 'HR',
    items: [
      {
        label: 'Staff & Attendance',
        path: '/staff',
        icon: Clock3,
        roles: ['Owner', 'Admin', 'HR'],
      },
      {
        label: 'Create account',
        path: '/create-account',
        icon: UserPlus,
        roles: ['Owner', 'Admin', 'HR'],
      },
      {
        label: 'Payroll',
        path: '/payroll',
        icon: Banknote,
        roles: ['Owner', 'Admin', 'HR'],
      },
      {
        label: 'Incentives',
        path: '/incentives',
        icon: BadgePercent,
        roles: ['Owner', 'Admin', 'HR'],
      },
    ],
  },
  {
    title: 'My account',
    items: [
      {
        label: 'Account settings',
        path: '/my-account',
        icon: CircleUserRound,
        roles: ['Owner', 'Admin', 'Receptionist', 'HR', 'Inventory'],
      },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Feedback', path: '/feedback', icon: Star, roles: ['Owner', 'Admin'] },
      { label: 'Clinic settings', path: '/settings', icon: Settings, roles: ['Owner', 'Admin'] },
    ],
  },
  {
    title: 'My Illuminate',
    items: [
      { label: 'My Care', path: '/portal', icon: HeartPulse, roles: ['Client'] },
      {
        label: 'Appointments',
        path: '/portal/appointments',
        icon: CalendarDays,
        roles: ['Client'],
      },
      {
        label: 'My Packages',
        path: '/portal/services',
        icon: CalendarCheck2,
        roles: ['Client'],
      },
      { label: 'Wallet', path: '/portal/wallet', icon: Wallet, roles: ['Client'] },
      { label: 'My Points', path: '/portal/loyalty', icon: Gift, roles: ['Client'] },
      { label: 'Doctor notes', path: '/portal/notes', icon: NotebookPen, roles: ['Client'] },
      { label: 'Support', path: '/portal/support', icon: LifeBuoy, roles: ['Client'] },
      { label: 'My Profile', path: '/portal/settings', icon: UserRound, roles: ['Client'] },
    ],
  },
]

function isNavItemVisible(item: NavItem, appRole: AppRole): boolean {
  if (!item.roles.includes(appRole)) return false
  if (item.children?.length) {
    return item.children.some(
      (child) => child.roles.includes(appRole) && canAccessPath(appRole, child.path),
    )
  }
  return canAccessPath(appRole, item.path)
}

export function navForRole(role: string | null | undefined): NavSection[] {
  const appRole = normalizeRole(role)
  return navSections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => {
          if (!item.children?.length) return item
          return {
            ...item,
            children: item.children.filter(
              (child) => child.roles.includes(appRole) && canAccessPath(appRole, child.path),
            ),
          }
        })
        .filter((item) => isNavItemVisible(item, appRole)),
    }))
    .filter((section) => section.items.length > 0)
}
