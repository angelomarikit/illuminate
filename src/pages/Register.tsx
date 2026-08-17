import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import facebook from '../assets/facebook.svg'
import google from '../assets/google.svg'
import logo from '../assets/logo-transparent.png'
import { useAuth } from '../context/AuthContext'
import { homePathForRole } from '../lib/roles'
import { supabase } from '../lib/supabase'
import './auth.css'

export function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function socialSignup(provider: 'google' | 'facebook') {
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

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const result = await register({ name, email, password })
    setLoading(false)

    if (result.ok === false) {
      setError(result.error)
      return
    }

    navigate(homePathForRole(result.user.role), { replace: true })
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
            <h1>Create account</h1>
            <p>
              Create your Client portal account for appointments, wallet, loyalty, and care notes.
              Clinic roles (Owner, Admin, Receptionist, and others) are assigned by an Owner or Admin.
            </p>
          </div>

          <div className="auth-fields">
            {error ? <p className="auth-error">{error}</p> : null}

            <div className="auth-field">
              <label htmlFor="reg-name">Full name</label>
              <input
                id="reg-name"
                className="auth-input"
                type="text"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                className="auth-input"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                className="auth-input"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="reg-confirm">Confirm password</label>
              <input
                id="reg-confirm"
                className="auth-input"
                type="password"
                placeholder="Re-enter password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </div>

          <div className="auth-social">
            <div className="auth-divider">
              <span>Or continue with</span>
            </div>
            <button type="button" className="auth-social-btn" onClick={() => socialSignup('google')}>
              <img src={google} alt="" width={20} height={20} />
              Google
            </button>
            <button
              type="button"
              className="auth-social-btn"
              onClick={() => socialSignup('facebook')}
            >
              <img src={facebook} alt="" width={20} height={20} />
              Facebook
            </button>
          </div>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>

        <p className="auth-copy">© {new Date().getFullYear()} Illuminate Medical Aesthetics</p>
      </div>
    </div>
  )
}
