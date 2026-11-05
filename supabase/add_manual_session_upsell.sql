-- Manual upsell incentive, entered by staff on the session (same as the service incentive).
-- Run in Supabase SQL Editor (safe to re-run).

alter table public.client_session_slots
  add column if not exists upsell_amount numeric(12,2) not null default 0;

comment on column public.client_session_slots.upsell_amount is
  'Manual upsell ₱ typed by staff for this visit. Not calculated from a price table.';

-- A finished session can have both a service incentive and an upsell incentive.
drop index if exists public.incentive_payouts_session_slot_uidx;
create unique index if not exists incentive_payouts_session_slot_type_uidx
  on public.incentive_payouts (session_slot_id, incentive_type)
  where session_slot_id is not null;

alter table public.incentive_payouts drop constraint if exists incentive_payouts_incentive_type_check;
alter table public.incentive_payouts
  add constraint incentive_payouts_incentive_type_check
  check (incentive_type in ('service_commission', 'product_incentive', 'other', 'upsell'));
