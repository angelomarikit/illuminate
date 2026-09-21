-- Illuminate — Inventory Issued / Used tracking (for Stock Assessment)
-- Run after add_inventory_role.sql
-- Inventory / Owner / Admin can log usage that decreases on-hand stock.

-- 1) Issue headers
create table if not exists public.inventory_issues (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete set null,
  issued_at date not null default (timezone('utc', now()))::date,
  reason text,
  notes text,
  issued_by text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- 2) Issue lines
create table if not exists public.inventory_issue_lines (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.inventory_issues (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  qty integer not null check (qty > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_issues_branch_idx
  on public.inventory_issues (branch_id, issued_at desc);

create index if not exists inventory_issue_lines_issue_idx
  on public.inventory_issue_lines (issue_id);

create index if not exists inventory_issue_lines_item_idx
  on public.inventory_issue_lines (inventory_item_id);

alter table public.inventory_issues enable row level security;
alter table public.inventory_issue_lines enable row level security;

drop policy if exists "inventory_access_issues" on public.inventory_issues;
create policy "inventory_access_issues"
  on public.inventory_issues for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());

drop policy if exists "inventory_access_issue_lines" on public.inventory_issue_lines;
create policy "inventory_access_issue_lines"
  on public.inventory_issue_lines for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());

grant select, insert, update, delete on public.inventory_issues to authenticated;
grant select, insert, update, delete on public.inventory_issue_lines to authenticated;
