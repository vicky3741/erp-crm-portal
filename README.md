# Mini ERP + CRM Operations Portal

A full-stack ERP/CRM for a wholesale and distribution business — customers,
products, stock and sales challans, with role-based access for Admin, Sales,
Warehouse and Accounts teams.

Built as a Full Stack Developer case study.

---

## Live

| | |
|---|---|
| **Frontend** | https://erp-crm-portal-six.vercel.app |
| **API** | https://erp-crm-api-4vpn.onrender.com |
| **Health check** | https://erp-crm-api-4vpn.onrender.com/api/health |
| **Repository** | https://github.com/vicky3741/erp-crm-portal |

### Test credentials

Each role sees a different menu and is allowed different actions.

| Role | Email | Password | Can do |
|---|---|---|---|
| Admin | `admin@erp.local` | `Admin@123` | Everything, including deactivating records and cancelling challans |
| Sales | `sales@erp.local` | `Sales@123` | Customers, follow-ups, raise and confirm challans |
| Warehouse | `warehouse@erp.local` | `Warehouse@123` | Products, stock movements, confirm challans |
| Accounts | `accounts@erp.local` | `Accounts@123` | Read-only across the system |

The login screen lists all four as one-click fills, so switching roles takes a
second.

> The API and database are on free tiers that sleep when idle. The first request
> after a quiet period takes up to a minute while they wake. Load the page once
> and it is fast after that.

---

## The thing worth looking at first

Confirming a sales challan. It is one transaction that either does all of this
or none of it:

1. Re-check availability for every line
2. If any line is short, reject with **every** shortfall listed and change nothing
3. Deduct each line's stock
4. Write one `OUT` movement per line, recording the balance it produced
5. Flip the challan to `CONFIRMED`

Stock cannot go negative, and it is not application code that guarantees it —
the decrement carries its own precondition:

```sql
UPDATE products SET "currentStock" = "currentStock" - $1
 WHERE id = $2 AND "currentStock" >= $1
RETURNING ...
```

Zero rows affected means there was not enough. The obvious alternative — read
the stock, check it in JavaScript, write it back — is a race: two concurrent
requests both read "50 available", both pass, and both dispatch 40.

Two tests exercise this directly:

```
ten concurrent withdrawals of 20 from a balance of 120
  → exactly 6 succeed, 4 rejected, balance lands on 0

five simultaneous challan confirms for 2 units each, only 5 in stock
  → exactly 2 confirm, 3 rejected, balance lands on 1
```

`docs/ARCHITECTURE.md` explains the rest of the reasoning.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js, TypeScript, Express 4 |
| Database | PostgreSQL (Neon), Prisma ORM |
| Validation | Zod |
| Auth | JWT + bcrypt, role-based access control |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Data layer | TanStack Query, axios |
| Deployment | Vercel (frontend), Render (API), Neon (database) |

---

## Features

**Authentication and roles** — JWT login, four roles, `authenticate` and
`authorize(...roles)` as separate middleware. The signed-in user is re-read from
the database on every request, so deactivating an account cuts access
immediately rather than whenever their token expires.

**Customer CRM** — full CRUD, search across five fields, filters on status and
type, a follow-ups-due view, and a follow-up note timeline that can reschedule
the customer in the same call.

**Products and inventory** — catalogue with pricing, low-stock alerts computed
rather than stored, and a stock ledger where every movement records the balance
it produced. Stock is not directly settable: even a new product's opening stock
is applied as an `IN` movement so the first balance it ever has is explained by
a ledger row.

**Sales challans** — draft and confirmed states, automatic `CH-YYYYMM-NNNN`
numbering issued from a counter table inside the transaction, product and
customer snapshots on every line, atomic confirmation, and cancellation that
returns stock as `IN` movements rather than deleting the original `OUT` rows.

---

## API

Base path `/api`. Every response follows one shape:

```jsonc
// success
{ "success": true, "data": ..., "meta": { /* pagination */ }, "message": "..." }

// failure
{ "success": false, "message": "...", "details": [ /* field errors */ ] }
```

<details>
<summary><strong>All 40 endpoints</strong></summary>

### Auth
| Method | Path | Roles |
|---|---|---|
| POST | `/api/auth/login` | public |
| GET | `/api/auth/me` | any |
| POST | `/api/auth/logout` | any |
| GET | `/api/auth/admin-check` | ADMIN — demonstrates RBAC |

### Customers
| Method | Path | Roles |
|---|---|---|
| GET | `/api/customers` | any |
| GET | `/api/customers/summary` | any |
| POST | `/api/customers` | ADMIN, SALES |
| GET | `/api/customers/:id` | any |
| PATCH | `/api/customers/:id` | ADMIN, SALES |
| DELETE | `/api/customers/:id` | ADMIN |
| POST | `/api/customers/:id/reactivate` | ADMIN |
| GET | `/api/customers/:id/followups` | any |
| POST | `/api/customers/:id/followups` | ADMIN, SALES |

### Products
| Method | Path | Roles |
|---|---|---|
| GET | `/api/products` | any |
| GET | `/api/products/summary` | any |
| GET | `/api/products/low-stock` | any |
| GET | `/api/products/categories` | any |
| POST | `/api/products` | ADMIN, WAREHOUSE |
| GET | `/api/products/:id` | any |
| PATCH | `/api/products/:id` | ADMIN, WAREHOUSE |
| DELETE | `/api/products/:id` | ADMIN |
| POST | `/api/products/:id/reactivate` | ADMIN |
| POST | `/api/products/:id/stock` | ADMIN, WAREHOUSE |

