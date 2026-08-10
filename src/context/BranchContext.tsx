import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { branches as mockBranches } from '../data/mock'
import { supabase } from '../lib/supabase'
import { isUuid } from '../lib/utils'
import type { Branch } from '../types'

type BranchContextValue = {
  branchId: string
  setBranchId: (id: string) => void
  branchName: string
  branches: Branch[]
  loading: boolean
  isStoreOpen: boolean
  setStoreOpen: (open: boolean) => Promise<void>
  storeToggleSaving: boolean
}

const LOCAL_OPEN_KEY = 'illuminate-store-open'

const BranchContext = createContext<BranchContextValue | null>(null)

function withOpenDefaults(list: Branch[]): Branch[] {
  return list.map((branch) => ({
    ...branch,
    isOpen: branch.isOpen ?? true,
  }))
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Branch[]>(() => withOpenDefaults(mockBranches))
  const [branchId, setBranchId] = useState(mockBranches[0]?.id ?? '')
  const [loading, setLoading] = useState(true)
  const [storeToggleSaving, setStoreToggleSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, address, status, is_open')
      .order('name')

    if (!error && data && data.length > 0) {
      const next: Branch[] = data.map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address ?? '',
        status: (row.status as Branch['status']) || 'active',
        isOpen: row.is_open !== false,
      }))
      setList(next)
      setBranchId((current) => {
        if (next.some((b) => b.id === current)) return current
        return next.find((b) => b.status === 'active')?.id ?? next[0].id
      })
    } else {
      // Fallback mock branches — restore local open state if present
      try {
        const raw = localStorage.getItem(LOCAL_OPEN_KEY)
        const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
        setList(
          withOpenDefaults(mockBranches).map((b) => ({
            ...b,
            isOpen: map[b.id] ?? b.isOpen,
          })),
        )
      } catch {
        setList(withOpenDefaults(mockBranches))
      }
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setStoreOpen = useCallback(
    async (open: boolean) => {
      const currentId = branchId
      setList((prev) => prev.map((b) => (b.id === currentId ? { ...b, isOpen: open } : b)))
      setStoreToggleSaving(true)

      if (isUuid(currentId)) {
        const { error } = await supabase.from('branches').update({ is_open: open }).eq('id', currentId)
        if (error) {
          // Revert on failure
          setList((prev) => prev.map((b) => (b.id === currentId ? { ...b, isOpen: !open } : b)))
          setStoreToggleSaving(false)
          throw error
        }
      } else {
        try {
          const raw = localStorage.getItem(LOCAL_OPEN_KEY)
          const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
          map[currentId] = open
          localStorage.setItem(LOCAL_OPEN_KEY, JSON.stringify(map))
        } catch {
          // ignore local persistence errors
        }
      }

      setStoreToggleSaving(false)
    },
    [branchId],
  )

  const value = useMemo(() => {
    const branch = list.find((b) => b.id === branchId) ?? list[0]
    return {
      branchId: branch?.id ?? '',
      setBranchId,
      branchName: branch?.name ?? 'Clinic',
      branches: list,
      loading,
      isStoreOpen: branch?.isOpen ?? true,
      setStoreOpen,
      storeToggleSaving,
    }
  }, [branchId, list, loading, setStoreOpen, storeToggleSaving])

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

export function useBranch() {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranch must be used within BranchProvider')
  return ctx
}
