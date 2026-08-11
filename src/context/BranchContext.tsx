import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
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

const BranchContext = createContext<BranchContextValue | null>(null)

export function BranchProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState('')
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
      setList([])
      setBranchId('')
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setStoreOpen = useCallback(
    async (open: boolean) => {
      const currentId = branchId
      if (!isUuid(currentId)) {
        throw new Error('No branch selected. Add a branch in Settings or Supabase first.')
      }

      setList((prev) => prev.map((b) => (b.id === currentId ? { ...b, isOpen: open } : b)))
      setStoreToggleSaving(true)

      const { error } = await supabase.from('branches').update({ is_open: open }).eq('id', currentId)
      if (error) {
        setList((prev) => prev.map((b) => (b.id === currentId ? { ...b, isOpen: !open } : b)))
        setStoreToggleSaving(false)
        throw error
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
