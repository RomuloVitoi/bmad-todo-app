---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
---

# todo-app - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for todo-app, decomposing the requirements from the PRD and Architecture requirements into implementable stories. No separate UX Design specification exists for this project — UX concerns are addressed as first-class decisions in the Architecture document (Radix primitives, Tailwind, semantic markup, WCAG 2.1 AA patterns).

## Requirements Inventory

### Functional Requirements

#### Task Management

- **FR1:** User can add a new todo by entering a short text description.
- **FR2:** User can mark any active todo as completed.
- **FR3:** User can mark any completed todo as not completed.
- **FR4:** User can delete any todo regardless of its completion state.
- **FR5:** Each todo carries a unique identifier assigned by the system at creation time.
- **FR6:** Each todo records its creation time.
- **FR7:** Each todo carries a completion state (active or completed).

#### List Presentation

- **FR8:** User sees the full shared list of todos immediately on page load, without authentication or interaction gates.
- **FR9:** Active and completed todos are visually distinguishable from each other at a glance.
- **FR10:** Todos are rendered in a consistent, predictable order across page loads and across users.
- **FR11:** User sees an empty-state presentation when the list contains no todos.
- **FR12:** User sees a loading-state presentation while the initial list is being fetched.

#### State & Persistence

- **FR13:** All todos persist in durable server-side storage and survive server restarts and client reloads.
- **FR14:** The shared list is the single source of truth for all visitors — no per-user or per-session isolation in v1.
- **FR15:** Concurrent mutations from multiple users are resolved deterministically by the server (last-write-wins at the todo level).
- **FR16:** Client-side state reconciles with server state on fetch; divergence is resolved in favor of the server.

#### Feedback & Error Handling

- **FR17:** User receives immediate visual feedback on every mutation attempt (create, complete, uncomplete, delete).
- **FR18:** User sees a clear, non-technical error message when a mutation cannot be persisted.
- **FR19:** User's in-progress input (e.g., text being typed) is preserved through mutation failures.
- **FR20:** User can retry a failed mutation without refreshing the page or losing list state.
- **FR21:** The system does not silently drop mutations; every attempted operation either succeeds, visibly fails, or is retried.

#### API Surface

- **FR22:** The backend exposes an operation to retrieve the full list of todos.
- **FR23:** The backend exposes an operation to create a new todo from a text description.
- **FR24:** The backend exposes an operation to update a todo's completion state.
- **FR25:** The backend exposes an operation to delete a todo.
- **FR26:** Each API operation returns predictable, documented success and error response shapes.
- **FR27:** API error responses distinguish between client errors (invalid input) and server errors (internal failures).
- **FR28:** The API can be exercised and tested independently of the frontend client.

#### Responsive & Accessible Delivery

- **FR29:** The application renders usably across desktop, tablet, and mobile viewport widths without a separate codebase per form factor.
- **FR30:** All interactive elements are reachable and operable via keyboard alone.
- **FR31:** All interactive elements expose accessible labels and roles consumable by assistive technology.
- **FR32:** Active vs. completed state is communicated to assistive technology by means other than color alone.
- **FR33:** The application is operable in supported modern browsers without special configuration or fallback plugins.

### NonFunctional Requirements

#### Performance

- **NFR1:** Core-loop UI response (add, complete, uncomplete, delete) is perceptibly instantaneous — ≤ 100 ms from user action to visual feedback under normal conditions, via optimistic UI.
- **NFR2:** Server-side API response for all CRUD operations returns in ≤ 300 ms at the 95th percentile under normal single-user load.
- **NFR3:** Initial page load to interactive is < 2 s on a modern broadband connection and < 5 s on a 3G-equivalent profile.
- **NFR4:** Initial JavaScript bundle is ≤ 200 KB gzipped.

#### Reliability & Durability

- **NFR5:** Todo data persists across client reloads, tab closures, and backend process restarts — no data loss in any of these scenarios.
- **NFR6:** Concurrent mutations from multiple clients do not produce corrupted state, duplicated items, or lost updates at the backend level.
- **NFR7:** The system does not silently swallow errors — every failed mutation is surfaced to the user or retried automatically.
- **NFR8:** The application recovers from transient network failures (offline, timeout, 5xx) without requiring a full page refresh.
- **NFR9:** No unhandled promise rejections, uncaught exceptions, or stuck UI states under the induced failure modes documented in Journey 3.

#### Accessibility

- **NFR10:** The core user flows (add, view, complete, delete) meet WCAG 2.1 Level AA conformance.
- **NFR11:** All interactive elements are operable via keyboard alone, with visible focus indicators.
- **NFR12:** Active vs. completed state is conveyed to assistive technology via semantic markup or ARIA, not by color alone.
- **NFR13:** Color contrast for text and interactive elements meets WCAG AA contrast ratios.
- **NFR14:** Tap targets on mobile viewports are sized to meet accessibility tap-target guidelines (minimum 44×44 CSS pixels or equivalent).

#### Security

- **NFR15:** The application serves over HTTPS in any deployed environment (local development may exempt).
- **NFR16:** The API validates and sanitizes all user-supplied input server-side before persisting — no trust in client-side validation.
- **NFR17:** Rendered todo text is escaped appropriately to prevent cross-site scripting regardless of input content.
- **NFR18:** The API applies reasonable input bounds (e.g., maximum todo description length) to prevent trivial resource-exhaustion inputs.
- **NFR19:** No authentication, session, or authorization mechanisms exist in v1 (deliberate); no data in v1 is treated as private or protected.

#### Maintainability & Operability

- **NFR20:** A developer unfamiliar with the codebase can run the full stack (frontend + backend) locally with a single documented command.
- **NFR21:** The codebase is small enough to be read end-to-end in a single sitting; no module exists solely for speculative future use.
- **NFR22:** The backend API is documented (contract shape, error codes) such that a developer could implement a client without reading the frontend code.
- **NFR23:** Automated tests cover the critical paths: CRUD API operations, list rendering, and the three documented user journeys including failure recovery.
- **NFR24:** The system emits sufficient server-side logs on errors to diagnose failures without reproducing them client-side.

### Additional Requirements

#### Starter / Scaffolding (drives Epic 1 Story 1)

- Composite official scaffolding: `npm init` workspace root → `npx create-next-app@latest apps/web --typescript --app --eslint --tailwind --src-dir --use-npm --yes` → `npx fastify-cli@latest generate apps/api --lang=typescript` → manual `packages/shared/`. **No third-party combined starter.**
- Workspace tooling: plain **npm workspaces** (not pnpm, not Turborepo, not Yarn).
- Monorepo layout: `apps/web/`, `apps/api/`, `packages/shared/`.

#### Runtime & Language

- Node.js ≥ 22 LTS; TypeScript end-to-end (strict mode); `tsconfig.base.json` shared at root.
- React 19 + Next.js 16 App Router; Fastify v5.8.x.

#### Data Layer

- PostgreSQL 17 via `postgres:17-alpine` in docker-compose (local) and any managed Postgres/container (prod).
- Drizzle ORM + `drizzle-kit` for schema and migrations; migrations committed under `apps/api/drizzle/`.
- Single `todos` table: `id` (uuid PK, `gen_random_uuid()`), `text` (text, bounded), `completed` (boolean default false), `created_at` (timestamptz default now()). No `owner_id` in v1.
- Migrations executed as one-shot command (`drizzle-kit migrate`), never on API startup; API fails fast if schema is behind expected version.

#### Shared Contract

- `packages/shared/src/contracts.ts` as single source of truth for wire shapes — Zod schemas for `Todo`, `CreateTodoRequest`, `UpdateTodoRequest`, `TodoListResponse`, `ErrorResponse`. Drizzle schemas derive entity shape via `drizzle-zod`; API validators consume Zod via `@fastify/type-provider-zod`.
- Wire shapes: camelCase (e.g., `createdAt`); DB: snake_case. Text bound: `z.string().trim().min(1).max(500)`.
- List response envelope wrapped: `{ todos: [...] }` to keep pagination additive.

#### API Plugins & Middleware

- `@fastify/cors` (locked to `CORS_ORIGIN` env var), `@fastify/helmet`, `@fastify/rate-limit` (100 req/min/IP), `@fastify/sensible`, `@fastify/request-context` with `x-request-id` correlation IDs, `@fastify/env` for typed env, `@fastify/type-provider-zod` for validation/typing.
- `@fastify/swagger` + `@fastify/swagger-ui` generates OpenAPI from Zod schemas; Swagger UI served on `/docs` in non-prod; toggled off in production.
- Fastify `bodyLimit: 4 KB`; Zod schemas use `.strict()` (unknown fields rejected).
- Global `setErrorHandler` + Fastify-sensible error constructors; no hand-crafted error responses.

