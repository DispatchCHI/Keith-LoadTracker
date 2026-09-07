-- Locked daily available-driver snapshots (Chicago calendar days).
-- Saturdays are never stored. Locked rows are write-once from the app.

create table if not exists public.driver_availability (
  date date primary key,
  base integer not null,
  offs integer not null,
  available integer not null,
  locked boolean not null default false,
  locked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_availability_locked_idx
  on public.driver_availability (locked, date);

create or replace function public.set_driver_availability_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists driver_availability_set_updated_at on public.driver_availability;
create trigger driver_availability_set_updated_at
before update on public.driver_availability
for each row
execute procedure public.set_driver_availability_updated_at();

alter table public.driver_availability enable row level security;

drop policy if exists "crew_select_driver_availability" on public.driver_availability;
create policy "crew_select_driver_availability"
  on public.driver_availability for select
  to authenticated
  using (true);

drop policy if exists "crew_insert_driver_availability" on public.driver_availability;
create policy "crew_insert_driver_availability"
  on public.driver_availability for insert
  to authenticated
  with check (true);

drop policy if exists "crew_update_driver_availability" on public.driver_availability;
create policy "crew_update_driver_availability"
  on public.driver_availability for update
  to authenticated
  using (locked = false)
  with check (true);

drop policy if exists "crew_delete_driver_availability" on public.driver_availability;
create policy "crew_delete_driver_availability"
  on public.driver_availability for delete
  to authenticated
  using (false);
