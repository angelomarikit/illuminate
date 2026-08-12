-- Illuminate — POS discount, doctor notes, staff attribution + care comments
-- Run in Supabase → SQL Editor (safe to re-run)
-- Requires: sales, client_session_packages (add_client_sessions.sql)

-- Sales attribution
alter table public.sales
  add column if not exists discount_amount numeric(12,2) not null default 0;

alter table public.sales
  add column if not exists doctor_notes text;

alter table public.sales
  add column if not exists administered_by text;

alter table public.sales
  add column if not exists consult_by text;

alter table public.sales
  add column if not exists sales_by text;

-- Session packages (visible on Client Sessions + Customers)
alter table public.client_session_packages
  add column if not exists discount_amount numeric(12,2) not null default 0;

alter table public.client_session_packages
  add column if not exists doctor_notes text;

alter table public.client_session_packages
  add column if not exists administered_by text;

alter table public.client_session_packages
  add column if not exists consult_by text;

alter table public.client_session_packages
  add column if not exists sales_by text;

-- Threaded comments under doctor notes (customer and/or package)
create table if not exists public.client_care_comments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  session_package_id uuid references public.client_session_packages (id) on delete cascade,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  check (customer_id is not null or session_package_id is not null)
);

create index if not exists client_care_comments_customer_idx
  on public.client_care_comments (customer_id, created_at desc);

create index if not exists client_care_comments_package_idx
  on public.client_care_comments (session_package_id, created_at desc);

alter table public.client_care_comments enable row level security;

drop policy if exists "auth_all_client_care_comments" on public.client_care_comments;
create policy "auth_all_client_care_comments"
  on public.client_care_comments for all to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.client_care_comments to authenticated;

create index if not exists sales_sales_by_idx on public.sales (sales_by);