#### Endpoints (exact set)

- `GET /todos`, `POST /todos`, `PATCH /todos/:id`, `DELETE /todos/:id`, `GET /health`, `GET /docs` (non-prod only).
- `GET /health` checks process liveness AND DB reachability; returns 503 if DB unreachable.
- Error shape: `{ statusCode, error, message, code? }` (Fastify-sensible default).
- No API versioning (`/v1/` prefix deferred); LWW concurrency documented in OpenAPI descriptions (no ETag/If-Match).

#### Frontend Architecture

- CSR-only on Next.js App Router; `app/layout.tsx` + `app/page.tsx` hosting a single `<TodoApp />`. No SSR/SSG/RSC data-fetching.
- State: React `useReducer` with hand-rolled optimistic actions (`addOptimistic`/`addReconcile`/`addFailed`, etc.); no TanStack Query/SWR.
- All HTTP goes through `apps/web/src/lib/api.ts`; components never call raw `fetch`. `x-request-id` UUID generated per request.
- Radix UI primitives: `Checkbox` (completion toggle), `Toast` (error surface with polite live region). Native HTML for input/button.
- Tailwind CSS exclusively for styling; completion state expressed via `aria-checked` + strikethrough (not color alone).
- Refetch on `visibilitychange` (best-effort, silent failure).
- Top-level `window.addEventListener('unhandledrejection', ...)` surfaces generic error toast (NFR9 safety net).
- No `dangerouslySetInnerHTML` anywhere.

#### Logging & Observability

- Pino JSON logs on API; mandatory structured fields per request: `{ level, time, requestId, method, path, statusCode, durationMs, msg }`.
- Correlation IDs: accept incoming `x-request-id` header or generate UUID; attach via `@fastify/request-context`; include in every log line via Pino mixin; echo in response headers.
- No metrics, tracing, error aggregation (Sentry) in v1.

#### Infrastructure & Deployment

- Two multi-stage Dockerfiles (`apps/web/Dockerfile`, `apps/api/Dockerfile`), Node 22 alpine base, non-root user, `PORT` env-driven.
- `docker-compose.yml` at root — local dev: Postgres only. Apps run on host via `npm run dev` for fast HMR.
- `docker-compose.production.yml` as runnable deployment-agnostic reference (web + api + db).
- GitHub Actions CI (`.github/workflows/ci.yml`): lint + type-check + tests + Docker builds on PR; publish images to GHCR on main merge. No auto-deploy.
- Env vars: API → `DATABASE_URL`, `PORT`, `LOG_LEVEL`, `CORS_ORIGIN`; Web → `NEXT_PUBLIC_API_URL`. Root `.env.example` documents all.

#### Development Workflow (NFR20)

- Root `npm run dev` → `scripts/dev.sh`: `docker compose up -d db` (idempotent) → wait for DB healthcheck → `drizzle-kit migrate` → `npm-run-all --parallel dev:web dev:api`.

#### Testing Requirements

- API: unit tests for route handlers via `app.inject` (co-located `*.test.ts`); integration tests under `apps/api/test/integration/` with real Postgres covering full CRUD, validation failure paths, and LWW concurrency semantics. Built-in `node --test` (fastify-cli default).
- Web: component tests for the three PRD user journeys (happy path, returning session, failure recovery). Framework not pinned — **recommended resolution: Vitest + React Testing Library**.
- Co-located `*.test.ts(x)` for unit tests; no `__tests__/` directories; no root `tests/` tree.
- `packages/shared/src/contracts.test.ts` for contract round-trip tests.

#### Code Conventions & Enforcement

- ESLint at root extending `eslint:recommended`, `@typescript-eslint/recommended`, and Next.js config. Custom `no-restricted-imports` rule blocks cross-app imports between `apps/api` and `apps/web`.
- Prettier defaults; `.editorconfig`; `.nvmrc` pinned to Node 22.
- `tsc --noEmit` in CI catches contract drift.

#### Known Gaps (flagged in Architecture, to be resolved during implementation)

- Concrete fail-fast-on-schema-mismatch mechanism inside `apps/api/src/db/migrate.ts` not pre-specified.
- Web test framework recommended (Vitest + RTL) but not pinned in Architecture.
- Deployment-side drizzle-kit invocation command to be documented in README.

### UX Design Requirements

_No dedicated UX Design Specification exists for this project. UX-relevant requirements are covered by:_

- _Functional Requirements:_ FR8–FR12 (list presentation, empty/loading states), FR17–FR21 (feedback & error surfaces), FR29–FR33 (responsive & accessible delivery).
- _Non-Functional Requirements:_ NFR10–NFR14 (WCAG 2.1 AA conformance, keyboard operability, focus indicators, color contrast, tap target sizing).
- _Architecture:_ Frontend Architecture section pre-specifies component composition (`TodoApp`, `TodoInput`, `TodoList`, `TodoItem`, `Toast`), Radix primitive choices, Tailwind-only styling, and semantic markup patterns.

No separate UX-DR items are extracted — they are fully absorbed into the FR/NFR and Architecture layers above.

### FR Coverage Map

| FR | Epic | Coverage Note |
| --- | --- | --- |
| FR1 | Epic 2 | Create todo via `TodoInput` + `POST /todos` |
| FR2 | Epic 2 | Toggle active → completed via Radix Checkbox + `PATCH /todos/:id` |
| FR3 | Epic 2 | Toggle completed → active (same mechanism as FR2) |
| FR4 | Epic 2 | Delete button + `DELETE /todos/:id` |
| FR5 | Epic 1 | UUID PK in Drizzle schema + `TodoSchema` |
| FR6 | Epic 1 | `created_at` timestamptz in schema + `createdAt` on wire |
| FR7 | Epic 1 | `completed` boolean in schema + `TodoSchema` |
| FR8 | Epic 1 | `app/page.tsx` renders list on mount; no gate |
| FR9 | Epic 2 | Strikethrough + visual state on `TodoItem` |
| FR10 | Epic 1 | Server returns ordered list (`ORDER BY created_at`) |
| FR11 | Epic 1 | `TodoList` empty-state rendering |
| FR12 | Epic 1 | `TodoList` loading-state rendering |
| FR13 | Epic 1 | Postgres persistence + migrations |
| FR14 | Epic 1 | Global list (no `owner_id`) |
| FR15 | Epic 2 | LWW semantics on `PATCH`/`DELETE` (no optimistic-concurrency checks) |
| FR16 | Epic 1 | Reducer `loadSuccess` reconciles from server |
| FR17 | Epic 2 | Optimistic reducer actions (`addOptimistic`, etc.) |
| FR18 | Epic 3 | `ApiError.message` surfaced via Radix Toast |
| FR19 | Epic 3 | `TodoInput` retains value on mutation failure |
| FR20 | Epic 3 | Rollback + user-initiated retry; no refresh required |
| FR21 | Epic 3 | Explicit `{intent}Failed` actions + Toast; no silent drops |
| FR22 | Epic 1 | `GET /todos` handler + Zod contract |
| FR23 | Epic 2 | `POST /todos` handler + Zod contract |
| FR24 | Epic 2 | `PATCH /todos/:id` handler + Zod contract |
| FR25 | Epic 2 | `DELETE /todos/:id` handler + Zod contract |
| FR26 | Epic 1 | Fastify-sensible envelopes; Zod-derived OpenAPI |
| FR27 | Epic 1 | 4xx via sensible; 5xx via `setErrorHandler` |
| FR28 | Epic 1 | API integration tests against real Postgres |
| FR29 | Epic 1 | Tailwind responsive utilities; mobile-first layout |
| FR30 | Epic 1 | Semantic HTML + native focus; baseline set in Epic 1, mutation affordances in Epic 2 |
| FR31 | Epic 1 | `<label>` for input, `aria-label` on buttons; baseline in Epic 1, extended in Epic 2 |
| FR32 | Epic 2 | Radix Checkbox `aria-checked` + strikethrough (non-color state) |
| FR33 | Epic 1 | Modern-browser baseline: React 19 + Next.js 16 + ES2020+ |

## Epic List

### Epic 1: Shared Todo List — Visible, Deployable Read Experience

A visitor opens the app (local or deployed) and immediately sees the shared todo list — empty state, loading state, or populated with items others have created. No gate, no login, no setup. The app is built end-to-end with workspace scaffolding, DB persistence, a documented API, and container deployment — but the user-visible outcome is simply "I can see the list."

