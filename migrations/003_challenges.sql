-- 003_challenges.sql — buddy challenges, mirrored not shared.
--
-- Each member owns their own program copy. Nothing is jointly writable; a
-- buddy's numbers are read-only. Visibility is CHALLENGE-SCOPED: joining a
-- running challenge with someone does not expose the rest of your account.
--
-- NOTE: the three "peer_read" policies at the bottom of this file are wrong —
-- they test membership with a subquery against challenge_members, which
-- re-triggers that table's own policy and recurses (42P17). Migration 004
-- replaces them. Kept here as applied, rather than edited after the fact.

-- ── tables ───────────────────────────────────────────────

create table if not exists public.challenges (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  weeks       int  not null default 4 check (weeks between 1 and 52),
  invite_code text not null unique,
  created_at  timestamptz not null default now()
);

-- One row per participant, pointing at THEIR OWN copy of the program.
create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_id   uuid not null references public.programs (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index if not exists challenge_members_program_idx
  on public.challenge_members (program_id);

-- Links each participant's private movement to a shared slot, so "your mile"
-- and "their mile" can be lined up without matching on strings. The slot is
-- the challenge owner's movement id, used purely as a stable key.
create table if not exists public.challenge_movements (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slot         uuid not null,
  movement_id  uuid not null references public.movements (id) on delete cascade,
  primary key (challenge_id, user_id, slot)
);

-- ── the security-definer core ────────────────────────────
--
-- RLS policies cannot simply join logs -> exercises -> days -> programs,
-- because those tables have owner-only policies of their own: inside the
-- subquery a buddy's rows are invisible, so the check would always be false.
--
-- These functions run as their owner (security definer) so the joins can see
-- the underlying rows, and each returns only a boolean. `search_path` is
-- pinned so the body cannot be redirected at a shadowed table.

create or replace function public.shares_challenge_program(p_exercise_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from exercises e
    join days d                  on d.id = e.day_id
    join challenge_members theirs on theirs.program_id = d.program_id
    join challenge_members mine   on mine.challenge_id = theirs.challenge_id
    where e.id = p_exercise_id
      and mine.user_id = auth.uid()
  );
$$;

revoke execute on function public.shares_challenge_program(uuid) from public;
grant execute on function public.shares_challenge_program(uuid) to authenticated;

-- Joining needs to find a challenge by code before you are a member of it,
-- which RLS would otherwise forbid. Kept narrow: it takes a code, and only
-- ever enrols the caller.
create or replace function public.join_challenge(p_code text, p_program_id uuid)
returns uuid
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select id into target from challenges where invite_code = p_code;
  if target is null then
    raise exception 'No challenge with that code';
  end if;

  -- The program must belong to the caller, or they could enrol someone else's.
  if not exists (
    select 1 from programs where id = p_program_id and user_id = auth.uid()
  ) then
    raise exception 'That program is not yours';
  end if;

  insert into challenge_members (challenge_id, user_id, program_id)
  values (target, auth.uid(), p_program_id)
  on conflict (challenge_id, user_id) do update set program_id = excluded.program_id;

  return target;
end;
$$;

revoke execute on function public.join_challenge(text, uuid) from public;
grant execute on function public.join_challenge(text, uuid) to authenticated;

-- ── row-level security ───────────────────────────────────

alter table public.challenges          enable row level security;
alter table public.challenge_members   enable row level security;
alter table public.challenge_movements enable row level security;

-- You can see a challenge if you are in it.
drop policy if exists "challenges_member_read" on public.challenges;
create policy "challenges_member_read" on public.challenges
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.challenge_members m
      where m.challenge_id = challenges.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "challenges_owner_write" on public.challenges;
create policy "challenges_owner_write" on public.challenges
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Your own membership row is yours to write; fellow members are readable so
-- the app can list who is taking part.
drop policy if exists "challenge_members_own" on public.challenge_members;
create policy "challenge_members_own" on public.challenge_members
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "challenge_members_peer_read" on public.challenge_members;
create policy "challenge_members_peer_read" on public.challenge_members
  for select using (
    exists (
      select 1 from public.challenge_members mine
      where mine.challenge_id = challenge_members.challenge_id
        and mine.user_id = auth.uid()
    )
  );

drop policy if exists "challenge_movements_own" on public.challenge_movements;
create policy "challenge_movements_own" on public.challenge_movements
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "challenge_movements_peer_read" on public.challenge_movements;
create policy "challenge_movements_peer_read" on public.challenge_movements
  for select using (
    exists (
      select 1 from public.challenge_members mine
      where mine.challenge_id = challenge_movements.challenge_id
        and mine.user_id = auth.uid()
    )
  );

-- ── the actual sharing: read-only access to a buddy's challenge logs ──
--
-- The existing owner policy is split so that write access stays strictly
-- yours while reads gain one extra, narrow route. Permissive policies are
-- OR-ed, so this widens SELECT only.

drop policy if exists "logs_owner" on public.logs;

drop policy if exists "logs_own_all" on public.logs;
create policy "logs_own_all" on public.logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "logs_challenge_read" on public.logs;
create policy "logs_challenge_read" on public.logs
  for select using (public.shares_challenge_program(exercise_id));

-- Their exercise rows have to be readable too, or their logs arrive unlabelled.
drop policy if exists "exercises_challenge_read" on public.exercises;
create policy "exercises_challenge_read" on public.exercises
  for select using (public.shares_challenge_program(id));
