import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: string
  branchId?: string | null
}

type RegisterInput = {
  name: string
  email: string
  password: string
}

type AuthContextValue = {
  user: AuthUser | null
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  register: (input: RegisterInput) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function loadAuthUser(authUser: User): Promise<AuthUser> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, branch_id')
    .eq('id', authUser.id)
    .maybeSingle()

  return {
    id: authUser.id,
    email: authUser.email ?? '',
    name:
      profile?.full_name ||
      (authUser.user_metadata?.full_name as string | undefined) ||
      authUser.email?.split('@')[0] ||
      'Staff',
    role: profile?.role || (authUser.user_metadata?.role as string | undefined) || 'Staff',
    branchId: profile?.branch_id ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const syncSession = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setUser(null)
      return
    }
    const next = await loadAuthUser(session.user)
    setUser(next)
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      syncSession(data.session).finally(() => {
        if (mounted) setLoading(false)
      })
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(session)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [syncSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      loading,
      async login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) {
          return { ok: false, error: error.message }
        }
        if (data.user) {
          const next = await loadAuthUser(data.user)
          setUser(next)
        }
        return { ok: true }
      },
      async register({ name, email, password }) {
        if (password.length < 8) {
          return { ok: false, error: 'Password must be at least 8 characters.' }
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: name.trim(),
              role: 'Staff',
            },
          },
        })

        if (error) {
          return { ok: false, error: error.message }
        }

        // If email confirmation is required, session may be null.
        if (!data.session) {
          return {
            ok: false,
            error:
              'Account created. Check your email to confirm, then sign in. (Or disable email confirm in Supabase Auth settings for local testing.)',
          }
        }

        if (data.user) {
          const next = await loadAuthUser(data.user)
          setUser(next)
        }
        return { ok: true }
      },
      async logout() {
        await supabase.auth.signOut()
        setUser(null)
      },
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
