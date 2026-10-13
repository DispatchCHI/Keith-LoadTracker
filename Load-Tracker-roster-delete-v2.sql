-- Load Tracker: block roster deletes from old builds (Oct 12, 2026).
-- Run AFTER Load-Tracker-roster-guard-history.sql. Safe to re-run.
--
-- Why: builds from Oct 11 evening to Oct 12 morning (web tabs left open,
-- desktop 1.1.7 - 1.1.9) auto-deleted anyone on the Gone list from the Full
-- Roster, which kept removing rehire David Perez. New builds (1.1.13+,
-- sync version 2) call delete_roster_rows_v2 with their sync version; the
-- old delete_roster_rows is taken away so old builds can no longer delete.

create or replace function public.delete_roster_rows_v2(
  p_ids uuid[], p_deleted_at timestamptz, p_sync_version int)
returns setof uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.driver_roster_entries e
  where auth.uid() is not null
    and coalesce(p_sync_version, 0) >= 2
    and public.driver_roster_deletes_allowed()
    and e.id = any (p_ids)
    and e.updated_at <= least(coalesce(p_deleted_at, now()), now() + interval '10 minutes')
  returning e.id;
$$;

revoke all on function public.delete_roster_rows_v2(uuid[], timestamptz, int) from public, anon;
grant execute on function public.delete_roster_rows_v2(uuid[], timestamptz, int) to authenticated;

-- Old builds: no more deletes.
revoke execute on function public.delete_roster_rows(uuid[], timestamptz) from authenticated, public, anon;
drop policy if exists "crew_delete_driver_roster_entries" on public.driver_roster_entries;
revoke delete, truncate on public.driver_roster_entries from anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Read-only: every David Perez roster change, Chicago time, with who did it.
-- Copy out and run on its own.
--
-- select h.changed_at at time zone 'America/Chicago' as changed_ct, h.op,
--        h.row_data->>'id' as row_id, h.row_data->>'kind' as kind,
--        h.row_data->>'yard' as yard, h.row_data->>'truck_number' as emp,
--        u.email as changed_by_email
-- from public.driver_roster_entries_history h
-- left join auth.users u on u.id = h.changed_by
-- where h.row_data->>'name' ilike '%perez%'
-- order by h.changed_at desc;
--
-- Put back David's most recently deleted Full row (only if he is not on the
-- Full Roster now). Uncomment and run on its own:
--
-- insert into public.driver_roster_entries
-- select (jsonb_populate_record(null::public.driver_roster_entries,
--         h.row_data || jsonb_build_object('updated_at', now()))).*
-- from public.driver_roster_entries_history h
-- where h.op = 'DELETE' and h.row_data->>'kind' = 'full'
--   and h.row_data->>'name' ilike 'david perez%'
--   and not exists (select 1 from public.driver_roster_entries e
--                   where e.kind = 'full' and e.name ilike 'david perez%')
-- order by h.changed_at desc
-- limit 1;
