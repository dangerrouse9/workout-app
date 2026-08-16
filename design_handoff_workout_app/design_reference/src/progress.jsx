/* progress.jsx — all-weeks matrix view for the active program */

function ProgressScreen({ S, update, onHistory, onJump }) {
  const prog = S.programs[S.activeProg];
  const weeks = [];
  for (let w = 1; w <= prog.weeks; w++) weeks.push(w);

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
      <div style={{ padding: "10px 18px 0", fontSize: 12, color: "var(--tx2)", fontWeight: 600 }}>
        {prog.days[S.activeDay].name} · swipe each row to see every week →
      </div>

      <div className="scroll">
        {prog.days[S.activeDay].exercises.map(ex => (
          <div key={ex.id} className={"pg-ex" + (ex.ss ? " ss" : "")}>
            <div className="pg-name" onClick={() => onHistory(ex.name)}>{ex.name}</div>
            <div className="pg-plan">target {ex.sets}×{ex.reps}{ex.ss ? " · superset" : ""}</div>
            <div className="pg-strip">
              {weeks.map(w => {
                const log = WT.getLog(S, ex.id, w);
                const cur = w === S.activeWeek;
                const has = log && (log.sets || log.reps || log.weight);
                const skip = WT.isSkipped(log);
                const bench = WT.isBench(S, prog.days[S.activeDay].id, w);
                let cls = "pg-cell";
                if (cur) cls += " cur";
                if (skip) cls += " skip";
                if (!has && !skip) cls += " empty";
                return (
                  <div key={w} className={cls} onClick={() => onJump(w)}>
                    <div className="pg-wk">Week {w}{bench ? " ★" : ""}</div>
                    {skip ? <div className="pg-skip">Skipped</div>
                      : has ? <React.Fragment>
                          <div className="pg-big">{log.sets}×{log.reps}</div>
                          {log.weight && <div className="pg-wt">{log.weight}</div>}
                        </React.Fragment>
                      : <div className="pg-em">—</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ height: 10 }} />
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { ProgressScreen });
