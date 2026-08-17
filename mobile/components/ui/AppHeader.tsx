import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { useClientNotifications } from '@/context/NotificationsContext'
import { colors, spacing, typography } from '@/constants/theme'

type Props = {
  title?: string
}

export function AppHeader({ title }: Props) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { unreadCount } = useClientNotifications()

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.row}>
        <View style={styles.brandWrap}>
          <BrandLogo height={34} width={132} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            unreadCount ? `${unreadCount} unread notifications` : 'Notifications'
          }
          onPress={() => router.push('/notifications')}
          style={({ pressed }) => [styles.bellBtn, pressed && styles.pressed]}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.ink} />
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandWrap: {
    flex: 1,
    paddingRight: spacing.sm,
    justifyContent: 'center',
  },
  title: {
    marginTop: 4,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvasDeep,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: {
    opacity: 0.85,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: typography.bodyBold,
    fontSize: 10,
    color: colors.white,
  },
})
