-- Illuminate — Stocktake line product snapshots + soft-delete inventory items
-- Run in Supabase SQL Editor after add_inventory_role.sql
-- Enables: delete item from stocktake with history; past stocktakes show product names.

-- 1) Soft-delete flag on catalog items (keeps past stocktake / receipt FKs intact)
alter table public.inventory_items
  add column if not exists deleted_at timestamptz;

create index if not exists inventory_items_active_idx
  on public.inventory_items (branch_id, name)
  where deleted_at is null;

-- 2) Snapshot product fields on stocktake lines (survive renames / soft-deletes)
alter table public.inventory_stocktake_lines
  add column if not exists item_name text;

alter table public.inventory_stocktake_lines
  add column if not exists item_sku text;

alter table public.inventory_stocktake_lines
  add column if not exists item_unit text;

alter table public.inventory_stocktake_lines
  add column if not exists line_action text;

update public.inventory_stocktake_lines
set line_action = 'counted'
where line_action is null;

alter table public.inventory_stocktake_lines
  alter column line_action set default 'counted';

alter table public.inventory_stocktake_lines
  drop constraint if exists inventory_stocktake_lines_line_action_check;

alter table public.inventory_stocktake_lines
  add constraint inventory_stocktake_lines_line_action_check
  check (line_action in ('counted', 'deleted'));

-- Backfill names from current catalog where possible
update public.inventory_stocktake_lines as l
set
  item_name = coalesce(l.item_name, i.name),
  item_sku = coalesce(l.item_sku, i.sku),
  item_unit = coalesce(l.item_unit, i.unit)
from public.inventory_items as i
where i.id = l.inventory_item_id
  and (l.item_name is null or l.item_sku is null or l.item_unit is null);
