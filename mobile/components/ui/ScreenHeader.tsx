import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '../../constants/theme'

type Props = {
  eyebrow?: string
  title: string
  subtitle?: string
}

export function ScreenHeader({ eyebrow, title, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.gold,
    marginBottom: 8,
  },
  title: {
    fontFamily: typography.display,
    fontSize: 34,
    lineHeight: 40,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 10,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.body,
    maxWidth: 320,
  },
})
