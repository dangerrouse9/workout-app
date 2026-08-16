/* useTimer.js — rest count-down and hold count-up.
 *
 * Both are derived from wall-clock timestamps rather than a decrementing
 * counter, because browsers throttle or suspend intervals when the app is
 * backgrounded or the phone locks. Storing the target time means the readout is
 * still correct when you come back, instead of having silently lost seconds.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const IDLE = {
  on: false,
  mode: 'down',
  endAt: 0,
  startAt: 0,
  total: 0,
  name: '',
  exId: null,
  week: null,
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const c = new Ctx()
    for (const t of [0, 0.3, 0.6]) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.connect(g)
      g.connect(c.destination)
      o.frequency.value = 880
      g.gain.setValueAtTime(0.3, c.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.25)
      o.start(c.currentTime + t)
      o.stop(c.currentTime + t + 0.3)
    }
  } catch {
    /* WebAudio may be blocked until a user gesture; the visual timer still works */
  }
}

export function useTimer(onLogHold) {
  const [t, setT] = useState(IDLE)
  const [now, setNow] = useState(() => Date.now())
  const wakeLock = useRef(null)
  const beeped = useRef(false)

  // Keep the screen awake while a timer runs, so the alert can actually be heard.
  const releaseLock = useCallback(() => {
    wakeLock.current?.release().catch(() => {})
    wakeLock.current = null
  }, [])

  const acquireLock = useCallback(async () => {
    try {
      if (!wakeLock.current && 'wakeLock' in navigator) {
        wakeLock.current = await navigator.wakeLock.request('screen')
      }
    } catch {
      /* denied or unsupported — not fatal */
    }
  }, [])

  useEffect(() => {
    if (!t.on) {
      releaseLock()
      return
    }
    acquireLock()
    const id = setInterval(() => setNow(Date.now()), 250)
    const onVisible = () => {
      setNow(Date.now())
      if (document.visibilityState === 'visible') acquireLock()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [t.on, acquireLock, releaseLock])

  const rem = t.mode === 'down' ? Math.max(0, Math.ceil((t.endAt - now) / 1000)) : 0
  const elapsed = t.mode === 'up' ? Math.max(0, Math.floor((now - t.startAt) / 1000)) : 0

  // Fire once when a countdown reaches zero.
  useEffect(() => {
    if (t.on && t.mode === 'down' && rem === 0 && !beeped.current) {
      beeped.current = true
      beep()
      setT((prev) => ({ ...prev, on: false }))
    }
  }, [t.on, t.mode, rem])

  const startRest = useCallback((seconds, name) => {
    beeped.current = false
    setNow(Date.now())
    setT({
      ...IDLE,
      on: true,
      mode: 'down',
      endAt: Date.now() + seconds * 1000,
      total: seconds,
      name,
    })
  }, [])

  const startHold = useCallback((name, exId, week) => {
    beeped.current = false
    setNow(Date.now())
    setT({ ...IDLE, on: true, mode: 'up', startAt: Date.now(), name, exId, week })
  }, [])

  const addTime = useCallback((seconds) => {
    setT((prev) => {
      if (!prev.on || prev.mode !== 'down') return prev
      const endAt = Math.max(Date.now(), prev.endAt + seconds * 1000)
      return { ...prev, endAt, total: Math.max(prev.total, Math.ceil((endAt - Date.now()) / 1000)) }
    })
  }, [])

  const resetHold = useCallback(() => {
    setNow(Date.now())
    setT((prev) => ({ ...prev, startAt: Date.now() }))
  }, [])

  const stop = useCallback(() => setT((prev) => ({ ...prev, on: false })), [])

  const logHold = useCallback(() => {
    if (t.exId) onLogHold?.(t.exId, t.week, elapsed)
    setT((prev) => ({ ...prev, on: false }))
  }, [t.exId, t.week, elapsed, onLogHold])

  return { timer: { ...t, rem, elapsed }, startRest, startHold, addTime, resetHold, stop, logHold }
}
