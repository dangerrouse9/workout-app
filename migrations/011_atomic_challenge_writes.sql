-- 011_atomic_challenge_writes.sql
--
-- Creating and joining a challenge each wrote seven-ish rows across five tables
-- from the client, one request at a time, with no transaction. A failure
-- partway through left a challenge with no program, or a program with half its
-- days — which is exactly what happened once: a token error surfaced after the
-- challenge row had already been written, the retry made a second one, and the
-- account was left with two.
--
-- Both are now single functions. Postgres wraps each in a transaction, so any
-- exception unwinds everything: either the whole challenge exists or none of it
-- does. Both are also idempotent for the caller — joining twice returns what
-- you already have instead of building a second copy.

-- ── create ───────────────────────────────────────────────
-- security INVOKER: everything it writes belongs to the caller, so ordinary RLS
-- is the right check and there's no reason to widen it.

create or replace function public.create_challenge(
  p_name         text,
  p_weeks        int,
  p_starts_on    date,
  p_display_name text,
  p_days         jsonb,
  p_position     int default 0
)
returns jsonb
language plpgsql volatile security invoker
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no look-alikes
  v_code     text;
  v_tries    int := 0;
  v_challenge uuid;
  v_program  uuid;
  v_day      jsonb;
  v_ex       jsonb;
  v_day_id   uuid;
  v_movement uuid;
  v_day_pos  int := 0;
  v_ex_pos   int;
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'A challenge needs a name'; end if;
  if coalesce(jsonb_array_length(p_days), 0) = 0 then
    raise exception 'A challenge needs at least one day';
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from challenges where invite_code = v_code);
    if v_tries > 25 then raise exception 'Could not allocate an invite code'; end if;
  end loop;

  insert into challenges (owner_id, name, weeks, invite_code, starts_on)
  values (v_user, btrim(p_name), p_weeks, v_code, p_starts_on)
  returning id into v_challenge;

  insert into programs (user_id, name, description, weeks, position, starts_on)
  values (v_user, btrim(p_name), 'Buddy challenge', p_weeks, p_position, p_starts_on)
  returning id into v_program;

  for v_day in select * from jsonb_array_elements(p_days) loop
    insert into days (user_id, program_id, name, focus, position)
    values (v_user, v_program,
            coalesce(nullif(btrim(v_day->>'name'), ''), 'Day ' || (v_day_pos + 1)),
            coalesce(v_day->>'focus', ''),
            v_day_pos)
    returning id into v_day_id;

    v_ex_pos := 0;
    for v_ex in select * from jsonb_array_elements(coalesce(v_day->'exercises', '[]'::jsonb)) loop
      v_movement := null;
      select id into v_movement
      from movements
      where user_id = v_user and lower(name) = lower(btrim(v_ex->>'name'))
      limit 1;

      if v_movement is null then
        insert into movements (user_id, name)
        values (v_user, btrim(v_ex->>'name'))
        returning id into v_movement;
      end if;

      -- The creator's own movement id doubles as the shared slot.
      insert into challenge_movements (challenge_id, user_id, slot, movement_id)
      values (v_challenge, v_user, v_movement, v_movement)
      on conflict (challenge_id, user_id, slot) do nothing;

      insert into exercises (user_id, day_id, movement_id, name, target_sets, target_reps,
                             rest_seconds, notes, is_superset, position)
      values (v_user, v_day_id, v_movement, btrim(v_ex->>'name'),
              coalesce(v_ex->>'target_sets', ''),
              coalesce(v_ex->>'target_reps', ''),
              coalesce((v_ex->>'rest_seconds')::int, 0),
              coalesce(v_ex->>'notes', ''),
              coalesce((v_ex->>'is_superset')::boolean, false),
              v_ex_pos);

      v_ex_pos := v_ex_pos + 1;
    end loop;

    v_day_pos := v_day_pos + 1;
  end loop;

  insert into challenge_members (challenge_id, user_id, program_id, display_name)
  values (v_challenge, v_user, v_program, nullif(btrim(coalesce(p_display_name, '')), ''));

  return jsonb_build_object('challenge_id', v_challenge,
                            'program_id', v_program,
                            'invite_code', v_code);
