-- 005_revoke_anon_execute.sql
--
-- Tightening, not a fix for a leak. Supabase's default privileges grant EXECUTE
-- on new public functions to both `anon` and `authenticated`, and a
-- `revoke ... from public` does not remove those explicit role grants. Verified
-- by calling is_challenge_member() signed out: it ran and returned false.
--
-- Nothing was exposed — every one of these returns false or raises when
-- auth.uid() is null — but a security-definer function should not be reachable
-- by an unauthenticated caller at all.

revoke execute on function public.is_challenge_member(uuid)          from anon;
revoke execute on function public.shares_challenge_program(uuid)     from anon;
revoke execute on function public.join_challenge(text, uuid)         from anon;

-- history_for_movement is security INVOKER, so RLS already scopes it, but an
-- anonymous caller has no reason to reach it either.
revoke execute on function public.history_for_movement(uuid)         from anon;
