# Facebook Messenger → Illuminate Chat (with Auto-Reply)

Step-by-step plan to show Facebook Page messages inside the Illuminate web app (`/chat`), reply from the app, and set up **auto-responses** based on what the customer says.

This is an integration guide. Code for Edge Functions / UI can be built after these prerequisites are ready.

---

## Goal

| Capability | Result |
|---|---|
| Inbox sync | Messages to your Facebook Page appear in Illuminate **Chat Support** |
| Staff reply | Staff can answer from `/chat` and the customer sees it in Messenger |
| Auto-reply | Configurable rules (keywords / welcome / outside hours) send automatic responses |
| Future | Same pattern can later support Instagram DMs |

---

## Architecture (how data flows)

```text
Customer (Messenger)
    → Meta Webhook (HTTPS)
    → Supabase Edge Function: messenger-webhook
    → Save into chat_threads + chat_messages
    → Illuminate /chat (Realtime)

Staff reply in /chat
    → Supabase Edge Function: messenger-send
    → Meta Send API
    → Customer Messenger

Auto-reply engine (same Edge Function after inbound message)
    → Match rules in chat_auto_replies
    → Call Meta Send API
    → Also store bot reply in chat_messages
```

**Important:** Meta cannot talk to your Vite React app directly. A server endpoint (Supabase Edge Function) is required for webhooks and sending.

---

## Phase 0 — Prerequisites (do these first)

### 0.1 Business / Page

1. You must be an **admin** of the Facebook Page (e.g. *Illuminate Aesthetics*).
2. Page messaging must be enabled (Page settings → messaging).
3. Prefer a **Business** Facebook presence (Meta Business Suite / Business Manager).

### 0.2 Illuminate app

1. Chat page already exists at `/chat` using:
   - `public.chat_threads`
   - `public.chat_messages`
