# Connect Illuminate to Supabase

Step-by-step instructions to move this app from mock/localStorage data to a real Supabase backend.

---

## 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Click **New project**.
3. Choose organization, name (e.g. `illuminate-clinic`), password, and region closest to your users.
4. Wait until the project finishes provisioning.

---

## 2. Copy API keys

In Supabase Dashboard:

**Project Settings → API**

Copy:

| Value | Env variable |
|-------|----------------|
| Project URL | `VITE_SUPABASE_URL` |
| `anon` `public` key | `VITE_SUPABASE_ANON_KEY` |

Do **not** put the `service_role` key in the frontend. It bypasses Row Level Security.

Local file: create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Restart `npm run dev` after changing env vars.

---

## 3. Enable Auth

**Authentication → Providers → Email**

- Enable **Email** provider
- For development you can disable “Confirm email”
- For production, keep email confirmation ON

Optional later:

- Google / Facebook OAuth (match the buttons on the login page)
- Add your Vercel URL under **Authentication → URL Configuration**:
  - Site URL: `https://your-app.vercel.app`
  - Redirect URLs: `https://your-app.vercel.app/**`

---

## 4. Suggested database schema

Open **SQL Editor → New query**, paste and run:

```sql
-- Branches
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  status text not null default 'active' check (status in ('active', 'coming-soon')),
  created_at timestamptz not null default now()
);

-- Staff profiles (linked to auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'Staff',
  branch_id uuid references public.branches (id),
  created_at timestamptz not null default now()
);

-- Customers
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  full_name text not null,
  phone text,
  email text,
  membership text not null default 'Standard',
  points integer not null default 0,
  cash_in_balance numeric(12,2) not null default 0,
  visits integer not null default 0,
  last_visit date,
  created_at timestamptz not null default now()
);

-- Services / products
create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  price numeric(12,2) not null,
  duration_min integer not null default 0,
  points_earn integer not null default 0,
  points_cost integer not null default 0,
  active boolean not null default true,
  description text,
  created_at timestamptz not null default now()
);

-- Inventory
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  name text not null,
  sku text not null,
  category text not null,
  stock integer not null default 0,
  reorder_level integer not null default 0,
  unit text not null default 'pc',
  expiry date,
  created_at timestamptz not null default now()
);

-- Appointments / walk-ins
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  customer_name text not null,
  service_name text not null,
  staff_name text,
  appointment_date date not null,
  appointment_time time not null,
  duration_min integer not null default 60,
  status text not null default 'confirmed',
  type text not null default 'appointment' check (type in ('appointment', 'walk-in')),
  created_at timestamptz not null default now()
);

-- Sales / sales proof
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  receipt_no text not null unique,
  customer_name text,
  items text not null,
  total numeric(12,2) not null,
  payment_method text not null,
  points_used integer not null default 0,
  staff_name text,
  sold_at timestamptz not null default now()
);

-- Expenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  category text not null,
  description text not null,
  amount numeric(12,2) not null,
  paid_by text,
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Loyalty ledger
create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  customer_name text not null,
  type text not null check (type in ('earn', 'redeem', 'cash-in')),
  points integer not null default 0,
  amount numeric(12,2),
  note text,
  created_at timestamptz not null default now()
);

-- Consultations (before/after)
create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  customer_name text not null,
  treatment text not null,
  notes text,
  ai_summary text,
  before_image_path text,
  after_image_path text,
  consultation_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Staff attendance / leaves
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  full_name text not null,
  role text not null,
  status text not null default 'off-duty',
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff (id) on delete cascade,
  work_date date not null default current_date,
  time_in time,
  time_out time,
  created_at timestamptz not null default now()
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_name text not null,
  leave_type text not null,
  date_from date not null,
  date_to date not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
```

---

## 5. Auto-create profile on signup

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'Staff')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

---

## 6. Row Level Security (required before public launch)

Enable RLS on every public table, then add policies. Example starter (staff must be logged in):