### Stock ledger
| Method | Path | Roles |
|---|---|---|
| GET | `/api/stock-movements` | any |
| GET | `/api/stock-movements/summary` | any |

### Challans
| Method | Path | Roles |
|---|---|---|
| GET | `/api/challans` | any |
| GET | `/api/challans/summary` | any |
| POST | `/api/challans` | ADMIN, SALES |
| GET | `/api/challans/:id` | any |
| PATCH | `/api/challans/:id` | ADMIN, SALES — drafts only |
| POST | `/api/challans/:id/confirm` | ADMIN, SALES, WAREHOUSE |
| POST | `/api/challans/:id/cancel` | ADMIN |

### Health
| Method | Path | Roles |
|---|---|---|
| GET | `/api/health` | public — returns 503 if the database is unreachable |
| GET | `/api` | public — lists every endpoint |

</details>

Listing endpoints support `page`, `limit` (capped at 100), `search`, filters and
`sortBy`/`sortOrder`.

### Postman

Import [`postman/ERP-CRM.postman_collection.json`](postman/ERP-CRM.postman_collection.json)
— 54 requests in 6 folders.

Run **1. Authentication → Login as Admin** first; it captures the token into a
collection variable, so every other request works immediately. Set `baseUrl` to
the deployed API to run the collection against production.

Folder 5 is a numbered walkthrough: raise a draft → see stock unchanged →
confirm → see stock drop → cancel → see stock return. Requests named
"expect 4xx" are meant to fail; they demonstrate validation, authorisation and
the stock guard.

---

## Running it locally

Requires **Node.js 20+** and a **PostgreSQL** database.

```bash
git clone https://github.com/vicky3741/erp-crm-portal.git
cd erp-crm-portal

npm run install:all

cp backend/.env.example backend/.env      # set DATABASE_URL and JWT_SECRET
cp frontend/.env.example frontend/.env    # leave VITE_API_URL empty for local

npm run db:migrate
npm run db:seed

npm run dev
```

Frontend <http://localhost:5173> · API <http://localhost:4000/api/health>

The Vite dev server proxies `/api/*` to the backend, so local development shares
an origin and never touches CORS.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Backend and frontend together |
| `npm run build` | Production build of both |
| `npm run typecheck` | TypeScript across both |
| `npm run db:seed` | Reset to the demo dataset |
| `npm run db:verify` | Assert every business invariant against the database |
| `npm run test:smoke` | 135 checks against a running API |
| `npm --prefix backend run postman` | Regenerate the Postman collection |

---

## Verifying it works

```bash
npm run dev          # in one terminal
npm run test:smoke   # in another
```

135 checks covering routing, validation, authentication, authorisation, status
codes, pagination boundaries, soft deletes, transaction rollback and
concurrency. Set `API_URL` to run the same suite against the deployed API:

```bash
cd backend
API_URL=https://erp-crm-api-4vpn.onrender.com npm run test:smoke
```

All 135 pass against the deployed API, not only locally.

```bash
npm run db:verify
```

Seven assertions straight against the database: stock equals the sum of its
movements, every recorded balance matches the running total, no negative stock,
challan totals equal their line items, confirmed challans moved stock and drafts
did not, every challan item carries its snapshot, and the challan sequence
covers every number issued.

---

## Environment variables

**Backend** — [`backend/.env.example`](backend/.env.example)

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` / `production` / `test` |
| `PORT` | API port; Render injects its own |
| `DATABASE_URL` | PostgreSQL connection string — Neon's **direct** endpoint, not the pooled one |
| `JWT_SECRET` | Signing secret, minimum 16 characters |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `BCRYPT_SALT_ROUNDS` | bcrypt cost factor |

**Frontend** — [`frontend/.env.example`](frontend/.env.example)

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend origin in production; empty locally |

The backend validates every variable with Zod on boot and refuses to start on a
bad or missing value, so misconfiguration fails immediately and loudly instead
of at request time.

---

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layering, request lifecycle, ER diagram, and the reasoning behind every significant decision |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Server setup, environment management, step-by-step deployment, verification checklist |
| [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) | Assumptions, trade-offs, what was deliberately not built, and known rough edges |

---

## Repository layout

```
erp-crm-portal/
├── backend/
│   ├── prisma/          schema, migrations, seed, integrity checker
│   ├── scripts/         smoke test, auth walkthrough, Postman generator
│   └── src/
│       ├── config/      env validation, Prisma client
│       ├── middleware/  auth, validation, rate limiting, error handling
│       ├── modules/     auth, customers, products, stock, challans
│       ├── routes/      central API router
│       └── utils/       AppError, response envelope, shared query schemas
├── frontend/
│   └── src/
│       ├── api/         axios client, typed endpoints
│       ├── components/  ui primitives, app shell
│       ├── context/     auth context
│       ├── features/    per-domain forms and modals
│       ├── pages/       one component per route
│       └── routes/      router and auth guard
├── docs/
├── postman/
├── render.yaml
└── PLAN.md
```
