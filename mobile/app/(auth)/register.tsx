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

/**
 * Registration pattern: clean white care-app signup
 * (Hers-style: brand wordmark, large title, stacked fields, primary CTA, sign-in link)
 * Mobbin paid search unavailable — layout mirrors that wellness signup pattern.
 */
export default function RegisterScreen() {
  const { signUp, signOut } = useAuth()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit() {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your name, email, and password.')
      return
    }
    if (password !== confirm) {
      Alert.alert('Passwords do not match', 'Re-enter the same password in both fields.')
      return
    }
    setBusy(true)
    const result = await signUp({ name, email, password, phone })
    if (result.ok === false) {
      setBusy(false)
      Alert.alert('Could not register', result.error)
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
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.sub}>
          Join Illuminate to book visits, track points and wallet, and read doctor notes from your
          care team.
        </Text>

        <View style={styles.form}>
          <Field
            label="Full name"
            autoComplete="name"
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
          />
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
            label="Phone"
            keyboardType="phone-pad"
            autoComplete="tel"
            value={phone}
            onChangeText={setPhone}
            placeholder="09xxxxxxxxx"
          />
          <Field
            label="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
          />
          <Field
            label="Confirm password"
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter password"
          />
          <Button title={busy ? 'Creating…' : 'Create account'} onPress={onSubmit} disabled={busy} />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text style={styles.switchLink}>Sign in</Text>
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
    paddingTop: spacing.xl,
  },
  title: {
    marginTop: spacing.md,
    fontFamily: typography.display,
    fontSize: 36,
    lineHeight: 42,
    color: colors.ink,
  },
  sub: {
    marginTop: spacing.sm,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.body,
    maxWidth: 340,
  },
  form: {
    marginTop: spacing.xl,
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
