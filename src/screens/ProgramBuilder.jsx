/* ProgramBuilder.jsx — full-screen create/edit.
   Edits a local draft and commits once, so a half-built program never reaches
   the database. Rows carrying an id already exist; rows without one are new. */
import { useState } from 'react'
import { Icon, Sheet, NumField } from '../ui'
import { fmtRest, supersetGroupsFor } from '../lib/helpers'
import { useConfirm } from '../lib/useConfirm'
import ExerciseForm from './ExerciseForm'

/** Flatten a stored program into the shape the builder edits. */
function toDraft(program) {
  if (!program) {
    return { name: '', description: '', weeks: 8, days: [{ name: 'Day 1', focus: '', exercises: [] }] }
  }
  return {
    id: program.id,
    name: program.name,
    description: program.description || '',
    weeks: program.weeks,
    days: program.days.map((d) => ({
      id: d.id,
      name: d.name,
      focus: d.focus || '',
      exercises: d.exercises.map((ex) => ({
        id: ex.id,
        name: ex.name,
        sets: ex.target_sets,
        reps: ex.target_reps,
        rest: ex.rest_seconds,
        notes: ex.notes || '',
        ss: ex.is_superset,
        ssGroup: ex.superset_group,
        fields: (ex.fields || []).map((f) => f.label),
      })),
    })),
  }
}

