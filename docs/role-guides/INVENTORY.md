# Inventory Specialist — Step-by-step guide

Use this guide if your role is **Inventory** (Inventory Specialist). After login you land on **Stock catalog**. You only see inventory pages plus Account settings.

**You can:** stock catalog, stocktake, receiving, reorder, low-stock / reorder notifications.

**You cannot:** POS, appointments, customers, HR, dashboard, clinic settings, or the Owner/Admin **Ops board**.

---

## 0. First login (do this once)

1. Open the clinic web app URL.
2. Sign in with the email and temporary password from HR / Owner.
3. Open **Account settings** → change your password.
4. Confirm the correct **branch** is selected.
5. Use the chip bar under each page title to jump between:
   - Stock catalog  
   - Stocktake  
   - Receiving  
   - Reorder  

**Tip:** The **bell** shows low-stock items and open reorder requests. Opening a notice takes you to the right inventory page.

---

## 1. Keep the catalog clean — Stock catalog

### Add a new item

1. Open **Stock catalog**.
2. Fill: Name, SKU, Category, Unit, starting Stock, Reorder level, Expiry (if needed).
3. Click **Save item**.

### Adjust quantity (without a full stocktake)

1. Choose the item.
2. Enter a positive or negative stock change.
3. Apply the adjustment.
4. Double-check the new on-hand number.

### Link supplies to a service (optional)

Use this when a treatment consumes specific products.

1. Pick inventory item + clinic service.
2. Enter **qty per service**.
3. Click **Link**.
4. Unlink from the links table if a service no longer uses that item.

---

## 2. Physical count — Stocktake

Do this on schedule (weekly / monthly) or when counts look wrong.

1. Open **Stocktake**.
2. Set **Count date** and optional notes.
3. For each item, type the **counted quantity** (system qty and variance are shown).
4. Review big variances before posting.
5. Click **Complete count & update stock**.
6. On-hand stock is updated to match your count.
7. Past stocktakes appear in the list at the bottom for history.

---

## 3. Incoming deliveries — Receiving

Use this when a supplier delivery arrives.

1. Open **Receiving**.
2. Enter:
   - Received date  
   - Supplier  
   - Reference / DR number  
   - Notes (optional)  
3. Add lines: Item, Qty, Unit cost, Lot #, Expiry.
4. Click **Add line** for more products on the same delivery.
5. Click **Log receipt & update stock**.
6. Stock increases for each line. Recent receipts stay on the page for reference.

---

## 4. Ask to restock — Reorder

### From the low-stock list

1. Open **Reorder**.
2. If items are below reorder level, click **Create from low stock**.
3. Requests appear in the queue with status **open**.

### Manual request

1. Choose Item → Qty → Notes (supplier preference, urgency).
2. Click **Request**.

### Move a request through the workflow

| Status | What you do |
|--------|-------------|
| **open** | Waiting to buy — click **Mark ordered** when you place the PO. |
| **ordered** | In transit — when goods arrive, log them under **Receiving**, then **Mark received**. |
| **cancelled** | Use Cancel if the request is no longer needed. |

**Important:** “Mark received” updates the request status. Always **log the delivery under Receiving** so on-hand stock increases correctly.

---

## 5. Suggested weekly flow

1. Check the **bell** for low stock / open reorders.  
2. Clear or update the **Reorder** queue.  
3. Log any pending deliveries in **Receiving**.  
4. Spot-check key SKUs; run a full **Stocktake** on schedule.  
5. Add new products to **Stock catalog** before the next order cycle.  
6. Keep reorder levels realistic so alerts stay useful.

---

## 6. What Owner / Admin see (for your awareness)

Owners and Admins have an **Ops board** that shows your reorders, receipts, and stocktakes in one place, plus the same inventory pages you use. They also get inbox alerts for those activities. You do not need their Ops board to do your job.

---

## Quick troubleshooting

| Problem | What to try |
|---------|-------------|
| Error mentioning `inventory_` or schema | Ask Owner to run `supabase/add_inventory_role.sql` in Supabase. |
| Wrong branch stock | Switch branch in the top bar, then reload the page. |
| Marked received but stock unchanged | Log the delivery again under **Receiving** with correct qty. |
| Too many low-stock alerts | Raise reorder levels or create reorders and mark them ordered. |
| Cannot open POS or Customers | Normal for Inventory role — ask Reception / Owner for clinic tools. |