**FRs covered:** FR5, FR6, FR7, FR8, FR10, FR11, FR12, FR13, FR14, FR16, FR22, FR26, FR27, FR28, FR29, FR30, FR31, FR33
**Key NFRs:** NFR3, NFR4, NFR5, NFR10, NFR11, NFR13, NFR15, NFR19, NFR20, NFR21, NFR22, NFR23, NFR24

### Epic 2: Todo Core Loop — Create, Complete, Delete

A user can add a new todo by typing and pressing Enter, mark any todo as completed (or un-complete it), and delete any todo. Mutations respond instantly via optimistic UI, completion state is visually unambiguous (and accessible to assistive tech), and concurrent edits from multiple users resolve deterministically. Ships the full core product loop.

**FRs covered:** FR1, FR2, FR3, FR4, FR9, FR15, FR17, FR23, FR24, FR25, FR32
**Key NFRs:** NFR1, NFR2, NFR6, NFR12, NFR14, NFR16, NFR17, NFR18

### Epic 3: Failure Resilience & Recovery

When something goes wrong (offline, server 5xx, timeout), the user sees a clear non-technical error, their typed input is preserved, and they can retry without losing list state or refreshing. The system surfaces every failure — nothing drops silently — and operators can diagnose failures from correlated server logs.

**FRs covered:** FR18, FR19, FR20, FR21
**Key NFRs:** NFR7, NFR8, NFR9, NFR24 (enhancement: correlation IDs, structured logging)

## Epic 1: Shared Todo List — Visible, Deployable Read Experience

A visitor opens the app (local or deployed) and immediately sees the shared todo list — empty state, loading state, or populated with items others have created. No gate, no login, no setup. The app is built end-to-end with workspace scaffolding, DB persistence, a documented API, and container deployment — but the user-visible outcome is simply "I can see the list."

### Story 1.1: Scaffold monorepo workspace

As a developer joining the project,
I want a working monorepo with the web and API apps scaffolded and wired to a shared package,
So that every subsequent story has a place for its code and `npm install` at the root resolves everything.

**Acceptance Criteria:**

**Given** a fresh empty directory,
**When** the scaffolding commands from Architecture §Starter Template are executed (`npm init -y`, `npx create-next-app@latest apps/web --typescript --app --eslint --tailwind --src-dir --use-npm --yes`, `npx fastify-cli@latest generate apps/api --lang=typescript`, `mkdir -p packages/shared/src`),
**Then** the resulting tree contains `apps/web/`, `apps/api/`, `packages/shared/` and a root `package.json` with `"workspaces": ["apps/*", "packages/*"]`,
**And** no third-party combined starter is used.

**Given** the scaffolded workspace,
**When** a developer runs `npm install` from the root,
**Then** all three workspace packages install successfully into a single root `node_modules`,
**And** `packages/shared` is resolvable from both apps as `@todo-app/shared`.

**Given** the scaffolded workspace,
**When** inspecting root config files,
**Then** `tsconfig.base.json` defines `strict: true` and a shared `moduleResolution` and is extended by `apps/web/tsconfig.json`, `apps/api/tsconfig.json`, and `packages/shared/tsconfig.json`,
**And** `.nvmrc` pins Node 22,
**And** `.editorconfig`, `.prettierrc`, and `.eslintrc.cjs` are present at the root,
**And** `.eslintrc.cjs` extends `eslint:recommended`, `@typescript-eslint/recommended`, and Next.js's config.

**Given** the ESLint config at the root,
**When** a file in `apps/web/` attempts to import from `apps/api/` (or vice versa),
**Then** the lint run fails with a `no-restricted-imports` error.

**Given** the scaffolded workspace,
**When** `.gitignore` is inspected,
**Then** it ignores `node_modules/`, `.next/`, `dist/`, `.env`, and other build artifacts.

### Story 1.2: Define the shared Todo contract

As a developer of either tier,
I want Zod schemas for every API wire shape in `packages/shared`,
So that validation, typing, and OpenAPI generation derive from a single source of truth.

**Acceptance Criteria:**

**Given** `packages/shared/src/contracts.ts`,
**When** the module is imported,
**Then** it exports `TodoSchema`, `CreateTodoRequestSchema`, `UpdateTodoRequestSchema`, `TodoListResponseSchema`, and `ErrorResponseSchema` as named Zod schemas,
**And** all object schemas use `.strict()` so unknown fields cause validation errors.

**Given** `TodoSchema`,
**When** a valid todo is parsed,
**Then** it contains `id` (UUID string), `text` (non-empty trimmed string, max 500 chars), `completed` (boolean), and `createdAt` (ISO 8601 datetime string),
**And** `TodoSchema.parse({...with text longer than 500})` throws a `ZodError`.

**Given** `CreateTodoRequestSchema`,
**When** parsing `{ text: "  pick up milk  " }`,
**Then** it returns `{ text: "pick up milk" }` (trimmed),
**And** parsing `{ text: "" }` or `{ text: "x".repeat(501) }` throws.

**Given** `UpdateTodoRequestSchema`,
**When** parsing `{ completed: true }`,
**Then** it passes,
**And** parsing an object containing fields other than `completed` throws due to `.strict()`.

**Given** `TodoListResponseSchema`,
**When** parsing `{ todos: [] }` or `{ todos: [validTodo] }`,
**Then** it passes; parsing `null` or `{}` without a `todos` key throws.

**Given** `packages/shared/src/contracts.test.ts`,
**When** `node --test` runs in the package,
**Then** round-trip tests for every schema pass (valid → parse → pass; invalid → parse → throw).

**Given** `packages/shared/package.json`,
**When** its `exports` field is inspected,
**Then** it exposes the package entry so both apps can import via `@todo-app/shared`.

### Story 1.3: Provision local Postgres via docker-compose

As a developer setting up locally,
I want a `docker compose up -d` command to start a Postgres 17 instance with documented credentials,
So that the API has a durable database to connect to without any platform-specific install.

**Acceptance Criteria:**

**Given** `docker-compose.yml` at the repo root,
**When** `docker compose up -d db` runs,
**Then** a container using `postgres:17-alpine` starts on port 5432,
**And** it mounts a named volume (e.g., `todo-app-db-data`) so data persists across `docker compose down && up`.

**Given** the running DB container,
**When** `docker compose ps` is inspected,
**Then** the `db` service reports a healthy status via a `pg_isready`-based healthcheck.

**Given** `.env.example` at the repo root,
**When** it is read,
**Then** it documents every required env var with a placeholder value: `DATABASE_URL`, `PORT`, `LOG_LEVEL`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
**And** `.env` is gitignored while `.env.example` is committed.

**Given** the Postgres container is running with credentials from `.env`,
**When** a developer connects using `psql "$DATABASE_URL"`,
**Then** the connection succeeds,
**And** the target database named in `POSTGRES_DB` exists.

### Story 1.4: API data layer — Drizzle schema, migration, client, fail-fast check

As a developer of the API app,
I want the `todos` table defined in Drizzle, a committed initial migration, a DB client plugin, and a migrate script that fails fast if the schema drifts,
So that the API has a typed, versioned data layer and cannot silently run against an outdated DB.

**Acceptance Criteria:**

