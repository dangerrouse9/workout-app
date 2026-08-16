-- ============================================================
--  Workout Tracker — Supabase schema
--  Paste this whole file into the Supabase SQL Editor and Run.
--  Safe to re-run: every object uses "if not exists" / "or replace".
-- ============================================================

-- ---------- extensions ----------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ============================================================
--  TABLES
--  user_id is denormalized onto every row so Row-Level Security
--  can be a simple `user_id = auth.uid()` check (no recursive joins).
-- ============================================================

-- ---------- programs ----------
create table if not exists public.programs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  description  text default '',
  weeks        int  not null default 8 check (weeks between 1 and 52),
  position     int  not null default 0,           -- order in the program list
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- days (a program has ordered days) ----------
create table if not exists public.days (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  program_id   uuid not null references public.programs (id) on delete cascade,
  name         text not null default 'Day 1',     -- e.g. "Day 1" or "Day 1 – Pull"
  focus        text default '',                   -- optional short label, e.g. "Pull"
  position     int  not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------- exercises (a day has ordered exercises) ----------
create table if not exists public.exercises (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  day_id          uuid not null references public.days (id) on delete cascade,
  name            text not null,                  -- the GROUPING KEY for history-by-name
  target_sets     text default '',                -- free text ("4", "5")
  target_reps     text default '',                -- free text ("8-10", "20s", "15-20s each")
  rest_seconds    int  default 90,
  notes           text default '',                -- planned cue, persists across weeks
  is_superset     boolean not null default false,
  superset_group  text,                           -- shared id for grouped supersets (nullable)
  position        int  not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists exercises_name_idx on public.exercises (user_id, lower(name));

-- ---------- exercise_fields (custom fields tracked each session) ----------
create table if not exists public.exercise_fields (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id) on delete cascade,
  label        text not null,                     -- "Tempo", "RPE", "Distance"…
  position     int  not null default 0
);

-- ---------- logs (one row per exercise per week — "summary" logging) ----------
create table if not exists public.logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id) on delete cascade,
  week         int  not null check (week >= 1),
  sets         text default '',                   -- free text; "0" or reps "—" means skipped
  reps         text default '',
  weight       text default '',                   -- FREE TEXT: "BW", "+20lb", "135lb", "green band"
  variation    text default '',                   -- per-session modifier: "2s eccentric", "top hold"
  note         text default '',
  custom       jsonb not null default '{}'::jsonb, -- { "RPE": "8", "Tempo": "3-1-1" }
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (exercise_id, week)
);

-- ---------- session_status (one row per day per week: status + benchmark flag) ----------
create table if not exists public.session_status (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  day_id       uuid not null references public.days (id) on delete cascade,
  week         int  not null check (week >= 1),
  status       text check (status in ('complete','partial','skipped')),
  is_benchmark boolean not null default false,    -- ★ test / max-effort session
  unique (day_id, week)
);

-- ============================================================
--  updated_at triggers
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_programs_touch on public.programs;
create trigger trg_programs_touch before update on public.programs
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_logs_touch on public.logs;
create trigger trg_logs_touch before update on public.logs
  for each row execute function public.touch_updated_at();

-- ============================================================
--  ROW-LEVEL SECURITY
--  Each table: a user can only see / change their own rows.
-- ============================================================
alter table public.programs        enable row level security;
alter table public.days            enable row level security;
alter table public.exercises       enable row level security;
alter table public.exercise_fields enable row level security;
alter table public.logs            enable row level security;
alter table public.session_status  enable row level security;

-- One policy per table covering all actions. Re-runnable via drop-if-exists.
do $$
declare t text;
begin
  foreach t in array array[
    'programs','days','exercises','exercise_fields','logs','session_status'
  ] loop
    execute format('drop policy if exists "%s_owner" on public.%I;', t, t);
    execute format($f$
      create policy "%s_owner" on public.%I
        for all
        using (user_id = auth.uid())
        with check (user_id = auth.uid());
    $f$, t, t);
  end loop;
end $$;

-- ============================================================
--  HISTORY-BY-NAME  (the core feature)
--  Returns every logged session for a given exercise name,
--  across ALL of a user's programs/days/weeks. RLS still applies.
--  Usage from the client:
--    supabase.rpc('history_for_name', { p_name: 'Weighted Pull-Ups' })
-- ============================================================
create or replace function public.history_for_name(p_name text)
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
  where e.user_id = auth.uid()
    and lower(e.name) = lower(p_name)
    and (l.sets <> '' or l.reps <> '' or l.weight <> '' or l.note <> '')
  order by pr.created_at, l.week;
$$;

-- ============================================================
--  DONE. Next: enable Email (or Apple) auth in Authentication →
--  Providers, then point the app at your project URL + anon key.
-- ============================================================
