/* program.jsx — programs list + full-screen program builder */
const { useState } = React;


function ProgramsScreen({ S, update, onEdit, onNew, onExport, onReset }) {
  return (
    <div className="scroll" style={{ paddingTop: 8 }}>
      <button className="btn acc" style={{ width: "100%", padding: 15, marginBottom: 6 }} onClick={onNew}>
        <Icon n="plus" s={18} /> Create new program
      </button>
      <div style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", margin: "16px 2px 8px" }}>
        Your programs
      </div>
      {S.programs.map((p, i) => {
        const exCount = p.days.reduce((a, d) => a + d.exercises.length, 0);
        return (
          <div key={p.id} className="exc" style={{ marginTop: 0, marginBottom: 11, padding: "14px 15px" }}
            onClick={() => update(St => { St.activeProg = i; St.activeDay = 0; St.activeWeek = Math.min(p.weeks, St.activeWeek); })}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div className="exc-name">{p.name}</div>
                  {i === S.activeProg && <span className="tag plan" style={{ flexShrink: 0 }}>Active</span>}
                </div>
                {p.desc && <div className="exc-note" style={{ marginTop: 5 }}>{p.desc}</div>}
                <div className="exc-meta" style={{ marginTop: 8 }}>
                  <span className="tag">{p.weeks} weeks</span>
                  <span className="tag">{p.days.length} days</span>
                  <span className="tag">{exCount} exercises</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn grow" onClick={(e) => { e.stopPropagation(); onEdit(i); }}><Icon n="edit" s={16} /> Edit</button>
              <button className="btn grow" onClick={(e) => { e.stopPropagation(); onExport(i); }} style={{ background: "var(--amb-bg)", color: "var(--amb-tx)", boxShadow: "none" }}><Icon n="book" s={16} /> Export</button>
              {S.programs.length > 1 && (
                <button className="btn dan" style={{ flex: "0 0 auto" }} onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this program and its history?")) update(St => {
                    St.programs.splice(i, 1);
                    if (St.activeProg >= St.programs.length) St.activeProg = St.programs.length - 1;
                    St.activeDay = 0;
                  });
                }}><Icon n="trash" s={16} /></button>
              )}
            </div>
          </div>
        );
      })}
      <button className="btn ghost" style={{ width: "100%", marginTop: 4 }} onClick={onReset}>Reset demo data</button>
    </div>
  );
}

