-- Trucks available to dispatch to a transfer station. Single crew row.
-- slots is { "<stationOrderKey>": ["207", "", ...] } so another station
-- can be turned on later without a new table. Idempotent.

create table if not exists public.station_truck_pool (
  id text primary key,
  slots jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.station_truck_pool is
  'Shared Today-card truck boxes. One crew row. Keys are stationOrderKey values.';

alter table public.station_truck_pool enable row level security;

drop policy if exists "crew_select_station_truck_pool" on public.station_truck_pool;
create policy "crew_select_station_truck_pool"
  on public.station_truck_pool for select to authenticated using (true);

drop policy if exists "crew_insert_station_truck_pool" on public.station_truck_pool;
create policy "crew_insert_station_truck_pool"
  on public.station_truck_pool for insert to authenticated with check (true);

drop policy if exists "crew_update_station_truck_pool" on public.station_truck_pool;
create policy "crew_update_station_truck_pool"
  on public.station_truck_pool for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_station_truck_pool" on public.station_truck_pool;
create policy "crew_delete_station_truck_pool"
  on public.station_truck_pool for delete to authenticated using (true);

insert into public.station_truck_pool (id, slots)
values ('crew', '{}'::jsonb)
on conflict (id) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.station_truck_pool;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
