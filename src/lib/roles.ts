export type AppRole = 'Owner' | 'Admin' | 'Staff' | 'Client'

/** Clinic operators (web admin + Expo staff app later). */
export const CLINIC_ROLES: AppRole[] = ['Owner', 'Admin', 'Staff']

/** Full approval / HR / dashboard responsibility. */
export const ELEVATED_ROLES: AppRole[] = ['Owner', 'Admin']

const ROLE_ALIASES: Record<string, AppRole> = {
  owner: 'Owner',
  admin: 'Admin',
  staff: 'Staff',
  client: 'Client',
  customer: 'Client',
  member: 'Client',
}

export function normalizeRole(role: string | null | undefined): AppRole {
  if (!role) return 'Staff'
  return ROLE_ALIASES[role.trim().toLowerCase()] ?? 'Staff'
}

export function isElevatedRole(role: string | null | undefined): boolean {
  return ELEVATED_ROLES.includes(normalizeRole(role))
}

export function isClinicRole(role: string | null | undefined): boolean {
  return CLINIC_ROLES.includes(normalizeRole(role))
}

export function isClientRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'Client'
}

export function homePathForRole(role: string | null | undefined): string {
  const appRole = normalizeRole(role)
  if (appRole === 'Client') return '/portal'
  if (appRole === 'Staff') return '/pos'
  return '/dashboard'
}

/**
 * Path access matrix.
 * Owner/Admin: everything.
 * Staff: clinic operations (no Owner dashboard / HR approvals / full settings).
 * Client: portal only (Expo client app will reuse these routes/APIs).
 */
const PATH_ROLES: Record<string, AppRole[]> = {
  '/dashboard': ['Owner', 'Admin'],
  '/pos': ['Owner', 'Admin', 'Staff'],
  '/sales': ['Owner', 'Admin', 'Staff'],
  '/appointments': ['Owner', 'Admin', 'Staff'],
  '/customers': ['Owner', 'Admin', 'Staff'],
  '/consultations': ['Owner', 'Admin', 'Staff'],
  '/services': ['Owner', 'Admin', 'Staff'],
  '/loyalty': ['Owner', 'Admin', 'Staff'],
  '/qr-checkin': ['Owner', 'Admin', 'Staff'],
  '/inventory': ['Owner', 'Admin', 'Staff'],
  '/expenses': ['Owner', 'Admin', 'Staff'],
  '/staff': ['Owner', 'Admin'],
  '/feedback': ['Owner', 'Admin'],
  '/my-work': ['Staff'],
  '/chat': ['Owner', 'Admin', 'Staff'],
  '/settings': ['Owner', 'Admin'],
  '/portal': ['Client'],
  '/portal/services': ['Client'],
  '/portal/loyalty': ['Client'],
  '/portal/support': ['Client'],
  '/portal/settings': ['Client'],
}

export function rolesForPath(pathname: string): AppRole[] | null {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (PATH_ROLES[clean]) return PATH_ROLES[clean]
  if (clean.startsWith('/portal')) return ['Client']
  return null
}

export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  const allowed = rolesForPath(pathname)
  if (!allowed) return isClinicRole(role)
  return allowed.includes(normalizeRole(role))
}
