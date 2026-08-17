# Illuminate Medical Aesthetics  
## Client Application Guide & User Manual

**Version:** 1.0  
**Audience:** Clinic owners, managers, reception, and clients  
**Prepared for:** Illuminate Medical Aesthetics stakeholders  

This document explains what the Illuminate system does, who uses which part, how to sign in, and step-by-step tutorials for every major feature.

---

## 1. What is Illuminate?

Illuminate is an all-in-one clinic operations and client experience platform for **Illuminate Medical Aesthetics**. It connects:

| Channel | Who uses it | Purpose |
|---|---|---|
| **Clinic Web App** | Owner, Admin, Receptionist, HR, Inventory | Day-to-day clinic operations (POS, appointments, inventory, HR, support) |
| **Client Portal (Web)** | Clients / patients | Book visits, view packages, wallet, points, notes, support |
| **Mobile App (iOS / Android)** | Clients / patients | Same client experience on phone — care home, booking, visits, rewards, chat |

All channels share the **same live database**, so a booking made on mobile appears instantly for reception on the web, and a cash-in approved at the clinic updates the client’s wallet and notifications.

**Brand look:** clean white interface with black and gold accents.

---

## 2. Access information

> Fill in the blanks below before handing this guide to your team.

### 2.1 Live URLs

| System | URL |
|---|---|
| Clinic web app | `______________________________` |
| Client registration / login (web) | `______________________________/login` |
| Mobile app (iOS) | App Store link: `______________________________` |
| Mobile app (Android) | Play Store / APK / Expo link: `______________________________` |
| Support email | `hello@illuminatemedical.ph` (or your clinic setting) |

### 2.2 Account credentials (clinic team)

Create real staff accounts in **Create account** (Owner / Admin / HR). Record them securely here or in your password manager — **do not share Owner passwords widely**.

| Role | Name | Email | Temporary password | Notes |
|---|---|---|---|---|
| Owner | | | | Full system access |
| Admin | | | | Same elevated access as Owner |
| Receptionist | | | | Front desk / day-to-day ops |
| Receptionist | | | | |
| HR | | | | Staff, payroll, incentives |
| Inventory | | | | Stock only |

**First-time tip:** After login, go to **Account settings** and change the temporary password.

### 2.3 Demo / test client (optional)

Use a dedicated test client so staff can practice without touching real patient data.

| Field | Value |
|---|---|
| Client name | |
| Email | |
| Password | |
| Used for | Mobile + portal walkthrough |

### 2.4 How clients get accounts

Clients can:

1. **Register** on the web login/register pages (always created as **Client**), or  
2. **Book** from the landing / public booking flow (creates Client + CRM profile), or  
3. Be **added as a Customer** by reception, then linked when they register with the same email.

Clients use the **same email and password** on the **mobile app** and the **web portal**.

---

## 3. Roles at a glance

| Role | What they can do |
|---|---|
| **Owner** | Everything: dashboard, POS, clinic tools, inventory, HR, settings, chat |
| **Admin** | Same elevated access as Owner |
| **Receptionist** | POS, sales, appointments, customers, services, loyalty, QR check-in, expenses, consultations, chat (**no full inventory / HR**) |
| **HR** | Staff & attendance, create accounts, payroll, incentives |
| **Inventory** | Stock catalog, stocktake, receiving, reorder |
| **Client** | Portal + mobile only — cannot open clinic admin pages |

---

## 4. Clinic web app — feature guide

Sign in at your clinic URL with a staff email and password. The left menu shows only the pages your role can access.

### 4.1 Dashboard *(Owner / Admin)*

- View KPIs: revenue, sales activity, and performance charts  
- Use this as your morning overview of clinic health  

### 4.2 POS / Sales *(Owner / Admin / Receptionist)*

**Purpose:** Checkout services and products for a client.

**How to use:**

1. Open **POS / Sales**.  
2. Search and select the **customer**.  
3. Add services from the grid (or use **Custom service** for a one-off name + price).  
4. Optionally apply **loyalty points** or **cash-in wallet** balance.  
5. Complete payment and finish the sale.  
6. Sale appears under **Sales Proof** for receipts / export.

### 4.3 Sales Proof

- Review completed sales  
- Export CSV when needed for accounting  

### 4.4 Client Sessions

- Track package / session usage for clients  
- Update sessions used after treatments  

### 4.5 Appointments

**Purpose:** Calendar of bookings and walk-ins.

**How to use:**

1. Open **Appointments**.  
2. Review the calendar for the day / week.  
3. Approve, decline, or cancel pending requests from clients.  
4. Add walk-ins when a client arrives without a prior booking.  
5. Use color tags / cancel reasons when configured.

