-- Customer PDF consent forms (Receptionist / Admin / Owner)

create table if not exists public.customer_consent_forms (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  file_name text not null,
  file_url text not null,
  storage_path text not null,
  note text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists customer_consent_forms_customer_idx
  on public.customer_consent_forms (customer_id, created_at desc);

comment on table public.customer_consent_forms is
  'PDF consent forms attached to CRM customers by clinic staff.';

alter table public.customer_consent_forms enable row level security;

drop policy if exists "clinic_all_customer_consent_forms" on public.customer_consent_forms;
create policy "clinic_all_customer_consent_forms"
  on public.customer_consent_forms for all to authenticated
  using (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff'))
  with check (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff'));

insert into storage.buckets (id, name, public)
values ('customer-consent-forms', 'customer-consent-forms', true)
on conflict (id) do nothing;

drop policy if exists "customer_consent_forms_public_read" on storage.objects;
create policy "customer_consent_forms_public_read"
  on storage.objects for select
  using (bucket_id = 'customer-consent-forms');

drop policy if exists "customer_consent_forms_auth_upload" on storage.objects;
create policy "customer_consent_forms_auth_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'customer-consent-forms'
    and public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

drop policy if exists "customer_consent_forms_auth_update" on storage.objects;
create policy "customer_consent_forms_auth_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'customer-consent-forms'
    and public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

drop policy if exists "customer_consent_forms_auth_delete" on storage.objects;
create policy "customer_consent_forms_auth_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'customer-consent-forms'
    and public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );
