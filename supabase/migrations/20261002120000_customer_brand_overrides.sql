-- Customer brand / logo overrides shared across devices. Single crew row.

create table if not exists public.customer_brand_overrides (
  id text primary key,
  brands jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.customer_brand_overrides enable row level security;

drop policy if exists "crew_select_customer_brand_overrides" on public.customer_brand_overrides;
create policy "crew_select_customer_brand_overrides"
  on public.customer_brand_overrides for select to authenticated using (true);

drop policy if exists "crew_insert_customer_brand_overrides" on public.customer_brand_overrides;
create policy "crew_insert_customer_brand_overrides"
  on public.customer_brand_overrides for insert to authenticated with check (true);

drop policy if exists "crew_update_customer_brand_overrides" on public.customer_brand_overrides;
create policy "crew_update_customer_brand_overrides"
  on public.customer_brand_overrides for update to authenticated using (true) with check (true);

insert into public.customer_brand_overrides (id, brands)
values ('crew', '{}'::jsonb)
on conflict (id) do nothing;