-- Illuminate — Per-session installment payments on package slots
-- Run in Supabase → SQL Editor (safe to re-run)
-- Requires: client_session_slots, sales

alter table public.client_session_slots
  add column if not exists payment_amount numeric(12,2) not null default 0;

alter table public.client_session_slots
  add column if not exists attendant text;

alter table public.client_session_slots
  add column if not exists sale_id uuid references public.sales (id) on delete set null;

comment on column public.client_session_slots.payment_amount is
  'Installment amount recorded for this session visit; links to sales via sale_id';

comment on column public.client_session_slots.attendant is
  'Staff who administered / collected this session installment';

comment on column public.client_session_slots.sale_id is
  'Sales Proof receipt created for this installment payment';

create index if not exists client_session_slots_sale_idx
  on public.client_session_slots (sale_id);

notify pgrst, 'reload schema';
