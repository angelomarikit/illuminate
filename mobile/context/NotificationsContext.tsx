import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { useLinkedCustomer } from '@/hooks/useLinkedCustomer'
import {
  buildUpcomingNotices,
  type ClientNotice,
  type ClientNoticeKind,
} from '@/lib/clientNotifications'
import { toLocalDateKey } from '@/lib/dates'
import { registerForPushNotificationsAsync, scheduleUpcomingLocalReminder } from '@/lib/push'
import { supabase } from '@/lib/supabase'

type Ctx = {
  items: ClientNotice[]
  loading: boolean
  error: string
  unreadCount: number
  reload: () => Promise<void>
  acknowledge: (keys: string[]) => Promise<boolean>
  clearAll: () => Promise<void>
  pushReady: boolean
}

const NotificationsContext = createContext<Ctx | null>(null)

type DbRow = {
  notice_key: string
  kind: string
  title: string
  body: string
  href: string
  created_at: string
  read_at: string | null
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { customer } = useLinkedCustomer()
  const router = useRouter()
  const [items, setItems] = useState<ClientNotice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pushReady, setPushReady] = useState(false)
  const scheduledRef = useRef<Set<string>>(new Set())

  const reload = useCallback(async () => {
    if (!user) {
      setItems([])
      return
    }

    setLoading(true)
    setError('')
    const today = toLocalDateKey(new Date())

    try {
      const [dbRes, ackRes, apptRes] = await Promise.all([
        supabase
          .from('client_notifications')
          .select('notice_key, kind, title, body, href, created_at, read_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('notification_acks').select('notice_key').eq('user_id', user.id),
        (() => {
          let q = supabase
            .from('appointments')
            .select('id, service_name, appointment_date, appointment_time, status')
            .eq('appointment_date', today)
            .order('appointment_time')
            .limit(40)
          if (customer?.id) q = q.eq('customer_id', customer.id)
          else if (user.email) q = q.ilike('customer_email', user.email)
          return q
        })(),
      ])

      if (dbRes.error && !dbRes.error.message.includes('schema cache')) {
        // Table may not exist until SQL is run — keep UI usable
        if (!dbRes.error.message.includes('does not exist')) throw dbRes.error
      }

      const ackedKeys = new Set((ackRes.data ?? []).map((r) => r.notice_key as string))

      const fromDb: ClientNotice[] = ((dbRes.data as DbRow[]) ?? [])
        .filter((row) => !row.read_at)
        .map((row) => ({
          key: row.notice_key,
          kind: row.kind as ClientNoticeKind,
          title: row.title,
          body: row.body,
          href: row.href || '/(tabs)/appointments',
          createdAt: row.created_at,
          unread: true,
          source: 'db' as const,
        }))

      const upcoming = buildUpcomingNotices({
        todayIso: today,
        appointments: apptRes.data ?? [],
        ackedKeys,
      })

      const merged = [...fromDb, ...upcoming.filter((u) => !fromDb.some((d) => d.key === u.key))]
        .filter((n) => n.unread)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

      setItems(merged)

      // Local reminders for confirmed/upcoming visits (works even before remote push webhook)
      for (const apt of apptRes.data ?? []) {
        if (['cancelled', 'declined', 'completed'].includes(apt.status)) continue
        const key = `local_soon:${apt.id}`
        if (scheduledRef.current.has(key)) continue
        const [hs, ms = '0'] = String(apt.appointment_time).slice(0, 5).split(':')
        const when = new Date(`${apt.appointment_date}T12:00:00`)
        when.setHours(Number(hs), Number(ms), 0, 0)
        const remindAt = new Date(when.getTime() - 60 * 60 * 1000)
        if (remindAt.getTime() <= Date.now()) continue
        await scheduleUpcomingLocalReminder({
          id: apt.id,
          title: 'Upcoming visit',
          body: `${apt.service_name} in about 1 hour`,
          when: remindAt,
        })
        scheduledRef.current.add(key)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [user, customer?.id, customer])

  useEffect(() => {
    void reload()
    if (!user) return
    const id = setInterval(() => void reload(), 60_000)

    const channel = supabase
      .channel(`client-notices-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void reload()
        },
      )
      .subscribe()

    return () => {
      clearInterval(id)
      void supabase.removeChannel(channel)
    }
  }, [reload, user])

  useEffect(() => {
    if (!user) {
      setPushReady(false)
      return
    }
    let mounted = true
    registerForPushNotificationsAsync(user.id)
      .then((token) => {
        if (mounted) setPushReady(Boolean(token))
      })
      .catch(() => {
        if (mounted) setPushReady(false)
      })
    return () => {
      mounted = false
    }
  }, [user])

  useEffect(() => {
    if (Platform.OS === 'web') return

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const href = response.notification.request.content.data?.href
      if (typeof href === 'string' && href.includes('rewards')) {
        router.push('/(tabs)/rewards')
      } else if (typeof href === 'string' && href) {
        router.push('/(tabs)/appointments')
      } else {
        router.push('/notifications')
      }
    })
    return () => sub.remove()
  }, [router])

  const persistDerivedAcks = useCallback(
    async (keys: string[]) => {
      if (!user || !keys.length) return true
      const { data: existing } = await supabase
        .from('notification_acks')
        .select('notice_key')
        .eq('user_id', user.id)
        .in('notice_key', keys)
      const have = new Set((existing ?? []).map((r) => r.notice_key as string))
      const missing = keys.filter((k) => !have.has(k))
      if (!missing.length) return true
      const { error: insertErr } = await supabase.from('notification_acks').insert(
        missing.map((notice_key) => ({
          user_id: user.id,
          notice_key,
          acked_at: new Date().toISOString(),
        })),
      )
      return !insertErr
    },
    [user],
  )

  const acknowledge = useCallback(
    async (keys: string[]) => {
      if (!user || !keys.length) return false
      const unique = [...new Set(keys)]
      const dbKeys = items.filter((i) => unique.includes(i.key) && i.source === 'db').map((i) => i.key)
      const derivedKeys = items
        .filter((i) => unique.includes(i.key) && i.source === 'derived')
        .map((i) => i.key)

      if (dbKeys.length) {
        const { error: updErr } = await supabase
          .from('client_notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .in('notice_key', dbKeys)
        if (updErr && !updErr.message.includes('does not exist')) {
          setError(updErr.message)
          return false
        }
      }

      if (derivedKeys.length) {
        const ok = await persistDerivedAcks(derivedKeys)
        if (!ok) return false
      }

      setItems((prev) => prev.filter((n) => !unique.includes(n.key)))
      return true
    },
    [user, items, persistDerivedAcks],
  )

  const clearAll = useCallback(async () => {
    if (!items.length) return
    await acknowledge(items.map((i) => i.key))
  }, [items, acknowledge])

  const value = useMemo<Ctx>(
    () => ({
      items,
      loading,
      error,
      unreadCount: items.length,
      reload,
      acknowledge,
      clearAll,
      pushReady,
    }),
    [items, loading, error, reload, acknowledge, clearAll, pushReady],
  )

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  )
}

export function useClientNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    return {
      items: [],
      loading: false,
      error: '',
      unreadCount: 0,
      reload: async () => undefined,
      acknowledge: async () => false,
      clearAll: async () => undefined,
      pushReady: false,
    } satisfies Ctx
  }
  return ctx
}
