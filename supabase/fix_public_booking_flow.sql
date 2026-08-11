-- Illuminate — Fix public booking → appointments + customers
-- Run in Supabase → SQL Editor (safe to re-run)
-- Requires: add_public_booking.sql (columns) and setup.sql

-- 1) Link appointments to CRM customers + store booking profile on customers
alter table public.appointments
  add column if not exists customer_id uuid references public.customers (id) on delete set null;

alter table public.customers add column if not exists age integer;
alter table public.customers add column if not exists sex text;
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists medical_history text;
alter table public.customers add column if not exists notes text;

create index if not exists appointments_customer_id_idx
  on public.appointments (customer_id);

create index if not exists customers_email_idx
  on public.customers (lower(email));

create index if not exists customers_phone_idx
  on public.customers (phone);

-- 2) Ensure anon can insert pending web bookings (policy + grants)
grant select, insert on public.appointments to anon;
grant select on public.services to anon;
grant select on public.clinic_settings to anon;

drop policy if exists "anon_insert_booking_requests" on public.appointments;
create policy "anon_insert_booking_requests"
  on public.appointments for insert to anon
  with check (
    status = 'pending'
    and type = 'appointment'
    and coalesce(source, 'web') = 'web'
  );

-- Authenticated visitors on the landing page can also submit web bookings
drop policy if exists "auth_insert_web_booking_requests" on public.appointments;
create policy "auth_insert_web_booking_requests"
  on public.appointments for insert to authenticated
  with check (
    status = 'pending'
    and type = 'appointment'
    and coalesce(source, 'web') = 'web'
  );

-- 3) Atomic public booking: upsert customer + create pending appointment
create or replace function public.submit_public_booking(
  p_full_name text,
  p_email text,
  p_phone text,
  p_age integer,
  p_sex text,
  p_address text,
  p_service_name text,
  p_medical_history text,
  p_special_note text,
  p_appointment_date date,
  p_appointment_time time,
  p_duration_min integer default 60
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_email text := nullif(lower(trim(p_email)), '');
  v_phone text := nullif(trim(p_phone), '');
  v_name text := trim(p_full_name);
  v_service text := trim(p_service_name);
begin
  if v_name is null or v_name = '' then
    raise exception 'Full name is required';
  end if;
  if v_service is null or v_service = '' then
    raise exception 'Service is required';
  end if;
  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'Date and time are required';
  end if;

  select id into v_branch_id
  from public.branches
  where status = 'active'
  order by name
  limit 1;

  if v_branch_id is null then
    select id into v_branch_id
    from public.branches
    order by name
    limit 1;
  end if;

  if v_email is not null then
    select id into v_customer_id
    from public.customers
    where lower(email) = v_email
    order by created_at desc
    limit 1;
  end if;

  if v_customer_id is null and v_phone is not null then
    select id into v_customer_id
    from public.customers
    where phone = v_phone
    order by created_at desc
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      branch_id,
      full_name,
      phone,
      email,
      membership,
      age,
      sex,
      address,
      medical_history,
      notes,
      last_visit
    ) values (
      v_branch_id,
      v_name,
      v_phone,
      v_email,
      'Standard',
      p_age,
      nullif(trim(coalesce(p_sex, '')), ''),
      nullif(trim(coalesce(p_address, '')), ''),
      nullif(trim(coalesce(p_medical_history, '')), ''),
      nullif(trim(coalesce(p_special_note, '')), ''),
      p_appointment_date
    )
    returning id into v_customer_id;
  else
    update public.customers
    set
      full_name = v_name,
      phone = coalesce(v_phone, phone),
      email = coalesce(v_email, email),
      branch_id = coalesce(branch_id, v_branch_id),
      age = coalesce(p_age, age),
      sex = coalesce(nullif(trim(coalesce(p_sex, '')), ''), sex),
      address = coalesce(nullif(trim(coalesce(p_address, '')), ''), address),
      medical_history = coalesce(nullif(trim(coalesce(p_medical_history, '')), ''), medical_history),
      notes = coalesce(nullif(trim(coalesce(p_special_note, '')), ''), notes),
      last_visit = greatest(coalesce(last_visit, p_appointment_date), p_appointment_date)
    where id = v_customer_id;
  end if;

  insert into public.appointments (
    branch_id,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    customer_age,
    customer_sex,
    customer_address,
    service_name,
    medical_history,
    special_note,
    appointment_date,
    appointment_time,
    duration_min,
    status,
    type,
    source
  ) values (
    v_branch_id,
    v_customer_id,
    v_name,
    v_email,
    v_phone,
    p_age,
    nullif(trim(coalesce(p_sex, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    v_service,
    nullif(trim(coalesce(p_medical_history, '')), ''),
    nullif(trim(coalesce(p_special_note, '')), ''),
    p_appointment_date,
    p_appointment_time,
    coalesce(nullif(p_duration_min, 0), 60),
    'pending',
    'appointment',
    'web'
  )
  returning id into v_appointment_id;

  return v_appointment_id;
end;
$$;

revoke all on function public.submit_public_booking(
  text, text, text, integer, text, text, text, text, text, date, time, integer
) from public;
grant execute on function public.submit_public_booking(
  text, text, text, integer, text, text, text, text, text, date, time, integer
) to anon, authenticated;

-- Keep slot helper in sync
create or replace function public.list_booked_slots(from_date date, to_date date)
returns table (appointment_date date, appointment_time time)
language sql
stable
security definer
set search_path = public
as $$
  select a.appointment_date, a.appointment_time
  from public.appointments a
  where a.appointment_date between from_date and to_date
    and a.status not in ('cancelled', 'declined', 'completed')
  order by a.appointment_date, a.appointment_time;
$$;

revoke all on function public.list_booked_slots(date, date) from public;
grant execute on function public.list_booked_slots(date, date) to anon, authenticated;
