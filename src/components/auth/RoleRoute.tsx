import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AuthLoading } from './AuthLoading'
import { canAccessPath, homePathForRole } from '../../lib/roles'

export function RoleRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <AuthLoading />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  if (!canAccessPath(user.role, location.pathname)) {
    return <Navigate to={homePathForRole(user.role)} replace />
  }

  return <Outlet />
}
