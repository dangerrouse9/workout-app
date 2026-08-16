# Handoff: Workout Tracker — phone-first PWA (React + Supabase)

## Read this first (for Claude Code)

You are implementing a **real React app** from a **working HTML prototype**. The
files in `design_reference/` are a high-fidelity prototype built with in-browser
React + Babel and `localStorage`. They are the **source of truth for look,
layout, copy, and behavior** — but they are *not* the production codebase. Your
job is to **recreate them as a proper Vite + React app backed by Supabase, and
ship it as an installable iPhone PWA.**

Two tracks exist in this handoff:
- **The database** (`SUPABASE_SETUP.md` + `schema.sql`) is set up **by the user,
  by hand, in the Supabase console, before you start.** Assume the tables,
  Row-Level Security, and the `history_for_name` function already exist. Do not
  try to create the database yourself — just connect to it. The user will give
  you a **Project URL** and **anon key** to put in `.env`.
- **The app** (this README) is what you build.

---

## Overview

A personal strength-training tracker. The user builds multi-week **programs**
(e.g. an 8-week block), each made of **days**, each made of **exercises**. Week
after week they **log** what they actually did, always seeing last week's
numbers for reference. The defining feature is **history-by-name**: any two
exercises that share a name share a history, so progress follows the movement
across programs.

It is **phone-only**. Design and build it as a single-column mobile web app that
installs to the iOS home screen and runs full-screen.

## Fidelity

**High-fidelity.** Recreate the UI to match the prototype closely — the colors,
typography, spacing, radii, and interactions below are final. You may use a
component approach idiomatic to React, but the result should look like the
prototype. Don't introduce a UI kit (Material, Chakra, etc.) — the styling is
plain CSS and should stay that way (CSS Modules or a single stylesheet is ideal).

## Tech stack (recommended)

- **Vite + React 18** (`npm create vite@latest -- --template react`)
- **@supabase/supabase-js** for data + auth
- **vite-plugin-pwa** for the manifest + service worker
- Plain CSS (port `design_reference/src/app.css` almost verbatim — see Design Tokens)
- No global state library needed; React state + a thin data hook is enough.
  The prototype already funnels every mutation through one `update()` function —
  preserve that shape (one place that writes), just make it write to Supabase.

---

## Screens / Views

The app has **three tabs** (bottom tab bar) plus a few overlays. A fixed header
sits at the top of every tab. Everything is one scrolling column.

### Global chrome

- **Header** (`.hdr`): a small uppercase kicker ("LOGGING" / "PROGRESS" /
  "LIBRARY") above a 22px bold program name. Tapping the name (on Log/Progress)
  opens the **program switcher** sheet. On the Log tab a round **+** button sits
  at the right to add an exercise. When a timer is running, a colored timer bar
  appears directly under the header (see Timers).
- **Bottom tab bar** (`.tabbar`): three tabs — **Log** (book icon), **Progress**
  (bar-chart icon), **Programs** (grid icon). Translucent blurred background,
  active tab tinted green (`--acc`). Sits above the iOS home-indicator inset.

### 1. Log (the default screen)

Where you record a session. Top to bottom:

- **Day pills** (`.daybar`): horizontal scroll of the program's days. Active
  pill is solid green. Label shows the day's short name (text before an en-dash,
  or the `focus` field).
- **Week nav** (`.weeknav`): ‹ and › circular arrows around a centered
  "Week N of M" with the day's focus as a subtitle. Arrows disable at the ends.
- **Status segmented control** (`.statusbar`): three buttons — Complete /
  Partial / Skipped — each with a colored dot. Tapping toggles; tapping the
  active one clears it. This is **per day, per week** (writes to
  `session_status`).
- **Benchmark toggle** (`.benchrow`): a full-width dashed button "Mark as
  benchmark / test session". When on it turns purple and reads "Benchmark / test
  session". Also per day, per week (`session_status.is_benchmark`).
- **Long-press hint** (`.lp-hint`): a dismissible green tip bar — "press & hold
  any workout to see its full history & trend." Dismissal persists (localStorage
  is fine for this UI-only flag).
