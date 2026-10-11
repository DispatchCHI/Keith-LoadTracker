-- Load Tracker: Driver roster delete guard + change history
-- Table: public.driver_roster_entries (id uuid). Paste into Supabase SQL Editor and Run.
-- Safe to run more than once. Same text: supabase/migrations/20261011010000_roster_guard_history.sql
--
-- What this does:
--   1. updated_by column, stamped with the signed-in user on every insert/update.
--   2. driver_roster_entries_history: every insert / real change / delete is logged
--      (old row for UPDATE/DELETE, new row for INSERT) with who and when.
--   3. delete_roster_rows(ids, deleted_at): the ONLY way to delete roster rows.
--      It skips any row changed after the delete time, so an old / stale desk can
--      never wipe a name that was put back. Direct DELETE is revoked, so old builds'
--      deletes fail harmlessly with "permission denied".

-- ---------------------------------------------------------------------------
-- 1) updated_by
-- ---------------------------------------------------------------------------
alter table public.driver_roster_entries
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

comment on column public.driver_roster_entries.updated_by is
  'Signed-in user who last inserted/updated this row (set by trigger).';

create or replace function public.driver_roster_stamp_updated_by()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end
$$;

drop trigger if exists driver_roster_stamp_updated_by on public.driver_roster_entries;
create trigger driver_roster_stamp_updated_by
  before insert or update on public.driver_roster_entries
  for each row execute function public.driver_roster_stamp_updated_by();

-- ---------------------------------------------------------------------------
-- 2) History
-- ---------------------------------------------------------------------------
create table if not exists public.driver_roster_entries_history (
  history_id bigserial primary key,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  row_id uuid not null,
  row_data jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid()
);

comment on table public.driver_roster_entries_history is
  'Audit log for driver_roster_entries. row_data = new row for INSERT, old row (before the change) for UPDATE/DELETE. Written only by trigger.';

create index if not exists driver_roster_entries_history_row_idx
  on public.driver_roster_entries_history (row_id, changed_at);

create index if not exists driver_roster_entries_history_changed_at_idx
  on public.driver_roster_entries_history (changed_at);

alter table public.driver_roster_entries_history enable row level security;

drop policy if exists "crew_select_driver_roster_entries_history" on public.driver_roster_entries_history;
create policy "crew_select_driver_roster_entries_history"
  on public.driver_roster_entries_history for select to authenticated using (true);

revoke insert, update, delete, truncate on public.driver_roster_entries_history from anon, authenticated;
revoke all on sequence public.driver_roster_entries_history_history_id_seq from anon, authenticated;
grant select on public.driver_roster_entries_history to authenticated;

create or replace function public.driver_roster_entries_log_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.driver_roster_entries_history (op, row_id, row_data, changed_by)
    values ('INSERT', new.id, to_jsonb(new), auth.uid());
  elsif tg_op = 'UPDATE' then
    -- Sync re-uploads identical rows all the time; only log real changes.
    if (to_jsonb(old) - 'updated_by') is distinct from (to_jsonb(new) - 'updated_by') then
      insert into public.driver_roster_entries_history (op, row_id, row_data, changed_by)
      values ('UPDATE', old.id, to_jsonb(old), auth.uid());
    end if;
  else
    insert into public.driver_roster_entries_history (op, row_id, row_data, changed_by)
    values ('DELETE', old.id, to_jsonb(old), auth.uid());
  end if;
  return null;
end
$$;

drop trigger if exists driver_roster_entries_log_change on public.driver_roster_entries;
create trigger driver_roster_entries_log_change
  after insert or update or delete on public.driver_roster_entries
  for each row execute function public.driver_roster_entries_log_change();

