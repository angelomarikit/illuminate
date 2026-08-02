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

Restart:

```bash
npm run dev
```

## 5. Test

1. Register / login
2. Customers → Add Client
3. Services → Add Service
4. POS → complete a sale
5. Sales → Export CSV

If a button shows an RLS / permission error, re-run `setup.sql` and confirm you are logged in.