**Given** `apps/api/src/db/schema.ts`,
**When** the module is imported,
**Then** it defines a `todos` table with `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `text text NOT NULL`, `completed boolean NOT NULL DEFAULT false`, `created_at timestamptz NOT NULL DEFAULT now()`,
**And** no `owner_id` or `updated_at` column is defined.

**Given** `apps/api/drizzle.config.ts`,
**When** `drizzle-kit generate` runs,
**Then** it produces a SQL migration at `apps/api/drizzle/0000_init.sql` plus `meta/_journal.json`,
**And** both files are committed to the repo.

**Given** a running Postgres container at `DATABASE_URL`,
**When** `drizzle-kit migrate` runs,
**Then** the `todos` table exists in the target database with the specified columns,
**And** the migrations journal (`__drizzle_migrations`) records the applied migration.

**Given** `apps/api/src/db/client.ts`,
**When** it is imported,
**Then** it constructs a single `pg` connection pool and Drizzle instance at module scope,
**And** exposes typed query helpers (e.g., `listTodos()`) so handlers import functions, not raw tables.

**Given** `apps/api/src/plugins/db.ts`,
**When** the Fastify app registers the plugin,
**Then** the Drizzle instance is decorated onto the app so route handlers can access it.

**Given** `apps/api/src/db/migrate.ts`,
**When** it runs against a database whose applied-migration version matches the journal's expected version,
**Then** it exits 0 silently,
**And** when it runs against a database whose applied-migration version is older than expected, it exits non-zero with an error message explaining the drift (resolves Architecture §Gap Analysis gap #1).

### Story 1.5: `GET /todos` endpoint with full plugin stack and observability

As an API consumer (the web client, `curl`, or a test),
I want to request `GET /todos` and receive the full ordered list in a documented envelope, with correlation IDs echoed and structured logs on the server,
So that the read path is complete, hardened, and diagnosable before any UI consumes it.

**Acceptance Criteria:**

**Given** `apps/api/src/app.ts` and `apps/api/src/server.ts`,
**When** the server starts,
**Then** `buildApp()` returns a `FastifyInstance` with these plugins registered: `@fastify/env`, `@fastify/sensible`, `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/request-context`, the `db` plugin, and `@fastify/type-provider-zod`,
**And** `@fastify/env` validates presence and shape of `DATABASE_URL`, `PORT`, `LOG_LEVEL`, and `CORS_ORIGIN`,
**And** missing or invalid env vars cause a fail-fast startup error.

**Given** the CORS plugin configuration,
**When** a request arrives from an origin matching `CORS_ORIGIN`,
**Then** it is allowed; from any other origin the preflight is rejected.

**Given** the rate-limit configuration,
**When** the same IP issues more than 100 requests in one minute,
**Then** subsequent requests within that window return `429` with the standard rate-limit envelope.

**Given** an incoming request with an `x-request-id` header,
**When** the request is processed,
**Then** the request-context plugin exposes that ID for the duration of the request,
**And** the response echoes the same `x-request-id` header,
**And** every Pino log line for the request includes `{ requestId, method, path, statusCode, durationMs }`.

**Given** an incoming request with no `x-request-id` header,
**When** the request is processed,
**Then** the plugin generates a UUID and attaches it the same way.

**Given** `GET /todos` with an empty database,
**When** a client issues the request,
**Then** the API responds with `200` and body `{ "todos": [] }`,
**And** the response matches `TodoListResponseSchema`.

**Given** `GET /todos` with three rows in the `todos` table,
**When** a client issues the request,
**Then** the response body is `{ "todos": [...] }` containing all three rows,
**And** the todos are ordered by `created_at` ascending consistently across repeated calls (FR10),
**And** DB column names (`created_at`) are mapped to the wire shape key (`createdAt`).

**Given** a route handler throws an unhandled error,
**When** the global `setErrorHandler` catches it,
**Then** the response is the Fastify-sensible envelope `{ statusCode, error, message }` with status `500`,
**And** a Pino `error`-level log line is written with the full stack and correlation ID.

**Given** `apps/api/test/integration/todos.int.test.ts`,
**When** the test suite runs against an ephemeral Postgres schema,
**Then** it covers: empty list returns `[]`; populated list returns seeded rows ordered by `createdAt`; `x-request-id` is echoed when sent; `x-request-id` is generated when absent,
**And** all assertions pass.

**Given** `apps/api/src/routes/todos.test.ts`,
**When** `node --test` runs,
**Then** handler unit tests using `app.inject()` pass with a stubbed db.

### Story 1.6: `/health` and `/docs` endpoints

As an operator (for `/health`) or an API-curious developer (for `/docs`),
I want a liveness probe that also checks DB reachability and an interactive Swagger UI derived from the Zod schemas,
So that deploy targets can probe liveness and the API is independently explorable (NFR22).

**Acceptance Criteria:**

**Given** `GET /health` with a reachable database,
**When** a client requests it,
**Then** the response is `200 { "status": "ok" }`,
**And** the handler issues a trivial DB probe (e.g., `SELECT 1`) as part of its work.

**Given** `GET /health` with an unreachable database (e.g., `DATABASE_URL` pointing at an invalid host),
**When** a client requests it,
**Then** the response is `503 { "status": "degraded", "checks": { "db": false } }`,
**And** a Pino `warn`-level log line is written describing the probe failure.

**Given** `@fastify/swagger` and `@fastify/swagger-ui` are registered,
**When** the API starts in a non-production environment (e.g., `NODE_ENV !== 'production'` or an explicit `ENABLE_DOCS=true` flag),
**Then** `GET /docs` serves the Swagger UI,
**And** `GET /docs/json` (or equivalent) serves the OpenAPI 3.1 document,
**And** the `GET /todos` and `GET /health` endpoints appear in the spec with response shapes derived from the Zod schemas in `packages/shared`.

**Given** the API starts in production (`NODE_ENV=production` without `ENABLE_DOCS=true`),
**When** a client requests `GET /docs`,
**Then** the response is `404`.

**Given** the generated OpenAPI document,
**When** it is parsed by a validator (e.g., `swagger-parser`),
**Then** it is valid OpenAPI 3.1.

### Story 1.7: Web app shell — layout, page, Tailwind globals, `TodoApp` component

As a first-time visitor,
I want the page to load with a clear title, accessible markup, and a visible container,
So that the app's shape is apparent immediately and the list component has a place to render (even before data arrives).

**Acceptance Criteria:**

**Given** `apps/web/src/app/layout.tsx`,
**When** the app renders,
**Then** the `<html lang="en">` and `<body>` root structure is produced,
**And** metadata sets the `<title>` to "Shared Todos" and a meaningful description,
**And** no `robots: noindex` is set (SEO baseline from PRD §SEO Strategy).

**Given** `apps/web/src/app/page.tsx`,
**When** rendered,
**Then** it mounts a single `<TodoApp />` component,
**And** uses a semantic `<main>` landmark.

**Given** `TodoApp.tsx` in `apps/web/src/components/`,
**When** rendered,
**Then** it is a client component (`"use client"`),
**And** it renders an `<h1>` with "Shared Todos",
**And** it renders a placeholder region where the list will later mount.

**Given** `apps/web/src/app/globals.css`,
**When** Tailwind directives are inspected,
**Then** Tailwind base, components, and utilities are active,
**And** a base rule ensures `:focus-visible` shows a visible focus ring on interactive elements (NFR11),
**And** base text colors meet WCAG AA contrast against the page background (NFR13).

**Given** the page is loaded at 360px viewport width,
**When** rendered,
**Then** content fits without horizontal scroll,
**And** at 1440px width the content is centered with a reasonable max-width container (FR29).

**Given** the page is loaded,
**When** the browser console is inspected,
**Then** no errors or hydration warnings are printed.

### Story 1.8: Typed API client, error types, and load reducer

As the web app,
I want a typed `api.ts` client for the API, an `ApiError` type, and a reducer that tracks load state,
So that the list-rendering component receives todos, errors, and loading transitions without speaking HTTP directly.

**Acceptance Criteria:**

**Given** `apps/web/src/lib/api.ts`,
**When** `getTodos()` is invoked,
**Then** it issues `GET ${NEXT_PUBLIC_API_URL}/todos` with an `x-request-id` header containing a freshly generated UUID,
**And** on `200` it parses the response body with `TodoListResponseSchema.parse` and returns the `todos` array,
**And** on non-OK status it throws an `ApiError` constructed from the server envelope and response headers.

**Given** `apps/web/src/lib/errors.ts`,
**When** `ApiError` is constructed,
**Then** it carries `statusCode: number`, `message: string`, and optional `requestId: string`,
**And** a static `ApiError.fromResponse(response)` reads the server envelope and `x-request-id` header.

**Given** `apps/web/src/lib/reducer.ts`,
**When** the initial state is produced,
**Then** it is `{ status: 'idle', todos: [] }`,
**And** the reducer handles `loadStart` → `{ status: 'loading', todos: [] }`,
**And** `loadSuccess` → `{ status: 'success', todos: [...] }`,
**And** `loadError` → `{ status: 'error', todos: [], error: string, requestId?: string }`.

**Given** the reducer's discriminated-union action types,
**When** TypeScript compiles the switch statement,
**Then** an unhandled action causes a compile-time exhaustiveness error (via a `never` check in the `default` branch).

**Given** `TodoApp.tsx` is mounted,
**When** the component first renders,
**Then** it dispatches `loadStart`, calls `api.getTodos()`, and dispatches `loadSuccess` or `loadError` based on the result.

**Given** the page is visible, hidden, then visible again,
**When** the `visibilitychange` event fires with `document.visibilityState === 'visible'`,
**Then** `TodoApp` refetches todos,
**And** on refetch failure the reducer is NOT transitioned to `error` — the failure is logged only (silent per Architecture §Retry).

**Given** `apps/web/src/lib/reducer.test.ts` and `apps/web/src/lib/api.test.ts`,
**When** they run,
**Then** all reducer transitions are covered including exhaustiveness,
**And** `api.test.ts` covers success, parse-failure (invalid server response), and HTTP error paths using a mocked `fetch`.

### Story 1.9: Render list states — loading, empty, populated (read-only)

As a visitor,
I want to see a clear loading indicator while the list fetches, an empty-state message when no todos exist, or the full list when todos are present,
So that I always have an unambiguous visual answer about what the app is doing (FR8, FR11, FR12).

**Acceptance Criteria:**

**Given** `TodoList.tsx`,
**When** passed `state.status === 'loading'`,
**Then** it renders a loading indicator ("Loading todos…" or equivalent) within an `aria-live="polite"` region.

**Given** `TodoList.tsx`,
**When** passed `state.status === 'success'` and `state.todos.length === 0`,
**Then** it renders an empty-state message ("No todos yet") with semantic markup (not visually hidden from assistive tech).

**Given** `TodoList.tsx`,
**When** passed `state.status === 'success'` and `state.todos.length > 0`,
**Then** it renders a `<ul>` containing one `<li>` per todo via the `<TodoItem>` component,
**And** each `<li>` has a stable `key={todo.id}`.

**Given** `TodoItem.tsx`,
**When** passed a todo with `completed: false`,
**Then** it renders the todo text in the default visual treatment,
**And** text contrast meets WCAG AA against the background.

**Given** `TodoItem.tsx`,
**When** passed a todo with `completed: true`,
**Then** it renders the todo text with a strikethrough visual treatment,
**And** the component is read-only in Epic 1 (no click handlers, no toggle, no delete — those arrive in Epic 2).

**Given** the app is in `state.status === 'error'`,
**When** `TodoList.tsx` renders,
**Then** it shows a minimal fallback error message ("Failed to load todos"),
**And** this fallback is explicitly documented as a placeholder that Epic 3 replaces with the Toast-based error system.

**Given** the page is viewed at 360px and 1440px widths with a populated list,
**When** rendered,
**Then** items wrap inside the container without horizontal scroll.

**Given** `TodoList.test.tsx` and `TodoItem.test.tsx`,
**When** tests run via Vitest + React Testing Library (Architecture §Gap Analysis recommended resolution),
**Then** loading, empty, populated, active-visual, and completed-visual renderings are all covered,
**And** each test asserts no console errors.

### Story 1.10: Single-command local dev orchestration

As a developer new to the project,
I want to run `npm install && npm run dev` from the root and get the full stack running,
So that NFR20 is satisfied — no README gymnastics, no multi-terminal choreography.

**Acceptance Criteria:**

**Given** the root `package.json`,
**When** inspected,
**Then** it defines scripts `"dev": "bash scripts/dev.sh"`, `"dev:web": "npm --workspace apps/web run dev"`, and `"dev:api": "npm --workspace apps/api run dev"`,
**And** includes `npm-run-all` (or `concurrently`) as a root devDependency.

**Given** `scripts/dev.sh`,
**When** executed,
**Then** it runs these steps in order, failing the whole command on any non-zero exit: (1) `docker compose up -d db`, (2) wait for DB healthcheck, (3) `npm --workspace apps/api run db:migrate`, (4) `npm-run-all --parallel dev:web dev:api`.

**Given** a clean repo, a `.env` copied from `.env.example`, and Docker running,
**When** a developer runs `npm install && npm run dev`,
**Then** the DB starts, migrations run, `next dev` binds on `:3000`, and the Fastify server binds on `:4000` (or the configured `PORT`),
**And** both log their readiness to stdout.

**Given** the dev stack is running,
**When** the developer stops it with Ctrl+C and immediately runs `npm run dev` again,
**Then** the command succeeds without error (docker up is a no-op; migrations are idempotent).

**Given** `README.md` at the repo root,
**When** its "Quick Start" section is read,
**Then** it lists: prerequisites (Node 22, Docker), clone, `npm install`, `cp .env.example .env`, `npm run dev`, open `http://localhost:3000`,
**And** mentions the API port and `/docs` availability in dev.

