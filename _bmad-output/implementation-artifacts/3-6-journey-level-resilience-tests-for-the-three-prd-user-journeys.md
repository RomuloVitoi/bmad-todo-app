# Story 3.6: Journey-level resilience tests for the three PRD user journeys

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reviewer of the v1 product,
I want automated component tests that walk through the three PRD user journeys including failure and recovery,
so that NFR23's "critical paths including the three documented user journeys" is demonstrably satisfied.

## Acceptance Criteria

1. **Given** `apps/web/src/components/TodoApp.test.tsx`, **when** inspected, **then** it contains three named test groups corresponding to PRD Journey 1, 2, and 3.

2. **Given** the Journey 1 group ("First-Time Use"), **when** the test runs, **then** it mounts `<TodoApp>` with an empty-list API response, **and** asserts loading state → empty state, **and** types a todo, presses Enter, **and** asserts the optimistic entry appears, **and** asserts it is reconciled when the mock API resolves with a server todo, **and** no console errors occur during the test.

3. **Given** the Journey 2 group ("Returning Session"), **when** the test runs, **then** it mounts `<TodoApp>` with a seeded populated list (mix of active and completed), **and** asserts all items render with correct visual state (strikethrough where appropriate), **and** deletes a completed item and asserts removal + DELETE call, **and** toggles an active item to completed and asserts visual + `aria-checked` state change.

4. **Given** the Journey 3 group ("Failure & Recovery"), **when** the test runs, **then** it covers — at minimum — these sub-cases using MSW (or fetch mocks):

   **Sub-case A (offline add):** **Given** the user types and submits, **when** the API mock returns a network/fetch failure, **then** the optimistic entry is removed, the input text is restored (FR19), and a Toast is visible with the offline message.

   **Sub-case B (500 on toggle):** **Given** the user clicks a checkbox, **when** the API mock returns `500`, **then** the checkbox state reverts and a Toast is visible with a generic error message.

   **Sub-case C (500 on delete):** **Given** the user clicks delete, **when** the API mock returns `500`, **then** the item is re-inserted at its original position and a Toast is visible.

   **Sub-case D (retry after offline add):** **Given** Sub-case A has just occurred, **when** the API mock is switched back to success and the user presses Enter on the restored text, **then** a fresh optimistic add succeeds and is reconciled normally, **and** no duplicate Toast appears (the old one remains or was dismissed; a new successful add does not create a new toast).

   **Sub-case E (initial load failure + retry):** **Given** `api.getTodos` is mocked to return `500` on first call, **when** the app loads and the user clicks Retry, **then** the second call resolves successfully and the populated list renders.

5. **Given** the Journey 3 group, **when** timing is measured, **then** no test depends on `setTimeout`-based sleeps; all async waits use RTL's `findBy*`, `waitFor`, or explicit promise resolutions, **and** the full Journey 3 group completes in under 10 seconds locally.

6. **Given** all three journey groups, **when** the full test suite runs, **then** every test passes, **and** test output is readable (test names describe the journey step being verified).

