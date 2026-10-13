-- Load Tracker: Call-Off's "Added by" (who made / last edited each entry).
-- Safe to run more than once. The app works before this is run (column shows a dash).
-- The server stamps the signed-in login's email, so every desk/build reports correctly.

alter table public.call_off_log add column if not exists created_by_email text;
alter table public.call_off_log add column if not exists updated_by_email text;

create or replace function public.call_off_log_stamp_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
begin
  if tg_op = 'INSERT' then
    new.created_by_email := coalesce(new.created_by_email, who);
    new.updated_by_email := coalesce(who, new.updated_by_email);
  else
    -- Creator never changes after the first save.
    new.created_by_email := coalesce(old.created_by_email, new.created_by_email, who);
    if (new.name, new.start_date, new.end_date, new.reason)
       is distinct from (old.name, old.start_date, old.end_date, old.reason) then
      new.updated_by_email := coalesce(who, new.updated_by_email);
    else
      new.updated_by_email := old.updated_by_email;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists call_off_log_stamp_by on public.call_off_log;
create trigger call_off_log_stamp_by
  before insert or update on public.call_off_log
  for each row execute function public.call_off_log_stamp_by();

notify pgrst, 'reload schema';
