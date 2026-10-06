-- Illuminate — Inventory persistence (catalog prices + stock assessment endings)
-- Run in Supabase SQL Editor after add_inventory_role.sql / add_inventory_issues.sql
--
-- Fixes:
-- 1) unit_cost + selling_price on inventory_items (catalog prices)
-- 2) inventory_assessment_endings — period Ending Inventory for Stock Assessment
-- 3) Explicit grants + clinic read so catalog updates/reads are reliable

-- ========== 1) Catalog price columns ==========
alter table public.inventory_items
  add column if not exists unit_cost numeric(12,2) not null default 0;

alter table public.inventory_items
  add column if not exists selling_price numeric(12,2) not null default 0;

comment on column public.inventory_items.unit_cost is 'Last / standard unit cost for the SKU';
comment on column public.inventory_items.selling_price is 'Retail / selling price when applicable';

-- Ensure authenticated can read/write catalog (RLS still applies)
grant select, insert, update, delete on public.inventory_items to authenticated;

-- Clinic staff may read stock levels (Dashboard / low-stock alerts); only inventory roles write
drop policy if exists "clinic_read_inventory_items" on public.inventory_items;
create policy "clinic_read_inventory_items"
  on public.inventory_items for select to authenticated
  using (public.is_clinic_user());

-- Keep write policy for Inventory / Owner / Admin
drop policy if exists "inventory_write_inventory_items" on public.inventory_items;
create policy "inventory_write_inventory_items"
  on public.inventory_items for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());

-- ========== 2) Stock Assessment ending inventory (period counts) ==========
create table if not exists public.inventory_assessment_endings (
  id uuid primary key default gen_random_uuid(),
  -- Normalized branch key so UNIQUE works when branch_id is null (all-branches view)
  branch_key uuid not null default '00000000-0000-0000-0000-000000000000',
  branch_id uuid references public.branches (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  ending_qty integer not null default 0 check (ending_qty >= 0),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint inventory_assessment_endings_period_check check (period_end >= period_start),
  unique (branch_key, period_start, period_end, inventory_item_id)
);

create index if not exists inventory_assessment_endings_period_idx
  on public.inventory_assessment_endings (branch_key, period_start, period_end);

create index if not exists inventory_assessment_endings_item_idx
  on public.inventory_assessment_endings (inventory_item_id);

alter table public.inventory_assessment_endings enable row level security;

drop policy if exists "inventory_access_assessment_endings" on public.inventory_assessment_endings;
create policy "inventory_access_assessment_endings"
  on public.inventory_assessment_endings for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());

grant select, insert, update, delete on public.inventory_assessment_endings to authenticated;
