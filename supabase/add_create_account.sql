-- Illuminate — Create clinic accounts (Owner / Admin / HR)
-- Run after add_hr_role.sql + add_inventory_role.sql
-- Creates auth users (email confirmed), profile details, and a provisioned-account vault.

create extension if not exists pgcrypto;

-- Profile demographics used by Create Account
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists birthday date;
alter table public.profiles add column if not exists age integer;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists address text;

create or replace function public.is_account_provisioner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('Owner', 'Admin', 'HR');
$$;

revoke all on function public.is_account_provisioner() from public;
grant execute on function public.is_account_provisioner() to authenticated;

-- Listing + encrypted initial password (reveal via RPC after UI re-auth)
create table if not exists public.provisioned_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  birthday date,
  age integer,
  gender text,
  address text,
  role text not null,
  password_cipher bytea not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists provisioned_accounts_created_idx
  on public.provisioned_accounts (created_at desc);

alter table public.provisioned_accounts enable row level security;

drop policy if exists "provisioner_read_accounts" on public.provisioned_accounts;
create policy "provisioner_read_accounts"
  on public.provisioned_accounts for select to authenticated
  using (public.is_account_provisioner());

-- No direct client insert/update/delete of cipher; use RPCs
revoke insert, update, delete on public.provisioned_accounts from authenticated;
grant select on public.provisioned_accounts to authenticated;

create or replace function public.create_clinic_account(
  p_full_name text,
  p_email text,
  p_phone text,
  p_birthday date,
  p_age integer,
  p_gender text,
  p_address text,
  p_role text,
  p_password text,
  p_created_by_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_role text := public.current_app_role();
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_gender text := nullif(trim(coalesce(p_gender, '')), '');
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_role text := nullif(trim(coalesce(p_role, '')), '');
  v_password text := coalesce(p_password, '');
  v_created_by_name text := nullif(trim(coalesce(p_created_by_name, '')), '');
  v_new_id uuid := gen_random_uuid();
  v_instance_id uuid;
  v_age integer := p_age;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_account_provisioner() then
    raise exception 'Only Owner, Admin, or HR can create accounts';
  end if;

  if v_name is null then
    raise exception 'Full name is required';
  end if;
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'A valid email is required';
  end if;
  if v_phone is null then
    raise exception 'Phone number is required';
  end if;
  if v_created_by_name is null then
    raise exception 'Who created this account is required';
  end if;
  if char_length(v_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;

  if v_role not in ('Owner', 'Admin', 'Staff', 'HR', 'Inventory', 'Client') then
    raise exception 'Invalid role';
  end if;

  -- Role assignment guardrails
  if v_caller_role = 'HR' and v_role in ('Owner', 'Admin') then
    raise exception 'HR cannot create Owner or Admin accounts';
  end if;
  if v_caller_role = 'Admin' and v_role = 'Owner' then
    raise exception 'Only Owner can create Owner accounts';
  end if;

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'An account with this email already exists';
  end if;

  if p_birthday is not null and v_age is null then
    v_age := date_part('year', age(p_birthday))::integer;
  end if;

  select i.id into v_instance_id from auth.instances i limit 1;
  if v_instance_id is null then
    v_instance_id := '00000000-0000-0000-0000-000000000000'::uuid;
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) values (
    v_instance_id,
    v_new_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', v_name,
      'role', v_role,
      'provisioned', true
    ),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_new_id,
    jsonb_build_object(
      'sub', v_new_id::text,
      'email', v_email,
      'email_verified', true
    ),
    'email',
    v_email,
    now(),
    now(),
    now()
  );

  -- Trigger may have created a Staff/Client profile; set final role + demographics
  update public.profiles
  set
    full_name = v_name,
    email = v_email,
    role = v_role,
    phone = v_phone,
    birthday = p_birthday,
    age = v_age,
    gender = v_gender,
    address = v_address
  where id = v_new_id;

  if not found then
    insert into public.profiles (
      id, full_name, email, role, phone, birthday, age, gender, address,
      employment_status, duty_status,
      leave_credits_vacation, leave_credits_sick,
      leave_credits_personal, leave_credits_emergency
    ) values (
      v_new_id, v_name, v_email, v_role, v_phone, p_birthday, v_age, v_gender, v_address,
      'probation', 'off-duty', 10, 5, 3, 2
    );
  end if;

  insert into public.provisioned_accounts (
    user_id,
    full_name,
    email,
    phone,
    birthday,
    age,
    gender,
    address,
    role,
    password_cipher,
    created_by,
    created_by_name
  ) values (
    v_new_id,
    v_name,
    v_email,
    v_phone,
    p_birthday,
    v_age,
    v_gender,
    v_address,
    v_role,
    extensions.pgp_sym_encrypt(v_password, 'illuminate.clinic.provision.v1'),
    v_uid,
    v_created_by_name
  );

  return jsonb_build_object(
    'user_id', v_new_id,
    'email', v_email,
    'full_name', v_name,
    'role', v_role,
    'password', v_password
  );
end;
$$;

revoke all on function public.create_clinic_account(
  text, text, text, date, integer, text, text, text, text, text
) from public;
grant execute on function public.create_clinic_account(
  text, text, text, date, integer, text, text, text, text, text
) to authenticated;

create or replace function public.reveal_provisioned_password(p_provision_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cipher bytea;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_account_provisioner() then
    raise exception 'Only Owner, Admin, or HR can reveal passwords';
  end if;

  select password_cipher into v_cipher
  from public.provisioned_accounts
  where id = p_provision_id;

  if v_cipher is null then
    raise exception 'Account record not found';
  end if;

  return extensions.pgp_sym_decrypt(v_cipher, 'illuminate.clinic.provision.v1');
end;
$$;

revoke all on function public.reveal_provisioned_password(uuid) from public;
grant execute on function public.reveal_provisioned_password(uuid) to authenticated;
