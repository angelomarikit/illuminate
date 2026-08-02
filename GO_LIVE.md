# Illuminate Medical Aesthetics — Go Live Guide

This guide covers everything needed to connect **Supabase** (backend) and publish the app on **Vercel** (live URL).

| Doc | Purpose |
|-----|---------|
| [docs/SUPABASE.md](./docs/SUPABASE.md) | Create project, schema, auth, storage, wire the React app |
| [docs/VERCEL.md](./docs/VERCEL.md) | Deploy to Vercel, env vars, custom domain, SPA routing |

---

## Current app state

- Frontend: **Vite + React + TypeScript**
- Auth: **Supabase Auth** (login / register / logout / session)
- Live data so far: **Branches** + **Customers**
- Other modules still use mock data until wired
- Next: finish remaining modules, then host on **Vercel**

---

## Recommended order

1. Push this repo to **GitHub** (or GitLab / Bitbucket).
2. Create a **Supabase** project and follow [docs/SUPABASE.md](./docs/SUPABASE.md).
3. Add env vars locally, install `@supabase/supabase-js`, wire auth + tables.
4. Deploy to **Vercel** following [docs/VERCEL.md](./docs/VERCEL.md).
5. Add the same Supabase env vars in the Vercel project settings.
6. Test login, POS, appointments, and image upload on the live URL.

---

## Quick checklist

### Before go-live

- [ ] Code is in a Git remote
- [ ] `npm run build` succeeds locally
- [ ] Supabase project created
- [ ] SQL schema applied
- [ ] Auth email/password enabled
- [ ] Storage bucket for consultation images (optional for first launch)
- [ ] `.env` created locally from `.env.example` (never commit secrets)
- [ ] Vercel project connected to the repo
- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in Vercel
- [ ] Production login/register tested
- [ ] Mobile login cover + sidebar look correct on phone

### After go-live

- [ ] Create first real clinic admin user
- [ ] Disable or remove demo localStorage auth path
- [ ] Set branch names / staff roles in Settings
- [ ] Turn on RLS policies for every table
- [ ] (Optional) Add custom domain in Vercel

---

## Environment variables

Create a local `.env` file (see `.env.example`):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key
```

In Vite, only variables prefixed with `VITE_` are exposed to the browser.

**Never commit:**

- Service role key
- Database password
- Real `.env` files with secrets

---

## Useful commands

```bash
# Install
npm install

# Local development
npm run dev

# Production build (same command Vercel runs)
npm run build

# Preview the production build locally
npm run preview
```

---

## Support map (what goes to Supabase later)

| App module | Supabase |
|------------|----------|
| Login / Register / Logout | Auth (`auth.users`) + `profiles` |
| Branches | `branches` |
| Customers + loyalty wallet | `customers`, `loyalty_transactions` |
| Services / products | `services` |
| Inventory | `inventory_items` |
| Appointments / walk-in / QR | `appointments` |
| POS + sales proof | `sales`, `sale_items` |
| Expenses | `expenses` |
| Staff time / leaves | `staff`, `attendance`, `leave_requests` |
| AI consultations before/after | `consultations` + Storage |
| Chat (phase 2) | Realtime + `messages` |

---

## Need help next?

When you are ready to implement (not only document), ask to:

1. Install Supabase client and replace `AuthContext`
2. Generate typed DB helpers
3. Migrate mock pages one module at a time (Customers → Appointments → POS)
