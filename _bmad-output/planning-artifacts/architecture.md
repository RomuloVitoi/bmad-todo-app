---
stepsCompleted:
  - step-01-init
  - step-02-context
  - step-03-starter
  - step-04-decisions
  - step-05-patterns
  - step-06-structure
  - step-07-validation
  - step-08-complete
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
workflowType: 'architecture'
project_name: 'todo-app'
user_name: 'Romulo'
date: '2026-04-19'
lastStep: 8
status: 'complete'
completedAt: '2026-04-19'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

33 FRs organized into six cohesive groups with no cross-group coupling beyond a single shared entity (Todo):

- _Task Management (FR1–FR7):_ CRUD over a single entity; id + text + completion state + creation time. No editing of text beyond create in v1 — a deliberate narrowing.
- _List Presentation (FR8–FR12):_ list-first rendering, unambiguous active/completed styling, consistent ordering, first-class empty/loading states. Implies the list itself is the app's one view — no routing required.
- _State & Persistence (FR13–FR16):_ server is the single source of truth; last-write-wins reconciliation; client state reconciles against server on every fetch. Rules out client-authoritative or CRDT approaches.
- _Feedback & Error Handling (FR17–FR21):_ optimistic mutations with explicit failure surfaces; no silent drops; user-initiated retry preserves input.
- _API Surface (FR22–FR28):_ documented shapes, distinct 4xx vs 5xx semantics, independently testable — the API is a first-class deliverable, not an implementation detail of the UI.
- _Responsive & Accessible Delivery (FR29–FR33):_ one codebase across form factors; keyboard-complete; semantic markup carries state (not color).

**Non-Functional Requirements:**

The NFRs constrain the stack more than the FRs do:

- _Performance:_ ≤100 ms perceived UI (NFR1) forces optimistic UI; ≤300 ms p95 server (NFR2), <2 s TTI / <5 s on 3G (NFR3), ≤200 KB gzipped initial JS (NFR4) — together, these rule out heavy framework + bundler defaults and steer toward a lean SPA runtime.
- _Reliability:_ durability across server restarts (NFR5) rules out in-memory-only stores; last-write-wins integrity at the server (NFR6); no silent failures (NFR7); transient-failure recovery without refresh (NFR8).
- _Accessibility:_ WCAG 2.1 AA on core flows (NFR10–14) is a first-class constraint, not a late-stage polish pass.
- _Security:_ HTTPS in deployed envs; server-side input validation and output escaping; bounded input size; no auth in v1 is **explicit** (NFR19), not an omission.
- _Maintainability:_ single-command local run (NFR20), readable in one sitting (NFR21), API documented independently (NFR22), critical-path test coverage (NFR23), diagnosable server logs (NFR24).

**Scale & Complexity:**

- Primary domain: full-stack web (SPA client + small REST API + durable store)
- Complexity level: low — one entity, four mutations, no real-time, no auth, no multi-tenancy
- Estimated architectural components: **four** — (1) SPA client, (2) HTTP API, (3) persistence layer, (4) shared type/contract surface between them

### Technical Constraints & Dependencies

- **Stack selection is open but constrained**: the PRD's "prefer boring, idiomatic tooling, small dependency footprint" language (Risk Mitigation §Technical) plus the ≤200 KB bundle cap narrows the design space materially.
- **Deployment target is open** — architecture must remain deployable on bare Node, a container, a serverless platform, or a PaaS without structural change.
- **Single-command local run** (NFR20) pushes toward either a monorepo or a single-repo workspace with coordinated dev tooling (e.g., `npm run dev` starting both tiers).
- **API independence** (FR28, NFR22) means the contract must be exercisable with `curl` / a test runner without the UI present — no implicit coupling via session, cookies, or client-rendered state.
- **No real-time layer in v1**, but the API shape must not preclude adding polling / SSE / WebSockets later (PRD §Real-Time).
- **No auth in v1**, but the data model must not hard-preclude adding an owner/user foreign key later (PRD Classification notes).

### Cross-Cutting Concerns Identified

- **Optimistic UI ↔ server reconciliation** — every mutation is a two-phase operation (apply locally, confirm/revert on server response); error shapes and client state management must be designed together, not separately.
- **Accessibility** — semantic markup and ARIA state must be decided at component-design time; retrofitting AA compliance is always more expensive than building for it.
- **Input validation & XSS prevention** — server-side bounds (NFR18) and output escaping (NFR17) are the only defenses; both client and server must treat rendered todo text as untrusted.
- **Error surfacing & logging** — a single, consistent pattern for (a) translating server errors into user-readable messages and (b) logging enough server-side context to diagnose without client reproduction (NFR24).
- **Concurrency semantics** — last-write-wins must be explicit in the API contract, not emergent from storage behavior.
- **Testability & dev ergonomics** — the client/server split must be clean enough that each can be developed and tested in isolation, and the whole stack must start with one command.
- **Extensibility-by-smallness** — keep the data model and API surface small enough that adding auth / per-user isolation / richer metadata later is a cheap replacement, not a migration epic.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application: Next.js SPA client + Fastify REST API + PostgreSQL, composed as an npm workspaces monorepo, containerized for local and deployed environments.

### Starter Options Considered

Three third-party "Next.js + Fastify monorepo" starters were evaluated and rejected:

- **`maybemaby/fastify-next-starter`** — bundles Supabase auth, Prisma ORM, and OpenAPI codegen. Rejected: violates PRD NFR19 (no auth in v1) and "small dependency footprint" discipline.
- **`maybemaby/fastify-trpc-next`** — uses tRPC, Turborepo, pnpm. Rejected: tRPC violates FR28 (the API must be independently testable without client knowledge) and the workspace tooling is wrong for our preference.
- **`riipandi/fuelstack`** — Turborepo + Drizzle + Jest + Vite + Next.js. Rejected: too opinionated, bundles an ORM and a second frontend framework we don't need.

All three also use pnpm + Turborepo, which do not match the user's preference for plain npm workspaces.

### Selected Approach: Composite Official Scaffolding

Rather than adopt a third-party combined starter, we use each project's official CLI to scaffold the two apps, then compose them under a hand-written npm workspace root.

**Rationale:**

- Honors the PRD's "boring, idiomatic tooling, small dependency footprint" directive (Risk Mitigation §Technical).
- Avoids inheriting opinions (auth, ORM, tRPC, alternative workspace tool) that we would then need to remove.
- Each tier stays scaffolded from its own canonical source, which keeps upgrades and documentation aligned with upstream.
- The workspace root is small enough to read in one sitting (supports NFR21).

**Trade-off acknowledged:** Next.js + separate Fastify is an unusual pairing — Next.js normally serves its own API routes. The justification here is FR28/NFR22: the API must be testable and documented independently of the client, and a separate Fastify tier enforces that split cleanly. We accept paying for Next.js's framework surface without using its API layer in exchange for a clean client/server contract boundary.

**Initialization Commands:**

