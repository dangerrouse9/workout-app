# Supabase Setup — do this first, by hand

This guide is for **you (the human)**, not for Claude Code. It sets up the
database and auth that the app will talk to. Do these steps once, in the
Supabase web console, **before** you point Claude Code at the build. It takes
about 15 minutes and you don't need to write any code — just paste one SQL file.

When you're done you'll have three things the app needs:
1. A **Project URL**
2. An **anon public API key**
3. Tables + security rules already in place

Keep the URL and anon key somewhere handy — you'll paste them into the app's
`.env` file later (the build guide explains where).

---

## 1. Create the project

1. Go to **https://supabase.com** and sign in (free tier is plenty to start).
2. Click **New project**.
3. Give it a name (e.g. `workout-tracker`), set a strong database password
   (save it in your password manager — you rarely need it, but don't lose it),
   pick the region closest to you, and click **Create new project**.
4. Wait ~2 minutes for it to finish provisioning.

## 2. Run the schema

1. In the left sidebar, open **SQL Editor**.
2. Click **+ New query**.
3. Open the file **`schema.sql`** from this handoff folder, copy its entire
   contents, and paste it into the editor.
4. Click **Run** (bottom right). You should see "Success. No rows returned."
5. Sanity check: open **Table Editor** in the sidebar. You should now see six
   tables — `programs`, `days`, `exercises`, `exercise_fields`, `logs`,
   `session_status`.

> The script is safe to re-run if anything goes wrong — it won't duplicate
> tables or policies.

## 3. Turn on login

The app is per-user: everyone signs in and sees only their own data (the SQL
already enforces this with Row-Level Security). Pick **one** sign-in method to
start — email is the simplest.

1. Sidebar → **Authentication** → **Providers**.
2. **Email** is on by default. For the easiest first run, scroll to
   **Email** settings and turn **OFF** "Confirm email" while you're testing
   (so you don't have to click a confirmation link every time). Turn it back
   **on** before real use.
3. (Optional, recommended for an iPhone PWA) Enable **Apple** as a provider
   later — it's the nicest sign-in on iOS, but email is fine to build against
   first.

## 4. Grab your keys

1. Sidebar → **Project Settings** (gear icon) → **API**.
2. Copy two values:
   - **Project URL** → looks like `https://abcdefgh.supabase.co`
   - **anon public** key (under "Project API keys") → a long string starting
     with `eyJ…`
3. Paste both into a note for now. The build guide will tell Claude Code to put
   them in a `.env` file. **The anon key is safe to ship in a frontend app** —
   RLS is what protects the data, not key secrecy. Never paste the
   `service_role` key into the app, though.

---

## What the schema gives you (plain-English version)

- **programs** → your training blocks ("Calisthenics Round 2", 8 weeks).
- **days** → the days within a program (Day 1 – Pull, etc.), with an optional
  short **focus** label.
- **exercises** → the movements in each day. The exercise **name** is the key
  that ties history together — two exercises named "Strict Pull-Ups" in
  different programs share a history.
- **exercise_fields** → any custom things you chose to track on a movement
  (Tempo, RPE, Distance).
- **logs** → what you actually did, **one row per exercise per week**. Weight is
  free text on purpose ("BW", "+20lb", "green band"). Each log can carry a
  **variation** tag ("2s eccentric", "top hold") so you can see *how* you did a
  movement without splitting it into a separate exercise.
- **session_status** → per day, per week: whether it was complete / partial /
  skipped, and whether it was a ★ **benchmark / test** session.

There's also a database function called **`history_for_name`** — it's what
powers the press-and-hold history popup and the trend chart. The app calls it
with an exercise name and gets back every session you ever logged under that
name.

## A note on the data you already have

Your current program and all its logged history live in the prototype's
`src/seed.js`. You do **not** have to retype it. The build guide includes a
one-time **import step**: Claude Code can read that seed file and write a small
script that pushes it into your new Supabase tables after you've signed in once.
So your Round 2 history comes across intact.
