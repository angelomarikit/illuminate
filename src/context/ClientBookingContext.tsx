import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ClientBookingModal } from '../components/portal/ClientBookingModal'

type ClientBookingContextValue = {
  openBooking: () => void
  closeBooking: () => void
  bookingVersion: number
}

const ClientBookingContext = createContext<ClientBookingContextValue | null>(null)

export function ClientBookingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [bookingVersion, setBookingVersion] = useState(0)

  const openBooking = useCallback(() => setOpen(true), [])
  const closeBooking = useCallback(() => setOpen(false), [])

  const value = useMemo(
    () => ({ openBooking, closeBooking, bookingVersion }),
    [openBooking, closeBooking, bookingVersion],
  )

  return (
    <ClientBookingContext.Provider value={value}>
      {children}
      <ClientBookingModal
        open={open}
        onClose={closeBooking}
        onBooked={() => setBookingVersion((v) => v + 1)}
      />
    </ClientBookingContext.Provider>
  )
}

export function useClientBooking() {
  const ctx = useContext(ClientBookingContext)
  if (!ctx) {
    throw new Error('useClientBooking must be used within ClientBookingProvider')
  }
  return ctx
}