```bash
# 1. Create workspace root (manual: package.json with "workspaces": ["apps/*", "packages/*"])
mkdir todo-app && cd todo-app
npm init -y

# 2. Scaffold the web client
npx create-next-app@latest apps/web --typescript --app --eslint --tailwind --src-dir --use-npm --yes

# 3. Scaffold the API server
npx fastify-cli@latest generate apps/api --lang=typescript

# 4. Create shared contract package (manual, minimal: package.json + tsconfig.json + src/index.ts)
mkdir -p packages/shared/src

# 5. Add root-level dev orchestration (npm-run-all or concurrently) and docker-compose.yml for Postgres
```

### Architectural Decisions Provided by the Starters

**Language & Runtime:**

- TypeScript end-to-end (client, server, shared package).
- Node.js ≥20 LTS (required by Fastify v5).
- React 19 + Next.js 16 App Router (current defaults as of April 2026).
- Fastify v5.8.x (current stable as of April 2026).

**Styling Solution:**

- Tailwind CSS (shipped by `create-next-app --yes` defaults). Choice preserved for speed; can be narrowed later if bundle cap (NFR4: ≤200 KB gzipped) is threatened, though Tailwind's JIT output is typically well under budget for a single-view app.

**Build Tooling:**

- Web: Turbopack (Next.js 16 stable default) for `next dev` and `next build`.
- API: TypeScript compiler via `fastify-cli`'s generated build scripts (`npm run build:ts`, `npm run dev` with file watch).

**Testing Framework:**

- Web: tests are **not** included by Next.js defaults — will be added as an explicit later decision.
- API: `fastify-cli` includes a `node --test` setup by default in its TypeScript template.

**Code Organization:**

```text
todo-app/
├── package.json                 # npm workspaces root
├── docker-compose.yml           # local Postgres
├── apps/
│   ├── web/                     # Next.js (create-next-app output, src/ layout)
│   └── api/                     # Fastify (fastify-cli output, src/app.ts, src/routes/, src/plugins/)
└── packages/
    └── shared/                  # shared TS types + API contract (Todo, request/response shapes)
```

**Development Experience:**

- Root-level `npm run dev` orchestrates both apps via `npm-run-all --parallel` (or `concurrently`). Satisfies NFR20 (single-command local run).
- `docker-compose up -d db` starts Postgres for local development; documented in README as a prerequisite to `npm run dev`. (User preference: containerized persistence, no file-backed stores.)
- AGENTS.md (auto-generated by `create-next-app` in `apps/web`) kept in tree to guide future AI-assisted edits; analogous file added for `apps/api`.

**Note:** Executing these initialization commands and wiring up the workspace root should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- Database: PostgreSQL 17 in a container (local via docker-compose, prod via platform-managed or container-hosted).
- Data access: Drizzle ORM with drizzle-kit migrations.
- Validation: Zod schemas in `packages/shared`, wired to Fastify via `@fastify/type-provider-zod` and to Drizzle via `drizzle-zod`.
- API style: REST with four endpoints; Zod-derived contract in `packages/shared`.
- Frontend state: React `useReducer` with hand-rolled optimistic updates and rollback.
- Deployment unit: two Docker containers (web, api) + Postgres; deployment-agnostic.

**Important Decisions (Shape Architecture):**

- OpenAPI docs generated from Zod schemas via `@fastify/swagger` + Swagger UI.
- Logging: Pino JSON with correlation IDs via `@fastify/request-context`.
- Rate limiting: `@fastify/rate-limit` with conservative defaults (100 req/min/IP).
- CORS: `@fastify/cors` locked to env-configured origin.
- Security headers: `@fastify/helmet` defaults; CSP permissive in v1.
- Frontend rendering: CSR-only on Next.js App Router; no SSR/SSG/RSC data-fetching.
- Accessibility: Radix UI primitives for `Checkbox` and `Toast`; native HTML for input and button; Tailwind for styling.
- Dev workflow: root `npm run dev` starts DB, runs migrations, and launches both apps.

**Deferred Decisions (Post-MVP, explicitly not built in v1):**

- Authentication, authorization, user model, sessions — zero-code in v1; migration path documented.
- Real-time propagation (polling/SSE/WebSockets) — API shape reserves the `{ todos: [...] }` envelope so extensions are additive.
- API versioning (`/v1/` prefix) — defer until a breaking change is actually needed.
- Caching (Redis, in-memory) — not justified at v1 scale.
- Metrics, tracing, error aggregation (Sentry) — platform-layer request metrics suffice; re-evaluate post-v1.
- Backup/DR wiring — deployer's platform responsibility.
- CI-enforced bundle-size gate — bundle analyzer available as dev tool only.

### Data Architecture

- **Database:** PostgreSQL 17 (`postgres:17-alpine` image). Local via docker-compose; prod via any managed Postgres or a container on the deploy target.
- **Driver/ORM:** Drizzle ORM with `drizzle-kit` for schema definition and migrations. Schema lives in `apps/api/src/db/schema.ts`; migrations versioned in `apps/api/drizzle/`.
- **Schema (v1):** one table — `todos` with columns `id` (uuid primary key), `text` (text, not null, bounded), `completed` (boolean, default false), `created_at` (timestamptz, default now()). No `owner_id` yet — deliberate extensibility deferral.
- **Validation:** Zod schemas in `packages/shared/src/contracts.ts` are the single source of truth; Drizzle schema and API validators both derive from them (via `drizzle-zod` and `@fastify/type-provider-zod`). Text bound: `z.string().trim().min(1).max(500)`.
- **Migrations in prod:** `drizzle-kit migrate` runs as an explicit one-shot command, not on API startup. API fails fast (non-zero exit) if schema is behind expected version.
- **Caching:** none.

### Authentication & Security

- **Auth/authz in v1:** none. No sessions, no cookies, no middleware. The data model reserves no `owner_id` column; post-v1 migration can add it nullable and assign existing rows to a system user or leave them "unowned."
- **HTTPS:** terminated at the deployment platform. Fastify binds HTTP; `trustProxy` enabled so client IPs behind a terminator are correct. Local dev exempt.
- **Input validation:** Zod on every request body/params. Fastify `bodyLimit` set to 4 KB (todos are short). Unknown fields rejected via Zod `.strict()`.
- **XSS prevention:** relies on React's default JSX escaping. Documented as a trust boundary; `dangerouslySetInnerHTML` is prohibited in the codebase.
- **CORS:** `@fastify/cors` locked to `CORS_ORIGIN` env var (dev: `http://localhost:3000`; prod: deployed web origin).
- **Rate limiting:** `@fastify/rate-limit` — 100 req/min/IP, standard 429 response.
- **Security headers:** `@fastify/helmet` defaults on the API; Next.js defaults on the web. CSP permissive in v1 (no inline-script lockdown needed for this surface).
- **Secrets:** `.env` for local dev (gitignored, `.env.example` committed); platform env vars in prod. Typed access via `@fastify/env`.

### API & Communication Patterns

**Endpoints (REST, JSON):**

