import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { BranchProvider } from './context/BranchContext'
import { GuestRoute } from './components/auth/GuestRoute'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AppShell } from './components/layout/AppShell'
import { Dashboard } from './pages/Dashboard'
import { POS } from './pages/POS'
import { Sales } from './pages/Sales'
import { Appointments } from './pages/Appointments'
import { Customers } from './pages/Customers'
import { Consultations } from './pages/Consultations'
import { Services } from './pages/Services'
import { Loyalty } from './pages/Loyalty'
import { QRCheckin } from './pages/QRCheckin'
import { Inventory } from './pages/Inventory'
import { Expenses } from './pages/Expenses'
import { Staff } from './pages/Staff'
import { Chat } from './pages/Chat'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import './styles/layout.css'
import './styles/components.css'

export default function App() {
  return (
    <AuthProvider>
      <BranchProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="pos" element={<POS />} />
                <Route path="sales" element={<Sales />} />
                <Route path="appointments" element={<Appointments />} />
                <Route path="customers" element={<Customers />} />
                <Route path="consultations" element={<Consultations />} />
                <Route path="services" element={<Services />} />
                <Route path="loyalty" element={<Loyalty />} />
                <Route path="qr-checkin" element={<QRCheckin />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="staff" element={<Staff />} />
                <Route path="chat" element={<Chat />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </BranchProvider>
    </AuthProvider>
  )
}