-- ---------------------------------------------------------------------------
-- 3) Guarded delete
-- ---------------------------------------------------------------------------
-- Keep the existing kill switch if it is already there (do not reset its body).
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'driver_roster_deletes_allowed'
  ) then
    execute $f$
      create function public.driver_roster_deletes_allowed()
      returns boolean language sql stable as 'select true'
    $f$;
    grant execute on function public.driver_roster_deletes_allowed() to authenticated;
  end if;
end
$$;

create or replace function public.delete_roster_rows(p_ids uuid[], p_deleted_at timestamptz)
returns setof uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  -- A row changed after the delete was recorded wins (put back / Reset / edit).
  -- Delete times are capped a little past server time to limit clock games.
  delete from public.driver_roster_entries e
  where auth.uid() is not null
    and public.driver_roster_deletes_allowed()
    and e.id = any (p_ids)
    and e.updated_at <= least(coalesce(p_deleted_at, now()), now() + interval '10 minutes')
  returning e.id;
$$;

comment on function public.delete_roster_rows(uuid[], timestamptz) is
  'Only delete path for driver_roster_entries. Deletes ids whose updated_at <= p_deleted_at; returns the ids actually deleted.';

revoke all on function public.delete_roster_rows(uuid[], timestamptz) from public, anon;
grant execute on function public.delete_roster_rows(uuid[], timestamptz) to authenticated;

-- Old builds deleted directly; take that away so their deletes fail harmlessly.
drop policy if exists "crew_delete_driver_roster_entries" on public.driver_roster_entries;
revoke delete, truncate on public.driver_roster_entries from anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Handy read-only checks (copy one out and run it on its own)
-- ---------------------------------------------------------------------------
-- Recent Sat changes, Chicago time, with who did them:
--
-- select h.changed_at at time zone 'America/Chicago' as changed_ct, h.op,
--        h.row_data->>'yard' as yard, h.row_data->>'truck_number' as emp,
--        h.row_data->>'name' as name, u.email as changed_by_email
-- from public.driver_roster_entries_history h
-- left join auth.users u on u.id = h.changed_by
-- where h.row_data->>'kind' = 'sat'
-- order by h.changed_at desc
-- limit 200;

-- ---------------------------------------------------------------------------
-- RESTORE EXAMPLE (commented out, edit the window first, then run on its own)
-- Puts back Sat rows deleted between two Chicago times. Each restored row gets
-- updated_at = now(), so every desk's older delete yields to it.
-- ---------------------------------------------------------------------------
-- -- 1. Preview what would come back:
-- select distinct on (h.row_id)
--        h.changed_at at time zone 'America/Chicago' as deleted_ct,
--        h.row_data->>'yard' as yard, h.row_data->>'truck_number' as emp, h.row_data->>'name' as name
-- from public.driver_roster_entries_history h
-- where h.op = 'DELETE'
--   and h.row_data->>'kind' = 'sat'
--   and h.changed_at >= ('2026-10-12 07:00'::timestamp at time zone 'America/Chicago')
--   and h.changed_at <  ('2026-10-12 13:00'::timestamp at time zone 'America/Chicago')
--   and not exists (select 1 from public.driver_roster_entries e where e.id = h.row_id)
-- order by h.row_id, h.changed_at desc;
--
-- -- 2. Put them back:
-- insert into public.driver_roster_entries
-- select (jsonb_populate_record(
--           null::public.driver_roster_entries,
--           d.row_data || jsonb_build_object('updated_at', now())
--         )).*
-- from (
--   select distinct on (h.row_id) h.row_id, h.row_data
--   from public.driver_roster_entries_history h
--   where h.op = 'DELETE'
--     and h.row_data->>'kind' = 'sat'
--     and h.changed_at >= ('2026-10-12 07:00'::timestamp at time zone 'America/Chicago')
--     and h.changed_at <  ('2026-10-12 13:00'::timestamp at time zone 'America/Chicago')
--   order by h.row_id, h.changed_at desc
-- ) d
-- where not exists (select 1 from public.driver_roster_entries e where e.id = d.row_id)
-- on conflict (id) do nothing;
