/* useLongPress.js — press-and-hold gesture used to open an exercise's action menu. */
import { useCallback, useEffect, useRef } from 'react'

/** Fires onLongPress after `ms`, with a short haptic. Also handles right-click. */
export function useLongPress(onLongPress, ms = 420) {
  const timer = useRef(null)

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const start = useCallback(() => {
    timer.current = setTimeout(() => {
      try {
        navigator.vibrate?.(12)
      } catch {
        /* vibrate is unsupported on iOS Safari; the menu still opens */
      }
      onLongPress()
    }, ms)
  }, [onLongPress, ms])

  useEffect(() => cancel, [cancel])

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerMove: cancel,
    onContextMenu: (e) => {
      e.preventDefault()
      cancel()
      onLongPress()
    },
  }
}
