# Per-Section Recording Clips

One short clip per section, recorded while the work is fresh. Together these are the
"while working on" evidence; the single long demo at the end is separate.

**Tool:** `Win + Alt + R` (Xbox Game Bar). Mic on — toggle with `Win + Alt + M`.
Files land in `Videos\Captures\`.

**Naming:** `S2-auth.mp4`, `S3-customers.mp4`, and so on. Keep them in one folder.

**Before every clip:**

- [ ] Notifications off
- [ ] Editor zoomed to ~120% so code is readable
- [ ] `backend/.env` is CLOSED — it holds the live database password
- [ ] Backend already running, so you are not recording a startup wait

> **Windows note:** do not use `curl` in these clips. PowerShell aliases `curl` to a
> different command with different syntax, and it will fail on camera. Every command
> below is an `npm` script instead — they work identically in PowerShell, CMD and the
> VS Code terminal.

---

## S2 — Authentication and role-based access

**Length:** 4–5 minutes, one take.

### Setup — do this BEFORE pressing record

Open **two terminals**, both in `C:\dev\erp-crm-portal`.

*In VS Code: `Ctrl + ~` opens a terminal, then click the split-terminal icon for the second.*

**Terminal 1** — start the API and leave it alone:

```
npm run dev:backend
```

Wait for `[server] ERP/CRM API listening on http://localhost:4000`.

**Terminal 2** — leave empty. This is the one you type in on camera.

Now press `Win + Alt + R`.

---

### Shot 1 — the tests (60s)

In **Terminal 2**:

```
npm run test:smoke
```

Thirty rows print, all PASS. Say:

> "Thirty checks against the running HTTP API — not unit tests against functions,
> real requests through the actual middleware stack."

Scroll up and point at three rows:

1. `both failures return an identical message (no user enumeration)`
2. `a token signed with another secret is rejected`
3. `SALES is blocked from the admin-only route` → 403

---

### Shot 2 — the narrated walkthrough (90s)

In **Terminal 2**:

```
npm run demo:auth
```

This prints five labelled steps. Scroll through them slowly and read along:

| Step | What is on screen | What to say |
|---|---|---|
| 1 | Two failed logins, identical messages | "Wrong password and a non-existent email return the *same* message. If they differed, you could discover which company emails are real accounts." |
| 2 | 400s with per-field messages | "Validation runs before any handler, and names the exact field." |
| 3 | Three rejected tokens | "The third one is a forged JWT that literally claims `role: ADMIN` in its payload — but the signature doesn't verify against our secret, so it never gets in." |
| 4 | Four successful logins | "One user per role. Note what's *not* in the response: no password, no hash." |
| 5 | Same route, 200 then three 403s | "Every one of those carried a valid token for a real user. Authentication succeeded — authorisation is what stopped them." |

---

### Shot 3 — walk the code (2 min)

Open three files and explain the *why*, not the syntax.

**`backend/src/middleware/auth.ts`** — the `authenticate` function:

> "It verifies the token, then goes back to the database to load the user rather than
> trusting what's inside the token. That's one extra indexed lookup per request, and it
> buys immediate effect — if an admin deactivates someone, they lose access on their very
> next request, not seven days later when the token expires."

Then `authorize(...roles)` just below:

> "Authentication answers 'who are you'. Authorisation answers 'are you allowed'. Keeping
> them separate means a route declares exactly what it needs:
> `authenticate, authorize('ADMIN', 'SALES')`."

**`backend/src/modules/auth/auth.service.ts`** — the login function:

> "If the email doesn't exist, I still run a bcrypt comparison against a dummy hash.
> Without it, a wrong email returns in a millisecond and a wrong password takes about a
> hundred — and that timing gap alone tells an attacker which accounts are real."

**`backend/src/middleware/validate.ts`**:

> "Zod parses the request and *replaces* it, so unknown fields are stripped. A client can't
> POST `role: ADMIN` alongside their login and have it reach the handler."

Stop recording: `Win + Alt + R`.

---

### Be ready to answer

- **Why JWT and not sessions?** Stateless — no session store, and the API can be
  redeployed or scaled horizontally without logging everyone out.
- **What's the downside?** You can't revoke a single token before it expires. Mitigated
  by re-reading the user on every request, so deactivation is immediate.
- **Where does the frontend keep the token?** `localStorage`, attached by an axios
  interceptor. The trade-off against an httpOnly cookie is recorded in
  `docs/ASSUMPTIONS.md`.

