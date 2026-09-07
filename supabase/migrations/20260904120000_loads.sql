-- Shared loads for Mr. Bult's Load Tracker (trusted crew of ~4).
-- Run in the Supabase SQL editor or: supabase db push

create table if not exists public.loads (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  truck text not null,
  pickup text not null,
  commodity text not null,
  destination text not null,
  station_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  display_name text
);

create index if not exists loads_date_idx on public.loads (date);
create index if not exists loads_updated_at_idx on public.loads (updated_at desc);

create or replace function public.set_loads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists loads_set_updated_at on public.loads;
create trigger loads_set_updated_at
before update on public.loads
for each row
execute procedure public.set_loads_updated_at();

alter table public.loads enable row level security;

drop policy if exists "crew_select_loads" on public.loads;
create policy "crew_select_loads"
  on public.loads for select
  to authenticated
  using (true);

drop policy if exists "crew_insert_loads" on public.loads;
create policy "crew_insert_loads"
  on public.loads for insert
  to authenticated
  with check (true);

drop policy if exists "crew_update_loads" on public.loads;
create policy "crew_update_loads"
  on public.loads for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "crew_delete_loads" on public.loads;
create policy "crew_delete_loads"
  on public.loads for delete
  to authenticated
  using (true);

do $$
begin
  alter publication supabase_realtime add table public.loads;
exception
  when duplicate_object then null;
end;
$$;
