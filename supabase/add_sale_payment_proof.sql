-- Payment proof screenshot on sales (POS → Sales Proof)

alter table public.sales
  add column if not exists payment_proof_url text;

comment on column public.sales.payment_proof_url is
  'Optional public URL of payment screenshot uploaded at POS checkout.';

insert into storage.buckets (id, name, public)
values ('sale-payment-proofs', 'sale-payment-proofs', true)
on conflict (id) do nothing;

drop policy if exists "sale_payment_proofs_public_read" on storage.objects;
create policy "sale_payment_proofs_public_read"
  on storage.objects for select
  using (bucket_id = 'sale-payment-proofs');

drop policy if exists "sale_payment_proofs_auth_upload" on storage.objects;
create policy "sale_payment_proofs_auth_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sale-payment-proofs'
    and public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

drop policy if exists "sale_payment_proofs_auth_update" on storage.objects;
create policy "sale_payment_proofs_auth_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'sale-payment-proofs'
    and public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

drop policy if exists "sale_payment_proofs_auth_delete" on storage.objects;
create policy "sale_payment_proofs_auth_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sale-payment-proofs'
    and public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );
