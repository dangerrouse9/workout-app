-- 007_member_display_name.sql
--
-- A challenge takes any number of participants, so columns labelled "Buddy 1"
-- and "Buddy 2" are positional and meaningless. Each participant names
-- themselves when they create or join.
--
-- This lives on challenge_members rather than on the user, so the name is
-- scoped to the challenge: it is readable by fellow participants through the
-- existing peer-read policy and by nobody else, and it never becomes a global
-- profile that leaks between unrelated challenges.

alter table public.challenge_members
  add column if not exists display_name text;
