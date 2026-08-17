export type AppRole = 'Owner' | 'Admin' | 'Receptionist' | 'HR' | 'Inventory' | 'Client'

/** Front-desk / clinical operators (POS and clinic tools). */
export const CLINIC_ROLES: AppRole[] = ['Owner', 'Admin', 'Receptionist']

/** Payroll, incentives, staff accounts & attendance. */
export const HR_ACCESS_ROLES: AppRole[] = ['Owner', 'Admin', 'HR']

/** Stock catalog, stocktake, receiving, reorder. */
export const INVENTORY_ACCESS_ROLES: AppRole[] = ['Owner', 'Admin', 'Inventory']

/** Inventory ops board (reorder / receiving / stocktake overview). Owner & Admin only. */
export const INVENTORY_OPS_ROLES: AppRole[] = ['Owner', 'Admin']

/** Anyone who uses the internal app shell (not Client portal). */
export const INTERNAL_ROLES: AppRole[] = ['Owner', 'Admin', 'Receptionist', 'HR', 'Inventory']

/** Full approval / settings / dashboard. */
export const ELEVATED_ROLES: AppRole[] = ['Owner', 'Admin']

const ROLE_ALIASES: Record<string, AppRole> = {
  owner: 'Owner',
  admin: 'Admin',
  staff: 'Receptionist',
  receptionist: 'Receptionist',
  hr: 'HR',
  'human resources': 'HR',
  inventory: 'Inventory',
  'inventory specialist': 'Inventory',
  'inventory specialists': 'Inventory',
  client: 'Client',
  customer: 'Client',
  member: 'Client',
}

const ROLE_LABELS: Record<AppRole, string> = {
  Owner: 'Owner',
  Admin: 'Admin',
  Receptionist: 'Receptionist',
  HR: 'HR',
  Inventory: 'Inventory Specialist',
  Client: 'Client',
}

export function normalizeRole(role: string | null | undefined): AppRole {
  if (!role) return 'Receptionist'
  return ROLE_ALIASES[role.trim().toLowerCase()] ?? 'Receptionist'
}

export function roleLabel(role: string | null | undefined): string {
  return ROLE_LABELS[normalizeRole(role)]
}

export function isElevatedRole(role: string | null | undefined): boolean {
  return ELEVATED_ROLES.includes(normalizeRole(role))
}

export function isClinicRole(role: string | null | undefined): boolean {
  return CLINIC_ROLES.includes(normalizeRole(role))
}

export function isHrAccessRole(role: string | null | undefined): boolean {
  return HR_ACCESS_ROLES.includes(normalizeRole(role))
}

export function isInventoryAccessRole(role: string | null | undefined): boolean {
  return INVENTORY_ACCESS_ROLES.includes(normalizeRole(role))
}

export function isInternalRole(role: string | null | undefined): boolean {
  return INTERNAL_ROLES.includes(normalizeRole(role))
}

export function isClientRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'Client'
}

export function homePathForRole(role: string | null | undefined): string {
  const appRole = normalizeRole(role)
  if (appRole === 'Client') return '/portal'
  if (appRole === 'Receptionist') return '/pos'
  if (appRole === 'HR') return '/payroll'
  if (appRole === 'Inventory') return '/inventory'
  return '/dashboard'
}

/**
 * Path access matrix.
 * Owner/Admin: full clinic + HR + inventory + system.
 * Receptionist: clinic operations (no dashboard / HR / inventory / settings).
 * HR: payroll, incentives, staff & attendance only.
 * Inventory: stock catalog, stocktake, receiving, reorder (+ account).
 * Owner/Admin: inventory ops board overview.
 * Client: portal only.
 */
const PATH_ROLES: Record<string, AppRole[]> = {
  '/dashboard': ['Owner', 'Admin'],
  '/pos': ['Owner', 'Admin', 'Receptionist'],
  '/sales': ['Owner', 'Admin', 'Receptionist'],
  '/sessions': ['Owner', 'Admin', 'Receptionist'],
  '/appointments': ['Owner', 'Admin', 'Receptionist'],
  '/customers': ['Owner', 'Admin', 'Receptionist'],
  '/consultations': ['Owner', 'Admin', 'Receptionist'],
  '/services': ['Owner', 'Admin', 'Receptionist'],
  '/loyalty': ['Owner', 'Admin', 'Receptionist'],
  '/qr-checkin': ['Owner', 'Admin', 'Receptionist'],
  '/inventory': ['Owner', 'Admin', 'Inventory'],
  '/inventory/ops': ['Owner', 'Admin'],
  '/inventory/stocktake': ['Owner', 'Admin', 'Inventory'],
  '/inventory/receiving': ['Owner', 'Admin', 'Inventory'],
  '/inventory/reorder': ['Owner', 'Admin', 'Inventory'],
  '/expenses': ['Owner', 'Admin', 'Receptionist'],
  '/staff': ['Owner', 'Admin', 'HR'],
  '/create-account': ['Owner', 'Admin', 'HR'],
  '/payroll': ['Owner', 'Admin', 'HR'],
  '/incentives': ['Owner', 'Admin', 'HR'],
  '/feedback': ['Owner', 'Admin'],
  '/my-work': ['Receptionist'],
  '/my-account': ['Owner', 'Admin', 'Receptionist', 'HR', 'Inventory'],
  '/chat': ['Owner', 'Admin', 'Receptionist'],
  '/settings': ['Owner', 'Admin'],
  '/portal': ['Client'],
  '/portal/services': ['Client'],
  '/portal/appointments': ['Client'],
  '/portal/loyalty': ['Client'],
  '/portal/wallet': ['Client'],
  '/portal/notes': ['Client'],
  '/portal/support': ['Client'],
  '/portal/settings': ['Client'],
}

export function rolesForPath(pathname: string): AppRole[] | null {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (PATH_ROLES[clean]) return PATH_ROLES[clean]
  if (clean.startsWith('/portal')) return ['Client']
  if (clean.startsWith('/inventory')) return INVENTORY_ACCESS_ROLES
  return null
}

export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  const allowed = rolesForPath(pathname)
  if (!allowed) return isClinicRole(role)
  return allowed.includes(normalizeRole(role))
}
