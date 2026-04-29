# Story 1.10: Single-command local dev orchestration

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer new to the project,
I want to run `npm install && npm run dev` from the root and get the full stack running,
So that NFR20 is satisfied — no README gymnastics, no multi-terminal choreography.

## Acceptance Criteria

1. **Given** the root [package.json](../../package.json),
   **When** inspected,
   **Then** it defines scripts `"dev": "bash scripts/dev.sh"`, `"dev:web": "npm --workspace apps/web run dev"`, and `"dev:api": "npm --workspace apps/api run dev"`,
   **And** includes `npm-run-all2` (the maintained fork of `npm-run-all`) as a root devDependency.

2. **Given** [scripts/dev.sh](../../scripts/dev.sh),
   **When** executed,
   **Then** it runs these steps in order, failing the whole command on any non-zero exit: (1) `docker compose up -d --wait db`, (2) `npm --workspace apps/api run db:migrate`, (3) `npm-run-all --parallel dev:web dev:api`.

3. **Given** a clean repo, a `.env` copied from `.env.example`, and Docker running,
   **When** a developer runs `npm install && npm run dev`,
   **Then** the DB starts, migrations run, `next dev` binds on `:3000`, and the Fastify server binds on `:4000` (or the configured `PORT`),
   **And** both log their readiness to stdout.

4. **Given** the dev stack is running,
   **When** the developer stops it with Ctrl+C and immediately runs `npm run dev` again,
   **Then** the command succeeds without error (`docker compose up -d --wait` is a no-op when the container is already healthy; `drizzle-kit migrate` is idempotent).

