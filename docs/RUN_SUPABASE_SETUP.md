# Run Supabase setup (required for buttons to work)

The app now writes to Supabase for clinic modules. Run this once in **your** project.

## 1. Open SQL Editor

Supabase Dashboard → **SQL Editor** → **New query**

## 2. Paste and run

Open the file in this repo:

`supabase/setup.sql`

Copy all of it → paste into SQL Editor → **Run**

This creates:

- tables (branches, customers, services, inventory, appointments, sales, expenses, loyalty, consultations, staff, attendance, leaves, settings, chat)
- RLS policies for authenticated staff
- profile trigger on signup
- seed branches / services / staff / chat threads
- storage bucket `consultations`

## 3. Auth settings (local testing)

**Authentication → Providers → Email**

- Enable Email
- For local testing, you can disable **Confirm email**

## 4. Confirm `.env` is your project

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 5. App roles + staff HR

After setup.sql, also run (in order):

1. `supabase/add_roles.sql`
2. `supabase/add_staff_hr.sql`
3. `supabase/add_profiles_hr.sql` (registered accounts + HR fields; clears demo staff/chat)
4. `supabase/add_store_open.sql` (branch open/closed toggle column)
5. `supabase/add_public_booking.sql` (landing page booking → appointments approvals)
6. `supabase/fix_public_booking_flow.sql` (website booking RPC + customer profile sync)
7. `supabase/add_client_feedback.sql` (landing feedback slider; Owner/Admin manage in app)
8. `supabase/add_delete_account.sql` (Owner/Admin delete accounts from Staff & Attendance)
9. `supabase/add_client_sessions.sql` (doctor-advised session packages from POS + Client Sessions page)
10. `supabase/add_pos_attribution.sql` (discount, doctor notes, administered/consult/sales by + care comments)
11. `supabase/add_customer_birthday.sql` (birthday on customers + public booking RPC)
12. `supabase/add_hr_role.sql` (HR role + payroll / incentive tables)
13. `supabase/add_account_self_view.sql` (each account can view own salary & incentives)
14. `supabase/add_membership_subscription.sql` (VIP ₱5,000 / VVIP ₱10,000 POS products + membership expiry)
15. `supabase/add_inventory_role.sql` (Inventory Specialist role + stocktake / receiving / reorder + service links)
16. `supabase/add_create_account.sql` (Owner/Admin/HR create clinic accounts + password vault)
17. `supabase/add_appointment_calendar_color.sql` (calendar color tags on appointments)
18. `supabase/add_appointment_cancellation_reason.sql` (cancel reason for cancelled appointments)
19. `supabase/add_notifications.sql` (role-scoped notification acknowledgments / unread state)
20. `supabase/add_service_categories.sql` (Owner/Admin custom service categories)
21. `supabase/add_receptionist_and_client_booking.sql` (rename Staff → Receptionist; landing booking registers Client account + portal RLS for notes/wallet/appointments)
22. `supabase/fix_public_register_client_role.sql` — `/register` and mobile signup always create **Client**
23. `supabase/fix_authenticated_client_booking.sql` (**required for mobile + portal book**) — creates/links CRM customer on signup; `submit_client_portal_booking` for signed-in Client booking
24. `supabase/add_client_notifications.sql` (**required for mobile bell + push**) — client inbox + push tokens + approve/decline triggers
25. `supabase/add_cashin_receipt_and_wallet_notify.sql` (**cash-in receipt images + wallet top-up alerts**) — `chat_messages.image_url`, storage bucket, notify on positive cash-in
26. `supabase/add_chat_conversation_tags.sql` (**required for mobile chat history + inbox tags**) — thread `user_id` / category / priority; message cash-in received status; client RLS
27. `supabase/fix_client_chat_message_insert.sql` — if mobile reply hits RLS on `chat_messages`, run this (adds client insert policy)
28. `supabase/add_chat_thread_close.sql` (**close conversations**) — staff can close threads; clients cannot message closed chats
29. `supabase/add_sale_payment_proof.sql` (**POS payment screenshots**) — `sales.payment_proof_url` + `sale-payment-proofs` storage bucket
30. `supabase/add_customer_consent_forms.sql` (**customer PDF consent forms**) — attachments on Customers for Receptionist / Admin / Owner
31. `supabase/add_stocktake_line_snapshots.sql` (**stocktake product history + delete**) — line item name snapshots, soft-delete inventory items from Stocktake
32. `supabase/fix_create_account_receptionist_role.sql` (**fix Create Account “Invalid role”**) — allow `Receptionist` in `create_clinic_account` (maps legacy `Staff`)
33. `supabase/add_admin_account_manage.sql` (**Admin edit/delete/reset password**) - `update_clinic_account` (details + optional password reset) + tightened `delete_clinic_account` (Admin/Owner; Admin cannot edit/delete Owner)
34. `supabase/add_inventory_issues.sql` (**Stock Assessment issued/used**) - `inventory_issues` + `inventory_issue_lines` for period assessment sheet
35. `supabase/add_customer_intake.sql` (**Register Clients intake**) - occupation, socials, medical checklist, lifestyle, history notes, dual signatures on `customers`
36. `supabase/add_service_series.sql` (**Services and Series**) - series plans with multiple category+service lines (`service_series` + `service_series_items`) for POS / Avail Service
37. `supabase/add_inventory_persistence.sql` (**Inventory catalog prices + Stock Assessment endings**) - `inventory_items.unit_cost` / `selling_price`, plus `inventory_assessment_endings` so Ending Inventory survives refresh
38. `supabase/add_sms_reminders.sql` (**Itexmo SMS confirmations & reminders**) - `sms_settings` + `sms_logs` for Owner/Admin SMS Reminders page

