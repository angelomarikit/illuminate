-- Illuminate — Public landing booking → appointments approvals
-- Run in Supabase → SQL Editor (safe to re-run)

-- 1) Booking request fields on appointments
alter table public.appointments add column if not exists customer_email text;
alter table public.appointments add column if not exists customer_phone text;
alter table public.appointments add column if not exists customer_age integer;
alter table public.appointments add column if not exists customer_sex text;
alter table public.appointments add column if not exists customer_address text;
alter table public.appointments add column if not exists medical_history text;
alter table public.appointments add column if not exists special_note text;
alter table public.appointments add column if not exists source text not null default 'clinic';

-- Allow pending / declined statuses (keep existing values working)
alter table public.appointments drop constraint if exists appointments_status_check;
-- no hard check so existing free-text statuses keep working

-- 2) Promo / announcement bar on clinic settings
alter table public.clinic_settings
  add column if not exists promo_bar_text text
  default 'New clients: enjoy complimentary skin analysis with your first facial this month.';
alter table public.clinic_settings
  add column if not exists promo_bar_active boolean not null default true;
alter table public.clinic_settings
  add column if not exists promo_bar_link text default '#book';

-- 3) Public-safe booked slots (no PII)
create or replace function public.list_booked_slots(from_date date, to_date date)
returns table (appointment_date date, appointment_time time)
language sql
stable
security definer
set search_path = public
as $$
  select a.appointment_date, a.appointment_time
  from public.appointments a
  where a.appointment_date between from_date and to_date
    and a.status not in ('cancelled', 'declined', 'completed')
  order by a.appointment_date, a.appointment_time;
$$;

revoke all on function public.list_booked_slots(date, date) from public;
grant execute on function public.list_booked_slots(date, date) to anon, authenticated;

-- 4) Public read: active services + promo settings
drop policy if exists "anon_read_active_services" on public.services;
create policy "anon_read_active_services"
  on public.services for select to anon
  using (active = true);

drop policy if exists "anon_read_clinic_settings" on public.clinic_settings;
create policy "anon_read_clinic_settings"
  on public.clinic_settings for select to anon
  using (true);

-- 5) Public can submit booking requests only (pending + web source)
drop policy if exists "anon_insert_booking_requests" on public.appointments;
create policy "anon_insert_booking_requests"
  on public.appointments for insert to anon
  with check (
    status = 'pending'
    and type = 'appointment'
    and coalesce(source, 'web') = 'web'
  );
