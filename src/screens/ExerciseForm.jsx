/* ExerciseForm.jsx — shared add/edit sheet body, with library autocomplete. */
import { useState } from 'react'
import { Toggle } from '../ui'
import { fmtRest } from '../lib/helpers'

const REST_CHIPS = [45, 60, 90, 120, 150, 180]
const FIELD_SUGGEST = ['Tempo', 'RPE', 'Distance', 'Pace', 'Heart rate', 'Incline']

/**
 * @param {Array<{id: string, label: string, members: string[]}>} supersetGroups
 *   Superset groups already present in the day being edited, so a new exercise
 *   can join one instead of every superset collapsing into an undifferentiated
 *   list with no visible boundaries.
 */
export default function ExerciseForm({
  store,
  initial,
  asSuperset,
  supersetGroups = [],
  onCancel,
  onSave,
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [sets, setSets] = useState(initial ? String(initial.target_sets) : '3')
  const [reps, setReps] = useState(initial?.target_reps ?? '8')
  const [rest, setRest] = useState(initial?.rest_seconds ?? 90)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [fields, setFields] = useState(initial?.fields?.map((f) => f.label) ?? [])
  const [ss, setSs] = useState(initial ? !!initial.is_superset : !!asSuperset)
  const [ssGroup, setSsGroup] = useState(initial?.superset_group ?? null)
  const [acOpen, setAcOpen] = useState(false)
  const [newField, setNewField] = useState('')
  const [busy, setBusy] = useState(false)

  const typed = name.trim()

  // Suggestions come from the movement catalog, so picking one guarantees the
  // new exercise attaches to the existing movement rather than starting a
  // second history under a near-identical name.
  const matches = typed
    ? store.movements
        .filter(
          (m) =>
            m.name.toLowerCase().includes(typed.toLowerCase()) &&
            m.name.toLowerCase() !== typed.toLowerCase(),
        )
        .slice(0, 6)
    : []

  const exactMatch = typed ? store.findMovementByName(typed) : null

  const toggleField = (f) =>
    setFields((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]))

  const addCustomField = () => {
    const v = newField.trim()
    if (v && !fields.includes(v)) {
      setFields([...fields, v])
      setNewField('')
    }
  }

  async function save() {
    if (!typed || busy) return
    setBusy(true)
    try {
      await onSave({
        name: typed,
        sets,
        reps,
        rest,
        notes: notes.trim(),
        ss,
        // A superset with no group of its own starts a new one.
        ssGroup: ss ? ssGroup || crypto.randomUUID() : null,
        fields,
      })
    } finally {
      setBusy(false)
    }
  }

  const matchCount = exactMatch ? store.countForMovement(exactMatch.id) : 0

  return (
    <>
      <div className="field ac">
        <label htmlFor="ex-name">Exercise name</label>
        <input
          id="ex-name"
          className="inp"
          value={name}
          placeholder="e.g. Weighted Pull-Ups"
          onChange={(e) => {
            setName(e.target.value)
            setAcOpen(true)
          }}
          onFocus={() => setAcOpen(true)}
        />
        {acOpen && matches.length > 0 && (
          <div className="ac-list">
            {matches.map((m) => {
              const n = store.countForMovement(m.id)
              return (
                <div
                  className="ac-item"
                  key={m.id}
                  onClick={() => {
                    setName(m.name)
                    setAcOpen(false)
                  }}
                >
                  <span>{m.name}</span>
                  {n > 0 && <span className="ac-hist">{n} logged</span>}
                </div>
              )
            })}
          </div>
        )}
        {exactMatch && (
          <div style={{ fontSize: 12, color: 'var(--acc-d)', fontWeight: 700, marginTop: 6 }}>
            {matchCount > 0
              ? `✓ Matches a saved workout — ${matchCount} logged session${matchCount === 1 ? '' : 's'} will carry over.`
              : '✓ Matches a saved workout — nothing logged under it yet.'}
          </div>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="ex-sets">Sets</label>
          <input
            id="ex-sets"
            className="inp"
            value={sets}
            inputMode="numeric"
            onChange={(e) => setSets(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ex-reps">Reps / time</label>
          <input
            id="ex-reps"
            className="inp"
            value={reps}
            placeholder="e.g. 8-10, 20s"
            onChange={(e) => setReps(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label>Rest between sets</label>
        <div className="chips">
          {REST_CHIPS.map((r) => (
            <button
              key={r}
              className={'chip' + (rest === r ? ' on' : '')}
              onClick={() => setRest(r)}
            >
              {fmtRest(r)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Extra fields to track each session</label>
        <div className="chips">
          {[...new Set([...FIELD_SUGGEST, ...fields])].map((f) => (
            <button
              key={f}
              className={'chip' + (fields.includes(f) ? ' on' : '')}
              onClick={() => toggleField(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            className="inp"
            value={newField}
            placeholder="Custom field…"
            onChange={(e) => setNewField(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomField()
              }
            }}
          />
          <button className="btn" onClick={addCustomField} style={{ flex: '0 0 auto' }}>
            Add
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ex-notes">Cue / note</label>
        <textarea
          id="ex-notes"
          className="inp"
          value={notes}
          placeholder="Form cue, setup, target…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="toggle-row">
        <span className="tr-lab">Part of a superset</span>
        <Toggle
          on={ss}
          onChange={(v) => {
            setSs(v)
            if (!v) setSsGroup(null)
          }}
        />
      </div>

      {ss && (
        <div className="field">
          <label>Which superset?</label>
          <div className="chips">
            {supersetGroups.map((g) => (
              <button
                key={g.id}
                className={'chip' + (ssGroup === g.id ? ' on' : '')}
                onClick={() => setSsGroup(g.id)}
              >
                {g.label}
                {g.members.length > 0 && (
                  <span style={{ opacity: 0.7, fontWeight: 500 }}> · {g.members.join(' + ')}</span>
                )}
              </button>
            ))}
            <button
              className={'chip' + (ssGroup === null ? ' on' : '')}
              onClick={() => setSsGroup(null)}
            >
              + New superset
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 7, lineHeight: 1.45 }}>
            Exercises in the same superset are performed back to back. They’re shown grouped on the
            Log screen.
          </div>
        </div>
      )}

      <div className="sheet-ft" style={{ padding: '12px 0 4px' }}>
        <button className="btn ghost grow" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn acc grow" onClick={save} disabled={!typed || busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Add to day'}
        </button>
      </div>
    </>
  )
}
