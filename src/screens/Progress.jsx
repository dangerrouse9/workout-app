/* Progress.jsx — the all-weeks matrix for the active program's selected day.
   One horizontally scrolling strip per exercise is the whole point: it's how
   you compare a movement week over week to pick the next load. */
import { Icon } from '../ui'
import { dayPill, isSkipped } from '../lib/helpers'

export default function ProgressScreen({ store, onHistory, onJump }) {
  const { program, day, week } = store
  if (!program || !day) return null

  const weeks = Array.from({ length: program.weeks }, (_, i) => i + 1)

  return (
    <>
      <div className="daybar">
        {program.days.map((d, i) => (
          <button
            key={d.id}
            className={'pill' + (i === store.dayIdx ? ' on' : '')}
            onClick={() => store.setDayIdx(i)}
          >
            {dayPill(d)}
          </button>
        ))}
      </div>

      <div style={{ padding: '10px 18px 0', fontSize: 12, color: 'var(--tx2)', fontWeight: 600 }}>
        {day.name} · swipe each row to see every week →
      </div>

      <div className="scroll">
        {day.exercises.length === 0 && (
          <div className="empty-state">Nothing in this day to chart yet.</div>
        )}

        {day.exercises.map((ex) => (
          <div key={ex.id} className={'pg-ex' + (ex.is_superset ? ' ss' : '')}>
            <div className="pg-name" onClick={() => onHistory(ex)}>
              {ex.name}
            </div>
            <div className="pg-plan">
              target {ex.target_sets}×{ex.target_reps}
              {ex.is_superset ? ' · superset' : ''}
            </div>

            <div className="pg-strip">
              {weeks.map((w) => {
                const log = store.getLog(ex.id, w)
                const skip = isSkipped(log)
                const has = !!log && !!(log.sets || log.reps || log.weight)
                const cls = [
                  'pg-cell',
                  w === week && 'cur',
                  skip && 'skip',
                  !has && !skip && 'empty',
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <div key={w} className={cls} onClick={() => onJump(w)}>
                    <div className="pg-wk">
                      Week {w}
                      {store.isBench(day.id, w) ? ' ★' : ''}
                    </div>
                    {skip ? (
                      <div className="pg-skip">Skipped</div>
                    ) : has ? (
                      <>
                        <div className="pg-big">
                          {log.sets}×{log.reps}
                        </div>
                        {log.weight && <div className="pg-wt">{log.weight}</div>}
                      </>
                    ) : (
                      <div className="pg-em">—</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <div className="lp-hint" style={{ marginTop: 14 }}>
          <Icon n="history" s={16} />
          <span>Tap an exercise name for its full history, or a week to jump there.</span>
        </div>
        <div style={{ height: 10 }} />
      </div>
    </>
  )
}
