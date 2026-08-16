/* store.js — persistence + pure helpers. Plain JS, attaches to window. */
(function () {
  const KEY = "wt_v6";

  function genId() {
    return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function freshState() {
    const { program, logs } = window.buildSeed();
    return {
      programs: [program],
      logs: logs,                 // keyed `${exId}_w${week}`
      statuses: {},               // keyed `${dayId}_w${week}` -> complete|partial|skipped
      restEdits: {},              // keyed exId -> seconds
      activeProg: 0,
      activeDay: 0,
      activeWeek: 5,              // current logging week (1-indexed)
      benchmarks: {}              // keyed `${dayId}_w${week}` -> true (test/benchmark session)
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.programs && p.programs.length) return p;
      }
    } catch (e) {}
    return freshState();
  }

  function saveState(S) {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }

  function resetState() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    return freshState();
  }

  // ── helpers ──────────────────────────────────────────────
  function fmtRest(s) {
    const m = Math.floor(s / 60), r = s % 60;
    return m > 0 ? (r > 0 ? `${m}m ${r}s` : `${m}m`) : `${s}s`;
  }

  function restFor(S, ex) {
    return S.restEdits[ex.id] !== undefined ? S.restEdits[ex.id] : ex.rest;
  }

  function logKey(exId, week) { return exId + "_w" + week; }

  function getLog(S, exId, week) {
    return S.logs[logKey(exId, week)] || null;
  }

  function emptyLog() { return { sets: "", reps: "", weight: "", variation: "", note: "", custom: {} }; }

  function statusFor(S, dayId, week) {
    return S.statuses[dayId + "_w" + week] || "";
  }

  function isBench(S, dayId, week) {
    return !!(S.benchmarks && S.benchmarks[dayId + "_w" + week]);
  }

  // does this exercise track a duration/hold? (reps like "20s", "15-20s", "25s each")
  function isTimed(ex) {
    return /\d\s*-?\s*\d*\s*s(ec)?(\b|\s|$)/i.test(ex.reps || "");
  }

  function isSkipped(log) {
    return !!log && (log.sets === "0" || log.reps === "—");
  }

  // pull a number out of a freeform weight/rep string for trend plotting
  function parseNum(str) {
    if (!str) return null;
    const m = String(str).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function norm(name) { return (name || "").trim().toLowerCase(); }

  // Every logged entry for a given exercise NAME, across all programs/days/weeks.
  function historyForName(S, name) {
    const target = norm(name);
    const out = [];
    S.programs.forEach((prog, pi) => {
      const weeks = prog.weeks || prog.loggedWeeks || 1;
      prog.days.forEach(day => {
        day.exercises.forEach(ex => {
          if (norm(ex.name) !== target) return;
          for (let w = 1; w <= weeks; w++) {
            const log = getLog(S, ex.id, w);
            if (log && (log.sets || log.reps || log.weight || log.note)) {
              out.push({
                progIdx: pi,
                progName: prog.name,
                dayName: day.name,
                week: w,
                sets: log.sets, reps: log.reps, weight: log.weight, variation: log.variation || "", note: log.note,
                custom: log.custom || {},
                skipped: isSkipped(log)
              });
            }
          }
        });
      });
    });
    return out;
  }

  // distinct variation tags previously used for an exercise NAME (for autocomplete)
  function variationsForName(S, name) {
    const seen = {}, out = [];
    historyForName(S, name).forEach(r => {
      const v = (r.variation || "").trim();
      if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; out.push(v); }
    });
    return out;
  }

  // day display helpers: pill = short name, sub = focus/label
  function dayPill(day) {
    const n = day.name || "";
    return n.includes("\u2013") ? n.split("\u2013")[0].trim() : (n.includes(" - ") ? n.split(" - ")[0].trim() : n);
  }
  function daySub(day) {
    if (day.label) return day.label;
    const n = day.name || "";
    if (n.includes("\u2013")) return n.split("\u2013").slice(1).join("\u2013").trim();
    if (n.includes(" - ")) return n.split(" - ").slice(1).join(" - ").trim();
    return "";
  }

  // distinct exercise names across all programs (for autocomplete / library)
  function libraryNames(S) {
    const seen = {}, out = [];
    S.programs.forEach(prog => prog.days.forEach(day => day.exercises.forEach(ex => {
      const k = norm(ex.name);
      if (ex.name && !seen[k]) { seen[k] = 1; out.push(ex.name.trim()); }
    })));
    return out.sort((a, b) => a.localeCompare(b));
  }

  // build a Claude-ready prompt from a program's full logged history
  function buildExport(S, pi) {
    const p = S.programs[pi];
    const weeks = p.weeks;
    let txt = `Build me a new training block based on my program "${p.name}".\n\n`;
    txt += `Goal: ${p.desc || "Not specified"}\n`;
    txt += `Structure: ${p.weeks} weeks, ${p.days.length} days/week.\n\n`;
    txt += `=== FULL SESSION HISTORY ===\n`;
    let any = false;
    for (let w = 1; w <= weeks; w++) {
      p.days.forEach(day => {
        let lines = "";
        day.exercises.forEach(ex => {
          const l = getLog(S, ex.id, w);
          if (l && (l.sets || l.reps || l.weight || l.note)) {
            if (isSkipped(l)) {
              lines += `  - ${ex.name}: skipped${l.note ? " (" + l.note + ")" : ""}\n`;
            } else {
              const extra = l.custom ? Object.entries(l.custom).filter(([k, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ") : "";
              lines += `  - ${ex.name}${l.variation ? " [" + l.variation + "]" : ""}: ${l.sets}×${l.reps}${l.weight ? " @ " + l.weight : ""}${extra ? " {" + extra + "}" : ""}${l.note ? " — " + l.note : ""}\n`;
            }
          }
        });
        if (lines) {
          any = true;
          const st = statusFor(S, day.id, w);
          const bench = isBench(S, day.id, w);
          txt += `\nWeek ${w} — ${day.name}${st ? " [" + st.toUpperCase() + "]" : ""}${bench ? " ★[BENCHMARK / TEST SESSION]" : ""}\n${lines}`;
        }
      });
    }
    if (!any) txt += `\n(No sessions logged yet.)\n`;
    txt += `\n=== END HISTORY ===\n\n`;
    txt += `Using this history — note where I progressed, stalled, or skipped, and treat any ★ benchmark/test sessions as max-effort measurements — design my next ${p.weeks}-week block. Keep the same day structure unless a change is clearly warranted, and prescribe specific starting weights and rep targets based on where I ended.`;
    return txt;
  }

  window.WT = {
    genId, freshState, loadState, saveState, resetState,
    fmtRest, restFor, logKey, getLog, emptyLog, statusFor, isBench, isTimed, isSkipped,
    parseNum, norm, historyForName, variationsForName, libraryNames, buildExport, dayPill, daySub
  };
})();