```sql
alter table public.customers enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.sales enable row level security;
alter table public.inventory_items enable row level security;
alter table public.expenses enable row level security;
alter table public.profiles enable row level security;

create policy "Authenticated users can read customers"
  on public.customers for select
  to authenticated
  using (true);

create policy "Authenticated users can write customers"
  on public.customers for all
  to authenticated
  using (true)
  with check (true);

-- Repeat similar policies for other clinic tables.
-- Tighten later by branch_id / role.
```

Start simple (authenticated staff can CRUD), then tighten by branch and role.

---

## 7. Storage for before/after images

1. **Storage → New bucket**
2. Name: `consultations`
3. Private bucket recommended
4. Add policies so authenticated staff can upload/read

Example policy ideas:

- `authenticated` can upload to `consultations/{user_id}/**`
- `authenticated` can read consultation images

---

## 8. Install Supabase in this repo

```bash
npm install @supabase/supabase-js
```

Create `src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url, anonKey)
```

---

## 9. Auth is wired in the app (done)

These files are already connected to Supabase:

- `src/lib/supabase.ts` — client
- `src/context/AuthContext.tsx` — login / register / logout / session
- `src/components/auth/ProtectedRoute.tsx` — requires Supabase session
- `src/components/auth/GuestRoute.tsx` — redirects if already signed in

### What you do now

1. Restart the app so `.env` is loaded:

```bash
npm run dev
```

2. Open `/register` and create a real staff account.
3. Confirm a `profiles` row appears in Supabase **Table Editor → profiles**.
4. Sign out, then sign in again on `/login`.

### If register says “check your email”

Supabase → **Authentication → Providers → Email** → turn off **Confirm email** while testing locally.  
Turn it back on for production.

### If login fails with RLS / profile errors

Make sure the trigger from section 5 exists (`handle_new_user`).  
You can also insert a profile manually for your user id.

---

## 10. Live data modules (in progress)

### Done in code

- **Branches** — `BranchContext` loads from `branches` (falls back to mock labels if table is empty)
- **Customers** — list + Add Client writes to `customers`

### Seed at least one branch (recommended)

Run in Supabase SQL Editor:

```sql
insert into public.branches (name, address, status) values
  ('BGC Flagship', '5th Ave, Bonifacio Global City', 'active'),
  ('Makati Avenue', 'Makati Ave, Makati City', 'active');
```

Then refresh the app and pick the branch in the top bar before adding clients.

### Still on mock data (next to wire)

1. Services
2. Appointments
3. Inventory
4. POS / Sales
5. Expenses
6. Loyalty
7. Consultations + Storage
8. Staff / attendance / leaves
9. Chat (Realtime later)

Ask the agent to wire the next module when ready.

---

## 11. Local verification checklist

Do this after restarting `npm run dev`:

- [ ] `/register` creates a user in **Authentication → Users**
- [ ] Matching row appears in **profiles**
- [ ] `/login` works with that user
- [ ] Logout returns you to `/login`
- [ ] Visiting `/` while logged out redirects to `/login`
- [ ] `/customers` loads without error
- [ ] **Add Client** creates a row in **customers**
- [ ] Client appears in the table after save

### Common fixes

| Problem | Fix |
|---------|-----|
| Missing env error | Confirm `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart Vite |
| `new row violates row-level security` | Re-check section 6 RLS policies for `customers` / `profiles` |
| Empty branch dropdown / no filter | Run the branch seed SQL above |
| Register succeeds but cannot enter app | Disable email confirmation for local testing |

---

## 12. Production notes (Vercel)

When deploying:

1. Add the same env vars in Vercel (see `docs/VERCEL.md`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Redeploy after adding env vars (Vite bakes them at build time).
3. In Supabase **Authentication → URL Configuration**:
   - Site URL = your Vercel URL
   - Redirect URLs include `https://YOUR_APP.vercel.app/**` and `http://localhost:5173/**`
4. Keep using the **anon** key only in the frontend.
5. Use Supabase **Logs** if live login/customers fail.
6. Back up the database before big schema changes.
