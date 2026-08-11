export type EmploymentStatus = 'probation' | 'regular' | 'contract' | 'separated'
export type DutyStatus = 'on-duty' | 'off-duty' | 'on-leave'
export type LeaveType = 'Vacation' | 'Sick' | 'Personal' | 'Emergency'

export type LeaveCredits = {
  vacation: number
  sick: number
  personal: number
  emergency: number
}

export function leaveDays(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  return Math.max(1, diff)
}

export function hoursBetween(timeIn?: string | null, timeOut?: string | null): number {
  if (!timeIn || !timeOut) return 0
  const [ih, im, is = '0'] = String(timeIn).split(':')
  const [oh, om, os = '0'] = String(timeOut).split(':')
  const start = Number(ih) * 3600 + Number(im) * 60 + Number(is)
  const end = Number(oh) * 3600 + Number(om) * 60 + Number(os)
  return Math.max(0, (end - start) / 3600)
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function creditKeyForLeave(type: LeaveType): keyof LeaveCredits {
  if (type === 'Vacation') return 'vacation'
  if (type === 'Sick') return 'sick'
  if (type === 'Personal') return 'personal'
  return 'emergency'
}

export function creditColumnForLeave(type: LeaveType): string {
  if (type === 'Vacation') return 'leave_credits_vacation'
  if (type === 'Sick') return 'leave_credits_sick'
  if (type === 'Personal') return 'leave_credits_personal'
  return 'leave_credits_emergency'
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function nowTimeString(): string {
  return new Date().toTimeString().slice(0, 8)
}