- **Exercise cards** (`.exc`), one per exercise:
  - Header: exercise name (16px bold), a green **plan tag** ("5×3"), a blue
    **rest tag** ("2m 30s", tappable → starts rest timer), and an optional
    planned **note** in muted text. A **⋯** button (and **long-press anywhere on
    the header**) opens the exercise action menu.
  - **Last-logged reference** (`.lastwk`): a soft panel showing the most recent
    prior week that has data — "LAST LOGGED · WEEK 4 / 5×3 @ BW" plus that
    week's note, and the variation tag if any. Tapping it opens the history
    popup. If no prior data: "No prior data — first time logging".
  - **This-week inputs** (`.in-grid`): three fields — **Sets**, **Reps**,
    **Weight** (all free text; weight placeholder "—"). Below them, one input
    per **custom field** (Tempo/RPE/etc.) if the exercise defines any.
  - **Variation input** (`.var-f`): a dashed single-line field — "+ Variation
    this session — e.g. 2s eccentric, top hold (optional)". Autocompletes
    (native `<datalist>`) from variation tags previously used for this exercise
    name.
  - **Note textarea** (`.note-f`): "How did it feel? Notes for next time…"
  - **Start rest button** (`.rest-go`): solid blue, white text, "▶ Start 2m 30s
    rest". For **timed exercises** (target reps contain seconds, e.g. "20s"), an
    additional green **"Time hold"** button (`.hold-go`) appears beside it →
    starts a **count-up** stopwatch.
  - Superset exercises get a left green border + a small "SUPERSET" tag.
- **Add row** (`.add-row`): a dashed "+ Add exercise" button and a "Superset"
  button → open the add-exercise sheet.

