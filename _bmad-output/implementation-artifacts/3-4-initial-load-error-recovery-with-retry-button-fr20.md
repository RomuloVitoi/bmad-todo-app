# Story 3.4: Initial-load error recovery with retry button (FR20)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a visitor arriving when the initial list fetch fails,
I want a clearly visible error UI with a retry button,
so that I can recover without refreshing the page (FR20, NFR8).

## Acceptance Criteria

1. **Given** `TodoList.tsx` with `state.status === 'error'` branch, **when** it renders, **then** the Epic 1 placeholder fallback is replaced with a real recovery UI containing: a non-technical heading ("Couldn't load todos"), an optional subtext with `state.error` for diagnostics, and a visible `<button type="button">Retry</button>`.

2. **Given** the retry button, **when** inspected for accessibility, **then** it has a visible focus ring on `:focus-visible`, **and** its tap target is ≥44×44 CSS pixels (NFR14), **and** text contrast meets WCAG AA.

3. **Given** a user clicks Retry, **when** the click handler runs, **then** the reducer dispatches `loadStart`, **and** `api.getTodos()` is invoked, **and** the UI transitions to the `loading` state (which in turn replaces the error UI with the loading indicator).

4. **Given** retry succeeds, **when** `api.getTodos()` resolves, **then** `loadSuccess` is dispatched and the populated list renders normally.

5. **Given** retry fails again, **when** `api.getTodos()` rejects, **then** `loadError` is dispatched and the error UI reappears, **and** no Toast is shown (initial-load errors are surfaced inline, not via Toast).

6. **Given** the initial-load error UI, **when** inspected after implementation, **then** the explicit "placeholder for Epic 3" comment from Story 1.9's implementation is removed.

7. **Given** `TodoList.test.tsx`, **when** tests run, **then** coverage includes: error state renders heading + button; click Retry transitions through loading to success (mocked); click Retry fails and error UI reappears; Retry is keyboard-activatable (Enter).

