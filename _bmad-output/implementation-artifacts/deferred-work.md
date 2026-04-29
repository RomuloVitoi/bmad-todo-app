# Deferred Work

Items intentionally deferred from code reviews. Each entry: source review, file/area, brief rationale.

## Deferred from: code review of story 1-9 (2026-04-29)

### Story 1.9 — TodoList + TodoItem (commit `01f9a75`)

- **`aria-checked` on `<li role="listitem">` is invalid ARIA per ARIA 1.2** — `apps/web/src/components/TodoItem.tsx:11-13`. Spec-prescribed in Task 3 line 149 as the lightest Epic-1 signal that satisfies NFR12 without falsely advertising interactivity; eslint-disable comment in place documents the deferral. Story 2.6 swaps the entire row to Radix Checkbox with proper `role="checkbox"` semantics, which retires the disable.
- **Error branch drops `state.error` and `state.requestId`** — `apps/web/src/components/TodoList.tsx:21-32`. Component destructures `{ status, todos }` only; the reducer's captured correlation-id is not rendered, copied, or even hidden in a `data-*` attribute. Spec-mandated minimal fallback per AC #6 ("EPIC 1 PLACEHOLDER"); Story 3.1 owns the full error UX via Radix Toast where the requestId can surface for debugging.
- **`aria-live` region is a sibling-swap, not a persistent container** — `apps/web/src/components/TodoList.tsx:8-50`. Each branch (loading / empty / populated / error) returns a different DOM node, so a `success → loading` transition mounts a fresh live region; some screen readers only announce updates inside an *existing* live region. No `success → loading` transition exists in Epic 1 (visibility refetch deliberately skips `loadStart`). Revisit when Story 3.4's retry button or a manual-refresh affordance introduces the transition path.

## Deferred from: code review of stories 1-2, 1-3, 1-4, 1-8 (2026-04-29, Run 2)

### Story 1.2 — Zod contracts (commit `c2168ca`)

- **Tighten `error`/`message` to `.min(1)` and `statusCode` to `.gte(100).lte(599)`** — ErrorResponseSchema accepts empty strings and out-of-band status codes today. Spec defines them as bare types; tightening = future hardening.
- **Add export-surface pin test** — no test asserts that exactly 5 schemas + 5 inferred types are exported; an accidental future export slips through.
- **ZodError predicate-form assertions** — `assert.throws(..., z.ZodError)` doesn't pin which field caused the failure; tighten to `(e) => e.issues[0].path[0] === 'id'` form.
- **Top-level non-object input tests** — null/undefined/array/primitive at the schema root are untested for TodoSchema, CreateTodoRequestSchema, UpdateTodoRequestSchema, ErrorResponseSchema.
- **ISO datetime edge cases** — no explicit test for `+00:00` offset, microsecond precision, or missing-`Z`.

### Story 1.3 — docker-compose Postgres (commits `356ac02` + `976faa2`)

- **Pin `postgres:17-alpine` to a digest (`@sha256:...`)** — minor patch-version drift today; revisit if a deployed-image story lands.
- **Make host port configurable via `${HOST_DB_PORT:-5432}`** — currently hard-coded; the historical 5433 detour shows the collision is real.
- **Postgres tuning knobs (`shm_size`, `logging.options.max-size`, `ulimits`)** — none needed at v1 scale.

### Story 1.4 — Drizzle data layer (commit `bd1954f` + `9f2c763`)

- **Pool config (`max`, timeouts, SSL)** [apps/api/src/db/client.ts] — production tuning; Story 1.5+ handles when the API serves real traffic.
- **Migration drift checker has zero unit tests** [apps/api/src/db/migrate.ts] — needs a real DB or heavy mock harness; defer until api-app test infra lands.
- **Concurrent `db:check` invocations have no advisory lock** — acceptable for single-developer dev loop; revisit when CI parallelism lands.
- **No `--> statement-breakpoint` discipline** — single-statement migration is fine; future multi-statement migrations should enforce.
- **Export `Todo`/`TodoRow` named type from `client.ts`** — handlers re-derive via TS inference today; export when the second handler lands.

### Story 1.8 — typed API client + reducer (commit `33d63b8`)

