/* history.jsx — long-press history popup (trend + timeline) and exercise action menu */
const WT = window.WT;

function HistoryPopup({ open, name, onClose }) {
  if (!open) return null;
  const S = window.__state;
  const rows = WT.historyForName(S, name).filter(r => !r.skipped);
  const allRows = WT.historyForName(S, name);

  // build sparkline: prefer weight numbers; fall back to reps (covers BW/band/timed)
  const weightNums = rows.map(r => WT.parseNum(r.weight));
  const hasWeight = weightNums.some(n => n !== null);
  const timed = rows.some(r => /s\b/i.test(r.reps || ""));
  const nums = hasWeight ? weightNums : rows.map(r => WT.parseNum(r.reps) ?? WT.parseNum(r.sets));
  const metricLabel = hasWeight ? "Load trend" : (timed ? "Hold-time trend" : "Reps / volume trend");
  const valid = nums.filter(n => n !== null);
  const max = valid.length ? Math.max(...valid) : 1;
  const min = valid.length ? Math.min(...valid) : 0;
  const range = max - min || 1;

  return (
    <Popup open={open} onClose={onClose}>
      <div className="hist-hd">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="hist-name">{name}</div>
            <div className="hist-sub">{allRows.length} logged session{allRows.length === 1 ? "" : "s"} · history by name</div>
          </div>
          <button className="sheet-x" onClick={onClose}><Icon n="x" s={18} /></button>
        </div>
      </div>

      {valid.length >= 2 && (
        <React.Fragment>
          <div className="spark">
            {rows.map((r, i) => {
              const v = nums[i];
              const h = v === null ? 6 : 12 + Math.round((v - min) / range * 38);
              const isCur = i === rows.length - 1;
              return (
                <div key={i} className={"spark-bar" + (isCur ? " cur" : "")} style={{ height: h }}>
                  {v !== null && <span className="spark-v">{v}</span>}
                </div>
              );
            })}
          </div>
          <div className="spark-x">
            {rows.map((r, i) => <div key={i} className="spark-lab">W{r.week}</div>)}
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 700, textAlign: "center", padding: "0 0 6px", letterSpacing: 0.4, textTransform: "uppercase" }}>
            {metricLabel}
          </div>
        </React.Fragment>
      )}

      <div className="hist-list">
        {allRows.length === 0 && (
          <div className="empty-state">No history yet for this exercise.<br />Log a session and it'll show up here — and under any future workout you give the same name.</div>
        )}
        {allRows.slice().reverse().map((r, i) => (
          <div className="hist-row" key={i}>
            <div className="hist-wk">
              <div className="hist-wk-n">Wk {r.week}</div>
              <div className="hist-wk-p">{r.dayName.split("–")[0].trim()}</div>
            </div>
            <div className="hist-main">
              {r.skipped
                ? <div className="hist-perf skip">Skipped</div>
                : <div className="hist-perf">{r.sets}×{r.reps}{r.weight ? <span className="wt"> @ {r.weight}</span> : ""}{r.variation ? <span className="hist-var">{r.variation}</span> : ""}</div>}
              {r.note && <div className="hist-n">{r.note}</div>}
              {r.custom && Object.keys(r.custom).length > 0 && (
                <div className="hist-n">{Object.entries(r.custom).filter(([k, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Popup>
  );
}

// action menu shown on long-press / "more"
function ExerciseMenu({ open, ex, onClose, onHistory, onSearch, onEdit, onDelete }) {
  if (!ex) return null;
  return (
    <Sheet open={open} onClose={onClose} title="">
      <div className="menu" style={{ marginBottom: 8 }}>
        <div className="menu-hd">
          <div className="mh-name">{ex.name}</div>
          <div className="mh-sub">{ex.sets}×{ex.reps}{ex.ss ? " · superset" : ""}</div>
        </div>
        <div className="menu-i" onClick={onHistory}><Icon n="history" s={20} /> View full history &amp; trend</div>
        <div className="menu-i" onClick={onSearch}><Icon n="search" s={20} /> Search this exercise on Google</div>
        <div className="menu-i" onClick={onEdit}><Icon n="edit" s={20} /> Edit exercise &amp; fields</div>
        <div className="menu-i dan" onClick={onDelete}><Icon n="trash" s={20} /> Remove from this day</div>
      </div>
    </Sheet>
  );
}

Object.assign(window, { HistoryPopup, ExerciseMenu });
