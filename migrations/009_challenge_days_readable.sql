-- 009_challenge_days_readable.sql
--
-- Fixes a wrong-day bug in the challenge comparison.
--
-- A buddy's log was matched on (movement slot + week). In a daily challenge the
-- same movement appears on every day of the week, so Monday's and Tuesday's
-- entries share a slot and a week number and became indistinguishable — the
-- comparison pane showed whichever it happened to find first.
--
-- Disambiguating needs the buddy's day *position*, which lives on `days`, and
-- `days` had no peer-read policy: 003 deliberately exposed only `exercises` and
-- `logs`. Positions and day names inside a challenge everyone joined on purpose
-- are not sensitive, and without them the feature is simply wrong.

create or replace function public.shares_challenge_day(p_day_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from days d
    join challenge_members theirs on theirs.program_id = d.program_id
    join challenge_members mine   on mine.challenge_id = theirs.challenge_id
    where d.id = p_day_id
      and mine.user_id = auth.uid()
  );
$$;

revoke execute on function public.shares_challenge_day(uuid) from public;
revoke execute on function public.shares_challenge_day(uuid) from anon;
grant  execute on function public.shares_challenge_day(uuid) to authenticated;

-- Read-only, and only for days belonging to a challenge you are in. The
-- existing owner policy still governs every write.
drop policy if exists "days_challenge_read" on public.days;
create policy "days_challenge_read" on public.days
  for select using (public.shares_challenge_day(id));
