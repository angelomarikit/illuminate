import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AuthLoading } from './AuthLoading'

export function GuestRoute() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return <AuthLoading />

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
