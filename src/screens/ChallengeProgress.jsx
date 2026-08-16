/* ChallengeProgress.jsx — the whole challenge on one screen.
   One row per day, one column per person. A week-by-day grid is the wrong
   shape for something like "run a mile for thirty days"; what you want is a
   single list where the gaps are obvious. */
import { formatShortDate, isToday, isSkipped, todayISO } from '../lib/helpers'

/** Compact result for one person on one day. */
function summarise(logs, exerciseCount) {
  const live = logs.filter((l) => l && (l.sets || l.reps || l.weight || l.note))
  if (!live.length) return { text: '—', tone: 'none' }

  if (live.every(isSkipped)) return { text: 'Skipped', tone: 'skip' }

  if (exerciseCount === 1) {
    const l = live[0]
    if (isSkipped(l)) return { text: 'Skipped', tone: 'skip' }
    const perf = [l.sets, l.reps].filter(Boolean).join('×')
    return { text: perf + (l.weight ? ` · ${l.weight}` : ''), tone: 'done' }
  }

  const done = live.filter((l) => !isSkipped(l)).length
  return {
    text: `${done} of ${exerciseCount}`,
    tone: done === exerciseCount ? 'done' : 'partial',
  }
}

export default function ChallengeProgress({ store, onJump }) {
  const { program, activeChallenge } = store
  if (!program || !activeChallenge) return null

  const people = [{ user_id: store.userId, label: 'You' }, ...store.buddyParticipants]
  const today = todayISO()

  // Build every day of the challenge in one flat list.
  const rows = Array.from({ length: store.totalDays }, (_, i) => {
    const week = Math.floor(i / store.daysPerWeek) + 1
    const dayIdx = i % store.daysPerWeek
    const day = program.days[dayIdx]
    const exercises = day?.exercises || []
    const date = store.slotDate(week, dayIdx)
    const iso = date ? date.toISOString().slice(0, 10) : null

    const results = people.map((p) =>
        p.user_id === store.userId
          ? summarise(
              exercises.map((ex) => store.getLog(ex.id, week)),
              exercises.length,
            )
          : summarise(
              exercises.map(
                (ex) =>
                  store.buddyColumnsFor(ex, week, dayIdx).find((c) => c.user_id === p.user_id)
                    ?.log || null,
              ),
              exercises.length,
            ),
    )

    return {
      n: i + 1,
      week,
      dayIdx,
      date,
      // A day someone logged early isn't pending, whatever the calendar says.
      future: (iso ? iso > today : false) && results.every((r) => r.tone === 'none'),
      isToday: isToday(date),
      results,
    }
  })

  const totals = people.map(
    (_, pi) => rows.filter((r) => r.results[pi].tone === 'done').length,
  )

  return (
    <div className="scroll" style={{ paddingTop: 4 }}>
      <div className="chal-totals">
        {people.map((p, pi) => (
          <div className="chal-total" key={p.user_id}>
            <div className="chal-total-n">
              {totals[pi]}
              <span className="chal-total-of"> / {store.totalDays}</span>
            </div>
            <div className="chal-total-who">{p.label}</div>
          </div>
        ))}
      </div>

      <div className="chal-head">
        <div className="chal-day" />
        <div className="chal-people">
          {people.map((p) => (
            <div className="chal-person chal-who" key={p.user_id}>
              {p.label}
            </div>
          ))}
        </div>
      </div>

      {rows.map((r) => (
        <button
          key={r.n}
          className={
            'chal-row' + (r.isToday ? ' today' : '') + (r.future ? ' future' : '')
          }
          onClick={() => onJump(r.week, r.dayIdx)}
        >
          <div className="chal-day">
            <div className="chal-day-n">Day {r.n}</div>
            <div className="chal-day-d">
              {r.isToday ? 'Today' : formatShortDate(r.date) || `Wk ${r.week}`}
            </div>
          </div>
          <div className="chal-people">
            {r.results.map((res, pi) => (
              <div className="chal-person" key={people[pi].user_id}>
                <div className={'chal-val ' + res.tone}>{res.text}</div>
              </div>
            ))}
          </div>
        </button>
      ))}

      <div style={{ height: 16 }} />
    </div>
  )
}
