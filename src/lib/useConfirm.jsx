/* useConfirm.jsx — in-app confirmation.
 *
 * Replaces window.confirm(), which is unreliable: embedded and sandboxed
 * contexts suppress it entirely, returning false instantly without ever
 * showing a dialog — so destructive buttons appear to do nothing. This renders
 * a real sheet and resolves a promise.
 *
 *   const [confirmUI, confirm] = useConfirm()
 *   if (await confirm('Delete this?', { danger: true })) …
 *   return <>{confirmUI}…</>
 */
import { useCallback, useRef, useState } from 'react'
import { Overlay } from '../ui'

export function useConfirm() {
  const [dialog, setDialog] = useState(null)
  const resolver = useRef(null)

  const ask = useCallback(
    (message, { title = 'Are you sure?', confirmLabel = 'Delete', danger = true } = {}) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setDialog({ message, title, confirmLabel, danger })
      }),
    [],
  )

  const settle = useCallback((answer) => {
    setDialog(null)
    const resolve = resolver.current
    resolver.current = null
    resolve?.(answer)
  }, [])

  const ui = (
    <Overlay open={!!dialog} onClose={() => settle(false)} center>
      <div className="pop" style={{ padding: '20px 18px 16px' }}>
        <div className="hist-name">{dialog?.title}</div>
        <p style={{ fontSize: 14, color: 'var(--tx2)', lineHeight: 1.5, margin: '8px 0 18px' }}>
          {dialog?.message}
        </p>
        <div style={{ display: 'flex', gap: 9 }}>
          <button className="btn ghost grow" onClick={() => settle(false)}>
            Cancel
          </button>
          <button
            className={'btn grow ' + (dialog?.danger ? 'dan' : 'acc')}
            onClick={() => settle(true)}
          >
            {dialog?.confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  )

  return [ui, ask]
}