_(ACs verbatim from [epics.md:1222-1288](../planning-artifacts/epics.md#L1222-L1288).)_

## Tasks / Subtasks

- [x] **Task 1: Add the Journey 1 ("First-Time Use") describe block (AC: #1, #2)**
  - [x] Edit [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx). Append a new `describe('<TodoApp /> Journey 1 — First-Time Use', () => { ... })` block at the **end of the file**, after the existing `<TodoApp /> global safety net` block (line 669 onward). Do NOT interleave it with or modify any existing `describe` block — every prior Epic 3 story (3.3, 3.4, 3.5) appended new blocks at the end rather than editing existing ones, and this story follows the same additive shape.
  - [x] Single test: mount with an empty-list `GET /todos` response, assert the loading indicator is visible immediately after `render()` (synchronous — the mount effect's `dispatch({ type: 'loadStart' })` runs inside React's `act()` before the mocked `fetch` promise resolves), then `await screen.findByTestId('todo-list-empty')`. Type a todo and press Enter, assert the optimistic entry appears in the list, then resolve the mocked `POST /todos` with a server todo and assert the entry reconciles (item still present, same text, no duplicate). Spy on `console.error` for the whole test and assert it was never called.

    ```tsx
    it('Journey 1: load → empty → add → optimistic → reconciled, with no console errors', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ todos: [] }))
        .mockResolvedValueOnce(
          jsonResponse(
            {
              id: '33333333-3333-4333-8333-333333333333',
              text: 'pick up dry cleaning',
              completed: false,
              createdAt: '2026-04-29T00:00:00.000Z',
            },
            { status: 201 },
          ),
        );
      vi.stubGlobal('fetch', fetchMock);

      const { default: TodoApp } = await import('./TodoApp');
      render(<TodoApp />);

      expect(screen.getByTestId('todo-list-loading')).toBeInTheDocument();
      await screen.findByTestId('todo-list-empty');

      const user = userEvent.setup();
      await user.type(
        screen.getByLabelText(/add a todo/i),
        'pick up dry cleaning{Enter}',
      );

      const list = await screen.findByTestId('todo-list');
      expect(within(list).getByText('pick up dry cleaning')).toBeInTheDocument();

      // Reconciled: still one item, same text, no duplicate optimistic/server pair.
      const items = await within(list).findAllByTestId('todo-item');
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent('pick up dry cleaning');

      expect(errorSpy).not.toHaveBeenCalled();
    });
    ```

- [x] **Task 2: Add the Journey 2 ("Returning Session") describe block (AC: #1, #3)**
  - [x] Append `describe('<TodoApp /> Journey 2 — Returning Session', () => { ... })` immediately after the Journey 1 block.
  - [x] Single test: seed `GET /todos` with a mix of one active and one completed todo. Assert the active item has no strikethrough (`todo-item-text` does NOT have class `line-through`) and the completed item does (class `line-through`), and their checkboxes reflect `aria-checked="false"` / `"true"` respectively. Delete the **completed** item (click its `Delete: <text>` button); assert it is removed from the DOM and the `DELETE /todos/:id` call fired with the completed item's id. Then toggle the **active** item to completed; assert its checkbox flips to `aria-checked="true"` and its text gains the `line-through` class.

    ```tsx
    it('Journey 2: seeded mixed list renders correct visual state; delete completed; toggle active to completed', async () => {
      const active = {
        id: '44444444-4444-4444-8444-444444444444',
        text: 'clean coffee machine',
        completed: false,
        createdAt: '2026-04-29T00:00:00.000Z',
      };
      const completedTodo = {
        id: '55555555-5555-4555-8555-555555555555',
        text: 'stale completed item',
        completed: true,
        createdAt: '2026-04-29T00:00:00.000Z',
      };
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ todos: [active, completedTodo] }))
        .mockResolvedValueOnce(new Response(null, { status: 204 })) // DELETE
        .mockResolvedValueOnce(
          jsonResponse({ ...active, completed: true }, { status: 200 }), // PATCH
        );
      vi.stubGlobal('fetch', fetchMock);

      const { default: TodoApp } = await import('./TodoApp');
      render(<TodoApp />);

      const list = await screen.findByTestId('todo-list');
      const activeItem = within(list)
        .getByText(active.text)
        .closest('[data-testid="todo-item"]') as HTMLElement;
      const completedItem = within(list)
        .getByText(completedTodo.text)
        .closest('[data-testid="todo-item"]') as HTMLElement;

      expect(within(activeItem).getByTestId('todo-item-text')).not.toHaveClass(
        'line-through',
      );
      expect(within(activeItem).getByRole('checkbox')).toHaveAttribute(
        'aria-checked',
        'false',
      );
      expect(within(completedItem).getByTestId('todo-item-text')).toHaveClass(
        'line-through',
      );
      expect(within(completedItem).getByRole('checkbox')).toHaveAttribute(
        'aria-checked',
        'true',
      );

      const user = userEvent.setup();
      await user.click(
        within(completedItem).getByRole('button', {
          name: `Delete: ${completedTodo.text}`,
        }),
      );
      await waitFor(() =>
        expect(screen.queryByText(completedTodo.text)).not.toBeInTheDocument(),
      );
      const deleteCall = fetchMock.mock.calls[1]!;
      expect(deleteCall[0]).toBe(
        `http://localhost:4000/todos/${completedTodo.id}`,
      );
      expect(deleteCall[1]).toMatchObject({ method: 'DELETE' });

      await user.click(within(activeItem).getByRole('checkbox'));
      await waitFor(() =>
        expect(within(activeItem).getByRole('checkbox')).toHaveAttribute(
          'aria-checked',
          'true',
        ),
      );
      expect(within(activeItem).getByTestId('todo-item-text')).toHaveClass(
        'line-through',
      );
    });
    ```

  - [x] `activeItem`/`completedItem` are resolved once via `closest('[data-testid="todo-item"]')` **before** the delete fires — re-querying `completedItem` after its row is removed from the DOM would throw. Query `activeItem` fresh (or reuse the same reference) after the delete since the active row is untouched by it.

- [x] **Task 3: Add the Journey 3 ("Failure & Recovery") describe block (AC: #1, #4, #5)**
  - [x] Append `describe('<TodoApp /> Journey 3 — Failure & Recovery', () => { ... })` immediately after the Journey 2 block. Four tests, each independently rendering a fresh `<TodoApp>` (do not share state across tests — `vi.resetModules()` in the file's existing `beforeEach` already guarantees a clean module cache per test).
  - [x] **Sub-cases A + D combined in one test** (the spec's Sub-case D explicitly continues from Sub-case A's just-occurred state — write them as one continuous flow, not two isolated tests): offline add fails → input restored + offline Toast → mock switched to success → retry succeeds → no duplicate Toast. Use `mockRejectedValueOnce(new TypeError('Failed to fetch'))` for the failing POST — this is what `apps/web/src/lib/api.ts`'s `createTodo` catches to throw `ApiError.networkFailure()` (message: `"You're offline. Your change wasn't saved."`), distinct from a `500` response.

    ```tsx
    it('Sub-case A+D: offline add fails (input restored, offline toast), then retry succeeds after reconnecting', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ todos: [] }))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(
          jsonResponse(
            {
              id: '66666666-6666-4666-8666-666666666666',
              text: 'email landlord',
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
      const input = (await screen.findByLabelText(
        /add a todo/i,
      )) as HTMLInputElement;
      const user = userEvent.setup();

      // Sub-case A: offline add.
      await user.type(input, 'email landlord{Enter}');
      await screen.findByTestId('todo-list-empty'); // optimistic entry rolled back
      expect(input.value).toBe('email landlord');
      expect(await screen.findByTestId('toast-description')).toHaveTextContent(
        "You're offline. Your change wasn't saved.",
      );

      // Sub-case D: retry with the restored text once connectivity returns.
      await user.type(input, '{Enter}');
      const list = await screen.findByTestId('todo-list');
      await within(list).findByText('email landlord');
      expect(input.value).toBe('');

      // No duplicate toast — the retry succeeded silently (single-toast model,
      // the offline message stays until dismissed or replaced by a new failure).
      expect(screen.getAllByTestId('toast-root')).toHaveLength(1);
    });
    ```

    Note: `user.type(input, '{Enter}')` submits the value FR19 already restored into the input (no retyping) — do not clear/retype the text manually, that would defeat the point of the assertion.

  - [x] **Sub-case B** (500 on toggle): reuse the existing seeded-checkbox pattern; assert revert + generic Toast.

    ```tsx
    it('Sub-case B: 500 on toggle reverts the checkbox and shows a generic-error toast', async () => {
      const seed = {
        id: '77777777-7777-4777-8777-777777777777',
        text: 'pick up dry cleaning',
        completed: false,
        createdAt: '2026-04-29T00:00:00.000Z',
      };
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
        .mockResolvedValueOnce(
          jsonResponse(
            { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
            { status: 500 },
          ),
        );
      vi.stubGlobal('fetch', fetchMock);

      const { default: TodoApp } = await import('./TodoApp');
      render(<TodoApp />);

      const checkbox = await screen.findByRole('checkbox', { name: seed.text });
      const user = userEvent.setup();
      await user.click(checkbox);

      await waitFor(() =>
        expect(
          screen.getByRole('checkbox', { name: seed.text }),
        ).toHaveAttribute('aria-checked', 'false'),
      );
      expect(await screen.findByTestId('toast-description')).toHaveTextContent(
        'Something went wrong. Please try again.',
      );
    });
    ```

  - [x] **Sub-case C** (500 on delete): reuse the existing seeded-delete pattern; assert re-insertion at original position + Toast.

    ```tsx
    it('Sub-case C: 500 on delete re-inserts the item at its original position and shows a toast', async () => {
      const seed = {
        id: '88888888-8888-4888-8888-888888888888',
        text: 'pick up dry cleaning',
        completed: false,
        createdAt: '2026-04-29T00:00:00.000Z',
      };
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
        .mockResolvedValueOnce(
          jsonResponse(
            { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
            { status: 500 },
          ),
        );
      vi.stubGlobal('fetch', fetchMock);

      const { default: TodoApp } = await import('./TodoApp');
      render(<TodoApp />);

      const deleteBtn = await screen.findByRole('button', {
        name: `Delete: ${seed.text}`,
      });
      const user = userEvent.setup();
      await user.click(deleteBtn);
      await screen.findByTestId('todo-list-empty');

      const items = await screen.findAllByTestId('todo-item');
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent(seed.text);
      expect(await screen.findByTestId('toast-description')).toHaveTextContent(
        'Something went wrong. Please try again.',
      );
    });
    ```

  - [x] **Sub-case E** (initial load failure + retry): mirrors the existing `initial-load retry journey` happy-path test, restated here as this story's explicit journey-level assertion.

    ```tsx
    it('Sub-case E: initial load fails, user clicks Retry, second call succeeds and the list renders', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
            { status: 500 },
          ),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            todos: [
              {
                id: '99999999-9999-4999-8999-999999999999',
                text: 'clean coffee machine',
                completed: false,
                createdAt: '2026-04-29T00:00:00.000Z',
              },
            ],
          }),
        );
      vi.stubGlobal('fetch', fetchMock);

      const { default: TodoApp } = await import('./TodoApp');
      render(<TodoApp />);

      await screen.findByTestId('todo-list-error');
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /retry/i }));

      const list = await screen.findByTestId('todo-list');
      expect(within(list).getByText('clean coffee machine')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    ```

  - [x] Do NOT add a literal wall-clock timer assertion for the "<10 seconds" budget (AC #5) — this is a runtime characteristic to confirm via the actual test run (`npm run test`'s per-file duration output), not something to encode as an in-test assertion. All four sub-case tests already use `findBy*`/`waitFor`/awaited promises exclusively, consistent with AC #5's "no `setTimeout`-based sleeps" — do not introduce any `waitFor(..., { timeout: ... })` padding or manual delays.

- [x] **Task 4: Verify (AC: #6)**
  - [x] `npm run lint`, `npm run typecheck`, `npm run test` (all workspaces) — all green, 0 warnings.
  - [x] Confirm the three new `describe` blocks are the ONLY change to `TodoApp.test.tsx` — no existing test was edited, renamed, or removed. Confirm `reducer.ts`, `TodoApp.tsx`, `TodoList.tsx`, `TodoInput.tsx`, `TodoItem.tsx`, `Toast.tsx`, `errors.ts`, `api.ts` are all byte-for-byte unchanged (this story is test-only).
  - [x] Time the `TodoApp.test.tsx` file's run (Vitest prints per-file duration) and confirm the file overall stays comfortably under a few seconds locally — the AC's "<10s for the Journey 3 group" is a soft runtime budget, not a hard gate enforced by CI in this story.

## Dev Notes

### Where this story sits

Epic 3 ("Failure Resilience & Recovery") intro, verbatim: "When something goes wrong (offline, server 5xx, timeout), the user sees a clear non-technical error, their typed input is preserved, and they can retry without losing list state or refreshing. The system surfaces every failure — nothing drops silently — and operators can diagnose failures from correlated server logs." [epics.md:1016-1018](../planning-artifacts/epics.md#L1016-L1018)

This is the **last story in Epic 3** and the last story in the entire v1 sprint plan (no Epic 4 exists per `sprint-status.yaml`).

| Story | Scope | Relationship to 3.6 |
|---|---|---|
| 3.1 (done) | Toast UI primitive + `toast` reducer slice + `errorShown`/`errorDismiss` | Provides `toast-root`/`toast-description` test ids this story's assertions query |
| 3.2 (done) | `ApiError` → human-readable message mapping; wires mutation rejection handlers to `errorShown` | Provides the exact message strings ("You're offline…", "Something went wrong…") this story asserts verbatim |
| 3.3 (done) | `TodoInput` captures + restores typed text on add failure (FR19) | Sub-case A's "input text is restored" assertion exercises this story's behavior |
| 3.4 (done) | Initial-load error/retry UI (FR20) | Sub-case E exercises this story's Retry button + `handleRetry` |
| 3.5 (done) | Global `window.addEventListener('unhandledrejection' \| 'error', ...)` safety net (NFR9) | **Not exercised by 3.6** — per 3.5's own Dev Notes, Journey 3's sub-cases A–E all cover *caught* mutation/load failures, not the safety net. Do not add safety-net coverage here; it already has its own dedicated `describe` block. |
| **3.6 (this story)** | Journey-level resilience tests (Journeys 1–3), organized by PRD journey rather than by feature | — |

### Critical architectural guardrails

- **This story adds zero production code.** Every behavior the three new `describe` blocks assert (optimistic add/reconcile, toggle/delete rollback, input restoration, Toast messages, retry) was already implemented and unit/component-tested by Stories 2.4–3.5. This story's sole job is to add three **journey-level** test groups — named for and structured around the PRD's three user journeys — as an explicit, traceable NFR23 artifact. Do not touch `reducer.ts`, `TodoApp.tsx`, `TodoList.tsx`, `TodoInput.tsx`, `TodoItem.tsx`, `Toast.tsx`, `errors.ts`, or `api.ts`.
- **Additive only — do not restructure the existing test file.** `TodoApp.test.tsx` already has seven `describe` blocks (`create journey`, `toggle journey`, `delete journey`, `mutation-failure toasts`, `initial-load retry journey`, `global safety net`) covering the same underlying behaviors at a finer, feature-oriented grain. This story does NOT delete, merge, or rename any of them — it appends three new, coarser **journey**-oriented blocks at the end of the file. The overlap between the new Journey-level tests and the existing feature-level tests is intentional: NFR23 explicitly asks for tests traceable to "the three documented user journeys" by name, which the existing feature-grouped tests do not provide on their own even though they exercise the same code paths.
- **This is a component-test story (Vitest + RTL), not an E2E story.** [architecture.md:542](../planning-artifacts/architecture.md#L542) designates `TodoApp.test.tsx` itself as "journey-level tests (happy path, error recovery)" — this story fulfills that designation directly. Playwright E2E coverage of the equivalent journeys (P0-022 Journey 1, P0-023 Journey 2, P0-024 Journey 3) is tracked separately under `apps/web/e2e/` (Journeys 1–2 shipped in Story 3.0.1; **P0-024 Journey 3 E2E remains explicitly deferred** — see [deferred-work.md:24](./deferred-work.md#L24): "E2E scenarios that depend on UI infrastructure not yet built (P0-024 Journey 3 — needs Toast; ...) remain assigned to their original Epic 3 stories (3.6 / ...)"). Do not add or modify anything under `apps/web/e2e/` in this story — P0-024's Playwright coverage is out of scope here; only the component-level (`TodoApp.test.tsx`) journey coverage is this story's responsibility, matching epics.md's exact file target.
- **No MSW.** The AC text says "using MSW (or fetch mocks)" — this codebase has never used MSW (not a dependency; `grep` confirms it's absent from `apps/web/package.json`). Every existing test uses the established `vi.stubGlobal('fetch', fetchMock)` pattern with `Response` objects built via the file's local `jsonResponse()` helper. Follow that exact convention; do not introduce MSW as a new devDependency.
- **Sub-case A must simulate a network failure, not a 500.** `apps/web/src/lib/api.ts`'s `createTodo`/`updateTodo`/`deleteTodo` wrap their `fetch()` call in a `try/catch` that throws `ApiError.networkFailure()` — message `"You're offline. Your change wasn't saved."` — specifically when `fetch()` itself rejects (DNS failure, offline, connection refused), as distinct from `fetch()` resolving with a non-OK `Response` (which produces `ApiError.fromResponse()`'s status-mapped message instead). Use `fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))` for Sub-case A's POST — NOT a `500` `Response` — or the assertion on the exact offline message will fail. **This closes an existing gap**: [deferred-work.md:282](./deferred-work.md#L282) notes "No `TodoApp`-level test for the network-failure → toast path" was raised by a prior code review's Blind Hunter pass and left as test-hardening; Sub-case A is that missing test.
- **Sub-cases A and D are one continuous test, not two.** The spec's own wording for Sub-case D — "Given Sub-case A **has just occurred**" — describes a single flow, not an independently-seeded scenario. Write one `it(...)` that performs the offline-add-fails assertions (A) and then, without re-rendering, switches the next mocked fetch call to success and re-submits the same restored input text (D). Sub-cases B, C, and E are independent scenarios (different trigger, different seed state) and should remain separate tests.
- **Single-toast model still applies in Sub-case D.** Per the reducer's unmodified `errorShown` behavior (Story 3.1/3.2), only one Toast can exist at a time. A successful retry after a failure does NOT dismiss the still-open failure Toast (see the existing `mutation-failure toasts` describe block's "a successful mutation does not dismiss an already-displayed failure Toast" test) — assert `toast-root` count stays at 1 (the original offline Toast, or its replacement if a later `errorShown` fired), never 0 or 2. Do not assert the Toast disappears after the successful retry.

### Out-of-scope (do NOT do in this story)

- Any change to `reducer.ts`, `TodoApp.tsx`, `TodoList.tsx`, `TodoInput.tsx`, `TodoItem.tsx`, `Toast.tsx`, `errors.ts`, or `api.ts` — this story is test-only.
- Any edit to the six pre-existing `describe` blocks in `TodoApp.test.tsx` — append only.
- Anything under `apps/web/e2e/` (Playwright) — P0-024's E2E Journey 3 coverage is explicitly deferred to a future story, not this one.
- Adding MSW as a dependency.
- A literal timer/`performance.now()` assertion for the "<10s" runtime budget in AC #5 — that budget is verified by observing the actual test run, not encoded as an in-test assertion.
- Safety-net (`unhandledrejection`/`error` listener) coverage — already fully covered by Story 3.5's dedicated `describe` block; not part of any of the three PRD journeys' sub-cases.

### Project Structure Notes

```text
apps/web/
└── src/
    └── components/
        └── TodoApp.test.tsx      # ← extended: three new journey-named describe blocks appended
