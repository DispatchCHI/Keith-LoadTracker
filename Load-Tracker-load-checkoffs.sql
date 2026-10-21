-- Load Tracker 1.1.45: shared Evanston load check-off (shade + checked time + who).
-- Idempotent: safe to run more than once. Additive only (new table), nothing deleted.
create table if not exists public.load_checkoffs (
  load_id text primary key,
  checked boolean not null default false,
  checked_at timestamptz,
  checked_by text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create index if not exists load_checkoffs_updated_at_idx on public.load_checkoffs (updated_at desc);

alter table public.load_checkoffs enable row level security;

drop policy if exists "crew_select_load_checkoffs" on public.load_checkoffs;
create policy "crew_select_load_checkoffs" on public.load_checkoffs
  for select to authenticated using (true);

drop policy if exists "crew_insert_load_checkoffs" on public.load_checkoffs;
create policy "crew_insert_load_checkoffs" on public.load_checkoffs
  for insert to authenticated with check (true);

drop policy if exists "crew_update_load_checkoffs" on public.load_checkoffs;
create policy "crew_update_load_checkoffs" on public.load_checkoffs
  for update to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
