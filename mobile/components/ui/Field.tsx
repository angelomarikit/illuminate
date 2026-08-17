import { StyleSheet, TextInput, View, Text, type TextInputProps } from 'react-native'
import { colors, radius, spacing, typography } from '../../constants/theme'

type Props = TextInputProps & {
  label: string
}

export function Field({ label, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginBottom: spacing.md,
  },
  label: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvasDeep,
    paddingHorizontal: 14,
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.ink,
  },
})
