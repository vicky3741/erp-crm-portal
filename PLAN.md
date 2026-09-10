# Mini ERP + CRM Operations Portal — Build Plan

Case study: FundsRoom Infotech — Fullstack Developer Intern (Round 1)
Deadline: **Tomorrow 10:00 AM**

---

## Locked Tech Decisions

| Layer | Choice | Why |
|---|---|---|
| Backend | Node 20 + TypeScript + Express | PDF-required, fastest to ship |
| ORM | Prisma | migrations + transactions + type-safety, no hand SQL |
| DB | PostgreSQL (Neon free tier) | PDF-listed, free, no card |
| Validation | Zod | clean input validation + typed |
| Auth | JWT (jsonwebtoken) + bcryptjs | PDF says "simple JWT acceptable" |
| Frontend | React + Vite + TypeScript | fast dev/build |
| Styling | TailwindCSS | admin UI + responsive fast |
| Data fetch | axios + TanStack Query | caching, loading/error states free |
| Routing | React Router v6 | role-guarded routes |
| Deploy FE | Vercel | free, zero-config |
| Deploy BE | Render Web Service | free, PDF-listed |
| Deploy DB | Neon Postgres | free, PDF-listed |
| API docs | Postman collection JSON in repo | PDF-required |

Repo layout: **single repo, two folders**
```
erp-crm-portal/
├── backend/
├── frontend/
├── docs/
├── postman/
└── README.md
```

---

## Data Model (final)

**User** — id, name, email(uniq), passwordHash, role(ADMIN|SALES|WAREHOUSE|ACCOUNTS), isActive, createdAt

**Customer** — id, name, mobile, email, businessName, gstNumber?, customerType(RETAIL|WHOLESALE|DISTRIBUTOR), address, status(LEAD|ACTIVE|INACTIVE), followUpDate?, notes?, createdById, createdAt, updatedAt

**FollowUp** — id, customerId→Customer, note, followUpDate?, createdById, createdAt

**Product** — id, name, sku(uniq), category, unitPrice, currentStock, minStockAlert, location, isActive, createdAt, updatedAt

**StockMovement** — id, productId→Product, quantityChanged, movementType(IN|OUT), reason, referenceType?, referenceId?, createdById, createdAt

**Challan** — id, challanNumber(uniq, auto CH-YYYYMM-0001), customerId→Customer, customerSnapshot(Json), status(DRAFT|CONFIRMED|CANCELLED), totalQuantity, totalAmount, createdById, confirmedAt?, createdAt, updatedAt

**ChallanItem** — id, challanId→Challan, productId, productName, productSku, unitPrice, quantity, lineTotal  ← **snapshot columns, not just FK** (PDF explicitly demands this)

---

## Role Permission Matrix

| Module | ADMIN | SALES | WAREHOUSE | ACCOUNTS |
|---|---|---|---|---|
| Users | CRUD | — | — | — |
| Customers | CRUD | CRUD | read | read |
| Products | CRUD | read | CRUD | read |
| Stock movement (manual) | yes | — | yes | — |
| Challan create/edit draft | yes | yes | — | — |
| Challan confirm | yes | yes | yes | — |
| Challan cancel | yes | — | — | — |
| Reports/dashboard | yes | yes | yes | yes |

---

## SECTIONS (build order — one prompt each)

### S0 — Project Scaffold + GitHub  ⏱ 45m
- init repo, `.gitignore`, backend + frontend folders
- backend: express + ts + tsconfig + nodemon + folder structure (`config/ middleware/ modules/ utils/ prisma/`)
- frontend: vite react-ts + tailwind + folder structure
- `.env.example` both sides
- first commit, push to GitHub
**Done when:** `npm run dev` boots both, `GET /health` returns 200.

### S1 — Database Schema + Seed  ⏱ 1h
- full `schema.prisma` (7 models above + enums)
- Neon DB created, `DATABASE_URL` wired
- `prisma migrate dev`
- `seed.ts`: 4 users (one per role), 8 customers, 12 products, 2 sample challans
**Done when:** `npx prisma studio` shows seeded rows.

### S2 — Auth + RBAC  ⏱ 1h15
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- bcrypt compare, JWT sign (7d), payload {userId, role}
- `authenticate` middleware, `authorize(...roles)` middleware
- global error handler + `AppError` class + 400/401/403/404/409/500 mapping
- Zod validate middleware
**Done when:** login returns token; protected route 401s without token, 403s on wrong role.

### S3 — Customer CRM API  ⏱ 1h
- `GET /api/customers` — pagination(page,limit), search(name/mobile/email/business), filter(status, customerType), sort
- `POST /api/customers`, `GET /:id` (with follow-ups), `PATCH /:id`, `DELETE /:id` (soft)
- `POST /api/customers/:id/followups`, `GET /api/customers/:id/followups`
- Zod schemas: mobile 10-digit, email format, GST 15-char optional
**Done when:** all 7 endpoints pass manual Postman run.