- **Explicit fetch timeout via `AbortSignal.timeout(...)` composed with caller's signal** [apps/web/src/lib/api.ts] — hung server keeps the user in `loading` indefinitely; spec doesn't mandate a deadline.
- **`crypto.randomUUID()` polyfill for non-secure contexts** — works in current targets; revisit if deploy story expands browser baseline.
- **No tests for `TodoApp.tsx`** (visibilitychange handler, AbortError swallow path, cancelled-flag race) — vitest config uses `environment: 'node'`; React component tests need jsdom + RTL devDeps. Belongs in a dedicated test-infra story.
- **No tests for `ApiError.fromResponse` non-JSON-body and CORS-stripped-`x-request-id` paths** — coverage hardening, not blocking.
- **`ErrorResponseSchema.safeParse` with `.strict()` drops the server's `message` when the body adds an unknown field** — relaxing this requires a contract decision (spec defines `.strict()` in Story 1.2). Couple to a later schema-evolution discussion.
- **Reducer `loadStart` wipes `todos` and `loadError` clears them** — current behavior is unreached today (visibility refetch silently ignores failures and skips `loadStart`); a future retry button would flicker the list. Decide on stale-while-revalidate semantics when Story 3.3+ wires retry.
- **`aria-live="polite"` on the placeholder always announces** — should gate to loading/error transitions; minor a11y polish for a later UX story.
- **`@vitest/ui` shipped as devDep but no `test:ui` script** — add the script or drop the dep; cosmetic.

## Deferred from: code review of story 1-1 (2026-04-29, Run 2)

### Story 1.1 — monorepo scaffold (commit `9e4570e`, hand-rolled chunk only)

- **Add `typecheck` / `format` / `format:check` scripts to root `package.json`** — only `lint` exists, so strict TS is not verified on any PR and `.prettierrc`/`.prettierignore` are decorative. Belongs in CI/orchestration story (1.10/1.11).
- **Add `packageManager` field and pin `.nvmrc` to a 22.x minor** — `engines.node >=22` and `.nvmrc=22` allow drift across 22.x releases. Reproducibility nicety; lockfile already catches the npm-vs-pnpm/yarn divergence in practice.
- **Add `*.tsbuildinfo`, `.turbo/`, `.vercel/` to `.gitignore` and `.prettierignore`** — `incremental: true` in `apps/web/tsconfig.json` will produce `.tsbuildinfo`. Not a problem until tools start generating them; revisit when CI/build artifacts land.
- **Tighten `lint` script to `eslint . --max-warnings=0`** — 4 cosmetic warnings in fastify-cli scaffold currently pass silently. Aligns with the spec's Completion Notes follow-up about real test code replacing the boilerplate.
- **Resolver project paths in `eslint.config.mjs:13` are relative** — works when invoked via `npm run lint` from repo root; falls back to node resolver silently if invoked with a different CWD. Cosmetic for current usage.

## Deferred from: code review of story 1-7 (2026-04-29)

### Story 1.7 — apps/web shell + Tailwind + TodoApp placeholder (commit `6ec778f`)

- **Hydration / FOUC risk for dark-mode users** — `apps/web/src/app/globals.css:15-19`. CSS-only `prefers-color-scheme: dark` swap is hydration-safe in React's strict sense (no JSX branching), but SSG bakes light-mode CSS at build → dark-mode clients see a white-then-flip flash at first paint. Future class-based dark mode (e.g., `next-themes`) needs `html.dark` selector path. Acceptable for v1 MVP; revisit if a no-flicker theme script lands.
- **Geist Google fonts fail at build offline** — `apps/web/src/app/layout.tsx:2`. Air-gapped CI / restrictive corporate proxies / Docker stages without network will hard-fail `next build`. No `fallback` array declared. Mitigate with `fallback: ['system-ui', 'arial']` or vendor Geist via `next/font/local` if/when this becomes a real problem. Story 1.11 deployment-hardening is the natural place.
- **Path alias `@/*` works for TS/TSX but Turbopack doesn't read `tsconfig.paths` for non-TS files** — `apps/web/src/app/page.tsx:1`. Forward-trap: a future contributor importing `@/components/foo.css` or `@/components/icon.svg` will get a Turbopack resolution error even though the editor's TS Language Server resolves it fine. Document in `apps/web/AGENTS.md` or mirror the alias into `next.config.ts` `turbopack.resolveAlias` if it becomes a real problem.
- **No skip-link for keyboard users** — `apps/web/src/app/layout.tsx + page.tsx`. `:focus-visible` ring is in place but no `<a href="#main">Skip to content</a>` exists. Architecture-level a11y addition; not an AC violation for 1.7. Add when the first complex layout (sidebar/header) lands.
- **`<section aria-labelledby="todos-heading">` couples to the in-tree `<h1>` location** — `apps/web/src/components/TodoApp.tsx:5-8`. If a future story moves the `<h1>` into a header bar, `aria-labelledby` dangles and screen readers fall back to "section" with no accessible name. Refactor-time concern.
- **`min-h-full` cascade fragility at extreme viewports** — `apps/web/src/app/layout.tsx:25-30`. Without explicit `height: 100%` on `:root`, edge-case viewports (0px iframes, print stylesheets, unusual zooms) may break the layout. Acceptable for an MVP scaffold; revisit before any iframe-embed or print scenarios.
- **Hard-coded focus outline color `#2563eb` ignores design tokens / dark mode** — `apps/web/src/app/globals.css:24`. Doesn't use `--foreground` or any CSS var. Story spec justifies via WCAG math (7.2:1 / 8.6:1 in both modes — both AAA). Theming concern, not a defect.

