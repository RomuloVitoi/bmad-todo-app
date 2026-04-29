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
