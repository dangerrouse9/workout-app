/* log.jsx — Log screen: day pills, week nav, status, exercise cards, add/edit form */
const { useState } = React;

const REST_CHIPS = [45, 60, 90, 120, 150, 180];
const FIELD_SUGGEST = ["Tempo", "RPE", "Distance", "Pace", "Heart rate", "Incline"];

// dismissible discoverability hint for the long-press history gesture
function LpHint() {
  const [show, setShow] = useState(() => {
    try { return localStorage.getItem("wt_hint_lp") !== "1"; } catch (e) { return true; }
  });
  if (!show) return null;
  return (
    <div className="lp-hint">
      <Icon n="history" s={16} />
      <span>Tip: <b>press &amp; hold</b> any workout to see its full history &amp; trend.</span>
      <button onClick={() => { try { localStorage.setItem("wt_hint_lp", "1"); } catch (e) {} setShow(false); }}><Icon n="x" s={15} /></button>
    </div>
  );
}

// nearest previous week (< wk) that has a real log for this exercise
function prevLogged(S, exId, wk) {
  for (let w = wk - 1; w >= 1; w--) {
    const l = WT.getLog(S, exId, w);
    if (l && (l.sets || l.reps || l.weight || l.note)) return { week: w, log: l };
  }
  return null;
}

