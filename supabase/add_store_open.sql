-- Run once if you already applied setup.sql earlier
alter table public.branches add column if not exists is_open boolean not null default true;
