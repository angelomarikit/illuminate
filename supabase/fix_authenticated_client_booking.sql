-- Authenticated Client portal / mobile booking.
-- Creates or links a CRM customers row so register-only Clients can book.
-- Also widens Client loyalty read (email match) + active services read.

-- 1) On signup as Client, ensure a CRM customer row exists
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
  v_customer_id uuid;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');

  insert into public.profiles (id, full_name, email, role, phone)
  values (new.id, v_name, new.email, 'Client', v_phone)
  on conflict (id) do update
    set
      full_name = excluded.full_name,
      email = excluded.email,
      phone = coalesce(excluded.phone, public.profiles.phone),
      role = case
        when public.profiles.role in (
          'Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory'
        ) then public.profiles.role
        else 'Client'
      end;

  -- Link or create CRM customer for Client accounts
  if coalesce((select role from public.profiles where id = new.id), 'Client') = 'Client' then
    select c.id into v_customer_id
    from public.customers c
    where c.user_id = new.id
    limit 1;

    if v_customer_id is null and new.email is not null then
      select c.id into v_customer_id
      from public.customers c
      where lower(c.email) = lower(new.email)
      limit 1;
    end if;

    if v_customer_id is null and v_phone is not null then
      select c.id into v_customer_id
      from public.customers c
      where c.phone = v_phone
      limit 1;
    end if;

    if v_customer_id is null then
      insert into public.customers (
        full_name, email, phone, membership, points, cash_in_balance, visits, user_id
      ) values (
        v_name, new.email, v_phone, 'Regular', 0, 0, 0, new.id
      );
    else
      update public.customers
      set
        user_id = coalesce(user_id, new.id),
        full_name = coalesce(nullif(trim(full_name), ''), v_name),
        email = coalesce(email, new.email),
        phone = coalesce(nullif(trim(coalesce(phone, '')), ''), v_phone)
      where id = v_customer_id;
    end if;
  end if;

  return new;
end;
$$;

-- 2) Portal / mobile booking for signed-in Clients
create or replace function public.submit_client_portal_booking(
  p_phone text,
  p_service_name text,
  p_special_note text,
  p_appointment_date date,
  p_appointment_time time,
  p_duration_min integer,
  p_source text default 'portal'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_name text;
  v_email text;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_service text := coalesce(nullif(trim(coalesce(p_service_name, '')), ''), 'Consultation');
  v_customer_id uuid;
  v_appointment_id uuid;
  v_source text := coalesce(nullif(trim(coalesce(p_source, '')), ''), 'portal');
begin
  if v_uid is null then
    raise exception 'You must be signed in to book.';
  end if;

  select p.role, p.full_name, p.email
    into v_role, v_name, v_email
  from public.profiles p
  where p.id = v_uid;

  if v_role is distinct from 'Client' then
    raise exception 'Only Client accounts can book from the portal.';
  end if;

  v_name := coalesce(nullif(trim(coalesce(v_name, '')), ''), split_part(coalesce(v_email, ''), '@', 1));
  v_email := lower(nullif(trim(coalesce(v_email, '')), ''));

  if v_email is null then
    select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  end if;

  if v_name is null or v_email is null then
    raise exception 'Your profile is missing name or email.';
  end if;
  if v_phone is null then
    raise exception 'Phone number is required.';
  end if;
  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'Date and time are required.';
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.user_id = v_uid
  limit 1;

  if v_customer_id is null then
    select c.id into v_customer_id
    from public.customers c
    where lower(c.email) = v_email
    limit 1;
  end if;

  if v_customer_id is null then
    select c.id into v_customer_id
    from public.customers c
    where c.phone = v_phone
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      full_name, email, phone, membership, points, cash_in_balance, visits, user_id, notes
    ) values (
      v_name,
      v_email,
      v_phone,
      'Regular',
      0,
      0,
      0,
      v_uid,
      nullif(trim(coalesce(p_special_note, '')), '')
    )
    returning id into v_customer_id;
  else
    update public.customers
    set
      user_id = coalesce(user_id, v_uid),
      full_name = coalesce(nullif(trim(full_name), ''), v_name),
      email = coalesce(email, v_email),
      phone = v_phone,
      notes = coalesce(nullif(trim(coalesce(p_special_note, '')), ''), notes)
    where id = v_customer_id;
  end if;

  update public.profiles
  set phone = coalesce(phone, v_phone)
  where id = v_uid;

  insert into public.appointments (
    customer_name,
    customer_email,
    customer_phone,
    service_name,
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
    v_service,
    nullif(trim(coalesce(p_special_note, '')), ''),
    p_appointment_date,
    p_appointment_time,
    greatest(coalesce(p_duration_min, 60), 15),
    'pending',
    'appointment',
    case when v_source in ('portal', 'mobile', 'web') then v_source else 'portal' end,
    v_customer_id
  )
  returning id into v_appointment_id;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment_id,
    'customer_id', v_customer_id
  );
end;
$$;

revoke all on function public.submit_client_portal_booking(
  text, text, text, date, time, integer, text
) from public;
grant execute on function public.submit_client_portal_booking(
  text, text, text, date, time, integer, text
) to authenticated;

-- 3) Loyalty readable by email-linked CRM (not only user_id)
drop policy if exists "client_read_own_loyalty" on public.loyalty_transactions;
create policy "client_read_own_loyalty"
  on public.loyalty_transactions for select to authenticated
  using (
    public.current_app_role() = 'Client'
    and customer_id in (
      select c.id
      from public.customers c
      where c.user_id = auth.uid()
         or lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- 4) Clients can read active catalog services
drop policy if exists "client_read_active_services" on public.services;
create policy "client_read_active_services"
  on public.services for select to authenticated
  using (
    public.current_app_role() = 'Client'
    and active = true
  );

comment on function public.submit_client_portal_booking is
  'Signed-in Client booking for web portal and mobile app; ensures CRM customer link.';
