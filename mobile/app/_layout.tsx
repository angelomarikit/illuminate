import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans'
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display'
import { useFonts } from 'expo-font'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { NotificationsProvider } from '@/context/NotificationsContext'
import { isClientRole } from '@/lib/roles'
import { colors } from '@/constants/theme'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync()

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    const inAuth = segments[0] === '(auth)'

    if (!user && !inAuth) {
      router.replace('/(auth)/login')
      return
    }

    if (user && inAuth) {
      if (!isClientRole(user.role)) {
        // Clinic staff should use the web app
        router.replace('/(auth)/login')
        return
      }
      router.replace('/(tabs)')
    }
  }, [user, loading, segments, router])

  return <>{children}</>
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    DMSerifDisplay_400Regular,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  })

  useEffect(() => {
    if (error) throw error
  }, [error])

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync()
  }, [loaded])

  if (!loaded) return null

  return (
    <AuthProvider>
      <NotificationsProvider>
        <StatusBar style="dark" />
        <AuthGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.canvas },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="(auth)/login" />
            <Stack.Screen name="(auth)/register" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="notifications"
              options={{ presentation: 'modal', headerShown: false }}
            />
            <Stack.Screen
              name="support"
              options={{ presentation: 'modal', headerShown: false }}
            />
            <Stack.Screen
              name="notes"
              options={{ presentation: 'modal', headerShown: false }}
            />
          </Stack>
        </AuthGate>
      </NotificationsProvider>
    </AuthProvider>
  )
}
