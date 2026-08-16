-- 008_dates.sql — give sessions real calendar dates.
--
-- Two separate needs, two columns:
--
--   logs.logged_on      when you actually did the session. Nullable, because
--                       every existing row predates this and guessing a date
--                       for them would be inventing data.
--
--   programs.starts_on  the anchor that turns an ordinal slot ("week 3,
--                       Thursday") into a real date. Without it the app can
--                       order sessions but can never answer "is this today?",
--                       which is the whole point of a daily challenge.
--
-- Kept as `date`, not `timestamptz`: a workout happens on a day, and timezone
-- maths on a training log causes far more problems than it solves.

alter table public.logs
  add column if not exists logged_on date;

alter table public.programs
  add column if not exists starts_on date;

-- Fast "what did anyone do on this date" lookups for challenge comparisons.
create index if not exists logs_logged_on_idx on public.logs (user_id, logged_on);

-- Backfill the anchor for programs that already exist, so their slots have
-- dates too. created_at is the honest best guess for when the block began.
update public.programs
set starts_on = created_at::date
where starts_on is null;