### Story 1.11: Build and deployment artifacts

As a deployer (or CI pipeline),
I want production Docker images, a reference production compose file, and a CI workflow that lints/tests/builds on every PR,
So that the app can be deployed to any container target and code drift is caught before merge.

**Acceptance Criteria:**

**Given** `apps/web/Dockerfile`,
**When** built with `docker build -f apps/web/Dockerfile .` from the repo root,
**Then** the build succeeds in multi-stage form (deps → build → runtime),
**And** the runtime stage uses Node 22 alpine, runs as a non-root user, respects `PORT` env, and binds `HOSTNAME=0.0.0.0`.

**Given** `apps/api/Dockerfile`,
**When** built with `docker build -f apps/api/Dockerfile .` from the repo root,
**Then** the build succeeds in multi-stage form with a non-root runtime user,
**And** `PORT` is env-driven,
**And** the runtime entrypoint launches the compiled Fastify server.

**Given** `docker-compose.production.yml` at the repo root,
**When** inspected,
**Then** it declares `web`, `api`, and `db` services with env placeholders and a named volume for DB data,
**And** serves as a runnable reference deployment (no platform-specific assumptions).

**Given** `.github/workflows/ci.yml`,
**When** a pull request is opened,
**Then** the CI job runs: checkout, setup-node 22, `npm ci`, root `npm run lint`, `npm run typecheck` (`tsc --noEmit` across workspaces), `npm run test` (all workspace tests), `docker build` for both images,
**And** any failing step marks the PR check as failed.

**Given** a push to the `main` branch,
**When** the CI workflow runs,
**Then** in addition to the PR checks, both Docker images are published to `ghcr.io/{owner}/todo-app-web` and `ghcr.io/{owner}/todo-app-api` using `GITHUB_TOKEN`,
**And** no auto-deploy step runs.

