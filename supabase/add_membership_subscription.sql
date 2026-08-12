-- Illuminate — VIP / VVIP membership subscriptions
-- Run after add_customer_birthday.sql (and core setup).
-- POS sells VIP (₱5,000) / VVIP (₱10,000); tags the customer + sets expiry (1 year per unit).

alter table public.customers
  add column if not exists membership_expires_at date;

alter table public.services
  add column if not exists membership_tier text
  check (membership_tier is null or membership_tier in ('VIP', 'VVIP'));

-- Normalize legacy labels → Regular / VIP / VVIP
update public.customers
set membership = case
  when membership in ('Luxe', 'VVIP') then 'VVIP'
  when membership in ('Glow', 'VIP') then 'VIP'
  else 'Regular'
end;

alter table public.customers
  alter column membership set default 'Regular';

-- Seed membership products (idempotent by name)
insert into public.services (
  name, category, price, duration_min, points_earn, points_cost, active, description, membership_tier
)
select
  v.name, v.category, v.price, v.duration_min, v.points_earn, v.points_cost, true, v.description, v.membership_tier
from (
  values
    (
      'VIP Membership',
      'Membership',
      5000::numeric,
      0,
      50,
      0,
      '1-year VIP client status. Sold at POS; tags the customer until expiry.',
      'VIP'
    ),
    (
      'VVIP Membership',
      'Membership',
      10000::numeric,
      0,
      100,
      0,
      '1-year VVIP client status. Sold at POS; tags the customer until expiry.',
      'VVIP'
    )
) as v(name, category, price, duration_min, points_earn, points_cost, description, membership_tier)
where not exists (
  select 1 from public.services s where s.name = v.name
);

update public.services
set
  category = 'Membership',
  price = 5000,
  membership_tier = 'VIP',
  active = true,
  description = coalesce(
    nullif(trim(description), ''),
    '1-year VIP client status. Sold at POS; tags the customer until expiry.'
  )
where name = 'VIP Membership';

update public.services
set
  category = 'Membership',
  price = 10000,
  membership_tier = 'VVIP',
  active = true,
  description = coalesce(
    nullif(trim(description), ''),
    '1-year VVIP client status. Sold at POS; tags the customer until expiry.'
  )
where name = 'VVIP Membership';
