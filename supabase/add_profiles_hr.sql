-- Illuminate — Profiles as registered accounts + HR fields
-- Run in Supabase SQL Editor (safe to re-run)

-- 1) Account / HR fields on profiles (source of truth for Staff & Attendance)
alter table public.profiles add column if not exists email text;
alter table public.profiles
  add column if not exists employment_status text not null default 'probation';
alter table public.profiles
  add column if not exists duty_status text not null default 'off-duty';
alter table public.profiles
  add column if not exists leave_credits_vacation integer not null default 10;
alter table public.profiles
  add column if not exists leave_credits_sick integer not null default 5;
alter table public.profiles
  add column if not exists leave_credits_personal integer not null default 3;
alter table public.profiles
  add column if not exists leave_credits_emergency integer not null default 2;

alter table public.profiles drop constraint if exists profiles_employment_status_check;
alter table public.profiles
  add constraint profiles_employment_status_check
  check (employment_status in ('probation', 'regular', 'contract', 'separated'));

alter table public.profiles drop constraint if exists profiles_duty_status_check;
alter table public.profiles
  add constraint profiles_duty_status_check
  check (duty_status in ('on-duty', 'off-duty', 'on-leave'));

-- 2) Sync emails from auth.users
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '');

-- 3) Attendance + leaves keyed by profile (registered account)
alter table public.attendance
  add column if not exists profile_id uuid references public.profiles (id) on delete cascade;
alter table public.leave_requests
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create unique index if not exists attendance_profile_date_uidx
  on public.attendance (profile_id, work_date)
  where profile_id is not null;

-- 4) Signup trigger stores email + defaults
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

-- 5) Remove old dummy seed rows (safe — only demo names / unlinked staff)
delete from public.chat_messages
where thread_id in (
  select id from public.chat_threads
  where customer_name in ('Ava Mendoza', 'Lara Villanueva', 'Mia Santos')
);

delete from public.chat_threads
where customer_name in ('Ava Mendoza', 'Lara Villanueva', 'Mia Santos');

delete from public.attendance
where staff_id in (
  select id from public.staff
  where full_name in ('Dr. Elise Tan', 'Nurse Patrice', 'Front Desk Ana')
    and profile_id is null
);

delete from public.staff
where full_name in ('Dr. Elise Tan', 'Nurse Patrice', 'Front Desk Ana')
  and profile_id is null;
