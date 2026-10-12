-- Extra "Asking" counters on Today (Yard Desk, under Hooker Street).
-- Paste into Supabase SQL Editor (project bkwrqtlvybzbjdakdvka) and Run once. Safe to re-run.
-- Same DDL: supabase/migrations/20261012020000_customer_tallies.sql

-- Which customers have a counter card. Removing a card sets removed = true
-- (kept as a row so a desk that hasn't synced can't bring it back).
create table if not exists public.dispatch_tally_counters (
  customer_key text primary key,
  customer text not null,
  position int not null default 0,
  removed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.dispatch_tally_counters is
  'Customer Asking counters added on Today (+ Add counter). removed = true hides the card on all desks.';

-- Per-day Asking tally for each added counter.
create table if not exists public.day_customer_tallies (
  date date not null,
  customer_key text not null,
  asking int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (date, customer_key)
);

comment on table public.day_customer_tallies is
  'Manual per-day Asking tally for customer counters on Today (America/Chicago day). Not derived from Loads.';

alter table public.day_customer_tallies
  drop constraint if exists day_customer_tallies_asking_check;
alter table public.day_customer_tallies
  add constraint day_customer_tallies_asking_check check (asking >= 0);

alter table public.dispatch_tally_counters enable row level security;
alter table public.day_customer_tallies enable row level security;

drop policy if exists "crew_select_dispatch_tally_counters" on public.dispatch_tally_counters;
create policy "crew_select_dispatch_tally_counters"
  on public.dispatch_tally_counters for select to authenticated using (true);
drop policy if exists "crew_insert_dispatch_tally_counters" on public.dispatch_tally_counters;
create policy "crew_insert_dispatch_tally_counters"
  on public.dispatch_tally_counters for insert to authenticated with check (true);
drop policy if exists "crew_update_dispatch_tally_counters" on public.dispatch_tally_counters;
create policy "crew_update_dispatch_tally_counters"
  on public.dispatch_tally_counters for update to authenticated using (true) with check (true);
drop policy if exists "crew_delete_dispatch_tally_counters" on public.dispatch_tally_counters;
create policy "crew_delete_dispatch_tally_counters"
  on public.dispatch_tally_counters for delete to authenticated using (true);

drop policy if exists "crew_select_day_customer_tallies" on public.day_customer_tallies;
create policy "crew_select_day_customer_tallies"
  on public.day_customer_tallies for select to authenticated using (true);
drop policy if exists "crew_insert_day_customer_tallies" on public.day_customer_tallies;
create policy "crew_insert_day_customer_tallies"
  on public.day_customer_tallies for insert to authenticated with check (true);
drop policy if exists "crew_update_day_customer_tallies" on public.day_customer_tallies;
create policy "crew_update_day_customer_tallies"
  on public.day_customer_tallies for update to authenticated using (true) with check (true);
drop policy if exists "crew_delete_day_customer_tallies" on public.day_customer_tallies;
create policy "crew_delete_day_customer_tallies"
  on public.day_customer_tallies for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.dispatch_tally_counters;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.day_customer_tallies;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
