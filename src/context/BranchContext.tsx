import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { branches as mockBranches } from '../data/mock'
import { supabase } from '../lib/supabase'
import type { Branch } from '../types'

type BranchContextValue = {
  branchId: string
  setBranchId: (id: string) => void
  branchName: string
  branches: Branch[]
  loading: boolean
}

const BranchContext = createContext<BranchContextValue | null>(null)

export function BranchProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Branch[]>(mockBranches)
  const [branchId, setBranchId] = useState(mockBranches[0]?.id ?? '')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, address, status')
        .order('name')

      if (!mounted) return

      if (!error && data && data.length > 0) {
        const next: Branch[] = data.map((row) => ({
          id: row.id,
          name: row.name,
          address: row.address ?? '',
          status: (row.status as Branch['status']) || 'active',
        }))
        setList(next)
        setBranchId((current) => {
          if (next.some((b) => b.id === current)) return current
          return next.find((b) => b.status === 'active')?.id ?? next[0].id
        })
      }

      setLoading(false)
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  const value = useMemo(() => {
    const branch = list.find((b) => b.id === branchId) ?? list[0]
    return {
      branchId: branch?.id ?? '',
      setBranchId,
      branchName: branch?.name ?? 'Clinic',
      branches: list,
      loading,
    }
  }, [branchId, list, loading])

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

export function useBranch() {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranch must be used within BranchProvider')
  return ctx
}
