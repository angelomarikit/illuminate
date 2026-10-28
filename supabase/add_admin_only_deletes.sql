-- Illuminate — Admin/Owner-only deletes + deletion audit log
-- Run in Supabase SQL Editor (safe to re-run).
--
-- Non-admin authenticated users keep SELECT / INSERT / UPDATE where they already had access.
-- DELETE on clinic records requires Owner or Admin (is_owner_or_admin()).

-- 1) Audit log
create table if not exists public.deletion_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text not null,
  record_label text,
  payload jsonb not null default '{}'::jsonb,
  deleted_by_id uuid references public.profiles (id) on delete set null,
  deleted_by_name text,
  deleted_by_role text,
  deleted_at timestamptz not null default now()
);

create index if not exists deletion_audit_log_deleted_at_idx
  on public.deletion_audit_log (deleted_at desc);

create index if not exists deletion_audit_log_table_idx
  on public.deletion_audit_log (table_name, deleted_at desc);

alter table public.deletion_audit_log enable row level security;

drop policy if exists "deletion_audit_select_admin" on public.deletion_audit_log;
create policy "deletion_audit_select_admin"
  on public.deletion_audit_log for select to authenticated
  using (public.is_owner_or_admin());

drop policy if exists "deletion_audit_no_client_write" on public.deletion_audit_log;
create policy "deletion_audit_no_client_write"
  on public.deletion_audit_log for insert to authenticated
  with check (false);

drop policy if exists "deletion_audit_no_update" on public.deletion_audit_log;
create policy "deletion_audit_no_update"
  on public.deletion_audit_log for update to authenticated
  using (false);

drop policy if exists "deletion_audit_no_delete" on public.deletion_audit_log;
create policy "deletion_audit_no_delete"
  on public.deletion_audit_log for delete to authenticated
  using (false);

grant select on public.deletion_audit_log to authenticated;

-- 2) Logger (security definer — inserts even when RLS blocks direct writes)
create or replace function public.log_clinic_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a_name text;
  a_role text;
  label text;
  rid text;
begin
  if uid is not null then
    select pr.full_name, pr.role into a_name, a_role
    from public.profiles pr
    where pr.id = uid;
  end if;

  a_name := coalesce(nullif(trim(a_name), ''), 'Unknown');
  a_role := coalesce(nullif(trim(a_role), ''), public.current_app_role(), '—');

  rid := coalesce(OLD.id::text, '(unknown)');

  if TG_TABLE_NAME = 'customers' then
    label := coalesce(OLD.full_name, rid);
  elsif TG_TABLE_NAME = 'sales' then
    label := coalesce(OLD.receipt_no, OLD.customer_name, rid);
  elsif TG_TABLE_NAME = 'client_session_packages' then
    label := coalesce(OLD.service_name || ' · ' || OLD.customer_name, rid);
  elsif TG_TABLE_NAME = 'appointments' then
    label := coalesce(OLD.customer_name || ' · ' || OLD.service_name, rid);
  elsif TG_TABLE_NAME = 'client_session_slots' then
    label := coalesce('Session ' || OLD.session_number::text, rid);
  else
    label := rid;
  end if;

  insert into public.deletion_audit_log (
    table_name, record_id, record_label, payload,
    deleted_by_id, deleted_by_name, deleted_by_role
  ) values (
    TG_TABLE_NAME,
    rid,
    label,
    to_jsonb(OLD),
    uid,
    a_name,
    a_role
  );

  return OLD;
end;
$$;

-- 3) Split permissive FOR ALL policies → keep write except DELETE = admin only
do $$
declare
  t text;
begin
  foreach t in array array['sales', 'customers', 'appointments']
  loop
    execute format('drop policy if exists "auth_all_%s" on public.%I', t, t);

    execute format(
      'drop policy if exists "%s_select_auth" on public.%I', t, t
    );
    execute format(
      'create policy "%s_select_auth" on public.%I for select to authenticated using (true)',
      t, t
    );

    execute format('drop policy if exists "%s_insert_auth" on public.%I', t, t);
    execute format(
      'create policy "%s_insert_auth" on public.%I for insert to authenticated with check (true)',
      t, t
    );

    execute format('drop policy if exists "%s_update_auth" on public.%I', t, t);
    execute format(
      'create policy "%s_update_auth" on public.%I for update to authenticated using (true) with check (true)',
      t, t
    );

    execute format('drop policy if exists "%s_delete_admin_only" on public.%I', t, t);
    execute format(
      'create policy "%s_delete_admin_only" on public.%I for delete to authenticated using (public.is_owner_or_admin())',
      t, t
    );
  end loop;
end $$;

-- client_session_packages (named differently in add_client_sessions.sql)
drop policy if exists "auth_all_client_session_packages" on public.client_session_packages;
drop policy if exists "client_session_packages_select_auth" on public.client_session_packages;
create policy "client_session_packages_select_auth"
  on public.client_session_packages for select to authenticated
  using (true);

drop policy if exists "client_session_packages_insert_auth" on public.client_session_packages;
create policy "client_session_packages_insert_auth"
  on public.client_session_packages for insert to authenticated
  with check (true);

drop policy if exists "client_session_packages_update_auth" on public.client_session_packages;
create policy "client_session_packages_update_auth"
  on public.client_session_packages for update to authenticated
  using (true) with check (true);

drop policy if exists "client_session_packages_delete_admin_only" on public.client_session_packages;
create policy "client_session_packages_delete_admin_only"
  on public.client_session_packages for delete to authenticated
  using (public.is_owner_or_admin());

-- client_session_slots
drop policy if exists "auth_all_client_session_slots" on public.client_session_slots;
drop policy if exists "client_session_slots_select_auth" on public.client_session_slots;
create policy "client_session_slots_select_auth"
  on public.client_session_slots for select to authenticated
  using (true);

drop policy if exists "client_session_slots_insert_auth" on public.client_session_slots;
create policy "client_session_slots_insert_auth"
  on public.client_session_slots for insert to authenticated
  with check (true);

drop policy if exists "client_session_slots_update_auth" on public.client_session_slots;
create policy "client_session_slots_update_auth"
  on public.client_session_slots for update to authenticated
  using (true) with check (true);

drop policy if exists "client_session_slots_delete_admin_only" on public.client_session_slots;
create policy "client_session_slots_delete_admin_only"
  on public.client_session_slots for delete to authenticated
  using (public.is_owner_or_admin());

-- Keep client portal read policies if present (additive with select_auth)
-- (existing client_read_own_* policies remain)

-- 4) Audit triggers
drop trigger if exists trg_audit_delete_sales on public.sales;
create trigger trg_audit_delete_sales
  before delete on public.sales
  for each row execute function public.log_clinic_deletion();

drop trigger if exists trg_audit_delete_customers on public.customers;
create trigger trg_audit_delete_customers
  before delete on public.customers
  for each row execute function public.log_clinic_deletion();

drop trigger if exists trg_audit_delete_appointments on public.appointments;
create trigger trg_audit_delete_appointments
  before delete on public.appointments
  for each row execute function public.log_clinic_deletion();

drop trigger if exists trg_audit_delete_session_packages on public.client_session_packages;
create trigger trg_audit_delete_session_packages
  before delete on public.client_session_packages
  for each row execute function public.log_clinic_deletion();

drop trigger if exists trg_audit_delete_session_slots on public.client_session_slots;
create trigger trg_audit_delete_session_slots
  before delete on public.client_session_slots
  for each row execute function public.log_clinic_deletion();
