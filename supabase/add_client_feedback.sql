-- Illuminate — Landing client feedback (slider)
-- Run in Supabase → SQL Editor (safe to re-run)
-- Requires: add_roles.sql (is_owner_or_admin)

create table if not exists public.client_feedback (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  treatment text not null default '',
  rating integer not null check (rating between 1 and 5),
  quote text not null,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_feedback_published_idx
  on public.client_feedback (is_published, sort_order, created_at desc);

alter table public.client_feedback enable row level security;

drop policy if exists "anon_read_published_feedback" on public.client_feedback;
create policy "anon_read_published_feedback"
  on public.client_feedback for select to anon
  using (is_published = true);

drop policy if exists "auth_read_feedback" on public.client_feedback;
create policy "auth_read_feedback"
  on public.client_feedback for select to authenticated
  using (
    is_published = true
    or public.is_owner_or_admin()
  );

drop policy if exists "owner_admin_insert_feedback" on public.client_feedback;
create policy "owner_admin_insert_feedback"
  on public.client_feedback for insert to authenticated
  with check (public.is_owner_or_admin());

drop policy if exists "owner_admin_update_feedback" on public.client_feedback;
create policy "owner_admin_update_feedback"
  on public.client_feedback for update to authenticated
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

drop policy if exists "owner_admin_delete_feedback" on public.client_feedback;
create policy "owner_admin_delete_feedback"
  on public.client_feedback for delete to authenticated
  using (public.is_owner_or_admin());

grant select on public.client_feedback to anon, authenticated;
grant insert, update, delete on public.client_feedback to authenticated;

-- Seed defaults only when empty
insert into public.client_feedback (client_name, treatment, rating, quote, sort_order)
select *
from (
  values
    (
      'Marielle S.',
      'Skin rejuvenation',
      5,
      'The consultation felt unhurried and precise. My skin looked clearer within weeks — and the booking process was effortless.',
      1
    ),
    (
      'Andrea L.',
      'Aesthetic consult',
      5,
      'Private, calm, and thoroughly professional. They explained every step so I always knew what to expect.',
      2
    ),
    (
      'Kristine D.',
      'Facial treatment',
      4,
      'Beautiful results without looking overdone. The team confirmed my appointment quickly and made the visit feel personal.',
      3
    )
) as seed(client_name, treatment, rating, quote, sort_order)
where not exists (select 1 from public.client_feedback limit 1);
