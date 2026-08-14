import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import {
  getBrowserNotifyEnabled,
  getBrowserNotifyPermission,
  markBrowserNoticesSeen,
  pushBrowserNotifications,
  requestBrowserNotifyPermission,
  setBrowserNotifyEnabled,
} from '../lib/browserNotifications'
import {
  buildNotifications,
  kindsForRole,
  type AppNotification,
} from '../lib/notifications'
import { isInternalRole } from '../lib/roles'
import { supabase } from '../lib/supabase'
import { isUuid } from '../lib/utils'
import { toLocalISODate } from '../lib/dates'

export function useNotifications(opts?: {
  onBrowserOpen?: (item: AppNotification) => void
}) {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [browserPermission, setBrowserPermission] = useState(() => getBrowserNotifyPermission())
  const [browserEnabled, setBrowserEnabled] = useState(() => getBrowserNotifyEnabled())
  const primedRef = useRef(false)
  const onBrowserOpenRef = useRef(opts?.onBrowserOpen)
  onBrowserOpenRef.current = opts?.onBrowserOpen

  const enabled = Boolean(user && isInternalRole(user.role) && kindsForRole(user.role).length)

  const load = useCallback(async () => {
    if (!user || !enabled) {
      setItems([])
      return
    }

    setLoading(true)
    setError('')
    const today = toLocalISODate()
    const kinds = new Set(kindsForRole(user.role))

    try {
      const needsAppts = kinds.has('appointment_soon') || kinds.has('booking_pending')
      const needsLeaves = kinds.has('leave_pending')
      const needsInv = kinds.has('low_stock')

      const [acksRes, apptsRes, leavesRes, invRes] = await Promise.all([
        supabase.from('notification_acks').select('notice_key').eq('user_id', user.id),
        needsAppts
          ? (() => {
              let q = supabase
                .from('appointments')
                .select(
                  'id, customer_name, service_name, appointment_date, appointment_time, status, branch_id',
                )
                .or(`appointment_date.eq.${today},status.eq.pending`)
                .order('appointment_date')
                .order('appointment_time')
                .limit(80)
              if (isUuid(branchId)) {
                q = q.or(`branch_id.eq.${branchId},branch_id.is.null`)
              }
              return q
            })()
          : Promise.resolve({ data: null, error: null }),
        needsLeaves
          ? supabase
              .from('leave_requests')
              .select('id, staff_name, leave_type, date_from, date_to, status, created_at')
              .eq('status', 'pending')
              .order('created_at', { ascending: false })
              .limit(40)
          : Promise.resolve({ data: null, error: null }),
        needsInv
          ? (() => {
              let q = supabase
                .from('inventory_items')
                .select('id, name, stock, reorder_level, unit, branch_id')
                .limit(100)
              if (isUuid(branchId)) q = q.eq('branch_id', branchId)
              return q
            })()
          : Promise.resolve({ data: null, error: null }),
      ])

      if (acksRes.error) throw acksRes.error
      if (apptsRes.error) throw apptsRes.error
      if (leavesRes.error) throw leavesRes.error
      if (invRes.error) throw invRes.error

      const ackedKeys = new Set((acksRes.data ?? []).map((row) => row.notice_key as string))

      const next = buildNotifications({
        role: user.role,
        todayIso: today,
        appointments: apptsRes.data ?? [],
        leaves: leavesRes.data ?? [],
        inventory: invRes.data ?? [],
        ackedKeys,
      })

      // First poll: remember current inbox so we don't spam desktop alerts on login.
      if (!primedRef.current) {
        markBrowserNoticesSeen(next.map((n) => n.key))
        primedRef.current = true
      } else {
        pushBrowserNotifications(next, {
          onOpen: (item) => onBrowserOpenRef.current?.(item),
        })
      }

      setItems(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [user, enabled, branchId])

  useEffect(() => {
    void load()
    if (!enabled) return
    const id = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(id)
  }, [load, enabled])

  useEffect(() => {
    primedRef.current = false
  }, [user?.id])

  const unreadCount = useMemo(() => items.filter((n) => n.unread).length, [items])

  const enableBrowserNotifications = useCallback(async () => {
    const permission = await requestBrowserNotifyPermission()
    setBrowserPermission(permission)
    setBrowserEnabled(permission === 'granted' && getBrowserNotifyEnabled())
    return permission
  }, [])

  const disableBrowserNotifications = useCallback(() => {
    setBrowserNotifyEnabled(false)
    setBrowserEnabled(false)
  }, [])

  const persistAcks = useCallback(
    async (keys: string[]) => {
      if (!user || !keys.length) return true
      const unique = [...new Set(keys)]
      const { data: existing, error: existingErr } = await supabase
        .from('notification_acks')
        .select('notice_key')
        .eq('user_id', user.id)
        .in('notice_key', unique)
      if (existingErr) {
        setError(existingErr.message)
        return false
      }
      const have = new Set((existing ?? []).map((row) => row.notice_key as string))
      const missing = unique.filter((key) => !have.has(key))
      if (!missing.length) return true
      const { error: insertErr } = await supabase.from('notification_acks').insert(
        missing.map((notice_key) => ({
          user_id: user.id,
          notice_key,
          acked_at: new Date().toISOString(),
        })),
      )
      if (insertErr) {
        setError(insertErr.message)
        return false
      }
      return true
    },
    [user],
  )

  const acknowledge = useCallback(
    async (keys: string[]) => {
      if (!keys.length) return false
      const unique = [...new Set(keys)]
      const ok = await persistAcks(unique)
      if (!ok) return false
      setError('')
      markBrowserNoticesSeen(unique)
      setItems((prev) => prev.filter((n) => !unique.includes(n.key)))
      return true
    },
    [persistAcks],
  )

  const clearAll = useCallback(async () => {
    if (!items.length) return
    const keys = items.map((n) => n.key)
    const ok = await persistAcks(keys)
    if (!ok) return
    setError('')
    markBrowserNoticesSeen(keys)
    setItems([])
  }, [items, persistAcks])

  return {
    enabled,
    items,
    loading,
    error,
    unreadCount,
    reload: load,
    acknowledge,
    clearAll,
    browserPermission,
    browserEnabled,
    enableBrowserNotifications,
    disableBrowserNotifications,
  }
}
