-- Batavia Asking tally on Today (same card as Batavia Preloads).
alter table public.day_dispatch_tallies
  add column if not exists batavia_asking int not null default 0;

comment on column public.day_dispatch_tallies.batavia_asking is
  'Manual Batavia Asking tally shown on Today next to Batavia Preloads.';

alter table public.day_dispatch_tallies
  drop constraint if exists day_dispatch_tallies_counts_check;

alter table public.day_dispatch_tallies
  add constraint day_dispatch_tallies_counts_check
  check (
    batavia_preload >= 0
    and batavia_asking >= 0
    and evanston_asking >= 0
    and hooker_asking >= 0
  );

notify pgrst, 'reload schema';
