# Story 2.2: PATCH /todos/:id endpoint with LWW semantics

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an API consumer,
I want to PATCH a todo by ID with `{ completed: boolean }` and receive the updated entity,
So that clients can toggle completion state (FR24) with explicit last-write-wins concurrency semantics (FR15, NFR6).

## Acceptance Criteria

1. **Given** `PATCH /todos/:id` with body `{ "completed": true }` against an existing todo,
   **When** a client issues the request,
   **Then** the response is `200` with a body matching `TodoSchema` — `{ id, text, completed: true, createdAt }`,
   **And** the row's `completed` column is `true` after the request,
   **And** `created_at` (DB) maps to `createdAt` (wire) per the existing `toWire` helper.

2. **Given** `PATCH /todos/:id` with body `{ "completed": false }` against an already-completed todo,
   **When** a client issues the request,
   **Then** the response is `200` with `completed: false`,
   **And** the row reflects the new value (idempotent setter — same value twice yields same final state, no error).

3. **Given** `PATCH /todos/:id` where `:id` is a syntactically valid UUID but no row with that id exists,
   **When** a client issues the request,
   **Then** the response is `404` with the Fastify-sensible envelope `{ statusCode: 404, error: "Not Found", message: "<details>" }`,
   **And** no row is created.

4. **Given** `PATCH /todos/:id` where `:id` is not a valid UUID (e.g., `not-a-uuid`, empty path segment, integer),
   **When** a client issues the request,
   **Then** the response is `400` via Zod params validation,
   **And** no DB query is issued (validation runs before the handler).

5. **Given** `PATCH /todos/:id` with an empty body `{}`, a missing `completed` field, or an unknown extra field (e.g., `{ "text": "x", "completed": true }`, `{ "completed": true, "id": "..." }`),
   **When** a client issues the request,
   **Then** the response is `400` because `UpdateTodoRequestSchema` is `.strict()` and `completed` is required (resolves FR24, NFR16, NFR18),
   **And** no row is mutated.

6. **Given** two concurrent `PATCH /todos/:id` requests against the same row from different "clients" (two `Promise`s issued in parallel without awaiting between them) with opposite `completed` values,
   **When** they are awaited,
   **Then** both respond `200` with `TodoSchema`,
   **And** the final DB row's `completed` value equals one of the two requests' values (LWW),
   **And** no error is raised (no deadlock, no constraint violation, no row corruption — NFR6),
   **And** the handler does NOT use `If-Match`, `ETag`, `updated_at`-comparison, or `db.transaction(...)`.

7. **Given** the API is running with `/docs` enabled,
   **When** a developer inspects the OpenAPI spec,
   **Then** `PATCH /todos/:id` is documented under the `todos` tag with:
   - request `params` schema (`{ id: uuid }`),
   - request body schema (`UpdateTodoRequestSchema` — `{ completed: boolean }`),
   - 200 response schema (`TodoSchema`),
   - description containing the verbatim phrase: **"Concurrency semantics are last-write-wins; no `If-Match` or ETag is supported."**

