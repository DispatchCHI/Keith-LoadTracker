-- Who last edited a load. Null until someone saves a change.
-- Paste-ready copy: Load-Tracker-loads-edited-by.sql

alter table public.loads
  add column if not exists edited_by text;

comment on column public.loads.edited_by is
  'Display name of the dispatcher who last saved an edit. Null when the load has not been edited.';

notify pgrst, 'reload schema';
