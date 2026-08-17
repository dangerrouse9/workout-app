/* store.js — the single data hook. Mirrors the prototype's helper surface, but
   reads and writes Supabase instead of localStorage.
   Every mutation goes through src/lib/db.js, which stamps user_id. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as db from './db'
import { supabase } from './supabase'
import { buddyLogsFor } from './challenges'
import { norm, hasData, todayISO, dateForSlot, cyclePeriod } from './helpers'

const VIEW_KEY = 'wt_view' // per-device view state, deliberately not in the database

function loadView() {
  try {
    return JSON.parse(localStorage.getItem(VIEW_KEY)) || {}
  } catch {
    return {}
  }
}

function saveView(v) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v))
  } catch {
    /* private browsing can reject writes; view state is not worth failing over */
  }
}

export const logKey = (exId, week) => `${exId}_w${week}`
export const statusKey = (dayId, week) => `${dayId}_w${week}`

/** Assemble flat table rows into the nested program → days → exercises shape. */
function nest(programs, days, exercises, fields) {
  const fieldsByEx = new Map()
  for (const f of fields) {
    if (!fieldsByEx.has(f.exercise_id)) fieldsByEx.set(f.exercise_id, [])
    fieldsByEx.get(f.exercise_id).push(f)
  }
  const exByDay = new Map()
  for (const e of exercises) {
    if (!exByDay.has(e.day_id)) exByDay.set(e.day_id, [])
    exByDay.get(e.day_id).push({ ...e, fields: fieldsByEx.get(e.id) || [] })
  }
  const daysByProg = new Map()
  for (const d of days) {
    if (!daysByProg.has(d.program_id)) daysByProg.set(d.program_id, [])
    daysByProg.get(d.program_id).push({ ...d, exercises: exByDay.get(d.id) || [] })
  }
  return programs.map((p) => ({ ...p, days: daysByProg.get(p.id) || [] }))
}