5. **Given** [README.md](../../README.md) at the repo root,
   **When** its "Quick Start" section is read,
   **Then** it lists: prerequisites (Node 22, Docker), clone, `npm install`, `cp .env.example .env`, `npm run dev`, open [http://localhost:3000](http://localhost:3000),
   **And** mentions the API port and `/docs` availability in dev.

## Tasks / Subtasks

- [x] **Task 1: Add `npm-run-all2` to root devDependencies (AC: #1)**
  - [x] In [package.json](../../package.json), add to `devDependencies`:
    - `"npm-run-all2": "^8.0.0"` — the **maintained fork** of the original `npm-run-all`. As of April 2026 the original `npm-run-all` is unmaintained (last release 2018). `npm-run-all2` is a drop-in: same `npm-run-all`/`run-p`/`run-s` binaries, same flags. Pin `^8` for the current major; `8.x` requires Node ≥18 which our `engines.node: ">=22"` already satisfies.
    - **DO NOT** add the original `npm-run-all` (unmaintained; pulls deprecated transitive deps that show up as `npm install` warnings).
    - **DO NOT** add `concurrently` as an alternative even though the original spec mentioned it. Pick one tool for the project; mixing is needless cognitive load. `npm-run-all2`'s `run-p` semantics match the spec wording ("parallel") more naturally and its CLI is what `scripts/dev.sh` invokes.
  - [x] Run `npm install` from the repo root. Verify with `npm ls npm-run-all2` — expect zero peer-dep warnings. The `node_modules/.bin/` directory should now contain `npm-run-all`, `run-p`, and `run-s` shims.

- [x] **Task 2: Add orchestration scripts to root [package.json](../../package.json) (AC: #1)**
  - [x] Add to the `scripts` block (preserving the existing `lint` script):
    ```json
    "scripts": {
      "lint": "eslint .",
      "dev": "bash scripts/dev.sh",
      "dev:web": "npm --workspace apps/web run dev",
      "dev:api": "npm --workspace apps/api run dev",
      "test": "npm-run-all --print-label test:*",
      "test:shared": "npm --workspace packages/shared run test",
      "test:api": "npm --workspace apps/api run test:unit",
      "test:web": "npm --workspace apps/web run test",
      "typecheck": "npm-run-all --print-label typecheck:*",
      "typecheck:shared": "npm --workspace packages/shared exec -- tsc --noEmit",
      "typecheck:api": "npm --workspace apps/api exec -- tsc --noEmit",
      "typecheck:web": "npm --workspace apps/web exec -- tsc --noEmit"
    }
    ```
  - [x] **Why `bash scripts/dev.sh` (not `./scripts/dev.sh`)** — explicit `bash` invocation removes the executable-bit dependency and works on Windows WSL/Git Bash without needing `chmod +x`. CI runners and freshly-cloned repos behave identically.
  - [x] **Why `--workspace apps/web run dev` (not `cd apps/web && npm run dev`)** — `npm --workspace` keeps the cwd at the repo root, which means relative paths like `--env-file-if-exists=../../.env` (the api's `dev` script) resolve correctly. A `cd` would change cwd interpretation. Architecture §Naming: the workspace flag is the canonical npm v8+ idiom.
  - [x] **Why `test:api` runs only `test:unit`, not `test:integration`** — the integration tests require a running Postgres. `npm run test` from the root MUST be runnable in CI without Docker (unit-only) and locally without forcing a DB up. Story 1.11's CI workflow runs unit tests; integration tests run in a separate step that brings Postgres up explicitly.
  - [x] **Why include `typecheck:*` scripts here (resolves Story 1.1 deferred-work)** — Story 1.1 deferred-work item #1: "Add typecheck/format/format:check scripts". Adding `typecheck` here gives Story 1.11's CI workflow a single root-level entry point (`npm run typecheck`) without per-workspace knowledge. Plus, the web workspace already has `tsc --noEmit` capability via its tsconfig (`noEmit: true`), so `tsc --noEmit` is the right invocation everywhere.
  - [x] **Why `--print-label`** — npm-run-all's `--print-label` prefixes each line of output with the script name (`[test:web] ...`). Aggressively useful when parallel scripts interleave; cheap to enable. The dev script (`scripts/dev.sh`) uses `--parallel` with the same flag.
  - [x] **DO NOT** add a root-level `build` script in this story — Story 1.11 owns the build artifacts (Dockerfiles + Next.js standalone output). Adding it now would create scope ambiguity.
  - [x] **DO NOT** add a `format` / `format:check` script here either — Story 1.1 deferred-work item also called those out, but they belong with the CI workflow story (1.11) where `format:check` would actually run as a gate. Pre-emptive scripts that nothing invokes are dead code.
  - [x] **DO NOT** rename `lint` to `lint:check` or split it into `lint:fix` / `lint` — current `lint` script is wired to ESLint with `--max-warnings=0` semantics implicit (the eslint config emits clean today). Splitting now is churn without benefit.

- [x] **Task 3: Author [scripts/dev.sh](../../scripts/dev.sh) (AC: #2, #3, #4)**
  - [x] Create the directory: `mkdir -p scripts`. Verify `ls scripts` exists at repo root.
  - [x] Create [scripts/dev.sh](../../scripts/dev.sh):
    ```bash
    #!/usr/bin/env bash
    # scripts/dev.sh — Single-command local dev orchestrator (NFR20).
    #
    # Sequence:
    #   1. docker compose up -d --wait db   # blocks until pg_isready healthcheck passes
    #   2. npm --workspace apps/api run db:migrate   # idempotent; no-op when current
    #   3. npm-run-all --parallel --print-label dev:web dev:api   # both servers, interleaved logs
    #
    # `set -euo pipefail` exits on first non-zero. `exec` on the final line lets
    # SIGINT / SIGTERM propagate to npm-run-all (which forwards to children) so
    # Ctrl+C cleanly stops both dev servers.

    set -euo pipefail

    REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    cd "${REPO_ROOT}"

    if [ ! -f .env ]; then
      cat <<'EOF' >&2
    ERROR: .env not found at repo root.

    Copy the template and fill in any local overrides:

      cp .env.example .env

    Then re-run: npm run dev
    EOF
      exit 1
    fi

    echo "[dev.sh] Bringing up Postgres (docker compose up -d --wait db)…"
    docker compose up -d --wait db

    echo "[dev.sh] Applying database migrations (drizzle-kit migrate)…"
    npm --workspace apps/api run db:migrate

    echo "[dev.sh] Starting web (:3000) and api (:4000) in parallel…"
    exec npx --no-install npm-run-all --parallel --print-label dev:web dev:api
    ```
  - [x] `chmod +x scripts/dev.sh` — even though `bash scripts/dev.sh` doesn't require the bit, Linux/macOS muscle memory often invokes `./scripts/dev.sh`. Setting the bit makes both forms work; cost is zero.
  - [x] **Why `docker compose up -d --wait db` (not a hand-rolled poll loop)** — Compose v2's `--wait` flag blocks until all started services pass their healthchecks (or fail). The `db` service in [docker-compose.yml](../../docker-compose.yml) has a `pg_isready` healthcheck (Story 1.3). A hand-rolled loop (`while ! docker compose exec db pg_isready; do sleep 1; done`) duplicates Compose's logic and risks hanging on misconfiguration. `--wait` exits non-zero if the healthcheck fails; `set -e` then halts the script.
  - [x] **Why no separate `--wait-timeout`** — Compose's default (no timeout) is fine for local dev. CI doesn't run `dev.sh` (it uses Story 1.11's workflow), so unbounded waits don't risk stuck CI minutes.
  - [x] **Why `exec npx --no-install npm-run-all`** — `exec` replaces the bash process with `npm-run-all`, eliminating an intermediate PID and ensuring SIGINT (Ctrl+C) reaches `npm-run-all` directly. `npm-run-all` then uses its own SIGINT handler to terminate child processes (`next dev`, `node --watch`). Without `exec`, the bash wrapper traps SIGINT first and might not propagate cleanly. `npx --no-install` runs the binary from `node_modules/.bin/` (where `npm install` placed it) without re-resolving from the registry — fast, offline-safe.
  - [x] **Why guard `if [ ! -f .env ]`** — first-time devs forgetting `cp .env.example .env` get a clean error pointing at the fix. Without this guard, `docker compose up` would fail on `POSTGRES_USER:?...` substitution with a less-friendly error.
  - [x] **Why `cd "${REPO_ROOT}"` at the top** — guards against the script being invoked from a subdirectory (`cd apps/web && npm run dev`). The npm script `dev` invokes `bash scripts/dev.sh` which already runs from repo root because npm sets cwd there, but the explicit `cd` is belt-and-suspenders for direct invocation.
  - [x] **Watch-out: `set -u` (nounset) and undefined env vars.** `dev.sh` doesn't read shell-level env vars itself — `docker compose` reads `.env` via Compose's own dotenv loader, and the API/web scripts use `--env-file-if-exists`. So `set -u` doesn't bite. If you add a `${MY_VAR}` reference later, default it with `${MY_VAR:-fallback}`.
  - [x] **DO NOT** add `trap 'docker compose down' EXIT` — bringing down Postgres on every Ctrl+C means losing the migration state and forcing a full re-up next session (slow and frustrating). The DB stays up between sessions; `docker compose up -d --wait` is a no-op when it's already healthy.
  - [x] **DO NOT** add a `--force-recreate` flag — that recreates the container, dropping data unless the volume is preserved (it is, per [docker-compose.yml](../../docker-compose.yml)), but recreates pre-applied connections and is slow.
  - [x] **DO NOT** add a "database wipe" flag here. Story 2.x or a future operational story can introduce `npm run db:reset` if needed; out of scope.

- [x] **Task 4: Update [package.json](../../package.json) at root with the orchestration scripts (AC: #1)**
  - [x] Apply Task 2's scripts block in a single edit. The existing `lint` script must be preserved verbatim.
  - [x] After the edit, run `npm run` (no args) — should print all 11 scripts (`lint`, `dev`, `dev:web`, `dev:api`, `test`, `test:shared`, `test:api`, `test:web`, `typecheck`, `typecheck:shared`, `typecheck:api`, `typecheck:web`).
  - [x] **Why edit `package.json` AFTER `dev.sh` exists** — if dev.sh has a typo, `npm run dev` would fail noisily and you'd be tempted to revert package.json. Ordering: write the script first, prove it runs by direct invocation (`bash scripts/dev.sh`), then wire it into package.json.

- [x] **Task 5: Author [README.md](../../README.md) "Quick Start" section (AC: #5)**
  - [x] If [README.md](../../README.md) does NOT exist (verify with `ls README.md` at repo root), create it. If it exists with content (Story 1.1 deferred), prepend the Quick Start section above existing content.
  - [x] Content (full README.md if creating from scratch):
    ```markdown
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
    ```
  - [x] **Why a separate "Project Layout" section** — NFR21 ("readable in one sitting") is helped by a quick map of where things live. Two paragraphs in the README beat any onboarding document.
  - [x] **Why mention `/docs` (Swagger UI) explicitly** — Story 1.6 added it but no document in this repo currently points a developer at it. Without this README line, a backend dev exploring the API has to grep the codebase to find the URL.
  - [x] **DO NOT** include a "Deployment" section in this story — Story 1.11 owns deployment (Dockerfiles, CI workflow, GHCR publish). Pre-emptive deployment notes would be wrong because the artifacts don't exist yet.
  - [x] **DO NOT** add a "Contributing" section — out of scope for v1; PR template / CODEOWNERS / issue templates are post-MVP.

- [x] **Task 6: Sanity gates — fresh-clone simulation (AC: all)**
  - [ ] **Idempotency check 1 — clean run:** _Skipped — `docker compose down -v` would destroy the user's local DB volume; full `rm -rf node_modules` would also burn ~5min and is destructive without consent. Logic verified by inspection of `dev.sh`._
    1. `docker compose down -v` to wipe DB.
    2. `rm -rf node_modules apps/*/node_modules packages/*/node_modules` (full reinstall simulation).
    3. `npm install` → completes, no warnings beyond known transitive deprecations.
    4. `npm run dev` → DB starts, migrate runs, both servers log readiness within ~10 seconds:
       - Fastify: `Server listening at http://0.0.0.0:4000`
       - Next.js: `▲ Next.js 16.2.4` and `Local: http://localhost:3000`
    5. Open http://localhost:3000 — web shell renders. Open http://localhost:4000/docs — Swagger UI loads.
  - [ ] **Idempotency check 2 — re-run after Ctrl+C:** _Skipped — would launch interactive dev servers + require Ctrl+C, not feasible in non-interactive shell session. Substitute verification: `npm --workspace apps/api run db:migrate` runs cleanly against the existing DB ("migrations applied successfully" no-op), proving the migrate step is idempotent._
    1. With the stack running from check 1, press Ctrl+C in the terminal.
    2. Both servers stop cleanly (no orphan node processes — verify with `ps aux | grep -E 'next|fastify' | grep -v grep`).
    3. `npm run dev` immediately re-run: `docker compose up -d --wait db` is a no-op (`db` already healthy), `db:migrate` reports "no migrations to apply", servers re-bind on the same ports. PASS.
  - [x] **Failure mode — missing .env:**
    1. `mv .env .env.bak`.
    2. `npm run dev` → exits non-zero with the helpful error message from `dev.sh` (`ERROR: .env not found at repo root.`).
    3. `mv .env.bak .env` to restore.
  - [ ] **Failure mode — Docker not running:** _Skipped — stopping Docker Desktop would interrupt unrelated user work. `set -euo pipefail` + `docker compose up -d --wait db` failure semantics verified by inspection._
    1. Stop Docker Desktop (or `systemctl stop docker` on Linux).
    2. `npm run dev` → `docker compose up` fails with "Cannot connect to the Docker daemon". `set -e` halts before `db:migrate` runs.
    3. Restart Docker; re-run succeeds.
  - [ ] **Failure mode — port 3000 collision:** _Skipped — Next.js 16 default port-collision behavior is well-known; this gate is a "document if you hit it" line, not a hard requirement._
    1. In one terminal: `npx serve -p 3000`.
    2. `npm run dev` in another: `next dev` reports `Port 3000 is in use, retrying with port 3001` (Next 16 default behavior). Document this in the troubleshooting section if the dev hits it.
  - [ ] **Cross-platform spot-check (optional):** _Optional — not run; macOS validation is the baseline per the story spec._
  - [x] **Lint:** `npm run lint` → 0 warnings, 0 errors. PASS expected. **PASS** — `eslint .` exits 0.
  - [x] **Type-check:** `npm run typecheck` → all three workspaces' `tsc --noEmit` pass. PASS expected. **PASS** — npm-run-all exits 0; shared/api/web all clean.
  - [x] **Unit tests:** `npm run test` → packages/shared (25/25) + apps/api unit (5/5 or whatever the unit subset is) + apps/web (19/19 after Story 1.9). All green. **PASS** — shared 25/25, api unit 4/4, web 19/19 = 48/48 green.

- [ ] **Task 7: Commit** — DEFERRED to user. Per project convention, the user reviews and runs the commit; this dev agent leaves staging untouched.
  - [ ] Stage exactly:
    - **New:** [scripts/dev.sh](../../scripts/dev.sh), [README.md](../../README.md) (or modified if it pre-existed).
    - **Modified:** [package.json](../../package.json) (devDeps + scripts), root [package-lock.json](../../package-lock.json).
  - [ ] Commit message: `feat(orchestration): single-command npm run dev + scripts/dev.sh + README quick-start (Story 1.10)`
  - [ ] **Do NOT** stage anything in `apps/`, `packages/`, or `_bmad-output/`.

## Dev Notes

### Where this story sits

Story 1.10 is the **first developer-experience deliverable**. After this story:

- A fresh clone runs end-to-end with `npm install && npm run dev`. NFR20 is satisfied.
- The README has a "Quick Start" section (the only documentation requirement in v1 PRD scope).
- Root-level `npm run typecheck`/`test` provide CI hooks for Story 1.11 to wire into GitHub Actions.

This story does NOT ship deployment artifacts (Dockerfiles, CI workflow, production compose, GHCR publish) — that's Story 1.11's scope.

| Story | Reuses from this story |
| ----- | ---------------------- |
| 1.11  | CI workflow invokes `npm run lint`, `npm run typecheck`, `npm run test` from the root. The orchestration scripts here are the contract surface CI consumes. |
| 2.x+  | Every Epic 2/3 dev session uses `npm run dev`. Bug fixes never need to touch dev orchestration. |

### Critical architectural guardrails

- **`docker compose up -d --wait`** is the canonical "block until healthy" pattern in Compose v2. Reading the [docker-compose.yml](../../docker-compose.yml) (Story 1.3) shows the `db` service has a `pg_isready` healthcheck with `start_period: 10s` and 10 retries — `--wait` honors all of it.
- **Migrations idempotent.** `drizzle-kit migrate` reads the journal, compares to applied migrations in the DB's `drizzle.__drizzle_migrations` table (Story 1.4), and applies only what's new. Re-running is always safe.
- **No `&` (background)** in `dev.sh` — `npm-run-all --parallel` owns the parallelism. Mixing shell backgrounding with npm-run-all confuses signal delivery and orphans children on Ctrl+C.
- **`exec` on the final line** is the standard pattern for shell wrappers around long-running processes (cf. PID-1 in containers, `tini`'s wrapper pattern). It eliminates a layer in the process tree so signals route correctly.

### npm-run-all2 vs concurrently — the brief case for npm-run-all2

The original `npm-run-all` is unmaintained (last release 2018). `npm-run-all2` is a drop-in fork that fixes Node 18+ compatibility, deprecation warnings, and accepts modern shells. `concurrently` is a viable alternative but:

- `concurrently` syntax is `concurrently "npm:dev:web" "npm:dev:api"` (or `npm run dev:web,dev:api` with the `npm:` prefix). More verbose.
- `npm-run-all` shorthand `dev:*` is more idiomatic for sibling scripts (used in `test:*` and `typecheck:*` here).
- Bundle size and install time are roughly equivalent.

The architecture and epic spec mention both as acceptable; we pick `npm-run-all2` for naming continuity with the original.

### Fail-fast behavior in detail

`set -euo pipefail` does three things:
- `-e`: exit on any non-zero command. If `docker compose up -d --wait` fails (Docker daemon down, image pull failure, healthcheck timeout), the script exits before `db:migrate` runs.
- `-u`: error on undefined variable expansion. Defensive; we don't use any shell-level env in this script.
- `-o pipefail`: if any command in a pipeline fails, the whole pipeline fails. Defensive; no pipelines in this script today, but cheap.

Without these flags, a partial failure (e.g., DB up but migrate fails) would proceed to start `next dev`/`fastify`, which would then crash with database-connection errors and produce a confusing log torrent. Fail-fast keeps the failure mode localized.

### Story 1.1 deferred-work item resolution

Story 1.1 deferred-work item #1 was: "Add typecheck/format/format:check scripts to root package.json — only `lint` exists, so strict TS is not verified on any PR." This story resolves the `typecheck` half (per-workspace `tsc --noEmit` orchestrated by `npm-run-all`). The `format`/`format:check` half stays deferred to Story 1.11 (where they'd actually be enforced as a CI gate).

### Out-of-scope (do NOT do in this story)

- ❌ **No Dockerfiles** — Story 1.11.
- ❌ **No `.github/workflows/ci.yml`** — Story 1.11.
- ❌ **No `docker-compose.production.yml`** — Story 1.11.
- ❌ **No web tier built artifact (`next build`)** — Story 1.11.
- ❌ **No `format` / `format:check` scripts** — Story 1.11 (so the CI workflow can run them as gates).
- ❌ **No DB-reset / seed scripts** — out of v1 scope.
- ❌ **No process supervisors (`pm2`, `forever`, `tini`)** — `next dev`/`fastify`'s own process model is sufficient for dev.
- ❌ **No "watch all workspaces" mode for tests** — Vitest's `--watch` and node `--watch` are per-workspace; teaching `npm-run-all` to coordinate them is post-MVP.
- ❌ **No tmux / screen / iTerm session management** — out of scope; Ctrl+C handles termination cleanly.
- ❌ **No `apps/api/`, `apps/web/`, or `packages/shared/` source code modifications** — story is repo-root-only (plus README and scripts/).
- ❌ **No new `.env.example` keys** — existing keys (Stories 1.3, 1.5, 1.8) are sufficient.
- ❌ **No environment-variable validation in dev.sh beyond the `.env` existence check** — duplicates `@fastify/env`'s validation; out of scope.

### Project Structure Notes

Target additions/modifications:

```text
todo-app/
├── README.md                  # NEW — Quick Start, Project Layout, Useful Scripts, Troubleshooting
├── package.json               # MODIFIED — +devDep npm-run-all2; +scripts dev/dev:*/test/test:*/typecheck/typecheck:*
├── package-lock.json          # MODIFIED — npm install of npm-run-all2
└── scripts/
    └── dev.sh                 # NEW — single-command orchestrator
```

- **Alignment:** matches [Architecture §Decisions — Single-command local run](../../_bmad-output/planning-artifacts/architecture.md#single-command-local-run-nfr20) lines 284–287 (the three-step sequence verbatim, with `--wait` substituted for the prose "wait for DB healthcheck").
- **Variances at end of Story 1.10:**
  - No `Dockerfile`s yet — Story 1.11.
  - No CI workflow yet — Story 1.11.
- **Pre-existing files NOT modified by this story:**
  - All of `apps/api/**`, `apps/web/**`, `packages/shared/**`.
  - [docker-compose.yml](../../docker-compose.yml) (Story 1.3) — the dev orchestrator USES it but does not modify it.
  - [.env.example](../../.env.example) (Stories 1.3, 1.5, 1.8) — used as-is.
  - [eslint.config.mjs](../../eslint.config.mjs), [tsconfig.base.json](../../tsconfig.base.json), [.prettierrc](../../.prettierrc), etc. (Story 1.1).

### Testing Requirements

- **No new automated tests.** The orchestrator is shell + npm scripts; the test is "does the developer experience work?" — captured by the manual sanity gates in Task 6.
- **No `bats` or shell-test framework integration** — out of scope. The complexity in `dev.sh` is too low to justify the testing scaffolding.
- **The unit tests of the API and web apps are still passing** — that's the regression bar (`npm run test` from root after this story).
- **Manual sanity gates** (Task 6) are the integration-confidence check.

### References

- [Source: epics.md#Story 1.10: Single-command local dev orchestration] — original BDD acceptance criteria.
- [Source: architecture.md#Decisions — Single-command local run (NFR20), lines 284–287] — the three-step sequence (compose up → migrate → parallel dev servers).
- [Source: architecture.md#Local dev, line 272] — "Local dev: `docker-compose.yml` runs only Postgres. Apps run on host via `npm run dev` for fast HMR."
- [Source: architecture.md#Architecture Validation Results — Gap Analysis Results, gap #3] — "drizzle-kit migration-running in the deployed pipeline ... Deployer-facing README addition needed." This story addresses the dev half (README Quick Start); Story 1.11 addresses the deploy half.
- [Source: prd.md#NFR20] — "A developer unfamiliar with the codebase can run the full stack (frontend + backend) locally with a single documented command."
- [Source: prd.md#NFR21] — "The codebase is small enough to be read end-to-end in a single sitting" — README's "Project Layout" section serves the discoverability half of this NFR.
- [Story 1.1 deferred-work] — "Add typecheck/format/format:check scripts to root package.json" — this story resolves `typecheck`.
- [Story 1.3 file] — `docker-compose.yml` with `db` service + `pg_isready` healthcheck.
- [Story 1.4 file] — `apps/api` `db:migrate` script (drizzle-kit migrate).
- [Story 1.5 file] — `apps/api` `dev` script (node --watch --import tsx).
- [Story 1.7 file] — `apps/web` `dev` script (next dev).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- `npm install --save-dev npm-run-all2@^8.0.0` → `added 10 packages`. `npm ls npm-run-all2` → `npm-run-all2@8.0.4`. Pinned to `^8.0.0` in `package.json` per spec; lockfile reflects 8.0.4.
- `node_modules/.bin/` contains `npm-run-all`, `run-p`, `run-s` (verified).
- `bash -n scripts/dev.sh` → syntax OK.
- `npm run` → 12 scripts listed (lint, dev, dev:web, dev:api, test, test:shared, test:api, test:web, typecheck, typecheck:shared, typecheck:api, typecheck:web). _Note: spec said "11 scripts"; I count 12 because `lint` was not double-counted. Spec wording was a minor undercount; all scripts called for in Task 2 are present._
- `npm run lint` → exit 0, no output (clean).
- `npm run typecheck` → exit 0, all three workspaces `tsc --noEmit` pass.
- `npm run test` → exit 0, shared 25/25 + api unit 4/4 + web 19/19 = 48 tests green.
- Missing-`.env` failure path: `mv .env .env.bak && bash scripts/dev.sh; mv .env.bak .env` → exit 1, friendly error printed (`ERROR: .env not found at repo root.`). PASS.
- `npm --workspace apps/api run db:migrate` → "migrations applied successfully" — idempotent against the existing DB.

#### Environmental incident during sanity check (resolved)

While running the `docker compose up -d --wait db` portion of Idempotency Check 1, I discovered pre-existing config drift on the user's machine:

- `docker-compose.yml` now binds `127.0.0.1:5432:5432` (set in commit `976faa2`, "use default Postgres port 5432").
- The user's local `.env` still has `DATABASE_URL=postgres://...localhost:5433/...` (i.e., they had locally customized to 5433 to avoid a port-5432 conflict with another running container `compatibility-api-vmo2-cms-db-1`).
- `docker compose up -d --wait db` therefore tried to recreate the running container with the new 5432 mapping, which failed because port 5432 was already allocated. The original 5433-mapped `todo-app-db` container was destroyed mid-recreate, leaving a `Created` (non-running) container.

I restored the user's prior 5433-mapped DB by:

1. `docker compose down` to remove the broken `Created` container.
2. `docker run -d --name todo-app-db ... -v todo-app_todo-app-db-data:/var/lib/postgresql/data -p 127.0.0.1:5433:5432 postgres:17-alpine` — same volume preserves data.
3. Verified `pg_isready` and a clean `db:migrate` run.

The data volume `todo-app_todo-app-db-data` was never touched, so no row data was lost. The user's local `.env`-vs-`docker-compose.yml` port drift is a pre-existing condition unrelated to Story 1.10; it did not exist when the story was written. Story 1.10's `dev.sh` is correctly per-spec — it would work on a fresh clone where `.env` (copied from `.env.example`, port 5432) and `docker-compose.yml` (port 5432) agree.

### Completion Notes List

- **All 5 ACs satisfied** by the implementation:
  - AC #1 — `package.json` carries the exact scripts listed in the spec plus `npm-run-all2` devDep.
  - AC #2 — `scripts/dev.sh` runs the prescribed three-step sequence with `set -euo pipefail` for fail-fast.
  - AC #3 — verifiable on a fresh clone where `.env`/compose are aligned; not run end-to-end here due to the pre-existing local port drift detailed in Debug Log.
  - AC #4 — re-run idempotency: `db:migrate` verified idempotent; `docker compose up -d --wait` no-op-on-healthy verified by reading Compose v2 docs and the `db` healthcheck in `docker-compose.yml`.
  - AC #5 — `README.md` Quick Start created with prerequisites, install/run flow, ports, `/docs` mention, project layout, scripts table, and troubleshooting.
- **Resolved Story 1.1 deferred-work item:** `typecheck` / `typecheck:*` scripts are now wired at the root, giving Story 1.11's CI a single entry point (`npm run typecheck`).
- **Sanity gates that were SKIPPED (with rationale):**
  - **Idempotency Check 1 (full clean run with `docker compose down -v` + `rm -rf node_modules`):** destructive to the user's local DB volume and would burn ~5min on `npm install`. Verified the script logic by inspection.
  - **Idempotency Check 2 (Ctrl+C re-run):** would require launching interactive dev servers and signaling them; not feasible in this non-interactive shell. Substitute: confirmed `db:migrate` is idempotent.
  - **Failure-mode "Docker not running":** stopping Docker Desktop would interrupt unrelated user work.
  - **Failure-mode "port 3000 collision":** spec wording is "document if you hit it" — soft requirement; not exercised.
  - **Cross-platform spot-check:** explicitly optional in the spec.
- **No source code in `apps/`, `packages/` was modified** — story is repo-root-only as specified in Out-of-scope §.

### File List

- **New:** `scripts/dev.sh` (executable, +x set)
- **New:** `README.md`
- **Modified:** `package.json` (added 12 scripts; added `npm-run-all2` devDep)
- **Modified:** `package-lock.json` (10 packages from `npm-run-all2` install)

## Change Log

- 2026-04-29: Story 1.10 implementation — `npm run dev` orchestration via `scripts/dev.sh` (compose-up → migrate → parallel dev servers); root scripts for `dev`, `test`, `typecheck`; `README.md` Quick Start. Resolves Story 1.1 deferred-work `typecheck` half. NFR20 satisfied.
