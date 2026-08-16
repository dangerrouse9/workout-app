-- 001_movements.sql  (applied)
--
-- Adds a movement catalog so a movement's history is joined by foreign key
-- rather than by matching the exercise name as a string. Same behaviour as
-- before — history follows a movement across programs — but a typo or a rename
-- can no longer silently split one history into two.
--
-- `exercises` stays a table of prescriptions ("in this day, 4x5 with 150s
-- rest"); `movements` is the vocabulary those prescriptions point at.

create table if not exists public.movements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

-- A UNIQUE table constraint takes bare columns only, so case-insensitive
-- uniqueness has to be expressed as an index.
create unique index if not exists movements_user_name_idx
  on public.movements (user_id, lower(name));

-- A table in `public` without RLS is readable by anyone holding the
-- publishable key, which ships in the frontend bundle. Never skip this.
alter table public.movements enable row level security;

drop policy if exists "movements_owner" on public.movements;
create policy "movements_owner" on public.movements
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.exercises
  add column if not exists movement_id uuid references public.movements (id) on delete restrict;

create index if not exists exercises_movement_idx on public.exercises (movement_id);

-- Backfill. user_id is set explicitly rather than relying on the auth.uid()
-- default, because auth.uid() is null when run from the SQL editor.
insert into public.movements (user_id, name)
select distinct on (e.user_id, lower(e.name)) e.user_id, e.name
from public.exercises e
where e.name <> ''
order by e.user_id, lower(e.name), e.created_at
on conflict do nothing;

update public.exercises e
set movement_id = m.id
from public.movements m
where m.user_id = e.user_id
  and lower(m.name) = lower(e.name)
  and e.movement_id is null;
