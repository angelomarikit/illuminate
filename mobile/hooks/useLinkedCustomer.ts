import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export type LinkedCustomer = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  membership: string
  membership_expires_at: string | null
  points: number
  cash_in_balance: number
  visits: number
}

const SELECT =
  'id, full_name, email, phone, membership, membership_expires_at, points, cash_in_balance, visits'

export function useLinkedCustomer() {
  const { user } = useAuth()
  const [customer, setCustomer] = useState<LinkedCustomer | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) {
      setCustomer(null)
      setLoading(false)
      return null
    }

    setLoading(true)

    const byUser = await supabase.from('customers').select(SELECT).eq('user_id', user.id).maybeSingle()
    if (byUser.data) {
      const row = byUser.data as LinkedCustomer
      setCustomer(row)
      setLoading(false)
      return row
    }

    if (user.email) {
      const byEmail = await supabase
        .from('customers')
        .select(SELECT)
        .ilike('email', user.email)
        .maybeSingle()
      const row = (byEmail.data as LinkedCustomer) ?? null
      setCustomer(row)
      setLoading(false)
      return row
    }

    setCustomer(null)
    setLoading(false)
    return null
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { customer, loading, refresh }
}
