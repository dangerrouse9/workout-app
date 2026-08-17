/* Programs.jsx — the library tab: every program, with edit / export / delete. */
import { useState } from 'react'
import { Icon } from '../ui'
import { useConfirm } from '../lib/useConfirm'

const KICKER = {
  fontSize: 12,
  color: 'var(--tx3)',
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  margin: '16px 2px 8px',
}

function ChallengeCard({ challenge, memberCount, totalDays, isActive, isOwner, onOpen, onCopyCode, copied, onLeave }) {
  return (
    <div className="exc" style={{ marginTop: 0, marginBottom: 11, padding: '14px 15px' }} onClick={onOpen}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div className="exc-name">{challenge.name}</div>
        {isActive && (
          <span className="tag plan" style={{ flexShrink: 0 }}>
            Active
          </span>
        )}
      </div>
      <div className="exc-meta" style={{ marginTop: 8 }}>
        <span className="tag">{totalDays ? `${totalDays} days` : `${challenge.weeks} weeks`}</span>
        <span className="tag">
          {memberCount} {memberCount === 1 ? 'person' : 'people'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          className="btn grow"
          style={{ justifyContent: 'space-between' }}
          onClick={(e) => {
            e.stopPropagation()
            onCopyCode()
          }}
        >
          <span style={{ color: 'var(--tx2)', fontSize: 13, fontWeight: 600 }}>Invite code</span>
          <span style={{ letterSpacing: 3, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {copied ? 'Copied ✓' : challenge.invite_code}
          </span>
        </button>
        <button
          className="btn dan"
          style={{ flex: '0 0 auto' }}
          onClick={(e) => {
            e.stopPropagation()
            onLeave()
          }}
          aria-label={isOwner ? 'End challenge' : 'Leave challenge'}
        >
          <Icon n={isOwner ? 'trash' : 'x'} s={16} />
        </button>
      </div>
    </div>
  )
}

export default function ProgramsScreen({
  store,
  onEdit,
  onNew,
  onExport,
  onSignOut,
  email,
  onCreateChallenge,
  onJoinChallenge,
}) {
  const [confirmUI, confirm] = useConfirm()
  const [copiedCode, setCopiedCode] = useState(null)

  const myChallenges = store.challenges.filter((c) =>
    store.members.some((m) => m.challenge_id === c.id && m.user_id === store.userId),
  )

  const openChallenge = (challenge) => {
    const mine = store.members.find(
      (m) => m.challenge_id === challenge.id && m.user_id === store.userId,
    )
    if (mine) store.setProgram(mine.program_id)
  }

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 1800)
    } catch {
      /* clipboard needs a secure context; the code is visible to read off anyway */
    }
  }

  return (
    <div className="scroll" style={{ paddingTop: 8 }}>
      {confirmUI}
      <button className="btn acc" style={{ width: '100%', padding: 15, marginBottom: 6 }} onClick={onNew}>
        <Icon n="plus" s={18} /> Create new program
      </button>

      <div
        style={{
          fontSize: 12,
          color: 'var(--tx3)',
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          margin: '16px 2px 8px',
        }}
      >
        Your programs
      </div>

      {store.programs.filter((p) => !store.challengeProgramIds.has(p.id)).map((p) => {
        const exCount = p.days.reduce((a, d) => a + d.exercises.length, 0)
        const isActive = p.id === store.program?.id
        return (
          <div
            key={p.id}
            className="exc"
            style={{ marginTop: 0, marginBottom: 11, padding: '14px 15px' }}
            onClick={() => store.setProgram(p.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div className="exc-name">{p.name}</div>
              {isActive && (
                <span className="tag plan" style={{ flexShrink: 0 }}>
                  Active
                </span>
              )}
            </div>
            {p.description && (
              <div className="exc-note" style={{ marginTop: 5 }}>
                {p.description}
              </div>
            )}
            <div className="exc-meta" style={{ marginTop: 8 }}>
              <span className="tag">{p.weeks} weeks</span>
              <span className="tag">{p.days.length} days</span>
              <span className="tag">{exCount} exercises</span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="btn grow"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(p)
                }}
              >
                <Icon n="edit" s={16} /> Edit
              </button>
              <button
                className="btn grow"
                style={{ background: 'var(--amb-bg)', color: 'var(--amb-tx)', boxShadow: 'none' }}
                onClick={(e) => {
                  e.stopPropagation()
                  onExport(p)
                }}
              >
                <Icon n="book" s={16} /> Export
              </button>
              {store.programs.length > 1 && (
                <button
                  className="btn dan"
                  style={{ flex: '0 0 auto' }}
                  onClick={async (e) => {
                    e.stopPropagation()
                    const logged = p.days.reduce(
                      (n, d) =>
                        n +
                        d.exercises.reduce(
                          (m, ex) =>
                            m +
                            Array.from({ length: p.weeks }, (_, i) => store.getLog(ex.id, i + 1)).filter(
                              Boolean,
                            ).length,
                          0,
                        ),
                      0,
                    )
                    const warning = logged
                      ? `This also deletes ${logged} logged session${logged === 1 ? '' : 's'}, and cannot be undone.`
                      : 'It has nothing logged against it yet.'
                    const ok = await confirm(warning, {
                      title: `Delete "${p.name}"?`,
                      confirmLabel: 'Delete program',
                    })
                    if (ok) await store.deleteProgram(p.id)
                  }}
                >
                  <Icon n="trash" s={16} />
                </button>
              )}
            </div>
          </div>
        )
      })}

      <div style={KICKER}>Challenges</div>

      <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
        <button className="btn grow" onClick={onCreateChallenge}>
          <Icon n="plus" s={16} /> Create
        </button>
        <button className="btn grow" onClick={onJoinChallenge}>
          <Icon n="link" s={16} /> Join with code
        </button>
      </div>

      {myChallenges.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5, margin: '0 2px 14px' }}>
          Nothing running. A challenge is its own program — you and a friend each keep a private
          copy and can see each other’s numbers as you go.
        </div>
      )}

      {myChallenges.map((c) => (
        <ChallengeCard
          key={c.id}
          challenge={c}
          memberCount={store.members.filter((m) => m.challenge_id === c.id).length}
          totalDays={(() => {
            const mine = store.members.find(
              (m) => m.challenge_id === c.id && m.user_id === store.userId,
            )
            const prog = store.programs.find((p) => p.id === mine?.program_id)
            return prog ? prog.weeks * prog.days.length : null
          })()}
          isActive={store.members.some(
            (m) => m.challenge_id === c.id && m.program_id === store.program?.id,
          )}
          copied={copiedCode === c.invite_code}
          isOwner={c.owner_id === store.userId}
          onOpen={() => openChallenge(c)}
          onCopyCode={() => copyCode(c.invite_code)}
          onLeave={async () => {
            const owner = c.owner_id === store.userId
            const ok = await confirm(
              owner
                ? `This ends "${c.name}" for everyone. Each person keeps their own copy of the program and everything they logged — only the shared link goes away.`
                : `You'll stop seeing everyone else's numbers, and they'll stop seeing yours. Your own copy and your logs stay put.`,
              {
                title: owner ? `End "${c.name}"?` : `Leave "${c.name}"?`,
                confirmLabel: owner ? 'End challenge' : 'Leave',
              },
            )
            if (ok) await store.leaveChallenge(c.id)
          }}
        />
      ))}

      <button className="btn ghost" style={{ width: '100%', marginTop: 4 }} onClick={onSignOut}>
        Sign out {email}
      </button>
      <div style={{ height: 20 }} />
    </div>
  )
}
