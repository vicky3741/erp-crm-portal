# Deployment

Three free services, no card required:

| Piece | Platform | Why |
|---|---|---|
| PostgreSQL | Neon | Free tier, Singapore region, no card |
| API | Render | Free web service, free tier includes Singapore |
| Frontend | Vercel | Free static hosting, zero-config for Vite |

All three are in or near `ap-southeast-1`, so the API sits close to the database
— which matters, because a single page load makes several queries.

---

## 1. Database — Neon

Already provisioned. If recreating from scratch:

1. <https://neon.tech> → sign up with GitHub → **New project**
2. Region: **AWS Asia Pacific 1 (Singapore)**
3. Copy the connection string, then **remove `-pooler` from the hostname**:

   ```
   pooled   ep-name-1234-pooler.c-3.ap-southeast-1.aws.neon.tech   ← do not use
   direct   ep-name-1234.c-3.ap-southeast-1.aws.neon.tech          ← use this
   ```

   The pooled endpoint runs PgBouncer in transaction mode. It cannot run
   migrations, and it is a poor fit for the interactive transaction that
   confirms a challan while holding row locks across statements.

4. Append connection tuning:

   ```
   ?sslmode=require&connection_limit=20&pool_timeout=20
   ```

5. Apply the schema and seed the demo data:

   ```bash
   cd backend
   npx prisma migrate deploy
   npm run seed
   npm run db:verify        # optional: asserts every business invariant
   ```

**Note:** the free tier suspends compute after inactivity. The first request
after an idle period takes roughly a second while it wakes; subsequent requests
are ~85 ms. Load the app once before demonstrating it.

---

## 2. API — Render

### Option A — Blueprint

The repository contains `render.yaml`. Dashboard → **New** → **Blueprint** →
select the repo. Render reads every setting from that file; you supply only the
three secrets below.

### Option B — by hand

Dashboard → **New** → **Web Service** → connect the GitHub repo, then:

| Setting | Value |
|---|---|
| Name | `erp-crm-api` |
| Region | Singapore |
| Branch | `main` |
| **Root Directory** | `backend` |
| Runtime | Node |
| Build Command | `npm ci --include=dev && npx prisma generate && npm run build` |
| Start Command | `npx prisma migrate deploy && node dist/server.js` |
| Health Check Path | `/api/health` |
| Instance Type | Free |

**Root Directory is the setting most often missed.** Without it Render builds
from the repository root, finds no `src/server.ts`, and fails.

**`--include=dev` is not optional.** `NODE_ENV` is `production` on Render, and
npm omits devDependencies when that is set — which is exactly where `typescript`
and every `@types/*` package lives. A plain `npm ci` produces a build that fails
with dozens of `Cannot find name 'process'` and `Could not find a declaration
file for module 'express'` errors, because `tsc` is running with no type
definitions at all.

### Environment variables

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Neon **direct** connection string |
| `JWT_SECRET` | 64 random hex characters — see below |
| `JWT_EXPIRES_IN` | `7d` |
| `CORS_ORIGINS` | the Vercel URL, **no trailing slash** |
| `BCRYPT_SALT_ROUNDS` | `10` |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use a different secret in production from the one in local `.env`. A leaked
development secret should not grant access to the deployed system.

`CORS_ORIGINS` is a chicken-and-egg problem: the frontend does not exist yet.
Deploy the API first with a placeholder, deploy the frontend, then come back and
set the real value. Changing an environment variable triggers a redeploy.

### Why migrations run in the start command

`prisma migrate deploy` applies only migrations that have not been applied yet,
so it is safe on every boot and on every restart. It keeps schema changes tied
to the deploy that introduced them, with no separate manual step to forget.

---

## 3. Frontend — Vercel

<https://vercel.com> → **Add New** → **Project** → import the GitHub repo.

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| **Root Directory** | `frontend` |
| Build Command | `npm run build` *(auto-detected)* |
| Output Directory | `dist` *(auto-detected)* |

### Environment variable

| Key | Value |
|---|---|
| `VITE_API_URL` | the Render URL, e.g. `https://erp-crm-api.onrender.com` |

No trailing slash, and no `/api` — the client appends that itself.

`VITE_` variables are baked in at build time, not read at runtime. Changing this
value requires a redeploy, not just a restart.

`frontend/vercel.json` rewrites every path to `index.html`. Without it, opening
`/customers/abc123` directly, or refreshing on it, returns a Vercel 404 because
no such file exists on disk.

---

## 4. Wire the two together

1. Copy the Vercel URL
2. Render → the service → **Environment** → set `CORS_ORIGINS` to it → save
3. Render redeploys automatically

To allow more than one origin, separate with commas and no spaces:

```
https://erp-crm-portal.vercel.app,https://erp-crm-portal-git-main-you.vercel.app
```

Vercel gives every branch and every deployment its own URL. Only the production
one needs to be in the list unless preview deployments must reach the API too.

---

## 5. Verify the deployment

```bash
# API is up and can reach the database
curl https://erp-crm-api.onrender.com/api/health

# The whole test suite, against production
cd backend
API_URL=https://erp-crm-api.onrender.com npm run test:smoke
```

The smoke suite tags every record it creates with a per-run id and only ever
soft-deletes, so it is safe to run repeatedly against the deployed database.

Then in the browser:

- [ ] The frontend loads
- [ ] Log in as each of the four roles
- [ ] The sidebar differs between Sales and Warehouse
- [ ] Raise a challan, confirm it, and see the product's stock drop
- [ ] Open a detail page directly by URL and refresh it (proves the SPA rewrite)
- [ ] No CORS errors in the browser console

---

## Free tier limits worth knowing

| Service | Limit | Effect |
|---|---|---|
| Render free | Sleeps after 15 minutes idle | First request takes ~50 seconds to wake |
| Neon free | Compute suspends when idle | First query takes ~1 second |
| Vercel | None that apply here | Static files, always warm |

Render's cold start is the one that will be noticed. **Open the app a minute
before any demonstration** so both services are awake.

---

## Rotating credentials

After the assessment is assessed, rotate anything that was shared:

1. Neon → the project → **Roles** → reset the password
2. Update `DATABASE_URL` in Render and in local `.env`
3. Render → generate a new `JWT_SECRET` (this signs everyone out, which is the
   point)

---

## Local development

```bash
npm run install:all

cp backend/.env.example backend/.env       # set DATABASE_URL and JWT_SECRET
cp frontend/.env.example frontend/.env     # leave VITE_API_URL empty

npm run db:migrate
npm run db:seed
npm run dev                                # backend :4000, frontend :5173
```

The Vite dev server proxies `/api/*` to port 4000, so local development shares
an origin and never touches CORS.

| Command | What it does |
|---|---|
| `npm run dev` | Both apps together |
| `npm run build` | Production build of both |
| `npm run typecheck` | TypeScript across both |
| `npm run db:seed` | Reset to the demo dataset |
| `npm run db:verify` | Assert every business invariant |
| `npm run test:smoke` | 135 checks against a running API |
| `npm --prefix backend run postman` | Regenerate the Postman collection |
