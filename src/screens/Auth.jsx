import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Icon } from '../ui'

const COPY = {
  signin: { title: 'Welcome back', sub: 'Sign in to pick up where you left off.', cta: 'Sign in' },
  signup: {
    title: 'Create your account',
    sub: 'Your programs and history are private to this account.',
    cta: 'Create account',
  },
  forgot: {
    title: 'Reset your password',
    sub: 'We’ll email you a link to set a new one.',
    cta: 'Send reset link',
  },
}

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const copy = COPY[mode]

  function go(next) {
    setMode(next)
    setErr('')
    setMsg('')
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setMsg('')
    setBusy(true)
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        // Deliberately not revealing whether the address has an account.
        setMsg('If that address has an account, a reset link is on its way.')
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) setMsg('Check your email for a confirmation link, then sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e2) {
      setErr(e2.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <form className="auth" onSubmit={submit}>
        <div className="auth-mark">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
            <rect x="1" y="9.5" width="2.5" height="5" rx="1" />
            <rect x="20.5" y="9.5" width="2.5" height="5" rx="1" />
            <rect x="4.5" y="7.5" width="3" height="9" rx="1.2" />
            <rect x="16.5" y="7.5" width="3" height="9" rx="1.2" />
            <rect x="8" y="10.5" width="8" height="3" rx="1" />
          </svg>
        </div>

        <h1 className="auth-ti">{copy.title}</h1>
        <p className="auth-sub">{copy.sub}</p>

        {err && <div className="auth-err">{err}</div>}
        {msg && <div className="auth-msg">{msg}</div>}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="inp"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {mode !== 'forgot' && (
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="inp"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

        <button className="btn acc" type="submit" disabled={busy}>
          {busy ? 'Working…' : copy.cta}
        </button>

        {mode === 'signin' && (
          <button type="button" className="auth-alt" onClick={() => go('forgot')}>
            Forgot your password?
          </button>
        )}

        <button
          type="button"
          className="auth-alt"
          onClick={() => go(mode === 'signup' ? 'signin' : mode === 'forgot' ? 'signin' : 'signup')}
        >
          {mode === 'signup' ? (
            <>
              Already have an account? <b>Sign in</b>
            </>
          ) : mode === 'forgot' ? (
            <>
              <Icon n="chevL" s={13} /> Back to sign in
            </>
          ) : (
            <>
              No account yet? <b>Create one</b>
            </>
          )}
        </button>
      </form>
    </div>
  )
}

/** Shown when the app is opened from a password-reset link. */
export function NewPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      onDone()
    } catch (e2) {
      setErr(e2.message || 'Could not set your password.')
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <form className="auth" onSubmit={submit}>
        <div className="auth-mark">
          <Icon n="check" s={28} />
        </div>
        <h1 className="auth-ti">Choose a new password</h1>
        <p className="auth-sub">You’re signed in from the reset link. Pick a password and you’re set.</p>

        {err && <div className="auth-err">{err}</div>}

        <div className="field">
          <label htmlFor="newpw">New password</label>
          <input
            id="newpw"
            className="inp"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="btn acc" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </div>
  )
}