**Client impact:** Approving or declining a booking sends a **notification** to the client (in-app + push when enabled).

### 4.6 Customers

- Add or edit client CRM profiles (name, phone, email, membership, notes)  
- Link memberships (Regular / VIP / VVIP where configured)  
- Keep emails accurate so portal/mobile accounts can match  

### 4.7 AI Consultations

- Capture before / after documentation  
- Store consultation media and AI-assisted summaries for care planning  

### 4.8 Services

- Maintain the service menu (name, category, price, duration, points)  
- Activate / deactivate services shown in POS and booking  

### 4.9 Loyalty & Points (Cash-in)

**Purpose:** Manage loyalty points and the client **cash-in wallet**.

**How to top up a wallet (staff):**

1. Open **Loyalty & Points**.  
2. Find the customer.  
3. Record a **positive cash-in** for the amount received.  
4. The client receives a **“successful top-up”** notification with the amount.

**Tip:** Match cash-in requests from **Chat Support** (receipt photos) before topping up.

### 4.10 QR Check-in

- Generate / scan check-in flows for visits (as configured for your clinic)  

### 4.11 Inventory *(Owner / Admin / Inventory)*

| Page | Use |
|---|---|
| **Ops board** | *(Owner / Admin)* Reorder requests, receiving, stocktakes, and low stock in one place (also in the notification bell) |
| **Stock catalog** | Items, quantities, product master |
| **Stocktake** | Physical count adjustments |
| **Receiving** | Incoming stock / deliveries |
| **Reorder** | Reorder suggestions and requests |

### 4.12 Expenses

- Log clinic expenses for reporting  

### 4.13 My Work *(Receptionist)*

- Personal duty / attendance shortcuts for front-desk users  

### 4.14 Chat Support *(Owner / Admin / Receptionist)*

**Purpose:** Central inbox for client messages and cash-in requests (including mobile).

**How to use:**

1. Open **Chat Support**.  
2. Use filters: **All / Cash-in / Support / Message**.  
3. Select a conversation.  
4. Set **Type** (Support, Cash-in, Message) and **Priority** (Low → Urgent) with the pill controls.  
5. For cash-in messages with receipts:  
   - Review the image  
   - Mark **Received** or **Not received**  
   - Process wallet top-up in **Loyalty** when money is confirmed  
6. Reply in the composer — the client sees your reply in the **mobile Support chat** and web portal.  
7. When finished, click **Close chat**. The client can still **read** history but **cannot send** until you **Reopen** or they start a **new** conversation.

### 4.15 HR *(Owner / Admin / HR)*

| Page | Use |
|---|---|
| **Staff & Attendance** | Time in/out, leave, employment status |
| **Create account** | Provision staff logins (name, email, role, password) |
| **Payroll** | Pay drafts and entries |
| **Incentives** | Incentive rules and payouts |

### 4.16 Account settings *(all clinic roles)*

- Update your own profile preferences  
- Separate from clinic-wide **Clinic settings**  

### 4.17 Feedback & Clinic settings *(Owner / Admin)*

- **Feedback:** review client feedback  
- **Clinic settings:** brand, support email, branches, loyalty defaults, store readiness  

---

## 5. Client web portal — feature guide

Clients sign in on the web with their **Client** account.

| Page | What clients can do |
|---|---|
| **My Care** | Snapshot of upcoming care, points, wallet shortcuts |
| **Appointments** | View and request bookings |
| **My Packages** | Session packages and usage |
| **Wallet** | Cash-in balance and cash-in request |
| **My Points** | Loyalty points and activity |
| **Doctor notes** | Treatment notes and care comments |
| **Support** | Conversation history with the clinic + new messages |
| **My Profile** | Account / profile info |

---

## 6. Mobile app — feature guide (clients)

The Illuminate mobile app is for **clients only**. Staff should use the **web clinic app**.

### 6.1 Install & sign in

1. Install from the link your clinic provides (App Store / Play Store / test build).  
2. Open the app.  
3. **Register** (name, email, phone, password) or **Sign in** with an existing Client account.  
4. Allow notifications when prompted (for booking updates and wallet top-ups).

### 6.2 Tabs overview

| Tab | Purpose |
|---|---|
| **Care** | Home: welcome, points, wallet snapshot, upcoming visits, shortcuts |
| **Book** | Choose service, date, and time; submit booking request |
| **Visits** | Upcoming and past appointments / status |
| **Rewards** | Points, packages, wallet balance, **cash-in request with receipt photo** |
| **Profile** | Account info, doctor notes, contact support, logout |

