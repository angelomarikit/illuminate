export type AppRole = 'Owner' | 'Admin' | 'Receptionist' | 'HR' | 'Inventory' | 'Client'

const ALIASES: Record<string, AppRole> = {
  owner: 'Owner',
  admin: 'Admin',
  staff: 'Receptionist',
  receptionist: 'Receptionist',
  hr: 'HR',
  inventory: 'Inventory',
  client: 'Client',
  customer: 'Client',
}

export function normalizeRole(role: string | null | undefined): AppRole {
  if (!role) return 'Client'
  return ALIASES[role.trim().toLowerCase()] ?? 'Client'
}

export function isClientRole(role: string | null | undefined) {
  return normalizeRole(role) === 'Client'
}
