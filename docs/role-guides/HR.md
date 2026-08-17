# HR — Step-by-step guide

Use this guide if your role is **HR**. After login you land on **Payroll**. The left menu only shows HR tools plus Account settings.

**You can:** Staff & Attendance, Create account, Payroll, Incentives.

**You cannot:** POS, appointments, customers, inventory, dashboard, chat, or clinic settings.

---

## 0. First login (do this once)

1. Open the clinic web app URL.
2. Sign in with the email and temporary password from the Owner.
3. Open **Account settings** → change your password.
4. Learn the four HR pages:
   - **Staff & Attendance**  
   - **Create account**  
   - **Payroll**  
   - **Incentives**  

**Tip:** The **bell** shows **pending leave** requests that need Approve / Reject.

---

## 1. Create staff logins — Create account

Use this when a new employee needs access to Illuminate.

1. Open **Create account**.
2. Fill in:
   - Full name  
   - Email (this is their login)  
   - Phone, birthday/age, gender, address (as required by your clinic)  
   - **Role** — pick carefully:  
     - **Receptionist** — front desk / clinic ops  
     - **Inventory** — stock only  
     - **HR** — people / payroll (rare)  
     - Do **not** assign Owner/Admin unless the Owner asked you to  
   - Password → use **Generate** for a strong temporary password  
3. Submit **Create account**.
4. Copy the credentials shown and share them securely with the employee.
5. Tell them to change the password under **Account settings** on first login.

You can later **Reveal password** on the account list only if your clinic still stores that helper flow — prefer resetting via Owner/Supabase Auth if unsure.

---

## 2. People & time — Staff & Attendance

### Review the team

1. Open **Staff & Attendance**.
2. Scan active accounts, employment status, and recent attendance.
3. Role changes / deleting accounts may be limited to Owner/Admin — follow your clinic policy if those controls appear.

### Manual attendance (when someone forgot to clock)

1. Choose the staff account.
2. Enter **Date**, **Time in**, **Time out**.
3. Click **Save attendance**.

### Leave requests

1. Open the leave queue (pending items also appear in the notification bell).
2. Read type, dates, and reason.
3. Click **Approve** or **Reject**.
4. Update leave credits / employment fields when your process requires it.

Receptionists request leave from **My Work**; you (or Owner/Admin) decide here.

---

## 3. Pay — Payroll

1. Open **Payroll**.
2. Select the **pay month**.

### Set compensation rates

1. Choose the staff account.
2. Set pay type and base / hourly rate.
3. **Save compensation**.

### Build the payroll run

1. Prefer **Generate from attendance** when clock data is complete.  
2. Or add a **Manual entry** (hours, base, allowances, deductions).  
3. Review each row for mistakes.  
4. **Approve** the line when it is correct.  
5. When money is released, **Mark paid**.

Keep a consistent monthly routine so sales incentives (next section) can use the same period.

---

## 4. Commissions & bonuses — Incentives

1. Open **Incentives**.
2. Use two areas: **Rules** and **Payouts**.

### Rules (set once, update when policy changes)

1. Open **Rules**.
2. Enter name, incentive type, rate %, and/or flat amount.
3. **Save rule** (keep rules active only when they should apply).

### Payouts (each pay period)

1. Open **Payouts**.
2. Choose the month.
3. **Compute from POS Sales by** when incentives follow who sold the treatment, **or** enter a manual payout.
4. Review amounts.
5. **Approve** → then **Mark paid** when released.

---

## 5. Suggested monthly flow

1. Clear all **pending leave** in Staff & Attendance.  
2. Confirm new hires have accounts (**Create account**) with the right role.  
3. Fix missing clock-ins with **manual attendance**.  
4. Run **Payroll** for the month → Approve → Mark paid.  
5. Run **Incentives** for the same month → Approve → Mark paid.  
6. File or export anything your clinic needs outside Illuminate (if you use CSV elsewhere).

---

## 6. Role cheat sheet (what to assign)

| Role to assign | Person uses Illuminate for |
|----------------|----------------------------|
| **Receptionist** | Front desk: POS, bookings, clients, chat |
| **Inventory** | Stock catalog, stocktake, receiving, reorder |
| **HR** | Same HR tools as you |
| **Client** | Usually self-register — not created here for patients |
| **Owner / Admin** | Only when Owner instructs you |

---

## Quick troubleshooting

| Problem | What to try |
|---------|-------------|
| Cannot open POS or Inventory | Normal for HR — those pages are blocked on purpose. |
| Leave not appearing | Ask the staff member to submit from **My Work**; refresh and check the bell. |
| Payroll hours look wrong | Fix attendance first, then regenerate or edit the payroll row. |
| Incentive amount is 0 | Check incentive **Rules** are active and POS sales have **Sales by** filled. |
| New user cannot log in | Confirm email spelling, role, and that they use the temporary password exactly. |
| Need Owner/Admin powers | Ask the Owner — HR cannot change clinic settings or inventory. |
