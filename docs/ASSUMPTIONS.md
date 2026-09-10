# Assumptions, Trade-offs and Known Limitations

Written honestly. Everything below was a deliberate decision under a fixed time
budget, not an oversight discovered later.

---

## Assumptions made about the business

| Assumption | Reasoning |
|---|---|
| A customer's **mobile number** identifies them uniquely | It is how a distributor actually looks a customer up. Enforced with a database unique index. |
| **GST is optional** | The brief says so, and leads genuinely have no GST registration yet. |
| **Product SKU is unique** and case-insensitive | Stored uppercase so `gro-oil-1l` and `GRO-OIL-1L` cannot both exist. |
| A challan **prices at confirmation time**, not at draft time | A draft may sit for days. The dispatch document should record what was actually charged on the day the goods left. |
| A **draft reserves nothing** | Stock is only committed when someone confirms dispatch. Reservations would be a different, larger feature. |
| **Warehouse can confirm** a challan but not raise one | Sales owns the customer relationship; the warehouse physically dispatches, so it must be able to commit the stock movement. |
| **Only Admin can cancel** | Cancelling reverses stock — a correction to a completed transaction. |
| Mobile numbers are **Indian** (10 digits, starting 6–9) | The business context is a wholesale distributor in Maharashtra. |
| Prices are in **INR** | Same reason. No multi-currency. |

---

## Deliberate trade-offs

### The token is kept in `localStorage`

An httpOnly cookie would be safer against XSS, because JavaScript could not read
the token at all.

`localStorage` was chosen because the frontend and API are on different origins
(Vercel and Render). Cross-site cookies need `SameSite=None; Secure`, a CORS
credentials configuration on both ends, and CSRF protection — real work for a
deployment topology that only exists because both services are free.

The mitigation is that the API never trusts the token's contents: the user is
re-read from the database on every request, so revoking access is immediate.

**With more time:** httpOnly refresh cookie plus a short-lived in-memory access
token.

### No automated unit tests

There is a 135-check smoke suite that drives the running API over real HTTP, and
a database integrity checker with 7 invariant assertions. There are no Jest or
Vitest unit tests.

Under a fixed budget, coverage at the HTTP boundary catches more of what
actually breaks — middleware ordering, status codes, role gates, transaction
rollback, concurrency — than unit tests around individual functions would.

**With more time:** Vitest for the service layer, plus the smoke suite in CI.

### No refresh tokens

Access tokens last seven days and there is no refresh flow. A stolen token is
valid until it expires; it cannot be revoked individually.

Partially mitigated by re-reading the user on every request, so deactivating an
account cuts access immediately even though the token is still cryptographically
valid.

### Rate limiting is in-process

`express-rate-limit` with the default memory store. Counters live in the
process, so they reset on redeploy and would not be shared across instances.
Fine for one Render instance; a Redis store would be needed to scale out.

### Soft delete has no purge

Deactivated customers and products stay in the database forever. There is no
archival or hard-delete path, and no interface for reactivating a product
(the API supports it; the UI does not expose it).

### The smoke suite leaves records behind

It tags everything it creates with a per-run id and soft-deletes at the end, so
runs never collide. But repeated runs accumulate deactivated rows.
`npm run db:seed` resets to a clean demo dataset.

---

## Not built

Out of scope for the brief, or cut for time. Listed so the boundary is explicit
rather than looking like something was forgotten.

| Not built | Note |
|---|---|
| Invoices | The brief names challans; invoicing is a separate document flow |
| PDF export | Listed as a bonus |
| Product image upload to S3 | Listed as a bonus; would need an AWS account |
| Docker | Listed as a bonus |
| GitHub Actions CI | Listed as a bonus |
| User management screen | The API has roles; users are created by the seed. No admin UI to add employees |
| Password reset / change password | No email service |
| Editing a draft challan from the UI | `PATCH /api/challans/:id` exists and is tested; the UI offers cancel-and-reraise instead |
| Reactivating a product from the UI | Endpoint exists, no button |
| Purchase orders | The brief lists them in the business context but not in the required modules |
| CSV export | Not requested |
| Multi-warehouse stock | `location` is a text field on the product, not a separate stock-per-warehouse model |

---

## Known rough edges

- **Render's free tier sleeps after 15 minutes.** The first request takes ~50
  seconds. Open the app a minute before demonstrating it.
- **Neon's free tier suspends compute when idle.** The first query takes about a
  second; after that, ~85 ms.
- **The frontend bundle is one chunk** (~144 kB gzipped). Route-level code
  splitting would help a slow connection but adds little at this size.
- **Dates are handled as local time.** A business operating across time zones
  would need explicit handling; a single distributor does not.
- **The stock ledger has no export.** It is paginated and filterable, but
  reconciling a long period means paging through it.
- **No optimistic UI.** Every mutation waits for the server. With a database in
  Singapore this costs ~100 ms per action — honest, and it means the UI never
  shows a state the server did not agree to.

---

## Things that were found and fixed

Recorded because how a problem was found is as informative as the fix.

**Lock contention under concurrent stock writes.** The concurrency tests were
flaky — sometimes 6 of 10 withdrawals succeeded, sometimes 4. Investigating
rather than accepting a lucky pass showed `applyStockMovement` was making four
round trips to Singapore while holding a row lock; under a burst of writers to
the same product, later transactions queued past Prisma's five-second default
and errored.

Stock never went negative — the guarantee held — but requests that should have
been cleanly accepted or cleanly rejected returned 500s. Fixed by collapsing the
guard, the update and the read-back into one `UPDATE ... RETURNING`, raising the
transaction window, and mapping Prisma's pool-exhaustion and write-conflict
codes to 503 and 409 instead of a generic 500. Five consecutive clean runs
afterwards.

**Test suite was not re-runnable.** Fixed test data collided with the previous
run's unique constraints. Every record the suite creates is now tagged with a
per-run id, and assertions about the catalogue are made against the seeded rows
rather than absolute table counts.
