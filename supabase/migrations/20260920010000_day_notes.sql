-- Per-date dispatcher notes on Today (Notes button under + Log load).
-- Notes stay with that America/Chicago calendar day; they do not roll forward.

create table if not exists public.day_notes (
  date date primary key,
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.day_notes is
  'Dispatcher free-text notes for one America/Chicago calendar day on Today.';
comment on column public.day_notes.date is
  'America/Chicago calendar day (YYYY-MM-DD).';
comment on column public.day_notes.note is
  'Free-text day notes. Empty string clears.';

alter table public.day_notes enable row level security;

drop policy if exists "crew_select_day_notes" on public.day_notes;
create policy "crew_select_day_notes"
  on public.day_notes for select to authenticated using (true);

drop policy if exists "crew_insert_day_notes" on public.day_notes;
create policy "crew_insert_day_notes"
  on public.day_notes for insert to authenticated with check (true);

drop policy if exists "crew_update_day_notes" on public.day_notes;
create policy "crew_update_day_notes"
  on public.day_notes for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_day_notes" on public.day_notes;
create policy "crew_delete_day_notes"
  on public.day_notes for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.day_notes;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
