/* Log.jsx — the default screen: day pills, week nav, status, exercise cards.
   In a challenge the whole day becomes a swipeable pane per person, so a
   buddy's session reads exactly like your own instead of being squeezed into
   the corner of your input row. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../ui'
import { useLongPress } from '../lib/useLongPress'
import {
  fmtRest,
  isTimed,
  isSkipped,
  parseNum,
  dayPill,
  daySub,
  formatShortDate,
  isToday,
} from '../lib/helpers'

const STATUSES = [
  { k: 'complete', lab: 'Complete' },
  { k: 'partial', lab: 'Partial' },
  { k: 'skipped', lab: 'Skipped' },
]

/** Dismissible discoverability hint for the long-press gesture. UI-only, so localStorage. */
function LpHint() {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem('wt_hint_lp') !== '1'
    } catch {
      return true
    }
  })
  if (!show) return null
  return (
    <div className="lp-hint">
      <Icon n="history" s={16} />
      <span>
        Tip: <b>press &amp; hold</b> any workout to see its full history &amp; trend.
      </span>
      <button
        onClick={() => {
          try {
            localStorage.setItem('wt_hint_lp', '1')
          } catch {
            /* ignore */
          }
          setShow(false)
        }}
      >
        <Icon n="x" s={15} />
      </button>
    </div>
  )
}

function SupersetTag({ group }) {
  return (
    <div className="ss-tag">
      <Icon n="link" s={12} />
      {group ? `Superset ${group.letter} · ${group.index} of ${group.size}` : 'Superset'}
    </div>
  )
}