### S4 — Product + Inventory API  ⏱ 1h15
- `GET /api/products` — pagination, search(name/sku), filter(category, lowStock=true), sort
- `POST /api/products`, `GET /:id`, `PATCH /:id`, `DELETE /:id` (soft)
- `POST /api/products/:id/stock` — manual IN/OUT adjust, **transaction**: update stock + write StockMovement
- `GET /api/stock-movements` — paginated log, filter by product/type/date
- `GET /api/products/low-stock` — currentStock <= minStockAlert
- guard: OUT cannot push stock below 0 → 400
**Done when:** manual stock adjust writes both stock + log row atomically; negative blocked.

### S5 — Sales Challan API  ⏱ 1h30  ← **hardest, highest marks**
- `POST /api/challans` — create DRAFT, multi-item, auto challan number
- `GET /api/challans` — pagination, filter(status, customer, date range)
- `GET /api/challans/:id`, `PATCH /:id` (draft only)
- `POST /api/challans/:id/confirm` — **Prisma `$transaction`**:
  1. re-lock + re-check every item's stock
  2. if any short → rollback, `400 {message, insufficientItems:[{sku, requested, available}]}`
  3. decrement stock, write `StockMovement` OUT (reason `Challan CH-…`)
  4. status→CONFIRMED, set confirmedAt
- `POST /api/challans/:id/cancel` — if was CONFIRMED, restore stock + write IN movements
- challan number generator: `CH-YYYYMM-####`, collision-safe inside txn
- items store **name/sku/price snapshot**
**Done when:** confirm reduces stock; insufficient stock returns clean error and changes nothing; cancel restores.

### S6 — API Hardening + Postman  ⏱ 45m
- helmet, cors, rate-limit on `/auth/login`, morgan
- consistent response envelope `{success, data, meta?, message?}`
- 404 catch-all, unhandled rejection guard
- export `postman/ERP-CRM.postman_collection.json` — all endpoints, `{{baseUrl}}`, `{{token}}` auto-set from login test script
**Done when:** whole collection runs green top-to-bottom.

### S7 — Frontend Shell + Auth  ⏱ 1h15
- axios instance + interceptor (attach token, 401→logout)
- `AuthContext`, token in localStorage, `/login` page
- `ProtectedRoute` + `RoleRoute`
- app shell: sidebar (role-filtered links) + topbar (user, role badge, logout) + content
- toast system, loading skeletons, empty states
**Done when:** login → dashboard, refresh keeps session, sidebar hides unauthorized links.

### S8 — Customers UI  ⏱ 1h15
- list: search box (debounced), status + type filters, pagination, table
- add/edit modal form (react-hook-form + zod resolver)
- detail page: info card + follow-up timeline + "Add follow-up" form
**Done when:** full CRUD + follow-ups work from browser.

### S9 — Products + Inventory UI  ⏱ 1h15
- list: search, category filter, **low-stock red badge**, pagination
- add/edit modal
- stock adjust modal (IN/OUT + qty + reason)
- stock movement log page: filters + paginated table
**Done when:** adjusting stock updates row and appears in log.

### S10 — Challan UI  ⏱ 1h30
- list: status chips, filters, pagination
- create page: customer picker (searchable) → product line-item builder (add row, qty, live stock shown, live totals) → Save Draft / Save & Confirm
- detail page: snapshot items, totals, status, Confirm / Cancel buttons
- surface insufficient-stock API error inline per row
**Done when:** create draft → confirm → product stock visibly drops.

### S11 — Dashboard + Responsive Pass  ⏱ 45m
- dashboard cards: total customers, active leads, total products, low-stock count, challans today, draft count
- recent challans table + low-stock table
- mobile pass: sidebar → drawer, tables → horizontal scroll, 375px check

### S12 — Deployment  ⏱ 1h15
- Neon: prod DB, run migrate + seed
- Render: backend web service, env vars, build `npm ci && npx prisma generate && npm run build`, start `node dist/server.js`
- Vercel: frontend, `VITE_API_URL` env
- fix CORS to Vercel origin
- smoke test all 4 role logins on live URLs
**Done when:** live FE talks to live BE, all flows work in prod.

### S13 — Documentation  ⏱ 1h
- `README.md`: overview, tech stack, features, **4 role test credentials**, local setup, env vars, scripts, live URLs, Postman link
- `docs/ARCHITECTURE.md`: folder structure, request lifecycle, ER diagram (mermaid), auth flow, stock-transaction explanation
- `docs/DEPLOYMENT.md`: server setup, env var management, deploy steps
- `docs/ASSUMPTIONS.md`: assumptions + **known limitations / not-built list**
**Done when:** stranger can clone and run from README alone.

### S14 — Deploy verification  ⏱ 45m
- run the smoke suite against the deployed API
- confirm all four role logins work on the live frontend
**Done when:** every check passes against production.

---

## Time Budget

Total ≈ **16h**. Order is dependency-strict — do not jump ahead.

If time runs short, cut in this order (and write it in ASSUMPTIONS.md):
1. S11 dashboard extras
2. Challan cancel/restore
3. Soft-delete endpoints
4. Bonus (Docker, PDF export, S3) — skip entirely, all optional

Never cut: S2 auth, S5 challan stock logic, S12 deploy, S13 docs.
