-- Illuminate — Staff HR / attendance / leave credits
-- Run in Supabase → SQL Editor after add_roles.sql (safe to re-run)

-- Leave credit balances on staff records
alter table public.staff
  add column if not exists leave_credits_vacation integer not null default 10;
alter table public.staff
  add column if not exists leave_credits_sick integer not null default 5;
alter table public.staff
  add column if not exists leave_credits_personal integer not null default 3;
alter table public.staff
  add column if not exists leave_credits_emergency integer not null default 2;

-- Stronger leave requests (linked to staff row)
alter table public.leave_requests
  add column if not exists staff_id uuid references public.staff (id) on delete set null;
alter table public.leave_requests
  add column if not exists reason text;
alter table public.leave_requests
  add column if not exists days integer not null default 1;

-- One attendance row per staff per day
create unique index if not exists attendance_staff_date_uidx
  on public.attendance (staff_id, work_date);

-- Helpful: link existing auth user to a staff row by email match on profiles
-- Example (edit names/emails as needed):
-- update public.staff s
-- set profile_id = p.id
-- from public.profiles p
-- join auth.users u on u.id = p.id
-- where u.email = 'staff@illuminate.com'
--   and s.full_name ilike '%Staff%';
