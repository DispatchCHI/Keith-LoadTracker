-- Specialty open loads + station call hour grid (shared across devices).
-- Paste into Supabase SQL Editor and Run.

create table if not exists public.specialty_opens (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  station_id text not null,
  destination text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists specialty_opens_date_idx on public.specialty_opens (date);
create index if not exists specialty_opens_station_idx on public.specialty_opens (date, station_id);

alter table public.specialty_opens enable row level security;

drop policy if exists "crew_select_specialty_opens" on public.specialty_opens;
create policy "crew_select_specialty_opens"
  on public.specialty_opens for select to authenticated using (true);

drop policy if exists "crew_insert_specialty_opens" on public.specialty_opens;
create policy "crew_insert_specialty_opens"
  on public.specialty_opens for insert to authenticated with check (true);

drop policy if exists "crew_update_specialty_opens" on public.specialty_opens;
create policy "crew_update_specialty_opens"
  on public.specialty_opens for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_specialty_opens" on public.specialty_opens;
create policy "crew_delete_specialty_opens"
  on public.specialty_opens for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.specialty_opens;
exception when duplicate_object then null;
end $$;

create table if not exists public.station_call_days (
  date date primary key,
  board jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.station_call_days enable row level security;

drop policy if exists "crew_select_station_call_days" on public.station_call_days;
create policy "crew_select_station_call_days"
  on public.station_call_days for select to authenticated using (true);

drop policy if exists "crew_upsert_station_call_days" on public.station_call_days;
create policy "crew_upsert_station_call_days"
  on public.station_call_days for insert to authenticated with check (true);

drop policy if exists "crew_update_station_call_days" on public.station_call_days;
create policy "crew_update_station_call_days"
  on public.station_call_days for update to authenticated using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.station_call_days;
exception when duplicate_object then null;
end $$;
