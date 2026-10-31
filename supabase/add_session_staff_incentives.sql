-- Illuminate — Per-session staff handler + optional incentive
-- Run in Supabase SQL Editor (safe to re-run).
-- When a client session is marked Finished, staff name + incentive amount are saved;
-- optional draft payout rows can be created with source = session_finished.

alter table public.client_session_slots
  add column if not exists handled_by text;

alter table public.client_session_slots
  add column if not exists incentive_amount numeric(12,2) not null default 0;

comment on column public.client_session_slots.handled_by is
  'Staff who handled this visit (for incentives / accountability).';
comment on column public.client_session_slots.incentive_amount is
  'Optional incentive ₱ for the staff who handled this finished session.';

-- Allow session_finished as incentive_payouts.source
alter table public.incentive_payouts drop constraint if exists incentive_payouts_source_check;
alter table public.incentive_payouts
  add constraint incentive_payouts_source_check
  check (source in ('manual', 'pos_sales_by', 'session_finished'));

-- Optional link back to the slot (idempotent create)
alter table public.incentive_payouts
  add column if not exists session_slot_id uuid references public.client_session_slots (id) on delete set null;

create unique index if not exists incentive_payouts_session_slot_uidx
  on public.incentive_payouts (session_slot_id)
  where session_slot_id is not null;

-- Clinic staff may insert session incentive drafts (HR still manages approve/pay)
drop policy if exists "clinic_insert_session_incentive_payouts" on public.incentive_payouts;
create policy "clinic_insert_session_incentive_payouts"
  on public.incentive_payouts for insert to authenticated
  with check (
    public.is_hr_access()
    or (
      source = 'session_finished'
      and public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
    )
  );

drop policy if exists "clinic_read_session_incentive_payouts" on public.incentive_payouts;
create policy "clinic_read_session_incentive_payouts"
  on public.incentive_payouts for select to authenticated
  using (
    public.is_hr_access()
    or public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
    or (profile_id is not null and profile_id = auth.uid())
  );
