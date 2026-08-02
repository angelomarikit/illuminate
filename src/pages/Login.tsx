import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import cover from '../assets/cover.png'
import coverMobile from '../assets/cover-mobile.png'
import facebook from '../assets/facebook.svg'
import google from '../assets/google.svg'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import './auth.css'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

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
    navigate(from, { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-form-col">
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="auth-intro">
            <p className="auth-kicker">Illuminate Medical Aesthetics</p>
            <h1>Welcome Back</h1>
            <p>
              Today is a new day for your clinic. Sign in to manage appointments, sales, and client
              care.
            </p>
          </div>

          <div className="auth-fields">
            {error ? <p className="auth-error">{error}</p> : null}
            {info ? <p className="auth-hint">{info}</p> : null}

            <div className="auth-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="auth-input"
                type="email"
                placeholder="Example@email.com"
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
                placeholder="at least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="current-password"
              />
            </div>

            <div className="auth-row">
              <button type="button" className="auth-link" onClick={forgotPassword}>
                Forgot Password?
              </button>
            </div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

            <p className="auth-hint">Sign in with your Supabase clinic account.</p>
          </div>

          <div className="auth-social">
            <div className="auth-divider">Or</div>
            <button type="button" className="auth-social-btn" onClick={() => socialLogin('google')}>
              <img src={google} alt="" width={28} height={28} />
              Sign in with Google
            </button>
            <button type="button" className="auth-social-btn" onClick={() => socialLogin('facebook')}>
              <img src={facebook} alt="" width={28} height={28} />
              Sign in with Facebook
            </button>
          </div>

          <p className="auth-switch">
            Don&apos;t have an account? <Link to="/register">Sign up</Link>
          </p>
          <p className="auth-copy">© {new Date().getFullYear()} ILLUMINATE MEDICAL AESTHETICS</p>
        </form>
      </div>

      <div className="auth-art-col" aria-hidden="true">
        <div className="auth-art-frame">
          <img src={cover} alt="" className="auth-art auth-art-desktop" />
          <img src={coverMobile} alt="" className="auth-art auth-art-mobile" />
        </div>
      </div>
    </div>
  )
}
