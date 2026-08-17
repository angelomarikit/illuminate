import { Link } from 'react-router-dom'
import logo from '../assets/logo-transparent.png'
import './landing.css'
import './privacy.css'

const LAST_UPDATED = 'August 17, 2026'

export function PrivacyPolicy() {
  return (
    <div className="landing privacy-page">
      <header className="privacy-top">
        <Link className="landing-brand" to="/" aria-label="Illuminate home">
          <img src={logo} alt="Illuminate" />
        </Link>
        <nav className="privacy-top-nav" aria-label="Privacy page">
          <Link to="/">Home</Link>
          <Link to="/login">Sign in</Link>
        </nav>
      </header>

      <main className="privacy-main">
        <p className="privacy-kicker">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="privacy-updated">Last updated: {LAST_UPDATED}</p>
        <p className="privacy-lead">
          Illuminate Medical Aesthetics (“Illuminate,” “we,” “us,” or “our”) respects your privacy.
          This Policy explains how we collect, use, store, and share information when you use our
          website, client portal, and Illuminate mobile app.
        </p>

        <section>
          <h2>1. Who this covers</h2>
          <p>This Policy applies to:</p>
          <ul>
            <li>Visitors to our public website and booking calendar</li>
            <li>Clients using the web portal or mobile app</li>
            <li>People who message us through in-app Chat Support</li>
          </ul>
          <p>
            Clinic staff tools (POS, inventory, HR, and related admin pages) are for authorized
            employees and contractors and are governed by our internal policies in addition to this
            notice.
          </p>
        </section>

        <section>
          <h2>2. Information we collect</h2>
          <h3>Account &amp; profile</h3>
          <ul>
            <li>Name, email address, phone number</li>
            <li>Birthday, age, sex/gender, and address (when you provide them)</li>
            <li>Login credentials (passwords are stored securely by our auth provider)</li>
          </ul>
          <h3>Bookings &amp; care</h3>
          <ul>
            <li>Appointment date/time, service requested (including custom service text), notes/goals</li>
            <li>Medical history, allergies, or treatment-related notes you or our clinicians record</li>
            <li>Visit history, package/session usage, and doctor or care notes tied to your profile</li>
            <li>Consent form PDFs uploaded by clinic staff to your client record</li>
          </ul>
          <h3>Payments &amp; loyalty</h3>
          <ul>
            <li>Loyalty points and cash-in / wallet balances and related transactions</li>
            <li>Cash-in receipt images you upload in Chat Support for verification</li>
            <li>Sale and payment proof images retained by the clinic for reconciliation</li>
          </ul>
          <h3>Communications &amp; device</h3>
          <ul>
            <li>Support chat messages and attachments</li>
            <li>Push notification tokens on mobile (so we can send booking and wallet alerts)</li>
            <li>Basic technical logs needed to secure and operate the service (for example, approximate
              timestamps of sign-in activity)</li>
          </ul>
        </section>

        <section>
          <h2>3. How we use information</h2>
          <ul>
            <li>Schedule, confirm, remind, and manage appointments</li>
            <li>Provide treatments and maintain your client care record</li>
            <li>Process loyalty points, wallet top-ups, and in-clinic sales</li>
            <li>Respond to support and cash-in verification requests</li>
            <li>Send service notices (booking status, reminders, wallet updates) when enabled</li>
            <li>Improve safety, prevent fraud/abuse, and comply with legal obligations</li>
          </ul>
          <p>We do not sell your personal information.</p>
        </section>

        <section>
          <h2>4. How we share information</h2>
          <p>We may share information only as needed with:</p>
          <ul>
            <li>
              <strong>Clinic staff</strong> (Owner, Admin, Receptionist, and other authorized roles)
              to serve your visit and account
            </li>
            <li>
              <strong>Service providers</strong> that host our systems (for example cloud database,
              authentication, file storage, and push delivery). They process data on our instructions
            </li>
            <li>
              <strong>Authorities</strong> when required by law, regulation, or valid legal process
            </li>
          </ul>
          <p>
            Payment screenshot and cash-in receipt images are visible to authorized clinic staff for
            verification; they are not published publicly.
          </p>
        </section>

        <section>
          <h2>5. Mobile app</h2>
          <p>
            The Illuminate client app (package <code>com.illuminate.client</code>) uses the same
            account and clinic systems as the website. Permissions we may request include:
          </p>
          <ul>
            <li>Photos / media — so you can attach cash-in receipts in Chat Support</li>
            <li>Notifications — for booking and wallet updates when you allow them</li>
          </ul>
          <p>You can revoke device permissions in your phone settings at any time.</p>
        </section>

        <section>
          <h2>6. Retention</h2>
          <p>
            We keep client records for as long as needed to provide care, meet clinic operations,
            resolve disputes, and satisfy legal or professional record-keeping requirements. Support
            chats, receipts, and logs may be retained for audit and security. You may ask us to update
            or delete account data where applicable; some clinical records may need to be retained
            even after an app account is closed.
          </p>
        </section>

        <section>
          <h2>7. Security</h2>
          <p>
            We use industry-standard safeguards such as encrypted transport (HTTPS), access controls,
            and role-based permissions. No method of transmission or storage is 100% secure; please
            use a strong password and do not share your login.
          </p>
        </section>

        <section>
          <h2>8. Your choices</h2>
          <ul>
            <li>Update profile details in the portal or mobile app settings</li>
            <li>Turn off push notifications in your device settings</li>
            <li>Contact the clinic to correct information or request account closure</li>
          </ul>
        </section>

        <section>
          <h2>9. Children</h2>
          <p>
            Our services are intended for adults and clients under appropriate guardian supervision
            where required by clinic policy. We do not knowingly create independent accounts for
            children without proper consent processes at the clinic.
          </p>
        </section>

        <section>
          <h2>10. Changes to this Policy</h2>
          <p>
            We may update this Policy from time to time. The “Last updated” date at the top will
            change when we do. Continued use of our website or app after an update means you accept
            the revised Policy.
          </p>
        </section>

        <section>
          <h2>11. Contact</h2>
          <p>
            Questions about privacy or your data: contact Illuminate Medical Aesthetics through the
            clinic’s published phone/email channels, or message us via in-app / portal{' '}
            <strong>Support</strong>.
          </p>
        </section>

        <p className="privacy-back">
          <Link to="/">← Back to home</Link>
        </p>
      </main>

      <footer className="landing-footer">
        <span>Illuminate Medical Aesthetics</span>
        <div className="landing-footer-actions">
          <Link className="landing-footer-link" to="/privacy">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  )
}
