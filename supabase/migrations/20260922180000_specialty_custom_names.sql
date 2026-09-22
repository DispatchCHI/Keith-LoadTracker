-- Extra Names labels shared across devices. Single crew row.

create table if not exists public.specialty_custom_names (
  id text primary key,
  names jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.specialty_custom_names enable row level security;

drop policy if exists "crew_select_specialty_custom_names" on public.specialty_custom_names;
create policy "crew_select_specialty_custom_names"
  on public.specialty_custom_names for select to authenticated using (true);

drop policy if exists "crew_insert_specialty_custom_names" on public.specialty_custom_names;
create policy "crew_insert_specialty_custom_names"
  on public.specialty_custom_names for insert to authenticated with check (true);

drop policy if exists "crew_update_specialty_custom_names" on public.specialty_custom_names;
create policy "crew_update_specialty_custom_names"
  on public.specialty_custom_names for update to authenticated using (true) with check (true);

insert into public.specialty_custom_names (id, names)
values ('crew', '{}'::jsonb)
on conflict (id) do nothing;
