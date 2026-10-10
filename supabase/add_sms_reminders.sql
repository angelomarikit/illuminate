-- Illuminate — SMS confirmations & reminders (Itexmo)
-- Run in Supabase → SQL Editor (safe to re-run)
--
-- After this migration:
-- 1) Deploy: supabase functions deploy send-sms
-- 2) Set secrets: ITEXMO_EMAIL, ITEXMO_PASSWORD, ITEXMO_API_CODE
-- 3) Schedule send_due_reminders (see docs/RUN_SUPABASE_SETUP.md)

-- ========== Settings (single row) ==========
create table if not exists public.sms_settings (
  id integer primary key default 1 check (id = 1),
  confirmation_enabled boolean not null default true,
  reminder_enabled boolean not null default true,
  reminder_minutes_before integer not null default 60
    check (reminder_minutes_before >= 5 and reminder_minutes_before <= 10080),
  confirmation_template text not null default
    'Hi {name}, your {service} is confirmed on {date} at {time}. - Illuminate Medical Aesthetics',
  reminder_template text not null default
    'Reminder: {name}, your {service} is coming up ({date} {time}). See you soon! - Illuminate',
  updated_at timestamptz not null default now()
);

insert into public.sms_settings (id) values (1)
on conflict (id) do nothing;

comment on table public.sms_settings is
  'Clinic SMS templates and reminder lead time for Itexmo broadcasts';

-- ========== Outbound log ==========
create table if not exists public.sms_logs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments (id) on delete set null,
  customer_name text,
  phone text not null,
  kind text not null check (kind in ('confirmation', 'reminder', 'test')),
  message text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed')),
  itexmo_reference_id text,
  error text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sms_logs_created_idx
  on public.sms_logs (created_at desc);

create index if not exists sms_logs_appointment_kind_idx
  on public.sms_logs (appointment_id, kind, status);

create index if not exists sms_logs_kind_status_idx
  on public.sms_logs (kind, status, scheduled_for);

comment on table public.sms_logs is
  'Outbound SMS log for booking confirmations, reminders, and test sends';

-- ========== RLS ==========
alter table public.sms_settings enable row level security;
alter table public.sms_logs enable row level security;

drop policy if exists "elevated_read_sms_settings" on public.sms_settings;
create policy "elevated_read_sms_settings"
  on public.sms_settings for select to authenticated
  using (public.is_owner_or_admin());

drop policy if exists "elevated_write_sms_settings" on public.sms_settings;
create policy "elevated_write_sms_settings"
  on public.sms_settings for update to authenticated
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

drop policy if exists "elevated_all_sms_logs" on public.sms_logs;
create policy "elevated_all_sms_logs"
  on public.sms_logs for all to authenticated
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- Clinic staff can insert confirmation/reminder logs via app when Owner/Admin;
-- edge function uses service role. Receptionists do not manage settings.

grant select, update on public.sms_settings to authenticated;
grant select, insert, update, delete on public.sms_logs to authenticated;
