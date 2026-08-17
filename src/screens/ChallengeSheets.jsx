/* ChallengeSheets.jsx — create a challenge, or join one with a code.
   A challenge is always its own program. Two shapes: the same movements every
   day (a mile a day), or a different session per day (a shared training block).
   Either way the rules are the same — fixed once created, one invite code,
   everyone keeps a private copy. */
import { useState } from 'react'
import { Icon, Sheet, Toggle, NumField } from '../ui'
import { createChallenge, joinChallenge } from '../lib/challenges'
import { todayISO, formatShortDate } from '../lib/helpers'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const blankMove = () => ({ name: '', target: '' })
const defaultDayName = (i, perWeek) => (perWeek === 7 ? DAY_NAMES[i] : `Day ${i + 1}`)

/** A reasonable first guess at what someone wants to be called. */
function nameFromEmail(email = '') {
  const local = email.split('@')[0].split(/[._\d-]/).filter(Boolean)[0] || ''
  return local ? local[0].toUpperCase() + local.slice(1) : ''
}

function NameField({ value, onChange }) {
  return (
    <div className="field">
      <label htmlFor="ch-who">Your name in this challenge</label>
      <input
        id="ch-who"
        className="inp"
        value={value}
        placeholder="e.g. Alex"
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="field-hint">
        This labels your column for everyone else. Only people in this challenge see it.
      </div>
    </div>
  )
}

/** The movement rows shared by both modes. */
function MoveList({ moves, onChange }) {
  const set = (i, patch) => onChange(moves.map((m, j) => (i === j ? { ...m, ...patch } : m)))
  return (
    <>
      {moves.map((m, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            className="inp"
            value={m.name}
            placeholder="e.g. Run a mile"
            onChange={(e) => set(i, { name: e.target.value })}
          />
          <input
            className="inp"
            style={{ flex: '0 0 92px' }}
            value={m.target}
            placeholder="target"
            onChange={(e) => set(i, { target: e.target.value })}
          />
          {moves.length > 1 && (
            <button
              className="more-btn"
              onClick={() => onChange(moves.filter((_, j) => j !== i))}
            >
              <Icon n="trash" s={16} />
            </button>
          )}
        </div>
      ))}
      <button
        className="add-btn"
        style={{ padding: 10, fontSize: 13 }}
        onClick={() => onChange([...moves, blankMove()])}
      >
        <Icon n="plus" s={15} /> Add another
      </button>
    </>
  )
}

