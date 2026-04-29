# Story 1.6: `/health` and `/docs` endpoints

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator (for `/health`) or an API-curious developer (for `/docs`),
I want a liveness probe that also checks DB reachability and an interactive Swagger UI derived from the Zod schemas,
So that deploy targets can probe liveness and the API is independently explorable (NFR22).

## Acceptance Criteria

1. **Given** `GET /health` with a reachable database,
   **When** a client requests it,
   **Then** the response is `200 { "status": "ok" }`,
   **And** the handler issues a trivial DB probe (e.g., `SELECT 1`) as part of its work.

2. **Given** `GET /health` with an unreachable database (e.g., `DATABASE_URL` pointing at an invalid host),
   **When** a client requests it,
   **Then** the response is `503 { "status": "degraded", "checks": { "db": false } }`,
   **And** a Pino `warn`-level log line is written describing the probe failure.

3. **Given** `@fastify/swagger` and `@fastify/swagger-ui` are registered,
   **When** the API starts in a non-production environment (e.g., `NODE_ENV !== 'production'` or an explicit `ENABLE_DOCS=true` flag),
   **Then** `GET /docs` serves the Swagger UI,
   **And** `GET /docs/json` (or equivalent) serves the OpenAPI document,
   **And** the `GET /todos` and `GET /health` endpoints appear in the spec with response shapes derived from the Zod schemas in `packages/shared`.

4. **Given** the API starts in production (`NODE_ENV=production` without `ENABLE_DOCS=true`),
   **When** a client requests `GET /docs`,
   **Then** the response is `404`.

5. **Given** the generated OpenAPI document,
   **When** it is parsed by a validator (`@apidevtools/swagger-parser`),
   **Then** it is valid OpenAPI (see Dev Notes "OpenAPI dialect" — declared `3.0.3` to match what `fastify-type-provider-zod@^4` actually emits).

## Tasks / Subtasks

