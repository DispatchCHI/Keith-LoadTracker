-- Optional OOT name list frozen with each Chicago day snapshot.
-- Never backfilled onto past rows from a later live sheet pull.

alter table public.driver_availability
  add column if not exists oot_names text[] not null default '{}';
