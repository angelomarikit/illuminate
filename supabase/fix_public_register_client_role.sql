-- Public registration always creates Client profiles.
-- Clinic roles are assigned only by Owner/Admin via Create Account or Staff page.
-- create_clinic_account still UPDATEs the role after insert for provisioned staff.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    'Client'
  )
  on conflict (id) do update
    set
      full_name = excluded.full_name,
      email = excluded.email,
      -- Never escalate role from public signup metadata; keep elevated clinic roles intact
      role = case
        when public.profiles.role in (
          'Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory'
        ) then public.profiles.role
        else 'Client'
      end;

  return new;
end;
$$;
