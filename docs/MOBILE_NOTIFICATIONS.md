# Client notifications + Expo push

Mobile Clients get an in-app inbox (header bell) and device push for booking updates.

## What Clients receive

| Event | Source |
|---|---|
| Booking request received | DB trigger on appointment insert (`pending`) |
| Booking approved | DB trigger when status → `confirmed` |
| Booking declined | DB trigger when status → `declined` |
| Booking cancelled | DB trigger when status → `cancelled` |
| Visit starting soon | Derived on device (within 2 hours) + local reminder ~1 hour before |
| Successful wallet top-up | DB trigger on positive Loyalty cash-in (`wallet_topup`) |

## 1. Run SQL

Supabase → SQL Editor → run (in order):

1. `supabase/add_client_notifications.sql`
2. `supabase/add_cashin_receipt_and_wallet_notify.sql` (receipt images on chat + wallet top-up notices)

Cash-in receipt photos from mobile upload to the `chat-attachments` bucket and appear on the Chat Support bubble.

## 2. Deploy push Edge Function

```bash
supabase functions deploy send-client-push --no-verify-jwt
```

## 3. Wire Database Webhook (required for remote push)

Supabase → Database → Webhooks → Create:

- Table: `client_notifications`
- Events: **Insert**
- Type: Supabase Edge Function
- Function: `send-client-push`

When reception approves/declines a booking, a row is inserted and the function sends an [Expo push](https://docs.expo.dev/push-notifications/overview/) to stored tokens.

## 4. Mobile app

- Header bell opens `/notifications`
- On login, the app asks for notification permission and stores the Expo token in `push_tokens`
- Remote push needs a **development/production build** (not Expo Go for full reliability on SDK 57); local upcoming reminders still work

## 5. EAS project id

Set `extra.eas.projectId` via `eas init` so `getExpoPushTokenAsync` works in production builds.
