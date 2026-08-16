/* ui.jsx — icons + reusable primitives (Overlay, Sheet, Popup, Toggle, useLongPress).
   Ported from the prototype's ui.jsx. */
import { useState, useEffect } from 'react'

// ── icons (simple stroke shapes) ───────────────────────
export function Icon({ n, s = 22, c = 'currentColor', sw = 2 }) {
  const p = {
    chevL: <path d="M15 5l-7 7 7 7" />,
    chevR: <path d="M9 5l7 7-7 7" />,
    chevD: <path d="M5 9l7 7 7-7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    clock: (
      <g>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </g>
    ),
    chart: <path d="M5 19V11M12 19V5M19 19v-6" />,
    grid: (
      <g>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </g>
    ),
    search: (
      <g>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </g>
    ),
    history: (
      <g>
        <path d="M4 12a8 8 0 1 0 2.5-5.8" />
        <path d="M3.5 4v3.2H6.7" />
        <path d="M12 8v4.3l2.8 1.7" />
      </g>
    ),
    dots: (
      <g>
        <circle cx="6" cy="12" r="1.6" fill={c} stroke="none" />
        <circle cx="12" cy="12" r="1.6" fill={c} stroke="none" />
        <circle cx="18" cy="12" r="1.6" fill={c} stroke="none" />
      </g>
    ),
    x: <path d="M6 6l12 12M18 6L6 18" />,
    edit: (
      <g>
        <path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3z" />
        <path d="M14 7l3 3" />
      </g>
    ),
    trash: <path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" />,
    play: <path d="M7 5l12 7-12 7V5z" fill={c} stroke="none" />,
    link: (
      <g>
        <path d="M9.5 14.5l5-5" />
        <path d="M8 11l-2 2a3.5 3.5 0 0 0 5 5l2-2" />
        <path d="M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2" />
      </g>
    ),
    layers: (
      <g>
        <path d="M12 4l8 4-8 4-8-4 8-4z" />
        <path d="M4 12l8 4 8-4" />
      </g>
    ),
    cal: (
      <g>
        <rect x="4" y="5" width="16" height="15" rx="2.5" />
        <path d="M4 9h16M8 3v4M16 3v4" />
      </g>
    ),
    plusC: (
      <g>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8.5v7M8.5 12h7" />
      </g>
    ),
    book: (
      <g>
        <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4z" />
        <path d="M5 17h13" />
      </g>
    ),
    flag: <path d="M6 21V4M6 4h11l-2 4 2 4H6" />,
    check: <path d="M5 12.5l5 5L19 6" />,
  }[n]

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {p || null}
    </svg>
  )
}

// ── Overlay: backdrop + transition driven by setTimeout (robust vs frozen frames) ──
export function Overlay({ open, onClose, center, children }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const t = setTimeout(() => setShown(true), 16)
      return () => clearTimeout(t)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 260)
    return () => clearTimeout(t)
  }, [open])

  if (!mounted) return null
  return (
    <div
      className={'ov' + (center ? ' center' : '') + (shown ? ' open' : '')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      {children}
    </div>
  )
}

export function Sheet({ open, onClose, title, children, footer }) {
  return (
    <Overlay open={open} onClose={onClose}>
      <div className="sheet">
        <div className="sheet-grab" />
        <div className="sheet-hd">
          <div className="sheet-ti">{title}</div>
          <button className="sheet-x" onClick={onClose}>
            <Icon n="x" s={18} />
          </button>
        </div>
        <div className="sheet-bd">{children}</div>
        {footer && <div className="sheet-ft">{footer}</div>}
      </div>
    </Overlay>
  )
}

export function Popup({ open, onClose, children }) {
  return (
    <Overlay open={open} onClose={onClose} center>
      <div className="pop">{children}</div>
    </Overlay>
  )
}

export function Toggle({ on, onChange }) {
  return (
    <button className={'tg' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <span className="tg-knob" />
    </button>
  )
}
