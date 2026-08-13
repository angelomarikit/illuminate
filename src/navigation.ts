import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  CalendarDays,
  Wallet,
  Sparkles,
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
  UserPlus,
} from 'lucide-react'
import { type AppRole, canAccessPath, normalizeRole } from './lib/roles'

export type NavItem = {
  label: string
  path: string
  icon: LucideIcon
  roles: AppRole[]
}

export type NavSection = {
  title: string
  items: NavItem[]
}

const INV: AppRole[] = ['Owner', 'Admin', 'Inventory']

export const navSections: NavSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['Owner', 'Admin'] },
      { label: 'POS / Sales', path: '/pos', icon: ShoppingBag, roles: ['Owner', 'Admin', 'Staff'] },
      { label: 'Sales Proof', path: '/sales', icon: Receipt, roles: ['Owner', 'Admin', 'Staff'] },
      {
        label: 'Client Sessions',
        path: '/sessions',
        icon: CalendarCheck2,
        roles: ['Owner', 'Admin', 'Staff'],
      },
      {
        label: 'Appointments',
        path: '/appointments',
        icon: CalendarDays,
        roles: ['Owner', 'Admin', 'Staff'],
      },
    ],
  },
  {
    title: 'Clinic',
    items: [
      { label: 'Customers', path: '/customers', icon: Users, roles: ['Owner', 'Admin', 'Staff'] },
      {
        label: 'AI Consultations',
        path: '/consultations',
        icon: Sparkles,
        roles: ['Owner', 'Admin', 'Staff'],
      },
      { label: 'Services', path: '/services', icon: ClipboardList, roles: ['Owner', 'Admin', 'Staff'] },
      { label: 'Loyalty & Points', path: '/loyalty', icon: Gift, roles: ['Owner', 'Admin', 'Staff'] },
      { label: 'QR Check-in', path: '/qr-checkin', icon: QrCode, roles: ['Owner', 'Admin', 'Staff'] },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { label: 'Stock catalog', path: '/inventory', icon: Package, roles: INV },
      { label: 'Stocktake', path: '/inventory/stocktake', icon: ClipboardCheck, roles: INV },
      { label: 'Receiving', path: '/inventory/receiving', icon: PackagePlus, roles: INV },
      { label: 'Reorder', path: '/inventory/reorder', icon: RefreshCw, roles: INV },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Expenses', path: '/expenses', icon: Wallet, roles: ['Owner', 'Admin', 'Staff'] },
      {
        label: 'My Work',
        path: '/my-work',
        icon: Clock3,
        roles: ['Staff'],
      },
      { label: 'Chat Support', path: '/chat', icon: MessageSquare, roles: ['Owner', 'Admin', 'Staff'] },
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
        roles: ['Owner', 'Admin', 'Staff', 'HR', 'Inventory'],
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
        label: 'My Services',
        path: '/portal/services',
        icon: CalendarDays,
        roles: ['Client'],
      },
      { label: 'My Points', path: '/portal/loyalty', icon: Gift, roles: ['Client'] },
      { label: 'Support', path: '/portal/support', icon: LifeBuoy, roles: ['Client'] },
      { label: 'My Profile', path: '/portal/settings', icon: UserRound, roles: ['Client'] },
    ],
  },
]

export function navForRole(role: string | null | undefined): NavSection[] {
  const appRole = normalizeRole(role)
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => item.roles.includes(appRole) && canAccessPath(appRole, item.path),
      ),
    }))
    .filter((section) => section.items.length > 0)
}
