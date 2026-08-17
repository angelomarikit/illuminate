-- Chat conversation ownership, category/priority tags, cash-in receipt status

alter table public.chat_threads
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists customer_id uuid references public.customers (id) on delete set null,
  add column if not exists category text not null default 'support',
  add column if not exists priority text not null default 'normal';

alter table public.chat_threads
  drop constraint if exists chat_threads_category_check;
alter table public.chat_threads
  add constraint chat_threads_category_check
  check (category in ('support', 'cashin', 'message'));

alter table public.chat_threads
  drop constraint if exists chat_threads_priority_check;
alter table public.chat_threads
  add constraint chat_threads_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent'));

create index if not exists chat_threads_user_id_idx on public.chat_threads (user_id);
create index if not exists chat_threads_category_idx on public.chat_threads (category);
create index if not exists chat_threads_priority_idx on public.chat_threads (priority);

comment on column public.chat_threads.category is
  'Thread type tag: support | cashin | message';
comment on column public.chat_threads.priority is
  'Staff priority: low | normal | high | urgent';

alter table public.chat_messages
  add column if not exists kind text not null default 'message',
  add column if not exists cashin_status text;

alter table public.chat_messages
  drop constraint if exists chat_messages_kind_check;
alter table public.chat_messages
  add constraint chat_messages_kind_check
  check (kind in ('message', 'cashin'));

alter table public.chat_messages
  drop constraint if exists chat_messages_cashin_status_check;
alter table public.chat_messages
  add constraint chat_messages_cashin_status_check
  check (
    cashin_status is null
    or cashin_status in ('pending', 'received', 'not_received')
  );

comment on column public.chat_messages.kind is
  'message = normal chat; cashin = cash-in / receipt request';
comment on column public.chat_messages.cashin_status is
  'For kind=cashin: pending | received | not_received (staff tags)';

-- Allow empty body when only an image is attached (future-safe)
alter table public.chat_messages
  alter column body drop not null;
alter table public.chat_messages
  alter column body set default '';

-- Backfill cash-in-looking messages
update public.chat_messages
set
  kind = 'cashin',
  cashin_status = coalesce(cashin_status, 'pending')
where kind = 'message'
  and body ilike 'Cash-in request:%';

update public.chat_threads t
set category = 'cashin'
where category = 'support'
  and exists (
    select 1
    from public.chat_messages m
    where m.thread_id = t.id
      and m.kind = 'cashin'
  );

-- Tighten RLS: clinic staff see all; clients only own threads
drop policy if exists "auth_all_chat_threads" on public.chat_threads;
drop policy if exists "auth_all_chat_messages" on public.chat_messages;
drop policy if exists "clinic_all_chat_threads" on public.chat_threads;
drop policy if exists "clinic_all_chat_messages" on public.chat_messages;
drop policy if exists "client_select_own_chat_threads" on public.chat_threads;
drop policy if exists "client_insert_own_chat_threads" on public.chat_threads;
drop policy if exists "client_update_own_chat_threads" on public.chat_threads;
drop policy if exists "client_select_own_chat_messages" on public.chat_messages;
drop policy if exists "client_insert_own_chat_messages" on public.chat_messages;

create policy "clinic_all_chat_threads"
  on public.chat_threads for all to authenticated
  using (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory'))
  with check (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory'));

create policy "clinic_all_chat_messages"
  on public.chat_messages for all to authenticated
  using (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory'))
  with check (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff', 'HR', 'Inventory'));

create policy "client_select_own_chat_threads"
  on public.chat_threads for select to authenticated
  using (
    public.current_app_role() = 'Client'
    and user_id = auth.uid()
  );

create policy "client_insert_own_chat_threads"
  on public.chat_threads for insert to authenticated
  with check (
    public.current_app_role() = 'Client'
    and user_id = auth.uid()
  );

create policy "client_update_own_chat_threads"
  on public.chat_threads for update to authenticated
  using (
    public.current_app_role() = 'Client'
    and user_id = auth.uid()
  )
  with check (
    public.current_app_role() = 'Client'
    and user_id = auth.uid()
  );

create policy "client_select_own_chat_messages"
  on public.chat_messages for select to authenticated
  using (
    public.current_app_role() = 'Client'
    and exists (
      select 1
      from public.chat_threads t
      where t.id = thread_id
        and t.user_id = auth.uid()
    )
  );

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
    )
  );

-- Soft backfill: attach Client user_id when customer name matches a linked CRM client
update public.chat_threads t
set
  user_id = c.user_id,
  customer_id = coalesce(t.customer_id, c.id)
from public.customers c
where t.user_id is null
  and c.user_id is not null
  and lower(trim(c.full_name)) = lower(trim(t.customer_name));

update public.chat_threads t
set user_id = p.id
from public.profiles p
where t.user_id is null
  and p.role = 'Client'
  and lower(trim(p.full_name)) = lower(trim(t.customer_name));
