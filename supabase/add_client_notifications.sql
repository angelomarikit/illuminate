-- Client inbox + push tokens for mobile/web Client portal.
-- Notifications fire on booking approval / decline / cancel.
-- Upcoming reminders are also derived on-device (like staff inbox).

create table if not exists public.client_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notice_key text not null,
  kind text not null,
  title text not null,
  body text not null,
  href text not null default '/(tabs)/appointments',
  appointment_id uuid references public.appointments (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, notice_key)
);

create index if not exists client_notifications_user_created_idx
  on public.client_notifications (user_id, created_at desc);

create index if not exists client_notifications_user_unread_idx
  on public.client_notifications (user_id)
  where read_at is null;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.client_notifications enable row level security;
alter table public.push_tokens enable row level security;

drop policy if exists "client_read_own_notifications" on public.client_notifications;
create policy "client_read_own_notifications"
  on public.client_notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "client_update_own_notifications" on public.client_notifications;
create policy "client_update_own_notifications"
  on public.client_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "client_delete_own_notifications" on public.client_notifications;
create policy "client_delete_own_notifications"
  on public.client_notifications for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "client_manage_own_push_tokens" on public.push_tokens;
create policy "client_manage_own_push_tokens"
  on public.push_tokens for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Resolve Client auth user for an appointment
create or replace function public.appointment_client_user_id(p_appointment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select c.user_id
      from public.appointments a
      join public.customers c on c.id = a.customer_id
      where a.id = p_appointment_id
        and c.user_id is not null
      limit 1
    ),
    (
      select p.id
      from public.appointments a
      join public.profiles p on lower(p.email) = lower(a.customer_email)
      where a.id = p_appointment_id
        and a.customer_email is not null
        and p.role = 'Client'
      limit 1
    )
  );
$$;

create or replace function public.enqueue_client_notification(
  p_user_id uuid,
  p_notice_key text,
  p_kind text,
  p_title text,
  p_body text,
  p_href text,
  p_appointment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.client_notifications (
    user_id, notice_key, kind, title, body, href, appointment_id
  ) values (
    p_user_id, p_notice_key, p_kind, p_title, p_body, coalesce(p_href, '/(tabs)/appointments'), p_appointment_id
  )
  on conflict (user_id, notice_key) do update
    set
      title = excluded.title,
      body = excluded.body,
      href = excluded.href,
      appointment_id = coalesce(excluded.appointment_id, public.client_notifications.appointment_id),
      read_at = null,
      created_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enqueue_client_notification(uuid, text, text, text, text, text, uuid) from public;
grant execute on function public.enqueue_client_notification(uuid, text, text, text, text, text, uuid) to service_role;

-- When clinic approves / declines / cancels a booking, notify the Client
create or replace function public.notify_client_on_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_when text;
  v_kind text;
  v_title text;
  v_body text;
  v_key text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  v_user := public.appointment_client_user_id(new.id);
  if v_user is null then
    return new;
  end if;

  v_when := to_char(new.appointment_date, 'Mon DD') || ' · ' || to_char(new.appointment_time, 'HH24:MI');

  if new.status = 'confirmed' and old.status = 'pending' then
    v_kind := 'booking_approved';
    v_title := 'Booking approved';
    v_body := new.service_name || ' on ' || v_when || ' is confirmed.';
    v_key := 'booking_approved:' || new.id::text;
  elsif new.status = 'declined' then
    v_kind := 'booking_declined';
    v_title := 'Booking declined';
    v_body := new.service_name || ' on ' || v_when || ' was declined by the clinic.';
    v_key := 'booking_declined:' || new.id::text;
  elsif new.status = 'cancelled' then
    v_kind := 'booking_cancelled';
    v_title := 'Booking cancelled';
    v_body := new.service_name || ' on ' || v_when || ' was cancelled.';
    v_key := 'booking_cancelled:' || new.id::text;
  else
    return new;
  end if;

  perform public.enqueue_client_notification(
    v_user,
    v_key,
    v_kind,
    v_title,
    v_body,
    '/(tabs)/appointments',
    new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_client_appointment_status on public.appointments;
create trigger trg_notify_client_appointment_status
  after update of status on public.appointments
  for each row
  execute function public.notify_client_on_appointment_status();

-- Also acknowledge pending received when client books (status pending insert)
create or replace function public.notify_client_on_appointment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_when text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  v_user := public.appointment_client_user_id(new.id);
  if v_user is null then
    return new;
  end if;

  v_when := to_char(new.appointment_date, 'Mon DD') || ' · ' || to_char(new.appointment_time, 'HH24:MI');

  perform public.enqueue_client_notification(
    v_user,
    'booking_received:' || new.id::text,
    'booking_received',
    'Booking request received',
    new.service_name || ' on ' || v_when || ' is waiting for clinic approval.',
    '/(tabs)/appointments',
    new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_client_appointment_insert on public.appointments;
create trigger trg_notify_client_appointment_insert
  after insert on public.appointments
  for each row
  execute function public.notify_client_on_appointment_insert();

comment on table public.client_notifications is
  'Client inbox items (approval/decline/cancel/received). Push delivered via Edge Function + Expo.';
comment on table public.push_tokens is
  'Expo push tokens for Illuminate Client mobile app.';

-- Optional: enable Realtime for instant inbox updates in the mobile app
-- (Dashboard → Database → Replication → add client_notifications)
do $$
begin
  begin
    alter publication supabase_realtime add table public.client_notifications;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
