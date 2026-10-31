-- Illuminate — Attribute treatment deducts to the VISIT date (not save time)
-- Run in Supabase SQL Editor (safe to re-run).
--
-- Bug: marking Sessions 1–3 Finished on Oct 31 stamped completed_at = now() for all,
-- so Stock Assessment Out stayed 0 on Oct 29 / 30.
-- Fix: usage_date = scheduled_date / appointment_date; backfill + repair missing deducts.

-- ---------------------------------------------------------------------------
-- A) usage_date = calendar day of the treatment
-- ---------------------------------------------------------------------------
alter table public.inventory_treatment_usage
  add column if not exists usage_date date;

comment on column public.inventory_treatment_usage.usage_date is
  'Visit / service date for Stock Assessment Out (session scheduled_date or appointment_date).';

-- Backfill from linked session slot
update public.inventory_treatment_usage u
set usage_date = s.scheduled_date
from public.client_session_slots s
where u.session_slot_id = s.id
  and u.usage_date is null
  and s.scheduled_date is not null;

-- Backfill from linked appointment
update public.inventory_treatment_usage u
set usage_date = a.appointment_date
from public.appointments a
where u.appointment_id = a.id
  and u.usage_date is null
  and a.appointment_date is not null;

-- Fallback: date of completed_at
update public.inventory_treatment_usage
set usage_date = (timezone('Asia/Manila', completed_at))::date
where usage_date is null;

create index if not exists inventory_treatment_usage_usage_date_idx
  on public.inventory_treatment_usage (usage_date desc);

-- ---------------------------------------------------------------------------
-- B) deduct_linked_supplies — accept p_usage_date
-- ---------------------------------------------------------------------------
drop function if exists public.deduct_linked_supplies(uuid, text, text, uuid, uuid, uuid, text);

create or replace function public.deduct_linked_supplies(
  p_service_id uuid,
  p_service_name text,
  p_customer_name text,
  p_branch_id uuid default null,
  p_appointment_id uuid default null,
  p_session_slot_id uuid default null,
  p_actor_name text default null,
  p_usage_date date default null
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
  v_usage_date date := p_usage_date;
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

  if v_usage_date is null and p_session_slot_id is not null then
    select scheduled_date into v_usage_date
    from public.client_session_slots where id = p_session_slot_id;
  end if;
  if v_usage_date is null and p_appointment_id is not null then
    select appointment_date into v_usage_date
    from public.appointments where id = p_appointment_id;
  end if;
  v_usage_date := coalesce(v_usage_date, (timezone('Asia/Manila', now()))::date);

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
    completed_by, completed_by_name, usage_date, completed_at
  ) values (
    p_appointment_id,
    p_session_slot_id,
    p_branch_id,
    svc.id,
    coalesce(svc.name, p_service_name, 'Service'),
    coalesce(nullif(trim(p_customer_name), ''), 'Client'),
    uid,
    actor_name,
    v_usage_date,
    -- Stamp completed_at at noon Manila on the visit date so date filters stay on that day
    ((v_usage_date::text || 'T12:00:00')::timestamp at time zone 'Asia/Manila')
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
    'usage_date', v_usage_date,
    'lines', lines_json,
    'message', 'Supplies deducted from inventory.'
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'deducted', false, 'already_deducted', true);
end;
$$;

revoke all on function public.deduct_linked_supplies(uuid, text, text, uuid, uuid, uuid, text, date) from public;
grant execute on function public.deduct_linked_supplies(uuid, text, text, uuid, uuid, uuid, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- C) Triggers pass scheduled_date / appointment_date
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
    coalesce(new.handled_by, pkg.administered_by, 'Staff'),
    coalesce(new.scheduled_date, (timezone('Asia/Manila', now()))::date)
  );

  if coalesce((result ->> 'ok')::boolean, false) is not true then
    raise exception '%', coalesce(result ->> 'error', 'Could not deduct supplies for finished session.');
  end if;

  return new;
end;
$$;

create or replace function public.trg_appointment_auto_deduct()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  note text := coalesce(new.special_note, '');
begin
  if new.status is distinct from 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'completed' then
    return new;
  end if;

  if note ~* '\[session_slot:' then
    return new;
  end if;

  result := public.deduct_linked_supplies(
    null,
    new.service_name,
    new.customer_name,
    new.branch_id,
    new.id,
    null,
    coalesce(new.staff_name, 'Staff'),
    coalesce(new.appointment_date, (timezone('Asia/Manila', now()))::date)
  );

  if coalesce((result ->> 'ok')::boolean, false) is not true then
    raise exception '%', coalesce(result ->> 'error', 'Could not deduct supplies for completed appointment.');
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- D) Repair: deduct for Finished slots that never got a usage row
--     (safe / idempotent — skips slots that already have usage)
-- ---------------------------------------------------------------------------
create or replace function public.repair_finished_session_supply_deductions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  slot record;
  pkg public.client_session_packages%rowtype;
  result jsonb;
  done int := 0;
  skipped int := 0;
  failed int := 0;
  details jsonb := '[]'::jsonb;
begin
  for slot in
    select s.*
    from public.client_session_slots s
    where s.status = 'finished'
      and not exists (
        select 1 from public.inventory_treatment_usage u
        where u.session_slot_id = s.id
      )
    order by s.scheduled_date nulls last, s.session_number
  loop
    select * into pkg from public.client_session_packages where id = slot.package_id;
    if not found then
      skipped := skipped + 1;
      continue;
    end if;

    result := public.deduct_linked_supplies(
      pkg.service_id,
      pkg.service_name,
      pkg.customer_name,
      pkg.branch_id,
      null,
      slot.id,
      coalesce(slot.handled_by, pkg.administered_by, 'Repair'),
      coalesce(slot.scheduled_date, (timezone('Asia/Manila', now()))::date)
    );

    if coalesce((result ->> 'ok')::boolean, false) and coalesce((result ->> 'deducted')::boolean, false) then
      done := done + 1;
      details := details || jsonb_build_array(jsonb_build_object(
        'slot_id', slot.id,
        'date', coalesce(slot.scheduled_date, (timezone('Asia/Manila', now()))::date),
        'service', pkg.service_name,
        'customer', pkg.customer_name
      ));
    elsif coalesce((result ->> 'already_deducted')::boolean, false) then
      skipped := skipped + 1;
    elsif coalesce((result ->> 'ok')::boolean, false) then
      skipped := skipped + 1;
    else
      failed := failed + 1;
      details := details || jsonb_build_array(jsonb_build_object(
        'slot_id', slot.id,
        'error', result ->> 'error'
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'deducted_count', done,
    'skipped_count', skipped,
    'failed_count', failed,
    'details', details
  );
end;
$$;

revoke all on function public.repair_finished_session_supply_deductions() from public;
grant execute on function public.repair_finished_session_supply_deductions() to authenticated;

-- Fix existing usage rows that have wrong completed_at (save day) but known visit date
update public.inventory_treatment_usage u
set
  usage_date = s.scheduled_date,
  completed_at = ((s.scheduled_date::text || 'T12:00:00')::timestamp at time zone 'Asia/Manila')
from public.client_session_slots s
where u.session_slot_id = s.id
  and s.scheduled_date is not null
  and (
    u.usage_date is distinct from s.scheduled_date
    or (timezone('Asia/Manila', u.completed_at))::date is distinct from s.scheduled_date
  );

-- Run repair once for Finished sessions missing usage (Dannelyn 29/30/31 etc.)
select public.repair_finished_session_supply_deductions();
