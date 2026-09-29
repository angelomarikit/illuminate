-- Illuminate — Individual session slots within a package
-- Run in Supabase → SQL Editor (safe to re-run)
-- Used by Client Sessions schedule modal

create table if not exists public.client_session_slots (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.client_session_packages (id) on delete cascade,
  session_number integer not null check (session_number >= 1),
  scheduled_date date,
  scheduled_time time,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'finished', 'cancelled', 'no_show')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, session_number)
);

create index if not exists client_session_slots_package_idx
  on public.client_session_slots (package_id, session_number);

create index if not exists client_session_slots_date_idx
  on public.client_session_slots (scheduled_date, status);

alter table public.client_session_slots enable row level security;

drop policy if exists "auth_all_client_session_slots" on public.client_session_slots;
create policy "auth_all_client_session_slots"
  on public.client_session_slots for all to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.client_session_slots to authenticated;
