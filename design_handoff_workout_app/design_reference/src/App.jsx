/* App.jsx — root: state, header, rest timer, tabs, overlays */
const { useState, useEffect, useRef, useCallback } = React;


function RestTimer({ t, onAdd, onStop, onReset, onLog }) {
  if (!t.on) return null;
  if (t.mode === "up") {
    const m = Math.floor(t.elapsed / 60), s = t.elapsed % 60;
    return (
      <div style={{ paddingTop: 8 }}>
        <div className="timer up">
          <div className="timer-body">
            <div className="timer-name">HOLD · {t.name}</div>
            <div className="timer-dig">{m}:{String(s).padStart(2, "0")}</div>
          </div>
          <div className="timer-btns">
            <button className="tbtn" onClick={onReset}>Reset</button>
            {t.exId && <button className="tbtn done" onClick={() => onLog(t.elapsed)}>Log {t.elapsed}s</button>}
            <button className="tbtn done" onClick={onStop}>Stop</button>
          </div>
        </div>
      </div>
    );
  }
  const pct = t.total > 0 ? Math.round(t.rem / t.total * 100) : 0;
  const m = Math.floor(t.rem / 60), s = t.rem % 60;
  return (
    <div style={{ paddingTop: 8 }}>
      <div className="timer">
        <div className="timer-fill" style={{ width: pct + "%" }} />
        <div className="timer-body">
          <div className="timer-name">REST · {t.name}</div>
          <div className="timer-dig">{m}:{String(s).padStart(2, "0")}</div>
        </div>
        <div className="timer-btns">
          <button className="tbtn" onClick={() => onAdd(15)}>+15</button>
          <button className="tbtn" onClick={() => onAdd(-15)}>−15</button>
          <button className="tbtn done" onClick={onStop}>Done</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [S, setS] = useState(() => { const st = WT.loadState(); window.__state = st; return st; });
  const [tab, setTab] = useState("log");
  const [menuEx, setMenuEx] = useState(null);
  const [historyName, setHistoryName] = useState(null);
  const [addSheet, setAddSheet] = useState(null);       // { superset }
  const [editEx, setEditEx] = useState(null);            // exercise object
  const [builder, setBuilder] = useState(null);          // { idx } or { idx:null }
  const [switcher, setSwitcher] = useState(false);
  const [exportText, setExportText] = useState(null);
  const [timer, setTimer] = useState({ on: false, mode: "down", rem: 0, total: 0, elapsed: 0, name: "", exId: null, week: null });
  const tick = useRef(null);

  const update = useCallback((fn) => {
    setS(prev => {
      const c = JSON.parse(JSON.stringify(prev));
      fn(c);
      window.__state = c;
      WT.saveState(c);
      return c;
    });
  }, []);

  // timer loop
  useEffect(() => {
    if (timer.on) {
      tick.current = setInterval(() => {
        setTimer(t => {
          if (!t.on) return t;
          if (t.mode === "up") return { ...t, elapsed: t.elapsed + 1 };
          if (t.rem <= 1) { beep(); clearInterval(tick.current); return { ...t, on: false, rem: 0 }; }
          return { ...t, rem: t.rem - 1 };
        });
      }, 1000);
      return () => clearInterval(tick.current);
    }
  }, [timer.on]);

  const beep = () => { try { const c = new (window.AudioContext || window.webkitAudioContext)(); [0, .3, .6].forEach(t => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.setValueAtTime(.3, c.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + t + .25); o.start(c.currentTime + t); o.stop(c.currentTime + t + .3); }); } catch (e) {} };
  const startTimer = (sec, name) => setTimer({ on: true, mode: "down", rem: sec, total: sec, elapsed: 0, name, exId: null, week: null });
  const startStopwatch = (name, exId, week) => setTimer({ on: true, mode: "up", rem: 0, total: 0, elapsed: 0, name, exId, week });
  const addTime = (s) => setTimer(t => ({ ...t, rem: Math.max(0, t.rem + s), total: Math.max(t.total, t.rem + s) }));
  const resetWatch = () => setTimer(t => ({ ...t, elapsed: 0 }));
  const stopTimer = () => setTimer(t => ({ ...t, on: false }));
  const logWatch = (secs) => {
    setTimer(t => {
      if (t.exId) update(St => {
        const k = WT.logKey(t.exId, t.week);
        if (!St.logs[k]) St.logs[k] = WT.emptyLog();
        St.logs[k].reps = secs + "s";
      });
      return { ...t, on: false };
    });
  };

  const prog = S.programs[S.activeProg];

  // exercise actions
  const doAddExercise = (data) => {
    update(St => {
      const day = St.programs[St.activeProg].days[St.activeDay];
      day.exercises.push(Object.assign({ id: WT.genId(), ssGroup: data.ss ? Date.now() : null }, data));
    });
    setAddSheet(null);
  };
  const doEditExercise = (data) => {
    update(St => {
      St.programs[St.activeProg].days[St.activeDay].exercises.forEach(ex => {
        if (ex.id === editEx.id) Object.assign(ex, data);
      });
    });
    setEditEx(null);
  };
  const doDeleteExercise = (ex) => {
    if (!confirm("Remove " + ex.name + " from this day?")) return;
    update(St => {
      const day = St.programs[St.activeProg].days[St.activeDay];
      const i = day.exercises.findIndex(e => e.id === ex.id);
      if (i >= 0) day.exercises.splice(i, 1);
    });
    setMenuEx(null);
  };

  const commitProgram = (draft) => {
    update(St => {
      if (builder.idx != null) {
        St.programs[builder.idx] = draft;
      } else {
        St.programs.push(draft);
        St.activeProg = St.programs.length - 1;
        St.activeDay = 0;
        St.activeWeek = 1;
      }
    });
    setBuilder(null);
    setTab("log");
  };

  const headerKick = { log: "Logging", progress: "Progress", programs: "Library" }[tab];
  const headerName = tab === "programs" ? "Programs" : prog.name;

  return (
    <div className="app">
      <div className="hdr">
        <div className="hdr-top">
          <div className="hdr-prog" onClick={() => tab !== "programs" && setSwitcher(true)}>
            <span className="hdr-kick">{headerKick}</span>
            <span className="hdr-name">{headerName}{tab !== "programs" && <Icon n="chevD" s={17} />}</span>
          </div>
          {tab === "log" && (
            <button className="icon-btn" onClick={() => setAddSheet({ superset: false })}><Icon n="plus" s={22} /></button>
          )}
        </div>
        <RestTimer t={timer} onAdd={addTime} onStop={stopTimer} onReset={resetWatch} onLog={logWatch} />
      </div>

      {tab === "log" && (
        <LogScreen S={S} update={update}
          onMenu={(ex) => setMenuEx(ex)}
          onHistory={(name) => setHistoryName(name)}
          startTimer={startTimer}
          startStopwatch={startStopwatch}
          onAdd={(ss) => setAddSheet({ superset: ss })} />
      )}
      {tab === "progress" && (
        <ProgressScreen S={S} update={update}
          onHistory={(name) => setHistoryName(name)}
          onJump={(w) => { update(St => { St.activeWeek = w; }); setTab("log"); }} />
      )}
      {tab === "programs" && (
        <ProgramsScreen S={S} update={update}
          onEdit={(i) => setBuilder({ idx: i })}
          onNew={() => setBuilder({ idx: null })}
          onExport={(i) => setExportText(WT.buildExport(S, i))}
          onReset={() => { if (confirm("Reset all data back to the demo program?")) { const st = WT.resetState(); window.__state = st; setS(st); setTab("log"); } }} />
      )}

      {/* bottom tabs */}
      <div className="tabbar">
        <button className={"tab" + (tab === "log" ? " on" : "")} onClick={() => setTab("log")}>
          <Icon n="book" s={23} /> Log
        </button>
        <button className={"tab" + (tab === "progress" ? " on" : "")} onClick={() => setTab("progress")}>
          <Icon n="chart" s={23} /> Progress
        </button>
        <button className={"tab" + (tab === "programs" ? " on" : "")} onClick={() => setTab("programs")}>
          <Icon n="grid" s={23} /> Programs
        </button>
      </div>

      {/* overlays */}
      <ExerciseMenu open={!!menuEx} ex={menuEx} onClose={() => setMenuEx(null)}
        onHistory={() => { setHistoryName(menuEx.name); setMenuEx(null); }}
        onSearch={() => { window.open("https://www.google.com/search?q=" + encodeURIComponent("how to do " + menuEx.name + " exercise"), "_blank"); setMenuEx(null); }}
        onEdit={() => { setEditEx(menuEx); setMenuEx(null); }}
        onDelete={() => doDeleteExercise(menuEx)} />

      <HistoryPopup open={!!historyName} name={historyName} onClose={() => setHistoryName(null)} />

      <Sheet open={!!addSheet} onClose={() => setAddSheet(null)} title={addSheet && addSheet.superset ? "Add superset exercise" : "Add exercise"}>
        {addSheet && <ExerciseForm S={S} initial={null} asSuperset={addSheet.superset}
          onCancel={() => setAddSheet(null)} onSave={doAddExercise} />}
      </Sheet>

      <Sheet open={!!editEx} onClose={() => setEditEx(null)} title="Edit exercise">
        {editEx && <ExerciseForm S={S} initial={editEx} asSuperset={false}
          onCancel={() => setEditEx(null)} onSave={doEditExercise} />}
      </Sheet>

      <Sheet open={switcher} onClose={() => setSwitcher(false)} title="Switch program"
        footer={<button className="btn acc grow" onClick={() => { setSwitcher(false); setTab("programs"); }}>Manage programs</button>}>
        {S.programs.map((p, i) => (
          <div key={p.id} className="menu-i" style={{ borderRadius: 12, marginBottom: 6, background: "var(--card)" }}
            onClick={() => { update(St => { St.activeProg = i; St.activeDay = 0; St.activeWeek = Math.min(p.weeks, St.activeWeek || 1); }); setSwitcher(false); }}>
            <span style={{ flex: 1 }}>
              <span style={{ fontWeight: 700 }}>{p.name}</span>
              <span style={{ display: "block", fontSize: 12, color: "var(--tx3)", marginTop: 2 }}>{p.weeks}w · {p.days.length} days</span>
            </span>
            {i === S.activeProg && <Icon n="check" s={20} c="var(--acc)" />}
          </div>
        ))}
      </Sheet>

      {builder && <ProgramBuilder S={S} initial={builder.idx != null ? S.programs[builder.idx] : null}
        onClose={() => setBuilder(null)} onCommit={commitProgram} />}

      <Sheet open={exportText != null} onClose={() => setExportText(null)} title="Export for Claude"
        footer={
          <React.Fragment>
            <button className="btn ghost grow" onClick={() => setExportText(null)}>Close</button>
            <button className="btn acc grow" id="copy-btn" onClick={() => {
              try { navigator.clipboard.writeText(exportText); } catch (e) {}
              const b = document.getElementById("copy-btn"); if (b) { b.textContent = "Copied ✓"; setTimeout(() => { b.textContent = "Copy to clipboard"; }, 1800); }
            }}>Copy to clipboard</button>
          </React.Fragment>
        }>
        <div className="sep-note">Paste this into a new Claude chat to generate your next block — it includes your full history, session statuses, and any ★ benchmark/test sessions.</div>
        <textarea className="inp" readOnly value={exportText || ""} style={{ minHeight: 280, fontSize: 13, lineHeight: 1.5, fontFamily: "ui-monospace,Menlo,monospace" }} />
      </Sheet>
    </div>
  );
}

Object.assign(window, { App });
