-- Illuminate — Force treatment Out onto SESSION visit dates (29/30/31 not save day)
-- Run in Supabase SQL Editor (safe to re-run).
--
-- Your Stock Assessment showed Out=3 on Oct 31 because all 3 Celebrity Drip
-- Finished sessions were stamped with the SAVE day. This rewrites usage_date
-- from client_session_slots.scheduled_date / appointments.appointment_date.

alter table public.inventory_treatment_usage
  add column if not exists usage_date date;

-- 1) Always sync from session slot visit date (overwrite wrong save-day stamps)
update public.inventory_treatment_usage u
set
  usage_date = s.scheduled_date,
  completed_at = ((s.scheduled_date::text || 'T12:00:00')::timestamp at time zone 'Asia/Manila')
from public.client_session_slots s
where u.session_slot_id = s.id
  and s.scheduled_date is not null;

-- 2) From appointment date when no slot link
update public.inventory_treatment_usage u
set
  usage_date = a.appointment_date,
  completed_at = ((a.appointment_date::text || 'T12:00:00')::timestamp at time zone 'Asia/Manila')
from public.appointments a
where u.appointment_id = a.id
  and u.session_slot_id is null
  and a.appointment_date is not null
  and coalesce(a.special_note, '') !~* '\[session_slot:';

-- 3) Link orphan appointment-based usage to session slots via marker, then fix date
update public.inventory_treatment_usage u
set
  session_slot_id = s.id,
  usage_date = s.scheduled_date,
  completed_at = ((s.scheduled_date::text || 'T12:00:00')::timestamp at time zone 'Asia/Manila')
from public.appointments a
join public.client_session_slots s
  on a.special_note ilike '%[session_slot:' || s.package_id::text || ':' || s.session_number::text || ']%'
where u.appointment_id = a.id
  and u.session_slot_id is null
  and s.scheduled_date is not null;

-- 4) Repair Finished sessions that still have no usage row (if helper exists)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'repair_finished_session_supply_deductions'
  ) then
    perform public.repair_finished_session_supply_deductions();
  end if;
end $$;
