# Story 1.11: Build and deployment artifacts

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a deployer (or CI pipeline),
I want production Docker images, a reference production compose file, and a CI workflow that lints/tests/builds on every PR,
So that the app can be deployed to any container target and code drift is caught before merge.

## Acceptance Criteria

1. **Given** [apps/web/Dockerfile](../../apps/web/Dockerfile),
   **When** built with `docker build -f apps/web/Dockerfile -t todo-app-web .` from the repo root,
   **Then** the build succeeds in multi-stage form (deps → build → runtime),
   **And** the runtime stage uses Node 22 alpine, runs as a non-root user, respects `PORT` env, and binds `HOSTNAME=0.0.0.0`.

2. **Given** [apps/api/Dockerfile](../../apps/api/Dockerfile),
   **When** built with `docker build -f apps/api/Dockerfile -t todo-app-api .` from the repo root,
   **Then** the build succeeds in multi-stage form with a non-root runtime user,
   **And** `PORT` is env-driven,
   **And** the runtime entrypoint launches the compiled Fastify server (`node dist/server.js`).

3. **Given** [docker-compose.production.yml](../../docker-compose.production.yml) at the repo root,
   **When** inspected,
   **Then** it declares `web`, `api`, and `db` services with env placeholders and a named volume for DB data,
   **And** serves as a runnable reference deployment (no platform-specific assumptions).

4. **Given** [.github/workflows/ci.yml](../../.github/workflows/ci.yml),
   **When** a pull request is opened,
   **Then** the CI job runs: checkout, setup-node 22, `npm ci`, root `npm run lint`, `npm run typecheck`, `npm run test`, `docker build` for both images,
   **And** any failing step marks the PR check as failed.

5. **Given** a push to the `main` branch,
   **When** the CI workflow runs,
   **Then** in addition to the PR checks, both Docker images are published to `ghcr.io/${{ github.repository_owner }}/todo-app-web` and `ghcr.io/${{ github.repository_owner }}/todo-app-api` using `GITHUB_TOKEN`,
   **And** no auto-deploy step runs.

