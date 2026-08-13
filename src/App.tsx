import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { BranchProvider } from './context/BranchContext'
import { StaffSessionProvider } from './context/StaffSessionContext'
import { GuestRoute } from './components/auth/GuestRoute'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { RoleRoute } from './components/auth/RoleRoute'
import { AppShell } from './components/layout/AppShell'
import { Landing } from './pages/Landing'
import { Dashboard } from './pages/Dashboard'
import { POS } from './pages/POS'
import { Sales } from './pages/Sales'
import { Sessions } from './pages/Sessions'
import { Appointments } from './pages/Appointments'
import { Customers } from './pages/Customers'
import { Consultations } from './pages/Consultations'
import { Services } from './pages/Services'
import { Loyalty } from './pages/Loyalty'
import { QRCheckin } from './pages/QRCheckin'
import { Inventory } from './pages/Inventory'
import { Stocktake } from './pages/inventory/Stocktake'
import { Receiving } from './pages/inventory/Receiving'
import { Reorder } from './pages/inventory/Reorder'
import { Expenses } from './pages/Expenses'
import { Staff } from './pages/Staff'
import { CreateAccount } from './pages/CreateAccount'
import { Payroll } from './pages/Payroll'
import { Incentives } from './pages/Incentives'
import { MyWork } from './pages/MyWork'
import { Chat } from './pages/Chat'
import { Settings } from './pages/Settings'
import { MyAccount } from './pages/MyAccount'
import { FeedbackAdmin } from './pages/FeedbackAdmin'
import {
  ClientHome,
  ClientLoyalty,
  ClientServices,
  ClientSettings,
  ClientSupport,
} from './pages/portal/ClientPortal'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import './styles/layout.css'
import './styles/components.css'

export default function App() {
  return (
    <AuthProvider>
      <BranchProvider>
        <StaffSessionProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />

              <Route element={<GuestRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Route>

              <Route element={<ProtectedRoute />}>
                <Route element={<RoleRoute />}>
                  <Route element={<AppShell />}>
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="pos" element={<POS />} />
                    <Route path="sales" element={<Sales />} />
                    <Route path="sessions" element={<Sessions />} />
                    <Route path="appointments" element={<Appointments />} />
                    <Route path="customers" element={<Customers />} />
                    <Route path="consultations" element={<Consultations />} />
                    <Route path="services" element={<Services />} />
                    <Route path="loyalty" element={<Loyalty />} />
                    <Route path="qr-checkin" element={<QRCheckin />} />
                    <Route path="inventory" element={<Inventory />} />
                    <Route path="inventory/stocktake" element={<Stocktake />} />
                    <Route path="inventory/receiving" element={<Receiving />} />
                    <Route path="inventory/reorder" element={<Reorder />} />
                    <Route path="expenses" element={<Expenses />} />
                    <Route path="staff" element={<Staff />} />
                    <Route path="create-account" element={<CreateAccount />} />
                    <Route path="payroll" element={<Payroll />} />
                    <Route path="incentives" element={<Incentives />} />
                    <Route path="my-work" element={<MyWork />} />
                    <Route path="my-account" element={<MyAccount />} />
                    <Route path="chat" element={<Chat />} />
                    <Route path="feedback" element={<FeedbackAdmin />} />
                    <Route path="settings" element={<Settings />} />

                    <Route path="portal" element={<ClientHome />} />
                    <Route path="portal/services" element={<ClientServices />} />
                    <Route path="portal/loyalty" element={<ClientLoyalty />} />
                    <Route path="portal/support" element={<ClientSupport />} />
                    <Route path="portal/settings" element={<ClientSettings />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </StaffSessionProvider>
      </BranchProvider>
    </AuthProvider>
  )
}