export default function ProgramBuilder({ store, program, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => toDraft(program))
  const [addTo, setAddTo] = useState(null) // day index
  const [editAt, setEditAt] = useState(null) // { di, ei }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmUI, confirm] = useConfirm()

  const upd = (fn) =>
    setDraft((d) => {
      const c = structuredClone(d)
      fn(c)
      return c
    })

  const addDay = () =>
    upd((d) => d.days.push({ name: `Day ${d.days.length + 1}`, focus: '', exercises: [] }))

  /** Exercises with an id may already have logs; deleting them cascades. */
  const removeExercise = async (di, ei) => {
    const ex = draft.days[di].exercises[ei]
    if (ex.id) {
      const ok = await confirm(
        `Remove ${ex.name}? Any sessions logged against it are deleted when you save.`,
        { title: 'Remove exercise', confirmLabel: 'Remove' },
      )
      if (!ok) return
    }
    upd((d) => d.days[di].exercises.splice(ei, 1))
  }

  const removeDay = async (di) => {
    const day = draft.days[di]
    if (day.id && day.exercises.some((e) => e.id)) {
      const ok = await confirm(
        `Remove ${day.name || 'this day'} and everything logged against it?`,
        { title: 'Remove day', confirmLabel: 'Remove' },
      )
      if (!ok) return
    }
    upd((d) => d.days.splice(di, 1))
  }

  const saveExercise = (di, data, ei) => {
    upd((d) => {
      const target = d.days[di]
      if (ei != null) Object.assign(target.exercises[ei], data)
      else target.exercises.push(data)
    })
    setAddTo(null)
    setEditAt(null)
  }

  async function commit() {
    if (!draft.name.trim()) {
      setErr('Give your program a name.')
      return
    }
    if (!draft.days.length) {
      setErr('A program needs at least one day.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const saved = await store.saveProgram(draft)
      onSaved(saved)
    } catch (e) {
      setErr(e.message || String(e))
      setBusy(false)
    }
  }

  const editing = editAt ? draft.days[editAt.di].exercises[editAt.ei] : null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 25,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="hdr" style={{ paddingBottom: 8 }}>
        <div className="hdr-top">
          <div className="hdr-prog">
            <span className="hdr-kick">{program ? 'Edit program' : 'New program'}</span>
            <span className="hdr-name" style={{ maxWidth: 280 }}>
              {draft.name || 'Untitled program'}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <Icon n="x" s={20} />
          </button>
        </div>
      </div>

      <div className="scroll" style={{ paddingTop: 6 }}>
        {err && <div className="auth-err">{err}</div>}

        <div className="field">
          <label htmlFor="pb-name">Program name</label>
          <input
            id="pb-name"
            className="inp"
            value={draft.name}
            placeholder="e.g. Winter Strength Block"
            onChange={(e) => upd((d) => (d.name = e.target.value))}
          />
        </div>

        <div className="field">
          <label htmlFor="pb-desc">Goal / description</label>
          <textarea
            id="pb-desc"
            className="inp"
            value={draft.description}
            placeholder="What are you training for?"
            onChange={(e) => upd((d) => (d.description = e.target.value))}
          />
        </div>

        <NumField
          id="pb-weeks"
          label="Length (weeks)"
          value={draft.weeks}
          onChange={(n) => upd((d) => (d.weeks = n))}
          min={1}
          max={52}
          style={{ maxWidth: 150 }}
        />

        <div className="kicker">Days &amp; exercises</div>

        {draft.days.map((day, di) => (
          <div key={day.id || `new-day-${di}`} className="exc" style={{ marginTop: 11, padding: '12px 13px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                className="inp"
                value={day.name}
                placeholder="Day name"
                style={{ fontWeight: 700 }}
                onChange={(e) => upd((d) => (d.days[di].name = e.target.value))}
              />
              {draft.days.length > 1 && (
                <button className="more-btn" onClick={() => removeDay(di)}>
                  <Icon n="trash" s={18} />
                </button>
              )}
            </div>

            <input
              className="inp"
              value={day.focus}
              placeholder="Focus (optional) — e.g. Pull, Push, Legs"
              style={{ marginBottom: 10, fontSize: 14 }}
              onChange={(e) => upd((d) => (d.days[di].focus = e.target.value))}
            />

            {day.exercises.map((ex, ei) => (
              <div key={ex.id || `new-ex-${ei}`} className="editex">
                <div className="editex-top">
                  <span className="editex-name">
                    {ex.ss ? '↳ ' : ''}
                    {ex.name}
                    {ex.ss && ex.ssGroup && (
                      <span className="lw-var" style={{ marginLeft: 6 }}>
                        {supersetGroupsFor(day.exercises).find((g) => g.id === ex.ssGroup)?.label}
                      </span>
                    )}
                  </span>
                  <button className="more-btn" onClick={() => setEditAt({ di, ei })}>
                    <Icon n="edit" s={16} />
                  </button>
                  <button className="more-btn" onClick={() => removeExercise(di, ei)}>
                    <Icon n="trash" s={16} />
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 3 }}>
                  {ex.sets}×{ex.reps} · rest {fmtRest(ex.rest)}
                </div>
              </div>
            ))}

            <button className="add-btn" style={{ padding: 11, marginTop: 4 }} onClick={() => setAddTo(di)}>
              <Icon n="plus" s={16} /> Add exercise
            </button>
          </div>
        ))}

        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={addDay}>
          <Icon n="plus" s={16} /> Add another day
        </button>

        <button
          className="btn acc"
          style={{ width: '100%', marginTop: 10, padding: 15 }}
          onClick={commit}
          disabled={busy}
        >
          <Icon n="check" s={18} /> {busy ? 'Saving…' : program ? 'Save program' : 'Create program'}
        </button>
        <div style={{ height: 20 }} />
      </div>

      {confirmUI}

      <Sheet open={addTo != null} onClose={() => setAddTo(null)} title="Add exercise">
        {addTo != null && (
          <ExerciseForm
            store={store}
            initial={null}
            asSuperset={false}
            supersetGroups={supersetGroupsFor(draft.days[addTo]?.exercises)}
            onCancel={() => setAddTo(null)}
            onSave={(data) => saveExercise(addTo, data)}
          />
        )}
      </Sheet>

      <Sheet open={!!editAt} onClose={() => setEditAt(null)} title="Edit exercise">
        {editing && (
          <ExerciseForm
            store={store}
            initial={{
              name: editing.name,
              target_sets: editing.sets,
              target_reps: editing.reps,
              rest_seconds: editing.rest,
              notes: editing.notes,
              is_superset: editing.ss,
              superset_group: editing.ssGroup,
              fields: editing.fields.map((label) => ({ label })),
            }}
            asSuperset={false}
            supersetGroups={supersetGroupsFor(draft.days[editAt.di]?.exercises)}
            onCancel={() => setEditAt(null)}
            onSave={(data) => saveExercise(editAt.di, data, editAt.ei)}
          />
        )}
      </Sheet>
    </div>
  )
}
