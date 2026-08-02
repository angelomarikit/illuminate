export type Branch = {
  id: string
  name: string
  address: string
  status: 'active' | 'coming-soon'
}

export type ServiceCategory =
  | 'Facials'
  | 'Injectables'
  | 'Laser'
  | 'Body'
  | 'Skincare'
  | 'Packages'

export type ServiceItem = {
  id: string
  name: string
  category: ServiceCategory
  price: number
  durationMin: number
  pointsEarn: number
  pointsCost: number
  active: boolean
  description: string
}

export type InventoryItem = {
  id: string
  name: string
  sku: string
  category: string
  stock: number
  reorderLevel: number
  unit: string
  branchId: string
  expiry?: string
}

export type Customer = {
  id: string
  name: string
  phone: string
  email: string
  points: number
  cashInBalance: number
  visits: number
  lastVisit: string
  membership: 'Standard' | 'Glow' | 'Luxe'
  branchId: string
}

export type AppointmentStatus = 'confirmed' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled' | 'walk-in'

export type Appointment = {
  id: string
  customerName: string
  serviceName: string
  staffName: string
  date: string
  time: string
  durationMin: number
  status: AppointmentStatus
  branchId: string
  type: 'appointment' | 'walk-in'
}

export type SaleRecord = {
  id: string
  receiptNo: string
  customerName: string
  items: string
  total: number
  paymentMethod: 'Cash' | 'Card' | 'E-Wallet' | 'Points' | 'Mixed'
  pointsUsed: number
  date: string
  staffName: string
  branchId: string
}

export type Expense = {
  id: string
  category: string
  description: string
  amount: number
  date: string
  branchId: string
  paidBy: string
}

export type Consultation = {
  id: string
  customerName: string
  treatment: string
  date: string
  notes: string
  beforeImage: string
  afterImage: string
  aiSummary: string
  branchId: string
}

export type StaffMember = {
  id: string
  name: string
  role: string
  branchId: string
  status: 'on-duty' | 'off-duty' | 'on-leave'
  timeIn?: string
  timeOut?: string
}

export type LeaveRequest = {
  id: string
  staffName: string
  type: 'Vacation' | 'Sick' | 'Personal' | 'Emergency'
  from: string
  to: string
  status: 'pending' | 'approved' | 'rejected'
}

export type LoyaltyTxn = {
  id: string
  customerName: string
  type: 'earn' | 'redeem' | 'cash-in'
  points: number
  amount?: number
  date: string
  note: string
}
