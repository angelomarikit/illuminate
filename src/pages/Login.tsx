import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import facebook from '../assets/facebook.svg'
import google from '../assets/google.svg'
import logo from '../assets/logo-transparent.png'
import { useAuth } from '../context/AuthContext'
import { canAccessPath, homePathForRole } from '../lib/roles'
import { supabase } from '../lib/supabase'
import './auth.css'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function forgotPassword() {
    setError('')
    setInfo('')
    if (!email.trim()) {
      setError('Enter your email above, then click Forgot Password.')
      return
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`,
    })
    if (err) setError(err.message)
    else setInfo('Password reset email sent. Check your inbox.')
  }

  async function socialLogin(provider: 'google' | 'facebook') {
    setError('')
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (err) {
      setError(
        `${err.message}. Enable ${provider} under Supabase → Authentication → Providers.`,
      )
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(email, password)
    setLoading(false)
    if (result.ok === false) {
      setError(result.error)
      return
    }
    const destination =
      from && canAccessPath(result.user.role, from)
        ? from
        : homePathForRole(result.user.role)
    navigate(destination, { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <Link to="/" className="auth-brand" aria-label="Back to Illuminate home">
          <img src={logo} alt="Illuminate" />
        </Link>

        <form className="auth-card" onSubmit={onSubmit}>
          <div className="auth-intro">
            <p className="auth-kicker">Illuminate Medical Aesthetics</p>
            <h1>Welcome back</h1>
            <p>Sign in to manage appointments, sales, and client care.</p>
          </div>

          <div className="auth-fields">
            {error ? <p className="auth-error">{error}</p> : null}
            {info ? <p className="auth-info">{info}</p> : null}

            <div className="auth-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="auth-input"
                type="email"
                placeholder="you@clinic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className="auth-input"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="current-password"
              />
            </div>

            <div className="auth-row">
              <button type="button" className="auth-link" onClick={forgotPassword}>
                Forgot password?
              </button>
            </div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>

          <div className="auth-social">
            <div className="auth-divider">
              <span>Or continue with</span>
            </div>
            <button type="button" className="auth-social-btn" onClick={() => socialLogin('google')}>
              <img src={google} alt="" width={20} height={20} />
              Google
            </button>
            <button
              type="button"
              className="auth-social-btn"
              onClick={() => socialLogin('facebook')}
            >
              <img src={facebook} alt="" width={20} height={20} />
              Facebook
            </button>
          </div>

          <p className="auth-switch">
            Don&apos;t have an account? <Link to="/register">Register</Link>
          </p>
        </form>

        <p className="auth-copy">© {new Date().getFullYear()} Illuminate Medical Aesthetics</p>
      </div>
    </div>
  )
}
