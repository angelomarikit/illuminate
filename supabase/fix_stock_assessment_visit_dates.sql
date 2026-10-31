-- Illuminate — Fix Stock Assessment Out to match Client Sessions visit dates
-- Run in Supabase SQL Editor (safe to re-run).
--
-- Celebrity Drip example: linked BOM = 1× 1cc + 1× Celebrity Drip vial.
-- Each Finished session on 29 / 30 / 31 must Out=1 per item on THAT date
-- (not Out=3 on the day you clicked Save).

alter table public.inventory_treatment_usage
  add column if not exists usage_date date;

-- Force usage_date from session scheduled_date (overwrite wrong save-day stamps)
update public.inventory_treatment_usage u
set
  usage_date = s.scheduled_date,
  completed_at = ((s.scheduled_date::text || 'T12:00:00')::timestamp at time zone 'Asia/Manila')
from public.client_session_slots s
where u.session_slot_id = s.id
  and s.scheduled_date is not null;

-- Soft-deleted supplies must not stay linked to services
delete from public.service_inventory si
using public.inventory_items i
where si.inventory_item_id = i.id
  and i.deleted_at is not null;

-- Verify (optional): one Finished Celebrity Drip day → one usage row that day
-- select s.scheduled_date, p.service_name, p.customer_name, count(*)
-- from client_session_slots s
-- join client_session_packages p on p.id = s.package_id
-- where s.status = 'finished' and p.service_name ilike '%celebrity%'
-- group by 1,2,3 order by 1;
