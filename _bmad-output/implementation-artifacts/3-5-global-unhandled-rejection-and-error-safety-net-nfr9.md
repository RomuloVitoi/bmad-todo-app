# Story 3.5: Global unhandled-rejection and error safety net (NFR9)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want a top-level handler that catches unhandled promise rejections and uncaught runtime errors and surfaces them as a generic Toast,
so that NFR9 is satisfied — no silent failures, no stuck UI states, even for paths we didn't explicitly guard.

## Acceptance Criteria

1. **Given** `<TodoApp>`, **when** it mounts, **then** a `useEffect` registers `window.addEventListener('unhandledrejection', handler)` AND `window.addEventListener('error', handler)`, **and** the same `useEffect` returns a cleanup that removes both listeners on unmount.

2. **Given** an unhandled promise rejection fires, **when** the handler runs, **then** it dispatches `errorShown({ message: "Something went wrong. Please try again." })` via the reducer, **and** it logs the rejection reason to `console.error` with a tag for devtools diagnostics, **and** calls `event.preventDefault()` so the default browser warning is suppressed.

3. **Given** a synchronous uncaught exception fires (`window.error`), **when** the handler runs, **then** the same Toast + log behavior occurs.

4. **Given** a mutation failure that IS caught by a try/catch in a handler (e.g., `api.createTodo` rejecting, handled per Story 3.2), **when** it is processed, **then** it does NOT reach the unhandled-rejection handler (because it was caught and dispatched through the normal failure path).

5. **Given** React StrictMode double-mounts components in development, **when** `<TodoApp>` mounts twice, **then** the event listeners are still registered and removed correctly (no duplicate handlers, no duplicate Toasts for a single event).

6. **Given** `TodoApp.test.tsx`, **when** tests run, **then** coverage includes: firing `window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {...}))` → asserts Toast with generic message; firing an `error` event → same Toast; component unmount removes the listeners; caught mutation failures (from Story 3.2) do NOT trigger this path.