```

No new files; no production code changes; no new dependency. Every other file in the component tree is unchanged.

### Testing Requirements

- **Unit/component tests:** `apps/web/src/components/TodoApp.test.tsx` (extended — three new `describe` blocks: `<TodoApp /> Journey 1 — First-Time Use`, `<TodoApp /> Journey 2 — Returning Session`, `<TodoApp /> Journey 3 — Failure & Recovery`). Mandatory per AC #1–#5.
- **Integration tests:** none — no API or server changes in this story.
- **E2E tests:** none added or modified in this story (P0-024 remains deferred; see guardrails above).
- **Test runner:** Vitest + jsdom 29 + RTL + `@testing-library/user-event`, already configured; reuse the file's existing `jsonResponse()` helper and `beforeEach`/`afterEach` (`vi.stubEnv`, `vi.resetModules`, `vi.restoreAllMocks`, `vi.unstubAllEnvs`, `vi.unstubAllGlobals`) exactly as-is.
- **Coverage gate:** none in v1.

### Library / version pins

No new dependencies. No version changes. Pure test-file additions to `TodoApp.test.tsx`.

### Previous story intelligence (3.5)

- 3.5 established (continuing from 3.3/3.4) the convention of documenting explicit "why NOT to do X" guardrails in Dev Notes, and of appending new logic/tests in new blocks rather than interleaving into existing ones — this story follows the identical append-only shape, this time for test-only content.
- 3.5's Dev Notes explicitly flagged that "3.6's Journey 3 sub-cases (A–E) all cover *caught* mutation/load failures, not the safety net; do not assume 3.6 exercises this story's [3.5's] code path" — confirmed and honored above: the safety net is intentionally NOT exercised by any of the five sub-cases in this story.
- 3.5 was purely additive to `TodoApp.tsx`/`TodoApp.test.tsx` with zero reducer changes; 3.6 goes one step further and touches zero production files at all — the smallest-blast-radius story in the epic.

### Git intelligence (recent commits)

Most recent commit (`bf3d507`, Story 3.5) added a new `describe('<TodoApp /> global safety net', ...)` block at the end of `TodoApp.test.tsx`, following the same append-at-end-of-file pattern used by 3.3 and 3.4 before it. This story continues that exact pattern — three more blocks appended after `global safety net`, in Journey 1 → 2 → 3 order to mirror the PRD's own journey numbering.

### References

- [epics.md:1222-1288](../planning-artifacts/epics.md#L1222-L1288) — Story 3.6 full AC text (source of truth for this story).
- [prd.md:156-214](../planning-artifacts/prd.md#L156-L214) — the three User Journeys narratives (Journey 1 "First-Time Use", Journey 2 "Returning Session & Routine Use", Journey 3 "Failure & Recovery") this story's test groups are named after and traced to.
- [prd.md:342](../planning-artifacts/prd.md) — NFR23 ("Automated tests cover the critical paths: CRUD API operations, list rendering, and the three documented user journeys including failure recovery").
- [architecture.md:542](../planning-artifacts/architecture.md#L542) — designates `TodoApp.test.tsx` as "journey-level tests (happy path, error recovery)", the authoritative file target for this story.
- [architecture.md:847](../planning-artifacts/architecture.md#L847) — NFR23 compliance checklist entry.
- [deferred-work.md:282](./deferred-work.md#L282) — the pre-existing "no network-failure → toast component test" gap this story's Sub-case A closes.
- [deferred-work.md:24](./deferred-work.md#L24) — confirms P0-024 (Journey 3 E2E) remains assigned to a future story, not this one.
- `apps/web/src/lib/api.ts` — `createTodo`/`updateTodo`/`deleteTodo`'s `try/catch` around `fetch()` producing `ApiError.networkFailure()` vs. `ApiError.fromResponse()`; read directly to confirm Sub-case A's exact mock shape.
- `apps/web/src/lib/errors.ts` — `ApiError.networkFailure()` (offline message) and `messageForStatus()` (500 → generic message) — the exact strings this story's assertions use verbatim.
- `apps/web/src/components/TodoApp.tsx`, `TodoApp.test.tsx`, `TodoList.tsx`, `TodoInput.tsx`, `TodoItem.tsx` — current implementation read directly for this story; confirms all test ids (`todo-list`, `todo-list-empty`, `todo-list-loading`, `todo-list-error`, `todo-item`, `todo-item-text`, `toast-root`, `toast-description`) and accessible names (`Add a todo` label, `Delete: <text>` button label, checkbox named by todo text) used above.
- `apps/web/AGENTS.md` — Next.js 16 / Tailwind v4 project-specific caveats (not directly relevant to this test-only story, but still governs the codebase).

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- Sub-case C ("500 on delete") as specified verbatim in the story's Task 3 code block used `fetchMock.mockResolvedValueOnce(...)` for the failing DELETE, which resolved the mocked promise before `screen.findByTestId('todo-list-empty')` could observe the transient optimistic-empty state — deterministically (not flaky; reproduced 3/3 runs) timed out because the rollback had already happened before the first poll. Fixed by switching to the same deferred-promise pattern (`mockReturnValueOnce(deletePromise)` + manual `resolveDelete(...)` after the empty-state assertion) already used by the pre-existing `<TodoApp /> delete journey` rollback test in this same file, so the transient state is deterministically observable. This is a test-only fix; no behavior change and no other Journey 3 sub-case needed it (A+D, B, E all passed as specified).

### Completion Notes List

- Appended three new `describe` blocks to `apps/web/src/components/TodoApp.test.tsx` — `<TodoApp /> Journey 1 — First-Time Use`, `<TodoApp /> Journey 2 — Returning Session`, `<TodoApp /> Journey 3 — Failure & Recovery` (5 sub-case tests: A+D combined, B, C, E) — exactly as specified in the story's Tasks/Subtasks, with one deviation (Sub-case C, documented above under Debug Log References).
- Zero production code touched: `reducer.ts`, `TodoApp.tsx`, `TodoList.tsx`, `TodoInput.tsx`, `TodoItem.tsx`, `Toast.tsx`, `errors.ts`, `api.ts` are all byte-for-byte unchanged (confirmed via `git diff --stat` — only `TodoApp.test.tsx` and `sprint-status.yaml` changed). No new dependencies (no MSW).
- `npm run lint`: 0 warnings. `npm run typecheck` (shared/api/web): clean. `npm run test` (all workspaces): shared 25/25, api 4/4, web 154/154 (was 148 before this story) — all green, no regressions.
- `TodoApp.test.tsx` full-file run duration: ~1.2–1.3s locally (31 tests total in the file), comfortably under the AC #5 "<10s for the Journey 3 group" soft budget. No `setTimeout`-based sleeps used anywhere in the new tests — all async waits use `findBy*`, `waitFor`, or awaited/deferred promises.
- All 6 ACs satisfied: AC#1 (three named journey groups) via the three new `describe` blocks; AC#2 (Journey 1 flow) via the single Journey 1 test; AC#3 (Journey 2 flow) via the single Journey 2 test; AC#4 (Journey 3 sub-cases A–E) via the four Journey 3 tests; AC#5 (no setTimeout sleeps, runtime budget) confirmed above; AC#6 (full suite passes, readable test names) confirmed by the test run output.

### File List

- `apps/web/src/components/TodoApp.test.tsx` (modified — three new `describe` blocks appended, 0 existing tests edited/removed)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status tracking: 3-6 ready-for-dev → in-progress → review)

## Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-05 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Adds three journey-named `describe` blocks (Journey 1 "First-Time Use", Journey 2 "Returning Session", Journey 3 "Failure & Recovery" with sub-cases A–E) to `TodoApp.test.tsx`, appended after the existing six blocks; zero production-code changes, zero new dependencies (no MSW); closes a pre-existing deferred-work.md gap (no network-failure → toast component test) via Sub-case A. |
| 2026-07-05 | Dev-Story: implemented. Three journey-named `describe` blocks appended to `TodoApp.test.tsx` per spec; one test-only deviation in Sub-case C (deferred-promise pattern instead of `mockResolvedValueOnce` for the failing DELETE, to make the transient optimistic-empty state deterministically observable — see Dev Agent Record). Lint/typecheck clean; web tests 148 → 154; zero production-code changes; zero new dependencies. Status: ready-for-dev → in-progress → review. |

## Review Findings

_Code review 2026-07-05 (3 parallel adversarial layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor). Acceptance Auditor: 6/6 ACs PASS, all guardrails/out-of-scope prohibitions honored, zero scope creep, 31/31 tests green. Findings below are all test-strength observations — no production code involved, no AC failures._

- [x] [Review][Patch] Sub-case B revert is not distinguishable from "optimistic never applied" — The seed is `completed: false`, so the checkbox already reads `aria-checked="false"` before the click; the `waitFor(aria-checked === 'false')` end-state equals the start-state. A genuinely broken *revert* (checkbox stuck at `true`) IS caught, but a broken *optimistic apply* (never flips to `true`) would pass silently. Fix (decision 2026-07-05: strengthen): observe the transient optimistic `true` via a deferred-promise (as Sub-case C does) or seed `completed: true` and assert it reverts to `true`. [apps/web/src/components/TodoApp.test.tsx:974]
- [x] [Review][Patch] Sub-case C does not verify the "original position" the AC advertises — AC#4 Sub-case C intent is "re-inserted at its original position", but the single-item seed makes `items[0]` trivially true regardless of the reducer's index-clamping logic; an implementation that always re-appended would be indistinguishable. Fix (decision 2026-07-05: strengthen): seed 2+ items and delete a middle one to actually exercise positional re-insertion. [apps/web/src/components/TodoApp.test.tsx:1010]
- [x] [Review][Patch] Journey 2 toggle never asserts the PATCH request (asymmetric with the DELETE assertion) — The DELETE branch asserts `fetchMock.mock.calls[1]` URL + method, but the toggle branch asserts no fetch call at all; the optimistic flip alone satisfies `aria-checked="true"` + `line-through`, so a missing/misrouted `updateTodo` would pass. Add a `calls[2]` PATCH URL + method assertion symmetric with the DELETE one. [apps/web/src/components/TodoApp.test.tsx:914]
- [x] [Review][Patch] Journey 1 reconciliation round-trip is not independently verified — `findAllByTestId('todo-item')` length 1 passes on the optimistic entry alone; if the POST never fired or reconciliation never happened the assertion still succeeds. Add `expect(fetchMock).toHaveBeenCalledTimes(2)` to prove the POST/reconcile round-trip actually occurred. [apps/web/src/components/TodoApp.test.tsx:842]
- [x] [Review][Defer] Toast assertions depend on Radix's 5000 ms auto-dismiss not elapsing under real timers — deferred, pre-existing. Sub-case A+D asserts `toast-description` / `toast-root` after several awaited async steps with real timers (Toast `duration={5000}`, no `vi.useFakeTimers`); a slow CI run exceeding 5 s would flake. This exposure is shared by all pre-existing toast tests in the file, not unique to this change; a real fix means fake timers (a broader test-infra decision), and AC#5 forbids `waitFor` timeout padding. [apps/web/src/components/TodoApp.test.tsx:826]
