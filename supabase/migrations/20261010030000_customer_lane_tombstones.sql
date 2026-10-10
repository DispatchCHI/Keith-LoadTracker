-- Customer tab: shared lane deletes, so a new or out-of-date desk never puts a
-- deleted built-in lane back. Paste into Supabase SQL Editor and Run once.
-- Same DDL is in supabase/migrations/20261010030000_customer_lane_tombstones.sql.

create table if not exists public.customer_lane_tombstones (
  id text primary key,
  deleted_at timestamptz not null default now(),
  deleted_by uuid references auth.users (id) on delete set null
);

comment on table public.customer_lane_tombstones is
  'Customer lane ids a dispatcher deleted, with when. A lane saved after deleted_at wins; an older copy re-uploaded by a stale desk is deleted again.';

alter table public.customer_lane_tombstones enable row level security;

drop policy if exists "crew_select_customer_lane_tombstones" on public.customer_lane_tombstones;
create policy "crew_select_customer_lane_tombstones"
  on public.customer_lane_tombstones for select to authenticated using (true);

drop policy if exists "crew_insert_customer_lane_tombstones" on public.customer_lane_tombstones;
create policy "crew_insert_customer_lane_tombstones"
  on public.customer_lane_tombstones for insert to authenticated with check (true);

drop policy if exists "crew_update_customer_lane_tombstones" on public.customer_lane_tombstones;
create policy "crew_update_customer_lane_tombstones"
  on public.customer_lane_tombstones for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_customer_lane_tombstones" on public.customer_lane_tombstones;
create policy "crew_delete_customer_lane_tombstones"
  on public.customer_lane_tombstones for delete to authenticated using (true);

notify pgrst, 'reload schema';