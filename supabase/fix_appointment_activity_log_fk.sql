-- Illuminate — Fix booking tracker FK on new appointments
-- Run in Supabase SQL Editor (safe to re-run).
--
-- Cause: BEFORE INSERT trigger wrote appointment_activity_log while the
-- appointment row did not exist yet → appointment_activity_log_appointment_id_fkey.
-- Fix: stamp booked_by on BEFORE; write activity log on AFTER.

-- 1) BEFORE: stamp creator / preserve original (no activity_log writes)
create or replace function public.appointments_booking_tracker_before_tg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid;
  a_name text;
  a_role text;
begin
  select s.actor_id, s.actor_name, s.actor_role
    into a_id, a_name, a_role
  from public.appointment_actor_snapshot() s;

  if TG_OP = 'INSERT' then
    if new.booked_by_name is null or trim(new.booked_by_name) = '' then
      if coalesce(new.source, '') in ('web', 'website', 'landing') and a_id is null then
        new.booked_by_name := 'Website booking';
        new.booked_by_role := 'Public';
        new.booked_by_id := null;
      else
        new.booked_by_id := a_id;
        new.booked_by_name := a_name;
        new.booked_by_role := a_role;
      end if;
    end if;

    new.updated_at := coalesce(new.updated_at, now());
    new.last_modified_by_id := coalesce(new.last_modified_by_id, new.booked_by_id);
    new.last_modified_by_name := coalesce(new.last_modified_by_name, new.booked_by_name);
    new.last_modified_by_role := coalesce(new.last_modified_by_role, new.booked_by_role);
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    new.booked_by_id := old.booked_by_id;
    new.booked_by_name := old.booked_by_name;
    new.booked_by_role := old.booked_by_role;
    new.created_at := old.created_at;

    new.updated_at := now();
    new.last_modified_by_id := a_id;
    new.last_modified_by_name := a_name;
    new.last_modified_by_role := a_role;
    return new;
  end if;

  return new;
end;
$$;

-- 2) AFTER: append activity log (appointment row already exists)
create or replace function public.appointments_booking_tracker_after_tg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid;
  a_name text;
  a_role text;
  action_key text;
  summary_text text;
  details_json jsonb := '{}'::jsonb;
  changed jsonb := '{}'::jsonb;
begin
  select s.actor_id, s.actor_name, s.actor_role
    into a_id, a_name, a_role
  from public.appointment_actor_snapshot() s;

  if TG_OP = 'INSERT' then
    insert into public.appointment_activity_log (
      appointment_id, action, actor_id, actor_name, actor_role, summary, details
    ) values (
      new.id,
      'created',
      new.booked_by_id,
      new.booked_by_name,
      new.booked_by_role,
      format(
        'Booking created for %s · %s on %s at %s',
        new.customer_name,
        new.service_name,
        new.appointment_date::text,
        to_char(new.appointment_time, 'HH24:MI')
      ),
      jsonb_build_object(
        'customer_name', new.customer_name,
        'service_name', new.service_name,
        'appointment_date', new.appointment_date,
        'appointment_time', new.appointment_time,
        'status', new.status,
        'source', new.source,
        'type', new.type
      )
    );
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    if old.appointment_date is distinct from new.appointment_date
       or old.appointment_time is distinct from new.appointment_time then
      changed := changed || jsonb_build_object(
        'appointment_date', jsonb_build_object('from', old.appointment_date, 'to', new.appointment_date),
        'appointment_time', jsonb_build_object('from', old.appointment_time, 'to', new.appointment_time)
      );
    end if;
    if old.customer_name is distinct from new.customer_name then
      changed := changed || jsonb_build_object(
        'customer_name', jsonb_build_object('from', old.customer_name, 'to', new.customer_name)
      );
    end if;
    if old.service_name is distinct from new.service_name then
      changed := changed || jsonb_build_object(
        'service_name', jsonb_build_object('from', old.service_name, 'to', new.service_name)
      );
    end if;
    if old.staff_name is distinct from new.staff_name then
      changed := changed || jsonb_build_object(
        'staff_name', jsonb_build_object('from', old.staff_name, 'to', new.staff_name)
      );
    end if;
    if old.status is distinct from new.status then
      changed := changed || jsonb_build_object(
        'status', jsonb_build_object('from', old.status, 'to', new.status)
      );
    end if;
    if old.cancellation_reason is distinct from new.cancellation_reason then
      changed := changed || jsonb_build_object(
        'cancellation_reason', jsonb_build_object('from', old.cancellation_reason, 'to', new.cancellation_reason)
      );
    end if;
    if old.special_note is distinct from new.special_note then
      changed := changed || jsonb_build_object('special_note_changed', true);
    end if;
    if old.duration_min is distinct from new.duration_min then
      changed := changed || jsonb_build_object(
        'duration_min', jsonb_build_object('from', old.duration_min, 'to', new.duration_min)
      );
    end if;

    if changed = '{}'::jsonb then
      return new;
    end if;

    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      action_key := 'cancelled';
      summary_text := format(
        'Cancelled · %s · %s on %s',
        new.customer_name,
        new.service_name,
        new.appointment_date::text
      );
    elsif new.status = 'completed' and old.status is distinct from 'completed' then
      action_key := 'completed';
      summary_text := format('Marked completed · %s', new.customer_name);
    elsif new.status = 'confirmed' and old.status = 'pending' then
      action_key := 'approved';
      summary_text := format('Approved website booking · %s', new.customer_name);
    elsif new.status = 'declined' and old.status is distinct from 'declined' then
      action_key := 'declined';
      summary_text := format('Declined website booking · %s', new.customer_name);
    elsif old.appointment_date is distinct from new.appointment_date
       or old.appointment_time is distinct from new.appointment_time then
      action_key := 'rescheduled';
      summary_text := format(
        'Rescheduled · %s → %s %s',
        new.customer_name,
        new.appointment_date::text,
        to_char(new.appointment_time, 'HH24:MI')
      );
    elsif old.status is distinct from new.status then
      action_key := 'status_changed';
      summary_text := format('Status %s → %s · %s', old.status, new.status, new.customer_name);
    else
      action_key := 'updated';
      summary_text := format('Booking updated · %s', new.customer_name);
    end if;

    details_json := changed;

    insert into public.appointment_activity_log (
      appointment_id, action, actor_id, actor_name, actor_role, summary, details
    ) values (
      new.id,
      action_key,
      a_id,
      a_name,
      a_role,
      summary_text,
      details_json
    );

    return new;
  end if;

  return new;
end;
$$;

-- Replace broken BEFORE trigger that logged too early
drop trigger if exists trg_appointments_booking_tracker on public.appointments;
drop trigger if exists trg_appointments_booking_tracker_before on public.appointments;
drop trigger if exists trg_appointments_booking_tracker_after on public.appointments;

create trigger trg_appointments_booking_tracker_before
  before insert or update on public.appointments
  for each row
  execute function public.appointments_booking_tracker_before_tg();

create trigger trg_appointments_booking_tracker_after
  after insert or update on public.appointments
  for each row
  execute function public.appointments_booking_tracker_after_tg();