end $$;

revoke execute on function public.create_challenge(text, int, date, text, jsonb, int) from public;
revoke execute on function public.create_challenge(text, int, date, text, jsonb, int) from anon;
grant  execute on function public.create_challenge(text, int, date, text, jsonb, int) to authenticated;

-- ── join ─────────────────────────────────────────────────
-- security DEFINER, because cloning requires reading the creator's program and
-- days, which RLS hides from someone who isn't a member yet. Every row it
-- writes is pinned to auth.uid(); the caller never supplies a user id.

create or replace function public.join_challenge_atomic(
  p_code         text,
  p_display_name text,
  p_position     int default 0
)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_challenge challenges%rowtype;
  v_src_prog  uuid;
  v_program   uuid;
  v_day       record;
  v_ex        record;
  v_day_id    uuid;
  v_movement  uuid;
  v_existing  uuid;
begin
  if v_user is null then raise exception 'Not signed in'; end if;

  select * into v_challenge from challenges where invite_code = btrim(p_code);
  if v_challenge.id is null then raise exception 'No challenge with that code'; end if;

  -- Already in it: hand back the copy they have rather than building another.
  select program_id into v_existing
  from challenge_members
  where challenge_id = v_challenge.id and user_id = v_user;

  if v_existing is not null then
    return jsonb_build_object('challenge_id', v_challenge.id,
                              'program_id', v_existing,
                              'name', v_challenge.name,
                              'already_joined', true);
  end if;

  select program_id into v_src_prog
  from challenge_members
  where challenge_id = v_challenge.id and user_id = v_challenge.owner_id;
  if v_src_prog is null then raise exception 'That challenge has no program to copy'; end if;

  insert into programs (user_id, name, description, weeks, position, starts_on)
  values (v_user, v_challenge.name, 'Buddy challenge', v_challenge.weeks,
          p_position, v_challenge.starts_on)
  returning id into v_program;

  for v_day in select * from days where program_id = v_src_prog order by position loop
    insert into days (user_id, program_id, name, focus, position)
    values (v_user, v_program, v_day.name, v_day.focus, v_day.position)
    returning id into v_day_id;

    for v_ex in select * from exercises where day_id = v_day.id order by position loop
      v_movement := null;
      select id into v_movement
      from movements
      where user_id = v_user and lower(name) = lower(v_ex.name)
      limit 1;

      if v_movement is null then
        insert into movements (user_id, name) values (v_user, v_ex.name)
        returning id into v_movement;
      end if;

      -- Inherit the creator's slot so the two copies stay paired by key.
      insert into challenge_movements (challenge_id, user_id, slot, movement_id)
      select v_challenge.id, v_user, cm.slot, v_movement
      from challenge_movements cm
      where cm.challenge_id = v_challenge.id
        and cm.user_id = v_challenge.owner_id
        and cm.movement_id = v_ex.movement_id
      on conflict (challenge_id, user_id, slot) do nothing;

      insert into exercises (user_id, day_id, movement_id, name, target_sets, target_reps,
                             rest_seconds, notes, is_superset, position)
      values (v_user, v_day_id, v_movement, v_ex.name, v_ex.target_sets, v_ex.target_reps,
              v_ex.rest_seconds, v_ex.notes, v_ex.is_superset, v_ex.position);
    end loop;
  end loop;

  insert into challenge_members (challenge_id, user_id, program_id, display_name)
  values (v_challenge.id, v_user, v_program, nullif(btrim(coalesce(p_display_name, '')), ''));

  return jsonb_build_object('challenge_id', v_challenge.id,
                            'program_id', v_program,
                            'name', v_challenge.name,
                            'already_joined', false);
end $$;

revoke execute on function public.join_challenge_atomic(text, text, int) from public;
revoke execute on function public.join_challenge_atomic(text, text, int) from anon;
grant  execute on function public.join_challenge_atomic(text, text, int) to authenticated;
