-- Illuminate — Customer intake fields for Register Clients wizard
-- Run after core setup / customer birthday / public booking flow columns exist.
-- Existing customers keep NULL/empty; UI shows N/A.

alter table public.customers add column if not exists occupation text;
alter table public.customers add column if not exists facebook text;
alter table public.customers add column if not exists instagram text;
alter table public.customers add column if not exists medical_conditions jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists topical_medications text;
alter table public.customers add column if not exists medications_intake text;
alter table public.customers add column if not exists lifestyle jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists history_notes jsonb not null default '[]'::jsonb;
alter table public.customers add column if not exists signature_primary text;
alter table public.customers add column if not exists signature_confirm text;
alter table public.customers add column if not exists intake_completed_at timestamptz;

comment on column public.customers.occupation is 'Client occupation from Register Clients intake';
comment on column public.customers.medical_conditions is 'Checkbox map + others text from medical checklist';
comment on column public.customers.lifestyle is 'smoking/alcohol/beverages/others from lifestyle step';
comment on column public.customers.history_notes is 'Array of {id,text,created_at} history entries';
comment on column public.customers.signature_primary is 'PNG data URL of primary intake signature';
comment on column public.customers.signature_confirm is 'PNG data URL of confirmation signature';
