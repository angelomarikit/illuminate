# Illuminate Medical Aesthetics

Clinic POS and operations dashboard for **Illuminate Medical Aesthetics** — React + TypeScript, black & white professional UI.

## Features

- Dashboard KPIs and revenue charts
- POS checkout with loyalty points + cash-in wallet
- Sales proof / receipts
- Appointment calendar + walk-ins
- Customers, services, inventory, expenses
- AI consultations (before / after)
- Staff time in/out and leaves
- Loyalty & points management
- QR check-in
- Chat support placeholder (mobile app later)
- Multi-branch aware settings
- Login / register / logout

## Stack

- Vite + React 19 + TypeScript
- React Router
- Recharts
- Lucide icons
- Custom CSS design tokens (no Tailwind)
- Supabase-ready (see docs)

## Develop

```bash
npm install
npm run dev
```

Demo login (local mock auth):

```text
admin@illuminate.ph / illuminate
```

## Go live (Supabase + Vercel)

Start here:

- **[GO_LIVE.md](./GO_LIVE.md)** — full checklist
- **[docs/SUPABASE.md](./docs/SUPABASE.md)** — connect database, auth, storage
- **[docs/VERCEL.md](./docs/VERCEL.md)** — deploy live on Vercel

Copy env template:

```bash
cp .env.example .env
```

Then fill in your Supabase URL and anon key.