| Method | Path              | Purpose                          | Success | Errors            |
|--------|-------------------|----------------------------------|---------|-------------------|
| GET    | `/todos`          | List all todos                   | 200     | 500               |
| POST   | `/todos`          | Create a todo from text          | 201     | 400, 500          |
| PATCH  | `/todos/:id`      | Update completion state          | 200     | 400, 404, 500     |
| DELETE | `/todos/:id`      | Delete a todo                    | 204     | 404, 500          |
| GET    | `/health`         | Liveness + DB reachability probe | 200     | 503               |
| GET    | `/docs`           | Swagger UI (non-prod by default) | 200     | —                 |

- **List response shape:** `{ todos: [...] }` — wrapped so pagination/`nextCursor` can be added later without breaking clients.
- **Error shape:** Fastify-sensible default — `{ statusCode, error, message }` — plus an optional machine-readable `code` on selected errors.
- **Contracts:** Zod schemas in `packages/shared`. Server: `@fastify/type-provider-zod` validates and types routes. Client: `z.infer<typeof ...>` for types; thin `apps/web/src/lib/api.ts` wraps native `fetch`.
- **OpenAPI docs:** `@fastify/swagger` + `@fastify/swagger-ui` generate docs from the Zod schemas. Served on `/docs` in non-prod; toggled off in production by env flag.
- **Versioning:** none (no `/v1/` prefix). Deferred explicitly.
- **Concurrency semantics:** last-write-wins, documented in OpenAPI descriptions. No `ETag`, no `If-Match`, no `updated_at` token — LWW is the explicit contract.
- **Real-time:** not implemented. Clients refetch `GET /todos` on explicit user action or visibility regain.
- **Logging:** Pino JSON. Each request logs method, path, status, duration, and correlation ID. Correlation IDs: `x-request-id` header honored if present, else generated (UUID); attached to `@fastify/request-context`; included in every log line via Pino mixin; echoed back in response headers.
- **Error translation (client-side):** `api.ts` parses error envelopes into a typed `ApiError` class; UI surfaces `.message` via the Radix toast.

### Frontend Architecture

- **Rendering:** CSR-only on Next.js 16 App Router. `app/layout.tsx` for shell + metadata; `app/page.tsx` hosts the single `<TodoApp />` view. No SSR/SSG/RSC data-fetching.
- **State:** React `useReducer`. Single reducer owns actions: `loadSuccess | loadError | addOptimistic | addReconcile | addFailed | toggleOptimistic | toggleFailed | deleteOptimistic | deleteFailed | errorDismiss`. Optimistic actions apply locally with a temp UUID and `pending: true` flag; success swaps in server response; failure rolls back.
- **Data fetching:** hand-rolled inside reducer dispatch handlers; no TanStack Query/SWR. Initial fetch on mount; refetch on `visibilitychange`.
- **Routing:** none (single view at `/`).
- **Styling:** Tailwind CSS exclusively.
- **Accessible components:**
  - Radix UI Primitives: `Checkbox` (completion toggle), `Toast` (error surface, polite live region).
  - Native: `<input type="text">` + `<label>`, `<button type="button">` with `aria-label`.
  - Semantic HTML: `<ul>` + `<li>` for the list.
  - Completion state via `aria-checked` + strikethrough (not color alone — NFR12).
- **Component structure:**

  ```text
  apps/web/src/
  ├── app/{layout,page,globals}.tsx
  ├── components/{TodoApp,TodoInput,TodoList,TodoItem,Toast}.tsx
  └── lib/{api,reducer,errors}.ts
  ```

- **Bundle budget:** ≤200 KB gzipped initial JS (NFR4). `@next/bundle-analyzer` available as a dev tool; no CI gate in v1.
- **Env config:** `NEXT_PUBLIC_API_URL` explicitly points to the Fastify base (keeps tier separation visible; no Next.js proxy rewrites).

### Infrastructure & Deployment

- **Containers:** two Dockerfiles (`apps/web/Dockerfile`, `apps/api/Dockerfile`), multi-stage, Node 22 alpine base, non-root user, `PORT` env-driven.
- **Local dev:** `docker-compose.yml` runs only Postgres. Apps run on host via `npm run dev` for fast HMR.
- **Production:** three containers — `web`, `api`, `db` — orchestrated by the deploy target. `docker-compose.production.yml` provided as a runnable reference; deployment-agnostic (works on Railway, Fly.io, Render, VPS, k8s).
- **CI:** GitHub Actions. On PR: lint + type-check + tests + Docker builds. On main merge: publish images to GHCR. No auto-deploy.
- **Environment variables:**
  - API: `DATABASE_URL`, `PORT`, `LOG_LEVEL`, `CORS_ORIGIN`
  - Web: `NEXT_PUBLIC_API_URL`
  - `.env.example` at root documents all.
- **Health:** `GET /health` on the API checks process liveness and DB reachability; returns 503 if DB is unreachable.
- **Migrations in prod:** run `drizzle-kit migrate` as a one-shot command before deploying new API code. API fails fast if schema is behind.
- **Observability:** Pino JSON logs to stdout; correlation IDs included. No metrics, tracing, or error aggregation in v1.
- **Scaling:** API is stateless — horizontally scalable; web is static after build; DB is the only stateful piece. LWW concurrency (FR15) means multi-instance API scaling is safe. No explicit scaling config in repo.
- **Backup/DR:** out of scope; document in README that deployer handles via platform-native or `pg_dump`.
- **Single-command local run (NFR20):** root `npm run dev` orchestrates:
  1. `docker compose up -d db` (no-op if already up)
  2. `drizzle-kit migrate` (idempotent)
  3. `npm-run-all --parallel dev:web dev:api`

### Decision Impact Analysis

**Implementation Sequence:**