export function useStore() {
  const [programs, setPrograms] = useState([])
  const [movements, setMovements] = useState([])
  const [challenges, setChallenges] = useState([])
  const [members, setMembers] = useState([])
  const [userId, setUserId] = useState(null)
  const [buddy, setBuddy] = useState(null)
  const [logs, setLogs] = useState({})
  const [statuses, setStatuses] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [view, setView] = useState(() => ({
    progId: null,
    dayIdx: 0,
    week: 1,
    ...loadView(),
  }))

  const patchView = useCallback((patch) => {
    setView((v) => {
      const next = { ...v, ...patch }
      saveView(next)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      const [p, d, e, f, l, s, m, ch, cm] = await Promise.all([
        db.from('programs').select('*').order('position'),
        db.from('days').select('*').order('position'),
        db.from('exercises').select('*').order('position'),
        db.from('exercise_fields').select('*').order('position'),
        db.from('logs').select('*'),
        db.from('session_status').select('*'),
        db.from('movements').select('*').order('name'),
        db.from('challenges').select('*'),
        db.from('challenge_members').select('*'),
      ])
      const firstError = [p, d, e, f, l, s, m].find((r) => r.error)
      if (firstError) throw firstError.error
      // Challenge tables are optional: the app still runs before migration 003.
      setChallenges(ch.error ? [] : ch.data)
      setMembers(cm.error ? [] : cm.data)
      setUserId((await supabase.auth.getSession()).data.session?.user?.id ?? null)

      setMovements(m.data)
      setPrograms(nest(p.data, d.data, e.data, f.data))
      setLogs(Object.fromEntries(l.data.map((r) => [logKey(r.exercise_id, r.week), r])))
      setStatuses(Object.fromEntries(s.data.map((r) => [statusKey(r.day_id, r.week), r])))
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ── active selection, clamped to whatever actually exists ──
  const program =
    programs.find((p) => p.id === view.progId) || programs[0] || null
  const dayIdx = program ? Math.min(view.dayIdx, Math.max(0, program.days.length - 1)) : 0
  const day = program?.days[dayIdx] || null
  const week = program ? Math.min(Math.max(1, view.week), program.weeks) : 1

  const getLog = useCallback((exId, wk) => logs[logKey(exId, wk)] || null, [logs])

  const statusFor = useCallback(
    (dayId, wk) => statuses[statusKey(dayId, wk)]?.status || '',
    [statuses],
  )

  const isBench = useCallback(
    (dayId, wk) => !!statuses[statusKey(dayId, wk)]?.is_benchmark,
    [statuses],
  )

  /** movement_id -> every exercise row prescribing it, across all programs. */
  const exercisesByMovement = useMemo(() => {
    const map = new Map()
    for (const p of programs)
      for (const d of p.days)
        for (const ex of d.exercises) {
          if (!ex.movement_id) continue
          if (!map.has(ex.movement_id)) map.set(ex.movement_id, [])
          map.get(ex.movement_id).push({ ex, program: p, day: d, weeks: p.weeks })
        }
    return map
  }, [programs])

  /**
   * The most recent session to show as this week's reference.
   *
   * Scoped to the movement, not to the exercise row — a movement reused in a
   * new program starts with a fresh row and no logs of its own, so keying on
   * the row would report "no prior data" while five weeks of history sat one
   * join away. Earlier weeks of the same row win (that's "last week" inside the
   * current block); otherwise fall back to the newest program that logged it.
   */
  const lastLoggedFor = useCallback(
    (exercise, week) => {
      if (!exercise?.movement_id) return null
      const candidates = []

      for (const { ex, program: p, day: d, weeks } of exercisesByMovement.get(exercise.movement_id) ||
        []) {
        const sameRow = ex.id === exercise.id
        const maxWeek = sameRow ? week - 1 : weeks
        for (let w = 1; w <= maxWeek; w++) {
          const log = getLog(ex.id, w)
          if (hasData(log)) candidates.push({ log, week: w, sameRow, program: p, day: d })
        }
      }
      if (!candidates.length) return null

      candidates.sort((a, b) => {
        if (a.sameRow !== b.sameRow) return a.sameRow ? -1 : 1
        const t = new Date(b.program.created_at) - new Date(a.program.created_at)
        if (t !== 0) return t
        return b.week - a.week
      })
      return candidates[0]
    },
    [exercisesByMovement, getLog],
  )

  /** How many logged sessions exist for a movement, across every program. */
  const countForMovement = useCallback(
    (movementId) => {
      let n = 0
      for (const { ex, weeks } of exercisesByMovement.get(movementId) || [])
        for (let w = 1; w <= weeks; w++) if (hasData(getLog(ex.id, w))) n++
      return n
    },
    [exercisesByMovement, getLog],
  )

  /** Variation tags previously used for this movement, for the datalist. */
  const variationsForMovement = useCallback(
    (movementId) => {
      const seen = new Set()
      const out = []
      for (const { ex, weeks } of exercisesByMovement.get(movementId) || [])
        for (let w = 1; w <= weeks; w++) {
          const v = getLog(ex.id, w)?.variation?.trim()
          if (v && !seen.has(v.toLowerCase())) {
            seen.add(v.toLowerCase())
            out.push(v)
          }
        }
      return out
    },
    [exercisesByMovement, getLog],
  )

  // ── slots as calendar dates ───────────────────────────
  // A challenge reads better as one running count of days than as a week grid:
  // "Day 7 of 30" is the thing you care about, not "week 1, Sunday".
  const daysPerWeek = program?.days.length || 1
  const totalDays = program ? program.weeks * daysPerWeek : 0
  const linearDay = (week - 1) * daysPerWeek + dayIdx + 1

  const slotDate = useCallback(
    (wk = week, di = dayIdx) => dateForSlot(program?.starts_on, wk, di, daysPerWeek),
    [program?.starts_on, week, dayIdx, daysPerWeek],
  )

  /** Move forward or back one day, rolling over week boundaries. */
  const stepDay = useCallback(
    (delta) => {
      const next = Math.min(totalDays, Math.max(1, linearDay + delta))
      patchView({
        week: Math.floor((next - 1) / daysPerWeek) + 1,
        dayIdx: (next - 1) % daysPerWeek,
      })
    },
    [linearDay, totalDays, daysPerWeek, patchView],
  )

  /** Jump to whichever slot is today, if the program covers it. */
  const goToToday = useCallback(() => {
    if (!program?.starts_on) return false
    const start = new Date(`${program.starts_on}T00:00:00`)
    const now = new Date(`${todayISO()}T00:00:00`)
    const offset = Math.round((now - start) / 86400000)
    if (offset < 0) return false
    const period = cyclePeriod(daysPerWeek)
    const wk = Math.floor(offset / period) + 1
    const di = offset % period
    if (wk > program.weeks || di >= daysPerWeek) return false
    patchView({ week: wk, dayIdx: di })
    return true
  }, [program?.starts_on, program?.weeks, daysPerWeek, patchView])

  /** The challenge the active program belongs to, if it is a challenge program. */
  const activeChallenge = useMemo(() => {
    if (!program || !userId) return null
    const mine = members.find((m) => m.program_id === program.id && m.user_id === userId)
    return mine ? challenges.find((c) => c.id === mine.challenge_id) || null : null
  }, [program, userId, members, challenges])

  /** Programs that are part of a challenge, so the library can badge them. */
  const challengeProgramIds = useMemo(
    () => new Set(members.filter((m) => m.user_id === userId).map((m) => m.program_id)),
    [members, userId],
  )

  // Buddy logs are only fetched when the active program is a shared challenge.
  useEffect(() => {
    if (!activeChallenge || !userId) {
      setBuddy(null)
      return
    }
    let cancelled = false
    buddyLogsFor(activeChallenge.id, userId)
      .then((r) => !cancelled && setBuddy(r))
      .catch((e) => !cancelled && setError(`Could not load your buddy's logs: ${e.message}`))
    return () => {
      cancelled = true
    }
  }, [activeChallenge, userId, logs])

  /**
   * One column per other participant for this exercise and week — including
   * participants with nothing logged, so a missed session reads as a visible
   * gap rather than a column that silently isn't there.
   */
  const buddyColumnsFor = useCallback(
    (exercise, wk, dayPos = dayIdx) => {
      if (!buddy?.participants?.length || !exercise?.movement_id) return []
      const slot = buddy.slotByMovement.get(exercise.movement_id)
      const logs = slot ? buddy.bySlot.get(`${slot}_d${dayPos}_w${wk}`) || [] : []
      return buddy.participants.map((p, i) => ({
        user_id: p.user_id,
        label: p.display_name?.trim() || `Buddy ${i + 1}`,
        log: logs.find((l) => l.user_id === p.user_id) || null,
      }))
    },
    [buddy, dayIdx],
  )

  /** Who else is in this challenge, already labelled for display. */
  const buddyParticipants = useMemo(() => {
    if (!buddy?.participants?.length) return []
    const many = buddy.participants.length > 1
    return buddy.participants.map((p, i) => ({
      user_id: p.user_id,
      label: p.display_name?.trim() || (many ? `Buddy ${i + 1}` : 'Buddy'),
    }))
  }, [buddy])

  /**
   * Leave a challenge — or, if you started it, end it for everyone. Ending it
   * only removes the shared link: every participant keeps their own copy of
   * the program and everything they logged against it.
   */
  const leaveChallenge = useCallback(
    async (challengeId, { deleteMyProgram = false } = {}) => {
      const mine = members.find((m) => m.challenge_id === challengeId && m.user_id === userId)
      const challenge = challenges.find((c) => c.id === challengeId)

      if (challenge?.owner_id === userId) await db.remove('challenges', challengeId)
      else await db.leaveChallenge(challengeId)

      if (deleteMyProgram && mine) await db.remove('programs', mine.program_id)
      await load()
    },
    [members, challenges, userId, load],
  )

  /** Look up an existing movement by typed name, so the form can warn before creating a duplicate. */
  const findMovementByName = useCallback(
    (name) => movements.find((m) => norm(m.name) === norm(name)) || null,
    [movements],
  )

  // ── writes ────────────────────────────────────────────
  // Optimistic: update local state first so typing feels instant, then persist.

  const pending = useRef(new Map())

  /** Debounced per-field save of one log row, upserted on (exercise_id, week). */
  const saveLog = useCallback((exId, wk, patch) => {
    const key = logKey(exId, wk)
    setLogs((prev) => {
      const merged = {
        sets: '',
        reps: '',
        weight: '',
        variation: '',
        note: '',
        custom: {},
        ...prev[key],
        ...patch,
        exercise_id: exId,
        week: wk,
      }
      // Stamp the day it was actually done, once, the first time anything is
      // entered. Never overwritten, so editing an old session months later
      // doesn't silently relabel it as today.
      if (!merged.logged_on) merged.logged_on = todayISO()
      const timer = pending.current.get(key)
      if (timer) clearTimeout(timer)
      pending.current.set(
        key,
        setTimeout(() => {
          pending.current.delete(key)
          // Send only the writable columns — id and the timestamps are the
          // database's to manage, and sending a stale id breaks the upsert.
          db.upsert(
            'logs',
            {
              exercise_id: merged.exercise_id,
              week: merged.week,
              sets: merged.sets,
              reps: merged.reps,
              weight: merged.weight,
              variation: merged.variation,
              note: merged.note,
              custom: merged.custom,
              logged_on: merged.logged_on,
            },
            'exercise_id,week',
          ).catch((e) => setError(`Could not save: ${e.message}`))
        }, 600),
      )
      return { ...prev, [key]: merged }
    })
  }, [])

  const setStatus = useCallback(
    async (dayId, wk, status) => {
      const key = statusKey(dayId, wk)
      const current = statuses[key] || {}
      const next = current.status === status ? null : status
      setStatuses((p) => ({ ...p, [key]: { ...current, status: next } }))
      try {
        await db.upsert(
          'session_status',
          { day_id: dayId, week: wk, status: next, is_benchmark: !!current.is_benchmark },
          'day_id,week',
        )
      } catch (e) {
        setError(`Could not save status: ${e.message}`)
      }
    },
    [statuses],
  )

  const toggleBenchmark = useCallback(
    async (dayId, wk) => {
      const key = statusKey(dayId, wk)
      const current = statuses[key] || {}
      const next = !current.is_benchmark
      setStatuses((p) => ({ ...p, [key]: { ...current, is_benchmark: next } }))
      try {
        await db.upsert(
          'session_status',
          { day_id: dayId, week: wk, status: current.status ?? null, is_benchmark: next },
          'day_id,week',
        )
      } catch (e) {
        setError(`Could not save benchmark: ${e.message}`)
      }
    },
    [statuses],
  )

  const addExercise = useCallback(
    async (dayId, data) => {
      const position = (day?.exercises.length ?? 0) + 1
      const movement = await db.ensureMovement(data.name)
      const ex = await db.insert('exercises', {
        day_id: dayId,
        movement_id: movement.id,
        name: movement.name,
        target_sets: data.sets,
        target_reps: data.reps,
        rest_seconds: data.rest,
        notes: data.notes,
        is_superset: data.ss,
        superset_group: data.ssGroup ?? null,
        position,
      })
      if (data.fields?.length) {
        await db.insert(
          'exercise_fields',
          data.fields.map((label, i) => ({ exercise_id: ex.id, label, position: i })),
        )
      }
      await load()
    },
    [day, load],
  )

  const editExercise = useCallback(
    async (exId, data) => {
      const movement = await db.ensureMovement(data.name)
      await db.update('exercises', exId, {
        movement_id: movement.id,
        name: movement.name,
        target_sets: data.sets,
        target_reps: data.reps,
        rest_seconds: data.rest,
        notes: data.notes,
        is_superset: data.ss,
        superset_group: data.ssGroup ?? null,
      })
      // Custom fields are small; replace wholesale rather than diffing.
      const existing = await db.from('exercise_fields').select('id').eq('exercise_id', exId)
      await Promise.all((existing.data || []).map((f) => db.remove('exercise_fields', f.id)))
      if (data.fields?.length) {
        await db.insert(
          'exercise_fields',
          data.fields.map((label, i) => ({ exercise_id: exId, label, position: i })),
        )
      }
      await load()
    },
    [load],
  )

  const deleteExercise = useCallback(
    async (exId) => {
      await db.remove('exercises', exId)
      await load()
    },
    [load],
  )

  /** Custom fields are few; replace them wholesale rather than diffing. */
  const syncFields = useCallback(async (exerciseId, labels = []) => {
    const existing = await db.from('exercise_fields').select('id,label').eq('exercise_id', exerciseId)
    const current = existing.data || []
    const wanted = labels.map((l) => l.trim()).filter(Boolean)

    if (current.length === wanted.length && current.every((f, i) => f.label === wanted[i])) return

    await Promise.all(current.map((f) => db.remove('exercise_fields', f.id)))
    if (wanted.length) {
      await db.insert(
        'exercise_fields',
        wanted.map((label, i) => ({ exercise_id: exerciseId, label, position: i })),
      )
    }
  }, [])

  /**
   * Create or update a whole program from the builder's draft.
   *
   * Rows already carrying an id are updated in place so their logs survive;
   * rows the draft dropped are deleted, which cascades to their logs. That is
   * the intended meaning of removing an exercise from a program, but it is why
   * the builder confirms before discarding anything with history behind it.
   */
  const saveProgram = useCallback(
    async (draft) => {
      const meta = {
        name: draft.name.trim(),
        description: draft.description?.trim() || '',
        weeks: draft.weeks,
      }
      const program = draft.id
        ? await db.update('programs', draft.id, meta)
        : await db.insert('programs', { ...meta, position: programs.length })

      const keptDayIds = []
      for (const [di, day] of draft.days.entries()) {
        const dayMeta = { name: day.name.trim() || `Day ${di + 1}`, focus: day.focus?.trim() || '', position: di }
        const dayRow = day.id
          ? await db.update('days', day.id, dayMeta)
          : await db.insert('days', { ...dayMeta, program_id: program.id })
        keptDayIds.push(dayRow.id)

        const keptExIds = []
        for (const [ei, ex] of day.exercises.entries()) {
          const movement = await db.ensureMovement(ex.name)
          const exMeta = {
            movement_id: movement.id,
            name: movement.name,
            target_sets: String(ex.sets),
            target_reps: ex.reps,
            rest_seconds: ex.rest,
            notes: ex.notes || '',
            is_superset: !!ex.ss,
            superset_group: ex.ss ? (ex.ssGroup ?? null) : null,
            position: ei,
          }
          const exRow = ex.id
            ? await db.update('exercises', ex.id, exMeta)
            : await db.insert('exercises', { ...exMeta, day_id: dayRow.id })
          keptExIds.push(exRow.id)
          await syncFields(exRow.id, ex.fields)
        }

        const existingEx = await db.from('exercises').select('id').eq('day_id', dayRow.id)
        for (const e of existingEx.data || []) {
          if (!keptExIds.includes(e.id)) await db.remove('exercises', e.id)
        }
      }

      const existingDays = await db.from('days').select('id').eq('program_id', program.id)
      for (const d of existingDays.data || []) {
        if (!keptDayIds.includes(d.id)) await db.remove('days', d.id)
      }

      await load()
      return program
    },
    [programs.length, load, syncFields],
  )

  const deleteProgram = useCallback(
    async (programId) => {
      await db.remove('programs', programId)
      if (view.progId === programId) patchView({ progId: null, dayIdx: 0, week: 1 })
      await load()
    },
    [load, view.progId, patchView],
  )

  return {
    loading,
    error,
    clearError: () => setError(null),
    reload: load,

    programs,
    program,
    day,
    dayIdx,
    week,
    setDayIdx: (i) => patchView({ dayIdx: i }),
    setWeek: (w) => patchView({ week: w }),
    setProgram: (id) => patchView({ progId: id, dayIdx: 0 }),

    logs,
    statuses,
    movements,
    getLog,
    statusFor,
    isBench,
    countForMovement,
    variationsForMovement,
    findMovementByName,
    lastLoggedFor,

    saveLog,
    setStatus,
    toggleBenchmark,
    addExercise,
    editExercise,
    deleteExercise,
    saveProgram,
    deleteProgram,

    userId,
    challenges,
    members,
    activeChallenge,
    challengeProgramIds,
    daysPerWeek,
    totalDays,
    linearDay,
    slotDate,
    stepDay,
    goToToday,
    buddyColumnsFor,
    buddyParticipants,
    leaveChallenge,
  }
}
