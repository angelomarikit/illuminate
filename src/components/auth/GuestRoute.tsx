import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AuthLoading } from './AuthLoading'
import { homePathForRole } from '../../lib/roles'

export function GuestRoute() {
  const { user, isAuthenticated, loading } = useAuth()

  if (loading) return <AuthLoading />

  if (isAuthenticated) {
    return <Navigate to={homePathForRole(user?.role)} replace />
  }

  return <Outlet />
}
