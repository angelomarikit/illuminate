import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { normalizeRole, type AppRole } from '../lib/roles'
import { supabase } from '../lib/supabase'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: AppRole
}

type AuthContextValue = {
  user: AuthUser | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  signUp: (input: {
    name: string
    email: string
    password: string
    phone?: string
  }) => Promise<{ ok: true } | { ok: false; error: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function loadAuthUser(session: Session): Promise<AuthUser> {
  const authUser = session.user
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, email')
    .eq('id', authUser.id)
    .maybeSingle()

  return {
    id: authUser.id,
    email: profile?.email || authUser.email || '',
    name:
      profile?.full_name ||
      (authUser.user_metadata?.full_name as string | undefined) ||
      authUser.email?.split('@')[0] ||
      'Client',
    role: normalizeRole(
      profile?.role || (authUser.user_metadata?.role as string | undefined) || 'Client',
    ),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const sync = useCallback(async (next: Session | null) => {
    setSession(next)
    if (!next?.user) {
      setUser(null)
      return
    }
    setUser(await loadAuthUser(next))
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      sync(data.session).finally(() => {
        if (mounted) setLoading(false)
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      sync(nextSession)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [sync])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        })
        if (error) return { ok: false as const, error: error.message }
        return { ok: true as const }
      },
      async signUp({ name, email, password, phone }) {
        if (password.length < 8) {
          return { ok: false as const, error: 'Password must be at least 8 characters.' }
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: name.trim(),
              role: 'Client',
              phone: phone?.trim() || null,
            },
          },
        })
        if (error) return { ok: false as const, error: error.message }
        if (!data.session || !data.user) {
          return {
            ok: false as const,
            error:
              'Account created. Confirm your email if required, then sign in. (Or disable email confirm in Supabase Auth for testing.)',
          }
        }
        return { ok: true as const }
      },
      async signOut() {
        // Clear UI state first so AuthGate does not bounce back to tabs
        setUser(null)
        setSession(null)
        // Local scope always clears device session even if network is slow/offline
        const { error } = await supabase.auth.signOut({ scope: 'local' })
        if (error) {
          // Best-effort global revoke; local state is already cleared
          await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined)
        }
      },
    }),
    [user, session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
