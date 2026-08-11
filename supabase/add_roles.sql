-- Illuminate — App roles (Owner / Admin / Staff / Client)
-- Run in Supabase → SQL Editor after setup.sql (safe to re-run)
--
-- profiles.role is the ONLY source of truth for app permissions.
-- staff.role stays as job title (e.g. Reception) — do not confuse the two.

-- 1) Normalize any unexpected role values before adding the check constraint
update public.profiles
set role = 'Staff'
where role is null
   or role not in ('Owner', 'Admin', 'Staff', 'Client');

-- 2) Constrain allowed app roles
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('Owner', 'Admin', 'Staff', 'Client'));

alter table public.profiles
  alter column role set default 'Staff';

-- 3) Link client auth accounts to CRM customers (needed for web + Expo)
alter table public.customers
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create unique index if not exists customers_user_id_uidx
  on public.customers (user_id)
  where user_id is not null;

-- 4) Optional HR fields for Owner/Admin (regularization / probation later)
alter table public.staff
  add column if not exists employment_status text not null default 'regular';

alter table public.staff drop constraint if exists staff_employment_status_check;
alter table public.staff
  add constraint staff_employment_status_check
  check (employment_status in ('probation', 'regular', 'contract', 'separated'));

alter table public.staff
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

-- 5) Helpers for future RLS + Expo (read role from profiles, NOT user_metadata)
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

revoke all on function public.current_app_role() from public;
revoke all on function public.is_owner_or_admin() from public;
revoke all on function public.is_clinic_user() from public;
revoke all on function public.is_client_user() from public;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_owner_or_admin() to authenticated;
grant execute on function public.is_clinic_user() to authenticated;
grant execute on function public.is_client_user() to authenticated;

-- 6) Signup trigger: only Staff or Client allowed from metadata (never Owner/Admin via public signup)
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

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    safe_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ========== MANUAL PROMOTIONS (edit email, then run) ==========
-- Make yourself Owner:
-- update public.profiles
-- set role = 'Owner'
-- where id = (select id from auth.users where email = 'you@clinic.com');

-- Promote a manager to Admin:
-- update public.profiles
-- set role = 'Admin'
-- where id = (select id from auth.users where email = 'manager@clinic.com');

-- Create / mark a Client and link to a customer row:
-- update public.profiles
-- set role = 'Client'
-- where id = (select id from auth.users where email = 'client@email.com');
--
-- update public.customers
-- set user_id = (select id from auth.users where email = 'client@email.com')
-- where id = (
--   select id from public.customers
--   where email ilike 'client@email.com'
--   order by created_at desc
--   limit 1
-- );
