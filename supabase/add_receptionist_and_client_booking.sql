-- Illuminate — Receptionist role rename + public booking with client account registration
-- Run in Supabase SQL Editor (safe to re-run)
-- Requires: add_roles / add_hr_role / add_inventory_role / add_customer_birthday / fix_public_booking_flow

create extension if not exists pgcrypto;

-- 1) Allow Receptionist on profiles.role, THEN migrate Staff → Receptionist
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory', 'Client'));

update public.profiles
set role = 'Receptionist'
where role = 'Staff';

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

create or replace function public.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory');
$$;

-- Allow Client self-registration from landing (metadata role Client)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'Receptionist');
  safe_role text;
begin
  if requested_role = 'Client' then
    safe_role := 'Client';
  elsif requested_role in ('Owner', 'Admin', 'HR', 'Inventory') then
    safe_role := 'Receptionist';
  elsif requested_role in ('Receptionist', 'Staff') then
    safe_role := 'Receptionist';
  else
    safe_role := 'Receptionist';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    safe_role
  )
  on conflict (id) do update
    set
      full_name = excluded.full_name,
      email = excluded.email,
      role = case
        when public.profiles.role in ('Owner', 'Admin', 'HR', 'Inventory', 'Client')
          then public.profiles.role
        else excluded.role
      end;

  return new;
end;
$$;

-- 2) Public booking + client portal account registration
create or replace function public.submit_public_booking_register(
  p_full_name text,
  p_email text,
  p_phone text,
  p_password text,
  p_is_existing_client boolean,
  p_age integer,
  p_sex text,
  p_address text,
  p_service_name text,
  p_medical_history text,
  p_special_note text,
  p_appointment_date date,
  p_appointment_time time,
  p_duration_min integer,
  p_birthday date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_password text := coalesce(p_password, '');
  v_service text := coalesce(nullif(trim(coalesce(p_service_name, '')), ''), 'Consultation');
  v_existing boolean := coalesce(p_is_existing_client, false);
  v_user_id uuid;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_instance_id uuid;
  v_age integer := p_age;
  v_created_user boolean := false;
begin
  if v_name is null then
    raise exception 'Full name is required';
  end if;
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'A valid email is required';
  end if;
  if v_phone is null then
    raise exception 'Phone number is required';
  end if;
  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'Date and time are required';
  end if;

  if p_birthday is not null and v_age is null then
    v_age := date_part('year', age(p_birthday))::integer;
  end if;

  if v_existing then
    -- Existing client: match CRM by email (then phone). No password / no new registration.
    select c.id, c.user_id into v_customer_id, v_user_id
    from public.customers c
    where lower(c.email) = v_email
    limit 1;

    if v_customer_id is null then
      select c.id, c.user_id into v_customer_id, v_user_id
      from public.customers c
      where c.phone = v_phone
      limit 1;
    end if;

    if v_customer_id is null then
      raise exception 'No existing client found with this email. Choose “I’m a new client” to register.';
    end if;

    if v_user_id is not null and exists (
      select 1
      from public.profiles p
      where p.id = v_user_id
        and p.role is not null
        and p.role <> 'Client'
    ) then
      raise exception 'This email belongs to a clinic staff account. Use a different email to book as a client.';
    end if;

    update public.customers
    set
      full_name = coalesce(nullif(trim(full_name), ''), v_name),
      phone = coalesce(nullif(trim(coalesce(phone, '')), ''), v_phone),
      notes = coalesce(nullif(trim(coalesce(p_special_note, '')), ''), notes)
    where id = v_customer_id;

  else
    -- New client: register portal account + CRM row
    if char_length(v_password) < 8 then
      raise exception 'Password must be at least 8 characters';
    end if;
    if p_birthday is null then
      raise exception 'Birthday is required for new clients';
    end if;

    select u.id into v_user_id
    from auth.users u
    where lower(u.email) = v_email
    limit 1;

    if v_user_id is not null then
      raise exception 'An account already exists for this email. Choose “I’m an existing client” or log in.';
    end if;

    v_user_id := gen_random_uuid();
    select i.id into v_instance_id from auth.instances i limit 1;
    if v_instance_id is null then
      v_instance_id := '00000000-0000-0000-0000-000000000000'::uuid;
    end if;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      v_instance_id,
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name, 'role', 'Client'),
      now(),
      now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );

    insert into public.profiles (id, full_name, email, role, phone, birthday, age, gender, address)
    values (
      v_user_id,
      v_name,
      v_email,
      'Client',
      v_phone,
      p_birthday,
      v_age,
      nullif(trim(coalesce(p_sex, '')), ''),
      nullif(trim(coalesce(p_address, '')), '')
    )
    on conflict (id) do update
      set
        full_name = excluded.full_name,
        email = excluded.email,
        role = 'Client',
        phone = coalesce(excluded.phone, public.profiles.phone);

    v_created_user := true;

    select c.id into v_customer_id
    from public.customers c
    where lower(c.email) = v_email
    limit 1;

    if v_customer_id is null and v_phone is not null then
      select c.id into v_customer_id
      from public.customers c
      where c.phone = v_phone
      limit 1;
    end if;

    if v_customer_id is null then
      insert into public.customers (
        full_name, email, phone, age, sex, address, birthday,
        medical_history, notes, membership, points, cash_in_balance, visits, user_id
      ) values (
        v_name,
        v_email,
        v_phone,
        v_age,
        nullif(trim(coalesce(p_sex, '')), ''),
        nullif(trim(coalesce(p_address, '')), ''),
        p_birthday,
        nullif(trim(coalesce(p_medical_history, '')), ''),
        nullif(trim(coalesce(p_special_note, '')), ''),
        'Regular',
        0,
        0,
        0,
        v_user_id
      )
      returning id into v_customer_id;
    else
      update public.customers
      set
        full_name = v_name,
        email = v_email,
        phone = v_phone,
        user_id = coalesce(user_id, v_user_id),
        age = coalesce(v_age, age),
        sex = coalesce(nullif(trim(coalesce(p_sex, '')), ''), sex),
        address = coalesce(nullif(trim(coalesce(p_address, '')), ''), address),
        birthday = coalesce(p_birthday, birthday),
        medical_history = coalesce(nullif(trim(coalesce(p_medical_history, '')), ''), medical_history),
        notes = coalesce(nullif(trim(coalesce(p_special_note, '')), ''), notes)
      where id = v_customer_id;
    end if;
  end if;

  insert into public.appointments (
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
    source,
    customer_id
  ) values (
    v_name,
    v_email,
    v_phone,
    case when v_existing then null else v_age end,
    case when v_existing then null else nullif(trim(coalesce(p_sex, '')), '') end,
    case when v_existing then null else nullif(trim(coalesce(p_address, '')), '') end,
    v_service,
    case when v_existing then null else nullif(trim(coalesce(p_medical_history, '')), '') end,
    nullif(trim(coalesce(p_special_note, '')), ''),
    p_appointment_date,
    p_appointment_time,
    greatest(coalesce(p_duration_min, 60), 15),
    'pending',
    'appointment',
    'web',
    v_customer_id
  )
  returning id into v_appointment_id;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment_id,
    'customer_id', v_customer_id,
    'user_id', v_user_id,
    'account_created', v_created_user
  );