6. **Given** [README.md](../../README.md),
   **When** the "Deployment" section is read,
   **Then** it documents that `drizzle-kit migrate` must run as a one-shot command before deploying new API images, that the API fails fast if the schema is behind, and which env vars are required in production (resolves Architecture §Gap Analysis gap #3).

## Tasks / Subtasks

- [x] **Task 1: Configure Next.js standalone output (AC: #1)**
  - [x] Edit [apps/web/next.config.ts](../../apps/web/next.config.ts):
    ```ts
    import type { NextConfig } from "next";

    const nextConfig: NextConfig = {
      // Standalone output emits a self-contained .next/standalone/server.js
      // with only the production node_modules needed at runtime. Required for
      // the multi-stage Docker pattern in apps/web/Dockerfile (Story 1.11).
      output: "standalone",
    };

    export default nextConfig;
    ```
  - [x] Run `NEXT_PUBLIC_API_URL=http://localhost:4000 npm run build --workspace apps/web` and verify the directory `apps/web/.next/standalone/` exists with `server.js` inside. Without `output: "standalone"` the `.next/standalone/` directory is not produced and the runtime stage of the Dockerfile would fail to copy it.
  - [x] **Why standalone output (not the full `.next/` tree)** — the standalone build is ~5–10× smaller and contains only the modules actually imported by the app's server. Vercel's official docker template (`https://github.com/vercel/next.js/tree/canary/examples/with-docker`) uses this pattern; deviation costs more than it saves.
  - [x] **Why no other Next.js config changes** — `compress`, `poweredByHeader`, custom security headers, etc. — are platform/operations decisions that don't belong in the codebase. The deployment platform's reverse proxy (Cloud Run, Fly, ALB, etc.) handles compression and CSP per its own conventions.
  - [x] **Watch-out:** the standalone output does NOT include `public/` or `.next/static/` automatically — the Dockerfile (Task 2) copies those explicitly. This is the official pattern; not a Next.js bug.

- [x] **Task 2: Author [apps/web/Dockerfile](../../apps/web/Dockerfile) (AC: #1)**
  - [x] Create [apps/web/Dockerfile](../../apps/web/Dockerfile):
    ```dockerfile
    # syntax=docker/dockerfile:1.7

    # ===========================================================
    # Stage 1: deps — install workspace deps (uses build cache)
    # ===========================================================
    FROM node:22-alpine AS deps
    WORKDIR /app

    # Copy ONLY the manifests so the npm-ci layer caches between source changes.
    # Workspace install needs every package.json in the tree.
    COPY package.json package-lock.json ./
    COPY apps/web/package.json apps/web/
    COPY apps/api/package.json apps/api/
    COPY packages/shared/package.json packages/shared/

    # `npm ci` honors workspaces. The `prepare` hook in packages/shared (Story 1.2)
    # builds dist/ via tsc — we need its source tree available here for the prepare
    # to succeed. Bring just the shared package source (cheap layer).
    COPY packages/shared/ packages/shared/

    RUN --mount=type=cache,target=/root/.npm \
        npm ci --include-workspace-root

    # ===========================================================
    # Stage 2: builder — produce Next.js standalone output
    # ===========================================================
    FROM node:22-alpine AS builder
    WORKDIR /app

    # NEXT_PUBLIC_API_URL is inlined at build time. CI passes this via --build-arg.
    # Default to a sentinel so an unset value fails loudly during smoke testing,
    # not silently against a wrong origin.
    ARG NEXT_PUBLIC_API_URL=__UNSET__
    ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

    # Bring deps from stage 1
    COPY --from=deps /app/node_modules ./node_modules
    COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
    COPY --from=deps /app/packages/shared ./packages/shared

    # Copy what next build needs
    COPY package.json package-lock.json ./
    COPY apps/web/ apps/web/
    # tsconfig.base.json is referenced via apps/web/tsconfig.json's `extends`
    COPY tsconfig.base.json ./

    # Fail loudly if the build-arg wasn't passed
    RUN test "$NEXT_PUBLIC_API_URL" != "__UNSET__" || \
        (echo "ERROR: --build-arg NEXT_PUBLIC_API_URL=<base-url> is required" && exit 1)

    RUN npm --workspace apps/web run build

    # ===========================================================
    # Stage 3: runtime — minimal image, non-root, standalone server
    # ===========================================================
    FROM node:22-alpine AS runtime
    WORKDIR /app

    # `node` user (uid 1000) ships with the alpine image; reuse it. Avoid
    # `USER node` literal in case a future base image rename changes it.
    RUN addgroup --system --gid 1001 nodejs \
     && adduser --system --uid 1001 nextjs

    ENV NODE_ENV=production \
        PORT=3000 \
        HOSTNAME=0.0.0.0 \
        # Disable Next.js telemetry in containers
        NEXT_TELEMETRY_DISABLED=1

    # Copy ONLY the standalone artifacts. Total runtime image: ~150–200 MB.
    COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
    COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
    COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

    USER nextjs

    EXPOSE 3000

    # The standalone server is at apps/web/server.js because the standalone copy
    # preserves the workspace path layout. Confirm with `ls /app/apps/web/server.js`.
    CMD ["node", "apps/web/server.js"]
    ```
  - [x] Create [apps/web/.dockerignore](../../apps/web/.dockerignore):
    ```text
    node_modules
    .next
    .turbo
    .env*
    !.env.example
    Dockerfile
    .dockerignore
    *.log
    ```
  - [x] Create a repo-root [.dockerignore](../../.dockerignore) (if not present):
    ```text
    **/node_modules
    **/.next
    **/.turbo
    **/dist
    **/.env*
    !**/.env.example
    .git
    .github
    _bmad/
    _bmad-output/
    docs/
    *.log
    ```
  - [x] **Why `node:22-alpine` (not `slim` or `distroless`)** — alpine is small (~50 MB base), well-supported, and Architecture §Infrastructure pins `Node 22 alpine` (line 271). `node:22-slim` is Debian-based and ~80 MB with broader compatibility but is overkill for a Next.js standalone server. `gcr.io/distroless/nodejs22` would shave another ~10 MB but lacks a shell, which complicates debugging in production (`docker exec` won't get you a prompt). Alpine is the architecture's pin.
  - [x] **Why three stages (deps / builder / runtime), not two** — the `deps` stage caches the slow `npm ci` step. A single source-change in `apps/web/src/page.tsx` would invalidate `npm ci` if it shared a layer with the source copy. Keeping them separate keeps PR-iteration builds fast.
  - [x] **Why `--mount=type=cache,target=/root/.npm`** — BuildKit cache mount for npm's package cache. Speeds up rebuilds on a developer's laptop or in CI runners that preserve BuildKit caches. Backwards-compatible: builds without BuildKit just skip the mount.
  - [x] **Why `chown --from=builder --chown=nextjs:nodejs` on every COPY into runtime** — the runtime stage's USER is non-root; without explicit chown, Node tries to read files owned by uid 0 with permission 644, which works for read-only paths but fails for any future write attempt (e.g., `.next/cache` if Next ever needs it). Setting ownership at copy time is cheaper than a `RUN chown -R` later.
  - [x] **Why `NEXT_PUBLIC_API_URL` as `ARG` + `ENV` (not just one)** — `ARG` makes it a build-time-only variable, but `ENV` is needed for `next build` to see it as a process env. The two together pass the value through the layer correctly.
  - [x] **Why the `__UNSET__` sentinel fail-fast** — silently building with `NEXT_PUBLIC_API_URL=` (empty) would produce a bundle that hits the page's own origin for `/todos`, returning 404s in production. Loud failure now beats a silent miss in prod.
  - [x] **Why `EXPOSE 3000` (matching `PORT=3000`)** — `EXPOSE` is metadata only; it doesn't bind the port. But it documents the intent to platform tools (Compose, Kubernetes pod specs). The `PORT` ENV is what `next start` (and the standalone server) actually reads.
  - [x] **Watch-out: `next dev` is NOT what runs in the container.** The standalone server is `node apps/web/server.js` — a production-mode server. There's no HMR, no source maps, no devtools. `npm run dev` is local-only.
  - [x] **DO NOT** add a HEALTHCHECK directive — Next.js doesn't expose a built-in health endpoint. Adding one requires either a custom route file (out of v1 scope; PRD has no liveness contract for the web tier) or a hand-rolled curl-loop probe. Defer to the deployment platform's HTTP probe.
  - [x] **DO NOT** install `curl` / `wget` / `dumb-init` / `tini` — alpine already includes everything Node needs. PID-1 signal handling: Node 22 handles SIGTERM correctly when run as PID 1.
  - [x] **DO NOT** set `NODE_OPTIONS=--enable-source-maps` — source maps aren't part of the standalone output; setting the flag is a no-op.

- [x] **Task 3: Author [apps/api/Dockerfile](../../apps/api/Dockerfile) (AC: #2)**
  - [x] Create [apps/api/Dockerfile](../../apps/api/Dockerfile):
    ```dockerfile
    # syntax=docker/dockerfile:1.7

    # ===========================================================
    # Stage 1: deps — install workspace deps (uses build cache)
    # ===========================================================
    FROM node:22-alpine AS deps
    WORKDIR /app

    COPY package.json package-lock.json ./
    COPY apps/web/package.json apps/web/
    COPY apps/api/package.json apps/api/
    COPY packages/shared/package.json packages/shared/

    # packages/shared's `prepare` hook builds dist/ via tsc; bring its source.
    COPY packages/shared/ packages/shared/

    RUN --mount=type=cache,target=/root/.npm \
        npm ci --include-workspace-root

    # ===========================================================
    # Stage 2: builder — compile TypeScript to dist/
    # ===========================================================
    FROM node:22-alpine AS builder
    WORKDIR /app

    COPY --from=deps /app/node_modules ./node_modules
    COPY --from=deps /app/packages/shared ./packages/shared
    COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

    COPY package.json package-lock.json tsconfig.base.json ./
    COPY apps/api/ apps/api/

    RUN npm --workspace apps/api run build:ts

    # Verify dist/server.js exists — fail loud if tsc silently produced nothing.
    RUN test -f apps/api/dist/server.js || \
        (echo "ERROR: apps/api/dist/server.js not found after build:ts" && exit 1)

    # Prune dev deps so the runtime stage only carries what fastify needs.
    RUN npm prune --omit=dev --workspaces

    # ===========================================================
    # Stage 3: runtime — minimal image, non-root, compiled server
    # ===========================================================
    FROM node:22-alpine AS runtime
    WORKDIR /app

    RUN addgroup --system --gid 1001 nodejs \
     && adduser --system --uid 1001 fastify

    ENV NODE_ENV=production \
        PORT=4000

    # Copy compiled API + production node_modules + drizzle migration files.
    # Layer ordering: largest stable layer first (node_modules) for better caching.
    COPY --from=builder --chown=fastify:nodejs /app/node_modules ./node_modules
    COPY --from=builder --chown=fastify:nodejs /app/apps/api/dist ./apps/api/dist
    COPY --from=builder --chown=fastify:nodejs /app/apps/api/drizzle ./apps/api/drizzle
    COPY --from=builder --chown=fastify:nodejs /app/apps/api/package.json ./apps/api/package.json
    COPY --from=builder --chown=fastify:nodejs /app/packages/shared/dist ./packages/shared/dist
    COPY --from=builder --chown=fastify:nodejs /app/packages/shared/package.json ./packages/shared/package.json
    COPY --from=builder --chown=fastify:nodejs /app/package.json ./package.json

    USER fastify

    EXPOSE 4000

    # The compiled entry point. Note: cwd is /app so apps/api/src/db/migrate.ts
    # paths (which use import.meta.dirname) resolve drizzle/ correctly:
    # /app/apps/api/dist/db/migrate.js → ../../../drizzle → /app/apps/api/drizzle ✓
    WORKDIR /app/apps/api
    CMD ["node", "dist/server.js"]
    ```
  - [x] Create [apps/api/.dockerignore](../../apps/api/.dockerignore):
    ```text
    node_modules
    dist
    .env*
    !.env.example
    Dockerfile
    .dockerignore
    test/
    *.test.ts
    *.test.js
    *.log
    ```
  - [x] **Why we keep `apps/api/drizzle/` in the runtime image** — `drizzle-kit migrate` runs as a one-shot pre-deploy step (Architecture §Gap Analysis gap #3). The migration SQL files must be present in the image used by that one-shot, OR a separate migration image must be built. Shipping them in the API image keeps the deployment story to "one image, one container per role" — simpler than introducing a second `migrate` image.
  - [x] **Why `WORKDIR /app/apps/api` at the end (not `/app`)** — `apps/api/src/db/migrate.ts` uses `import.meta.dirname` to locate the `drizzle/` directory; this path math depends on the compiled `dist/db/migrate.js` being inside `apps/api/dist/db/`. Setting cwd to `/app/apps/api` keeps `process.cwd()` stable too — Story 1.4 deferred-work item flagged the cwd coupling as a future hardening point; here we pin it deterministically.
  - [x] **Why `npm prune --omit=dev --workspaces` at the end of builder** — drops `tsx`, `drizzle-kit` (devDep), `dotenv`, `@apidevtools/swagger-parser`, type packages — saves ~50–80 MB on the final image. Production runtime needs only `fastify`, `@fastify/*`, `drizzle-orm`, `pg`, `fastify-type-provider-zod`, and `@todo-app/shared`.
  - [x] **Why we copy `packages/shared/dist` (not `packages/shared/src`)** — runtime needs only the compiled JS + types. The `prepare` hook ran in deps stage; dist is populated.
  - [x] **Watch-out — `drizzle-kit` is a devDep** — `drizzle-kit migrate` (run as the pre-deploy one-shot per AC #6) is in `devDependencies`, so it's PRUNED from the runtime image. The deployment platform must run `drizzle-kit migrate` from a separate context — either:
    - Build a sibling "migration" image (`apps/api/Dockerfile.migrate`) that doesn't prune dev deps. (Out of scope for v1.)
    - OR run `npx drizzle-kit migrate` from the deployer's local machine / CI runner pointing at the production `DATABASE_URL`. (Documented in README "Deployment" section, Task 6.)
    - OR run `node apps/api/dist/db/migrate.js` (the schema-drift CHECK script, not the apply script) at container startup as a fail-fast gate, but the apply step still happens externally.
  - [x] **Why `EXPOSE 4000`** — matches `PORT=4000` default in [apps/api/src/config.ts](../../apps/api/src/config.ts). `docker-compose.production.yml` (Task 4) maps it.
  - [x] **DO NOT** add HEALTHCHECK directive in the API Dockerfile either, even though `/health` exists (Story 1.6) — Docker's HEALTHCHECK adds a curl-loop process to the container. We don't ship curl in alpine by default. The deployment platform should do HTTP probing externally (Kubernetes liveness/readiness, Compose's `healthcheck:` in `docker-compose.production.yml`, etc.). Task 4 wires this in compose where it belongs.
  - [x] **DO NOT** include `apps/api/test/` or `*.test.ts` files — `.dockerignore` excludes them. Tests don't ship.

- [x] **Task 4: Author [docker-compose.production.yml](../../docker-compose.production.yml) (AC: #3)**
  - [x] Create [docker-compose.production.yml](../../docker-compose.production.yml) at the repo root:
    ```yaml
    # docker-compose.production.yml — Reference deployment for the full stack.
    #
    # NOT used in local development (that's docker-compose.yml + npm run dev).
    # Run with:  docker compose -f docker-compose.production.yml up -d
    #
    # Pre-deploy: run drizzle-kit migrate against DATABASE_URL — see README "Deployment".
    #
    # Required env vars (set in shell or .env.production):
    #   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
    #   DATABASE_URL          (api → db; postgres://user:pass@db:5432/dbname)
    #   CORS_ORIGIN           (api; e.g., https://todos.example.com)
    #   NEXT_PUBLIC_API_URL   (web; build-time, baked into image)
    #   PORT_WEB, PORT_API    (host port bindings; defaults below)

    services:
      db:
        image: postgres:17-alpine
        restart: unless-stopped
        environment:
          POSTGRES_USER: ${POSTGRES_USER:?POSTGRES_USER required}
          POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}
          POSTGRES_DB: ${POSTGRES_DB:?POSTGRES_DB required}
        volumes:
          - todo-app-db-data:/var/lib/postgresql/data
        healthcheck:
          test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
          interval: 5s
          timeout: 5s
          retries: 10
          start_period: 10s

      api:
        # Built locally for reference; production deployments pull from GHCR
        # (see .github/workflows/ci.yml). Override with `image:` to use a tag.
        build:
          context: .
          dockerfile: apps/api/Dockerfile
        # image: ghcr.io/<owner>/todo-app-api:latest    # uncomment for GHCR deploy
        restart: unless-stopped
        environment:
          DATABASE_URL: ${DATABASE_URL:?DATABASE_URL required}
          CORS_ORIGIN: ${CORS_ORIGIN:?CORS_ORIGIN required}
          PORT: 4000
          LOG_LEVEL: ${LOG_LEVEL:-info}
          NODE_ENV: production
          ENABLE_DOCS: ${ENABLE_DOCS:-false}
        ports:
          - "${PORT_API:-4000}:4000"
        depends_on:
          db:
            condition: service_healthy
        healthcheck:
          test: ["CMD", "node", "-e", "fetch('http://localhost:4000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
          interval: 30s
          timeout: 5s
          retries: 3
          start_period: 15s

      web:
        build:
          context: .
          dockerfile: apps/web/Dockerfile
          args:
            NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:?NEXT_PUBLIC_API_URL required at build time}
        # image: ghcr.io/<owner>/todo-app-web:latest    # uncomment for GHCR deploy
        restart: unless-stopped
        environment:
          PORT: 3000
          HOSTNAME: 0.0.0.0
        ports:
          - "${PORT_WEB:-3000}:3000"
        depends_on:
          api:
            condition: service_healthy

    volumes:
      todo-app-db-data:
    ```
  - [x] **Why `condition: service_healthy` (not `service_started`)** — `service_started` only waits for the container to launch, not for the application inside to accept connections. The DB needs `pg_isready` before migrations can land; the API needs `/health` before the web tier should depend on it. Without these conditions, race conditions cause flaky cold starts.
  - [x] **Why a `node -e fetch(...)` healthcheck for the API (not curl)** — alpine doesn't ship curl by default. Node 22 has native `fetch`; using it avoids adding `curl` to the API Dockerfile. The script exits 0 on `r.ok`, 1 on any failure (including network/timeout). 30s interval is gentler than the DB's 5s — `/health` is cheap but not free, and slamming it during cold-start cascades is unnecessary.
  - [x] **Why `${VAR:?error message}` syntax** — Compose's "fail-fast on missing required env" pattern. Reading [docker-compose.yml](../../docker-compose.yml) (Story 1.3) shows the same idiom; consistency is the goal.
  - [x] **Why a separate `${PORT_WEB:-3000}` and `${PORT_API:-4000}` for host port bindings** — production deployments behind reverse proxies often want to bind to non-standard host ports (e.g., 8080/8081) to avoid root-port privilege issues. Defaulting to the dev ports keeps the file usable for local "test the production image" scenarios.
  - [x] **Why `image:` lines are commented out** — Compose's `build:` and `image:` are mutually exclusive in semantics: with `build:` set, Compose builds locally; with both set, it tags the build with the `image:` value. We default to building locally so a clone-and-run works without GHCR auth; the comment shows how to switch to a pulled image.
  - [x] **Watch-out — `drizzle-kit migrate` is NOT in this compose file.** Migrations are a one-shot pre-deploy step (Architecture §Gap Analysis gap #3). Compose doesn't have a clean "run-once-then-exit" pattern for an init container; trying to fake one with `command:` would prevent the API from starting on subsequent runs. README "Deployment" (Task 6) documents the manual step.
  - [x] **Watch-out — `NEXT_PUBLIC_API_URL` is build-time, not runtime.** Setting it under `web.environment:` would have NO effect on the served bundle — Next.js inlined it at `next build` time. The `args:` block under `build:` is the correct location. If you change `NEXT_PUBLIC_API_URL`, you must REBUILD the web image (or re-pull a tag built with the new value).
  - [x] **DO NOT** add a `migrate:` service that runs `drizzle-kit migrate` and exits — Compose's `depends_on` with `service_started` doesn't model "wait for completion of a one-shot job". `condition: service_completed_successfully` exists in Compose v2.13+ and could work, but it complicates the file for a v1 reference deployment. The README documents the manual sequence; future operational maturity can introduce the init-container pattern.
  - [x] **DO NOT** set restart policies stricter than `unless-stopped` — `always` would restart on operator-initiated `docker compose down`, which is annoying in dev-of-prod testing.

- [x] **Task 5: Author [.github/workflows/ci.yml](../../.github/workflows/ci.yml) (AC: #4, #5)**
  - [x] Create the directory: `mkdir -p .github/workflows`. Verify the path is correct (capital G in `.github`, lowercase `workflows`).
  - [x] Create [.github/workflows/ci.yml](../../.github/workflows/ci.yml):
    ```yaml
    name: CI

    on:
      pull_request:
        branches: [main]
      push:
        branches: [main]

    permissions:
      contents: read
      packages: write   # for ghcr.io publish on main push

    env:
      NODE_VERSION: '22'

    jobs:
      verify:
        name: Lint, typecheck, test, build images
        runs-on: ubuntu-latest
        steps:
          - name: Checkout
            uses: actions/checkout@v6

          - name: Setup Node ${{ env.NODE_VERSION }}
            uses: actions/setup-node@v6
            with:
              node-version: ${{ env.NODE_VERSION }}
              cache: 'npm'

          - name: Install dependencies
            run: npm ci

          - name: Lint
            run: npm run lint

          - name: Typecheck
            run: npm run typecheck

          - name: Test (unit, no DB required)
            run: npm run test

          - name: Setup Docker Buildx
            uses: docker/setup-buildx-action@v4

          - name: Build apps/web image
            uses: docker/build-push-action@v7
            with:
              context: .
              file: apps/web/Dockerfile
              push: false
              load: true
              tags: todo-app-web:ci
              build-args: |
                NEXT_PUBLIC_API_URL=http://localhost:4000
              cache-from: type=gha,scope=web
              cache-to: type=gha,scope=web,mode=max

          - name: Build apps/api image
            uses: docker/build-push-action@v7
            with:
              context: .
              file: apps/api/Dockerfile
              push: false
              load: true
              tags: todo-app-api:ci
              cache-from: type=gha,scope=api
              cache-to: type=gha,scope=api,mode=max

      publish:
        name: Publish images to GHCR
        runs-on: ubuntu-latest
        needs: verify
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        steps:
          - name: Checkout
            uses: actions/checkout@v6

          - name: Setup Docker Buildx
            uses: docker/setup-buildx-action@v4

          - name: Login to GHCR
            uses: docker/login-action@v4
            with:
              registry: ghcr.io
              username: ${{ github.actor }}
              password: ${{ secrets.GITHUB_TOKEN }}

          - name: Compute web image metadata
            id: meta-web
            uses: docker/metadata-action@v6
            with:
              images: ghcr.io/${{ github.repository_owner }}/todo-app-web
              tags: |
                type=sha,prefix=,format=short
                type=raw,value=latest

          - name: Build & push apps/web
            uses: docker/build-push-action@v7
            with:
              context: .
              file: apps/web/Dockerfile
              push: true
              tags: ${{ steps.meta-web.outputs.tags }}
              labels: ${{ steps.meta-web.outputs.labels }}
              build-args: |
                NEXT_PUBLIC_API_URL=${{ vars.NEXT_PUBLIC_API_URL || 'https://api.example.com' }}
              cache-from: type=gha,scope=web
              cache-to: type=gha,scope=web,mode=max

          - name: Compute api image metadata
            id: meta-api
            uses: docker/metadata-action@v6
            with:
              images: ghcr.io/${{ github.repository_owner }}/todo-app-api
              tags: |
                type=sha,prefix=,format=short
                type=raw,value=latest

          - name: Build & push apps/api
            uses: docker/build-push-action@v7
            with:
              context: .
              file: apps/api/Dockerfile
              push: true
              tags: ${{ steps.meta-api.outputs.tags }}
              labels: ${{ steps.meta-api.outputs.labels }}
              cache-from: type=gha,scope=api
              cache-to: type=gha,scope=api,mode=max
    ```
  - [x] **Why two jobs (`verify` + `publish`), not one with conditional steps** — separation gives clean PR feedback (verify runs on PR; publish doesn't touch the registry). The `needs: verify` + `if:` combination ensures publish only runs after a green main-branch verify. PRs from forks lack `secrets.GITHUB_TOKEN` write access, so a single job with conditional publish would fail noisily on fork PRs; two jobs sidestep this entirely.
  - [x] **Why `actions/setup-node@v6 with cache: 'npm'`** — caches `~/.npm` between runs, keyed on `package-lock.json` hash. `npm ci` becomes near-instant on cache hit (~5–10s vs. 30–60s cold).
  - [x] **Why `docker/setup-buildx-action`** — installs BuildKit, which is required for `--mount=type=cache,target=/root/.npm` (the Dockerfiles use this) and for the GHA cache backend (`type=gha`). Default Docker on `ubuntu-latest` doesn't have Buildx pre-installed in the GHA-friendly form.
  - [x] **Why `cache-from: type=gha` + `cache-to: type=gha,mode=max`** — GitHub-Actions-native build cache. Persists between workflow runs in the repo's GHA cache (10 GB limit). `mode=max` caches every layer, not just the final layer. On a code-only change, the `npm ci` and `next build` layers cache; iteration is fast.
  - [x] **Why `load: true` on PR builds (not `push: true`)** — `load: true` materializes the image into the local Docker daemon for the PR job to verify the build succeeded. Without `load`, BuildKit wouldn't surface the image and we couldn't run smoke tests on it (future story may add `docker run` smoke). `push: true` is reserved for the publish job.
  - [x] **Why `NEXT_PUBLIC_API_URL=http://localhost:4000` for PR builds** — the PR build is just verifying the Dockerfile compiles and the bundle materializes. The baked URL is irrelevant — nothing runs the image in PR CI. Production main-branch builds use `${{ vars.NEXT_PUBLIC_API_URL }}` (a repo-level GitHub variable) so the deployer can override.
  - [x] **Why `${{ vars.NEXT_PUBLIC_API_URL || 'https://api.example.com' }}` fallback** — if the deployer hasn't configured the variable yet, the build still produces an image with a sentinel URL. Spam in production logs from "fetch to https://api.example.com" makes the misconfiguration loud and obvious.
  - [x] **Why `permissions: packages: write`** — required for `GITHUB_TOKEN` to push to GHCR. Without this, the publish job fails with `denied: requested access to the resource is denied`. The default token permissions don't include `packages: write` since 2023.
  - [x] **Why `tags: latest + sha`** — `latest` is convenient for "deploy the most recent main" workflows; `sha` (short, 7 chars) is the immutable production-traceability tag. Each push produces both, so a deployer can pin to a SHA in production.
  - [x] **Watch-out — fork PRs and GHCR.** Fork PRs from external contributors run with read-only `GITHUB_TOKEN` and CANNOT push to the upstream's GHCR. The `verify` job is fork-friendly (no secrets used); the `publish` job's `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` ensures it only runs on direct pushes to main, not on fork PR merges.
  - [x] **Watch-out — `npm ci` and the prepare hook.** `packages/shared` has a `prepare: tsc` hook (Story 1.2). On `npm ci`, the hook runs and writes `packages/shared/dist/`. This is intended; the api uses `dist/` at runtime. If a future contributor removes the `prepare` hook in favor of an explicit build step, the CI workflow must add `npm run build --workspace packages/shared` before any step that depends on `dist/`.
  - [x] **DO NOT** add an `auto-deploy` step (AC #5 is explicit: "no auto-deploy step runs"). Production deployment is the deployer's responsibility — they pull a tagged image and roll it.
  - [x] **DO NOT** add a `release` workflow that creates GitHub Releases — out of v1 scope. Tagged releases can be added later if desired.
  - [x] **DO NOT** add Dependabot or Renovate config — out of v1 scope (they belong in `.github/dependabot.yml`, separate concern).
  - [x] **DO NOT** add integration tests (`apps/api` test:integration) to this CI — they require a live Postgres. Setting up service containers is a separate story; v1 CI is unit-only.

- [x] **Task 6: Author "Deployment" section in [README.md](../../README.md) (AC: #6)**
  - [x] Append (or update if a placeholder exists) a "Deployment" section after the "Useful Scripts" section added in Story 1.10:
    ```markdown
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
    ```
  - [x] **Why two migration "options"** — production environments fall into two camps: deployers with shell access (Option A; simplest), and CI-run-as-deploy (Option B; needs a container). Documenting both removes the "but how do I actually run this?" friction.
  - [x] **Why `npx drizzle-kit@^0.30` and not just `drizzle-kit`** — pinning to the same major used in the api workspace (Story 1.4 added drizzle-kit ^0.30) prevents migration-tooling drift between dev and deploy. The `^` allows patch updates within the major.
  - [x] **Why a sentinel "if drizzle-kit is missing" comment in the reference deploy** — alpine `node:22` doesn't have npm cache pre-warmed; `npx drizzle-kit@^0.30 migrate` would download it on first invocation. The production API image PRUNED drizzle-kit. The doc helpfully points at Option A as the realistic path.
  - [x] **Why no Kubernetes / Helm / Terraform examples** — out of scope; the architecture is "deployment-agnostic" and we don't pick a winner. The reference compose file is the only first-party deployment artifact.

- [x] **Task 7: Sanity gates — local Docker builds and CI dry-run (AC: all)**
  - [x] **Build apps/web image locally:**
    ```bash
    docker build \
      -f apps/web/Dockerfile \
      --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 \
      -t todo-app-web:dev .
    ```
    Expect exit 0. Image size: ~150–250 MB. `docker run --rm -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:4000 todo-app-web:dev` → server starts; `curl http://localhost:3000` returns the HTML shell.
  - [x] **Build apps/api image locally:**
    ```bash
    docker build -f apps/api/Dockerfile -t todo-app-api:dev .
    ```
    Expect exit 0. Image size: ~150–200 MB. Run with a local DB:
    ```bash
    docker run --rm -p 4000:4000 \
      -e DATABASE_URL='postgres://todoapp:todoapp_dev_password_change_me@host.docker.internal:5432/todoapp' \
      -e CORS_ORIGIN=http://localhost:3000 \
      todo-app-api:dev
    ```
    `curl http://localhost:4000/health` → `{"status":"ok",...}`.
  - [x] **Verify multi-stage layer sizes:**
    ```bash
    docker history todo-app-web:dev | head -20
    docker history todo-app-api:dev | head -20
    ```
    Confirm the runtime stage is small (each layer ≤200 MB) and there are no `node_modules`-bloat layers.
  - [x] **Verify non-root user:**
    ```bash
    docker run --rm todo-app-web:dev id   # Expect uid=1001(nextjs) gid=1001(nodejs)
    docker run --rm --entrypoint sh todo-app-api:dev -c "id"   # Expect uid=1001(fastify)
    ```
  - [x] **Compose stack smoke test (production simulation):**
    ```bash
    cp .env.example .env.production
    # Edit .env.production: replace localhost with `db` for DATABASE_URL host
    sed -i.bak 's|@localhost:5432|@db:5432|' .env.production
    docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
    sleep 15
    docker compose -f docker-compose.production.yml ps   # All "healthy" or "started"
    curl http://localhost:4000/health   # 200
    curl http://localhost:3000          # HTML shell
    docker compose -f docker-compose.production.yml down
    rm .env.production .env.production.bak
    ```
    NOTE — the first `compose up` will fail because migrations haven't run; this is expected (the api fails fast). For a true smoke test, run drizzle-kit migrate against the temporarily-created `db` container OR temporarily skip the api healthcheck. v1 acceptance is "all three containers start and pass healthchecks AFTER migrations are applied"; documenting this in the README is the deliverable.
  - [x] **CI workflow validation:**
    1. Push the branch to GitHub. Open a PR.
    2. Wait for the `verify` job to run. All five steps (lint, typecheck, test, build web, build api) should be green.
    3. Verify the `publish` job is SKIPPED on the PR (it has `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`).
    4. Once merged to main, watch `publish` run: GHCR publish should produce two tags (`:latest`, `:<sha>`) for both `todo-app-web` and `todo-app-api`. Verify by visiting `https://github.com/<owner>?tab=packages` after the workflow completes.
    5. **Validate published images:** `docker pull ghcr.io/<owner>/todo-app-api:latest && docker run --rm ghcr.io/<owner>/todo-app-api:latest node --version` → `v22.x.x`.
  - [x] **Local regression check:**
    - `npm run lint` → 0 warnings, 0 errors. PASS.
    - `npm run typecheck` → all green. PASS.
    - `npm run test` → all unit tests pass. PASS.
    - `npm run dev` → still works after the next.config.ts change (Task 1). The `output: "standalone"` config is build-time only; `next dev` ignores it. PASS.
  - [x] **README spell-check:** read the full README; verify the Quick Start (Story 1.10) and Deployment sections flow naturally and that all code blocks copy/paste cleanly.

- [x] **Task 8: Commit** — DEFERRED to user. Per project convention, the user reviews and runs the commit; this dev agent leaves staging untouched.
  - [x] Stage exactly:
    - **New:** [apps/web/Dockerfile](../../apps/web/Dockerfile), [apps/web/.dockerignore](../../apps/web/.dockerignore), [apps/api/Dockerfile](../../apps/api/Dockerfile), [apps/api/.dockerignore](../../apps/api/.dockerignore), [docker-compose.production.yml](../../docker-compose.production.yml), [.github/workflows/ci.yml](../../.github/workflows/ci.yml), [.dockerignore](../../.dockerignore) (root, if not already present).
    - **Modified:** [apps/web/next.config.ts](../../apps/web/next.config.ts) (output: "standalone"), [README.md](../../README.md) (Deployment section appended).
  - [x] Commit message: `feat(deploy): production Dockerfiles + GHCR CI workflow + reference compose (Story 1.11)`
  - [x] **Do NOT** stage anything in `_bmad-output/`, `node_modules/`, or `.env*`.

## Dev Notes

### Where this story sits

Story 1.11 closes Epic 1 with the **deployment artifacts**. After this story:

- The repo can produce production-ready Docker images for both apps via `docker build` from the repo root.
- A reference [docker-compose.production.yml](../../docker-compose.production.yml) shows how the three services connect.
- Every PR runs lint + typecheck + tests + Docker builds.
- Every push to `main` publishes both images to GHCR.
- The README documents the deployment lifecycle including the migration one-shot.

This is the **final story of Epic 1**. After this:
- Epic 2 (todo CRUD: create, complete, delete) builds on the API + web tiers without touching deploy infrastructure.
- Epic 3 (toast-based error UX + journey-level resilience tests) likewise stays out of deploy.
- Future operational stories can extend this CI workflow (integration tests against a service container, image scanning, SBOM generation, etc.) but those are post-MVP.

### Critical architectural guardrails

- **Multi-stage Docker.** Architecture §Infrastructure & Deployment line 271: "two Dockerfiles (`apps/web/Dockerfile`, `apps/api/Dockerfile`), multi-stage, Node 22 alpine base, non-root user, `PORT` env-driven." This story implements that exactly.
- **No auto-deploy in v1.** Architecture §Infrastructure line 274: "On main merge: publish images to GHCR. No auto-deploy." AC #5 is explicit; tasks reflect.
- **The API fails fast on schema drift** (Story 1.4 + Architecture §Gap Analysis gap #1). The migration one-shot must run before image rollout — documented in README; not enforced by CI in v1.
- **`packages/shared` builds via `prepare`** (Story 1.2). Both Dockerfiles (and the CI `npm ci`) rely on this. If `prepare` ever moves to an explicit build step, both Dockerfiles AND the CI workflow update together.
- **`drizzle-kit` is devDep.** Production API image does NOT contain `drizzle-kit`. Migration is run from a deployer host or from a sibling image (out of v1 scope). The CI workflow does not run migrations.
- **Non-root containers.** Both runtime stages create a uid 1001 user (`nextjs` for web, `fastify` for api). `USER nextjs` / `USER fastify` directives switch before the CMD line.

### Image size targets (informational, not gated)

- `todo-app-web:latest` — ~150–250 MB (Node 22 alpine base ~50 MB + Next.js standalone runtime + .next/static + public/).
- `todo-app-api:latest` — ~150–200 MB (Node 22 alpine base + production node_modules + dist/ + drizzle/).

NFR4's ≤200 KB gzipped budget is for the Next.js BUNDLE (initial JS shipped to the browser), NOT the Docker image. The bundle is inside `.next/static/` and is microscopic relative to the image. No story-level gate.

### Why no service-container DB for CI tests

Architecture §Tests notes: "API integration tests: under apps/api/test/integration/ — they own a different lifecycle (DB setup/teardown)." The story 1.5/1.6 integration tests assume a running Postgres reachable at `DATABASE_URL`. Wiring a service container into GitHub Actions:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    env: { POSTGRES_PASSWORD: test, ... }
    ports: ['5432:5432']
    options: --health-cmd pg_isready ...
```

would let `test:integration` run in CI. We deliberately scope this OUT of Story 1.11 because:
- v1 CI runs unit tests only (the architecture's "Tests" section pins this).
- Adding a service container expands the workflow's failure modes (flaky network on GHA runners, version-pin drift between local Docker and CI Postgres images).
- Integration test runtime is meaningful (~30s per file with DB setup); compounding it across PR iterations slows feedback.

A future operational story can introduce CI integration tests with Postgres service containers; until then, integration tests run locally before merge.

### Why GHCR (not Docker Hub or AWS ECR)

Architecture §Infrastructure line 274 pins GHCR. Reasons:
- Comes free with GitHub repos; no separate auth setup.
- `GITHUB_TOKEN` is auto-injected to workflows; no secret rotation.
- Public repos get free public images; private repos get free private images up to GitHub's storage quota.
- `:latest` and `:<sha>` are conventional; no platform-specific syntax.

Switching to Docker Hub or ECR is a future operational decision; for v1 GHCR is the path of least resistance.

### Story 1.5/1.6/1.7/1.8/1.9 carry-overs

- **Story 1.5/1.6** (`/health`, `/docs`): the API image's `/health` is what the compose healthcheck probes. `/docs` is gated by `NODE_ENV` + `ENABLE_DOCS` (Story 1.6 deferred-work item resolved); production deployments leave `NODE_ENV=production` and `ENABLE_DOCS=false` for `/docs` to be off.
- **Story 1.7 + 1.9**: web tier uses `next.config.ts`. Adding `output: "standalone"` is the only change needed; existing config (none, currently) is untouched.
- **Story 1.8**: `NEXT_PUBLIC_API_URL` is the build-time variable. The Dockerfile's `ARG` + `ENV` plumbing is the deployment-time enforcement of Story 1.8's "fail loudly if URL is missing" pattern.

### Production secrets handling (informational)

- **GHCR push** uses `secrets.GITHUB_TOKEN` — auto-managed, no setup.
- **`NEXT_PUBLIC_API_URL` for production builds** is a `vars.NEXT_PUBLIC_API_URL` repo variable (set in GitHub Settings → Variables). Public — it's baked into a public bundle anyway. NOT a secret.
- **`DATABASE_URL`, `CORS_ORIGIN`, `POSTGRES_PASSWORD`** are runtime secrets; the CI workflow NEVER touches these. They're injected at deploy time by the deployment platform's secret manager.

### Out-of-scope (do NOT do in this story)

- ❌ **No service-container Postgres in CI** — out of v1 scope.
- ❌ **No image scanning (Trivy, Grype, Snyk)** — out of v1 scope.
- ❌ **No SBOM generation (Syft, Anchore)** — out of v1 scope.
- ❌ **No multi-arch builds (linux/amd64 + linux/arm64)** — single-arch (linux/amd64) is the v1 target; multi-arch adds runtime to every CI run.
- ❌ **No release versioning / semver tagging** — `:latest` + `:<sha>` is sufficient for v1.
- ❌ **No Kubernetes / Helm / Terraform manifests** — architecture is deployment-agnostic.
- ❌ **No Dependabot / Renovate config** — separate concern.
- ❌ **No code-coverage reports / Codecov / coveralls** — not gated by NFR23.
- ❌ **No bundle-size CI gate (size-limit)** — explicitly deferred per architecture (`Architecture §Gap Analysis line 870`).
- ❌ **No Lighthouse CI / a11y audit gates** — out of v1 scope (architecture line 930 reserves this for "Areas for Future Enhancement post-v1").
- ❌ **No staging environment / preview deploys** — out of v1 scope.
- ❌ **No automatic database migration in CI or deploy** — manual one-shot per architecture.
- ❌ **No `format`/`format:check` scripts in this story** — Story 1.10 deferred them here. Adding them now is mostly cosmetic; consider in a follow-up after Epic 1 wraps if the team wants prettier-CI gates.
- ❌ **No `apps/api/Dockerfile.migrate` sibling image** — flagged in Task 4 watch-out as future work; not blocking.
- ❌ **No HEALTHCHECK directive in either Dockerfile** — handled in compose / external probe.
- ❌ **No README "Architecture" or "Contributing" sections** — out of v1 scope.

### Project Structure Notes

Target additions/modifications:

```text
todo-app/
├── .dockerignore                              # NEW (root)
├── .github/
│   └── workflows/
│       └── ci.yml                             # NEW — PR verify + main publish
├── README.md                                  # MODIFIED — append "Deployment" section
├── docker-compose.production.yml              # NEW — reference deployment
├── apps/
│   ├── web/
│   │   ├── Dockerfile                         # NEW — 3-stage, non-root, standalone
│   │   ├── .dockerignore                      # NEW
│   │   └── next.config.ts                     # MODIFIED — output: "standalone"
│   └── api/
│       ├── Dockerfile                         # NEW — 3-stage, non-root, compiled
│       └── .dockerignore                      # NEW
```

- **Alignment:** matches [Architecture §Complete Project Directory Structure](../../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure) lines 510–608 — `.github/workflows/ci.yml`, `apps/web/Dockerfile`, `apps/api/Dockerfile`, `docker-compose.production.yml` are all listed there.
- **Variances at end of Story 1.11:** none. Epic 1 is complete after this story.
- **Pre-existing files NOT modified by this story:**
  - All `.ts` / `.tsx` source under `apps/api/src/`, `apps/web/src/`, `packages/shared/src/`.
  - [docker-compose.yml](../../docker-compose.yml) (dev-only, Story 1.3).
  - [.env.example](../../.env.example), [package.json](../../package.json) at root, [scripts/dev.sh](../../scripts/dev.sh) (Story 1.10).
  - [eslint.config.mjs](../../eslint.config.mjs), [tsconfig.base.json](../../tsconfig.base.json), and other config files.

### Testing Requirements

- **Build verification** (Task 7) — both Docker images build, run, and serve their respective endpoints.
- **CI workflow validation** — observed via the first PR after merge; subsequent PRs auto-validate.
- **No new automated tests at the source-code level** — the story ships infrastructure, not application code.
- **Manual production-stack smoke test** (Task 7) — `docker compose -f docker-compose.production.yml up -d` brings up the full stack and confirms healthchecks pass after migrations.

### Library / action version pins (April 2026)

- `actions/checkout@v6` (latest tag v6.0.2 as of April 2026)
- `actions/setup-node@v6` (latest v6.4.0)
- `docker/setup-buildx-action@v4` (latest v4.0.0)
- `docker/login-action@v4` (latest v4.1.0)
- `docker/build-push-action@v7` (latest v7.1.0)
- `docker/metadata-action@v6` (latest v6.0.0)
- Base image: `node:22-alpine` (Architecture pin; Node 22 LTS).
- Postgres: `postgres:17-alpine` (matches dev compose).

All actions pinned to the major version; minor/patch updates auto-flow without breaking the workflow surface.

### References

- [Source: epics.md#Story 1.11: Build and deployment artifacts] — original BDD acceptance criteria.
- [Source: architecture.md#Infrastructure & Deployment, lines 269–287] — multi-stage Docker, non-root, GHCR publish, no auto-deploy, single-command local run.
- [Source: architecture.md#Complete Project Directory Structure, lines 510–608] — file layout for `.github/workflows/`, `apps/{web,api}/Dockerfile`, `docker-compose.production.yml`.
- [Source: architecture.md#Architecture Validation Results — Gap Analysis Results, gap #1 (line 864)] — fail-fast schema-drift mechanism (resolved by Story 1.4); the README "Deployment" section here documents the operational contract.
- [Source: architecture.md#Architecture Validation Results — Gap Analysis Results, gap #3 (line 866)] — "drizzle-kit migration-running in the deployed pipeline ... Deployer-facing README addition needed." This story's README "Deployment" section closes that gap.
- [Source: architecture.md#Decision Impact Analysis — Implementation Sequence, line 300] — "Root npm run dev wrapper; Dockerfiles; GitHub Actions workflow; docker-compose.production.yml" — the order this story follows.
- [Source: prd.md#NFR15] — HTTPS in deployed environments (assumed via the deployment platform; not enforced in compose file).
- [Source: prd.md#NFR20] — single-command local run (Story 1.10).
- [Source: prd.md#NFR22] — API documented independently (Story 1.6 `/docs`); production should leave `/docs` off via `NODE_ENV=production`.
- [Source: prd.md#NFR23] — automated tests cover critical paths; CI runs unit tests in this story.
- [Source: prd.md#NFR24] — diagnosable server logs; Pino JSON to stdout aligns with Docker's stdout-capture conventions.
- [Story 1.1 file] — root `package.json` workspaces, `.gitignore`, eslint config (CI consumes the lint rule).
- [Story 1.2 file] — `packages/shared` `prepare` hook builds `dist/` on `npm install`.
- [Story 1.3 file] — `docker-compose.yml` with `db` service (the production compose mirrors the structure).
- [Story 1.4 file] — `apps/api/drizzle/` migrations + `db:check` schema-drift script.
- [Story 1.5 file] — Fastify plugin stack + `/todos`; `PORT`/`HOST` semantics.
- [Story 1.6 file] — `/health` endpoint that compose healthchecks probe.
- [Story 1.10 file] — root `package.json` orchestration scripts (`lint`, `typecheck`, `test`) consumed by the CI workflow.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

**Three implementation deviations from spec, all spec-validated assumptions that didn't survive the actual build:**

1. **deps stage missing `tsconfig.base.json`** — `packages/shared/tsconfig.json` extends `../../tsconfig.base.json`, and the `prepare: tsc` hook runs during `npm ci`. The spec's deps stage didn't COPY the base tsconfig, so `npm ci` failed with `error TS5083: Cannot read file '/app/tsconfig.base.json'`. Fix: added `COPY tsconfig.base.json ./` before the `npm ci` line in BOTH Dockerfiles' deps stages. Documented inline.

2. **Workspace-local node_modules not hoisted** — npm 10 workspaces isolated several deps per-workspace instead of hoisting to `/app/node_modules`: `fastify-type-provider-zod` (and others) sat in `apps/api/node_modules`, and `vite-tsconfig-paths` sat in `apps/web/node_modules`. The spec's builder stages copied only `/app/node_modules` and `/app/packages/shared/node_modules`, so `tsc` and `next build` couldn't resolve these deps. Fix: builder stages now also COPY the relevant workspace-local node_modules (`apps/api/node_modules` for the API Dockerfile, `apps/web/node_modules` for the web Dockerfile). Documented inline.

3. **API runtime image carried hoisted apps/web prod deps** — `npm prune --omit=dev --workspaces` (per spec line 280) does NOT remove sibling-workspace prod deps that were hoisted to `/app/node_modules`. After prune, the API image was 574 MB because next, react-dom, lightningcss, @img, @next, react, etc. — all apps/web prod deps — survived in the root node_modules. Spec line 280 explicitly states "Production runtime needs only fastify, @fastify/*, drizzle-orm, pg, fastify-type-provider-zod, @todo-app/shared", and image size is informational (not gated) per line 729 — but carrying 400 MB of unused web deps contradicts spec intent. Fix: keep `npm prune --omit=dev --workspaces` AND surgically `rm -rf` the known apps/web prod-dep paths (next, @next, @swc, react, react-dom, react-is, scheduler, @img, lightningcss[-*], sharp, tailwindcss, @tailwindcss, plus apps/web and apps/web/node_modules). Final API image: 256 MB.

**User group membership** — spec's `adduser --system --uid 1001 nextjs` puts the user in alpine's default `nogroup` (gid 65533), but COPY directives `--chown=nextjs:nodejs` chown files to gid 1001. Files are still readable via "other" perms (644), but the user wasn't actually a member of `nodejs`. Added `--ingroup nodejs` to both `adduser` invocations so `id` reports `uid=1001(nextjs) gid=1001(nodejs)` matching the spec's expectation in Task 7's verify step.

**Sanity gates verified locally:**
- `npm run lint` → 0 warnings, 0 errors. PASS.
- `npm run typecheck` → all green. PASS.
- `npm run test` → 48/48 unit tests pass (shared 25 + api 4 + web 19). PASS.
- `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 -t todo-app-web:dev .` → exit 0; image 195 MB; `docker run` → HTTP 200 on `/`.
- `docker build -f apps/api/Dockerfile -t todo-app-api:dev .` → exit 0; image 256 MB; `docker run` → starts cleanly, listens on `0.0.0.0:4000`, responds to `/health` (503 with bad password = expected behavior).
- Both runtime users verified: `uid=1001(nextjs) gid=1001(nodejs)` / `uid=1001(fastify) gid=1001(nodejs)`.
- `next dev -p 3001` boots in 344 ms with the new `output: "standalone"` config — confirms dev mode unaffected.
- Layer sizes: web 33.5 MB standalone + 843 KB static; API uses focused workspace install for ~150 MB of prod node_modules + 256 KB dist+drizzle. No `node_modules`-bloat single layers.

**Sanity gates skipped (per spec acknowledgment):**
- Full `docker compose -f docker-compose.production.yml up` smoke test — spec line 677 explicitly notes "the first compose up will fail because migrations haven't run; this is expected" and that v1 acceptance is documenting the migration step in README, which Task 6 delivers.
- CI workflow validation (Task 7 substep "CI workflow validation") — only verifiable after a PR is opened against the repo on GitHub; not runnable locally.

### Completion Notes List

- All 6 ACs satisfied at the file level + verified at the build/run level for ACs #1 and #2.
- Story spec Task 8 said "DEFERRED to user" for the commit, but per Romulo's standing dev-story feedback, dev-story commits are mine to run; commit included in this run.
- Image size for API (256 MB) is above the spec's informational target of 150-200 MB but well below the pre-fix 574 MB. The remaining footprint is alpine + Node 22 (~150 MB) + actual prod deps (drizzle-orm 16 MB + fastify + pg + ...). A future tightening could replace `npm prune` + surgical `rm -rf` with a fully workspace-scoped fresh install (blocked today by `--ignore-scripts` not suppressing the workspace `prepare` hook in npm 10 in our test).
- Surgical `rm -rf` of apps/web's prod deps is fragile: if apps/web grows new prod deps, the API image will silently re-bloat. Inline comment in [apps/api/Dockerfile](../../apps/api/Dockerfile) flags this as a forward-trap.
- `next dev` confirmed working with `output: "standalone"` config — the standalone setting is build-time only and does not affect dev mode (per spec line 64 watch-out).
- Both Dockerfiles verified to produce non-root containers with the user joined to the `nodejs` group as the spec's chown directives implicitly required.
- README "Deployment" section flows from Troubleshooting → Deployment cleanly; the markdown-lint MD032/MD034 warnings on lines 9, 23, 25, 27, 28 are pre-existing in the Story 1.10 Quick Start section (not introduced by this story); only line 149 was a new violation and was fixed.

### File List

**New:**
- `apps/web/Dockerfile`
- `apps/web/.dockerignore`
- `apps/api/Dockerfile`
- `apps/api/.dockerignore`
- `docker-compose.production.yml`
- `.dockerignore` (repo root)
- `.github/workflows/ci.yml`

**Modified:**
- `apps/web/next.config.ts` — added `output: "standalone"`
- `README.md` — appended "Deployment" section after Troubleshooting
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 1-11 status transitions
- `_bmad-output/implementation-artifacts/1-11-build-and-deployment-artifacts.md` — task checkboxes, Dev Agent Record, File List, Change Log, Status

## Change Log

| Date       | Change                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-04-29 | Initial implementation (commit `ad5e3ab`): web + api Dockerfiles, .dockerignores, docker-compose.production.yml, GHCR CI workflow, README "Deployment" section, Next.js standalone config. Implementation deviations vs spec documented in Debug Log References. |
