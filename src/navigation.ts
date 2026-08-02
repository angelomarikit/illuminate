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
} from 'lucide-react'

export type NavItem = {
  label: string
  path: string
  icon: LucideIcon
}

export type NavSection = {
  title: string
  items: NavItem[]
}

export const navSections: NavSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'POS / Sales', path: '/pos', icon: ShoppingBag },
      { label: 'Sales Proof', path: '/sales', icon: Receipt },
      { label: 'Appointments', path: '/appointments', icon: CalendarDays },
    ],
  },
  {
    title: 'Clinic',
    items: [
      { label: 'Customers', path: '/customers', icon: Users },
      { label: 'AI Consultations', path: '/consultations', icon: Sparkles },
      { label: 'Services', path: '/services', icon: ClipboardList },
      { label: 'Loyalty & Points', path: '/loyalty', icon: Gift },
      { label: 'QR Check-in', path: '/qr-checkin', icon: QrCode },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Inventory', path: '/inventory', icon: Package },
      { label: 'Expenses', path: '/expenses', icon: Wallet },
      { label: 'Staff & Attendance', path: '/staff', icon: Clock3 },
      { label: 'Chat Support', path: '/chat', icon: MessageSquare },
    ],
  },
  {
    title: 'System',
    items: [{ label: 'Settings', path: '/settings', icon: Settings }],
  },
]