## Deferred from: code review of story 1-6 (2026-04-29)

### Story 1.6 — apps/api /health + /docs (commit `e044afa`)

- **`buildProductionTestApp` env mutation is parallel-test-hostile** — `apps/api/test/integration/helpers/buildTestApp.ts:152-180`. `process.env` is process-global; mutating in the build phase poisons concurrent reads in sibling tests until `onClose` restores. Within a single file `node:test` is sequential (safe today); cross-file parallel workers race. Defer to Story 1.11 if/when CI parallelization arrives.
- **`HealthDegradedSchema.checks.db` is always `false` — useless field** — `apps/api/src/routes/health.ts:11-16`. Field shape is decorative until a second probe lands ("API up but cache/queue down"). AC #2 wording locks the current shape; defer reshape to whenever multi-probe arrives.
- **`req.log.warn` throwing inside the 503 path is uncaught** — `apps/api/src/routes/health.ts:30`. Theoretical: Pino doesn't throw in normal operation. Defensive try/catch would be overkill for v1.
- **`/health` 503 schema drift to 500 hazard** — `apps/api/src/routes/health.ts:18-29`. If a future contributor adds a redis/queue check to `HealthDegradedSchema` but not the handler payload, Zod's `.strict()` would cause the response serializer to throw → setErrorHandler → 500. Add a "schema parity test" if/when extending.
- **No test asserts `/health` is rate-limited / behind helmet / CORS** — `apps/api/test/integration/health.int.test.ts`. Story 1.5 deferred-work item AC #3 (rate-limit envelope direct test) covers this turf; adding a `/health`-specific case duplicates that work.
- **`/docs/` HTML test brittle to swagger-ui upgrades** — `apps/api/test/integration/docs.int.test.ts:46-50`. Permissive `text\/html` regex is fine today; future swagger-ui changes (charset negotiation, redirect-target rename) could mask a regression.
- **Pool teardown idempotency masks the deeper architectural concern** — `apps/api/src/plugins/db.ts:23-30`. Even after the message-substring → flag refactor (Story 1.6 patch), the real issue is module-singleton pool ownership. Per-instance pool factory or lazy initialization is the architectural fix. Story 1.11 deployment-hardening is the natural place.

## Deferred from: code review of story 1-5 (2026-04-29)

### Story 1.5 — apps/api GET /todos + plugin stack (commit `727cbad`)

- ~~**Pool singleton can't survive `app.close()` in multi-instance scenarios**~~ — **RESOLVED in Story 1.6** (commit pending). `apps/api/src/plugins/db.ts` now wraps `pool.end()` in a try/catch that swallows the specific "Called end on pool more than once" error message. Multi-instance teardown is idempotent without restructuring pool ownership.
- **`onSend` x-request-id doesn't check headers-sent state** — `apps/api/src/plugins/requestContext.ts:11-13`. If a future stream endpoint begins writing before the hook runs, `reply.header('x-request-id', ...)` is a no-op or throws (Fastify version-dependent). Risk dormant until a streaming endpoint lands; revisit then.
- **AC #3 (429 envelope) direct test** — Story 1.5 Task 12 explicitly cut this; trust the rate-limit plugin's own tests in v1. Story 1.11 (deployment-hardening) is the natural place to revisit with a real exhaustion scenario behind a feature flag.
- **No HTTP header-size cap** — `apps/api/src/server.ts:10`. `bodyLimit: 4096` only caps request bodies. Fastify's default header limits are reasonable; no abuse observed yet. Revisit if hostile-traffic patterns emerge.
- **Logger `LOG_LEVEL` bypasses `@fastify/env` validation** — `apps/api/src/server.ts:12`. Fastify is constructed before `@fastify/env` registers, so the JSON-Schema enum on `LOG_LEVEL` doesn't apply to the logger. Pino throws clearly on truly invalid levels (loud failure, just not "fail-fast" per AC #1's literal wording). Pre-validating env outside `buildApp` adds duplication; defer until value clearly outweighs cost.

