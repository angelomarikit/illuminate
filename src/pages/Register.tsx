import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import cover from '../assets/cover.png'
import coverMobile from '../assets/cover-mobile.png'
import facebook from '../assets/facebook.svg'
import google from '../assets/google.svg'
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
      <div className="auth-form-col">
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="auth-intro">
            <p className="auth-kicker">Illuminate Medical Aesthetics</p>
            <h1>Create Account</h1>
            <p>
              Create a clinic Staff account for POS, bookings, inventory, and client care. Owner /
              Admin roles are assigned by the clinic (not via public signup).
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
                placeholder="Example@email.com"
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
                placeholder="at least 8 characters"
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
                placeholder="re-enter password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Sign up'}
            </button>
          </div>

          <div className="auth-social">
            <div className="auth-divider">Or</div>
            <button type="button" className="auth-social-btn" onClick={() => socialSignup('google')}>
              <img src={google} alt="" width={28} height={28} />
              Sign up with Google
            </button>
            <button
              type="button"
              className="auth-social-btn"
              onClick={() => socialSignup('facebook')}
            >
              <img src={facebook} alt="" width={28} height={28} />
              Sign up with Facebook
            </button>
          </div>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
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
