-- Illuminate — Upsell incentive tiers (price bracket → ₱ for the attendant who offered the package)
-- Run in Supabase SQL Editor (safe to re-run).

create table if not exists public.upsell_tiers (
  id uuid primary key default gen_random_uuid(),
  min_amount numeric(12,2) not null,
  max_amount numeric(12,2),
  upsell_amount numeric(12,2) not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upsell_tiers_range_check check (max_amount is null or max_amount > min_amount)
);

comment on table public.upsell_tiers is
  'Package-total brackets. min is inclusive, max is exclusive (null = no cap).';

insert into public.upsell_tiers (min_amount, max_amount, upsell_amount, sort_order)
select v.min_amount, v.max_amount, v.upsell_amount, v.sort_order
from (
  values
    (0::numeric, 10000::numeric, 0::numeric, 1),
    (10000::numeric, 20000::numeric, 500::numeric, 2),
    (20000::numeric, 30000::numeric, 750::numeric, 3),
    (30000::numeric, 40000::numeric, 1000::numeric, 4),
    (40000::numeric, 60000::numeric, 2500::numeric, 5),
    (60000::numeric, 100000::numeric, 2000::numeric, 6),
    (100000::numeric, null::numeric, 20000::numeric, 7)
) as v(min_amount, max_amount, upsell_amount, sort_order)
where not exists (select 1 from public.upsell_tiers);

alter table public.upsell_tiers enable row level security;

drop policy if exists "clinic_read_upsell_tiers" on public.upsell_tiers;
create policy "clinic_read_upsell_tiers"
  on public.upsell_tiers for select to authenticated
  using (
    public.is_hr_access()
    or public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff', 'HR')
  );

drop policy if exists "hr_write_upsell_tiers" on public.upsell_tiers;
create policy "hr_write_upsell_tiers"
  on public.upsell_tiers for all to authenticated
  using (public.is_hr_access())
  with check (public.is_hr_access());

grant select, insert, update, delete on public.upsell_tiers to authenticated;

-- Snapshot on the sale so later tier edits do not rewrite past upsell.
-- null upsell_amount = not snapshotted yet (report falls back to current tiers).
alter table public.sales
  add column if not exists upsell_amount numeric(12,2);

alter table public.sales
  add column if not exists upsell_staff text;

comment on column public.sales.upsell_amount is
  'Upsell ₱ credited once for this sale. Null means it was saved before upsell snapshots.';
comment on column public.sales.upsell_staff is
  'Attendant who offered the package and receives the upsell.';

alter table public.incentive_payouts drop constraint if exists incentive_payouts_incentive_type_check;
alter table public.incentive_payouts
  add constraint incentive_payouts_incentive_type_check
  check (incentive_type in ('service_commission', 'product_incentive', 'other', 'upsell'));
