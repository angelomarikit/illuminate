-- Closeable chat threads: staff can close; clients cannot message closed threads

alter table public.chat_threads
  add column if not exists status text not null default 'open';

alter table public.chat_threads
  drop constraint if exists chat_threads_status_check;
alter table public.chat_threads
  add constraint chat_threads_status_check
  check (status in ('open', 'closed'));

alter table public.chat_threads
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users (id) on delete set null;

create index if not exists chat_threads_status_idx on public.chat_threads (status);

comment on column public.chat_threads.status is
  'open = client can message; closed = read-only for client';

-- Clients may only insert on open threads they own
drop policy if exists "client_insert_own_chat_messages" on public.chat_messages;

create policy "client_insert_own_chat_messages"
  on public.chat_messages for insert to authenticated
  with check (
    public.current_app_role() = 'Client'
    and sender = 'customer'
    and exists (
      select 1
      from public.chat_threads t
      where t.id = thread_id
        and t.user_id = auth.uid()
        and coalesce(t.status, 'open') = 'open'
    )
  );

-- Staff can still message closed threads (optional follow-up note); keep clinic_all as-is