_(ACs verbatim from [epics.md:1187-1220](../planning-artifacts/epics.md#L1187-L1220).)_

## Tasks / Subtasks

- [x] **Task 1: Add the global safety-net `useEffect` to `TodoApp` (AC: #1, #2, #3, #5)**
  - [ ] Edit [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx). Add a **new, third `useEffect`** — a sibling of the existing mount-load effect (lines 23-65) and placed immediately after it, before `handleRetry`. Do NOT merge this into the existing mount effect; it is a separate concern (global window-level safety net vs. initial-data-load orchestration) and mixing them would make both harder to reason about and test in isolation.

    ```tsx
    useEffect(() => {
      const handleRejection = (event: PromiseRejectionEvent): void => {
        console.error('[safety-net] unhandled rejection', event.reason);
        event.preventDefault();
        dispatch({
          type: 'errorShown',
          payload: {
            message: 'Something went wrong. Please try again.',
            id: crypto.randomUUID(),
          },
        });
      };

      const handleError = (event: ErrorEvent): void => {
        console.error('[safety-net] uncaught error', event.error ?? event.message);
        event.preventDefault();
        dispatch({
          type: 'errorShown',
          payload: {
            message: 'Something went wrong. Please try again.',
            id: crypto.randomUUID(),
          },
        });
      };

      window.addEventListener('unhandledrejection', handleRejection);
      window.addEventListener('error', handleError);
      return () => {
        window.removeEventListener('unhandledrejection', handleRejection);
        window.removeEventListener('error', handleError);
      };
    }, []);
    ```

  - [ ] `id: crypto.randomUUID()` on the `errorShown` payload is **required, not optional** — the reducer never generates entropy itself (see [reducer.ts:10-14](../../apps/web/src/lib/reducer.ts#L10-14), "no-entropy-in-reducer rule"). Every existing `errorShown` dispatch site (`handleAdd`, `handleToggle`, `handleDelete`) supplies its own `crypto.randomUUID()`; follow the same shape here.
  - [ ] The exact message string is `'Something went wrong. Please try again.'` — copy it verbatim (it also happens to match `errors.ts`'s `messageForStatus` default branch, by design; do not import or reuse that function here, this handler has no `ApiError`/status code to map, just hardcode the literal string per the AC's exact wording).
  - [ ] `event.preventDefault()` on the `error` handler is a judgment call beyond the AC's literal wording (AC #2 states it explicitly only for the rejection case; AC #3 says "the same Toast + log behavior occurs" for the error case). Calling it on both is the consistent, harmless choice — keep it on both unless a reviewer flags otherwise.
  - [ ] Both handler functions must be declared **inside** the effect body (not hoisted to component scope) so that the exact same function reference is passed to both `addEventListener` and the cleanup's `removeEventListener` — this is what makes the effect safe under React StrictMode's mount→cleanup→mount double-invoke (AC #5): the browser natively deduplicates by reference, and cleanup always removes exactly what the same invocation added.

- [x] **Task 2: Confirm AC #4 holds without new code (no reducer/handler change needed)**
  - [x] This is a verification task, not an implementation task. A promise rejection that is already handled via `.then(onSuccess, onFailure)` (the pattern used by every mutation handler in this file — `handleAdd`, `handleToggle`, `handleDelete`, `handleRetry`, and the mount effect's `getTodos().then(...)`) is, by JavaScript's own semantics, never "unhandled" — the second `.then` argument (or a `.catch`) is itself the handler. No code change is needed to satisfy AC #4; it already holds structurally. Do not add any guard, flag, or try/catch anywhere to "prevent" this — there is nothing to prevent.
  - [x] Task 3 below adds a regression test that proves this stays true (a mutation failure must show exactly the mutation's own mapped message, not the generic safety-net message, and must not double-log via the safety net's `console.error` tag).

- [x] **Task 3: `TodoApp.test.tsx` — safety-net coverage (AC: #6)**
  - [x] Edit [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx). Add a new `describe('<TodoApp /> global safety net', () => { ... })` block after the existing `initial-load retry journey` block (line 619 onward), following this file's established `vi.stubGlobal('fetch', fetchMock)` + dynamic `await import('./TodoApp')` convention (required because `beforeEach` calls `vi.resetModules()` — see lines 5-8).
  - [x] Test: an unhandled promise rejection surfaces the generic Toast. jsdom 29 (already pinned, see `apps/web/package.json`) implements a real `PromiseRejectionEvent` constructor — verified directly against this repo's jsdom version; no polyfill needed. The `promise` field must be a genuine `Promise` that is itself already handled (via `.catch(() => {})`) so firing this synthetic event doesn't also trigger a *real* Node-level unhandled-rejection warning in the test runner:

    ```tsx
    it('unhandled promise rejection surfaces the generic Toast and logs via console.error', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ todos: [] }));
      vi.stubGlobal('fetch', fetchMock);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { default: TodoApp } = await import('./TodoApp');
      render(<TodoApp />);
      await screen.findByTestId('todo-list-empty');

      const reason = new Error('boom');
      const rejected = Promise.reject(reason);
      rejected.catch(() => {}); // pre-handle so the real Node runtime never sees this as unhandled
      const event = new PromiseRejectionEvent('unhandledrejection', {
        promise: rejected,
        reason,
      });
      window.dispatchEvent(event);

      const toast = await screen.findByTestId('toast-root');
      expect(toast).toHaveTextContent('Something went wrong. Please try again.');
      expect(errorSpy).toHaveBeenCalledWith('[safety-net] unhandled rejection', reason);
    });
    ```

  - [x] Test: a synchronous uncaught `error` event produces the same Toast:

    ```tsx
    it('uncaught error event surfaces the same generic Toast', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ todos: [] }));
      vi.stubGlobal('fetch', fetchMock);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { default: TodoApp } = await import('./TodoApp');
      render(<TodoApp />);
      await screen.findByTestId('todo-list-empty');

      const error = new Error('kaboom');
      const event = new ErrorEvent('error', { error, message: error.message });
      window.dispatchEvent(event);

      const toast = await screen.findByTestId('toast-root');
      expect(toast).toHaveTextContent('Something went wrong. Please try again.');
      expect(errorSpy).toHaveBeenCalledWith('[safety-net] uncaught error', error);
    });
    ```

  - [x] Test: unmount removes both listeners. Spy on `window.addEventListener`/`window.removeEventListener` *before* rendering, capture the exact handler function references passed for `'unhandledrejection'`/`'error'`, unmount, and assert `removeEventListener` was called with those same references:

    ```tsx
    it('unmount removes both the unhandledrejection and error listeners', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ todos: [] }));
      vi.stubGlobal('fetch', fetchMock);
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { default: TodoApp } = await import('./TodoApp');
      const { unmount } = render(<TodoApp />);
      await screen.findByTestId('todo-list-empty');

      const rejectionHandler = addSpy.mock.calls.find(([type]) => type === 'unhandledrejection')?.[1];
      const errorHandler = addSpy.mock.calls.find(([type]) => type === 'error')?.[1];
      expect(rejectionHandler).toBeDefined();
      expect(errorHandler).toBeDefined();

      unmount();

      expect(removeSpy).toHaveBeenCalledWith('unhandledrejection', rejectionHandler);
      expect(removeSpy).toHaveBeenCalledWith('error', errorHandler);
    });
    ```

  - [x] Test: a caught mutation failure does NOT go through the safety net (AC #4 regression guard). Reuse the existing add-failure setup pattern from the `mutation-failure toasts` describe block (network/500 rejection on `createTodo`), spy on `console.error`, and assert the safety net's tagged log line was never produced while the mutation's own Toast message (not the generic safety-net message) is what's shown:

    ```tsx
    it('a caught mutation failure does not trigger the safety net', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ todos: [] }))
        .mockResolvedValueOnce(
          jsonResponse({ statusCode: 500, error: 'Internal Server Error', message: 'oops' }, { status: 500 }),
        );
      vi.stubGlobal('fetch', fetchMock);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { default: TodoApp } = await import('./TodoApp');
      render(<TodoApp />);
      await screen.findByTestId('todo-list-empty');

      const user = userEvent.setup();
      await user.type(screen.getByRole('textbox'), 'buy milk{Enter}');

      const toast = await screen.findByTestId('toast-root');
      expect(toast).toHaveTextContent('Something went wrong. Please try again.');
      expect(errorSpy).not.toHaveBeenCalledWith('[safety-net] unhandled rejection', expect.anything());
      expect(errorSpy).not.toHaveBeenCalledWith('[safety-net] uncaught error', expect.anything());
    });
    ```

    Note: this particular mutation failure happens to produce the *same* Toast text as the safety net's generic message (both resolve to `messageForStatus`'s 500 default / the hardcoded safety-net string), so the Toast-text assertion alone is not proof of non-interference — the `console.error` tag assertions are the load-bearing part of this test. Confirm the exact textbox query matches `TodoInput`'s current markup (`getByRole('textbox')` — verify there is exactly one textbox on screen at this point; check `TodoInput.tsx` before finalizing if unsure).
  - [x] StrictMode double-mount (AC #5) — wrap the render in `React.StrictMode` for one dedicated test, confirming no duplicate Toasts appear for a single dispatched event after React's dev-mode double-invoke settles:

    ```tsx
    it('StrictMode double-mount registers listeners exactly once effectively (no duplicate Toasts)', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ todos: [] }));
      vi.stubGlobal('fetch', fetchMock);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const { default: TodoApp } = await import('./TodoApp');
      render(
        <StrictMode>
          <TodoApp />
        </StrictMode>,
      );
      await screen.findByTestId('todo-list-empty');

      const reason = new Error('boom');
      const rejected = Promise.reject(reason);
      rejected.catch(() => {});
      window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: rejected, reason }));

      const toasts = await screen.findAllByTestId('toast-root');
      expect(toasts).toHaveLength(1);
    });
    ```

    Add `import { StrictMode } from 'react';` to this file's imports for this test only. Do not wrap every other test in `StrictMode` — this is the one test whose purpose is exercising that specific behavior; changing the ambient render mode for the whole file risks unrelated regressions in existing tests that were written and passed under non-Strict rendering.

- [x] **Task 4: Verify**
  - [x] `npm run lint`, `npm run typecheck`, `npm run test` (all workspaces) — all green, 0 warnings.
  - [x] Confirm `reducer.ts` is untouched — this story dispatches the existing `errorShown` action (from Story 3.1) and adds zero new reducer actions, zero new `TodoState` fields.
  - [x] Confirm no React `class` component, `componentDidCatch`, or `getDerivedStateFromError` was added anywhere — see "Critical architectural guardrails" below for why a React error-boundary component is explicitly out of scope despite architecture.md's NFR9 checklist entry loosely saying "global error boundary."

## Review Findings

_Code review 2026-07-05 — 3 adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Acceptance Auditor: 6/6 ACs PASS + all guardrails/out-of-scope prohibitions upheld, no scope creep. Triage: 3 decision-needed, 0 patch, 2 defer, 2 dismissed. Decisions resolved: 1 patch applied, 1 deferred, 1 kept-as-is._

**Resolved decisions:**

- [x] [Review][Patch] Global `error` listener surfaced a spurious generic toast for benign / third-party / cross-origin errors [apps/web/src/components/TodoApp.tsx] — **FIXED.** The `window` `error` event fires for errors the app didn't cause: `ResizeObserver loop completed with undelivered notifications`, browser-extension throws, and opaque cross-origin `"Script error."` (where `event.error` is `null`). `handleError` now guards: it returns early (no toast, no `preventDefault`) for opaque cross-origin errors (`event.error == null && !event.filename`) and benign `ResizeObserver loop` messages, while genuine app errors still surface the toast. Regression test added ("ignores benign browser noise … but still surfaces genuine errors"). Accepted as a deliberate, minimal deviation from the "always dispatch, don't inspect the event" guardrail. web tests 147 → 148. (source: blind+edge)
- [x] [Review][Defer] `crypto.randomUUID()` inside the global handlers can throw → self-feeding error loop [apps/web/src/components/TodoApp.tsx] — **DEFERRED.** `crypto.randomUUID()` only exists in a secure context (HTTPS/`localhost`). On a plain-HTTP origin it is `undefined`; the handler throws a `TypeError` after `event.preventDefault()`, and because a throw inside an `error`/`unhandledrejection` listener is itself reported as a new global `error` event, `handleError` re-fires and re-throws — an infinite loop that hangs the tab. _Defer reason: app-wide secure-context dependency (all `errorShown` dispatch sites already use `crypto.randomUUID()`); unreachable on any supported HTTPS/localhost deployment. Revisit only if a non-secure-context deployment is ever targeted._ (source: blind+edge)
- [x] [Review][Decision→Kept] `event.preventDefault()` on the `error` handler suppresses the browser's default error reporting [apps/web/src/components/TodoApp.tsx] — **KEPT ON BOTH (no change).** Calling `preventDefault()` on the global `error` event cancels the browser's own uncaught-error reporting, leaving only the manual `console.error`. The spec left this open ("keep it unless a reviewer flags otherwise"); flagged and reviewed, decision is to keep it on both handlers as the spec's consistent default. (source: blind+edge)

**Deferred (hardening / known limitations):**

- [x] [Review][Defer] Repeated errors flood `dispatch` and reset the toast auto-dismiss timer [apps/web/src/components/TodoApp.tsx] — deferred, hardening. Each event dispatches `errorShown` with a fresh `crypto.randomUUID()`; `Toast.tsx` keys on `toast.id`, so a runaway error source (repeating `setInterval`/rAF throw) re-mounts the toast every event, restarting its 5s auto-dismiss indefinitely and re-rendering `TodoApp` per event. No throttle/dedupe on inbound events. (source: edge)
- [x] [Review][Defer] React render/effect errors are not caught by the safety net [apps/web/src/components/TodoApp.tsx] — deferred, known scope boundary. On an uncaught render error with no error boundary present, React unmounts the tree (running this effect's cleanup, removing both listeners) before rethrowing to `window`, so no toast appears. NFR9's "no silent failures" is therefore not met for render-phase errors. A React error boundary is explicitly out of scope per this story's guardrails (epics.md window-listener-only ACs vs architecture.md's looser "global error boundary" phrase) — logged as a known limitation for a future architectural decision. (source: edge)

_Dismissed (2): duplicate toasts from multiple `<TodoApp>` instances (it is the single app root — not a real scenario); safety-net toast clobbering/clobbered-by a specific mutation toast (the single-toast "newest wins" model is explicitly spec-ratified in "Critical architectural guardrails")._

## Dev Notes

### Where this story sits

Epic 3 ("Failure Resilience & Recovery") intro, verbatim: "When something goes wrong (offline, server 5xx, timeout), the user sees a clear non-technical error, their typed input is preserved, and they can retry without losing list state or refreshing. The system surfaces every failure — nothing drops silently — and operators can diagnose failures from correlated server logs." [epics.md:1016-1018](../planning-artifacts/epics.md#L1016-L1018)

| Story | Scope | Depends on 3.5? |
|---|---|---|
| 3.1 (done) | Toast UI primitive + `toast` reducer slice + `errorShown`/`errorDismiss` | **Yes** — 3.5 dispatches the existing `errorShown` action verbatim; no reducer changes needed |
| 3.2 (done) | `ApiError` → human-readable message mapping; wires mutation rejection handlers to `errorShown` | No — 3.5's failure paths are un-mapped raw exceptions/rejections, not `ApiError` instances; the safety net always uses one hardcoded generic message, never `ApiError.message` |
| 3.3 (done) | `TodoInput` captures + restores typed text on add failure (FR19) | No — different surface entirely |
| 3.4 (done) | Initial-load error/retry UI (FR20) | No — different surface (inline `state.error`, not Toast); untouched by this story |
| **3.5 (this story)** | Global `window.addEventListener('unhandledrejection' \| 'error', ...)` safety net (NFR9) | — |
| 3.6 | Journey-level resilience tests (Journeys 1–3) | No — 3.6's Journey 3 sub-cases (A–E, per [epics.md:1250-1283](../planning-artifacts/epics.md#L1250-L1283)) all cover *caught* mutation/load failures, not the safety net; do not assume 3.6 exercises this story's code path |

### Critical architectural guardrails

- **This story does NOT add a React error boundary (no `class` component, no `componentDidCatch`, no `getDerivedStateFromError`).** [architecture.md:837](../planning-artifacts/architecture.md#L837) lists NFR9 compliance as "top-level `unhandledrejection` handler + global error boundary" — that phrase is a loose summary in the NFR checklist, not a separate requirement. The authoritative source of truth for this story is epics.md's Story 3.5 ACs ([epics.md:1187-1220](../planning-artifacts/epics.md#L1187-L1220)), which specify **only** `window.addEventListener('unhandledrejection' | 'error', ...)` — nothing about catching React render-phase errors via a boundary component. Cross-checked against [architecture.md:404-409](../planning-artifacts/architecture.md#L404-409) (the detailed client error-handling pattern section), which also only mentions the `unhandledrejection` listener, and against the full project file tree ([architecture.md:540-columns](../planning-artifacts/architecture.md#L540)), which lists no `ErrorBoundary.tsx` or similar file anywhere. Building a React error boundary here would be unrequested scope creep beyond this story's ACs — if broader React-render-error coverage is ever wanted, that is a future/architectural decision, not something to add unprompted in this story.
- **This is a new, separate `useEffect` — do not merge it into the existing mount-load effect.** [TodoApp.tsx:23-65](../../apps/web/src/components/TodoApp.tsx#L23-L65) already contains an `AbortController` + `cancelled` flag + `visibilitychange` listener, all scoped to the initial-load concern. The safety net is an orthogonal, always-on, global concern (registered once for the component's entire lifetime, independent of any fetch). Keeping it in its own effect keeps both effects independently readable and testable, consistent with this codebase's pattern of one `useCallback`/effect per concern.
- **The safety net always dispatches the same hardcoded message** — `'Something went wrong. Please try again.'` — regardless of what the actual rejection reason or error was. It does NOT attempt to inspect `event.reason`/`event.error` for an `ApiError` instance or otherwise try to produce a more specific message. This is intentional: by definition, anything reaching this handler is a path nobody explicitly guarded, so there is no reliable structure to extract a better message from. Do not add `instanceof ApiError` branching here — that pattern belongs to the mutation handlers (Story 3.2), not this safety net.
- **No new dependency, no reducer change.** `errorShown`/`errorDismiss` already exist from Story 3.1 ([reducer.ts:145-153](../../apps/web/src/lib/reducer.ts#L145-153)); this story is pure application logic in `TodoApp.tsx` plus its co-located test file.
- **`crypto.randomUUID()` must be generated at the dispatch site**, not left out. The reducer has an explicit "no-entropy-in-reducer rule" ([reducer.ts:10-14](../../apps/web/src/lib/reducer.ts#L10-14)) — every one of the three existing `errorShown` call sites in `TodoApp.tsx` (`handleAdd`, `handleToggle`, `handleDelete`) supplies its own UUID; the safety net's two new call sites must do the same.
- **Single-toast model still applies.** Per the reducer's existing behavior (from Story 3.2), `state.toast` only ever holds the most recent `errorShown` payload. If a mutation failure Toast is showing and the safety net fires (or vice versa), the newer one wins and replaces it — this is existing, unmodified reducer behavior; nothing new to build for it.

### Out-of-scope (do NOT do in this story)

- Any change to `reducer.ts`/`reducer.test.ts` — `errorShown`/`errorDismiss` already exist and are untouched; this story only adds new *dispatch call sites* in `TodoApp.tsx`.
- A React error boundary component (class-based, `componentDidCatch`, or a library like `react-error-boundary`) — see "Critical architectural guardrails" above. Not named in this story's ACs.
- Any change to `Toast.tsx`, `errors.ts`, or the mutation-failure paths in `handleAdd`/`handleToggle`/`handleDelete`/`handleRetry` — this story only adds a new, additive `useEffect`.
- Attempting to map `event.reason`/`event.error` to a more specific message, or reusing `messageForStatus`/`ApiError` — the safety net's message is always the one hardcoded generic string.
- Journey-level / E2E Playwright tests exercising this safety net end-to-end — Story 3.6's call, if it chooses to; this story's tests are Vitest + RTL only.
- Server-side (`apps/api`) changes of any kind — NFR9 here is scoped entirely to the client; the server's global `setErrorHandler` (already shipped, Epic 1/2) is a separate, already-satisfied mechanism.

### Project Structure Notes

```text
apps/web/
└── src/
    └── components/
        ├── TodoApp.tsx           # ← extended: new third useEffect registers/cleans up window-level safety-net listeners
        └── TodoApp.test.tsx      # ← extended: new "global safety net" describe block
```

No new files; no new component; no new dependency. `TodoList.tsx`, `TodoList.test.tsx`, `TodoInput.tsx`, `TodoInput.test.tsx`, `Toast.tsx`, `reducer.ts` are all unchanged by this story.

### Testing Requirements

- **Unit/component tests:** `apps/web/src/components/TodoApp.test.tsx` (extended — new `describe('<TodoApp /> global safety net', ...)` block). Mandatory per AC #6.
- **Integration tests:** none — no API or server changes in this story.
- **E2E tests:** none — Story 3.6's call, not this story's.
- **Test runner:** Vitest + jsdom 29 + RTL + `@testing-library/user-event`, already configured. jsdom 29's `PromiseRejectionEvent` constructor was verified directly (`typeof window.PromiseRejectionEvent === 'function'`) — no polyfill or workaround needed, unlike the pre-existing `hasPointerCapture` stub in `vitest.setup.ts` (that stub is unrelated to this story; do not touch it).
- **Coverage gate:** none in v1.

### Library / version pins

No new dependencies. No version changes. Pure application logic (`TodoApp.tsx`) plus its co-located test file.

### Previous story intelligence (3.4)

- 3.4 established the convention (continued from 3.3) of documenting explicit "why NOT to do X" guardrails in Dev Notes rather than only describing what to build — carried into this story's "Critical architectural guardrails" and "Out-of-scope" sections, especially around the architecture.md "global error boundary" phrasing that could otherwise mislead a dev into over-building.
- 3.4 did not touch `reducer.ts` despite touching two components; this story follows the same shape — it dispatches an existing action (`errorShown`), adds zero new reducer surface.
- 3.4's `handleRetry` review turned up a deferred finding about a race between the mount effect's `onVisibility` refetch and a user-initiated action both writing to `state.status`/`state.todos` concurrently (see [3-4-initial-load-error-recovery-with-retry-button-fr20.md](./3-4-initial-load-error-recovery-with-retry-button-fr20.md), "Review Findings"). This story's safety net does **not** touch `state.status`/`state.todos` at all — it only ever writes to `state.toast` via `errorShown` — so it cannot participate in or worsen that class of race. No action needed here, but worth knowing why this story is structurally immune to that category of bug.

### Git intelligence (recent commits)

Most recent commit (`81435ce`, Story 3.4) touched `TodoApp.tsx` and `TodoApp.test.tsx` most recently, adding `handleRetry` as the third `useCallback` in the file (after `handleAdd`/`handleToggle`/`handleDelete`) and a new describe block at the bottom of the test file. This story follows the identical pattern for placement: new logic goes in a new, additively-appended block (a `useEffect` in the component, a new `describe` at the end of the test file) rather than interleaving into existing blocks — consistent with every prior Epic 3 story's diff shape.

### References

- [epics.md:1187-1220](../planning-artifacts/epics.md#L1187-L1220) — Story 3.5 full AC text (source of truth for this story).
- [prd.md:342](../planning-artifacts/prd.md) — NFR9 ("No unhandled promise rejections, uncaught exceptions, or stuck UI states under the induced failure modes documented in Journey 3").
- [architecture.md:404-409](../planning-artifacts/architecture.md#L404-409) — client error-handling pattern, explicitly naming the `unhandledrejection` safety net.
- [architecture.md:837](../planning-artifacts/architecture.md#L837) — NFR9 compliance checklist entry (the "global error boundary" phrase addressed under "Critical architectural guardrails" above — not a separate requirement).
- [reducer.ts:10-14,145-153](../../apps/web/src/lib/reducer.ts) — `errorShown`/`errorDismiss` actions and the "no-entropy-in-reducer" rule this story's dispatch sites must follow.
- [3-4-initial-load-error-recovery-with-retry-button-fr20.md](./3-4-initial-load-error-recovery-with-retry-button-fr20.md) — immediately-preceding story; establishes the "why not" guardrail-documentation style and the additive-block diff shape this story follows.
- `apps/web/src/components/TodoApp.tsx`, `TodoApp.test.tsx`, `Toast.tsx`, `apps/web/src/lib/reducer.ts`, `apps/web/src/lib/errors.ts` — current implementation read directly for this story.
- `apps/web/AGENTS.md` — Next.js 16 / Tailwind v4 project-specific caveats (not directly relevant to this story's logic-only changes, but still governs the codebase).

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

### Completion Notes List

- Added a new, third `useEffect` in `TodoApp` (sibling of the mount-load effect, before `handleRetry`) registering `window` `unhandledrejection`/`error` listeners per the story's exact spec; both handlers dispatch the existing `errorShown` action with the hardcoded generic message and their own `crypto.randomUUID()`, and the effect's cleanup removes both listeners.
- AC #4 required no code change — verified structurally (a rejection handled via `.then(onSuccess, onFailure)` is never "unhandled" by JS semantics) and pinned with a regression test.
- Added 5 new tests in a new `describe('<TodoApp /> global safety net', ...)` block: unhandled-rejection Toast + log, uncaught-error Toast + log, unmount removes both listeners, a caught mutation failure does not trigger the safety net, and StrictMode double-mount produces exactly one Toast for one dispatched event.
- One deviation from the story's literal test snippet: the StrictMode test's `fetchMock` uses `mockImplementation(() => Promise.resolve(jsonResponse(...)))` instead of `mockResolvedValueOnce(...)`. Reason: StrictMode double-invokes the pre-existing (out-of-scope) mount-load effect, firing a second, superseded `getTodos()` call; with only one queued mock value the second call starved and the initial load failed before the test's own assertions ran. A fresh `Response` per call fixes this without touching any other test or the mount effect itself.
- `npm run lint`, `npm run typecheck`, `npm run test` all pass at the repo root: 0 lint warnings, typecheck green across shared/api/web, web tests 142 → 147 (all 8 web test files pass, 147/147).
- `reducer.ts` untouched; no React error boundary / `class` component / `componentDidCatch` / `getDerivedStateFromError` added anywhere, per the story's explicit out-of-scope guardrails.

### File List

- `apps/web/src/components/TodoApp.tsx` (modified)
- `apps/web/src/components/TodoApp.test.tsx` (modified)

## Change Log

| Date       | Change                                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-05 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Adds a new, separate `useEffect` in `TodoApp` registering `window` `unhandledrejection`/`error` listeners that dispatch the existing `errorShown` action with a hardcoded generic message; explicitly out of scope: any React error-boundary component (clarifies architecture.md's loose "global error boundary" checklist phrase against epics.md's authoritative window-listener-only ACs). Zero reducer changes, zero new dependencies. |
| 2026-07-05 | Dev-Story: implemented the safety-net `useEffect` in `TodoApp.tsx` + 5 new tests in `TodoApp.test.tsx` (`<TodoApp /> global safety net`); lint/typecheck clean; web tests 142 → 147; zero reducer/dependency changes; one test-only deviation (StrictMode test's `fetchMock` uses `mockImplementation` instead of `mockResolvedValueOnce` to tolerate the pre-existing mount effect's StrictMode double-invoke). Status: ready-for-dev → in-progress → review. |
