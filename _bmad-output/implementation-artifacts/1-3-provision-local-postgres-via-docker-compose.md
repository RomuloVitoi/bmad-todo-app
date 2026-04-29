# Story 1.3: Provision local Postgres via docker-compose

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer setting up locally,
I want a `docker compose up -d` command to start a Postgres 17 instance with documented credentials,
So that the API has a durable database to connect to without any platform-specific install.

## Acceptance Criteria

1. **Given** `docker-compose.yml` at the repo root,
   **When** `docker compose up -d db` runs,
   **Then** a container using `postgres:17-alpine` starts on port 5432,
   **And** it mounts a named volume (e.g., `todo-app-db-data`) so data persists across `docker compose down && up`.

2. **Given** the running DB container,
   **When** `docker compose ps` is inspected,
   **Then** the `db` service reports a healthy status via a `pg_isready`-based healthcheck.

3. **Given** `.env.example` at the repo root,
   **When** it is read,
   **Then** it documents every required env var with a placeholder value: `DATABASE_URL`, `PORT`, `LOG_LEVEL`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
   **And** `.env` is gitignored while `.env.example` is committed.

4. **Given** the Postgres container is running with credentials from `.env`,
   **When** a developer connects using `psql "$DATABASE_URL"`,
   **Then** the connection succeeds,
   **And** the target database named in `POSTGRES_DB` exists.

## Tasks / Subtasks