end;
$$;

revoke all on function public.submit_public_booking_register(
  text, text, text, text, boolean, integer, text, text, text, text, text, date, time, integer, date
) from public;
grant execute on function public.submit_public_booking_register(
  text, text, text, text, boolean, integer, text, text, text, text, text, date, time, integer, date
) to anon, authenticated;

-- Client can read own CRM / appointments / loyalty / care notes
drop policy if exists "client_read_own_customer" on public.customers;
create policy "client_read_own_customer"
  on public.customers for select to authenticated
  using (
    public.current_app_role() = 'Client'
    and (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );

drop policy if exists "client_read_own_appointments" on public.appointments;
create policy "client_read_own_appointments"
  on public.appointments for select to authenticated
  using (
    public.current_app_role() = 'Client'
    and (
      customer_id in (select c.id from public.customers c where c.user_id = auth.uid())
      or lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "client_read_own_loyalty" on public.loyalty_transactions;
create policy "client_read_own_loyalty"
  on public.loyalty_transactions for select to authenticated
  using (
    public.current_app_role() = 'Client'
    and customer_id in (
      select c.id from public.customers c where c.user_id = auth.uid()
    )
  );

-- Optional tables (created by add_client_sessions.sql / add_pos_attribution.sql)
do $$
begin
  if to_regclass('public.client_session_packages') is not null then
    execute 'drop policy if exists "client_read_own_session_packages" on public.client_session_packages';
    execute $pol$
      create policy "client_read_own_session_packages"
        on public.client_session_packages for select to authenticated
        using (
          public.current_app_role() = 'Client'
          and customer_id in (
            select c.id from public.customers c where c.user_id = auth.uid()
          )
        )
    $pol$;
  end if;

  if to_regclass('public.client_care_comments') is not null then
    execute 'drop policy if exists "client_read_own_care_comments" on public.client_care_comments';
    execute $pol$
      create policy "client_read_own_care_comments"
        on public.client_care_comments for select to authenticated
        using (
          public.current_app_role() = 'Client'
          and customer_id in (
            select c.id from public.customers c where c.user_id = auth.uid()
          )
        )
    $pol$;
  end if;
end $$;

comment on function public.submit_public_booking_register is
  'Landing booking + Client portal account registration (new or existing client).';
