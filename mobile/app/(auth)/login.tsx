import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Button } from '@/components/ui/Button'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { Field } from '@/components/ui/Field'
import { Screen } from '@/components/ui/Screen'
import { useAuth } from '@/context/AuthContext'
import { isClientRole } from '@/lib/roles'
import { supabase } from '@/lib/supabase'
import { colors, spacing, typography } from '@/constants/theme'

export default function LoginScreen() {
  const { signIn, signOut } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit() {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and password.')
      return
    }
    setBusy(true)
    const result = await signIn(email, password)
    if (result.ok === false) {
      setBusy(false)
      Alert.alert('Sign in failed', result.error)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .maybeSingle()

    if (!isClientRole(profile?.role)) {
      await signOut()
      setBusy(false)
      Alert.alert(
        'Client app only',
        'This mobile app is for Client accounts. Clinic staff should use the web dashboard.',
      )
      return
    }

    setBusy(false)
    router.replace('/(tabs)')
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
      >
        <BrandLogo height={48} width={180} />
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.sub}>
          Sign in to your Client portal — appointments, wallet, loyalty, and doctor notes.
        </Text>

        <View style={styles.form}>
          <Field
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
          />
          <Field
            label="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
          />
          <Button title={busy ? 'Signing in…' : 'Continue'} onPress={onSubmit} disabled={busy} />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>New here?</Text>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text style={styles.switchLink}>Create account</Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingTop: spacing.xxl,
  },
  title: {
    marginTop: spacing.md,
    fontFamily: typography.display,
    fontSize: 40,
    lineHeight: 46,
    color: colors.ink,
  },
  sub: {
    marginTop: spacing.sm,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.body,
    maxWidth: 320,
  },
  form: {
    marginTop: spacing.xxl,
  },
  switchRow: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  switchText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.muted,
  },
  switchLink: {
    fontFamily: typography.bodyBold,
    fontSize: 14,
    color: colors.gold,
  },
})
