-- 006_challenge_template.sql
--
-- A challenge always creates its own program. Joining therefore has to clone
-- the creator's structure into the joiner's account — but the joiner is not a
-- member yet, so RLS hides the template from them, and the peer-read policies
-- deliberately never covered `days` or `programs` anyway.
--
-- This returns the template (and nothing else) for a valid invite code, so the
-- client can build its own copy through the normal RLS-respecting writes. Each
-- exercise carries the owner's `slot`, which is what lines two people's
-- movements up later without matching on strings.

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
    and auth.uid() is not null;   -- signed-in callers only
$$;

revoke execute on function public.challenge_template(text) from public;
revoke execute on function public.challenge_template(text) from anon;
grant  execute on function public.challenge_template(text) to authenticated;
