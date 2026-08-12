-- Illuminate — Inventory Specialist role + stock ops
-- Run after add_hr_role.sql (and core setup).
-- Role: Inventory — stock catalog, stocktake, receiving, reorder (also Owner/Admin).

-- 1) Allow Inventory on profiles.role
update public.profiles
set role = 'Staff'
where role is null
   or role not in ('Owner', 'Admin', 'Staff', 'HR', 'Inventory', 'Client');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('Owner', 'Admin', 'Staff', 'HR', 'Inventory', 'Client'));

-- 2) Helpers
create or replace function public.is_clinic_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('Owner', 'Admin', 'Staff', 'HR', 'Inventory');
$$;

create or replace function public.is_inventory_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('Owner', 'Admin', 'Inventory');
$$;

revoke all on function public.is_inventory_access() from public;
grant execute on function public.is_inventory_access() to authenticated;
grant execute on function public.is_clinic_user() to authenticated;

-- Signup cannot self-assign Inventory / HR / Owner / Admin
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
  if requested_role in ('Owner', 'Admin', 'HR', 'Inventory', 'Client') then
    safe_role := 'Staff';
  elsif requested_role = 'Staff' then
    safe_role := 'Staff';
  else
    safe_role := 'Staff';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    safe_role
  );
  return new;
end;
$$;

-- 3) Link inventory items ↔ clinic services (BOM / usage)
create table if not exists public.service_inventory (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  qty_per_service numeric(12,2) not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  unique (service_id, inventory_item_id)
);

create index if not exists service_inventory_service_idx on public.service_inventory (service_id);
create index if not exists service_inventory_item_idx on public.service_inventory (inventory_item_id);

alter table public.service_inventory enable row level security;
drop policy if exists "inventory_access_service_inventory" on public.service_inventory;
create policy "inventory_access_service_inventory"
  on public.service_inventory for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());
grant select, insert, update, delete on public.service_inventory to authenticated;

-- Clinic staff may read links (POS awareness); only inventory roles write
drop policy if exists "clinic_read_service_inventory" on public.service_inventory;
create policy "clinic_read_service_inventory"
  on public.service_inventory for select to authenticated
  using (public.is_clinic_user());

-- 4) Receiving log
create table if not exists public.inventory_receipts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete set null,
  received_at date not null default (timezone('utc', now()))::date,
  supplier text,
  reference_no text,
  notes text,
  received_by text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.inventory_receipts (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  qty integer not null check (qty > 0),
  unit_cost numeric(12,2) not null default 0,
  lot_no text,
  expiry date,
  created_at timestamptz not null default now()
);

create index if not exists inventory_receipts_branch_idx on public.inventory_receipts (branch_id, received_at desc);
create index if not exists inventory_receipt_lines_receipt_idx on public.inventory_receipt_lines (receipt_id);

alter table public.inventory_receipts enable row level security;
alter table public.inventory_receipt_lines enable row level security;

drop policy if exists "inventory_access_receipts" on public.inventory_receipts;
create policy "inventory_access_receipts"
  on public.inventory_receipts for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());

drop policy if exists "inventory_access_receipt_lines" on public.inventory_receipt_lines;
create policy "inventory_access_receipt_lines"
  on public.inventory_receipt_lines for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());

grant select, insert, update, delete on public.inventory_receipts to authenticated;
grant select, insert, update, delete on public.inventory_receipt_lines to authenticated;

-- 5) Stocktaking / cycle counting
create table if not exists public.inventory_stocktakes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'completed', 'cancelled')),
  counted_on date not null default (timezone('utc', now()))::date,
  notes text,
  counted_by text,
  created_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  stocktake_id uuid not null references public.inventory_stocktakes (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  system_qty integer not null default 0,
  counted_qty integer,
  notes text,
  created_at timestamptz not null default now(),
  unique (stocktake_id, inventory_item_id)
);

create index if not exists inventory_stocktakes_branch_idx
  on public.inventory_stocktakes (branch_id, counted_on desc);

alter table public.inventory_stocktakes enable row level security;
alter table public.inventory_stocktake_lines enable row level security;

drop policy if exists "inventory_access_stocktakes" on public.inventory_stocktakes;
create policy "inventory_access_stocktakes"
  on public.inventory_stocktakes for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());

drop policy if exists "inventory_access_stocktake_lines" on public.inventory_stocktake_lines;
create policy "inventory_access_stocktake_lines"
  on public.inventory_stocktake_lines for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());

grant select, insert, update, delete on public.inventory_stocktakes to authenticated;
grant select, insert, update, delete on public.inventory_stocktake_lines to authenticated;

-- 6) Reorder requests
create table if not exists public.inventory_reorder_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete set null,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  qty_requested integer not null check (qty_requested > 0),
  status text not null default 'open'
    check (status in ('open', 'ordered', 'received', 'cancelled')),
  notes text,
  requested_by text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_reorder_status_idx
  on public.inventory_reorder_requests (status, created_at desc);

alter table public.inventory_reorder_requests enable row level security;
drop policy if exists "inventory_access_reorders" on public.inventory_reorder_requests;
create policy "inventory_access_reorders"
  on public.inventory_reorder_requests for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());
grant select, insert, update, delete on public.inventory_reorder_requests to authenticated;

-- 7) Tighten inventory_items to Inventory Specialist + Owner/Admin only
drop policy if exists "auth_all_inventory_items" on public.inventory_items;
drop policy if exists "inventory_write_inventory_items" on public.inventory_items;
drop policy if exists "inventory_read_inventory_items" on public.inventory_items;
drop policy if exists "clinic_read_inventory_items" on public.inventory_items;

create policy "inventory_write_inventory_items"
  on public.inventory_items for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());

-- Inventory specialists need to read active services when linking supplies
drop policy if exists "inventory_read_services" on public.services;
create policy "inventory_read_services"
  on public.services for select to authenticated
  using (public.is_inventory_access() or public.is_clinic_user());
