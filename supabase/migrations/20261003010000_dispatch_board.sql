-- Dispatcher Saturday rotation and vacation banks for the Dispatch tab.
-- One row per calendar year. The board JSON holds Saturdays, vacation dates, and the change log.

create table if not exists public.dispatch_board (
  year int primary key,
  board jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.dispatch_board is
  'Saturday dispatch rotation and dispatcher vacation days, one document per year.';

alter table public.dispatch_board enable row level security;

drop policy if exists "crew_select_dispatch_board" on public.dispatch_board;
create policy "crew_select_dispatch_board"
  on public.dispatch_board for select to authenticated using (true);

drop policy if exists "crew_insert_dispatch_board" on public.dispatch_board;
create policy "crew_insert_dispatch_board"
  on public.dispatch_board for insert to authenticated with check (true);

drop policy if exists "crew_update_dispatch_board" on public.dispatch_board;
create policy "crew_update_dispatch_board"
  on public.dispatch_board for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_dispatch_board" on public.dispatch_board;
create policy "crew_delete_dispatch_board"
  on public.dispatch_board for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.dispatch_board;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
