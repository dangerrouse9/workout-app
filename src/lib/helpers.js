/* Pure helpers ported from the prototype's store.js. No persistence concerns —
   these operate on plain values so they behave identically against Supabase rows. */

export function fmtRest(s) {
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? (r > 0 ? `${m}m ${r}s` : `${m}m`) : `${s}s`
}

/** Does this exercise track a duration/hold? (reps like "20s", "15-20s", "25s each") */
export function isTimed(ex) {
  return /\d\s*-?\s*\d*\s*s(ec)?(\b|\s|$)/i.test(ex?.target_reps || '')
}

/** The prototype encoded a skipped session as sets "0" or reps "—". */
export function isSkipped(log) {
  return !!log && (log.sets === '0' || log.reps === '—')
}

/** Pull a number out of a freeform weight/rep string for trend plotting. */
export function parseNum(str) {
  if (!str) return null
  const m = String(str).match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

export function norm(name) {
  return (name || '').trim().toLowerCase()
}

/** A log row counts as "has data" if any of these carry content. */
export function hasData(log) {
  return !!log && !!(log.sets || log.reps || log.weight || log.note)
}

/** Today as YYYY-MM-DD in the device's own timezone, not UTC. */
export function todayISO() {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

/**
 * The calendar date a slot falls on, given the program's start date.
 *
 * A week is always seven calendar days, whatever the training week contains.
 * Counting by days-per-week instead would compress "3 days a week for 2 weeks"
 * into six consecutive dates, so week 2 would start the day after week 1.
 */
export function dateForSlot(startsOn, week, dayIndex) {
  if (!startsOn) return null
  const d = new Date(`${startsOn}T00:00:00`)
  d.setDate(d.getDate() + (week - 1) * 7 + dayIndex)
  return d
}

/** "Tue 23 Sep" — short enough for a card, unambiguous enough to trust. */
export function formatShortDate(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(`${date}T00:00:00`) : date
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function isToday(date) {
  if (!date) return false
  const d = typeof date === 'string' ? date : date.toISOString?.().slice(0, 10)
  return d === todayISO()
}

/**
 * The distinct supersets within one day, labelled A, B, C in the order they
 * appear. Accepts both stored rows (is_superset / superset_group) and builder
 * draft rows (ss / ssGroup).
 */
export function supersetGroupsFor(exercises = []) {
  const groups = new Map()
  let i = 0
  for (const ex of exercises) {
    const flagged = ex.is_superset ?? ex.ss
    const groupId = ex.superset_group ?? ex.ssGroup
    if (!flagged || !groupId) continue
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        letter: String.fromCharCode(65 + i++),
        label: `Superset ${String.fromCharCode(64 + i)}`,
        members: [],
      })
    }
    groups.get(groupId).members.push(ex.name)
  }
  return [...groups.values()]
}

/** Day display helpers: pill shows the short name, sub shows the focus label. */
export function dayPill(day) {
  const n = day?.name || ''
  if (n.includes('–')) return n.split('–')[0].trim()
  if (n.includes(' - ')) return n.split(' - ')[0].trim()
  return n
}

export function daySub(day) {
  if (day?.focus) return day.focus
  const n = day?.name || ''
  if (n.includes('–')) return n.split('–').slice(1).join('–').trim()
  if (n.includes(' - ')) return n.split(' - ').slice(1).join(' - ').trim()
  return ''
}

/**
 * Build a Claude-ready prompt from a program's full logged history.
 * Ported from buildExport in the prototype; `logs` is keyed `${exerciseId}_w${week}`
 * and `statuses` is keyed `${dayId}_w${week}` -> { status, is_benchmark }.
 */
export function buildExport(program, logs, statuses) {
  const weeks = program.weeks
  let txt = `Build me a new training block based on my program "${program.name}".\n\n`
  txt += `Goal: ${program.description || 'Not specified'}\n`
  txt += `Structure: ${program.weeks} weeks, ${program.days.length} days/week.\n\n`
  txt += `=== FULL SESSION HISTORY ===\n`

  let any = false
  for (let w = 1; w <= weeks; w++) {
    program.days.forEach((day) => {
      let lines = ''
      day.exercises.forEach((ex) => {
        const l = logs[`${ex.id}_w${w}`]
        if (!hasData(l)) return
        if (isSkipped(l)) {
          lines += `  - ${ex.name}: skipped${l.note ? ' (' + l.note + ')' : ''}\n`
        } else {
          const extra = l.custom
            ? Object.entries(l.custom)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k} ${v}`)
                .join(', ')
            : ''
          lines +=
            `  - ${ex.name}${l.variation ? ' [' + l.variation + ']' : ''}: ` +
            `${l.sets}×${l.reps}${l.weight ? ' @ ' + l.weight : ''}` +
            `${extra ? ' {' + extra + '}' : ''}${l.note ? ' — ' + l.note : ''}\n`
        }
      })
      if (lines) {
        any = true
        const st = statuses[`${day.id}_w${w}`] || {}
        txt +=
          `\nWeek ${w} — ${day.name}` +
          `${st.status ? ' [' + st.status.toUpperCase() + ']' : ''}` +
          `${st.is_benchmark ? ' ★[BENCHMARK / TEST SESSION]' : ''}\n${lines}`
      }
    })
  }
  if (!any) txt += `\n(No sessions logged yet.)\n`

  txt += `\n=== END HISTORY ===\n\n`
  txt +=
    `Using this history — note where I progressed, stalled, or skipped, and treat any ★ benchmark/test ` +
    `sessions as max-effort measurements — design my next ${program.weeks}-week block. Keep the same day ` +
    `structure unless a change is clearly warranted, and prescribe specific starting weights and rep ` +
    `targets based on where I ended.`
  return txt
}
