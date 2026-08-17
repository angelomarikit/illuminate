import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Link, useFocusEffect, useRouter } from 'expo-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Screen } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { useAuth } from '@/context/AuthContext'
import { useLinkedCustomer } from '@/hooks/useLinkedCustomer'
import { formatApptDate, toLocalDateKey } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import { colors, radius, spacing, typography } from '@/constants/theme'

type Appt = {
  id: string
  service_name: string
  appointment_date: string
  appointment_time: string
  status: string
}

export default function CareHome() {
  const { user } = useAuth()
  const { customer, loading, refresh } = useLinkedCustomer()
  const router = useRouter()
  const [upcoming, setUpcoming] = useState<Appt[]>([])
  const first = user?.name?.split(' ')[0] || 'there'

  const loadUpcoming = useCallback(async () => {
    const linked = await refresh()
    if (!linked?.id && !user?.name && !user?.email) {
      setUpcoming([])
      return
    }
    const today = toLocalDateKey(new Date())
    let q = supabase
      .from('appointments')
      .select('id, service_name, appointment_date, appointment_time, status')
      .gte('appointment_date', today)
      .order('appointment_date', { ascending: true })
      .limit(5)
    if (linked?.id) q = q.eq('customer_id', linked.id)
    else if (user?.email) q = q.ilike('customer_email', user.email)
    else q = q.ilike('customer_name', user?.name || '')
    const { data } = await q
    setUpcoming((data as Appt[]) ?? [])
  }, [user, refresh])

  useFocusEffect(
    useCallback(() => {
      void loadUpcoming()
    }, [loadUpcoming]),
  )

  return (
    <Screen scroll showHeader>
      <ScreenHeader
        eyebrow="My Illuminate"
        title={`Welcome, ${first}`}
        subtitle="Your care space — book visits, track rewards, and review doctor notes."
      />

      {!loading && !customer ? (
        <Card style={styles.alert}>
          <Text style={styles.alertTitle}>Profile linking</Text>
          <Text style={styles.muted}>
            Book a visit once to link your CRM profile. Points, wallet, and notes appear after the
            clinic has your client record.
          </Text>
        </Card>
      ) : null}

      <View style={styles.stats}>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>Points</Text>
          <Text style={styles.statValue}>{customer?.points ?? 0}</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>Wallet</Text>
          <Text style={styles.statValue}>
            ₱{Number(customer?.cash_in_balance ?? 0).toLocaleString()}
          </Text>
        </Card>
      </View>

      <Card style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Ready when you are</Text>
        <Text style={styles.heroTitle}>Book your next visit</Text>
        <Text style={styles.heroBody}>
          Choose a date and service. Reception will confirm — same as the website portal.
        </Text>
        <Button title="Book a visit" variant="gold" onPress={() => router.push('/(tabs)/book')} />
      </Card>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Upcoming</Text>
        <Link href="/(tabs)/appointments" asChild>
          <Pressable>
            <Text style={styles.link}>View all</Text>
          </Pressable>
        </Link>
      </View>

      {loading ? <Text style={styles.muted}>Loading your profile…</Text> : null}

      {!upcoming.length ? (
        <Card>
          <Text style={styles.muted}>No upcoming appointments yet.</Text>
        </Card>
      ) : (
        upcoming.map((row) => (
          <Card key={row.id} style={styles.appt}>
            <View style={styles.apptTop}>
              <Text style={styles.apptTitle}>{row.service_name}</Text>
              <Text style={styles.badge}>{row.status}</Text>
            </View>
            <Text style={styles.muted}>
              {formatApptDate(row.appointment_date)} · {String(row.appointment_time).slice(0, 5)}
            </Text>
          </Card>
        ))
      )}

      <View style={styles.quickRow}>
        <Pressable style={styles.quick} onPress={() => router.push('/notes')}>
          <Text style={styles.quickTitle}>Doctor notes</Text>
          <Text style={styles.muted}>Care advice</Text>
        </Pressable>
        <Pressable style={styles.quick} onPress={() => router.push('/support')}>
          <Text style={styles.quickTitle}>Support</Text>
          <Text style={styles.muted}>Message us</Text>
        </Pressable>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  alert: {
    marginBottom: spacing.md,
    backgroundColor: colors.goldMist,
    borderColor: colors.goldLine,
  },
  alertTitle: {
    fontFamily: typography.bodyBold,
    color: colors.ink,
    marginBottom: 4,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    paddingVertical: spacing.md,
  },
  statLabel: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  statValue: {
    marginTop: 8,
    fontFamily: typography.display,
    fontSize: 28,
    color: colors.ink,
  },
  heroCard: {
    backgroundColor: colors.goldMist,
    borderColor: colors.goldLine,
    marginBottom: spacing.lg,
    gap: 10,
  },
  heroEyebrow: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  heroTitle: {
    fontFamily: typography.display,
    fontSize: 28,
    color: colors.ink,
  },
  heroBody: {
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.body,
    marginBottom: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: typography.bodyBold,
    fontSize: 18,
    color: colors.ink,
  },
  link: {
    fontFamily: typography.bodyMedium,
    color: colors.gold,
  },
  muted: {
    fontFamily: typography.body,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  appt: {
    marginBottom: spacing.sm,
  },
  apptTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  apptTitle: {
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
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  quick: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 4,
  },
  quickTitle: {
    fontFamily: typography.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
})
