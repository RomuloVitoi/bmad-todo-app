# Story 2.6: Toggle completion via Radix Checkbox

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to click a checkbox next to any todo to mark it completed (or un-complete it), with unambiguous visual and assistive-tech state,
So that I can update the shared list's progress instantly (FR2, FR3, FR9, FR32, NFR12).

## Acceptance Criteria

1. **Given** [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts),
   **When** `updateTodo(id: string, completed: boolean, signal?: AbortSignal): Promise<Todo>` is invoked,
   **Then** it issues `PATCH ${process.env.NEXT_PUBLIC_API_URL}/todos/${id}` with method `PATCH`,
   **And** sets headers `accept: application/json`, `content-type: application/json`, and a freshly generated `x-request-id` (`crypto.randomUUID()`) per call,
   **And** the body is exactly `JSON.stringify({ completed })` — boolean only, no other fields (server's `UpdateTodoRequestSchema` is `.strict()` per [contracts.ts:20-24](../../packages/shared/src/contracts.ts#L20-L24)),
   **And** on `200` the response body is parsed via `TodoSchema.safeParse` (mirrors `createTodo` at [api.ts:89-96](../../apps/web/src/lib/api.ts#L89-L96)) and the parsed `Todo` is returned,
   **And** on a non-OK response (`!response.ok`) it throws `await ApiError.fromResponse(response)`,
   **And** on a malformed-JSON success body it throws a synthetic `ApiError` with `message: 'Malformed JSON in successful response'` (mirrors [api.ts:79-87](../../apps/web/src/lib/api.ts#L79-L87)),
   **And** on a 200 body that fails `TodoSchema.safeParse` it throws a synthetic `ApiError` with `message: 'Response did not match the expected todo schema'` (mirrors [api.ts:89-96](../../apps/web/src/lib/api.ts#L89-L96)).

2. **Given** [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx) — extended (NOT replaced) to host a Radix UI `Checkbox` primitive,
   **When** rendered for a `TodoEntry` (Story 2.4's `Todo & { pending?: boolean }` type from [reducer.ts:8](../../apps/web/src/lib/reducer.ts#L8)),
   **Then** the row contains a `Checkbox.Root` from `@radix-ui/react-checkbox` whose `checked` prop is bound to `todo.completed`,
   **And** the `Checkbox.Root` renders Radix's default `role="checkbox"` and `aria-checked` semantics natively (no hand-rolled ARIA — Radix supplies them),
   **And** the existing `data-completed` attribute on `<li>` is preserved (DOM-test-friendly probe; Story 1.9 + 2.5 tests grep on it),
   **And** the existing `aria-checked` on `<li role="listitem">` plus the `eslint-disable-next-line jsx-a11y/role-supports-aria-props` comment are REMOVED (the Radix root now owns that ARIA contract — keeping a duplicate `aria-checked` on the list item produces an invalid duplicate attribute and `role="listitem"` does not support `aria-checked`).

3. **Given** the rendered `Checkbox.Root`,
   **When** inspected for accessibility,
   **Then** it is associated with a label containing the todo text via `aria-labelledby` pointing to a `<span id>` that wraps the todo text (NFR10/NFR11),
   **And** the focusable element renders a visible focus indicator on `:focus-visible` (`focus-visible:ring-2 focus-visible:ring-current/40` Tailwind classes — mirrors `<TodoInput>`'s focus ring at [TodoInput.tsx:42-48](../../apps/web/src/components/TodoInput.tsx#L42-L48)),
   **And** the entire interactive control (checkbox + tap target) measures at least 44 × 44 CSS pixels (NFR14 — enforce via Tailwind `min-h-11 min-w-11` or `h-11 w-11` on the `Checkbox.Root` element),
   **And** the checkbox is keyboard-operable: `Tab` moves focus to it; `Space` toggles its checked state; `Enter` does NOT toggle (Radix's documented behavior — Space only).

4. **Given** `<TodoItem>` renders a todo with `completed: false`,
   **When** the DOM is inspected,
   **Then** the `Checkbox.Root` reports `aria-checked="false"` (Radix-generated),
   **And** the todo text renders WITHOUT strikethrough (no `line-through` class),
   **And** the existing `data-completed="false"` attribute is on the `<li>`.

5. **Given** `<TodoItem>` renders a todo with `completed: true`,
   **When** the DOM is inspected,
   **Then** the `Checkbox.Root` reports `aria-checked="true"` (Radix-generated),
   **And** the todo text renders WITH `line-through` and the existing reduced-opacity class (`opacity-60`) — completion state is communicated via BOTH the ARIA attribute AND the strikethrough (FR32 / NFR12 — non-color signal),
   **And** the `Checkbox.Indicator` renders a visible check glyph (e.g., a Unicode "✓" or an inline SVG check) inside the box when `checked === true`,
   **And** the existing `data-completed="true"` attribute is on the `<li>`.

6. **Given** `<TodoItem>` accepts a NEW prop `onToggle: (id: string, nextCompleted: boolean) => void`,
   **When** its prop interface is inspected,
   **Then** `TodoItemProps` is extended to `{ todo: TodoEntry; onToggle: (id: string, nextCompleted: boolean) => void }` (typed against the reducer's `TodoEntry`, NOT the wire-shape `Todo`, so `pending` is visible),
   **And** the component does NOT import `@/lib/api`, `@/lib/reducer`, or `@/lib/errors` (presentational-component contract per [architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631)),
   **And** the component does NOT call `crypto.randomUUID()`, `new Date()`, or `fetch` directly.

7. **Given** a user clicks the checkbox (or focuses it and presses `Space`),
   **When** Radix's `onCheckedChange(checked: boolean | 'indeterminate')` handler fires,
   **Then** the component coerces `checked` to a strict boolean via `checked === true` (Radix can theoretically emit `'indeterminate'`; the indeterminate state is unused in v1),
   **And** calls `onToggle(todo.id, nextCompleted)` exactly once,
   **And** the click does NOT also trigger any handler on the `<li>` or the text `<span>` (event-bubbling is acceptable; no bubbling-driven side effects exist on ancestors in this story).

8. **Given** a `TodoEntry` with `pending: true` (an optimistic create from Story 2.5 awaiting reconcile),
   **When** `<TodoItem>` renders it,
   **Then** the `Checkbox.Root` is `disabled` (cannot PATCH against a temp UUID — the server has no row for it),
   **And** Radix renders the visual disabled state (`data-disabled` attribute is added by Radix; the Tailwind class set includes `disabled:opacity-50 disabled:cursor-not-allowed`),
   **And** clicking or pressing Space on the disabled checkbox does NOT call `onToggle`,
   **And** the row's text styling is unaffected by `pending` (no spinner, no opacity change on the text itself — that visual is reserved for a future polish pass).

9. **Given** [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx),
   **When** the diff is inspected,
   **Then** a new memoized `handleToggle = useCallback((id, nextCompleted) => { ... }, [state.todos])` is defined that:
   - finds the target todo in `state.todos` by `id` (used to capture `previousCompleted` BEFORE dispatch),
   - early-returns if the target is not found OR if `target.pending === true` (defense-in-depth — `<TodoItem>` already disables, but a stale ref from optimistic interleaving must not leak through),
   - dispatches `{ type: 'toggleOptimistic', payload: { id, completed: nextCompleted } }`,
   - calls `api.updateTodo(id, nextCompleted)`,
   - on resolved server `Todo`, dispatches `{ type: 'addReconcile', payload: { tempId: id, todo: serverTodo } }` (REUSES `addReconcile` to swap-in the server's authoritative entry — see Dev Notes "Why `addReconcile` for toggle"),
   - on rejection, dispatches `{ type: 'toggleFailed', payload: { id, previousCompleted } }` where `previousCompleted` is the value captured BEFORE optimistic dispatch (per Story 2.4 AC #6 — see [reducer.ts:99-109](../../apps/web/src/lib/reducer.ts#L99-L109) and [2-4 AC #6](./2-4-reducer-extensions-for-optimistic-mutations.md#L48-L50)),
   **And** the `<TodoList state={state} onToggle={handleToggle} />` JSX passes `handleToggle` through `<TodoList>` to each `<TodoItem>` (see AC #10).

10. **Given** [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx),
    **When** its prop interface is extended,
    **Then** `TodoListProps` becomes `{ state: TodoState; onToggle: (id: string, nextCompleted: boolean) => void }`,
    **And** the populated branch passes `onToggle={onToggle}` to each `<TodoItem>` (other branches — loading, empty, error — are unchanged because no items are rendered),
    **And** the existing `data-testid` set is preserved verbatim (`todo-list`, `todo-list-empty`, `todo-list-loading`, `todo-list-error`, `todo-item`).

11. **Given** [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx) — existing tests,
    **When** the suite is updated,
    **Then** every `render(<TodoList state={...} />)` call now passes `onToggle={vi.fn()}` (otherwise TypeScript fails),
    **And** no behavioral assertion changes: loading/empty/error/populated branches and `<li>` count assertions remain identical.

12. **Given** [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx) — existing tests,
    **When** the suite is updated,
    **Then** every `render(<TodoItem todo={...} />)` call now passes `onToggle={vi.fn()}`,
    **And** the existing assertions on `data-completed`, `text` rendering, XSS-as-text, and `break-words` are preserved,
    **And** the existing assertion "exposes NO interactive affordances (no buttons, no inputs, no `role='button'`)" at [TodoItem.test.tsx:58-63](../../apps/web/src/components/TodoItem.test.tsx#L58-L63) is REPLACED with: `expect(screen.getByRole('checkbox')).toBeInTheDocument()` (the row now legitimately exposes a checkbox role, supplied by Radix; the prior assertion was an Epic-1 placeholder per [deferred-work.md:105](./deferred-work.md#L105)).

13. **Given** [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx) — extended with toggle-specific cases,
    **When** Vitest + RTL runs,
    **Then** the suite covers:
    - render: `aria-checked` mirrors `todo.completed` for both `false` and `true` cases (queried via `screen.getByRole('checkbox')`),
    - click: `userEvent.click(screen.getByRole('checkbox'))` calls `onToggle(todo.id, true)` exactly once when starting from `completed: false`,
    - click on completed: clicking on a `completed: true` row calls `onToggle(todo.id, false)` (un-complete),
    - keyboard Space: focusing the checkbox and pressing `Space` calls `onToggle(todo.id, !completed)` exactly once,
    - keyboard Enter: focusing the checkbox and pressing `Enter` does NOT call `onToggle` (Radix Space-only contract),
    - pending disabled: a `TodoEntry` with `pending: true` renders a `disabled` checkbox; `userEvent.click` on it does NOT call `onToggle`,
    - the row exposes `aria-labelledby` pointing to a span containing the todo text (assert via `getByRole('checkbox', { name: todo.text })`),
    - the row's text shows `line-through` only when `completed === true` (preserves Story 1.9 visual contract).

14. **Given** [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) — extended with `updateTodo` coverage,
    **When** Vitest runs (`npm run test --workspace apps/web`),
    **Then** the suite appends a `describe('updateTodo()', ...)` block AFTER the existing `createTodo()` block. Cases:
    - happy path: 200 body parses; method is PATCH; URL is `http://localhost:4000/todos/${id}`; `x-request-id` header present and a valid UUID; `accept: application/json` and `content-type: application/json` headers; body is exactly `JSON.stringify({ completed: true })`,
    - happy path with `completed: false`: body is exactly `JSON.stringify({ completed: false })`,
    - non-OK 404 envelope (the Fastify-sensible default at [contracts.ts:32-39](../../packages/shared/src/contracts.ts#L32-L39)) → throws `ApiError` with `statusCode: 404`, the server's `message`, and the response's `requestId`,
    - non-OK 500 with NO server `x-request-id` header → throws `ApiError` with `requestId === undefined`,
    - 200 body that fails `TodoSchema.safeParse` (e.g., wrong shape) → throws `ApiError` with `message: 'Response did not match the expected todo schema'`,
    - 200 with malformed JSON → throws `ApiError` with `message: 'Malformed JSON in successful response'`,
    **And** the existing `getTodos` and `createTodo` describe blocks continue to pass unchanged.

15. **Given** [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx) — extended with toggle journey cases,
    **When** Vitest + RTL runs,
    **Then** the suite appends a `describe('<TodoApp /> toggle journey', ...)` block. Cases:
    - happy path: GET returns one todo `{ completed: false }` → user clicks the checkbox → optimistic `aria-checked` flips to `"true"` → PATCH resolves with the server's `{ completed: true, ...sameId }` → the row reflects `aria-checked="true"` after reconcile (no duplicate item; one item with `completed: true`),
    - rollback: GET returns one todo `{ completed: false }` → user clicks → optimistic `aria-checked` flips to `"true"` → PATCH rejects with 500 → checkbox `aria-checked` reverts to `"false"`,
    - PATCH request shape: assert the second `fetch` call is `PATCH /todos/<id>` with `body: JSON.stringify({ completed: true })`.

16. **Given** the full sanity gate suite,
    **When** `npm run lint`, `npm run typecheck`, and `npm run test` run from the repo root,
    **Then** all three pass: zero ESLint warnings/errors, zero TypeScript errors, all tests green,
    **And** the web test count moves from 66 → ~80–86 (existing 66 + ~6 new in `api.test.ts` for `updateTodo` + ~5–7 new in `TodoItem.test.tsx` for toggle behavior + ~2–3 new in `TodoApp.test.tsx` for the toggle journey),
    **And** the `consoleErrorSpy`/`consoleWarnSpy` `afterEach` strict assertion in `TodoItem.test.tsx` continues to pass (no new console output from any toggle path),
    **And** `npm install` from the repo root reports zero peer-dep warnings after `@radix-ui/react-checkbox` is added.

## Tasks / Subtasks

- [x] **Task 1: Install `@radix-ui/react-checkbox` (AC: #2, #16)**
  - [x] From the repo root, run: `npm install --save --workspace apps/web @radix-ui/react-checkbox` (pin to the latest 1.x — at the time of writing, `1.3.3`).
  - [x] **Why a runtime dependency (not devDep)** — `@radix-ui/react-checkbox` is imported by `<TodoItem>` (production code path), so it must ship with the deployed bundle. `--save` (default) targets `dependencies` in `apps/web/package.json`. **Do NOT** put it in `devDependencies`.
  - [x] **Why pin to 1.x** — Radix Primitives' major versions are independent per package; v1.x of `react-checkbox` is the current stable line as of April 2026. Architecture's NFR4 budget (≤200 KB gzipped) tolerates Radix Checkbox comfortably (~3 KB gzipped). Verify with `node -e "console.log(require.resolve('@radix-ui/react-checkbox'))"` from `apps/web/` after install.
  - [x] **Why NOT `@radix-ui/react-primitive` directly** — that's an internal building block. Use the published `react-checkbox` package; it bundles everything `<Checkbox.Root>` and `<Checkbox.Indicator>` need.
  - [x] **Watch-out:** Do NOT install Radix Checkbox at the repo root — `npm install <pkg>` without `--workspace` writes to the root `package.json` and the dependency will not resolve from `apps/web/src/`. Always include `--workspace apps/web`.
  - [x] **Watch-out:** Do NOT bump existing deps as a side-effect. `package-lock.json` will refresh — that's fine and expected. Do not rerun `npm update` or `npm dedupe`.
  - [x] **Watch-out:** Do NOT add a peer-dep for `react-dom`/`react` in `apps/web/package.json` — Radix declares its own peer deps; npm will warn if React 19 is unsupported (it isn't — Radix supports React 18+ and 19).

- [x] **Task 2: Add `updateTodo` to the API client (AC: #1, #14)**
  - [x] Edit [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) — add `updateTodo` AFTER `createTodo`. Mirror the existing `createTodo` pattern verbatim; the only differences are method, URL (path-segment id), and body shape.

    ```ts
    export async function updateTodo(
      id: string,
      completed: boolean,
      signal?: AbortSignal,
    ): Promise<Todo> {
      const requestId = newRequestId();
      const response = await fetch(`${API_URL}/todos/${id}`, {
        method: 'PATCH',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({ completed }),
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

  - [x] **Why mirror `createTodo` line-for-line** — Story 2.5 established the canonical PATCH/POST wrapper shape (URL, headers including `x-request-id`, `safeParse` envelope, synthetic-`ApiError` for malformed-JSON / contract-drift, `ApiError.fromResponse` for non-OK envelopes). Story 2.7 will add `deleteTodo` next; mirroring keeps all four wrappers grep-friendly.
  - [x] **Why `JSON.stringify({ completed })` (boolean only, no other fields)** — server's `UpdateTodoRequestSchema` is `.strict()` ([contracts.ts:20-24](../../packages/shared/src/contracts.ts#L20-L24)); any extra field → `400 Bad Request`. The wire shape is documented in [Story 2.2 AC #5](./2-2-patch-todos-id-endpoint-with-lww-semantics.md#L36-L40).
  - [x] **Why no `Math.max(0, ...)` or "validate id is UUID" client-side** — client validation is minimal per [architecture.md:421-424](../../_bmad-output/planning-artifacts/architecture.md#L421-L424). Server returns `400` if `:id` is not a UUID; that becomes an `ApiError` and the toggle rolls back. Don't duplicate.
  - [x] **Why a `signal` param even though Story 2.6 doesn't pass one** — keeping the `(id, completed, signal?)` shape consistent with `getTodos(signal?)` / `createTodo(text, signal?)` lets a future test or component pass an `AbortSignal` without breaking call sites. Do NOT force a `signal`.
  - [x] **Why `${API_URL}/todos/${id}` (template literal interpolation, not `URL` constructor)** — `getTodos` and `createTodo` both interpolate the path directly with the env-loaded `API_URL`. Using `new URL(...)` would diverge from the established style for zero correctness gain (the id is server-validated anyway).
  - [x] **Watch-out:** Do NOT export `updateTodo` as default. Mirror `getTodos` / `createTodo`'s named-export style.
  - [x] **Watch-out:** Do NOT add a `console.warn` or `console.error` inside the function. The architecture's "no console in production code" rule ([architecture.md:431](../../_bmad-output/planning-artifacts/architecture.md#L431)) extends to web code; component tests with strict `consoleErrorSpy`/`consoleWarnSpy` afterEach assertions would fail.
  - [x] **Watch-out:** Do NOT add encodeURIComponent on `id`. The id is a UUID (`/^[0-9a-f-]{36}$/i`) — RFC 3986 unreserved + hyphen — and template-literal interpolation is safe. The server's `TodoIdParamsSchema` validates the shape regardless.

- [x] **Task 3: Extend `api.test.ts` with `updateTodo` coverage (AC: #1, #14)**
  - [x] Edit [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) — append a `describe('updateTodo()', ...)` block AFTER the existing `createTodo()` block. Mirror the `mockFetchOnce` helper and the `vi.stubEnv` / `vi.resetModules` lifecycle that's already in place at [api.test.ts:1-19](../../apps/web/src/lib/api.test.ts#L1-L19).

    ```ts
    describe('updateTodo()', () => {
      const id = '11111111-1111-4111-8111-111111111111';

      it('issues PATCH /todos/:id with x-request-id, content-type, and JSON body { completed: true }', async () => {
        const todo = {
          id,
          text: 'pick up milk',
          completed: true,
          createdAt: '2026-04-29T00:00:00.000Z',
        };
        mockFetchOnce(
          new Response(JSON.stringify(todo), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
        const { updateTodo } = await import('./api');
        const result = await updateTodo(id, true);
        expect(result).toEqual(todo);

        const fetchMock = vi.mocked(globalThis.fetch);
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe(`http://localhost:4000/todos/${id}`);
        expect(init).toMatchObject({
          method: 'PATCH',
          headers: expect.objectContaining({
            accept: 'application/json',
            'content-type': 'application/json',
            'x-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/i),
          }),
          body: JSON.stringify({ completed: true }),
        });
      });

      it('issues body { completed: false } when un-completing', async () => {
        const todo = {
          id,
          text: 'pick up milk',
          completed: false,
          createdAt: '2026-04-29T00:00:00.000Z',
        };
        mockFetchOnce(new Response(JSON.stringify(todo), { status: 200 }));
        const { updateTodo } = await import('./api');
        await updateTodo(id, false);
        const fetchMock = vi.mocked(globalThis.fetch);
        const init = fetchMock.mock.calls[0]![1]!;
        expect(init.body).toBe(JSON.stringify({ completed: false }));
      });

      it('throws ApiError with status, message, and requestId when the server returns 404', async () => {
        mockFetchOnce(
          new Response(
            JSON.stringify({
              statusCode: 404,
              error: 'Not Found',
              message: 'todo not found',
            }),
            {
              status: 404,
              headers: {
                'content-type': 'application/json',
                'x-request-id': 'srv-not-found',
              },
            },
          ),
        );
        const { updateTodo } = await import('./api');
        await expect(updateTodo(id, true)).rejects.toMatchObject({
          name: 'ApiError',
          statusCode: 404,
          message: 'todo not found',
          requestId: 'srv-not-found',
        });
      });

      it('throws ApiError with requestId === undefined when the server omits the x-request-id header on 500', async () => {
        mockFetchOnce(
          new Response(
            JSON.stringify({
              statusCode: 500,
              error: 'Internal Server Error',
              message: 'oops',
            }),
            { status: 500 },
          ),
        );
        const { updateTodo } = await import('./api');
        await expect(updateTodo(id, true)).rejects.toMatchObject({
          name: 'ApiError',
          statusCode: 500,
          requestId: undefined,
        });
      });

      it('throws ApiError when the 200 body fails TodoSchema parsing (server contract drift)', async () => {
        mockFetchOnce(
          new Response(JSON.stringify({ id: 'not-a-uuid', text: 'x' }), {
            status: 200,
          }),
        );
        const { updateTodo } = await import('./api');
        await expect(updateTodo(id, true)).rejects.toMatchObject({
          name: 'ApiError',
          message: 'Response did not match the expected todo schema',
        });
      });

      it('throws ApiError when the 200 body is malformed JSON', async () => {
        mockFetchOnce(
          new Response('not json {', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
        const { updateTodo } = await import('./api');
        await expect(updateTodo(id, true)).rejects.toMatchObject({
          name: 'ApiError',
          message: 'Malformed JSON in successful response',
        });
      });
    });
    ```

  - [x] **Why `await import('./api')` inside the test (and not a top-level import)** — `api.ts` reads `process.env.NEXT_PUBLIC_API_URL` AT MODULE LOAD and throws if missing. The existing `vi.stubEnv` + `vi.resetModules()` lifecycle ([api.test.ts:6-9](../../apps/web/src/lib/api.test.ts#L6-L9)) re-evaluates `api.ts` per-test against the stubbed env. Mirror the pattern verbatim — Stories 1.8 and 2.5 both rely on this.
  - [x] **Why test the `404` envelope shape specifically** — toggling a row that was just deleted by another client is the canonical 404 case for PATCH (per [Story 2.2 AC #3](./2-2-patch-todos-id-endpoint-with-lww-semantics.md#L26-L30)). The test confirms the `ApiError` chain delivers `statusCode: 404` to the caller (toggle's `toggleFailed` handler).
  - [x] **Watch-out:** Do NOT mock `crypto.randomUUID`. The mock-fetch tests assert via regex on the `x-request-id` header.
  - [x] **Watch-out:** Do NOT add tests for `400 Bad Request` (server-side body schema violations) — that's a server-side `UpdateTodoRequestSchema` concern covered by Story 2.2 integration tests. The web client only sends `{ completed: boolean }`; testing a "what if we sent garbage" path would test the wrong layer.

- [x] **Task 4: Extend `<TodoItem>` with Radix Checkbox (AC: #2, #3, #4, #5, #6, #7, #8)**
  - [x] Edit [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx). The change is non-trivial — the component goes from "read-only span row" to "checkbox + labeled text". Replace the current implementation with the version below. Note: keep `data-testid="todo-item"` and `data-completed={completed}` on the `<li>` for downstream test compatibility.

    ```tsx
    'use client';

    import * as Checkbox from '@radix-ui/react-checkbox';
    import { useId } from 'react';
    import type { TodoEntry } from '@/lib/reducer';

    export interface TodoItemProps {
      todo: TodoEntry;
      onToggle: (id: string, nextCompleted: boolean) => void;
    }

    export default function TodoItem({ todo, onToggle }: TodoItemProps) {
      const completed = todo.completed;
      const pending = todo.pending === true;
      const labelId = useId();

      const handleCheckedChange = (
        nextChecked: boolean | 'indeterminate',
      ): void => {
        // Radix can theoretically emit 'indeterminate'; v1 has no indeterminate
        // state, so coerce to a strict boolean.
        const next = nextChecked === true;
        onToggle(todo.id, next);
      };

      return (
        <li
          data-testid="todo-item"
          data-completed={completed}
          className="flex items-start gap-3 rounded-md border border-current/10 px-4 py-3"
        >
          <Checkbox.Root
            data-testid="todo-item-checkbox"
            checked={completed}
            disabled={pending}
            onCheckedChange={handleCheckedChange}
            aria-labelledby={labelId}
            className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-current bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-current/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-current/20"
          >
            <Checkbox.Indicator
              data-testid="todo-item-checkbox-indicator"
              className="text-base leading-none"
            >
              {/* Visible glyph; aria-hidden because the role/checked state is
                  the assistive-tech signal, not the glyph. */}
              <span aria-hidden="true">✓</span>
            </Checkbox.Indicator>
          </Checkbox.Root>
          <span
            id={labelId}
            data-testid="todo-item-text"
            className={
              completed
                ? 'flex-1 break-words text-base leading-6 line-through opacity-60'
                : 'flex-1 break-words text-base leading-6'
            }
          >
            {todo.text}
          </span>
        </li>
      );
    }
    ```

  - [x] **Why `'use client'` at the top** — `Checkbox.Root`, `Checkbox.Indicator`, and `useId` are React-client primitives. Next.js 16 App Router defaults to Server Components; this directive is required. Sibling components already use it ([TodoApp.tsx:1](../../apps/web/src/components/TodoApp.tsx#L1), [TodoInput.tsx:1](../../apps/web/src/components/TodoInput.tsx#L1)).
  - [x] **Why `import * as Checkbox` (namespace import) — not `import { Root, Indicator }`** — Radix Primitives' published convention is namespace-style: `<Checkbox.Root>` / `<Checkbox.Indicator>`. The Radix docs all show this pattern; it makes the JSX read like the primitive's hierarchy. Direct named imports work but diverge from the docs and reviewer mental model.
  - [x] **Why `TodoEntry` (not `Todo`) for the `todo` prop type** — `<TodoItem>` needs to read `todo.pending` (Story 2.4's reducer-internal flag widened the type to `Todo & { pending?: boolean }` at [reducer.ts:8](../../apps/web/src/lib/reducer.ts#L8)). Typing the prop as the raw wire `Todo` would prevent the AC #8 disabled check.
  - [x] **Why the explicit `pending = todo.pending === true` coercion** — `pending?: boolean` means `pending` may be `undefined`; a falsy comparison would treat `undefined` as `false` correctly today, but `=== true` makes the intent loud and pins the contract that "no `pending` flag" means "not pending."
  - [x] **Why `aria-labelledby` (not wrapping `<label>`)** — Radix's `Checkbox.Root` is a `<button>` underneath, not an `<input type="checkbox">`. A wrapping `<label>` would not associate via the implicit input-in-label pattern (no input). `aria-labelledby` to a `<span id>` is the documented Radix Checkbox label pattern. The `useId()`-generated id is SSR-safe and collision-proof per row.
  - [x] **Why `onCheckedChange` on `Checkbox.Root` (not `onClick` on `<li>`)** — Radix exposes `onCheckedChange` as the high-level event for Space/click/programmatic toggles; it fires AFTER Radix updates its internal state. Wiring `onClick` on the `<li>` would intercept clicks on the text span and produce double-fires.
  - [x] **Why coerce `'indeterminate' → false`** — The `CheckedState` type from Radix is `boolean | 'indeterminate'`. v1 has no indeterminate state; we never set `checked='indeterminate'` and Radix never emits it spontaneously, but TypeScript demands the union be handled. `next === true` is the strict check; everything else (including `'indeterminate'`) collapses to `false` — defensible and unreachable.
  - [x] **Why `h-11 w-11` (44 px tap target, NFR14)** — Tailwind v4: `h-11` = `2.75rem` = 44px at the default 16px root. The `Checkbox.Root` is the entire interactive area; the `:focus-visible` ring is rendered on the same element. Don't add a separate larger wrapper just to satisfy NFR14; the `Checkbox.Root` itself IS the tap target.
  - [x] **Why `mt-0.5` retained** — Story 1.9's read-only row had a small top margin on the checkbox-shape span to align with the first line of multi-line text. The Radix root replaces that span; keep the `mt-0.5` for visual continuity (avoid a gratuitous-looking diff in design).
  - [x] **Why `data-[state=checked]:bg-current/20`** — Radix sets `data-state="checked"` / `"unchecked"` / `"indeterminate"` on `Checkbox.Root`. Tailwind v4's data-attribute variant is the idiomatic way to style based on Radix state. The matching colour for the previous Epic-1 read-only "filled square" was `bg-current/20`; preserving it keeps the visual weight identical, just now driven by Radix state instead of a JS conditional.
  - [x] **Why `<span aria-hidden="true">✓</span>` inside `Checkbox.Indicator`** — A visual checkmark for sighted users. AT users get the `aria-checked="true"` signal from Radix automatically; the glyph would otherwise be re-announced as "check mark" or "U+2713" by some screen readers. `aria-hidden` cuts the duplicate. **Do NOT** use `<svg>` — no SVG icon system exists in this app yet (architecture pins JSX-text rendering and Tailwind only); a Unicode glyph is sub-byte and accessibility-equivalent.
  - [x] **Why `data-testid="todo-item-checkbox"` and `data-testid="todo-item-text"`** — DOM-test-friendly probes. Tests can prefer `getByRole('checkbox')` and `getByText(...)`, but the `data-testid` provides a fallback that survives ARIA regressions. Mirrors Story 1.9 / 2.5 testid conventions.
  - [x] **Watch-out:** Do NOT remove `data-testid="todo-item"` or `data-completed` from the `<li>` — Stories 1.9, 2.4, and 2.5 tests pin those. Removing them is a breaking test change disguised as a refactor.
  - [x] **Watch-out:** Do NOT keep `aria-checked={completed}` on the `<li>`. Radix supplies it on the `Checkbox.Root`; duplicating it on `<li role="listitem">` is invalid ARIA (per [deferred-work.md:105](./deferred-work.md#L105)) AND would create a DOM with two `aria-checked` ancestors which screen readers may collapse arbitrarily. Remove the `eslint-disable-next-line jsx-a11y/role-supports-aria-props` comment along with the attribute.
  - [x] **Watch-out:** Do NOT change the `<li>` to `role="checkbox"`. The list semantics live on the `<ul>`/`<li>`; the checkbox semantics live on `Checkbox.Root`. Conflating them breaks both VoiceOver list traversal and the keyboard `Space` contract.
  - [x] **Watch-out:** Do NOT pass `dispatch` or any `lib/*` types into `<TodoItem>` — only `onToggle` flows in. AC #6 is structurally enforced; ESLint won't catch it; the dev agent must.
  - [x] **Watch-out:** Do NOT call `e.stopPropagation()` inside `onCheckedChange`. Radix's checked-change event is not a synthetic React mouse event — it's a high-level state callback. There's nothing to stop.
  - [x] **Watch-out:** Do NOT add `onClick={(e) => e.preventDefault()}` on the `<li>` "to be safe." There are no parent click handlers; preventing default would break Radix's internal click handling.

- [x] **Task 5: Update `<TodoList>` to thread `onToggle` to each item (AC: #10, #11)**
  - [x] Edit [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx). Change is two lines: extend the prop interface, pass `onToggle` through. Other branches (loading/empty/error) are unchanged because they render no items.

    ```tsx
    import type { TodoState } from '@/lib/reducer';
    import TodoItem from './TodoItem';

    export interface TodoListProps {
      state: TodoState;
      onToggle: (id: string, nextCompleted: boolean) => void;
    }

    export default function TodoList({ state, onToggle }: TodoListProps) {
      const { status, todos } = state;

      // ... loading / empty / error branches unchanged ...

      return (
        <ul
          data-testid="todo-list"
          data-status="success"
          className="flex flex-col gap-2"
        >
          {todos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} onToggle={onToggle} />
          ))}
        </ul>
      );
    }
    ```

  - [x] **Why `onToggle` is required (not optional)** — Marking it `?:` would let `<TodoList>` callers forget to wire it; `<TodoItem>`'s required prop would then fail at type-check inside the `.map(...)` call. Required-up-the-chain is honest.
  - [x] **Why thread through `<TodoList>` instead of binding it inside `<TodoItem>`** — Architecture pins `<TodoApp>` as the only stateful component ([architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631)). The reducer + `api.ts` calls live there; presentational components emit callbacks and receive props.
  - [x] **Why update the existing `TodoList.test.tsx` cases (AC #11)** — Adding a required prop without updating tests = TypeScript failure. The fix is mechanical: every `render(<TodoList state={...} />)` becomes `render(<TodoList state={...} onToggle={vi.fn()} />)`. No behavioral assertion changes.
  - [x] **Watch-out:** Do NOT introduce `useCallback` inside `<TodoList>` to "stabilize" the prop. The callback is already stable from `<TodoApp>` (Task 6 wraps it in `useCallback`); re-wrapping here is dead weight.
  - [x] **Watch-out:** Do NOT change the existing `data-testid` set on the loading/empty/error/populated branches.

- [x] **Task 6: Wire `<TodoApp>` `handleToggle` callback (AC: #9)**
  - [x] Edit [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx). Additive change: import `updateTodo`, add `handleToggle`, pass it down to `<TodoList>`. Existing `useEffect` and `handleAdd` are untouched. The `useCallback` deps include `state.todos` because the closure captures `state.todos` to look up `previousCompleted`.

    ```tsx
    'use client';

    import { useCallback, useEffect, useReducer } from 'react';
    import { createTodo, getTodos, updateTodo } from '@/lib/api';
    import { ApiError } from '@/lib/errors';
    import { initialState, reducer } from '@/lib/reducer';
    import TodoInput from './TodoInput';
    import TodoList from './TodoList';

    export default function TodoApp() {
      const [state, dispatch] = useReducer(reducer, initialState);

      // ...existing initial-load useEffect — UNCHANGED...

      // ...existing handleAdd useCallback — UNCHANGED...

      const handleToggle = useCallback(
        (id: string, nextCompleted: boolean): void => {
          if (state.status !== 'success') return;
          const target = state.todos.find((t) => t.id === id);
          if (!target) return;
          if (target.pending === true) return;
          const previousCompleted = target.completed;

          dispatch({
            type: 'toggleOptimistic',
            payload: { id, completed: nextCompleted },
          });
          updateTodo(id, nextCompleted).then(
            (todo) => {
              // Reuse `addReconcile`: replace the entry at the same id with the
              // server's authoritative shape (drops the optimistic flag if it
              // were present, refreshes any server-side fields).
              dispatch({
                type: 'addReconcile',
                payload: { tempId: id, todo },
              });
            },
            () => {
              dispatch({
                type: 'toggleFailed',
                payload: { id, previousCompleted },
              });
            },
          );
        },
        [state.status, state.todos],
      );

      return (
        <section aria-labelledby="todos-heading" className="flex flex-col gap-6">
          <h1 id="todos-heading" className="text-3xl font-semibold tracking-tight">
            Shared Todos
          </h1>
          {state.status === 'success' && <TodoInput onAdd={handleAdd} />}
          <TodoList state={state} onToggle={handleToggle} />
        </section>
      );
    }
    ```

  - [x] **Why capture `previousCompleted` from current state (not from the `nextCompleted` arg flipped)** — In a single-user world `previousCompleted = !nextCompleted` always. But concurrent updates from another tab can flip the row out from under the user before our PATCH lands; rolling back to "the value we read off state" is honest, while `!nextCompleted` is a guess. Story 2.4's reducer rules require the caller to stash the prior value; this is the cleanest read.
  - [x] **Why the `target.pending === true` early return** — Defense-in-depth. AC #8 disables the checkbox in `<TodoItem>`; AC #9's guard prevents a stale `onToggle` callback (e.g., a click the user landed milliseconds before `pending` flipped) from issuing a PATCH against a temp UUID. The server would 404; the toggle would roll back; no user-visible bug — but a wasted round trip and an irrelevant 404 in logs.
  - [x] **Why `[state.status, state.todos]` deps (not `[]` like `handleAdd`)** — `handleAdd` doesn't read `state` — it only dispatches. `handleToggle` reads `state.todos` to look up `previousCompleted`. The dep MUST include `state.todos`; otherwise the callback closes over the initial empty array and every toggle uses `previousCompleted: undefined`. Including `state.status` is technically redundant (`state.todos` changes with status transitions) but documents the load-status guard.
  - [x] **Why reuse `addReconcile` on success (not invent a new `toggleReconcile` action)** — Story 2.4's `addReconcile` is "find by id, replace at same index." That's exactly what toggle reconcile needs: take the server's authoritative entry, replace ours. Adding a `toggleReconcile` would be a second action with identical reducer semantics. Story 2.4 deliberately did NOT define `toggleReconcile` — see [reducer.ts:17-33](../../apps/web/src/lib/reducer.ts#L17-L33) — and 2.6 follows that contract.
  - [x] **Why `.then(onSuccess, onReject)` (two-arg form)** — Mirrors the existing `handleAdd` shape and the initial-load `useEffect`. One fewer node in the chain than `.then().catch()`; identical semantics for a single-resolve path.
  - [x] **Why no `signal` passed to `updateTodo`** — Same reasoning as Story 2.5's `handleAdd` ([2-5 Task 5 watch-out](./2-5-create-todo-via-todoinput-full-vertical-slice.md#L600)): the toggle is fire-and-forget under optimistic UI. Unmount during in-flight toggle resolves to a React 18+ silent no-op. Adding `AbortController` would orphan the optimistic state on unmount.
  - [x] **Why the `state.status !== 'success'` guard despite the reducer's own no-op** — Story 2.4's reducer no-ops `toggleOptimistic` outside `success` ([reducer.ts:88](../../apps/web/src/lib/reducer.ts#L88)), so dispatching against an `error` state is technically harmless. But we'd still issue a PATCH to a server that we just couldn't read from — wasting a round trip and blowing a hole in the visibility-refetch story. Belt-and-suspenders.
  - [x] **Watch-out:** Do NOT capture `previousCompleted` AFTER the `dispatch({ type: 'toggleOptimistic', ... })` call — the dispatch flips the flag on the next render; if the closure reads `state.todos` after dispatch, you'd get the optimistic value and the rollback would no-op. Capture BEFORE dispatch.
  - [x] **Watch-out:** Do NOT short-circuit on `target.completed === nextCompleted`. The reducer already no-ops same-value toggles ([reducer.ts:93](../../apps/web/src/lib/reducer.ts#L93)) and Radix's checkbox emits change only on actual toggles. A duplicate guard adds noise.
  - [x] **Watch-out:** Do NOT add `try/catch` around the `dispatch` calls. `dispatch` cannot throw under React's `useReducer` contract.
  - [x] **Watch-out:** Do NOT spread `target` into the optimistic dispatch payload. The reducer constructs the next state shape itself; the action's payload is `{ id, completed }` only.

- [x] **Task 7: Update `TodoItem.test.tsx` for new prop + checkbox role + toggle behaviors (AC: #4, #5, #7, #8, #12, #13)**
  - [x] Edit [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx). Update existing assertions and add new ones. Mirror the strict `consoleErrorSpy` / `consoleWarnSpy` `afterEach` pattern at [TodoItem.test.tsx:13-25](../../apps/web/src/components/TodoItem.test.tsx#L13-L25).

    ```tsx
    import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
    import { render, screen } from '@testing-library/react';
    import userEvent from '@testing-library/user-event';
    import type { TodoEntry } from '@/lib/reducer';
    import TodoItem from './TodoItem';

    const baseTodo: TodoEntry = {
      id: '11111111-1111-4111-8111-111111111111',
      text: 'pick up milk',
      completed: false,
      createdAt: '2026-04-29T00:00:00.000Z',
    };

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

    describe('<TodoItem />', () => {
      it('renders an active todo with default visual treatment and aria-checked=false on the checkbox', () => {
        render(<TodoItem todo={baseTodo} onToggle={vi.fn()} />);
        const li = screen.getByTestId('todo-item');
        expect(li).toHaveAttribute('data-completed', 'false');
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toHaveAttribute('aria-checked', 'false');
        const text = screen.getByTestId('todo-item-text');
        expect(text).toHaveTextContent('pick up milk');
        expect(text).not.toHaveClass('line-through');
      });

      it('renders a completed todo with strikethrough and aria-checked=true on the checkbox', () => {
        render(<TodoItem todo={{ ...baseTodo, completed: true }} onToggle={vi.fn()} />);
        const li = screen.getByTestId('todo-item');
        expect(li).toHaveAttribute('data-completed', 'true');
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toHaveAttribute('aria-checked', 'true');
        const text = screen.getByTestId('todo-item-text');
        expect(text).toHaveClass('line-through');
      });

      it('renders the todo text verbatim (no escaping shenanigans, NFR17 React JSX)', () => {
        const xss: TodoEntry = { ...baseTodo, text: '<script>alert("x")</script>' };
        render(<TodoItem todo={xss} onToggle={vi.fn()} />);
        const li = screen.getByTestId('todo-item');
        expect(li).toHaveTextContent('<script>alert("x")</script>');
        expect(li.querySelector('script')).toBeNull();
      });

      it('exposes a checkbox role for the row and labels it with the todo text', () => {
        render(<TodoItem todo={baseTodo} onToggle={vi.fn()} />);
        // Radix Checkbox.Root supplies role="checkbox"; the `aria-labelledby`
        // points at the text span, so the accessible name is the todo text.
        const checkbox = screen.getByRole('checkbox', { name: 'pick up milk' });
        expect(checkbox).toBeInTheDocument();
      });

      it('handles a 500-char text without horizontal overflow class violations (break-words present)', () => {
        const longText: TodoEntry = { ...baseTodo, text: 'a'.repeat(500) };
        render(<TodoItem todo={longText} onToggle={vi.fn()} />);
        const text = screen.getByTestId('todo-item-text');
        expect(text).toHaveClass('break-words');
      });

      it('calls onToggle(id, true) when the checkbox is clicked on an active todo', async () => {
        const onToggle = vi.fn();
        const user = userEvent.setup();
        render(<TodoItem todo={baseTodo} onToggle={onToggle} />);
        await user.click(screen.getByRole('checkbox'));
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onToggle).toHaveBeenCalledWith(baseTodo.id, true);
      });

      it('calls onToggle(id, false) when the checkbox is clicked on a completed todo', async () => {
        const onToggle = vi.fn();
        const user = userEvent.setup();
        render(<TodoItem todo={{ ...baseTodo, completed: true }} onToggle={onToggle} />);
        await user.click(screen.getByRole('checkbox'));
        expect(onToggle).toHaveBeenCalledWith(baseTodo.id, false);
      });

      it('calls onToggle when Space is pressed with the checkbox focused', async () => {
        const onToggle = vi.fn();
        const user = userEvent.setup();
        render(<TodoItem todo={baseTodo} onToggle={onToggle} />);
        const checkbox = screen.getByRole('checkbox');
        checkbox.focus();
        await user.keyboard('{ }'); // Space key
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onToggle).toHaveBeenCalledWith(baseTodo.id, true);
      });

      it('does NOT call onToggle when Enter is pressed with the checkbox focused', async () => {
        const onToggle = vi.fn();
        const user = userEvent.setup();
        render(<TodoItem todo={baseTodo} onToggle={onToggle} />);
        screen.getByRole('checkbox').focus();
        await user.keyboard('{Enter}');
        expect(onToggle).not.toHaveBeenCalled();
      });

      it('renders the checkbox as disabled when todo.pending === true and does NOT call onToggle on click', async () => {
        const onToggle = vi.fn();
        const user = userEvent.setup();
        render(<TodoItem todo={{ ...baseTodo, pending: true }} onToggle={onToggle} />);
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeDisabled();
        await user.click(checkbox);
        expect(onToggle).not.toHaveBeenCalled();
      });
    });
    ```

  - [x] **Why use `screen.getByRole('checkbox')` instead of `getByTestId`** — `getByRole` proves the Radix primitive is producing the right ARIA role. If a future refactor swaps Radix for a hand-rolled `<button>` without `role="checkbox"`, the test fails — that's the desired regression signal.
  - [x] **Why `getByRole('checkbox', { name: ... })` for the labeling test** — Testing Library resolves `name` via the accessible-name computation (`aria-labelledby` → text span content). If the `aria-labelledby` is removed or points at the wrong node, the lookup fails — proves the AT label association.
  - [x] **Why `await user.keyboard('{ }')` for Space (not `{Space}`)** — `userEvent` v14's `keyboard` API accepts both, but `'{ }'` (literal space character) is unambiguous. Some `userEvent` versions had the `{Space}` token alias but it's safer to use the literal. **Also acceptable:** `await user.keyboard(' ')` — the curly brace form is for special keys. Either works.
  - [x] **Why test "Enter does NOT toggle"** — Radix's documented contract is Space-only for checkboxes. Pinning this prevents a future Radix major-version bump from silently changing the contract; if Radix v2 starts supporting Enter, this test fires and the dev investigates.
  - [x] **Why `expect(checkbox).toBeDisabled()` for the pending case** — `toBeDisabled()` (jest-dom matcher) walks ancestors checking for `disabled` / `aria-disabled`. Radix sets the `disabled` attribute on the underlying `<button>` directly when `disabled={true}` is passed.
  - [x] **Watch-out:** Do NOT mock `crypto.randomUUID`. `<TodoItem>` doesn't call it.
  - [x] **Watch-out:** Do NOT use `act()` manually. RTL + `userEvent.setup()` wraps the right things automatically.
  - [x] **Watch-out:** Do NOT delete the existing `'<script>...'` XSS-as-text test. Story 2.5's escaping contract still applies; the assertion's targeting moves from the `<li>` to the labeled span (still inside the `<li>` text content, so `toHaveTextContent` still catches it).
  - [x] **Watch-out:** Do NOT keep the old "exposes NO interactive affordances" test. It was an Epic-1 placeholder explicitly retired by Story 2.6 per [deferred-work.md:105](./deferred-work.md#L105). Replace it with the affirmative `getByRole('checkbox')` assertion.

- [x] **Task 8: Update `TodoList.test.tsx` to pass `onToggle` (AC: #11)**
  - [x] Edit [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx). For every existing `render(<TodoList state={...} />)` call, add `onToggle={vi.fn()}`. No assertions change.
  - [x] **Why no new test cases here** — `<TodoList>` is now a thin pass-through for `onToggle`. The downstream behavior tests live in `TodoItem.test.tsx`. Adding a list-level pass-through test ("when I click an item, the list-level onToggle fires") would be a redundant integration; the journey tests in `TodoApp.test.tsx` (Task 9) cover that path.
  - [x] **Watch-out:** Do NOT skip this update — TypeScript will fail at the repo-root `npm run typecheck` step.

- [x] **Task 9: Add toggle journey test in `TodoApp.test.tsx` (AC: #15)**
  - [x] Edit [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx). Append a new `describe('<TodoApp /> toggle journey', ...)` block after the existing `describe('<TodoApp /> create journey', ...)`.

    ```tsx
    describe('<TodoApp /> toggle journey', () => {
      const seed = {
        id: '11111111-1111-4111-8111-111111111111',
        text: 'pick up milk',
        completed: false,
        createdAt: '2026-04-29T00:00:00.000Z',
      };

      it('happy path: GET → click → optimistic checked → PATCH resolves → reconciled', async () => {
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
          .mockResolvedValueOnce(
            jsonResponse({ ...seed, completed: true }, { status: 200 }),
          );
        vi.stubGlobal('fetch', fetchMock);

        const { default: TodoApp } = await import('./TodoApp');
        render(<TodoApp />);

        const checkbox = await screen.findByRole('checkbox', { name: seed.text });
        expect(checkbox).toHaveAttribute('aria-checked', 'false');

        const user = userEvent.setup();
        await user.click(checkbox);

        // After microtask flush, the row reflects completed: true.
        await waitFor(() =>
          expect(screen.getByRole('checkbox', { name: seed.text })).toHaveAttribute(
            'aria-checked',
            'true',
          ),
        );

        // PATCH was issued with the right URL, method, and body.
        const patchCall = fetchMock.mock.calls[1]!;
        expect(patchCall[0]).toBe(`http://localhost:4000/todos/${seed.id}`);
        expect(patchCall[1]).toMatchObject({
          method: 'PATCH',
          body: JSON.stringify({ completed: true }),
        });

        // List still has exactly one item.
        const items = await screen.findAllByTestId('todo-item');
        expect(items).toHaveLength(1);
      });

      it('rollback: optimistic flip reverts when PATCH rejects with 500', async () => {
        let resolvePatch!: (response: Response) => void;
        const patchPromise = new Promise<Response>((resolve) => {
          resolvePatch = resolve;
        });
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
          .mockReturnValueOnce(patchPromise);
        vi.stubGlobal('fetch', fetchMock);

        const { default: TodoApp } = await import('./TodoApp');
        render(<TodoApp />);

        const checkbox = await screen.findByRole('checkbox', { name: seed.text });
        const user = userEvent.setup();
        await user.click(checkbox);

        // Optimistic state visible while PATCH is pending.
        await waitFor(() =>
          expect(screen.getByRole('checkbox', { name: seed.text })).toHaveAttribute(
            'aria-checked',
            'true',
          ),
        );

        // Now resolve PATCH with 500 → toggleFailed → rollback.
        resolvePatch(
          jsonResponse(
            { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
            { status: 500 },
          ),
        );

        await waitFor(() =>
          expect(screen.getByRole('checkbox', { name: seed.text })).toHaveAttribute(
            'aria-checked',
            'false',
          ),
        );
      });
    });
    ```

  - [x] **Why `screen.findByRole('checkbox', { name: seed.text })` (not `findByTestId`)** — Stresses the accessible-name path that Story 2.6's `aria-labelledby` is supposed to enable. If the labelling regresses, the test fails for the right reason.
  - [x] **Why use a deferred PATCH promise for the rollback test** — Same pattern as the `addFailed` rollback in Story 2.5's `TodoApp.test.tsx` ([TodoApp.test.tsx:68-106](../../apps/web/src/components/TodoApp.test.tsx#L68-L106)): a synchronously-resolved 500 mock would let the `toggleFailed` microtask flush before the test's first DOM poll, making the optimistic state unobservable. Capturing `resolve` and calling it AFTER the optimistic assertion keeps the transient state visible.
  - [x] **Why import `waitFor`** — `waitFor` polls until the assertion passes (or times out). The `aria-checked` attribute change is observable only after a React commit + Radix re-render; `findBy*` variants don't take an attribute predicate. Add `waitFor` to the existing top-of-file imports: `import { render, screen, waitFor, within } from '@testing-library/react';`.
  - [x] **Why no XSS test in the toggle journey** — Story 2.5's create journey already exercises the `<script>` text path through the same render pipeline. Re-asserting it on toggle is redundant; the text isn't re-parsed on toggle.
  - [x] **Why no "rapid double-toggle" test** — The reducer's same-value no-op guard ([reducer.ts:93](../../apps/web/src/lib/reducer.ts#L93)) plus Radix's debounced state make this a reducer-level concern (covered in Story 2.4's reducer tests). Adding a journey test for it would test the wrong layer.
  - [x] **Watch-out:** Do NOT add a `consoleErrorSpy`/`consoleWarnSpy` strict afterEach to `TodoApp.test.tsx`. Story 2.5 deliberately did not — the rollback path in 2.5 had a similar reasoning ([2-5 Task 6 watch-out](./2-5-create-todo-via-todoinput-full-vertical-slice.md#L769)). The toggle journey is symmetric.
  - [x] **Watch-out:** Do NOT mock `crypto.randomUUID` or `Date.now`. The toggle journey treats both as black boxes.

- [x] **Task 10: Sanity gates**
  - [x] `npm run lint` — must report 0 warnings, 0 errors. Note: removing the `eslint-disable-next-line jsx-a11y/role-supports-aria-props` comment from `TodoItem.tsx` (along with the `aria-checked` attribute on `<li>`) should leave ESLint green; verify.
  - [x] `npm run typecheck` — must report 0 errors. The new `onToggle: (id: string, nextCompleted: boolean) => void` prop is required-up-the-chain; any caller that forgot to wire it fails type-check.
  - [x] `npm run test` — runs unit tests across all workspaces. Web tests should jump from 66 → ~80–86. Approximate breakdown: existing 66 pass unchanged, +6 in `api.test.ts` for `updateTodo`, ~5 new in `TodoItem.test.tsx` for toggle behavior (the 5 existing-but-modified tests already passed at 5 tests), +2 in `TodoApp.test.tsx` for the toggle journey. Exact count may drift slightly; ±2 is acceptable.
  - [x] **Verify `@radix-ui/react-checkbox` resolves** — run `node -e "console.log(require.resolve('@radix-ui/react-checkbox'))"` from `apps/web/`. If it errors, re-run the install from Task 1.
  - [x] No new ESLint rules required. No new TypeScript options required. No new env vars.

- [x] **Task 11: Commit**
  - [x] Stage exactly:
    - **Modified:** [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts), [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts), [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx), [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx), [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx), [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx), [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx), [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx).
    - **Modified:** [apps/web/package.json](../../apps/web/package.json) (added `@radix-ui/react-checkbox` to dependencies), root `package-lock.json` (refreshed for new dep).
  - [x] Commit message: `feat(web): toggle completion via Radix Checkbox (Story 2.6)`
  - [x] **Do NOT** stage anything in `_bmad-output/`, `node_modules/`, `.env*`, `apps/api/**`, `packages/shared/**`, or any other untouched component file.
  - [x] Record commit hash in the Change Log when the user runs the commit.

## Dev Notes

### Where this story sits

Story 2.6 is the third user-facing slice of Epic 2 (Todo Core Loop) and the second mutation vertical slice. It mirrors Story 2.5's three-layer shape (api wrapper → presentational component update → `<TodoApp>` orchestration → tests):

- Story 2.5 shipped `addOptimistic` / `addReconcile` / `addFailed` end-to-end via `<TodoInput>`.
- Story 2.6 ships `toggleOptimistic` / `toggleFailed` end-to-end via the Radix Checkbox in `<TodoItem>`.
- Story 2.7 will ship `deleteOptimistic` / `deleteFailed` end-to-end via a delete button in `<TodoItem>`.

After this story:

- The user can click a checkbox on any non-pending row to toggle completion; the change is visible instantly and reconciles when the server returns.
- The reducer's `toggleOptimistic` / `toggleFailed` actions are exercised end-to-end (Story 2.4 shipped them; 2.6 is their first consumer).
- `apps/web/src/lib/api.ts` exports `getTodos`, `createTodo`, and `updateTodo`.
- `<TodoItem>` becomes the row's interactive surface (it was a read-only span row through Story 1.9 + 2.5).
- The web test count moves from 66 → ~80–86.

This story does NOT touch:

- The API (Stories 2.1–2.3 closed it; PATCH /todos/:id with LWW semantics is at [todos.ts:72-92](../../apps/api/src/routes/todos.ts#L72-L92)).
- The reducer (Story 2.4 closed it).
- `<TodoInput>` (Story 2.5 closed it).
- Toast / user-facing error surfaces (Story 3.2).
- The unhandled-rejection safety net (NFR9 — Story 3.5).
- The delete button on `<TodoItem>` (Story 2.7).

### Critical architectural guardrails

1. **TodoApp is the only stateful component.** [architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631) — "TodoApp is the only stateful component. It owns the reducer and all api.ts calls. … TodoInput, TodoList, TodoItem, Toast are presentational; they receive props and emit callbacks." `<TodoItem>` MUST NOT import from `@/lib/api` or `@/lib/reducer` (it MAY import the `TodoEntry` type from `@/lib/reducer` — that's a type-level reference, not a runtime dependency).
2. **All client-server traffic goes through `apps/web/src/lib/api.ts`.** [architecture.md:382](../../_bmad-output/planning-artifacts/architecture.md#L382) — "All requests go through apps/web/src/lib/api.ts. Components never call raw fetch." `<TodoApp>`'s `handleToggle` calls `updateTodo(id, completed)`, NOT a raw `fetch`.
3. **Every outgoing request carries `x-request-id`.** [architecture.md:383](../../_bmad-output/planning-artifacts/architecture.md#L383) — "client UUID per request; server echoes it back for correlation." Mirror the `getTodos` / `createTodo` pattern.
4. **Server is the validation authority.** [architecture.md:421-424](../../_bmad-output/planning-artifacts/architecture.md#L421-L424) — `UpdateTodoRequestSchema` validates `{ completed: boolean }` on the server. The client sends a plain boolean; we don't type-check it ourselves (TypeScript already does).
5. **Output escaping via React JSX.** [architecture.md:215-216](../../_bmad-output/planning-artifacts/architecture.md#L215-L216) — `<TodoItem>`'s `{todo.text}` rendering is the only escape boundary. Don't introduce HTML-rendering code paths. The label span keeps the same `{todo.text}` JSX expression.
6. **Color is not the only signal.** FR32 / NFR12 ([prd.md:324](../../_bmad-output/planning-artifacts/prd.md#L324), [prd.md:348](../../_bmad-output/planning-artifacts/prd.md#L348)) — completion state must be conveyed to AT via more than color. The story hits this with TWO signals: `aria-checked` (Radix-supplied) AND `line-through` text decoration.
7. **Tap target ≥ 44 × 44 px.** NFR14 ([prd.md:350](../../_bmad-output/planning-artifacts/prd.md#L350)) — Tailwind `h-11 w-11` on `Checkbox.Root` (the only interactive element on this row) satisfies this.
8. **Bundle budget.** [architecture.md:266](../../_bmad-output/planning-artifacts/architecture.md#L266) — ≤200 KB gzipped initial JS. `@radix-ui/react-checkbox` is ~3 KB gzipped (the package's published bundle plus its 2-3 internal Radix Primitive deps that React 19 deduplicates). Comfortably within budget.
9. **No retry loops.** [architecture.md:417-418](../../_bmad-output/planning-artifacts/architecture.md#L417-L418) — Toggle rollback is the v1 surface for failed PATCH; user retries by re-clicking. Toast (Story 3.2) will surface the message; FR19 / Story 3.3 input preservation does not apply to toggle (no input to preserve).
10. **Optimistic actions are no-ops outside `success`.** Story 2.4 AC #11 — `toggleOptimistic` / `toggleFailed` do nothing when `state.status !== 'success'`. AC #9's `<TodoApp>` guard adds a UI-level early-return so we don't issue a wasted PATCH; belt-and-suspenders.

### Why presentational `<TodoItem>` (vs. self-contained smart row)

The epic AC text reads "the component dispatches `toggleOptimistic`… and calls `api.updateTodo`" — which sounds like all of that lives in `<TodoItem>`. But the architecture pin ([architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631)) and the data-flow narrative make it clear: `<TodoApp>` owns the reducer + side effects; `<TodoItem>` owns only the click → callback wiring.

Resolution applied in this story:

- `<TodoItem>` owns: rendering the Radix Checkbox + label, mapping click/Space to `onCheckedChange` → `onToggle(id, next)`, the `pending`-driven disabled state.
- `<TodoApp>` owns: capturing `previousCompleted` from current state, dispatching `toggleOptimistic`, calling `api.updateTodo`, dispatching `addReconcile` on success or `toggleFailed` on rejection.

This split makes `<TodoItem>` trivially testable (no fetch mock needed, no env stub needed, just `vi.fn()` for `onToggle`). It also makes the rejection path testable in isolation at the `<TodoApp>` level via `vi.stubGlobal('fetch', ...)`. Story 2.5 used the same pattern for create — Story 2.6 deliberately mirrors it for symmetry and review-time grep-friendliness.

### Why `addReconcile` for toggle's success path (and not a new `toggleReconcile` action)

Story 2.4 deliberately did NOT define a `toggleReconcile` action — see [reducer.ts:17-33](../../apps/web/src/lib/reducer.ts#L17-L33). The reasoning: `addReconcile`'s reducer logic is "find by id (which is the tempId at dispatch time), replace at same index" ([reducer.ts:67-77](../../apps/web/src/lib/reducer.ts#L67-L77)). For toggle's success path, that's exactly what we need: take the server's authoritative entry (with the now-confirmed `completed` value, the server's `createdAt` echoed back, etc.) and replace ours.

The `tempId` parameter name on `addReconcile` is misleading for the toggle case — it's just the row's id, which never changed for toggle (toggle doesn't introduce a temp id; it operates on a server-already-known id). Reusing the action keeps the reducer surface minimal and the wire-confirmed-shape semantics consistent.

If a future need emerges (e.g., toggle response should NOT replace position, only update fields), a new `toggleReconcile` action can be added — Story 2.4's discriminated-union exhaustiveness pin ([reducer.ts:130-136](../../apps/web/src/lib/reducer.ts#L130-L136)) would force a new case.

### Why `previousCompleted` is captured at the call site (not derived in the reducer)

Story 2.4 AC #6 ([2-4-reducer-extensions-for-optimistic-mutations.md:48-50](./2-4-reducer-extensions-for-optimistic-mutations.md#L48-L50)) made this the explicit contract: by the time `toggleFailed` arrives, `toggleOptimistic` has already mutated `completed` in state. The reducer cannot reconstruct the prior value — it has to be passed in.

`<TodoApp>`'s `handleToggle` reads `target.completed` from `state.todos` BEFORE dispatching `toggleOptimistic`, then closes over that value in the rejection callback. Pure entropy push: `<TodoApp>` knows the prior value, so `<TodoApp>` carries it.

### Why the `useCallback` deps for `handleToggle` are `[state.status, state.todos]`

Unlike `handleAdd` (which only dispatches and never reads state), `handleToggle` reads `state.todos` to look up `previousCompleted`. The closure captures whatever `state.todos` was at render time. With deps `[]`, the callback would close over the initial empty array forever and every toggle would set `previousCompleted: undefined` — breaking the rollback contract.

`state.status` in the deps is technically redundant (it always changes alongside `state.todos`'s reference identity) but documents the load-status guard. If the test suite ever reorders effects in a way that changes `state.todos` without changing `state.status` (e.g., a future selector pattern), keeping `state.status` in the deps prevents a subtle regression.

### Why no `aria-busy` / "in-flight" visual on the checkbox

Per Story 2.5's reasoning ([2-5 Dev Notes "Why no `aria-busy`"](./2-5-create-todo-via-todoinput-full-vertical-slice.md#L924-L928)): the in-flight window between optimistic dispatch and reconcile is microtask-short under normal conditions (≤100 ms perceived per NFR1; actual API latency ≤300 ms p95 per NFR2). A "busy" state would create UI flicker for sub-perceptual durations. The user gets the optimistic checked-state immediately; that's the v1 contract.

A future polish pass could add a subtle "saving…" indicator on rows whose toggle is taking >500 ms, but that's not in scope here.

### Why no `aria-busy` on the row-list either

Architecture's anti-spinner rule ([architecture.md:413-414](../../_bmad-output/planning-artifacts/architecture.md#L413-L414)): "Never show a spinner over an existing populated list. Spinners are for empty-state initial load only." A toggle is a per-row mutation; no list-wide spinner.

### Why Radix Checkbox (vs. native `<input type="checkbox">`)

Decision pinned in Architecture ([architecture.md:189](../../_bmad-output/planning-artifacts/architecture.md#L189), [architecture.md:253](../../_bmad-output/planning-artifacts/architecture.md#L253)): "Radix UI primitives for `Checkbox` and `Toast`; native HTML for input and button; Tailwind for styling." Native checkbox would be smaller (zero deps) but:

- Native checkboxes are notoriously hard to style consistently across browsers — Tailwind's pseudo-element approach works but produces brittle CSS.
- Radix Checkbox supplies the `data-state` attribute that drives `data-[state=checked]:bg-current/20` Tailwind variant — clean, declarative, no custom CSS.
- Radix's `onCheckedChange` is the high-level state callback; native's `onChange` requires reading `event.currentTarget.checked` and managing the controlled-vs-uncontrolled DOM idiom yourself.
- Architecture had this debate up-front; Radix won for the consistent styling + the `Toast` primitive Story 3.1 will install. Toast pulls the bigger Radix dep anyway, so adding Checkbox here is incremental.

Radix Toast ships a different package (`@radix-ui/react-toast`, Story 3.1's responsibility); Story 2.6 only needs Checkbox.

### Why `useId()` for the label

`<TodoList>` renders many `<TodoItem>` instances; each row needs a unique `aria-labelledby` target. `useId()` is React 18+'s SSR-safe id generator; it works with React 19 + Next 16 App Router. The id is opaque (`:r2:` etc.) and stable per render tree but unique per component instance.

Hard-coding a string id (e.g., `'todo-item-text'`) would collide on every row beyond the first. Concatenating `todo.id` would work but couples the DOM id to the entity's primary key — `useId` is the idiomatic React solution.

### Why Tailwind v4 `data-[state=checked]:bg-current/20` works for Radix state

Radix Primitives set `data-state="checked" | "unchecked" | "indeterminate"` on their root elements. Tailwind v4's data-attribute variant `data-[state=checked]:bg-current/20` compiles to a CSS selector matching that attribute — no custom plugin needed. Browser baseline (Chrome 111+, Safari 16.4+, Firefox 113+ per [apps/web/AGENTS.md](../../apps/web/AGENTS.md)) supports `[attribute=value]` selectors universally.

The pattern composes with `:focus-visible` and `:disabled` variants, which is why the className stays a single string.

### Why `<span aria-hidden="true">✓</span>` for the indicator glyph

The `Checkbox.Indicator` is rendered ONLY when `checked === true` (Radix's contract). The contained span is a sighted-user-only check glyph; AT users get the `aria-checked="true"` from the `Checkbox.Root`. Without `aria-hidden`, some screen readers would announce "check mark" or "U+2713" alongside the checked-state announcement — duplicate signal, not value-add.

The Unicode `✓` (U+2713 CHECK MARK) is a single code point. No icon library, no SVG, no font swap — Tailwind's default font stack renders it consistently across the supported browser baseline.

### Why no client-side debounce on rapid checkbox toggles

The reducer's `toggleOptimistic` and `toggleFailed` already no-op on same-value transitions ([reducer.ts:93](../../apps/web/src/lib/reducer.ts#L93), [reducer.ts:105](../../apps/web/src/lib/reducer.ts#L105)). Radix's checkbox emits `onCheckedChange` only on actual state transitions (click on already-checked → it goes to unchecked, then back to checked = two events; rapid clicks generate one event per actual transition). A debounce would mask legitimate user intent (toggle, untoggle, retoggle) for no correctness gain.

For the multi-tab concurrent-PATCH case (two tabs both observe `completed: false`, both toggle to `true`): the server's PATCH handler is idempotent ([Story 2.2 AC #2](./2-2-patch-todos-id-endpoint-with-lww-semantics.md#L21-L25)) — `completed: true` twice on a row already true is harmless. Last write wins; the second tab's PATCH is structurally a no-op at the DB level but returns 200 with the current state. Both tabs reconcile to the same value.

### What changes in the codebase

| File | Change | LOC delta (approx.) |
|------|--------|---------------------|
| [apps/web/package.json](../../apps/web/package.json) | Add `@radix-ui/react-checkbox` to dependencies | +1 |
| (root) `package-lock.json` | Refresh for new dep + transitive Radix utils | (auto) |
| [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) | Add `updateTodo(id, completed, signal?)` after `createTodo` | +40 / -0 |
| [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) | Append `describe('updateTodo()', ...)` block (~6 new tests) | +110 / -0 |
| [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx) | Replace read-only span with Radix Checkbox + labeled text; add `onToggle` prop; type as `TodoEntry`; remove invalid `aria-checked` on `<li>` | +30 / -10 |
| [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx) | Replace "no interactive affordances" assertion; add toggle-click / Space / Enter / pending-disabled cases; pass `onToggle={vi.fn()}` to existing renders | +80 / -10 |
| [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx) | Add required `onToggle` prop; thread to each `<TodoItem>` | +3 / -1 |
| [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx) | Add `onToggle={vi.fn()}` to every `render(<TodoList ... />)` call | +N / -0 (mechanical) |
| [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) | Import `updateTodo`; add `handleToggle` `useCallback`; pass to `<TodoList>` | +25 / -1 |
| [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx) | Append toggle journey describe block (happy + rollback) | +90 / -0 |

Total: ~+380 added LOC across 8 source files (0 new files; all extensions/modifications of existing). One new runtime dep.

### Out-of-scope (do NOT do in this story)

- `apps/web/src/lib/api.ts` `deleteTodo` — Story 2.7.
- A delete button on `<TodoItem>` — Story 2.7.
- Toast UI for failed toggle — Story 3.2.
- Visible "saving…" / `aria-busy` indicator on in-flight rows — never (sub-perceptual window per NFR1/NFR2).
- A `toggleReconcile` reducer action — explicitly retired by Story 2.4's design (reuse `addReconcile`).
- Disabling all checkboxes during initial-load `loadStart` — handled implicitly: when `state.status !== 'success'`, the populated branch of `<TodoList>` doesn't render (loading/error branches show instead). No items, no checkboxes.
- Server-side optimistic concurrency / `If-Match` / `ETag` — never (architecture: LWW only).
- Client-side debounce — never (reducer no-ops same-value transitions).
- Indeterminate-state UI — never in v1; Radix supports it but the reducer has no notion.

### Project Structure Notes

The change is scoped to `apps/web/`:

```text
apps/web/
├── package.json                 # ← extended: + @radix-ui/react-checkbox in dependencies
└── src/
    ├── components/
    │   ├── TodoApp.tsx          # ← extended: + updateTodo import, + handleToggle useCallback, + onToggle to <TodoList>
    │   ├── TodoApp.test.tsx     # ← extended: + describe('toggle journey', ...) block (happy + rollback)
    │   ├── TodoInput.tsx        # (unchanged from Story 2.5)
    │   ├── TodoInput.test.tsx   # (unchanged from Story 2.5)
    │   ├── TodoItem.tsx         # ← REPLACED: Radix Checkbox + labeled text; +onToggle prop; TodoEntry type
    │   ├── TodoItem.test.tsx    # ← REPLACED: removes "no affordances" stub; +5 toggle behavior cases
    │   ├── TodoList.tsx         # ← extended: + required onToggle prop, thread to <TodoItem>
    │   └── TodoList.test.tsx    # ← mechanical: + onToggle={vi.fn()} on every render() call
    └── lib/
        ├── api.ts               # ← extended: + updateTodo(id, completed, signal?)
        ├── api.test.ts          # ← extended: + describe('updateTodo()', ...) block
        ├── errors.ts            # (unchanged)
        ├── reducer.ts           # (unchanged from Story 2.4 — toggleOptimistic / toggleFailed already in place)
        └── reducer.test.ts      # (unchanged from Story 2.4)
```

Architecture's "non-component files: camelCase.ts" / "React component files: PascalCase.tsx" naming ([architecture.md:338-339](../../_bmad-output/planning-artifacts/architecture.md#L338-L339)) is satisfied. Co-located tests rule ([architecture.md:351](../../_bmad-output/planning-artifacts/architecture.md#L351)) is satisfied. No `__tests__/` directories introduced. No new `lib/` modules.

### Testing Requirements

- **Unit / component tests:** mandatory across four files:
  - `apps/web/src/lib/api.test.ts` — `updateTodo` coverage (~6 tests).
  - `apps/web/src/components/TodoItem.test.tsx` — Radix Checkbox behavior (~5 new + 5 existing-modified).
  - `apps/web/src/components/TodoList.test.tsx` — mechanical update (no new behavior tests).
  - `apps/web/src/components/TodoApp.test.tsx` — toggle journey (~2 new tests).
- **Integration tests:** none in this story (no API changes; PATCH already covered by Story 2.2's [todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) + [concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts)).
- **E2E tests:** none in this story (Epic 3 ships journey-level resilience tests per [epics.md:1222-1287](../../_bmad-output/planning-artifacts/epics.md#L1222-L1287)).
- **Test runner:** Vitest with jsdom (already configured at [vitest.config.mts](../../apps/web/vitest.config.mts)).
- **User-event library:** `@testing-library/user-event` (Story 2.5 added it as a devDep at version `^14.6.1`; verify presence with `node -e "require.resolve('@testing-library/user-event')"`).
- **Coverage gate:** none in v1.
- **Test isolation:** each test sets up its own fetch mock and dispatches its own actions. No shared state. The `vi.stubEnv` + `vi.resetModules()` lifecycle from `api.test.ts` is inherited by `TodoApp.test.tsx`.

### Library / version pins (April 2026)

These are already installed and pinned by Stories 1.7 / 1.8 / 1.9 / 2.4 / 2.5; do NOT bump them:

- `react@19.2.4`, `react-dom@19.2.4`
- `next@16.2.4` (CSR-only via `'use client'`)
- `vitest@^2.1.0`, `@testing-library/react@^16.3.0`, `@testing-library/jest-dom@^6.9.0`, `@testing-library/user-event@^14.6.1`, `jsdom@^29.0.0`
- `@todo-app/shared` (workspace dep) — `Todo`, `TodoSchema`, `UpdateTodoRequestSchema` types
- `typescript@^5`

NEW dep (runtime, not devDep — ships with bundle):

- `@radix-ui/react-checkbox` — pin to `^1.3.3` (latest 1.x stable as of April 2026). Bundle impact: ~3 KB gzipped including transitive Radix Primitives utilities (Slot, Compose-refs, etc., which Radix de-duplicates internally). Comfortably within the NFR4 200 KB bundle budget.

### Story 2.5 + 2.4 patterns to mirror (verbatim, where applicable)

- **`api.ts` fetch wrapper shape** — Story 1.8 / 2.5 established: explicit env-presence check at module load, named export, `(args..., signal?)` signature, header set including `x-request-id`, `if (!response.ok) throw await ApiError.fromResponse(response)`, then capture `responseRequestId`, then JSON parse with try/catch synthetic error, then schema parse with safeParse synthetic error, then return parsed data. Mirror this 1:1.
- **`api.test.ts` mock-fetch lifecycle** — `vi.stubEnv` + `vi.resetModules()` in `beforeEach`; `vi.restoreAllMocks()` + `vi.unstubAllEnvs()` + `vi.unstubAllGlobals()` in `afterEach`; `mockFetchOnce` helper; `await import('./api')` inside each test. Mirror.
- **Component test file shape** — `consoleErrorSpy` + `consoleWarnSpy` in `beforeEach`/`afterEach` (from [TodoList.test.tsx:21-32](../../apps/web/src/components/TodoList.test.tsx#L21-L32) and [TodoInput.test.tsx](../../apps/web/src/components/TodoInput.test.tsx)). Mirror in `TodoItem.test.tsx`. **Do NOT** mirror in `TodoApp.test.tsx` — Story 2.5 deliberately left it off there (rejection paths can fire async warnings; strict console assertions would mask the bug under test).
- **Optimistic action dispatch shape** — `dispatch({ type: 'toggleOptimistic', payload: { id, completed } })`. Story 2.4 pinned the payload shapes; do not deviate.
- **`useCallback` for stable handler identity** — Mirror Story 2.5's `handleAdd` ([TodoApp.tsx:57-69](../../apps/web/src/components/TodoApp.tsx#L57-L69)). Difference: `handleToggle`'s deps are non-empty.
- **`.then(onSuccess, onReject)` two-arg form** — Mirror the existing `handleAdd` pattern.
- **Reuse of `addReconcile` for mutation success** — Mirror Story 2.5's reconcile path; the action's "find by id, replace at same index" semantics fit toggle's success identically.

### Story 2.4 deferred items relevant to this story

- **`loadStart` clobbers pending optimistic entries** ([deferred-work.md:20](./deferred-work.md#L20)) — Today, `loadStart` only fires on initial mount. Story 2.6 doesn't add new `loadStart` triggers, so the hazard remains dormant. Story 3.4 (initial-load error recovery + retry button) is where this becomes load-bearing.
- **Visibility refetch races optimistic POST** ([deferred-work.md:9](./deferred-work.md#L9)) — Same race exists for toggle: a visibility-driven `loadSuccess` while a PATCH is in flight will replace `state.todos`, and the resolving `addReconcile` will no-op. Same Epic 3 territory; do not pre-empt here.
- **`aria-checked` on `<li role="listitem">` is invalid ARIA** ([deferred-work.md:105](./deferred-work.md#L105)) — Explicitly retired by THIS story. Task 4 removes both the `aria-checked` attribute AND the `eslint-disable-next-line jsx-a11y/role-supports-aria-props` comment.

### What `<TodoItem>` looks like in HTML (for DOM-test reference)

For an active todo (`completed: false`, not pending):

```html
<li
  data-testid="todo-item"
  data-completed="false"
  class="flex items-start gap-3 rounded-md border border-current/10 px-4 py-3"
>
  <button
    type="button"
    role="checkbox"
    aria-checked="false"
    aria-labelledby=":r1:"
    data-testid="todo-item-checkbox"
    data-state="unchecked"
    class="mt-0.5 inline-flex h-11 w-11 shrink-0 …"
  >
    <!-- Checkbox.Indicator does NOT render its children when unchecked -->
  </button>
  <span
    id=":r1:"
    data-testid="todo-item-text"
    class="flex-1 break-words text-base leading-6"
  >
    pick up milk
  </span>
</li>
```

For a completed todo (`completed: true`, not pending), the `<button>` becomes `aria-checked="true"` / `data-state="checked"` and includes the indicator span; the text span gains `line-through` and `opacity-60`. For a pending todo, the `<button>` becomes `disabled` with `data-disabled` and the disabled Tailwind variants kick in.

The `id=":r1:"` is React's `useId()` output — opaque, stable per render tree. Tests should use `getByRole('checkbox', { name: ... })` (matches via `aria-labelledby` resolution) rather than asserting on the exact id string.

### References

- **Architecture:**
  - State management + reducer actions: [architecture.md:248](../../_bmad-output/planning-artifacts/architecture.md#L248).
  - Frontend Architecture (Radix Checkbox + Tailwind, color-independent state): [architecture.md:189](../../_bmad-output/planning-artifacts/architecture.md#L189), [architecture.md:252-256](../../_bmad-output/planning-artifacts/architecture.md#L252-L256).
  - Component organization (TodoApp = stateful, others presentational): [architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631).
  - Validation timing (server is the authority): [architecture.md:421-424](../../_bmad-output/planning-artifacts/architecture.md#L421-L424).
  - All requests through `api.ts`: [architecture.md:382-383](../../_bmad-output/planning-artifacts/architecture.md#L382-L383).
  - PATCH endpoint contract + LWW: [architecture.md:230](../../_bmad-output/planning-artifacts/architecture.md#L230), [architecture.md:240](../../_bmad-output/planning-artifacts/architecture.md#L240).
  - Format patterns (single-resource bare entity for PATCH 200): [architecture.md:365-367](../../_bmad-output/planning-artifacts/architecture.md#L365-L367).
  - XSS prevention (React JSX escaping): [architecture.md:215-216](../../_bmad-output/planning-artifacts/architecture.md#L215-L216), [architecture.md:435](../../_bmad-output/planning-artifacts/architecture.md#L435).
  - Anti-patterns (raw `fetch`): [architecture.md:475-490](../../_bmad-output/planning-artifacts/architecture.md#L475-L490).
  - Bundle budget: [architecture.md:266](../../_bmad-output/planning-artifacts/architecture.md#L266).
  - No retries: [architecture.md:417-418](../../_bmad-output/planning-artifacts/architecture.md#L417-L418).
  - No spinners over populated lists: [architecture.md:413-414](../../_bmad-output/planning-artifacts/architecture.md#L413-L414).
- **PRD:**
  - FR2 (mark active → completed): [prd.md:279](../../_bmad-output/planning-artifacts/prd.md#L279).
  - FR3 (mark completed → not completed): [prd.md:280](../../_bmad-output/planning-artifacts/prd.md#L280).
  - FR9 (active + completed visually distinguishable): [prd.md:289](../../_bmad-output/planning-artifacts/prd.md#L289).
  - FR24 (backend update operation — server-side, already shipped): [prd.md:313](../../_bmad-output/planning-artifacts/prd.md#L313).
  - FR32 (state via more than color, AT-readable): [prd.md:324](../../_bmad-output/planning-artifacts/prd.md#L324).
  - NFR10–NFR14 (a11y, focus, tap target): [prd.md:346-350](../../_bmad-output/planning-artifacts/prd.md#L346-L350).
  - NFR12 (color-independent state to AT): [prd.md:348](../../_bmad-output/planning-artifacts/prd.md#L348).
  - NFR14 (44 × 44 tap target): [prd.md:350](../../_bmad-output/planning-artifacts/prd.md#L350).
- **Epics:**
  - Story 2.6 full text: [epics.md:921-965](../../_bmad-output/planning-artifacts/epics.md#L921-L965).
  - Story 2.4 (predecessor — reducer toggle actions): [epics.md:824-874](../../_bmad-output/planning-artifacts/epics.md#L824-L874).
  - Story 2.5 (predecessor — create vertical slice and the orchestration template): [epics.md:876-919](../../_bmad-output/planning-artifacts/epics.md#L876-L919).
  - Story 2.7 (successor — delete via button): [epics.md:967-1014](../../_bmad-output/planning-artifacts/epics.md#L967-L1014).
  - Story 3.2 (Toast for mutation failures): [epics.md:1064-1106](../../_bmad-output/planning-artifacts/epics.md#L1064-L1106).
- **Prior stories (patterns to mirror):**
  - Story 1.8 (api.ts + load reducer + ApiError): [_bmad-output/implementation-artifacts/1-8-typed-api-client-error-types-and-load-reducer.md](./1-8-typed-api-client-error-types-and-load-reducer.md). Sets the api.ts wrapper shape and api.test.ts lifecycle.
  - Story 1.9 (TodoList rendering states + read-only TodoItem): [_bmad-output/implementation-artifacts/1-9-render-list-states-loading-empty-populated-read-only.md](./1-9-render-list-states-loading-empty-populated-read-only.md). Sets the component-test file shape; the `aria-checked` on `<li>` is the placeholder this story retires.
  - Story 2.2 (PATCH /todos/:id endpoint + LWW): [_bmad-output/implementation-artifacts/2-2-patch-todos-id-endpoint-with-lww-semantics.md](./2-2-patch-todos-id-endpoint-with-lww-semantics.md). Server-side authority for PATCH shape, validation, error envelopes, idempotency.
  - Story 2.4 (reducer optimistic actions including toggleOptimistic / toggleFailed): [_bmad-output/implementation-artifacts/2-4-reducer-extensions-for-optimistic-mutations.md](./2-4-reducer-extensions-for-optimistic-mutations.md). All seven action shapes; pure-function semantics; the `toggleOptimistic` / `toggleFailed` pair consumed by this story.
  - Story 2.5 (create vertical slice — orchestration template for this story): [_bmad-output/implementation-artifacts/2-5-create-todo-via-todoinput-full-vertical-slice.md](./2-5-create-todo-via-todoinput-full-vertical-slice.md). The three-layer shape (api wrapper → presentational component → TodoApp callback → tests) that 2.6 mirrors.
- **Source files (current state):**
  - [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) — extend with `updateTodo`.
  - [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) — extend with `updateTodo` describe block.
  - [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts) — DO NOT modify; provides `toggleOptimistic`/`toggleFailed`/`addReconcile` actions consumed by `TodoApp.handleToggle`.
  - [apps/web/src/lib/errors.ts](../../apps/web/src/lib/errors.ts) — DO NOT modify; `ApiError` is consumed by `updateTodo` via `ApiError.fromResponse`.
  - [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) — extend with `handleToggle` + thread to `<TodoList>`.
  - [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx) — extend with required `onToggle` prop.
  - [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx) — REPLACE rendering with Radix Checkbox + labeled text; remove invalid `<li>` `aria-checked`.
  - [apps/web/src/components/TodoInput.tsx](../../apps/web/src/components/TodoInput.tsx) — DO NOT modify; Story 2.5 closed it.
  - [packages/shared/src/contracts.ts](../../packages/shared/src/contracts.ts) — DO NOT modify; `TodoSchema` and `UpdateTodoRequestSchema` are the contract.
- **Server-side prior art (reference only — DO NOT modify):**
  - [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) — PATCH /todos/:id handler at lines 72-92.
  - [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) — PATCH happy-path + 404 + 400 + idempotent cases.
  - [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts) — LWW proof for parallel PATCHes.
- **Web-app conventions (Next 16 / Tailwind v4 quirks):**
  - [apps/web/AGENTS.md](../../apps/web/AGENTS.md) — Tailwind v4 `border-current/10` browser baseline (Chrome 111+ / Safari 16.4+ / Firefox 113+); `data-[state=...]` attribute variants are zero-config in v4.
- **Deferred-work items closed by this story:**
  - [deferred-work.md:105](./deferred-work.md#L105) — `aria-checked` on `<li role="listitem">` retired (Task 4 removes the attribute and the eslint-disable comment).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Anthropic Claude Opus 4.7, 1M context)

### Debug Log References

- `npm install --save --workspace apps/web @radix-ui/react-checkbox` → added 12 packages, `@radix-ui/react-checkbox@^1.3.3` resolved to `/node_modules/@radix-ui/react-checkbox/dist/index.js`.
- `npm run lint` from repo root → 0 warnings/errors.
- `npm run typecheck` from repo root → 0 errors across `typecheck:shared`, `typecheck:api`, `typecheck:web`.
- `npm run test` from repo root → web 79/79 (was 66/66; +13: api +6, TodoItem +5, TodoApp +2), api 4/4 (unchanged).

### Completion Notes List

- Story 2.6 ships toggle via Radix Checkbox end-to-end (api wrapper → presentational `<TodoItem>` rewrite → `<TodoApp>` orchestration → tests), mirroring Story 2.5's three-layer shape verbatim.
- `updateTodo(id, completed, signal?)` mirrors `createTodo` line-for-line (env-loaded URL, `x-request-id` header, `safeParse` envelope, synthetic `ApiError` for malformed-JSON / contract-drift, `ApiError.fromResponse` for non-OK envelopes).
- `<TodoItem>` rewritten to host `Checkbox.Root` + `Checkbox.Indicator`; props widened from `Todo` to `TodoEntry`; `onToggle` is a required prop; `aria-labelledby` points to a `useId()`-stable `<span id>` that wraps the todo text. Removed the invalid `aria-checked` on `<li role="listitem">` and the `eslint-disable jsx-a11y/role-supports-aria-props` comment per [deferred-work.md:105](./deferred-work.md#L105).
- `<TodoApp>.handleToggle` captures `previousCompleted` from `state.todos` BEFORE dispatching `toggleOptimistic`, calls `api.updateTodo`, dispatches `addReconcile` on success or `toggleFailed` on rejection. Includes belt-and-suspenders guards: `state.status !== 'success'` early-return and `target.pending === true` early-return.
- Reused `addReconcile` for toggle's success path (no new `toggleReconcile` action) — Story 2.4 explicitly retired the parallel action.
- Test count moved 66 → 79 (story projected ~80–86; within ±2). Breakdown: api `updateTodo()` describe block (+6); `TodoItem.test.tsx` rewritten with toggle behaviors and `onToggle={vi.fn()}` (5 modified existing + 5 new = 10); `TodoApp.test.tsx` `<TodoApp /> toggle journey` block (+2: happy + rollback).
- Strict `consoleErrorSpy`/`consoleWarnSpy` afterEach preserved in `TodoItem.test.tsx`; deliberately NOT added to `TodoApp.test.tsx` per Story 2.5 reasoning (rejection paths can fire async warnings; strict console assertions would mask the bug under test).
- No deviations from spec. No new dependencies beyond `@radix-ui/react-checkbox` (the planned 1.x runtime add). No bumps to existing pinned versions.

### File List

- Modified: `apps/web/package.json` (+1: `@radix-ui/react-checkbox` to dependencies)
- Modified: `package-lock.json` (auto-refreshed for new dep + transitive Radix Primitives)
- Modified: `apps/web/src/lib/api.ts` (+50 / -0: `updateTodo(id, completed, signal?)` after `createTodo`)
- Modified: `apps/web/src/lib/api.test.ts` (+115 / -0: `describe('updateTodo()', ...)` block — 6 tests)
- Modified: `apps/web/src/components/TodoItem.tsx` (+44 / -22: rewritten — Radix Checkbox + labeled text; `onToggle` required prop; `TodoEntry` type; removed `<li>` `aria-checked` + eslint-disable)
- Modified: `apps/web/src/components/TodoItem.test.tsx` (+90 / -50: rewritten — 10 tests covering aria-checked, click on active/completed, Space, Enter, pending disabled, label association, XSS-as-text, break-words)
- Modified: `apps/web/src/components/TodoList.tsx` (+2 / -1: required `onToggle` prop, threaded to `<TodoItem>`)
- Modified: `apps/web/src/components/TodoList.test.tsx` (+0 / -0 net: mechanical `onToggle={vi.fn()}` on every render — no behavioral assertion changes)
- Modified: `apps/web/src/components/TodoApp.tsx` (+30 / -1: imported `updateTodo`, added `handleToggle` `useCallback` with `[state.status, state.todos]` deps, passed to `<TodoList>`)
- Modified: `apps/web/src/components/TodoApp.test.tsx` (+85 / -0: `waitFor` import; `describe('<TodoApp /> toggle journey', ...)` block — happy path + rollback)
- Modified: `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transitions + last_updated)
- Modified: `_bmad-output/implementation-artifacts/2-6-toggle-completion-via-radix-checkbox.md` (Status, Dev Agent Record, File List, Change Log, all task checkboxes)

### Review Findings

Code-review run on 2026-04-30 against `62d6ae1..HEAD`. Three layers: Blind Hunter (adversarial, diff-only), Edge Case Hunter (path tracer, JSON), Acceptance Auditor (16/16 ACs PASS, no violations). 0 patches, 0 decisions, 5 defers, ~28 dismissed.

- [x] \[Review]\[Defer] Concurrent rapid toggles can produce inconsistent rollback under specific failure interleavings (`apps/web/src/components/TodoApp.tsx:71-99`) — deferred, spec-ratified design (Dev Notes "Why no client-side debounce on rapid checkbox toggles" + "Why no `aria-busy` on the checkbox"). Reducer no-ops same-value transitions and Radix only emits change events on real transitions, so single-flow remains correct; back-to-back true→false→true with mixed PATCH success/failure could leave UI showing the wrong final state. Proper UX for in-flight toggles reserved for a future polish pass.
- [x] \[Review]\[Defer] `fetch()` rejection (network error / DNS / abort) propagates raw `TypeError`/`DOMException`, not `ApiError` (`apps/web/src/lib/api.ts:106-115`) — deferred, pre-existing pattern shared with `getTodos` (`apps/web/src/lib/api.ts:19-26`) and `createTodo` (`apps/web/src/lib/api.ts:61-70`); mirrors `createTodo` per spec line 197. Folds into the api-wrapper hardening pass already noted in Story 2.5's `?? requestId` empty-header / `cause:` chaining deferrals.
- [x] \[Review]\[Defer] Toggle rejection callback swallows the error without logging (`apps/web/src/components/TodoApp.tsx:90-95`) — deferred, mirrors `handleAdd`'s rejection callback (no log) at `apps/web/src/components/TodoApp.tsx:65-67`. Story 3.2 (Toast for mutation failures) is the user-facing surface; Story 3.5 (global unhandled-rejection net) is the larger backstop. Until then, rollback is observable only via the UI revert.
- [x] \[Review]\[Defer] Focus-visible ring uses `current/40` opacity with `outline-none` and no `ring-offset` (`apps/web/src/components/TodoItem.tsx:36`) — deferred, intentional mirror of `<TodoInput>`'s focus-ring (spec AC #3 ratifies). On a row with `border-current/10` neighbors, the 40% foreground ring may have weak contrast against same-color borders in non-default themes. Today the app uses default foreground (black) with high background contrast; theming/contrast hardening is a future a11y polish concern.
- [x] \[Review]\[Defer] `role="checkbox"` `<button>` nested inside `<li>` may double-announce in some screen readers (`apps/web/src/components/TodoItem.tsx:25-56`) — deferred, untested in either direction. Radix's documented `aria-labelledby` label-association pattern was used; some VoiceOver/JAWS list-traversal modes can announce both the list item and the checkbox separately. Real AT testing belongs to a journey-level a11y pass (Epic 3 territory).

## Change Log

| Date       | Change                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-04-30 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Story slot: Epic 2, Story 6 (toggle vertical slice; consumes Story 2.4's `toggleOptimistic`/`toggleFailed` plus `addReconcile`; mirrors Story 2.5's three-layer orchestration; precedes 2.7 delete; retires the Story 1.9 `aria-checked` on `<li>` placeholder). |
| 2026-04-30 | Dev-Story complete via `/bmad-dev-story`. Status: ready-for-dev → in-progress → review. Implemented `updateTodo` + Radix Checkbox in `<TodoItem>` + `handleToggle` in `<TodoApp>`. Added `@radix-ui/react-checkbox@^1.3.3` runtime dep. Lint/typecheck clean; web tests 66 → 79; api tests 4 unchanged. No spec deviations. Source commit: `8361df8`. |
| 2026-04-30 | Code-Review complete via `/bmad-code-review` (range `62d6ae1..HEAD`). Status: review → done. Three layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor (16/16 ACs PASS; no guardrail/watch-out/out-of-scope violations). Triage: 0 decision-needed, 0 patches, 5 deferred, ~28 dismissed as noise. All 5 deferrals are spec-ratified or pre-existing patterns folded into existing hardening backlog (concurrent-toggle race, fetch-rejection envelope, rejection-error logging, focus-ring contrast, checkbox-in-listitem AT announcement). |
