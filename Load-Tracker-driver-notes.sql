-- Driver notes on the Drivers tab (notebook icon on each Full Roster card).
-- Paste into Supabase SQL Editor (project bkwrqtlvybzbjdakdvka) and Run once.
-- Same DDL: supabase/migrations/20261005170000_driver_notes.sql
--
-- One row per note. Notes are tied to the driver by roster_id
-- (driver_roster_entries.id) and employee_number (EMP #), never by name,
-- so a rename does not orphan them. driver_name is only a snapshot for
-- reading old rows. There is no foreign key on roster_id on purpose:
-- removing or terminating a driver keeps their notes.

create table if not exists public.driver_notes (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid,
  employee_number text,
  driver_name text not null default '',
  note_date date not null,
  note text not null,
  author text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.driver_notes
  drop constraint if exists driver_notes_driver_check;

alter table public.driver_notes
  add constraint driver_notes_driver_check
  check (roster_id is not null or employee_number is not null);

alter table public.driver_notes
  drop constraint if exists driver_notes_note_check;

alter table public.driver_notes
  add constraint driver_notes_note_check
  check (length(btrim(note)) > 0 and length(note) <= 4000);

create index if not exists driver_notes_roster_idx
  on public.driver_notes (roster_id, note_date desc)
  where roster_id is not null;

create index if not exists driver_notes_emp_idx
  on public.driver_notes (employee_number, note_date desc)
  where employee_number is not null;

create index if not exists driver_notes_date_idx
  on public.driver_notes (note_date desc);

comment on table public.driver_notes is
  'Dated notes per driver from the Drivers tab. Tied to roster_id and EMP #, not the name.';
comment on column public.driver_notes.roster_id is
  'driver_roster_entries.id when the note was written. No FK so removed drivers keep notes.';
comment on column public.driver_notes.employee_number is
  'EMP # as text (leading zeros stripped). Matches driver_roster_entries.truck_number.';
comment on column public.driver_notes.driver_name is
  'Driver name when the note was written. Display only; not used to match.';
comment on column public.driver_notes.note_date is
  'Date the note is about (America/Chicago). Defaults to today in the app.';
comment on column public.driver_notes.author is
  'Display name of the desk that wrote the note.';

alter table public.driver_notes enable row level security;

drop policy if exists "crew_select_driver_notes" on public.driver_notes;
create policy "crew_select_driver_notes"
  on public.driver_notes for select to authenticated using (true);

drop policy if exists "crew_insert_driver_notes" on public.driver_notes;
create policy "crew_insert_driver_notes"
  on public.driver_notes for insert to authenticated with check (true);

drop policy if exists "crew_update_driver_notes" on public.driver_notes;
create policy "crew_update_driver_notes"
  on public.driver_notes for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_driver_notes" on public.driver_notes;
create policy "crew_delete_driver_notes"
  on public.driver_notes for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.driver_notes;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
