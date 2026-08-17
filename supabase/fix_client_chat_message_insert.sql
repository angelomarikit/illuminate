-- Fix: allow Clients to insert messages on their own OPEN chat threads

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
