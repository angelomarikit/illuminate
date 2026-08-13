-- Illuminate — Custom service categories (Owner / Admin manage)
-- Run in Supabase SQL Editor (safe to re-run)

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create unique index if not exists service_categories_name_uidx
  on public.service_categories (lower(trim(name)));

alter table public.service_categories enable row level security;

drop policy if exists "auth_read_service_categories" on public.service_categories;
create policy "auth_read_service_categories"
  on public.service_categories for select to authenticated
  using (true);

drop policy if exists "elevated_insert_service_categories" on public.service_categories;
create policy "elevated_insert_service_categories"
  on public.service_categories for insert to authenticated
  with check (public.current_app_role() in ('Owner', 'Admin'));

drop policy if exists "elevated_update_service_categories" on public.service_categories;
create policy "elevated_update_service_categories"
  on public.service_categories for update to authenticated
  using (public.current_app_role() in ('Owner', 'Admin'))
  with check (public.current_app_role() in ('Owner', 'Admin'));

drop policy if exists "elevated_delete_service_categories" on public.service_categories;
create policy "elevated_delete_service_categories"
  on public.service_categories for delete to authenticated
  using (public.current_app_role() in ('Owner', 'Admin'));

-- Seed defaults if empty (keeps existing POS filters working)
insert into public.service_categories (name, sort_order)
select v.name, v.sort_order
from (
  values
    ('Facials', 10),
    ('Injectables', 20),
    ('Laser', 30),
    ('Body', 40),
    ('Skincare', 50),
    ('Packages', 60),
    ('Membership', 70)
) as v(name, sort_order)
where not exists (select 1 from public.service_categories limit 1);

-- Also ensure any category already used on services exists in the catalog
insert into public.service_categories (name, sort_order)
select distinct trim(s.category), 200
from public.services s
where coalesce(trim(s.category), '') <> ''
  and not exists (
    select 1
    from public.service_categories c
    where lower(c.name) = lower(trim(s.category))
  );

comment on table public.service_categories is
  'Service catalog categories; Owner/Admin can add new ones for later services.';
