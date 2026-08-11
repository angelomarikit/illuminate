# Illuminate roles (Owner / Admin / Staff / Client)

This guide sets up app permissions without breaking your current clinic web app. The same model is ready for Expo / React Native later.

## Role summary

| Role | Who | Access |
|------|-----|--------|
| **Owner** | Business owner | Full app: dashboard, approvals (leaves / attendance), staff HR fields, settings, everything Staff can do |
| **Admin** | Trusted manager | Same elevated access as Owner (approvals + settings + dashboard) |
| **Staff** | Front desk / therapists | Day-to-day ops: POS, sales, appointments, customers, services, inventory, expenses, consultations, loyalty, QR, chat, store open/close |
| **Client** | Patient / member | Portal only: my services, loyalty points, support chat, profile settings |

**Important:** `profiles.role` is the app permission. `staff.role` is only a job title (e.g. Reception). Do not mix them.

---

## Step 1 — Run SQL (existing Supabase project)

1. Open **Supabase → SQL Editor**
2. Paste and run the full contents of:

`supabase/add_roles.sql`

That script will:

- constrain `profiles.role` to `Owner | Admin | Staff | Client`
- add `customers.user_id` (link login → CRM customer for web + mobile)
- add optional `staff.employment_status` + `staff.profile_id` for Owner HR later
- create helpers: `current_app_role()`, `is_owner_or_admin()`, `is_clinic_user()`, `is_client_user()`
- block public signup from creating Owner/Admin

---

## Step 2 — Promote your Owner account

After you register / sign in once (default role is **Staff**), run this (change the email):

```sql
update public.profiles
set role = 'Owner'
where id = (
  select id from auth.users
  where email = 'you@clinic.com'
);
```

Promote a manager:

```sql
update public.profiles
set role = 'Admin'
where id = (
  select id from auth.users
  where email = 'manager@clinic.com'
);
```

Then **log out and log back in** (or refresh) so the web app reloads `profiles.role`.

---

## Step 3 — Keep Staff as default clinic signup

Public **Register** always creates `Staff`. That is intentional.

- No role picker on signup (prevents anyone becoming Owner)
- You promote Owner/Admin only via SQL (or later via an Owner-only Settings screen)

---

## Step 4 — Create / link a Client account

### A) Create the auth user

Option 1 — Supabase Dashboard → Authentication → Users → Add user  
Option 2 — Sign up normally, then change role with SQL

```sql
update public.profiles
set role = 'Client'
where id = (
  select id from auth.users
  where email = 'client@email.com'
);
```

### B) Link to CRM customer row

```sql
update public.customers
set user_id = (
  select id from auth.users
  where email = 'client@email.com'
)
where id = (
  select id from public.customers
  where email ilike 'client@email.com'
  order by created_at desc
  limit 1
);
```

Client portal pages use `customers.user_id` first, then fall back to email match.

---

## What the web app does now

- Sidebar menu filters by role
- Routes redirect if the role cannot open that page
- Homes:
  - Owner/Admin → `/` (Dashboard)
  - Staff → `/pos`
  - Client → `/portal`
- Store toggle + branch selector + Open POS show for clinic roles only
- Client portal routes:
  - `/portal`
  - `/portal/services`
  - `/portal/loyalty`
  - `/portal/support`
  - `/portal/settings`

Source of truth in code: `src/lib/roles.ts`

---

## Expo / React Native readiness (later)

Use the **same Supabase project**:

1. Auth: `@supabase/supabase-js` + Secure Store session (same emails/passwords)
2. Read role from `profiles.role` (or RPC `current_app_role()`)
3. Reuse the same path matrix in `src/lib/roles.ts` (copy into a shared package later if you want)
4. Client app screens map to portal routes / same tables
5. Staff app screens map to clinic routes (POS, appointments, etc.)
6. Never put Owner/Admin in `user_metadata` for security decisions — keep role in `profiles` (and later tighten RLS with the SQL helpers)

Suggested mobile apps later:

- **Illuminate Staff** (Owner/Admin/Staff)
- **Illuminate Client** (Client only)

---

## Staff HR / time clock

Run after roles SQL:

1. `supabase/add_staff_hr.sql`
2. `supabase/add_profiles_hr.sql`

Then in **Staff & Attendance** (Owner/Admin):

1. All registered accounts appear automatically (email, name, employment, duty, leave credits, **role**)
2. Change **Role** to control which pages they can open (Owner / Admin / Staff / Client)
3. Set employment + leave credits
4. Approve leave requests (credits deduct on approve)

Staff-only: **My Work** + topbar Time In / Time Out.

## Optional next steps (not required now)

1. **Owner Settings UI** to promote users without SQL  
2. **Tighten RLS** using `is_clinic_user()` / `is_client_user()` (today authenticated users can still read/write via open policies)  
3. **Government benefits** table owned by Owner/Admin only  
4. **Client self-signup** that sets metadata `role: 'Client'` and auto-links by email  

---

## Quick verify checklist

1. Run `add_roles.sql`
2. Set your user to `Owner`
3. Log in → see Dashboard + Staff & Attendance + Settings
4. Create a second user, leave as `Staff` → no Dashboard / Staff / Settings; has POS + store toggle
5. Create a Client, link `customers.user_id` → only portal menu