export function CreateChallengeSheet({ open, onClose, programCount, email, onCreated }) {
  const [name, setName] = useState('')
  const [weeks, setWeeks] = useState(4)
  const [daysPerWeek, setDaysPerWeek] = useState(7)
  const [runDays, setRunDays] = useState(30)
  const [sameEveryDay, setSameEveryDay] = useState(true)
  const [moves, setMoves] = useState([blankMove()])
  const [dayPlans, setDayPlans] = useState([])
  const [who, setWho] = useState(() => nameFromEmail(email))
  const [startsOn, setStartsOn] = useState(todayISO)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /** Grow or trim the per-day list to match, keeping whatever's already typed. */
  const plansFor = (count, previous) =>
    Array.from({ length: count }, (_, i) =>
      previous[i] || { name: defaultDayName(i, count), moves: [blankMove()] },
    )

  function changeDays(n) {
    setDaysPerWeek(n)
    setDayPlans((prev) => (prev.length ? plansFor(n, prev) : prev))
  }

  function switchMode(perDay) {
    setSameEveryDay(!perDay)
    // Seed each day from what's already typed, so switching loses nothing.
    if (perDay && !dayPlans.length) {
      setDayPlans(
        Array.from({ length: daysPerWeek }, (_, i) => ({
          name: defaultDayName(i, daysPerWeek),
          moves: moves.map((m) => ({ ...m })),
        })),
      )
    }
  }

  const setDayPlan = (i, patch) =>
    setDayPlans((prev) => prev.map((d, j) => (i === j ? { ...d, ...patch } : d)))

  function buildDays() {
    const toExercises = (list) =>
      list
        .filter((m) => m.name.trim())
        .map((m) => ({
          name: m.name.trim(),
          target_sets: '1',
          target_reps: m.target.trim() || '1',
          rest_seconds: 0,
          notes: '',
          is_superset: false,
        }))

    if (sameEveryDay) {
      // A straight run is one cycle of N days, so "15 days" means fifteen —
      // not "3 weeks", which would round it up to twenty-one.
      const exercises = toExercises(moves)
      return Array.from({ length: runDays }, (_, i) => ({
        name: `Day ${i + 1}`,
        focus: '',
        exercises,
      }))
    }

    return plansFor(daysPerWeek, dayPlans).map((d, i) => ({
      name: d.name.trim() || defaultDayName(i, daysPerWeek),
      focus: '',
      exercises: toExercises(d.moves),
    }))
  }

  async function submit() {
    if (!name.trim()) return setErr('Give the challenge a name.')

    const days = buildDays()
    const total = days.reduce((n, d) => n + d.exercises.length, 0)
    if (!total) return setErr('Add at least one movement.')

    const empty = days.filter((d) => !d.exercises.length)
    if (empty.length) {
      return setErr(
        `${empty.map((d) => d.name).join(', ')} ${empty.length === 1 ? 'has' : 'have'} no movements.`,
      )
    }

    setBusy(true)
    setErr('')
    try {
      const lengthWeeks = sameEveryDay ? 1 : weeks
      onCreated(
        await createChallenge({ name, weeks: lengthWeeks, days, startsOn }, programCount, who),
      )
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const plans = sameEveryDay ? [] : plansFor(daysPerWeek, dayPlans)

  return (
    <Sheet open={open} onClose={onClose} title="Create a challenge">
      <div className="sep-note">
        A challenge is its own program, separate from your training. Whoever joins gets their own
        private copy — you’ll each log your own numbers and see each other’s side by side.
      </div>

      {err && <div className="auth-err">{err}</div>}

      <div className="field">
        <label htmlFor="ch-name">Challenge name</label>
        <input
          id="ch-name"
          className="inp"
          value={name}
          placeholder="e.g. Mile a day"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <NameField value={who} onChange={setWho} />

      <div className="field">
        <label htmlFor="ch-start">Starts on</label>
        <input
          id="ch-start"
          className="inp"
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value || todayISO())}
        />
        <div className="field-hint">
          Day 1 is {formatShortDate(startsOn) || 'this date'}. Everyone who joins gets the same
          start, whenever they sign up.
        </div>
      </div>

      <div className="toggle-row">
        <span className="tr-lab">Different session each day</span>
        <Toggle on={!sameEveryDay} onChange={switchMode} />
      </div>
      <div className="field-hint" style={{ marginTop: -4, marginBottom: 14 }}>
        {sameEveryDay
          ? 'Every day is the same — right for “a mile a day”.'
          : 'Each day gets its own movements — right for a shared training block.'}
      </div>

      {sameEveryDay ? (
        <>
          <NumField
            id="ch-run"
            label="How many days?"
            value={runDays}
            onChange={setRunDays}
            min={1}
            max={365}
          />
          <div className="field-hint" style={{ marginTop: -8, marginBottom: 14 }}>
            {runDays} days in a row, ending{' '}
            {formatShortDate(
              new Date(new Date(`${startsOn}T00:00:00`).getTime() + (runDays - 1) * 86400000),
            )}
            .
          </div>
        </>
      ) : (
        <div className="field-row">
          <NumField id="ch-weeks" label="Weeks" value={weeks} onChange={setWeeks} min={1} max={52} />
          <NumField
            id="ch-days"
            label="Days per week"
            value={daysPerWeek}
            onChange={changeDays}
            min={1}
            max={7}
          />
        </div>
      )}

      {sameEveryDay ? (
        <div className="field">
          <label>What are you doing each day?</label>
          <MoveList moves={moves} onChange={setMoves} />
        </div>
      ) : (
        plans.map((d, i) => (
          <div key={i} className="daycard">
            <input
              className="inp"
              value={d.name}
              placeholder={defaultDayName(i, daysPerWeek)}
              style={{ fontWeight: 700, marginBottom: 9 }}
              onChange={(e) => setDayPlan(i, { name: e.target.value })}
            />
            <MoveList moves={d.moves} onChange={(moves) => setDayPlan(i, { moves })} />
          </div>
        ))
      )}

      <div className="sheet-ft" style={{ padding: '12px 0 4px' }}>
        <button className="btn ghost grow" onClick={onClose}>
          Cancel
        </button>
        <button className="btn acc grow" onClick={submit} disabled={busy}>
          {busy ? 'Creating…' : 'Create & get code'}
        </button>
      </div>
    </Sheet>
  )
}

export function JoinChallengeSheet({ open, onClose, programCount, email, onJoined }) {
  const [code, setCode] = useState('')
  const [who, setWho] = useState(() => nameFromEmail(email))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!code.trim()) return setErr('Enter the code your friend sent you.')
    setBusy(true)
    setErr('')
    try {
      onJoined(await joinChallenge(code, programCount, who))
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Join a challenge">
      <div className="sep-note">
        You’ll get your own copy of the challenge to log against. Your other programs stay private —
        only this challenge is shared.
      </div>

      {err && <div className="auth-err">{err}</div>}

      <div className="field">
        <label htmlFor="ch-code">Invite code</label>
        <input
          id="ch-code"
          className="inp"
          value={code}
          placeholder="e.g. K7M2QP"
          autoCapitalize="characters"
          autoCorrect="off"
          style={{ textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </div>

      <NameField value={who} onChange={setWho} />

      <div className="sheet-ft" style={{ padding: '12px 0 4px' }}>
        <button className="btn ghost grow" onClick={onClose}>
          Cancel
        </button>
        <button className="btn acc grow" onClick={submit} disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </div>
    </Sheet>
  )
}
