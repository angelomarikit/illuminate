import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppHeader } from '@/components/ui/AppHeader'
import { colors, spacing } from '@/constants/theme'

type Props = ViewProps & {
  scroll?: boolean
  showHeader?: boolean
  headerTitle?: string
  children: React.ReactNode
}

export function Screen({
  children,
  scroll,
  showHeader = false,
  headerTitle,
  style,
  ...rest
}: Props) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, style]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      {...rest}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, style]} {...rest}>
      {children}
    </View>
  )

  return (
    <SafeAreaView style={styles.safe} edges={showHeader ? ['bottom'] : ['top', 'bottom']}>
      {showHeader ? <AppHeader title={headerTitle} /> : null}
      {body}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
})