1. Workspace scaffolding: npm workspaces root; `create-next-app` in `apps/web`; `fastify-cli generate --lang=typescript` in `apps/api`; empty `packages/shared`.
2. `packages/shared`: Zod contract schemas (`Todo`, `CreateTodoRequest`, `UpdateTodoRequest`, `TodoListResponse`, `ErrorResponse`).
3. `docker-compose.yml`: Postgres 17 service. `.env.example` at root.
4. API data layer: Drizzle schema + initial migration; DB connection plugin.
5. API routes: four handlers wired to Zod via `@fastify/type-provider-zod`; `@fastify/sensible`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/request-context`, Pino correlation-ID mixin.
6. API meta: `@fastify/swagger` + Swagger UI, `/health`, `@fastify/env`.
7. Web client: typed `api.ts` fetch wrapper, `reducer.ts`, `<TodoApp />` composition with Radix `Checkbox` + `Toast`, empty/loading/error states.
8. Root `npm run dev` wrapper; Dockerfiles; GitHub Actions workflow; `docker-compose.production.yml`.
9. Tests: API integration tests (all four endpoints + validation failures + concurrency semantics); web component tests for the three PRD user journeys.

**Cross-Component Dependencies:**

- `packages/shared` is the contract boundary; changing a Zod schema touches both tiers — this is the intent.
- The Drizzle schema and the Zod contracts must stay aligned; `drizzle-zod` derivation handles this for entity shapes, with request/response shapes layered on top.
- Correlation IDs are produced in the API's request-context plugin but only useful if clients log them; the `api.ts` wrapper captures and logs the response `x-request-id` on failures.
- Migration execution is a prerequisite for API startup (fail-fast check); the root `npm run dev` enforces this ordering for local dev.
- Removing `DATABASE_URL`, `CORS_ORIGIN`, or `NEXT_PUBLIC_API_URL` breaks startup in a readable way — validated via `@fastify/env` on the API side.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

Five categories of potential conflicts where agents (human or AI) could make different defensible-but-incompatible choices: naming, structure, format, communication, and process. Each is pinned below with concrete examples.

### Naming Patterns

**Database Naming (PostgreSQL / Drizzle):**

- Tables: plural snake_case — `todos` (not `todo`, not `Todos`).
- Columns: snake_case — `id`, `text`, `completed`, `created_at`.
- Primary keys: column name `id`, type `uuid`, default `gen_random_uuid()` (Postgres native `pgcrypto` or 17's built-in UUID v7 if adopted later).
- Timestamps: `created_at` (and future `updated_at`) as `timestamptz` with default `now()`.
- When auth lands (post-v1): foreign-key columns as `{entity}_id` — e.g., `owner_id`.
- Indexes: `{table}_{columns}_idx` — e.g., `todos_created_at_idx` (none needed in v1).

**API Naming:**

- Resource paths: plural kebab-case, noun-only — `/todos`, `/todos/:id`. No verbs in paths.
- Route params: colon-prefix — `:id`, not `{id}`.
- Query params: camelCase (e.g., future `?pageSize=50`).
- Custom headers: `x-{kebab-case}` — e.g., `x-request-id`.
- JSON field names on the wire: camelCase — `createdAt`, not `created_at`. Drizzle maps DB snake_case → contract camelCase via column aliases; the Zod layer in `packages/shared` is the authoritative wire shape.

**TypeScript Code Naming:**

- React component files: `PascalCase.tsx` — `TodoApp.tsx`.
- Non-component files: `camelCase.ts` — `api.ts`, `reducer.ts`.
- Directory names: lowercase — `components/`, `lib/`, `db/`.
- Types/interfaces: PascalCase — `Todo`, `ApiError`.
- Functions/variables: camelCase — `fetchTodos`, `todoList`.
- Module-level constants: UPPER_SNAKE_CASE — `MAX_TEXT_LENGTH`.
- React hooks: `use`-prefixed camelCase.
- Zod schemas: PascalCase with `Schema` suffix — `TodoSchema`, `CreateTodoRequestSchema`.

### Structure Patterns

**Test location:**

- Co-located unit tests: `*.test.ts` / `*.test.tsx` next to the file under test. No `__tests__/` directories.
- API integration tests: under `apps/api/test/integration/` — they own a different lifecycle (DB setup/teardown).

**Component organization:** by role, not by feature. V1 has one feature, so this is forward-looking; keeps the bar high for adding feature folders.

**Utility placement:**

- Cross-app utilities → `packages/shared` (only if genuinely shared and domain-meaningful). A generic helper is not a "shared utility."
- App-local utilities: `apps/{web,api}/src/lib/`. The directory is `lib/`, not `utils/`.

### Format Patterns

**API response shape:**

- List: `{ todos: [...] }` (wrapped, extensibility-preserving).
- Single resource (create, update): the bare entity — `{ id, text, completed, createdAt }`.
- Delete: no body; `204 No Content`.
- Error: `{ statusCode, error, message, code? }` — Fastify-sensible default; optional `code` field on domain-specific errors.

**Data formats:**

- Dates on the wire: ISO 8601 strings (e.g., `"2026-04-19T22:17:57.864Z"`). Drizzle's `timestamptz` + Zod `.datetime()` enforces this.
- Booleans: literal `true` / `false` in JSON.
- UUIDs: lowercase, hyphenated, v4.
- Null vs omitted: prefer omitted over `null` for optional fields. Zod schemas use `.optional()`, not `.nullable()`, unless null has a specific meaning.
- Empty list: return `{ todos: [] }`, never `null`.

### Communication Patterns

**Client → Server:**

- All requests go through `apps/web/src/lib/api.ts`. Components never call raw `fetch`.
- Every outgoing request carries a generated `x-request-id` header (client UUID per request; server echoes it back for correlation).

**Reducer actions (frontend state):**

- Naming: `{intent}Optimistic` / `{intent}Reconcile` / `{intent}Failed` for optimistic mutations; `{intent}Success` / `{intent}Error` for non-optimistic operations (load).
- Shape: `{ type: 'addOptimistic', payload: { tempId, text } }`. Discriminated unions via TS; `reducer.ts` exhaustive-checks the switch.

**Logging:**

- Levels: `error` (unhandled failures, 5xx causes), `warn` (handled client errors worth seeing — e.g., rate-limit triggers), `info` (one line per request), `debug` (dev-only diagnostics).
- Mandatory structured fields on every request log line: `{ level, time, requestId, method, path, statusCode, durationMs, msg }`. No free-form string logs for request-scoped events.
- Todo text is user content but not private in v1; still, don't log full text at `info` level — log `todoId` at `info`, full text only at `debug`.

### Process Patterns

**Error handling (server):**

- Handlers throw via `@fastify/sensible` constructors: `reply.notFound()`, `reply.badRequest(msg)`, `reply.internalServerError()`. No hand-crafted error responses.
- Validation errors: produced by Fastify's Zod integration automatically; do not wrap or re-throw.
- Global `setErrorHandler` logs the full error with correlation ID and returns the sensible envelope.

**Error handling (client):**

- `api.ts` never surfaces raw `Error` to components — it throws `ApiError` instances with a user-facing `.message` and a `.statusCode`.
- Components handle `ApiError` with a single `try/catch` per reducer action; the `{intent}Failed` action carries the message into state.
- `Toast` renders the user-facing message. Never renders stack traces.
- Top-level `window.addEventListener('unhandledrejection', ...)` logs and surfaces a generic error toast (NFR9 safety net).

**Loading state:**

- One state per async operation: `status: 'idle' | 'loading' | 'error'` on the reducer state (initial load only). Mutations do not introduce separate loading flags — they apply optimistically.
- Never show a spinner over an existing populated list. Spinners are for empty-state initial load only.

**Retry:**

- No automatic retries in v1. On failure the UI surfaces a toast; the user retries by repeating the action (input is preserved per FR19).
- Exception: `GET /todos` on `visibilitychange` is a best-effort refetch; it fails silently (log only, no toast).

**Validation timing:**

- Server: every request boundary. No validation inside handlers.
- Client: minimal. Rely on server validation as the authority. Client-side only prevents trivially bad UX (e.g., disabling submit on empty input). Do not duplicate max-length checks in the client.

### Enforcement Guidelines

**All contributors (human or AI) MUST:**

- Read `packages/shared/src/contracts.ts` before adding or modifying an endpoint. The Zod schema is the contract.
- Use the Fastify logger (`request.log.*` or `app.log.*`) — never `console.log` in API code.
- Route all API calls through `apps/web/src/lib/api.ts`.
- Handle all three of loading, empty, and error states for any new async-dependent UI (not just the happy path).
- Write tests co-located with the file under test (unit) or in `apps/api/test/integration/` (API integration).
- Not use `dangerouslySetInnerHTML` in `apps/web`.
- Not import from `apps/api/*` inside `apps/web` or vice versa — the apps communicate only through `packages/shared` contracts and HTTP.

**Pattern enforcement mechanisms (v1 scope):**

- ESLint at repo root extends `eslint:recommended`, `@typescript-eslint/recommended`, and Next.js's config. Custom rule: `no-restricted-imports` blocks cross-app imports between `apps/api` and `apps/web`.
- Prettier for formatting (defaults).
- `tsc --noEmit` in CI catches contract drift between shared schemas and their usage sites.
- No custom lint rules beyond these in v1.

### Pattern Examples

**Good:**

```ts
// apps/web/src/lib/api.ts
export async function createTodo(input: CreateTodoRequest): Promise<Todo> {
  const res = await fetch(`${API_URL}/todos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': crypto.randomUUID() },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await ApiError.fromResponse(res);
  return TodoSchema.parse(await res.json());
}
```

```ts
// apps/api/src/routes/todos.ts
app.post(
  '/todos',
  { schema: { body: CreateTodoRequestSchema, response: { 201: TodoSchema } } },
  async (req, reply) => {
    const todo = await createTodo(req.body);
    reply.code(201);
    return todo;
  },
);
```

**Anti-patterns (do not do):**

```tsx
// Raw fetch in a component
const res = await fetch('/todos');

// console.log on the server
console.log('created todo', todo);

// Handcrafted error response
reply.code(500).send({ err: 'something broke' });

// Client-side duplication of a server-validated bound
if (text.length > 500) return;   // the server is the authority

// Manual JSON validation instead of Zod
const body = req.body as CreateTodoRequest;   // trusts the wire
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
todo-app/
├── README.md                              # project overview, local run, deployment notes
├── AGENTS.md                              # root-level guide for AI agents (rules that span both apps)
├── package.json                           # npm workspaces root; scripts; shared devDeps
├── package-lock.json
├── tsconfig.base.json                     # shared compiler options (strict, moduleResolution, paths)
├── .eslintrc.cjs                          # root ESLint config (extends + no-restricted-imports rule)
├── .prettierrc
├── .prettierignore
├── .editorconfig
├── .gitignore
├── .nvmrc                                 # Node 22
├── .env.example                           # documents every required env var
├── docker-compose.yml                     # local dev: Postgres only
├── docker-compose.production.yml          # reference prod compose: web + api + db
│
├── .github/
│   └── workflows/
│       └── ci.yml                         # lint + typecheck + test + docker-build; publish to GHCR on main
│
├── scripts/
│   └── dev.sh                             # wrapped by `npm run dev` — up db, migrate, run both apps
│
├── apps/
│   ├── web/                               # Next.js 16 SPA client
│   │   ├── Dockerfile                     # multi-stage: deps → build → runtime (non-root, PORT-driven)
│   │   ├── .dockerignore
│   │   ├── next.config.ts
│   │   ├── tsconfig.json                  # extends root tsconfig.base.json
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── package.json
│   │   ├── public/
│   │   │   └── favicon.ico
│   │   ├── AGENTS.md                      # web-specific rules (auto-generated by create-next-app)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx             # shell, metadata (title, description), Toast provider
│   │       │   ├── page.tsx               # hosts <TodoApp />
│   │       │   ├── globals.css
│   │       │   └── favicon.ico
│   │       ├── components/
│   │       │   ├── TodoApp.tsx            # stateful: owns reducer + API orchestration
│   │       │   ├── TodoApp.test.tsx       # journey-level tests (happy path, error recovery)
│   │       │   ├── TodoInput.tsx          # create form; preserves input on failure
│   │       │   ├── TodoInput.test.tsx
│   │       │   ├── TodoList.tsx           # loading / empty / populated rendering
│   │       │   ├── TodoList.test.tsx
│   │       │   ├── TodoItem.tsx           # row: Radix Checkbox + text + delete button
│   │       │   ├── TodoItem.test.tsx
│   │       │   ├── Toast.tsx              # Radix Toast wrapper; aria-live polite
│   │       │   └── Toast.test.tsx
│   │       └── lib/
│   │           ├── api.ts                 # typed fetch wrapper; 4 calls: list, create, update, delete
│   │           ├── api.test.ts
│   │           ├── reducer.ts             # pure state reducer with optimistic actions
│   │           ├── reducer.test.ts
│   │           ├── errors.ts              # ApiError class
│   │           └── errors.test.ts
│   │
│   └── api/                               # Fastify v5 REST API
│       ├── Dockerfile                     # multi-stage: deps → build → runtime (non-root, PORT-driven)
│       ├── .dockerignore
│       ├── drizzle.config.ts              # drizzle-kit config; points at src/db/schema.ts
│       ├── tsconfig.json                  # extends root tsconfig.base.json
│       ├── package.json
│       ├── AGENTS.md                      # api-specific rules
│       ├── drizzle/                       # generated migrations (committed)
│       │   ├── 0000_init.sql
│       │   └── meta/
│       │       └── _journal.json
│       ├── src/
│       │   ├── server.ts                  # entry: builds app, binds port, handles shutdown
│       │   ├── app.ts                     # buildApp(): registers plugins, routes; returns FastifyInstance
│       │   ├── config.ts                  # @fastify/env schema: DATABASE_URL, PORT, LOG_LEVEL, CORS_ORIGIN
│       │   ├── db/
│       │   │   ├── client.ts              # Postgres client + Drizzle instance (singleton)
│       │   │   ├── schema.ts              # Drizzle table definitions (todos)
│       │   │   └── migrate.ts             # programmatic drizzle-kit migrate (used by scripts/dev.sh)
│       │   ├── plugins/
│       │   │   ├── cors.ts                # @fastify/cors
│       │   │   ├── helmet.ts              # @fastify/helmet
│       │   │   ├── rateLimit.ts           # @fastify/rate-limit
│       │   │   ├── sensible.ts            # @fastify/sensible
│       │   │   ├── requestContext.ts      # @fastify/request-context + correlation ID generator
│       │   │   ├── swagger.ts             # @fastify/swagger + @fastify/swagger-ui (non-prod)
│       │   │   └── db.ts                  # decorates app with drizzle instance
│       │   └── routes/
│       │       ├── todos.ts               # GET, POST, PATCH, DELETE for /todos
│       │       ├── todos.test.ts          # unit tests for handlers (app.inject)
│       │       └── health.ts              # GET /health — process + DB probe
│       └── test/
│           └── integration/
│               ├── helpers/
│               │   ├── buildTestApp.ts    # spawns app against an ephemeral DB schema
│               │   └── seedDb.ts
│               ├── todos.int.test.ts      # full CRUD paths against real Postgres
│               ├── validation.int.test.ts # validation failure paths
│               └── concurrency.int.test.ts # LWW semantics proof
│
└── packages/
    └── shared/                            # versioned contract between web and api
        ├── package.json                   # name: "@todo-app/shared"; exports: "./dist"
        ├── tsconfig.json
        └── src/
            ├── index.ts                   # re-exports from contracts.ts
            ├── contracts.ts               # Zod schemas: Todo, CreateTodoRequest, UpdateTodoRequest,
            │                              #              TodoListResponse, ErrorResponse
            └── contracts.test.ts          # contract round-trip tests
```

### Architectural Boundaries

**API Boundaries (HTTP surface):**

The Fastify API exposes exactly six HTTP endpoints. No other surface.

| Method | Path         | Bound by                                     |
|--------|--------------|----------------------------------------------|
| GET    | `/todos`     | `packages/shared` → `TodoListResponseSchema` |
| POST   | `/todos`     | `CreateTodoRequestSchema` → `TodoSchema`     |
| PATCH  | `/todos/:id` | `UpdateTodoRequestSchema` → `TodoSchema`     |
| DELETE | `/todos/:id` | path only; 204 no body                       |
| GET    | `/health`    | internal contract (no shared schema)         |
| GET    | `/docs`      | Swagger UI asset; non-prod by default        |

No authentication boundary in v1. Rate-limit boundary is per-IP at the API edge.

**Component Boundaries (frontend):**

- `TodoApp` is the only stateful component. It owns the reducer and all `api.ts` calls.
- All mutations dispatch through the reducer — no component calls `api.ts` directly except `TodoApp`.
- `TodoInput`, `TodoList`, `TodoItem`, `Toast` are presentational; they receive props and emit callbacks.
- `Toast` reads from the reducer state (error string + dismiss callback) — implemented via prop drilling, not Context (single ancestor, depth 2).

**Service Boundaries (API internals):**

- `routes/*` handlers: orchestration only — parse request → call data access → return response. No business logic beyond that.
- `db/*`: data access; pure Drizzle queries. No request/response concerns.
- `plugins/*`: cross-cutting concerns (auth is out, but rate-limit/CORS/helmet/logging/request-context live here).
- Dependency direction: routes → db → schema. Plugins sit above routes. No reverse imports.

**Data Boundaries:**

- Postgres is the only source of truth for todo state.
- The API owns the DB connection; the web app never speaks to Postgres directly.
- Schema migrations are the only mechanism to evolve the DB shape. No ad-hoc SQL in handlers.
- Drizzle's `todos` table is exposed to the rest of the API only via typed query functions in `db/client.ts` — handlers import functions, not raw tables (keeps swap-ability if Drizzle is replaced later).

### Requirements to Structure Mapping

Mapping each PRD FR group to its implementation location:

**Task Management (FR1–FR7):**

- `apps/api/src/db/schema.ts` — entity shape
- `apps/api/src/routes/todos.ts` — all four mutations
- `packages/shared/src/contracts.ts` — wire shape
- `apps/web/src/components/TodoItem.tsx` — toggle + delete UI
- `apps/web/src/components/TodoInput.tsx` — create UI

**List Presentation (FR8–FR12):**

- `apps/web/src/components/TodoList.tsx` — empty/loading/populated rendering
- `apps/web/src/app/page.tsx` — gate-free load
- `apps/web/src/components/TodoItem.tsx` — active/completed styling

**State & Persistence (FR13–FR16):**

- `apps/api/src/db/*` — durable storage
- `apps/web/src/lib/reducer.ts` — client state + reconcile on fetch
- `apps/api/src/routes/todos.ts` — LWW enforcement via `UPDATE` without optimistic-concurrency checks

**Feedback & Error Handling (FR17–FR21):**

- `apps/web/src/lib/reducer.ts` — optimistic + rollback
- `apps/web/src/components/Toast.tsx` — error surface
- `apps/web/src/lib/errors.ts` — `ApiError`
- `apps/web/src/components/TodoInput.tsx` — input preservation on failure

**API Surface (FR22–FR28):**

- `apps/api/src/routes/todos.ts`
- `packages/shared/src/contracts.ts`
- `apps/api/src/plugins/swagger.ts` — independent documentation + exerciser

**Responsive & Accessible (FR29–FR33):**

- `apps/web/src/app/globals.css` + Tailwind responsive utilities
- Radix primitives in `Toast.tsx` / `TodoItem.tsx`
- Semantic markup across all components

### Cross-Cutting Concerns

- **Input validation** — `packages/shared/src/contracts.ts` → applied at `apps/api/src/routes/todos.ts` via `@fastify/type-provider-zod`.
- **Logging + correlation IDs** — `apps/api/src/plugins/requestContext.ts` (generates/echoes `x-request-id`; Pino mixin includes it on every log line).
- **CORS** — `apps/api/src/plugins/cors.ts`.
- **Rate limiting** — `apps/api/src/plugins/rateLimit.ts`.
- **Security headers** — `apps/api/src/plugins/helmet.ts`.
- **Error translation (server)** — `apps/api/src/app.ts` → `setErrorHandler`.
- **Error translation (client)** — `apps/web/src/lib/errors.ts` + `apps/web/src/lib/api.ts`.
- **DB schema versioning** — `apps/api/drizzle/` (generated); `apps/api/src/db/schema.ts` (source).
- **Env validation** — `apps/api/src/config.ts` (`@fastify/env`); web uses `NEXT_PUBLIC_API_URL` only.

### Integration Points

**Internal Communication:**

- `apps/web` → `apps/api`: HTTP/JSON, via `apps/web/src/lib/api.ts`, typed by `packages/shared`.
- `apps/web` → `packages/shared`: import types + Zod schemas (for response parsing).
- `apps/api` → `packages/shared`: import Zod schemas (for request/response validation + OpenAPI generation).
- `apps/api` → `postgres`: via Drizzle client in `apps/api/src/db/client.ts`. Connection pool is app-singleton.

**External Integrations:**

- None in v1.
- Future-reserved integration points: auth provider (no code touchpoint yet); observability (error aggregation) would hook into `apps/api/src/app.ts` global error handler.

**Data Flow — "add a todo" end-to-end:**

1. User types in `TodoInput` → onSubmit dispatches `addOptimistic` with `tempId` and text.
2. Reducer applies the optimistic todo to state with `pending: true`.
3. `TodoApp`'s effect notices the optimistic entry → calls `api.createTodo(text)`.
4. `api.ts` generates a UUID → sends `POST /todos` with `x-request-id` header.
5. Fastify middleware stack: helmet → cors → rate-limit → request-context (captures id) → type-provider-zod (validates body against `CreateTodoRequestSchema`).
6. Route handler: Drizzle `INSERT`, returns row.
7. Response shape validated against `TodoSchema` → returned with echoed `x-request-id`.
8. Client parses response with `TodoSchema.parse()` → dispatches `addReconcile({ tempId, serverTodo })`.
9. Reducer swaps tempId for real id, clears `pending`.

If any step fails, the corresponding `{intent}Failed` action is dispatched, the optimistic entry is rolled back, and a toast surfaces the user-readable `ApiError.message`. The original `TodoInput` text remains (FR19).

### File Organization Patterns

**Configuration files:**

- Shared config at root: `tsconfig.base.json`, `.eslintrc.cjs`, `.prettierrc`, `.editorconfig`, `.nvmrc`.
- App-specific config in each app: `next.config.ts`, `tailwind.config.ts`, `drizzle.config.ts`.
- Environment: `.env` (gitignored, local dev), `.env.example` (committed, documents vars).

**Source organization:**

- `apps/web/src/app/` — Next.js routing and page composition only; thin.
- `apps/web/src/components/` — flat, by role. No deep nesting in v1.
- `apps/web/src/lib/` — non-React logic (API client, reducer, error types).
- `apps/api/src/routes/` — HTTP handlers.
- `apps/api/src/plugins/` — cross-cutting Fastify plugins.
- `apps/api/src/db/` — Drizzle schema + client.

**Test organization:**

- Unit tests: co-located with implementation (`*.test.ts`/`*.test.tsx`).
- Integration tests: `apps/api/test/integration/` (owns DB lifecycle).
- No separate `tests/` tree at root; no `__tests__/` directories.

**Asset organization:**

- `apps/web/public/` — favicon, any static assets.
- No CDN / external asset host in v1.

### Development Workflow Integration

**Development server structure:**

- `npm run dev` at root runs `scripts/dev.sh`:
  1. `docker compose up -d db` (idempotent).
  2. Wait for DB healthcheck.
  3. `npm --workspace apps/api run db:migrate` (drizzle-kit migrate).
  4. `npm-run-all --parallel dev:web dev:api`:
     - `dev:web` → `npm --workspace apps/web run dev` (Next.js on :3000 with Turbopack).
     - `dev:api` → `npm --workspace apps/api run dev` (Fastify with file-watch via fastify-cli or `tsx watch`).

**Build process structure:**

- `npm run build` builds `packages/shared`, then `apps/api`, then `apps/web` (workspace order; shared is the only cross-workspace dep).
- Each app's Dockerfile performs its own build inside a multi-stage image. Build context is the repo root so workspace resolution works.

**Deployment structure:**

- Each container is independently deployable: `ghcr.io/{owner}/todo-app-web` and `ghcr.io/{owner}/todo-app-api`.
- Postgres is not bundled into app images — provisioned separately (managed service or a third container).
- Migrations are a pre-deploy step executed out-of-band; API containers fail fast if the schema is behind.
- No app-container-internal migration or seed logic.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

All technology choices are mutually compatible at verified current versions (April 2026):

- Node 22 LTS satisfies Fastify v5's `≥20` requirement and Next.js 16's runtime needs.
- Drizzle ORM + `drizzle-zod` + Zod + `@fastify/type-provider-zod` compose cleanly — `drizzle-zod` generates Zod schemas from Drizzle's table definition, and `@fastify/type-provider-zod` consumes the same Zod schemas for request/response validation, keeping the entity shape single-sourced.
- `@fastify/swagger` + `@fastify/swagger-ui` integrate with the Zod type provider to emit OpenAPI derived from the same schemas — contract, validation, and docs cannot drift.
- npm workspaces resolve `@todo-app/shared` for both apps without a heavier monorepo tool.
- Radix UI primitives ship ESM-only builds compatible with Next.js 16 App Router and React 19.
- Postgres 17 is compatible with Drizzle's Postgres dialect (`drizzle-orm/node-postgres`).

No contradictory decisions identified.

**Pattern Consistency:**

- Naming conventions are consistent across all code locations (PascalCase React files, camelCase non-React files, snake_case DB columns with camelCase wire shapes via Zod/Drizzle).
- The "no cross-app imports" rule is enforceable via the documented ESLint `no-restricted-imports` config.
- Error handling patterns match at both tiers: server uses Fastify-sensible constructors and a global `setErrorHandler`; client consumes those shapes via `ApiError` and surfaces them through one Toast pattern.
- Logging shape (structured JSON with correlation ID) is consistent across every request log line.

**Structure Alignment:**

- Every file named in the project tree has a corresponding owner in Decisions (Step 4) or Patterns (Step 5).
- No orphan files (present in tree but unreferenced by decisions/patterns).
- No orphan decisions (decided but no file to implement them).
- Dependency direction constraints (`routes → db → schema`; `plugins` above routes) are enforceable by the tree layout and import restrictions.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**

Every FR maps to at least one file in the project structure (verified against the Requirements to Structure Mapping section):

- FR1–FR7 (Task Management) → API routes + Drizzle schema + shared contracts + UI components ✅
- FR8–FR12 (List Presentation) → `TodoList`, `TodoApp`, `page.tsx` — all three of loading/empty/populated rendered ✅
- FR13–FR16 (State & Persistence) → Postgres-backed; reducer reconciles with server on fetch; server is authority ✅
- FR17–FR21 (Feedback & Error) → optimistic reducer + Toast + `TodoInput` preserves input on failure ✅
- FR22–FR28 (API Surface) → four handlers + `/health` + Swagger UI ✅
- FR29–FR33 (Responsive & Accessible) → Tailwind responsive + Radix primitives + semantic markup ✅

**Non-Functional Requirements Coverage:**

- **NFR1 (≤100 ms perceived UI)** ✅ — optimistic reducer pattern.
- **NFR2 (≤300 ms p95 server)** ✅ — Fastify with a trivial Drizzle query path; load-testable before cutover.
- **NFR3 (<2 s TTI / <5 s on 3G)** ✅ — CSR-only, Tailwind JIT, Next.js 16 Turbopack default build output.
- **NFR4 (≤200 KB gzipped initial JS)** ✅ — React 19 + Next 16 + Radix (Checkbox + Toast only) + minimal app code comes in comfortably under 200 KB for a single-view app; `@next/bundle-analyzer` available as a check.
- **NFR5 (durability across restarts)** ✅ — Postgres in a container, not file-backed.
- **NFR6 (concurrent mutation integrity)** ✅ — LWW in the API; Postgres row-level atomicity.
- **NFR7 (no silent failures)** ✅ — server global error handler + client `ApiError` + Toast.
- **NFR8 (transient-failure recovery without refresh)** ✅ — reducer rollback + user retry; input preserved.
- **NFR9 (no unhandled rejections / stuck states)** ✅ — top-level `unhandledrejection` handler + global error boundary.
- **NFR10–NFR14 (WCAG 2.1 AA)** ✅ — Radix primitives for Checkbox + Toast; semantic HTML; focus-visible; color-independent state via aria-checked + strikethrough; 44×44 tap targets enforceable in Tailwind utilities.
- **NFR15 (HTTPS in deployed envs)** ✅ — terminated at platform; `trustProxy` enabled.
- **NFR16 (server-side validation)** ✅ — Zod at every request boundary; no trust in client validation.
- **NFR17 (output escaping)** ✅ — React default escaping; `dangerouslySetInnerHTML` banned.
- **NFR18 (bounded input)** ✅ — `z.string().max(500)` + Fastify `bodyLimit: 4 KB`.
- **NFR19 (no auth in v1, explicit)** ✅ — documented as zero-code with migration path.
- **NFR20 (single-command local run)** ✅ — root `npm run dev` → `scripts/dev.sh` orchestrates DB + migrations + both apps.
- **NFR21 (read end-to-end in one sitting)** ✅ — no speculative modules; reducer is ~40 lines; four endpoints; one table.
- **NFR22 (API documented independently)** ✅ — Swagger UI + OpenAPI JSON from Zod.
- **NFR23 (test coverage of critical paths)** ✅ — API integration tests for all four endpoints + validation + concurrency; component tests for the three PRD user journeys.
- **NFR24 (server logs diagnosable)** ✅ — Pino structured logs with correlation IDs echoed in responses.

### Implementation Readiness Validation ✅

**Decision Completeness:** All critical decisions (database, data access, validation, API style, frontend state, deployment unit) are documented with specific versions and rationale.

**Structure Completeness:** Project tree is file-level specific; every directory has a purpose; every file has a documented role.

**Pattern Completeness:** Naming, structure, format, communication, and process patterns all specified with good/anti-pattern examples.

### Gap Analysis Results

**Critical gaps:** none identified.

**Important gaps (worth flagging but not blockers):**

1. **API startup `fail-fast-on-schema-mismatch` mechanism is stated but not detailed.** The Decisions section says "API fails fast if schema is behind expected version" — the concrete mechanism (checking a migrations journal row on boot, or comparing `information_schema` against expectations) is left to implementation. Acceptable; flagging so the first implementer picks a concrete mechanism and documents it in `apps/api/src/db/migrate.ts`.
2. **Web app test tooling is not pinned.** Decisions note "tests will be added as an explicit later decision." Recommended resolution: Vitest + React Testing Library (the idiomatic 2026 default for Next.js component tests).
3. **`drizzle-kit` migration-running in the deployed pipeline** is described as "an explicit one-shot command" but the exact command invocation in CI/CD is not wired (intentional: deployment platform determines this). Deployer-facing README addition needed.

**Nice-to-have gaps:**

1. Bundle-size CI gate (e.g., `size-limit` action) was explicitly deferred per user decision — available to add later as a reference-quality improvement.
2. A `docs/adr/` directory for future Architecture Decision Records. Not needed in v1 (this document is the ADR), but the pattern is worth noting for when post-v1 changes start.

### Validation Issues Addressed

No critical issues require resolution before handoff. All important gaps are documented as "pick-at-implementation-time" with concrete recommendations.

### Architecture Completeness Checklist

#### Requirements Analysis ✅

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (low-complexity, full-stack web)
- [x] Technical constraints identified (bundle cap, performance, accessibility, deployability)
- [x] Cross-cutting concerns mapped

#### Architectural Decisions ✅

- [x] Critical decisions documented with versions (Next.js 16.2.4, Fastify 5.8.5, Postgres 17, Node 22)
- [x] Technology stack fully specified
- [x] Integration patterns defined (contract via `packages/shared`)
- [x] Performance considerations addressed (optimistic UI, CSR-only, no heavy libs)

#### Implementation Patterns ✅

- [x] Naming conventions established
- [x] Structure patterns defined (co-located tests, no `__tests__/`)
- [x] Communication patterns specified (typed `api.ts`, reducer actions, Pino structured logs)
- [x] Process patterns documented (error handling, loading state, retry, validation timing)

#### Project Structure ✅

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped (web → api via HTTP; both → shared)
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High.

- Every PRD requirement traces to an implementation location.
- Every decision has a defensible rationale tied to PRD constraints.
- Technology versions verified against April 2026 release state.
- The first implementation story is unambiguous and self-contained.

**Key Strengths:**

- **Minimalism as extensibility.** The architecture follows the PRD's thesis literally — v1 is scoped to v1, and future features (auth, real-time, multi-user) are preserved through smallness, not premature abstractions.
- **Single contract boundary.** `packages/shared` + Zod as the one source of truth means the web and API cannot drift silently at the type level.
- **Deployment agnosticism.** Two container images + an external Postgres fits Railway, Fly.io, Render, k8s, or a VPS without structural change.
- **Observable by default.** Pino structured logs + correlation IDs echoed to clients mean the first production incident is diagnosable without client-side reproduction.
- **Accessibility as a first-class concern.** Radix primitives + semantic HTML avoid the common retrofit trap.

**Areas for Future Enhancement (post-v1):**

- Auth + per-user isolation (migration path reserved: add nullable `owner_id`, migrate existing rows, enable auth middleware).
- Real-time propagation — the `{ todos: [...] }` envelope makes polling/SSE/WebSockets additive rather than breaking.
- CI-enforced bundle-size and a11y audit gates (lighthouse-ci) for reference-quality assurance.
- Error aggregation (Sentry or similar), behind an env-var flag so v1 stays unhooked.
- ADR directory once decisions start to evolve post-v1.

### Implementation Handoff

**AI Agent Guidelines:**

- Read this architecture document end-to-end before touching code. It is the contract.
- Follow all architectural decisions exactly as documented. Deviations require updating this document first.
- Use implementation patterns consistently across all components (naming, error handling, logging shape, reducer actions).
- Respect project structure and boundaries. Never import across the `apps/web` ↔ `apps/api` boundary; route everything through `packages/shared` and HTTP.
- Refer to the Pattern Examples (Good / Anti-patterns) in the Implementation Patterns section when in doubt.

**First Implementation Priority:**

Execute the initialization commands from Starter Template Evaluation to scaffold the monorepo, then create `packages/shared/src/contracts.ts` as the second step — because both apps depend on it for their own development.

```bash
# Story 1: Scaffold workspace
mkdir todo-app && cd todo-app
npm init -y
# (set "workspaces": ["apps/*", "packages/*"] in package.json)
npx create-next-app@latest apps/web --typescript --app --eslint --tailwind --src-dir --use-npm --yes
npx fastify-cli@latest generate apps/api --lang=typescript
mkdir -p packages/shared/src
# Story 2: Define the shared contracts (Zod schemas in packages/shared/src/contracts.ts)
# Story 3: Set up docker-compose.yml for Postgres + .env.example at root
# Story 4: Wire Drizzle schema + initial migration in apps/api
# ...continuing per the Implementation Sequence in the Decision Impact Analysis section.
```
