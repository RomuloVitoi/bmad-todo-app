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
cp apps/web/.env.example apps/web/.env.local
npm install
npm run dev
```

On first run this will:
1. Bring up Postgres in Docker (`docker compose up -d --wait db`).
2. Apply Drizzle migrations (`npm --workspace apps/api run db:migrate`).
3. Start `next dev` on http://localhost:3000 and Fastify on http://localhost:4000.

> **Why two env files?** The root `.env` is consumed by `docker-compose` and the API
> workspace. Next.js only auto-loads env files from inside `apps/web/`, so the web app
> needs its own `apps/web/.env.local` (gitignored) for `NEXT_PUBLIC_API_URL`.

Open http://localhost:3000 to see the app.
The API is served at http://localhost:4000; OpenAPI docs are at http://localhost:4000/docs (dev only).

**Stopping:** `Ctrl+C` halts both dev servers. Postgres remains running between sessions.
To stop Postgres explicitly: `docker compose down`.

**Or, run everything in Docker (no `npm install` needed):**

```bash
cp .env.example .env
docker compose up --build
```

This builds and starts `db`, runs migrations via a one-shot `migrate` service,
then starts `api` (http://localhost:4000) and `web` (http://localhost:3000).
Use this to try the app without a Node toolchain, or to sanity-check the
production-style images locally. `docker compose down` stops it;
`docker compose down -v` also drops the Postgres volume.

## Project Layout

```text
apps/web/            # Next.js 16 frontend (port 3000)
apps/api/            # Fastify 5 backend (port 4000)
packages/shared/     # Zod contracts + TS types shared by both apps
docker-compose.yml   # Full stack (db + migrate + api + web); `npm run dev` only uses `db`
scripts/dev.sh       # Single-command orchestrator (npm run dev)
```

## Useful Scripts

| From root | What it does |
| --------- | ------------ |
| `npm run dev` | Start the full stack (DB + migrate + web + api) |
| `npm run lint` | ESLint across all workspaces |
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm run test` | Run unit tests in all workspaces (no DB required) |
| `npm run test:e2e` | Playwright E2E across Chromium / Firefox / WebKit (run `npm --workspace apps/web run test:e2e:install` once first) |

## End-to-end tests

Real-browser E2E tests live in [apps/web/e2e/](apps/web/e2e/) and run via
Playwright across Chromium, Firefox, and WebKit. They are intentionally
separate from `npm run test` so contributors and CI jobs that do not want
browser dependencies are not forced to install them. First-time setup:

```bash
npm --workspace apps/web run test:e2e:install   # downloads browser binaries
```

Then `npm run test:e2e` from the repo root. Playwright auto-starts the full
dev stack via [scripts/dev.sh](scripts/dev.sh) when it isn't already running.
See [apps/web/e2e/README.md](apps/web/e2e/README.md) for details.

## Troubleshooting

- **Port 5432 already in use:** another Postgres instance is running. Stop it (`brew services stop postgresql` on macOS) or change the host port mapping in [docker-compose.yml](docker-compose.yml).
- **Port 3000 or 4000 in use:** another app is bound. Override `PORT` in `.env` (api) or kill the offender (`lsof -i :3000`).
- **`.env not found`:** copy the template — `cp .env.example .env`.
- **Web fails to start with `NEXT_PUBLIC_API_URL is required`:** Next.js only reads env files inside `apps/web/`, not the monorepo-root `.env`. Copy the template — `cp apps/web/.env.example apps/web/.env.local`.
- **Migrations fail with "schema is behind":** run `npm --workspace apps/api run db:check` to see the drift, then `npm --workspace apps/api run db:migrate`.
- **Web shows "Could not load todos":** check the API is up (`curl http://localhost:4000/health`) and that `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` matches.

## Deployment

Production runs three containers: `web` (Next.js), `api` (Fastify), `db` (Postgres 17).
Both app images publish to GHCR on every push to `main`:

- `ghcr.io/<owner>/todo-app-web:latest` (and `:<short-sha>`)
- `ghcr.io/<owner>/todo-app-api:latest` (and `:<short-sha>`)

[docker-compose.yml](docker-compose.yml) is the single file for both local dev's Postgres
(`docker compose up -d --wait db`, used by `npm run dev`) and a full containerized run
(`docker compose up --build`) — usable as-is for VPS / single-host deployments and as a
model for Kubernetes / Fly / Railway / Cloud Run conversions.

### Required environment variables (production)

| Variable | Where consumed | Notes |
| -------- | -------------- | ----- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `db`, `migrate`, `api` | Bootstrap credentials for the Postgres image; also used to build `DATABASE_URL` for `migrate`/`api` |
| `CORS_ORIGIN` | `api` | The web tier's public origin, e.g., `https://todos.example.com` |
| `LOG_LEVEL` | `api` (optional) | Pino level; default `info` |
| `NODE_ENV=production` | `api` | Disables `/docs` (Swagger UI) by default |
| `NEXT_PUBLIC_API_URL` | **`web` (build-time, not runtime)** | Inlined into the bundle at `next build`; changing it requires a REBUILD |
| `PORT_API`, `PORT_WEB` | host | Host port mappings for `api`/`web`; default `4000`/`3000` |

### Database migrations

The `migrate` service in [docker-compose.yml](docker-compose.yml) runs `drizzle-kit migrate`
against `db` as a one-shot job; `api` waits on `migrate` succeeding
(`depends_on: condition: service_completed_successfully`) before it starts. Re-running
`migrate` against an already-current DB is a no-op. The API additionally performs a
fail-fast schema-drift check at startup (resolves Architecture §Gap Analysis gap #1) —
if the DB schema is somehow behind, the API exits non-zero rather than serving against
a stale schema.

To run migrations by hand (e.g. against a remote/managed Postgres, without the compose
stack):

```bash
cd apps/api
DATABASE_URL=postgres://... npx drizzle-kit migrate
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
CORS_ORIGIN=https://todos.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
NODE_ENV=production
EOF

docker compose --env-file .env.production up --build -d
```

### Backups and disaster recovery

Out of scope for v1. The `todo-app-db-data` named volume in
[docker-compose.yml](docker-compose.yml) persists state between container restarts;
the deployer is responsible for snapshotting / `pg_dump`-ing on a schedule appropriate
to their environment.

### What CI does on push to `main`

Both Docker images are built and published to GHCR with two tags:

- `:latest` — convenience pointer to the tip of `main`
- `:<short-sha>` — immutable, ideal for production pinning

No auto-deploy runs. Pulling and rolling images is the deployer's responsibility.