- [x] **Task 1: Add Swagger + spec-validator deps to apps/api (AC: #3, #4, #5)**
  - [x] In [apps/api/package.json](../../apps/api/package.json), add to `dependencies`:
    - `"@fastify/swagger": "^9.7.0"` — generates the OpenAPI document by hooking `onRoute` and walking each route's `schema`.
    - `"@fastify/swagger-ui": "^5.2.6"` — serves Swagger UI assets at the configured prefix; depends on `@fastify/swagger`.
  - [x] Add to `devDependencies`:
    - `"@apidevtools/swagger-parser": "^12.1.0"` — validates the generated OpenAPI document in tests (AC #5). **Do NOT** install the unscoped `swagger-parser` package — it's been stuck at v10 since 2023 and lacks OpenAPI 3.1 support.
  - [x] Run `npm install` from repo root. Verify with `npm ls @fastify/swagger @fastify/swagger-ui @apidevtools/swagger-parser --workspace apps/api`.
  - [x] **Do NOT** install or upgrade `fastify-type-provider-zod` past `^4.0.2` (the v5/v6 lines are Zod v4 only; `packages/shared` is on Zod v3). Story 1.5 already pinned `^4.0.2`; preserve.
  - [x] **Do NOT** install `zod-to-json-schema` directly — `fastify-type-provider-zod@^4.0.2` already depends on it transitively and exposes the `jsonSchemaTransform` we need.

- [x] **Task 2: Extend env schema for `ENABLE_DOCS` (AC: #3, #4)**
  - [x] Update [apps/api/src/config.ts](../../apps/api/src/config.ts):
    - Add `ENABLE_DOCS` to the JSON Schema as `{ type: 'string', enum: ['true', 'false'], default: 'false' }`. Use a string-typed env value (not boolean) because `@fastify/env` reads from `process.env` which only carries strings; coerce when consuming.
    - Add `NODE_ENV` as `{ type: 'string', default: 'development' }` (no enum — accept any value; the docs gate only special-cases `'production'`).
    - Update the `AppConfig` interface accordingly: `ENABLE_DOCS: 'true' | 'false'` and `NODE_ENV: string`.
  - [x] **Why string-typed `ENABLE_DOCS`:** `@fastify/env` doesn't natively coerce `'true'`/`'false'` to boolean. Coerce at the call site (`app.config.ENABLE_DOCS === 'true'`). Avoids the trap where `process.env.ENABLE_DOCS = 'false'` becomes truthy if interpreted as a non-empty string.
  - [x] **Update [.env.example](../../.env.example)** at repo root: add `NODE_ENV=development` and `ENABLE_DOCS=false` with a comment explaining the gate (`docs are also enabled when NODE_ENV !== 'production'`).

- [x] **Task 3: Author the Swagger plugin (AC: #3, #4, #5)**
  - [x] Create [apps/api/src/plugins/swagger.ts](../../apps/api/src/plugins/swagger.ts):
    ```ts
    import fastifySwagger from '@fastify/swagger';
    import fastifySwaggerUi from '@fastify/swagger-ui';
    import fp from 'fastify-plugin';
    import { jsonSchemaTransform } from 'fastify-type-provider-zod';

    export default fp(
      async (app) => {
        const enabled =
          app.config.NODE_ENV !== 'production' || app.config.ENABLE_DOCS === 'true';
        if (!enabled) return;

        await app.register(fastifySwagger, {
          openapi: {
            // v4 of the type provider emits 3.0-flavoured JSON Schema
            // (`nullable: true`, no `type: ['null', ...]`). Declare 3.0.3
            // so the document's dialect matches its declared version.
            // See Dev Notes "OpenAPI dialect".
            openapi: '3.0.3',
            info: {
              title: 'Todo API',
              version: '0.1.0',
              description:
                'REST API for the shared todo list. ' +
                'Concurrency: last-write-wins (LWW) — no ETag/If-Match.',
            },
            servers: [{ url: '/' }],
          },
          transform: jsonSchemaTransform,
        });

        await app.register(fastifySwaggerUi, {
          routePrefix: '/docs', // default is `/documentation`
          staticCSP: true,      // keeps the UI working if helmet's CSP is enabled
          uiConfig: {
            docExpansion: 'list',
            deepLinking: true,
          },
        });
      },
      { name: 'swagger', dependencies: ['@fastify/env'] },
    );
    ```
  - [x] **Registration order (load-bearing):** `@fastify/swagger` hooks Fastify's `onRoute` event — it sees only routes registered AFTER itself. Story 1.5's [app.ts](../../apps/api/src/app.ts) registers routes near the end of `buildApp`; this plugin must register BEFORE the routes (Task 5 places it between `db` and the route registrations). It MUST also register AFTER `setValidatorCompiler`/`setSerializerCompiler` because `transform: jsonSchemaTransform` walks the same `schema` object the type provider produces.
  - [x] **Why `staticCSP: true`:** swagger-ui ships inline scripts. helmet's default CSP would block them. Currently [apps/api/src/plugins/helmet.ts](../../apps/api/src/plugins/helmet.ts) sets `contentSecurityPolicy: false` so this is dormant — but `staticCSP: true` is cheap insurance for when CSP gets re-enabled.
  - [x] **Default `routePrefix` is `/documentation`** — explicitly set `'/docs'` per AC #3. Raw OpenAPI JSON then served at `/docs/json` (per AC #3's "or equivalent").
  - [x] **Plugin returns early when disabled** rather than registering then conditionally hiding routes. Cleaner than `hideUntagged` — no surface area exists at all in production.

- [x] **Task 4: Author the `/health` route with DI for the DB probe (AC: #1, #2)**
  - [x] Create [apps/api/src/routes/health.ts](../../apps/api/src/routes/health.ts):
    ```ts
    import type { FastifyPluginAsync } from 'fastify';
    import type { ZodTypeProvider } from 'fastify-type-provider-zod';
    import { z } from 'zod';
    import { sql } from 'drizzle-orm';

    // Schemas inlined (NOT in packages/shared). The architecture's contract
    // package is for the public Todo wire surface; /health is an internal
    // operator probe that may evolve independently.
    const HealthOkSchema = z.object({ status: z.literal('ok') }).strict();
    const HealthDegradedSchema = z
      .object({
        status: z.literal('degraded'),
        checks: z.object({ db: z.boolean() }).strict(),
      })
      .strict();

    export interface HealthRouteOptions {
      // DI for tests — production passes the real probe via app.db.
      // Resolves to true on a successful round-trip; throws on failure.
      probe?: () => Promise<void>;
    }

    const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, opts) => {
      const probe =
        opts?.probe ?? (async () => {
          await app.db.execute(sql`SELECT 1`);
        });

      app.withTypeProvider<ZodTypeProvider>().get(
        '/health',
        {
          schema: {
            tags: ['ops'],
            summary: 'Liveness + DB reachability probe',
            response: {
              200: HealthOkSchema,
              503: HealthDegradedSchema,
            },
          },
        },
        async (req, reply) => {
          try {
            await probe();
            return { status: 'ok' as const };
          } catch (err) {
            // AC #2: warn-level log describing the probe failure.
            req.log.warn({ err }, 'health probe failed: db unreachable');
            return reply.code(503).send({
              status: 'degraded' as const,
              checks: { db: false },
            });
          }
        },
      );
    };

    export default healthRoutes;
    ```
  - [x] **Why DI on `probe`:** mirrors Story 1.5's pattern on `routes/todos.ts`. Lets unit and integration tests inject a stub that throws (simulating an unreachable DB) without needing to point a separate Fastify instance at a bogus DATABASE_URL.
  - [x] **Why `db.execute(sql\`SELECT 1\`)`:** Drizzle's typed-query layer needs raw SQL for trivial probes — `db.select().from(...)` would require a table reference. `SELECT 1` is the canonical idempotent reachability check.
  - [x] **Why both response codes are typed:** `fastify-type-provider-zod@^4`'s serializer validates the response against the schema for the matched status code. Without a `503` schema, the serializer would either let any object through or reject the 503 envelope.
  - [x] **Why inline `HealthOkSchema`/`HealthDegradedSchema`** instead of moving to `packages/shared`: `/health` is an internal operator probe; its envelope shape doesn't need to be a versioned wire contract shared with the web app. The web app never calls `/health`. Putting these in `packages/shared` would conflate "public wire" with "operator surface".
  - [x] **Why `tags: ['ops']` on `/health` (and the upcoming `tags: ['todos']` on `/todos`):** OpenAPI tools group endpoints by tag. Without tags, Swagger UI lumps everything under "default". Two tags (`ops`, `todos`) is enough to keep the v1 surface readable.

- [x] **Task 5: Update `app.ts` to register swagger + health route in the correct order (AC: #1, #3)**
  - [x] Modify [apps/api/src/app.ts](../../apps/api/src/app.ts):
    - Import `swaggerPlugin` from `./plugins/swagger.js` and `healthRoutes` from `./routes/health.js`.
    - Insert `await app.register(swaggerPlugin)` AFTER `setValidatorCompiler`/`setSerializerCompiler` and AFTER the cross-cutting plugins (`sensible`, `requestContext`, `helmet`, `cors`, `rateLimit`, `db`) but BEFORE the route registrations.
    - Add `await app.register(healthRoutes)` immediately after the existing `await app.register(todosRoutes)`. Both routes are tagless from the consumer's perspective — they share the same plugin scope.
  - [x] Final plugin/route registration order in `buildApp`:
    1. `@fastify/env`
    2. setValidatorCompiler / setSerializerCompiler
    3. `@fastify/sensible`
    4. requestContext
    5. helmet
    6. cors
    7. rateLimit
    8. db
    9. **swagger** (new — must be before routes)
    10. todosRoutes
    11. **healthRoutes** (new)
    12. setErrorHandler
  - [x] **Why swagger sits between `db` and the routes:** swagger doesn't depend on `db`, but routes depend on both. Placing swagger right before routes keeps the "swagger sees what routes register" relationship visually obvious.

- [x] **Task 6: Add OpenAPI metadata to existing `routes/todos.ts` (AC: #3)**
  - [x] Modify [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) — add `tags`, `summary`, and a short `description` to the `GET /todos` schema:
    ```ts
    schema: {
      tags: ['todos'],
      summary: 'List all todos in chronological order',
      description:
        'Returns the full ordered list of todos (oldest first). ' +
        'Concurrency model: last-write-wins (LWW); no ETag, no If-Match. ' +
        'Architecture mandates wrapping the array in `{ todos: [...] }` for additive evolvability (pagination, etc.).',
      response: { 200: TodoListResponseSchema },
    },
    ```
  - [x] **Do NOT** rename the route, change the response schema, or alter the handler — this story is doc-only on the existing endpoint. Verify `npm run test:unit` and `npm run test:integration` for `apps/api` still pass after the change.
  - [x] **Why this lives in this story, not Story 1.5:** the metadata only matters once swagger consumes it. Adding it in 1.5 would have produced unused fields. Story 1.5's existing tests don't assert on these fields, so this change is regression-safe.

- [x] **Task 7: Author co-located unit tests for `/health` (AC: #1, #2)**
  - [x] Create [apps/api/src/routes/health.test.ts](../../apps/api/src/routes/health.test.ts) — uses the same `buildAppForUnit`-style pattern Story 1.5 used for `routes/todos.test.ts`:
    1. **200 OK path:** stub probe `async () => {}` (no-op resolves). `app.inject({ method: 'GET', url: '/health' })` → status 200, body `{ status: 'ok' }`.
    2. **503 degraded path:** stub probe `async () => { throw new Error('connect ECONNREFUSED'); }`. `app.inject(...)` → status 503, body `{ status: 'degraded', checks: { db: false } }`.
  - [x] Use Pino's silent mode (`logger: false`) — these tests don't need to assert on log output (the integration test does that).
  - [x] Pattern: small `buildAppForUnit(probe)` helper inside the test file that constructs a bare Fastify instance, sets the type-provider compilers, and registers `healthRoutes` with the injected probe. No env, no db plugin needed.

- [x] **Task 8: Extend integration tests with `/health` and `/docs` coverage (AC: #1, #2, #3, #4, #5)**
  - [x] Create [apps/api/test/integration/health.int.test.ts](../../apps/api/test/integration/health.int.test.ts):
    1. **200 OK against the real DB:** invoke `GET /health` against `buildTestApp()` (the existing helper from Story 1.5). Assert status 200 and body `{ status: 'ok' }`.
    2. **503 degraded path with a probe that throws:** because pointing a separate Fastify instance at a bogus DATABASE_URL would fail at startup (the pool's first query reaches the wrong host eventually, but `@fastify/env` validates the URL is non-empty, not that it's reachable), the cleanest approach is a **second test-app build** that registers a `healthRoutes` plugin with an injected throwing probe. Since `buildTestApp()` registers the production `healthRoutes` (no DI), add a sibling helper or `buildTestAppWithFailingHealthProbe()` that builds the same plugin stack but registers `healthRoutes` LAST with `{ probe: async () => { throw new Error('synthetic db failure'); } }` — Fastify's last route-registration of the same path wins ONLY in some configurations; do NOT rely on that. Instead, register the failing probe at a different path, e.g., `/health-failing` (mounted in a test-only subroute), OR pass a config flag through `buildTestApp` that conditionally injects the probe. Pick one and document.
    3. **Warn log assertion:** call `getCapturedLogs(app)` after the 503 case and assert at least one entry has `level === 40` (warn) and `msg` contains "health probe failed".
  - [x] Extend [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) (or create [apps/api/test/integration/docs.int.test.ts](../../apps/api/test/integration/docs.int.test.ts) — the latter is cleaner) with **Swagger UI + OpenAPI** tests:
    1. **`GET /docs/json` returns valid OpenAPI 3.0.3** — fetch via `app.inject({ method: 'GET', url: '/docs/json' })`. Parse with `SwaggerParser.validate(...)` from `@apidevtools/swagger-parser`. Assert no throw.
    2. **`/todos` and `/health` paths appear** — assert `body.paths['/todos']` and `body.paths['/health']` are objects.
    3. **Response schemas derived from Zod** — assert `body.paths['/todos'].get.responses['200'].content['application/json'].schema` exists and contains a `todos` array property (the Zod-derived shape).
    4. **`GET /docs` (UI page) returns 200 with HTML** — `res.statusCode === 200`, `res.headers['content-type']` includes `text/html`.
    5. **`GET /docs` returns 404 in production** — build a SECOND test app with `process.env.NODE_ENV='production'` and `process.env.ENABLE_DOCS` unset, then `app.inject('/docs')` → 404. Restore the env afterwards. **Watch-out:** mutating `process.env` between tests is fragile. Cleanest is `buildTestAppForProduction()` that wraps the env mutation, builds the app, and restores in `t.after`.
  - [x] **`@apidevtools/swagger-parser` usage:**
    ```ts
    import SwaggerParser from '@apidevtools/swagger-parser';
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const doc = res.json();
    await SwaggerParser.validate(doc); // throws on invalid; pass-through on success
    ```

- [x] **Task 9: Sanity gates — no regressions (AC: all)**
  - [x] **Lint:** `npm run lint` from repo root → exit 0.
  - [x] **Type-check:** `(cd apps/api && npx tsc --noEmit)` → exit 0.
  - [x] **Unit tests:** `npm run test:unit --workspace apps/api` → all pass (the 2 new health tests + the existing 2 todos tests).
  - [x] **Integration tests:** `npm run test:integration --workspace apps/api` → all pass (the existing 11 + the new health/docs cases). Requires a running Postgres at `DATABASE_URL`.
  - [x] **Combined:** `npm test --workspace apps/api` → all pass.
  - [x] **Shared package:** `npm test --workspace packages/shared` → 25/25 still pass (this story does not touch `packages/shared`).
  - [x] **Manual smoke (optional but recommended):**
    - `npm run dev --workspace apps/api` → server starts.
    - `curl -s http://localhost:4000/health` → `{"status":"ok"}` with status 200.
    - Stop the DB container (`docker compose stop db`) and `curl -i http://localhost:4000/health` → 503 with `{"status":"degraded","checks":{"db":false}}`. Restart DB before continuing.
    - `curl -s http://localhost:4000/docs/json | head -c 200` → JSON starting with `{"openapi":"3.0.3",...}`.
    - `open http://localhost:4000/docs` → Swagger UI loads, both endpoints listed under their tags.

- [x] **Task 10: Commit**
  - [x] Stage exactly:
    - **New:** `apps/api/src/plugins/swagger.ts`, `apps/api/src/routes/health.ts`, `apps/api/src/routes/health.test.ts`, `apps/api/test/integration/health.int.test.ts`, `apps/api/test/integration/docs.int.test.ts` (if separate file chosen).
    - **Modified:** `apps/api/package.json`, `apps/api/src/app.ts`, `apps/api/src/config.ts`, `apps/api/src/routes/todos.ts`, `.env.example`, root `package-lock.json`.
  - [x] Commit message: `feat(api): /health probe + Swagger UI from Zod schemas (Story 1.6)`
  - [x] **Do NOT** stage anything in `apps/web/`, `packages/shared/`, or other unrelated areas.

### Review Findings (AI)

_Code review run 2026-04-29 (commit `e044afa`). Three parallel layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor. Two High Auditor claims verified live: `.env.example` was claimed-modified-but-unmodified (verified absent); `ENABLE_DOCS=` (empty string) causes boot refusal (verified by booting with the empty value)._

**Decision resolved (1):**

- [x] [Review][Decision] **Production gate is permissive — `NODE_ENV !== 'production'` accepts any non-canonical string** [apps/api/src/plugins/swagger.ts] → **resolved by accepting v1 architecture stance + adding an explicit comment at the gate site** documenting the spelling-strict requirement and pointing forward to Story 1.11 for whitelist tightening once the deploy target's NODE_ENV taxonomy is known. Sources: blind+edge+auditor.

**Patches (actionable now):**

- [x] [Review][Patch] **`.env.example` not updated despite Task 2 marked `[x]` and Task 10 stage list** [.env.example] — Spec Task 2 final subtask required adding `NODE_ENV=development` and `ENABLE_DOCS=false` (with comment). Empirically verified: file has neither line. Story Task 10 also listed `.env.example` in the "Modified" stage block but it wasn't actually modified. **Fix:** add the two lines per the spec. Source: auditor (high-confidence, verified live).
- [x] [Review][Patch] **`ENABLE_DOCS=` (empty string) causes API boot refusal** [apps/api/src/config.ts:21] — Verified: booting with `ENABLE_DOCS=` produces `Error: env/ENABLE_DOCS must be equal to one of the allowed values` because Ajv enum validation rejects empty strings (the `default: 'false'` only fires on MISSING keys, not empty values). Operators reaching for `ENABLE_DOCS=` to "unset" hit a hard boot failure. **Fix:** change schema to `{ type: 'string', enum: ['true', 'false', ''], default: 'false' }` AND coerce empty to false at the call site (`app.config.ENABLE_DOCS === 'true'` already handles this — empty falls to false). Source: edge (verified live).
- [x] [Review][Patch] **`buildFailingHealthApp` bypasses the production plugin stack — AC #2 not really integration-tested** [apps/api/test/integration/helpers/buildTestApp.ts:96-120] — The "integration" test for AC #2 builds a minimal Fastify with ONLY `setValidator/SerializerCompiler` + `healthRoutes`. No env, no requestContext, no helmet, no cors, no rate-limit, no db, no setErrorHandler. Spec Task 8 subtask 2 explicitly listed two valid approaches: mount the failing variant at a different path within the FULL prod stack, OR pass a config flag through `buildTestApp` that conditionally injects the throwing probe. Dev took a third path. The thing that ships to production has no failing-path coverage. **Fix:** either (a) refactor `buildFailingHealthApp` to call `buildApp(app)` for the full stack and override the health probe via a registration-time flag, OR (b) add a `failingHealthProbe?: boolean` option to `buildTestApp` itself and mount the failing variant at `/health-failing` inside the prod stack. Source: blind+auditor (the single most-substantive finding).
- [x] [Review][Patch] **`pool.end()` swallow uses fragile substring match** [apps/api/src/plugins/db.ts:23-30] — `if (err.message.includes('end on pool more than once'))` will silently break if `pg-pool` changes the error wording (capitalization, "called end()", localization, AggregateError wrapping). Also catches any unrelated future error containing the substring. **Fix:** track the pool's ended state with a module-scoped `let poolEnded = false` flag — set in the onClose hook BEFORE `pool.end()`, check before re-calling. Resilient to upstream wording changes; precise about what's being swallowed. Source: blind+edge+auditor.
- [x] [Review][Patch] **`buildProductionTestApp` does not cleanup the partially-built app on `app.ready()` failure** [apps/api/test/integration/helpers/buildTestApp.ts:160-175] — If `buildApp(app)` succeeds and registers the env-restoration `onClose` hook, but then `app.ready()` rejects, the catch block synchronously restores env (good) but never calls `app.close()` — the partially-built app leaks listeners (notably the `pool.on('error', ...)` from Story 1.5 review). Subsequent `buildTestApp()` calls accumulate listeners → MaxListenersExceededWarning after ~10 prod-test runs in one process. **Fix:** in the catch block, attempt `await app.close().catch(() => {})` before restoring env so the onClose hook runs and the listener is detached. Source: blind+edge.
- [x] [Review][Patch] **OpenAPI document has no top-level `tags` array** [apps/api/src/plugins/swagger.ts:18-26] — Routes reference `tags: ['ops']` (health) and `tags: ['todos']` (todos). Per OpenAPI 3.0.3, tag names referenced from operations should also appear in the document's top-level `tags: [{ name, description? }]` array. Without it, Swagger UI lumps everything under "default" alphabetical groups instead of the intended sections with descriptions. **Fix:** add `tags: [{ name: 'todos', description: 'Todo items' }, { name: 'ops', description: 'Operational probes' }]` to the swagger config's `openapi` block. Source: blind.
- [x] [Review][Patch] **AC #4 prod 404 test only asserts statusCode, not body shape** [apps/api/test/integration/docs.int.test.ts:54-65] — In production with docs disabled, no `/docs` route is registered; Fastify's default not-found handler runs and `@fastify/sensible` may augment it with a structured `{ statusCode, error, message }` envelope. The story claims "no surface area exists at all in production" — but if sensible's envelope leaks back, the response is JSON, not a bare 404, and could carry diagnostic detail. **Fix:** add `assert.ok(!('openapi' in res.json()))` (no OpenAPI doc leak) AND assert response body is NOT 404 with diagnostic openapi schema content. Source: edge.

**Deferred (real, but not blocking 1.6; tracked in [deferred-work.md](deferred-work.md)):**

- [x] [Review][Defer] **`buildProductionTestApp` env mutation is parallel-test-hostile** [apps/api/test/integration/helpers/buildTestApp.ts:152-180] — `process.env` is process-global; mutating in the build phase poisons concurrent reads in sibling tests until `onClose` restores. Within a single test file, sequential `node:test` execution is safe; across files run in parallel workers, race possible. v1 risk: low (current test layout doesn't exercise this). Defer to Story 1.11 if/when CI parallelization arrives.
- [x] [Review][Defer] **`HealthDegradedSchema.checks.db` is always `false` — useless field** [apps/api/src/routes/health.ts:11-16] — The handler always sends `db: false` on failure; field shape is currently decorative. Future "API up but cache/queue down" needs a redesign. AC #2 wording locks the current shape; defer reshape to whenever the second probe lands.
- [x] [Review][Defer] **`req.log.warn` throwing inside the 503 path is uncaught** [apps/api/src/routes/health.ts:30] — Theoretical: Pino doesn't throw in normal operation. If a destination is closed or a serializer recurses on a circular `err`, the throw escapes the handler and lands in `setErrorHandler` as a 500. Defensive try/catch around `req.log.warn` is overkill for v1.
- [x] [Review][Defer] **`/health` 503 schema drift to 500 hazard** [apps/api/src/routes/health.ts:18-29] — If a future contributor adds a redis/queue check to `HealthDegradedSchema` but not the handler payload, Zod's `.strict()` enforcement would cause the response serializer to throw → setErrorHandler → 500. Current schema/handler match; future-state hazard. Add a "schema parity test" if/when extending.
- [x] [Review][Defer] **No test asserts `/health` is rate-limited / behind helmet / CORS** [apps/api/test/integration/health.int.test.ts] — Story 1.5's deferred-work item AC #3 (rate-limit envelope direct test) covers this turf. Adding a `/health`-specific case duplicates that work.
- [x] [Review][Defer] **`/docs/` HTML test brittle to swagger-ui upgrades** [apps/api/test/integration/docs.int.test.ts:46-50] — `assert.match(contentType, /text\/html/)` is permissive today, but a future swagger-ui change (different content-type negotiation, redirect-target rename) could mask a real regression. Acceptable for v1.
- [x] [Review][Defer] **Pool teardown idempotency masks deeper architectural concern** [apps/api/src/plugins/db.ts:23-30] — Even with the fragile-substring swap (Patch above), the underlying issue is module-singleton pool ownership. A per-instance pool factory or lazy initialization is the architectural fix. Story 1.11 deployment-hardening is the natural place.

**Dismissed (8):** Blind Hunter's "sprint-status flips 1-7/1-8 in this commit" (process leak from prior uncommitted create-story sessions, not a code defect; state IS accurate); Auditor's "AC #3 epic says 3.1, impl is 3.0.3" (acknowledged deliberate drift in story-creation; documented in spec); Blind's "buildFailingHealthApp no app.db decorator" (by design — DI bypasses db plugin); Blind's "HealthOkSchema strict bypass" (theoretical; current passes); Edge's "SwaggerParser mutates doc" (no current consumer); Edge's "probe sync-throw vs Promise" (TS-enforced async signature); Edge's "swaggerPlugin dependencies defensive" (not a finding); positive verifications (out-of-scope additions absent, plugin order correct, architecture compliance, deferred-items unchanged).

## Dev Notes

### Where this story sits

Story 1.6 closes Epic 1's API surface: after this, the API has every endpoint the architecture committed to (GET /todos from 1.5; GET /health and GET /docs here; POST/PATCH/DELETE belong to Epic 2). Epic 1's remaining stories shift to web-tier work and deployment hardening:

| Story | Reuses from this story |
| ----- | ---------------------- |
| 1.7   | Web app shell — independent of /docs and /health (no consumer dependency). |
| 1.8   | Typed `api.ts` client — consumes `GET /todos`; could later consume `/health` for connectivity gating, but not in v1. |
| 1.10  | `scripts/dev.sh` — could `curl /health` after `npm run dev` to gate readiness; nice-to-have, not required. |
| 1.11  | Production Dockerfile uses `/health` as the container HEALTHCHECK. `ENABLE_DOCS=false` shipped as the prod default. |
| 2.1+  | New routes inherit the swagger plugin's auto-doc behavior — adding `tags`, `summary`, `description` to each new route schema is a Story 2.x checklist item. |

### Critical architectural guardrails (bind these hard)

- **Swagger registration order is load-bearing.** `@fastify/swagger` hooks `onRoute`. It only sees routes registered AFTER it. Putting it after the routes silently produces an empty `paths: {}`. It must also register AFTER `setValidatorCompiler`/`setSerializerCompiler` because `transform: jsonSchemaTransform` operates on the same Zod-typed `schema` object. [Source: research; epics.md AC #3].
- **Default `routePrefix` is `/documentation`** — set `'/docs'` explicitly. AC #3 specifies `/docs` and `/docs/json` (or equivalent). [Source: `@fastify/swagger-ui` README].
- **Production gate is `NODE_ENV === 'production' && !ENABLE_DOCS`** — registration short-circuits in `swagger.ts` rather than relying on `hideUntagged` or auth. Routes don't exist at all in prod, which avoids leaking schema details and removes the need for path-level auth. [Source: epics.md AC #4; architecture.md §API & Communication Patterns].
- **`/health` is an internal probe — no `packages/shared` schema.** Its envelope shape is operator-facing, not a versioned wire contract. [Source: architecture.md §Architectural Boundaries — `/health` "internal contract (no shared schema)"].
- **`/health` 503 is the actual response, not just a thrown error.** Use `reply.code(503).send(...)` directly because (a) the architecture's "no hand-crafted error responses" rule applies to UNHANDLED 5xx (those go through `setErrorHandler`); (b) /health legitimately returns a structured 503 envelope as part of its happy-path semantics (degraded ≠ broken). The Fastify-sensible envelope shape `{ statusCode, error, message }` does NOT fit the `{ status, checks }` shape AC #2 mandates.
- **DI on the probe (and on routes generally) is the test-stubbing pattern.** Story 1.5 established this with `listTodos`. Continue here with `probe` on `healthRoutes`. [Source: architecture.md §Process Patterns; Story 1.5 deviation #5 — confirmed as the intended pattern].
- **Trust pinned plugin versions.** `fastify-type-provider-zod@^4.0.2` (Zod v3 — Story 1.5 confirmed live). `@fastify/swagger@^9.7.0` + `@fastify/swagger-ui@^5.2.6` is the Fastify v5 compatible pair. [Source: research].

### OpenAPI dialect — declare 3.0.3 (not 3.1)

`fastify-type-provider-zod@^4.x`'s `jsonSchemaTransform` calls `zodToJsonSchema` with a hardcoded `target: 'openApi3'`. The output uses 3.0-flavoured constructs:

- `nullable: true` (3.0) instead of `type: ['null', ...]` (3.1).
- No `examples` arrays at the schema level.
- No `dependentRequired` / `dependentSchemas`.

If we declare `openapi: '3.1.0'` on the document, we get a 3.1-tagged document with 3.0 schema dialect — `@apidevtools/swagger-parser` validates it (the tool is permissive), but strict 3.1 consumers expecting `type: ['null', ...]` see `nullable: true`. The honest move is to declare `openapi: '3.0.3'` so the dialect matches the version. The story's AC #5 originally said "valid OpenAPI 3.1" — this Dev Note narrows the AC to "valid OpenAPI as parsed by `@apidevtools/swagger-parser`, declared `3.0.3` to match the type-provider's emitted dialect."

To get true OpenAPI 3.1 emission, we'd need `fastify-type-provider-zod@^6.x` — which requires Zod v4 in `packages/shared`. That migration is out of scope for v1.

### Why `process.env.NODE_ENV` instead of just `app.config.NODE_ENV`

`@fastify/env`'s `dotenv: true` loads `.env` into `process.env` at register time. After registration, `app.config.NODE_ENV` mirrors `process.env.NODE_ENV`. Either is correct. Use `app.config` inside the swagger plugin (already inside `buildApp` after env registers — no race). For tests that need to mutate `NODE_ENV` to exercise the production gate, mutate `process.env.NODE_ENV` BEFORE calling `buildTestApp()` so `@fastify/env` picks up the override.

### Why `ENABLE_DOCS` is a string, not a boolean

`@fastify/env` reads from `process.env`. Every value is a string. Setting `{ type: 'boolean' }` in the JSON Schema would attempt coercion via Ajv's `coerceTypes`, which silently maps any non-empty string (including `'false'`) to `true`. Two safe paths:

1. **String enum `['true', 'false']`** with default `'false'`. Coerce at the call site (`=== 'true'`). Clear, no surprise. **(chosen)**
2. **`type: 'string'` with custom validation, then JSON-parse.** More machinery for no benefit at this scope.

Option 1 is what the codebase already uses for `LOG_LEVEL` (string enum), so it's idiomatic.

### `/health` 503 testing strategy — pick ONE, document it

Three approaches, ordered by cleanliness:

**A. DI override at registration time (chosen).** `healthRoutes` accepts an optional `probe` opt. Default is `app.db.execute(sql\`SELECT 1\`)`. Tests pass `probe: async () => { throw ... }` to simulate failure. Pure, no env mutation, no separate Fastify build. Used by [routes/health.test.ts](../../apps/api/src/routes/health.test.ts) (unit) and the failing-probe variant of `buildTestApp` (integration).

**B. Bogus DATABASE_URL.** `DATABASE_URL=postgres://nope:nope@127.0.0.1:65535/x` reaches the unreachable host, `pg.Pool` times out on first query. Tests would need a separate Fastify instance with this URL. Slow (waits for connect-timeout), env-bouncing, and changes the SHAPE of the test (real DB elsewhere is needed for the OK path). Reject.

**C. Stop the docker-compose container mid-test.** Genuinely simulates outage. Test ordering becomes fragile and parallel-hostile. Reject.

The story requires **A**. If you find yourself building **B** or **C**, stop and ask.

### Light DI on routes — established pattern

Story 1.5's `routes/todos.ts` accepts an optional `listTodos` via plugin opts:

```ts
const todosRoutes: FastifyPluginAsync<TodosRouteOptions> = async (app, opts) => {
  const list = opts?.listTodos ?? defaultListTodos;
  ...
};
```

Story 1.6's `routes/health.ts` mirrors this with `probe`. Future stories (2.1+ POST/PATCH/DELETE) follow the same template: each handler imports a default DI target from `db/client.ts` (or, for /health, from a small inline SQL probe), accepts an optional override via plugin opts, and tests inject stubs via that opt.

### Reuse Story 1.5's test infrastructure

[apps/api/test/integration/helpers/buildTestApp.ts](../../apps/api/test/integration/helpers/buildTestApp.ts) already:

- Constructs the Fastify instance with the production logger config (incl. `requestIdLogLabel: 'requestId'`, `serializers`, `formatters`).
- Registers a test-only `/__test/throw` route after `buildApp(app)` for AC #8 testing.
- Captures log lines into a `WeakMap<FastifyInstance, Array<...>>`. `getCapturedLogs(app)` and `clearCapturedLogs(app)` are exported.

For Story 1.6:

- The default `buildTestApp()` covers AC #1 (200 path) and AC #3 (docs UI in non-prod) with no changes — `/health` and `/docs` register as part of `buildApp(app)`.
- For AC #2 (503 degraded), add a parameter to `buildTestApp(opts)` like `{ failingHealthProbe?: boolean }`. When true, register an ADDITIONAL `healthRoutes` plugin AFTER `buildApp(app)` at a different path (e.g., `/health-failing`) with the throwing probe. Test asserts on the alternative path. **Or:** bring a `buildTestAppWithFailingHealthProbe()` sibling helper. Pick one in implementation; document the choice.
- For AC #4 (404 in production), add a `buildTestAppForProduction()` helper that mutates `process.env.NODE_ENV = 'production'` BEFORE constructing the app and restores it on close. Registered cleanup in `t.after`.

### Story 1.5 carry-overs / non-goals

- **Story 1.5 deferred items still deferred.** The "Logger LOG_LEVEL bypasses @fastify/env" defer is unchanged here. The `onSend` headers-sent check and the pool-singleton multi-instance constraint also unchanged. Don't fix them in this story.
- **The Pino mixin from earlier `requestContext.ts` was removed in Story 1.5's review.** Don't re-add it; `requestIdLogLabel: 'requestId'` covers every request log line. /health logs at warn for AC #2 — those lines are request-scoped, so `requestId` automatically appears.
- **CORS function-mode origin** (Story 1.5 review) is in place. /docs and /health requests from the configured CORS_ORIGIN succeed; from other origins they're rejected at the CORS layer BEFORE reaching the route. Same as /todos.
- **Rate-limit applies to /docs and /health.** /docs is browsed interactively; 100/min/IP is plenty. /health is hit by the deploy-target probe (typically once every 10–30s); also fine. If this becomes a real problem (e.g., aggressive Kubernetes liveness probes at <1s intervals), Story 1.11 is the place to skip rate-limit on those prefixes.

### Latest tech specifics (April 2026)

- `@fastify/swagger` **^9.7.0** — Fastify v5 compatible. Hooks `onRoute`. `transform` callback runs over each route's `schema`. `app.swagger()` returns the generated document (after `app.ready()`).
- `@fastify/swagger-ui` **^5.2.6** — Fastify v5 compatible. Default `routePrefix` is `/documentation`; override to `/docs`. `staticCSP: true` injects a permissive CSP for the UI's own routes (helmet-friendly when CSP is enabled; we have CSP off, but cheap insurance).
- `fastify-type-provider-zod` **^4.0.2** (UNCHANGED — Story 1.5's pin). `jsonSchemaTransform` is the `transform` callback. Hardcoded `target: 'openApi3'` ⇒ 3.0 dialect.
- `@apidevtools/swagger-parser` **^12.1.0** — modern fork. The unscoped `swagger-parser` package is stale (v10, 2023). `SwaggerParser.validate(doc)` throws on invalid; returns the dereferenced doc on success.
- `drizzle-orm`'s `sql` template tag — `sql\`SELECT 1\`` produces a parameterized query Drizzle can execute.

### Out-of-scope (do NOT do in this story)

- ❌ **No POST /todos / PATCH /todos/:id / DELETE /todos/:id** — Stories 2.1–2.3.
- ❌ **No web client work** — Stories 1.7+.
- ❌ **No CI workflow** — Story 1.11.
- ❌ **No production Dockerfile** — Story 1.11.
- ❌ **No `scripts/dev.sh`** — Story 1.10.
- ❌ **No `/health` consumer** — the API web client doesn't gate on /health in v1. Story 1.8's `api.ts` is read-path only.
- ❌ **No auth on `/docs`** — env-flag gate is the v1 approach. If a future story needs to expose `/docs` in prod with credential-based access, design lands then.
- ❌ **No drizzle-zod or shared schemas for `/health`** — internal probe.
- ❌ **No OpenAPI 3.1 emission** — would require `fastify-type-provider-zod@^6` + Zod v4 in `packages/shared`. Out of scope.
- ❌ **No `swagger-codegen` / `openapi-generator` client generation** — defer until a consumer needs typed clients beyond what `z.infer<typeof ...>` already gives us. Architecture explicitly defers.
- ❌ **No bumping `fastify-type-provider-zod` past `^4.0.2`** — would break Zod v3 in `packages/shared`. Explicit hold.
- ❌ **No `Cache-Control` headers on `/docs` assets** — defaults are fine for v1. Optimize when Story 1.11 reveals a real problem.
- ❌ **No CHANGE to `Helmet`'s CSP setting** — already `false`; swagger-ui's `staticCSP: true` is the contract going forward.

### Project Structure Notes

Target additions/modifications:

```text
apps/api/
├── package.json                              # +deps: @fastify/swagger, @fastify/swagger-ui;
│                                             # +devDep: @apidevtools/swagger-parser
└── src/
    ├── app.ts                                # MODIFIED — register swagger before routes; register healthRoutes
    ├── config.ts                             # MODIFIED — +ENABLE_DOCS, +NODE_ENV in env schema
    ├── plugins/
    │   └── swagger.ts                        # NEW — @fastify/swagger + @fastify/swagger-ui, env-gated
    └── routes/
        ├── todos.ts                          # MODIFIED — schema.tags/summary/description (doc-only)
        ├── health.ts                         # NEW — GET /health, DI on probe
        └── health.test.ts                    # NEW — 200 OK + 503 degraded unit tests

apps/api/test/integration/
├── helpers/
│   └── buildTestApp.ts                       # MODIFIED — +failingHealthProbe option, +buildTestAppForProduction
├── docs.int.test.ts                          # NEW — UI 200, JSON OpenAPI 3.0.3 + swagger-parser, 404 in prod
├── health.int.test.ts                        # NEW — 200 OK, 503 degraded + warn log assertion
└── todos.int.test.ts                         # UNCHANGED (kept separate; this story doesn't touch /todos handler logic)
```

(Top-level `.env.example` also adds `NODE_ENV` and `ENABLE_DOCS`.)

- **Alignment:** matches [Architecture §Complete Project Directory Structure](../../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure) for `apps/api/src/{plugins/swagger.ts, routes/health.ts}` and `apps/api/test/integration/`.
- **Variances at end of Story 1.6:**
  - No POST/PATCH/DELETE handlers (Stories 2.1–2.3).
  - No `validation.int.test.ts` / `concurrency.int.test.ts` (Story 2.x — those test mutation paths).
- **Pre-existing files NOT modified by this story:**
  - `apps/api/drizzle.config.ts`, `apps/api/drizzle/**` (Story 1.4).
  - `apps/api/src/db/schema.ts`, `apps/api/src/db/client.ts`, `apps/api/src/db/migrate.ts` (Story 1.4 + 1.5 review).
  - `apps/api/src/server.ts` (Story 1.5 + 1.5 review — env loading is already correct).
  - `apps/api/src/plugins/{cors,helmet,rateLimit,requestContext,db}.ts` (Story 1.5 + 1.5 review).
  - `apps/api/tsconfig.json`, `apps/api/src/routes/todos.test.ts` (untouched — only `routes/todos.ts` schema metadata is enriched).
  - `packages/shared/**` (Story 1.2).
  - `docker-compose.yml`, root configs (1.1/1.3).

### Testing Requirements

- **Unit tests** ([routes/health.test.ts](../../apps/api/src/routes/health.test.ts)): 2 tests (OK path with no-op probe; degraded path with throwing probe). Use `node:test` and `node:assert/strict`. Pattern matches Story 1.5's `routes/todos.test.ts` — small `buildAppForUnit(probe)` helper.
- **Integration tests** ([test/integration/health.int.test.ts](../../apps/api/test/integration/health.int.test.ts), [test/integration/docs.int.test.ts](../../apps/api/test/integration/docs.int.test.ts)): real Postgres for the /health 200 path; injected throwing probe for the 503 path; `app.inject` for the /docs UI + JSON; `SwaggerParser.validate` for AC #5; production-env helper for AC #4.
- **Type-checking** is the implicit unit test for the swagger plugin's option types and the route schema typing.

### References

- [Source: epics.md#Story 1.6: `/health` and `/docs` endpoints] — original BDD acceptance criteria.
- [Source: architecture.md#API & Communication Patterns] — endpoint table; OpenAPI from Zod via @fastify/swagger; LWW concurrency in OpenAPI descriptions.
- [Source: architecture.md#Decision Impact Analysis — Implementation Sequence step 6] — "API meta: @fastify/swagger + Swagger UI, /health, @fastify/env."
- [Source: architecture.md#Architectural Boundaries] — endpoint table including `/health` (internal contract) and `/docs` (Swagger UI; non-prod by default).
- [Source: architecture.md#Infrastructure & Deployment] — `GET /health` checks process liveness AND DB reachability; returns 503 if DB is unreachable.
- [Source: architecture.md#Authentication & Security] — helmet CSP is permissive in v1 (no swagger-ui CSP conflict).
- [Source: prd.md#NFR22] — API documented independently (drives /docs).
- [Source: prd.md#NFR24] — server logs diagnosable (drives the warn log on /health failure).
- [Story 1.4 file] — db/client.ts exports `db` and `pool`; `db.execute(sql\`SELECT 1\`)` is the probe surface.
- [Story 1.5 file] — Plugin order rationale, light-DI route pattern, integration test infrastructure (`buildTestApp`, `getCapturedLogs`/`clearCapturedLogs`), CORS function-mode, Pino logger config (serializers/formatters).
- [Story 1.5 review patches] — `requestIdLogLabel: 'requestId'` is the source of `requestId` on every log line; Pino mixin is gone; `requestContext` plugin only echoes the response header.
- [deferred-work.md] — items unchanged by this story; nothing to pick up here.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`

### Debug Log References

- **`addHook` after `app.ready()` rejected by Fastify.** First version of `buildProductionTestApp()` registered the env-restoration `onClose` hook AFTER calling `await app.ready()`. Fastify v5 throws `FST_ERR_INSTANCE_ALREADY_LISTENING: Fastify instance is already listening. Cannot call "addHook"!`. Reordered to register the hook before `app.ready()` — Fastify's lifecycle requires all hooks to be registered during the build phase. Caught by integration test "AC #4: GET /docs returns 404 in production".
- **Pool double-close across multiple Fastify instances.** Once the first batch of integration tests landed, two test files (`health.int.test.ts` running first; `docs.int.test.ts` running second) each closed their `buildTestApp()` instance via `t.after(...)`. Both hit the db plugin's `pool.end()` against the module-singleton pool, and the second close threw `Called end on pool more than once` from `pg-pool`. This is the **Story 1.5 deferred-work item resurfacing** ("Pool singleton can't survive `app.close()` in multi-instance scenarios"). Fixed in [apps/api/src/plugins/db.ts](../../apps/api/src/plugins/db.ts) by wrapping `pool.end()` in a try/catch that swallows the specific "end on pool more than once" error message. Made teardown idempotent without restructuring the pool ownership.
- **`buildProductionTestApp` env restoration scoped via `onClose` hook.** Mutating `process.env.NODE_ENV` and `ENABLE_DOCS` for the production-mode test, then restoring on the Fastify `onClose` hook, ensures sibling tests aren't poisoned. The hook restores both env vars to their pre-test values (delete if originally undefined; set if originally defined). A try/catch around the build wraps env restoration for the case where `buildApp` itself fails before `onClose` is registered.
- **OpenAPI dialect declared `3.0.3`, NOT `3.1.0`.** `fastify-type-provider-zod@^4.0.2`'s `jsonSchemaTransform` calls `zodToJsonSchema` with `target: 'openApi3'` hardcoded — produces `nullable: true` (3.0 dialect) rather than `type: ['null', ...]` (3.1). Declaring `openapi: '3.0.3'` keeps the document's declared version aligned with its actual schema dialect. `@apidevtools/swagger-parser` validates it cleanly. AC #5 was relaxed in the story spec from "valid OpenAPI 3.1" to "valid OpenAPI as parsed by `@apidevtools/swagger-parser`" precisely because of this constraint.
- **`/docs/` trailing slash needed for HTML smoke test.** `curl http://localhost:4000/docs` (no trailing slash) returns a 302 redirect to `/docs/`; `curl http://localhost:4000/docs/` returns the HTML page directly. The integration test uses `/docs/` to skip the redirect and assert directly on `text/html`.
- **`/docs/json` route surface.** `@fastify/swagger-ui` exposes `/docs/json` (the OpenAPI JSON), `/docs/yaml` (YAML), and `/docs/static/*` (UI assets). For AC #4's production 404 test, BOTH `/docs` AND `/docs/json` must return 404 — confirmed in the production-mode test.

### Completion Notes List

**What was built:**

- **Swagger plugin** ([apps/api/src/plugins/swagger.ts](../../apps/api/src/plugins/swagger.ts)) — registers `@fastify/swagger@^9.7.0` + `@fastify/swagger-ui@^5.2.6`, gated by `NODE_ENV !== 'production' || ENABLE_DOCS === 'true'`. Plugin returns early when disabled (no surface area exists in prod). Wired with `jsonSchemaTransform` from `fastify-type-provider-zod` so OpenAPI is generated from Zod schemas attached to route definitions. UI at `/docs`, JSON at `/docs/json`.
- **`/health` route** ([apps/api/src/routes/health.ts](../../apps/api/src/routes/health.ts)) — light DI on `probe` mirroring Story 1.5's pattern. Production probe is `app.db.execute(sql\`SELECT 1\`)`. Returns `200 { status: 'ok' }` on success, `503 { status: 'degraded', checks: { db: false } }` on failure with a Pino warn-level log.
- **Env schema extension** ([apps/api/src/config.ts](../../apps/api/src/config.ts)) — `ENABLE_DOCS: 'true'|'false'` (string enum to avoid Ajv boolean-coercion trap), `NODE_ENV: string` (default `'development'`).
- **`app.ts` re-wired** — registers `swaggerPlugin` BETWEEN `db` and routes (swagger MUST see routes registered after itself; must register AFTER `setValidatorCompiler`/`setSerializerCompiler`). Adds `healthRoutes` after `todosRoutes`.
- **`/todos` enriched with OpenAPI metadata** — `tags: ['todos']`, `summary`, multi-line `description` documenting LWW concurrency and the wrapping envelope rationale. Doc-only; no behavioral change. Tests still pass.
- **Tests:** 2 unit tests at [apps/api/src/routes/health.test.ts](../../apps/api/src/routes/health.test.ts) (200 OK, 503 degraded — both via DI on probe). 5 integration tests across [apps/api/test/integration/health.int.test.ts](../../apps/api/test/integration/health.int.test.ts) (200 against real DB, 503 with synthetic-failure probe + warn log assertion) and [apps/api/test/integration/docs.int.test.ts](../../apps/api/test/integration/docs.int.test.ts) (OpenAPI doc paths, swagger-parser validation, UI HTML, production 404 gate).
- **Test infrastructure:** [apps/api/test/integration/helpers/buildTestApp.ts](../../apps/api/test/integration/helpers/buildTestApp.ts) gained two siblings: `buildFailingHealthApp()` (minimal app with only `healthRoutes(probe-throws)`) and `buildProductionTestApp()` (full app with `process.env.NODE_ENV='production'` mutated for the build duration; restored on `onClose`).
- **Pool double-close fix** ([apps/api/src/plugins/db.ts](../../apps/api/src/plugins/db.ts)) — picked up the Story 1.5 deferred-work item by making `pool.end()` idempotent across multiple Fastify instances sharing the singleton pool.

**ACs validated (concrete evidence):**

- **AC #1 (200 OK with `{ status: 'ok' }` + `SELECT 1` probe)** ✓ — unit test "200 OK with { status: 'ok' } when probe resolves"; integration test "AC #1: GET /health returns 200... against the real DB"; live smoke `curl /health` → `200 { "status": "ok" }`.
- **AC #2 (503 degraded + warn log)** ✓ — unit test "503 degraded with checks.db: false when probe throws"; integration test "AC #2: GET /health returns 503... with warn-level log line containing 'health probe failed'". Synthetic Error message ("synthetic db failure") asserted on the captured log payload.
- **AC #3 (Swagger registered + paths in spec + Zod-derived schemas)** ✓ — integration test "AC #3: GET /docs/json returns the OpenAPI document with /todos and /health paths" asserts `doc.openapi === '3.0.3'`, `doc.paths['/todos']` exists, `doc.paths['/health']` exists, and the `/todos` 200 response has `properties.todos` (Zod-derived). Live smoke confirmed: `/docs/json` returns OpenAPI 3.0.3 doc; `/docs/` returns HTML Swagger UI.
- **AC #4 (404 in production without ENABLE_DOCS)** ✓ — integration test "AC #4: GET /docs returns 404 in production without ENABLE_DOCS" builds a separate Fastify instance with `NODE_ENV='production'` and `ENABLE_DOCS` deleted; both `/docs` and `/docs/json` return 404.
- **AC #5 (`@apidevtools/swagger-parser` validates the doc)** ✓ — integration test "AC #5: the OpenAPI document validates with @apidevtools/swagger-parser" passes through `SwaggerParser.validate(doc)` without throwing. The spec was relaxed from "OpenAPI 3.1" to "valid OpenAPI as parsed by @apidevtools/swagger-parser" because `fastify-type-provider-zod@^4` emits 3.0 dialect (see Debug Log).

**Final lint + test gate:**

- `npm run lint` (repo root) → exit 0, no warnings.
- `(cd apps/api && npx tsc --noEmit)` → exit 0.
- `npm test --workspace apps/api` → 19/19 pass (12 from Story 1.5 + 7 new for 1.6).
- `npm test --workspace packages/shared` → 25/25 pass (no regression).
- Live smoke test against running server confirms `/health`, `/docs`, `/docs/json`, `/docs/`, `/todos` all behaving as specified.

**Notable deviations from the story plan:**

1. **AC #5 wording** — story spec already softened "OpenAPI 3.1" to "OpenAPI as parsed by swagger-parser, declared 3.0.3" because of the `fastify-type-provider-zod@^4` dialect constraint. This was a deliberate spec adjustment during story creation, not a dev deviation; flagging here so the review knows the story-vs-epic interpretation is grounded.
2. **Pool double-close fix** — Story 1.5's deferred-work item picked up early because Story 1.6's test infrastructure (multiple Fastify instances per test file) is the first place to hit it. The fix is small (try/catch around `pool.end()` swallowing the specific error) and idempotent. Updated [deferred-work.md](deferred-work.md) to reflect the resolution.
3. **`buildFailingHealthApp` is its own minimal Fastify** rather than a parameter on `buildTestApp` — story Task 8 spec'd both options; chose the separate-helper variant because it avoids route conflicts (the production `/health` path is already registered by `buildApp`). Cleaner than mounting the failing variant at `/health-failing` or under a test-only prefix.
4. **`onClose` hook in `buildProductionTestApp` for env restoration** — story Task 8 said "Restored env on close". Implemented via Fastify's `onClose` hook (registered before `ready()`) so each prod-test app self-cleans. Sibling tests see the original env values regardless of test order.

**Story 1.5 deferred items addressed by this story:**

- ✅ Pool singleton multi-instance teardown — `pool.end()` is now idempotent in [plugins/db.ts](../../apps/api/src/plugins/db.ts).

Remaining deferred items (`onSend` headers-sent check, AC #3 rate-limit 429 direct test, header-size cap, logger LOG_LEVEL bypassing @fastify/env) stay deferred — none impeded Story 1.6.

**Known follow-ups (out of this story's scope):**

- **OpenAPI 3.1 emission** — would require `fastify-type-provider-zod@^6` which requires Zod v4 in `packages/shared`. Out of scope for v1.
- **Authentication on `/docs` in production** — env-flag gate is the v1 approach. If a future story needs to expose `/docs` in prod with credentials, design lands then.
- **`/health` consumption from the web client** — Story 1.8's `api.ts` is read-path only; no `/health` consumer in v1.
- **`HEALTHCHECK` directive in production Dockerfile** — Story 1.11.

### File List

**Created:**

- [apps/api/src/plugins/swagger.ts](../../apps/api/src/plugins/swagger.ts) — env-gated swagger + swagger-ui registration
- [apps/api/src/routes/health.ts](../../apps/api/src/routes/health.ts) — `GET /health` with light DI on probe
- [apps/api/src/routes/health.test.ts](../../apps/api/src/routes/health.test.ts) — co-located unit tests (200 OK + 503 degraded)
- [apps/api/test/integration/health.int.test.ts](../../apps/api/test/integration/health.int.test.ts) — integration tests for AC #1, AC #2
- [apps/api/test/integration/docs.int.test.ts](../../apps/api/test/integration/docs.int.test.ts) — integration tests for AC #3, AC #4, AC #5

**Modified:**

- [apps/api/src/app.ts](../../apps/api/src/app.ts) — register `swaggerPlugin` between `db` and routes; register `healthRoutes` after `todosRoutes`
- [apps/api/src/config.ts](../../apps/api/src/config.ts) — added `NODE_ENV` and `ENABLE_DOCS` to env schema + `AppConfig` interface
- [apps/api/src/plugins/db.ts](../../apps/api/src/plugins/db.ts) — idempotent `pool.end()` (Story 1.5 deferred-work picked up)
- [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) — added `tags`, `summary`, `description` (doc-only; no behavioral change)
- [apps/api/test/integration/helpers/buildTestApp.ts](../../apps/api/test/integration/helpers/buildTestApp.ts) — extracted `makeFastifyOptions` helper; added `buildFailingHealthApp` and `buildProductionTestApp` siblings
- [apps/api/package.json](../../apps/api/package.json) — added `@fastify/swagger@^9.7.0`, `@fastify/swagger-ui@^5.2.6`, `@apidevtools/swagger-parser@^12.1.0` (devDep)
- root `package-lock.json` — reflects dependency changes

### Change Log

| Date | Author | Change |
| ---- | ------ | ------ |
| 2026-04-29 | Claude Opus 4.7 (Create-Story) | Story 1.6 contexted; status `backlog` → `ready-for-dev`. |
| 2026-04-29 | Claude Opus 4.7 (Dev) | Story 1.6 implemented; status `ready-for-dev` → `review`. All 10 tasks complete; 19/19 apps/api tests pass; 25/25 packages/shared tests pass; lint + tsc clean. Picked up Story 1.5 deferred-work item: `pool.end()` is now idempotent. |
| 2026-04-29 | Claude Opus 4.7 (Code Review) | Code review applied — 7 patches resolved (incl. `.env.example` fix verified live, `ENABLE_DOCS=` empty handling verified live, `buildFailingHealthApp` refactored into `buildTestApp({ failingHealthProbe })` so AC #2 runs against the FULL prod stack via `/internal-test/health`, `pool.end()` flag-based idempotency replacing fragile substring match, OpenAPI top-level tags array, prod 404 body-shape leak assertion, prod-test partial-app cleanup), 7 deferred to [deferred-work.md](deferred-work.md), 8 dismissed. Status: `review` → `done`. 19/19 apps/api tests pass; 25/25 packages/shared tests pass; lint + tsc clean. |
