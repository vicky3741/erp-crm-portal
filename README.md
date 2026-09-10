# Mini ERP + CRM Operations Portal

Full-stack ERP/CRM system for a wholesale & distribution business — customers, products,
stock, and sales challans, with role-based access for Admin / Sales / Warehouse / Accounts teams.

Built as a Full Stack Developer case study.

> **Status:** in development. Scaffold and database layer complete.
> Full deployment notes and architecture write-up land in S13.

---

## Demo Login Credentials

The seed script creates one user per role:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@erp.local` | `Admin@123` |
| Sales | `sales@erp.local` | `Sales@123` |
| Warehouse | `warehouse@erp.local` | `Warehouse@123` |
| Accounts | `accounts@erp.local` | `Accounts@123` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, TypeScript, Express 4 |
| Database | PostgreSQL (Prisma ORM) |
| Validation | Zod |
| Auth | JWT + bcrypt, role-based access control |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Data layer | TanStack Query, axios |
| Deployment | Vercel (frontend), Render (backend), Neon (PostgreSQL) |

---

## Repository Layout

```
erp-crm-portal/
├── backend/            # Express + TypeScript REST API
│   ├── prisma/         # schema, migrations, seed script
│   └── src/
│       ├── config/     # env validation, prisma client
│       ├── middleware/ # auth, validation, error handling
│       ├── modules/    # auth, customers, products, stock, challans
│       ├── routes/     # central API router
│       ├── utils/      # AppError, response envelope, asyncHandler
│       ├── app.ts      # express app assembly
│       └── server.ts   # http server + graceful shutdown
├── frontend/           # React + Vite admin UI
│   └── src/
│       ├── api/        # axios client + typed responses
│       ├── components/ # ui primitives, layout shell
│       ├── context/    # auth context
│       ├── features/   # per-module screens
│       ├── pages/      # route-level pages
│       └── routes/     # router + route guards
├── docs/               # architecture, deployment, assumptions
├── postman/            # exported Postman collection
└── PLAN.md             # build plan, section by section
```

---

## Quick Start (local)

Requires **Node.js 20+** and a **PostgreSQL** database.

```bash
# 1. install dependencies for root, backend and frontend
npm run install:all

# 2. configure environment
cp backend/.env.example backend/.env      # then set DATABASE_URL and JWT_SECRET
cp frontend/.env.example frontend/.env    # leave VITE_API_URL empty for local dev

# 3. create the database schema and seed demo data
npm run db:migrate
npm run db:seed

# 4. (optional) assert the seeded data satisfies every business invariant
npm run db:verify

# 5. run backend (:4000) and frontend (:5173) together
npm run dev
```

Frontend: <http://localhost:5173> · API health check: <http://localhost:4000/api/health>

The Vite dev server proxies `/api/*` to the backend, so no CORS configuration is
needed while developing locally.

---

## Environment Variables

Backend — see [`backend/.env.example`](backend/.env.example):

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` / `production` / `test` |
| `PORT` | API port (Render injects its own) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signing secret, min 16 chars |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `BCRYPT_SALT_ROUNDS` | bcrypt cost factor |

Frontend — see [`frontend/.env.example`](frontend/.env.example):

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend origin in production; empty locally |

The backend validates every variable on boot with Zod and refuses to start on a bad
or missing value, so misconfiguration fails immediately and loudly rather than at
request time.
