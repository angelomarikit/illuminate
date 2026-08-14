import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { ClientBookingProvider } from '../../context/ClientBookingContext'
import { useAuth } from '../../context/AuthContext'
import { isClientRole } from '../../lib/roles'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  const clientPortal = isClientRole(user?.role)

  const shell = (
    <div className={`app-shell${clientPortal ? ' is-client-portal' : ''}`}>
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      {sidebarOpen ? (
        <button
          className="mobile-overlay"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <div className="main-area">
        <Topbar onMenu={() => setSidebarOpen(true)} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )

  if (clientPortal) {
    return <ClientBookingProvider>{shell}</ClientBookingProvider>
  }

  return shell
}
