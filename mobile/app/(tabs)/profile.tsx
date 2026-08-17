import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Screen } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { useAuth } from '@/context/AuthContext'
import { useLinkedCustomer } from '@/hooks/useLinkedCustomer'
import { colors, spacing, typography } from '@/constants/theme'

export default function ProfileScreen() {
  const { user, signOut } = useAuth()
  const { customer, loading } = useLinkedCustomer()
  const router = useRouter()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  async function onLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await signOut()
      setLogoutOpen(false)
      router.replace('/(auth)/login')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <Screen scroll showHeader>
      <ScreenHeader
        eyebrow="Profile"
        title="My account"
        subtitle="Details linked to your Illuminate Client portal."
      />

      <Card style={styles.card}>
        {loading ? <Text style={styles.muted}>Loading…</Text> : null}
        <Row label="Name" value={user?.name || '—'} />
        <Row label="Email" value={user?.email || '—'} />
        <Row label="Phone" value={customer?.phone || '—'} />
        <Row label="Membership" value={customer?.membership || 'Regular'} />
        <Row
          label="Points / wallet"
          value={`${customer?.points ?? 0} pts · ₱${Number(customer?.cash_in_balance ?? 0).toLocaleString()}`}
        />
      </Card>

      <View style={styles.actions}>
        <Button title="Doctor notes" variant="ghost" onPress={() => router.push('/notes')} />
        <Button title="Contact support" variant="ghost" onPress={() => router.push('/support')} />
        <Button title="Log out" onPress={() => setLogoutOpen(true)} />
      </View>

      <ConfirmModal
        visible={logoutOpen}
        eyebrow="Account"
        title="Sign out?"
        message="You’ll need your email and password to access your Illuminate care portal again."
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        confirming={loggingOut}
        onConfirm={() => void onLogout()}
        onCancel={() => {
          if (!loggingOut) setLogoutOpen(false)
        }}
      />
    </Screen>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  row: {
    gap: 4,
  },
  label: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  value: {
    fontFamily: typography.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  muted: {
    fontFamily: typography.body,
    color: colors.muted,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
})
