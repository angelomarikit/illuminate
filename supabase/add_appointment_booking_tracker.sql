-- Illuminate — Appointment Booking Tracker (audit / accountability)
-- Run in Supabase SQL Editor (safe to re-run).
--
-- Captures who created each booking (name + role), creation timestamps (created_at),
-- and a full activity history for edits, reschedules, cancellations, and status changes.
-- Original booked_by_* and created_at are preserved on every update.

-- 1) Snapshot columns on appointments (never overwrite booked_by_* after insert)
alter table public.appointments
  add column if not exists booked_by_id uuid references public.profiles (id) on delete set null;

alter table public.appointments
  add column if not exists booked_by_name text;

alter table public.appointments
  add column if not exists booked_by_role text;

alter table public.appointments
  add column if not exists updated_at timestamptz not null default now();

alter table public.appointments
  add column if not exists last_modified_by_id uuid references public.profiles (id) on delete set null;

alter table public.appointments
  add column if not exists last_modified_by_name text;

alter table public.appointments
  add column if not exists last_modified_by_role text;

comment on column public.appointments.booked_by_name is
  'Display name of the user who created the booking (snapshot; preserved on edit).';
comment on column public.appointments.booked_by_role is
  'Role of the user who created the booking (snapshot; preserved on edit).';
comment on column public.appointments.created_at is
  'Backend timestamp when the booking row was created.';

-- 2) Activity / audit log
create table if not exists public.appointment_activity_log (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  action text not null
    check (action in (
      'created',
      'updated',
      'rescheduled',
      'cancelled',
      'status_changed',
      'approved',
      'declined',
      'completed'
    )),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text,
  actor_role text,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists appointment_activity_log_appt_idx
  on public.appointment_activity_log (appointment_id, created_at desc);

create index if not exists appointment_activity_log_created_idx
  on public.appointment_activity_log (created_at desc);

alter table public.appointment_activity_log enable row level security;

drop policy if exists "appointment_activity_select_clinic" on public.appointment_activity_log;
create policy "appointment_activity_select_clinic"
  on public.appointment_activity_log for select to authenticated
  using (
    public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

-- Inserts come from the security-definer trigger (bypass RLS). Block direct client inserts.
drop policy if exists "appointment_activity_no_direct_insert" on public.appointment_activity_log;
create policy "appointment_activity_no_direct_insert"
  on public.appointment_activity_log for insert to authenticated
  with check (false);

drop policy if exists "appointment_activity_no_update" on public.appointment_activity_log;
create policy "appointment_activity_no_update"
  on public.appointment_activity_log for update to authenticated
  using (false);

drop policy if exists "appointment_activity_no_delete" on public.appointment_activity_log;
create policy "appointment_activity_no_delete"
  on public.appointment_activity_log for delete to authenticated
  using (public.is_owner_or_admin());

grant select on public.appointment_activity_log to authenticated;

-- 3) Helper: resolve actor from auth.uid()
create or replace function public.appointment_actor_snapshot()
returns table (actor_id uuid, actor_name text, actor_role text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p_name text;
  p_role text;
begin
  if uid is null then
    actor_id := null;
    actor_name := 'Website / public';
    actor_role := 'Public';
    return next;
    return;
  end if;

  select pr.full_name, pr.role
    into p_name, p_role
  from public.profiles pr
  where pr.id = uid;

  actor_id := uid;
  actor_name := coalesce(nullif(trim(p_name), ''), split_part(coalesce(auth.jwt() ->> 'email', 'Staff'), '@', 1));
  actor_role := coalesce(nullif(trim(p_role), ''), public.current_app_role(), 'Staff');
  return next;
end;
$$;

revoke all on function public.appointment_actor_snapshot() from public;
grant execute on function public.appointment_actor_snapshot() to authenticated, anon;

-- 4) Trigger: stamp creator, preserve original, append activity log
create or replace function public.appointments_booking_tracker_tg()
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
    -- Preserve original creation attribution + timestamp
    new.booked_by_id := old.booked_by_id;
    new.booked_by_name := old.booked_by_name;
    new.booked_by_role := old.booked_by_role;
    new.created_at := old.created_at;

    new.updated_at := now();
    new.last_modified_by_id := a_id;
    new.last_modified_by_name := a_name;
    new.last_modified_by_role := a_role;

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

    -- No meaningful change → skip log (e.g. touch-only)
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

drop trigger if exists trg_appointments_booking_tracker on public.appointments;
create trigger trg_appointments_booking_tracker
  before insert or update on public.appointments
  for each row
  execute function public.appointments_booking_tracker_tg();

-- 5) Backfill booked_by for existing rows that have no snapshot
update public.appointments
set
  booked_by_name = coalesce(nullif(trim(booked_by_name), ''), 'Unknown (before tracker)'),
  booked_by_role = coalesce(nullif(trim(booked_by_role), ''), '—')
where booked_by_name is null or trim(booked_by_name) = '';
