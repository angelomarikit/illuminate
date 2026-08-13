-- Illuminate — Notification acknowledgments (role-scoped inbox)
-- Run in Supabase SQL Editor (safe to re-run)
--
-- Notifications themselves are derived live from appointments / leave / inventory.
-- This table stores which notice keys each user has acknowledged (social-style unread).

create table if not exists public.notification_acks (
  user_id uuid not null references auth.users (id) on delete cascade,
  notice_key text not null,
  acked_at timestamptz not null default now(),
  primary key (user_id, notice_key)
);

create index if not exists notification_acks_user_acked_idx
  on public.notification_acks (user_id, acked_at desc);

alter table public.notification_acks enable row level security;

drop policy if exists "own_notification_acks_select" on public.notification_acks;
create policy "own_notification_acks_select"
  on public.notification_acks for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own_notification_acks_insert" on public.notification_acks;
create policy "own_notification_acks_insert"
  on public.notification_acks for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own_notification_acks_update" on public.notification_acks;
create policy "own_notification_acks_update"
  on public.notification_acks for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own_notification_acks_delete" on public.notification_acks;
create policy "own_notification_acks_delete"
  on public.notification_acks for delete to authenticated
  using (user_id = auth.uid());

comment on table public.notification_acks is
  'Per-user acknowledgment of derived notification keys (unread until acked).';
