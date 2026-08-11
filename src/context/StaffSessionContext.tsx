import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { isClinicRole, normalizeRole, type AppRole } from '../lib/roles'
import {
  type DutyStatus,
  type EmploymentStatus,
  type LeaveCredits,
  formatHours,
  hoursBetween,
  nowTimeString,
  todayDateString,
} from '../lib/staffHr'
import { supabase } from '../lib/supabase'

export type MyStaffRecord = {
  id: string
  fullName: string
  email: string
  appRole: AppRole
  employmentStatus: EmploymentStatus
  status: DutyStatus
  branchId: string | null
  credits: LeaveCredits
}

type TodayAttendance = {
  id: string
  timeIn: string | null
  timeOut: string | null
}

type StaffSessionValue = {
  loading: boolean
  staffRecord: MyStaffRecord | null
  todayAttendance: TodayAttendance | null
  isClockedIn: boolean
  clockBusy: boolean
  clockError: string
  hoursToday: number
  hoursTodayLabel: string
  refresh: () => Promise<void>
  clockIn: () => Promise<void>
  clockOut: () => Promise<void>
}

const StaffSessionContext = createContext<StaffSessionValue | null>(null)

function mapProfile(row: Record<string, unknown>): MyStaffRecord {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    email: String(row.email ?? ''),
    appRole: normalizeRole(String(row.role ?? 'Staff')),
    employmentStatus: (row.employment_status as EmploymentStatus) || 'probation',
    status: (row.duty_status as DutyStatus) || 'off-duty',
    branchId: (row.branch_id as string | null) ?? null,
    credits: {
      vacation: Number(row.leave_credits_vacation ?? 0),
      sick: Number(row.leave_credits_sick ?? 0),
      personal: Number(row.leave_credits_personal ?? 0),
      emergency: Number(row.leave_credits_emergency ?? 0),
    },
  }
}

export function StaffSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [staffRecord, setStaffRecord] = useState<MyStaffRecord | null>(null)
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance | null>(null)
  const [clockBusy, setClockBusy] = useState(false)
  const [clockError, setClockError] = useState('')

  const refresh = useCallback(async () => {
    if (!user || !isClinicRole(user.role)) {
      setStaffRecord(null)
      setTodayAttendance(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setClockError('')

    const { data: profile, error } = await supabase
      .from('profiles')
      .select(
        'id, full_name, email, role, branch_id, employment_status, duty_status, leave_credits_vacation, leave_credits_sick, leave_credits_personal, leave_credits_emergency',
      )
      .eq('id', user.id)
      .maybeSingle()

    if (error || !profile) {
      setStaffRecord(null)
      setTodayAttendance(null)
      setLoading(false)
      return
    }

    const mapped = mapProfile(profile as Record<string, unknown>)
    setStaffRecord(mapped)

    const today = todayDateString()
    const { data: attendance } = await supabase
      .from('attendance')
      .select('id, time_in, time_out')
      .eq('profile_id', mapped.id)
      .eq('work_date', today)
      .maybeSingle()

    setTodayAttendance(
      attendance
        ? {
            id: attendance.id,
            timeIn: attendance.time_in ? String(attendance.time_in) : null,
            timeOut: attendance.time_out ? String(attendance.time_out) : null,
          }
        : null,
    )
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  const isClockedIn = Boolean(todayAttendance?.timeIn && !todayAttendance?.timeOut)

  const hoursToday = useMemo(() => {
    if (!todayAttendance?.timeIn) return 0
    const end = todayAttendance.timeOut || (isClockedIn ? nowTimeString() : null)
    return hoursBetween(todayAttendance.timeIn, end)
  }, [todayAttendance, isClockedIn])

  const clockIn = useCallback(async () => {
    if (!staffRecord) {
      setClockError('Profile not found.')
      return
    }
    setClockBusy(true)
    setClockError('')
    const today = todayDateString()
    const time = nowTimeString()

    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('profile_id', staffRecord.id)
      .eq('work_date', today)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('attendance')
        .update({ time_in: time, time_out: null })
        .eq('id', existing.id)
      if (error) {
        setClockError(error.message)
        setClockBusy(false)
        return
      }
    } else {
      const { error } = await supabase.from('attendance').insert({
        profile_id: staffRecord.id,
        work_date: today,
        time_in: time,
      })
      if (error) {
        setClockError(error.message)
        setClockBusy(false)
        return
      }
    }

    await supabase.from('profiles').update({ duty_status: 'on-duty' }).eq('id', staffRecord.id)
    setClockBusy(false)
    await refresh()
  }, [staffRecord, refresh])

  const clockOut = useCallback(async () => {
    if (!staffRecord) {
      setClockError('Profile not found.')
      return
    }
    setClockBusy(true)
    setClockError('')
    const today = todayDateString()
    const time = nowTimeString()

    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('profile_id', staffRecord.id)
      .eq('work_date', today)
      .maybeSingle()

    if (!existing) {
      setClockError('Time in first before timing out.')
      setClockBusy(false)
      return
    }

    const { error } = await supabase
      .from('attendance')
      .update({ time_out: time })
      .eq('id', existing.id)
    if (error) {
      setClockError(error.message)
      setClockBusy(false)
      return
    }

    await supabase.from('profiles').update({ duty_status: 'off-duty' }).eq('id', staffRecord.id)
    setClockBusy(false)
    await refresh()
  }, [staffRecord, refresh])

  const value = useMemo<StaffSessionValue>(
    () => ({
      loading,
      staffRecord,
      todayAttendance,
      isClockedIn,
      clockBusy,
      clockError,
      hoursToday,
      hoursTodayLabel: formatHours(hoursToday),
      refresh,
      clockIn,
      clockOut,
    }),
    [
      loading,
      staffRecord,
      todayAttendance,
      isClockedIn,
      clockBusy,
      clockError,
      hoursToday,
      refresh,
      clockIn,
      clockOut,
    ],
  )

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>
}

export function useStaffSession() {
  const ctx = useContext(StaffSessionContext)
  if (!ctx) throw new Error('useStaffSession must be used within StaffSessionProvider')
  return ctx
}
