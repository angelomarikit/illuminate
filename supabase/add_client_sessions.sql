-- Illuminate — Doctor-advised treatment session packages
-- Run in Supabase → SQL Editor (safe to re-run)
-- Used by POS checkout + Sessions tracking page

create table if not exists public.client_session_packages (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  customer_name text not null,
  service_id uuid references public.services (id) on delete set null,
  service_name text not null,
  total_sessions integer not null check (total_sessions >= 1),
  sessions_used integer not null default 0 check (sessions_used >= 0),
  package_amount numeric(12,2) not null default 0,
  sold_on date not null default current_date,
  next_session_date date,
  sale_receipt_no text,
  notes text,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sessions_used <= total_sessions)
);

create index if not exists client_session_packages_customer_idx
  on public.client_session_packages (customer_id);

create index if not exists client_session_packages_status_idx
  on public.client_session_packages (status, next_session_date);

alter table public.client_session_packages enable row level security;

drop policy if exists "auth_all_client_session_packages" on public.client_session_packages;
create policy "auth_all_client_session_packages"
  on public.client_session_packages for all to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.client_session_packages to authenticated;