// full-screen builder
function ProgramBuilder({ S, initial, onClose, onCommit }) {
  const blank = () => ({ id: WT.genId(), name: "", desc: "", weeks: 8, loggedWeeks: 0, days: [{ id: WT.genId(), name: "Day 1", exercises: [] }] });
  const [draft, setDraft] = useState(() => initial ? JSON.parse(JSON.stringify(initial)) : blank());
  const [addTo, setAddTo] = useState(null);    // day index for add-exercise sheet
  const [editEx, setEditEx] = useState(null);   // {di, ei}

  const upd = (fn) => setDraft(d => { const c = JSON.parse(JSON.stringify(d)); fn(c); return c; });

  const addDay = () => upd(d => d.days.push({ id: WT.genId(), name: "Day " + (d.days.length + 1), exercises: [] }));
  const removeDay = (i) => upd(d => { d.days.splice(i, 1); });

  const saveExercise = (di, data, ei) => {
    upd(d => {
      if (ei != null) Object.assign(d.days[di].exercises[ei], data);
      else d.days[di].exercises.push(Object.assign({ id: WT.genId(), ssGroup: data.ss ? Date.now() : null }, data));
    });
    setAddTo(null); setEditEx(null);
  };

  const commit = () => {
    if (!draft.name.trim()) { alert("Give your program a name."); return; }
    onCommit(draft);
  };

  const editingInitial = editEx ? draft.days[editEx.di].exercises[editEx.ei] : null;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 25, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div className="hdr" style={{ paddingBottom: 8 }}>
        <div className="hdr-top">
          <div className="hdr-prog">
            <span className="hdr-kick">{initial ? "Edit program" : "New program"}</span>
            <span className="hdr-name" style={{ maxWidth: 280 }}>{draft.name || "Untitled program"}</span>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon n="x" s={20} /></button>
        </div>
      </div>

      <div className="scroll" style={{ paddingTop: 6 }}>
        <div className="field"><label>Program name</label>
          <input className="inp" value={draft.name} placeholder="e.g. Winter Strength Block" onChange={e => upd(d => { d.name = e.target.value; })} /></div>
        <div className="field"><label>Goal / description</label>
          <textarea className="inp" value={draft.desc} placeholder="What are you training for?" onChange={e => upd(d => { d.desc = e.target.value; })} /></div>
        <div className="field" style={{ maxWidth: 150 }}><label>Length (weeks)</label>
          <input className="inp" value={draft.weeks} inputMode="numeric" onChange={e => upd(d => { d.weeks = Math.max(1, Math.min(52, parseInt(e.target.value) || 1)); })} /></div>

        <div style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", margin: "14px 2px 4px" }}>Days &amp; exercises</div>

        {draft.days.map((day, di) => (
          <div key={day.id} className="exc" style={{ marginTop: 11, padding: "12px 13px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input className="inp" value={day.name} onChange={e => upd(d => { d.days[di].name = e.target.value; })} style={{ fontWeight: 700 }} placeholder="Day name" />
              {draft.days.length > 1 && <button className="more-btn" onClick={() => removeDay(di)}><Icon n="trash" s={18} /></button>}
            </div>
            <input className="inp" value={day.label || ""} onChange={e => upd(d => { d.days[di].label = e.target.value; })}
              placeholder="Focus (optional) — e.g. Pull, Push, Legs" style={{ marginBottom: 10, fontSize: 14 }} />
            {day.exercises.map((ex, ei) => (
              <div key={ex.id} className="editex">
                <div className="editex-top">
                  <span className="editex-name">{ex.ss ? "↳ " : ""}{ex.name}</span>
                  <button className="more-btn" onClick={() => setEditEx({ di, ei })}><Icon n="edit" s={16} /></button>
                  <button className="more-btn" onClick={() => upd(d => { d.days[di].exercises.splice(ei, 1); })}><Icon n="trash" s={16} /></button>
                </div>
                <div style={{ fontSize: 12, color: "var(--tx2)", marginTop: 3 }}>{ex.sets}×{ex.reps} · rest {WT.fmtRest(ex.rest)}</div>
              </div>
            ))}
            <button className="add-btn" style={{ padding: 11, marginTop: 4 }} onClick={() => setAddTo(di)}><Icon n="plus" s={16} /> Add exercise</button>
          </div>
        ))}

        <button className="btn" style={{ width: "100%", marginTop: 12 }} onClick={addDay}><Icon n="plus" s={16} /> Add another day</button>
        <button className="btn acc" style={{ width: "100%", marginTop: 10, padding: 15 }} onClick={commit}>
          <Icon n="check" s={18} /> {initial ? "Save program" : "Create program"}
        </button>
        <div style={{ height: 20 }} />
      </div>

      <Sheet open={addTo != null} onClose={() => setAddTo(null)} title="Add exercise">
        {addTo != null && <ExerciseForm S={S} initial={null} asSuperset={false}
          onCancel={() => setAddTo(null)} onSave={(data) => saveExercise(addTo, data)} />}
      </Sheet>
      <Sheet open={!!editEx} onClose={() => setEditEx(null)} title="Edit exercise">
        {editEx && <ExerciseForm S={S} initial={editingInitial} asSuperset={false}
          onCancel={() => setEditEx(null)} onSave={(data) => saveExercise(editEx.di, data, editEx.ei)} />}
      </Sheet>
    </div>
  );
}

Object.assign(window, { ProgramsScreen, ProgramBuilder });
