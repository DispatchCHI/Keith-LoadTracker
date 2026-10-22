-- Load Tracker 1.1.48 diagnostic (READ-ONLY). This week's (Sun-Sat, Chicago) loads whose
-- driver name has no exact (case/space-insensitive) Full Roster match, plus Full Roster
-- drivers with loads this week but no start date (were $0 before 1.1.48).
with wk as (
  select (date_trunc('week', (now() at time zone 'America/Chicago')::date + 1) - interval '1 day')::date as d0
), week_loads as (
  select l.* from public.loads l, wk
  where l.date::date between wk.d0 and wk.d0 + 6
    and coalesce(trim(l.driver_name), '') <> ''
), roster as (
  select id, name, yard, hire_date,
         lower(regexp_replace(trim(name), '\s+', ' ', 'g')) as k
  from public.driver_roster_entries where kind = 'full'
)
select 'unmatched name' as issue, wl.driver_name as name, count(*) as loads
from week_loads wl
where not exists (select 1 from roster r
  where r.k = lower(regexp_replace(trim(wl.driver_name), '\s+', ' ', 'g')))
group by wl.driver_name
union all
select 'no start date', r.name || ' (' || r.yard || ')', count(*)
from roster r join week_loads wl
  on r.k = lower(regexp_replace(trim(wl.driver_name), '\s+', ' ', 'g'))
where r.hire_date is null
group by r.name, r.yard
order by 1, 3 desc;
