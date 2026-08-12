import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { normalizeMembership } from '../lib/membership'
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
  last_visit: string | null
}

function mapLinked(row: LinkedCustomer): LinkedCustomer {
  return {
    ...row,
    membership: normalizeMembership(row.membership),
    membership_expires_at: row.membership_expires_at ?? null,
  }
}

const CUSTOMER_SELECT =
  'id, full_name, email, phone, membership, membership_expires_at, points, cash_in_balance, visits, last_visit'

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
        .select(CUSTOMER_SELECT)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mounted) return

      if (byUser.data) {
        setCustomer(mapLinked(byUser.data as LinkedCustomer))
        setLoading(false)
        return
      }

      if (user.email) {
        const byEmail = await supabase
          .from('customers')
          .select(CUSTOMER_SELECT)
          .ilike('email', user.email)
          .maybeSingle()

        if (!mounted) return
        setCustomer(byEmail.data ? mapLinked(byEmail.data as LinkedCustomer) : null)
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
