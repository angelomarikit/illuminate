-- Illuminate — Calendar color tags on appointments
-- Run in Supabase SQL Editor (safe to re-run)

alter table public.appointments
  add column if not exists calendar_color text not null default '#b8954a';

comment on column public.appointments.calendar_color is
  'Hex color for calendar board visualization (clinic bookings).';
