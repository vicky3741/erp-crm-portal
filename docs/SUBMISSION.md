# Final Demo and Submission

Everything left to do, in order.

---

## Part 1 — Deploy (do this first, it unblocks everything else)

Follow [DEPLOYMENT.md](DEPLOYMENT.md). Roughly:

1. **Render** → New Web Service → connect the repo → **Root Directory `backend`**
2. Paste the environment variables, deploy, wait for green
3. **Vercel** → Add Project → import the repo → **Root Directory `frontend`**
4. Set `VITE_API_URL` to the Render URL, deploy
5. Back in Render, set `CORS_ORIGINS` to the Vercel URL
6. Verify:
   ```bash
   cd backend
   API_URL=https://your-api.onrender.com npm run test:smoke
   ```

Then put both URLs at the top of the README, where it says
_add the Vercel URL_ and _add the Render URL_, commit and push.

---

## Part 2 — The demo recording (10–12 minutes, one take)

Everything below is the finished app. Rehearse once without recording.

### Before you press record

- [ ] Open the deployed frontend **once** and log in — Render's free tier sleeps
      after 15 minutes and takes ~50 seconds to wake. Do not record that wait.
- [ ] Close `backend/.env`, the Neon dashboard, and the Render environment page.
      All three show the live database password.
- [ ] Notifications off, unrelated tabs closed
- [ ] Editor zoomed to ~120%
- [ ] OBS: microphone tested, 1080p, 30fps

### Shot list

| Time | Screen | What to say |
|---|---|---|
| **0:00** | You, or just voice over the login page | Your name, the role you applied for, the project in one sentence: *"A mini ERP and CRM for a wholesale distributor — customers, stock and dispatch, with role-based access."* |
| **0:30** | Editor — folder tree | *"Backend is Node, TypeScript and Express, layered as schema, routes, controller, service. Services hold the business rules and never touch HTTP types, which is why the challan module can call the stock module's function directly inside its own transaction."* |
| **1:15** | `prisma/schema.prisma` | Point at `ChallanItem`. *"Every line copies the product's name, SKU and price. A challan is a dispatch document — what left the warehouse, at what price, on what day. If it only held a product ID, repricing that product next month would silently rewrite every historical challan."* |
| **2:00** | `modules/stock/stock.service.ts` → `applyStockMovement` | **The centrepiece.** *"The stock check is inside the SQL WHERE clause. The database decides whether there's enough, at the moment it writes. The obvious version — read, check in JavaScript, write — is a race: two requests both see fifty available, both dispatch forty, and you've shipped eighty units you don't have."* |
| **3:00** | `modules/challans/challan.service.ts` → `confirmWithinTransaction` | *"Confirming is one transaction. It collects every shortfall first, not just the first one. Then deducts each line and flips the status. All of it commits or none of it does."* |
| **4:00** | Terminal — `npm run test:smoke` | *"One hundred and thirty-five checks against the running API — real HTTP, real middleware."* Scroll to `stock: cannot go negative` and stop. *"Ten simultaneous withdrawals of twenty against a balance of a hundred and twenty. Exactly six can succeed. Six did. Balance landed on zero."* |
| **5:00** | Terminal — `npm run db:verify` | *"And these seven assertions run against the database itself: stock equals the sum of its movements, every recorded balance matches the running total, no negative stock."* |
| **5:45** | Live app — log in as **Sales** | Create a customer. Add a follow-up note. *"Attributed to whoever is signed in — the server takes the user from the token, not the request body."* |
| **7:00** | Log out → log in as **Warehouse** | *"Different sidebar. That's role-based access, not decoration."* Adjust stock on a product. Show the movement appear in the ledger. |
| **8:00** | Raise a challan | Pick a customer, add a product. **Say the stock number out loud.** Save and confirm. |
| **8:45** | Go to **Products** | **Say nothing for two seconds.** Let the number speak. Then: *"Dropped by exactly the quantity dispatched."* |
| **9:15** | New challan — two lines, one with plenty of stock, one asking for far more than exists | Confirm it. The shortfall appears on the offending line. |
| **9:45** | Products again | *"And the line that DID have stock was not deducted either. The whole confirmation rolled back. You can never end up half-dispatched. This is the part most implementations get wrong."* |
| **10:30** | Postman | Import the collection, run **Login as Admin**, then hit a protected route. Show a 403 for the wrong role. |
| **11:00** | Deployed URLs | Frontend on Vercel, `/api/health` on Render showing `"database":"up"`. |
| **11:15** | Close | Read from `docs/ASSUMPTIONS.md`: what you deliberately did not build, and what you would add next. Mention the lock-contention bug you found and fixed — finding it required writing the concurrency test in the first place. |