_(ACs verbatim from [epics.md:1146-1185](../planning-artifacts/epics.md#L1146-L1185); AC #7's file split across `TodoList.test.tsx` + `TodoApp.test.tsx` is a deliberate call — see "Test coverage split rationale" in Dev Notes below.)_

## Tasks / Subtasks

- [x] **Task 1: Replace `TodoList`'s error branch with a real recovery UI (AC: #1, #2, #6)**
  - [x] Edit [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx). Add `onRetry: () => void` to `TodoListProps` (alongside the existing `onToggle`/`onDelete`), and destructure `error` from `state` at the top of the component. Target end-state for the props interface and destructure:

    ```tsx
    export interface TodoListProps {
      state: TodoState;
      onToggle: (id: string, nextCompleted: boolean) => void;
      onDelete: (id: string) => void;
      onRetry: () => void;
    }

    export default function TodoList({ state, onToggle, onDelete, onRetry }: TodoListProps) {
      const { status, todos, error } = state;
    ```

  - [x] Replace the entire `if (status === 'error') { ... }` block (the "EPIC 1 PLACEHOLDER" comment + its returned `<div>`) with:

    ```tsx
    if (status === 'error') {
      return (
        <div
          data-testid="todo-list-error"
          data-status="error"
          role="alert"
          className="flex flex-col items-center gap-3 rounded-md border border-current/10 px-4 py-8 text-center text-sm"
        >
          <p className="font-medium">{"Couldn't load todos"}</p>
          {error !== undefined && (
            <p data-testid="todo-list-error-detail" className="opacity-70">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex h-11 items-center justify-center rounded-md border border-current/10 px-4 text-sm font-medium outline-none hover:bg-current/5 focus-visible:ring-2 focus-visible:ring-current/40"
          >
            Retry
          </button>
        </div>
      );
    }
    ```

    **Use `{"Couldn't load todos"}` (a JS string literal in a JSX expression), not a raw `Couldn't` in JSX text.** A bare apostrophe in JSX children can trip `react/no-unescaped-entities` under `eslint-config-next`'s ruleset; wrapping the whole string in `{"..."}` sidesteps this without needing an HTML entity. This is the only place in the codebase so far with an apostrophe in rendered text — no existing convention to follow otherwise.
  - [x] Tap-target sizing: `h-11` (44px) plus `px-4` horizontal padding already pushes the rendered width comfortably past 44px for the word "Retry" — no extra `min-w-*` needed, but do not shrink the padding below `px-4`.
  - [x] Focus ring: the project has a **global** `:focus-visible` rule in [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css) (`outline: 2px solid #2563eb; outline-offset: 2px;`) that applies to every focusable element with zero extra classes. The `focus-visible:ring-2 focus-visible:ring-current/40` class above is added only for visual consistency with `TodoItem`'s existing checkbox/delete buttons — it is not the sole mechanism satisfying AC #2's "visible focus ring" (the global outline already does that). Do not remove the global rule or rely on it being sufficient in isolation; keep both.
  - [x] Do not add a `data-testid` to the `<button>` itself — tests target it via `getByRole('button', { name: /retry/i })`, matching this file's and `TodoItem.test.tsx`'s existing query convention (`getByRole('button', { name: /^delete:/i })`, `getByRole('checkbox', ...)`).

- [x] **Task 2: Wire a `handleRetry` callback in `TodoApp` and pass it to `TodoList` (AC: #3, #4, #5)**
  - [x] Edit [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx). Add a new `useCallback` alongside `handleAdd`/`handleToggle`/`handleDelete` (same file, same pattern — inline `ApiError` mapping duplicated per-handler, consistent with every existing handler in this file):

    ```tsx
    const handleRetry = useCallback((): void => {
      dispatch({ type: 'loadStart' });
      getTodos().then(
        (todos) => {
          dispatch({ type: 'loadSuccess', payload: todos });
        },
        (err: unknown) => {
          const message =
            err instanceof ApiError
              ? err.message
              : 'Could not load todos. Please try again.';
          const requestId = err instanceof ApiError ? err.requestId : undefined;
          dispatch({ type: 'loadError', payload: { error: message, requestId } });
        },
      );
    }, []);
    ```

  - [x] Pass it to `TodoList`: `<TodoList state={state} onToggle={handleToggle} onDelete={handleDelete} onRetry={handleRetry} />`.
  - [x] **Do NOT pass an `AbortSignal` to this `getTodos()` call and do NOT add cancellation/`cancelled`-flag logic.** The mount `useEffect`'s `AbortController` guards against a race between the initial fetch and unmount during the very first render; `handleRetry` only ever runs later, from a user click while `state.status === 'error'` (a stable, settled state — the mount effect's own promise has already resolved by then). Keeping this handler dependency-free (`[]`) and signal-free matches the same minimal-surface style as `handleAdd`/`handleToggle`/`handleDelete`, none of which pass a signal either.
  - [x] **Do NOT extract a shared helper between the mount `useEffect` and `handleRetry`.** The 4-line catch-mapping block is intentionally duplicated — this mirrors the existing repetition across `handleAdd`/`handleToggle`/`handleDelete` in this same file (each has its own near-identical `ApiError` catch block). Introducing a shared abstraction here would be the one handler that breaks from that established (if slightly repetitive) pattern.

- [x] **Task 3: `TodoList.test.tsx` — presentational coverage for the error/retry UI (AC: #1, #2, #7 partial)**
  - [x] Edit [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx). Every existing call to `render(<TodoList state={...} onToggle={vi.fn()} onDelete={vi.fn()} />)` **must add `onRetry={vi.fn()}`** — `onRetry` is a required prop, so all 5 existing tests in this file will fail `tsc --noEmit` (and fail RTL by prop-shape, not runtime) until updated. This is a mechanical find-and-replace across the whole file, not just the error-branch test.
  - [x] Update the existing error-branch test (`'renders the error placeholder with role="alert"...'`) to assert the new heading + button, e.g.:

    ```tsx
    it('renders the error recovery UI with a heading and Retry button when status is "error"', () => {
      const state: TodoState = {
        status: 'error',
        todos: [],
        error: 'Service unavailable',
        requestId: 'corr-abc',
        toast: null,
      };
      render(<TodoList state={state} onToggle={vi.fn()} onDelete={vi.fn()} onRetry={vi.fn()} />);
      const err = screen.getByTestId('todo-list-error');
      expect(err).toHaveAttribute('role', 'alert');
      expect(err).toHaveTextContent(/couldn't load todos/i);
      expect(screen.getByTestId('todo-list-error-detail')).toHaveTextContent('Service unavailable');
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
    ```

  - [x] Add a new test: clicking Retry calls the `onRetry` callback exactly once — use `@testing-library/user-event` (not yet imported in this file; add `import userEvent from '@testing-library/user-event';` — it's an existing devDependency, already used in `TodoInput.test.tsx`/`TodoApp.test.tsx`):

    ```tsx
    it('calls onRetry when the Retry button is clicked', async () => {
      const onRetry = vi.fn();
      const state: TodoState = { status: 'error', todos: [], error: 'oops', toast: null };
      render(<TodoList state={state} onToggle={vi.fn()} onDelete={vi.fn()} onRetry={onRetry} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /retry/i }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
    ```

  - [x] Add a new test: Retry is keyboard-activatable — focus the button and press Enter (native `<button>` behavior; no special handling needed in the component, this test only proves it wasn't accidentally broken):

    ```tsx
    it('is keyboard-activatable: focusing Retry and pressing Enter calls onRetry', async () => {
      const onRetry = vi.fn();
      const state: TodoState = { status: 'error', todos: [], error: 'oops', toast: null };
      render(<TodoList state={state} onToggle={vi.fn()} onDelete={vi.fn()} onRetry={onRetry} />);
      screen.getByRole('button', { name: /retry/i }).focus();
      const user = userEvent.setup();
      await user.keyboard('{Enter}');
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
    ```

  - [x] Add a test confirming the optional subtext is omitted when `state.error` is `undefined` (covers the `error !== undefined` branch): render a `status: 'error'` state with no `error` key set, assert `screen.queryByTestId('todo-list-error-detail')` is `null`.
  - [x] This file's existing `afterEach` asserts `consoleErrorSpy`/`consoleWarnSpy` were never called — none of the new tests trigger console output, so no changes needed there.

- [x] **Task 4: `TodoApp.test.tsx` — integration coverage for the actual loading→success/error retry cycle (AC: #3, #4, #5, #7 partial)**
  - [x] Edit [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx). Add a new `describe('<TodoApp /> initial-load retry journey', ...)` block (new top-level describe, alongside the existing `create journey` / `toggle journey` / `delete journey` / `mutation-failure toasts` blocks). Follow this file's established `vi.stubGlobal('fetch', fetchMock)` + `mockResolvedValueOnce`/`mockRejectedValueOnce` chaining convention (see the `create journey`'s happy-path test for the exact `jsonResponse(...)` helper usage already defined in this file).
  - [x] Test: initial load fails, error UI renders, click Retry, second `getTodos()` call succeeds and the list renders:

    ```tsx
    it('retry after initial-load failure: click Retry → loading → success', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ statusCode: 500, error: 'Internal Server Error', message: 'oops' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ todos: [] }));
      vi.stubGlobal('fetch', fetchMock);

      const { default: TodoApp } = await import('./TodoApp');
      render(<TodoApp />);

      await screen.findByTestId('todo-list-error');
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /retry/i }));

      await screen.findByTestId('todo-list-empty');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    ```

  - [x] Test: retry itself fails again — error UI reappears and **no Toast is shown** (AC #5's explicit "initial-load errors are surfaced inline, not via Toast" — this is the one assertion most likely to be silently skipped, call it out explicitly):

    ```tsx
    it('retry after initial-load failure: click Retry → fails again → error UI reappears, no Toast', async () => {
      const errorResponse = () =>
        new Response(JSON.stringify({ statusCode: 500, error: 'Internal Server Error', message: 'oops' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      const fetchMock = vi.fn().mockResolvedValueOnce(errorResponse()).mockResolvedValueOnce(errorResponse());
      vi.stubGlobal('fetch', fetchMock);

      const { default: TodoApp } = await import('./TodoApp');
      render(<TodoApp />);

      await screen.findByTestId('todo-list-error');
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /retry/i }));

      await screen.findByTestId('todo-list-error');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    ```

    Confirm the correct "no toast" query against `Toast.tsx`'s actual rendered role before finalizing — check whether Radix `Toast.Root` renders with `role="status"` or a different role in this codebase's `Toast.tsx` (read the file; do not guess). If it uses a different role/testid, query that instead. The behavioral point is the same either way: `state.toast` must remain `null` throughout this test, since `loadError` (unlike a mutation failure) never dispatches `errorShown`.
  - [x] Do not add a "loading state renders mid-retry" assertion that depends on the fetch promise never resolving within the test — the existing `rollback:` tests in this file already establish the manually-resolved-promise pattern (`resolvePost`) for asserting an intermediate state; reuse that pattern only if you need to assert the loading spinner is visible between click and resolution. It is not required by the ACs above (AC #3 only requires `loadStart` + `getTodos()` invocation, both implied by the final assertions already written).

- [x] **Task 5: Verify**
  - [x] `npm run lint`, `npm run typecheck`, `npm run test` (all workspaces) — all green, 0 warnings.
  - [x] Confirm `reducer.ts` is untouched — `loadStart`/`loadSuccess`/`loadError` already exist from Epic 1 (Story 1.5/1.9); this story adds zero new reducer actions and zero new `TodoState` fields.
  - [x] Confirm the literal string `"placeholder for Epic 3"` (and the surrounding "EPIC 1 PLACEHOLDER" comment block) no longer appears anywhere in `TodoList.tsx` (AC #6): `grep -n "EPIC 1 PLACEHOLDER\|placeholder for Epic 3" apps/web/src/components/TodoList.tsx` should return nothing.

## Dev Notes

### Where this story sits

Epic 3 ("Failure Resilience & Recovery") intro, verbatim: "When something goes wrong (offline, server 5xx, timeout), the user sees a clear non-technical error, their typed input is preserved, and they can retry without losing list state or refreshing. The system surfaces every failure — nothing drops silently — and operators can diagnose failures from correlated server logs." [epics.md:1016-1018](../planning-artifacts/epics.md#L1016-L1018)

| Story | Scope | Depends on 3.4? |
|---|---|---|
| 3.1 (done) | Toast UI primitive + `toast` reducer slice + `errorShown`/`errorDismiss` | No — this story's error path is explicitly Toast-free (AC #5) |
| 3.2 (done) | `ApiError` → human-readable message mapping; wires mutation rejection handlers to `errorShown` | No — this story reuses `ApiError.message`/`messageForStatus` for `state.error`, but never dispatches `errorShown` |
| 3.3 (done) | `TodoInput` captures + restores typed text on add failure (FR19) | No — different surface (mutation/add path, not initial load) |
| **3.4 (this story)** | Replaces `TodoList`'s Epic-1 error placeholder with a real retry-button UI (FR20, initial-load only) | — |
| 3.5 | Global `window.addEventListener('unhandledrejection' \| 'error', ...)` safety net (NFR9) | No |
| 3.6 | Journey-level resilience tests (Journeys 1–3) | Possibly reuses this story's error/retry UI in a Journey-1 "first-time-use with a failed load" scenario — do not assume; 3.6 will specify its own scope |

Do not let this story's scope creep into 3.1/3.2/3.5/3.6's territory (see "Out-of-scope" below).

### Critical architectural guardrails

- **This story adds ZERO new reducer actions and ZERO new `TodoState` fields.** `loadStart`, `loadSuccess`, and `loadError` already exist in [reducer.ts](../../apps/web/src/lib/reducer.ts) (from Epic 1) and already carry forward `state.toast` unchanged on every load-lifecycle transition ([reducer.ts:53-67](../../apps/web/src/lib/reducer.ts#L53-L67) — see the comment "`toast` is orthogonal to the load lifecycle"). This is precisely why AC #5 ("no Toast is shown" on a failed retry) already holds for free: `loadError` never touches `state.toast`, so whatever was there before (nothing, in the initial-load case) stays.
- **Initial-load errors are inline (`state.error` rendered in `TodoList`), never routed through the Toast.** This is an explicit, intentional split established by [architecture.md:411-414](../planning-artifacts/architecture.md#L411-414) ("One state per async operation: `status: 'idle' | 'loading' | 'error'`... initial load only. Mutations do not introduce separate loading flags.") and [architecture.md:404-409](../planning-artifacts/architecture.md#L404-409) (Toast is for mutation-handler and safety-net failures). Do not add an `errorShown` dispatch to `handleRetry` or to the mount effect's failure branch — that would be new, out-of-spec behavior and would duplicate the error message in two places on screen.
- **No automatic retries — retry is 100% user-initiated**, per [architecture.md:416-419](../planning-artifacts/architecture.md#L416-419) ("No automatic retries in v1... the user retries by repeating the action"). Do not add a `setTimeout`/exponential-backoff/auto-retry-on-mount-again mechanism. `handleRetry` only ever runs from the button's `onClick`.
- **`handleRetry` intentionally does NOT reuse the mount `useEffect`'s `AbortController`/`cancelled`-flag machinery.** That machinery exists solely to guard the one race unique to mount (component unmounts before the very first fetch resolves). A retry click only ever happens later, from a stable `'error'` state, so there is no equivalent race to guard against — adding cancellation here would be unjustified defensive code with no failure mode it prevents. See Task 2 for the exact reasoning to preserve if a reviewer asks "why no `AbortSignal` here?".
- **`TodoList` remains a pure presentational component.** It receives `onRetry` as a prop (like `onToggle`/`onDelete`) and never calls `getTodos()`, `dispatch`, or any `TodoApp`-owned state directly. All async orchestration stays in `TodoApp`, consistent with every prior story's component/orchestration split.
- **The visibility-regain silent refetch (`onVisibility` in the mount `useEffect`) is untouched by this story.** It is a different code path (already-`'success'`-state background refresh, fails silently per [architecture.md:419](../planning-artifacts/architecture.md#L419)) from the `'error'`-state user-initiated retry this story adds. Do not merge or refactor these two together.

### Test coverage split rationale

Epic AC #7 names `TodoList.test.tsx` for all four bullets ("error state renders heading + button; click Retry transitions through loading to success (mocked); click Retry fails and error UI reappears; Retry is keyboard-activatable"). Because `TodoList` is a pure presentational component that only ever receives a `state` object as a prop — it does not call `getTodos()` itself — the "transitions through loading to success/failure (mocked)" behavior cannot be authentically exercised at the `TodoList` level without building a throwaway stateful test harness that re-implements `TodoApp`'s orchestration. Following the same precedent set by Story 3.3 (which split `TodoInput`/`TodoApp` coverage despite epics naming only `TodoInput.test.tsx`), this story splits coverage as:

- **`TodoList.test.tsx`** — presentational contract: error UI renders correctly, `onRetry` prop is called on click, keyboard (Enter) activates it, optional subtext appears/disappears based on `state.error`. (Task 3)
- **`TodoApp.test.tsx`** — the actual state-machine behavior: a real (mocked-`fetch`) click-through from `error` → `loading` → `success`, and a second full cycle ending back in `error` with no Toast. (Task 4)

Both files together fully satisfy AC #7's intent; do not skip Task 4 believing Task 3 alone covers it.

### Out-of-scope (do NOT do in this story)

- Any change to `reducer.ts`/`reducer.test.ts` — `loadStart`/`loadSuccess`/`loadError` already exist and are untouched.
- Any change to `Toast.tsx`, `errors.ts`, or the mutation-failure paths in `handleAdd`/`handleToggle`/`handleDelete` — this story only touches the initial-load path.
- The `onVisibility` silent-background-refetch logic in `TodoApp`'s mount `useEffect` — different code path, already shipped, working as designed.
- Global `window.addEventListener('unhandledrejection' | 'error', ...)` safety net — Story 3.5.
- Journey-level / E2E Playwright tests exercising this retry UI end-to-end — Story 3.6, if it chooses to. This story's tests are Vitest + RTL component/integration tests only.
- Auto-retry, retry-with-backoff, or disabling the Retry button while a retry is in flight (the button naturally disappears once `status` flips to `'loading'`, since only the `'error'` branch renders it — no explicit `disabled` state is needed).

### Project Structure Notes

```text
apps/web/
└── src/
    ├── app/
    │   └── globals.css          # (unchanged — already has the global :focus-visible rule this story relies on)
    └── components/
        ├── Toast.tsx             # (unchanged)
        ├── TodoApp.tsx           # ← extended: new handleRetry callback, passed to <TodoList onRetry={...}>
        ├── TodoApp.test.tsx      # ← extended: new "initial-load retry journey" describe block
        ├── TodoInput.tsx         # (unchanged)
        ├── TodoItem.tsx          # (unchanged — its button styling is the visual reference for Retry's classes)
        ├── TodoList.tsx          # ← extended: error branch replaced with heading + subtext + Retry button; new onRetry prop
        └── TodoList.test.tsx     # ← extended: all existing render() calls gain onRetry={vi.fn()}; new tests for the retry UI
```

No new files; no new component; no new dependency.

### Testing Requirements

- **Unit/component tests:** `apps/web/src/components/TodoList.test.tsx` (extended — primary presentational coverage per AC #1/#2/#7), `apps/web/src/components/TodoApp.test.tsx` (extended — end-to-end AC #3/#4/#5/#7 coverage). Mandatory per AC #7.
- **Integration tests:** none — no API changes in this story (`GET /todos` already exists from Epic 1).
- **E2E tests:** none — any Playwright coverage is Story 3.6's call, not this story's.
- **Test runner:** Vitest + jsdom + RTL + `@testing-library/user-event`, already configured and already imported in `TodoApp.test.tsx`. `TodoList.test.tsx` does not yet import `user-event` — this story adds that import.
- **Coverage gate:** none in v1.

### Library / version pins

No new dependencies. No version changes. Pure application logic (`TodoList.tsx`, `TodoApp.tsx`) plus their co-located tests.

### Previous story intelligence (3.3)

- 3.3 established (and this story follows) the convention of splitting BDD-style epics ACs that name one test file across two files when the named file is a pure presentational component that cannot authentically exercise a stateful/async behavior on its own — see "Test coverage split rationale" above for how that precedent applies here.
- 3.3's Dev Notes pattern of calling out "why NOT to do X" guardrails (rather than only describing what to do) proved effective at preventing scope creep and was carried into this story's Task 2 bullets (no `AbortSignal`, no shared helper) and "Critical architectural guardrails" section.
- 3.3 did not touch `reducer.ts` at all despite touching two components; this story follows the same shape — `loadStart`/`loadSuccess`/`loadError` are Epic-1-vintage actions already fully wired for the `'error'` state's fields (`error`, `requestId`), so no reducer work is needed here either.

### Git intelligence (recent commits)

Most recent commit (`6f1eb4a`, Story 3.3) touched `TodoApp.tsx` and its test file most recently, establishing the exact current shape of `handleAdd`/`handleToggle`/`handleDelete` (each: dispatch optimistic → `.then(success, failure)` → failure branch dispatches a `{intent}Failed` action + maps `ApiError` → message + dispatches `errorShown`). `handleRetry` (Task 2) deliberately does **not** follow this exact shape — it has no optimistic-update phase (there is nothing to optimistically update before the list has ever loaded) and does not dispatch `errorShown` (per AC #5) — it is closer in shape to the mount `useEffect`'s existing `getTodos().then(loadSuccess, mapToLoadError)` block than to the three mutation handlers. Do not copy the mutation-handler pattern wholesale.

### References

- [epics.md:1146-1185](../planning-artifacts/epics.md#L1146-L1185) — Story 3.4 full AC text (source of truth for this story).
- [prd.md:306,341,350](../planning-artifacts/prd.md) — FR20 ("User can retry a failed mutation without refreshing the page or losing list state"), NFR8 (transient-failure recovery without refresh), NFR14 (44×44 tap targets).
- [architecture.md:404-419](../planning-artifacts/architecture.md#L404-419) — client error-handling pattern, loading-state pattern, retry pattern ("no automatic retries... the user retries by repeating the action").
- [architecture.md:836,838](../planning-artifacts/architecture.md) — NFR8/NFR10-14 compliance notes (reducer rollback + user retry; Radix primitives + focus-visible + 44×44 tap targets "enforceable in Tailwind utilities").
- [3-3-preserve-todoinput-text-on-add-failure-fr19.md](./3-3-preserve-todoinput-text-on-add-failure-fr19.md) — immediately-preceding story; establishes the test-file-split precedent and the "why not" guardrail-documentation style this story follows.
- `apps/web/src/components/TodoList.tsx`, `TodoApp.tsx`, `TodoList.test.tsx`, `TodoApp.test.tsx`, `apps/web/src/lib/reducer.ts`, `apps/web/src/app/globals.css` — current implementation read directly for this story.
- `apps/web/AGENTS.md` — Next.js 16 / Tailwind v4 project-specific caveats (not directly relevant to this story's logic-only changes, but still governs the codebase).

## Review Findings

_Code review 2026-07-05 — 3 adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Acceptance Auditor: 7/7 ACs PASS, all guardrails + out-of-scope prohibitions upheld, no scope creep._

- [x] [Review][Defer] `handleRetry` failure can silently clobber a concurrent successful `onVisibility` refetch back to the error state — **Deferred (2026-07-05): Narrow, self-healing race; accepted per spec's minimal-surface guardrail (no AbortSignal), with a note that the spec's "no equivalent race" rationale is incomplete.** The mount effect's `onVisibility` listener ([TodoApp.tsx:46-57](../../apps/web/src/components/TodoApp.tsx#L46-L57)) has **no `status` guard**: it fires `getTodos(controller.signal)` on every visibility regain regardless of current state, including while `status` is `'error'`/`'loading'`, and dispatches `loadSuccess`. `handleRetry` ([TodoApp.tsx:67-82](../../apps/web/src/components/TodoApp.tsx#L67-L82)) shares no cancellation with it. Ordering that reproduces: user clicks Retry (retry `getTodos()` in flight, unsignalled) → tab regains visibility → visibility refetch resolves **success first** (`loadSuccess`, real list shown) → retry request then **rejects** → `loadError` wipes `todos` back to `[]` and forces `status:'error'`, discarding the freshly loaded list. This directly contradicts the spec's Task 2 / guardrail justification for omitting an `AbortSignal` ("A retry click only ever happens later, from a stable `'error'` state, so there is no equivalent race to guard against") — the `onVisibility` path *is* such an equivalent race, which the spec's reasoning overlooked. Narrow window, transient impact (no data loss; user re-retries), but the spec's stated rationale is factually incomplete. Decision: (a) accept per spec as an acceptable narrow race, or (b) add a guard despite the spec's "no AbortSignal" guardrail.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

### Completion Notes List

- Replaced `TodoList`'s Epic-1 error placeholder with a real recovery UI: heading (`{"Couldn't load todos"}`), optional `state.error` subtext (`todo-list-error-detail`), and a `<button type="button">Retry</button>` (h-11 tap target, `focus-visible` ring on top of the project's global outline). `EPIC 1 PLACEHOLDER` comment removed (AC #1, #2, #6 — confirmed via `grep` returning no matches).
- Added `onRetry: () => void` to `TodoListProps`; `TodoList` remains purely presentational (no `dispatch`/`getTodos` calls inside it).
- Added `handleRetry` to `TodoApp`: dispatches `loadStart`, calls `getTodos()` with no `AbortSignal`, maps `ApiError` → message on failure via `loadError` — mirrors the mount effect's mapping, intentionally not deduplicated with it or with the mutation handlers' shape (per Dev Notes guardrails). Zero reducer changes; zero new deps.
- `TodoList.test.tsx`: added `onRetry={vi.fn()}` to all pre-existing `render()` calls; rewrote the error-branch test for the new heading/button; added tests for click-to-retry, keyboard (Enter) activation, and the omitted-subtext-when-`error`-is-`undefined` branch.
- `TodoApp.test.tsx`: added a new `<TodoApp /> initial-load retry journey` describe block — one test for click Retry → loading → success, one for click Retry → fails again → error UI reappears with `toast-root` absent (AC #5, no Toast on initial-load retry failure).
- Verification: `npm run lint` (0 warnings), `npm run typecheck` (all 3 workspaces clean), `npm run test` (all workspaces green; web tests 137 → 142, +5 new).

### File List

- `apps/web/src/components/TodoList.tsx` (modified)
- `apps/web/src/components/TodoApp.tsx` (modified)
- `apps/web/src/components/TodoList.test.tsx` (modified)
- `apps/web/src/components/TodoApp.test.tsx` (modified)

## Change Log

| Date       | Change                                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-05 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Replaces `TodoList`'s Epic-1 error placeholder with a heading + subtext + Retry button; new `handleRetry` callback in `TodoApp` (no `AbortSignal`, no shared helper with the mount effect). Zero reducer changes (`loadStart`/`loadSuccess`/`loadError` already exist), zero new dependencies. Test coverage split across `TodoList.test.tsx` (presentational) and `TodoApp.test.tsx` (state-transition integration), following Story 3.3's precedent. |
| 2026-07-05 | Story implemented via `/bmad-dev-story`. Status: ready-for-dev → review. `TodoList.tsx` error branch replaced with heading + subtext + Retry button, new `onRetry` prop; `TodoApp.tsx` gained `handleRetry`; `TodoList.test.tsx` + `TodoApp.test.tsx` extended per Tasks 3–4. Zero reducer changes, zero new deps, no spec deviations. Lint/typecheck clean; web tests 137 → 142. |