function ExerciseCard({ S, ex, week, update, onMenu, onHistory, startTimer, startStopwatch }) {
  const lp = useLongPress(() => onMenu(ex));
  const log = WT.getLog(S, ex.id, week) || WT.emptyLog();
  const ref = prevLogged(S, ex.id, week);
  const rest = WT.restFor(S, ex);

  const commit = (field, val) => update(St => {
    const k = WT.logKey(ex.id, week);
    if (!St.logs[k]) St.logs[k] = WT.emptyLog();
    St.logs[k][field] = val;
  });
  const commitCustom = (label, val) => update(St => {
    const k = WT.logKey(ex.id, week);
    if (!St.logs[k]) St.logs[k] = WT.emptyLog();
    if (!St.logs[k].custom) St.logs[k].custom = {};
    St.logs[k].custom[label] = val;
  });
  const variations = WT.variationsForName(S, ex.name);

  // trend chip: current logged load vs reference load
  let trend = null;
  if (ref) {
    const a = WT.parseNum(log.weight), b = WT.parseNum(ref.log.weight);
    if (a !== null && b !== null && a !== b) trend = a > b ? "up" : "same";
  }
  const refSkip = ref && WT.isSkipped(ref.log);

  return (
    <div className={"exc" + (ex.ss ? " ss" : "")}>
      {ex.ss && <div className="ss-tag"><Icon n="link" s={12} /> Superset</div>}
      <div className="exc-head" {...lp} style={{ cursor: "pointer" }}>
        <div className="exc-titles">
          <div className="exc-name">{ex.name}</div>
          <div className="exc-meta">
            <span className="tag plan">{ex.sets}×{ex.reps}</span>
            <span className="tag rest" onClick={(e) => { e.stopPropagation(); startTimer(rest, ex.name); }}>
              <Icon n="clock" s={12} /> {WT.fmtRest(rest)}
            </span>
          </div>
          {ex.notes && <div className="exc-note">{ex.notes}</div>}
        </div>
        <button className="more-btn" onClick={(e) => { e.stopPropagation(); onMenu(ex); }}><Icon n="dots" s={20} /></button>
      </div>

      {/* last-week reference */}
      {ref ? (
        <div className="lastwk" onClick={() => onHistory(ex.name)}>
          <div className="lw-icn"><Icon n="history" s={15} /></div>
          <div className="lw-body">
            <div className="lw-k">Last logged · Week {ref.week}</div>
            {refSkip
              ? <div className="lw-v skip">Skipped</div>
              : <div className="lw-v">{ref.log.sets}×{ref.log.reps}{ref.log.weight ? <span className="em"> @ {ref.log.weight}</span> : ""}{ref.log.variation ? <span className="lw-var">{ref.log.variation}</span> : ""}</div>}
            {ref.log.note && <div className="lw-note">{ref.log.note}</div>}
          </div>
          {trend === "up" && <span className="lw-trend up">↑ up</span>}
        </div>
      ) : (
        <div className="lastwk">
          <div className="lw-icn"><Icon n="history" s={15} /></div>
          <div className="lw-body"><div className="lw-v" style={{ color: "var(--tx3)", fontWeight: 600 }}>No prior data — first time logging</div></div>
        </div>
      )}

      {/* this-week inputs */}
      <div className="inwrap">
        <div className="in-grid">
          <label className="in-cell"><span className="in-k">Sets</span>
            <input className="in-f" defaultValue={log.sets} placeholder={ex.sets} inputMode="numeric"
              onBlur={e => commit("sets", e.target.value)} /></label>
          <label className="in-cell"><span className="in-k">Reps</span>
            <input className="in-f" defaultValue={log.reps === "—" ? "" : log.reps} placeholder={ex.reps}
              onBlur={e => commit("reps", e.target.value)} /></label>
          <label className="in-cell"><span className="in-k">Weight</span>
            <input className="in-f" defaultValue={log.weight} placeholder="—"
              onBlur={e => commit("weight", e.target.value)} /></label>
        </div>
        {ex.fields && ex.fields.length > 0 && (
          <div className="cust-grid">
            {ex.fields.map(f => (
              <label className="in-cell" key={f.label}><span className="in-k">{f.label}</span>
                <input className="in-f" defaultValue={(log.custom && log.custom[f.label]) || ""} placeholder="—"
                  onBlur={e => commitCustom(f.label, e.target.value)} /></label>
            ))}
          </div>
        )}
        <input className="var-f" list={"vars-" + ex.id} defaultValue={log.variation || ""}
          placeholder="+ Variation this session — e.g. 2s eccentric, top hold (optional)"
          onBlur={e => commit("variation", e.target.value)} />
        {variations.length > 0 && (
          <datalist id={"vars-" + ex.id}>{variations.map(v => <option key={v} value={v} />)}</datalist>
        )}
        <textarea className="note-f" defaultValue={log.note} placeholder="How did it feel? Notes for next time…"
          onBlur={e => commit("note", e.target.value)} />
        <div className="go-row">
          <button className="rest-go" onClick={() => startTimer(rest, ex.name)}>
            <Icon n="play" s={13} /> Start {WT.fmtRest(rest)} rest
          </button>
          {WT.isTimed(ex) && (
            <button className="hold-go" onClick={() => startStopwatch(ex.name, ex.id, week)}>
              <Icon n="clock" s={14} /> Time hold
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUSES = [
  { k: "complete", lab: "Complete" },
  { k: "partial", lab: "Partial" },
  { k: "skipped", lab: "Skipped" },
];

function LogScreen({ S, update, onMenu, onHistory, startTimer, startStopwatch, onAdd }) {
  const prog = S.programs[S.activeProg];
  const day = prog.days[S.activeDay];
  const week = S.activeWeek;
  const maxWeek = prog.weeks;
  const status = WT.statusFor(S, day.id, week);
  const bench = WT.isBench(S, day.id, week);

  const setStatus = (k) => update(St => {
    const key = day.id + "_w" + week;
    St.statuses[key] = St.statuses[key] === k ? "" : k;
  });
  const toggleBench = () => update(St => {
    if (!St.benchmarks) St.benchmarks = {};
    const key = day.id + "_w" + week;
    if (St.benchmarks[key]) delete St.benchmarks[key]; else St.benchmarks[key] = true;
  });

  return (
    <React.Fragment>
      <div className="daybar">
        {prog.days.map((d, i) => (
          <button key={d.id} className={"pill" + (i === S.activeDay ? " on" : "")}
            onClick={() => update(St => { St.activeDay = i; })}>
            {WT.dayPill(d)}
          </button>
        ))}
      </div>

      <div className="weeknav">
        <button className="wk-arrow" disabled={week <= 1} onClick={() => update(St => { St.activeWeek = Math.max(1, week - 1); })}><Icon n="chevL" s={20} /></button>
        <div className="wk-center">
          <div className="wk-label">Week {week} <span className="wk-sub" style={{ display: "inline" }}>of {maxWeek}</span></div>
          <div className="wk-sub">{WT.daySub(day) || WT.dayPill(day)}</div>
        </div>
        <button className="wk-arrow" disabled={week >= maxWeek} onClick={() => update(St => { St.activeWeek = Math.min(maxWeek, week + 1); })}><Icon n="chevR" s={20} /></button>
      </div>

      <div className="statusbar">
        {STATUSES.map(s => (
          <button key={s.k} className={"st-seg " + s.k + (status === s.k ? " on" : "")} onClick={() => setStatus(s.k)}>
            <span className="dot" /> {s.lab}
          </button>
        ))}
      </div>

      <div className="benchrow">
        <button className={"bench-tg" + (bench ? " on" : "")} onClick={toggleBench}>
          <Icon n="flag" s={15} /> {bench ? "Benchmark / test session" : "Mark as benchmark / test session"}
        </button>
      </div>

      <div className="scroll">
        {day.exercises.length === 0 && (
          <div className="empty-state">No exercises in this day yet.<br />Tap below to add your first one.</div>
        )}
        {day.exercises.length > 0 && <LpHint />}
        {day.exercises.map(ex => (
          <ExerciseCard key={ex.id + "_w" + week} S={S} ex={ex} week={week}
            update={update} onMenu={onMenu} onHistory={onHistory} startTimer={startTimer} startStopwatch={startStopwatch} />
        ))}
        <div className="add-row">
          <button className="add-btn" onClick={() => onAdd(false)}><Icon n="plus" s={18} /> Add exercise</button>
          <button className="add-btn" onClick={() => onAdd(true)} style={{ flex: "0 0 auto", paddingLeft: 16, paddingRight: 16 }}><Icon n="link" s={18} /> Superset</button>
        </div>
      </div>
    </React.Fragment>
  );
}

// ── shared add/edit form ───────────────────────────────
function ExerciseForm({ S, initial, asSuperset, onCancel, onSave }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [sets, setSets] = useState(initial ? String(initial.sets) : "3");
  const [reps, setReps] = useState(initial ? initial.reps : "8");
  const [rest, setRest] = useState(initial ? initial.rest : 90);
  const [notes, setNotes] = useState(initial ? initial.notes : "");
  const [fields, setFields] = useState(initial && initial.fields ? initial.fields.map(f => f.label) : []);
  const [ss, setSs] = useState(initial ? !!initial.ss : !!asSuperset);
  const [acOpen, setAcOpen] = useState(false);
  const [newField, setNewField] = useState("");

  const lib = WT.libraryNames(S);
  const matches = name.trim()
    ? lib.filter(n => n.toLowerCase().includes(name.trim().toLowerCase()) && n.toLowerCase() !== name.trim().toLowerCase()).slice(0, 6)
    : [];

  const toggleField = (f) => setFields(fs => fs.includes(f) ? fs.filter(x => x !== f) : [...fs, f]);
  const addCustomField = () => { const v = newField.trim(); if (v && !fields.includes(v)) { setFields([...fields, v]); setNewField(""); } };

  const save = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(), sets, reps, rest,
      notes: notes.trim(), ss,
      fields: fields.map(l => ({ label: l }))
    });
  };

  const hasHist = (n) => WT.historyForName(S, n).length;

  return (
    <React.Fragment>
      <div className="field ac">
        <label>Exercise name</label>
        <input className="inp" value={name} placeholder="e.g. Weighted Pull-Ups"
          onChange={e => { setName(e.target.value); setAcOpen(true); }}
          onFocus={() => setAcOpen(true)} />
        {acOpen && matches.length > 0 && (
          <div className="ac-list">
            {matches.map(m => (
              <div className="ac-item" key={m} onClick={() => { setName(m); setAcOpen(false); }}>
                <span>{m}</span>
                {hasHist(m) > 0 && <span className="ac-hist">{hasHist(m)} logged</span>}
              </div>
            ))}
          </div>
        )}
        {name.trim() && hasHist(name) > 0 && (
          <div style={{ fontSize: 12, color: "var(--acc-d)", fontWeight: 700, marginTop: 6 }}>
            ✓ Matches a saved workout — its history will carry over.
          </div>
        )}
      </div>

      <div className="field-row">
        <div className="field"><label>Sets</label><input className="inp" value={sets} inputMode="numeric" onChange={e => setSets(e.target.value)} /></div>
        <div className="field"><label>Reps / time</label><input className="inp" value={reps} onChange={e => setReps(e.target.value)} placeholder="e.g. 8-10, 20s" /></div>
      </div>

      <div className="field">
        <label>Rest between sets</label>
        <div className="chips">
          {REST_CHIPS.map(r => (
            <button key={r} className={"chip" + (rest === r ? " on" : "")} onClick={() => setRest(r)}>{WT.fmtRest(r)}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Extra fields to track each session</label>
        <div className="chips">
          {[...new Set([...FIELD_SUGGEST, ...fields])].map(f => (
            <button key={f} className={"chip" + (fields.includes(f) ? " on" : "")} onClick={() => toggleField(f)}>{f}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input className="inp" value={newField} placeholder="Custom field…" onChange={e => setNewField(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addCustomField(); }} />
          <button className="btn" onClick={addCustomField} style={{ flex: "0 0 auto" }}>Add</button>
        </div>
      </div>

      <div className="field"><label>Cue / note</label>
        <textarea className="inp" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Form cue, setup, target…" /></div>

      <div className="toggle-row">
        <span className="tr-lab">Part of a superset</span>
        <Toggle on={ss} onChange={setSs} />
      </div>

      <div className="sheet-ft" style={{ padding: "12px 0 4px" }}>
        <button className="btn ghost grow" onClick={onCancel}>Cancel</button>
        <button className="btn acc grow" onClick={save}>{initial ? "Save changes" : "Add to day"}</button>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { LogScreen, ExerciseForm });
