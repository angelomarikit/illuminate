-- Illuminate — Never let activity-log failures block a new booking from saving
-- Run in Supabase SQL Editor (safe to re-run).
--
-- Symptom: "Booking created" can appear while the day board stays empty when the
-- AFTER INSERT tracker raises (missing table / FK) and rolls back the appointment.
-- This version stamps booked_by as before, but catches activity_log errors so the
-- appointment row always commits.

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
    begin
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
    exception when others then
      raise warning 'appointment_activity_log create failed for %: %', new.id, sqlerrm;
    end;
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
    if old.special_note is distinct from new.special_note then
      changed := changed || jsonb_build_object('special_note', true);
    end if;

    if changed = '{}'::jsonb then
      return new;
    end if;

    if old.status is distinct from new.status then
      if new.status = 'cancelled' then
        action_key := 'cancelled';
      elsif new.status = 'confirmed' and old.status = 'pending' then
        action_key := 'approved';
      elsif new.status = 'declined' then
        action_key := 'declined';
      elsif new.status = 'completed' then
        action_key := 'completed';
      else
        action_key := 'status_changed';
      end if;
      summary_text := format(
        'Status %s → %s · %s · %s',
        old.status,
        new.status,
        new.customer_name,
        new.appointment_date::text
      );
    elsif old.appointment_date is distinct from new.appointment_date
       or old.appointment_time is distinct from new.appointment_time then
      action_key := 'rescheduled';
      summary_text := format(
        'Rescheduled to %s at %s · %s',
        new.appointment_date::text,
        to_char(new.appointment_time, 'HH24:MI'),
        new.customer_name
      );
    else
      action_key := 'updated';
      summary_text := format('Booking updated · %s · %s', new.customer_name, new.service_name);
    end if;

    details_json := jsonb_build_object('changed', changed);

    begin
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
    exception when others then
      raise warning 'appointment_activity_log update failed for %: %', new.id, sqlerrm;
    end;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_appointments_booking_tracker_after on public.appointments;
create trigger trg_appointments_booking_tracker_after
  after insert or update on public.appointments
  for each row
  execute function public.appointments_booking_tracker_after_tg();
