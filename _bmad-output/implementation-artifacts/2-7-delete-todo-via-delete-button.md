# Story 2.7: Delete todo via delete button

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to click a delete button next to any todo (active or completed) to remove it from the shared list,
so that the list can be tidied without reloading (FR4, FR17, FR25, NFR1).

## Acceptance Criteria

1. **Given** [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts),
   **When** `deleteTodo(id: string, signal?: AbortSignal): Promise<void>` is invoked,
   **Then** it issues `DELETE ${process.env.NEXT_PUBLIC_API_URL}/todos/${id}` with method `DELETE`,
   **And** sets headers `accept: application/json` and a freshly generated `x-request-id` (`crypto.randomUUID()`) per call,
   **And** does NOT send a `content-type` header and does NOT include a request body (DELETE has no payload — server's route schema accepts none per [todos.ts:103-107](../../apps/api/src/routes/todos.ts#L103-L107)),
   **And** on `204` resolves with `undefined` WITHOUT calling `response.json()` (a 204 has no body; calling `.json()` would reject with `SyntaxError`),
   **And** on a non-OK response (`!response.ok`) it throws `await ApiError.fromResponse(response)` (mirrors [api.ts:28-30, 72-74, 117-119](../../apps/web/src/lib/api.ts#L28-L30)),
   **And** the function does NOT call `TodoSchema.safeParse` (no body to parse on 204; differs from `getTodos`/`createTodo`/`updateTodo`).

2. **Given** [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx) — extended (NOT replaced) to host a native delete `<button>` after the labeled text span,
   **When** rendered for a `TodoEntry` (Story 2.4's `Todo & { pending?: boolean }` type from [reducer.ts:8](../../apps/web/src/lib/reducer.ts#L8)),
   **Then** the row contains a `<button type="button">` rendered AFTER the existing `<span id={labelId}>` text node and OUTSIDE the `Checkbox.Root` (siblings inside the `<li>` — never nested in the checkbox; `<button>` inside a `role="checkbox"` `<button>` is invalid HTML and breaks AT navigation),
   **And** the button has `aria-label={`Delete: ${todo.text}`}` (AT users get the row's text via the label; sighted users see the glyph),
   **And** the button has `data-testid="todo-item-delete"` (DOM-test probe, mirrors `data-testid="todo-item-checkbox"` from Story 2.6).

3. **Given** the rendered delete button,
   **When** inspected for accessibility,
   **Then** the entire interactive control measures at least 44 × 44 CSS pixels (NFR14 — Tailwind `h-11 w-11` on the `<button>` itself; mirrors the `Checkbox.Root` sizing established in Story 2.6 at [TodoItem.tsx:36](../../apps/web/src/components/TodoItem.tsx#L36)),
   **And** a visible focus indicator renders on `:focus-visible` (`focus-visible:ring-2 focus-visible:ring-current/40` Tailwind classes — mirrors `<TodoInput>`'s focus ring at [TodoInput.tsx:48](../../apps/web/src/components/TodoInput.tsx#L48) and `Checkbox.Root` at [TodoItem.tsx:36](../../apps/web/src/components/TodoItem.tsx#L36)),
   **And** the button is keyboard-operable: `Tab` moves focus to it after the checkbox; `Space` or `Enter` activates it (native `<button>` behavior — both keys; this differs from the Radix Checkbox's Space-only contract, and that's correct for a generic action button per ARIA's button pattern),
   **And** text/icon contrast meets WCAG AA (NFR13).

4. **Given** `<TodoItem>` accepts a NEW prop `onDelete: (id: string) => void`,
   **When** its prop interface is inspected,
   **Then** `TodoItemProps` is extended to `{ todo: TodoEntry; onToggle: (id: string, nextCompleted: boolean) => void; onDelete: (id: string) => void }`,
   **And** the component does NOT import `@/lib/api`, `@/lib/reducer`, or `@/lib/errors` at runtime (presentational-component contract per [architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631) — type-level imports of `TodoEntry` from `@/lib/reducer` are fine, mirrors Story 2.6),
   **And** the component does NOT call `crypto.randomUUID()`, `new Date()`, or `fetch` directly.

5. **Given** a user clicks the delete button (or focuses it and presses `Space` or `Enter`),
   **When** the `onClick` handler fires,
   **Then** the component calls `onDelete(todo.id)` exactly once,
   **And** the click does NOT also trigger `onToggle` (the click target is the delete `<button>`, NOT the `Checkbox.Root`; native click event bubbling does NOT cause Radix to fire `onCheckedChange` because Radix only emits on its own button click),
   **And** no `event.preventDefault()` or `event.stopPropagation()` calls are added (no parent click handlers on the `<li>` exist; the bubbling reaches `<li>` and dies there harmlessly).

6. **Given** a `TodoEntry` with `pending: true` (an optimistic create from Story 2.5 awaiting reconcile),
   **When** `<TodoItem>` renders it,
   **Then** the `<button>` has the `disabled` attribute (cannot DELETE a temp UUID — the server has no row for it, would 404 and roll back),
   **And** the disabled visual state is rendered via Tailwind `disabled:opacity-50 disabled:cursor-not-allowed` (matches the Radix Checkbox's disabled treatment at [TodoItem.tsx:36](../../apps/web/src/components/TodoItem.tsx#L36)),
   **And** clicking, pressing Space, or pressing Enter on the disabled button does NOT call `onDelete` (native `<button disabled>` swallows activation; no extra guard needed).

7. **Given** both active todos (`completed: false`) and completed todos (`completed: true`) exist in the list,
   **When** the user clicks delete on either one,
   **Then** the delete behaves identically regardless of completion state (FR4 — no state-dependent deletion rules),
   **And** the delete button renders for both completion states (no conditional hiding/showing based on `completed`).

8. **Given** [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx),
   **When** the diff is inspected,
   **Then** a new memoized `handleDelete = useCallback((id) => { ... }, [state.status, state.todos])` is defined that:
   - early-returns if `state.status !== 'success'` (belt-and-suspenders; reducer no-ops anyway, but skips a wasted DELETE round trip — mirrors `handleToggle` at [TodoApp.tsx:73](../../apps/web/src/components/TodoApp.tsx#L73)),
   - finds the target todo in `state.todos` by `id` (used to capture `target` and `index` BEFORE dispatch),
   - early-returns if the target is not found OR if `target.pending === true` (defense-in-depth — `<TodoItem>` already disables, but a stale ref from optimistic interleaving must not leak through),
   - captures `index = state.todos.findIndex((t) => t.id === id)` BEFORE the optimistic dispatch (the dispatch removes the row; reading the index after would always be `-1`),
   - captures `previousTodo: Todo = { id: target.id, text: target.text, completed: target.completed, createdAt: target.createdAt }` BEFORE dispatch — explicitly STRIPPING the `pending` flag because `deleteFailed.payload.todo` is typed as the wire `Todo` (no `pending`) per [reducer.ts:33](../../apps/web/src/lib/reducer.ts#L33); a `{ ...target }` spread would carry `pending: undefined` (or `pending: true`) onto the re-inserted entry, and TypeScript's structural typing would not catch it because excess properties are tolerated on assignment,
   - dispatches `{ type: 'deleteOptimistic', payload: { id } }`,
   - calls `api.deleteTodo(id)`,
   - on resolved success (`undefined`), dispatches NO follow-up action (the optimistic removal is now authoritative — mirrors [Story 2.7 epic AC](../planning-artifacts/epics.md#L994-L996)),
   - on rejection, dispatches `{ type: 'deleteFailed', payload: { todo: previousTodo, index } }` where `index` is the captured pre-delete index and `todo` is the stripped-pending wire shape,
   **And** the `<TodoList state={state} onToggle={handleToggle} onDelete={handleDelete} />` JSX passes `handleDelete` through `<TodoList>` to each `<TodoItem>` (see AC #9).

9. **Given** [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx),
   **When** its prop interface is extended,
   **Then** `TodoListProps` becomes `{ state: TodoState; onToggle: (id: string, nextCompleted: boolean) => void; onDelete: (id: string) => void }`,
   **And** the populated branch passes `onDelete={onDelete}` (in addition to `onToggle={onToggle}`) to each `<TodoItem>` (other branches — loading, empty, error — are unchanged because no items are rendered),
   **And** the existing `data-testid` set is preserved verbatim (`todo-list`, `todo-list-empty`, `todo-list-loading`, `todo-list-error`, `todo-item`).

10. **Given** [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx) — existing tests,
    **When** the suite is updated,
    **Then** every `render(<TodoList state={...} onToggle={vi.fn()} />)` call now ALSO passes `onDelete={vi.fn()}` (otherwise TypeScript fails),
    **And** no behavioral assertion changes: loading/empty/error/populated branches and `<li>` count assertions remain identical.

11. **Given** [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx) — existing tests,
    **When** the suite is updated,
    **Then** every `render(<TodoItem todo={...} onToggle={vi.fn()} />)` call now ALSO passes `onDelete={vi.fn()}` (otherwise TypeScript fails),
    **And** the existing assertions on `data-completed`, `text` rendering, XSS-as-text, `break-words`, `aria-checked`, `Space`/`Enter` toggle behavior, and `pending`-disabled checkbox are all preserved unchanged,
    **And** the existing test "exposes a checkbox role for the row and labels it with the todo text" at [TodoItem.test.tsx:63-67](../../apps/web/src/components/TodoItem.test.tsx#L63-L67) continues to pass without modification beyond the `onDelete={vi.fn()}` prop addition (the delete button is `role="button"`, not `role="checkbox"` — `getByRole('checkbox', { name: 'pick up milk' })` still resolves to a single element).

12. **Given** [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx) — extended with delete-specific cases,
    **When** Vitest + RTL runs,
    **Then** the suite covers:
    - render: a delete `<button>` is present with an accessible name matching `/^delete: pick up milk$/i` (queried via `screen.getByRole('button', { name: /^delete:/i })`),
    - render: the delete button is present for BOTH `completed: false` and `completed: true` (AC #7 — FR4 state-independence),
    - click: `userEvent.click(screen.getByRole('button', { name: /^delete:/i }))` calls `onDelete(todo.id)` exactly once and does NOT call `onToggle`,
    - keyboard Enter: focusing the delete button and pressing `Enter` calls `onDelete(todo.id)` exactly once (native button contract — Enter activates buttons),
    - keyboard Space: focusing the delete button and pressing `Space` calls `onDelete(todo.id)` exactly once (native button contract — Space activates buttons),
    - pending disabled: a `TodoEntry` with `pending: true` renders a `disabled` delete button; `userEvent.click` on it does NOT call `onDelete`; `userEvent.keyboard('{Enter}')` after focusing also does NOT call `onDelete` (native disabled-button contract),
    - the click on the delete button does NOT also fire `onToggle` (separate sibling controls; verified by asserting `onToggle` mock has zero calls after a delete click),
    - the delete `aria-label` includes the todo text verbatim (XSS-as-text path — for input `<script>alert(1)</script>`, the aria-label string is `Delete: <script>alert(1)</script>` and React's JSX-attribute escaping handles it; the test asserts on `getAttribute('aria-label')` containing the literal text).

13. **Given** [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) — extended with `deleteTodo` coverage,
    **When** Vitest runs (`npm run test --workspace apps/web`),
    **Then** the suite appends a `describe('deleteTodo()', ...)` block AFTER the existing `updateTodo()` block. Cases:
    - happy path: 204 resolves with `undefined`; method is DELETE; URL is `http://localhost:4000/todos/${id}`; `x-request-id` header present and a valid UUID; `accept: application/json` header present; NO `content-type` header is set; the request `init.body` is `undefined`,
    - happy path: the function does NOT call `response.json()` (verifiable by stubbing the Response with a body of `''` and `status: 204` — calling `.json()` on an empty 204 body would throw `SyntaxError: Unexpected end of JSON input`; if the function passes, `.json()` was not called),
    - non-OK 404 envelope (the Fastify-sensible default at [contracts.ts:32-39](../../packages/shared/src/contracts.ts#L32-L39)) → throws `ApiError` with `statusCode: 404`, the server's `message`, and the response's `requestId`,
    - non-OK 500 with NO server `x-request-id` header → throws `ApiError` with `requestId === undefined`,
    - non-OK 400 (e.g., bad UUID) → throws `ApiError` with `statusCode: 400`,
    **And** the existing `getTodos`, `createTodo`, and `updateTodo` describe blocks continue to pass unchanged.

14. **Given** [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx) — extended with delete journey cases,
    **When** Vitest + RTL runs,
    **Then** the suite appends a `describe('<TodoApp /> delete journey', ...)` block. Cases:
    - happy path: GET returns one todo `{ completed: false }` → user clicks the delete button → optimistic removal: the row disappears from the DOM (`screen.queryByRole('button', { name: /^delete:/i })` returns null) → DELETE resolves with 204 → row stays gone (no re-insert; one final `queryByTestId('todo-list-empty')` confirms the empty state),
    - rollback: GET returns one todo at index 0 → user clicks delete → row disappears optimistically → DELETE rejects with 500 → the row re-appears at index 0 (`screen.findAllByTestId('todo-item')` has length 1; the `<li>`'s `data-completed` matches the original `completed` value),
    - DELETE request shape: assert the second `fetch` call is `DELETE http://localhost:4000/todos/<id>` with `init.method === 'DELETE'` and `init.body === undefined`,
    - delete on completed: GET returns one todo `{ completed: true }` → user clicks delete → row disappears (FR4 — completed todos are deletable identically).

15. **Given** the full sanity gate suite,
    **When** `npm run lint`, `npm run typecheck`, and `npm run test` run from the repo root,
    **Then** all three pass: zero ESLint warnings/errors, zero TypeScript errors, all tests green,
    **And** the web test count moves from 79 → ~93–96 (existing 79 + ~5 new in `api.test.ts` for `deleteTodo` + ~5–7 new in `TodoItem.test.tsx` for delete behavior + ~3–4 new in `TodoApp.test.tsx` for the delete journey),
    **And** the `consoleErrorSpy`/`consoleWarnSpy` `afterEach` strict assertion in `TodoItem.test.tsx` continues to pass (no new console output from any delete path),
    **And** no new runtime dependencies are added to `apps/web/package.json` (delete uses a native `<button>` — no Radix primitive needed; the Radix Toast for failure messaging lands in Story 3.2).

16. **Given** Epic 2 acceptance,
    **When** Story 2.7 lands,
    **Then** all six PRD core-loop FRs (FR1 add, FR2 complete, FR3 uncomplete, FR4 delete, FR17 instant feedback, FR25 backend delete) are exercised end-to-end through the UI,
    **And** all four reducer optimistic action triplets from Story 2.4 (`addOptimistic|addReconcile|addFailed`, `toggleOptimistic|toggleFailed`, `deleteOptimistic|deleteFailed`) have a UI consumer,
    **And** the sprint-status entry `epic-2-retrospective` becomes eligible to transition from `optional` → run-when-ready (no automatic transition; the user runs the retro skill if desired).

## Tasks / Subtasks

- [x] **Task 1: Add `deleteTodo` to the API client (AC: #1, #13)**
  - [ ] Edit [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) — add `deleteTodo` AFTER `updateTodo`. The function shape is INTENTIONALLY simpler than the other three wrappers (no JSON parsing, no schema validation, no body) — this is the canonical "204 No Content" pattern.

    ```ts
    export async function deleteTodo(
      id: string,
      signal?: AbortSignal,
    ): Promise<void> {
      const requestId = newRequestId();
      const response = await fetch(`${API_URL}/todos/${id}`, {
        method: 'DELETE',
        headers: {
          accept: 'application/json',
          'x-request-id': requestId,
        },
        signal,
      });

      if (!response.ok) {
        throw await ApiError.fromResponse(response);
      }
      // 204 No Content: no body to parse, no schema to validate.
    }
    ```

  - [x] **Why no `content-type` header** — DELETE has no request body. Adding `content-type: application/json` would lie about a payload that doesn't exist. The server route schema accepts no body (`response: { 204: z.null() }` per [todos.ts:105](../../apps/api/src/routes/todos.ts#L105)); sending a body would still 204 (Fastify ignores unschemaed bodies on DELETE) but it's a contract lie.
  - [x] **Why `accept: application/json` is still set** — the SUCCESS path returns 204 with no body, but error envelopes (`400`/`404`/`500`) come back as JSON. The server's content-negotiation respects this header for the error path.
  - [x] **Why no `JSON.stringify(...)` and no `body:` field** — DELETE has no payload. The fetch `RequestInit.body` is omitted (not `undefined`-set, not `null`-set, just absent) — `fetch` treats absent and `undefined` identically, but absent is the idiomatic shape.
  - [x] **Why no `response.json()` call** — the server responds 204 (no body). Calling `response.json()` on an empty body throws `SyntaxError: Unexpected end of JSON input` in jsdom and most browsers. The function returns `undefined` directly.
  - [x] **Why no `TodoSchema.safeParse`** — there is nothing to parse. The contract is "204 = success". Schema-drift hardening for DELETE (e.g., server starts returning 200 with a body) is a future contract-evolution concern; today the server's typed route locks 204.
  - [x] **Why `signal?` parameter even though Story 2.7 doesn't pass one** — keeps the `(id, ..., signal?)` shape consistent with `getTodos(signal?)` / `createTodo(text, signal?)` / `updateTodo(id, completed, signal?)`. Lets a future test or component pass an `AbortSignal` without breaking call sites. Do NOT force a `signal`.
  - [x] **Why mirror the existing `if (!response.ok) throw await ApiError.fromResponse(response)` line for line** — Stories 1.8, 2.5, 2.6 established this. `ApiError.fromResponse` already handles "non-JSON error body" / "JSON-parse failure on error envelope" / "missing `x-request-id`" — see [errors.ts:25-51](../../apps/web/src/lib/errors.ts#L25-L51). Don't reinvent.
  - [x] **Watch-out:** Do NOT add a `console.warn` or `console.error` inside the function. The "no console in production code" rule ([architecture.md:431](../../_bmad-output/planning-artifacts/architecture.md#L431)) is enforced by `consoleErrorSpy`/`consoleWarnSpy` strict afterEach assertions in component tests.
  - [x] **Watch-out:** Do NOT add `encodeURIComponent` on `id`. The id is a UUID (`/^[0-9a-f-]{36}$/i`) — RFC 3986 unreserved + hyphen — and template-literal interpolation is safe. The server's `TodoIdParamsSchema` validates the shape regardless. (Same reasoning as `updateTodo` in Story 2.6.)
  - [x] **Watch-out:** Do NOT add a `204`-specific check like `if (response.status !== 204) throw ...`. The server route is locked to 204 by its Zod response schema; an unexpected 200 from the server is a server-side regression caught by the API integration tests, not the client. The client trusts `response.ok`.
  - [x] **Watch-out:** Do NOT export `deleteTodo` as default. Mirror the named-export style of `getTodos` / `createTodo` / `updateTodo`.

- [x] **Task 2: Extend `api.test.ts` with `deleteTodo` coverage (AC: #1, #13)**
  - [ ] Edit [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) — append a `describe('deleteTodo()', ...)` block AFTER the existing `updateTodo()` block. Mirror the `mockFetchOnce` helper and the `vi.stubEnv` / `vi.resetModules` lifecycle that's already in place at [api.test.ts:1-19](../../apps/web/src/lib/api.test.ts#L1-L19).

    ```ts
    describe('deleteTodo()', () => {
      const id = '11111111-1111-4111-8111-111111111111';

      it('issues DELETE /todos/:id with x-request-id and no body, resolves to undefined on 204', async () => {
        // 204 response: empty body, no content-type. Calling .json() on this
        // would throw SyntaxError — the test proves the function does not.
        mockFetchOnce(new Response(null, { status: 204 }));
        const { deleteTodo } = await import('./api');
        const result = await deleteTodo(id);
        expect(result).toBeUndefined();

        const fetchMock = vi.mocked(globalThis.fetch);
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe(`http://localhost:4000/todos/${id}`);
        expect(init).toMatchObject({
          method: 'DELETE',
          headers: expect.objectContaining({
            accept: 'application/json',
            'x-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/i),
          }),
        });
        expect(init?.body).toBeUndefined();
      });

      it('does NOT set a content-type header on DELETE (no body to type)', async () => {
        mockFetchOnce(new Response(null, { status: 204 }));
        const { deleteTodo } = await import('./api');
        await deleteTodo(id);
        const fetchMock = vi.mocked(globalThis.fetch);
        const init = fetchMock.mock.calls[0]![1]!;
        const headers = init.headers as Record<string, string>;
        expect(headers['content-type']).toBeUndefined();
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
        const { deleteTodo } = await import('./api');
        await expect(deleteTodo(id)).rejects.toMatchObject({
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
        const { deleteTodo } = await import('./api');
        await expect(deleteTodo(id)).rejects.toMatchObject({
          name: 'ApiError',
          statusCode: 500,
          requestId: undefined,
        });
      });

      it('throws ApiError on 400 (bad UUID per server validation)', async () => {
        mockFetchOnce(
          new Response(
            JSON.stringify({
              statusCode: 400,
              error: 'Bad Request',
              message: 'params/id Invalid uuid',
            }),
            {
              status: 400,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
        const { deleteTodo } = await import('./api');
        await expect(deleteTodo('not-a-uuid')).rejects.toMatchObject({
          name: 'ApiError',
          statusCode: 400,
        });
      });
    });
    ```

  - [x] **Why `new Response(null, { status: 204 })` for the 204 mock** — `null` for the body produces a Response that mimics the server's true "no content" behavior. Calling `.json()` on that body throws `SyntaxError: Unexpected end of JSON input`; the function passes only because it does NOT call `.json()` — implicit proof of AC #1's "no body parsing" rule.
  - [x] **Why test the absence of `content-type`** — The `not-set` invariant is part of the AC. Servers and proxies behave differently when DELETE arrives with `content-type: application/json` and an empty body (some 400, some accept). The wire test pins the contract.
  - [x] **Why test 400 separately from 404/500** — DELETE with a bad UUID is the canonical 400 case ([Story 2.3 AC #3](./2-3-delete-todos-id-endpoint.md)). Pinning the `ApiError.statusCode === 400` propagation proves the wrapper handles all three error envelopes (400/404/500) the server can emit on DELETE per [Architecture API table](../../_bmad-output/planning-artifacts/architecture.md#L226-L233).
  - [x] **Watch-out:** Do NOT mock `crypto.randomUUID`. The mock-fetch tests assert via regex on the `x-request-id` header.
  - [x] **Watch-out:** Do NOT add tests for the body containing a JSON payload — `deleteTodo` deliberately does not accept one. Testing "what if we passed a body" would be testing dead code.
  - [x] **Watch-out:** Do NOT add a test for `network failure / fetch rejection` (raw `TypeError`). That's a pre-existing pattern shared with `getTodos`/`createTodo`/`updateTodo` (Story 2.6 deferred-work item: "fetch() rejection propagates raw TypeError, not ApiError" at [deferred-work.md:10](./deferred-work.md#L10)). Folds into the api-wrapper hardening pass; not introduced here.

- [x] **Task 3: Extend `<TodoItem>` with the delete button (AC: #2, #3, #4, #5, #6, #7)**
  - [ ] Edit [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx). The change is additive — add `onDelete` to the props interface and render a sibling `<button>` AFTER the existing `<span id={labelId}>` text node. Do NOT change the Checkbox.Root or the label span. Replace the current implementation with the version below.

    ```tsx
    'use client';

    import * as Checkbox from '@radix-ui/react-checkbox';
    import { useId } from 'react';
    import type { TodoEntry } from '@/lib/reducer';

    export interface TodoItemProps {
      todo: TodoEntry;
      onToggle: (id: string, nextCompleted: boolean) => void;
      onDelete: (id: string) => void;
    }

    export default function TodoItem({
      todo,
      onToggle,
      onDelete,
    }: TodoItemProps) {
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

      const handleDeleteClick = (): void => {
        onDelete(todo.id);
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
          <button
            type="button"
            data-testid="todo-item-delete"
            aria-label={`Delete: ${todo.text}`}
            disabled={pending}
            onClick={handleDeleteClick}
            className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-current/10 bg-transparent outline-none hover:bg-current/5 focus-visible:ring-2 focus-visible:ring-current/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {/* Visible glyph for sighted users; aria-hidden because aria-label
                already supplies the accessible name. */}
            <span aria-hidden="true">×</span>
          </button>
        </li>
      );
    }
    ```

  - [x] **Why `type="button"` (not `type="submit"`, default)** — `<button>` inside a form defaults to `type="submit"`; outside a form (the `<li>` is not in a form) it defaults to `type="submit"` per HTML5 but the form lookup yields none, so it's effectively a no-op submit. Setting `type="button"` makes the contract explicit and survives a future refactor that wraps the list in a form (e.g., for batch-delete UX). Mirrors the `<TodoInput>` submit-button pattern at [TodoInput.tsx:45](../../apps/web/src/components/TodoInput.tsx#L45) (which IS in a form and uses `type="submit"`).
  - [x] **Why `aria-label` (not visible label text)** — The delete affordance is glyph-only (`×`). Sighted users recognize the iconography; AT users need a text equivalent. The label includes the todo text so screen-reader users can disambiguate when multiple deletes are in the same list ("Delete: pick up milk" vs "Delete: walk the dog"). Per [WAI-ARIA Authoring Practices for Button](https://www.w3.org/WAI/ARIA/apg/patterns/button/) — `aria-label` is the prescribed pattern when the button has a non-text accessible name source.
  - [x] **Why include the full `todo.text` in `aria-label`** — Distinguishing one delete button from another is critical for AT users navigating with rotor/list-of-buttons. "Delete" alone (or "Delete todo") would be N identical buttons, defeating accessibility. The verbose label is intentional. AC #12 pins this for XSS-as-text: React's JSX-attribute escaping prevents any HTML in `todo.text` from breaking the attribute (no early termination — React escapes `"` and `&`).
  - [x] **Why `<span aria-hidden="true">×</span>` (not raw `×` or an `<svg>`)** — The `×` (U+00D7 MULTIPLICATION SIGN) is a single code point, renders consistently across the supported browser baseline (Tailwind v4 default font stack). `aria-hidden` cuts the duplicate "multiplication sign" announcement from screen readers (the `aria-label` already provides the accessible name). Wrapping in `<span>` keeps the glyph isolated from the future possibility of additional content (e.g., a count badge); reviewing diffs becomes easier when the glyph has a single owner. **Do NOT** use `<svg>` — no SVG icon system exists in this app; consistency with Story 2.6's `Checkbox.Indicator` glyph pattern is the win.
  - [x] **Why `h-11 w-11` (44 px tap target, NFR14)** — Tailwind v4: `h-11` = `2.75rem` = 44 px at the default 16 px root. The button is the entire interactive area; the `:focus-visible` ring is rendered on the same element. This mirrors the `Checkbox.Root` sizing established in Story 2.6 — the row now has TWO 44 × 44 controls.
  - [x] **Why `mt-0.5` retained** — Aligns the delete button with the first line of multi-line text (matches the `mt-0.5` on `Checkbox.Root`). For multi-line wrapping todos, this keeps both controls aligned with the top of the text — they don't drift to the vertical-center of a 5-line entry.
  - [x] **Why `border-current/10` on the delete button (matches the `<li>` border)** — Distinguishes the delete control from the checkbox visually (checkbox uses `border-current` — full opacity; delete uses `border-current/10` — subtle outline), so a glance at the row tells you which control is the "primary action." `hover:bg-current/5` provides hover feedback consistent with `<TodoInput>`'s submit button.
  - [x] **Why `flex-1` is on the `<span id={labelId}>` (not on the `<button>`)** — Layout: the checkbox + text + delete button form a horizontal row. The middle text span absorbs leftover width (`flex-1`); the two end controls have fixed `w-11`. The existing layout from Story 2.6 already has `flex-1` on the span — DO NOT move it.
  - [x] **Why `disabled={pending}` on the delete button (mirrors the checkbox)** — A `pending: true` row has a temp UUID that the server doesn't know about. DELETE on a temp UUID would 404 → `deleteFailed` → row re-inserts at the same position → user-visible jump from "deleting" back to "still here" with no apparent reason. Disabling the button prevents the wasted round trip and the confusing visual.
  - [x] **Why `onClick` (not a higher-level `useCallback`)** — `handleDeleteClick` is a stable closure over `todo.id` and `onDelete`. `useCallback` here would memoize across renders, but `onDelete` is the actual stable reference (from `<TodoApp>`'s `useCallback`); wrapping again is dead weight. Mirrors the existing `handleCheckedChange` pattern.
  - [x] **Watch-out:** Do NOT wrap the `<button>` inside the `Checkbox.Root` or inside any `Checkbox.*` element. Radix's `Checkbox.Root` renders as a native `<button role="checkbox">`; nesting a `<button>` inside another `<button>` is invalid HTML, breaks AT navigation, and produces a hydration warning in React. Render the delete button as a SIBLING of `Checkbox.Root` inside the `<li>`.
  - [x] **Watch-out:** Do NOT add `onClick={(e) => { e.stopPropagation(); ... }}` "to be safe." There are no parent click handlers on the `<li>`; stopping propagation is a noisy fix for a non-existent problem.
  - [x] **Watch-out:** Do NOT make the delete button hidden until hover (`opacity-0 group-hover:opacity-100`). This is a discoverability anti-pattern for keyboard and AT users — the button must be reachable via Tab in normal flow. Spec AC #3 requires it visible-and-focusable always.
  - [x] **Watch-out:** Do NOT add a `confirm()` dialog or any modal "are you sure?" gate. Optimistic UI + rollback is the v1 contract (architecture pin: rollback for failed mutations is the user-facing surface; FR4 has no confirmation requirement). Adding `confirm()` would break the optimistic round-trip target (NFR1 ≤100 ms).
  - [x] **Watch-out:** Do NOT render the delete button conditionally (`{!completed && <button ...>}` or `{completed && <button ...>}`). FR4 mandates state-independence — both active and completed todos are deletable. AC #7 pins this.
  - [x] **Watch-out:** Do NOT remove `data-testid="todo-item"` or `data-completed` from the `<li>` (Story 2.6 watch-out repeated for emphasis). Stories 1.9, 2.4, 2.5, 2.6 all probe these.

- [x] **Task 4: Update `<TodoList>` to thread `onDelete` to each item (AC: #9, #10)**
  - [ ] Edit [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx). Change is two lines: extend the prop interface, pass `onDelete` through. Other branches (loading/empty/error) are unchanged because they render no items.

    ```tsx
    import type { TodoState } from '@/lib/reducer';
    import TodoItem from './TodoItem';

    export interface TodoListProps {
      state: TodoState;
      onToggle: (id: string, nextCompleted: boolean) => void;
      onDelete: (id: string) => void;
    }

    export default function TodoList({ state, onToggle, onDelete }: TodoListProps) {
      const { status, todos } = state;

      // ... loading / empty / error branches unchanged ...

      return (
        <ul
          data-testid="todo-list"
          data-status="success"
          className="flex flex-col gap-2"
        >
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </ul>
      );
    }
    ```

  - [x] **Why `onDelete` is required (not optional)** — Same reasoning as `onToggle` in Story 2.6 Task 5: marking it `?:` would let `<TodoList>` callers forget to wire it; `<TodoItem>`'s required prop would then fail at type-check inside the `.map(...)` call. Required-up-the-chain is honest.
  - [x] **Why thread through `<TodoList>` instead of binding it inside `<TodoItem>`** — Architecture pins `<TodoApp>` as the only stateful component ([architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631)). The reducer + `api.ts` calls live there; presentational components emit callbacks and receive props.
  - [x] **Why update the existing `TodoList.test.tsx` cases (AC #10)** — Adding a required prop without updating tests = TypeScript failure. The fix is mechanical: every `render(<TodoList state={...} onToggle={vi.fn()} />)` becomes `render(<TodoList state={...} onToggle={vi.fn()} onDelete={vi.fn()} />)`. No behavioral assertion changes.
  - [x] **Watch-out:** Do NOT introduce `useCallback` inside `<TodoList>` to "stabilize" the prop. The callback is already stable from `<TodoApp>` (Task 5 wraps it in `useCallback`); re-wrapping here is dead weight.
  - [x] **Watch-out:** Do NOT change the existing `data-testid` set on the loading/empty/error/populated branches.

- [x] **Task 5: Wire `<TodoApp>` `handleDelete` callback (AC: #8)**
  - [ ] Edit [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx). Additive change: import `deleteTodo`, add `handleDelete`, pass it down to `<TodoList>`. Existing `useEffect`, `handleAdd`, and `handleToggle` are untouched. The `useCallback` deps include `state.status` and `state.todos` because the closure captures `state.todos` to look up `target` and `index`.

    ```tsx
    'use client';

    import { useCallback, useEffect, useReducer } from 'react';
    import {
      createTodo,
      deleteTodo,
      getTodos,
      updateTodo,
    } from '@/lib/api';
    import { ApiError } from '@/lib/errors';
    import { initialState, reducer } from '@/lib/reducer';
    import TodoInput from './TodoInput';
    import TodoList from './TodoList';

    export default function TodoApp() {
      const [state, dispatch] = useReducer(reducer, initialState);

      // ...existing initial-load useEffect — UNCHANGED...

      // ...existing handleAdd useCallback — UNCHANGED...

      // ...existing handleToggle useCallback — UNCHANGED...

      const handleDelete = useCallback(
        (id: string): void => {
          if (state.status !== 'success') return;
          const index = state.todos.findIndex((t) => t.id === id);
          if (index === -1) return;
          const target = state.todos[index]!;
          if (target.pending === true) return;
          // Strip the `pending` flag — `deleteFailed.payload.todo` is typed as
          // the wire `Todo` (no `pending`); spreading `target` would smuggle
          // it back into a re-inserted entry.
          const previousTodo = {
            id: target.id,
            text: target.text,
            completed: target.completed,
            createdAt: target.createdAt,
          };

          dispatch({ type: 'deleteOptimistic', payload: { id } });
          deleteTodo(id).then(
            () => {
              // 204 success: the optimistic removal is now authoritative. No
              // dispatch needed — the row is already gone from state.
            },
            () => {
              dispatch({
                type: 'deleteFailed',
                payload: { todo: previousTodo, index },
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
          <TodoList
            state={state}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
        </section>
      );
    }
    ```

  - [x] **Why capture `index` before dispatch (not after)** — `deleteOptimistic` removes the row from `state.todos`. After dispatch, `state.todos.findIndex(...)` returns `-1`. `deleteFailed` requires the pre-delete index for re-insertion. Same reasoning as `handleToggle`'s `previousCompleted` capture (Story 2.6 watch-out).
  - [x] **Why explicitly construct `previousTodo` instead of passing `target`** — `target` is a `TodoEntry` (`Todo & { pending?: boolean }`), but `deleteFailed.payload.todo` is typed as the wire `Todo` ([reducer.ts:33](../../apps/web/src/lib/reducer.ts#L33)). TypeScript-narrows on the dispatch line, but spreading a `pending: undefined` field via `...target` would re-insert an entry with the spread (TypeScript drops unknown fields when narrowing into a stricter type, but at runtime the field is still on the object — pinning the strip explicitly prevents future drift if `pending` were to become a more interesting flag). Same defense-in-depth as Story 2.6's `target.pending === true` early-return.
  - [x] **Why `[state.status, state.todos]` deps** — `handleDelete` reads `state.todos` to look up `target` and `index`. With `[]` deps the callback would close over the initial empty array forever and every delete would set `index: -1` and `previousTodo: undefined.text` — broken rollback. Including `state.status` is technically redundant (`state.todos` reference changes alongside status transitions) but documents the load-status guard. Mirrors `handleToggle`'s deps at [TodoApp.tsx:98](../../apps/web/src/components/TodoApp.tsx#L98).
  - [x] **Why no follow-up dispatch on success** — `deleteOptimistic` already removed the row from state. The server confirmed (204) that the row is gone from the source of truth. No reconcile needed because there's nothing to reconcile — the row simply doesn't exist anymore. Mirrors the epic AC at [epics.md:994-996](../planning-artifacts/epics.md#L994-L996).
  - [x] **Why `.then(onSuccess, onReject)` two-arg form** — Mirrors the existing `handleAdd` and `handleToggle` shape. One fewer node in the chain than `.then().catch()`; identical semantics for a single-resolve path. The `onSuccess` callback is intentionally `() => {}` (empty arrow) — semantically loud about "no follow-up needed."
  - [x] **Why no `signal` passed to `deleteTodo`** — Same reasoning as `handleToggle` (Story 2.6 Task 6 watch-out): the delete is fire-and-forget under optimistic UI. Unmount during in-flight delete resolves to a React 18+ silent no-op. Adding `AbortController` would orphan the optimistic state on unmount.
  - [x] **Why the `state.status !== 'success'` guard** — Story 2.4's reducer no-ops `deleteOptimistic` outside `success` ([reducer.ts:111-117](../../apps/web/src/lib/reducer.ts#L111-L117)), so dispatching against an `error` state is technically harmless. But we'd still issue a DELETE to a server that we just couldn't read from — wasting a round trip. Belt-and-suspenders.
  - [x] **Why `if (target.pending === true) return` (not `!target.pending`)** — `pending?: boolean` means `pending` may be `undefined`. `!undefined` is `true` — `!target.pending` would early-return for non-pending todos and break delete entirely. The strict `=== true` check is the only safe form. Same pattern as `handleToggle` at [TodoApp.tsx:76](../../apps/web/src/components/TodoApp.tsx#L76).
  - [x] **Watch-out:** Do NOT capture `index` or `target` AFTER the `dispatch({ type: 'deleteOptimistic', ... })` call — the dispatch removes the row on the next render; if the closure reads `state.todos` after dispatch, you'd get `-1` / `undefined`. Capture BEFORE dispatch.
  - [x] **Watch-out:** Do NOT add `try/catch` around the `dispatch` calls. `dispatch` cannot throw under React's `useReducer` contract.
  - [x] **Watch-out:** Do NOT spread `target` into the `previousTodo` constant via `{ ...target, pending: undefined }` — the explicit field-by-field construction is louder about the contract and survives a future `TodoEntry` widening that adds another internal flag.
  - [x] **Watch-out:** Do NOT short-circuit on `state.todos.length === 0`. The `findIndex` returning `-1` already covers that case; an extra check is dead code.
  - [x] **Watch-out:** Do NOT log the rejection (no `console.error` / `console.warn`). Mirrors `handleAdd`'s and `handleToggle`'s rejection callbacks; surfacing user-facing failures is Story 3.2's territory (Toast). Story 2.6 deferred-work item: "Toggle rejection callback swallows the error without logging" at [deferred-work.md:11](./deferred-work.md#L11) — same posture for delete.

- [x] **Task 6: Update `TodoItem.test.tsx` for new prop + delete behaviors (AC: #11, #12)**
  - [ ] Edit [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx). For every existing `render(<TodoItem todo={...} onToggle={...} />)` call, add `onDelete={vi.fn()}`. No existing assertions change. Append a new `describe('<TodoItem /> delete', ...)` block (or interleave the new tests inside the existing `describe('<TodoItem />', ...)` — either works; mirror Story 2.6's pattern of interleaving for grep-friendliness).

    Add the following tests inside the existing `describe('<TodoItem />', ...)` block:

    ```tsx
    it('renders a delete button with an aria-label that includes the todo text', () => {
      render(
        <TodoItem
          todo={baseTodo}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      const button = screen.getByRole('button', { name: /^delete:/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute(
        'aria-label',
        'Delete: pick up milk',
      );
    });

    it('renders the delete button on completed todos as well as active ones (FR4)', () => {
      render(
        <TodoItem
          todo={{ ...baseTodo, completed: true }}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      const button = screen.getByRole('button', { name: /^delete:/i });
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    it('calls onDelete(id) when the delete button is clicked, without firing onToggle', async () => {
      const onToggle = vi.fn();
      const onDelete = vi.fn();
      const user = userEvent.setup();
      render(
        <TodoItem
          todo={baseTodo}
          onToggle={onToggle}
          onDelete={onDelete}
        />,
      );
      await user.click(screen.getByRole('button', { name: /^delete:/i }));
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith(baseTodo.id);
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('calls onDelete when Enter is pressed with the delete button focused (native button contract)', async () => {
      const onDelete = vi.fn();
      const user = userEvent.setup();
      render(
        <TodoItem
          todo={baseTodo}
          onToggle={vi.fn()}
          onDelete={onDelete}
        />,
      );
      const button = screen.getByRole('button', { name: /^delete:/i });
      button.focus();
      await user.keyboard('{Enter}');
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith(baseTodo.id);
    });

    it('calls onDelete when Space is pressed with the delete button focused (native button contract)', async () => {
      const onDelete = vi.fn();
      const user = userEvent.setup();
      render(
        <TodoItem
          todo={baseTodo}
          onToggle={vi.fn()}
          onDelete={onDelete}
        />,
      );
      screen.getByRole('button', { name: /^delete:/i }).focus();
      await user.keyboard(' ');
      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('renders the delete button as disabled when todo.pending === true and does NOT call onDelete on click', async () => {
      const onDelete = vi.fn();
      const user = userEvent.setup();
      render(
        <TodoItem
          todo={{ ...baseTodo, pending: true }}
          onToggle={vi.fn()}
          onDelete={onDelete}
        />,
      );
      const button = screen.getByRole('button', { name: /^delete:/i });
      expect(button).toBeDisabled();
      await user.click(button);
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('aria-label preserves todo text verbatim including HTML-looking characters (NFR17 attribute escaping)', () => {
      const xss: TodoEntry = {
        ...baseTodo,
        text: '<script>alert("x")</script>',
      };
      render(
        <TodoItem todo={xss} onToggle={vi.fn()} onDelete={vi.fn()} />,
      );
      // React escapes attribute strings; the literal characters survive in
      // the attribute value as text and are NOT interpreted as DOM.
      const button = screen.getByLabelText(
        'Delete: <script>alert("x")</script>',
      );
      expect(button).toBeInTheDocument();
      // Sanity: no <script> nodes were created from the aria-label.
      expect(button.querySelector('script')).toBeNull();
    });
    ```

  - [x] **Why `getByRole('button', { name: /^delete:/i })`** — Anchors on the row's affordance via the accessible-name computation. The `^delete:` regex permits the test to match across todo texts without hard-coding the exact string. Mirrors Story 2.6's `getByRole('checkbox', { name: ... })` pattern.
  - [x] **Why a separate `xss` aria-label test** — React's JSX-attribute escaping is a different code path from JSX-text escaping (the latter is exercised by the existing "no escaping shenanigans" test). Pinning attribute escaping is a defense-in-depth assertion: a future regression where `aria-label={...}` is replaced with `dangerouslySetInnerHTML` (a clear architecture violation) or with a `ref.setAttribute` that bypasses React's escaping would silently fail the existing tests but trigger this one.
  - [x] **Why `await user.keyboard(' ')` for Space (matching the existing toggle Space test)** — Mirrors the existing pattern in `TodoItem.test.tsx`. Both literal `' '` and `'{ }'` work; consistency with Story 2.6's choice keeps the file uniform.
  - [x] **Why no separate "click does not fire onDelete on a non-disabled button when checkbox is what's clicked" test** — Trivially holds by event-target separation (the checkbox click target is the `<button role="checkbox">`, the delete click target is the separate `<button>`). Adding the test would assert browser/jsdom behavior, not application logic.
  - [x] **Why update `consoleErrorSpy`/`consoleWarnSpy` afterEach** — keep it strict (existing). The delete handler does not log; if a future regression adds logging, the test fires and the dev investigates. Mirrors Story 2.6's posture.
  - [x] **Watch-out:** Do NOT remove or modify the existing toggle tests. The new tests are ADDITIVE.
  - [x] **Watch-out:** Do NOT add a test asserting `screen.getByRole('button')` returns exactly one button. After this story, `getByRole('button')` will throw because two buttons exist (the Radix Checkbox.Root renders as `role="checkbox"`, NOT `role="button"`, so it is correctly distinguished by role — but a `getAllByRole('button')` returning multiple if Radix's role contract changes is the dead-canary). Use `getByRole('button', { name: /^delete:/i })` consistently to disambiguate.
  - [x] **Watch-out:** Do NOT mock `crypto.randomUUID`. `<TodoItem>` doesn't call it.
  - [x] **Watch-out:** Do NOT use `act()` manually. RTL + `userEvent.setup()` wraps the right things automatically.

- [x] **Task 7: Update `TodoList.test.tsx` to pass `onDelete` (AC: #10)**
  - [ ] Edit [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx). For every existing `render(<TodoList state={...} onToggle={vi.fn()} />)` call, add `onDelete={vi.fn()}`. No assertions change.
  - [x] **Why no new test cases here** — Mirrors Story 2.6 Task 8 reasoning: `<TodoList>` is now a thin pass-through for `onDelete`. The downstream behavior tests live in `TodoItem.test.tsx`. Adding a list-level pass-through test ("when I click delete on item N, the list-level onDelete fires with the right id") would be a redundant integration; the journey tests in `TodoApp.test.tsx` (Task 8) cover that path.
  - [x] **Watch-out:** Do NOT skip this update — TypeScript will fail at the repo-root `npm run typecheck` step.

- [x] **Task 8: Add delete journey tests in `TodoApp.test.tsx` (AC: #14)**
  - [ ] Edit [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx). Append a new `describe('<TodoApp /> delete journey', ...)` block AFTER the existing `describe('<TodoApp /> toggle journey', ...)`. Mirror the toggle-journey shape (deferred-promise pattern for the rollback case).

    ```tsx
    describe('<TodoApp /> delete journey', () => {
      const seed = {
        id: '11111111-1111-4111-8111-111111111111',
        text: 'pick up milk',
        completed: false,
        createdAt: '2026-04-29T00:00:00.000Z',
      };

      it('happy path: GET → click delete → optimistic removal → DELETE 204 → row stays gone', async () => {
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
          .mockResolvedValueOnce(new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', fetchMock);

        const { default: TodoApp } = await import('./TodoApp');
        render(<TodoApp />);

        const deleteBtn = await screen.findByRole('button', {
          name: /^delete: pick up milk$/i,
        });
        const user = userEvent.setup();
        await user.click(deleteBtn);

        // Optimistic: the row disappears immediately. The list transitions
        // from populated → empty.
        await screen.findByTestId('todo-list-empty');
        expect(
          screen.queryByRole('button', { name: /^delete:/i }),
        ).toBeNull();

        // DELETE was issued with the right URL, method, and no body.
        const deleteCall = fetchMock.mock.calls[1]!;
        expect(deleteCall[0]).toBe(`http://localhost:4000/todos/${seed.id}`);
        expect(deleteCall[1]).toMatchObject({ method: 'DELETE' });
        expect(deleteCall[1]?.body).toBeUndefined();
      });

      it('rollback: optimistic removal reverts when DELETE rejects with 500 (re-insert at original index)', async () => {
        let resolveDelete!: (response: Response) => void;
        const deletePromise = new Promise<Response>((resolve) => {
          resolveDelete = resolve;
        });
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
          .mockReturnValueOnce(deletePromise);
        vi.stubGlobal('fetch', fetchMock);

        const { default: TodoApp } = await import('./TodoApp');
        render(<TodoApp />);

        const deleteBtn = await screen.findByRole('button', {
          name: /^delete: pick up milk$/i,
        });
        const user = userEvent.setup();
        await user.click(deleteBtn);

        // Optimistic state: row is gone while DELETE is pending.
        await screen.findByTestId('todo-list-empty');

        // Now resolve DELETE with 500 → deleteFailed → re-insert.
        resolveDelete(
          jsonResponse(
            { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
            { status: 500 },
          ),
        );

        // The row reappears at its original position.
        const items = await screen.findAllByTestId('todo-item');
        expect(items).toHaveLength(1);
        expect(items[0]).toHaveAttribute('data-completed', 'false');
        expect(items[0]).toHaveTextContent('pick up milk');
      });

      it('delete on a completed todo behaves identically (FR4 state independence)', async () => {
        const completedSeed = { ...seed, completed: true };
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(jsonResponse({ todos: [completedSeed] }))
          .mockResolvedValueOnce(new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', fetchMock);

        const { default: TodoApp } = await import('./TodoApp');
        render(<TodoApp />);

        const deleteBtn = await screen.findByRole('button', {
          name: /^delete: pick up milk$/i,
        });
        const user = userEvent.setup();
        await user.click(deleteBtn);

        await screen.findByTestId('todo-list-empty');
      });
    });
    ```

  - [x] **Why `screen.findByRole('button', { name: /^delete: pick up milk$/i })`** — Stresses the accessible-name path that the `aria-label` produces. If the `aria-label` regresses (e.g., dropped or split incorrectly), the test fails for the right reason. Mirrors Story 2.6's `findByRole('checkbox', { name: seed.text })` pattern.
  - [x] **Why use a deferred DELETE promise for the rollback test** — Same pattern as the toggle rollback (Story 2.6 Task 9 reasoning): a synchronously-resolved 500 mock would let the `deleteFailed` microtask flush before the test's first DOM poll, making the optimistic-removed state unobservable. Capturing `resolve` and calling it AFTER the optimistic assertion keeps the transient state visible.
  - [x] **Why `expect(items[0]).toHaveAttribute('data-completed', 'false')` in the rollback test** — Pins that the re-inserted entry preserves its original completion state (the `previousTodo` constructed in `handleDelete` carried it across). A regression where `previousTodo.completed` was hard-coded `false` (e.g., spread-bug) would silently pass the empty-state test but fail the post-rollback assertion.
  - [x] **Why no "concurrent two-deletes" test** — Story 2.3's API integration test [concurrency.int.test.ts:51-79](../../apps/api/test/integration/concurrency.int.test.ts#L51-L79) covers the server-side guarantee (one 204, one 404). The web side: the second click hits a `pending`-disabled or already-removed row. The reducer no-ops `deleteOptimistic` on missing ids ([reducer.ts:114-115](../../apps/web/src/lib/reducer.ts#L114-L115)). Adding a UI test for a race condition that's structurally prevented is dead weight.
  - [x] **Why no XSS test in the delete journey** — Story 2.5's create journey already exercises the `<script>` text path through the same render pipeline; Story 2.6's `aria-checked` toggle re-asserts it on toggle; this story's `TodoItem.test.tsx` adds an `aria-label` XSS-as-text test. Re-asserting at the journey level is redundant.
  - [x] **Watch-out:** Do NOT add a `consoleErrorSpy`/`consoleWarnSpy` strict afterEach to `TodoApp.test.tsx`. Story 2.5 deliberately did not — the rollback path can fire async warnings; strict console assertions would mask the bug under test. The toggle journey mirrors this; the delete journey is symmetric.
  - [x] **Watch-out:** Do NOT mock `crypto.randomUUID` or `Date.now`. The delete journey treats both as black boxes.
  - [x] **Watch-out:** Do NOT remove the `findByTestId('todo-list-empty')` step in the happy-path test — it's the proof-of-optimistic-removal. Just `queryByRole('button', { name: /^delete:/i })` returning null could be satisfied by any other DOM clearing; `findByTestId('todo-list-empty')` proves the list rendered the empty branch.

- [x] **Task 9: Sanity gates**
  - [ ] `npm run lint` — must report 0 warnings, 0 errors.
  - [ ] `npm run typecheck` — must report 0 errors. The new `onDelete: (id: string) => void` prop is required-up-the-chain; any caller that forgot to wire it fails type-check.
  - [ ] `npm run test` — runs unit tests across all workspaces. Web tests should jump from 79 → ~93–96. Approximate breakdown: existing 79 pass unchanged, +5 in `api.test.ts` for `deleteTodo`, +7 new in `TodoItem.test.tsx` for delete behavior (aria-label, completed-row, click+no-toggle, Enter, Space, pending-disabled, attribute-XSS), +3 new in `TodoApp.test.tsx` for the delete journey (happy, rollback, completed-delete). Exact count may drift slightly; ±2 is acceptable.
  - [ ] **Verify no new runtime deps** — confirm `apps/web/package.json` `dependencies` is unchanged from Story 2.6's snapshot (still: `@radix-ui/react-checkbox`, `next`, `react`, `react-dom`). `npm install` from the repo root should be a no-op.
  - [ ] No new ESLint rules required. No new TypeScript options required. No new env vars.

- [x] **Task 10: Commit**
  - [ ] Stage exactly:
    - **Modified:** [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts), [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts), [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx), [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx), [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx), [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx), [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx), [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx).
  - [ ] Commit message: `feat(web): delete todo via delete button (Story 2.7)`
  - [ ] **Do NOT** stage anything in `_bmad-output/`, `node_modules/`, `.env*`, `apps/api/**`, `packages/shared/**`, or any other untouched component file.
  - [ ] **Do NOT** include `package.json` / `package-lock.json` (no new deps in this story).
  - [ ] Record commit hash in the Change Log when the user runs the commit.

## Dev Notes

### Where this story sits

Story 2.7 is the fourth and final user-facing slice of Epic 2 (Todo Core Loop) and the third mutation vertical slice. It mirrors Story 2.5/2.6's three-layer shape (api wrapper → presentational component update → `<TodoApp>` orchestration → tests):

- Story 2.5 shipped `addOptimistic` / `addReconcile` / `addFailed` end-to-end via `<TodoInput>`.
- Story 2.6 shipped `toggleOptimistic` / `toggleFailed` end-to-end via the Radix Checkbox in `<TodoItem>`.
- Story 2.7 ships `deleteOptimistic` / `deleteFailed` end-to-end via a native `<button>` in `<TodoItem>`.

After this story:

- The user can click a delete button on any non-pending row to remove it from the list; the row disappears instantly and reappears at its original index if the server rejects.
- Both active (`completed: false`) and completed (`completed: true`) todos are deletable identically (FR4 state-independence).
- The reducer's `deleteOptimistic` / `deleteFailed` actions are exercised end-to-end (Story 2.4 shipped them; 2.7 is their first consumer).
- `apps/web/src/lib/api.ts` exports `getTodos`, `createTodo`, `updateTodo`, and `deleteTodo` — the full CRUD surface mapped to PRD FR22-FR25.
- `<TodoItem>` becomes the row's complete interactive surface (checkbox + label + delete button).
- The web test count moves from 79 → ~93–96.
- Epic 2 is functionally complete. PRD core-loop FRs (FR1, FR2, FR3, FR4, FR17, FR25) are all exercised through the UI. Sprint-status entry `epic-2-retrospective` becomes eligible to run.

This story does NOT touch:

- The API (Stories 2.1–2.3 closed it; DELETE /todos/:id with concurrent-delete safety is at [todos.ts:94-114](../../apps/api/src/routes/todos.ts#L94-L114)).
- The reducer (Story 2.4 closed it).
- `<TodoInput>` (Story 2.5 closed it).
- The Radix Checkbox in `<TodoItem>` (Story 2.6 closed it; this story adds a SIBLING button).
- Toast / user-facing error surfaces (Story 3.2).
- The unhandled-rejection safety net (NFR9 — Story 3.5).
- Initial-load error recovery (Story 3.4).

### Critical architectural guardrails

1. **TodoApp is the only stateful component.** [architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631) — "TodoApp is the only stateful component. It owns the reducer and all api.ts calls. … TodoInput, TodoList, TodoItem, Toast are presentational; they receive props and emit callbacks." `<TodoItem>` MUST NOT import from `@/lib/api` or `@/lib/reducer` at runtime (a type-level import of `TodoEntry` from `@/lib/reducer` is fine, mirrors Story 2.6).
2. **All client-server traffic goes through `apps/web/src/lib/api.ts`.** [architecture.md:382](../../_bmad-output/planning-artifacts/architecture.md#L382) — "All requests go through apps/web/src/lib/api.ts. Components never call raw fetch." `<TodoApp>`'s `handleDelete` calls `deleteTodo(id)`, NOT a raw `fetch`.
3. **Every outgoing request carries `x-request-id`.** [architecture.md:383](../../_bmad-output/planning-artifacts/architecture.md#L383) — "client UUID per request; server echoes it back for correlation." Mirror the `getTodos` / `createTodo` / `updateTodo` pattern.
4. **Server is the validation authority.** [architecture.md:421-424](../../_bmad-output/planning-artifacts/architecture.md#L421-L424) — `TodoIdParamsSchema` validates `:id` is a UUID on the server; the client passes the id verbatim (no client-side regex check).
5. **Output escaping via React JSX.** [architecture.md:215-216](../../_bmad-output/planning-artifacts/architecture.md#L215-L216) — `<TodoItem>`'s `{todo.text}` rendering AND `aria-label={`Delete: ${todo.text}`}` rely on React's JSX text-and-attribute escaping. Don't introduce HTML-rendering code paths.
6. **Color is not the only signal.** FR32 / NFR12 ([prd.md:324](../../_bmad-output/planning-artifacts/prd.md#L324), [prd.md:348](../../_bmad-output/planning-artifacts/prd.md#L348)) — already satisfied by Story 2.6's `aria-checked` + `line-through` for completion state. Delete is action-not-state, so no parallel non-color requirement.
7. **Tap target ≥ 44 × 44 px.** NFR14 ([prd.md:350](../../_bmad-output/planning-artifacts/prd.md#L350)) — Tailwind `h-11 w-11` on the delete `<button>`. The row now has TWO 44 × 44 controls (checkbox + delete) plus the text span absorbing leftover width.
8. **Bundle budget.** [architecture.md:266](../../_bmad-output/planning-artifacts/architecture.md#L266) — ≤200 KB gzipped initial JS. This story adds ZERO runtime dependencies (delete uses a native `<button>`). Bundle impact: a few hundred bytes of JSX + class strings — well under budget.
9. **No retry loops.** [architecture.md:417-418](../../_bmad-output/planning-artifacts/architecture.md#L417-L418) — Delete rollback is the v1 surface for failed DELETE; user retries by re-clicking. Toast (Story 3.2) will surface the message.
10. **Optimistic actions are no-ops outside `success`.** Story 2.4 AC #11 — `deleteOptimistic` / `deleteFailed` do nothing when `state.status !== 'success'`. AC #8's `<TodoApp>` guard adds a UI-level early-return so we don't issue a wasted DELETE; belt-and-suspenders.
11. **No `dangerouslySetInnerHTML`.** [architecture.md:435](../../_bmad-output/planning-artifacts/architecture.md#L435) — never. The delete glyph is a Unicode `×` inside an `aria-hidden` span, not raw HTML.
12. **Single-resource DELETE returns 204 no body.** [architecture.md:367](../../_bmad-output/planning-artifacts/architecture.md#L367) — "Delete: no body; `204 No Content`." The client honors this by NOT calling `response.json()` on success.

### Why presentational `<TodoItem>` (vs. self-contained smart row) — repeated for emphasis

The epic AC text reads "the component captures the original todo and its current index in state" — which sounds like all of that lives in `<TodoItem>`. But the architecture pin ([architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631)) and Stories 2.5/2.6's pattern make it clear: `<TodoApp>` owns the reducer + side effects; `<TodoItem>` owns only the click → callback wiring.

Resolution applied in this story (mirrors Story 2.6's resolution):

- `<TodoItem>` owns: rendering the delete button, mapping click/Enter/Space to `onClick` → `onDelete(id)`, the `pending`-driven disabled state.
- `<TodoApp>` owns: capturing `target` and `index` from current state, dispatching `deleteOptimistic`, calling `api.deleteTodo`, dispatching `deleteFailed` on rejection (with the stripped-pending `previousTodo` and pre-delete `index`).

This split makes `<TodoItem>` trivially testable (no fetch mock needed, no env stub needed, just `vi.fn()` for `onDelete`). It also makes the rejection path testable in isolation at the `<TodoApp>` level via `vi.stubGlobal('fetch', ...)`. Story 2.5/2.6 used the same pattern — Story 2.7 mirrors it for symmetry and review-time grep-friendliness.

### Why `previousTodo` is constructed field-by-field (not spread)

`target` is typed as `TodoEntry` (`Todo & { pending?: boolean }`). The `deleteFailed.payload.todo` is typed as the wire `Todo` (no `pending`) per [reducer.ts:33](../../apps/web/src/lib/reducer.ts#L33). TypeScript narrows on the dispatch line — `{ ...target }` would assign-compatible into `Todo` because `pending` is optional and TypeScript's structural typing tolerates excess properties on assignment. But:

- At runtime, `{ ...target, pending: target.pending }` (the spread) carries `pending: undefined` (or `pending: true` if it was present). The reducer's `deleteFailed` re-inserts `action.payload.todo` literally ([reducer.ts:124-127](../../apps/web/src/lib/reducer.ts#L124-L127)) — the `pending` field would survive on the re-inserted entry.
- For a non-pending row, `pending` is `undefined`, and `{ ...target }` carries `pending: undefined` — harmless at runtime, but invisible-to-grep coupling.
- For a pending row, `<TodoApp>` early-returns BEFORE dispatch (AC #8); the case "spread-then-re-insert with pending: true" cannot occur via the happy path. But defense-in-depth + future-proofing: explicit construction is louder, survives a future `TodoEntry` widening, and makes the contract grep-friendly.

The cost is one constant. The benefit is "this code says exactly what it does." Same posture as Story 2.6's `target.pending === true` early-return.

### Why capture `index` from current state, not from a click-time DOM probe

The `<li>` has no positional `data-index` attribute. Reading the DOM index via `Array.from(parentEl.children).indexOf(el)` would work but couples the click handler to layout assumptions (would break if the list reordered without re-rendering, e.g., a future DnD UX). `state.todos.findIndex((t) => t.id === id)` is the source-of-truth read.

### Why delete is fire-and-forget on success (no follow-up dispatch)

The optimistic dispatch (`deleteOptimistic`) removed the row from `state.todos`. The 204 confirms the server agrees. No reconcile is needed because there's nothing to reconcile — the row simply doesn't exist anymore in either client state or server state.

This is a structural difference from `addOptimistic` / `toggleOptimistic`, which both have a `*Reconcile`-style follow-up to swap-in the server's authoritative entry. For delete, the server's "authoritative entry" is "no entry" — and that's what optimistic state already shows.

A `deleteReconcile` action would be a no-op-by-design ("find row, do nothing"). Story 2.4 deliberately did NOT define one; this story confirms the design choice.

### Why the delete glyph is a Unicode `×` (U+00D7), not `✕` or an `<svg>`

- `×` (multiplication sign) renders consistently across the supported browser baseline (Tailwind v4 default font stack — see [apps/web/AGENTS.md](../../apps/web/AGENTS.md)).
- `✕` (heavy multiplication x, U+2715) and `✖` (heavy multiplication x, U+2716) are pictographs that some fonts render as emoji-style (color, larger) — visually inconsistent with the row's monochrome design.
- An `<svg>` would require an icon system; none exists. Mirrors Story 2.6's reasoning for the `✓` glyph in `Checkbox.Indicator`.
- `aria-hidden="true"` on the wrapping `<span>` prevents AT users from hearing "multiplication sign" duplicated alongside the `aria-label="Delete: ..."`.

### Why no `aria-busy` / "in-flight" visual on the delete button (or row)

Per Story 2.5/2.6's reasoning: the in-flight window between optimistic dispatch and reconcile is microtask-short under normal conditions (≤100 ms perceived per NFR1; actual API latency ≤300 ms p95 per NFR2). A "busy" state would create UI flicker for sub-perceptual durations.

For delete specifically: the optimistic state IS "row is gone." There's no row to add a `aria-busy` attribute to. The visible signal is the row's disappearance from the DOM; the rollback signal is its reappearance. No additional UI affordance needed.

### Why no confirmation dialog ("are you sure?")

Optimistic UI + rollback IS the v1 contract. A confirmation dialog would:

- Add ≥1 round-trip to the user's input (modal open → confirm → close), violating NFR1's ≤100 ms perceived latency.
- Reduce delete's velocity below toggle's (toggle is one click; gated delete is two clicks + a focus shift), making "tidying the list" a chore.
- Conflict with FR17 ("immediate visual feedback on every mutation attempt").

Architecture explicitly does not require gated destructive actions. If FR4 is later refined to require undo (e.g., a "Delete? Undo within 5s" toast), Story 3.2's Toast infrastructure will be the natural surface — not a `confirm()`.

### Why no client-side index validation on `deleteFailed`

The reducer's `deleteFailed` clamps the index to a safe range ([reducer.ts:124](../../apps/web/src/lib/reducer.ts#L124)): `const clamped = Math.max(0, Math.min(index, state.todos.length))`. That handles the concurrent-delete case where the user deleted row N at index 2, then a visibility refetch shrunk the list to length 1 before the rollback fired. The reducer's clamp inserts at the end rather than crashing on out-of-bounds.

`<TodoApp>` does NOT need to second-guess: the captured `index` is the contract. The reducer is the safety net.

### Story 2.4 deferred items relevant to this story

- **`loadStart` clobbers pending optimistic entries** ([deferred-work.md:30](./deferred-work.md#L30)) — Same as Story 2.6: `loadStart` only fires on initial mount today; the hazard remains dormant. Story 3.4 (initial-load error recovery + retry button) is where this becomes load-bearing.
- **Visibility refetch races optimistic DELETE** ([deferred-work.md:19](./deferred-work.md#L19)) — Same race as toggle: a visibility-driven `loadSuccess` while a DELETE is in flight will replace `state.todos`, and a resolving `deleteFailed` would re-insert into the refreshed list at the captured (stale) index — potentially in the wrong position. Same Epic 3 territory; do not pre-empt here. The reducer's index-clamp is the v1 mitigation.
- **Rejection callback swallows the error without logging** ([deferred-work.md:11](./deferred-work.md#L11)) — Mirrors `handleAdd` and `handleToggle` postures. Story 3.2 (Toast for mutation failures) is the user-facing surface; until then, rollback is observable only via the UI revert.

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
    <!-- Checkbox.Indicator does not render its children when unchecked -->
  </button>
  <span
    id=":r1:"
    data-testid="todo-item-text"
    class="flex-1 break-words text-base leading-6"
  >
    pick up milk
  </span>
  <button
    type="button"
    aria-label="Delete: pick up milk"
    data-testid="todo-item-delete"
    class="mt-0.5 inline-flex h-11 w-11 shrink-0 …"
  >
    <span aria-hidden="true">×</span>
  </button>
</li>
```

For a completed todo, the Radix Checkbox.Root becomes `aria-checked="true"` / `data-state="checked"` and the text span gains `line-through opacity-60`. The delete button is unchanged across completion states (FR4). For a pending todo, BOTH buttons are `disabled`.

The `id=":r1:"` is React's `useId()` output — opaque, stable per render tree. Tests use `getByRole('checkbox', { name: ... })` and `getByRole('button', { name: /^delete:/i })` to avoid asserting on the exact id string.

### Story 2.5 / 2.6 patterns to mirror (verbatim, where applicable)

- **`api.ts` fetch wrapper shape** — Stories 1.8 / 2.5 / 2.6 established: explicit env-presence check at module load, named export, `(args..., signal?)` signature, header set including `x-request-id`, `if (!response.ok) throw await ApiError.fromResponse(response)`. For DELETE: NO body parsing branch. Mirror everything else 1:1.
- **`api.test.ts` mock-fetch lifecycle** — `vi.stubEnv` + `vi.resetModules()` in `beforeEach`; `vi.restoreAllMocks()` + `vi.unstubAllEnvs()` + `vi.unstubAllGlobals()` in `afterEach`; `mockFetchOnce` helper; `await import('./api')` inside each test. Mirror.
- **Component test file shape** — `consoleErrorSpy` + `consoleWarnSpy` in `beforeEach`/`afterEach` is preserved on `TodoItem.test.tsx` (already in place from Story 2.6). **Do NOT** mirror in `TodoApp.test.tsx` — Story 2.5/2.6 deliberately left it off there.
- **Optimistic action dispatch shape** — `dispatch({ type: 'deleteOptimistic', payload: { id } })`, `dispatch({ type: 'deleteFailed', payload: { todo, index } })`. Story 2.4 pinned the payload shapes; do not deviate.
- **`useCallback` for stable handler identity** — Mirror Story 2.6's `handleToggle` ([TodoApp.tsx:71-99](../../apps/web/src/components/TodoApp.tsx#L71-L99)). `handleDelete`'s deps are `[state.status, state.todos]` — same as toggle.
- **`.then(onSuccess, onReject)` two-arg form** — Mirror the existing `handleAdd` / `handleToggle` pattern.

### Why no new runtime dependency

- The delete affordance is a native `<button>` — no Radix primitive needed (Radix Toast for failure messaging lands in Story 3.2; Radix AlertDialog is not in scope per the "no confirmation" decision).
- An icon library is not needed — a single Unicode glyph (`×`) suffices.
- The Tailwind classes used (`h-11 w-11 shrink-0 inline-flex …`) are all already exercised by Story 2.6's Checkbox.Root; no new utility-class cost.

This contrasts with Stories 2.5 (added `@testing-library/user-event` devDep) and 2.6 (added `@radix-ui/react-checkbox` runtime dep). Story 2.7 ships pure JSX/Tailwind/native-HTML.

### What changes in the codebase

| File | Change | LOC delta (approx.) |
|------|--------|---------------------|
| [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) | Add `deleteTodo(id, signal?)` after `updateTodo` | +20 / -0 |
| [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) | Append `describe('deleteTodo()', ...)` block (~5 new tests) | +95 / -0 |
| [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx) | Add `onDelete` prop; render delete `<button>` after the labeled text span | +20 / -1 |
| [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx) | Add `onDelete={vi.fn()}` to existing renders; add ~7 new test cases (aria-label, completed-row, click+no-toggle, Enter, Space, pending-disabled, attribute-XSS) | +90 / -0 (existing renders modified mechanically) |
| [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx) | Add required `onDelete` prop; thread to each `<TodoItem>` | +3 / -1 |
| [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx) | Add `onDelete={vi.fn()}` to every `render(<TodoList ... />)` call | +N / -0 (mechanical) |
| [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) | Import `deleteTodo`; add `handleDelete` `useCallback`; pass to `<TodoList>` | +30 / -1 |
| [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx) | Append delete journey describe block (happy + rollback + delete-on-completed) | +90 / -0 |

Total: ~+340 added LOC across 8 source files (0 new files; all extensions/modifications of existing). Zero new dependencies.

### Out-of-scope (do NOT do in this story)

- A confirmation dialog / undo affordance — never in v1 (rollback is the contract). Future polish if FR4 is refined.
- A bulk-delete / "clear completed" action — not in PRD.
- A "deleting..." spinner / `aria-busy` state on the row — sub-perceptual window per NFR1/NFR2.
- A `deleteReconcile` reducer action — explicitly retired by Story 2.4's design (no follow-up dispatch on success).
- Surfacing the failure message via Toast — Story 3.2.
- Disabling all delete buttons during initial-load `loadStart` — handled implicitly: when `state.status !== 'success'`, the populated branch of `<TodoList>` doesn't render. No items, no buttons.
- Server-side pessimistic-concurrency / `If-Match` / `ETag` — never (architecture: no concurrency tokens; concurrent-delete safety is a 204+404 pair handled by Story 2.3).
- Adding an icon library or SVG icon system — out of scope; Unicode `×` suffices.
- Replacing the native `<button>` with a Radix primitive — no Radix primitive for "delete button" exists; AlertDialog is for confirmation gates (out of scope per the "no confirmation" decision).
- Animations on row removal/re-insert — would mask the optimistic timing target (NFR1).
- A Cmd+Backspace / Delete-key shortcut on focused rows — keyboard accessibility for the delete button is sufficient per AC #3.

### Project Structure Notes

The change is scoped to `apps/web/`:

```text
apps/web/
└── src/
    ├── components/
    │   ├── TodoApp.tsx          # ← extended: + deleteTodo import, + handleDelete useCallback, + onDelete to <TodoList>
    │   ├── TodoApp.test.tsx     # ← extended: + describe('delete journey', ...) block (happy + rollback + completed-delete)
    │   ├── TodoInput.tsx        # (unchanged from Story 2.5)
    │   ├── TodoInput.test.tsx   # (unchanged from Story 2.5)
    │   ├── TodoItem.tsx         # ← extended: + onDelete prop, + delete <button> sibling of Checkbox.Root inside <li>
    │   ├── TodoItem.test.tsx    # ← extended: + onDelete={vi.fn()} on existing renders; +7 new delete-behavior cases
    │   ├── TodoList.tsx         # ← extended: + required onDelete prop, thread to <TodoItem>
    │   └── TodoList.test.tsx    # ← mechanical: + onDelete={vi.fn()} on every render() call
    └── lib/
        ├── api.ts               # ← extended: + deleteTodo(id, signal?)
        ├── api.test.ts          # ← extended: + describe('deleteTodo()', ...) block
        ├── errors.ts            # (unchanged)
        ├── reducer.ts           # (unchanged from Story 2.4 — deleteOptimistic / deleteFailed already in place)
        └── reducer.test.ts      # (unchanged from Story 2.4)
```

Architecture's "non-component files: camelCase.ts" / "React component files: PascalCase.tsx" naming ([architecture.md:338-339](../../_bmad-output/planning-artifacts/architecture.md#L338-L339)) is satisfied. Co-located tests rule ([architecture.md:351](../../_bmad-output/planning-artifacts/architecture.md#L351)) is satisfied. No `__tests__/` directories introduced. No new `lib/` modules. No new component files.

### Testing Requirements

- **Unit / component tests:** mandatory across four files:
  - `apps/web/src/lib/api.test.ts` — `deleteTodo` coverage (~5 tests).
  - `apps/web/src/components/TodoItem.test.tsx` — delete button behavior (~7 new + existing-modified to add `onDelete={vi.fn()}`).
  - `apps/web/src/components/TodoList.test.tsx` — mechanical update (no new behavior tests).
  - `apps/web/src/components/TodoApp.test.tsx` — delete journey (~3 new tests).
- **Integration tests:** none in this story (no API changes; DELETE already covered by Story 2.3's [todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) + [concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts)).
- **E2E tests:** none in this story (Epic 3 ships journey-level resilience tests per [epics.md:1222-1287](../../_bmad-output/planning-artifacts/epics.md#L1222-L1287)).
- **Test runner:** Vitest with jsdom (already configured at [apps/web/vitest.config.mts](../../apps/web/vitest.config.mts)).
- **User-event library:** `@testing-library/user-event` (Story 2.5 added it as a devDep at version `^14.6.1`).
- **Coverage gate:** none in v1.
- **Test isolation:** each test sets up its own fetch mock and dispatches its own actions. No shared state.

### Library / version pins (April 2026)

These are already installed and pinned by Stories 1.7 / 1.8 / 1.9 / 2.4 / 2.5 / 2.6; do NOT bump them:

- `react@19.2.4`, `react-dom@19.2.4`
- `next@16.2.4` (CSR-only via `'use client'`)
- `vitest@^2.1.0`, `@testing-library/react@^16.3.0`, `@testing-library/jest-dom@^6.9.0`, `@testing-library/user-event@^14.6.1`, `jsdom@^29.0.0`
- `@radix-ui/react-checkbox@^1.3.3` (Story 2.6 added; not modified here)
- `@todo-app/shared` (workspace dep) — `Todo`, `TodoSchema` types
- `typescript@^5`

**NEW dep:** none. This story adds zero runtime or dev dependencies.

### References

- **Architecture:**
  - State management + reducer actions: [architecture.md:248](../../_bmad-output/planning-artifacts/architecture.md#L248).
  - Frontend Architecture (native button + Tailwind): [architecture.md:189](../../_bmad-output/planning-artifacts/architecture.md#L189), [architecture.md:252-256](../../_bmad-output/planning-artifacts/architecture.md#L252-L256).
  - Component organization (TodoApp = stateful, others presentational): [architecture.md:629-631](../../_bmad-output/planning-artifacts/architecture.md#L629-L631).
  - All requests through `api.ts`: [architecture.md:382-383](../../_bmad-output/planning-artifacts/architecture.md#L382-L383).
  - DELETE endpoint shape (204 no body): [architecture.md:231](../../_bmad-output/planning-artifacts/architecture.md#L231), [architecture.md:367](../../_bmad-output/planning-artifacts/architecture.md#L367).
  - XSS prevention (React JSX escaping, no `dangerouslySetInnerHTML`): [architecture.md:215-216](../../_bmad-output/planning-artifacts/architecture.md#L215-L216), [architecture.md:435](../../_bmad-output/planning-artifacts/architecture.md#L435).
  - Anti-patterns (raw `fetch`, console.log on server): [architecture.md:475-490](../../_bmad-output/planning-artifacts/architecture.md#L475-L490).
  - Bundle budget: [architecture.md:266](../../_bmad-output/planning-artifacts/architecture.md#L266).
  - No retries: [architecture.md:417-418](../../_bmad-output/planning-artifacts/architecture.md#L417-L418).
  - No spinners over populated lists: [architecture.md:413-414](../../_bmad-output/planning-artifacts/architecture.md#L413-L414).
- **PRD:**
  - FR4 (delete regardless of completion state): [prd.md:281](../../_bmad-output/planning-artifacts/prd.md#L281).
  - FR17 (immediate visual feedback on every mutation): [prd.md:303](../../_bmad-output/planning-artifacts/prd.md#L303).
  - FR25 (backend exposes delete operation — server-side, already shipped): [prd.md:314](../../_bmad-output/planning-artifacts/prd.md#L314).
  - NFR1 (≤100 ms perceived response): [prd.md:331](../../_bmad-output/planning-artifacts/prd.md#L331).
  - NFR10–NFR14 (a11y, focus, tap target): [prd.md:346-350](../../_bmad-output/planning-artifacts/prd.md#L346-L350).
  - NFR13 (color contrast): [prd.md:349](../../_bmad-output/planning-artifacts/prd.md#L349).
  - NFR14 (44 × 44 tap target): [prd.md:350](../../_bmad-output/planning-artifacts/prd.md#L350).
  - NFR17 (XSS-safe rendering): [prd.md:356](../../_bmad-output/planning-artifacts/prd.md#L356).
- **Epics:**
  - Story 2.7 full text: [epics.md:967-1014](../../_bmad-output/planning-artifacts/epics.md#L967-L1014).
  - Story 2.4 (predecessor — reducer delete actions): [epics.md:824-874](../../_bmad-output/planning-artifacts/epics.md#L824-L874).
  - Story 2.5 (predecessor — create vertical slice): [epics.md:876-919](../../_bmad-output/planning-artifacts/epics.md#L876-L919).
  - Story 2.6 (predecessor — toggle vertical slice; this story extends `<TodoItem>`): [epics.md:921-965](../../_bmad-output/planning-artifacts/epics.md#L921-L965).
  - Story 3.2 (Toast for mutation failures — closes the user-visible failure surface): [epics.md:1064-1106](../../_bmad-output/planning-artifacts/epics.md#L1064-L1106).
- **Prior stories (patterns to mirror):**
  - Story 1.8 (api.ts + load reducer + ApiError): [_bmad-output/implementation-artifacts/1-8-typed-api-client-error-types-and-load-reducer.md](./1-8-typed-api-client-error-types-and-load-reducer.md). Sets the api.ts wrapper shape and api.test.ts lifecycle.
  - Story 2.3 (DELETE /todos/:id endpoint + concurrent-delete safety): [_bmad-output/implementation-artifacts/2-3-delete-todos-id-endpoint.md](./2-3-delete-todos-id-endpoint.md). Server-side authority for DELETE shape, validation, error envelopes.
  - Story 2.4 (reducer optimistic actions including deleteOptimistic / deleteFailed): [_bmad-output/implementation-artifacts/2-4-reducer-extensions-for-optimistic-mutations.md](./2-4-reducer-extensions-for-optimistic-mutations.md). All seven action shapes; pure-function semantics; the `deleteOptimistic` / `deleteFailed` pair consumed by this story.
  - Story 2.5 (create vertical slice — orchestration template): [_bmad-output/implementation-artifacts/2-5-create-todo-via-todoinput-full-vertical-slice.md](./2-5-create-todo-via-todoinput-full-vertical-slice.md).
  - Story 2.6 (toggle vertical slice — TodoItem extension template): [_bmad-output/implementation-artifacts/2-6-toggle-completion-via-radix-checkbox.md](./2-6-toggle-completion-via-radix-checkbox.md). The three-layer shape (api wrapper → presentational component update → TodoApp callback → tests) that 2.7 mirrors. Also the source of the existing `TodoItem.tsx` shape that this story extends.
- **Source files (current state):**
  - [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) — extend with `deleteTodo`.
  - [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) — extend with `deleteTodo` describe block.
  - [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts) — DO NOT modify; provides `deleteOptimistic`/`deleteFailed` actions consumed by `TodoApp.handleDelete`.
  - [apps/web/src/lib/errors.ts](../../apps/web/src/lib/errors.ts) — DO NOT modify; `ApiError` is consumed by `deleteTodo` via `ApiError.fromResponse`.
  - [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) — extend with `handleDelete` + thread to `<TodoList>`.
  - [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx) — extend with required `onDelete` prop.
  - [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx) — extend (NOT replace) with delete `<button>` and `onDelete` prop.
  - [apps/web/src/components/TodoInput.tsx](../../apps/web/src/components/TodoInput.tsx) — DO NOT modify; Story 2.5 closed it.
  - [packages/shared/src/contracts.ts](../../packages/shared/src/contracts.ts) — DO NOT modify; `TodoSchema` is the contract.
- **Server-side prior art (reference only — DO NOT modify):**
  - [apps/api/src/routes/todos.ts](../../apps/api/src/routes/todos.ts) — DELETE /todos/:id handler at lines 94-114.
  - [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts) — DELETE happy-path + 404 + 400 cases.
  - [apps/api/test/integration/concurrency.int.test.ts](../../apps/api/test/integration/concurrency.int.test.ts) — concurrent-DELETE safety (one 204, one 404).
- **Web-app conventions (Next 16 / Tailwind v4 quirks):**
  - [apps/web/AGENTS.md](../../apps/web/AGENTS.md) — Tailwind v4 `border-current/10` browser baseline (Chrome 111+ / Safari 16.4+ / Firefox 113+); `data-[state=...]` attribute variants are zero-config in v4. Path-alias `@/*` works for TS/TSX (not for non-TS files).
- **Deferred-work items folded into this story (not closed by it):**
  - [deferred-work.md:11](./deferred-work.md#L11) — "Toggle rejection callback swallows the error without logging." Same posture for `handleDelete` (no log; Story 3.2 ships the user-facing surface).
  - [deferred-work.md:10](./deferred-work.md#L10) — "fetch() rejection propagates raw TypeError, not ApiError." `deleteTodo` mirrors `getTodos`/`createTodo`/`updateTodo` for consistency; folds into the future api-wrapper hardening pass.
  - [deferred-work.md:19](./deferred-work.md#L19) — "Visibility refetch races optimistic POST." Same race for DELETE; reducer's index-clamp is the v1 mitigation.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- `npm run lint` → 0 warnings, 0 errors.
- `npm run typecheck` → 0 errors across `shared`, `api`, `web` workspaces.
- `npm run test` → 25 (shared) + 4 (api unit) + 94 (web) = 123 tests passing on first run after implementation. Web breakdown: `api.test.ts` 15 → 20 (+5 `deleteTodo` cases), `TodoItem.test.tsx` 10 → 17 (+7 delete cases), `TodoApp.test.tsx` 6 → 9 (+3 delete journey cases), `TodoList.test.tsx` 5 → 5 (mechanical only), `reducer.test.ts` 29 unchanged, `TodoInput.test.tsx` 14 unchanged.
- No new runtime or dev dependencies added; `apps/web/package.json` and root `package-lock.json` untouched.

### Completion Notes List

- **Spec adherence:** all 16 ACs implemented as written; no spec deviations. The `deleteTodo` wrapper deliberately omits JSON body parsing and schema validation per AC #1 (204-only path); `<TodoItem>` extended (not replaced) to host a sibling `<button>` after the labeled span; `<TodoApp>.handleDelete` captures `index` and `previousTodo` (pending-stripped, field-by-field per Dev Notes "field-by-field" guardrail) BEFORE dispatching `deleteOptimistic`; on rejection, `deleteFailed` carries `{ todo: previousTodo, index }`; on success, no follow-up dispatch (optimistic removal is authoritative).
- **Delete-button accessibility:** native `<button type="button">`, 44×44 tap target via Tailwind `h-11 w-11` (NFR14), focus-visible ring (NFR12), `aria-label="Delete: ${todo.text}"` for AT users, glyph `×` wrapped in `aria-hidden="true"` span. Keyboard contract: Space and Enter both activate (native button — differs from the Radix Checkbox which is Space-only). Disabled while `pending: true` (no DELETE round trip on temp-UUID rows).
- **State independence (FR4):** delete renders identically for `completed: false` and `completed: true` rows; pinned by AC #7 + AC #14's completed-delete journey test.
- **Web tests count:** 79 → 94 (+15) — exactly within the predicted ~93–96 ±2 envelope.
- **Console-spy posture:** strict `consoleErrorSpy`/`consoleWarnSpy` afterEach in `TodoItem.test.tsx` continues to pass — no new console output from any delete path. Deliberately not added to `TodoApp.test.tsx` (consistent with Story 2.5/2.6 posture; rollback path can fire async warnings).
- **Story 2.4 deferred items folded (not closed):** `(1)` rejection callback swallows the error without logging — same posture as `handleAdd`/`handleToggle`; user-facing surface is Story 3.2 (Toast). `(2)` `fetch()` rejection propagates raw `TypeError` not `ApiError` — consistent with the other three wrappers, folds into the future api-wrapper hardening pass. `(3)` Visibility refetch races optimistic DELETE — same race as toggle; reducer's index-clamp at [reducer.ts:124](../../apps/web/src/lib/reducer.ts#L124) is the v1 mitigation.
- **Epic 2 status:** all four reducer optimistic action triplets (`addOptimistic`/`addReconcile`/`addFailed`, `toggleOptimistic`/`toggleFailed`, `deleteOptimistic`/`deleteFailed`) now have a UI consumer. PRD core-loop FRs (FR1, FR2, FR3, FR4, FR17, FR25) are exercised end-to-end through the UI. Sprint-status entry `epic-2-retrospective` becomes eligible to run.

### File List

- **Modified:** `apps/web/src/lib/api.ts` (added `deleteTodo` after `updateTodo`, +20 LOC).
- **Modified:** `apps/web/src/lib/api.test.ts` (appended `describe('deleteTodo()', ...)` block with 5 cases, +101 LOC).
- **Modified:** `apps/web/src/components/TodoItem.tsx` (added `onDelete: (id: string) => void` prop and sibling delete `<button>`, +20 LOC / -1 LOC).
- **Modified:** `apps/web/src/components/TodoItem.test.tsx` (mechanical `onDelete={vi.fn()}` on existing renders + 7 new delete tests, +127 LOC / -10 LOC).
- **Modified:** `apps/web/src/components/TodoList.tsx` (added required `onDelete` prop, threaded to each `<TodoItem>`, +6 LOC / -1 LOC).
- **Modified:** `apps/web/src/components/TodoList.test.tsx` (mechanical `onDelete={vi.fn()}` on every `render()` call, +5 LOC / -5 LOC).
- **Modified:** `apps/web/src/components/TodoApp.tsx` (imported `deleteTodo`, added `handleDelete` `useCallback` with deps `[state.status, state.todos]`, threaded `onDelete={handleDelete}` to `<TodoList>`, +44 LOC / -3 LOC).
- **Modified:** `apps/web/src/components/TodoApp.test.tsx` (appended `describe('<TodoApp /> delete journey', ...)` block with happy-path, rollback, and completed-delete cases, +97 LOC).

Total: 8 files modified, 0 added, 0 deleted. No `package.json` or `package-lock.json` changes.

### Review Findings

Code-review run on 2026-04-30 against `780df6f..0969e15`. Three layers: Blind Hunter (adversarial, diff-only — 21 raw findings), Edge Case Hunter (path tracer, JSON — 9 raw findings), Acceptance Auditor (16/16 ACs PASS or N/V; no guardrail violations). Triage: 0 decisions, 0 patches, 2 deferred, ~28 dismissed (mostly spec-ratified design choices: `.then(onSuccess, onReject)` shape, no `signal` plumbing, `[state.status, state.todos]` deps, field-by-field `previousTodo` strip, no client-side `encodeURIComponent`, no 204-status check, no `aria-busy`, optimistic-only-on-`success` guard).

- [x] \[Review]\[Defer] Rapid double-click on delete button can issue two DELETE requests; second 404 → `deleteFailed` re-inserts the just-deleted row (`apps/web/src/components/TodoApp.tsx:108-127`) — deferred, structurally adjacent to Story 2.6's deferred concurrent-rapid-toggle race. The reducer's `deleteOptimistic` no-ops on a missing id so the second optimistic dispatch is harmless, but the second `deleteTodo()` still fires before re-render hides the button; on 404 the rollback re-inserts. Mitigations (track in-flight ids in a ref, or disable the button on click) are UX-polish concerns reserved for an Epic 3 hardening pass alongside the toast/error surface (Story 3.2).
- [x] \[Review]\[Defer] `deleteFailed` reducer splices `todo` at the clamped index without checking for an existing entry with the same id (`apps/web/src/lib/reducer.ts:119-128`) — deferred, latent until visibility-refetch lands. If a future visibility refetch resurrects the row before the rollback fires, `next.splice(clamped, 0, todo)` would create a duplicate id → React key collision. The race is inert today (no visibility refetch wired); aligned with Story 2.5's deferred "visibility refetch races optimistic POST" item. Hardening belongs to Story 3.4 (initial-load error recovery / refetch UX), where the reducer's optimistic-action handlers should grow id-dedup guards.

## Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-30 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Story slot: Epic 2, Story 7 (delete vertical slice; consumes Story 2.4's `deleteOptimistic`/`deleteFailed`; mirrors Story 2.5/2.6's three-layer orchestration; closes Epic 2). Zero new runtime deps; native `<button>` for delete affordance.            |
| 2026-04-30 | Dev-Story execution. Status: ready-for-dev → in-progress → review. Implemented all 16 ACs across the 8 spec files. Web tests 79 → 94 (+15: 5 `deleteTodo` wrapper, 7 `<TodoItem>` delete behaviors, 3 `<TodoApp>` delete-journey). Lint clean, typecheck clean, no spec deviations, zero new deps. Source-only commit: `0969e15` `feat(web): delete todo via delete button (Story 2.7)`. |
| 2026-04-30 | Code-Review complete via `/bmad-code-review` (range `780df6f..0969e15`). Status: review → done. Three layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor (16/16 ACs PASS or N/V; no guardrail/watch-out/out-of-scope violations). Triage: 0 decision-needed, 0 patches, 2 deferred, ~28 dismissed as noise. Both deferrals fold into Epic 3 hardening backlog (rapid double-click race → Story 3.2 toast surface; reducer dedup → Story 3.4 refetch UX). Epic 2 closes — all four reducer optimistic action triplets have a UI consumer; PRD core-loop FRs (FR1-FR4, FR17, FR25) exercised end-to-end. |