## Deferred from: code review of stories 1.1–1.4 (2026-04-29)

### Story 1.4 — apps/api data layer (commit `bd1954f`)

- **Pool not bounded** — `apps/api/src/db/client.ts:10`. No `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, `statement_timeout`. Production tuning concern; the API doesn't serve traffic until Story 1.5. Defer to deploy-readiness story (1.11).
- **No `pool.on('error', ...)` listener** — `apps/api/src/db/client.ts:10`. Idle-client errors crash the process if unhandled. Wire up in Story 1.5 when the API actually owns long-running connections.
- **No graceful shutdown / `pool.end()` on Fastify `onClose`** — `apps/api/src/plugins/db.ts:6-9`. Tests/SIGTERM leak connections. Address when integration tests land in Story 1.5.
- **Module-load throw on missing `DATABASE_URL`** — `apps/api/src/db/client.ts:12-14`. Inhibits unit tests with mocks and tooling that imports schema transitively. Consider lazy init in Story 1.5 when test infrastructure lands.
- **Zod `datetime()` round-trip with Drizzle `Date` objects** — `packages/shared/src/contracts.ts:11` ↔ `apps/api/src/db/schema.ts:7-9`. Surfaces in Story 1.5 when handlers serialize. Fix via `mode: 'string'` on Drizzle column or `.preprocess` on the Zod schema.
- **`migrate.ts` `process.cwd()` coupling** — `apps/api/src/db/migrate.ts:30`. Already disclosed as a Notable Deviation. Harden when module-type decision is made for apps/api.
- **`todos` raw table is exported and not encapsulated** — `apps/api/src/db/schema.ts:3`. The architectural rule "handlers import functions, not raw tables" is documentation-only. Add an ESLint `no-restricted-imports` rule banning `apps/api/src/db/schema` outside `apps/api/src/db/` when more handlers land.
- **Defensive `WHERE hash IS NOT NULL`** — `apps/api/src/db/migrate.ts:87-90`. Safety against drizzle-internal-table corruption. Low priority.
- **`DATABASE_URL` truthy-but-malformed guard** — `apps/api/src/db/client.ts:12-14`. Defensive `URL` parse. Story 1.5 will validate via `@fastify/env`.

### Story 1.3 — docker-compose

- **Volume pruning across schema changes** — `docker-compose.yml:13,21-22`. Operational doc concern; address in Story 1.10's README updates.
- **Host port 5432 collision configurability** — `docker-compose.yml:11`. Operational onboarding note; address in Story 1.10.

### Story 1.2 — shared contracts

- **Zod `datetime()` Date round-trip** — duplicated under Story 1.4 (cross-package issue).
- **`ErrorResponseSchema.statusCode` accepts >599** — `packages/shared/src/contracts.ts:34`. Tighten to `.int().gte(100).lte(599)`. Low priority.
- **contracts.test.ts coverage gaps** — whitespace-only `text`, `completed: null`, `todos: 'not-an-array'`, datetime variants, `Date` instances. Coverage gaps, not bugs.

### Story 1.1 — scaffolding

- **argsIgnorePattern whitelisting in eslint.config.mjs** — `eslint.config.mjs:281-284`. Drop named alternatives in favor of `_request`/`_reply` underscore convention when real API code lands (Story 1.5+).
- **Cross-app ban does not catch dynamic imports** — `eslint.config.mjs:38-50`. Static-analysis only. Add when tooling that uses dynamic imports appears.
- **Cross-app ban scope at repo-root files** — `eslint.config.mjs:51-60`. Files outside `apps/{web,api}/**` globs are not subject to the ban. Minor for v1.
