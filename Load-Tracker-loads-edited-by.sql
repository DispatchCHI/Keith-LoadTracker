-- Who last edited a load. Run once in the Supabase SQL editor.

alter table public.loads
  add column if not exists edited_by text;

comment on column public.loads.edited_by is
  'Display name of the dispatcher who last saved an edit. Null when the load has not been edited.';

notify pgrst, 'reload schema';