### Itexmo SMS (after #38)

**CLI login is optional.** Prefer the Dashboard so you stay on the correct Supabase account/project in the browser.

1. **SQL only for tables** — run `supabase/add_sms_reminders.sql` in SQL Editor (this project).
2. **Deploy Edge Function in Dashboard** (not possible via SQL — Deno code must be uploaded):
   - Open [project `qeuimffcaafjqdyayhdb`](https://supabase.com/dashboard/project/qeuimffcaafjqdyayhdb/functions) → **Edge Functions** → **Deploy a new function** / create `send-sms`
   - Paste the contents of `supabase/functions/send-sms/index.ts`
   - Turn **Verify JWT** **OFF** (auth is checked inside the function; this fixes browser CORS preflight)
3. **Secrets** (Dashboard → Edge Functions → Secrets, or Project Settings → Edge Functions):
   - `ITEXMO_EMAIL` — Itexmo login email/username
   - `ITEXMO_PASSWORD` — Itexmo password (never put in git / `VITE_*`)
   - `ITEXMO_API_CODE` — `PR-ILLUM594659_XXQTI`
   - Optional: `ITEXMO_SENDER_ID`, `SMS_CRON_SECRET`
   - API is `https://api.itexmo.com/api/broadcast` (V5). Classic `php_api` is broken (empty/500).
   - `ITEXMO_EMAIL` must be the **account email** from Itexmo Profile (Username `Illuminate` fails API auth).
   - `ITEXMO_PASSWORD` = dashboard password; `ITEXMO_API_CODE` = copy from dashboard.
   - If you get **Authorization error**: credentials worked, but Itexmo IP whitelist is blocking Supabase. Disable IP whitelisting in the Itexmo dashboard / ask support to allow API calls without whitelist. Do not set `ITEXMO_SENDER_ID` unless Itexmo approved that sender.
4. In the app: **System → SMS reminders** — templates, lead time, test send, log.
5. Schedule due reminders every 5–10 minutes (Dashboard → Edge Functions → `send-sms` → Schedules), body:
   `{"action":"send_due_reminders"}`  
   Or use **Run due reminders now** on the SMS page for manual testing.

CLI alternative (only if you already use that account):  
`npx supabase functions deploy send-sms --no-verify-jwt` after `link` to this project ref.

Mobile client (Expo) uses the **same** Supabase project. See `docs/MOBILE_EXPO.md`, `docs/MOBILE_NOTIFICATIONS.md`, and `mobile/.env.example` (`EXPO_PUBLIC_SUPABASE_*`).

Then promote your owner account (see `docs/ROLES.md`).

## 6. Restart and test

```bash
npm run dev
```

1. Register / login
2. Promote Owner via SQL (`docs/ROLES.md`)
3. Customers → Add Client
4. Services → Add Service
5. POS → complete a sale
6. Sales → Export CSV

If a button shows an RLS / permission error, re-run `setup.sql` and confirm you are logged in.
