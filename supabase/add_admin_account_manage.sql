-- Illuminate — Admin manage provisioned accounts (edit details + reset password)
-- Run after add_create_account.sql + add_delete_account.sql
-- Owner/Admin can update profile + provisioned_accounts (and auth email / password when changed).

drop function if exists public.update_clinic_account(
  uuid, text, text, text, date, integer, text, text, text
);

create or replace function public.update_clinic_account(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_birthday date,
  p_age integer,
  p_gender text,
  p_address text,
  p_role text,
  p_password text default null
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
  v_password text := nullif(trim(coalesce(p_password, '')), '');
  v_target_role text;
  v_age integer := p_age;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_caller_role not in ('Owner', 'Admin') then
    raise exception 'Only Owner or Admin can edit accounts';
  end if;

  if p_user_id is null then
    raise exception 'Account id is required';
  end if;

  select role into v_target_role
  from public.profiles
  where id = p_user_id;

  if v_target_role is null then
    raise exception 'Account not found';
  end if;

  if v_caller_role = 'Admin' and v_target_role = 'Owner' then
    raise exception 'Admin cannot edit Owner accounts';
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

  if v_role = 'Staff' then
    v_role := 'Receptionist';
  end if;

  if v_role not in ('Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory', 'Client') then
    raise exception 'Invalid role';
  end if;

  if v_caller_role = 'Admin' and v_role = 'Owner' then
    raise exception 'Only Owner can assign the Owner role';
  end if;

  if v_password is not null and char_length(v_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;

  if exists (
    select 1 from auth.users u
    where lower(u.email) = v_email
      and u.id <> p_user_id
  ) then
    raise exception 'An account with this email already exists';
  end if;

  if p_birthday is not null and v_age is null then
    v_age := date_part('year', age(p_birthday))::integer;
  end if;

  update auth.users
  set
    email = v_email,
    encrypted_password = case
      when v_password is not null then extensions.crypt(v_password, extensions.gen_salt('bf'))
      else encrypted_password
    end,
    raw_user_meta_data =
      coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('full_name', v_name, 'role', v_role),
    updated_at = now()
  where id = p_user_id;

  update auth.identities
  set
    identity_data =
      coalesce(identity_data, '{}'::jsonb)
      || jsonb_build_object('email', v_email, 'email_verified', true),
    provider_id = v_email,
    updated_at = now()
  where user_id = p_user_id
    and provider = 'email';

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
  where id = p_user_id;

  update public.provisioned_accounts
  set
    full_name = v_name,
    email = v_email,
    phone = v_phone,
    birthday = p_birthday,
    age = v_age,
    gender = v_gender,
    address = v_address,
    role = v_role,
    password_cipher = case
      when v_password is not null then
        extensions.pgp_sym_encrypt(v_password, 'illuminate.clinic.provision.v1')
      else password_cipher
    end
  where user_id = p_user_id;

  -- Force re-login after admin password reset
  if v_password is not null then
    delete from auth.sessions where user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'full_name', v_name,
    'email', v_email,
    'role', v_role,
    'password_updated', v_password is not null
  );
end;
$$;

revoke all on function public.update_clinic_account(
  uuid, text, text, text, date, integer, text, text, text, text
) from public;
grant execute on function public.update_clinic_account(
  uuid, text, text, text, date, integer, text, text, text, text
) to authenticated;

-- Tighten delete: Admin cannot delete Owner accounts
create or replace function public.delete_clinic_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_role text := public.current_app_role();
  target_role text;
  owner_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_caller_role not in ('Owner', 'Admin') then
    raise exception 'Only Owner or Admin can delete accounts';
  end if;

  if target_user_id is null then
    raise exception 'Account id is required';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  select role into target_role
  from public.profiles
  where id = target_user_id;

  if target_role is null then
    raise exception 'Account not found';
  end if;

  if v_caller_role = 'Admin' and target_role = 'Owner' then
    raise exception 'Admin cannot delete Owner accounts';
  end if;

  if target_role = 'Owner' then
    select count(*)::integer into owner_count
    from public.profiles
    where role = 'Owner';

    if owner_count <= 1 then
      raise exception 'Cannot delete the last Owner account';
    end if;
  end if;

  delete from auth.users where id = target_user_id;

  if not found then
    raise exception 'Auth user not found';
  end if;
end;
$$;

revoke all on function public.delete_clinic_account(uuid) from public;
grant execute on function public.delete_clinic_account(uuid) to authenticated;
