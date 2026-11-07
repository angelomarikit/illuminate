-- Illuminate — Restore clinic booking for Owner / Admin / Receptionist / Staff / HR / Inventory
-- Run in Supabase SQL Editor (safe to re-run).
--
-- Causes of "nobody can book clients":
-- 1) auth_insert_web_booking_requests only allows pending+web inserts; if auth_all_appointments
--    was dropped, clinic source=clinic / status=confirmed inserts fail for every logged-in user.
-- 2) booked_by_id FK fails when auth.uid() has no profiles row.
-- 3) appointment_activity_log AFTER INSERT raise rolls back the whole booking.
--
-- This script restores clinic RLS, softens booked_by FK stamping, and makes activity log non-fatal.

-- ---------------------------------------------------------------------------
-- A) Columns (idempotent)
-- ---------------------------------------------------------------------------
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
alter table public.appointments
  add column if not exists calendar_color text;
alter table public.appointments
  alter column calendar_color set default '#b8954a';
update public.appointments set calendar_color = '#b8954a' where calendar_color is null;
alter table public.appointments
  alter column calendar_color set not null;

alter table public.appointments enable row level security;

grant select, insert, update, delete on public.appointments to authenticated;

-- Keep role helpers aligned with app roles (Receptionist = former Staff)
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when p.role = 'Staff' then 'Receptionist'
        else p.role
      end
      from public.profiles p
      where p.id = auth.uid()
    ),
    'Receptionist'
  );
$$;

create or replace function public.is_clinic_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff');
$$;

-- ---------------------------------------------------------------------------
-- B) RLS — clinic staff can manage; web pending still allowed; clients read own
-- ---------------------------------------------------------------------------
drop policy if exists "auth_all_appointments" on public.appointments;
create policy "auth_all_appointments"
  on public.appointments for all to authenticated
  using (
    public.current_app_role() in (
      'Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory'
    )
  )
  with check (
    public.current_app_role() in (
      'Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory'
    )
  );

drop policy if exists "clinic_manage_appointments" on public.appointments;
create policy "clinic_manage_appointments"
  on public.appointments for all to authenticated
  using (
    public.current_app_role() in (
      'Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory'
    )
  )
  with check (
    public.current_app_role() in (
      'Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory'
    )
  );

-- Keep website / landing pending requests (OR'd with clinic policy)
drop policy if exists "auth_insert_web_booking_requests" on public.appointments;
create policy "auth_insert_web_booking_requests"
  on public.appointments for insert to authenticated
  with check (
    status = 'pending'
    and type = 'appointment'
    and coalesce(source, 'web') = 'web'
  );

drop policy if exists "anon_insert_booking_requests" on public.appointments;
create policy "anon_insert_booking_requests"
  on public.appointments for insert to anon
  with check (
    status = 'pending'
    and type = 'appointment'
    and coalesce(source, 'web') = 'web'
  );

drop policy if exists "client_read_own_appointments" on public.appointments;
create policy "client_read_own_appointments"
  on public.appointments for select to authenticated
  using (
    public.current_app_role() = 'Client'
    and (
      customer_id in (select c.id from public.customers c where c.user_id = auth.uid())
      or lower(coalesce(customer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- ---------------------------------------------------------------------------
-- C) BEFORE trigger — never set booked_by_id unless profiles row exists
-- ---------------------------------------------------------------------------
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
  p_exists boolean := false;
begin
  if uid is null then
    actor_id := null;
    actor_name := 'Website / public';
    actor_role := 'Public';
    return next;
    return;
  end if;

  select pr.full_name, pr.role, true
    into p_name, p_role, p_exists
  from public.profiles pr
  where pr.id = uid;

  -- Only attach actor_id when a profiles row exists (appointments.booked_by_id FK)
  actor_id := case when p_exists then uid else null end;
  actor_name := coalesce(
    nullif(trim(p_name), ''),
    split_part(coalesce(auth.jwt() ->> 'email', 'Staff'), '@', 1)
  );
  actor_role := coalesce(nullif(trim(p_role), ''), public.current_app_role(), 'Staff');
  return next;
end;
$$;

revoke all on function public.appointment_actor_snapshot() from public;
grant execute on function public.appointment_actor_snapshot() to authenticated, anon;

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
    else
      -- Client sent a name; only keep id when it exists in profiles
      if new.booked_by_id is not null
         and not exists (select 1 from public.profiles p where p.id = new.booked_by_id) then
        new.booked_by_id := null;
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

-- ---------------------------------------------------------------------------
-- D) AFTER trigger — activity log must never roll back the booking
-- ---------------------------------------------------------------------------
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
  if to_regclass('public.appointment_activity_log') is null then
    return new;
  end if;

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

-- ---------------------------------------------------------------------------
-- E) Reliable clinic booking RPC (bypasses brittle RETURNING/RLS edge cases)
-- ---------------------------------------------------------------------------
create or replace function public.create_clinic_appointment(
  p_customer_name text,
  p_service_name text,
  p_appointment_date date,
  p_appointment_time time,
  p_staff_name text default null,
  p_duration_min integer default 60,
  p_special_note text default null,
  p_calendar_color text default '#b8954a',
  p_customer_phone text default null,
  p_branch_id uuid default null,
  p_type text default 'appointment',
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(public.current_app_role(), '');
  v_id uuid;
  v_type text := coalesce(nullif(trim(p_type), ''), 'appointment');
  v_status text;
begin
  if v_role not in ('Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory') then
    raise exception 'Only clinic staff can create appointments (role %).', v_role;
  end if;

  if nullif(trim(p_customer_name), '') is null then
    raise exception 'Client name is required';
  end if;
  if nullif(trim(p_service_name), '') is null then
    raise exception 'Service is required';
  end if;
  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'Date and time are required';
  end if;

  if v_type = 'walk-in' then
    v_status := coalesce(nullif(trim(p_status), ''), 'walk-in');
  else
    v_status := coalesce(nullif(trim(p_status), ''), 'confirmed');
    v_type := 'appointment';
  end if;

  insert into public.appointments (
    branch_id,
    customer_name,
    service_name,
    staff_name,
    appointment_date,
    appointment_time,
    duration_min,
    special_note,
    calendar_color,
    customer_phone,
    status,
    type,
    source
  ) values (
    p_branch_id,
    trim(p_customer_name),
    trim(p_service_name),
    nullif(trim(coalesce(p_staff_name, '')), ''),
    p_appointment_date,
    p_appointment_time,
    coalesce(nullif(p_duration_min, 0), 60),
    nullif(trim(coalesce(p_special_note, '')), ''),
    coalesce(nullif(trim(coalesce(p_calendar_color, '')), ''), '#b8954a'),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    v_status,
    v_type,
    'clinic'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'customer_phone', nullif(trim(coalesce(p_customer_phone, '')), '')
  );
end;
$$;

revoke all on function public.create_clinic_appointment(
  text, text, date, time, text, integer, text, text, text, uuid, text, text
) from public;
grant execute on function public.create_clinic_appointment(
  text, text, date, time, text, integer, text, text, text, uuid, text, text
) to authenticated;
