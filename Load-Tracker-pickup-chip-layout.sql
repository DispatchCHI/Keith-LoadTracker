-- Log Load pickup chip order. One row for the whole crew.
-- Already live in production Supabase (bkwrqtlvybzbjdakdvka) with RLS,
-- authenticated select/insert/update/delete, and supabase_realtime.
-- Paste into the Supabase SQL Editor only if you need to recreate it.
-- Idempotent. Does not alter any other table.

create table if not exists public.pickup_chip_layout (
  id text primary key,
  columns jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.pickup_chip_layout is
  'Shared Log Load pickup chip order. One crew row, four columns of station keys.';

alter table public.pickup_chip_layout enable row level security;

drop policy if exists "crew_select_pickup_chip_layout" on public.pickup_chip_layout;
create policy "crew_select_pickup_chip_layout"
  on public.pickup_chip_layout for select to authenticated using (true);

drop policy if exists "crew_insert_pickup_chip_layout" on public.pickup_chip_layout;
create policy "crew_insert_pickup_chip_layout"
  on public.pickup_chip_layout for insert to authenticated with check (true);

drop policy if exists "crew_update_pickup_chip_layout" on public.pickup_chip_layout;
create policy "crew_update_pickup_chip_layout"
  on public.pickup_chip_layout for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_pickup_chip_layout" on public.pickup_chip_layout;
create policy "crew_delete_pickup_chip_layout"
  on public.pickup_chip_layout for delete to authenticated using (true);

insert into public.pickup_chip_layout (id, columns)
values ('crew', '[]'::jsonb)
on conflict (id) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.pickup_chip_layout;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
