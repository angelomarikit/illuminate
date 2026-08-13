-- Illuminate — Cancellation reason on appointments
-- Run in Supabase SQL Editor (safe to re-run)

alter table public.appointments
  add column if not exists cancellation_reason text;

comment on column public.appointments.cancellation_reason is
  'Why the appointment was cancelled (clinic cancel flow).';