### Delivery

- Narrate continuously. Silence reads as uncertainty.
- Move slowly. What is obvious to you is new to the reviewer.
- If you fumble, say "let me redo that" and carry on. Do not restart the take.
- Never say "I'm not sure why this works." Say what you *do* know about it.

---

## Part 3 — Questions to be ready for

The reviewer's real question is whether you can explain the decisions.

**Why does `ChallanItem` copy the product name and price instead of just holding `productId`?**
A challan is a historical document. If a product is renamed or repriced next
month, every past challan and every invoice built from one would silently
change. The snapshot makes the document immutable.

**Why is confirming a challan wrapped in a transaction?**
It deducts stock across several products and writes a ledger row for each. If it
failed halfway, some products would be deducted and others not, with the challan
still showing as a draft. All of it, or none.

**What stops stock going negative if two people confirm at the same time?**
The condition is in the SQL: `WHERE currentStock >= n`. Postgres serialises
row-level writes, so the second UPDATE matches no rows and I turn that into a
400. A read-then-write check in application code would let both through.

**Why `Decimal(12,2)` and not a float?**
Floating point cannot represent decimal fractions exactly. Totals drift. A
wholesale system that cannot add up is worthless.

**Why is the token in `localStorage` rather than an httpOnly cookie?**
An httpOnly cookie is safer against XSS. But the frontend and API are on
different origins, so cross-site cookies would need `SameSite=None`, credentials
CORS on both ends, and CSRF protection. I chose the simpler path and mitigated
it by re-reading the user from the database on every request, so access can be
revoked immediately. It is written up in `docs/ASSUMPTIONS.md`.

**Why no unit tests?**
Under a fixed time budget, coverage at the HTTP boundary catches more of what
actually breaks — middleware order, status codes, role gates, rollback,
concurrency. 135 checks over real requests, plus 7 invariant assertions against
the database. Unit tests would be the next addition.

**What was the hardest bug?**
Lock contention. The concurrency tests were flaky — sometimes six of ten
withdrawals succeeded, sometimes four. `applyStockMovement` was making four
round trips while holding a row lock, and under load later transactions queued
past Prisma's default timeout. Stock never went negative, but requests that
should have been cleanly accepted or rejected returned 500s. Fixed by collapsing
it to one `UPDATE ... RETURNING` and widening the transaction window.

---

## Part 4 — Google Form

| Field | Value |
|---|---|
| Passing year | _your year_ |
| Resume link | Google Drive, sharing set to **Anyone with the link** |
| GitHub repository | `https://github.com/vicky3741/erp-crm-portal` |
| Documentation link | The README URL, or a Drive PDF of the docs folder |
| Recording link | YouTube **unlisted** (not Private), or Drive set to Anyone with the link |

### Before you hit submit

- [ ] Open **every** link in an incognito window while signed out
- [ ] The GitHub repo is **public**
- [ ] The README has the live Vercel and Render URLs filled in
- [ ] The deployed frontend loads and all four logins work
- [ ] The recording has audible narration throughout — spot-check the middle and
      the end, not just the start
- [ ] `backend/.env` never appeared on screen

The most common way a submission is marked incomplete is a link that asks the
reviewer for permission. Check them signed out.

---

## Part 5 — After the assessment

Rotate anything that was shared:

1. Neon → the project → Roles → reset the password
2. Update `DATABASE_URL` in Render and in local `.env`
3. Render → generate a new `JWT_SECRET`
