import { useCallback, useEffect, useState } from 'react'
import { supabase, isConfigured } from './lib/supabase'
import { useStore } from './lib/store'
import { useTimer } from './lib/useTimer'
import { buildExport, supersetGroupsFor } from './lib/helpers'
import { useConfirm } from './lib/useConfirm'
import { Icon, Sheet } from './ui'
import Auth, { NewPassword } from './screens/Auth'
import LogScreen from './screens/Log'
import ExerciseForm from './screens/ExerciseForm'
import HistoryPopup from './screens/History'
import ProgressScreen from './screens/Progress'
import ProgramsScreen from './screens/Programs'
import ProgramBuilder from './screens/ProgramBuilder'
import { CreateChallengeSheet, JoinChallengeSheet } from './screens/ChallengeSheets'

function Shell({ children }) {
  return <div className="app">{children}</div>
}

function SetupNeeded() {
  return (
    <Shell>
      <div className="cfg">
        <h1>Almost there</h1>
        <p>
          The app can’t reach Supabase yet because <code>.env</code> is incomplete. Open it in the
          project root and fill in both values from Project&nbsp;Settings → API&nbsp;Keys:
        </p>
        <pre>{`VITE_SUPABASE_URL=https://your-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}</pre>
        <p>Then restart the dev server — Vite only reads .env at startup.</p>
      </div>
    </Shell>
  )
}

function Booting({ label = 'Loading…' }) {
  return (
    <Shell>
      <div className="boot">
        <div className="spinner" />
        <div>{label}</div>
      </div>
    </Shell>
  )
}

/** Nothing in the account yet — the only thing to do is build a program. */
function EmptyLibrary({ onNew }) {
  return (
    <div className="auth">
      <div className="auth-mark">
        <Icon n="layers" s={28} />
      </div>
      <h1 className="auth-ti">Build your first program</h1>
      <p className="auth-sub">
        A program is a few weeks of training, split into days. Add the movements you want to track
        and log them week by week.
      </p>
      <button className="btn acc" onClick={onNew}>
        <Icon n="plus" s={18} /> Create a program
      </button>
    </div>
  )
}

function ExerciseMenu({ ex, isChallenge, onClose, onHistory, onSearch, onEdit, onDelete }) {
  return (
    <Sheet open={!!ex} onClose={onClose} title="">
      {ex && (
        <div className="menu">
          <div className="menu-hd">
            <div className="mh-name">{ex.name}</div>
            <div className="mh-sub">
              {ex.target_sets}×{ex.target_reps}
              {ex.is_superset ? ' · superset' : ''}
            </div>
          </div>
          <button className="menu-i" onClick={onHistory}>
            <Icon n="history" s={20} /> View full history &amp; trend
          </button>
          <button className="menu-i" onClick={onSearch}>
            <Icon n="search" s={20} /> Search this exercise on Google
          </button>
          {!isChallenge && (
            <>
              <button className="menu-i" onClick={onEdit}>
                <Icon n="edit" s={20} /> Edit exercise &amp; fields
              </button>
              <button className="menu-i dan" onClick={onDelete}>
                <Icon n="trash" s={20} /> Remove from this day
              </button>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}

function RestTimerBar({ t, onAdd, onStop, onReset, onLog }) {
  if (!t.on) return null

  if (t.mode === 'up') {
    const m = Math.floor(t.elapsed / 60)
    const s = t.elapsed % 60
    return (
      <div style={{ paddingTop: 8 }}>
        <div className="timer up">
          <div className="timer-body">
            <div className="timer-name">HOLD · {t.name}</div>
            <div className="timer-dig">
              {m}:{String(s).padStart(2, '0')}
            </div>
          </div>
          <div className="timer-btns">
            <button className="tbtn" onClick={onReset}>
              Reset
            </button>
            {t.exId && (
              <button className="tbtn done" onClick={onLog}>
                Log {t.elapsed}s
              </button>
            )}
            <button className="tbtn done" onClick={onStop}>
              Stop
            </button>
          </div>
        </div>
      </div>
    )
  }

  const pct = t.total > 0 ? Math.round((t.rem / t.total) * 100) : 0
  const m = Math.floor(t.rem / 60)
  const s = t.rem % 60
  return (
    <div style={{ paddingTop: 8 }}>
      <div className="timer">
        <div className="timer-fill" style={{ width: `${pct}%` }} />
        <div className="timer-body">
          <div className="timer-name">REST · {t.name}</div>
          <div className="timer-dig">
            {m}:{String(s).padStart(2, '0')}
          </div>
        </div>
        <div className="timer-btns">
          <button className="tbtn" onClick={() => onAdd(15)}>
            +15
          </button>
          <button className="tbtn" onClick={() => onAdd(-15)}>
            −15
          </button>
          <button className="tbtn done" onClick={onStop}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function Main({ session }) {
  const store = useStore()
  const [tab, setTab] = useState('log')
  const [menuEx, setMenuEx] = useState(null)
  const [historyMovement, setHistoryMovement] = useState(null)
  const [addSheet, setAddSheet] = useState(null)
  const [editEx, setEditEx] = useState(null)
  const [builder, setBuilder] = useState(null) // { program } | { program: null }
  const [exportText, setExportText] = useState(null)
  const [switcher, setSwitcher] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmUI, confirm] = useConfirm()
  const [challengeSheet, setChallengeSheet] = useState(null) // 'create' | 'join'

  const logHold = useCallback(
    (exId, week, seconds) => store.saveLog(exId, week, { reps: `${seconds}s` }),
    [store],
  )
  const { timer, startRest, startHold, addTime, resetHold, stop, logHold: commitHold } =
    useTimer(logHold)

  if (store.loading) return <Booting />

  if (store.programs.length === 0) {
    return (
      <Shell>
        <EmptyLibrary onNew={() => setBuilder({ program: null })} />
        {builder && (
          <ProgramBuilder
            store={store}
            program={null}
            onClose={() => setBuilder(null)}
            onSaved={(saved) => {
              setBuilder(null)
              store.setProgram(saved.id)
              setTab('log')
            }}
          />
        )}
      </Shell>
    )
  }

  const headerKick = { log: 'Logging', progress: 'Progress', programs: 'Library' }[tab]
  const headerName = tab === 'programs' ? 'Programs' : store.program?.name

  return (
    <Shell>
      <div className="hdr">
        <div className="hdr-top">
          <div
            className="hdr-prog"
            onClick={() => tab !== 'programs' && store.programs.length > 1 && setSwitcher(true)}
          >
            <span className="hdr-kick">{headerKick}</span>
            <span className="hdr-name">
              {headerName}
              {tab !== 'programs' && store.programs.length > 1 && <Icon n="chevD" s={17} />}
            </span>
          </div>
          {tab === 'log' && !store.activeChallenge && (
            <button className="icon-btn" onClick={() => setAddSheet({ superset: false })}>
              <Icon n="plus" s={22} />
            </button>
          )}
        </div>
        <RestTimerBar
          t={timer}
          onAdd={addTime}
          onStop={stop}
          onReset={resetHold}
          onLog={commitHold}
        />
      </div>

      {store.error && (
        <div style={{ padding: '0 18px' }}>
          <div className="auth-err" onClick={store.clearError}>
            {store.error}
          </div>
        </div>
      )}

      {tab === 'log' && (
        <LogScreen
          store={store}
          onMenu={setMenuEx}
          onHistory={(ex) => setHistoryMovement({ id: ex.movement_id, name: ex.name })}
          startTimer={startRest}
          startStopwatch={startHold}
          onAdd={(ss) => setAddSheet({ superset: ss })}
        />
      )}

      {tab === 'programs' && (
        <ProgramsScreen
          store={store}
          email={session.user.email}
          onNew={() => setBuilder({ program: null })}
          onEdit={(p) => setBuilder({ program: p })}
          onExport={(p) => {
            setCopied(false)
            setExportText(buildExport(p, store.logs, store.statuses))
          }}
          onSignOut={() => supabase.auth.signOut()}
          onCreateChallenge={() => setChallengeSheet('create')}
          onJoinChallenge={() => setChallengeSheet('join')}
        />
      )}

      {tab === 'progress' && (
        <ProgressScreen
          store={store}
          onHistory={(ex) => setHistoryMovement({ id: ex.movement_id, name: ex.name })}
          onJump={(w) => {
            store.setWeek(w)
            setTab('log')
          }}
        />
      )}

      <div className="tabbar">
        <button className={'tab' + (tab === 'log' ? ' on' : '')} onClick={() => setTab('log')}>
          <Icon n="book" s={23} /> Log
        </button>
        <button
          className={'tab' + (tab === 'progress' ? ' on' : '')}
          onClick={() => setTab('progress')}
        >
          <Icon n="chart" s={23} /> Progress
        </button>
        <button
          className={'tab' + (tab === 'programs' ? ' on' : '')}
          onClick={() => setTab('programs')}
        >
          <Icon n="grid" s={23} /> Programs
        </button>
      </div>

      <ExerciseMenu
        ex={menuEx}
        isChallenge={!!store.activeChallenge}
        onClose={() => setMenuEx(null)}
        onHistory={() => {
          setHistoryMovement({ id: menuEx.movement_id, name: menuEx.name })
          setMenuEx(null)
        }}
        onSearch={() => {
          window.open(
            'https://www.google.com/search?q=' +
              encodeURIComponent(`how to do ${menuEx.name} exercise`),
            '_blank',
            'noopener',
          )
          setMenuEx(null)
        }}
        onEdit={() => {
          setEditEx(menuEx)
          setMenuEx(null)
        }}
        onDelete={async () => {
          const ex = menuEx
          setMenuEx(null)
          const ok = await confirm(
            `Remove ${ex.name} from this day? Any sessions logged against it are deleted too.`,
            { title: 'Remove exercise', confirmLabel: 'Remove' },
          )
          if (ok) await store.deleteExercise(ex.id)
        }}
      />

      <HistoryPopup
        movement={historyMovement}
        currentWeek={store.week}
        onClose={() => setHistoryMovement(null)}
      />

      <Sheet
        open={!!addSheet}
        onClose={() => setAddSheet(null)}
        title={addSheet?.superset ? 'Add superset exercise' : 'Add exercise'}
      >
        {addSheet && (
          <ExerciseForm
            store={store}
            initial={null}
            asSuperset={addSheet.superset}
            supersetGroups={supersetGroupsFor(store.day?.exercises)}
            onCancel={() => setAddSheet(null)}
            onSave={async (data) => {
              await store.addExercise(store.day.id, data)
              setAddSheet(null)
            }}
          />
        )}
      </Sheet>

      <Sheet open={!!editEx} onClose={() => setEditEx(null)} title="Edit exercise">
        {editEx && (
          <ExerciseForm
            store={store}
            initial={editEx}
            asSuperset={false}
            supersetGroups={supersetGroupsFor(store.day?.exercises)}
            onCancel={() => setEditEx(null)}
            onSave={async (data) => {
              await store.editExercise(editEx.id, data)
              setEditEx(null)
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={switcher}
        onClose={() => setSwitcher(false)}
        title="Switch program"
        footer={
          <button
            className="btn acc grow"
            onClick={() => {
              setSwitcher(false)
              setTab('programs')
            }}
          >
            Manage programs
          </button>
        }
      >
        {store.programs.map((p) => (
          <div
            key={p.id}
            className="menu-i"
            style={{ borderRadius: 12, marginBottom: 6, background: 'var(--card)' }}
            onClick={() => {
              store.setProgram(p.id)
              setSwitcher(false)
            }}
          >
            <span style={{ flex: 1 }}>
              <span style={{ fontWeight: 700 }}>{p.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                {p.weeks}w · {p.days.length} days
              </span>
            </span>
            {p.id === store.program?.id && <Icon n="check" s={20} c="var(--acc)" />}
          </div>
        ))}
      </Sheet>

      <Sheet
        open={exportText != null}
        onClose={() => setExportText(null)}
        title="Export for Claude"
        footer={
          <>
            <button className="btn ghost grow" onClick={() => setExportText(null)}>
              Close
            </button>
            <button
              className="btn acc grow"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(exportText)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1800)
                } catch {
                  /* clipboard needs a secure context; the textarea is selectable as a fallback */
                }
              }}
            >
              {copied ? 'Copied ✓' : 'Copy to clipboard'}
            </button>
          </>
        }
      >
        <div className="sep-note">
          Paste this into a new Claude chat to generate your next block — it includes your full
          history, session statuses, and any ★ benchmark/test sessions.
        </div>
        <textarea
          className="inp"
          readOnly
          value={exportText || ''}
          style={{
            minHeight: 280,
            fontSize: 13,
            lineHeight: 1.5,
            fontFamily: 'ui-monospace,Menlo,monospace',
          }}
        />
      </Sheet>

      <CreateChallengeSheet
        open={challengeSheet === 'create'}
        onClose={() => setChallengeSheet(null)}
        programCount={store.programs.length}
        email={session.user.email}
        onCreated={async ({ programId }) => {
          setChallengeSheet(null)
          await store.reload()
          store.setProgram(programId)
        }}
      />

      <JoinChallengeSheet
        open={challengeSheet === 'join'}
        onClose={() => setChallengeSheet(null)}
        programCount={store.programs.length}
        email={session.user.email}
        onJoined={async ({ programId }) => {
          setChallengeSheet(null)
          await store.reload()
          store.setProgram(programId)
          setTab('log')
        }}
      />

      {confirmUI}

      {builder && (
        <ProgramBuilder
          store={store}
          program={builder.program}
          onClose={() => setBuilder(null)}
          onSaved={(saved) => {
            setBuilder(null)
            store.setProgram(saved.id)
            setTab('log')
          }}
        />
      )}
    </Shell>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [booting, setBooting] = useState(true)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setBooting(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Arriving from a reset link signs you in, then asks for a new password.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!isConfigured) return <SetupNeeded />
  if (booting) return <Booting />
  if (!session) return <Auth />
  if (recovering) return <NewPassword onDone={() => setRecovering(false)} />
  return <Main key={session.user.id} session={session} />
}
