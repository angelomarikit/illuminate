# Deploy Illuminate on Vercel

Publish this Vite + React app to a live URL (e.g. `https://illuminate.vercel.app`).

---

## 1. Prerequisites

- GitHub / GitLab / Bitbucket account
- This project pushed to a remote repository
- Vercel account at [https://vercel.com](https://vercel.com)
- (Recommended) Supabase project ready — see [SUPABASE.md](./SUPABASE.md)

Local build must succeed first:

```bash
npm install
npm run build
```

If `npm run build` fails, fix errors before deploying.

---

## 2. Push code to GitHub

If the repo is not remote yet:

```bash
git init
git add .
git commit -m "Initial Illuminate Medical Aesthetics app"
git branch -M main
git remote add origin https://github.com/YOUR_USER/illuminate.git
git push -u origin main
```

Make sure `.env` is **not** committed (it is listed in `.gitignore`).

---

## 3. Import project in Vercel

1. Go to [https://vercel.com/new](https://vercel.com/new)
2. **Import** your Git repository
3. Framework preset should detect **Vite**
4. Confirm settings:

| Setting | Value |
|---------|--------|
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |
| Root Directory | `.` (repo root) |

5. Click **Deploy**

First deploy may work even before Supabase is wired (UI with mock data). Auth will still be localStorage until Supabase is connected.

---

## 4. Add environment variables

**Vercel → Project → Settings → Environment Variables**

Add:

| Name | Value | Environments |
|------|--------|--------------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | your anon public key | Production, Preview, Development |

Then **Redeploy** (Deployments → … → Redeploy) so the new vars are baked into the build.

Vite embeds `VITE_*` variables at **build time**, not runtime. Changing env vars always requires a new deploy.

---

## 5. SPA routing (already configured)

This app uses React Router. Direct visits like `/login` or `/pos` must rewrite to `index.html`.

The repo includes `vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Do not remove this file, or refresh on nested routes will 404.

---

## 6. Connect Supabase Auth URLs

In Supabase:

**Authentication → URL Configuration**

- **Site URL:** `https://YOUR_PROJECT.vercel.app`
- **Redirect URLs:**  
  - `https://YOUR_PROJECT.vercel.app/**`  
  - `http://localhost:5173/**` (for local dev)

If you add a custom domain later, add that domain here too.

---

## 7. Custom domain (optional)

1. Vercel → Project → **Settings → Domains**
2. Add `clinic.yourdomain.com` (or similar)
3. Follow DNS instructions (CNAME / A records)
4. Update Supabase Site URL + Redirect URLs to the custom domain
5. Redeploy if needed

---

## 8. Continuous deployment

After the Git integration is connected:

- Push to `main` → Production deploy
- Open a PR → Preview deploy URL

Useful for testing Supabase changes before production.

---

## 9. Post-deploy checklist

- [ ] Live URL loads
- [ ] `/login` works on refresh (SPA rewrite OK)
- [ ] Mobile cover image looks correct
- [ ] Sidebar logo looks correct
- [ ] Login / register works against Supabase (after wiring)
- [ ] Logout returns to `/login`
- [ ] Protected pages redirect when logged out
- [ ] Desktop and phone layouts look good

---

## 10. Common issues

### Blank page after deploy

- Open browser DevTools → Console
- Usually missing `VITE_SUPABASE_*` after you start requiring them in code
- Or a JS error — check the build logs in Vercel

### 404 on `/login` or `/pos`

- Confirm `vercel.json` rewrites exist
- Redeploy after adding the file

### Env vars not working

- Names must start with `VITE_`
- Redeploy after adding/changing vars
- Do not use `NEXT_PUBLIC_` (that is Next.js only)

### Auth redirect loops

- Supabase Site URL must match the Vercel URL
- Clear site data / try incognito

### Build fails on Vercel but works locally

- Check Node version (Vercel Project Settings → General → Node.js)
- Use Node **20.x** if unsure
- Read the full build log for TypeScript errors

---

## 11. Deploy via Vercel CLI (optional)

```bash
npm i -g vercel
vercel login
vercel
vercel --prod
```

CLI will prompt for project setup. Still add env vars in the dashboard or:

```bash
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
```

---

## 12. Security reminders

- Only expose the **anon** key to Vercel/`VITE_` vars
- Keep **service_role** key server-side only (never in this Vite app)
- Enable RLS on all Supabase tables before public traffic
- Restrict Storage policies for consultation images

---

## Next step

After the first Vercel URL is live, continue with [SUPABASE.md](./SUPABASE.md) implementation in code, then redeploy.
