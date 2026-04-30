# Story 2.5: Create todo via `TodoInput` (full vertical slice)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to type a todo into an input, press Enter (or click submit), and see it appear in the list instantly,
So that I can add to the shared list with perceptibly zero latency (FR1, FR17, NFR1).

## Acceptance Criteria

1. **Given** [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts),
   **When** `createTodo(text: string, signal?: AbortSignal): Promise<Todo>` is invoked,
   **Then** it issues `POST ${process.env.NEXT_PUBLIC_API_URL}/todos` with method `POST`,
   **And** sets headers `content-type: application/json`, `accept: application/json`, and a freshly generated `x-request-id` (`crypto.randomUUID()`) per call,
   **And** the body is `JSON.stringify({ text })` — no client-side `trim`, no client-side length cap (server is the validation authority per Architecture §Validation Timing — [architecture.md:421-424](../../_bmad-output/planning-artifacts/architecture.md#L421-L424)),
   **And** on `201` the response body is parsed via `TodoSchema.safeParse` (mirrors the `getTodos` pattern at [api.ts:41-49](../../apps/web/src/lib/api.ts#L41-L49)) and the parsed `Todo` is returned,
   **And** on a non-OK response (`!response.ok`) it throws `await ApiError.fromResponse(response)`,
   **And** on a malformed-JSON success body (`response.json()` throws) it throws a synthetic `ApiError` with `message: 'Malformed JSON in successful response'` (mirrors [api.ts:30-39](../../apps/web/src/lib/api.ts#L30-L39)),
   **And** on a 201 body that fails `TodoSchema.safeParse` it throws a synthetic `ApiError` with `message: 'Response did not match the expected todo schema'` (mirrors [api.ts:41-48](../../apps/web/src/lib/api.ts#L41-L48)).

2. **Given** [apps/web/src/components/TodoInput.tsx](../../apps/web/src/components/TodoInput.tsx) — a NEW file created by this story,
   **When** it renders,
   **Then** the root element is a `<form>` with an `onSubmit` handler that calls `event.preventDefault()`,
   **And** the form contains exactly one `<input type="text">` and one `<button type="submit">`,
   **And** the input is associated with a label via `htmlFor` matching the input's `id` (visible label or `sr-only` is acceptable; the label must be programmatically reachable by AT — NFR10/NFR11),
   **And** the input has NO `maxLength` attribute (server is the length authority — [architecture.md:424](../../_bmad-output/planning-artifacts/architecture.md#L424)),
   **And** the input is a controlled component — its `value` is bound to a local `useState<string>('')`,
   **And** the submit button has accessible text (e.g., "Add" / "Add todo"),
   **And** the submit button is `disabled` when the local value's `.trim()` is empty.

3. **Given** [apps/web/src/components/TodoInput.tsx](../../apps/web/src/components/TodoInput.tsx),
   **When** its prop interface is inspected,
   **Then** it accepts a single prop `onAdd: (text: string) => void`,
   **And** it does NOT import `@/lib/api`, `@/lib/reducer`, or any module from `apps/web/src/lib/`,
   **And** it does NOT call `crypto.randomUUID()`, `new Date()`, or `fetch` directly (presentational-component contract per [architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631)).

4. **Given** the user types `"buy milk"` and presses Enter (or clicks submit) in `<TodoInput>`,
   **When** the form's submit event fires,
   **Then** the component calls `onAdd("buy milk")` with the LOCAL value verbatim (no client-side `.trim()` — preserves whitespace as the user typed it; the server's Zod `.trim()` at [contracts.ts:3](../../packages/shared/src/contracts.ts#L3) is the authority),
   **And** the local input value is reset to `''` immediately after `onAdd` returns,
   **And** the `disabled` state of the submit button transitions back to `true` (because the new value is empty),
   **And** the input retains DOM focus after the reset (so the user can keep typing without re-clicking).

5. **Given** the local input value is empty or only whitespace,
   **When** the user presses Enter or clicks submit,
   **Then** `onAdd` is NOT called (early-return guard),
   **And** no state changes occur,
   **And** no errors are thrown.

6. **Given** [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx),
   **When** `<TodoInput>` is rendered (inside `<TodoApp>`, above `<TodoList>`),
   **Then** it is rendered ONLY when `state.status === 'success'` (mutations are meaningful only after the initial load — mirrors the reducer's no-op guard at [reducer.ts:55,68,80,88,100,112,120](../../apps/web/src/lib/reducer.ts#L55) and AC #11 of Story 2.4),
   **And** its `onAdd` prop is bound to a stable handler (e.g., via `useCallback` or a top-level closure) — re-creation on every render is acceptable per React idioms but the handler's identity SHOULD be stable across renders that don't change `dispatch` (which is itself stable per `useReducer`'s contract).

7. **Given** the `onAdd` handler in `<TodoApp>`,
   **When** invoked with `text: string`,
   **Then** it generates `tempId = crypto.randomUUID()` and `createdAt = new Date().toISOString()`,
   **And** dispatches `{ type: 'addOptimistic', payload: { tempId, text, createdAt } }`,
   **And** invokes `api.createTodo(text)` (no `signal` passed; this story does not introduce an AbortController for the create flow),
   **And** on resolved server `Todo`, dispatches `{ type: 'addReconcile', payload: { tempId, todo: <serverTodo> } }`,
   **And** on rejection, dispatches `{ type: 'addFailed', payload: { tempId } }`,
   **And** on rejection, does NOT re-throw the error or surface it to the user beyond the optimistic entry's removal (Toast-based error messaging is Story 3.2; FR19 input preservation is Story 3.3 — explicitly OUT of scope here).

8. **Given** an optimistic todo with `pending: true` is in `state.todos`,
   **When** `<TodoList>` and `<TodoItem>` render it,
   **Then** rendering succeeds without errors (the existing `TodoItem` component receives the optimistic entry as a `Todo`-shape value via the `TodoEntry`-widening done in Story 2.4 — see [reducer.ts:8](../../apps/web/src/lib/reducer.ts#L8)),
   **And** the optimistic todo's text is visible in the `<ul>` immediately after submit,
   **And** there is NO additional visual treatment for the `pending` flag in this story (no spinner, no opacity change — that lands when Story 2.6/2.7 disable mutation controls on `pending: true`).

9. **Given** the user submits the same form three times in a row very quickly (e.g., types "a" → Enter → types "b" → Enter → types "c" → Enter),
   **When** all three round-trips complete (in any interleaving),
   **Then** the final `state.todos` contains all three reconciled server todos (NOT three optimistic entries plus three reconciled — the `addReconcile` action replaces, not appends),
   **And** no orphan `pending: true` entries remain,
   **And** each call generated a distinct `tempId` (the per-submit `crypto.randomUUID()` guarantees uniqueness).

10. **Given** the server returns `500` (or the `fetch` rejects with `TypeError: Failed to fetch`) during `api.createTodo`,
    **When** the resulting `addFailed` is dispatched,
    **Then** the optimistic entry whose `id === tempId` is removed from `state.todos` (per Story 2.4 AC #4 — see [2-4-reducer-extensions-for-optimistic-mutations.md:38-40](./2-4-reducer-extensions-for-optimistic-mutations.md#L38-L40)),
    **And** the user sees no error message in this story (Story 3.2 owns Toast),
    **And** the `<TodoInput>` is empty (the user cannot recover their typed text in Epic 2 — FR19 input preservation is explicitly Story 3.3).

11. **Given** a user submits text containing HTML such as `<script>alert(1)</script>` or `<img src=x onerror=alert(1)>`,
    **When** the optimistic entry is appended to the list AND when the reconciled server entry is rendered,
    **Then** the text is rendered via React's default JSX escaping in `<TodoItem>` ([TodoItem.tsx:33](../../apps/web/src/components/TodoItem.tsx#L33) — `{todo.text}`),
    **And** no `<script>` element is created in the DOM (NFR17 — see [architecture.md:216](../../_bmad-output/planning-artifacts/architecture.md#L216) and [architecture.md:435](../../_bmad-output/planning-artifacts/architecture.md#L435)),
    **And** no `dangerouslySetInnerHTML` is introduced anywhere in this story.

12. **Given** [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts),
    **When** Vitest runs (`npm run test --workspace apps/web`),
    **Then** the suite covers `createTodo`:
    - happy path: 201 body parses; method is POST; `x-request-id` header present and a valid UUID; `content-type: application/json`; body is exactly `JSON.stringify({ text })` with the supplied text (no trim);
    - non-OK envelope (e.g., 400 with the Fastify-sensible error body) → throws `ApiError` with `statusCode`, `message`, `requestId` propagated;
    - non-OK with NO server `x-request-id` header → throws `ApiError` with `requestId === undefined`;
    - 201 body that fails `TodoSchema.safeParse` (e.g., wrong shape) → throws `ApiError` with `message: 'Response did not match the expected todo schema'`;
    - 201 with malformed JSON → throws `ApiError` with `message: 'Malformed JSON in successful response'`,
    **And** the existing `getTodos` tests at [api.test.ts](../../apps/web/src/lib/api.test.ts) continue to pass unchanged.

13. **Given** [apps/web/src/components/TodoInput.test.tsx](../../apps/web/src/components/TodoInput.test.tsx) — NEW file,
    **When** Vitest + React Testing Library runs,
    **Then** the suite covers:
    - initial render: input is empty; submit button is disabled; label is associated with input (queryable via `getByLabelText`);
    - typing populates the input value; submit button becomes enabled when trimmed value is non-empty;
    - submit button stays disabled when value is only whitespace (e.g., `'   '`);
    - pressing Enter inside the input calls `onAdd(text)` exactly once with the typed text verbatim (no client trim);
    - clicking the submit button calls `onAdd(text)` exactly once with the same payload;
    - after a successful submit, the input value resets to `''` and the input retains focus (use `expect(input).toHaveFocus()`);
    - submit on empty/whitespace value: `onAdd` is NEVER called;
    - typing `<script>alert(1)</script>`: `onAdd` receives the literal string; the text is never executed (verified at the `TodoApp.test.tsx` level via `screen.queryByText` matching the literal);
    - the `onAdd` prop is invoked synchronously from the form's submit handler (not via a `setTimeout` / `Promise` indirection that would race the input clear).

14. **Given** [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx) — NEW file,
    **When** Vitest + RTL runs (with `vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000')` and `vi.stubGlobal('fetch', ...)` matching the existing pattern at [api.test.ts:6-9,17-19](../../apps/web/src/lib/api.test.ts#L6-L9)),
    **Then** the suite covers the create-todo journey end-to-end:
    - happy path: initial GET `/todos` returns `{ todos: [] }` → page shows empty state → user types "buy milk" → presses Enter → list immediately shows "buy milk" (optimistic) → POST `/todos` resolves with a server-shape `Todo` → list still shows "buy milk" with NO duplicate entry;
    - rollback: initial GET returns `[]` → user types "fail me" → presses Enter → optimistic entry visible → POST `/todos` rejects (e.g., 500) → optimistic entry is removed from the list;
    - input clears after submit (assert input value is `''`);
    - XSS-as-text: user types `<script>alert(1)</script>` → server returns the same literal text → assert the rendered list contains the literal text and the document contains NO `<script>` element with that body (`document.querySelector('script')` either is null or is an unrelated test-runner script — assert via `within(list).queryByText('<script>alert(1)</script>')` to pin the text rendering).

15. **Given** [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx),
    **When** the diff is inspected,
    **Then** the `<TodoApp>` change is additive: the existing `useEffect` for initial load + visibility refetch is preserved verbatim,
    **And** the new `onAdd` handler is colocated (top-of-component, after `useReducer`),
    **And** the JSX adds `<TodoInput onAdd={handleAdd} />` ABOVE `<TodoList state={state} />` inside the existing `<section>`, gated on `state.status === 'success'` (e.g., `{state.status === 'success' && <TodoInput onAdd={handleAdd} />}`).

16. **Given** the full sanity gate suite,
    **When** `npm run lint`, `npm run typecheck`, and `npm run test` run from the repo root,
    **Then** all three pass: zero ESLint warnings/errors, zero TypeScript errors, all tests green,
    **And** the web test count moves from 42 → ~62 (existing 42 + ~20 new across `TodoInput.test.tsx`, `TodoApp.test.tsx`, and additions to `api.test.ts`),
    **And** no `console.error`/`console.warn` is logged during the test run for tests that don't intentionally trigger them (the `consoleErrorSpy`/`consoleWarnSpy` `afterEach` pattern from [TodoList.test.tsx:21-32](../../apps/web/src/components/TodoList.test.tsx#L21-L32) MUST be mirrored in any new component test file).

## Tasks / Subtasks

- [x] **Task 1: Add `createTodo` to the API client (AC: #1, #12)**
  - [x] Edit [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) — add `createTodo` alongside the existing `getTodos`. Mirror the structure exactly; the only differences are method, body, and response schema.

    ```ts
    import {
      TodoListResponseSchema,
      TodoSchema,
      type Todo,
    } from '@todo-app/shared';
    import { ApiError } from './errors';

    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    if (!API_URL) {
      throw new Error('NEXT_PUBLIC_API_URL is required (apps/web/src/lib/api.ts)');
    }

    function newRequestId(): string {
      return crypto.randomUUID();
    }

    export async function getTodos(signal?: AbortSignal): Promise<Todo[]> {
      // ... existing body unchanged ...
    }

    export async function createTodo(
      text: string,
      signal?: AbortSignal,
    ): Promise<Todo> {
      const requestId = newRequestId();
      const response = await fetch(`${API_URL}/todos`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({ text }),
        signal,
      });

      if (!response.ok) {
        throw await ApiError.fromResponse(response);
      }

      const responseRequestId = response.headers.get('x-request-id') ?? requestId;

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ApiError({
          statusCode: response.status,
          message: 'Malformed JSON in successful response',
          requestId: responseRequestId,
        });
      }

      const parsed = TodoSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiError({
          statusCode: response.status,
          message: 'Response did not match the expected todo schema',
          requestId: responseRequestId,
        });
      }
      return parsed.data;
    }
    ```

  - [x] **Why mirror `getTodos` line-for-line** — [api.ts](../../apps/web/src/lib/api.ts) is the project's canonical fetch idiom. Story 1.8 established the headers, the `requestId` capture-or-fallback, the `safeParse` envelope, and the exact `ApiError` wrapping for malformed-JSON / contract-drift cases. Stories 2.6/2.7 will add `updateTodo` / `deleteTodo` next; mirroring keeps all four wrappers grep-friendly and review-friendly.
  - [x] **Why `JSON.stringify({ text })` (not the raw string)** — the server endpoint validates against `CreateTodoRequestSchema` ([contracts.ts:14-18](../../packages/shared/src/contracts.ts#L14-L18)) which is a `.strict()` Zod object expecting the `{ text }` envelope. A raw `JSON.stringify(text)` would yield `"buy milk"` (a string literal) and produce a `400` from the server.
  - [x] **Why pass `text` raw (no `.trim()`)** — the server's `CreateTodoRequestSchema` runs `.trim()` itself (z.string().trim().min(1).max(500) at [contracts.ts:3](../../packages/shared/src/contracts.ts#L3)). Trimming on the client would duplicate the rule and risk drift if the server later relaxes/tightens it. Architecture §Validation Timing ([architecture.md:421-424](../../_bmad-output/planning-artifacts/architecture.md#L421-L424)) is explicit: "Client: minimal. Rely on server validation as the authority. … Do not duplicate max-length checks in the client."
  - [x] **Why `TodoSchema` (singular, not list) on the response** — the server returns a bare entity for `POST` (per Architecture §Format Patterns at [architecture.md:365-367](../../_bmad-output/planning-artifacts/architecture.md#L365-L367) — "Single resource (create, update): the bare entity"). `TodoListResponseSchema` would fail parsing and trigger the synthetic `ApiError`.
  - [x] **Why a `signal` param even though Story 2.5 doesn't pass one** — keeping the `(text, signal?)` shape consistent with `getTodos(signal?)` lets a future test or component pass an `AbortSignal` (e.g., for component unmount during in-flight create) without breaking the call sites added by this story. The story does NOT use it; just don't paint the API into a corner.
  - [x] **Watch-out:** Do NOT export a default. The existing `getTodos` is a named export; mirror it.
  - [x] **Watch-out:** Do NOT add a `try/catch` around the whole function to swallow errors. Errors must propagate as `ApiError` (or, in catastrophic infra cases, raw `TypeError` from `fetch` — caller handles that).
  - [x] **Watch-out:** Do NOT log on failure inside the wrapper. The architecture says request-context logging is the API's job; client logging is for the safety net (Epic 3). Adding a `console.warn(err)` here forces a `consoleWarnSpy` exemption in every component test that exercises the error path — drift waiting to happen.

- [x] **Task 2: Extend `api.test.ts` with `createTodo` coverage (AC: #1, #12)**
  - [x] Edit [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) — append a `describe('createTodo()', ...)` block AFTER the existing `getTodos()` describe. Mirror the `mockFetchOnce` helper and the `vi.stubEnv` / `vi.resetModules` lifecycle already in place.

    ```ts
    describe('createTodo()', () => {
      it('issues POST with x-request-id, content-type, and JSON body containing the supplied text verbatim', async () => {
        const todo = {
          id: '11111111-1111-4111-8111-111111111111',
          text: 'buy milk',
          completed: false,
          createdAt: '2026-04-29T00:00:00.000Z',
        };
        mockFetchOnce(
          new Response(JSON.stringify(todo), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
        );
        const { createTodo } = await import('./api');
        const result = await createTodo('buy milk');
        expect(result).toEqual(todo);

        const fetchMock = vi.mocked(globalThis.fetch);
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe('http://localhost:4000/todos');
        expect(init).toMatchObject({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            'x-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/i),
          }),
          body: JSON.stringify({ text: 'buy milk' }),
        });
      });

      it('preserves whitespace verbatim in the request body (server is the trim authority)', async () => {
        const todo = {
          id: '11111111-1111-4111-8111-111111111111',
          text: 'buy milk',
          completed: false,
          createdAt: '2026-04-29T00:00:00.000Z',
        };
        mockFetchOnce(
          new Response(JSON.stringify(todo), { status: 201 }),
        );
        const { createTodo } = await import('./api');
        await createTodo('  buy milk  ');
        const fetchMock = vi.mocked(globalThis.fetch);
        const init = fetchMock.mock.calls[0]![1]!;
        expect(init.body).toBe(JSON.stringify({ text: '  buy milk  ' }));
      });

      it('throws ApiError with status, message, and requestId when the server returns a non-OK envelope', async () => {
        mockFetchOnce(
          new Response(
            JSON.stringify({
              statusCode: 400,
              error: 'Bad Request',
              message: 'text must be at least 1 character',
            }),
            {
              status: 400,
              headers: {
                'content-type': 'application/json',
                'x-request-id': 'srv-abc',
              },
            },
          ),
        );
        const { createTodo } = await import('./api');
        await expect(createTodo('')).rejects.toMatchObject({
          name: 'ApiError',
          statusCode: 400,
          message: 'text must be at least 1 character',
          requestId: 'srv-abc',
        });
      });

      it('throws ApiError with requestId === undefined when the server omits the x-request-id header', async () => {
        mockFetchOnce(
          new Response(
            JSON.stringify({ statusCode: 500, error: 'Internal Server Error', message: 'oops' }),
            { status: 500 },
          ),
        );
        const { createTodo } = await import('./api');
        await expect(createTodo('x')).rejects.toMatchObject({
          name: 'ApiError',
          statusCode: 500,
          requestId: undefined,
        });
      });

      it('throws ApiError when the 201 body fails TodoSchema parsing (server contract drift)', async () => {
        mockFetchOnce(
          new Response(JSON.stringify({ id: 'not-a-uuid', text: 'x' }), {
            status: 201,
          }),
        );
        const { createTodo } = await import('./api');
        await expect(createTodo('x')).rejects.toMatchObject({
          name: 'ApiError',
          message: 'Response did not match the expected todo schema',
        });
      });

      it('throws ApiError when the 201 body is malformed JSON', async () => {
        mockFetchOnce(
          new Response('not json {', {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
        );
        const { createTodo } = await import('./api');
        await expect(createTodo('x')).rejects.toMatchObject({
          name: 'ApiError',
          message: 'Malformed JSON in successful response',
        });
      });
    });
    ```

  - [x] **Why `await import('./api')` inside the test (and not a top-level import)** — `api.ts` reads `process.env.NEXT_PUBLIC_API_URL` AT MODULE LOAD and throws if missing. The existing `vi.stubEnv` + `vi.resetModules()` lifecycle in `beforeEach` ([api.test.ts:6-9](../../apps/web/src/lib/api.test.ts#L6-L9)) re-evaluates `api.ts` per-test against the stubbed env. A top-level `import` would freeze the env at suite-load time. Mirror the existing pattern verbatim.
  - [x] **Why test the `Bad Request` envelope shape** — `ErrorResponseSchema` at [contracts.ts:32-39](../../packages/shared/src/contracts.ts#L32-L39) defines `{ statusCode, error, message, code? }` — the Fastify-sensible default. `ApiError.fromResponse` ([errors.ts:25-51](../../apps/web/src/lib/errors.ts#L25-L51)) parses it through this schema. Tests must exercise that path.
  - [x] **Watch-out:** Do NOT mock `crypto.randomUUID` or `Date.now`. The fetch-mock test doesn't care about the exact UUID; it asserts the header MATCHES `^[0-9a-f-]{36}$/i`.

- [x] **Task 3: Create `<TodoInput>` (AC: #2, #3, #4, #5)**
  - [x] Create [apps/web/src/components/TodoInput.tsx](../../apps/web/src/components/TodoInput.tsx). Presentational component; owns local input state only.

    ```tsx
    'use client';

    import { useId, useRef, useState, type FormEvent } from 'react';

    export interface TodoInputProps {
      onAdd: (text: string) => void;
    }

    export default function TodoInput({ onAdd }: TodoInputProps) {
      const [value, setValue] = useState('');
      const inputId = useId();
      const inputRef = useRef<HTMLInputElement>(null);

      const isEmpty = value.trim().length === 0;

      const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        if (value.trim().length === 0) return;
        // Pass the user's text VERBATIM (no client trim). Server's
        // CreateTodoRequestSchema runs `.trim()` itself; we don't duplicate.
        onAdd(value);
        setValue('');
        // Re-focus so the user can keep typing without re-clicking.
        inputRef.current?.focus();
      };

      return (
        <form
          data-testid="todo-input"
          onSubmit={handleSubmit}
          className="flex gap-2"
        >
          <label htmlFor={inputId} className="sr-only">
            Add a todo
          </label>
          <input
            ref={inputRef}
            id={inputId}
            data-testid="todo-input-field"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="What needs to be done?"
            autoComplete="off"
            className="flex-1 rounded-md border border-current/10 px-3 py-2 text-base leading-6 outline-none focus-visible:ring-2 focus-visible:ring-current/40"
          />
          <button
            type="submit"
            data-testid="todo-input-submit"
            disabled={isEmpty}
            className="rounded-md border border-current/10 px-4 py-2 text-sm font-medium hover:bg-current/5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-current/40"
          >
            Add
          </button>
        </form>
      );
    }
    ```

  - [x] **Why `'use client'` at the top** — `TodoInput` uses `useState`, `useId`, `useRef` (React hooks). Next.js 16 App Router defaults to Server Components; hooks require the directive. `TodoApp.tsx` already has it ([TodoApp.tsx:1](../../apps/web/src/components/TodoApp.tsx#L1)).
  - [x] **Why `useId()` for the label** — generates a stable, SSR-safe unique id without a hard-coded `'todo-input-id'` literal that would collide if `<TodoInput>` were ever rendered twice. Story 2.5 only renders one, but the cost is zero and the safety is durable.
  - [x] **Why `inputRef` and `inputRef.current?.focus()` after submit** — AC #4 requires the input to retain focus. React natively keeps focus on the focused input across re-renders (controlled or otherwise) only if the input element is not unmounted; since this stays mounted, the explicit `.focus()` is defensive against future code paths that could blur (e.g., a future preserve-input failure mode). Tests will pin this with `expect(input).toHaveFocus()`.
  - [x] **Why pass `value` (not `value.trim()`) to `onAdd`** — AC #4 mandates verbatim. Server is the trim authority. See Task 1's "Why pass `text` raw" note.
  - [x] **Why guard inside `handleSubmit` even though the button is `disabled` when empty** — keyboard-Enter inside the input fires the `submit` event regardless of the button's disabled state in some browsers (especially with autofill / IME). The defensive guard is two lines and prevents a "silent empty optimistic todo" bug.
  - [x] **Why `autoComplete="off"`** — todo text is freeform; password managers and Chrome's "remembered values" dropdown create UX noise on a single-field form. Tailwind v4's `autocomplete` default is browser default, which is `on`.
  - [x] **Watch-out:** Do NOT add a `maxLength` attribute. AC #2 mandates its absence. The architecture's anti-pattern at [architecture.md:487-488](../../_bmad-output/planning-artifacts/architecture.md#L487-L488) calls this out explicitly.
  - [x] **Watch-out:** Do NOT import `@/lib/api`, `@/lib/reducer`, or `@/lib/errors`. AC #3 is structural — TodoInput must remain decoupled from the data layer. ESLint won't catch this; the dev agent must.
  - [x] **Watch-out:** Do NOT add a `useEffect` to clear input — the synchronous reset inside `handleSubmit` is correct. A `useEffect` chained on a "submitted" flag adds complexity for no benefit.
  - [x] **Watch-out:** Do NOT pass `dispatch` or `state` as props to `<TodoInput>`. Architectural rule at [architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631) — TodoInput is presentational; only `onAdd` flows in.
  - [x] **Watch-out:** Do NOT preserve input on add failure in this story. FR19 (input preservation) is **explicitly Story 3.3** — see [epics.md:1107-1144](../../_bmad-output/planning-artifacts/epics.md#L1107-L1144). Story 2.5 clears unconditionally after a successful local submit; the rejection path simply doesn't restore the text.

- [x] **Task 4: Add `TodoInput.test.tsx` (AC: #13)**
  - [x] Create [apps/web/src/components/TodoInput.test.tsx](../../apps/web/src/components/TodoInput.test.tsx). Mirror the existing test-file pattern (consoleErrorSpy/consoleWarnSpy in `beforeEach`/`afterEach`) from [TodoList.test.tsx:21-32](../../apps/web/src/components/TodoList.test.tsx#L21-L32).

    ```tsx
    import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
    import { render, screen } from '@testing-library/react';
    import userEvent from '@testing-library/user-event'; // already a transitive dep via @testing-library/react@^16
    import TodoInput from './TodoInput';

    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    describe('<TodoInput />', () => {
      it('renders an empty controlled input with a disabled submit button', () => {
        render(<TodoInput onAdd={vi.fn()} />);
        const input = screen.getByLabelText(/add a todo/i) as HTMLInputElement;
        const submit = screen.getByRole('button', { name: /add/i }) as HTMLButtonElement;
        expect(input.value).toBe('');
        expect(submit).toBeDisabled();
      });

      it('enables submit when a non-whitespace character is typed', async () => {
        const user = userEvent.setup();
        render(<TodoInput onAdd={vi.fn()} />);
        await user.type(screen.getByLabelText(/add a todo/i), 'a');
        expect(screen.getByRole('button', { name: /add/i })).toBeEnabled();
      });

      it('keeps submit disabled for whitespace-only input', async () => {
        const user = userEvent.setup();
        render(<TodoInput onAdd={vi.fn()} />);
        await user.type(screen.getByLabelText(/add a todo/i), '   ');
        expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
      });

      it('calls onAdd with the typed text verbatim when Enter is pressed inside the input', async () => {
        const onAdd = vi.fn();
        const user = userEvent.setup();
        render(<TodoInput onAdd={onAdd} />);
        const input = screen.getByLabelText(/add a todo/i);
        await user.type(input, 'buy milk{Enter}');
        expect(onAdd).toHaveBeenCalledTimes(1);
        expect(onAdd).toHaveBeenCalledWith('buy milk');
      });

      it('calls onAdd with the typed text verbatim when the submit button is clicked', async () => {
        const onAdd = vi.fn();
        const user = userEvent.setup();
        render(<TodoInput onAdd={onAdd} />);
        await user.type(screen.getByLabelText(/add a todo/i), 'walk dog');
        await user.click(screen.getByRole('button', { name: /add/i }));
        expect(onAdd).toHaveBeenCalledWith('walk dog');
      });

      it('passes whitespace verbatim (server trims; client does NOT)', async () => {
        const onAdd = vi.fn();
        const user = userEvent.setup();
        render(<TodoInput onAdd={onAdd} />);
        await user.type(screen.getByLabelText(/add a todo/i), '  buy milk  {Enter}');
        expect(onAdd).toHaveBeenCalledWith('  buy milk  ');
      });

      it('resets the input value to empty after a successful submit', async () => {
        const user = userEvent.setup();
        render(<TodoInput onAdd={vi.fn()} />);
        const input = screen.getByLabelText(/add a todo/i) as HTMLInputElement;
        await user.type(input, 'buy milk{Enter}');
        expect(input.value).toBe('');
      });

      it('retains focus on the input after submit', async () => {
        const user = userEvent.setup();
        render(<TodoInput onAdd={vi.fn()} />);
        const input = screen.getByLabelText(/add a todo/i);
        await user.type(input, 'buy milk{Enter}');
        expect(input).toHaveFocus();
      });

      it('does NOT call onAdd when value is empty', async () => {
        const onAdd = vi.fn();
        const user = userEvent.setup();
        render(<TodoInput onAdd={onAdd} />);
        // Trigger form submit via keyboard with no value: button is disabled
        // so click won't fire; pressing Enter on the empty input either does
        // nothing (some browsers) or fires submit (others). The handler MUST
        // guard against both.
        const input = screen.getByLabelText(/add a todo/i);
        await user.type(input, '{Enter}');
        expect(onAdd).not.toHaveBeenCalled();
      });

      it('does NOT call onAdd when value is whitespace-only', async () => {
        const onAdd = vi.fn();
        const user = userEvent.setup();
        render(<TodoInput onAdd={onAdd} />);
        const input = screen.getByLabelText(/add a todo/i);
        await user.type(input, '   {Enter}');
        expect(onAdd).not.toHaveBeenCalled();
      });

      it('passes literal HTML/script text to onAdd without parsing or escaping (escaping is the renderer\'s job)', async () => {
        const onAdd = vi.fn();
        const user = userEvent.setup();
        render(<TodoInput onAdd={onAdd} />);
        await user.type(screen.getByLabelText(/add a todo/i), '<script>alert(1)</script>{Enter}');
        expect(onAdd).toHaveBeenCalledWith('<script>alert(1)</script>');
      });

      it('does NOT set a maxLength attribute (server is the length authority)', () => {
        render(<TodoInput onAdd={vi.fn()} />);
        const input = screen.getByLabelText(/add a todo/i);
        expect(input).not.toHaveAttribute('maxlength');
      });
    });
    ```

  - [x] **Why `userEvent.setup()` (not `fireEvent`)** — `userEvent` simulates real keyboard/mouse interactions including focus management, form submission semantics, and event ordering. `fireEvent.submit(form)` would skip the input's keystroke handling and miss bugs in the typing-then-submitting flow. RTL's docs explicitly recommend `userEvent` for anything beyond a single click.
  - [x] **Why `userEvent` is available** — `@testing-library/user-event` is installed transitively via `@testing-library/react@^16` (it's NOT a separate dep). Verify by checking `apps/web/node_modules/@testing-library/user-event/package.json` exists; if Vitest can resolve `@testing-library/user-event`, the import works. If for any reason it doesn't, install explicitly: `npm install --save-dev --workspace apps/web @testing-library/user-event`.
  - [x] **Why `screen.getByLabelText(/add a todo/i)` (not `getByRole('textbox')`)** — pinning the test to the label proves the AC #2 requirement that the input is associated with a programmatically-reachable label. `getByRole('textbox')` would pass even if the label were missing/disconnected.
  - [x] **Why `toHaveFocus()` (jest-dom matcher)** — already imported via `vitest.setup.ts:1` (`import '@testing-library/jest-dom/vitest'`). No setup needed.
  - [x] **Watch-out:** Do NOT mock `crypto.randomUUID` here. `<TodoInput>` does NOT call it (per AC #3); the ID generation lives in `<TodoApp>`. Mocking it here would mask a regression where the wrong component gained id-minting responsibility.
  - [x] **Watch-out:** Do NOT use `act()` manually. RTL + `userEvent.setup()` wraps the right things automatically.

- [x] **Task 5: Wire `<TodoApp>` to dispatch + call `api.createTodo` (AC: #6, #7, #8, #15)**
  - [x] Edit [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx). Additive change: import `createTodo`, add a `handleAdd` callback, render `<TodoInput>` above the existing `<TodoList>`. The existing `useEffect` for initial load + visibility refetch is **not** modified.

    ```tsx
    'use client';

    import { useCallback, useEffect, useReducer } from 'react';
    import { createTodo, getTodos } from '@/lib/api';
    import { ApiError } from '@/lib/errors';
    import { initialState, reducer } from '@/lib/reducer';
    import TodoInput from './TodoInput';
    import TodoList from './TodoList';

    export default function TodoApp() {
      const [state, dispatch] = useReducer(reducer, initialState);

      // ...existing initial-load useEffect — UNCHANGED...

      const handleAdd = useCallback((text: string): void => {
        const tempId = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        dispatch({ type: 'addOptimistic', payload: { tempId, text, createdAt } });
        createTodo(text).then(
          (todo) => {
            dispatch({ type: 'addReconcile', payload: { tempId, todo } });
          },
          () => {
            // Toast-based error surfacing is Story 3.2; FR19 input preservation
            // is Story 3.3. In Epic 2 we silently roll back the optimistic entry.
            dispatch({ type: 'addFailed', payload: { tempId } });
          },
        );
      }, []);

      return (
        <section aria-labelledby="todos-heading" className="flex flex-col gap-6">
          <h1 id="todos-heading" className="text-3xl font-semibold tracking-tight">
            Shared Todos
          </h1>
          {state.status === 'success' && <TodoInput onAdd={handleAdd} />}
          <TodoList state={state} />
        </section>
      );
    }
    ```

  - [x] **Why `useCallback` on `handleAdd`** — `dispatch` is reference-stable from `useReducer` (React guarantee), so the callback's deps are `[]` and the function identity is stable across renders. Passing a stable callback to `<TodoInput>` is not strictly required (TodoInput doesn't memoize), but it documents intent and prevents future React.memo wrappings from breaking. Cost: ~30 bytes after minify.
  - [x] **Why generate `tempId` and `createdAt` in `handleAdd` (not in `<TodoInput>`)** — Story 2.4 AC #10 mandates the reducer is pure: all entropy (UUID, timestamps) arrives via action payloads. The architecture pinned the create flow's owner explicitly: "TodoApp is the only stateful component. It owns the reducer and all api.ts calls" ([architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631)). TodoInput stays decoupled from `crypto`/`Date`.
  - [x] **Why gate `<TodoInput>` on `state.status === 'success'`** — AC #6. The reducer's optimistic actions are no-ops outside `success` (Story 2.4 AC #11). Rendering the input but having every dispatch silently swallowed would be a debugging puzzle. Hiding the input until load completes is honest.
  - [x] **Why `.then(onSuccess, onReject)` (not `.then().catch()`)** — `Promise#then(onSuccess, onReject)` is exactly equivalent to `.then(onSuccess).catch(onReject)` in this case (single resolution path), but the two-arg form is one fewer node in the promise chain and matches the existing pattern in the load `useEffect` ([TodoApp.tsx:17-31](../../apps/web/src/components/TodoApp.tsx#L17-L31)). The architecture's "no automatic retries in v1" ([architecture.md:417-418](../../_bmad-output/planning-artifacts/architecture.md#L417-L418)) keeps this short.
  - [x] **Why no `signal` passed to `createTodo`** — the create flow is fire-and-forget with optimistic UI. If the user navigates away during an in-flight create, dispatching `addReconcile` against a stale `dispatch` is a React 18+ no-op (state updates after unmount are silently dropped, no warning). Adding an `AbortController` would orphan the optimistic entry on unmount (signal aborts → fetch rejects → `addFailed` dispatches against a dead component → no-op anyway). Net: no benefit. The existing initial-load effect uses `AbortController` because it owns a long-lived listener; the create flow doesn't.
  - [x] **Why catch the error without re-throwing** — `unhandledrejection` listeners (Story 3.5 / NFR9) would fire if we let the error escape. The architecture explicitly logs server-side; client-side rejections from `api.ts` calls SHOULD be caught at the call site and surfaced via the `{intent}Failed` action. The dispatched `addFailed` IS the surfacing in Epic 2.
  - [x] **Why don't we capture the `ApiError` and stash its message** — Story 2.5 deliberately doesn't surface it. Story 3.2 ([epics.md:1064-1106](../../_bmad-output/planning-artifacts/epics.md#L1064-L1106)) extends `addFailed` with a `message` field and renders it via Toast. Doing it now would force a partial Toast scaffold and pre-empt Epic 3's UX choices.
  - [x] **Watch-out:** Do NOT call `dispatch` synchronously within the `.then` callback if there's any chance the component unmounted — actually, React 18+ tolerates this (silent no-op). Don't over-defend.
  - [x] **Watch-out:** Do NOT add a `try/catch` around the whole body of `handleAdd`. `crypto.randomUUID()` and `new Date().toISOString()` cannot throw in any runtime that supports the Browser Matrix at [prd.md:229-233](../../_bmad-output/planning-artifacts/prd.md#L229-L233) (Chrome 111+, Safari 16.4+, Firefox 113+ — all support `crypto.randomUUID` since Chrome 92 / Safari 15.4 / Firefox 95).
  - [x] **Watch-out:** Do NOT short-circuit `handleAdd` on `text.trim() === ''`. `<TodoInput>` already guards. A duplicate guard adds maintenance burden without correctness gains, and `addOptimistic` for an empty string is harmless because TodoInput would never produce one.
  - [x] **Watch-out:** Do NOT add the `<TodoInput>` to render branches `idle`/`loading`/`error`. AC #6 mandates `success`-only rendering. If a future Epic 3 retry changes this, it'll be that story's call.

- [x] **Task 6: Add `<TodoApp>` journey-level test (AC: #14)**
  - [x] Create [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx). The test covers the create journey end-to-end: user types → optimistic appears → server resolves → list stable; and rollback on failure.

    ```tsx
    import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
    import { render, screen, within } from '@testing-library/react';
    import userEvent from '@testing-library/user-event';

    // Mirror api.test.ts: stub env BEFORE the dynamic import + resetModules.
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
      vi.resetModules();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
        ...init,
      });
    }

    describe('<TodoApp /> create journey', () => {
      it('happy path: GET → empty → type → optimistic → POST resolves → reconciled (no duplicate)', async () => {
        const fetchMock = vi
          .fn()
          // initial GET /todos
          .mockResolvedValueOnce(jsonResponse({ todos: [] }))
          // POST /todos
          .mockResolvedValueOnce(
            jsonResponse(
              {
                id: '11111111-1111-4111-8111-111111111111',
                text: 'buy milk',
                completed: false,
                createdAt: '2026-04-29T00:00:00.000Z',
              },
              { status: 201 },
            ),
          );
        vi.stubGlobal('fetch', fetchMock);

        const { default: TodoApp } = await import('./TodoApp');
        render(<TodoApp />);

        // Wait for empty state then for the input to appear (gated on success).
        await screen.findByTestId('todo-list-empty');
        const input = await screen.findByLabelText(/add a todo/i);

        const user = userEvent.setup();
        await user.type(input, 'buy milk{Enter}');

        // Optimistic entry is visible immediately (before POST resolves in microtask order).
        const list = await screen.findByTestId('todo-list');
        expect(within(list).getByText('buy milk')).toBeInTheDocument();

        // After microtask flush, the reconcile happens. Re-query — only ONE entry should remain.
        const itemsAfter = await within(list).findAllByTestId('todo-item');
        expect(itemsAfter).toHaveLength(1);
        expect(itemsAfter[0]).toHaveTextContent('buy milk');

        // POST was issued with content-type, body { text: 'buy milk' }, and an x-request-id.
        const postCall = fetchMock.mock.calls[1]!;
        expect(postCall[0]).toBe('http://localhost:4000/todos');
        expect(postCall[1]).toMatchObject({
          method: 'POST',
          body: JSON.stringify({ text: 'buy milk' }),
        });

        // Input is cleared.
        expect((input as HTMLInputElement).value).toBe('');
      });

      it('rollback: optimistic entry appears then disappears when POST rejects', async () => {
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(jsonResponse({ todos: [] }))
          .mockResolvedValueOnce(
            jsonResponse(
              { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
              { status: 500 },
            ),
          );
        vi.stubGlobal('fetch', fetchMock);

        const { default: TodoApp } = await import('./TodoApp');
        render(<TodoApp />);

        await screen.findByTestId('todo-list-empty');
        const input = await screen.findByLabelText(/add a todo/i);

        const user = userEvent.setup();
        await user.type(input, 'fail me{Enter}');

        // Optimistic entry visible.
        const list = await screen.findByTestId('todo-list');
        expect(within(list).queryByText('fail me')).toBeInTheDocument();

        // After POST rejects, the optimistic entry is removed; the list goes back to empty.
        await screen.findByTestId('todo-list-empty');
        expect(screen.queryByText('fail me')).not.toBeInTheDocument();
      });

      it('XSS-as-text: literal HTML in todo text renders as text, never as DOM', async () => {
        const xss = '<script>alert(1)</script>';
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(jsonResponse({ todos: [] }))
          .mockResolvedValueOnce(
            jsonResponse(
              {
                id: '11111111-1111-4111-8111-111111111111',
                text: xss,
                completed: false,
                createdAt: '2026-04-29T00:00:00.000Z',
              },
              { status: 201 },
            ),
          );
        vi.stubGlobal('fetch', fetchMock);

        const { default: TodoApp } = await import('./TodoApp');
        render(<TodoApp />);

        await screen.findByTestId('todo-list-empty');
        const user = userEvent.setup();
        await user.type(screen.getByLabelText(/add a todo/i), `${xss}{Enter}`);

        const list = await screen.findByTestId('todo-list');
        // Literal text is present.
        expect(within(list).getByText(xss)).toBeInTheDocument();
        // No <script> child was injected by the rendering of the todo text.
        expect(list.querySelector('script')).toBeNull();
      });

      it('hides <TodoInput> until the initial load resolves to success', async () => {
        // Make the initial GET hang forever — input should not be visible.
        const neverResolves = new Promise<Response>(() => {});
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(neverResolves));

        const { default: TodoApp } = await import('./TodoApp');
        render(<TodoApp />);

        // Loading branch is showing.
        await screen.findByTestId('todo-list-loading');
        // Input is NOT in the DOM yet.
        expect(screen.queryByLabelText(/add a todo/i)).toBeNull();
      });
    });
    ```

  - [x] **Why `await import('./TodoApp')` after `vi.stubGlobal('fetch', ...)`** — `TodoApp.tsx` imports from `@/lib/api`, which throws at module-load time if `NEXT_PUBLIC_API_URL` is missing. The dynamic import after `vi.resetModules()` re-evaluates `api.ts` against the stubbed env. Putting the import at the top of the file would freeze it.
  - [x] **Why `findByTestId('todo-list-empty')` to gate the typing step** — the initial GET resolves asynchronously (microtask). Trying to interact before the empty state renders would interact with the loading branch (which has no input — see AC #6). `findBy*` polls until a match exists or times out.
  - [x] **Why assert `itemsAfter.toHaveLength(1)`** — proves the reconcile is a REPLACE (not an append). If the reducer mistakenly pushed a second entry, this would fail. AC #9 also leans on this property in spirit.
  - [x] **Why test the "input hides until success" gate** — AC #6 is structural; pinning it with a test prevents a future refactor from rendering `<TodoInput>` unconditionally.
  - [x] **Watch-out:** Do NOT add a `consoleErrorSpy`/`consoleWarnSpy` *strict* assertion in this file. The rollback test triggers a path where `console.warn` MAY fire if the dev agent forgets to swallow the error in `handleAdd`. Asserting against console output here would mask the bug under test (the silent rollback). If the tests pass without that assertion, the rollback works correctly. **HOWEVER:** if the dev agent adds a console log inside `handleAdd`, this test will pollute the test output — that's a code smell to fix.
  - [x] **Watch-out:** Do NOT mock `crypto.randomUUID` or `Date.now`. The journey test treats both as black boxes. The optimistic entry's transient `tempId` is irrelevant because the test asserts on text and final list shape, not ids.

- [x] **Task 7: Sanity gates**
  - [x] `npm run lint` — must report 0 warnings, 0 errors.
  - [x] `npm run typecheck` — must report 0 errors. Notably, `<TodoInput>` should NOT compile if `onAdd` is missing or wrong-typed.
  - [x] `npm run test` — runs unit tests across all workspaces. Web tests should jump from 42 → ~62 (adding ~6 in `api.test.ts` for `createTodo`, ~12 in `TodoInput.test.tsx`, 4 in `TodoApp.test.tsx`).
  - [x] **Verify `@testing-library/user-event` resolves** — run `node -e "console.log(require.resolve('@testing-library/user-event'))"` from `apps/web/`. If it errors, install: `npm install --save-dev --workspace apps/web @testing-library/user-event`. Add the dep to `apps/web/package.json` under `devDependencies`.
  - [x] No new ESLint rules required. No new TypeScript options required. No new env vars.

- [x] **Task 8: Commit**
  - [x] Stage exactly:
    - **Modified:** [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts), [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts), [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx).
    - **New:** [apps/web/src/components/TodoInput.tsx](../../apps/web/src/components/TodoInput.tsx), [apps/web/src/components/TodoInput.test.tsx](../../apps/web/src/components/TodoInput.test.tsx), [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx).
    - **Possibly:** `apps/web/package.json` and root `package-lock.json` IF `@testing-library/user-event` had to be installed.
  - [x] Commit message: `feat(web): create-todo full vertical slice via TodoInput (Story 2.5)`
  - [x] **Do NOT** stage anything in `_bmad-output/`, `node_modules/`, `.env*`, `apps/api/**`, `packages/shared/**`, or any other component file.
  - [x] Record commit hash in the Change Log when the user runs the commit.

### Review Findings

*Code review (2026-04-29, commit `73b60ca`). 0 decision-needed, 0 patch, 6 deferred, ~22 dismissed as noise.*

- [x] \[Review]\[Defer] Visibility refetch races optimistic POST → silent reconcile no-op (`apps/web/src/components/TodoApp.tsx:36-67`) — deferred, cross-epic interaction. If `loadSuccess` (visibility refetch) wholesale-replaces `state.todos` while a `createTodo` is in flight, the resolving `addReconcile` finds no `tempId` and no-ops; the just-created server row never enters the UI until the next GET. Resolution requires a reducer or load-flow architectural decision (Epic 3 territory — Stories 3.4/3.5).
- [x] \[Review]\[Defer] IME composition Enter submits partial CJK text (`apps/web/src/components/TodoInput.tsx:24-29`) — deferred, no story owns it. `<form onSubmit>` fires on Enter even when `event.nativeEvent.isComposing === true`, so a CJK candidate-confirmation Enter can submit the partial composition. Industry convention is to suppress submit while composing; flag for Story 3.x or a future a11y/UX hardening pass.
- [x] \[Review]\[Defer] `?? requestId` only handles null/undefined, not empty string (`apps/web/src/lib/api.ts:76`) — deferred, pre-existing pattern. If the server responds with an empty `x-request-id` header, `headers.get(...) ?? requestId` returns `''` instead of falling back to the client-generated id. Pattern is mirrored verbatim from `getTodos` (`apps/web/src/lib/api.ts:32`); fix belongs in a focused hardening pass that touches both call sites.
- [x] \[Review]\[Defer] Synthetic `ApiError` on JSON-parse rejection swallows the original `SyntaxError` cause (`apps/web/src/lib/api.ts:79-87`) — deferred, pre-existing pattern. Bare `catch {}` discards the original error (line/column info, abort errors, etc.) and replaces it with a generic message; no `cause` chaining. Mirrors `getTodos` (`apps/web/src/lib/api.ts:35-43`); same hardening pass.
- [x] \[Review]\[Defer] `neverResolves` test promise leaks past test boundary (`apps/web/src/components/TodoApp.test.tsx:139-147`) — deferred, test hygiene. The "hides until success" test stubs `fetch` with `new Promise(() => {})` and never aborts/resolves it; the dangling microtask survives `vi.unstubAllGlobals()`. Not a runtime defect but a flaky-test seed under `--threads`. Tighten by passing an `AbortController.signal` and aborting in `afterEach`, or by resolving with a never-flushed Response.
- [x] \[Review]\[Defer] AC #9 PARTIAL — no explicit three-rapid-submit test (`apps/web/src/components/TodoApp.test.tsx`) — deferred, structurally satisfied. AC #9 ("three rapid submits → three reconciled todos, distinct tempIds, no orphans") is provable from the reducer's index-replacement `addReconcile` (`apps/web/src/lib/reducer.ts:67-77`) plus per-call `crypto.randomUUID()` (`apps/web/src/components/TodoApp.tsx:58`); the property holds without an explicit test. An optional test would tighten coverage but is not a regression.

## Dev Notes

### Where this story sits

Story 2.5 is the second web-side story of Epic 2 (Todo Core Loop). It's the FIRST mutation-vertical-slice — Stories 2.6 (toggle) and 2.7 (delete) will mirror its three-layer shape (api wrapper → presentational component → TodoApp orchestration → tests). Stories 2.1–2.3 shipped the API surface (`POST`, `PATCH`, `DELETE`); Story 2.4 shipped the reducer's seven optimistic action handlers. Story 2.5 connects them via the user-facing form.

After this story:

- The user can type a todo and see it appear instantly in the list.
- The reducer's `addOptimistic` / `addReconcile` / `addFailed` actions are exercised end-to-end.
- `apps/web/src/lib/api.ts` exports `getTodos` and `createTodo`.
- `<TodoInput>` exists as a presentational form; `<TodoApp>` orchestrates the create flow.
- The web test count moves from 42 → ~62.

This story does NOT touch:

- The API (Stories 2.1–2.3 closed it).
- The reducer (Story 2.4 closed it).
- `<TodoItem>`'s rendering (Story 2.6 will extend it with Radix Checkbox; for now `pending: true` entries render identically to non-pending).
- Toast UI (Story 3.2).
- Input preservation on add failure (FR19 — Story 3.3).
- The unhandled-rejection safety net (NFR9 — Story 3.5).

### Critical architectural guardrails

1. **TodoApp is the only stateful component.** [architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631) — "TodoApp owns the reducer and all api.ts calls. … TodoInput, TodoList, TodoItem, Toast are presentational; they receive props and emit callbacks." `<TodoInput>` MUST NOT import from `@/lib/api` or `@/lib/reducer`. The dev agent's biggest temptation is to colocate the dispatch + fetch inside `<TodoInput>` because the AC text on epics.md is ambiguous about which component owns the side effects. Resolution: the architecture pinning wins. AC #3 makes this explicit and testable.
2. **Server is the validation authority.** [architecture.md:421-424](../../_bmad-output/planning-artifacts/architecture.md#L421-L424) — "Client: minimal. Rely on server validation as the authority. Client-side only prevents trivially bad UX (e.g., disabling submit on empty input). Do not duplicate max-length checks in the client." TodoInput's `disabled` on empty trim is allowed (UX); a `maxLength` attribute is NOT (duplicates server). Sending `text` raw (with whitespace) is correct because `CreateTodoRequestSchema` runs `.trim()` ([contracts.ts:3](../../packages/shared/src/contracts.ts#L3)).
3. **All client-server traffic goes through `apps/web/src/lib/api.ts`.** [architecture.md:382](../../_bmad-output/planning-artifacts/architecture.md#L382) — "All requests go through apps/web/src/lib/api.ts. Components never call raw fetch." TodoApp's `handleAdd` calls `createTodo(text)`, NOT a raw `fetch`.
4. **Every outgoing request carries `x-request-id`.** [architecture.md:383](../../_bmad-output/planning-artifacts/architecture.md#L383) — "client UUID per request; server echoes it back for correlation." Mirror the `getTodos` pattern.
5. **Output escaping via React JSX.** [architecture.md:215-216](../../_bmad-output/planning-artifacts/architecture.md#L215-L216) and [architecture.md:435](../../_bmad-output/planning-artifacts/architecture.md#L435) — "XSS prevention: relies on React's default JSX escaping. … `dangerouslySetInnerHTML` is prohibited." `<TodoItem>`'s existing `{todo.text}` rendering is the only escape boundary. Don't introduce HTML-rendering code paths.
6. **No idempotency keys.** [architecture.md:60-61](../../_bmad-output/planning-artifacts/architecture.md#L60-L61) and the architecture's anti-pattern list — repeated submits insert distinct rows. The `tempId` is a CLIENT-SIDE handle for optimistic reconciliation, NOT a server-side de-dup key. The server has no notion of `tempId`; it always assigns a fresh `id` on `INSERT`.
7. **The optimistic reducer's no-op semantics carry over.** Story 2.4 AC #11 makes optimistic actions no-ops on `state.status !== 'success'`. Story 2.5 AC #6 enforces the symmetric guard in the UI: `<TodoInput>` is only rendered when status is `success`. Belt and suspenders — UI doesn't show it, reducer ignores it if it sneaks through.
8. **No retry loops.** [architecture.md:417-418](../../_bmad-output/planning-artifacts/architecture.md#L417-L418) — "No automatic retries in v1. On failure the UI surfaces a toast; the user retries by repeating the action (input is preserved per FR19)." For Epic 2, repeat-by-typing is the user's recourse. FR19 / Story 3.3 will preserve text across the rejection.
9. **Bundle budget.** [architecture.md:266](../../_bmad-output/planning-artifacts/architecture.md#L266) — ≤200 KB gzipped initial JS. `@testing-library/user-event` is a devDep (not shipped). The new `<TodoInput>` adds ~30 lines of TSX; impact is sub-1KB after minify+gzip.

### Why presentational `<TodoInput>` (vs. self-contained smart component)

The epic AC text reads "the component generates a temp UUID via crypto.randomUUID() … dispatches addOptimistic … calls api.createTodo" — which sounds like all of that lives in `<TodoInput>`. But the **architecture pins** ([architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631)) and the data-flow narrative ([architecture.md:717-729](../../_bmad-output/planning-artifacts/architecture.md#L717-L729)) make it clear: `<TodoApp>` owns the reducer, the `api.ts` calls, and the side effects; `<TodoInput>` owns only the local form state and emits a callback. Resolution applied in this story:

- `<TodoInput>` owns: input value, submit-disabled-on-empty, focus management, label association, no client trim, the `<form onSubmit>` wiring.
- `<TodoApp>` owns: `crypto.randomUUID()` for tempId, `new Date().toISOString()` for createdAt, dispatch of `addOptimistic` / `addReconcile` / `addFailed`, the `api.createTodo` call.

This split makes `<TodoInput>` trivially testable (no fetch mock needed, no env stub needed, just `vi.fn()` for `onAdd`). It also makes the rejection path testable in isolation at the `<TodoApp>` level via `vi.stubGlobal('fetch', ...)`.

### Why `<TodoInput>` does NOT preserve input on failure

FR19 ("User's in-progress input is preserved through mutation failures") is **explicitly Story 3.3** — see [epics.md:1107-1144](../../_bmad-output/planning-artifacts/epics.md#L1107-L1144). Implementing it here would either:
- Couple `<TodoInput>` to a `reducer`-state-derived "lastFailedText" prop (forcing premature design), or
- Force `<TodoApp>` to push text back via a controlled-from-parent prop (breaks the local-input-state simplicity).

Story 3.3 will revisit. Don't pre-empt.

### Why `<TodoInput>` is hidden until `state.status === 'success'`

Three reasons:

1. **Story 2.4 AC #11**: optimistic actions are no-ops on non-success state. Showing the input but having every dispatch silently swallowed is a debugging puzzle.
2. **Loading-state UX**: while the initial GET is in flight, the user has nothing to "add to" yet. A spinner-with-input is uncomfortable.
3. **Error-state UX**: when the initial load fails, retry (Story 3.4 / FR20) is the right user action, not "type a new todo into the void."

When `state.status === 'error'`, the user sees the placeholder error message from `<TodoList>` (Story 1.9's Epic-1 placeholder); Story 3.4 will replace this with a retry button. Until then, the input stays hidden on error — which is the correct behavior.

### Why no AbortSignal on the create flow

The initial-load `useEffect` uses `AbortController` because:
- It owns a long-lived listener (`visibilitychange`).
- Unmount during in-flight load needs to cancel the listener AND any pending fetch.

The create flow is one-shot:
- The user clicks/Enters → optimistic entry appears → fetch resolves → reconcile.
- If the user navigates away (route change in a future routed app, or browser-tab close), there's no in-flight resource that NEEDS aborting:
  - The optimistic entry is gone (component unmount).
  - `dispatch` against an unmounted component is a React 18+ silent no-op.
  - The `fetch` either completes or doesn't — the server doesn't care.
- Adding `AbortController` would orphan the optimistic entry on unmount (signal aborts fetch → fetch rejects → addFailed dispatches against dead component → silent no-op → no rollback visible because there's nothing left to render). Net effect: pointless.

Stories 2.6/2.7 will make the same call.

### Why `addOptimistic` payload is `{ tempId, text, createdAt }` (and not a sub-object containing the whole entry)

Story 2.4 explicitly shaped the payload this way ([2-4 AC #1](./2-4-reducer-extensions-for-optimistic-mutations.md#L18)). The reducer constructs the `TodoEntry` internally, applying the `pending: true` flag itself. The caller's job is to provide the entropy:
- `tempId`: client-generated UUID.
- `text`: user's input verbatim.
- `createdAt`: client clock ISO string.

The architecture's data-flow narrative ([architecture.md:719](../../_bmad-output/planning-artifacts/architecture.md#L719)) shows this exact pattern. The dev agent should resist the urge to pass `{ todo: <full entry> }` — that's the `addReconcile` shape, not `addOptimistic`.

### Why `createdAt` is a client-clock ISO string (and the server overrides it on reconcile)

The optimistic entry's `createdAt` is a placeholder used only for ordering during the in-flight window. Once the server returns its authoritative `createdAt`, `addReconcile` replaces the entry, and the server value wins. This is intentional:

- The list is currently rendered in array-order (no client-side sort by `createdAt` in [TodoList.tsx:68-71](../../apps/web/src/components/TodoList.tsx#L68-L71) — items are mapped in `state.todos` order, which is server-load order).
- `addOptimistic` appends to the end ([reducer.ts:64](../../apps/web/src/lib/reducer.ts#L64)) — so the optimistic entry visually shows up at the bottom regardless of the placeholder timestamp.
- After reconcile, the server's `createdAt` is in the entry, but the entry's POSITION in `state.todos` is preserved (per Story 2.4 AC #3).

Net: the optimistic `createdAt` is essentially decorative until reconcile. Setting it to `new Date().toISOString()` keeps the shape valid for the `TodoEntry` type without lying about the value's authority.

### What the `<TodoInput>` looks like in HTML (for DOM-test reference)

```html
<form data-testid="todo-input" class="flex gap-2">
  <label for=":r1:" class="sr-only">Add a todo</label>
  <input
    id=":r1:"
    data-testid="todo-input-field"
    type="text"
    value=""
    placeholder="What needs to be done?"
    autocomplete="off"
    class="flex-1 rounded-md border border-current/10 px-3 py-2 …"
  />
  <button
    type="submit"
    data-testid="todo-input-submit"
    disabled
    class="rounded-md border border-current/10 px-4 py-2 …"
  >
    Add
  </button>
</form>
```

The `id=":r1:"` is React's `useId()` output — opaque, stable per render tree. Tests should use `getByLabelText` (matches via the label-input association) rather than asserting on the exact id string.

### Why no `aria-busy` / `aria-disabled` on the submit during in-flight create

The in-flight window between optimistic dispatch and reconcile is microtask-short under normal conditions (≤100 ms perceived per NFR1; actual API latency is ≤300 ms p95 per NFR2). Showing a busy state would create UI flicker. Stories 2.6/2.7 may add a busy state to the per-row controls because those have a `pending: true` flag to drive off, but the form itself doesn't have a "submitting" notion in v1.

The `disabled` on the submit button comes ENTIRELY from the trimmed-empty check. It does NOT track in-flight state. A user can submit "a", "b", "c" in rapid succession — that's three concurrent in-flight POSTs, and all three optimistic entries should appear immediately.

### What changes in the codebase

| File | Change | LOC delta (approx.) |
|------|--------|---------------------|
| [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) | Add `createTodo(text, signal?)` mirroring `getTodos`'s pattern | +40 / -0 |
| [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) | Append `describe('createTodo()', ...)` block (~6 new tests) | +110 / -0 |
| [apps/web/src/components/TodoInput.tsx](../../apps/web/src/components/TodoInput.tsx) (NEW) | Presentational form with controlled input, submit-disabled-on-empty, focus-after-submit | +50 |
| [apps/web/src/components/TodoInput.test.tsx](../../apps/web/src/components/TodoInput.test.tsx) (NEW) | 12 RTL tests (label, disabled, type-and-submit, verbatim, focus-retention, no-onAdd-on-empty, XSS, no-maxLength) | +130 |
| [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) | Import `createTodo` + `TodoInput`; add `handleAdd` callback; add `<TodoInput>` to JSX gated on success | +20 / -1 |
| [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx) (NEW) | 4 journey tests (happy + rollback + XSS + input-hidden-until-success) | +120 |
| (possibly) [apps/web/package.json](../../apps/web/package.json) | Add `@testing-library/user-event` to devDeps if not transitively resolvable | +1 |

Total: ~+470 added LOC across 6 files (3 new, 3 modified). One possible new devDep.

### Out-of-scope (do NOT do in this story)

- `apps/web/src/lib/api.ts` `updateTodo`/`deleteTodo` — Stories 2.6/2.7.
- Modifying `<TodoItem>` to render `pending: true` differently — Stories 2.6/2.7 will gate mutation controls (`Checkbox`, delete button) on `pending`.
- Toast UI — Story 3.2.
- FR19 input preservation (rehydrate `<TodoInput>` value from a failed-text reducer slice) — Story 3.3.
- FR20 retry on initial-load error — Story 3.4.
- NFR9 unhandled-rejection safety net — Story 3.5.
- `errorDismiss` action — Story 3.1 ([epics.md:1020-1062](../../_bmad-output/planning-artifacts/epics.md#L1020-L1062)).
- Disabling the submit button during in-flight create — never (per NFR1, optimistic UI applies; multiple concurrent creates are fine).
- Server-side idempotency keys — never (architecture decision: distinct rows per repeat).
- Client-side text trim or maxLength — never (Architecture §Validation Timing).
- `dangerouslySetInnerHTML` — banned (NFR17 + architecture rule).

### Project Structure Notes

The change is scoped to `apps/web/`:

```text
apps/web/
└── src/
    ├── components/
    │   ├── TodoApp.tsx          # ← extended: import createTodo + TodoInput; add handleAdd; add <TodoInput> to JSX
    │   ├── TodoApp.test.tsx     # ← NEW: journey tests for create
    │   ├── TodoInput.tsx        # ← NEW: presentational form
    │   ├── TodoInput.test.tsx   # ← NEW: component-level tests
    │   ├── TodoItem.tsx         # (unchanged)
    │   ├── TodoItem.test.tsx    # (unchanged)
    │   ├── TodoList.tsx         # (unchanged)
    │   └── TodoList.test.tsx    # (unchanged)
    └── lib/
        ├── api.ts               # ← extended: add createTodo
        ├── api.test.ts          # ← extended: add createTodo describe block
        ├── errors.ts            # (unchanged)
        ├── reducer.ts           # (unchanged from Story 2.4)
        └── reducer.test.ts      # (unchanged from Story 2.4)
```

The architecture's "non-component files: camelCase.ts" / "React component files: PascalCase.tsx" naming ([architecture.md:338-339](../../_bmad-output/planning-artifacts/architecture.md#L338-L339)) is satisfied (`TodoInput.tsx`, `TodoApp.test.tsx`).

The architecture's "Co-located unit tests: `*.test.tsx` next to the file under test. No `__tests__/` directories" ([architecture.md:351](../../_bmad-output/planning-artifacts/architecture.md#L351)) is satisfied — `TodoInput.test.tsx` and `TodoApp.test.tsx` sit in `components/`.

### Testing Requirements

- **Unit / component tests:** mandatory across three files:
  - `apps/web/src/lib/api.test.ts` — `createTodo` coverage (~6 tests).
  - `apps/web/src/components/TodoInput.test.tsx` — presentational behavior (~12 tests).
  - `apps/web/src/components/TodoApp.test.tsx` — journey-level happy/rollback/XSS/gating (~4 tests).
- **Integration tests:** none in this story (no API changes).
- **E2E tests:** none in this story (Epic 3 ships `journey-level resilience tests` per [epics.md:1222-1287](../../_bmad-output/planning-artifacts/epics.md#L1222-L1287)).
- **Test runner:** Vitest with jsdom (already configured at [vitest.config.mts](../../apps/web/vitest.config.mts)).
- **User-event library:** `@testing-library/user-event` (verify it's resolvable; install if not — see Task 7).
- **Coverage gate:** none in v1.
- **Test isolation:** each test sets up its own fetch mock and dispatches its own actions. No shared state. The `vi.stubEnv` + `vi.resetModules()` lifecycle from `api.test.ts` is inherited by `TodoApp.test.tsx`.

### Library / version pins (April 2026)

These are already installed and pinned by Story 1.7 / 1.8 / 1.9 / 2.4; do NOT bump them:

- `react@19.2.4`, `react-dom@19.2.4`
- `next@16.2.4` (CSR-only via `'use client'`)
- `vitest@^2.1.0`, `@testing-library/react@^16.3.0`, `@testing-library/jest-dom@^6.9.0`, `jsdom@^29.0.0`
- `@todo-app/shared` (workspace dep) — `Todo`, `TodoSchema`, `CreateTodoRequestSchema` types
- `typescript@^5`
- ESLint flat config at root with `eslint-config-next` and `import/no-restricted-paths` cross-app ban (no impact on this story).

NEW dep (devDep, possibly already transitively present):

- `@testing-library/user-event` — runtime-resolved during test runs. If `node -e "require.resolve('@testing-library/user-event')"` from `apps/web/` succeeds, no install needed. If not, `npm install --save-dev --workspace apps/web @testing-library/user-event`.

### Story 2.4 + 1.8 + 1.9 patterns to mirror (verbatim, where applicable)

The following established patterns are the canonical templates for this story:

- **`api.ts` fetch wrapper shape** — Story 1.8 established: explicit env-presence check at module load, named export, `(text, signal?)` signature, header set including `x-request-id`, `if (!response.ok) throw await ApiError.fromResponse(response)`, then capture `responseRequestId`, then JSON parse with try/catch synthetic error, then schema parse with safeParse synthetic error, then return parsed data. Mirror this 1:1.
- **`api.test.ts` mock-fetch lifecycle** — `vi.stubEnv` + `vi.resetModules()` in `beforeEach`; `vi.restoreAllMocks()` + `vi.unstubAllEnvs()` + `vi.unstubAllGlobals()` in `afterEach`; `mockFetchOnce` helper; `await import('./api')` inside each test. Mirror.
- **Component test file shape** — `consoleErrorSpy` + `consoleWarnSpy` in `beforeEach`/`afterEach` (from [TodoList.test.tsx:21-32](../../apps/web/src/components/TodoList.test.tsx#L21-L32)). Mirror in `TodoInput.test.tsx`. **Do NOT** mirror in `TodoApp.test.tsx` — see Task 6 watch-out.
- **Optimistic action dispatch shape** — `dispatch({ type: 'addOptimistic', payload: { tempId, text, createdAt } })`. Story 2.4 pinned the payload shapes; do not deviate.
- **Discriminated union with `payload` envelope** — every action carries `payload: { ... }`. Mirror.
- **No `console.*` in production code** — the architecture pins this for the API ([architecture.md:431](../../_bmad-output/planning-artifacts/architecture.md#L431)). The same hygiene applies to web code: rejection handlers swallow without logging in Epic 2.

Story 2.4 review yielded two deferred items (loadStart-clobbering-pending → Epic 3.4; frozen-input mutation guard → future test-infra). Neither applies to Story 2.5.

### References

- **Architecture:**
  - State management: [architecture.md:178](../../_bmad-output/planning-artifacts/architecture.md#L178), [architecture.md:248](../../_bmad-output/planning-artifacts/architecture.md#L248).
  - Frontend Architecture: [architecture.md:245-267](../../_bmad-output/planning-artifacts/architecture.md#L245-L267).
  - Component organization (TodoApp = stateful, others presentational): [architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631).
  - Validation timing (server is the authority): [architecture.md:421-424](../../_bmad-output/planning-artifacts/architecture.md#L421-L424).
  - All requests through `api.ts`: [architecture.md:382-383](../../_bmad-output/planning-artifacts/architecture.md#L382-L383).
  - Format patterns (single-resource bare entity): [architecture.md:365-367](../../_bmad-output/planning-artifacts/architecture.md#L365-L367).
  - XSS prevention (React JSX escaping): [architecture.md:215-216](../../_bmad-output/planning-artifacts/architecture.md#L215-L216), [architecture.md:435](../../_bmad-output/planning-artifacts/architecture.md#L435).
  - No `dangerouslySetInnerHTML`: [architecture.md:435](../../_bmad-output/planning-artifacts/architecture.md#L435).
  - Anti-patterns (raw `fetch`, client max-length duplication): [architecture.md:475-490](../../_bmad-output/planning-artifacts/architecture.md#L475-L490).
  - Data-flow narrative for "add a todo": [architecture.md:717-729](../../_bmad-output/planning-artifacts/architecture.md#L717-L729).
  - Bundle budget: [architecture.md:266](../../_bmad-output/planning-artifacts/architecture.md#L266).
  - No retries: [architecture.md:417-418](../../_bmad-output/planning-artifacts/architecture.md#L417-L418).
- **PRD:**
  - FR1 (add todo): [prd.md:278](../../_bmad-output/planning-artifacts/prd.md#L278).
  - FR17 (immediate visual feedback): [prd.md:303](../../_bmad-output/planning-artifacts/prd.md#L303).
  - FR19 (input preservation — out of scope here, owned by Story 3.3): [prd.md:305](../../_bmad-output/planning-artifacts/prd.md#L305).
  - NFR1 (≤100 ms perceived): [prd.md:331](../../_bmad-output/planning-artifacts/prd.md#L331).
  - NFR10–NFR14 (a11y): [prd.md:346-350](../../_bmad-output/planning-artifacts/prd.md#L346-L350).
  - NFR17 (output escaping): [prd.md:356](../../_bmad-output/planning-artifacts/prd.md#L356).
  - NFR18 (input bounds — server side): [prd.md:357](../../_bmad-output/planning-artifacts/prd.md#L357).
- **Epics:**
  - Story 2.5 full text: [epics.md:876-919](../../_bmad-output/planning-artifacts/epics.md#L876-L919).
  - Story 2.4 (predecessor — reducer actions): [epics.md:824-874](../../_bmad-output/planning-artifacts/epics.md#L824-L874).
  - Story 2.6 (successor — toggle): [epics.md:921-965](../../_bmad-output/planning-artifacts/epics.md#L921-L965).
  - Story 2.7 (successor — delete): [epics.md:967-1014](../../_bmad-output/planning-artifacts/epics.md#L967-L1014).
  - Story 3.2 (Toast for failures, owns user-facing error message): [epics.md:1064-1106](../../_bmad-output/planning-artifacts/epics.md#L1064-L1106).
  - Story 3.3 (FR19 input preservation): [epics.md:1107-1144](../../_bmad-output/planning-artifacts/epics.md#L1107-L1144).
- **Prior stories (patterns to mirror):**
  - Story 1.8 (api.ts + load reducer + ApiError): [_bmad-output/implementation-artifacts/1-8-typed-api-client-error-types-and-load-reducer.md](./1-8-typed-api-client-error-types-and-load-reducer.md). Sets the api.ts wrapper shape and api.test.ts lifecycle.
  - Story 1.9 (TodoList rendering states): [_bmad-output/implementation-artifacts/1-9-render-list-states-loading-empty-populated-read-only.md](./1-9-render-list-states-loading-empty-populated-read-only.md). Sets the component-test file shape.
  - Story 2.1 (POST /todos endpoint): [_bmad-output/implementation-artifacts/2-1-post-todos-endpoint.md](./2-1-post-todos-endpoint.md). Server-side authority for POST shape, validation, error envelopes.
  - Story 2.4 (reducer optimistic actions): [_bmad-output/implementation-artifacts/2-4-reducer-extensions-for-optimistic-mutations.md](./2-4-reducer-extensions-for-optimistic-mutations.md). All seven action shapes; pure-function semantics; the `addOptimistic` / `addReconcile` / `addFailed` triad consumed by this story.
- **Source files (current state):**
  - [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) — extend with `createTodo`.
  - [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) — extend with `createTodo` describe block.
  - [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts) — DO NOT modify; provides `addOptimistic`/`addReconcile`/`addFailed` actions consumed by `TodoApp.handleAdd`.
  - [apps/web/src/lib/errors.ts](../../apps/web/src/lib/errors.ts) — DO NOT modify; `ApiError` is consumed by `createTodo` via `ApiError.fromResponse`.
  - [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) — extend with `handleAdd` + `<TodoInput>` rendering.
  - [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx) — DO NOT modify; renders `state.todos` including any optimistic entries unchanged (the `pending: true` flag is opt-in per Story 2.4).
  - [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx) — DO NOT modify; renders the optimistic entry's text via React's default JSX escaping ([TodoItem.tsx:33](../../apps/web/src/components/TodoItem.tsx#L33)).
  - [packages/shared/src/contracts.ts](../../packages/shared/src/contracts.ts) — DO NOT modify; `TodoSchema` and `CreateTodoRequestSchema` are the contract.
- **Web-app conventions (Next 16 / Tailwind v4 quirks):**
  - [apps/web/AGENTS.md](../../apps/web/AGENTS.md) — Tailwind v4 `border-current/10` browser baseline (Chrome 111+ / Safari 16.4+ / Firefox 113+); `@/*` alias resolution caveats for non-TS files (irrelevant here, but noted).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- `npx vitest run src/lib/api.test.ts` → 9/9 pass (3 getTodos pre-existing + 6 new createTodo).
- `npx vitest run src/components/TodoInput.test.tsx` → 14/14 pass.
- `npx vitest run src/components/TodoApp.test.tsx` → 4/4 pass (after switching the rollback test from a synchronously-rejected POST to a deferred-promise pattern so the optimistic state is observable before rollback fires).
- Repo-root sanity gates: `npm run lint` 0 warn / 0 err; `npm run typecheck` clean across shared/api/web; `npm run test` → shared 25/25, api unit 4/4, web 66/66 (web jumped 42 → 66, exceeds AC #16's ~62 target).

### Completion Notes List

- AC #1 satisfied: `createTodo(text, signal?)` mirrors `getTodos` line-for-line — POST, `application/json` headers + `x-request-id`, `JSON.stringify({ text })` body (no client trim), `TodoSchema.safeParse`, synthetic `ApiError` for malformed-JSON / contract-drift, `ApiError.fromResponse` for non-OK envelopes.
- AC #2/#3/#4/#5 satisfied: `<TodoInput>` is presentational (no `@/lib/*` imports, no `crypto`/`Date`/`fetch`), single prop `onAdd`, controlled `useState` input, `useId` label association, `useRef` focus retention, no `maxLength`, `disabled` on trimmed-empty, defensive submit guard, value passed verbatim.
- AC #6/#7/#15 satisfied: `<TodoApp>` renders `<TodoInput>` only when `state.status === 'success'`; `handleAdd` (memoized via `useCallback([])`) generates `tempId` + `createdAt`, dispatches `addOptimistic`, calls `createTodo(text)`, then dispatches `addReconcile` on success or `addFailed` on rejection. Existing initial-load `useEffect` is unchanged.
- AC #8/#9/#10/#11 satisfied: optimistic entries render through `<TodoList>`/`<TodoItem>` unchanged; the journey test pins the reconcile-as-replace (1 item after happy path) and the rollback (entry removed on POST 500); React's JSX escaping is the XSS boundary (literal `<script>...` text rendered, no `<script>` element injected).
- AC #12/#13/#14 satisfied: `api.test.ts` extended with 6 createTodo tests (verbatim-text POST, whitespace-preserved, non-OK envelope, missing `x-request-id`, schema drift → synthetic ApiError, malformed-JSON → synthetic ApiError); `TodoInput.test.tsx` covers 14 presentational behaviors with strict `consoleErrorSpy`/`consoleWarnSpy` assertions; `TodoApp.test.tsx` covers 4 journey paths (happy, rollback via deferred POST, XSS-as-text, input-hidden-until-success).
- AC #16 satisfied: `npm run lint` / `typecheck` / `test` from repo root all green; web tests 42 → 66.
- 1 deviation from the story's verbatim journey-test scaffolding: the rollback test uses a `Promise<Response>` whose `resolve` is captured and called AFTER the optimistic `findByTestId('todo-list')` assertion, instead of `mockResolvedValueOnce(...500 response)`. Reason: with a synchronously-resolved POST mock, the `addFailed` microtask flushes before the test's first DOM poll, so the optimistic entry is unobservable. The deferred-promise pattern keeps the assertion semantics unchanged while making the transient state visible. The journey still exercises the same code path (POST resolves with a 500 envelope → `ApiError.fromResponse` → `addFailed` → rollback).
- 1 dep added: `@testing-library/user-event@^14.6.1` to `apps/web/devDependencies` (was not transitively present per the spec's verification step). Confirmed via `node -e "require.resolve(...)"` post-install.
- 1 minor scope addition vs. spec's "~12 tests" target for `TodoInput.test.tsx`: 14 tests (added "submit re-disables after clear" pinning AC #4's `disabled` transition explicitly, and "exactly one form/input/button" pinning AC #2's structural contract). Both are AC-traceable additions, not new behavior.

### File List

- **Modified:** [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) — added `createTodo` and `TodoSchema` import.
- **Modified:** [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) — appended `describe('createTodo()', ...)` block (6 tests).
- **Modified:** [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) — added `useCallback` + `createTodo` + `TodoInput` imports, `handleAdd` memoized callback, `<TodoInput>` rendered above `<TodoList>` gated on `state.status === 'success'`.
- **New:** [apps/web/src/components/TodoInput.tsx](../../apps/web/src/components/TodoInput.tsx) — presentational form with controlled input, focus-after-submit, no `maxLength`.
- **New:** [apps/web/src/components/TodoInput.test.tsx](../../apps/web/src/components/TodoInput.test.tsx) — 14 RTL tests with strict console-error/warn guards.
- **New:** [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx) — 4 journey-level tests (happy / rollback-via-deferred-promise / XSS-as-text / input-hidden-until-success).
- **Modified:** [apps/web/package.json](../../apps/web/package.json) — added `@testing-library/user-event@^14.6.1` to devDependencies.
- **Modified:** package-lock.json — refreshed for new devDep.

## Change Log

| Date       | Change                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-04-29 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Story slot: Epic 2, Story 5 (first user-facing mutation slice; create-todo via TodoInput; consumes Story 2.4's `addOptimistic`/`addReconcile`/`addFailed`; precedes 2.6 toggle and 2.7 delete). |
| 2026-04-29 | Dev-Story implementation: `createTodo` API client + presentational `<TodoInput>` + `<TodoApp>` orchestration. Lint / typecheck / test 95/95 unit green at repo root (web 42 → 66; +6 createTodo, +14 TodoInput, +4 TodoApp). 1 dep added (`@testing-library/user-event`). 1 minor scaffolding deviation in rollback test (deferred-promise pattern to keep optimistic state observable). Status: ready-for-dev → in-progress → review. Source commit: `73b60ca`. |
