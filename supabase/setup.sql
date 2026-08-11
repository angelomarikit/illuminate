-- Illuminate Medical Aesthetics — full Supabase setup
-- Run this in Supabase → SQL Editor (safe to re-run)

-- ========== TABLES ==========
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  status text not null default 'active' check (status in ('active', 'coming-soon')),
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text,
  role text not null default 'Staff' check (role in ('Owner', 'Admin', 'Staff', 'Client')),
  branch_id uuid references public.branches (id),
  employment_status text not null default 'probation'
    check (employment_status in ('probation', 'regular', 'contract', 'separated')),
  duty_status text not null default 'off-duty'
    check (duty_status in ('on-duty', 'off-duty', 'on-leave')),
  leave_credits_vacation integer not null default 10,
  leave_credits_sick integer not null default 5,
  leave_credits_personal integer not null default 3,
  leave_credits_emergency integer not null default 2,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  user_id uuid references auth.users (id) on delete set null,
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

create table if not exists public.services (
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

create table if not exists public.inventory_items (
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

create table if not exists public.appointments (
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
  customer_email text,
  customer_phone text,
  customer_age integer,
  customer_sex text,
  customer_address text,
  medical_history text,
  special_note text,
  source text not null default 'clinic',
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  receipt_no text not null unique,
  customer_name text,
  customer_id uuid references public.customers (id),
  items text not null,
  total numeric(12,2) not null,
  payment_method text not null,
  points_used integer not null default 0,
  wallet_used numeric(12,2) not null default 0,
  staff_name text,
  sold_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  category text not null,
  description text not null,
  amount numeric(12,2) not null,
  paid_by text,
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  customer_name text not null,
  type text not null check (type in ('earn', 'redeem', 'cash-in')),
  points integer not null default 0,
  amount numeric(12,2),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.consultations (
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

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  profile_id uuid references public.profiles (id) on delete set null,
  full_name text not null,
  role text not null,
  employment_status text not null default 'regular'
    check (employment_status in ('probation', 'regular', 'contract', 'separated')),
  status text not null default 'off-duty',
  leave_credits_vacation integer not null default 10,
  leave_credits_sick integer not null default 5,
  leave_credits_personal integer not null default 3,
  leave_credits_emergency integer not null default 2,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  work_date date not null default current_date,
  time_in time,
  time_out time,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  staff_name text not null,
  leave_type text not null,
  date_from date not null,
  date_to date not null,
  days integer not null default 1,
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.clinic_settings (
  id int primary key default 1 check (id = 1),
  brand_name text not null default 'Illuminate Medical Aesthetics',
  support_email text not null default 'hello@illuminatemedical.ph',
  timezone text not null default 'Asia/Manila',
  currency text not null default 'PHP',
  earn_rate text not null default '1 point per ₱10 spent',
  redeem_rate text not null default '1 point = ₱10 service credit',
  cash_in_rule text not null default 'Enabled for all memberships',
  promo_bar_text text default 'New clients: enjoy complimentary skin analysis with your first facial this month.',
  promo_bar_active boolean not null default true,
  promo_bar_link text default '#book',
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  preview text,
  unread integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sender text not null check (sender in ('staff', 'customer')),
  body text not null,
  created_at timestamptz not null default now()
);

-- ========== SAFE COLUMN UPGRADES (existing projects) ==========
alter table public.sales add column if not exists wallet_used numeric(12,2) not null default 0;
alter table public.sales add column if not exists customer_id uuid references public.customers (id);
alter table public.branches add column if not exists is_open boolean not null default true;
alter table public.customers add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.staff add column if not exists profile_id uuid references public.profiles (id) on delete set null;
alter table public.staff add column if not exists employment_status text not null default 'regular';
alter table public.staff add column if not exists leave_credits_vacation integer not null default 10;
alter table public.staff add column if not exists leave_credits_sick integer not null default 5;
alter table public.staff add column if not exists leave_credits_personal integer not null default 3;
alter table public.staff add column if not exists leave_credits_emergency integer not null default 2;
alter table public.leave_requests add column if not exists staff_id uuid references public.staff (id) on delete set null;
alter table public.leave_requests add column if not exists profile_id uuid references public.profiles (id) on delete set null;
alter table public.leave_requests add column if not exists reason text;
alter table public.leave_requests add column if not exists days integer not null default 1;
alter table public.attendance add column if not exists profile_id uuid references public.profiles (id) on delete cascade;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists employment_status text not null default 'probation';
alter table public.profiles add column if not exists duty_status text not null default 'off-duty';
alter table public.profiles add column if not exists leave_credits_vacation integer not null default 10;
alter table public.profiles add column if not exists leave_credits_sick integer not null default 5;
alter table public.profiles add column if not exists leave_credits_personal integer not null default 3;
alter table public.profiles add column if not exists leave_credits_emergency integer not null default 2;

create unique index if not exists customers_user_id_uidx
  on public.customers (user_id)
  where user_id is not null;

create unique index if not exists attendance_staff_date_uidx
  on public.attendance (staff_id, work_date)
  where staff_id is not null;

create unique index if not exists attendance_profile_date_uidx
  on public.attendance (profile_id, work_date)
  where profile_id is not null;

-- ========== ROLE HELPERS (for app + future Expo / RLS) ==========
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'Staff'
  );
$$;

create or replace function public.is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('Owner', 'Admin');
$$;

create or replace function public.is_clinic_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('Owner', 'Admin', 'Staff');
$$;

create or replace function public.is_client_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'Client';
$$;

-- ========== PROFILE TRIGGER ==========
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'Staff');
  safe_role text;
begin
  if requested_role in ('Staff', 'Client') then
    safe_role := requested_role;
  else
    safe_role := 'Staff';
  end if;

  insert into public.profiles (
    id, full_name, role, email,
    employment_status, duty_status,
    leave_credits_vacation, leave_credits_sick,
    leave_credits_personal, leave_credits_emergency
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    safe_role,
    new.email,
    'probation',
    'off-duty',
    10, 5, 3, 2
  )
  on conflict (id) do update
    set email = excluded.email
  where public.profiles.email is distinct from excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ========== RLS ==========
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.services enable row level security;
alter table public.inventory_items enable row level security;
alter table public.appointments enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.consultations enable row level security;
alter table public.staff enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
alter table public.clinic_settings enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

-- Helper: drop + recreate open authenticated policies
do $$
declare
  t text;
begin
  foreach t in array array[
    'branches','profiles','customers','services','inventory_items','appointments',
    'sales','expenses','loyalty_transactions','consultations','staff','attendance',
    'leave_requests','clinic_settings','chat_threads','chat_messages'
  ]
  loop
    execute format('drop policy if exists "auth_all_%s" on public.%I', t, t);
    execute format(
      'create policy "auth_all_%s" on public.%I for all to authenticated using (true) with check (true)',
      t, t
    );
  end loop;
end $$;

-- Profiles: users can read/update own profile too
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (true);

-- ========== SEEDS ==========
insert into public.clinic_settings (id) values (1)
on conflict (id) do nothing;

insert into public.branches (name, address, status)
select * from (values
  ('BGC Flagship', '5th Ave, Bonifacio Global City', 'active'),
  ('Makati Avenue', 'Makati Ave, Makati City', 'active'),
  ('Quezon City', 'Eastwood City, Quezon City', 'coming-soon')
) as v(name, address, status)
where not exists (select 1 from public.branches limit 1);

insert into public.services (name, category, price, duration_min, points_earn, points_cost, active, description)
select * from (values
  ('Illuminate Signature Facial', 'Facials', 3500, 60, 35, 320, true, 'Deep cleanse, extraction, LED therapy, and custom mask.'),
  ('HydraGlow Facial', 'Facials', 4200, 75, 42, 390, true, 'Hydradermabrasion with peptide infusion.'),
  ('Neurotoxin Touch-Up', 'Injectables', 12000, 30, 120, 1100, true, 'Precision neuromodulator refinement.'),
  ('Lip Filler Refresh', 'Injectables', 18000, 45, 180, 1650, true, 'Subtle volume and contour balance.'),
  ('Pico Brightening', 'Laser', 8500, 40, 85, 780, true, 'Pigment and tone correction session.'),
  ('Body Contour Session', 'Body', 9500, 50, 95, 880, true, 'Non-invasive contouring and lymphatic support.'),
  ('Illuminate Glow Serum', 'Skincare', 2800, 0, 28, 250, true, 'Clinic-exclusive vitamin C peptide serum.'),
  ('Luxe Renewal Package', 'Packages', 45000, 180, 500, 4000, true, '3 facial + 1 laser + skincare starter set.')
) as v(name, category, price, duration_min, points_earn, points_cost, active, description)
where not exists (select 1 from public.services limit 1);

-- ========== STORAGE ==========
insert into storage.buckets (id, name, public)
values ('consultations', 'consultations', true)
on conflict (id) do nothing;

drop policy if exists "auth_consultations_read" on storage.objects;
drop policy if exists "auth_consultations_write" on storage.objects;
drop policy if exists "auth_consultations_update" on storage.objects;

create policy "auth_consultations_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'consultations');

create policy "auth_consultations_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'consultations');

create policy "auth_consultations_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'consultations');