**Given** the README,
**When** the "Deployment" section is read,
**Then** it documents that `drizzle-kit migrate` must run as a one-shot command before deploying new API images, that the API fails fast if the schema is behind, and which env vars are required in production (resolves Architecture §Gap Analysis gap #3).

## Epic 2: Todo Core Loop — Create, Complete, Delete

A user can add a new todo by typing and pressing Enter, mark any todo as completed (or un-complete it), and delete any todo. Mutations respond instantly via optimistic UI, completion state is visually unambiguous (and accessible to assistive tech), and concurrent edits from multiple users resolve deterministically. Ships the full core product loop.

### Story 2.1: `POST /todos` endpoint

As an API consumer,
I want to POST a JSON body with a todo text and receive back a complete todo entity,
So that clients can create new todos in the shared list (FR23, FR5, FR6, FR7).

**Acceptance Criteria:**

**Given** `POST /todos` with body `{ "text": "buy milk" }`,
**When** a client issues the request,
**Then** the response is `201` with a body matching `TodoSchema` — `{ id: <uuid>, text: "buy milk", completed: false, createdAt: <iso-8601> }`,
**And** the `id` is newly generated by `gen_random_uuid()` (different on every call),
**And** the `createdAt` is server-assigned (not trustable from client input).

**Given** `POST /todos` with body `{ "text": "  buy milk  " }`,
**When** a client issues the request,
**Then** the stored row's `text` is `"buy milk"` (trimmed by the Zod schema).

**Given** `POST /todos` with body `{ "text": "" }` or `{ "text": "x".repeat(501) }`,
**When** a client issues the request,
**Then** the response is `400` with the Fastify-sensible validation envelope,
**And** no row is inserted.

**Given** `POST /todos` with body `{ "text": "x", "completed": true }`,
**When** a client issues the request,
**Then** the response is `400` because `CreateTodoRequestSchema.strict()` rejects unknown fields.

**Given** `POST /todos` with a body larger than 4 KB,
**When** a client issues the request,
**Then** the response is `413` (Fastify `bodyLimit` enforcement per NFR18).

**Given** the API is running with `/docs` enabled,
**When** a developer inspects the OpenAPI spec,
**Then** `POST /todos` is documented with request + response shapes derived from the Zod schemas.

**Given** `apps/api/test/integration/todos.int.test.ts`,
**When** the suite runs,
**Then** it covers: happy path, trim behavior, empty rejection, max-length rejection, unknown-field rejection, oversized-body rejection,
**And** all assertions pass.

### Story 2.2: `PATCH /todos/:id` endpoint with LWW semantics

As an API consumer,
I want to PATCH a todo by ID with `{ completed: boolean }` and receive the updated entity,
So that clients can toggle completion state (FR24) with explicit last-write-wins concurrency semantics (FR15, NFR6).

**Acceptance Criteria:**

**Given** `PATCH /todos/:id` with body `{ "completed": true }` on an existing todo,
**When** a client issues the request,
**Then** the response is `200` with the updated entity (matching `TodoSchema`),
**And** the row's `completed` column is now `true`,
**And** the response body maps `created_at` → `createdAt` on the wire.

**Given** `PATCH /todos/:id` with body `{ "completed": false }` on an already-completed todo,
**When** a client issues the request,
**Then** the response is `200` and the row's `completed` is now `false`.

**Given** `PATCH /todos/:id` where `:id` is a valid UUID but no row with that id exists,
**When** a client issues the request,
**Then** the response is `404` with the Fastify-sensible envelope.

**Given** `PATCH /todos/:id` where `:id` is not a valid UUID,
**When** a client issues the request,
**Then** the response is `400` via Zod path-param validation.

**Given** `PATCH /todos/:id` with an empty body, a missing `completed` field, or an unknown field like `{ "text": "...", "completed": true }`,
**When** a client issues the request,
**Then** the response is `400` due to `UpdateTodoRequestSchema.strict()` (resolves FR24, NFR16, NFR18).

**Given** two concurrent `PATCH /todos/:id` requests from different clients with different `completed` values,
**When** they are applied,
**Then** both respond `200`,
**And** the final DB row reflects whichever write landed last (LWW),
**And** no row corruption, deadlock, or lost update occurs (NFR6),
**And** there is no `If-Match` / ETag / `updated_at`-comparison mechanism in the handler or contract.

**Given** the integration test suite at `apps/api/test/integration/concurrency.int.test.ts`,
**When** it runs,
**Then** it contains a test that issues two concurrent `PATCH` operations with opposite `completed` values against the same row, waits for both to resolve, then asserts one value won and no error was raised.

**Given** the OpenAPI spec,
**When** the `PATCH /todos/:id` entry is inspected,
**Then** its description explicitly states: "Concurrency semantics are last-write-wins; no `If-Match` or ETag is supported."

### Story 2.3: `DELETE /todos/:id` endpoint

As an API consumer,
I want to DELETE a todo by ID,
So that clients can remove any todo from the shared list (FR25).

**Acceptance Criteria:**

**Given** `DELETE /todos/:id` on an existing todo,
**When** a client issues the request,
**Then** the response is `204` with an empty body,
**And** the row is removed from the `todos` table.

**Given** `DELETE /todos/:id` where `:id` is a valid UUID but no row exists (already deleted or never created),
**When** a client issues the request,
**Then** the response is `404` with the Fastify-sensible envelope.

**Given** `DELETE /todos/:id` where `:id` is not a valid UUID,
**When** a client issues the request,
**Then** the response is `400` via Zod path-param validation.

**Given** two concurrent `DELETE /todos/:id` requests against the same existing row,
**When** they are processed,
**Then** one returns `204` and the other returns `404`,
**And** the row is removed exactly once (no corruption, no error).

**Given** the OpenAPI spec,
**When** the `DELETE /todos/:id` entry is inspected,
**Then** it documents the `204` success, `404`-on-missing, and `400`-on-bad-UUID shapes.

**Given** `apps/api/test/integration/todos.int.test.ts`,
**When** the suite runs,
**Then** it covers: happy path, 404 on missing, 400 on bad UUID, and concurrent-delete safety.

### Story 2.4: Reducer extensions for optimistic mutations

As the web app,
I want reducer actions that apply mutations optimistically, reconcile with server responses for create, and roll back on failure for toggle/delete,
So that the UI can respond in ≤100 ms (NFR1) while preserving correctness on failure.

**Acceptance Criteria:**

**Given** `apps/web/src/lib/reducer.ts`,
**When** the action union type is inspected,
**Then** it includes (in addition to load actions): `addOptimistic`, `addReconcile`, `addFailed`, `toggleOptimistic`, `toggleFailed`, `deleteOptimistic`, `deleteFailed`.

**Given** state `{ status: 'success', todos: [] }` and action `addOptimistic({ tempId: 't-1', text: 'milk', createdAt: <iso> })`,
**When** the reducer is called,
**Then** new state is `{ status: 'success', todos: [{ id: 't-1', text: 'milk', completed: false, createdAt: <iso>, pending: true }] }`.

**Given** state containing a todo with `id === 't-1'` and `pending: true`,
**When** action `addReconcile({ tempId: 't-1', todo: <server todo with id s-99> })` is dispatched,
**Then** the tempId entry is replaced with the server todo (no `pending` flag on the reconciled entry).

**Given** state containing a todo with `id === 't-1'`,
**When** action `addFailed({ tempId: 't-1' })` is dispatched,
**Then** that entry is removed from state.

**Given** state containing a todo `{ id: 'x', completed: false, ... }`,
**When** action `toggleOptimistic({ id: 'x', completed: true })` is dispatched,
**Then** that todo's `completed` is `true` in new state.

**Given** a prior `toggleOptimistic({ id: 'x', completed: true })` has been applied,
**When** action `toggleFailed({ id: 'x', previousCompleted: false })` is dispatched,
**Then** `completed` reverts to `false`.

**Given** state containing a todo with `id === 'y'`,
**When** action `deleteOptimistic({ id: 'y' })` is dispatched,
**Then** that todo is removed from state.

**Given** a prior `deleteOptimistic({ id: 'y' })` has removed a todo,
**When** action `deleteFailed({ todo: <originalTodo>, index: <originalIndex> })` is dispatched,
**Then** the stashed todo is re-inserted at its original index.

**Given** the reducer's discriminated-union switch,
**When** TypeScript compiles it,
**Then** adding a new action type without a case causes a compile-time exhaustiveness error (via `never` check in `default`).

**Given** the reducer is called with any of the new actions,
**When** inspected,
**Then** it performs no side effects (no `Date.now()`, no `crypto.randomUUID()`, no `fetch`) — all time/id values arrive via action payloads.

**Given** `apps/web/src/lib/reducer.test.ts`,
**When** the test suite runs,
**Then** all seven new action transitions are covered, plus a test that verifies a `pending: true` todo is visually indistinguishable in shape from a reconciled one except for the flag.

### Story 2.5: Create todo via `TodoInput` (full vertical slice)

As a user,
I want to type a todo into an input, press Enter (or click submit), and see it appear in the list instantly,
So that I can add to the shared list with perceptibly zero latency (FR1, FR17, NFR1).

**Acceptance Criteria:**

**Given** `apps/web/src/lib/api.ts`,
**When** `createTodo(text: string): Promise<Todo>` is invoked,
**Then** it issues `POST ${NEXT_PUBLIC_API_URL}/todos` with body `{ text }`, `content-type: application/json`, and a freshly generated `x-request-id` header,
**And** on `201` it parses the response with `TodoSchema.parse` and returns it,
**And** on non-OK status it throws `ApiError.fromResponse(response)`.

**Given** `apps/web/src/components/TodoInput.tsx`,
**When** it renders,
**Then** it is a controlled form containing a labeled text input and a submit button,
**And** the input has an accessible label (visible or `sr-only`),
**And** the submit button is `disabled` when the input's trimmed value is empty,
**And** no `maxLength` attribute is set on the input (server is the length authority — no client duplication per Architecture §Validation Timing).

**Given** a user types "buy milk" and presses Enter (or clicks submit),
**When** the form fires its submit event,
**Then** the component generates a temp UUID via `crypto.randomUUID()`,
**And** dispatches `addOptimistic({ tempId, text: "buy milk", createdAt: new Date().toISOString() })`,
**And** clears the input immediately (optimistic — Epic 3 will extend with input preservation on failure per FR19),
**And** calls `api.createTodo("buy milk")`.

**Given** `api.createTodo` resolves with a server todo,
**When** the promise resolves,
**Then** the component dispatches `addReconcile({ tempId, todo: <serverTodo> })`.

**Given** `api.createTodo` rejects with any error,
**When** the promise rejects,
**Then** the component dispatches `addFailed({ tempId })`,
**And** no error is surfaced to the user in Epic 2 beyond the optimistic entry disappearing (Toast-based error messaging lands in Epic 3).

**Given** a user enters text containing HTML like `<script>alert(1)</script>`,
**When** the item renders in the list,
**Then** it displays as literal text (React default JSX escaping) and does NOT execute any script (NFR17).

**Given** `TodoInput.test.tsx` and updates to `TodoApp.test.tsx`,
**When** Vitest + React Testing Library runs,
**Then** tests cover: submit-disabled-on-empty; happy path from type → Enter → optimistic entry visible → server resolves → entry remains; rollback path from server 500 → optimistic entry removed; XSS-as-text rendering.

### Story 2.6: Toggle completion via Radix Checkbox

As a user,
I want to click a checkbox next to any todo to mark it completed (or un-complete it), with unambiguous visual and assistive-tech state,
So that I can update the shared list's progress instantly (FR2, FR3, FR9, FR32, NFR12).

**Acceptance Criteria:**

**Given** `apps/web/src/lib/api.ts`,
**When** `updateTodo(id: string, completed: boolean): Promise<Todo>` is invoked,
**Then** it issues `PATCH ${NEXT_PUBLIC_API_URL}/todos/${id}` with body `{ completed }`, `content-type: application/json`, and an `x-request-id` header,
**And** on `200` parses the response with `TodoSchema.parse`,
**And** on non-OK throws `ApiError.fromResponse`.

**Given** `<TodoItem>` extended with Radix UI's `Checkbox` primitive,
**When** rendered for a todo with `completed: false`,
**Then** the checkbox has `aria-checked="false"`,
**And** the todo text renders without strikethrough.

**Given** `<TodoItem>` for a todo with `completed: true`,
**When** rendered,
**Then** `aria-checked="true"`,
**And** the text renders with strikethrough (CSS `text-decoration: line-through`),
**And** state is communicated via both the ARIA attribute AND the strikethrough (non-color state per FR32 / NFR12).

**Given** the checkbox is rendered,
**When** inspected for accessibility,
**Then** it is associated with a label containing the todo text (e.g., via `aria-labelledby` or wrapping label),
**And** the entire clickable area — checkbox plus its tap target — is at least 44 × 44 CSS pixels (NFR14),
**And** a visible focus ring appears on `:focus-visible`.

**Given** a user clicks a checkbox (or presses Space with keyboard focus),
**When** the Radix `onCheckedChange` handler fires,
**Then** the component dispatches `toggleOptimistic({ id, completed: newValue })`,
**And** calls `api.updateTodo(id, newValue)`,
**And** on rejection dispatches `toggleFailed({ id, previousCompleted: !newValue })`.

**Given** a todo with `pending: true` (optimistically created, awaiting server reconcile),
**When** `<TodoItem>` renders it,
**Then** the checkbox is `disabled` (cannot PATCH against a temp ID),
**And** the visual disabled-state is rendered per Radix defaults.

**Given** `TodoItem.test.tsx`,
**When** Vitest + RTL runs,
**Then** tests cover: initial render reflects `completed` value; clicking toggles it immediately (optimistic); server rejection reverts it; screen-reader announcement of `aria-checked` state change; keyboard-toggle with Space key; disabled state while pending.

### Story 2.7: Delete todo via delete button

As a user,
I want to click a delete button next to any todo (active or completed) to remove it from the shared list,
So that the list can be tidied without reloading (FR4, FR17).

**Acceptance Criteria:**

**Given** `apps/web/src/lib/api.ts`,
**When** `deleteTodo(id: string): Promise<void>` is invoked,
**Then** it issues `DELETE ${NEXT_PUBLIC_API_URL}/todos/${id}` with an `x-request-id` header,
**And** on `204` resolves with `undefined`,
**And** on non-OK throws `ApiError.fromResponse`.

**Given** `<TodoItem>` extended with a delete button,
**When** rendered,
**Then** the button is a native `<button type="button">` with `aria-label="Delete: [todo text]"`,
**And** its tap target is at least 44 × 44 CSS pixels (NFR14),
**And** a visible focus ring appears on `:focus-visible`,
**And** visual contrast meets WCAG AA.

**Given** a user clicks the delete button,
**When** the click handler fires,
**Then** the component captures the original todo and its current index in state,
**And** dispatches `deleteOptimistic({ id })` (removes the todo from the visible list),
**And** calls `api.deleteTodo(id)`.

**Given** `api.deleteTodo` resolves successfully,
**When** the promise resolves,
**Then** no further action dispatches (the optimistic removal is now authoritative).

**Given** `api.deleteTodo` rejects,
**When** the promise rejects,
**Then** the component dispatches `deleteFailed({ todo: <stashed original>, index: <captured index> })`,
**And** the item re-appears at its prior position.

**Given** a todo with `pending: true` (optimistically created, awaiting reconcile),
**When** `<TodoItem>` renders it,
**Then** the delete button is `disabled` (cannot DELETE a temp ID),
**And** the visual disabled-state is rendered.

**Given** both active and completed todos exist in the list,
**When** the user clicks delete on either one,
**Then** the delete behaves identically regardless of completion state (FR4 — no state-dependent deletion rules).

**Given** `TodoItem.test.tsx`,
**When** Vitest + RTL runs,
**Then** tests cover: click deletes optimistically; server success keeps it deleted; server 500 re-inserts at the original position; delete works on completed todos; keyboard activation (Enter or Space on button); disabled state while pending.

## Epic 3: Failure Resilience & Recovery

When something goes wrong (offline, server 5xx, timeout), the user sees a clear non-technical error, their typed input is preserved, and they can retry without losing list state or refreshing. The system surfaces every failure — nothing drops silently — and operators can diagnose failures from correlated server logs.

### Story 3.1: Toast infrastructure (Radix Toast + reducer slice)

As the web app,
I want a single Toast surface with a reducer slice and dismiss action,
So that every mutation handler and safety-net handler can surface a user-visible error through one consistent pattern.

**Acceptance Criteria:**

**Given** `apps/web/src/components/Toast.tsx`,
**When** the component renders,
**Then** it wraps Radix UI's `Toast.Provider`, `Toast.Root`, `Toast.Description`, and `Toast.Viewport` primitives,
**And** `Toast.Root` is controlled by `state.toast` from the reducer,
**And** the root is rendered only when `state.toast !== null`.

**Given** the reducer,
**When** its state shape is inspected,
**Then** it contains a new slice `toast: { message: string, id: string } | null` (default `null`),
**And** two new actions exist: `errorShown({ message: string })` sets `state.toast = { message, id: <crypto.randomUUID()> }`,
**And** `errorDismiss` sets `state.toast = null`,
**And** the exhaustiveness check in the reducer's `default` branch still holds.

**Given** the Toast is visible,
**When** the user clicks its dismiss button (labeled `aria-label="Dismiss"`) or presses Escape,
**Then** the reducer dispatches `errorDismiss`,
**And** the Toast is removed from the DOM.

**Given** a Toast has rendered,
**When** the Radix-provided `duration` (e.g., 5000ms) elapses,
**Then** the Radix `onOpenChange(false)` callback dispatches `errorDismiss`,
**And** the Toast is removed.

**Given** `<Toast.Viewport>` is inserted in the tree,
**When** inspected for accessibility,
**Then** it has `aria-live="polite"` and `role="region"` via Radix defaults,
**And** the Toast message is announced to assistive technology without stealing focus.

**Given** `<Toast>` is rendered inside `<TodoApp>` (or `app/layout.tsx`),
**When** the user reloads the app,
**Then** no Toast shows on load (state starts `null`).

**Given** `Toast.test.tsx` and updated `reducer.test.ts`,
**When** Vitest + RTL runs,
**Then** tests cover: `errorShown` → Toast renders with message; click dismiss → Toast unmounts; auto-dismiss after duration → Toast unmounts; `aria-live` region is present.

### Story 3.2: Mutation failure toasts with user-facing error messages

As a user,
I want a clear, non-technical message when a mutation fails,
So that I know what happened and what to do next without seeing stack traces or server-side jargon (FR18, FR21).

**Acceptance Criteria:**

**Given** `apps/web/src/lib/errors.ts`,
**When** `ApiError.fromResponse(response)` is invoked,
**Then** it returns an `ApiError` whose `.message` is a human-readable string derived from the status code and response body, not a raw server envelope,
**And** the mapping is: network failure → "You're offline. Your change wasn't saved."; `400` → "That change couldn't be saved."; `404` → "This todo no longer exists."; `429` → "Too many requests — please wait a moment."; `5xx` or unknown → "Something went wrong. Please try again.",
**And** `.statusCode` and `.requestId` remain populated for diagnostics (not shown to the user).

**Given** `api.ts` mutation calls (`createTodo`, `updateTodo`, `deleteTodo`) throw `ApiError`,
**When** a mutation handler in `TodoApp` catches the error,
**Then** after dispatching the corresponding `{intent}Failed` action, it dispatches `errorShown({ message: error.message })`.

**Given** two mutations fail in rapid succession,
**When** the reducer processes both `errorShown` actions,
**Then** `state.toast` reflects only the most recent message,
**And** the Toast visually updates to show the latest message (single-toast model).

**Given** a mutation succeeds,
**When** it completes,
**Then** no Toast is shown,
**And** any currently-displayed failure Toast is NOT auto-dismissed by the success (it continues to honor its own duration or user dismissal).

**Given** any mutation failure flow,
**When** the Toast renders,
**Then** the Toast text contains NO part of a raw server envelope, no status code digits, no stack trace, and no URL,
**And** its content is readable by a non-technical user.

**Given** `ApiError.requestId` is populated from the response `x-request-id` header,
**When** the failure is processed,
**Then** the requestId is logged at the client console `debug` level only,
**And** never rendered in the Toast.

**Given** `api.test.ts` and mutation handler tests in `TodoApp.test.tsx`,
**When** Vitest runs,
**Then** tests cover each error mapping (network, 400, 404, 429, 500) produces the correct user-facing message,
**And** no raw server messages leak into the Toast.

### Story 3.3: Preserve `TodoInput` text on add failure (FR19)

As a user whose add failed,
I want my typed text to stay (or return) in the input,
So that I can retry with a single Enter press without retyping (FR19, FR20).

**Acceptance Criteria:**

**Given** `<TodoInput>` as shipped in Story 2.5 (clears on submit),
**When** its behavior is updated,
**Then** on form submit the component captures the text value,
**And** clears the input optimistically (preserving the submit pattern),
**And** on `addReconcile` no further input action is needed (input stays cleared),
**And** on `addFailed` the captured text is restored into the input.

**Given** a user types "buy milk" and submits, then the server returns `500`,
**When** `addFailed` is dispatched,
**Then** the input value re-appears as "buy milk",
**And** the optimistic list entry is removed (per Story 2.4),
**And** a Toast appears with the failure message (per Story 3.2).

**Given** the input text is restored after a failure,
**When** the user presses Enter (or clicks submit) again with the restored text,
**Then** a fresh submit cycle begins normally (new tempId, new `addOptimistic`, new `createTodo` call).

**Given** multiple add submissions are in flight simultaneously (user submitted text A, then quickly text B),
**When** A fails and B succeeds,
**Then** A's restoration does NOT overwrite B's in-progress or current input content,
**And** no double-submission occurs from a single click.

**Given** the user focuses away from the input before a failure,
**When** the input is restored,
**Then** the restored text is visible even if the input is not focused,
**And** focus behavior remains predictable (does NOT steal focus on restore).

**Given** `TodoInput.test.tsx`,
**When** tests run,
**Then** coverage includes: success path (input clears on reconcile); failure path (input restored on `addFailed`); retry succeeds after restore; two-fire submissions where one fails and one succeeds maintain correct input state.

### Story 3.4: Initial-load error recovery with retry button (FR20)

As a visitor arriving when the initial list fetch fails,
I want a clearly visible error UI with a retry button,
So that I can recover without refreshing the page (FR20, NFR8).

**Acceptance Criteria:**

**Given** `TodoList.tsx` with `state.status === 'error'` branch,
**When** it renders,
**Then** the Epic 1 placeholder fallback is replaced with a real recovery UI containing: a non-technical heading ("Couldn't load todos"), an optional subtext with `state.error` for diagnostics, and a visible `<button type="button">Retry</button>`.

**Given** the retry button,
**When** inspected for accessibility,
**Then** it has a visible focus ring on `:focus-visible`,
**And** its tap target is ≥44×44 CSS pixels (NFR14),
**And** text contrast meets WCAG AA.

**Given** a user clicks Retry,
**When** the click handler runs,
**Then** the reducer dispatches `loadStart`,
**And** `api.getTodos()` is invoked,
**And** the UI transitions to the `loading` state (which in turn replaces the error UI with the loading indicator).

**Given** retry succeeds,
**When** `api.getTodos()` resolves,
**Then** `loadSuccess` is dispatched and the populated list renders normally.

**Given** retry fails again,
**When** `api.getTodos()` rejects,
**Then** `loadError` is dispatched and the error UI reappears,
**And** no Toast is shown (initial-load errors are surfaced inline, not via Toast).

**Given** the initial-load error UI,
**When** inspected after implementation,
**Then** the explicit "placeholder for Epic 3" comment from Story 1.9's implementation is removed.

**Given** `TodoList.test.tsx`,
**When** tests run,
**Then** coverage includes: error state renders heading + button; click Retry transitions through loading to success (mocked); click Retry fails and error UI reappears; Retry is keyboard-activatable (Enter).

### Story 3.5: Global unhandled-rejection and error safety net (NFR9)

As an operator,
I want a top-level handler that catches unhandled promise rejections and uncaught runtime errors and surfaces them as a generic Toast,
So that NFR9 is satisfied — no silent failures, no stuck UI states, even for paths we didn't explicitly guard.

**Acceptance Criteria:**

**Given** `<TodoApp>`,
**When** it mounts,
**Then** a `useEffect` registers `window.addEventListener('unhandledrejection', handler)` AND `window.addEventListener('error', handler)`,
**And** the same `useEffect` returns a cleanup that removes both listeners on unmount.

**Given** an unhandled promise rejection fires,
**When** the handler runs,
**Then** it dispatches `errorShown({ message: "Something went wrong. Please try again." })` via the reducer,
**And** it logs the rejection reason to `console.error` with a tag for devtools diagnostics,
**And** calls `event.preventDefault()` so the default browser warning is suppressed.

**Given** a synchronous uncaught exception fires (`window.error`),
**When** the handler runs,
**Then** the same Toast + log behavior occurs.

**Given** a mutation failure that IS caught by a try/catch in a handler (e.g., `api.createTodo` rejecting, handled per Story 3.2),
**When** it is processed,
**Then** it does NOT reach the unhandled-rejection handler (because it was caught and dispatched through the normal failure path).

**Given** React StrictMode double-mounts components in development,
**When** `<TodoApp>` mounts twice,
**Then** the event listeners are still registered and removed correctly (no duplicate handlers, no duplicate Toasts for a single event).

**Given** `TodoApp.test.tsx`,
**When** tests run,
**Then** coverage includes: firing `window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {...}))` → asserts Toast with generic message; firing an `error` event → same Toast; component unmount removes the listeners; caught mutation failures (from Story 3.2) do NOT trigger this path.

### Story 3.6: Journey-level resilience tests for the three PRD user journeys

As a reviewer of the v1 product,
I want automated component tests that walk through the three PRD user journeys including failure and recovery,
So that NFR23's "critical paths including the three documented user journeys" is demonstrably satisfied.

**Acceptance Criteria:**

**Given** `apps/web/src/components/TodoApp.test.tsx`,
**When** inspected,
**Then** it contains three named test groups corresponding to PRD Journey 1, 2, and 3.

**Given** the Journey 1 group ("First-Time Use"),
**When** the test runs,
**Then** it mounts `<TodoApp>` with an empty-list API response,
**And** asserts loading state → empty state,
**And** types a todo, presses Enter,
**And** asserts the optimistic entry appears,
**And** asserts it is reconciled when the mock API resolves with a server todo,
**And** no console errors occur during the test.

**Given** the Journey 2 group ("Returning Session"),
**When** the test runs,
**Then** it mounts `<TodoApp>` with a seeded populated list (mix of active and completed),
**And** asserts all items render with correct visual state (strikethrough where appropriate),
**And** deletes a completed item and asserts removal + DELETE call,
**And** toggles an active item to completed and asserts visual + `aria-checked` state change.

**Given** the Journey 3 group ("Failure & Recovery"),
**When** the test runs,
**Then** it covers — at minimum — these sub-cases using MSW (or fetch mocks):

**And (Sub-case A, offline add):**
**Given** the user types and submits,
**When** the API mock returns a network/fetch failure,
**Then** the optimistic entry is removed, the input text is restored (FR19), and a Toast is visible with the offline message.

**And (Sub-case B, 500 on toggle):**
**Given** the user clicks a checkbox,
**When** the API mock returns `500`,
**Then** the checkbox state reverts and a Toast is visible with a generic error message.

**And (Sub-case C, 500 on delete):**
**Given** the user clicks delete,
**When** the API mock returns `500`,
**Then** the item is re-inserted at its original position and a Toast is visible.

**And (Sub-case D, retry after offline add):**
**Given** Sub-case A has just occurred,
**When** the API mock is switched back to success and the user presses Enter on the restored text,
**Then** a fresh optimistic add succeeds and is reconciled normally,
**And** no duplicate Toast appears (the old one remains or was dismissed; a new successful add does not create a new toast).

**And (Sub-case E, initial load failure + retry):**
**Given** `api.getTodos` is mocked to return `500` on first call,
**When** the app loads and the user clicks Retry,
**Then** the second call resolves successfully and the populated list renders.

**Given** the Journey 3 group,
**When** timing is measured,
**Then** no test depends on `setTimeout`-based sleeps; all async waits use RTL's `findBy*`, `waitFor`, or explicit promise resolutions,
**And** the full Journey 3 group completes in under 10 seconds locally.

**Given** all three journey groups,
**When** the full test suite runs,
**Then** every test passes,
**And** test output is readable (test names describe the journey step being verified).
