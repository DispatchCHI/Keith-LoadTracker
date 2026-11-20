-- Driver type on the Full Roster (MSW / Tanker / Walking-Floor).
-- Run once in the Supabase SQL editor. Safe to re-run.
-- Do not apply until Keith approves 1.1.67.

alter table public.driver_roster_entries
  add column if not exists driver_type text;

alter table public.driver_roster_entries
  drop constraint if exists driver_roster_entries_driver_type_check;

alter table public.driver_roster_entries
  add constraint driver_roster_entries_driver_type_check
  check (driver_type is null or driver_type in ('msw', 'tanker', 'wf'));

-- Names ending in -T, - T, or " -T" were tanker drivers. Strip that suffix
-- and record the type. An explicit non-MSW type already saved is left alone.
update public.driver_roster_entries
set
  driver_type = 'tanker',
  name = regexp_replace(btrim(name), '\s*-\s*[Tt]\s*$', '')
where kind = 'full'
  and name ~ '\s*-\s*[Tt]\s*$'
  and coalesce(driver_type, 'msw') = 'msw';

update public.driver_roster_entries
set name = regexp_replace(btrim(name), '\s*-\s*[Tt]\s*$', '')
where name ~ '\s*-\s*[Tt]\s*$';

update public.driver_roster_entries
set driver_type = 'msw'
where kind = 'full'
  and driver_type is null;

comment on column public.driver_roster_entries.driver_type is
  'Truck type for a roster driver: msw (default, no tag), tanker, or wf.';
