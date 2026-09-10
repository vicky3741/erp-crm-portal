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
