-- Illuminate — Service series = named plan with multiple category+service lines
-- Example series "Derma-approved Gluta Drips" can contain:
--   category "Gluta Push" → service Gluta Drip
--   category "Booster" → service Vitamin C
-- Run after services exist. Safe to re-run.

create table if not exists public.service_series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  special_package numeric(12, 2),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

-- Older flat columns (from first series SQL) — keep temporarily for migration
alter table public.service_series add column if not exists category text;
alter table public.service_series add column if not exists service_id uuid references public.services (id) on delete set null;
alter table public.service_series add column if not exists price_per_session numeric(12, 2);
alter table public.service_series add column if not exists sessions integer;

-- Legacy NOT NULL from the first series SQL — category/service now live on items
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_series'
      and column_name = 'category'
      and is_nullable = 'NO'
  ) then
    alter table public.service_series alter column category drop not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_series'
      and column_name = 'price_per_session'
      and is_nullable = 'NO'
  ) then
    alter table public.service_series alter column price_per_session drop not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_series'
      and column_name = 'sessions'
      and is_nullable = 'NO'
  ) then
    alter table public.service_series alter column sessions drop not null;
  end if;
end $$;

create table if not exists public.service_series_items (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.service_series (id) on delete cascade,
  category text not null,
  service_id uuid references public.services (id) on delete set null,
  price_per_session numeric(12, 2) not null default 0,
  sessions integer not null default 1 check (sessions >= 1),
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists service_series_active_idx
  on public.service_series (active, sort_order, name);

create index if not exists service_series_items_series_idx
  on public.service_series_items (series_id, sort_order);

-- Migrate legacy one-row series into items (once)
insert into public.service_series_items (
  series_id, category, service_id, price_per_session, sessions, sort_order
)
select
  s.id,
  coalesce(nullif(trim(s.category), ''), 'General'),
  s.service_id,
  coalesce(s.price_per_session, 0),
  greatest(coalesce(s.sessions, 1), 1),
  100
from public.service_series s
where coalesce(nullif(trim(s.category), ''), s.service_id::text) is not null
  and not exists (
    select 1 from public.service_series_items i where i.series_id = s.id
  );

alter table public.service_series enable row level security;
alter table public.service_series_items enable row level security;

drop policy if exists "auth_read_service_series" on public.service_series;
create policy "auth_read_service_series"
  on public.service_series for select to authenticated
  using (true);

drop policy if exists "elevated_insert_service_series" on public.service_series;
create policy "elevated_insert_service_series"
  on public.service_series for insert to authenticated
  with check (public.current_app_role() in ('Owner', 'Admin'));

drop policy if exists "elevated_update_service_series" on public.service_series;
create policy "elevated_update_service_series"
  on public.service_series for update to authenticated
  using (public.current_app_role() in ('Owner', 'Admin'))
  with check (public.current_app_role() in ('Owner', 'Admin'));

drop policy if exists "elevated_delete_service_series" on public.service_series;
create policy "elevated_delete_service_series"
  on public.service_series for delete to authenticated
  using (public.current_app_role() in ('Owner', 'Admin'));

drop policy if exists "auth_read_service_series_items" on public.service_series_items;
create policy "auth_read_service_series_items"
  on public.service_series_items for select to authenticated
  using (true);

drop policy if exists "elevated_insert_service_series_items" on public.service_series_items;
create policy "elevated_insert_service_series_items"
  on public.service_series_items for insert to authenticated
  with check (public.current_app_role() in ('Owner', 'Admin'));

drop policy if exists "elevated_update_service_series_items" on public.service_series_items;
create policy "elevated_update_service_series_items"
  on public.service_series_items for update to authenticated
  using (public.current_app_role() in ('Owner', 'Admin'))
  with check (public.current_app_role() in ('Owner', 'Admin'));

drop policy if exists "elevated_delete_service_series_items" on public.service_series_items;
create policy "elevated_delete_service_series_items"
  on public.service_series_items for delete to authenticated
  using (public.current_app_role() in ('Owner', 'Admin'));

comment on table public.service_series is
  'Named multi-session plans; each plan contains category+service lines in service_series_items.';
comment on table public.service_series_items is
  'Category + service lines inside a series (not global catalog categories).';
