-- Keith Load Tracker — run once on NEW Supabase project dwcwweublrsgcchkeydq
-- SQL Editor → New query → Paste all → Run

-- ========== 20260904120000_loads.sql ==========
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


-- ========== 20260905003000_driver_availability.sql ==========
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


-- ========== 20260905080000_driver_availability_oot_names.sql ==========
-- Optional OOT name list frozen with each Chicago day snapshot.
-- Never backfilled onto past rows from a later live sheet pull.

alter table public.driver_availability
  add column if not exists oot_names text[] not null default '{}';


-- ========== 20260906101500_specialty_and_station_calls.sql ==========
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


-- ========== 20260908024500_manual_call_offs.sql ==========
-- Ad-hoc same-day call-offs entered on the Available drivers card.
-- Manual same-day call-offs stored in the app / Supabase.
-- Additive to Full Roster status; not a spreadsheet pull.

create table if not exists public.manual_call_offs (
  date date not null,
  name_key text not null,
  name text not null,
  kind text not null check (kind in ('call-off', 'p-day', 'okd-off', 'ncns', 'late-early')),
  created_at timestamptz not null default now(),
  primary key (date, name_key)
);

create index if not exists manual_call_offs_date_idx
  on public.manual_call_offs (date);

alter table public.manual_call_offs enable row level security;

drop policy if exists "crew_select_manual_call_offs" on public.manual_call_offs;
create policy "crew_select_manual_call_offs"
  on public.manual_call_offs for select
  to authenticated
  using (true);

drop policy if exists "crew_insert_manual_call_offs" on public.manual_call_offs;
create policy "crew_insert_manual_call_offs"
  on public.manual_call_offs for insert
  to authenticated
  with check (true);

drop policy if exists "crew_update_manual_call_offs" on public.manual_call_offs;
create policy "crew_update_manual_call_offs"
  on public.manual_call_offs for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "crew_delete_manual_call_offs" on public.manual_call_offs;
create policy "crew_delete_manual_call_offs"
  on public.manual_call_offs for delete
  to authenticated
  using (true);


-- ========== 20260909170000_manual_call_offs_late_early.sql ==========
-- Allow Late/Early as a manual call-off kind (orange pill on Available drivers).

alter table public.manual_call_offs
  drop constraint if exists manual_call_offs_kind_check;

alter table public.manual_call_offs
  add constraint manual_call_offs_kind_check
  check (kind in ('call-off', 'p-day', 'okd-off', 'ncns', 'late-early'));


-- ========== 20260911040000_manual_call_offs_ensure.sql ==========
-- Idempotent ensure: table + late-early CHECK + RLS + realtime + PostgREST schema reload.
-- Production was missing public.manual_call_offs (PGRST205). Safe to re-run.
-- Paste-ready copy: Load-Tracker-manual-call-offs.sql

create table if not exists public.manual_call_offs (
  date date not null,
  name_key text not null,
  name text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (date, name_key)
);

alter table public.manual_call_offs
  drop constraint if exists manual_call_offs_kind_check;

alter table public.manual_call_offs
  add constraint manual_call_offs_kind_check
  check (kind in ('call-off', 'p-day', 'okd-off', 'ncns', 'late-early'));

create index if not exists manual_call_offs_date_idx
  on public.manual_call_offs (date);

alter table public.manual_call_offs enable row level security;

drop policy if exists "crew_select_manual_call_offs" on public.manual_call_offs;
create policy "crew_select_manual_call_offs"
  on public.manual_call_offs for select
  to authenticated
  using (true);

drop policy if exists "crew_insert_manual_call_offs" on public.manual_call_offs;
create policy "crew_insert_manual_call_offs"
  on public.manual_call_offs for insert
  to authenticated
  with check (true);

drop policy if exists "crew_update_manual_call_offs" on public.manual_call_offs;
create policy "crew_update_manual_call_offs"
  on public.manual_call_offs for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "crew_delete_manual_call_offs" on public.manual_call_offs;
