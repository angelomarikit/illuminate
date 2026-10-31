-- Illuminate — Previous records migration (screenshots from old system)
-- Run in Supabase SQL Editor (safe to re-run).
-- Client Profile → Previous records: upload/view historical screenshots per customer.

create table if not exists public.customer_previous_records (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  file_name text not null,
  file_url text not null,
  storage_path text not null,
  caption text,
  record_date date,
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists customer_previous_records_customer_idx
  on public.customer_previous_records (customer_id, created_at desc);

comment on table public.customer_previous_records is
  'Screenshots / scans of client history migrated from the old clinic system.';

alter table public.customer_previous_records enable row level security;

drop policy if exists "clinic_all_customer_previous_records" on public.customer_previous_records;
create policy "clinic_all_customer_previous_records"
  on public.customer_previous_records for all to authenticated
  using (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff'))
  with check (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff'));

grant select, insert, update, delete on public.customer_previous_records to authenticated;

insert into storage.buckets (id, name, public)
values ('customer-previous-records', 'customer-previous-records', true)
on conflict (id) do nothing;

drop policy if exists "customer_previous_records_public_read" on storage.objects;
create policy "customer_previous_records_public_read"
  on storage.objects for select
  using (bucket_id = 'customer-previous-records');

drop policy if exists "customer_previous_records_auth_upload" on storage.objects;
create policy "customer_previous_records_auth_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'customer-previous-records'
    and public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

drop policy if exists "customer_previous_records_auth_update" on storage.objects;
create policy "customer_previous_records_auth_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'customer-previous-records'
    and public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

drop policy if exists "customer_previous_records_auth_delete" on storage.objects;
create policy "customer_previous_records_auth_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'customer-previous-records'
    and public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );
