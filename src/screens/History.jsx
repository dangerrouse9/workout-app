/* History.jsx — the press-and-hold history popup: trend sparkline + timeline.
   Data comes from the history_for_movement RPC, so it spans every program. */
import { useEffect, useState } from 'react'
import { Popup } from '../ui'
import * as db from '../lib/db'
import { parseNum, isSkipped } from '../lib/helpers'

/**
 * Pick what the sparkline should chart. Load is preferred, but bodyweight work
 * ("BW", "green band") has no number in the weight field — so fall back to
 * hold-time or reps, and relabel the chart to match.
 */
function chartSeries(rows) {
  const live = rows.filter((r) => !isSkipped(r))

  const byWeight = live.map((r) => parseNum(r.weight)).filter((v) => v !== null)
  if (byWeight.length >= 2) {
    return {
      label: 'Load trend',
      points: live.map((r) => ({ week: r.week, value: parseNum(r.weight) })),
    }
  }

  const timed = live.filter((r) => /\d\s*s/i.test(r.reps || ''))
  if (timed.length >= 2) {
    return {
      label: 'Hold-time trend',
      points: live.map((r) => ({ week: r.week, value: parseNum(r.reps) })),
    }
  }

  const byReps = live.map((r) => parseNum(r.reps)).filter((v) => v !== null)
  if (byReps.length >= 2) {
    return {
      label: 'Reps / volume trend',
      points: live.map((r) => ({ week: r.week, value: parseNum(r.reps) })),
    }
  }
  return null
}

function Spark({ series, currentWeek }) {
  const points = series.points.filter((p) => p.value !== null)
  if (points.length < 2) return null
  const max = Math.max(...points.map((p) => p.value))
  const min = Math.min(...points.map((p) => p.value), 0)
  const span = max - min || 1

  return (
    <>
      <div className="hist-sub" style={{ padding: '12px 18px 0', fontWeight: 700 }}>
        {series.label}
      </div>
      <div className="spark">
        {points.map((p, i) => (
          <div
            key={`${p.week}-${i}`}
            className={'spark-bar' + (p.week === currentWeek ? ' cur' : '')}
            style={{ height: `${Math.max(8, ((p.value - min) / span) * 100)}%` }}
          >
            <span className="spark-v">{p.value}</span>
          </div>
        ))}
      </div>
      <div className="spark-x">
        {points.map((p, i) => (
          <span className="spark-lab" key={`${p.week}-l-${i}`}>
            W{p.week}
          </span>
        ))}
      </div>
    </>
  )
}

/** @param {{id: string, name: string} | null} movement */
export default function HistoryPopup({ movement, currentWeek, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const movementId = movement?.id

  useEffect(() => {
    if (!movementId) {
      setRows(null)
      return
    }
    let cancelled = false
    setRows(null)
    setError(null)
    db.historyForMovement(movementId)
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [movementId])

  const series = rows ? chartSeries(rows) : null
  const reverse = rows ? [...rows].reverse() : []

  return (
    <Popup open={!!movement} onClose={onClose}>
      <div className="hist-hd">
        <div className="hist-name">{movement?.name}</div>
        <div className="hist-sub">
          {rows === null && !error && 'Loading…'}
          {error && `Could not load history: ${error}`}
          {rows && `${rows.length} logged session${rows.length === 1 ? '' : 's'} · history by name`}
        </div>
      </div>

      {series && <Spark series={series} currentWeek={currentWeek} />}

      <div className="hist-list">
        {rows?.length === 0 && (
          <div className="empty-state">
            Nothing logged under this name yet.
            <br />
            Any exercise you name the same way will share this history.
          </div>
        )}
        {reverse.map((r, i) => (
          <div className="hist-row" key={`${r.program_id}-${r.week}-${i}`}>
            <div className="hist-wk">
              <div className="hist-wk-n">Wk {r.week}</div>
              <div className="hist-wk-p">{r.day_name}</div>
            </div>
            <div className="hist-main">
              {isSkipped(r) ? (
                <div className="hist-perf skip">Skipped</div>
              ) : (
                <div className="hist-perf">
                  {r.sets}×{r.reps}
                  {r.weight && <span className="wt"> @ {r.weight}</span>}
                  {r.variation && <span className="hist-var">{r.variation}</span>}
                </div>
              )}
              {r.note && <div className="hist-n">{r.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </Popup>
  )
}
