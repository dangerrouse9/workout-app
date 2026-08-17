/* ChallengeSheets.jsx — create a challenge, or join one with a code.
   A challenge is always its own program: same movements on every day, repeated
   for N weeks. That covers "run a mile every day for a month" without dragging
   the full program builder into it. */
import { useState } from 'react'
import { Icon, Sheet } from '../ui'
import { createChallenge, joinChallenge } from '../lib/challenges'
import { todayISO, formatShortDate } from '../lib/helpers'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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
      <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 6, lineHeight: 1.45 }}>
        This labels your column for everyone else. Only people in this challenge see it.
      </div>
    </div>
  )
}

/** Numeric field that tolerates being empty while you type. */
function NumField({ id, label, value, onChange, min, max }) {
  const [text, setText] = useState(String(value))
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="inp"
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, '')
          setText(raw)
          const n = parseInt(raw, 10)
          if (n >= min && n <= max) onChange(n)
        }}
        onBlur={() => {
          const n = Math.max(min, Math.min(max, parseInt(text, 10) || min))
          setText(String(n))
          onChange(n)
        }}
      />
    </div>
  )
}

export function CreateChallengeSheet({ open, onClose, programCount, email, onCreated }) {
  const [name, setName] = useState('')
  const [weeks, setWeeks] = useState(4)
  const [daysPerWeek, setDaysPerWeek] = useState(7)
  const [moves, setMoves] = useState([{ name: '', target: '' }])
  const [who, setWho] = useState(() => nameFromEmail(email))
  const [startsOn, setStartsOn] = useState(todayISO)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const setMove = (i, patch) =>
    setMoves((m) => m.map((x, j) => (i === j ? { ...x, ...patch } : x)))

  async function submit() {
    const named = moves.filter((m) => m.name.trim())
    if (!name.trim()) return setErr('Give the challenge a name.')
    if (!named.length) return setErr('Add at least one movement.')

    setBusy(true)
    setErr('')
    try {
      const days = Array.from({ length: daysPerWeek }, (_, i) => ({
        name: daysPerWeek === 7 ? DAY_NAMES[i] : `Day ${i + 1}`,
        focus: '',
        exercises: named.map((m) => ({
          name: m.name.trim(),
          target_sets: '1',
          target_reps: m.target.trim() || '1',
          rest_seconds: 0,
          notes: '',
          is_superset: false,
        })),
      }))
      const result = await createChallenge({ name, weeks, days, startsOn }, programCount, who)
      onCreated(result)
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

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
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 6, lineHeight: 1.45 }}>
          Day 1 is {formatShortDate(startsOn) || 'this date'}. Everyone who joins gets the same
          start, whenever they sign up.
        </div>
      </div>

      <div className="field-row">
        <NumField id="ch-weeks" label="Weeks" value={weeks} onChange={setWeeks} min={1} max={52} />
        <NumField
          id="ch-days"
          label="Days per week"
          value={daysPerWeek}
          onChange={setDaysPerWeek}
          min={1}
          max={7}
        />
      </div>

      <div className="field">
        <label>What are you doing each day?</label>
        {moves.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              className="inp"
              value={m.name}
              placeholder="e.g. Run a mile"
              onChange={(e) => setMove(i, { name: e.target.value })}
            />
            <input
              className="inp"
              style={{ flex: '0 0 96px' }}
              value={m.target}
              placeholder="target"
              onChange={(e) => setMove(i, { target: e.target.value })}
            />
            {moves.length > 1 && (
              <button
                className="more-btn"
                onClick={() => setMoves((ms) => ms.filter((_, j) => j !== i))}
              >
                <Icon n="trash" s={16} />
              </button>
            )}
          </div>
        ))}
        <button
          className="add-btn"
          style={{ padding: 11 }}
          onClick={() => setMoves((m) => [...m, { name: '', target: '' }])}
        >
          <Icon n="plus" s={16} /> Add another
        </button>
      </div>

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
