-- Illuminate — Fix supply deduction for package sessions + stronger service matching
-- Run in Supabase SQL Editor (safe to re-run).
--
-- Problems fixed:
-- 1) Appointments named "Celebrity Drip · Session 1" failed exact catalog match
-- 2) Prefer explicit service_id when provided (from client_session_packages)
-- 3) Ensure service_inventory unique constraint for upsert linking

-- Unique BOM key (needed for Inventory page upsert onConflict)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_inventory_service_id_inventory_item_id_key'
      and conrelid = 'public.service_inventory'::regclass
  ) then
    alter table public.service_inventory
      add constraint service_inventory_service_id_inventory_item_id_key
      unique (service_id, inventory_item_id);
  end if;
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

drop function if exists public.complete_appointment_with_supplies(uuid);
drop function if exists public.complete_appointment_with_supplies(uuid, uuid);

create or replace function public.complete_appointment_with_supplies(
  p_appointment_id uuid,
  p_service_id uuid default null
)
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
  match_name text;
begin
  if p_appointment_id is null then
    return jsonb_build_object('ok', false, 'error', 'Missing appointment id.');
  end if;

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

  -- 1) Prefer explicit service_id (package / POS)
  if p_service_id is not null then
    select * into svc from public.services s where s.id = p_service_id;
  end if;

  -- 2) Exact name match
  if svc.id is null then
    select * into svc
    from public.services s
    where lower(trim(s.name)) = lower(trim(apt.service_name))
    order by s.active desc nulls last
    limit 1;
  end if;

  -- 3) Strip " · Session N" (and similar) then match
  if svc.id is null then
    match_name := trim(regexp_replace(coalesce(apt.service_name, ''), '\s*[·•]\s*Session\s*\d+.*$', '', 'i'));
    match_name := trim(regexp_replace(match_name, '\s*\(\s*Session\s*\d+\s*\).*$', '', 'i'));
    if match_name <> '' and lower(match_name) is distinct from lower(trim(apt.service_name)) then
      select * into svc
      from public.services s
      where lower(trim(s.name)) = lower(match_name)
      order by s.active desc nulls last
      limit 1;
    end if;
  end if;

  -- 4) Prefix: appointment starts with catalog name
  if svc.id is null then
    select * into svc
    from public.services s
    where length(trim(s.name)) >= 3
      and lower(trim(apt.service_name)) like lower(trim(s.name)) || '%'
    order by length(s.name) desc, s.active desc nulls last
    limit 1;
  end if;

  if svc.id is null then
    update public.appointments set status = 'completed' where id = p_appointment_id;
    return jsonb_build_object(
      'ok', true,
      'deducted', false,
      'message', 'Treatment completed. No catalog service match — no supplies deducted. Link the service in Inventory → Link item to clinic service.'
    );
  end if;

  if not exists (
    select 1 from public.service_inventory si where si.service_id = svc.id
  ) then
    update public.appointments set status = 'completed' where id = p_appointment_id;
    return jsonb_build_object(
      'ok', true,
      'deducted', false,
      'message', format(
        'Treatment completed. No supplies linked to “%s”. Link them under Inventory.',
        svc.name
      )
    );
  end if;

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
    update public.appointments set status = 'completed' where id = p_appointment_id;
    return jsonb_build_object(
      'ok', true,
      'deducted', false,
      'already_deducted', true,
      'message', 'Supplies already deducted (concurrent complete). Status set to completed.'
    );
end;
$$;

revoke all on function public.complete_appointment_with_supplies(uuid, uuid) from public;
grant execute on function public.complete_appointment_with_supplies(uuid, uuid) to authenticated;

-- RLS: ensure Owner/Admin/Inventory can write links (re-assert)
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
