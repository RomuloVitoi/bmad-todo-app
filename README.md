# Shared Todos

A simple shared todo list — visible to everyone, no sign-in required.
Built as a Next.js + Fastify monorepo with a versioned Zod contract package.

## Quick Start

**Prerequisites:**
- Node 22 (use [`.nvmrc`](.nvmrc): `nvm use`)
- Docker (compose v2; `docker compose version` should report 2.x+)

**Run the full stack locally:**

```bash
git clone <this-repo>
cd todo-app
cp .env.example .env
npm install
npm run dev
```

On first run this will:
1. Bring up Postgres in Docker (`docker compose up -d --wait db`).
2. Apply Drizzle migrations (`npm --workspace apps/api run db:migrate`).
3. Start `next dev` on http://localhost:3000 and Fastify on http://localhost:4000.

Open http://localhost:3000 to see the app.
The API is served at http://localhost:4000; OpenAPI docs are at http://localhost:4000/docs (dev only).

**Stopping:** `Ctrl+C` halts both dev servers. Postgres remains running between sessions.
To stop Postgres explicitly: `docker compose down`.

## Project Layout

```text
apps/web/            # Next.js 16 frontend (port 3000)
apps/api/            # Fastify 5 backend (port 4000)
packages/shared/     # Zod contracts + TS types shared by both apps
docker-compose.yml   # Local Postgres
scripts/dev.sh       # Single-command orchestrator (npm run dev)
```

## Useful Scripts

| From root | What it does |
| --------- | ------------ |
| `npm run dev` | Start the full stack (DB + migrate + web + api) |
| `npm run lint` | ESLint across all workspaces |
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm run test` | Run unit tests in all workspaces (no DB required) |

## Troubleshooting

- **Port 5432 already in use:** another Postgres instance is running. Stop it (`brew services stop postgresql` on macOS) or change the host port mapping in [docker-compose.yml](docker-compose.yml).
- **Port 3000 or 4000 in use:** another app is bound. Override `PORT` in `.env` (api) or kill the offender (`lsof -i :3000`).
- **`.env not found`:** copy the template — `cp .env.example .env`.
- **Migrations fail with "schema is behind":** run `npm --workspace apps/api run db:check` to see the drift, then `npm --workspace apps/api run db:migrate`.
- **Web shows "Could not load todos":** check the API is up (`curl http://localhost:4000/health`) and that `NEXT_PUBLIC_API_URL` in `.env` matches.

## Deployment

Production runs three containers: `web` (Next.js), `api` (Fastify), `db` (Postgres 17).
Both app images publish to GHCR on every push to `main`:

- `ghcr.io/<owner>/todo-app-web:latest` (and `:<short-sha>`)
- `ghcr.io/<owner>/todo-app-api:latest` (and `:<short-sha>`)

The repo ships [docker-compose.production.yml](docker-compose.production.yml) as a runnable
reference deployment — usable as-is for VPS / single-host deployments and as a model for
Kubernetes / Fly / Railway / Cloud Run conversions.

### Required environment variables (production)

| Variable | Where consumed | Notes |
| -------- | -------------- | ----- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `db` | Bootstrap credentials for the Postgres image |
| `DATABASE_URL` | `api` | `postgres://user:pass@host:5432/db` — the API fails fast at startup if missing |
| `CORS_ORIGIN` | `api` | The web tier's public origin, e.g., `https://todos.example.com` |
| `LOG_LEVEL` | `api` (optional) | Pino level; default `info` |
| `NODE_ENV=production` | `api` | Disables `/docs` (Swagger UI) by default |
| `NEXT_PUBLIC_API_URL` | **`web` (build-time, not runtime)** | Inlined into the bundle at `next build`; changing it requires a REBUILD |

### Pre-deploy: run database migrations

The API performs a fail-fast schema-drift check at startup (resolves Architecture §Gap
Analysis gap #1). If the DB schema is behind the migrations expected by the deployed
code, the API exits non-zero and the deployment fails loudly.

**Run migrations BEFORE rolling new API images:**

```bash
# Option A — from a deployer machine with DATABASE_URL pointing at production
cd apps/api
DATABASE_URL=postgres://... npx drizzle-kit migrate

# Option B — one-shot container against the production DATABASE_URL
docker run --rm \
  -e DATABASE_URL=postgres://... \
  -v "$PWD/apps/api/drizzle:/app/drizzle" \
  node:22-alpine sh -c "cd /app && npx drizzle-kit@^0.30 migrate"
```

Verify the migration state at any time:

```bash
DATABASE_URL=postgres://... npm --workspace apps/api run db:check
```

`db:check` prints applied vs. expected migrations and exits non-zero on drift.

### Reference deployment (single host with docker-compose)

```bash
# On the host:
git clone <repo> && cd todo-app

cat > .env.production <<EOF
POSTGRES_USER=todoapp
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=todoapp
DATABASE_URL=postgres://todoapp:<strong-password>@db:5432/todoapp
CORS_ORIGIN=https://todos.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
EOF

# Run migrations against a temporary container
docker compose -f docker-compose.production.yml run --rm api \
  sh -c "cd /app && npx drizzle-kit@^0.30 migrate" \
  || echo "(if drizzle-kit is missing in the production image, run from a deployer host instead — see Option A above)"

# Bring up the stack
docker compose -f docker-compose.production.yml --env-file .env.production up -d
```

> **Note:** `drizzle-kit` is a devDependency, pruned from the production API image. Use
> a deployer-host invocation (Option A) for v1; a future story may add a sibling
> `apps/api/Dockerfile.migrate` that retains `drizzle-kit` for in-cluster migration jobs.

### Backups and disaster recovery

Out of scope for v1. The `todo-app-db-data` named volume in
[docker-compose.production.yml](docker-compose.production.yml) persists state between
container restarts; the deployer is responsible for snapshotting / `pg_dump`-ing on a
schedule appropriate to their environment.

### What CI does on push to `main`

Both Docker images are built and published to GHCR with two tags:

- `:latest` — convenience pointer to the tip of `main`
- `:<short-sha>` — immutable, ideal for production pinning

No auto-deploy runs. Pulling and rolling images is the deployer's responsibility.
