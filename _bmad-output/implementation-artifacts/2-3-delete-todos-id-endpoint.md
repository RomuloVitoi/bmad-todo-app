# Story 2.3: DELETE /todos/:id endpoint

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an API consumer,
I want to DELETE a todo by ID,
So that clients can remove any todo from the shared list (FR25).

## Acceptance Criteria

1. **Given** `DELETE /todos/:id` on an existing todo,
   **When** a client issues the request,
   **Then** the response is `204` with an empty body (zero-length, no `content-type`),
   **And** the row is removed from the `todos` table,
   **And** a subsequent `GET /todos` no longer returns the deleted row.

2. **Given** `DELETE /todos/:id` where `:id` is a valid UUID but no row with that id exists (already deleted or never created),
   **When** a client issues the request,
   **Then** the response is `404` with the Fastify-sensible envelope `{ statusCode: 404, error: "Not Found", message: "<details>" }`.

3. **Given** `DELETE /todos/:id` where `:id` is not a valid UUID (e.g., `not-a-uuid`, integer, malformed string),
   **When** a client issues the request,
   **Then** the response is `400` via Zod path-param validation,
   **And** no DB query is issued (validation runs before the handler).

4. **Given** an existing row, then two `DELETE /todos/:id` requests against the same id (sequential — second fires after first resolves),
   **When** they are issued,
   **Then** the first returns `204` and the second returns `404`,
   **And** no row remains.

5. **Given** an existing row, then two concurrent `DELETE /todos/:id` requests against the same id (parallel — `Promise.all`),
   **When** they are awaited,
   **Then** exactly one returns `204` and the other returns `404`,
   **And** the row is removed exactly once,
   **And** no error is raised (no deadlock, no constraint violation, no row corruption — NFR6),
   **And** the handler does NOT use `db.transaction(...)`, advisory locks, or `SELECT ... FOR UPDATE`.

6. **Given** the API is running with `/docs` enabled,
   **When** a developer inspects the OpenAPI spec,
   **Then** `DELETE /todos/:id` is documented under the `todos` tag with:
   - request `params` schema (`{ id: uuid }`),
   - **no** request body schema (DELETE has no body),
   - 204 response declared explicitly (no body),
   - description noting that 404 is returned for non-existent ids and 400 for malformed UUIDs (no need to repeat the sensible envelope shape — that is uniform across the API).

