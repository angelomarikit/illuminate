-- Illuminate — Treatment ↔ inventory linking fixes + auto-deduct on Completed
-- Run in Supabase SQL Editor (safe to re-run).
--
-- 1) Ensures service_inventory is usable by Owner/Admin/Inventory
-- 2) Logs every auto-deduction (inventory_treatment_usage + lines)
-- 3) RPC complete_appointment_with_supplies: validates stock, deducts once, marks completed

-- ---------------------------------------------------------------------------
-- A) Harden service_inventory RLS (write = inventory access; read = clinic)
-- ---------------------------------------------------------------------------
alter table public.service_inventory enable row level security;

drop policy if exists "inventory_access_service_inventory" on public.service_inventory;
create policy "inventory_access_service_inventory"
  on public.service_inventory for all to authenticated
  using (public.is_inventory_access())
  with check (public.is_inventory_access());

drop policy if exists "clinic_read_service_inventory" on public.service_inventory;
create policy "clinic_read_service_inventory"
  on public.service_inventory for select to authenticated
  using (
    public.is_inventory_access()
    or public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

grant select, insert, update, delete on public.service_inventory to authenticated;

-- ---------------------------------------------------------------------------
-- B) Usage / transaction log (idempotent per appointment)
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_treatment_usage (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete restrict,
  branch_id uuid references public.branches (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  service_name text not null,
  customer_name text not null,
  completed_at timestamptz not null default now(),
  completed_by uuid references public.profiles (id) on delete set null,
  completed_by_name text,
  notes text,
  unique (appointment_id)
);

create table if not exists public.inventory_treatment_usage_lines (
  id uuid primary key default gen_random_uuid(),
  usage_id uuid not null references public.inventory_treatment_usage (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  item_name text not null,
  item_sku text,
  item_unit text,
  qty_deducted numeric(12,2) not null check (qty_deducted > 0),
  stock_before numeric(12,2) not null,
  stock_after numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_treatment_usage_completed_idx
  on public.inventory_treatment_usage (completed_at desc);

create index if not exists inventory_treatment_usage_lines_usage_idx
  on public.inventory_treatment_usage_lines (usage_id);

alter table public.inventory_treatment_usage enable row level security;
alter table public.inventory_treatment_usage_lines enable row level security;

drop policy if exists "treatment_usage_select" on public.inventory_treatment_usage;
create policy "treatment_usage_select"
  on public.inventory_treatment_usage for select to authenticated
  using (
    public.is_inventory_access()
    or public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

drop policy if exists "treatment_usage_lines_select" on public.inventory_treatment_usage_lines;
create policy "treatment_usage_lines_select"
  on public.inventory_treatment_usage_lines for select to authenticated
  using (
    public.is_inventory_access()
    or public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

-- Inserts only via security-definer RPC
drop policy if exists "treatment_usage_no_direct_write" on public.inventory_treatment_usage;
create policy "treatment_usage_no_direct_write"
  on public.inventory_treatment_usage for insert to authenticated
  with check (false);

drop policy if exists "treatment_usage_lines_no_direct_write" on public.inventory_treatment_usage_lines;
create policy "treatment_usage_lines_no_direct_write"
  on public.inventory_treatment_usage_lines for insert to authenticated
  with check (false);

grant select on public.inventory_treatment_usage to authenticated;
grant select on public.inventory_treatment_usage_lines to authenticated;

-- ---------------------------------------------------------------------------
-- C) RPC: complete appointment + deduct linked supplies (once)
-- ---------------------------------------------------------------------------
create or replace function public.complete_appointment_with_supplies(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  apt public.appointments%rowtype;
  svc public.services%rowtype;
  uid uuid := auth.uid();
  actor_name text;
  actor_role text;
  usage_id uuid;
  link record;
  item public.inventory_items%rowtype;
  need numeric(12,2);
  shortfalls jsonb := '[]'::jsonb;
  lines_json jsonb := '[]'::jsonb;
  stock_before numeric(12,2);
  stock_after numeric(12,2);
  already uuid;
begin
  if p_appointment_id is null then
    return jsonb_build_object('ok', false, 'error', 'Missing appointment id.');
  end if;

  -- Clinic or inventory roles may complete
  if public.current_app_role() not in (
    'Owner', 'Admin', 'Receptionist', 'Staff', 'Inventory'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized to complete treatments.');
  end if;

  select * into apt from public.appointments where id = p_appointment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Appointment not found.');
  end if;

  if apt.status = 'cancelled' or apt.status = 'declined' then
    return jsonb_build_object('ok', false, 'error', 'Cannot complete a cancelled/declined appointment.');
  end if;

  -- Idempotent: already deducted for this appointment
  select id into already
  from public.inventory_treatment_usage
  where appointment_id = p_appointment_id;
  if already is not null then
    if apt.status is distinct from 'completed' then
      update public.appointments set status = 'completed' where id = p_appointment_id;
    end if;
    return jsonb_build_object(
      'ok', true,
      'deducted', false,
      'already_deducted', true,
      'message', 'Supplies were already deducted for this treatment. Status set to completed.'
    );
  end if;

  if uid is not null then
    select pr.full_name, pr.role into actor_name, actor_role
    from public.profiles pr where pr.id = uid;
  end if;
  actor_name := coalesce(nullif(trim(actor_name), ''), 'Staff');
  actor_role := coalesce(nullif(trim(actor_role), ''), public.current_app_role());

  -- Match catalog service by exact name (trim/case-insensitive)
  select * into svc
  from public.services s
  where lower(trim(s.name)) = lower(trim(apt.service_name))
  order by s.active desc nulls last
  limit 1;

  -- No linked BOM → just complete
  if svc.id is null then
    update public.appointments set status = 'completed' where id = p_appointment_id;
    return jsonb_build_object(
      'ok', true,
      'deducted', false,
      'message', 'Treatment completed. No catalog service match — no supplies deducted.'
    );
  end if;

  if not exists (
    select 1 from public.service_inventory si where si.service_id = svc.id
  ) then
    update public.appointments set status = 'completed' where id = p_appointment_id;
    return jsonb_build_object(
      'ok', true,
      'deducted', false,
      'message', 'Treatment completed. No supplies linked to this service.'
    );
  end if;

  -- Validate stock (prefer same branch, else any active SKU with that id)
  for link in
    select si.inventory_item_id, si.qty_per_service
    from public.service_inventory si
    where si.service_id = svc.id
  loop
    need := greatest(0.01, coalesce(link.qty_per_service, 1));

    select * into item
    from public.inventory_items i
    where i.id = link.inventory_item_id
      and (to_jsonb(i) ->> 'deleted_at') is null
    for update;

    if not found then
      shortfalls := shortfalls || jsonb_build_array(jsonb_build_object(
        'inventory_item_id', link.inventory_item_id,
        'name', 'Missing item',
        'required', need,
        'available', 0,
        'reason', 'Item not found or deleted'
      ));
      continue;
    end if;

    -- Soft branch check: if appointment has branch and item has different branch, still allow
    -- but prefer warning when stock insufficient
    if coalesce(item.stock, 0) < need then
      shortfalls := shortfalls || jsonb_build_array(jsonb_build_object(
        'inventory_item_id', item.id,
        'name', item.name,
        'sku', item.sku,
        'unit', item.unit,
        'required', need,
        'available', coalesce(item.stock, 0)
      ));
    end if;
  end loop;

  if jsonb_array_length(shortfalls) > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Insufficient stock for linked supplies.',
      'shortfalls', shortfalls
    );
  end if;

  -- Create usage header
  insert into public.inventory_treatment_usage (
    appointment_id, branch_id, service_id, service_name, customer_name,
    completed_by, completed_by_name
  ) values (
    apt.id,
    apt.branch_id,
    svc.id,
    coalesce(svc.name, apt.service_name),
    apt.customer_name,
    uid,
    actor_name
  )
  returning id into usage_id;

  -- Deduct
  for link in
    select si.inventory_item_id, si.qty_per_service
    from public.service_inventory si
    where si.service_id = svc.id
  loop
    need := greatest(0.01, coalesce(link.qty_per_service, 1));

    select * into item
    from public.inventory_items i
    where i.id = link.inventory_item_id
      and (to_jsonb(i) ->> 'deleted_at') is null
    for update;

    stock_before := coalesce(item.stock, 0);
    stock_after := stock_before - need;

    update public.inventory_items
    set stock = stock_after
    where id = item.id;

    insert into public.inventory_treatment_usage_lines (
      usage_id, inventory_item_id, item_name, item_sku, item_unit,
      qty_deducted, stock_before, stock_after
    ) values (
      usage_id, item.id, item.name, item.sku, item.unit,
      need, stock_before, stock_after
    );

    lines_json := lines_json || jsonb_build_array(jsonb_build_object(
      'name', item.name,
      'qty', need,
      'unit', item.unit,
      'stock_after', stock_after
    ));
  end loop;

  update public.appointments set status = 'completed' where id = p_appointment_id;

  return jsonb_build_object(
    'ok', true,
    'deducted', true,
    'usage_id', usage_id,
    'lines', lines_json,
    'message', 'Treatment completed and supplies deducted from inventory.'
  );
exception
  when unique_violation then
    -- Race: another request already logged usage
    update public.appointments set status = 'completed' where id = p_appointment_id;
    return jsonb_build_object(
      'ok', true,
      'deducted', false,
      'already_deducted', true,
      'message', 'Supplies already deducted (concurrent complete). Status set to completed.'
    );
end;
$$;

revoke all on function public.complete_appointment_with_supplies(uuid) from public;
grant execute on function public.complete_appointment_with_supplies(uuid) to authenticated;

comment on function public.complete_appointment_with_supplies(uuid) is
  'Marks appointment completed and deducts service_inventory BOM once; returns shortfalls if stock is insufficient.';
