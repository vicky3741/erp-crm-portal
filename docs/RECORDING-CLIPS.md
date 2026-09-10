# Per-Section Recording Clips

One short clip per section, recorded while the work is fresh. Together these are the
"while working on" evidence; the single long demo at the end is separate.

**Tool:** `Win + Alt + R` (Xbox Game Bar). Mic on — check with `Win + Alt + M`.
Files land in `Videos\Captures\`.

**Naming:** `S2-auth.mp4`, `S3-customers.mp4`, and so on. Keep them all in one folder;
at the end you upload that folder, or stitch them together.

**Before every clip:**

- [ ] Notifications off
- [ ] Editor zoomed to ~120% so code is readable
- [ ] `backend/.env` is CLOSED — it holds the live database password
- [ ] Backend already running, so you are not recording a startup wait

---

## S2 — Authentication and role-based access

**Length:** 4–5 minutes. **Record this in one take; do not edit.**

### Setup (before you press record)

Two terminals open in `C:\dev\erp-crm-portal`:

```
Terminal 1:  npm run dev:backend      <- leave it running
Terminal 2:  empty, ready to type
```

### Shot 1 — prove it runs (30s)

Show Terminal 1 with the server started. Say:

> "The API is running on port 4000, connected to a PostgreSQL database hosted on Neon
> in Singapore."

In Terminal 2:

```bash
curl http://localhost:4000/api/health
```

Point at `"database":"up"`. Say:

> "The health endpoint checks the database too. If Postgres were unreachable this would
> return 503, not 200 — so a live API with a dead database can't be mistaken for healthy."

### Shot 2 — the test suite (60s)

```bash
npm run test:smoke
```

Let the table print. Scroll to the bottom. Say:

> "Thirty checks against the running HTTP API — not unit tests against functions, actual
> requests through the real middleware stack. All passing."

Then scroll back up and point at **three specific rows**:

1. `both failures return an identical message (no user enumeration)`
2. `a token signed with another secret is rejected`
3. `SALES is blocked from the admin-only route` → 403

### Shot 3 — walk the code (2 min)

Open these three files in order and explain them.

**`backend/src/middleware/auth.ts`** — the `authenticate` function.

> "It verifies the token, then goes back to the database to load the user instead of
> trusting what's inside the token. That's one extra lookup per request, and it means if
> an admin deactivates someone, they lose access immediately — not whenever their token
> happens to expire seven days later."

Then `authorize(...roles)` just below it.

> "Authentication answers 'who are you'. Authorisation answers 'are you allowed'. They're
> separate middleware so a route declares exactly what it needs:
> `authenticate, authorize('ADMIN', 'SALES')`."

**`backend/src/modules/auth/auth.service.ts`** — the login function.

> "If the email doesn't exist I still run a bcrypt comparison against a dummy hash. Without
> that, a wrong email returns instantly and a wrong password takes ~100ms — and an attacker
> can use that timing difference to work out which email addresses are real accounts.
> Both paths now take the same time, and both return the same message."

**`backend/src/middleware/validate.ts`**

> "Zod parses the request and *replaces* it. So unknown fields get stripped — a client can't
> POST `role: ADMIN` alongside their login and have it reach the handler."

### Shot 4 — break it live (60s)

This is the most convincing part. Do it for real, on camera.

```bash
curl -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@erp.local\",\"password\":\"WrongPassword\"}"
```

> "Wrong password — 401, generic message."

```bash
curl http://localhost:4000/api/auth/me
```

> "No token — 401."

Now log in properly and copy the token:

```bash
curl -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"sales@erp.local\",\"password\":\"Sales@123\"}"
```

Copy the token from the response, then:

```bash
curl http://localhost:4000/api/auth/admin-check -H "Authorization: Bearer PASTE_TOKEN_HERE"
```

> "Valid token, real user — but the Sales role hitting an admin-only route gets a 403,
> and the message tells them exactly which role would be accepted."

Stop recording.

### If asked, be ready to answer

- **Why JWT and not sessions?** Stateless — no session store, and the API can scale
  horizontally or be redeployed without logging everyone out.
- **What's the downside?** You can't revoke a single token before it expires. Mitigated
  here by re-reading the user on every request, so deactivation is immediate.
- **Where is the token stored on the frontend?** `localStorage`, attached by an axios
  interceptor. Trade-off vs an httpOnly cookie is noted in `docs/ASSUMPTIONS.md`.
