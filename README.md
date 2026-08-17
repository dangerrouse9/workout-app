# Workout

A phone-first training tracker. Vite + React on Supabase, installed to the iOS
home screen as a PWA.

Live at <https://workout-app-mu-amber.vercel.app>.

## The database is half the codebase

**`migrations/` is not a historical record — it is source.** Read it alongside
`src/`, because a meaningful amount of the app's behaviour lives in Postgres and
is invisible from the JavaScript:

- **Row-Level Security is the security boundary.** The publishable key in the
  frontend bundle grants nothing on its own. Who can read what is decided
  entirely by the policies in `003` and `009`.
- **History is a database function.** `history_for_movement` (`002`) is what
  makes a movement's history follow it across programs.
- **Creating and joining a challenge are database functions** (`011`). They
  write across five tables and must be atomic, so they run as one transaction
  rather than a sequence of client calls.

Changing any of that means writing a new migration and running it by hand in the
Supabase SQL editor — not editing a file and pushing. Migrations are applied in
numerical order and are not run automatically.

`003` contains two policies that were wrong on arrival; `004` replaces them. It
was left as-applied rather than edited after the fact, so the numbering matches
what the database actually saw.

## Running it

```bash
npm install
npm run dev
```

`.env` needs two values from Supabase → Project Settings → API Keys:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Both are baked in at build time, so a change needs a dev-server restart, and
Vercel needs its own copy in the project's environment variables — `.env` is
git-ignored and never reaches the deploy.

Password reset only works if the app's URL is listed under Supabase →
Authentication → URL Configuration → Redirect URLs.

## Layout

```
src/
├── lib/          data + logic, no JSX
│   ├── db.js         the only module that writes; stamps the owner column
│   ├── store.js      one hook over the whole schema
│   ├── challenges.js buddy challenges
│   └── helpers.js    pure functions, no persistence
├── screens/      one file per screen
├── ui.jsx        primitives: icons, sheets, day bar, numeric field
└── app.css       every style; ported from the design handoff
```

Two rules worth keeping:

**Every write goes through `src/lib/db.js`.** It stamps the owner column in one
place, so RLS can't be tripped by a call site that forgot.

**Any new table in `public` needs RLS enabled and an owner policy.** Without it
the table is readable by anyone holding the publishable key.

## Testing with two accounts

`localhost`, `127.0.0.1` and `[::1]` are separate origins to the browser, so
each holds its own session. Open two and you can be signed in as two users
against the same dev server — which is the only way to check that a challenge
shares what it should and nothing more.