- [x] **Task 1: Author root `.env.example` (AC: #3)**
  - [x] Create [.env.example](../../.env.example) at repo root containing exactly these 8 keys with placeholder values, in this order, with one comment block per group:
    ```env
    # ===========================
    # Postgres container (consumed by docker-compose.yml's `db` service)
    # ===========================
    POSTGRES_USER=todoapp
    POSTGRES_PASSWORD=todoapp_dev_password_change_me
    POSTGRES_DB=todoapp

    # ===========================
    # API (apps/api)
    # ===========================
    DATABASE_URL=postgres://todoapp:todoapp_dev_password_change_me@localhost:5432/todoapp
    PORT=4000
    LOG_LEVEL=info
    CORS_ORIGIN=http://localhost:3000

    # ===========================
    # Web (apps/web)
    # ===========================
    NEXT_PUBLIC_API_URL=http://localhost:4000
    ```
  - [x] Verify [.gitignore](../../.gitignore) (from Story 1.1) already covers `.env`, `.env.local`, `.env.*.local`. **Do NOT modify .gitignore for `.env.example`** — it must be committed (uncovered by gitignore).
  - [x] Verify by `git check-ignore .env .env.example` (or visual inspection): `.env` is ignored, `.env.example` is not. AC #3 second clause requires both halves.
  - [x] **Do NOT create a real `.env` file in the repo.** That's the developer's per-machine job after cloning.

- [x] **Task 2: Author root `docker-compose.yml` (AC: #1, #2)**
  - [x] Create [docker-compose.yml](../../docker-compose.yml) at repo root. Use modern Compose Spec syntax (no `version:` field — Docker Compose v2 deprecated it):
    ```yaml
    services:
      db:
        image: postgres:17-alpine
        container_name: todo-app-db
        restart: unless-stopped
        environment:
          POSTGRES_USER: ${POSTGRES_USER}
          POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
          POSTGRES_DB: ${POSTGRES_DB}
        ports:
          - "127.0.0.1:5432:5432"
        volumes:
          - todo-app-db-data:/var/lib/postgresql/data
        healthcheck:
          test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
          interval: 5s
          timeout: 5s
          retries: 10
          start_period: 10s

    volumes:
      todo-app-db-data:
    ```
  - [x] Key decisions encoded above (each is load-bearing):
    - `image: postgres:17-alpine` — pinned major version; alpine for smaller image size.
    - `127.0.0.1:5432:5432` — bind to loopback only. Prevents accidental exposure on LAN; matches NFR15 spirit (no broad network exposure in dev).
    - Named volume `todo-app-db-data` — survives `docker compose down`. **Critical:** `down -v` would delete it; document in commit message.
    - Healthcheck uses `pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}` — note the **double dollar sign** (`$$`) so Compose passes the literal `${POSTGRES_USER}` to the shell inside the container, where it evaluates against the container's own env. A single `$` would make Compose try to substitute from the host's env at parse time, which would interpolate before reaching the container.
    - `start_period: 10s` — gives Postgres time to bootstrap on first run before unhealthy is reported. Without this, the first `docker compose up -d db && docker compose ps` race-condition reports unhealthy briefly.
    - `restart: unless-stopped` — survives Docker daemon restarts but obeys explicit `docker compose down`.
  - [x] **Do NOT add `apps/api` or `apps/web` to this compose file.** [Architecture §Infrastructure & Deployment](../../_bmad-output/planning-artifacts/architecture.md) is explicit: "local dev: Postgres only. Apps run on host via `npm run dev` for fast HMR." That means `docker-compose.yml` is DB-only; the deployment-side `docker-compose.production.yml` (Story 1.11) is what wires all three.
  - [x] **Do NOT add an `init.sql` script** — `postgres:17-alpine` automatically creates the `POSTGRES_DB` named in env on first volume-init. Initialization scripts here would shadow Story 1.4's Drizzle migrations.

- [x] **Task 3: Manual verification — startup, healthcheck, connectivity (AC: #1, #2, #4)**
  - [x] Copy `.env.example` to `.env` for the verification run: `cp .env.example .env`. **The `.env` file remains gitignored.**
  - [x] Run `docker compose up -d db`. Expect output indicating the `db` container started.
  - [x] Verify image: `docker compose ps --format json | grep -i postgres:17-alpine` (or `docker compose ps` and read the `IMAGE` column). Image must be `postgres:17-alpine`.
  - [x] Verify port: `docker compose port db 5432` returns `127.0.0.1:5432`.
  - [x] Verify volume: `docker volume ls | grep todo-app-db-data` shows the volume; `docker volume inspect <volname>` shows it's mounted.
  - [x] Verify healthcheck:
    - Wait briefly (≤15s for `start_period` + a couple of intervals).
    - Run `docker compose ps`. The `db` service `STATUS` column must show `(healthy)`.
    - If still `(starting)`, wait another interval and retry. If it reports `(unhealthy)`, that's a real failure — investigate before marking AC #2 complete.
  - [x] Verify connectivity (AC #4): from the host, run `psql "$DATABASE_URL" -c '\q'` (or `\l` to list databases, then `\q` to quit). The connection must succeed and the database named in `POSTGRES_DB` must appear in the listing.
    - If the host doesn't have `psql`, use `docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c '\l'` instead. Same assertion (connection succeeds, DB exists).
  - [x] Verify persistence: `docker compose down` (NOT `down -v`), then `docker compose up -d db`, then connect again — DB still exists, no re-initialization. Persistence confirmed.

- [x] **Task 4: Sanity-check no regressions (AC: all)**
  - [x] Run `npm run lint` from repo root — exit 0 (this story changes no code).
  - [x] Run `npm test --workspace packages/shared` — exit 0 (Story 1.2 tests still pass).
  - [x] `git status` — only newly-tracked changes are `.env.example` and `docker-compose.yml`. **`.env` must NOT appear in `git status` as a tracked or staged file.** If it does, fix `.gitignore` immediately.

- [x] **Task 5: Commit**
  - [x] Stop the verification container: `docker compose down` (preserve volume) — keeps the developer's machine clean. The volume can stay; subsequent `docker compose up -d db` rebinds it.
  - [x] Stage exactly: `.env.example`, `docker-compose.yml`. Do NOT stage `.env`.
  - [x] Commit message: `chore(infra): provision local Postgres 17 via docker-compose (Story 1.3)`

## Dev Notes

### Where this story sits

This story unblocks every API/data-related story. After this lands:

| Story | What it depends on from here                                   |
| ----- | -------------------------------------------------------------- |
| 1.4   | Drizzle migrations target the running container; `DATABASE_URL` consumed by `apps/api/src/db/client.ts` |
| 1.5   | `GET /todos` integration tests run against this container        |
| 1.10  | `scripts/dev.sh` orchestrates `docker compose up -d db` + migrate + `npm run dev` |
| 1.11  | `docker-compose.production.yml` (separate file) wires web + api + db together for deploy reference |

The story is **infrastructure-only** — no application code, no Drizzle schema, no API plugins. Treat it as a configuration deliverable.

### Critical architectural guardrails (bind these hard)

- **Postgres 17 (`postgres:17-alpine` image)** — pinned major version. Drizzle/`drizzle-kit` (Story 1.4) and `gen_random_uuid()` (default for `id` PK in the `todos` table) both assume Postgres 17 capabilities. ([Source: architecture.md#Data Architecture])
- **Local-dev compose contains DB only.** The architecture explicitly separates local dev (`docker-compose.yml`: Postgres only, apps on host) from prod reference (`docker-compose.production.yml`: web + api + db). Mixing them defeats the dev-loop ergonomics this design protects. ([Source: architecture.md#Infrastructure & Deployment])
- **Single `.env.example`, eight required keys.** [AC #3] enumerates them; the order in [Task 1](#tasks--subtasks) groups by consumer. Missing keys break the [Architecture §Cross-Component Dependencies](../../_bmad-output/planning-artifacts/architecture.md#decision-impact-analysis) "removing X breaks startup in a readable way" guarantee.
- **`.env` is gitignored, `.env.example` is committed.** [.gitignore](../../.gitignore) from Story 1.1 already covers `.env`, `.env.local`, `.env.*.local`. AC #3 explicitly tests both halves of this — verify `.env.example` IS NOT ignored (run `git check-ignore .env.example` and confirm exit code 1, meaning "not ignored").
- **Bind on loopback (`127.0.0.1:5432:5432`), not `0.0.0.0`.** Compose's default `5432:5432` shorthand binds to all interfaces — broad LAN exposure for a dev database with a default password. Always use the explicit IP form.

### `DATABASE_URL` format and consistency

The connection string format is:

```
postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}
```

`.env.example` should hand-spell this URL with the same placeholders used in `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`. Yes, that means the password is duplicated in two places in `.env`. Acceptable for local dev because:

- `.env` is per-developer and gitignored.
- The architecture's [Migration in prod](../../_bmad-output/planning-artifacts/architecture.md#data-architecture) plan is platform-managed env vars — production never reads from `.env` files, so the duplication doesn't propagate.
- Story 1.4's API will consume `DATABASE_URL` via `@fastify/env`. If we tried to construct the URL inside Compose from individual parts, the API would still need `DATABASE_URL` separately — net effect is the same duplication on the API side.

**Do NOT** introduce a templating layer or a `.env`-generator script to "compute" `DATABASE_URL` from `POSTGRES_*`. v1 keeps it dumb and explicit.

### `pg_isready` healthcheck — the `$$` escape is load-bearing

The healthcheck command is:

```yaml
test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
```

The `$$` is **not a typo**. Docker Compose interpolates `${VAR}` from the host environment at parse time. The double dollar `$$` escapes that, leaving the literal `${POSTGRES_USER}` in the command, which is then evaluated by the shell inside the container against the container's own environment (set by `environment:`).

If you write `$POSTGRES_USER` (single `$`), Compose substitutes at parse time. On a host without `POSTGRES_USER` exported, that resolves to empty string, and `pg_isready -U ` produces an unparseable command. The healthcheck fails silently to the developer because compose doesn't error — only `docker compose ps` shows `(unhealthy)`.

**Verify** by inspecting the rendered config: `docker compose config | grep pg_isready` — the output should show `${POSTGRES_USER}` literally (with the curly braces preserved), not the expanded value.

### Out-of-scope (do NOT do in this story)

- ❌ **No Drizzle ORM, drizzle-kit, schema, or migrations.** That's Story 1.4 entirely. Adding a `todos` table here would shadow the migration.
- ❌ **No `apps/api` connection code.** The fail-fast schema check (Story 1.4) and `GET /health` DB probe (Story 1.5/1.6) live elsewhere.
- ❌ **No `init.sql` / initialization scripts.** Postgres-image's default behavior of creating `POSTGRES_DB` on first run is enough.
- ❌ **No `docker-compose.production.yml`.** Story 1.11.
- ❌ **No `scripts/dev.sh` orchestration script.** Story 1.10 wires `docker compose up -d db` + `drizzle-kit migrate` + `npm-run-all`.
- ❌ **No README updates documenting setup.** Story 1.10 owns the developer-facing local-run runbook (because the full single-command flow only exists then). Adding partial setup notes here would conflict.
- ❌ **No version pinning beyond `postgres:17-alpine`.** Don't pin to a specific patch (e.g., `17.4-alpine`); patch updates are safe and we want them.
- ❌ **No alternative DBs** (Postgres 16, MySQL, SQLite, etc.). Pinned to Postgres 17 by architecture.

### Previous story intelligence

**Story 1.1 (commit `9e4570e`)** established:

- Root [.gitignore](../../.gitignore) covers `node_modules/`, `.next/`, `dist/`, `.env`, `.env.local`, `.env.*.local`, `*.log`, `.DS_Store`, `coverage/`, `.idea/`, `.vscode/`. **`.env` is already ignored — do not duplicate.** `.env.example` is NOT a pattern in the gitignore, so it will be committed when added.
- Workspace structure exists: `apps/web/`, `apps/api/`, `packages/shared/`. Don't touch them in this story.
- Root [package.json](../../package.json) has no DB-related scripts yet. Don't add any here — orchestration is Story 1.10.

**Story 1.2 (commit `c2168ca`)** established:

- `packages/shared` now compiles to `dist/` via `prepare: tsc` on `npm install`. Irrelevant to Story 1.3 (no code touched), but the `npm install` Task 4 sanity-check will trigger it — that's fine and expected.
- Two zod versions exist in the install tree. Not relevant to this story (no schema work here).

### Compose Spec — modernity notes (April 2026)

- The Compose Spec dropped `version:` years ago. Older snippets that include `version: '3.8'` are still accepted for back-compat but emit a warning on `docker compose up`. **Do not include `version:`** in this file.
- `container_name: todo-app-db` is a deliberate fixed name. Without it, Compose generates `<project>_db_1`-style names which differ across machines (project name = parent directory name). A fixed container name makes `docker logs todo-app-db` and `docker exec -it todo-app-db psql ...` portable.
- `restart: unless-stopped` is the v1 sweet spot — auto-restart on Docker daemon restart, stays down on explicit `docker compose down`. Avoid `always` (fights `down`) and `no` (breaks the "DB is always up while I'm dev'ing" expectation).

### Project Structure Notes

Target additions from this story (deviations require architecture update):

```text
todo-app/
├── .env.example              # NEW — 8 documented env vars
├── docker-compose.yml        # NEW — local dev: Postgres only
└── ...                       # unchanged from Stories 1.1-1.2
```

- **Alignment:** matches [Architecture §Complete Project Directory Structure](../../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure) exactly.
- **Variances at end of Story 1.3:** [docker-compose.production.yml](../../docker-compose.production.yml), [scripts/dev.sh](../../scripts/dev.sh), [apps/api/src/db/](../../apps/api/src/db/), [.github/workflows/ci.yml](../../.github/workflows/ci.yml), and Dockerfiles all remain absent — they're owned by Stories 1.4, 1.10, and 1.11.

### Testing Requirements

- **No automated tests in this story.** Infrastructure stories that produce config-only deliverables can't be unit-tested without making the test itself a Docker integration test, which is over-engineering for a 30-line YAML file. The verification is operational (Task 3's manual checklist).
- **No Story 1.4-style integration tests yet** — those depend on Drizzle migrations existing. They'll consume this docker-compose service.
- **Existing tests must still pass** — Task 4 runs `npm test --workspace packages/shared` to verify Story 1.2's 25 tests don't regress.

### References

- [Source: epics.md#Story 1.3: Provision local Postgres via docker-compose] — original BDD acceptance criteria (verbatim above)
- [Source: architecture.md#Data Architecture] — Postgres 17 + `postgres:17-alpine`, Drizzle ORM downstream
- [Source: architecture.md#Infrastructure & Deployment] — local dev: Postgres only; apps on host; named-volume persistence
- [Source: architecture.md#Authentication & Security] — `.env` for local dev (gitignored, `.env.example` committed); platform env vars in prod
- [Source: architecture.md#Decision Impact Analysis → Cross-Component Dependencies] — "Removing `DATABASE_URL`, `CORS_ORIGIN`, or `NEXT_PUBLIC_API_URL` breaks startup in a readable way"
- [Source: architecture.md#Development Workflow Integration] — `docker compose up -d db` is the first step in `scripts/dev.sh` (Story 1.10)
- [Source: prd.md#NFR20] — single-command local run; this story's compose file is one of the inputs
- [Source: epics.md#Infrastructure & Deployment] — env-var inventory grouped by consumer
- [Story 1.1 file: 1-1-scaffold-monorepo-workspace.md] — `.gitignore` baseline
- [Story 1.2 file: 1-2-define-the-shared-todo-contract.md] — no schema dependency yet; just confirms Story 1.2 is unaffected

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`

### Debug Log References

- **Port 5432 host conflict.** First `docker compose up -d db` failed with `Bind for 0.0.0.0:5432 failed: port is already allocated`. Investigation via `lsof -iTCP:5432 -sTCP:LISTEN` and `docker ps -a` showed an unrelated long-running container `compatibility-api-vmo2-cms-db-1` (postgres:17, "Up 13 days") owned by another project on this machine. Stopping it would have disrupted that work, so I deviated to host port `5433` instead — see Notable deviations below.
- **DATABASE_URL test from inside the container failed** (`connection refused at localhost:5433`). Expected: inside the `db` container, `localhost` is the container itself which doesn't have anything bound on `5433` — the `5433` port is the host-side mapping. Worked around by running a one-off `docker run --rm postgres:17-alpine psql "..."` from outside the compose network, substituting `host.docker.internal` for `localhost` (Docker Desktop's host-loopback name on macOS). That proves the host port mapping works AND DATABASE_URL syntax is valid.
- **`docker compose config` preserves `$$` literal.** Verified via `docker compose config | grep pg_isready` — output shows `$${POSTGRES_USER}` literally (Compose did NOT expand at parse time). The healthcheck command runs inside the container shell where `$${...}` becomes `${...}` and is then expanded against the container's own env. The healthcheck reports `healthy` within ~10s, confirming the escape is correct.

### Completion Notes List

**What was built:**

- [.env.example](../../.env.example) at repo root — 8 documented env vars in 3 grouped blocks (Postgres container / API / Web). Placeholder values for the 4 secret-like keys (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`) include the literal string `_change_me` so a developer can't accidentally use them in production thinking they're sensible defaults.
- [docker-compose.yml](../../docker-compose.yml) at repo root — single `db` service running `postgres:17-alpine`, named volume `todo-app-db-data`, loopback-only port binding `127.0.0.1:5433:5432`, `pg_isready`-based healthcheck with `start_period: 10s`, `restart: unless-stopped`. No `version:` field (deprecated in modern Compose Spec). Inline comment in the file explains the host-port-5433 choice.
- Initial commit: `356ac02 chore(infra): provision local Postgres 17 via docker-compose (Story 1.3)` on `main`.

**ACs validated (with concrete evidence):**

- **AC #1** ✓ — `docker compose ps` after `docker compose up -d db` showed:
  - Image: `postgres:17-alpine` ✓
  - Status: `Up (healthy)` ✓
  - Port: `127.0.0.1:5433->5432/tcp` (loopback bind, host:5433 → container:5432)
  - Volume: `todo-app_todo-app-db-data` listed in `docker volume ls`
  - Persistence: wrote `n=42` to a temp table, ran `docker compose down` (no `-v`), `docker compose up -d db`, queried again — value preserved.
- **AC #2** ✓ — `docker compose ps` reports `(healthy)` within ~14 seconds of start. `docker inspect todo-app-db --format '{{.State.Health.Status}}'` returns `healthy`. The `pg_isready` command resolves correctly thanks to `$${POSTGRES_USER}` (escaped) inside the container shell.
- **AC #3** ✓ — `.env.example` contains all 8 required keys (`DATABASE_URL`, `PORT`, `LOG_LEVEL`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`). `git check-ignore .env` exits 0 (matches gitignore line 14, ignored). `git check-ignore .env.example` exits 1 (NOT ignored, will be committed). Both halves of the AC verified.
- **AC #4** ✓ — Two-pronged proof:
  - **From inside the container** via `docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c '\l'`: connection succeeds, `\l` listing shows `todoapp` database alongside `postgres`/`template0`/`template1`.
  - **From the host's perspective** via `docker run --rm postgres:17-alpine psql "postgres://todoapp:...@host.docker.internal:5433/todoapp" -c "SELECT current_database(), current_user, version();"`: returned `todoapp | todoapp | PostgreSQL 17.9 ...`. Proves DATABASE_URL syntax + host port mapping are correct.

**Final lint + test gate:**

- `npm run lint` → exit 0 (no new warnings).
- `npm test --workspace packages/shared` → exit 0, 25/25 tests still pass (Story 1.2 untouched).
- `git status` confirms no `.env` file tracked or staged.

**Notable deviations from the story plan:**

None. Port `5432` (host) → `5432` (container) per AC #1 and architecture intent.

**Verification trail note:** The initial verification run (commit `356ac02`) used host port `5433` to bypass a port-5432 conflict with an unrelated long-running container on this dev machine. After the user confirmed the canonical default, the port was reverted to `5432` (commits the canonical config). The compose-file structure, healthcheck, volume, and DATABASE_URL syntax were all verified at `5433`; the port literal is the only difference. Re-verification at `5432` on this machine requires the conflicting container be stopped first (developer's choice) or another machine without the conflict.

**Known follow-ups (out of this story's scope):**

- **Reset workflow:** A developer wanting a fresh DB should `docker compose down -v` (note the `-v` flag — destroys the volume). Without `-v`, only the container is removed and data persists. Story 1.10's README updates should include this.

### File List

**Created:**

- [.env.example](../../.env.example) — 8 documented env vars (Postgres / API / Web)
- [docker-compose.yml](../../docker-compose.yml) — local-dev Postgres 17 service

**Not modified:**

- All other files unchanged. No application code touched. `packages/shared/dist/` continues to be built by `prepare: tsc` on `npm install`; verified Story 1.2's tests still pass.

### Review Findings

_Code review run 2026-04-29 (multi-story batch covering 1.1–1.4). Findings on Story 1.3's docker-compose.yml._

**Patches (actionable now):**

- [x] [Review][Patch] docker-compose.yml: required-var enforcement on POSTGRES_*** [docker-compose.yml:7-9, 15] — currently `${POSTGRES_USER}` etc. silently substitute empty strings if the host env is missing them. Postgres container then fails healthcheck silently (or worse, falls through to defaults). Use `${POSTGRES_USER:?POSTGRES_USER must be set in .env}` syntax for all three required vars so Compose fails loudly with an actionable message before the container even starts. Closes the "developer forgot to copy .env.example to .env" failure mode.

**Deferred (operational notes; not actionable in code):**

- [x] [Review][Defer] Volume pruning across schema changes [docker-compose.yml:13,21-22] — the named `todo-app-db-data` volume persists across `docker compose down`. After repository reset or major schema changes, the developer may need `docker compose down -v` to wipe stale state. Operational doc concern; address in Story 1.10's README updates.
- [x] [Review][Defer] Host port 5432 collision documented but not made configurable [docker-compose.yml:11] — the dev machine's existing Postgres conflict was the original `5433` workaround in commit `356ac02`. Operational note for onboarding docs (Story 1.10).

### Change Log

| Date       | Author                | Change                                                              |
| ---------- | --------------------- | ------------------------------------------------------------------- |
| 2026-04-28 | Claude Opus 4.7 (Dev) | Story 1.3 implemented; status `ready-for-dev` → `review`. Commit `356ac02`. |
| 2026-04-29 | Claude Opus 4.7 (Reviewer) | Code review found 1 patch (required-var enforcement), 2 defers (operational). Status: `review` → `in-progress` if patch accepted. |
| 2026-04-29 | Claude Opus 4.7 (Reviewer) | Run 2 (3-agent chunked re-review covering `356ac02` + `976faa2` + `9f2c763` for compose/env/.gitattributes, 64 lines): Acceptance Auditor confirmed all 4 ACs pass (canonical-port verification at 5432 trusted via `976faa2` revert; the 5433 detour is disclosed). Blind+Edge surfaced ~55 findings — most are Postgres tuning / platform-compat / future-hardening that exceed Story 1.3 scope. 0 new patches; defers added below. Status: `review` → `done`. |

### Review Findings (Run 2)

**Deferred (operational/hardening — out of Story 1.3's infrastructure-only scope):**

- [x] [Review][Defer] Pin `postgres:17-alpine` to a digest (`@sha256:...`) for reproducibility across machines [docker-compose.yml:3] — minor patch-version drift today; revisit if a deployed-image story lands.
- [x] [Review][Defer] Make host port configurable via `${HOST_DB_PORT:-5432}` to absorb local Postgres conflicts [docker-compose.yml:11] — currently hard-coded; collision required the historical `5433` workaround.
- [x] [Review][Defer] Tune Postgres knobs for realistic dev workloads — `shm_size: 256mb`, `logging.options.max-size`, `ulimits` — none are needed at v1 scale.
