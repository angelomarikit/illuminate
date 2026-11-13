-- Illuminate — Expand client journeys into 11-step visit board
-- Safe to re-run. Migrates old 1–4 clinical form steps into board slots 2/4/5 + social_consent.

alter table public.client_journeys
  add column if not exists links jsonb not null default '{}'::jsonb;

alter table public.client_journeys
  add column if not exists safety_paused boolean not null default false;

alter table public.client_journeys
  add column if not exists safety_cleared_at timestamptz;

alter table public.client_journeys
  add column if not exists safety_note text;

alter table public.client_journeys
  add column if not exists social_consent jsonb;

comment on column public.client_journeys.links is
  'Visit deep-link bag: saleId, saleReceiptNo, packageId, sessionSlotId, appointmentId';
comment on column public.client_journeys.social_consent is
  'Optional social media consent payload; never required to complete the visit';
comment on table public.client_journeys is
  'Header for a client visit board (arrival through aftercare, steps 1–11).';

-- Widen current_step / step_number checks to 1–11
alter table public.client_journeys drop constraint if exists client_journeys_current_step_check;
alter table public.client_journeys
  add constraint client_journeys_current_step_check
  check (current_step >= 1 and current_step <= 11);

alter table public.client_journey_steps drop constraint if exists client_journey_steps_step_number_check;
alter table public.client_journey_steps
  add constraint client_journey_steps_step_number_check
  check (step_number >= 1 and step_number <= 11);

comment on table public.client_journey_steps is
  'Per-step payloads for the 11-step client visit board.';

-- One-time remap of legacy 4-step clinical journeys that still look like the old model:
-- old 1→board 2 (forms), old 2→board 4 (16-point), old 3→board 5 (proposal), old 4→social_consent
do $$
declare
  j record;
  s record;
  has_board boolean;
  max_board int;
begin
  for j in
    select id, current_step, social_consent
    from public.client_journeys
  loop
    -- Skip if already has any board-native step numbers beyond legacy remap markers
    select exists (
      select 1 from public.client_journey_steps
      where journey_id = j.id and step_number in (6, 7, 8, 9, 10, 11)
    ) into has_board;
    if has_board then
      continue;
    end if;

    -- Only migrate when all existing steps are in 1..4 and look like the old clinical set
    if not exists (
      select 1 from public.client_journey_steps where journey_id = j.id
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.client_journey_steps
      where journey_id = j.id and step_number not in (1, 2, 3, 4)
    ) then
      continue;
    end if;

    -- Move social consent off the board if present as old step 4
    for s in
      select id, payload, completed_at, completed_by
      from public.client_journey_steps
      where journey_id = j.id and step_number = 4
    loop
      if j.social_consent is null then
        update public.client_journeys
        set social_consent = s.payload
        where id = j.id;
      end if;
      delete from public.client_journey_steps where id = s.id;
    end loop;

    -- Remap 3→5, 2→4, 1→2 (highest first to avoid unique collisions)
    update public.client_journey_steps
      set step_number = 5
      where journey_id = j.id and step_number = 3;

    update public.client_journey_steps
      set step_number = 4
      where journey_id = j.id and step_number = 2;

    update public.client_journey_steps
      set step_number = 2
      where journey_id = j.id and step_number = 1;

    select coalesce(max(step_number), 1) into max_board
    from public.client_journey_steps
    where journey_id = j.id and completed_at is not null;

    update public.client_journeys
    set current_step = least(11, greatest(1, coalesce(max_board, 1)))
    where id = j.id
      and current_step <= 4;
  end loop;
end $$;