2. Supabase project is live (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. You can deploy Supabase Edge Functions (`supabase` CLI logged in).

### 0.3 Secrets you will create later

Store these in **Supabase Edge Function secrets** (never in Vite / browser):

| Secret | Purpose |
|---|---|
| `META_VERIFY_TOKEN` | Random string you invent for webhook verification |
| `META_APP_SECRET` | App secret from Meta (verify webhook signatures) |
| `META_PAGE_ACCESS_TOKEN` | Long-lived Page token for send/receive |
| `META_PAGE_ID` | Your Facebook Page ID |

---

## Phase 1 — Create the Meta Developer App

1. Go to [Meta for Developers](https://developers.facebook.com/).
2. **My Apps → Create App**.
3. Choose a type that supports Messenger (commonly **Business**).
4. Open the app dashboard.
5. Add product: **Messenger**.
6. Note these values (App settings → Basic):
   - **App ID**
   - **App Secret** → will become `META_APP_SECRET`

### 1.1 Connect your Facebook Page

1. In Messenger settings, connect / select **Illuminate Aesthetics** (your Page).
2. Generate a **Page Access Token**.
3. Convert it to a **long-lived** token (Meta docs: exchange short-lived → long-lived Page token).
4. Save as `META_PAGE_ACCESS_TOKEN`.
5. Copy **Page ID** → `META_PAGE_ID`.

### 1.2 Permissions to request

For development/testing (app roles only):

- `pages_show_list`
- `pages_messaging`
- `pages_manage_metadata`
- `business_management` (often required as a dependency)

For **public customers** (anyone messaging the Page), you must pass **App Review** for messaging permissions.

Until App Review is approved:

- Only users with a role on the Meta app (Admin / Developer / Tester) can successfully message-test end-to-end.

---

## Phase 2 — Database changes (Illuminate)

Extend chat tables so Facebook conversations are identifiable.

### 2.1 Suggested columns on `chat_threads`

| Column | Type | Purpose |
|---|---|---|
| `channel` | text | `'facebook'`, `'internal'`, later `'instagram'` |
| `external_user_id` | text | Messenger PSID (person ID) |
| `external_page_id` | text | Facebook Page ID |
| `customer_name` | text | Display name (from Graph API profile if available) |
| `auto_reply_enabled` | boolean | Per-thread mute for bot (default true) |

Unique index idea:

- `(channel, external_user_id)` so each Messenger user maps to one thread.

### 2.2 Suggested columns on `chat_messages`

| Column | Type | Purpose |
|---|---|---|
| `external_message_id` | text | Meta `mid` (dedupe webhooks) |
| `sender` | text | `'customer'`, `'staff'`, `'bot'` |
| `delivery_status` | text | optional: `received`, `sent`, `failed` |

### 2.3 New table: `chat_auto_replies`

Configurable auto-response rules staff/Owner can manage in Settings or Chat.

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Internal label, e.g. “Welcome”, “Pricing”, “After hours” |
| `is_active` | boolean | On/off |
| `priority` | int | Lower number = checked first |
| `match_type` | text | `keyword`, `contains`, `exact`, `welcome`, `outside_hours`, `fallback` |
| `match_value` | text | e.g. `price`, `booking`, `location` (nullable for welcome/fallback) |
| `response_text` | text | Message body sent to customer |
| `channel` | text | `'facebook'` or `'all'` |
| `active_days` | text[] / jsonb | Optional schedule |
| `active_from` | time | Optional start (clinic local time) |
| `active_to` | time | Optional end |
| `created_at` / `updated_at` | timestamptz | Audit |

Example rules:

1. **Welcome** — first message in a new thread → “Thank you for messaging Illuminate Medical Aesthetics. How can we help you today?”
2. **Keyword `book` / `appointment`** → “You can reserve online here: https://YOUR_SITE/ #book — our team will confirm.”
3. **Keyword `price` / `rates`** → short pricing guidance + “For exact quotes, book a consultation.”
4. **Outside hours** — if message arrives outside clinic hours → “We’re currently closed. We’ll reply on our next business day.”
5. **Fallback** — if no keyword matches and staff haven’t replied yet → optional soft prompt (use carefully; avoid spamming).

### 2.4 RLS notes

- Staff/Owner/Admin: read/write chat tables (existing clinic auth).
- Edge Functions use **service role** to insert webhook messages (bypass RLS safely on server only).

---

## Phase 3 — Supabase Edge Functions

Create two functions (names can vary):

### 3.1 `messenger-webhook`

**Responsibilities**

1. **GET** — Meta verification challenge  
   - Meta sends `hub.mode`, `hub.verify_token`, `hub.challenge`  
   - If `hub.verify_token === META_VERIFY_TOKEN`, return `hub.challenge`
2. **POST** — inbound events  
   - Verify `X-Hub-Signature-256` with `META_APP_SECRET`  
   - Parse `entry[].messaging[]`  
   - For each message:
     - Upsert `chat_threads` by `(channel='facebook', external_user_id=PSID)`  
     - Insert `chat_messages` (skip if `external_message_id` already exists)  
     - Run **auto-reply engine** (Phase 5)  
   - Always respond `200 OK` quickly (Meta retries on failure)

**Webhook URL (after deploy)**

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/messenger-webhook
```

### 3.2 `messenger-send`

**Responsibilities**

1. Accept authenticated staff request: `{ threadId, body }`
2. Load thread → get `external_user_id` + confirm `channel = 'facebook'`
3. Call Meta Send API:

```http
POST https://graph.facebook.com/v21.0/me/messages
Authorization: Bearer {META_PAGE_ACCESS_TOKEN}
```

Body (simplified):

```json
{
  "recipient": { "id": "PSID" },
  "messaging_type": "RESPONSE",
  "message": { "text": "Your reply here" }
}
```

4. Store staff message in `chat_messages`
5. Update thread preview / `updated_at`

### 3.3 Set secrets

```bash
supabase secrets set META_VERIFY_TOKEN="your-random-string"
supabase secrets set META_APP_SECRET="your-app-secret"
supabase secrets set META_PAGE_ACCESS_TOKEN="your-long-lived-page-token"
supabase secrets set META_PAGE_ID="your-page-id"
```

Deploy:

```bash
supabase functions deploy messenger-webhook
supabase functions deploy messenger-send
```

---

## Phase 4 — Configure Meta Webhooks

1. Meta App → **Messenger → Settings → Webhooks**.
2. Callback URL = your `messenger-webhook` URL.
3. Verify token = same value as `META_VERIFY_TOKEN`.
4. Subscribe to fields (minimum):
   - `messages`
   - `messaging_postbacks` (optional, for buttons)
   - `message_echoes` (optional, to sync messages sent from Meta inbox)
5. Subscribe the **Page** to the app (`subscribed_apps` / dashboard toggle).
6. Test with **Send to Test Users** / app-role accounts first.

### 4.1 Common webhook failures

| Problem | Fix |
|---|---|
| Verification fails | Verify token mismatch, or GET handler not returning challenge as plain text |
| No events after messaging | Page not subscribed; wrong Page; app in Dev Mode and sender has no role |
| Duplicate messages | Deduplicate with `external_message_id` / Meta `mid` |
| Signature invalid | Wrong `META_APP_SECRET`, or body parsed before raw signature check |

---

## Phase 5 — Auto-response engine (setup & behavior)

Auto-replies run **on the server** when an inbound Facebook message is saved.

### 5.1 Matching order (recommended)

1. If thread has `auto_reply_enabled = false` → skip bot  
2. If **outside_hours** rule active and now is outside schedule → send that reply, stop  
3. If thread is brand new and **welcome** rule exists → send welcome (once per thread)  
4. Check **keyword / contains / exact** rules by `priority`  
5. Optional **fallback** (rate-limit: e.g. once per 24h per thread)

### 5.2 Example clinic rules (starter pack)

| Priority | Type | Match | Response idea |
|---:|---|---|---|
| 10 | outside_hours | — | Closed-hours message + next open time |
| 20 | welcome | — | Welcome + link to `#book` on website |
| 30 | contains | `book`, `appointment`, `reserve` | Send booking link |
| 40 | contains | `price`, `rate`, `how much` | Direct to consultation / service gallery |
| 50 | contains | `address`, `location`, `where` | Ayala Capitol Central, Bacolod City |
| 90 | fallback | — | “Thanks — a specialist will reply shortly.” |

### 5.3 Admin UI to add later (in Illuminate)

Under **Settings** or a **Chat → Auto-replies** panel (Owner/Admin only):

- List rules (active toggle)
- Create / edit: name, match type, keywords, response text
- Schedule (days + from/to, Asia/Manila)
- Test box: “If customer says X, which rule fires?”
- Per-thread “Mute auto-reply” when a human takes over

### 5.4 Good auto-reply practices

- Keep replies short and on-brand (white/gold clinic tone in wording, not spammy).
- Always offer a human path: “Reply here anytime — our team will assist.”
- Don’t auto-reply to every message forever (use welcome once + keyword hits).
- Respect Meta’s **24-hour messaging window** (RESPONSE type after customer message).
- Log bot sends as `sender = 'bot'` so staff can see what the customer already received.

---

## Phase 6 — Illuminate Chat UI changes

Update `/chat` so Facebook feels native:

1. Show channel badge: **Facebook** on threads.
2. Realtime subscribe to `chat_messages` / `chat_threads` (Supabase Realtime).
3. When staff send:
   - If `channel === 'facebook'` → call `messenger-send` Edge Function  
   - Else → existing local insert only
4. Show bot messages differently (e.g. subtle “Auto-reply” label).
5. Button: **Mute auto-replies** on the active thread.
6. Optional filter chips: All / Facebook / Internal.

---

## Phase 7 — Testing checklist

### Development mode

- [ ] Webhook verifies in Meta dashboard (green / success)
- [ ] Tester account messages the Page
- [ ] Thread appears in Illuminate `/chat`
- [ ] Customer text appears as a message
- [ ] Welcome / keyword auto-reply is received in Messenger
- [ ] Staff reply from `/chat` arrives in Messenger
- [ ] Duplicate webhook delivery does not create duplicate rows

### Before going live

- [ ] Long-lived Page token stored only in Edge secrets
- [ ] Signature verification enabled
- [ ] Auto-reply rules reviewed by Owner
- [ ] Outside-hours schedule matches clinic hours (Bacolod / Asia/Manila)
- [ ] App Review submitted & approved for messaging permissions
- [ ] Monitoring: function logs for send failures

---

## Phase 8 — Meta App Review (required for real customers)

1. In Meta App Dashboard → **App Review**.
2. Request messaging-related permissions (`pages_messaging`, etc.).
3. Provide:
   - Screencast of inbox + reply from Illuminate
   - Privacy policy URL
   - Clear use case: “Clinic staff reply to Page customers inside our POS/admin app”
4. After approval, switch app to **Live**.
5. Re-test with a personal Facebook account that is **not** an app role.

---

## Phase 9 — Rollout order (recommended)

1. DB migration (thread external IDs + `chat_auto_replies`)
2. Deploy `messenger-webhook` + verify with Meta
3. Inbound messages visible in `/chat` (read-only first)
4. Deploy `messenger-send` + staff replies
5. Seed starter auto-reply rules
6. Build Owner/Admin UI to edit auto-replies
7. App Review → Live
8. Optional: Instagram Messaging (same platform, extra permissions)

---

## Security checklist

- Never put Page tokens in `VITE_*` env vars or client code
- Verify Meta signatures on every webhook POST
- Use service role only inside Edge Functions
- Rate-limit auto-replies per thread
- Allow staff to mute bot per conversation
- Do not store unnecessary personal data beyond chat needs

---

## What Illuminate already has vs what to build

| Already in app | Still to build |
|---|---|
| `/chat` UI | Meta App + webhook |
| `chat_threads` / `chat_messages` | External IDs + channel fields |
| Staff auth / roles | Edge Functions send/receive |
| Supabase backend | `chat_auto_replies` + matcher |
| — | Auto-reply admin UI |
| — | Meta App Review |

---

## Owner checklist (non-technical)

1. Confirm you are Facebook Page admin.
2. Decide welcome message + booking link text.
3. Decide clinic hours for after-hours auto-reply.
4. List common questions (price, location, booking) for keyword replies.
5. Approve privacy policy page for Meta App Review.
6. Assign who monitors `/chat` during open hours.

---

## Next implementation step

When you are ready to build this in the repo, ask to implement in this order:

1. SQL migration for Facebook fields + `chat_auto_replies`
2. `messenger-webhook` Edge Function (receive + auto-reply)
3. `messenger-send` Edge Function
4. `/chat` UI updates (badge, send via function, mute bot)
5. Owner/Admin **Auto-replies** settings page

---

## Useful Meta docs

- [Messenger Platform overview](https://developers.facebook.com/docs/messenger-platform/overview/)
- [Webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks/)
- [Send API](https://developers.facebook.com/docs/messenger-platform/reference/send-api/)
- [App Review](https://developers.facebook.com/docs/app-review/)
