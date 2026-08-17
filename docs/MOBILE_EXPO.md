# Illuminate Client — Expo Mobile App

React Native (Expo) client for Illuminate Medical Aesthetics. Same Supabase project as the web app. **Client role only** — clinic staff use the web dashboard.

Design: white / clean canvas with Illuminate gold for CTAs, labels, and accents (Hers-inspired signup layout: brand wordmark, large title, stacked fields, primary button, sign-in link).

> Mobbin “Hers” search requires a [Mobbin paid plan](https://mobbin.com/pricing). Until that is enabled, auth screens follow that wellness signup pattern with Illuminate branding.

---

## What ships in `mobile/`

| Tab / screen | Feature (mirrors web portal) |
|---|---|
| **Care** | Welcome, points, wallet, upcoming visits, shortcuts |
| **Book** | Calendar + time slots via `list_booked_slots` + `submit_public_booking_register` |
| **Visits** | Appointment history |
| **Rewards** | Loyalty points, wallet balance, recent transactions |
| **Profile** | Account details, notes, support, logout |
| **Notes** (modal) | Doctor notes + care comments |
| **Support** (modal) | Message clinic (`chat_threads` / `chat_messages`) |

---

## 1. Prerequisites

- Node 20+
- Expo account: [expo.dev](https://expo.dev)
- Same Supabase project as web (URL + **anon** key)
- Booking SQL applied: `supabase/add_receptionist_and_client_booking.sql`
- For store builds: Apple Developer ($99/yr) and/or Google Play Console (~$25 one-time)

---

## 2. Local setup

```bash
cd mobile
cp .env.example .env
```

Put the **same** values you use on web (rename prefixes):

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key_here
```

Install and run:

```bash
npm install
npx expo start
```

- Press `i` for iOS Simulator (macOS + Xcode)
- Press `a` for Android Emulator
- Scan the QR code with **Expo Go** on a physical device (dev only)

Create a Client user on the website (or book as a new client), then sign in with that email/password in the app.

---

## 3. Architecture (one database)

```
Web (Vite)  ──┐
              ├──  Supabase Auth + Postgres + RLS
Expo app    ──┘
```

- Auth: Supabase email/password; session stored in AsyncStorage
- Mobile rejects non-`Client` roles at login
- Booking uses existing RPC `submit_public_booking_register` with `p_is_existing_client: true`
- No separate mobile backend required

---

## 4. Go live with EAS (recommended)

Expo Application Services builds signed iOS/Android binaries in the cloud. You do **not** need a Mac for Android; you **do** need an Apple Developer account for App Store / TestFlight.

### 4.1 Install CLI and log in

```bash
cd mobile
npm install -g eas-cli   # or use npx eas-cli …
eas login
eas init                 # links project; writes projectId into app.json
```

Replace placeholders in `app.json`:

- `extra.eas.projectId` — set by `eas init`
- `owner` — your Expo username or org
- `ios.bundleIdentifier` / `android.package` — keep `com.illuminate.client` or change before first store submit (cannot change freely later)

### 4.2 Environment variables on EAS

Local `.env` is **not** uploaded by default. Set secrets for cloud builds:

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://….supabase.co" --environment production
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ…" --environment production
```

Also create the same for `preview` / `development` if you use those profiles (`eas.json`).

Or in [expo.dev](https://expo.dev) → Project → Environment variables.

### 4.3 Build profiles (`eas.json`)

| Profile | Use |
|---|---|
| `development` | Dev client (internal) |
| `preview` | Internal APK / ad-hoc testing |
| `production` | App Store / Play Store |

```bash
# Android APK for staff testing (no Play Store yet)
eas build --platform android --profile preview

# Production store binaries
eas build --platform all --profile production
```

First iOS production build will walk you through Apple credentials (EAS can manage certificates).

### 4.4 TestFlight (iOS)

1. Complete [App Store Connect](https://appstoreconnect.apple.com) app listing (name, bundle id matching `com.illuminate.client`).
2. After a successful production iOS build:

```bash
eas submit --platform ios --profile production
```

3. In App Store Connect → TestFlight → add internal/external testers.
4. When ready, submit for App Review from App Store Connect.

### 4.5 Google Play

1. Create the app in [Play Console](https://play.google.com/console) with package `com.illuminate.client`.
2. Complete store listing, content rating, privacy policy URL.
3. Submit the AAB:

```bash
eas submit --platform android --profile production
```

4. Use **Internal testing** track first, then promote to Production.

### 4.6 Over-the-air updates (optional)

For JS-only fixes after the app is live (no native module changes):

```bash
npx eas-cli update --branch production --message "Fix booking copy"
```

Requires `expo-updates` configured; add when you are ready for OTA.

---

## 5. Store checklist

- [ ] Privacy policy URL (same as website) — public page: `/privacy`
- [ ] Support email / clinic contact
- [ ] Screenshots (iPhone 6.7" + Android phone)
- [ ] App icons / splash already point at warm `#f5f0e8` in `app.json`
- [ ] Supabase Auth → redirect / allow Expo scheme `illuminate://` if you add deep links later
- [ ] RLS: Client policies already used by web portal must remain enabled

---

## 6. Branding assets

Replace before store submit:

- `assets/images/icon.png` (1024×1024)
- Android adaptive foreground/background
- `splash-icon.png`

Keep canvas `#f5f0e8` and gold `#b8954a` for consistency with web.

---

## 7. Troubleshooting

| Issue | Fix |
|---|---|
| “Missing EXPO_PUBLIC_…” | Copy `.env.example` → `.env` and restart Expo |
| Staff can log into web but not mobile | Expected — Client role only |
| Booking RPC errors | Run `supabase/add_receptionist_and_client_booking.sql` |
| Expo Go can’t load custom native code | Use `eas build --profile development` for a dev client |
| Android icons missing | Fixed via Ionicons in tab bar (iOS + Android) |
| **“Project incompatible with Expo Go”** | App Store Expo Go stops at **SDK 54**; this app is **SDK 57**. Do **not** rely on the store app — use one of the options in §7.1 |

### 7.1 Run without App Store Expo Go (SDK 57)

**Option A — Install matching Expo Go (fastest try)**  
Open [expo.dev/go](https://expo.dev/go), choose **SDK 57** + your phone OS, install that build, then scan the QR from `npx expo start` again.  
iOS alternate: [sign.expo.dev](https://sign.expo.dev/) for a signed Expo Go for your SDK.

**Option B — Development build (recommended for real testing)**  
No Expo Go. Install your own Illuminate client:

```bash
cd mobile
eas login
eas init
eas build --platform android --profile development   # or ios
```

Install the build from the EAS link, then:

```bash
npx expo start --dev-client
```

**Option C — Preview APK (Android, no Mac / no Expo Go)**  

```bash
eas build --platform android --profile preview
```

Install the APK on the phone; it talks to the same Supabase backend.

**Option D — Browser preview (UI only)**  

```bash
npx expo start --web
```

**Option E — Downgrade to SDK 54** only if you must use App Store Expo Go (not preferred for this project).

---

## 8. Monorepo note

Web stays at repo root; mobile is isolated under `mobile/` with its own `package.json`. Deploy web on Vercel as today; ship mobile via EAS. Both share one Supabase project.
