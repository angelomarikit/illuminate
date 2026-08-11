import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export type LinkedCustomer = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  membership: string
  points: number
  cash_in_balance: number
  visits: number
  last_visit: string | null
}

export function useLinkedCustomer() {
  const { user } = useAuth()
  const [customer, setCustomer] = useState<LinkedCustomer | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      if (!user) {
        if (mounted) {
          setCustomer(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      const byUser = await supabase
        .from('customers')
        .select(
          'id, full_name, email, phone, membership, points, cash_in_balance, visits, last_visit',
        )
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mounted) return

      if (byUser.data) {
        setCustomer(byUser.data as LinkedCustomer)
        setLoading(false)
        return
      }

      if (user.email) {
        const byEmail = await supabase
          .from('customers')
          .select(
            'id, full_name, email, phone, membership, points, cash_in_balance, visits, last_visit',
          )
          .ilike('email', user.email)
          .maybeSingle()

        if (!mounted) return
        setCustomer((byEmail.data as LinkedCustomer | null) ?? null)
      } else {
        setCustomer(null)
      }

      setLoading(false)
    }

    load()
    return () => {
      mounted = false
    }
  }, [user])

  return { customer, loading }
}
