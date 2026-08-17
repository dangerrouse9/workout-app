-- 010_challenge_start_date.sql
--
-- A challenge needs one agreed start date, held on the challenge itself.
--
-- Until now each participant's copy was stamped with the day THEY created or
-- joined, so someone setting it up on Saturday and a friend joining on Sunday
-- had "Day 1" meaning two different calendar days. The comparison still lined
-- up (it matches on day position, not date), but the dates on screen disagreed
-- and "is this today?" was wrong for at least one of them.
--
-- Now the creator picks the date, and joiners inherit it.

alter table public.challenges
  add column if not exists starts_on date;

-- Backfill from the owner's copy of the program, which is where it used to live.
update public.challenges c
set starts_on = (
  select p.starts_on
  from public.challenge_members m
  join public.programs p on p.id = m.program_id
  where m.challenge_id = c.id
    and m.user_id = c.owner_id
  limit 1
)
where c.starts_on is null;

-- Hand the start date to joiners along with the rest of the template.
create or replace function public.challenge_template(p_code text)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'challenge_id', c.id,
    'name',         c.name,
    'weeks',        c.weeks,
    'owner_id',     c.owner_id,
    'starts_on',    c.starts_on,
    'days', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name',     d.name,
          'focus',    d.focus,
          'position', d.position,
          'exercises', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'name',         e.name,
                'slot',         cm.slot,
                'target_sets',  e.target_sets,
                'target_reps',  e.target_reps,
                'rest_seconds', e.rest_seconds,
                'notes',        e.notes,
                'is_superset',  e.is_superset,
                'position',     e.position
              ) order by e.position)
            from exercises e
            left join challenge_movements cm
              on  cm.challenge_id = c.id
              and cm.user_id      = c.owner_id
              and cm.movement_id  = e.movement_id
            where e.day_id = d.id
          ), '[]'::jsonb)
        ) order by d.position)
      from days d
      join challenge_members m
        on  m.program_id = d.program_id
        and m.challenge_id = c.id
        and m.user_id = c.owner_id
    ), '[]'::jsonb)
  )
  from challenges c
  where c.invite_code = p_code
    and auth.uid() is not null;
$$;

revoke execute on function public.challenge_template(text) from public;
revoke execute on function public.challenge_template(text) from anon;
grant  execute on function public.challenge_template(text) to authenticated;
