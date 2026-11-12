-- Illuminate — Digitized client clinical journey (steps 1–4)
-- Medical/Assessment → 16-Point Aesthetic → Treatment Proposal → Social Media Consent
-- Safe to re-run.

create table if not exists public.client_journeys (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'completed')),
  current_step integer not null default 1
    check (current_step >= 1 and current_step <= 4),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_journeys_customer_idx
  on public.client_journeys (customer_id, created_at desc);

create index if not exists client_journeys_status_idx
  on public.client_journeys (status, updated_at desc);

comment on table public.client_journeys is
  'Header for a client clinical journey (one visit pathway through steps 1–4).';

create table if not exists public.client_journey_steps (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.client_journeys (id) on delete cascade,
  step_number integer not null check (step_number >= 1 and step_number <= 4),
  payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, step_number)
);

create index if not exists client_journey_steps_journey_idx
  on public.client_journey_steps (journey_id, step_number);

comment on table public.client_journey_steps is
  'Per-step JSON payloads for client clinical journey forms.';

alter table public.client_journeys enable row level security;
alter table public.client_journey_steps enable row level security;

drop policy if exists "clinic_all_client_journeys" on public.client_journeys;
create policy "clinic_all_client_journeys"
  on public.client_journeys for all to authenticated
  using (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff'))
  with check (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff'));

drop policy if exists "clinic_all_client_journey_steps" on public.client_journey_steps;
create policy "clinic_all_client_journey_steps"
  on public.client_journey_steps for all to authenticated
  using (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff'))
  with check (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff'));

grant select, insert, update, delete on public.client_journeys to authenticated;
grant select, insert, update, delete on public.client_journey_steps to authenticated;