---

## S3 — Customer CRM module

**Length:** 3–4 minutes, one take. Same two-terminal setup as S2.

### Shot 1 — the suite grew (60s)

In **Terminal 2**:

```
npm run test:smoke
```

> "The suite went from thirty checks to sixty-five. Every auth check still passes, and
> thirty-five new ones cover the customer module."

Scroll to the rows beginning `customers:` and point at four:

| Row on screen | What to say |
|---|---|
| `pagination returns the right slice` | "Page two with a limit of three returns exactly three rows and correctly reports that a previous page exists." |
| `an oversized limit is rejected` | "A client asking for five thousand rows gets a 400. The cap lives in the shared schema, so no endpoint can forget it." |
| `a duplicate mobile number is rejected` | "409 — and the message names the customer who already holds that number." |
| `a deactivated customer is hidden from the default list` | "Deletes are soft. The row survives, because challans point at it." |

### Shot 2 — walk the code (2 min)

**`backend/src/modules/customers/customer.schema.ts`**

> "Validation is pattern-based, not just 'is it a string'. A mobile has to be ten digits
> starting six to nine. GST has to match the real GSTIN format — two-digit state code,
> then the ten-character PAN, then the check characters."

Scroll down to `updateCustomerSchema`:

> "The update schema is the create schema with defaults stripped. That matters — if I
> reused the create schema, a PATCH that only changes a phone number would silently reset
> the customer's status back to LEAD, because the default would fire on the missing field."

**`backend/src/modules/customers/customer.service.ts`** — `listCustomers`:

> "Search spans five fields, case-insensitively. And the rows and the total count run
> inside one `$transaction`, so it's a single round trip to the database instead of two."

Scroll to `deactivateCustomer`:

> "Soft delete. This customer is referenced by challans and follow-up notes — destroying
> the row would orphan real business documents. So it's flagged inactive, disappears from
> the default list, and every historical document still reads correctly."

**`backend/prisma/schema.prisma`** — the `mobile` field:

> "Mobile is unique at the database level, not just checked in the service. The service
> check only exists to return a friendly message. The constraint is what actually stops
> two simultaneous requests from both creating the same customer."

Stop recording: `Win + Alt + R`. Save as `S3-customers.mp4`.

### Be ready to answer

- **Why soft delete rather than hard?** Challans and stock movements reference customers.
  A hard delete would either fail on the foreign key or destroy business history.
- **What happens to a deactivated customer's challans?** Nothing — they still read
  correctly, because the challan also stores a snapshot of the customer's details.
- **Why cap `limit` at 100?** Without a cap, a single request for `limit=1000000` is a
  denial-of-service against your own database.

---

## S4 — Products and inventory

**Length:** 4–5 minutes. This is the strongest clip so far — the concurrency result is
something most submissions cannot show.

### Shot 1 — the tests (90s)

```
npm run test:smoke
```

> "One hundred and one checks now."

Scroll to the `stock: cannot go negative` group and stop there. Point at these two rows
and give them time on screen:

| Row | What to say |
|---|---|
| `ten concurrent withdrawals of 20 from a balance of 120` → **6 succeeded, 4 rejected** | "This fires ten simultaneous requests, each taking twenty units, against a balance of one hundred and twenty. Exactly six can succeed. Six did. Four were rejected." |
| `stock landed exactly on zero, never below` | "And the balance landed on zero. Not minus eighty." |

Then point at `the ledger replays to the current balance with no gaps`:

> "The ledger is then replayed from the first movement to the last, and every recorded
> balance matches the running total. The log and the stock level cannot disagree."

### Shot 2 — why it works (2 min)

Open **`backend/src/modules/stock/stock.service.ts`** and find `applyStockMovement`.

Point at the `updateMany` call with its `where` clause:

> "This is the whole trick. The stock check is *inside* the WHERE clause —
> `WHERE id = ? AND currentStock >= n`. The database decides whether there's enough,
> at the moment it writes."

> "The obvious version reads the stock, checks it in JavaScript, then writes. That's a
> race. Two requests both read 'fifty available', both pass the check, both dispatch
> forty, and you've shipped eighty units you don't have. Here the second UPDATE simply
> matches zero rows, and I turn that into the 400."

Then point at the read-back and the movement creation just below:

> "Then it reads the balance back *inside the same transaction* and writes the movement
> row with that number. Both writes commit together or neither does."

Scroll up to the doc comment:

