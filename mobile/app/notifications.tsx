import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Screen } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { useClientNotifications } from '@/hooks/useClientNotifications'
import { KIND_LABEL } from '@/lib/clientNotifications'
import { safeBack } from '@/lib/navigation'
import { colors, spacing, typography } from '@/constants/theme'

export default function NotificationsScreen() {
  const router = useRouter()
  const { items, loading, error, clearAll, acknowledge, pushReady, reload } =
    useClientNotifications()

  return (
    <Screen scroll showHeader={false}>
      <ScreenHeader
        eyebrow="Inbox"
        title="Notifications"
        subtitle="Approvals, declines, wallet top-ups, and upcoming visits."
      />

      <View style={styles.toolbar}>
        <Text style={styles.pushHint}>
          {pushReady ? 'Push alerts enabled on this device' : 'Enable alerts when prompted for visit updates'}
        </Text>
        <Button title="Refresh" variant="ghost" onPress={() => void reload()} />
      </View>

      {loading && !items.length ? <Text style={styles.muted}>Checking updates…</Text> : null}
      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      {!loading && !items.length ? (
        <Card>
          <Text style={styles.muted}>You’re all caught up.</Text>
        </Card>
      ) : null}

      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => {
            void acknowledge([item.key])
            if (item.kind === 'wallet_topup' || item.href.includes('rewards')) {
              router.push('/(tabs)/rewards')
            } else {
              router.push('/(tabs)/appointments')
            }
          }}
        >
          <Card style={styles.item}>
            <View style={styles.itemTop}>
              <Text style={styles.kind}>{KIND_LABEL[item.kind] || item.kind}</Text>
              <View style={styles.dot} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </Card>
        </Pressable>
      ))}

      {items.length ? (
        <View style={styles.actions}>
          <Button title="Clear all" variant="ghost" onPress={() => void clearAll()} />
          <Button title="Close" variant="ghost" onPress={() => safeBack(router)} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Button title="Close" variant="ghost" onPress={() => safeBack(router)} />
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  toolbar: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  pushHint: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.muted,
  },
  muted: {
    fontFamily: typography.body,
    color: colors.muted,
    fontSize: 14,
  },
  errorCard: {
    marginBottom: spacing.sm,
    borderColor: colors.danger,
  },
  errorText: {
    fontFamily: typography.body,
    color: colors.danger,
  },
  item: {
    marginBottom: spacing.sm,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kind: {
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gold,
  },
  title: {
    fontFamily: typography.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  body: {
    marginTop: 4,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.body,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
})
