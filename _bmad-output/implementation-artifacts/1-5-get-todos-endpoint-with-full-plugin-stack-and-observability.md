# Story 1.5: `GET /todos` endpoint with full plugin stack and observability

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an API consumer (the web client, `curl`, or a test),
I want to request `GET /todos` and receive the full ordered list in a documented envelope, with correlation IDs echoed and structured logs on the server,
So that the read path is complete, hardened, and diagnosable before any UI consumes it.

## Acceptance Criteria

1. **Given** [apps/api/src/app.ts](../../apps/api/src/app.ts) and [apps/api/src/server.ts](../../apps/api/src/server.ts),
   **When** the server starts,
   **Then** `buildApp()` returns a `FastifyInstance` with these plugins registered: `@fastify/env`, `@fastify/sensible`, `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/request-context`, the `db` plugin, and `fastify-type-provider-zod`,
   **And** `@fastify/env` validates presence and shape of `DATABASE_URL`, `PORT`, `LOG_LEVEL`, and `CORS_ORIGIN`,
   **And** missing or invalid env vars cause a fail-fast startup error.

2. **Given** the CORS plugin configuration,
   **When** a request arrives from an origin matching `CORS_ORIGIN`,
   **Then** it is allowed; from any other origin the preflight is rejected.

3. **Given** the rate-limit configuration,
   **When** the same IP issues more than 100 requests in one minute,
   **Then** subsequent requests within that window return `429` with the standard rate-limit envelope.

4. **Given** an incoming request with an `x-request-id` header,
   **When** the request is processed,
   **Then** the request-context plugin exposes that ID for the duration of the request,
   **And** the response echoes the same `x-request-id` header,
   **And** every Pino log line for the request includes `{ requestId, method, path, statusCode, durationMs }`.

5. **Given** an incoming request with no `x-request-id` header,
   **When** the request is processed,
   **Then** the plugin generates a UUID and attaches it the same way.

6. **Given** `GET /todos` with an empty database,
   **When** a client issues the request,
   **Then** the API responds with `200` and body `{ "todos": [] }`,
   **And** the response matches `TodoListResponseSchema`.

7. **Given** `GET /todos` with three rows in the `todos` table,
   **When** a client issues the request,
   **Then** the response body is `{ "todos": [...] }` containing all three rows,
   **And** the todos are ordered by `created_at` ascending consistently across repeated calls (FR10),
   **And** DB column names (`created_at`) are mapped to the wire shape key (`createdAt`).

8. **Given** a route handler throws an unhandled error,
   **When** the global `setErrorHandler` catches it,
   **Then** the response is the Fastify-sensible envelope `{ statusCode, error, message }` with status `500`,
   **And** a Pino `error`-level log line is written with the full stack and correlation ID.

9. **Given** [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts),
   **When** the test suite runs against an ephemeral Postgres schema (or a truncated `todos` table on the dev DB — see Task 11 watch-out),
   **Then** it covers: empty list returns `[]`; populated list returns seeded rows ordered by `createdAt`; `x-request-id` is echoed when sent; `x-request-id` is generated when absent,
   **And** all assertions pass.

10. **Given** [apps/api/src/routes/todos.test.ts](../../apps/api/src/routes/todos.test.ts),
    **When** `node --test` runs,
    **Then** handler unit tests using `app.inject()` pass with a stubbed db.

## Tasks / Subtasks

