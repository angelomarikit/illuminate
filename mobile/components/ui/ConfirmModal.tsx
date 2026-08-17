import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { colors, radius, spacing, typography } from '@/constants/theme'

type Props = {
  visible: boolean
  eyebrow?: string
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  confirming?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  visible,
  eyebrow = 'Illuminate',
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirming = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={confirming ? undefined : onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Button
              title={confirming ? 'Please wait…' : confirmLabel}
              onPress={onConfirm}
              disabled={confirming}
            />
            <Button
              title={cancelLabel}
              variant="ghost"
              onPress={onCancel}
              disabled={confirming}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 17, 17, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    ...Platform.select({
      web: {
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.14)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 8,
      },
    }),
  },
  eyebrow: {
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.gold,
    marginBottom: 8,
  },
  title: {
    fontFamily: typography.display,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
  },
  message: {
    marginTop: spacing.sm,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.body,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
})