7. **Given** [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) (per-resource cases) and [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts) (parallel-delete proof — extending the existing file, not a new file),
   **When** the integration suite runs (`npm run test:integration --workspace apps/api` against a live local Postgres),
   **Then** DELETE coverage includes:
   - happy path 204 + empty body + row removed (AC #1),
   - 404 on missing id (AC #2),
   - 400 on malformed UUID (AC #3),
   - sequential double-DELETE: 204 then 404 (AC #4),
   - parallel DELETE: one 204, one 404, exactly one row removed (AC #5).
   The new concurrency case is appended to `concurrency.int.test.ts` alongside the Story 2.2 LWW test.

## Tasks / Subtasks

- [x] **Task 1: Add `deleteTodoById()` query helper to the DB client (AC: #1, #2, #4, #5)**
  - [x] Edit [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts):

    ```ts
    // ...existing imports (`eq` already imported by Story 2.2)...

    export const deleteTodoById = async (id: string): Promise<boolean> => {
      const rows = await db.delete(todos).where(eq(todos.id, id)).returning({ id: todos.id });
      return rows.length === 1;
    };
    ```

  - [x] **Why `Promise<boolean>` (not `Promise<Todo | null>`)** — the route handler needs only "deleted? yes/no" to decide between 204 and 404. Returning the deleted entity would leak DB shape into a response that, by HTTP spec, must be empty (204). Returning `boolean` keeps the helper semantically tight.
  - [x] **Why `.returning({ id: todos.id })` (projected, not bare `.returning()`)** — we only need to count rows; selecting one column is the cheapest projection on the wire and avoids accidentally hydrating any future columns. Alternative `.returning()` (all columns) works but is wasteful for a delete.
  - [x] **Why check `rows.length === 1`** — `id` is the table's primary key, so the affected-row count is 0 or 1. The strict `=== 1` (rather than `>= 1`) is a deliberate invariant — if Postgres ever returned 2 it would mean a primary-key violation upstream, and we want a loud failure rather than silent acceptance. (Spec watch-out from Story 2.2 review: same defensive thinking.)
  - [x] **Why no `eq` import line is needed** — Story 2.2 already added `import { asc, eq } from 'drizzle-orm';` to this file. Reuse.
  - [x] **Why `id` is trusted** — the route's `params` schema validates `id` as a UUID before invoking this helper (Task 2). Drizzle parameterises `eq()`; no SQL-injection surface.
  - [x] **Why no transaction** — single `DELETE ... WHERE id = $1 RETURNING id` is atomic by Postgres row-level semantics. AC #5 explicitly forbids transactions and explicit locks. Two concurrent DELETEs against the same row serialize on the row lock; one wins (returns the row, becomes 204), one observes 0 affected rows (returns false, becomes 404). This IS the spec.
  - [x] **Watch-out:** Do NOT use `.execute()` without `.returning()`. Drizzle's bare `.execute()` does not surface the affected-row count in a portable way; `.returning(...)` does, and Postgres natively supports `DELETE ... RETURNING`.

- [x] **Task 2: Add DELETE handler to the existing todos routes plugin (AC: #1, #2, #3, #6)**
  - [x] Edit [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) — extend the existing `todosRoutes` plugin:

    ```ts
    import {
      CreateTodoRequestSchema,
      TodoListResponseSchema,
      TodoSchema,
      UpdateTodoRequestSchema,
    } from '@todo-app/shared';
    import {
      createTodo as defaultCreateTodo,
      deleteTodoById as defaultDeleteTodoById,
      listTodos as defaultListTodos,
      updateTodoCompleted as defaultUpdateTodoCompleted,
    } from '../db/client.js';
    // ...existing imports...

    // TodoIdParamsSchema already declared by Story 2.2 — REUSE, do NOT redeclare.

    export interface TodosRouteOptions {
      listTodos?: typeof defaultListTodos;
      createTodo?: typeof defaultCreateTodo;
      updateTodoCompleted?: typeof defaultUpdateTodoCompleted;
      deleteTodoById?: typeof defaultDeleteTodoById;
    }

    const todosRoutes: FastifyPluginAsync<TodosRouteOptions> = async (app, opts) => {
      const list = opts?.listTodos ?? defaultListTodos;
      const create = opts?.createTodo ?? defaultCreateTodo;
      const updateCompleted = opts?.updateTodoCompleted ?? defaultUpdateTodoCompleted;
      const remove = opts?.deleteTodoById ?? defaultDeleteTodoById;

      // ...existing GET, POST, PATCH handlers unchanged...

      app.withTypeProvider<ZodTypeProvider>().delete(
        '/todos/:id',
        {
          schema: {
            tags: ['todos'],
            summary: 'Delete a todo by id',
            description:
              'Removes the todo with the given id. Returns 204 (no body) on success, ' +
              '404 if no row with that id exists, 400 if the id is not a valid UUID. ' +
              'No body is accepted; any payload is ignored by the route schema.',
            params: TodoIdParamsSchema,
            response: { 204: z.null() },
          },
        },
        async (req, reply) => {
          const deleted = await remove(req.params.id);
          if (!deleted) return reply.notFound();
          reply.code(204);
          return null;
        },
      );
    };
    ```

  - [x] **Why bind the option name to `remove`** — `delete` is a JavaScript reserved word in strict mode (and a property accessor on objects), so `const delete = ...` is a syntax error. Naming the local `remove` (alias for `deleteTodoById`) keeps the handler readable. Keep the option name `deleteTodoById` to mirror the function name in the DI seam (consistent with Stories 2.1 and 2.2).
  - [x] **Why `response: { 204: z.null() }`** — `fastify-type-provider-zod@^4` requires a Zod schema for every declared response status. `z.null()` declares "no body / null body" and is the correct contract for 204. Fastify itself enforces the HTTP rule that 204 responses must not have a body — `reply.code(204).send(null)` and `reply.code(204); return null;` both produce zero-length bodies with no `content-type` header.
  - [x] **Why `return null` (not `return reply.send()`)** — both produce a 204 with no body, but `return null` keeps the handler async-await-clean and matches the return-value style used by the GET / POST / PATCH handlers in the same file. Fastify's response-schema serializer accepts `null` against `z.null()` without complaint.
  - [x] **Why no 400/404 response schema declaration** — same architecture rule as Stories 2.1 and 2.2 ([architecture.md:401](../../_bmad-output/planning-artifacts/architecture.md#L401)) — Zod-validation 400s and `reply.notFound()` 404s use the sensible envelope automatically. Declaring those schemas in the route object would force every error path through the schema serializer and is unnecessary verbosity.
  - [x] **Why reuse `TodoIdParamsSchema`** — Story 2.2 declared this inline in the same file. Do NOT redeclare; do NOT export to `packages/shared`. The path-param schema is an internal contract (URL-segment validation); it is not part of the wire payload.
  - [x] **Why `tags: ['todos']`** — pre-declared in [apps/api/src/plugins/swagger.ts:38](../../apps/api/src/plugins/swagger.ts#L38) so DELETE groups under the same Swagger UI section as GET/POST/PATCH.
  - [x] **Watch-out:** Do NOT wrap the handler in `try/catch`. Zod validates `params` BEFORE the handler runs. The global `setErrorHandler` ([app.ts:40-52](../../apps/api/src/app.ts#L40-L52)) catches anything that escapes.
  - [x] **Watch-out:** Do NOT add a `body:` schema. DELETE requests should ignore any payload the client sends; declaring no body schema lets Fastify accept any/no body without 400-ing.
  - [x] **Watch-out:** Place the DELETE block AFTER the PATCH block in the same plugin function. Plugin-registration order (`setValidatorCompiler` → `swagger` → `todosRoutes` in [app.ts:22-37](../../apps/api/src/app.ts#L22-L37)) is unchanged.

- [x] **Task 3: Extend integration tests in todos.int.test.ts (AC: #1, #2, #3, #4, #7)**
  - [x] Edit [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) — append DELETE test cases after the existing PATCH block. Suggested cases:

    ```ts
    test('DELETE /todos/:id — 204 with empty body, row removed (AC #1)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: { text: 'finish report' },
      });
      const { id } = created.json() as { id: string };

      const res = await app.inject({ method: 'DELETE', url: `/todos/${id}` });
      assert.equal(res.statusCode, 204);
      assert.equal(res.body, ''); // empty body per HTTP spec for 204

      // Round-trip: GET no longer returns the row
      const list = await app.inject({ method: 'GET', url: '/todos' });
      const todos = (list.json() as { todos: Array<{ id: string }> }).todos;
      assert.equal(todos.find((t) => t.id === id), undefined);
    });

    test('DELETE /todos/:id — 404 on a valid-but-missing UUID (AC #2)', async () => {
      const ghostId = '00000000-0000-4000-8000-000000000000';
      const res = await app.inject({ method: 'DELETE', url: `/todos/${ghostId}` });
      assert.equal(res.statusCode, 404);
      const body = res.json() as { statusCode: number; error: string; message: string };
      assert.equal(body.statusCode, 404);
      assert.equal(body.error, 'Not Found');
      assert.equal(typeof body.message, 'string');
    });

    test('DELETE /todos/:id — 400 on a malformed UUID (AC #3)', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/todos/not-a-uuid' });
      assert.equal(res.statusCode, 400);
    });

    test('DELETE /todos/:id — sequential double-delete: first 204, second 404 (AC #4)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: { text: 'one and done' },
      });
      const { id } = created.json() as { id: string };

      const a = await app.inject({ method: 'DELETE', url: `/todos/${id}` });
      const b = await app.inject({ method: 'DELETE', url: `/todos/${id}` });
      assert.equal(a.statusCode, 204);
      assert.equal(b.statusCode, 404);

      const list = await app.inject({ method: 'GET', url: '/todos' });
      const todos = (list.json() as { todos: Array<{ id: string }> }).todos;
      assert.equal(todos.find((t) => t.id === id), undefined);
    });

    test('DELETE /todos/:id — does not delete other rows (AC #1)', async () => {
      const a = await app.inject({ method: 'POST', url: '/todos', payload: { text: 'keep me' } });
      const b = await app.inject({ method: 'POST', url: '/todos', payload: { text: 'delete me' } });
      const idA = (a.json() as { id: string }).id;
      const idB = (b.json() as { id: string }).id;

      const res = await app.inject({ method: 'DELETE', url: `/todos/${idB}` });
      assert.equal(res.statusCode, 204);

      const list = await app.inject({ method: 'GET', url: '/todos' });
      const todos = (list.json() as { todos: Array<{ id: string; text: string }> }).todos;
      assert.equal(todos.length, 1);
      assert.equal(todos[0]!.id, idA);
      assert.equal(todos[0]!.text, 'keep me');
    });
    ```

  - [x] **Why `assert.equal(res.body, '')`** — Fastify's `inject()` returns `body` as an empty string for 204 responses (no bytes). Asserting on the string form is more explicit than `assert.equal(res.payload.length, 0)` and forward-compatible with future Fastify versions.
  - [x] **Why the "does not delete other rows" test** — guards against a regression where the `WHERE id = $1` clause is dropped and the helper TRUNCATEs the table. AC #1's "removes the row" implies "removes only that row," and a single positive test does not prove the negative.
  - [x] **Why no test for `DELETE /todos/<id>` body content** — DELETE requests may carry a body (RFC 7231 doesn't forbid it), and the route schema deliberately does not declare a body validator (Task 2 watch-out), so Fastify will accept and ignore any payload. Adding a test for "DELETE with body" is testing Fastify's parser, not our endpoint.
  - [x] **Watch-out:** `beforeEach(resetTodos)` in [todos.int.test.ts:17-20](../../apps/api/test/integration/todos.int.test.ts#L17-L20) ensures each test starts empty. The "does not delete other rows" test seeds two rows via POST; that's fine because each `app.inject` is a real handler invocation.
  - [x] **Watch-out:** Do NOT pin the 400/404 `message` content (same trade-off as Stories 2.1 and 2.2 — Zod messages can shift across minor versions).

- [x] **Task 4: Append parallel-delete test to concurrency.int.test.ts (AC: #5, #7)**
  - [x] Edit [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts) — append a new test after the existing PATCH-LWW test:

    ```ts
    test('DELETE /todos/:id — concurrent deletes: exactly one 204, one 404, row removed once (AC #5)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: { text: 'race to delete' },
      });
      assert.equal(created.statusCode, 201);
      const { id } = created.json() as { id: string };

      // Two parallel DELETEs against the same row. One row lock wins; the other
      // observes 0 affected rows. Both helpers return cleanly — no error, no
      // deadlock, no constraint violation.
      const [a, b] = await Promise.all([
        app.inject({ method: 'DELETE', url: `/todos/${id}` }),
        app.inject({ method: 'DELETE', url: `/todos/${id}` }),
      ]);

      // Sort outcomes — the loser/winner identity is non-deterministic.
      const codes = [a.statusCode, b.statusCode].sort();
      assert.deepEqual(codes, [204, 404]);

      // Row is gone exactly once (not twice — there was only one to begin with).
      const list = await app.inject({ method: 'GET', url: '/todos' });
      const todos = (list.json() as { todos: Array<{ id: string }> }).todos;
      assert.equal(todos.find((t) => t.id === id), undefined);
    });
    ```

  - [x] **Why `[a.statusCode, b.statusCode].sort()`** — the AC requires "one 204 and one 404," NOT a specific order. Sorting normalizes the assertion against the non-deterministic winner identity. `[204, 404].sort()` is `[204, 404]` (ASCII ordering of the two-digit numbers — 2 < 4).
  - [x] **Why this lives in `concurrency.int.test.ts` and not `todos.int.test.ts`** — same architectural rationale as Story 2.2's PATCH-LWW test ([architecture.md:597](../../_bmad-output/planning-artifacts/architecture.md#L597) — "concurrency.int.test.ts" is pre-named for race tests). Adding a second case to the file is intentional.
  - [x] **Why this test is robust under `--test-concurrency=1`** — Story 2.2 added `--test-concurrency=1` to the integration script (preventing cross-file `beforeEach(resetTodos)` from racing the LWW test). That setting still applies here. Within this file, `beforeEach(resetTodos)` runs cleanly between the two cases (LWW PATCH and concurrent DELETE) — no sharing of state.
  - [x] **Watch-out:** Do NOT add `await new Promise(r => setTimeout(r, 0))` or any artificial delay between the two `app.inject` calls. The point of `Promise.all` is event-loop parallelism; introducing a delay would serialise the test and defeat the proof.
  - [x] **Watch-out:** Do NOT extend to N>2 parallel DELETEs in this story. Larger fan-out is a separate proof and adds flakiness on slow CI machines. Same rationale as Story 2.2's two-PATCH limit.

- [x] **Task 5: Verify /docs renders the DELETE endpoint (AC: #6)**
  - [x] Start the dev stack: `npm run dev` (from repo root).
  - [x] Open `http://localhost:4000/docs`. Confirm:
    - The `todos` tag section now lists `GET /todos`, `POST /todos`, `PATCH /todos/{id}`, AND `DELETE /todos/{id}`.
    - DELETE has a path parameter `id` (uuid format) and NO request body schema.
    - The 204 response is shown explicitly (no body).
    - The description mentions 404 (missing) and 400 (bad UUID).
  - [x] Fetch `http://localhost:4000/docs/json` and grep for the DELETE operation:

    ```bash
    curl -s http://localhost:4000/docs/json \
      | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d['paths']['/todos/{id}']['delete'], indent=2))"
    ```

    Capture the output in Debug Log References. Must include:
    - `tags: ['todos']`
    - `parameters[0].in: 'path'`, `parameters[0].name: 'id'`, `parameters[0].schema.format: 'uuid'`
    - `responses['204']` declared
    - NO `requestBody` field
  - [x] **No code changes required** — `jsonSchemaTransform` from `fastify-type-provider-zod@^4` derives the params/response schemas automatically.

- [x] **Task 6: Sanity gates**
  - [x] `npm run lint` — must report 0 warnings, 0 errors.
  - [x] `npm run typecheck` — must report 0 errors. The handler's `req.params` should auto-type as `{ id: string }`.
  - [x] `npm run test` — runs unit tests across all workspaces (no DB required). Must pass.
  - [x] `npm run test:integration --workspace apps/api` — runs all integration tests against a live local Postgres. New test counts: +5 in `todos.int.test.ts`, +1 in `concurrency.int.test.ts`. Must pass.
  - [x] **Run-three rule** — execute the integration suite three consecutive times before declaring Task 6 done. The new concurrent-DELETE test is the second race-y test in the file; verify both LWW (Story 2.2) and concurrent-DELETE (this story) pass on three back-to-back runs.
  - [x] **No new lint/typecheck rules required.** The existing `eslint.config.mjs` and `tsconfig.base.json` cover everything.

- [x] **Task 7: Commit**
  - [x] Stage exactly:
    - **Modified:** [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts), [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts), [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts), [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts).
  - [x] Commit message: `feat(api): DELETE /todos/:id endpoint with concurrent-delete safety (Story 2.3)`
  - [x] **Do NOT** stage anything in `_bmad-output/`, `node_modules/`, `.env*`, or any `apps/web/**` file (Story 2.3 is API-only; web wiring lives in Story 2.7).
  - [x] Record commit hash in the Change Log when the user runs the commit.

## Dev Notes

### Where this story sits

Story 2.3 is the third and final API-side story of Epic 2 (Todo Core Loop). Story 2.1 shipped POST. Story 2.2 shipped PATCH. Story 2.3 ships DELETE. After this story, Epic 2 has the full server-side CRUD surface; the remaining Epic 2 stories (2.4–2.7) are web-side reducer/UI work.

After this story:

- `DELETE /todos/:id` returns 204 with no body on success.
- `DELETE /todos/:id` returns 404 with the sensible envelope when the id is unknown.
- The `todos` table receives single-row DELETEs; concurrent DELETEs serialize on Postgres row locks (one wins → 204, one observes 0 affected rows → 404).
- Swagger UI at `/docs` documents GET, POST, PATCH, AND DELETE under the `todos` tag.
- The `concurrency.int.test.ts` file now contains TWO race cases (LWW PATCH from Story 2.2, concurrent DELETE from this story).
- Epic 2's API surface is complete; subsequent Epic 2 stories are web-only.

This story does NOT touch:

- The web app (Story 2.7 owns the delete-button UI and `api.deleteTodo()` client wrapper).
- Reducer actions (Story 2.4 adds `deleteOptimistic` / `deleteFailed`).
- Toast UI on failure (Story 3.2 owns mutation-failure toasts).
- Soft-delete (architecture mandates hard DELETE; soft-delete is out of scope).

### Critical architectural guardrails

1. **The DB schema is unchanged.** No migration is needed for this story. If you find yourself running `drizzle-kit generate`, stop.
2. **No soft-delete.** [architecture.md:621](../../_bmad-output/planning-artifacts/architecture.md#L621) ("path only; 204 no body") and the absence of any `deleted_at` column in [schema.ts](../../apps/api/src/db/schema.ts) make this clear. The DELETE is a hard physical row removal.
3. **No `db.transaction(...)`, no advisory locks, no `SELECT ... FOR UPDATE`.** A single `DELETE ... WHERE id = $1 RETURNING id` is atomic by Postgres row-level semantics. AC #5 forbids these explicitly.
4. **No try/catch in the handler.** [architecture.md:401](../../_bmad-output/planning-artifacts/architecture.md#L401). Global `setErrorHandler` at [app.ts:40-52](../../apps/api/src/app.ts#L40-L52) handles validation 400s, sensible 404s, and unexpected throws.
5. **No request body.** DELETE requests may technically carry a body, but our route schema deliberately does not validate one — Fastify ignores any payload the client sends. Adding a body schema would force every DELETE to send an empty body, which is over-strict.
6. **No retries, no backoff.** [architecture.md:418](../../_bmad-output/planning-artifacts/architecture.md#L418).
7. **No `req.log.info({ todoId: id }, 'deleting')` calls inside the handler.** Framework logs `incoming request` / `request completed` with `requestId`, `method`, `path`, `statusCode`, `durationMs`. Story 1.5 covered uniform logging.
8. **No idempotency-key.** AC #4 (sequential double-delete) explicitly accepts that the second DELETE returns 404. This is the spec — DELETE is idempotent in *effect* (the row is gone after the first call) but not in *response* (subsequent calls 404). v1 does not introduce a 410-Gone or "tombstone" mechanism.

### Why 204 (not 200 with the deleted entity, not 410 Gone)

REST conventions allow several success codes for DELETE:

- **204 No Content** — the most common and the architecture's choice ([architecture.md:231](../../_bmad-output/planning-artifacts/architecture.md#L231)). Tells the client "your request succeeded; there is no representation to return."
- **200 OK with body** — sometimes used to return the deleted entity. Out of scope: the entity is already known to the caller (they had to know the id), and returning it bloats the response.
- **410 Gone** — for "this resource was deleted in the past." Not applicable to v1; we do not track tombstones.

The architecture explicitly chose 204 over the alternatives. Do not deviate.

### Why no `Idempotency-Key` header

Sequential and concurrent DELETEs return different responses (204 first, 404 next/later) by design. A client wanting "delete this row, exactly once, no matter how many times I retry" can ignore 404s on retry. Adding an `Idempotency-Key` would let multiple requests share an outcome, but the architecture defers the entire idempotency-key concept ([architecture.md](../../_bmad-output/planning-artifacts/architecture.md) — see "no idempotency-key in v1" in Story 2.1's POST description).

### Why a sequential double-delete test (AC #4) is separate from the concurrent test (AC #5)

The two ACs prove different invariants:

- **AC #4 (sequential):** demonstrates the DELETE is *response-non-idempotent* — first call 204, second call 404. This is a contract assertion.
- **AC #5 (parallel):** demonstrates the DELETE is *concurrency-safe* — exactly one 204 and one 404 emerge from a race, the row is gone exactly once, no error/deadlock. This is a robustness assertion.

A single test cannot prove both because the sequential case forces ordering (and so cannot observe the race), while the concurrent case introduces ordering non-determinism (and so cannot pin which call gets 204).

### POST plugin order — already correct

Adding the DELETE handler to the existing `todosRoutes` plugin slots in at the same position as the existing GET, POST, and PATCH handlers — no order changes are needed. Plugin registration order in [app.ts:22-37](../../apps/api/src/app.ts#L22-L37) is unchanged.

### Logging — already automatic

Pino emits two structured lines per request (`incoming request` and `request completed`) with `requestId`, `method`, `path`, `statusCode`, `durationMs`. DELETE /todos/:id requires zero handler-level logging.

The 4xx (validation 400, not-found 404) hits the global `setErrorHandler` ([app.ts:40-52](../../apps/api/src/app.ts#L40-L52)) which logs at info-level (4xx) or warn-level (5xx). 5xx (DB unreachable, etc.) is logged with full stack at error level.

### Why DELETE handler tests live with PATCH/POST tests in `todos.int.test.ts`

Per the file-organisation pattern established by Stories 2.1 and 2.2: per-resource semantics live in `todos.int.test.ts`, race-y/long-running tests live in `concurrency.int.test.ts`. The split keeps the fast suite fast and the race suite focused.

### What changes in the codebase

| File | Change | LOC delta (approx.) |
|------|--------|---------------------|
| [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts) | Add `deleteTodoById()` export | +5 / -0 |
| [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) | Add DELETE handler; extend `TodosRouteOptions`; add imports (`defaultDeleteTodoById`) | +25 / -0 |
| [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) | Append 5 DELETE test cases | +90 / -0 |
| [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts) | Append 1 concurrent-DELETE test | +30 / -0 |

Total: ~+150 added LOC across 4 files. No new files. No deletions. No new dependencies. No migration.

### Out-of-scope (do NOT do in this story)

- Web-side `apps/web/src/lib/api.ts` delete wrapper — Story 2.7.
- Reducer actions for optimistic delete — Story 2.4.
- Delete-button UI on `<TodoItem>` — Story 2.7.
- Toast on failure — Story 3.2.
- Soft-delete / `deleted_at` column — never (architecture mandates hard DELETE).
- `DELETE /todos` (bulk delete) — never (architecture v1 has only single-id DELETE).
- Cascading deletes — N/A (no foreign-key relationships in v1).
- 410 Gone for previously-deleted rows — never (no tombstone tracking in v1).
- `Idempotency-Key` header — explicitly deferred (architecture v1 says no).
- Audit log of deletions — never in v1.
- Per-tag SLOs — NFR2 covers the whole API uniformly.

### Project Structure Notes

The endpoint slots into the existing `apps/api/` structure unchanged:

```text
apps/api/
├── src/
│   ├── db/
│   │   ├── client.ts            # ← extended with deleteTodoById()
│   │   └── schema.ts            # unchanged
│   └── routes/
│       └── todos.ts             # ← extended with DELETE handler
└── test/
    └── integration/
        ├── todos.int.test.ts    # ← extended with DELETE cases
        └── concurrency.int.test.ts   # ← extended with concurrent-DELETE case
```

The architecture's "no business logic in handlers, no request/response concerns in db/" boundary ([architecture.md:636-639](../../_bmad-output/planning-artifacts/architecture.md#L636-L639)) is satisfied: `deleteTodoById()` knows nothing about HTTP; the handler does no business logic beyond `validate → call → 204-or-404`.

### Testing Requirements

- **Unit tests:** none required. The handler is too thin to unit-test.
- **Integration tests (per-resource):** mandatory in `todos.int.test.ts` covering ACs 1–4 plus the "does not delete other rows" guard.
- **Integration tests (concurrency):** mandatory append to `concurrency.int.test.ts` covering AC #5.
- **Test runner:** `node --test`. No new dev dependency.
- **DB fixtures:** existing `resetTodos()` in [helpers/seedDb.ts](../../apps/api/test/integration/helpers/seedDb.ts). Seed via the public POST endpoint (cheaper black-box).
- **Run-three rule:** integration suite passes on three consecutive runs before moving to `review`.

### Library / version pins (April 2026)

These are already installed and pinned by Story 1.4 / 1.5 / 2.2; do NOT bump them in this story:

- `fastify@^5.x`, `fastify-cli@^7.x`, `fastify-plugin@^5.x`
- `@fastify/sensible@^6.x`, `@fastify/swagger@^9.x`, `@fastify/swagger-ui@^5.x`
- `fastify-type-provider-zod@^4.0.2`
- `zod@^3.23.0`
- `drizzle-orm@^0.40.x` — `eq` already imported by Story 2.2
- `pg@^8.13.x`
- Node.js `node:test` runner (built-in to Node 22)

### Story 2.1 / 2.2 patterns to mirror (verbatim, where applicable)

The following patterns established by Stories 2.1 and 2.2 are the canonical templates for this story:

- **DB helper signature:** typed input → typed output. For DELETE, return `Promise<boolean>` (deleted yes/no). Use `eq(todos.id, id)` for the WHERE clause.
- **`.returning(...)` always** — Drizzle's `DELETE ... RETURNING` mirrors `UPDATE ... RETURNING`. Use a projected return (`.returning({ id: todos.id })`) for the count-only path.
- **DI seam in `TodosRouteOptions`:** `opts?.X ?? defaultX`. Add `deleteTodoById?: typeof defaultDeleteTodoById`.
- **Inline `TodoIdParamsSchema`** — already declared in `routes/todos.ts` by Story 2.2. REUSE.
- **Handler is `validate → call → return`:** no try/catch, no manual validation, no logging.
- **No explicit error-response schemas** in the route's `response: { ... }` block — only the success status (204).
- **Tags:** `tags: ['todos']` — pre-declared in [swagger.ts:38](../../apps/api/src/plugins/swagger.ts#L38).
- **Test seeding via the public POST** for cross-endpoint coverage in `todos.int.test.ts`.
- **Race-y tests in `concurrency.int.test.ts`** — append to the existing file, do NOT create a new one.

Story 2.2 review yielded six deferred items in [deferred-work.md](./deferred-work.md). Three of them apply equally here:

- **`--test-concurrency=1` masks structural cross-file race** — the integration script is already serialised. This story does not worsen it; future hardening (per-file schema or transactional rollback) remains out of scope.
- **`Promise.all` may not actually demonstrate concurrency** — same caveat for the new DELETE race test. The test still proves "no error/deadlock under contention" which IS what NFR6 asks. The non-determinism (which call gets 204 vs 404) is asserted via `[a.statusCode, b.statusCode].sort()`, not by pinning identity.
- **No test for wrong/missing `Content-Type`** — DELETE has no body; the concern is moot for this story.

### References

- **Architecture:**
  - Endpoint table: [architecture.md:231](../../_bmad-output/planning-artifacts/architecture.md#L231) (`DELETE /todos/:id: 204, 404/500`).
  - Path conventions: [architecture.md:330](../../_bmad-output/planning-artifacts/architecture.md#L330) (plural-kebab, no verbs).
  - API binding table: [architecture.md:621](../../_bmad-output/planning-artifacts/architecture.md#L621) (`DELETE /todos/:id: path only; 204 no body`).
  - Concurrency test file: [architecture.md:597](../../_bmad-output/planning-artifacts/architecture.md#L597).
  - Error handling: [architecture.md:398-402](../../_bmad-output/planning-artifacts/architecture.md#L398-L402).
  - Service boundaries: [architecture.md:634-639](../../_bmad-output/planning-artifacts/architecture.md#L634-L639).
- **PRD:**
  - FR25 (delete endpoint): [prd.md:314](../../_bmad-output/planning-artifacts/prd.md#L314).
  - NFR6 (concurrent integrity): [prd.md:339](../../_bmad-output/planning-artifacts/prd.md#L339).
  - NFR16/NFR18 (server validation, input bounds): [prd.md:355,357](../../_bmad-output/planning-artifacts/prd.md#L355).
- **Epics:**
  - Story 2.3 full text: [epics.md:790-822](../../_bmad-output/planning-artifacts/epics.md#L790-L822).
  - Story 2.4 cross-dependency (delete reducer actions): [epics.md:824-840](../../_bmad-output/planning-artifacts/epics.md#L824-L840).
- **Prior stories (patterns to mirror):**
  - Story 2.2 (PATCH + concurrency): [_bmad-output/implementation-artifacts/2-2-patch-todos-id-endpoint-with-lww-semantics.md](./2-2-patch-todos-id-endpoint-with-lww-semantics.md). The closest structural counterpart — DI seam, `TodoIdParamsSchema`, `concurrency.int.test.ts`, `Promise.all` race, run-three rule.
  - Story 2.1 (POST): [_bmad-output/implementation-artifacts/2-1-post-todos-endpoint.md](./2-1-post-todos-endpoint.md). DI seam pattern, `.strict()` validation, integration test layout.
  - Story 1.5 (GET + plugin stack): [_bmad-output/implementation-artifacts/1-5-get-todos-endpoint-with-full-plugin-stack-and-observability.md](./1-5-get-todos-endpoint-with-full-plugin-stack-and-observability.md). Established the route DI seam pattern.
- **Source files (current state):**
  - [packages/shared/src/contracts.ts](../../packages/shared/src/contracts.ts) — no DELETE schemas needed (path only).
  - [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) — extend; `TodoIdParamsSchema` already declared inline by Story 2.2.
  - [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts) — extend; `eq` already imported by Story 2.2; `toWire` helper at line 15 (NOT used by DELETE since 204 has no body).
  - [apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts) — DB column definitions (do NOT modify).
  - [apps/api/src/app.ts](../../apps/api/src/app.ts) — global `setErrorHandler` at line 40.
  - [apps/api/src/plugins/swagger.ts](../../apps/api/src/plugins/swagger.ts) — `todos` tag pre-declared at line 38.
  - [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) — extend with DELETE cases.
  - [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts) — extend with concurrent-DELETE case.
  - [apps/api/test/integration/helpers/seedDb.ts](../../apps/api/test/integration/helpers/seedDb.ts) — `resetTodos()`, `seedTodos()`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context) — `/bmad-dev-story` workflow.

### Debug Log References

- Lint: `npm run lint` — clean (0 warnings, 0 errors).
- Typecheck: `npm run typecheck` — clean across `packages/shared`, `apps/api`, `apps/web`. `req.params.id` auto-typed as `string`.
- Unit tests: `npm run test` — 48/48 passing. No regressions.
- Integration tests: `npm --workspace apps/api run test:integration` — **39/39 passing** (33 pre-existing + 5 new DELETE cases in `todos.int.test.ts` + 1 new concurrent-DELETE case in `concurrency.int.test.ts`).
- **Run-three rule satisfied:** integration suite executed three consecutive times — all 39/39 green on every run (durations ~3.4s, ~3.2s, ~3.2s). Both race tests (LWW PATCH from Story 2.2 and concurrent DELETE from this story) are stable.
- /docs verification: started API via `npm --workspace apps/api run dev`, then `curl http://localhost:4000/docs/json | python3 -m json.tool`. Output confirmed:
  - `paths['/todos/{id}']['delete']` exists, tagged `['todos']`.
  - summary: `"Delete a todo by id"`.
  - description mentions 204 success, 404 missing, 400 bad UUID.
  - parameters: `id` with `format: uuid`, `required: true`, `in: path`.
  - responses: `204` declared explicitly (`enum: ["null"], nullable: true` for the `z.null()` schema).
  - `requestBody` key is **absent** from the operation — DELETE has no body, as required.

### Completion Notes List

- All 7 ACs satisfied:
  - **AC #1** (204 + empty body, row removed, no other rows touched): covered by two tests — happy path and "does not delete other rows."
  - **AC #2** (404 with sensible envelope on valid-but-missing UUID): asserts `statusCode: 404, error: 'Not Found', message: <string>`.
  - **AC #3** (400 on malformed UUID via Zod params validation): single test against `/todos/not-a-uuid`.
  - **AC #4** (sequential double-delete returns 204 then 404): covered explicitly.
  - **AC #5** (parallel double-delete: exactly one 204 + one 404, row removed once, no error): dedicated test in `concurrency.int.test.ts` with `[a.statusCode, b.statusCode].sort()` assertion. Stable across 3 consecutive runs.
  - **AC #6** (`/docs` documents DELETE under `todos` tag with 204, no body, params): verified via live `/docs/json` inspection.
  - **AC #7** (integration coverage in two files): 5 cases in `todos.int.test.ts`, 1 case appended to `concurrency.int.test.ts`.
- Implementation matches the spec verbatim:
  - `deleteTodoById(id) → Promise<boolean>` via `DELETE ... RETURNING { id }` and `rows.length === 1` invariant.
  - DI seam `opts?.deleteTodoById ?? defaultDeleteTodoById`; local binding named `remove` (since `delete` is a reserved-word-like identifier).
  - REUSED Story 2.2's `TodoIdParamsSchema` — no redeclaration.
  - REUSED Story 2.2's `eq` import — no new drizzle-orm imports.
  - `response: { 204: z.null() }` declares the 204 contract; handler returns `null`.
  - Handler is `validate → call → 204-or-404`; no `try/catch`, no manual validation, no logging, no transaction, no advisory locks.
- No spec deviations. The `apps/api/package.json` test-concurrency setting (added in Story 2.2) carries forward unchanged.
- Out-of-scope items remained out of scope: no web changes, no migration, no `Idempotency-Key`, no soft-delete / `deleted_at`, no 410 Gone, no bulk DELETE, no audit log.

### File List

- **Modified:** [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts) — added `deleteTodoById()` export (~7 LOC, no new imports — `eq` already imported by Story 2.2).
- **Modified:** [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) — added DELETE handler within existing `todosRoutes` plugin, added `defaultDeleteTodoById` import, extended `TodosRouteOptions` with optional `deleteTodoById`, bound local `remove` (~25 LOC).
- **Modified:** [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) — appended 5 DELETE integration test cases (~75 LOC).
- **Modified:** [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts) — appended 1 concurrent-DELETE test (~32 LOC).

## Change Log

| Date       | Change                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-04-29 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Story slot: Epic 2, Story 3 (DELETE /todos/:id with concurrent-delete safety, follows Stories 2.1 POST and 2.2 PATCH; closes Epic 2's API surface). |
| 2026-04-29 | Story implemented via `/bmad-dev-story`. Status: ready-for-dev → in-progress → review. Tasks 1–7 complete. DELETE /todos/:id live with reused `TodoIdParamsSchema`, `z.null()` 204 contract, sensible 404 envelope, single DELETE-RETURNING-id-projection (no transaction, no advisory locks). Integration suite 39/39 green on three consecutive runs. /docs documents DELETE under `todos` tag with 204 declared and no `requestBody` key. No spec deviations. Epic 2's API surface is now complete (GET, POST, PATCH, DELETE all live). Commit hash: `2ae5c02`. |
