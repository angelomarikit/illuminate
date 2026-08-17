import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type SupportedStorage } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!url || !anonKey) {
  console.warn(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy mobile/.env.example to mobile/.env',
  )
}

/**
 * Expo Router static/web SSR runs in Node (no `window`).
 * AsyncStorage's web impl crashes there — use a no-op store on the server.
 */
const authStorage: SupportedStorage = {
  getItem(key) {
    if (typeof window === 'undefined') return Promise.resolve(null)
    return AsyncStorage.getItem(key)
  },
  setItem(key, value) {
    if (typeof window === 'undefined') return Promise.resolve()
    return AsyncStorage.setItem(key, value)
  },
  removeItem(key) {
    if (typeof window === 'undefined') return Promise.resolve()
    return AsyncStorage.removeItem(key)
  },
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    storage: authStorage,
    autoRefreshToken: typeof window !== 'undefined',
    persistSession: typeof window !== 'undefined',
    detectSessionInUrl: false,
  },
})