> "And every caller goes through this one function — the manual adjustment endpoint,
> and shortly the challan confirmation. There is no code path anywhere that changes
> stock without writing a movement, or writes a movement without changing stock."

### Shot 3 — see it live (60s)

Open **`backend/src/modules/products/product.service.ts`** → `createProduct`:

> "Even opening stock isn't written straight into the column. The product is created at
> zero, then the opening quantity is applied as an IN movement — so a product's very
> first stock level still has a row explaining where it came from."

Then `updateProductSchema` in `product.schema.ts`:

> "And `currentStock` isn't in the update schema at all. You cannot PATCH a stock level.
> The only way it ever changes is through a movement."

Stop recording. Save as `S4-inventory.mp4`.

### Be ready to answer

- **Why not `SELECT ... FOR UPDATE`?** A conditional UPDATE achieves the same guarantee
  in one statement, with no explicit lock to hold or release, and it works identically
  through a connection pooler.
- **What if two requests arrive at exactly the same microsecond?** One of them updates
  the row; the other's WHERE clause no longer matches and it updates zero rows. Postgres
  serialises row-level writes for us.
- **Why store `balanceAfter` when it could be recomputed?** Recomputing means summing the
  entire history on every read. Storing it makes the ledger directly auditable — and the
  smoke test replays it to prove the two never drift.

---

## S5 — Sales challans

**Length:** 5–6 minutes. This is the section the brief spends the most words on, so give
it the most time.

### Shot 1 — the tests (90s)

```
npm run test:smoke
```

> "One hundred and thirty-five checks."

Scroll to the `challans:` groups and point at five rows:

| Row | What to say |
|---|---|
| `raising a draft does NOT touch stock` | "A draft reserves nothing. Stock is untouched until someone confirms." |
| `confirming deducted exactly the dispatched quantity` | "Three hundred minus sixty is two hundred and forty. Exactly what left the warehouse." |
| `the AVAILABLE item on that challan was not deducted either` | "This is the important one. That challan had two lines — one with plenty of stock, one short. The whole confirm rolled back. You never end up half-dispatched." |
| `five simultaneous confirms for 2 units each, only 5 in stock` → **2 confirmed, 3 rejected** | "Five challans confirmed at the same instant, two units each, five units in stock. Two shipped. Three were rejected." |
| `renaming and repricing a product does NOT rewrite past challans` | "I renamed the product and changed its price after dispatch. The challan still shows the original name and the price actually charged." |

### Shot 2 — the confirm transaction (2 min)

Open **`backend/src/modules/challans/challan.service.ts`** → `confirmWithinTransaction`.

> "Confirming a challan is one transaction. First it collects *every* shortfall, not just
> the first one — a warehouse user with a ten-line challan shouldn't have to retry ten
> times to find every problem."

> "Then it deducts each line through `applyStockMovement` — the same function the manual
> adjustment endpoint uses. And only then does the challan flip to CONFIRMED. All of it
> commits together, or none of it does."

Scroll up to `nextChallanNumber`:

> "Challan numbers come from a counter table, incremented inside the same transaction.
> The obvious approach is `count() + 1` — but two simultaneous requests both count the
> same total and both build CH-202609-0007. The smoke test asserts every number issued
> is distinct."

Scroll to `resolveLines`:

> "And this is the snapshot. Every line copies the product's name, SKU, category and
> price as they are right now. A challan is a dispatch document — what left the
> warehouse, at what price, on what day. If it only held a product ID, repricing that
> product next month would silently rewrite every historical challan and every invoice
> built from them."

### Shot 3 — cancellation and the ledger (60s)

Scroll to `cancelChallan`:

> "Cancelling a confirmed challan returns the stock as IN movements that point back at
> the challan. Nothing is deleted to make the numbers work — the goods came back, so the
> ledger says so. You can read the whole life of that challan out of the movement log."

Stop recording. Save as `S5-challans.mp4`.

### Be ready to answer

- **Why re-price at confirmation rather than at draft time?** A draft may sit for days.
  The dispatch document should record what was actually charged on the day the goods
  left the building.
- **What if the same product appears twice on one challan?** The lines are merged into
  one before they reach the service, with the quantities added together.
- **Why can WAREHOUSE confirm but not raise a challan?** Sales owns the customer
  relationship; the warehouse physically dispatches the goods, so it has to be able to
  commit the stock movement.
- **Why is cancel ADMIN-only?** Cancelling reverses stock. That is a correction to a
  completed transaction, so it needs the higher privilege.
