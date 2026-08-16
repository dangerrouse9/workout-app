-- 002_history_by_movement.sql
-- Switch history from string matching on exercise name to the movement_id
-- foreign key created in 001. Same behaviour, but a rename or a typo can no
-- longer split a movement's history in two.
--
-- Run this together with the app change that calls history_for_movement.

create or replace function public.history_for_movement(p_movement_id uuid)
returns table (
  program_id   uuid,
  program_name text,
  day_name     text,
  week         int,
  sets         text,
  reps         text,
  weight       text,
  variation    text,
  note         text,
  custom       jsonb,
  logged_at    timestamptz
)
language sql stable security invoker as $$
  select pr.id, pr.name, d.name, l.week,
         l.sets, l.reps, l.weight, l.variation, l.note, l.custom, l.created_at
  from public.logs l
  join public.exercises e on e.id = l.exercise_id
  join public.days d      on d.id = e.day_id
  join public.programs pr on pr.id = d.program_id
  where l.user_id = auth.uid()          -- the log's owner, not the exercise's
    and e.movement_id = p_movement_id
    and (l.sets <> '' or l.reps <> '' or l.weight <> '' or l.note <> '')
  order by pr.created_at, l.week, d.position;
$$;

-- Every exercise must now belong to a movement.
alter table public.exercises
  alter column movement_id set not null;
