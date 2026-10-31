-- Illuminate — AUTOMATIC supply deduction when a service/session is Finished/Completed
-- Run in Supabase SQL Editor (safe to re-run).
--
-- After this migration:
-- • Marking client_session_slots.status = 'finished' → deduct linked supplies (once)
-- • Marking appointments.status = 'completed' → deduct linked supplies (once)
-- Works from Client Sessions, Appointments calendar, Installments, etc.

-- ---------------------------------------------------------------------------
-- A) Allow usage log keyed by session slot (not only appointment)
-- ---------------------------------------------------------------------------
alter table public.inventory_treatment_usage
  alter column appointment_id drop not null;

alter table public.inventory_treatment_usage
  add column if not exists session_slot_id uuid references public.client_session_slots (id) on delete restrict;

create unique index if not exists inventory_treatment_usage_slot_uidx
  on public.inventory_treatment_usage (session_slot_id)
  where session_slot_id is not null;

do $$
begin
  alter table public.inventory_treatment_usage
    drop constraint if exists inventory_treatment_usage_source_chk;
  alter table public.inventory_treatment_usage
    add constraint inventory_treatment_usage_source_chk
    check (appointment_id is not null or session_slot_id is not null);
exception
  when undefined_table then null;
end $$;

-- ---------------------------------------------------------------------------
-- B) Core: deduct BOM for a catalog service (idempotent by appointment or slot)
-- ---------------------------------------------------------------------------
create or replace function public.deduct_linked_supplies(
  p_service_id uuid,
  p_service_name text,
  p_customer_name text,
  p_branch_id uuid default null,
  p_appointment_id uuid default null,
  p_session_slot_id uuid default null,
  p_actor_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  svc public.services%rowtype;
  uid uuid := auth.uid();
  actor_name text := nullif(trim(p_actor_name), '');
  usage_id uuid;
  already uuid;
  link record;
  item public.inventory_items%rowtype;
  need numeric(12,2);
  shortfalls jsonb := '[]'::jsonb;
  lines_json jsonb := '[]'::jsonb;
  stock_before numeric(12,2);
  stock_after numeric(12,2);
  match_name text;
begin
  if p_appointment_id is not null then
    select id into already
    from public.inventory_treatment_usage
    where appointment_id = p_appointment_id;
    if already is not null then
      return jsonb_build_object('ok', true, 'deducted', false, 'already_deducted', true);
    end if;
  end if;

  if p_session_slot_id is not null then
    select id into already
    from public.inventory_treatment_usage
    where session_slot_id = p_session_slot_id;
    if already is not null then
      return jsonb_build_object('ok', true, 'deducted', false, 'already_deducted', true);
    end if;
  end if;

  if p_service_id is not null then
    select * into svc from public.services s where s.id = p_service_id;
  end if;

  if svc.id is null and coalesce(trim(p_service_name), '') <> '' then
    select * into svc
    from public.services s
    where lower(trim(s.name)) = lower(trim(p_service_name))
    order by s.active desc nulls last
    limit 1;
  end if;

  if svc.id is null and coalesce(trim(p_service_name), '') <> '' then
    match_name := trim(regexp_replace(p_service_name, '\s*[·•]\s*Session\s*\d+.*$', '', 'i'));
    if match_name <> '' then
      select * into svc
      from public.services s
      where lower(trim(s.name)) = lower(match_name)
      order by s.active desc nulls last
      limit 1;
    end if;
  end if;

  if svc.id is null and coalesce(trim(p_service_name), '') <> '' then
    select * into svc
    from public.services s
    where length(trim(s.name)) >= 3
      and lower(trim(p_service_name)) like lower(trim(s.name)) || '%'
    order by length(s.name) desc, s.active desc nulls last
    limit 1;
  end if;

  if svc.id is null then
    return jsonb_build_object(
      'ok', true,
      'deducted', false,
      'message', 'No catalog service match — no supplies deducted.'
    );
  end if;

  if not exists (select 1 from public.service_inventory si where si.service_id = svc.id) then
    return jsonb_build_object(
      'ok', true,
      'deducted', false,
      'message', format('No supplies linked to “%s”.', svc.name)
    );
  end if;

  if actor_name is null and uid is not null then
    select pr.full_name into actor_name from public.profiles pr where pr.id = uid;
  end if;
  actor_name := coalesce(actor_name, 'Staff');

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
        'name', 'Missing item',
        'required', need,
        'available', 0,
        'reason', 'Item not found or deleted'
      ));
      continue;
    end if;

    if coalesce(item.stock, 0) < need then
      shortfalls := shortfalls || jsonb_build_array(jsonb_build_object(
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
      'error', 'Insufficient stock for linked supplies. Restock before marking Finished/Completed.',
      'shortfalls', shortfalls
    );
  end if;

  insert into public.inventory_treatment_usage (
    appointment_id, session_slot_id, branch_id, service_id, service_name, customer_name,
    completed_by, completed_by_name
  ) values (
    p_appointment_id,
    p_session_slot_id,
    p_branch_id,
    svc.id,
    coalesce(svc.name, p_service_name, 'Service'),
    coalesce(nullif(trim(p_customer_name), ''), 'Client'),
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

    update public.inventory_items set stock = stock_after where id = item.id;

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

  return jsonb_build_object(
    'ok', true,
    'deducted', true,
    'usage_id', usage_id,
    'lines', lines_json,
    'message', 'Supplies deducted from inventory.'
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'deducted', false, 'already_deducted', true);
end;
$$;

revoke all on function public.deduct_linked_supplies(uuid, text, text, uuid, uuid, uuid, text) from public;
grant execute on function public.deduct_linked_supplies(uuid, text, text, uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- C) Trigger: client session slot → Finished
-- ---------------------------------------------------------------------------
create or replace function public.trg_session_slot_auto_deduct()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pkg public.client_session_packages%rowtype;
  result jsonb;
begin
  if new.status is distinct from 'finished' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'finished' then
    return new;
  end if;

  select * into pkg from public.client_session_packages where id = new.package_id;
  if not found then
    return new;
  end if;

  result := public.deduct_linked_supplies(
    pkg.service_id,
    pkg.service_name,
    pkg.customer_name,
    pkg.branch_id,
    null,
    new.id,
    coalesce(new.handled_by, pkg.administered_by, 'Staff')
  );

  if coalesce((result ->> 'ok')::boolean, false) is not true then
    raise exception '%', coalesce(result ->> 'error', 'Could not deduct supplies for finished session.');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_session_slot_auto_deduct on public.client_session_slots;
create trigger trg_session_slot_auto_deduct
  after insert or update of status on public.client_session_slots
  for each row
  execute function public.trg_session_slot_auto_deduct();

-- ---------------------------------------------------------------------------
-- D) Trigger: appointment → Completed
-- ---------------------------------------------------------------------------
create or replace function public.trg_appointment_auto_deduct()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  svc_id uuid;
  note text := coalesce(new.special_note, '');
begin
  if new.status is distinct from 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'completed' then
    return new;
  end if;

  -- Package session calendar rows are deducted by the session-slot trigger
  -- (avoids double deduct when Finished syncs a Completed appointment).
  if note ~* '\[session_slot:' then
    return new;
  end if;

  result := public.deduct_linked_supplies(
    svc_id,
    new.service_name,
    new.customer_name,
    new.branch_id,
    new.id,
    null,
    coalesce(new.staff_name, 'Staff')
  );

  if coalesce((result ->> 'ok')::boolean, false) is not true then
    raise exception '%', coalesce(result ->> 'error', 'Could not deduct supplies for completed appointment.');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_appointment_auto_deduct on public.appointments;
create trigger trg_appointment_auto_deduct
  after insert or update of status on public.appointments
  for each row
  execute function public.trg_appointment_auto_deduct();

comment on function public.deduct_linked_supplies is
  'Deducts service_inventory BOM once per appointment or session slot.';
comment on function public.trg_session_slot_auto_deduct is
  'Auto-deduct inventory when a client session is marked Finished.';
comment on function public.trg_appointment_auto_deduct is
  'Auto-deduct inventory when an appointment is marked Completed.';
