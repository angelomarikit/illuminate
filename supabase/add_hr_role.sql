-- Illuminate — HR role + payroll / incentives
-- Run in Supabase → SQL Editor (safe to re-run)
-- Requires: add_roles.sql, add_profiles_hr.sql

-- 1) Allow HR on profiles.role
update public.profiles
set role = 'Staff'
where role is null
   or role not in ('Owner', 'Admin', 'Staff', 'HR', 'Client');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('Owner', 'Admin', 'Staff', 'HR', 'Client'));

-- 2) Helpers
create or replace function public.is_clinic_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('Owner', 'Admin', 'Staff', 'HR');
$$;

create or replace function public.is_hr_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('Owner', 'Admin', 'HR');
$$;

revoke all on function public.is_hr_access() from public;
grant execute on function public.is_hr_access() to authenticated;
grant execute on function public.is_clinic_user() to authenticated;

-- Signup still cannot self-assign HR / Owner / Admin
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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

  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    safe_role,
    new.email
  )
  on conflict (id) do update
    set email = excluded.email
  where public.profiles.email is distinct from excluded.email;

  return new;
end;
$$;

-- 3) Compensation / base pay per account
create table if not exists public.staff_compensation (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  pay_type text not null default 'monthly'
    check (pay_type in ('monthly', 'daily', 'hourly')),
  base_salary numeric(12,2) not null default 0,
  hourly_rate numeric(12,2) not null default 0,
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.staff_compensation enable row level security;
drop policy if exists "hr_access_staff_compensation" on public.staff_compensation;
create policy "hr_access_staff_compensation"
  on public.staff_compensation for all to authenticated
  using (public.is_hr_access())
  with check (public.is_hr_access());
grant select, insert, update, delete on public.staff_compensation to authenticated;

-- 4) Payroll entries (auto from attendance or manual)
create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  staff_name text not null,
  period_start date not null,
  period_end date not null,
  hours_worked numeric(10,2) not null default 0,
  base_pay numeric(12,2) not null default 0,
  allowances numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'paid')),
  source text not null default 'manual'
    check (source in ('manual', 'attendance')),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payroll_entries_period_idx
  on public.payroll_entries (period_start, period_end);
create index if not exists payroll_entries_staff_idx
  on public.payroll_entries (profile_id, staff_name);

alter table public.payroll_entries enable row level security;
drop policy if exists "hr_access_payroll_entries" on public.payroll_entries;
create policy "hr_access_payroll_entries"
  on public.payroll_entries for all to authenticated
  using (public.is_hr_access())
  with check (public.is_hr_access());
grant select, insert, update, delete on public.payroll_entries to authenticated;

-- 5) Incentive rules (service commission / product incentive)
create table if not exists public.incentive_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  incentive_type text not null
    check (incentive_type in ('service_commission', 'product_incentive', 'other')),
  rate_percent numeric(8,4) not null default 0,
  flat_amount numeric(12,2) not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.incentive_rules enable row level security;
drop policy if exists "hr_access_incentive_rules" on public.incentive_rules;
create policy "hr_access_incentive_rules"
  on public.incentive_rules for all to authenticated
  using (public.is_hr_access())
  with check (public.is_hr_access());
grant select, insert, update, delete on public.incentive_rules to authenticated;

-- 6) Incentive payouts (from POS sales_by or manual)
create table if not exists public.incentive_payouts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  staff_name text not null,
  incentive_type text not null
    check (incentive_type in ('service_commission', 'product_incentive', 'other')),
  rule_id uuid references public.incentive_rules (id) on delete set null,
  period_start date not null,
  period_end date not null,
  sales_amount numeric(12,2) not null default 0,
  computed_amount numeric(12,2) not null default 0,
  adjustment numeric(12,2) not null default 0,
  final_amount numeric(12,2) not null default 0,
  source text not null default 'manual'
    check (source in ('manual', 'pos_sales_by')),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'paid')),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incentive_payouts_period_idx
  on public.incentive_payouts (period_start, period_end, staff_name);

alter table public.incentive_payouts enable row level security;
drop policy if exists "hr_access_incentive_payouts" on public.incentive_payouts;
create policy "hr_access_incentive_payouts"
  on public.incentive_payouts for all to authenticated
  using (public.is_hr_access())
  with check (public.is_hr_access());
grant select, insert, update, delete on public.incentive_payouts to authenticated;

-- HR needs read on sales for commission from sales_by (if RLS later tightens)
-- Existing sales policies are typically open to authenticated clinic users.
