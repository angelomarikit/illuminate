/** Local calendar date helpers (avoids UTC day-shift from toISOString). */

export function toLocalISODate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseLocalISODate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(iso: string, days: number) {
  const d = parseLocalISODate(iso)
  d.setDate(d.getDate() + days)
  return toLocalISODate(d)
}

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function buildMonthCells(month: Date) {
  const first = startOfMonth(month)
  const startPad = first.getDay()
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: Array<{ date: Date | null; key: string }> = []
  for (let i = 0; i < startPad; i += 1) cells.push({ date: null, key: `pad-${i}` })
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day)
    cells.push({ date, key: toLocalISODate(date) })
  }
  return cells
}

export function inDateRange(iso: string, from: string, to: string) {
  if (!iso) return false
  if (from && iso < from) return false
  if (to && iso > to) return false
  return true
}

export function formatShortDate(iso: string) {
  const d = parseLocalISODate(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}
