import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native'
import { colors, radius, typography } from '@/constants/theme'

type Props = PressableProps & {
  title: string
  variant?: 'primary' | 'ghost' | 'gold'
}

export function Button({ title, variant = 'primary', style, disabled, ...rest }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'gold' && styles.gold,
        pressed && styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? null : style,
      ]}
      {...rest}
    >
      <Text
        style={[
          styles.label,
          variant === 'ghost' && styles.labelGhost,
          (variant === 'primary' || variant === 'gold') && styles.labelOnGold,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.gold,
  },
  gold: {
    backgroundColor: colors.gold,
  },
  ghost: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.goldLine,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontFamily: typography.bodyBold,
    fontSize: 15,
    color: colors.white,
    letterSpacing: 0.2,
  },
  labelGhost: {
    color: colors.gold,
  },
  labelOnGold: {
    color: colors.white,
  },
})
