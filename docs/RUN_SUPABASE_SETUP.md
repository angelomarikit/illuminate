# Run Supabase setup (required for buttons to work)

The app now writes to Supabase for clinic modules. Run this once in **your** project.

## 1. Open SQL Editor

Supabase Dashboard → **SQL Editor** → **New query**

## 2. Paste and run

Open the file in this repo:

`supabase/setup.sql`

Copy all of it → paste into SQL Editor → **Run**

This creates:

- tables (branches, customers, services, inventory, appointments, sales, expenses, loyalty, consultations, staff, attendance, leaves, settings, chat)
- RLS policies for authenticated staff
- profile trigger on signup
- seed branches / services / staff / chat threads
- storage bucket `consultations`

## 3. Auth settings (local testing)

**Authentication → Providers → Email**

- Enable Email
- For local testing, you can disable **Confirm email**

## 4. Confirm `.env` is your project

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 5. App roles + staff HR

After setup.sql, also run (in order):

1. `supabase/add_roles.sql`
2. `supabase/add_staff_hr.sql`
3. `supabase/add_profiles_hr.sql` (registered accounts + HR fields; clears demo staff/chat)
4. `supabase/add_store_open.sql` (branch open/closed toggle column)
5. `supabase/add_public_booking.sql` (landing page booking → appointments approvals)
6. `supabase/fix_public_booking_flow.sql` (website booking RPC + customer profile sync)
7. `supabase/add_client_feedback.sql` (landing feedback slider; Owner/Admin manage in app)
8. `supabase/add_delete_account.sql` (Owner/Admin delete accounts from Staff & Attendance)
9. `supabase/add_client_sessions.sql` (doctor-advised session packages from POS + Client Sessions page)
10. `supabase/add_pos_attribution.sql` (discount, doctor notes, administered/consult/sales by + care comments)
11. `supabase/add_customer_birthday.sql` (birthday on customers + public booking RPC)
12. `supabase/add_hr_role.sql` (HR role + payroll / incentive tables)
13. `supabase/add_account_self_view.sql` (each account can view own salary & incentives)
14. `supabase/add_membership_subscription.sql` (VIP ₱5,000 / VVIP ₱10,000 POS products + membership expiry)
15. `supabase/add_inventory_role.sql` (Inventory Specialist role + stocktake / receiving / reorder + service links)

Then promote your owner account (see `docs/ROLES.md`).

## 6. Restart and test

```bash
npm run dev
```

1. Register / login
2. Promote Owner via SQL (`docs/ROLES.md`)
3. Customers → Add Client
4. Services → Add Service
5. POS → complete a sale
6. Sales → Export CSV

If a button shows an RLS / permission error, re-run `setup.sql` and confirm you are logged in.