function ExerciseCard({ store, ex, week, group, isChallenge, onMenu, onHistory, startTimer, startStopwatch }) {
  const lp = useLongPress(() => onMenu(ex))
  const log = store.getLog(ex.id, week) || {}
  const ref = store.lastLoggedFor(ex, week)
  const rest = ex.rest_seconds ?? 90
  const variations = store.variationsForMovement(ex.movement_id)

  const commit = (field, val) => store.saveLog(ex.id, week, { [field]: val })
  const commitCustom = (label, val) =>
    store.saveLog(ex.id, week, { custom: { ...(log.custom || {}), [label]: val } })

  // Trend chip: this week's load against the reference week's.
  let trend = null
  if (ref) {
    const a = parseNum(log.weight)
    const b = parseNum(ref.log.weight)
    if (a !== null && b !== null && a !== b) trend = a > b ? 'up' : 'same'
  }
  const refSkip = ref && isSkipped(ref.log)

  return (
    <div
      className={'exc' + (ex.is_superset ? ' ss' : '')}
      style={group?.continues ? { marginTop: 4 } : undefined}
    >
      {ex.is_superset && <SupersetTag group={group} />}

      <div className="exc-head" {...lp} style={{ cursor: 'pointer' }}>
        <div className="exc-titles">
          <div className="exc-name">{ex.name}</div>
          <div className="exc-meta">
            <span className="tag plan">
              {ex.target_sets}×{ex.target_reps}
            </span>
            {rest > 0 && (
              <span
                className="tag rest"
                onClick={(e) => {
                  e.stopPropagation()
                  startTimer(rest, ex.name)
                }}
              >
                <Icon n="clock" s={12} /> {fmtRest(rest)}
              </span>
            )}
          </div>
          {ex.notes && <div className="exc-note">{ex.notes}</div>}
        </div>
        <button
          className="more-btn"
          onClick={(e) => {
            e.stopPropagation()
            onMenu(ex)
          }}
        >
          <Icon n="dots" s={20} />
        </button>
      </div>

      {!isChallenge &&
        (ref ? (
          <div className="lastwk" onClick={() => onHistory(ex)}>
            <div className="lw-icn">
              <Icon n="history" s={15} />
            </div>
            <div className="lw-body">
              <div className="lw-k">
                Last logged ·{' '}
                {ref.program.id !== store.program?.id && `${ref.program.name} · `}
                Week {ref.week}
              </div>
              {refSkip ? (
                <div className="lw-v skip">Skipped</div>
              ) : (
                <div className="lw-v">
                  {ref.log.sets}×{ref.log.reps}
                  {ref.log.weight && <span className="em"> @ {ref.log.weight}</span>}
                  {ref.log.variation && <span className="lw-var">{ref.log.variation}</span>}
                </div>
              )}
              {ref.log.note && <div className="lw-note">{ref.log.note}</div>}
            </div>
            {trend === 'up' && <span className="lw-trend up">↑ up</span>}
          </div>
        ) : (
          <div className="lastwk">
            <div className="lw-icn">
              <Icon n="history" s={15} />
            </div>
            <div className="lw-body">
              <div className="lw-v" style={{ color: 'var(--tx3)', fontWeight: 600 }}>
                No prior data — first time logging
              </div>
            </div>
          </div>
        ))}

      <div className="inwrap">
        <div className="in-grid">
          <label className="in-cell">
            <span className="in-k">Sets</span>
            <input
              className="in-f"
              defaultValue={log.sets || ''}
              placeholder={ex.target_sets}
              inputMode="numeric"
              onBlur={(e) => commit('sets', e.target.value)}
            />
          </label>
          <label className="in-cell">
            <span className="in-k">Reps</span>
            <input
              className="in-f"
              defaultValue={log.reps === '—' ? '' : log.reps || ''}
              placeholder={ex.target_reps}
              onBlur={(e) => commit('reps', e.target.value)}
            />
          </label>
          <label className="in-cell">
            <span className="in-k">Weight</span>
            <input
              className="in-f"
              defaultValue={log.weight || ''}
              placeholder="—"
              onBlur={(e) => commit('weight', e.target.value)}
            />
          </label>
        </div>

        {ex.fields?.length > 0 && (
          <div className="cust-grid">
            {ex.fields.map((f) => (
              <label className="in-cell" key={f.id || f.label}>
                <span className="in-k">{f.label}</span>
                <input
                  className="in-f"
                  defaultValue={log.custom?.[f.label] || ''}
                  placeholder="—"
                  onBlur={(e) => commitCustom(f.label, e.target.value)}
                />
              </label>
            ))}
          </div>
        )}

        <input
          className="var-f"
          list={`vars-${ex.id}`}
          defaultValue={log.variation || ''}
          placeholder="+ Variation this session — e.g. 2s eccentric, top hold (optional)"
          onBlur={(e) => commit('variation', e.target.value)}
        />
        {variations.length > 0 && (
          <datalist id={`vars-${ex.id}`}>
            {variations.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        )}

        <textarea
          className="note-f"
          defaultValue={log.note || ''}
          placeholder="How did it feel? Notes for next time…"
          onBlur={(e) => commit('note', e.target.value)}
        />

        {(log.logged_on || isChallenge) && (
          <div className={'logdate' + (log.logged_on && isToday(log.logged_on) ? ' today' : '')}>
            {log.logged_on
              ? `Logged ${isToday(log.logged_on) ? 'today' : formatShortDate(log.logged_on)}`
              : ''}
          </div>
        )}

        {(rest > 0 || isTimed(ex)) && (
          <div className="go-row">
            {rest > 0 && (
              <button className="rest-go" onClick={() => startTimer(rest, ex.name)}>
                <Icon n="play" s={13} /> Start {fmtRest(rest)} rest
              </button>
            )}
            {isTimed(ex) && (
              <button className="hold-go" onClick={() => startStopwatch(ex.name, ex.id, week)}>
                <Icon n="clock" s={14} /> Time hold
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** A buddy's card: identical layout, nothing editable, no timers. */
function BuddyCard({ ex, log, group }) {
  const reservesTimerRow = isTimed(ex)
  const skipped = isSkipped(log)
  return (
    <div
      className={'exc' + (ex.is_superset ? ' ss' : '')}
      style={group?.continues ? { marginTop: 4 } : undefined}
    >
      {ex.is_superset && <SupersetTag group={group} />}

      <div className="exc-head">
        <div className="exc-titles">
          <div className="exc-name">{ex.name}</div>
          <div className="exc-meta">
            <span className="tag plan">
              {ex.target_sets}×{ex.target_reps}
            </span>
          </div>
        </div>
      </div>

      <div className="inwrap">
        <div className="in-grid">
          <div className="ro">
            <span className="ro-k">Sets</span>
            <div className="ro-v">{skipped ? '—' : log?.sets || '—'}</div>
          </div>
          <div className="ro">
            <span className="ro-k">Reps</span>
            <div className="ro-v">{skipped ? '—' : log?.reps || '—'}</div>
          </div>
          <div className="ro">
            <span className="ro-k">Weight</span>
            <div className="ro-v">{skipped ? '—' : log?.weight || '—'}</div>
          </div>
        </div>

        {/* Mirrors the variation input and note textarea opposite, so the two
            cards are the same height and their rows read straight across. */}
        <div className="ro-var">{log?.variation || ''}</div>
        <div className="ro-note">{skipped ? 'Skipped' : log?.note || ''}</div>

        <div className={'logdate' + (log?.logged_on && isToday(log.logged_on) ? ' today' : '')}>
          {log?.logged_on
            ? `Logged ${isToday(log.logged_on) ? 'today' : formatShortDate(log.logged_on)}`
            : ''}
        </div>

        {reservesTimerRow && <div className="ro-gorow" />}
      </div>
    </div>
  )
}

export default function LogScreen({ store, onMenu, onHistory, startTimer, startStopwatch, onAdd }) {
  const { program, day, week } = store

  // Keep the panes vertically in step. Without this, scrolling to your fifth
  // exercise and swiping across lands at the top of the buddy's pane, which
  // throws away the row alignment the moment you actually need it.
  const panesRef = useRef(null)
  const syncing = useRef(false)

  const onPaneScroll = useCallback((e) => {
    if (syncing.current) return
    syncing.current = true
    const top = e.target.scrollTop
    for (const p of panesRef.current?.querySelectorAll('.pane') || []) {
      if (p !== e.target && Math.abs(p.scrollTop - top) > 1) p.scrollTop = top
    }
    requestAnimationFrame(() => {
      syncing.current = false
    })
  }, [])

  // Re-align when the day changes, so both panes start from the same place.
  useEffect(() => {
    for (const p of panesRef.current?.querySelectorAll('.pane') || []) p.scrollTop = 0
  }, [week, store.dayIdx])

  if (!program || !day) return null

  const isChallenge = !!store.activeChallenge
  const status = store.statusFor(day.id, week)
  const bench = store.isBench(day.id, week)
  const slotDate = store.slotDate()

  // A challenge whose days are all the same names them Mon–Sun or Day 1–N,
  // which the date already tells you. A custom name means the day is its own
  // session and is worth showing.
  const GENERIC_DAY = /^(mon|tue|wed|thu|fri|sat|sun|day\s*\d+)$/i
  const namedDay = isChallenge && !GENERIC_DAY.test((day.name || '').trim()) ? day.name.trim() : ''

  // Per-card superset metadata: which lettered group, position within it, and
  // whether it follows straight on from the card above — which is what makes
  // the boundary between two adjacent supersets visible. Exercises flagged as
  // supersets but carrying no group fall back to runs of consecutive cards.
  const keys = []
  day.exercises.forEach((ex, i) => {
    if (!ex.is_superset) return keys.push(null)
    if (ex.superset_group) return keys.push(ex.superset_group)
    const prev = day.exercises[i - 1]
    keys.push(prev?.is_superset && !prev.superset_group ? keys[i - 1] : `run:${i}`)
  })

  const letters = new Map()
  for (const k of keys) {
    if (k && !letters.has(k)) letters.set(k, String.fromCharCode(65 + letters.size))
  }

  const groupMeta = day.exercises.map((ex, i) => {
    const key = keys[i]
    if (!key) return null
    const members = keys.reduce((acc, k, j) => (k === key ? [...acc, j] : acc), [])
    return {
      letter: letters.get(key),
      index: members.indexOf(i) + 1,
      size: members.length,
      continues: keys[i - 1] === key,
    }
  })

  const participants = store.buddyParticipants

  const myCards = (
    <>
      {day.exercises.length === 0 && (
        <div className="empty-state">
          No exercises in this day yet.
          <br />
          Tap below to add your first one.
        </div>
      )}
      {day.exercises.length > 0 && !isChallenge && <LpHint />}

      {day.exercises.map((ex, i) => (
        <ExerciseCard
          key={`${ex.id}_w${week}`}
          store={store}
          ex={ex}
          week={week}
          group={groupMeta[i]}
          isChallenge={isChallenge}
          onMenu={onMenu}
          onHistory={onHistory}
          startTimer={startTimer}
          startStopwatch={startStopwatch}
        />
      ))}

      {!isChallenge && (
        <div className="add-row">
          <button className="add-btn" onClick={() => onAdd(false)}>
            <Icon n="plus" s={18} /> Add exercise
          </button>
          <button
            className="add-btn"
            onClick={() => onAdd(true)}
            style={{ flex: '0 0 auto', paddingLeft: 16, paddingRight: 16 }}
          >
            <Icon n="link" s={18} /> Superset
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      {!isChallenge && (
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
      )}

      <div className="weeknav">
        <button
          className="wk-arrow"
          disabled={isChallenge ? store.linearDay <= 1 : week <= 1}
          onClick={() => (isChallenge ? store.stepDay(-1) : store.setWeek(Math.max(1, week - 1)))}
        >
          <Icon n="chevL" s={20} />
        </button>
        <div className="wk-center">
          {isChallenge ? (
            <>
              <div className="wk-label">
                Day {store.linearDay}{' '}
                <span className="wk-sub" style={{ display: 'inline' }}>
                  of {store.totalDays}
                </span>
              </div>
              <div className={'wk-sub' + (isToday(slotDate) ? ' wk-cur' : '')}>
                {[namedDay, isToday(slotDate) ? 'Today' : formatShortDate(slotDate)]
                  .filter(Boolean)
                  .join(' · ') || dayPill(day)}
              </div>
            </>
          ) : (
            <>
              <div className="wk-label">
                Week {week}{' '}
                <span className="wk-sub" style={{ display: 'inline' }}>
                  of {program.weeks}
                </span>
              </div>
              <div className="wk-sub">{daySub(day) || dayPill(day)}</div>
            </>
          )}
        </div>
        <button
          className="wk-arrow"
          disabled={isChallenge ? store.linearDay >= store.totalDays : week >= program.weeks}
          onClick={() =>
            isChallenge ? store.stepDay(1) : store.setWeek(Math.min(program.weeks, week + 1))
          }
        >
          <Icon n="chevR" s={20} />
        </button>
      </div>

      {!isChallenge && (
        <>
          <div className="statusbar">
            {STATUSES.map((s) => (
              <button
                key={s.k}
                className={'st-seg ' + s.k + (status === s.k ? ' on' : '')}
                onClick={() => store.setStatus(day.id, week, s.k)}
              >
                <span className="dot" /> {s.lab}
              </button>
            ))}
          </div>

          <div className="benchrow">
            <button
              className={'bench-tg' + (bench ? ' on' : '')}
              onClick={() => store.toggleBenchmark(day.id, week)}
            >
              <Icon n="flag" s={15} />{' '}
              {bench ? 'Benchmark / test session' : 'Mark as benchmark / test session'}
            </button>
          </div>
        </>
      )}

      {participants.length === 0 ? (
        <div className="scroll">{myCards}</div>
      ) : (
        <div className="panes multi" ref={panesRef}>
          <div className="pane" onScroll={onPaneScroll}>
            <div className="pane-who">
              <span className="dot" /> You
            </div>
            {myCards}
          </div>

          {participants.map((p) => (
            <div className="pane buddy" key={p.user_id} onScroll={onPaneScroll}>
              <div className="pane-who">
                <span className="dot" /> {p.label}
              </div>
              {day.exercises.map((ex, i) => (
                <BuddyCard
                  key={`${p.user_id}_${ex.id}`}
                  ex={ex}
                  group={groupMeta[i]}
                  log={
                    store.buddyColumnsFor(ex, week).find((c) => c.user_id === p.user_id)?.log || null
                  }
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
