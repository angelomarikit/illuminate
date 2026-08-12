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
  reloadBranches: () => Promise<void>
}

const BranchContext = createContext<BranchContextValue | null>(null)

const BRANCH_STORAGE_KEY = 'illuminate.activeBranchId'

function readSavedBranchId() {
  try {
    return localStorage.getItem(BRANCH_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function writeSavedBranchId(id: string) {
  try {
    if (id) localStorage.setItem(BRANCH_STORAGE_KEY, id)
    else localStorage.removeItem(BRANCH_STORAGE_KEY)
  } catch {
    // ignore storage failures
  }
}

function mapBranches(
  rows: Array<{
    id: string
    name: string
    address?: string | null
    status?: string | null
    is_open?: boolean | null
  }>,
): Branch[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address ?? '',
    status: (row.status as Branch['status']) || 'active',
    // Missing is_open column / null => treat as open
    isOpen: row.is_open !== false,
  }))
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Branch[]>([])
  const [branchId, setBranchIdState] = useState(() => readSavedBranchId())
  const [loading, setLoading] = useState(true)
  const [storeToggleSaving, setStoreToggleSaving] = useState(false)

  const setBranchId = useCallback((id: string) => {
    setBranchIdState(id)
    writeSavedBranchId(id)
  }, [])

  const load = useCallback(async () => {
    // Prefer explicit columns; fall back if is_open was never migrated
    let rows:
      | Array<{
          id: string
          name: string
          address?: string | null
          status?: string | null
          is_open?: boolean | null
        }>
      | null = null

    const withOpen = await supabase
      .from('branches')
      .select('id, name, address, status, is_open')
      .order('name')

    if (!withOpen.error) {
      rows = withOpen.data
    } else {
      const basic = await supabase
        .from('branches')
        .select('id, name, address, status')
        .order('name')
      if (basic.error) {
        setList([])
        setLoading(false)
        return
      }
      rows = basic.data
    }

    if (rows && rows.length > 0) {
      const next = mapBranches(rows)
      setList(next)
      setBranchIdState((current) => {
        const preferred = current || readSavedBranchId()
        const chosen =
          preferred && next.some((b) => b.id === preferred && b.status !== 'coming-soon')
            ? preferred
            : (next.find((b) => b.status === 'active')?.id ?? next[0].id)
        writeSavedBranchId(chosen)
        return chosen
      })
    } else {
      setList([])
      setBranchIdState('')
      writeSavedBranchId('')
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const reloadBranches = useCallback(async () => {
    await load()
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
        throw new Error(
          error.message.includes('is_open')
            ? `${error.message} — run supabase/add_store_open.sql in Supabase.`
            : error.message,
        )
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
      reloadBranches,
    }
  }, [
    branchId,
    list,
    loading,
    setBranchId,
    setStoreOpen,
    storeToggleSaving,
    reloadBranches,
  ])

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

export function useBranch() {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranch must be used within BranchProvider')
  return ctx
}
