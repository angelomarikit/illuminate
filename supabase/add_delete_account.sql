-- Illuminate — Owner/Admin can delete registered accounts
-- Run in Supabase → SQL Editor (safe to re-run)
-- Requires: add_roles.sql (is_owner_or_admin)

create or replace function public.delete_clinic_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_role text;
  owner_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_owner_or_admin() then
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

  if target_role = 'Owner' then
    select count(*)::integer into owner_count
    from public.profiles
    where role = 'Owner';

    if owner_count <= 1 then
      raise exception 'Cannot delete the last Owner account';
    end if;
  end if;

  -- Cascades to public.profiles (profiles.id references auth.users)
  delete from auth.users where id = target_user_id;

  if not found then
    raise exception 'Auth user not found';
  end if;
end;
$$;

revoke all on function public.delete_clinic_account(uuid) from public;
grant execute on function public.delete_clinic_account(uuid) to authenticated;