> **Input commit model:** in the prototype, set/rep/weight/variation/note fields
> are uncontrolled and commit **on blur** (so typing doesn't thrash state). In
> the real app, debounce-save each field to the matching `logs` row (upsert on
> `(exercise_id, week)`). Don't save on every keystroke.

### 2. Progress (the matrix you rely on)

The all-weeks overview for the active program's selected day.

- Same **day pills** at top.
- For each exercise: name (tappable → history popup), a "target 5×3" line, then
  a **horizontal scrolling strip** (`.pg-strip`) of week cells — one cell per
  week of the program. Each cell shows "Week N", the logged "5×3", and the
  weight in green. The **current week** cell is highlighted green; **skipped**
  weeks show red "Skipped"; **empty** weeks show a muted "—"; **benchmark**
  weeks get a ★ next to the week number. Tapping a cell jumps to that week on
  the Log tab.

This horizontal-per-exercise layout is the whole point — it's how you compare a
movement week over week to pick the next load. Preserve it exactly.

### 3. Programs (library)

- A green **"+ Create new program"** button.
- A card per program: name, "Active" tag on the current one, description, and
  meta tags (weeks / days / exercises count). Buttons: **Edit** (opens the
  builder), **Export** (opens the Claude export sheet), and a trash button
  (only when more than one program exists; confirms first). Tapping the card
  body makes that program active.
- A muted "Reset demo data" link (prototype only — drop or repurpose this in
  the real app, e.g. "Sign out").

### Overlays

- **Program builder** (`.ProgramBuilder`, full-screen): name, goal/description,
  length-in-weeks, then a list of **days**. Each day has a name input, an
  optional **Focus** input, and its exercises (each editable/removable), plus
  "Add exercise". Buttons to add another day and to save/create. Add/Edit
  exercise opens the same **ExerciseForm** sheet used elsewhere.
- **ExerciseForm** (bottom sheet): name (with **autocomplete from your exercise
  library**, showing a "N logged" badge and "✓ Matches a saved workout — history
  will carry over" when the name matches), sets, reps/time, **rest chips**
  (45s…180s), **custom-field chips** (+ add your own), a cue/note, and a "Part of
  a superset" toggle.
- **Exercise action menu** (sheet, from ⋯ or long-press): header with the
  exercise name + summary, then — **View full history & trend**, **Search this
  exercise on Google** (opens `https://www.google.com/search?q=how+to+do+<name>+exercise`),
  **Edit exercise & fields**, **Remove from this day** (red).
- **History popup** (`.pop`, centered modal): the marquee feature. Header with
  exercise name + "N logged sessions · history by name". A **trend sparkline**
  (bars per week) when there are ≥2 numeric data points — charts **load** when
  weights are numeric, otherwise **reps** or **hold-time** (the label switches:
  "Load trend" / "Hold-time trend" / "Reps / volume trend"). Then a reverse-chron
  **timeline**: each row is "Wk N / day", the performance "4×5 @ +20lb" with the
  **variation tag** inline, and the note. Skipped sessions show "Skipped" in red.
  Data comes from the `history_for_name` RPC.
- **Export sheet**: a read-only textarea containing a generated, Claude-ready
  prompt (full week-by-week history, statuses, ★ benchmark sessions, and a
  request to design the next block) plus a **Copy to clipboard** button. See
  `buildExport` in `src/store.js` for the exact format — reproduce it.
- **Program switcher** (sheet): list of programs with a check on the active one;
  "Manage programs" jumps to the Programs tab.

---

## Interactions & behavior

- **Long-press** (~420ms) on an exercise card header opens its action menu; a
  short tap does nothing destructive. The prototype's `useLongPress` hook
  (`src/ui.jsx`) also handles right-click and triggers a short haptic
  (`navigator.vibrate`). Port this behavior.
- **Sheets** slide up from the bottom; the **history popup** scales in centered;
  both have a dimmed backdrop that closes on tap-outside. Keep transitions
  short (~220–280ms, ease-out).
- **Rest timer (count-down):** starting it shows the blue timer bar under the
  header with a draining progress fill, a live M:SS readout, and **+15 / −15 /
  Done** buttons. At zero it plays a triple beep (WebAudio — see `beep()` in
  `App.jsx`). The timer persists across tab switches (it lives in app-level
  state, not screen state).
- **Hold timer (count-up):** green bar, counts **up** from 0 (because targets
  are often ranges/PRs). Buttons: **Reset**, **Log Ns** (writes the elapsed
  seconds into that exercise/week's reps field), **Stop**.
- **History-by-name** is computed by exercise **name**, case-insensitive,
  trimmed — across every program. In the app this is the `history_for_name(name)`
  RPC. Autocomplete lists and "N logged" badges derive from the same idea
  (distinct exercise names + their session counts).
- **Skipped** is represented in data as `sets = "0"` or `reps = "—"` in the
  prototype. In the real app, prefer driving "skipped" from
  `session_status.status = 'skipped'`; still tolerate empty logs as "no data".
- **Renaming** an exercise keeps it the same exercise (history follows the new
  name, since history is keyed on the current name).

## State management

The prototype keeps one big state object (`src/store.js` / `App.jsx`):
`{ programs[], logs{}, statuses{}, benchmarks{}, restEdits{}, activeProg,
activeDay, activeWeek }`, persisted to `localStorage`, with **all writes through
a single `update(fn)`**.

For the real app:
- Persist **programs / days / exercises / exercise_fields / logs /
  session_status** to Supabase (schema provided). Keep **activeProg / activeDay /
  activeWeek** and UI-only flags (hint dismissal) in local state / localStorage —
  they're per-device view state, not data.
- Wrap data access in one module/hook (e.g. `useStore`) that mirrors the
  prototype's helper surface: `getLog`, `historyForName` (→ RPC),
  `libraryNames`, `variationsForName`, `statusFor`, `isBench`, `isTimed`,
  `fmtRest`, `buildExport`. The pure helpers (`fmtRest`, `isTimed`, `parseNum`,
  `buildExport`) can be ported as-is.
- **Upserts:** a log is unique on `(exercise_id, week)`; a status is unique on
  `(day_id, week)`. Use `upsert` with those conflict targets.

## One-time data import (don't make the user retype anything)

The user's real program and full logged history are in
`design_reference/src/seed.js` (`window.buildSeed()` returns `{ program, logs }`).
After auth works, write a small **import script/route** that:
1. signs in as the user,
2. reads the seed structure,
3. inserts the program → days → exercises (preserving order and superset flags),
4. inserts each `logs` entry against the new exercise IDs at the right week,
5. is **idempotent** (skip if a program named "Calisthenics Program Round 2"
   already exists).

This brings the existing block across intact. Treat the seed as the migration
source, then it can be deleted.

## Design tokens

Ported from `design_reference/src/app.css` (`:root`). These are final.

**Color**
| Token | Hex | Use |
|---|---|---|
| `--acc` | `#1D9E75` | primary green — active pills, plan tags, "complete" |
| `--acc-d` | `#0F6E56` | dark green text on light green |
| `--acc-l` | `#E4F4EE` | light green fill |
| `--acc-l2` | `#D2ECE2` | light green fill (deeper) |
| `--amb` / `--amb-bg` / `--amb-tx` | `#EF9F27` / `#FCF1DC` / `#7A4A06` | amber — "partial" status only |
| `--tmr` / `--tmr-bg` / `--tmr-tx` | `#2B62CC` / `#E5EDFB` / `#214E9E` | blue — rest timer + rest UI |
| `--dan` / `--dan-bg` | `#E2554F` / `#FBEAE9` | red — "skipped" / destructive |
| purple | `#8A63C9` / `#6A3FAE` / `#F3ECFB` | benchmark + variation tags |
| `--bg` | `#F4F2EE` | page background (warm neutral) |
| `--card` | `#FFFFFF` | cards |
| `--card2` | `#FAF8F4` | nested input fill |
| `--line` / `--line2` | `rgba(40,36,28,.10)` / `.16` | hairlines / borders |
| `--tx` / `--tx2` / `--tx3` | `#211F1B` / `#6E6A62` / `#A6A199` | text / secondary / tertiary |

Semantic rule to preserve: **green = primary/complete, amber = partial, red =
skipped, blue = rest/timing, purple = benchmark/variation.** Keep these
non-overlapping.

**Type** — system stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text",
"Segoe UI", system-ui, sans-serif`. Base 15px / line-height 1.4. **Inputs must be
16px** (prevents iOS zoom-on-focus). Header name 22px/700. Card title 16px/700.
Section kickers ~11px/800 uppercase, letter-spacing ~0.5px.

**Radius** — `--r: 18px` (cards), `--r-sm: 12px` (inputs/chips), `--r-lg: 26px`,
pills/circles `999px`, sheets `24px` top corners.

**Spacing** — screen gutter 18px; card padding ~13–14px; gaps 7–12px. Touch
targets ≥40px (arrows/icon buttons are 38–40px circles).

**Elevation** — cards `0 1px 3px rgba(0,0,0,.05)`; sheets `0 -10px 40px
rgba(0,0,0,.22)`; timer bars a colored glow (e.g. `0 4px 16px rgba(43,98,204,.34)`).

## PWA requirements

- `manifest.json`: name "Workout", `display: "standalone"`, `theme_color`
  `#F4F2EE`, background `#F4F2EE`, portrait orientation, maskable app icons
  (192 + 512). A simple green icon with a dumbbell glyph matches the prototype's
  splash (see the `<template id="__bundler_thumbnail">` in `Workout App.html`).
- Service worker via `vite-plugin-pwa` (cache the shell for offline open).
- iOS install path is **Safari → Share → Add to Home Screen**; verify it launches
  full-screen with no browser chrome.
- Must be served over **HTTPS** (Vercel/Netlify both do this free). The viewport
  is already locked in the prototype: `width=device-width, initial-scale=1,
  maximum-scale=1, user-scalable=no`.
- **Drop the iPhone bezel** (`frames/ios-frame.jsx`) and the scaling `#fit`
  wrapper from the prototype — on a real device the OS provides the frame. Render
  the app full-bleed and respect safe-area insets
  (`env(safe-area-inset-top/bottom)`) where the prototype used `--sb` / `--hi`.

## Files in this handoff

```
design_handoff_workout_app/
├── README.md            ← you are here (app build guide)
├── SUPABASE_SETUP.md    ← user runs this by hand, first
├── schema.sql           ← pasted into Supabase SQL editor
└── design_reference/    ← the working prototype (source of truth for UI/behavior)
    ├── Workout App.html  ← entry; mounts <App/> inside the device frame
    ├── frames/ios-frame.jsx   (drop in production)
    └── src/
        ├── app.css       ← all styling + tokens — port this
        ├── seed.js       ← the user's real program + history (import source)
        ├── store.js      ← state model + pure helpers + buildExport
        ├── ui.jsx        ← icons, Overlay/Sheet/Popup/Toggle, useLongPress
        ├── log.jsx       ← Log screen + ExerciseForm
        ├── progress.jsx  ← Progress matrix
        ├── program.jsx   ← Programs list + builder
        └── App.jsx       ← root: header, tabs, timers, overlay wiring
```

Open `Workout App.html` in a browser to interact with the real thing while you
build. It needs no server — just open it.

## Suggested build order

1. Scaffold Vite + React; port `app.css`; drop the bezel; get a static Log
   screen rendering with hard-coded data.
2. Add Supabase client + email auth (a minimal sign-in screen).
3. Build the data hook over the six tables; wire Log read/write (upserts).
4. Programs list + builder; program switching.
5. Progress matrix; history popup via `history_for_name` RPC; export sheet.
6. Timers (rest count-down + hold count-up), status, benchmark, variation.
7. The one-time seed import; verify the user's Round 2 history appears.
8. PWA manifest + service worker; test Add to Home Screen on an iPhone.

Match the prototype as you go — it's the spec.
