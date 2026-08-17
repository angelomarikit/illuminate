import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Card } from '@/components/ui/Card'
import { Screen } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { useAuth } from '@/context/AuthContext'
import { useLinkedCustomer } from '@/hooks/useLinkedCustomer'
import { formatApptDate } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import { colors, radius, spacing, typography } from '@/constants/theme'

type Appt = {
  id: string
  service_name: string
  appointment_date: string
  appointment_time: string
  status: string
  special_note: string | null
}

export default function AppointmentsScreen() {
  const { user } = useAuth()
  const { refresh } = useLinkedCustomer()
  const [rows, setRows] = useState<Appt[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const linked = await refresh()
    let q = supabase
      .from('appointments')
      .select('id, service_name, appointment_date, appointment_time, status, special_note')
      .order('appointment_date', { ascending: false })
      .limit(40)
    if (linked?.id) q = q.eq('customer_id', linked.id)
    else if (user?.email) q = q.ilike('customer_email', user.email)
    else q = q.ilike('customer_name', user?.name || '')
    const { data } = await q
    setRows((data as Appt[]) ?? [])
    setLoading(false)
  }, [user?.email, user?.name, refresh])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  return (
    <Screen scroll showHeader>
      <ScreenHeader
        eyebrow="Visits"
        title="My appointments"
        subtitle="Pending, confirmed, and past visits — same records as your web portal."
      />

      {loading ? <Text style={styles.muted}>Loading…</Text> : null}
      {!loading && !rows.length ? (
        <Card>
          <Text style={styles.muted}>No appointments yet. Book from the Book tab.</Text>
        </Card>
      ) : null}

      {rows.map((row) => (
        <Card key={row.id} style={styles.card}>
          <View style={styles.top}>
            <Text style={styles.title}>{row.service_name}</Text>
            <Text style={styles.badge}>{row.status}</Text>
          </View>
          <Text style={styles.muted}>
            {formatApptDate(row.appointment_date)} · {String(row.appointment_time).slice(0, 5)}
          </Text>
          {row.special_note ? <Text style={styles.note}>{row.special_note}</Text> : null}
        </Card>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    flex: 1,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    color: colors.ink,
    textTransform: 'capitalize',
  },
  badge: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    textTransform: 'capitalize',
    color: colors.gold,
    backgroundColor: colors.goldMist,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  muted: {
    fontFamily: typography.body,
    color: colors.muted,
    fontSize: 14,
  },
  note: {
    marginTop: 8,
    fontFamily: typography.body,
    color: colors.body,
    fontSize: 14,
  },
})