8. **Given** [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) (PATCH cases) and **a new file** [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts) (LWW proof),
   **When** the integration suite runs (`npm run test:integration --workspace apps/api` against a live local Postgres),
   **Then** PATCH coverage includes:
   - happy path true→false and false→true (AC #1, #2),
   - 404 on missing id (AC #3),
   - 400 on bad UUID (AC #4),
   - 400 on empty body / missing field / unknown field (AC #5),
   - round-trip: PATCH then GET reflects the new `completed` value (AC #1).
   The concurrency file contains exactly one test that issues two parallel PATCHes with opposite values, asserts both return 200, and asserts the final row matches one of the two values.

## Tasks / Subtasks

- [x] **Task 1: Add `updateTodoCompleted()` query helper to the DB client (AC: #1, #2, #3, #6)**
  - [x] Edit [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts):

    ```ts
    import type { CreateTodoRequest, Todo } from '@todo-app/shared';
    import { asc, eq } from 'drizzle-orm';
    // ...existing imports...

    export const updateTodoCompleted = async (
      id: string,
      completed: boolean,
    ): Promise<Todo | null> => {
      const [row] = await db
        .update(todos)
        .set({ completed })
        .where(eq(todos.id, id))
        .returning();
      return row ? toWire(row) : null;
    };
    ```

  - [x] **Why `Todo | null` (not throw on missing)** — the route handler maps `null` to `reply.notFound()` (AC #3). A missing row is a normal client error, not an exceptional condition; throwing here would force the handler into a try/catch that the architecture explicitly forbids ([architecture.md:401](../../_bmad-output/planning-artifacts/architecture.md#L401)).
  - [x] **Why `eq(todos.id, id)` (not raw SQL)** — `id` arrives at this function already validated as a UUID by the route's `params` schema (Task 2). Drizzle's `eq()` parameterises the value; no SQL injection risk and no need for explicit cast — Postgres coerces the JS string to `uuid` via the column type.
  - [x] **Why a single UPDATE (no transaction)** — atomic by Postgres row-level semantics. AC #6 explicitly forbids `db.transaction(...)` for this single-row write. The architecture flags multi-statement transactions as something to add only when there is a multi-row write ([architecture.md:240](../../_bmad-output/planning-artifacts/architecture.md#L240) — "LWW is the explicit contract"; [architecture.md:670](../../_bmad-output/planning-artifacts/architecture.md#L670) — "LWW enforcement via `UPDATE` without optimistic-concurrency checks").
  - [x] **Why no `WHERE updated_at = $X` / `If-Match` token** — there is no `updated_at` column on the `todos` table (Story 1.4, [schema.ts](../../apps/api/src/db/schema.ts)). LWW means the *write* is the truth; no compare-and-swap.
  - [x] **Why reuse `toWire`** — guarantees the wire shape matches `TodoSchema` (camelCase `createdAt`, ISO-8601 string). Same helper used by `listTodos` and `createTodo`; keeps GET/POST/PATCH byte-identical for any given row.
  - [x] **Watch-out:** `db.update(...).set(...).where(...).returning()` returns `Todo[]`. Destructure `[row]` and rely on the `row ? ... : null` ternary — do not access `[0]` on the bare array under `noUncheckedIndexedAccess`.
  - [x] **Watch-out:** Do NOT pass `{ completed, ...input }` or spread arbitrary fields. The route validates exactly `{ completed: boolean }` against `UpdateTodoRequestSchema.strict()`; passing only the explicit field keeps the seam tight against schema drift.

- [x] **Task 2: Add PATCH handler to the existing todos routes plugin (AC: #1–#5, #7)**
  - [x] Edit [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) — extend the existing `todosRoutes` plugin (do NOT create a separate file):

    ```ts
    import {
      CreateTodoRequestSchema,
      TodoListResponseSchema,
      TodoSchema,
      UpdateTodoRequestSchema,
    } from '@todo-app/shared';
    import {
      createTodo as defaultCreateTodo,
      listTodos as defaultListTodos,
      updateTodoCompleted as defaultUpdateTodoCompleted,
    } from '../db/client.js';
    import { z } from 'zod';
    // ...existing imports...

    const TodoIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

    export interface TodosRouteOptions {
      listTodos?: typeof defaultListTodos;
      createTodo?: typeof defaultCreateTodo;
      updateTodoCompleted?: typeof defaultUpdateTodoCompleted;
    }

    const todosRoutes: FastifyPluginAsync<TodosRouteOptions> = async (app, opts) => {
      const list = opts?.listTodos ?? defaultListTodos;
      const create = opts?.createTodo ?? defaultCreateTodo;
      const updateCompleted = opts?.updateTodoCompleted ?? defaultUpdateTodoCompleted;

      // ...existing GET and POST handlers unchanged...

      app.withTypeProvider<ZodTypeProvider>().patch(
        '/todos/:id',
        {
          schema: {
            tags: ['todos'],
            summary: "Update a todo's completion state",
            description:
              'Sets `completed` on an existing todo. Body is validated against ' +
              '`UpdateTodoRequestSchema` — `.strict()` rejects unknown fields with 400. ' +
              'Concurrency semantics are last-write-wins; no `If-Match` or ETag is supported.',
            params: TodoIdParamsSchema,
            body: UpdateTodoRequestSchema,
            response: { 200: TodoSchema },
          },
        },
        async (req, reply) => {
          const todo = await updateCompleted(req.params.id, req.body.completed);
          if (!todo) return reply.notFound();
          return todo;
        },
      );
    };
    ```

  - [x] **Why declare `TodoIdParamsSchema` inline (not in `packages/shared`)** — path-param schemas are server-internal; they don't ship to clients (only request *body* and *response* schemas do). Architecture rule "Zod schema is the contract" ([architecture.md:430](../../_bmad-output/planning-artifacts/architecture.md#L430)) applies to the wire payload, not URL-segment validation. Keeping it inline avoids polluting `packages/shared` with non-shared shapes. **Important:** `.strict()` on params has no effect (URL params can't have unknown keys), but adding it is harmless and forward-compatible with Zod v4 if/when we migrate.
  - [x] **Why `reply.notFound()` (not `reply.code(404).send(...)`)** — `@fastify/sensible` produces the canonical envelope `{ statusCode: 404, error: 'Not Found', message }` ([architecture.md:400](../../_bmad-output/planning-artifacts/architecture.md#L400) — "Handlers throw via `@fastify/sensible` constructors"). Hand-crafting the response (anti-pattern at [architecture.md:485](../../_bmad-output/planning-artifacts/architecture.md#L485)) would skip the framework's 4xx logging hook and risk envelope drift.
  - [x] **Why `return reply.notFound()` (vs. `throw`)** — both work in Fastify. `return` is the idiomatic form used by `@fastify/sensible` examples and avoids spurious unhandled-rejection telemetry in dev. The global `setErrorHandler` ([app.ts:40](../../apps/api/src/app.ts#L40)) handles either path identically.
  - [x] **Why no explicit 400/404 response schema declaration** — per Story 2.1 / [architecture.md:401](../../_bmad-output/planning-artifacts/architecture.md#L401) — Zod-validation 400s and `reply.notFound()` 404s use the sensible envelope automatically. Declaring `{ 400: ErrorResponseSchema, 404: ErrorResponseSchema }` would force every error path through the schema serializer and is unnecessary verbosity.
  - [x] **Why DI on `updateTodoCompleted`** — Story 2.1 established `opts?.X ?? defaultX` as the per-route DI seam. Keep the option name `updateTodoCompleted` (mirror the function name; not `update`, `patchTodo`, or `setCompleted`). The seam is unused in production wiring; tests may or may not inject — fine either way.
  - [x] **Why the description quotes the LWW phrase verbatim** — AC #7 mandates the exact substring `"Concurrency semantics are last-write-wins; no \`If-Match\` or ETag is supported."` ships in the OpenAPI doc. The integration test in Task 4 (`/docs` verification) asserts this presence; do not paraphrase.
  - [x] **Watch-out:** Do NOT wrap the handler in `try/catch`. The Zod type provider validates `params` and `body` BEFORE the handler runs. The global `setErrorHandler` ([app.ts:40-52](../../apps/api/src/app.ts#L40-L52)) catches anything that escapes.
  - [x] **Watch-out:** Do NOT use `z.string().refine((s) => isUuid(s))` or `z.coerce.string()` for the params id. Use `z.string().uuid()` — the OpenAPI transform emits `format: uuid` which clients can use for typed generation.
  - [x] **Watch-out:** Order matters: place the PATCH block AFTER the existing POST block in the same plugin function. Plugin registration order (`setValidatorCompiler` → `swagger` → `todosRoutes` in [app.ts:22-37](../../apps/api/src/app.ts#L22-L37)) is unchanged.

- [x] **Task 3: Extend integration tests (AC: #1–#5, #8)**
  - [x] Edit [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) — append PATCH test cases after the existing POST block. Suggested cases:

    ```ts
    test('PATCH /todos/:id — toggles false→true on an existing row (AC #1)', async () => {
      // Seed a row directly (cheaper than POST + read), keep id deterministic
      const created = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: { text: 'walk dog' },
      });
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'PATCH',
        url: `/todos/${id}`,
        payload: { completed: true },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { id: string; text: string; completed: boolean };
      assert.equal(body.id, id);
      assert.equal(body.text, 'walk dog');
      assert.equal(body.completed, true);

      // Round-trip: GET reflects the change
      const list = await app.inject({ method: 'GET', url: '/todos' });
      const todos = (list.json() as { todos: Array<{ id: string; completed: boolean }> }).todos;
      assert.equal(todos.find((t) => t.id === id)?.completed, true);
    });

    test('PATCH /todos/:id — toggles true→false (AC #2)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: { text: 'wake up' },
      });
      const { id } = created.json() as { id: string };
      await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { completed: true } });

      const res = await app.inject({
        method: 'PATCH',
        url: `/todos/${id}`,
        payload: { completed: false },
      });
      assert.equal(res.statusCode, 200);
      assert.equal((res.json() as { completed: boolean }).completed, false);
    });

    test('PATCH /todos/:id — same value twice is idempotent (AC #2)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: { text: 'meditate' },
      });
      const { id } = created.json() as { id: string };

      const a = await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { completed: true } });
      const b = await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { completed: true } });
      assert.equal(a.statusCode, 200);
      assert.equal(b.statusCode, 200);
      assert.equal((b.json() as { completed: boolean }).completed, true);
    });

    test('PATCH /todos/:id — 404 on a valid-but-missing UUID (AC #3)', async () => {
      const ghostId = '00000000-0000-4000-8000-000000000000';
      const res = await app.inject({
        method: 'PATCH',
        url: `/todos/${ghostId}`,
        payload: { completed: true },
      });
      assert.equal(res.statusCode, 404);
      const body = res.json() as { statusCode: number; error: string; message: string };
      assert.equal(body.statusCode, 404);
      assert.equal(body.error, 'Not Found');
      assert.equal(typeof body.message, 'string');
    });

    test('PATCH /todos/:id — 400 on a malformed UUID (AC #4)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/todos/not-a-uuid',
        payload: { completed: true },
      });
      assert.equal(res.statusCode, 400);
    });

    test('PATCH /todos/:id — 400 on empty body (AC #5)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: { text: 'breathe' },
      });
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'PATCH',
        url: `/todos/${id}`,
        payload: {},
      });
      assert.equal(res.statusCode, 400);

      // Row unchanged
      const list = await app.inject({ method: 'GET', url: '/todos' });
      const todo = (list.json() as { todos: Array<{ id: string; completed: boolean }> })
        .todos.find((t) => t.id === id);
      assert.equal(todo?.completed, false);
    });

    test('PATCH /todos/:id — 400 on missing `completed` field (AC #5)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: { text: 'stretch' },
      });
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'PATCH',
        url: `/todos/${id}`,
        payload: { something: 'else' },
      });
      assert.equal(res.statusCode, 400);
    });

    test('PATCH /todos/:id — 400 on unknown field via `.strict()` (AC #5)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: { text: 'eat lunch' },
      });
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'PATCH',
        url: `/todos/${id}`,
        payload: { completed: true, text: 'oops' },
      });
      assert.equal(res.statusCode, 400);
    });
    ```

  - [x] **Why seed via POST instead of `seedTodos()`** — using the public POST keeps tests black-box: a regression in POST shows up in PATCH tests too. `seedTodos()` is still useful when a specific `createdAt` ordering or pre-existing `completed: true` state is needed; reach for it then.
  - [x] **Watch-out:** `beforeEach` in [todos.int.test.ts:17-20](../../apps/api/test/integration/todos.int.test.ts#L17-L20) calls `resetTodos()`. Each test starts empty. Do NOT seed cross-test state.
  - [x] **Watch-out:** Do NOT assert the exact 400 `message` string in negative tests. Zod's error messages can shift across minor versions; pinning the status code and the envelope shape is the contract. (Spec deferred from Story 2.1 review covers this concern at the file level.)

- [x] **Task 4: New concurrency integration test file (AC: #6, #8)**
  - [x] Create [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts):

    ```ts
    import assert from 'node:assert/strict';
    import { after, before, beforeEach, test } from 'node:test';
    import type { FastifyInstance } from 'fastify';
    import { buildTestApp } from './helpers/buildTestApp.js';
    import { resetTodos } from './helpers/seedDb.js';

    let app: FastifyInstance;

    before(async () => {
      app = await buildTestApp();
    });

    after(async () => {
      await app.close();
    });

    beforeEach(async () => {
      await resetTodos();
    });

    test('PATCH /todos/:id — concurrent opposite writes both succeed; final state is one of the two (LWW, AC #6)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: { text: 'race condition' },
      });
      assert.equal(created.statusCode, 201);
      const { id } = created.json() as { id: string };

      // Issue both PATCHes in parallel — Promise.all races at the event-loop level.
      // node-postgres pool serializes per-connection but pool size > 1 lets both
      // statements interleave. The DB is the synchronisation point; both writes
      // commit, the second wins (per Postgres row-level locking on UPDATE).
      const [a, b] = await Promise.all([
        app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { completed: true } }),
        app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { completed: false } }),
      ]);

      assert.equal(a.statusCode, 200);
      assert.equal(b.statusCode, 200);

      // Final row state must equal one of the two writes (no corruption, no third value).
      const list = await app.inject({ method: 'GET', url: '/todos' });
      const final = (list.json() as { todos: Array<{ id: string; completed: boolean }> })
        .todos.find((t) => t.id === id);
      assert.ok(final, 'row should still exist after concurrent PATCHes');
      assert.ok(
        final.completed === true || final.completed === false,
        'final completed must be a boolean',
      );
      // Both writes returned 200; whichever landed last wins. We do not assert
      // which — that is the LWW non-determinism. We assert *no error*.
    });
    ```

  - [x] **Why a separate file (`concurrency.int.test.ts`)** — architecture explicitly calls this file out at [architecture.md:597](../../_bmad-output/planning-artifacts/architecture.md#L597) ("LWW semantics proof"). Splits a slow, race-y test off from the fast `todos.int.test.ts` suite so it can be selectively skipped or run if it ever flakes. It still uses the same `buildTestApp()` helper so there is no test-infra duplication.
  - [x] **Why `Promise.all` (not staggered awaits)** — the goal is *event-loop parallelism* against the same row. Awaiting between them would serialise into a normal sequential test (covered already in Task 3's idempotency case).
  - [x] **Why we DON'T assert which write won** — that is the definition of LWW: which `UPDATE` commits last is non-deterministic from the client's perspective (depends on connection acquisition order, scheduler, etc.). AC #6 demands "the final DB row reflects whichever write landed last" — present-tense observation, not a deterministic prediction.
  - [x] **Watch-out:** Postgres pg-pool default size is 10 (`apps/api/src/db/client.ts` Pool with no `max` → driver default). Two parallel statements MUST get distinct connections to actually race. If pool ever drops to size 1, this test silently becomes a sequential test. Story 1.5 deferred a `max:` setting; this file is one of the things that would catch a misconfiguration.
  - [x] **Watch-out:** Do NOT add a third concurrent write or larger fan-out. AC #6 specifies *two* concurrent PATCHes. Larger N changes the proof shape (now you need to assert any of N values won), and the test gets flaky on slow CI machines.

- [x] **Task 5: Verify /docs renders the PATCH endpoint (AC: #7)**
  - [x] Start the dev stack: `npm run dev` (from repo root).
  - [x] Open `http://localhost:4000/docs`. Confirm:
    - The `todos` tag section now lists `GET /todos`, `POST /todos`, AND `PATCH /todos/{id}`.
    - Clicking PATCH expands a request body schema with one field `completed` (boolean) and a path param `id` (uuid format).
    - The 200 response shows the `Todo` schema.
    - The description string ends with the LWW phrase verbatim.
  - [x] Fetch `http://localhost:4000/docs/json` and grep for the PATCH operation:

    ```bash
    curl -s http://localhost:4000/docs/json \
      | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d['paths']['/todos/{id}']['patch'], indent=2))"
    ```

    Capture the output in Debug Log References. The `description` field MUST contain the verbatim LWW substring; fail Task 5 if it does not.
  - [x] **No code changes required** — `jsonSchemaTransform` from `fastify-type-provider-zod@^4` derives the params/body/response schemas from Zod automatically. `tags: ['todos']` (Task 2) handles grouping; the `todos` tag is pre-declared in [apps/api/src/plugins/swagger.ts:38](../../apps/api/src/plugins/swagger.ts#L38).

- [x] **Task 6: Sanity gates**
  - [x] `npm run lint` — must report 0 warnings, 0 errors.
  - [x] `npm run typecheck` — must report 0 errors. The handler's `req.params` should auto-type as `{ id: string }` and `req.body` as `{ completed: boolean }`.
  - [x] `npm run test` — runs unit tests across all workspaces (no DB required). Must pass.
  - [x] `npm run test:integration --workspace apps/api` — runs `todos.int.test.ts` + new `concurrency.int.test.ts` against a live local Postgres (start with `docker compose up -d db` if not already running). All PATCH cases AND the concurrency case must pass on three consecutive runs (test for flakiness).
  - [x] **No new lint/typecheck rules required.** The `eslint.config.mjs` and `tsconfig.base.json` already cover everything.
  - [x] If integration tests fail with "DATABASE_URL does not look like a local/test database," verify `apps/api/.env` exists and points to the local docker-compose Postgres.

- [x] **Task 7: Commit**
  - [x] Stage exactly:
    - **Modified:** [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts), [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts), [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts).
    - **New:** [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts).
  - [x] Commit message: `feat(api): PATCH /todos/:id endpoint with LWW semantics + concurrency proof (Story 2.2)`
  - [x] **Do NOT** stage anything in `_bmad-output/`, `node_modules/`, `.env*`, or any `apps/web/**` file (Story 2.2 is API-only; web wiring lives in Story 2.6).
  - [x] Record commit hash in the Change Log when the user runs the commit.

## Dev Notes

### Where this story sits

Story 2.2 is the second story of Epic 2 (Todo Core Loop). Story 2.1 shipped POST. Story 2.2 ships PATCH. Story 2.3 ships DELETE. Web-side wiring (the Radix Checkbox `<TodoItem>`, the optimistic toggle reducer actions, the `api.toggleTodo()` client wrapper) lands in **Stories 2.4 and 2.6**. The endpoint must work end-to-end (DB update, response shape, 404 path, LWW under contention) before any of those can be built.

After this story:

- `PATCH /todos/:id` returns 200 with the bare entity (single-resource shape, mirrors POST).
- `PATCH /todos/:id` returns 404 with the sensible envelope when the id is unknown.
- The `todos` table receives single-row UPDATEs; concurrent writes follow Postgres LWW semantics.
- Swagger UI at `/docs` documents GET, POST, and PATCH under the `todos` tag.
- The first concurrency integration test exists, proving NFR6 at the API boundary.

This story does NOT touch:

- The web app (Story 2.6 owns the toggle UI + API client wrapper).
- Reducer actions (Story 2.4 adds `toggleOptimistic` / `toggleFailed`).
- Toast UI on failure (Story 3.2 owns mutation-failure toasts).
- DELETE (Story 2.3).

### Critical architectural guardrails

1. **The schemas already exist.** [packages/shared/src/contracts.ts:20-24](../../packages/shared/src/contracts.ts#L20-L24) defines `UpdateTodoRequestSchema = z.object({ completed: z.boolean() }).strict()`. Do NOT redefine, extend, or copy. Story 1.2 closed this contract.
2. **The DB schema and migration already exist.** [apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts) declares all four columns; no migration is needed for this story. If you find yourself running `drizzle-kit generate`, stop.
3. **No `updated_at` column, no version token, no ETag.** The architecture is explicit ([architecture.md:240](../../_bmad-output/planning-artifacts/architecture.md#L240)): *"Concurrency semantics: last-write-wins, documented in OpenAPI descriptions. No ETag, no If-Match, no updated_at token."* If you feel tempted to add `WHERE updated_at = $X`, stop and read this section.
4. **No try/catch in the handler.** [architecture.md:401](../../_bmad-output/planning-artifacts/architecture.md#L401). The global `setErrorHandler` at [app.ts:40-52](../../apps/api/src/app.ts#L40-L52) handles validation 400s, sensible-throws (`reply.notFound()`), and unexpected throws.
5. **No `db.transaction(...)`.** Single UPDATE is atomic. AC #6 forbids it explicitly.
6. **Validation is at the boundary (Zod), not in the handler or DB.** The handler trusts `req.params.id` is a valid UUID and `req.body.completed` is a boolean. Re-validating inside the handler is redundant noise.
7. **No retries, no backoff.** [architecture.md:418](../../_bmad-output/planning-artifacts/architecture.md#L418).
8. **No `req.log.info({ todoId: id }, 'patching')` calls inside the handler.** The framework already logs `incoming request` / `request completed` with `requestId`, `method`, `path`, `statusCode`, `durationMs`. Story 1.5 covered logging fields uniformly across all routes; do not duplicate.

### Why a 200 (not 204) on success

REST style sometimes uses `204 No Content` for partial updates. We deliberately return `200` with the updated entity because:

- The web client needs the canonical post-write state to reconcile optimistic updates (Story 2.4).
- It mirrors POST's "single resource shape" rule ([architecture.md:363-368](../../_bmad-output/planning-artifacts/architecture.md#L363-L368)) — bare entity for both create and update.
- Avoids forcing the client to issue a follow-up GET.

### Why no `Location` header

Same reasoning as Story 2.1 — we don't expose `GET /todos/:id`, so there's nothing to point a Location header at.

### POST plugin order — already correct

Adding the PATCH handler to the existing `todosRoutes` plugin slots in at the same position as the existing GET and POST handlers — no order changes are needed. The Zod type provider compilers, Swagger registration, and `todosRoutes` registration order in [app.ts:22-37](../../apps/api/src/app.ts#L22-L37) is already correct.

### Logging — already automatic

Pino emits two structured lines per request: `incoming request` and `request completed`. Both carry `requestId`, `method`, `path`, `statusCode`, `durationMs`. PATCH /todos/:id requires zero handler-level logging beyond what the framework already produces.

The 4xx (validation 400, not-found 404) hits the global `setErrorHandler` ([app.ts:40-52](../../apps/api/src/app.ts#L40-L52)) which logs at info-level (4xx) or warn-level (5xx). 5xx (DB unreachable, etc.) is logged with full stack at error level. No code changes here.

### Why the per-resource tests live in `todos.int.test.ts` but the LWW test in `concurrency.int.test.ts`

The architecture's structure pattern says: *"API integration tests: under `apps/api/test/integration/` — they own a different lifecycle (DB setup/teardown)."* ([architecture.md:352](../../_bmad-output/planning-artifacts/architecture.md#L352)). It also pre-names the concurrency file at [architecture.md:597](../../_bmad-output/planning-artifacts/architecture.md#L597). Splitting the race-y test off:

- Lets a CI flake on `concurrency.int.test.ts` not block the rest of the integration suite.
- Lets a developer focus the suite on a single concern (`node --test --test-name-pattern=...`).
- Keeps `todos.int.test.ts` fast and focused on per-resource semantics.

### What changes in the codebase

| File | Change | LOC delta (approx.) |
|------|--------|---------------------|
| [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts) | Add `updateTodoCompleted()` export; add `eq` import | +12 / -1 |
| [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) | Add PATCH handler; add `TodoIdParamsSchema`; extend `TodosRouteOptions`; import `UpdateTodoRequestSchema`, `z`, `defaultUpdateTodoCompleted` | +35 / -2 |
| [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) | Append PATCH test cases | +130 / -0 |
| [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts) | NEW file: LWW concurrency proof | +50 / -0 (new) |

Total: ~+225 added LOC across 4 files. One new file. No deletions of existing logic. No new dependencies.

### Out-of-scope (do NOT do in this story)

- Web-side `apps/web/src/lib/api.ts` toggle wrapper — Story 2.6.
- Reducer actions for optimistic toggle — Story 2.4.
- `<TodoItem>` Radix Checkbox UI — Story 2.6.
- Toast on failure — Story 3.2.
- DELETE endpoint — Story 2.3.
- PATCH for `text` updates — never (FR24 is completion-state only; renaming is out of scope for v1).
- ETag / If-Match / `updated_at` column — explicitly forbidden by architecture.
- Idempotency-Key header — explicitly deferred (architecture v1 says no).
- Soft-delete — never (architecture mandates hard DELETE; soft-delete is out of scope).
- `Location` header — see "Why no `Location` header" above.
- Per-tag SLOs — NFR2 covers the whole API uniformly.

### Project Structure Notes

The endpoint slots into the existing `apps/api/` structure unchanged, plus one new test file:

```text
apps/api/
├── src/
│   ├── db/
│   │   ├── client.ts            # ← extended with updateTodoCompleted()
│   │   └── schema.ts            # unchanged
│   └── routes/
│       └── todos.ts             # ← extended with PATCH handler + TodoIdParamsSchema
└── test/
    └── integration/
        ├── todos.int.test.ts    # ← extended with PATCH cases
        └── concurrency.int.test.ts   # ← NEW file (LWW proof)
```

The architecture's "no business logic in handlers, no request/response concerns in db/" boundary ([architecture.md:636-639](../../_bmad-output/planning-artifacts/architecture.md#L636-L639)) is satisfied: `updateTodoCompleted()` knows nothing about HTTP; the handler does no business logic beyond `parse → call → 404-or-return`.

### Testing Requirements

- **Unit tests:** none required. The handler is too thin to unit-test; the `updateTodoCompleted()` DB function is exercised through integration tests against real Postgres.
- **Integration tests (per-resource):** mandatory in `todos.int.test.ts` covering ACs 1–5 and the round-trip case (PATCH then GET).
- **Integration tests (concurrency):** mandatory in NEW `concurrency.int.test.ts` covering AC 6 with two parallel PATCHes.
- **Test runner:** `node --test`. No new dev dependency.
- **DB fixtures:** existing `resetTodos()` in [helpers/seedDb.ts](../../apps/api/test/integration/helpers/seedDb.ts). For PATCH, prefer seeding via the public POST endpoint (cheaper black-box; catches POST regressions in PATCH tests too); fall back to `seedTodos()` only if a specific `createdAt` ordering or pre-existing `completed: true` state is needed.
- **Coverage gate:** none in v1.
- **Test isolation:** `beforeEach(resetTodos)` ensures each test starts from an empty table. The concurrency file uses the same pattern.
- **Run-three rule:** the concurrency test should pass on three consecutive `npm run test:integration` runs before the story moves to `review`. Any flake means the LWW proof is not truly proven; debug the Promise.all setup before declaring done.

### Library / version pins (April 2026)

These are already installed and pinned by Story 1.4 / 1.5; do NOT bump them in this story:

- `fastify@^5.x`, `fastify-cli@^7.x`, `fastify-plugin@^5.x`
- `@fastify/sensible@^6.x`, `@fastify/swagger@^9.x`, `@fastify/swagger-ui@^5.x`
- `fastify-type-provider-zod@^4.0.2`
- `zod@^3.23.0` (DO NOT use Zod v4)
- `drizzle-orm@^0.36.x` — **uses `eq` from `drizzle-orm`** (not from a sub-path)
- `pg@^8.13.x`
- Node.js `node:test` runner (built-in to Node 22)

### Story 2.1 patterns to mirror (verbatim, where applicable)

The following patterns established by Story 2.1 ([2-1-post-todos-endpoint.md](./2-1-post-todos-endpoint.md), commit `c9ec25a`) are the canonical templates for this story:

- **DB helper signature:** typed input → typed output, optional `null` for not-found cases. Use `toWire(row)` to map DB-shape to wire-shape.
- **Destructure-with-guard on `.returning()`:** `const [row] = await db...().returning(); if (!row) ...` — the `noUncheckedIndexedAccess` TS option requires this.
- **DI seam in `TodosRouteOptions`:** `opts?.X ?? defaultX`. Mirror exactly.
- **Bare entity response (not wrapped):** PATCH returns `Todo`, not `{ todo: Todo }` — single-resource shape per [architecture.md:363-368](../../_bmad-output/planning-artifacts/architecture.md#L363-L368).
- **Handler is `parse → call → return`:** no try/catch, no manual validation, no logging.
- **No explicit error-response schemas** in the route's `response: { ... }` block — only the success status. Validation 400s and `reply.notFound()` use the sensible envelope automatically.
- **Tags:** `tags: ['todos']` — pre-declared in [swagger.ts:38](../../apps/api/src/plugins/swagger.ts#L38).
- **Test seeding via the public POST** for cross-endpoint coverage in `todos.int.test.ts`; reach for `seedTodos()` only when a specific timestamp/state is needed.

Story 2.1 review yielded six deferred items in [deferred-work.md](./deferred-work.md). Three of them apply equally here:

- **Negative tests pin status code only, not validation `message` content** — same trade-off applies to PATCH negative cases. Story 2.2 follows the established pattern.
- **No test for wrong/missing `Content-Type`** — same pre-existing gap; do not introduce here.
- **No test verifying response schema strips additional fields** — pre-existing serializer concern; orthogonal.

### References

- **Architecture:**
  - Endpoint table: [architecture.md:226-233](../../_bmad-output/planning-artifacts/architecture.md#L226-L233) (PATCH /todos/:id: 200, 400/404/500).
  - Concurrency contract: [architecture.md:240](../../_bmad-output/planning-artifacts/architecture.md#L240) ("LWW is the explicit contract").
  - Response shape: [architecture.md:363-368](../../_bmad-output/planning-artifacts/architecture.md#L363-L368) ("Single resource (create, update): the bare entity").
  - Pattern example: [architecture.md:463-472](../../_bmad-output/planning-artifacts/architecture.md#L463-L472).
  - Validation rules: [architecture.md:215](../../_bmad-output/planning-artifacts/architecture.md#L215).
  - Error handling: [architecture.md:398-402](../../_bmad-output/planning-artifacts/architecture.md#L398-L402).
  - LWW enforcement location: [architecture.md:670](../../_bmad-output/planning-artifacts/architecture.md#L670) ("`UPDATE` without optimistic-concurrency checks").
  - Concurrency test file pre-named: [architecture.md:597](../../_bmad-output/planning-artifacts/architecture.md#L597).
  - Service boundaries: [architecture.md:634-639](../../_bmad-output/planning-artifacts/architecture.md#L634-L639).
- **PRD:**
  - FR15 (LWW resolution): [prd.md:298](../../_bmad-output/planning-artifacts/prd.md#L298).
  - FR24 (update endpoint): [prd.md:313](../../_bmad-output/planning-artifacts/prd.md#L313).
  - FR2 (toggle UI): [prd.md:217](../../_bmad-output/planning-artifacts/prd.md#L217) (cross-references this endpoint).
  - NFR6 (concurrent integrity): [prd.md:339](../../_bmad-output/planning-artifacts/prd.md#L339).
  - NFR16/NFR18 (server validation, input bounds): [prd.md:355,357](../../_bmad-output/planning-artifacts/prd.md#L355).
  - NFR2 (300 ms p95): [prd.md:332](../../_bmad-output/planning-artifacts/prd.md#L332).
- **Epics:**
  - Story 2.2 full text: [epics.md:745-788](../../_bmad-output/planning-artifacts/epics.md#L745-L788).
  - Story 2.4 cross-dependency (toggle reducer actions): [epics.md:824-840](../../_bmad-output/planning-artifacts/epics.md#L824-L840).
- **Prior stories (patterns to mirror):**
  - Story 2.1 (POST): [_bmad-output/implementation-artifacts/2-1-post-todos-endpoint.md](./2-1-post-todos-endpoint.md). The structural counterpart — DI seam, `.strict()` body, single-resource bare-entity response, `toWire`, integration test layout.
  - Story 1.4 (DB layer): [_bmad-output/implementation-artifacts/1-4-api-data-layer-drizzle-schema-migration-client-fail-fast-check.md](./1-4-api-data-layer-drizzle-schema-migration-client-fail-fast-check.md). Established `db` and `pool`.
  - Story 1.5 (GET + plugin stack): [_bmad-output/implementation-artifacts/1-5-get-todos-endpoint-with-full-plugin-stack-and-observability.md](./1-5-get-todos-endpoint-with-full-plugin-stack-and-observability.md). Established the route DI seam pattern.
- **Source files (current state):**
  - [packages/shared/src/contracts.ts](../../packages/shared/src/contracts.ts) — `UpdateTodoRequestSchema`, `TodoSchema`, `Todo`, `UpdateTodoRequest` types (line 20-24, 43).
  - [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) — extend this file.
  - [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts) — extend this file; `toWire` helper at line 15; existing `eq`-style import at line 2.
  - [apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts) — DB column definitions (do NOT modify).
  - [apps/api/src/app.ts](../../apps/api/src/app.ts) — global `setErrorHandler` at line 40.
  - [apps/api/src/plugins/swagger.ts](../../apps/api/src/plugins/swagger.ts) — `todos` tag pre-declared at line 38.
  - [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) — extend with PATCH cases.
  - [apps/api/test/integration/helpers/buildTestApp.ts](../../apps/api/test/integration/helpers/buildTestApp.ts) — already exposes `getCapturedLogs`/`clearCapturedLogs`.
  - [apps/api/test/integration/helpers/seedDb.ts](../../apps/api/test/integration/helpers/seedDb.ts) — `resetTodos()`, `seedTodos()`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context) — `/bmad-dev-story` workflow.

### Debug Log References

- Lint: `npm run lint` — clean (0 warnings, 0 errors).
- Typecheck: `npm run typecheck` — clean across `packages/shared`, `apps/api`, `apps/web`. `req.params.id` auto-typed as `string`; `req.body.completed` as `boolean`.
- Unit tests: `npm run test` — 48/48 passing (shared 25, api 4, web 19). No regressions.
- Integration tests: `npm --workspace apps/api run test:integration` — **33/33 passing** (24 pre-existing + 8 new PATCH cases in `todos.int.test.ts` + 1 LWW case in `concurrency.int.test.ts`). Local Postgres on container `todo-app-db` (`127.0.0.1:5433`).
- **Run-three rule satisfied:** integration suite executed three consecutive times — all 33/33 green on every run (durations ~3.5s, ~3.0s, ~3.1s). Concurrency test (LWW) is stable.
- /docs verification: started API via `npm --workspace apps/api run dev`, then `curl http://localhost:4000/docs/json | python3 -m json.tool`. Output confirmed:
  - `paths['/todos/{id}']['patch']` exists, tagged `['todos']`.
  - summary: `"Update a todo's completion state"`.
  - description contains the verbatim AC #7 phrase: `"Concurrency semantics are last-write-wins; no \`If-Match\` or ETag is supported."`.
  - parameters: `id` with `format: uuid`, `required: true`, `in: path`.
  - requestBody: `{ completed: boolean }`, `required: ["completed"]`, `additionalProperties: false` (proves `.strict()` reaches OpenAPI).
  - response 200: full `Todo` shape — `id` (uuid), `text` (minLength 1, maxLength 500), `completed` (boolean), `createdAt` (date-time).
  - `GET /docs` → 200 (Swagger UI HTML served).

### Completion Notes List

- All 8 ACs satisfied:
  - **AC #1** (200 + bare entity, false→true): covered by `PATCH /todos/:id — toggles false→true on an existing row`.
  - **AC #2** (true→false + idempotent setter): covered by two integration tests — toggle and "same value twice" both return 200.
  - **AC #3** (404 with sensible envelope on valid-but-missing UUID): asserts `statusCode: 404, error: 'Not Found', message: <string>`.
  - **AC #4** (400 on malformed UUID via Zod params validation): single test against `/todos/not-a-uuid`.
  - **AC #5** (400 on empty body / missing `completed` / unknown extras): three tests — `{}`, `{ something: 'else' }`, `{ completed: true, text: 'oops' }`.
  - **AC #6** (LWW under concurrent opposite writes): dedicated `concurrency.int.test.ts`, two parallel PATCHes via `Promise.all`, both 200, final state asserts boolean (no third value, no error). Stable across 3 consecutive runs.
  - **AC #7** (`/docs` documents PATCH with verbatim LWW phrase): verified via live `/docs/json` inspection.
  - **AC #8** (integration coverage in two files): 8 cases in `todos.int.test.ts`, 1 case in new `concurrency.int.test.ts`.
- Implementation matches the spec verbatim:
  - `updateTodoCompleted(id, completed): Promise<Todo | null>` with destructure-with-guard on `.returning()`.
  - DI seam `opts?.updateTodoCompleted ?? defaultUpdateTodoCompleted` mirrors Story 2.1's `listTodos` / `createTodo` pattern.
  - Inline `TodoIdParamsSchema = z.object({ id: z.string().uuid() }).strict()` — no pollution of `packages/shared`.
  - Bare `TodoSchema` 200 response (single-resource shape per architecture.md:363-368).
  - Handler is `parse → call → 404-or-return`; no `try/catch`, no manual validation, no logging, no transaction.
  - OpenAPI description ends with the verbatim AC #7 substring.
- **Notable deviation (1):** Updated `apps/api/package.json` `test:integration` script to add `--test-concurrency=1`. Reason: `concurrency.int.test.ts` runs ~150ms; in parallel-file mode, `beforeEach(resetTodos)` from `todos.int.test.ts` could TRUNCATE the row mid-`Promise.all`, causing one PATCH to 404. Without this fix the first-run-after-implementation failed; with it, all three consecutive runs are green. This is a real test-infra issue exposed by Story 2.2's first long-running cross-file test, not a spec deviation in the implementation itself. The spec's "run-three rule" implicitly required this fix.
- Out-of-scope items remained out of scope: no web changes, no migration, no `Location` header, no `If-Match`/ETag/`updated_at`, no `db.transaction(...)`, no DELETE, no PATCH-text endpoint.

### File List

- **Modified:** [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts) — added `updateTodoCompleted()` export and `eq` import (~12 LOC, 1 import line modified).
- **Modified:** [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) — added PATCH handler within existing `todosRoutes` plugin, added inline `TodoIdParamsSchema`, extended `TodosRouteOptions` with optional `updateTodoCompleted`, added imports (`UpdateTodoRequestSchema`, `z`, `defaultUpdateTodoCompleted`) (~30 LOC).
- **Modified:** [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) — appended 8 PATCH integration test cases (~145 LOC).
- **New:** [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts) — LWW concurrency proof (~50 LOC).
- **Modified:** [apps/api/package.json](../../apps/api/package.json) — added `--test-concurrency=1` to `test:integration` script (1 line).

## Change Log

| Date       | Change                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-04-29 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Story slot: Epic 2, Story 2 (PATCH /todos/:id with LWW semantics, follows Story 2.1 POST). |
| 2026-04-29 | Story implemented via `/bmad-dev-story`. Status: ready-for-dev → in-progress → review. Tasks 1–7 complete. PATCH /todos/:id live with `.strict()` body, uuid params, sensible 404 envelope, single UPDATE LWW (no transaction, no If-Match). Integration suite 33/33 green on three consecutive runs. /docs documents PATCH under `todos` tag with verbatim LWW description. One spec deviation: `--test-concurrency=1` added to `test:integration` script to prevent cross-file `beforeEach(resetTodos)` from racing with `concurrency.int.test.ts`. Commit hash: `475da7f`. |
| 2026-04-29 | Code review via `/bmad-code-review` on commits `bc233b3..HEAD`. Triage: 1 decision-needed (resolved — package.json change ratified as in-scope), 1 patch applied, 6 deferred, 15 dismissed. Acceptance Auditor: all 8 ACs PASS. Patch: added `body.id`/`body.text` assertions to the `true→false` PATCH test for symmetry with the `false→true` test. Status: review → done. |

## Review Findings

Code review on commits `bc233b3..HEAD` (`ab93e19` + `475da7f` + `32eec9c`, 2026-04-29). Triage: **1 decision-needed, 1 patch, 6 deferred, 15 dismissed**. Acceptance Auditor: **all 8 ACs PASS** at diff level — no spec-Watch-out violated, no narrative-vs-code contradiction. One process-level finding: `apps/api/package.json` was modified outside Task 7's stage list — needs human ratification.

### Decision Needed (resolved)

- [x] `[Review][Decision]` **`apps/api/package.json` modified but not in Task 7's stage list** — [apps/api/package.json:13](../../apps/api/package.json#L13). The `--test-concurrency=1` change is necessary (without it, `concurrency.int.test.ts` is flaky because `beforeEach(resetTodos)` from `todos.int.test.ts` races the parallel PATCHes), is a one-line fix that pairs directly with the new test file, and is fully documented in Completion Notes. **Resolution:** ratified as in-scope for Story 2.2. The fix pairs directly with the new `concurrency.int.test.ts` and gates that file from being flaky; splitting it into a separate change would leave Story 2.2 unstable. The structural test-infra concern (cross-file `beforeEach(resetTodos)` race) remains tracked as a deferred item below.

### Patches (unresolved action items)

- [x] `[Review][Patch]` **`true→false` PATCH test doesn't assert `id`/`text` are unchanged** — [apps/api/test/integration/todos.int.test.ts:215-227](../../apps/api/test/integration/todos.int.test.ts#L215-L227). Only `completed: false` is asserted. A regression where PATCH accidentally mutates other columns (`text`, `id`, `createdAt`) would not be caught by this test. The companion `false→true` test at lines 173-194 already asserts `body.id`, `body.text`, and `body.completed`. Mirror those assertions onto the `true→false` test for symmetry — single-line fix. **Resolution:** added `body.id`/`body.text` assertions to mirror the false→true pattern. Integration suite 33/33 green post-edit.

### Deferred (real but out of scope or spec-mandated trade-offs)

- [x] `[Review][Defer]` **`--test-concurrency=1` masks a structural cross-file isolation problem** — [apps/api/package.json:13](../../apps/api/package.json#L13). The fix works for now but treats a symptom: cross-file `beforeEach(resetTodos)` is unsound for the architecture's pre-named test files (`todos`, `validation`, `concurrency` per [architecture.md:597](../../_bmad-output/planning-artifacts/architecture.md#L597)). Story 2.3 DELETE concurrency and any future per-file integration test will inherit the forced serial execution. Hardening options: (a) per-file schema namespace, (b) transactional rollback per test, (c) move `concurrency.int.test.ts` outside the shared `beforeEach(resetTodos)` lifecycle. Revisit before CI sharding or before Story 2.3 lands a second concurrency test.
- [x] `[Review][Defer]` **`Promise.all` may not actually demonstrate LWW non-determinism** — [apps/api/test/integration/concurrency.int.test.ts:31-39](../../apps/api/test/integration/concurrency.int.test.ts#L31-L39). With a single Fastify event loop and pg pool serialization, the test can pass without ever truly racing — the assertion `final.completed === true || final.completed === false` is trivially satisfied. The test still proves "no error/deadlock under contention" (which is what NFR6 asks), but the LWW non-determinism itself is not directly observed. Spec acknowledges this trade-off at story line 363-364 ("we do NOT assert which won"). Future stress/chaos test would harden.
- [x] `[Review][Defer]` **Idempotent test doesn't compare bodies of the two repeated PATCHes byte-for-byte** — [apps/api/test/integration/todos.int.test.ts:233-251](../../apps/api/test/integration/todos.int.test.ts#L233-L251). Both PATCHes return 200 with `completed: true`, but if a regression caused the second response to differ in any other field (`text`, `id`), the test would not catch it. Low-priority test hardening.
- [x] `[Review][Defer]` **Unknown-field test depends solely on `.strict()` being on** — [apps/api/test/integration/todos.int.test.ts:299-313](../../apps/api/test/integration/todos.int.test.ts#L299-L313). If `UpdateTodoRequestSchema` ever drops `.strict()`, Zod would silently strip the unknown `text` field and the route would 200 instead of 400. The shared schema's own contract tests cover strictness, but a redundant assertion at the integration boundary would catch cross-package drift earlier. Low risk — `packages/shared/src/contracts.ts:20-24` is `.strict()` and well-tested.
- [x] `[Review][Defer]` **No test for wrong/missing `Content-Type` on PATCH** — [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts). Same pre-existing gap as Story 2.1; Fastify's default behavior here depends on parser config. Revisit when an error-envelope-focused story lands.
- [x] `[Review][Defer]` **No test for malformed-JSON body or `completed: null`** — [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts). Schema rejects null (Zod `z.boolean()` doesn't accept null) and Fastify rejects malformed JSON before the handler runs; both are framework-level guarantees. Worth a single-line test each but not a current bug.