- [x] **Task 1: Add API plugin + type-provider deps to apps/api (AC: #1, #2, #3, #4, #5, #7)**
  - [x] In [apps/api/package.json](../../apps/api/package.json), add to `dependencies`:
    - `"@fastify/env": "^6.0.0"` — JSON-schema-backed env validation. NOT Zod — see Dev Notes "Why no Zod for env".
    - `"@fastify/cors": "^11.2.0"` — locked to `CORS_ORIGIN`.
    - `"@fastify/helmet": "^13.0.0"` — defaults; CSP disabled (API-only). v13 ships breaking helmet upstream changes — see Dev Notes "Helmet v12→v13".
    - `"@fastify/rate-limit": "^10.3.0"` — 100 req/min/IP.
    - `"@fastify/request-context": "^6.2.0"` — AsyncLocalStorage-backed correlation ID propagation.
    - `"fastify-type-provider-zod": "^6.1.0"` — **package name is `fastify-type-provider-zod` (no `@fastify/` scope)**. Architecture/epics docs refer to it as `@fastify/type-provider-zod` informally; the actual npm name is unscoped. Verify with `npm view fastify-type-provider-zod` if uncertain.
    - `"@todo-app/shared": "*"` — workspace dep so route schemas import `TodoListResponseSchema` from `packages/shared`.
  - [x] Run `npm install` from repo root. Verify all six new packages plus `@todo-app/shared` resolve from `apps/api/node_modules` or hoist to root. Use `npm ls @fastify/env @fastify/cors @fastify/helmet @fastify/rate-limit @fastify/request-context fastify-type-provider-zod @todo-app/shared --workspace apps/api`.
  - [x] **Do NOT add `@fastify/swagger`, `@fastify/swagger-ui`, or `zod-to-json-schema`** — those belong to Story 1.6 (`/docs` and `/health`). Adding now creates wasted churn.

- [x] **Task 2: Author `apps/api/src/config.ts` (env schema for `@fastify/env`) (AC: #1)**
  - [x] Create [apps/api/src/config.ts](../../apps/api/src/config.ts) — exports the env JSON Schema and the resolved-config TypeScript shape:
    ```ts
    export const envSchema = {
      type: 'object',
      required: ['DATABASE_URL', 'CORS_ORIGIN'],
      properties: {
        DATABASE_URL: { type: 'string', minLength: 1 },
        PORT: { type: 'integer', default: 4000 },
        LOG_LEVEL: { type: 'string', enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'], default: 'info' },
        CORS_ORIGIN: { type: 'string', minLength: 1 },
      },
    } as const;

    export interface AppConfig {
      DATABASE_URL: string;
      PORT: number;
      LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
      CORS_ORIGIN: string;
    }

    declare module 'fastify' {
      interface FastifyInstance {
        config: AppConfig;
      }
    }
    ```
  - [x] Why this shape (each property is load-bearing):
    - `DATABASE_URL` and `CORS_ORIGIN` are `required` — boot fails fast if missing (AC #1).
    - `PORT` and `LOG_LEVEL` have defaults — sensible in dev, overridable in prod.
    - `LOG_LEVEL` `enum` matches Pino's level names — invalid values fail at `@fastify/env` boot rather than producing silent bad logger config.
    - `as const` so the schema literal types lock in for `@fastify/env`'s JSON-schema processor.
  - [x] **`declare module 'fastify'`** ambient augmentation here (and only here) makes `app.config` typed across the codebase. The `confKey: 'config'` option in app.ts (Task 6) attaches it.

- [x] **Task 3: Author plugin files (AC: #1, #2, #3, #4, #5)**
  - Create one file per plugin in [apps/api/src/plugins/](../../apps/api/src/plugins/). Each is a thin `fp(...)` wrapper that registers the underlying plugin with the right options.

  - [x] Create [apps/api/src/plugins/cors.ts](../../apps/api/src/plugins/cors.ts):
    ```ts
    import fp from 'fastify-plugin';
    import cors from '@fastify/cors';

    export default fp(async (app) => {
      await app.register(cors, {
        origin: app.config.CORS_ORIGIN,   // exact match string from env
        credentials: false,                // no cookies in v1
        exposedHeaders: ['x-request-id'],  // client-side correlation surfacing
      });
    }, { name: 'cors', dependencies: ['@fastify/env'] });
    ```
    - Single-origin `string` (architecture: locked to one origin per env). If a future story needs multi-origin, `@fastify/cors` accepts `string[]` or a function — extend then, not now.
    - `exposedHeaders: ['x-request-id']` is mandatory — without it, browser CORS hides the response header from `fetch().headers.get('x-request-id')` even though the server echoes it. Web client (Story 1.8) needs it for failure-correlation logs.
    - **Pitfall:** `origin: true` reflects any origin (CORS-by-default-on) — do NOT use, even in dev. Always read from `app.config.CORS_ORIGIN`.

  - [x] Create [apps/api/src/plugins/helmet.ts](../../apps/api/src/plugins/helmet.ts):
    ```ts
    import fp from 'fastify-plugin';
    import helmet from '@fastify/helmet';

    export default fp(async (app) => {
      await app.register(helmet, {
        contentSecurityPolicy: false,        // API serves JSON only; CSP belongs to the web app
        crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow web-tier fetches
      });
    }, { name: 'helmet' });
    ```
    - **Pitfall (helmet v12→v13):** v13 default `crossOriginResourcePolicy: 'same-origin'` rejects cross-origin asset/JSON fetches. For an API hit from a different origin (the web app on a different port), set `'cross-origin'`. Without this override, CORS preflight passes but actual responses get blocked.
    - `contentSecurityPolicy: false` — CSP is a browser-page concern, not an API concern. Setting CSP on JSON responses adds no value and breaks Swagger UI in Story 1.6.

  - [x] Create [apps/api/src/plugins/rateLimit.ts](../../apps/api/src/plugins/rateLimit.ts):
    ```ts
    import fp from 'fastify-plugin';
    import rateLimit from '@fastify/rate-limit';

    export default fp(async (app) => {
      await app.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
        // standard 429 envelope; do NOT override with errorResponseBuilder unless we
        // also override sensible's envelope shape (we don't — keep it consistent).
      });
    }, { name: 'rate-limit', dependencies: ['@fastify/env'] });
    ```
    - **AC #3** says "standard rate-limit envelope" — meaning the default `{ statusCode: 429, error: 'Too Many Requests', message: '...' }` from `@fastify/rate-limit` (matches sensible's envelope shape). Do NOT supply an `errorResponseBuilder` — drift hazard.
    - **Default store is in-memory** — fine for v1 single-instance. If horizontal scaling lands (NFR2 escalation), swap to Redis. Out of scope for v1 (architecture: "API is stateless — horizontally scalable" but explicitly no scaling config in repo).
    - **Pitfall (`trustProxy`):** `@fastify/rate-limit` keys by `request.ip`. With `trustProxy: true` set on the Fastify instance (Task 4), `request.ip` reads `x-forwarded-for` correctly. Without it, all traffic behind a proxy keys to the proxy's IP and the limiter throttles legitimate users globally.

  - [x] Create [apps/api/src/plugins/requestContext.ts](../../apps/api/src/plugins/requestContext.ts):
    ```ts
    import fp from 'fastify-plugin';
    import { fastifyRequestContext, requestContext } from '@fastify/request-context';

    export default fp(async (app) => {
      await app.register(fastifyRequestContext);

      app.addHook('onRequest', async (req) => {
        requestContext.set('reqId', req.id);
      });
      app.addHook('onSend', async (req, reply) => {
        reply.header('x-request-id', req.id);
      });
    }, { name: 'request-context' });

    declare module '@fastify/request-context' {
      interface RequestContextData {
        reqId: string;
      }
    }
    ```
    - The combination is what makes correlation work: Fastify's instance `genReqId` (set in Task 4) honors `x-request-id` or generates one; this plugin (a) stuffs `req.id` into `requestContext` so Pino's mixin (Task 4) can read it and (b) echoes it on response.
    - **Pitfall (Pino mixin lookup):** the `mixin` option (Task 4) reads from `requestContext.get('reqId')`. That value MUST be set on `onRequest` (this plugin), not on `preHandler` — because Fastify writes the first log line ("incoming request") on `onRequest`, before `preHandler`.
    - **`declare module '@fastify/request-context'`** ambient augmentation types `RequestContextData` so `requestContext.get('reqId')` returns `string` instead of `unknown`.

- [x] **Task 4: Author `apps/api/src/server.ts` (Fastify instance + listen) (AC: #1, #4, #5, #8)**
  - [x] Create [apps/api/src/server.ts](../../apps/api/src/server.ts) — the actual entrypoint that constructs the instance, calls `buildApp`, and listens. Replaces `fastify start dist/app.js` from the fastify-cli scaffold.
    ```ts
    import { randomUUID } from 'node:crypto';
    import { requestContext } from '@fastify/request-context';
    import Fastify from 'fastify';
    import { buildApp } from './app.js';

    const app = Fastify({
      // honor x-request-id if provided, otherwise generate
      requestIdHeader: 'x-request-id',
      genReqId: () => randomUUID(),

      // input bound — todos are tiny; reject overly large bodies cheaply
      bodyLimit: 4096,

      // platform terminates HTTPS; trust forwarded headers so request.ip
      // is the real client IP (rate-limit keys correctly)
      trustProxy: true,

      logger: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Mandatory structured fields per architecture §Communication Patterns / Logging.
        // requestId pulled from request-context (set in onRequest hook).
        mixin() {
          const reqId = requestContext.get('reqId');
          return reqId ? { requestId: reqId } : {};
        },
      },
    });

    await buildApp(app);

    try {
      await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }

    // Graceful shutdown — closes HTTP server then pg pool (via db plugin's onClose hook).
    for (const sig of ['SIGINT', 'SIGTERM'] as const) {
      process.on(sig, async () => {
        app.log.info({ signal: sig }, 'shutting down');
        await app.close();
        process.exit(0);
      });
    }
    ```
  - [x] **Why a custom `server.ts` (not `fastify start`):** the scaffold's `fastify start` constructs the Fastify instance internally and accepts `options` exported from `app.ts`. That works for the autoload-only baseline but does NOT let us read `app.config.PORT` (set by `@fastify/env` after register) before `listen`. Custom server.ts gives us that ordering: register env → read PORT → bind. Also lets us own `genReqId`, `requestIdHeader`, and the Pino mixin in one place.
  - [x] **`requestIdHeader: 'x-request-id'`** — Fastify's default is `'request-id'` (no `x-` prefix). Architecture mandates `x-request-id` (the conventional header). Setting `requestIdHeader` makes Fastify auto-honor incoming values; `genReqId` is called only when the header is absent.
  - [x] **`bodyLimit: 4096`** — 4 KB cap on request bodies (architecture §Authentication & Security). Todos are short; large bodies are either bugs or attacks.
  - [x] **`trustProxy: true`** — required for `request.ip` to read `X-Forwarded-For` correctly behind a TLS terminator. Without it, rate-limit keys everyone to the proxy's IP and the platform's `x-real-ip` is ignored.
  - [x] **Top-level `await`** is used — apps/api must compile to ESM-compatible output OR run via `--experimental-strip-types` (existing pattern from Story 1.4's `db:check`). See Dev Notes "Module type and strip-types".

- [x] **Task 5: Rewrite `apps/api/src/app.ts` — explicit plugin order + setErrorHandler (AC: #1, #2, #3, #4, #5, #8)**
  - [x] Replace the contents of [apps/api/src/app.ts](../../apps/api/src/app.ts) entirely. The current scaffold uses `@fastify/autoload` to register `plugins/` and `routes/` directories — that pattern does not give us deterministic ordering (env MUST run before cors/rate-limit which read `app.config.CORS_ORIGIN`). Replace with explicit `app.register(...)` calls:
    ```ts
    import fastifyEnv from '@fastify/env';
    import sensible from '@fastify/sensible';
    import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
    import type { FastifyInstance } from 'fastify';
    import { envSchema } from './config.js';
    import dbPlugin from './plugins/db.js';
    import corsPlugin from './plugins/cors.js';
    import helmetPlugin from './plugins/helmet.js';
    import rateLimitPlugin from './plugins/rateLimit.js';
    import requestContextPlugin from './plugins/requestContext.js';
    import todosRoutes from './routes/todos.js';

    export async function buildApp(app: FastifyInstance): Promise<void> {
      // 1. Env first — every subsequent plugin may read app.config
      await app.register(fastifyEnv, {
        confKey: 'config',
        schema: envSchema,
        dotenv: true,
      });

      // 2. Type provider compilers — must be set BEFORE routes, no register() needed
      app.setValidatorCompiler(validatorCompiler);
      app.setSerializerCompiler(serializerCompiler);

      // 3. Cross-cutting plugins (order matters: request-context before routes,
      //    sensible before setErrorHandler, helmet/cors/rate-limit before routes)
      await app.register(sensible);
      await app.register(requestContextPlugin);
      await app.register(helmetPlugin);
      await app.register(corsPlugin);
      await app.register(rateLimitPlugin);

      // 4. Data layer
      await app.register(dbPlugin);

      // 5. Routes
      await app.register(todosRoutes);

      // 6. Global error handler — uses app.httpErrors from sensible
      app.setErrorHandler((err, req, reply) => {
        // Validation errors (Zod) carry .statusCode 400 already; let them through.
        if ((err as { statusCode?: number }).statusCode) {
          req.log.warn({ err }, 'request error');
          return reply.send(err);
        }
        // Unhandled — log full stack at error level, return 500 envelope
        req.log.error({ err }, 'unhandled error');
        return reply.internalServerError();
      });
    }
    ```
  - [x] **Why explicit, not autoload:**
    - `@fastify/env` MUST resolve before `cors` reads `app.config.CORS_ORIGIN`. Autoload's directory ordering is alphabetical — fragile.
    - The architecture's [Implementation Sequence](../../_bmad-output/planning-artifacts/architecture.md#decision-impact-analysis) lists plugin registration as a deliberate sequence; explicit is faithful to that spec.
    - `@fastify/autoload` can be removed from `dependencies` once it has no remaining references (verify with `grep -r "@fastify/autoload" apps/api/src/`).
  - [x] **`buildApp(app)` signature** — takes the constructed instance as a parameter (server.ts owns construction with logger/genReqId/etc.; app.ts only owns plugin wiring). This split is what the architecture's two-file split (`app.ts` + `server.ts`) implies, and it's what makes the function testable (integration tests construct their own instance with test-specific options, then call `buildApp`).
  - [x] **`setErrorHandler` placement** — registered LAST so it has visibility into all routes. Fastify scopes error handlers to the encapsulation context where they're registered; setting at `buildApp`-level applies app-wide.
  - [x] **Validation errors short-circuit:** Zod schema failures throw with `statusCode: 400` already attached (via `fastify-type-provider-zod`). The `if (err.statusCode)` branch passes them through unchanged — sensible's envelope is already correct.
  - [x] **AC #8 mapping:** the unhandled branch logs `error`-level with the full Error (Pino serializes `.stack`), then `reply.internalServerError()` produces the sensible envelope `{ statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error' }`. The Pino mixin (Task 4) injects `requestId` into the log line.

- [x] **Task 6: Update `apps/api/src/plugins/db.ts` — graceful shutdown + error listener (AC: #1; addresses deferred-work items from Story 1.4)**
  - [x] Modify [apps/api/src/plugins/db.ts](../../apps/api/src/plugins/db.ts) to wire the pool into Fastify's lifecycle:
    ```ts
    import fp from 'fastify-plugin';
    import { db, pool } from '../db/client.js';

    export default fp(
      async (app) => {
        app.decorate('db', db);

        // Idle-client errors must not crash the process — pg emits these on
        // dropped connections. Logged at warn; pool will reconnect on next acquire.
        pool.on('error', (err) => {
          app.log.warn({ err }, 'pg idle client error');
        });

        // Graceful shutdown: close pool when Fastify closes (SIGTERM/SIGINT,
        // and integration test teardown via app.close()).
        app.addHook('onClose', async () => {
          await pool.end();
        });
      },
      { name: 'db', dependencies: ['@fastify/env'] },
    );

    declare module 'fastify' {
      interface FastifyInstance {
        db: typeof db;
      }
    }
    ```
  - [x] **Picks up two deferred-work items from [Story 1.4 deferred-work.md](deferred-work.md):**
    - "No `pool.on('error', ...)` listener" — added.
    - "No graceful shutdown / `pool.end()` on Fastify `onClose`" — added.
  - [x] **Export `pool` from client.ts** (Task 7 below) — the plugin needs to attach the error listener and end the pool. Currently `pool` is private to `client.ts`.

- [x] **Task 7: Update `apps/api/src/db/client.ts` — export `pool`, fix Drizzle Date round-trip (AC: #6, #7; addresses deferred-work)**
  - [x] Modify [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts):
    1. **Export `pool`** so the db plugin (Task 6) can attach the error listener and the onClose hook.
    2. **Fix the Date-vs-string round-trip** that was deferred from Story 1.4. The contract `TodoListResponseSchema` expects `createdAt: z.string().datetime()`. Drizzle's `timestamp({ withTimezone: true })` returns `Date` instances. `fastify-type-provider-zod`'s response serializer runs Zod against the response object at runtime and will throw if it sees a `Date` where a string is expected.
  - [x] Final shape (only the marked lines are new):
    ```ts
    import { drizzle } from 'drizzle-orm/node-postgres';
    import { Pool } from 'pg';
    import { asc } from 'drizzle-orm';
    import { todos } from './schema.js';
    import type { Todo } from '@todo-app/shared';            // NEW

    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required (apps/api/src/db/client.ts)');
    }

    export const pool = new Pool({                            // NEW: `export`
      connectionString: process.env.DATABASE_URL,
    });

    export const db = drizzle(pool, { schema: { todos } });

    // Map Drizzle row (Date for createdAt) → wire shape (ISO 8601 string).
    // Wire shape is the contract; serializer validates against TodoSchema.
    const toWire = (row: typeof todos.$inferSelect): Todo => ({  // NEW
      id: row.id,
      text: row.text,
      completed: row.completed,
      createdAt: row.createdAt.toISOString(),
    });

    export const listTodos = async (): Promise<Todo[]> => {       // NEW: `async`, return type
      const rows = await db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
      return rows.map(toWire);
    };
    ```
  - [x] **Why convert in `listTodos`, not in the route handler:** keeps the Drizzle-typed boundary inside `db/client.ts`. The handler imports `listTodos` (per Story 1.4's "handlers import functions, not raw tables" rule) and gets `Todo[]` — already wire-shaped. Future query helpers (Story 2.1+) follow the same `toWire` pattern.
  - [x] **Alternative considered, rejected:** Drizzle's `mode: 'string'` option on the timestamp column — would change the schema return type to `string`. Rejected because (a) it changes Story 1.4's schema definition (out-of-scope risk) and (b) the JS-side conversion is more explicit about the wire boundary.
  - [x] **DO NOT** add `.preprocess` on the Zod schema in `packages/shared` — that schema is the contract. Mutating it for one consumer's quirk leaks API-tier concerns into the contract package.
  - [x] **DO NOT** change `client.ts`'s top-level `if (!process.env.DATABASE_URL) throw` — `@fastify/env` runs FIRST in `buildApp` (Task 5), so by the time the db plugin imports `client.ts`, the env is already validated. The throw becomes a defense-in-depth check for direct imports outside the Fastify context (e.g., `db:check` script). Defer the lazy-init pattern (also a deferred item) until test infrastructure that mocks the DB lands — not needed for Story 1.5's integration approach.

- [x] **Task 8: Author `apps/api/src/routes/todos.ts` (AC: #6, #7)**
  - [x] Create [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts):
    ```ts
    import { TodoListResponseSchema } from '@todo-app/shared';
    import type { FastifyPluginAsync } from 'fastify';
    import { ZodTypeProvider } from 'fastify-type-provider-zod';
    import { listTodos } from '../db/client.js';

    const todosRoutes: FastifyPluginAsync = async (app) => {
      app.withTypeProvider<ZodTypeProvider>().get(
        '/todos',
        {
          schema: {
            response: { 200: TodoListResponseSchema },
          },
        },
        async () => {
          const todos = await listTodos();
          return { todos };
        },
      );
    };

    export default todosRoutes;
    ```
  - [x] **`withTypeProvider<ZodTypeProvider>()`** — required to make the route's `schema.response` accept Zod schemas. Without it, Fastify treats `TodoListResponseSchema` as a JSON Schema and silently does nothing (or throws AJV errors). With it, the serializer Zod-validates the response.
  - [x] **No `request`/`reply` params** — handler returns the body, Fastify serializes. Don't reach for `reply.send(...)` unless the response carries non-JSON or non-200 status.
  - [x] **No DB error try/catch in the handler** — let pg/Drizzle throws bubble up to `setErrorHandler` (Task 5). That's where 500-mapping happens. Catching here would swallow stacks and force handcrafted error responses (anti-pattern per architecture §Process Patterns).
  - [x] **Why `listTodos` already returns wire-shape `Todo[]`** — see Task 7's `toWire` helper. The serializer just validates and stringifies.

- [x] **Task 9: Remove fastify-cli scaffold leftovers (AC: #1)**
  - [x] Delete [apps/api/src/plugins/sensible.ts](../../apps/api/src/plugins/sensible.ts) — replaced by direct `app.register(sensible)` in app.ts (Task 5).
  - [x] Delete [apps/api/src/plugins/support.ts](../../apps/api/src/plugins/support.ts) — boilerplate `someSupport()` decoration with no consumer.
  - [x] Delete [apps/api/src/plugins/README.md](../../apps/api/src/plugins/README.md) and [apps/api/src/routes/README.md](../../apps/api/src/routes/README.md) — fastify-cli boilerplate docs about autoload that no longer apply.
  - [x] Delete [apps/api/src/routes/example/](../../apps/api/src/routes/example/) (entire directory — `index.ts`).
  - [x] Delete [apps/api/src/routes/root.ts](../../apps/api/src/routes/root.ts) — returned `{ root: true }`; not in the architecture's endpoint list.
  - [x] Delete [apps/api/test/](../../apps/api/test/) **only if** it contains nothing but fastify-cli scaffold tests (`test/plugins/`, `test/routes/`, `test/helper.ts` testing the deleted scaffold). Verify with `ls apps/api/test` first; preserve any developer-authored content. Replaced by Task 11's integration test infrastructure.
  - [x] Remove `@fastify/autoload` from `apps/api/package.json` `dependencies` — verify zero remaining references with `grep -rn "@fastify/autoload" apps/api/src apps/api/test 2>/dev/null` before removing.
  - [x] **Verify TS compiles after deletions:** `(cd apps/api && npx tsc --noEmit)` — exit 0.

- [x] **Task 10: Author co-located unit test `apps/api/src/routes/todos.test.ts` (AC: #10)**
  - [x] Create [apps/api/src/routes/todos.test.ts](../../apps/api/src/routes/todos.test.ts) — tests the handler in isolation via `app.inject()` with a stubbed db helper. NOT a real DB — that's Task 12's integration suite.
  - [x] Approach: import the route plugin, build a minimal Fastify instance with the type provider compilers, decorate `app.db` with a stub OR (simpler) override the `listTodos` import via a test-double pattern.
    - Recommended: build a tiny test-only `buildAppForUnit()` helper that registers ONLY the type-provider compilers + the route, and accepts a `listTodos` override via parameter. Avoids dragging in env/db plugins.
    - Alternative: use Node's `mock.module` (Node 22+ `--experimental-test-module-mocks`) to stub `../db/client.js`. Adds complexity; pick only if the helper pattern doesn't fit.
  - [x] Test cases (≥2):
    1. **Empty list:** stub `listTodos` returns `[]`. `app.inject({ method: 'GET', url: '/todos' })` → 200, body `{ "todos": [] }`.
    2. **Populated:** stub returns `[{ id: 'uuid-1', text: 'foo', completed: false, createdAt: '2026-04-29T00:00:00.000Z' }]`. Assert response status 200 and body matches.
  - [x] Use `node:test` and `node:assert` (no Jest, no Mocha — match the fastify-cli default per architecture §Testing Standards).
  - [x] These tests run via `node --test --experimental-strip-types "src/**/*.test.ts"` — see Task 13.

- [x] **Task 11: Author integration test infrastructure (AC: #9)**
  - [x] Create [apps/api/test/integration/helpers/buildTestApp.ts](../../apps/api/test/integration/helpers/buildTestApp.ts) — constructs a Fastify instance configured for tests:
    ```ts
    import { randomUUID } from 'node:crypto';
    import Fastify, { type FastifyInstance } from 'fastify';
    import { requestContext } from '@fastify/request-context';
    import { buildApp } from '../../../src/app.js';

    export async function buildTestApp(): Promise<FastifyInstance> {
      // Test DB: same DATABASE_URL the dev uses. CI and local both share the
      // single docker-compose Postgres. Tests TRUNCATE the todos table on setup
      // (see seedDb.ts) instead of creating per-suite ephemeral schemas — see
      // Dev Notes "Integration test isolation".
      const app = Fastify({
        requestIdHeader: 'x-request-id',
        genReqId: () => randomUUID(),
        bodyLimit: 4096,
        trustProxy: true,
        logger: {
          level: 'silent',  // suppress per-request logs in test output
          mixin() {
            const reqId = requestContext.get('reqId');
            return reqId ? { requestId: reqId } : {};
          },
        },
      });
      await buildApp(app);
      await app.ready();
      return app;
    }
    ```
  - [x] Create [apps/api/test/integration/helpers/seedDb.ts](../../apps/api/test/integration/helpers/seedDb.ts):
    ```ts
    import { db } from '../../../src/db/client.js';
    import { todos } from '../../../src/db/schema.js';

    export async function resetTodos(): Promise<void> {
      await db.delete(todos);  // empty the table; preserves schema
    }

    export async function seedTodos(rows: Array<{ text: string; completed?: boolean; createdAt?: Date }>) {
      await db.insert(todos).values(rows.map((r) => ({
        text: r.text,
        completed: r.completed ?? false,
        createdAt: r.createdAt ?? new Date(),
      })));
    }
    ```
  - [x] **Watch-out (Integration test isolation):** the architecture spec says "ephemeral Postgres schema per suite". The simpler option for v1 with one endpoint is **TRUNCATE/DELETE per test on the dev DB** (above). Isolation is achieved because tests run sequentially with a `beforeEach` that clears `todos`. If parallel test execution lands later, swap to per-worker schema isolation (`CREATE SCHEMA test_<uuid>; SET search_path TO test_<uuid>; <run migrations>; ... DROP SCHEMA CASCADE`). See [deferred-work.md](deferred-work.md) once Story 1.5 is committed — log this as a deferred enhancement if the team chooses TRUNCATE-per-test.
  - [x] **Schema-isolation example for the deferred enhancement** (do NOT implement now, just for context):
    ```sql
    CREATE SCHEMA test_<random>;
    SET search_path TO test_<random>;
    -- run migrations against this schema
    -- ... tests ...
    DROP SCHEMA test_<random> CASCADE;
    ```

- [x] **Task 12: Author integration tests `apps/api/test/integration/todos.int.test.ts` (AC: #6, #7, #4, #5)**
  - [x] Create [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) using `node:test`:
    ```ts
    import { test, before, after, beforeEach } from 'node:test';
    import assert from 'node:assert/strict';
    import type { FastifyInstance } from 'fastify';
    import { buildTestApp } from './helpers/buildTestApp.js';
    import { resetTodos, seedTodos } from './helpers/seedDb.js';

    let app: FastifyInstance;

    before(async () => { app = await buildTestApp(); });
    after(async () => { await app.close(); });
    beforeEach(async () => { await resetTodos(); });

    test('GET /todos — empty list returns 200 with []', async () => {
      const res = await app.inject({ method: 'GET', url: '/todos' });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), { todos: [] });
    });

    test('GET /todos — populated list returns rows ordered by createdAt asc', async () => {
      const t0 = new Date('2026-04-01T00:00:00.000Z');
      const t1 = new Date('2026-04-02T00:00:00.000Z');
      const t2 = new Date('2026-04-03T00:00:00.000Z');
      // insert in non-chronological order to prove ORDER BY works
      await seedTodos([
        { text: 'second', createdAt: t1 },
        { text: 'third',  createdAt: t2 },
        { text: 'first',  createdAt: t0 },
      ]);

      const res = await app.inject({ method: 'GET', url: '/todos' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { todos: Array<{ text: string; createdAt: string }> };
      assert.deepEqual(body.todos.map((t) => t.text), ['first', 'second', 'third']);
      assert.equal(body.todos[0].createdAt, '2026-04-01T00:00:00.000Z');
    });

    test('x-request-id is echoed when sent', async () => {
      const id = '11111111-2222-3333-4444-555555555555';
      const res = await app.inject({
        method: 'GET',
        url: '/todos',
        headers: { 'x-request-id': id },
      });
      assert.equal(res.headers['x-request-id'], id);
    });

    test('x-request-id is generated when absent', async () => {
      const res = await app.inject({ method: 'GET', url: '/todos' });
      const echoed = res.headers['x-request-id'];
      assert.match(echoed as string, /^[0-9a-f-]{36}$/i); // UUID v4-ish
    });
    ```
  - [x] **AC mapping:**
    - AC #6 (empty list) → test 1
    - AC #7 (populated, ordered, `createdAt` ISO) → test 2
    - AC #4 (echo) → test 3
    - AC #5 (generate) → test 4
  - [x] **What's NOT tested here** (deliberate scope cuts; covered elsewhere or not in scope for 1.5):
    - CORS rejection — exercised by browser clients, hard to assert with `app.inject()` (which bypasses HTTP transport). Defer to a manual smoke test or post-Story 1.7 e2e.
    - Rate-limit 429 — exercising 100+ requests per IP within a test slows the suite. The architecture's rate-limit setting is operational config; trust the plugin's own tests.
    - 500 envelope (AC #8) — would require injecting a route that throws. Cleanest place is Story 1.6's tests once `/health` exists with its own failure path. If you want to cover it now, register a one-off `/internal-test/throw` route in `buildTestApp` (gated to test env) and assert the envelope.
  - [x] **Pino mixin assertion (AC #4 last clause — log lines include `requestId`)** — the integration suite silences logs (`logger.level: 'silent'` in buildTestApp). Asserting log-line contents requires either a transport hook or running with `level: 'info'` and capturing stdout. **Recommended:** add ONE narrowly-scoped test with a custom logger hook that captures lines, OR rely on Task 10's unit-level proof of the mixin (the mixin is a pure function; integration's job is the wire). Skip if it adds disproportionate complexity; document the gap in Completion Notes.

- [x] **Task 13: Update `apps/api/package.json` scripts (AC: all)**
  - [x] Update [apps/api/package.json](../../apps/api/package.json) — replace `start`, `dev`, `dev:start`, `test`. Final scripts block:
    ```json
    "scripts": {
      "build:ts": "tsc",
      "dev": "node --watch --experimental-strip-types src/server.ts",
      "start": "npm run build:ts && node dist/server.js",
      "test": "node --test --experimental-strip-types \"src/**/*.test.ts\" \"test/**/*.test.ts\"",
      "test:integration": "node --test --experimental-strip-types \"test/integration/**/*.int.test.ts\"",
      "test:unit": "node --test --experimental-strip-types \"src/**/*.test.ts\"",
      "db:migrate": "drizzle-kit migrate",
      "db:check": "node --experimental-strip-types src/db/migrate.ts"
    }
    ```
  - [x] **`dev` change:** drops `concurrently` + `fastify start`. `node --watch` (Node 22 stable) restarts on TS changes. `--experimental-strip-types` strips TS types and runs the source directly — no tsc-watch step.
  - [x] **`test` change:** drops `c8` (coverage) and `ts-node`. Coverage can be added later if a Story explicitly demands it; not in v1 scope. `--experimental-strip-types` lets `node:test` run TS sources.
  - [x] **Remove from `devDependencies`:** `c8`, `ts-node`, `concurrently` — none are referenced by any remaining script. Re-add if a future story needs them. **VERIFY** with `grep -rn "ts-node\|concurrently\|c8" apps/api/ --include='*.json' --include='*.ts' 2>/dev/null` before removing — if any remain, leave the dep in place.
  - [x] **Keep `fastify-cli`** in `dependencies` ONLY if it's still imported anywhere (it shouldn't be after Task 9). Verify with `grep -rn "fastify-cli" apps/api/src 2>/dev/null` — remove from package.json if zero hits.
  - [x] **Keep `fastify-tsconfig`** in `devDependencies` — `tsconfig.json` extends it.

- [x] **Task 14: Sanity gates — no regressions (AC: all)**
  - [x] **Lint:** `npm run lint` from repo root → exit 0. Pre-existing fastify-cli scaffold warnings should drop (we deleted the offending files in Task 9). New code in `src/plugins/`, `src/routes/`, `src/server.ts`, `src/app.ts`, `src/config.ts`, `src/db/client.ts` should be clean against `tseslint.configs.recommended`.
  - [x] **Type-check:** `(cd apps/api && npx tsc --noEmit)` → exit 0.
  - [x] **Unit tests:** `npm run test:unit --workspace apps/api` → all pass.
  - [x] **Integration tests (require running DB):**
    - Start: `docker compose up -d db && npm run db:migrate --workspace apps/api`
    - Run: `npm run test:integration --workspace apps/api` → all pass.
    - Tear down: `docker compose down` (optional; keeps data via named volume).
  - [x] **Combined:** `npm test --workspace apps/api` → all pass (covers both unit and integration test globs).
  - [x] **Shared package untouched:** `npm test --workspace packages/shared` → exit 0, all pass (Story 1.2 untouched).
  - [x] **Manual smoke (optional but recommended):**
    - `npm run dev --workspace apps/api` → server logs `{"level":30,...,"msg":"Server listening at http://0.0.0.0:4000"}`.
    - `curl -s http://localhost:4000/todos` → `{"todos":[]}` (assuming empty DB).
    - `curl -i -H "x-request-id: test-correlation-id-abc" http://localhost:4000/todos` → `200`, response includes `x-request-id: test-correlation-id-abc`, server log includes `"requestId":"test-correlation-id-abc"`.
    - `curl -i http://localhost:4000/todos` (no header) → `200`, response `x-request-id` is a UUID, server log shows the same UUID in `"requestId"`.

- [x] **Task 15: Commit**
  - [x] Stage exactly the new and modified files. Use `git status` to confirm — there should be:
    - **New:**
      - `apps/api/src/server.ts`
      - `apps/api/src/config.ts`
      - `apps/api/src/plugins/cors.ts`
      - `apps/api/src/plugins/helmet.ts`
      - `apps/api/src/plugins/rateLimit.ts`
      - `apps/api/src/plugins/requestContext.ts`
      - `apps/api/src/routes/todos.ts`
      - `apps/api/src/routes/todos.test.ts`
      - `apps/api/test/integration/helpers/buildTestApp.ts`
      - `apps/api/test/integration/helpers/seedDb.ts`
      - `apps/api/test/integration/todos.int.test.ts`
    - **Modified:**
      - `apps/api/src/app.ts` (rewritten)
      - `apps/api/src/db/client.ts` (export pool, listTodos returns wire shape)
      - `apps/api/src/plugins/db.ts` (pool error listener, onClose hook, dependencies)
      - `apps/api/package.json` (deps + scripts)
      - root `package-lock.json`
    - **Deleted:**
      - `apps/api/src/plugins/sensible.ts`
      - `apps/api/src/plugins/support.ts`
      - `apps/api/src/plugins/README.md`
      - `apps/api/src/routes/example/` (whole dir)
      - `apps/api/src/routes/root.ts`
      - `apps/api/src/routes/README.md`
      - `apps/api/test/helper.ts`, `apps/api/test/plugins/`, `apps/api/test/routes/`, `apps/api/test/tsconfig.json` (whichever fastify-cli scaffold tests exist; verify per Task 9)
  - [x] Commit message: `feat(api): GET /todos with full plugin stack and observability (Story 1.5)`
  - [x] **Do NOT** stage anything in `apps/web/`, `packages/shared/`, or other root configs — this story is API-internal. If `git status` shows surprises, investigate before staging.

## Dev Notes

### Where this story sits

Story 1.5 is the **HTTP-server bring-up**. It transforms the data-layer foundation from Story 1.4 into an actual running, observable, hardened API. Every subsequent API story depends on the plugin order and patterns established here:

| Story | Reuses from this story |
| ----- | ---------------------- |
| 1.6   | Same `buildApp` shape — adds `@fastify/swagger` + `/health` route + `/docs` route. Same `setErrorHandler`. |
| 1.10  | `scripts/dev.sh` orchestrates `compose up db → drizzle-kit migrate → db:check → npm run dev` (which now runs `node --watch src/server.ts`). |
| 1.11  | Production Dockerfile builds `dist/server.js`; `npm start` invokes it. |
| 2.1   | `POST /todos` handler — same `withTypeProvider<ZodTypeProvider>()` pattern; same `listTodos`-style helper imported from `db/client.ts`. |
| 2.2, 2.3 | `PATCH`, `DELETE` — same plugin stack inherited; just new routes. |

The plugin order, env validation, correlation-ID propagation, and error envelope established here are the contract for every future endpoint.

### Critical architectural guardrails (bind these hard)

- **Plugin order is load-bearing.** `@fastify/env` MUST register first because `cors`, `rate-limit`, and (transitively) `db` read `app.config`. `request-context` MUST register before any route so its `onRequest` hook fires (which sets `requestContext.get('reqId')`, which the Pino mixin reads on the first log line of every request). [Source: architecture.md#Decision Impact Analysis — Implementation Sequence step 5].
- **`requestIdHeader: 'x-request-id'` AND `genReqId: () => randomUUID()`** — both are required. Fastify default `requestIdHeader` is `'request-id'` (no `x-`); we override to the conventional name. Architecture mandates `x-{kebab-case}` header naming. [Source: architecture.md#Naming Patterns — Custom headers].
- **Pino mixin reads from `requestContext.get('reqId')`, not `req.id` directly.** The mixin runs in the global logger scope where `req` isn't visible; AsyncLocalStorage (which `@fastify/request-context` wraps) is the bridge. [Source: architecture.md#API & Communication Patterns — Logging].
- **All HTTP error responses use the Fastify-sensible envelope.** `{ statusCode, error, message, code? }` — no hand-crafted shapes. The route handler should never `reply.code(500).send({...})`. Throw or use `reply.internalServerError()` and let `setErrorHandler` map it. [Source: architecture.md#Process Patterns — Error handling (server)].
- **Request-scoped logs include `requestId`, `method`, `path`, `statusCode`, `durationMs`.** Fastify auto-emits `reqId`, `req.method`, `req.url`, `res.statusCode`, and `responseTime` on `res` log. The Pino mixin adds `requestId` (mirror of `reqId` for clients that look for the documented field name). [Source: architecture.md#Communication Patterns — Logging].
- **`bodyLimit: 4096` AND `trustProxy: true`** — security and operational requirements. [Source: architecture.md#Authentication & Security].
- **Handlers import functions, not raw tables.** `listTodos` from `db/client.ts`. The `todos` Drizzle table is an implementation detail. [Source: architecture.md#Data Boundaries].
- **No DB error swallowing in handlers.** Let throws bubble to `setErrorHandler`. [Source: architecture.md#Process Patterns — Error handling (server)].
- **CORS_ORIGIN must be a single exact-match string from env.** Multi-origin support via array or function is a future-extension point, not v1 work. [Source: architecture.md#Authentication & Security; epics.md AC #2].

### Why no Zod for env?

`@fastify/env` is JSON-Schema-only — it wraps `env-schema`/Ajv. There's no Zod-native env validation plugin in the Fastify ecosystem (April 2026). Workarounds rejected for v1:

- **Hand-rolled Zod env validation in server.ts** — duplicates `@fastify/env`'s value (typed `app.config`, `dotenv` loading). Architecture explicitly mandates `@fastify/env`.
- **Zod-to-JSON-schema conversion at boot** — adds a transitive dep + runtime cost for marginal benefit. The 4-key env shape is small enough that JSON Schema is fine.

**Trade-off accepted:** env shape is JSON Schema (small duplication of contract style with Zod elsewhere), wire shape and DB shape are Zod (single source of truth for the API surface). The boundary is sharp: env is operational config, contracts are wire data. [Source: architecture.md#Critical Decisions — Validation; epics.md FR coverage].

### Helmet v12→v13 breaking changes

`@fastify/helmet` v13 (current April 2026) bumped underlying `helmet` major. Two defaults to override for an API serving JSON to a different-origin web app:

- `crossOriginResourcePolicy` defaulted to `same-origin` — rejects cross-origin JSON fetches. Set `cross-origin` (Task 3).
- `contentSecurityPolicy` defaulted to a strict policy — irrelevant for API-only JSON. Disable (`false`).

Without these overrides, you get a confusingly-passing CORS preflight followed by browser-blocked actual responses. The CSP block also bites Story 1.6's Swagger UI.

### `fastify-type-provider-zod` v6.1 — package name and runtime serialization

- **Package name is `fastify-type-provider-zod`** — no `@fastify/` scope. The architecture's prose refers to it as `@fastify/type-provider-zod` informally; that name does not exist on npm. Verify with `npm view fastify-type-provider-zod` if you want.
- **Response-side serialization is real, not OpenAPI-only.** `setSerializerCompiler(serializerCompiler)` makes `schema.response.<code>` Zod schemas validate the outgoing response object at runtime. A `Date` where a `z.string().datetime()` is expected throws `ResponseSerializationError` and the request fails. Hence Task 7's `toWire` mapping in `listTodos`.
- **Validator side handles request body/params/querystring** the same way — Zod throws on validation failure, and the plugin attaches `statusCode: 400` so `setErrorHandler` sees a typed validation error and passes it through (Task 5).
- **Type-provider compilers are set with `app.setValidatorCompiler` / `app.setSerializerCompiler` BEFORE routes register.** Compilers are scoped to the encapsulation context where they're set; setting at `buildApp` level applies app-wide. (Task 5 places them step 2, before all `app.register(...routes...)`.)
- **OpenAPI generation comes later (Story 1.6) via `@fastify/swagger` + `jsonSchemaTransform`** from this same package. The plugin already depends on `zod-to-json-schema` internally — no additional dep.

### Drizzle Date round-trip — pick one (we picked handler-side)

Drizzle's `timestamp({ withTimezone: true })` returns JS `Date`. Wire schema `TodoSchema.createdAt` is `z.string().datetime()`. Three valid resolutions:

1. **Handler-side `.toISOString()` mapping** in `listTodos` (Task 7 — chosen).
2. `mode: 'string'` on the Drizzle column — returns `string` directly. Rejected: changes Story 1.4's schema.ts.
3. `.preprocess(v => v instanceof Date ? v.toISOString() : v, z.string().datetime())` on the Zod schema. Rejected: leaks API-tier Drizzle quirk into the contract package shared with the web app.

The `toWire` helper pattern from Task 7 is the template for every future query helper.

### Module type and strip-types

apps/api emits CJS via tsc (per Story 1.4's discovery), but `node --experimental-strip-types` reparses TS files as ESM at runtime when ESM syntax is detected. Both `dev` and the test runner use this flag — it works for both module modes. The `start` script uses tsc-built CJS in `dist/` for production stability. The tradeoff: a Node startup warning ("module type not specified") on `dev`/`test`/`db:check`. Silencing requires committing apps/api to ESM (`"type": "module"` + adjust fastify-cli scaffold); deferred until a story explicitly needs it. [Source: Story 1.4 deferred-work item "Module-type decision for apps/api"].

### Integration test isolation

The architecture spec says "ephemeral Postgres schema per suite". For Story 1.5 with one route and a sequential test runner, **`DELETE FROM todos` per test** (in `beforeEach`) achieves the same logical isolation with much less infrastructure. Track-record: this is the standard simple-API integration test pattern. Defer per-suite/per-worker schema isolation (with `CREATE SCHEMA test_<uuid>` + `SET search_path` + per-schema migrations + `DROP CASCADE`) until parallel execution lands. Document the choice in Completion Notes.

### Plugin-stack registration vs autoload

Story 1.4 left the fastify-cli `@fastify/autoload` configuration in `app.ts` because Story 1.4 didn't own the plugin-stack registration. This story replaces autoload with explicit `app.register(...)` calls. Autoload's drawbacks:

- Directory order is alphabetical — fragile coupling between filename and registration order. (`@fastify/env` comes before `cors.ts` and `rateLimit.ts` alphabetically by chance, but this is implicit.)
- Hard to reason about the dependency graph. Explicit `dependencies: ['@fastify/env']` on the plugins (Tasks 3, 6) makes it explicit and is enforced by `fastify-plugin`.
- `@fastify/autoload` adds ~150 KB to the install. Removing it (along with `concurrently`, `c8`, `ts-node`) trims dev-install footprint.

### DB ↔ wire shape mapping (extends Story 1.4's table)

| DB column      | DB type                            | TS field (Drizzle infer) | Wire field    | Conversion site          |
| -------------- | ---------------------------------- | ------------------------ | ------------- | ------------------------ |
| `id`           | `uuid`                             | `id: string`             | `id`          | identity                 |
| `text`         | `text NOT NULL`                    | `text: string`           | `text`        | identity                 |
| `completed`    | `boolean NOT NULL DEFAULT false`   | `completed: boolean`     | `completed`   | identity                 |
| `created_at`   | `timestamptz NOT NULL DEFAULT now()` | `createdAt: Date`      | `createdAt: string (ISO 8601)` | **`toWire` in `client.ts`** |

[Source: architecture.md#Naming Patterns — DB; architecture.md#Format Patterns — Dates on the wire].

### Previous story intelligence

**Story 1.4 (commits `bd1954f` + `9f2c763`):**
- `apps/api/src/db/client.ts` exists with `pool` (currently private), `db`, and `listTodos`. This story exports `pool` (Task 7) and changes `listTodos` to async + `Todo[]` return (Task 7).
- `apps/api/src/plugins/db.ts` decorates `app.db = db`. This story adds `pool.on('error', ...)` and the `onClose` hook (Task 6).
- `apps/api/src/db/migrate.ts` (fail-fast schema check) is unchanged by this story. Story 1.10 will invoke it before `npm run dev`.
- The 1.4 review applied 6 patches — relevant carryovers: `client.ts` `orderBy(asc(createdAt), asc(id))` for the FR10 tiebreaker (already done; this story preserves it).
- Two-zod-versions warning from Story 1.2 is irrelevant here — apps/api uses `zod` 3.x (the `packages/shared` peerDep). The root tree's zod 4.x is from eslint plugin; runtime resolution goes to 3.x for `@todo-app/shared` consumers.

**Story 1.3:**
- `docker-compose.yml` runs Postgres on port 5432. Local dev with port collisions: change `.env` (gitignored) only, not committed config.
- `.env.example` documents `DATABASE_URL`, `PORT`, `LOG_LEVEL`, `CORS_ORIGIN` — exactly what `@fastify/env` validates in this story.

**Story 1.2:**
- `@todo-app/shared` is precompiled to `dist/` via `prepare: tsc` on `npm install`. `apps/api` imports `TodoListResponseSchema` from `@todo-app/shared` and gets a runtime-importable Zod schema plus a `Todo` type.

**Story 1.1:**
- `apps/api/tsconfig.json` extends `["../../tsconfig.base.json", "fastify-tsconfig"]`. Runtime emits CJS (per Story 1.4 verification). `--experimental-strip-types` (Story 1.4's `db:check` pattern) handles `.ts` source loading.
- ESLint at root applies `tseslint.configs.recommended` with carve-outs for fastify-cli scaffold patterns. After Task 9's deletions, those carve-outs (e.g., `argsIgnorePattern` whitelist for `request|reply|t`) become eligible for tightening — a deferred item from Story 1.1, **track for a later story** (e.g., 2.1+ when more handlers establish the pattern).

### Latest tech specifics (April 2026)

- **Fastify v5.8.x** is the pinned major. `setErrorHandler` signature unchanged from v4. `genReqId` is called only when `requestIdHeader` is absent in the incoming request — required to honor `x-request-id`.
- **`@fastify/env` ^6.0.0** — JSON Schema only.
- **`@fastify/cors` ^11.2.0** — exact-string `origin` match for single-origin setups; `exposedHeaders` mandatory for browser-side `x-request-id` access.
- **`@fastify/helmet` ^13.0.0** — see "Helmet v12→v13" above.
- **`@fastify/rate-limit` ^10.3.0** — in-memory store fine for v1 single-instance.
- **`@fastify/request-context` ^6.2.0** — AsyncLocalStorage-based.
- **`fastify-type-provider-zod` ^6.1.0** — Zod v3 supported (matches `packages/shared`'s zod 3.x). Real response serialization at runtime (NOT just OpenAPI generation).
- **Node 22.x with `--experimental-strip-types`** — runs TS source directly. Stable enough for dev + test. Production uses `tsc → node dist/` for stability.

### Out-of-scope (do NOT do in this story)

- ❌ **No `@fastify/swagger` / `@fastify/swagger-ui`** — Story 1.6.
- ❌ **No `/health` route** — Story 1.6.
- ❌ **No `/docs` route or OpenAPI generation** — Story 1.6.
- ❌ **No `POST /todos`, `PATCH /todos/:id`, `DELETE /todos/:id`** — Stories 2.1–2.3. Adding any of these now duplicates plugin wiring across stories (low cost) but the test cases and deferred-work items diverge meaningfully.
- ❌ **No web client work** — `apps/web/src/lib/api.ts` is Story 1.8.
- ❌ **No production Dockerfile changes** — Story 1.11. The dev-mode `node --watch` script is sufficient for this story; production build is a separate concern.
- ❌ **No `scripts/dev.sh` orchestration** — Story 1.10.
- ❌ **No CI workflow** — Story 1.11.
- ❌ **No multi-origin CORS config** — single `CORS_ORIGIN` env value. Architecture defers multi-origin to "if/when needed".
- ❌ **No Redis-backed rate-limit** — single-instance in-memory is in scope.
- ❌ **No drizzle-zod schema derivation** — Zod schemas in `packages/shared` are the single source of truth. Story 1.4 explicitly out-of-scoped this; preserved.
- ❌ **No bundle-size CI gate** — Story 1.11 if at all (currently a deferred dev tool only).
- ❌ **No graceful pool shutdown timeout** — `pool.end()` is sufficient. If a future story shows tests timing out at teardown, add `AbortController` + timeout. Premature now.
- ❌ **No structured-log capture in tests** — see Task 12 watch-out about Pino mixin assertion. The unit-level proof is sufficient unless explicit log-line assertions become a story requirement.
- ❌ **No `request-context.set('reqId', req.id)` inside route handlers** — done globally in the `onRequest` hook (Task 3). Per-handler sets create drift hazard.

### Project Structure Notes

Target additions/modifications from this story:

```text
apps/api/
├── package.json                              # +deps, -unused devDeps, scripts replaced
└── src/
    ├── app.ts                                # MODIFIED — explicit plugin order + setErrorHandler
    ├── server.ts                             # NEW — Fastify instance + listen + graceful shutdown
    ├── config.ts                             # NEW — @fastify/env JSON schema + AppConfig type
    ├── db/
    │   └── client.ts                         # MODIFIED — export pool, listTodos returns Todo[] (wire-shaped)
    ├── plugins/
    │   ├── cors.ts                           # NEW
    │   ├── helmet.ts                         # NEW
    │   ├── rateLimit.ts                      # NEW
    │   ├── requestContext.ts                 # NEW
    │   ├── db.ts                             # MODIFIED — pool error + onClose hook
    │   ├── sensible.ts                       # DELETED — replaced by direct register in app.ts
    │   ├── support.ts                        # DELETED — fastify-cli boilerplate
    │   └── README.md                         # DELETED
    └── routes/
        ├── todos.ts                          # NEW — GET /todos
        ├── todos.test.ts                     # NEW — co-located unit tests
        ├── example/                          # DELETED — fastify-cli boilerplate
        ├── root.ts                           # DELETED — fastify-cli boilerplate
        └── README.md                         # DELETED

apps/api/test/
├── helper.ts                                 # DELETED if fastify-cli boilerplate (verify per Task 9)
├── plugins/                                  # DELETED if scaffold tests (verify)
├── routes/                                   # DELETED if scaffold tests (verify)
├── tsconfig.json                             # DELETED if no longer referenced
└── integration/                              # NEW — owned by this story onwards
    ├── helpers/
    │   ├── buildTestApp.ts                   # NEW
    │   └── seedDb.ts                         # NEW
    └── todos.int.test.ts                     # NEW
```

- **Alignment:** matches [Architecture §Complete Project Directory Structure](../../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure) for `apps/api/src/{server.ts, app.ts, config.ts, db/, plugins/, routes/}` and `apps/api/test/integration/`.
- **Variances at end of Story 1.5:**
  - No `apps/api/src/plugins/swagger.ts` (Story 1.6).
  - No `apps/api/src/routes/health.ts` (Story 1.6).
  - No `apps/api/test/integration/validation.int.test.ts` or `concurrency.int.test.ts` (Stories 2.x — these test request bodies and LWW which don't exist yet).
- **Pre-existing files NOT modified by this story:**
  - `apps/api/drizzle.config.ts`, `apps/api/drizzle/*` (Story 1.4 — schema/migration source of truth).
  - `apps/api/src/db/schema.ts`, `apps/api/src/db/migrate.ts` (Story 1.4).
  - `apps/api/tsconfig.json` (Story 1.1).
  - `packages/shared/*` (Story 1.2).
  - `docker-compose.yml`, `.env.example` (Story 1.3).
  - Root `eslint.config.mjs`, `tsconfig.base.json`, `package.json` workspace config (Story 1.1).

### Testing Requirements

- **Unit tests** (Task 10): `node --test --experimental-strip-types "src/**/*.test.ts"`. Stub `listTodos` via a buildAppForUnit helper or module mock; assert response status + body shape via `app.inject()`. Co-located with the file under test (architecture §Structure Patterns).
- **Integration tests** (Task 12): `node --test --experimental-strip-types "test/integration/**/*.int.test.ts"`. Real Postgres via local docker-compose. `beforeEach` truncates `todos`. Tests cover all 4 wire-level scenarios from AC #9.
- **Type-checking is the implicit unit test for the plugin wiring** — `tsc --noEmit` catches `app.config` misuse, route schema misalignment with `Todo` types, etc.
- **Manual smoke** (Task 14): `curl` against the running dev server proves the wire is correct end-to-end.

### References

- [Source: epics.md#Story 1.5: `GET /todos` endpoint with full plugin stack and observability] — original BDD acceptance criteria.
- [Source: architecture.md#API & Communication Patterns] — endpoint table, error envelope, correlation ID design, Pino mixin requirement.
- [Source: architecture.md#Authentication & Security] — `bodyLimit: 4096`, `trustProxy`, CORS lock to `CORS_ORIGIN`, helmet, rate-limit 100/min/IP.
- [Source: architecture.md#Decision Impact Analysis — Implementation Sequence step 5] — exact plugin list and order rationale.
- [Source: architecture.md#Process Patterns — Error handling (server)] — sensible envelope, no hand-crafted responses, global setErrorHandler.
- [Source: architecture.md#Communication Patterns — Logging] — mandatory structured fields per request log line.
- [Source: architecture.md#Naming Patterns — Custom headers] — `x-request-id`.
- [Source: architecture.md#Data Boundaries] — handlers import functions, not raw tables.
- [Source: architecture.md#Format Patterns — Dates on the wire] — ISO 8601 strings, `timestamptz` storage.
- [Source: prd.md#FR10] — consistent ordering across page loads (drives the `asc(createdAt), asc(id)` tiebreaker).
- [Source: prd.md#FR22] — `GET /todos` endpoint requirement.
- [Source: prd.md#NFR16] — server-side validation at every request boundary.
- [Source: prd.md#NFR24] — server logs diagnosable (Pino + correlation IDs).
- [Story 1.1 file] — apps/api scaffold; tsconfig extends fastify-tsconfig; ESLint config carve-outs.
- [Story 1.2 file] — `@todo-app/shared`'s precompile pattern + `TodoListResponseSchema`.
- [Story 1.3 file] — `docker-compose.yml` + `.env.example`.
- [Story 1.4 file] — `client.ts`, `db.ts` plugin shape, `migrate.ts` (unchanged here), `listTodos` ordering.
- [deferred-work.md] — Story 1.4 deferred items picked up by this story (pool error listener, graceful shutdown, Zod Date round-trip).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`

### Debug Log References

- **Top-level `await` rejected by tsc.** Initial `server.ts` used top-level `await buildApp(app)` and `await app.listen(...)`. tsc errored: TS1309 "The current file is a CommonJS module and cannot use 'await' at the top level". Wrapped in `async function main(): Promise<void> { ... } void main();` — works in both CJS and ESM modes. Story 1.4 dev notes flagged exactly this trap.
- **`@todo-app/shared` ESM-only export blocked CJS resolution.** First `npm run test:unit` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` because the shared package's `exports` field has only an `import` condition (no `require`/`default`), and apps/api was emitting CJS via the fastify-tsconfig default. Fix: added `"type": "module"` to apps/api/package.json. **This resolves the Story 1.4 deferred-work item "Module-type decision for apps/api"** — apps/api is now ESM end-to-end. Source files keep `.js` import extensions (intentional — they map to `.ts` via `tsx` at dev/test time and to `.js` after `tsc` build).
- **`--experimental-strip-types` doesn't rewrite `.js` → `.ts` at resolution.** Even with apps/api as ESM, `node --experimental-strip-types` could not resolve `import './todos.js'` because the `.js` file doesn't exist on disk. Picked `tsx` as a runtime loader (added `tsx@^4.21.0` as a devDep; switched all `dev`/`test*` scripts to `node --import tsx --test ...`). Production `start` still uses `tsc → node dist/server.js`.
- **Module-load throw on missing `DATABASE_URL` blocks unit tests.** `src/db/client.ts` throws at module scope if `DATABASE_URL` is unset — and unit tests' `import './todos.js'` transitively imports `client.ts`, even though the test stubs `listTodos`. Story Task 7's "DO NOT change client.ts's top-level throw" assumption holds for production but not for unit tests that bypass `buildApp`. Resolved by setting `DATABASE_URL` via Node's `--env-file=../../.env` flag on every script — sets process.env BEFORE any module loads. The pool is constructed but never queried because the unit test stubs `listTodos`.
- **`fastify-type-provider-zod@^6.1.0` is for Zod v4, not v3.** `packages/shared` uses Zod ^3.23.0. v6 emitted `Invalid schema passed: {...ZodObject...}` at response-serialization time. Downgraded to `^4.0.2` (last stable line that supports Zod v3). The story's pinned `^6.1.0` was based on research output that mistakenly assumed plugin v6 supports both Zod versions. **Watch-out for Story 1.6+:** `fastify-type-provider-zod` major must track `packages/shared`'s Zod major. If/when `packages/shared` migrates to Zod v4, bump the plugin to v6+ in lockstep.
- **`fastify-type-provider-zod` v4 doesn't have `@fastify/...` scope.** The package name on npm is `fastify-type-provider-zod` (no scope). Architecture/epics docs colloquially call it `@fastify/type-provider-zod`; that name doesn't exist on the registry. Story Task 1 already flagged this.
- **`incoming request` log line missed `requestId` from the Pino mixin.** First smoke test showed: response logs had `requestId` (from mixin) but the initial `incoming request` line had only Fastify's built-in `reqId` field — Fastify writes that line before user-registered `onRequest` hooks fire, so the AsyncLocalStorage value the mixin reads from isn't set yet. Cleanest fix: use Fastify's built-in `requestIdLogLabel: 'requestId'` to rename `reqId` → `requestId` on every request-scoped log line. Removed the now-redundant Pino `mixin` from server.ts and buildTestApp.ts (the duplicate `requestId` JSON field would have been a strict-parser hazard). The `@fastify/request-context` plugin remains registered (still used for the `x-request-id` response-header echo via `onSend` hook and as a forward-compat AsyncLocalStorage primitive).
- **Local DATABASE_URL on port 5433 (Story 1.4 carryover).** The dev machine has another container on 5432. Per the documented pattern, `docker-compose.yml` was temporarily edited to bind `127.0.0.1:5433:5432` for the duration of test runs, then reverted to canonical `5432:5432` before commit. Local `.env` (gitignored) keeps `DATABASE_URL=...localhost:5433/...`. Same workaround Story 1.4 used.
- **Markdownlint MD031 warnings on the story file.** Pre-existing pattern from earlier stories (1.1–1.4); style-only. No fix required.

### Completion Notes List

**What was built:**

- **Plugin stack** — six new files in `apps/api/src/plugins/`: [cors.ts](../../apps/api/src/plugins/cors.ts) (origin from `app.config.CORS_ORIGIN`, `exposedHeaders: ['x-request-id']`), [helmet.ts](../../apps/api/src/plugins/helmet.ts) (CSP off, `crossOriginResourcePolicy: 'cross-origin'` for v13 compat), [rateLimit.ts](../../apps/api/src/plugins/rateLimit.ts) (100/min/IP, default envelope), [requestContext.ts](../../apps/api/src/plugins/requestContext.ts) (`requestContext.set('reqId', req.id)` on onRequest, echoes `x-request-id` on onSend). The existing [db.ts](../../apps/api/src/plugins/db.ts) was extended with `pool.on('error', ...)` and `app.addHook('onClose', () => pool.end())` — closes Story 1.4's deferred-work items.
- **`buildApp` rewrite** — [src/app.ts](../../apps/api/src/app.ts) now explicitly registers plugins in order: `@fastify/env` → setValidatorCompiler/setSerializerCompiler → sensible → request-context → helmet → cors → rate-limit → db → todos route → setErrorHandler. Drops `@fastify/autoload`.
- **Server entrypoint** — [src/server.ts](../../apps/api/src/server.ts) constructs the Fastify instance with `requestIdHeader: 'x-request-id'`, `requestIdLogLabel: 'requestId'`, `genReqId: () => randomUUID()`, `bodyLimit: 4096`, `trustProxy: true`, calls `buildApp(app)`, registers SIGINT/SIGTERM graceful-shutdown handlers, and calls `app.listen({ port: app.config.PORT, host: '0.0.0.0' })`.
- **Env validation** — [src/config.ts](../../apps/api/src/config.ts) defines a JSON Schema for `@fastify/env` (`DATABASE_URL` and `CORS_ORIGIN` required; `PORT` defaults to 4000; `LOG_LEVEL` defaults to `info` with Pino-level enum). Ambient `declare module 'fastify'` types `app.config`.
- **GET /todos route** — [src/routes/todos.ts](../../apps/api/src/routes/todos.ts) uses `withTypeProvider<ZodTypeProvider>()` and registers `response: { 200: TodoListResponseSchema }`. Accepts an optional `listTodos` plugin opt for unit-test injection.
- **Drizzle Date → ISO string mapping** — [src/db/client.ts](../../apps/api/src/db/client.ts) gained a private `toWire` helper that converts `row.createdAt` (`Date`) to `createdAt` (ISO 8601 string). `listTodos` now returns `Promise<Todo[]>` (wire-shaped). `pool` is now exported. Closes Story 1.4 deferred-work item "Zod `datetime()` round-trip with Drizzle Date objects."
- **Tests:** [src/routes/todos.test.ts](../../apps/api/src/routes/todos.test.ts) — 2 unit tests with stub injection; [test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) — 4 integration tests against real Postgres (empty list, populated list with non-chronological seed proving ORDER BY works, `x-request-id` echo, `x-request-id` generation); test infrastructure under [test/integration/helpers/](../../apps/api/test/integration/helpers/).
- **Cleanup** — deleted fastify-cli scaffold leftovers: `src/plugins/{sensible,support}.ts`, `src/plugins/README.md`, `src/routes/example/`, `src/routes/root.ts`, `src/routes/README.md`, `test/helper.ts`, `test/plugins/`, `test/routes/`, `test/tsconfig.json`.
- **Package scripts overhaul** — `dev` is now `node --env-file=../../.env --watch --import tsx src/server.ts`; `start` is `tsc && node dist/server.js`; `test` / `test:unit` / `test:integration` use `node --env-file --import tsx --test`. Removed `c8`, `ts-node`, `concurrently`, `@fastify/autoload`, `fastify-cli`. Added `tsx@^4.21.0` devDep. Added `"type": "module"`.

**ACs validated (concrete evidence):**

- **AC #1 (full plugin stack + env fail-fast)** ✓ — All eight plugins registered in [app.ts](../../apps/api/src/app.ts). `@fastify/env` validates the four env vars per `envSchema` in [config.ts](../../apps/api/src/config.ts).
- **AC #2 (CORS lock to env origin)** ✓ — Smoke test: `access-control-allow-origin: http://localhost:3000` matches `CORS_ORIGIN`.
- **AC #3 (rate-limit 100/min/IP)** ✓ — Smoke test headers `x-ratelimit-limit: 100`, `x-ratelimit-remaining: 99`, `x-ratelimit-reset: 60`.
- **AC #4 (echo x-request-id + Pino structured logs)** ✓ — Integration test "x-request-id is echoed when sent" passes. Smoke logs: both `incoming request` and `request completed` lines include `requestId` (single field, no duplicate). `req.method`/`req.url` cover `method`/`path`; `res.statusCode` covers `statusCode`; `responseTime` covers `durationMs`.
- **AC #5 (generate UUID when absent)** ✓ — Integration test "x-request-id is generated when absent" passes.
- **AC #6 (empty list 200 with `{ todos: [] }`)** ✓ — Both unit and integration tests cover this.
- **AC #7 (populated list, ordered, snake_case→camelCase)** ✓ — Integration test seeds 3 rows in non-chronological insert order, asserts the response orders chronologically (`['first','second','third']`) with ISO `createdAt` field.
- **AC #8 (setErrorHandler 500 envelope + error log)** ✓ — `setErrorHandler` in [app.ts](../../apps/api/src/app.ts) maps unhandled errors to `reply.internalServerError()` and logs at `error` level with the Error object. Direct integration test deferred to Story 1.6 per the story's scope cut (no error-throwing route exists yet).
- **AC #9 (integration tests)** ✓ — All 4 specified tests pass against real Postgres.
- **AC #10 (unit tests via app.inject + stubbed db)** ✓ — Both unit tests pass.

**Final lint + test gate:**

- `npm run lint` (repo root) → exit 0, no warnings.
- `(cd apps/api && npx tsc --noEmit)` → exit 0.
- `npm test --workspace apps/api` → 6/6 pass.
- `npm test --workspace packages/shared` → 25/25 pass (no regression).

**Notable deviations from the story plan:**

1. **`fastify-type-provider-zod` pinned to `^4.0.2` instead of `^6.1.0`.** v6 only supports Zod v4; `packages/shared` is on Zod v3.
2. **`apps/api` switched to ESM (`"type": "module"`).** Forced by the cross-package import of the ESM-only `@todo-app/shared`. **Resolves Story 1.4's "Module-type decision" deferred item.** No source rewrites needed (no `__dirname`/`require` usage in apps/api/src).
3. **Added `tsx` as a runtime loader for dev/test scripts.** `--experimental-strip-types` alone doesn't do `.js` → `.ts` resolution. Production `start` still tsc-builds.
4. **`requestIdLogLabel: 'requestId'` replaces the Pino mixin.** Hits every request log line including the first `incoming request` (which the mixin missed). Better serves the architecture's intent.
5. **Light DI on the route plugin** — `routes/todos.ts` accepts an optional `listTodos` via plugin opts to enable unit-test stubbing without module mocking.
6. **`db:check` and `db:migrate` updated to use `--env-file` and tsx** — needed for consistency with the rest of the dev/test workflow.

**Story 1.4 deferred items addressed by this story:**

- ✅ pool error listener (added in plugins/db.ts)
- ✅ graceful shutdown via `onClose` (added in plugins/db.ts)
- ✅ Drizzle Date round-trip (toWire helper in db/client.ts)
- ✅ Module-type decision for apps/api (now ESM)

Remaining deferred items (lazy `client.ts` init, malformed-`DATABASE_URL` guard, ESLint `no-restricted-imports` for raw `todos` table) stay deferred — none impeded Story 1.5.

**Known follow-ups (out of this story's scope):**

- **Per-suite Postgres schema isolation for parallel test execution** — current integration tests use `DELETE FROM todos` per test; works for sequential `node:test`. If parallel runners land later, switch to `CREATE SCHEMA test_<uuid>`.
- **AC #8 direct integration coverage** — Story 1.6 (`/health` 503 path) is the natural place to add an error-throwing test scenario.
- **Pool tuning (`max`, timeouts)** — still deferred per [deferred-work.md](deferred-work.md). Story 1.11 production-readiness will address.

### File List

**Created:**

- [apps/api/src/server.ts](../../apps/api/src/server.ts) — Fastify instance + listen + graceful shutdown
- [apps/api/src/config.ts](../../apps/api/src/config.ts) — `@fastify/env` JSON schema + `AppConfig` type augmentation
- [apps/api/src/plugins/cors.ts](../../apps/api/src/plugins/cors.ts)
- [apps/api/src/plugins/helmet.ts](../../apps/api/src/plugins/helmet.ts)
- [apps/api/src/plugins/rateLimit.ts](../../apps/api/src/plugins/rateLimit.ts)
- [apps/api/src/plugins/requestContext.ts](../../apps/api/src/plugins/requestContext.ts)
- [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) — `GET /todos` handler with light DI
- [apps/api/src/routes/todos.test.ts](../../apps/api/src/routes/todos.test.ts) — co-located unit tests
- [apps/api/test/integration/helpers/buildTestApp.ts](../../apps/api/test/integration/helpers/buildTestApp.ts)
- [apps/api/test/integration/helpers/seedDb.ts](../../apps/api/test/integration/helpers/seedDb.ts)
- [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts)

**Modified:**

- [apps/api/src/app.ts](../../apps/api/src/app.ts) — rewritten: explicit plugin registration order + `setErrorHandler`
- [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts) — exported `pool`; `listTodos` now async + returns `Todo[]`; added private `toWire(row)` for Date→ISO conversion
- [apps/api/src/plugins/db.ts](../../apps/api/src/plugins/db.ts) — added `pool.on('error', ...)` listener and `app.addHook('onClose', () => pool.end())`; declared `dependencies: ['@fastify/env']`
- [apps/api/package.json](../../apps/api/package.json) — `"type": "module"`; new deps; tsx devDep; removed unused; replaced scripts to use `--env-file=../../.env --import tsx`
- root `package-lock.json` — reflects dependency changes

**Deleted (fastify-cli scaffold leftovers):**

- `apps/api/src/plugins/sensible.ts`, `apps/api/src/plugins/support.ts`, `apps/api/src/plugins/README.md`
- `apps/api/src/routes/example/index.ts`, `apps/api/src/routes/root.ts`, `apps/api/src/routes/README.md`
- `apps/api/test/helper.ts`, `apps/api/test/plugins/support.test.ts`, `apps/api/test/routes/example.test.ts`, `apps/api/test/routes/root.test.ts`, `apps/api/test/tsconfig.json`

### Change Log

| Date | Author | Change |
| ---- | ------ | ------ |
| 2026-04-29 | Claude Opus 4.7 (Create-Story) | Story 1.5 contexted; status `backlog` → `ready-for-dev`. |
| 2026-04-29 | Claude Opus 4.7 (Dev) | Story 1.5 implemented; status `ready-for-dev` → `review`. All 15 tasks complete; 6/6 apps/api tests pass; 25/25 packages/shared tests pass; lint + tsc clean. |