Header **bell** opens **Notifications**.

### 6.3 Tutorial — Book a visit

1. Open **Book**.  
2. Select a service.  
3. Pick an available date and time.  
4. Add a note if needed.  
5. Submit the request.  
6. Status starts as **pending** until reception approves.  
7. You will get a notification when it is approved, declined, or cancelled.

### 6.4 Tutorial — Request cash-in (wallet top-up)

1. Open **Rewards**.  
2. Enter the amount and optional note.  
3. Tap **Attach receipt image** and choose a photo of the transfer / receipt.  
4. Submit the request.  
5. The clinic sees it in **Chat Support** (type: Cash-in) with the receipt.  
6. After staff confirms and records the cash-in in **Loyalty**, you receive a **successful top-up** notification with the amount.

### 6.5 Tutorial — Chat with the clinic

1. From **Profile** or **Care**, open **Contact support**.  
2. You see a **scrollable list** of conversations (Support, Cash-in, Message).  
3. Tap a conversation to read staff replies.  
4. Send a reply from the composer.  
5. If a conversation shows **Closed**, you can still read it — tap **New conversation** to message again.

### 6.6 Tutorial — Notifications

1. Tap the **bell** in the header.  
2. Read booking approvals, declines, cancellations, wallet top-ups, and upcoming visit reminders.  
3. Tap an item to jump to the related screen (e.g. Visits or Rewards).

### 6.7 Doctor notes

- From **Profile → Doctor notes**, review treatment notes and care comments left by the clinic.

---

## 7. End-to-end workflows (recommended)

### 7.1 New client journey

```text
Client registers (web or mobile)
        ↓
CRM customer is linked
        ↓
Client books a visit
        ↓
Reception reviews Appointments → Approve / Decline
        ↓
Client gets notification
        ↓
Visit completed → POS sale / session update
```

### 7.2 Cash-in journey

```text
Client sends cash-in + receipt (mobile Rewards)
        ↓
Appears in Chat Support (Cash-in, often High priority)
        ↓
Staff marks Received / Not received
        ↓
Staff records positive cash-in in Loyalty
        ↓
Client wallet updates + “successful top-up” notification
```

### 7.3 Support conversation

```text
Client messages Support (mobile or portal)
        ↓
Staff replies in Chat Support
        ↓
Client reads reply in the same conversation
        ↓
Staff closes chat when resolved
```

---

## 8. Quick reference — who does what

| Task | Client (app/portal) | Clinic staff (web) |
|---|---|---|
| Book appointment | Yes | Approve / manage in Appointments |
| Pay for service | At clinic / POS | POS checkout |
| Request wallet top-up | Yes + receipt | Confirm in Chat + Loyalty cash-in |
| Earn / redeem points | View on Rewards | Configure & apply in POS / Loyalty |
| Message support | Yes | Chat Support reply / close |
| Manage inventory | No | Inventory role / Owner / Admin |
| Payroll | No | HR / Owner / Admin |
| Change clinic branding | No | Clinic settings |

---

## 9. Tips for a smooth launch

1. **Promote one Owner account** first, then create staff via **Create account**.  
2. Add your real **services** and **customers** before going live with bookings.  
3. Train reception on: Appointments approve/decline, POS, Loyalty cash-in, Chat Support.  
4. Give clients the **mobile install link** and ask them to enable notifications.  
5. Use a **test client account** for rehearsals of booking + cash-in + chat.  
6. Never share the **Owner** password in group chats; store it in a password manager.  
7. When a chat is finished, **Close chat** so clients don’t keep messaging a resolved thread.

---

## 10. Support & escalation

| Issue | Who to contact |
|---|---|
| Client cannot log in | Reception → verify email / reset via Create account or Auth |
| Booking not appearing | Reception → Appointments + confirm Client is linked to customer |
| Cash-in not credited | Reception → Chat receipt status + Loyalty cash-in entry |
| Push notifications missing | Confirm permission on phone; may need a production/dev build (not Expo Go alone) |
| System / technical outage | Your Illuminate technical contact: `______________________________` |

---

## 11. Document control

| Item | Detail |
|---|---|
| Product | Illuminate Medical Aesthetics platform |
| Channels | Clinic web · Client portal · Mobile app |
| Guide purpose | Client / staff onboarding & operations reference |
| Last updated | August 2026 |

---

*This guide is intended for Illuminate Medical Aesthetics business users. Technical setup (Supabase, deployments, SQL) is maintained separately by your implementation team.*
