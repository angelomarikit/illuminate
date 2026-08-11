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

export const navSections: NavSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['Owner', 'Admin'] },
      { label: 'POS / Sales', path: '/pos', icon: ShoppingBag, roles: ['Owner', 'Admin', 'Staff'] },
      { label: 'Sales Proof', path: '/sales', icon: Receipt, roles: ['Owner', 'Admin', 'Staff'] },
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
    title: 'Operations',
    items: [
      { label: 'Inventory', path: '/inventory', icon: Package, roles: ['Owner', 'Admin', 'Staff'] },
      { label: 'Expenses', path: '/expenses', icon: Wallet, roles: ['Owner', 'Admin', 'Staff'] },
      {
        label: 'Staff & Attendance',
        path: '/staff',
        icon: Clock3,
        roles: ['Owner', 'Admin'],
      },
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
    title: 'System',
    items: [
      { label: 'Feedback', path: '/feedback', icon: Star, roles: ['Owner', 'Admin'] },
      { label: 'Settings', path: '/settings', icon: Settings, roles: ['Owner', 'Admin'] },
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