create policy "crew_delete_manual_call_offs"
  on public.manual_call_offs for delete
  to authenticated
  using (true);

do $$
begin
  alter publication supabase_realtime add table public.manual_call_offs;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';


-- ========== 20260911170000_station_call_notes.sql ==========
-- Global (per-station) notes for Load Count By Hour.
-- Notes are not dated: one row per station, shared across every calendar day.

create table if not exists public.station_call_notes (
  station_id text primary key,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.station_call_notes enable row level security;

drop policy if exists "crew_select_station_call_notes" on public.station_call_notes;
create policy "crew_select_station_call_notes"
  on public.station_call_notes for select to authenticated using (true);

drop policy if exists "crew_upsert_station_call_notes" on public.station_call_notes;
create policy "crew_upsert_station_call_notes"
  on public.station_call_notes for insert to authenticated with check (true);

drop policy if exists "crew_update_station_call_notes" on public.station_call_notes;
create policy "crew_update_station_call_notes"
  on public.station_call_notes for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_station_call_notes" on public.station_call_notes;
create policy "crew_delete_station_call_notes"
  on public.station_call_notes for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.station_call_notes;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';


-- ========== 20260912040000_vacation_calendar.sql ==========
-- Vacation calendar weeks + driver entries (shared across devices).
-- Paste into Supabase SQL Editor and Run once so desktop/web/phone stay in sync.
-- Same DDL is in Load-Tracker-vacation.sql and Load-Tracker-sync-tables.sql.

create table if not exists public.vacation_weeks (
  week_of date primary key,
  year int not null,
  capacity int,
  label text not null default '',
  kind text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.vacation_weeks
  drop constraint if exists vacation_weeks_kind_check;

alter table public.vacation_weeks
  add constraint vacation_weeks_kind_check
  check (kind in ('open', 'holiday', 'blocked'));

create index if not exists vacation_weeks_year_idx on public.vacation_weeks (year);

alter table public.vacation_weeks enable row level security;

drop policy if exists "crew_select_vacation_weeks" on public.vacation_weeks;
create policy "crew_select_vacation_weeks"
  on public.vacation_weeks for select to authenticated using (true);

drop policy if exists "crew_insert_vacation_weeks" on public.vacation_weeks;
create policy "crew_insert_vacation_weeks"
  on public.vacation_weeks for insert to authenticated with check (true);

drop policy if exists "crew_update_vacation_weeks" on public.vacation_weeks;
create policy "crew_update_vacation_weeks"
  on public.vacation_weeks for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_vacation_weeks" on public.vacation_weeks;
create policy "crew_delete_vacation_weeks"
  on public.vacation_weeks for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.vacation_weeks;
exception when duplicate_object then null;
end $$;

create table if not exists public.vacation_entries (
  id uuid primary key default gen_random_uuid(),
  week_of date not null,
  name text not null,
  note text not null default '',
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.vacation_entries
  drop constraint if exists vacation_entries_status_check;

alter table public.vacation_entries
  add constraint vacation_entries_status_check
  check (status in ('pending', 'approved', 'paid'));

create index if not exists vacation_entries_week_idx on public.vacation_entries (week_of);

alter table public.vacation_entries enable row level security;

drop policy if exists "crew_select_vacation_entries" on public.vacation_entries;
create policy "crew_select_vacation_entries"
  on public.vacation_entries for select to authenticated using (true);

drop policy if exists "crew_insert_vacation_entries" on public.vacation_entries;
create policy "crew_insert_vacation_entries"
  on public.vacation_entries for insert to authenticated with check (true);

drop policy if exists "crew_update_vacation_entries" on public.vacation_entries;
create policy "crew_update_vacation_entries"
  on public.vacation_entries for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_vacation_entries" on public.vacation_entries;
create policy "crew_delete_vacation_entries"
  on public.vacation_entries for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.vacation_entries;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';


-- ========== 20260912053000_vacation_yard.sql ==========
-- Yard-scope vacation weeks + entries (Rockford vs Chicago).
-- Safe to re-run. Existing rows default to yard = 'rockford'.
-- Paste-ready copy: Load-Tracker-vacation-yard.sql

alter table public.vacation_weeks
  add column if not exists yard text;

update public.vacation_weeks
  set yard = 'rockford'
  where yard is null or btrim(yard) = '';

alter table public.vacation_weeks
  alter column yard set default 'rockford';

alter table public.vacation_weeks
  alter column yard set not null;

alter table public.vacation_weeks
  drop constraint if exists vacation_weeks_yard_check;

alter table public.vacation_weeks
  add constraint vacation_weeks_yard_check
  check (yard in ('rockford', 'chicago'));

do $$
declare
  pk_def text;
begin
  select pg_get_constraintdef(c.oid)
    into pk_def
  from pg_constraint c
  where c.conrelid = 'public.vacation_weeks'::regclass
    and c.contype = 'p';

  if pk_def is distinct from 'PRIMARY KEY (yard, week_of)' then
    alter table public.vacation_weeks drop constraint if exists vacation_weeks_pkey;
    alter table public.vacation_weeks
      add constraint vacation_weeks_pkey primary key (yard, week_of);
  end if;
end $$;

create index if not exists vacation_weeks_yard_year_idx
  on public.vacation_weeks (yard, year);

alter table public.vacation_entries
  add column if not exists yard text;

update public.vacation_entries
  set yard = 'rockford'
  where yard is null or btrim(yard) = '';

alter table public.vacation_entries
  alter column yard set default 'rockford';

alter table public.vacation_entries
  alter column yard set not null;

alter table public.vacation_entries
  drop constraint if exists vacation_entries_yard_check;

alter table public.vacation_entries
  add constraint vacation_entries_yard_check
  check (yard in ('rockford', 'chicago'));

create index if not exists vacation_entries_yard_week_idx
  on public.vacation_entries (yard, week_of);

notify pgrst, 'reload schema';


-- ========== 20260912180000_daily_eod_totals.sql ==========
-- Per-date End-of-Day aggregates from the Dispatch Board Loads tab footer.
-- Overrides TRASH / LEACHATE / WALKING-FLOOR / LOADS / SUBS without inventing truck rows.
-- Sheet snapshot wins even when some load rows already exist for that date.

create table if not exists public.daily_eod_totals (
  date date primary key,
  trash int not null default 0,
  leachate int not null default 0,
  walking_floor int not null default 0,
  loads int not null default 0,
  subs int not null default 0,
  source text not null default 'sheet-import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_eod_totals'
      and column_name = 'total_loads'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_eod_totals'
      and column_name = 'loads'
  ) then
    alter table public.daily_eod_totals rename column total_loads to loads;
  end if;
end $$;

alter table public.daily_eod_totals
  add column if not exists loads int not null default 0;

alter table public.daily_eod_totals
  add column if not exists subs int not null default 0;

comment on table public.daily_eod_totals is
  'Dispatch Board Loads-tab footer EOD aggregates per America/Chicago calendar day. Overrides TRASH / LEACHATE / WF / LOADS / SUBS without inventing truck rows. Sheet snapshot wins even when some load rows exist.';
comment on column public.daily_eod_totals.date is
  'America/Chicago calendar day (YYYY-MM-DD).';
comment on column public.daily_eod_totals.trash is
  'Total MSW â†’ TRASH bubble.';
comment on column public.daily_eod_totals.leachate is
  'Total Tank Loads â†’ LEACHATE bubble.';
comment on column public.daily_eod_totals.walking_floor is
  'Total Walking-Floor Loads â†’ WALKING-FLOOR / WF bubble.';
comment on column public.daily_eod_totals.loads is
  'Total Loads â†’ LOADS bubble. Equals trash + leachate + walking_floor.';
comment on column public.daily_eod_totals.subs is
  'Total Sub Loads â†’ SUBS bubble.';

alter table public.daily_eod_totals
  drop constraint if exists daily_eod_totals_source_check;

alter table public.daily_eod_totals
  add constraint daily_eod_totals_source_check
  check (source in ('sheet-import', 'manual', 'computed'));

alter table public.daily_eod_totals
  drop constraint if exists daily_eod_totals_counts_check;

alter table public.daily_eod_totals
  add constraint daily_eod_totals_counts_check
  check (
    trash >= 0
    and leachate >= 0
    and walking_floor >= 0
    and loads >= 0
    and subs >= 0
  );

alter table public.daily_eod_totals enable row level security;

drop policy if exists "crew_select_daily_eod_totals" on public.daily_eod_totals;
create policy "crew_select_daily_eod_totals"
  on public.daily_eod_totals for select to authenticated using (true);

drop policy if exists "crew_insert_daily_eod_totals" on public.daily_eod_totals;
create policy "crew_insert_daily_eod_totals"
  on public.daily_eod_totals for insert to authenticated with check (true);

drop policy if exists "crew_update_daily_eod_totals" on public.daily_eod_totals;
create policy "crew_update_daily_eod_totals"
  on public.daily_eod_totals for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_daily_eod_totals" on public.daily_eod_totals;
create policy "crew_delete_daily_eod_totals"
  on public.daily_eod_totals for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.daily_eod_totals;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';


-- ========== 20260912210000_driver_roster.sql ==========
-- Chicago-area driver rosters (Full + Sat, per yard).
-- Paste-ready copy: Load-Tracker-driver-roster.sql
-- Also folded into Load-Tracker-sync-tables.sql.

create table if not exists public.driver_roster_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  yard text not null,
  truck_number text,
  name text not null,
  status text,
  sort_order int not null default 0,
  for_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.driver_roster_entries
  drop constraint if exists driver_roster_entries_kind_check;

alter table public.driver_roster_entries
  add constraint driver_roster_entries_kind_check
  check (kind in ('full', 'sat'));

alter table public.driver_roster_entries
  drop constraint if exists driver_roster_entries_yard_check;

alter table public.driver_roster_entries
  add constraint driver_roster_entries_yard_check
  check (yard in ('burnham', 'rockford', 'pontiac', 'arc', 'zion'));

create index if not exists driver_roster_entries_kind_yard_idx
  on public.driver_roster_entries (kind, yard, sort_order);

create index if not exists driver_roster_entries_sat_date_idx
  on public.driver_roster_entries (for_date)
  where kind = 'sat' and for_date is not null;

comment on table public.driver_roster_entries is
  'Driver tab Full (hired) + Sat (planning) rosters per Chicago-area yard. Upsert-only sync; remote rows are deleted only by explicit user removes.';
comment on column public.driver_roster_entries.kind is
  'full = hired master roster at the yard; sat = Saturday planning subset.';
comment on column public.driver_roster_entries.yard is
  'burnham | rockford | pontiac | arc | zion. Sheet â€œARC Driversâ€ / Sat-Arc map to arc.';
comment on column public.driver_roster_entries.truck_number is
  'Employee number as text (leading zeros stripped). Column name stays truck_number. Nullable.';
comment on column public.driver_roster_entries.status is
  'Full Roster unavailability abbreviation (oot, fmla, vac, wc, â€¦). Null = working. Driver stays on the hired list. Later tally: hired âˆ’ full-day status âˆ’ day offs.';
comment on column public.driver_roster_entries.for_date is
  'Optional Saturday this Sat roster is planning for (America/Chicago date).';

alter table public.driver_roster_entries enable row level security;

drop policy if exists "crew_select_driver_roster_entries" on public.driver_roster_entries;
create policy "crew_select_driver_roster_entries"
  on public.driver_roster_entries for select to authenticated using (true);

drop policy if exists "crew_insert_driver_roster_entries" on public.driver_roster_entries;
create policy "crew_insert_driver_roster_entries"
  on public.driver_roster_entries for insert to authenticated with check (true);

drop policy if exists "crew_update_driver_roster_entries" on public.driver_roster_entries;
create policy "crew_update_driver_roster_entries"
  on public.driver_roster_entries for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_driver_roster_entries" on public.driver_roster_entries;
create policy "crew_delete_driver_roster_entries"
  on public.driver_roster_entries for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.driver_roster_entries;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';


-- ========== 20260912220000_driver_roster_no_auto_delete.sql ==========
-- Kill-switch + comment: roster DELETE is UI Ã— only (no sync auto-prune).

create or replace function public.driver_roster_deletes_allowed()
returns boolean
language sql
stable
as $$
  select true
$$;

comment on function public.driver_roster_deletes_allowed() is
  'Kill-switch for driver_roster_entries DELETE. Default true so UI Ã— works. Set the body to select false to freeze all roster deletes.';

grant execute on function public.driver_roster_deletes_allowed() to authenticated;

drop policy if exists "crew_delete_driver_roster_entries" on public.driver_roster_entries;
create policy "crew_delete_driver_roster_entries"
  on public.driver_roster_entries
  for delete
  to authenticated
  using (public.driver_roster_deletes_allowed());

comment on table public.driver_roster_entries is
  'Driver tab Full (hired) + Sat (planning) rosters per Chicago-area yard. Sync is upsert-only. Remote DELETE is explicit UI Ã— only â€” never import, Vacation VAC, or a thin/empty pull. status = optional Full Roster unavailability (oot/fmla/vac/wc).';


-- ========== 20260912300000_driver_gone.sql ==========
-- Driver tab Gone archive (terminated / left).
-- Paste-ready copy: Load-Tracker-driver-gone.sql
-- Also folded into Load-Tracker-sync-tables.sql.

create table if not exists public.driver_gone_entries (
  id uuid primary key default gen_random_uuid(),
  employee_number text,
  name text not null,
  hire_date date,
  termination_date date,
  notes text not null default '',
  yard text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.driver_gone_entries
  drop constraint if exists driver_gone_entries_yard_check;

alter table public.driver_gone_entries
  add constraint driver_gone_entries_yard_check
  check (yard is null or yard in ('burnham', 'rockford', 'pontiac', 'arc', 'zion'));

create index if not exists driver_gone_entries_term_idx
  on public.driver_gone_entries (termination_date desc nulls last, name);

comment on table public.driver_gone_entries is
  'Driver tab Gone archive. Terminated / left drivers. Sync is upsert-only. Remote DELETE is explicit UI Ã— only â€” never import or a thin/empty pull. No contact fields.';
comment on column public.driver_gone_entries.employee_number is
  'Employee number as text (leading zeros stripped). Nullable.';
comment on column public.driver_gone_entries.hire_date is
  'Hire date (America/Chicago calendar). Nullable when unknown.';
comment on column public.driver_gone_entries.termination_date is
  'Last day / termination date (America/Chicago calendar). Nullable.';
comment on column public.driver_gone_entries.notes is
  'Laid Off / Quit / Term / Retired text. Contact-looking tokens are stripped client-side.';
comment on column public.driver_gone_entries.yard is
  'Optional last yard when known (full-roster termination). Gone 2026 sheet has no yard â€” null.';

alter table public.driver_gone_entries enable row level security;

drop policy if exists "crew_select_driver_gone_entries" on public.driver_gone_entries;
create policy "crew_select_driver_gone_entries"
  on public.driver_gone_entries for select to authenticated using (true);

drop policy if exists "crew_insert_driver_gone_entries" on public.driver_gone_entries;
create policy "crew_insert_driver_gone_entries"
  on public.driver_gone_entries for insert to authenticated with check (true);

drop policy if exists "crew_update_driver_gone_entries" on public.driver_gone_entries;
create policy "crew_update_driver_gone_entries"
  on public.driver_gone_entries for update to authenticated using (true) with check (true);

create or replace function public.driver_gone_deletes_allowed()
returns boolean
language sql
stable
as $$
  select true
$$;

comment on function public.driver_gone_deletes_allowed() is
  'Kill-switch for driver_gone_entries DELETE. Default true so UI Ã— works. Set the body to select false to freeze all Gone deletes.';

grant execute on function public.driver_gone_deletes_allowed() to authenticated;

drop policy if exists "crew_delete_driver_gone_entries" on public.driver_gone_entries;
create policy "crew_delete_driver_gone_entries"
  on public.driver_gone_entries
  for delete
  to authenticated
  using (public.driver_gone_deletes_allowed());

do $$
begin
  alter publication supabase_realtime add table public.driver_gone_entries;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';


-- ========== 20260913150000_driver_roster_assigned_truck.sql ==========
-- Full Roster assigned truck (unit), separate from EMP # (truck_number).
-- Paste-ready copy: Load-Tracker-driver-roster-assigned-truck.sql

alter table public.driver_roster_entries
  add column if not exists assigned_truck text;

comment on column public.driver_roster_entries.truck_number is
  'Employee number as text (leading zeros stripped). Column name stays truck_number. Nullable. Not the unit / truck.';
comment on column public.driver_roster_entries.assigned_truck is
  'Full Roster unit / truck assignment (digits or broker code). Separate from EMP #. Sat rows stay null.';

create index if not exists driver_roster_entries_assigned_truck_idx
  on public.driver_roster_entries (assigned_truck)
  where assigned_truck is not null;

notify pgrst, 'reload schema';


-- ========== 20260913180000_loads_driver_name.sql ==========
-- Optional snapshotted driver name on each load (day-locked truck â†” driver).
-- Paste-ready copy: Load-Tracker-loads-driver-name.sql

alter table public.loads
  add column if not exists driver_name text;

comment on column public.loads.driver_name is
  'Full Roster driver name snapshotted at log / truck-edit time. Null when the truck was unassigned. Not a live roster link. Not EMP #.';

notify pgrst, 'reload schema';


-- ========== 20260915140000_call_off_log.sql ==========
-- Spreadsheet-style call-off / P-Day / notation log.
-- Drives Available on the Today board. No Google Sheet pull.

create table if not exists public.call_off_log (
  id text primary key,
  name text not null,
  start_date date not null,
  end_date date,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index if not exists call_off_log_start_idx
  on public.call_off_log (start_date);

alter table public.call_off_log enable row level security;

drop policy if exists "crew_select_call_off_log" on public.call_off_log;
create policy "crew_select_call_off_log"
  on public.call_off_log for select
  to authenticated
  using (true);

drop policy if exists "crew_insert_call_off_log" on public.call_off_log;
create policy "crew_insert_call_off_log"
  on public.call_off_log for insert
  to authenticated
  with check (true);

drop policy if exists "crew_update_call_off_log" on public.call_off_log;
create policy "crew_update_call_off_log"
  on public.call_off_log for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "crew_delete_call_off_log" on public.call_off_log;
create policy "crew_delete_call_off_log"
  on public.call_off_log for delete
  to authenticated
  using (true);

do $$
begin
  alter publication supabase_realtime add table public.call_off_log;
exception
  when duplicate_object then null;
end $$;


-- ========== 20260916010000_driver_roster_hire_date.sql ==========
alter table public.driver_roster_entries
  add column if not exists hire_date date;

comment on column public.driver_roster_entries.hire_date is
  'Full Roster start date (America/Chicago). Null until known. Sat rows stay null.';

create index if not exists driver_roster_entries_hire_date_idx
  on public.driver_roster_entries (hire_date)
  where hire_date is not null;


-- ========== 20260917010000_customer_lanes.sql ==========
-- Customer lanes + 5-year contract rate books. Also in
-- Load-Tracker-customer-lanes.sql and Load-Tracker-sync-tables.sql.

create table if not exists public.customer_lanes (
  id text primary key,
  customer text not null,
  destination text not null default '',
  commodity text not null default 'Trash (MSW)',
  effective_date date not null,
  tier1 numeric(10,2),
  tier2 numeric(10,2),
  tier3 numeric(10,2),
  tier4 numeric(10,2),
  tier5 numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index if not exists customer_lanes_book_idx
  on public.customer_lanes (lower(customer), lower(destination), lower(commodity), effective_date);

create index if not exists customer_lanes_customer_idx
  on public.customer_lanes (customer, destination);

comment on table public.customer_lanes is
  'Customer tab lanes. One row per customer + dest + commodity + contract start. Tiers 1-5 are dollars per load. Empty destination is a customer shell with no dest yet.';

alter table public.customer_lanes enable row level security;

drop policy if exists "crew_select_customer_lanes" on public.customer_lanes;
create policy "crew_select_customer_lanes"
  on public.customer_lanes for select to authenticated using (true);

drop policy if exists "crew_insert_customer_lanes" on public.customer_lanes;
create policy "crew_insert_customer_lanes"
  on public.customer_lanes for insert to authenticated with check (true);

drop policy if exists "crew_update_customer_lanes" on public.customer_lanes;
create policy "crew_update_customer_lanes"
  on public.customer_lanes for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_customer_lanes" on public.customer_lanes;
create policy "crew_delete_customer_lanes"
  on public.customer_lanes for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.customer_lanes;
exception when duplicate_object then null;
end $$;


-- ========== 20260917013000_driver_roster_phone.sql ==========
alter table public.driver_roster_entries
  add column if not exists phone text;

comment on column public.driver_roster_entries.phone is
  'Optional Full Roster contact. Sat rows stay null.';


-- ========== 20260917020000_day_dispatch_tallies.sql ==========
-- Per-date manual dispatch tallies shown next to "+ Log load" on Today.
-- batavia_preload: trailers a driver preloaded at Batavia the night before,
--   counted down by 1 each time one gets picked up.
-- evanston_asking: loads Evanston's transfer station said the night before
--   they need picked up the next day.

create table if not exists public.day_dispatch_tallies (
  date date primary key,
  batavia_preload int not null default 0,
  evanston_asking int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.day_dispatch_tallies
  add column if not exists batavia_preload int not null default 0;

alter table public.day_dispatch_tallies
  add column if not exists evanston_asking int not null default 0;

comment on table public.day_dispatch_tallies is
  'Manual per-day dispatch tallies shown on Today next to + Log load. Not derived from Loads.';
comment on column public.day_dispatch_tallies.date is
  'America/Chicago calendar day (YYYY-MM-DD).';
comment on column public.day_dispatch_tallies.batavia_preload is
  'Trailers preloaded at Batavia the night before, counted down as picked up.';
comment on column public.day_dispatch_tallies.evanston_asking is
  'Loads Evanston said the night before they need picked up.';

alter table public.day_dispatch_tallies
  drop constraint if exists day_dispatch_tallies_counts_check;

alter table public.day_dispatch_tallies
  add constraint day_dispatch_tallies_counts_check
  check (batavia_preload >= 0 and evanston_asking >= 0);

alter table public.day_dispatch_tallies enable row level security;

drop policy if exists "crew_select_day_dispatch_tallies" on public.day_dispatch_tallies;
create policy "crew_select_day_dispatch_tallies"
  on public.day_dispatch_tallies for select to authenticated using (true);

drop policy if exists "crew_insert_day_dispatch_tallies" on public.day_dispatch_tallies;
create policy "crew_insert_day_dispatch_tallies"
  on public.day_dispatch_tallies for insert to authenticated with check (true);

drop policy if exists "crew_update_day_dispatch_tallies" on public.day_dispatch_tallies;
create policy "crew_update_day_dispatch_tallies"
  on public.day_dispatch_tallies for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_day_dispatch_tallies" on public.day_dispatch_tallies;
create policy "crew_delete_day_dispatch_tallies"
  on public.day_dispatch_tallies for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.day_dispatch_tallies;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';


-- ========== 20260918160000_call_off_log_realtime.sql ==========
-- call_off_log was created with RLS but never added to supabase_realtime.
-- CallOffLogContext subscribed to postgres_changes, so device B never saw
-- Call-Off's tab edits until a hard reload.

do $$
begin
  alter publication supabase_realtime add table public.call_off_log;
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;



