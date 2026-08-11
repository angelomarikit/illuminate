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
