-- 004_fix_membership_recursion.sql
--
-- Fixes an error in 003: the peer-read policies tested membership with a
-- subquery against challenge_members, but that table's own policy then ran
-- again on the subquery, recursing forever (Postgres 42P17).
--
-- A policy on table X may not query X. Route the check through a
-- security-definer function instead: it bypasses RLS inside its body, so the
-- lookup happens once and returns a plain boolean.

create or replace function public.is_challenge_member(p_challenge_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from challenge_members
    where challenge_id = p_challenge_id
      and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_challenge_member(uuid) from public;
grant execute on function public.is_challenge_member(uuid) to authenticated;

-- ── rewrite the three offending policies ─────────────────

drop policy if exists "challenges_member_read" on public.challenges;
create policy "challenges_member_read" on public.challenges
  for select using (
    owner_id = auth.uid()
    or public.is_challenge_member(id)
  );

drop policy if exists "challenge_members_peer_read" on public.challenge_members;
create policy "challenge_members_peer_read" on public.challenge_members
  for select using (public.is_challenge_member(challenge_id));

drop policy if exists "challenge_movements_peer_read" on public.challenge_movements;
create policy "challenge_movements_peer_read" on public.challenge_movements
  for select using (public.is_challenge_member(challenge_id));
