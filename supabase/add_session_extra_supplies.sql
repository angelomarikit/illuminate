-- Illuminate — Link optional session "extra supplies" issues to client_session_slots
-- Run after add_inventory_issues.sql and add_client_session_slots.sql
-- Safe to re-run.

alter table public.inventory_issues
  add column if not exists session_slot_id uuid references public.client_session_slots (id) on delete set null;

comment on column public.inventory_issues.session_slot_id is
  'When set, this issue is the optional extra supplies log for a finished client session slot (BOM still via treatment usage).';

create unique index if not exists inventory_issues_session_slot_uidx
  on public.inventory_issues (session_slot_id)
  where session_slot_id is not null;

create index if not exists inventory_issues_session_slot_idx
  on public.inventory_issues (session_slot_id)
  where session_slot_id is not null;
