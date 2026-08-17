-- Cash-in receipt attachments on chat + wallet top-up client notifications

alter table public.chat_messages
  add column if not exists image_url text;

comment on column public.chat_messages.image_url is
  'Optional public URL for receipt / attachment images (cash-in proof, etc.).';

-- Storage bucket for cash-in / chat receipt images
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

drop policy if exists "chat_attachments_public_read" on storage.objects;
create policy "chat_attachments_public_read"
  on storage.objects for select
  using (bucket_id = 'chat-attachments');

drop policy if exists "chat_attachments_auth_upload" on storage.objects;
create policy "chat_attachments_auth_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat_attachments_auth_update" on storage.objects;
create policy "chat_attachments_auth_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat_attachments_auth_delete" on storage.objects;
create policy "chat_attachments_auth_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Notify Client when wallet is topped up (positive cash-in loyalty txn)
create or replace function public.notify_client_on_wallet_topup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_amount numeric;
  v_label text;
begin
  if new.type is distinct from 'cash-in' then
    return new;
  end if;

  v_amount := coalesce(new.amount, 0);
  -- POS wallet spend uses negative amounts; only notify on top-ups
  if v_amount <= 0 then
    return new;
  end if;

  select c.user_id into v_user
  from public.customers c
  where c.id = new.customer_id
  limit 1;

  if v_user is null and new.customer_name is not null then
    select p.id into v_user
    from public.profiles p
    join public.customers c on lower(c.email) = lower(p.email)
    where c.id = new.customer_id
      and p.role = 'Client'
    limit 1;
  end if;

  if v_user is null then
    select p.id into v_user
    from public.profiles p
    where p.role = 'Client'
      and lower(p.email) = lower((
        select c.email from public.customers c where c.id = new.customer_id limit 1
      ))
    limit 1;
  end if;

  if v_user is null then
    return new;
  end if;

  v_label := to_char(v_amount, 'FM999,999,999,990.00');

  perform public.enqueue_client_notification(
    v_user,
    'wallet_topup:' || new.id::text,
    'wallet_topup',
    'Wallet topped up',
    'Successful top-up of ₱' || v_label || ' has been added to your cash-in wallet.',
    '/(tabs)/rewards',
    null
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_client_wallet_topup on public.loyalty_transactions;
create trigger trg_notify_client_wallet_topup
  after insert on public.loyalty_transactions
  for each row
  execute function public.notify_client_on_wallet_topup();
