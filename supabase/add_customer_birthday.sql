-- Illuminate — Customer birthday (booking + CRM)
-- Run in Supabase → SQL Editor (safe to re-run)
-- Requires: fix_public_booking_flow.sql (submit_public_booking)

alter table public.customers
  add column if not exists birthday date;

alter table public.appointments
  add column if not exists customer_birthday date;

-- Replace public booking RPC to accept birthday (drops prior signature)
drop function if exists public.submit_public_booking(
  text, text, text, integer, text, text, text, text, text, date, time, integer
);

drop function if exists public.submit_public_booking(
  text, text, text, integer, text, text, text, text, text, date, time, integer, date
);

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
  p_duration_min integer default 60,
  p_birthday date default null
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
  v_age integer := p_age;
begin
  if v_name is null or v_name = '' then
    raise exception 'Full name is required';
  end if;
  if v_email is null then
    raise exception 'Email address is required';
  end if;
  if v_phone is null then
    raise exception 'Phone number is required';
  end if;
  if v_service is null or v_service = '' then
    raise exception 'Service is required';
  end if;
  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'Date and time are required';
  end if;

  if v_age is null and p_birthday is not null then
    v_age := date_part('year', age(current_date, p_birthday))::integer;
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
      birthday,
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
      'Regular',
      v_age,
      p_birthday,
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
      age = coalesce(v_age, age),
      birthday = coalesce(p_birthday, birthday),
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
    customer_birthday,
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
    v_age,
    p_birthday,
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
  text, text, text, integer, text, text, text, text, text, date, time, integer, date
) from public;

grant execute on function public.submit_public_booking(
  text, text, text, integer, text, text, text, text, text, date, time, integer, date
) to anon, authenticated;
