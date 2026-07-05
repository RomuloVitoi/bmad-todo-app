# Story 3.1: Toast infrastructure (Radix Toast + reducer slice)

Status: done

## Story

As the web app,
I want a single Toast surface with a reducer slice and dismiss action,
So that every mutation handler and safety-net handler can surface a user-visible error through one consistent pattern.

## Acceptance Criteria

1. **Given** `apps/web/src/components/Toast.tsx`, **when** the component renders, **then** it wraps Radix UI's `Toast.Provider`, `Toast.Root`, `Toast.Description`, and `Toast.Viewport` primitives, **and** `Toast.Root` is controlled by `state.toast` from the reducer, **and** the root is rendered only when `state.toast !== null`.

2. **Given** the reducer, **when** its state shape is inspected, **then** it contains a new slice `toast: { message: string, id: string } | null` (default `null`), **and** two new actions exist: `errorShown({ message: string })` sets `state.toast = { message, id: <crypto.randomUUID()> }`, **and** `errorDismiss` sets `state.toast = null`, **and** the exhaustiveness check in the reducer's `default` branch still holds.

3. **Given** the Toast is visible, **when** the user clicks its dismiss button (labeled `aria-label="Dismiss"`) or presses Escape, **then** the reducer dispatches `errorDismiss`, **and** the Toast is removed from the DOM.

4. **Given** a Toast has rendered, **when** the Radix-provided `duration` (e.g., 5000ms) elapses, **then** the Radix `onOpenChange(false)` callback dispatches `errorDismiss`, **and** the Toast is removed.

5. **Given** `<Toast.Viewport>` is inserted in the tree, **when** inspected for accessibility, **then** it has `aria-live="polite"` and `role="region"` via Radix defaults, **and** the Toast message is announced to assistive technology without stealing focus.

6. **Given** `<Toast>` is rendered inside `<TodoApp>` (or `app/layout.tsx`), **when** the user reloads the app, **then** no Toast shows on load (state starts `null`).

7. **Given** `Toast.test.tsx` and updated `reducer.test.ts`, **when** Vitest + RTL runs, **then** tests cover: `errorShown` → Toast renders with message; click dismiss → Toast unmounts; auto-dismiss after duration → Toast unmounts; `aria-live` region is present.

_(Verbatim from [epics.md:1020-1062](../planning-artifacts/epics.md#L1020-L1062).)_

## Tasks / Subtasks

- [x] **Task 1: Install `@radix-ui/react-toast` (AC: #1)**
  - [x] From the repo root: `npm install --save --workspace apps/web @radix-ui/react-toast` — pin to `^1.2.18` (latest 1.x stable; verified against the npm registry). **Runtime dependency, not devDependency** — `Toast.tsx` ships it in the production bundle, mirroring exactly how Story 2.6 added `@radix-ui/react-checkbox`.
  - [x] Do NOT install at the repo root without `--workspace apps/web` (it won't resolve from `apps/web/src/`).
  - [x] Do NOT install the unified `radix-ui` meta-package instead — this repo's established convention (Story 2.6) is one package per primitive (`@radix-ui/react-checkbox` already installed that way); stay consistent.
  - [x] Verify with `node -e "console.log(require.resolve('@radix-ui/react-toast'))"` from `apps/web/`.

- [x] **Task 2: Extend the reducer with the `toast` slice + `errorShown`/`errorDismiss` actions (AC: #2)**
  - [x] Edit [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts). Target end-state (full file — every line that changes is called out below):

    ```ts
    import type { Todo } from '@todo-app/shared';

    export type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

    export type TodoEntry = Todo & { pending?: boolean };

    // Caller-supplied id (never generated inside the reducer — see the
    // dev-note below on why this deviates from the AC's literal phrasing).
    // Exists so a consumer can `key={toast.id}` the rendered Toast.Root:
    // a fresh id on a new errorShown while a toast is already open forces
    // React to remount the Root, restarting Radix's `duration` timer and
    // re-triggering its announcer.
    export type ToastEntry = { message: string; id: string };

    export interface TodoState {
      status: LoadStatus;
      todos: TodoEntry[];
      error?: string;
      requestId?: string;
      toast: ToastEntry | null;
    }

    export type TodoAction =
      | { type: 'loadStart' }
      | { type: 'loadSuccess'; payload: Todo[] }
      | { type: 'loadError'; payload: { error: string; requestId?: string } }
      | {
          type: 'addOptimistic';
          payload: { tempId: string; text: string; createdAt: string };
        }
      | { type: 'addReconcile'; payload: { tempId: string; todo: Todo } }
      | { type: 'addFailed'; payload: { tempId: string } }
      | { type: 'toggleOptimistic'; payload: { id: string; completed: boolean } }
      | {
          type: 'toggleFailed';
          payload: { id: string; previousCompleted: boolean };
        }
      | { type: 'deleteOptimistic'; payload: { id: string } }
      | { type: 'deleteFailed'; payload: { todo: Todo; index: number } }
      | { type: 'errorShown'; payload: { message: string; id: string } }
      | { type: 'errorDismiss' };

    export const initialState: TodoState = {
      status: 'idle',
      todos: [],
      toast: null,
    };

    export function reducer(state: TodoState, action: TodoAction): TodoState {
      switch (action.type) {
        case 'loadStart':
          // `toast` is orthogonal to the load lifecycle — it surfaces
          // MUTATION failures and the global safety net, not initial-load
          // failures — so it is explicitly carried forward, never reset.
          return { status: 'loading', todos: [], toast: state.toast };
        case 'loadSuccess':
          return { status: 'success', todos: action.payload, toast: state.toast };
        case 'loadError':
          return {
            status: 'error',
            todos: [],
            error: action.payload.error,
            requestId: action.payload.requestId,
            toast: state.toast,
          };

        // addOptimistic / addReconcile / addFailed / toggleOptimistic /
        // toggleFailed / deleteOptimistic / deleteFailed: UNCHANGED bodies.
        // Every one already returns `{ ...state, todos: ... }`, so `toast`
        // carries forward automatically now that it's part of `TodoState`.
        // Do not touch these seven cases.

        case 'errorShown':
          return {
            ...state,
            toast: { message: action.payload.message, id: action.payload.id },
          };

        case 'errorDismiss':
          if (state.toast === null) return state; // no-op reference equality
          return { ...state, toast: null };

        default: {
          const _exhaustive: never = action;
          void _exhaustive;
          return state;
        }
      }
    }
    ```

  - [x] **Critical — do NOT gate `errorShown`/`errorDismiss` on `state.status !== 'success'`.** Every existing mutation case starts with `if (state.status !== 'success') return state;` because those actions only make sense mid-mutation on a loaded list. A toast (including the future global safety-net toast, Story 3.5) must be showable/dismissable regardless of load status. Do not copy that guard onto the two new cases.
  - [x] **Critical — `loadStart`/`loadSuccess`/`loadError` must explicitly carry `toast: state.toast` forward.** These three cases construct fresh object literals (they don't spread `...state`, unlike the seven mutation cases) because they intentionally reset `error`/`requestId`. If you add the `toast` field to `TodoState` without also adding `toast: state.toast` to these three literals, TypeScript will error on a required field (or, if you make the field optional to dodge the error, an in-flight toast will silently vanish on every tab-visibility refetch — a real, easy-to-miss regression).
  - [x] Update `apps/web/src/lib/reducer.test.ts`: add `toast: null` to `initialState`'s expected object; add a `describe('errorShown/errorDismiss', ...)` block covering: `errorShown` sets `state.toast` to the given `{ message, id }`; a second `errorShown` replaces (not appends to) `state.toast` (single-toast model, foreshadows Story 3.2 AC #3); `errorDismiss` sets `state.toast` to `null`; `errorDismiss` on an already-`null` toast returns the *same* state reference (`toBe`, mirroring the file's existing no-op convention — see `addFailed`'s `if (next.length === state.todos.length) return state;` pattern at [reducer.ts:82-84](../../apps/web/src/lib/reducer.ts#L82-L84)). Add one regression test: `loadStart` dispatched against a state with a non-null `toast` preserves that `toast` unchanged in the result.

- [x] **Task 3: Build the presentational `Toast.tsx` component (AC: #1, #3, #4, #5)**
  - [x] Create `apps/web/src/components/Toast.tsx`:

    ```tsx
    'use client';

    // Aliased — this file's own default export is also named `Toast`;
    // importing the Radix namespace as `Toast` would collide with it.
    import * as ToastPrimitive from '@radix-ui/react-toast';
    import type { ToastEntry } from '@/lib/reducer';

    export interface ToastProps {
      toast: ToastEntry | null;
      onDismiss: () => void;
    }

    export default function Toast({ toast, onDismiss }: ToastProps) {
      return (
        <ToastPrimitive.Provider duration={5000}>
          {toast !== null && (
            <ToastPrimitive.Root
              key={toast.id}
              data-testid="toast-root"
              open
              onOpenChange={(open) => {
                if (!open) onDismiss();
              }}
              onEscapeKeyDown={onDismiss}
              className="flex items-center gap-3 rounded-md border border-current/10 bg-[var(--background)] px-4 py-3 shadow-lg"
            >
              <ToastPrimitive.Description
                data-testid="toast-description"
                className="flex-1 text-sm leading-6"
              >
                {toast.message}
              </ToastPrimitive.Description>
              <ToastPrimitive.Close
                aria-label="Dismiss"
                data-testid="toast-dismiss"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-current/10 bg-transparent outline-none hover:bg-current/5 focus-visible:ring-2 focus-visible:ring-current/40"
              >
                <span aria-hidden="true">×</span>
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          )}
          <ToastPrimitive.Viewport
            data-testid="toast-viewport"
            className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 outline-none"
          />
        </ToastPrimitive.Provider>
      );
    }
    ```

  - [x] Do NOT add `tailwindcss-animate` or any new Tailwind plugin for enter/exit animation — not installed, and adding one is out of scope for this story. If you want a fade, drive it off Radix's own `data-state="open"|"closed"` attribute with plain Tailwind (`data-[state=closed]:opacity-0 transition-opacity`) — polish only, not required by any AC.
  - [x] Keep `Toast` purely presentational — props in (`toast`, `onDismiss`), no import of `@/lib/api` or a `dispatch` call inside this file. Mirrors the established contract for `TodoInput`/`TodoItem` ([architecture.md:629-632](../planning-artifacts/architecture.md#L629-L632): `TodoApp` is the only stateful component).
  - [x] `Toast.Close` already calls `onOpenChange(false)` internally on click — you do not need a separate `onClick` handler on it; the `onOpenChange` wired on `Toast.Root` above is sufficient to catch both the close-button click and the auto-dismiss timer.

- [x] **Task 4: Wire `<Toast>` into `<TodoApp>` (AC: #1, #6)**
  - [x] Edit [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx): import `Toast` from `./Toast`; wrap the existing return value in a Fragment and render `<Toast toast={state.toast} onDismiss={() => dispatch({ type: 'errorDismiss' })} />` as a sibling after the `<section>`:

    ```tsx
    return (
      <>
        <section aria-labelledby="todos-heading" className="flex flex-col gap-6">
          {/* ...unchanged... */}
        </section>
        <Toast
          toast={state.toast}
          onDismiss={() => dispatch({ type: 'errorDismiss' })}
        />
      </>
    );
    ```
  - [x] Do NOT wire any `handleAdd`/`handleToggle`/`handleDelete` rejection callback to dispatch `errorShown` in this story — that wiring (plus the `ApiError` → human-readable message mapping) is Story 3.2's job, not this one. This story only builds and mounts the *infrastructure*; nothing dispatches `errorShown` yet outside of tests.
  - [x] Do NOT touch `TodoList.tsx`'s `EPIC 1 PLACEHOLDER` error branch ([TodoList.tsx:27-41](../../apps/web/src/components/TodoList.tsx#L27-L41)). That comment says "Story 3.1 replaces this," but the actual epics.md breakdown assigns the initial-load error UI replacement to **Story 3.4** ("Initial-load error recovery with retry button"), not 3.1 — 3.1's `toast` slice is a *different* state axis (mutation/safety-net failures) from the load-lifecycle `error`/`requestId` fields `TodoList` reads. Leave the placeholder and its comment as-is; a future story corrects the comment when 3.4 lands.

- [x] **Task 5: Tests (AC: #7)**
  - [x] Create `apps/web/src/components/Toast.test.tsx` following the established component-test shape (`consoleErrorSpy`/`consoleWarnSpy` in `beforeEach`, asserted `not.toHaveBeenCalled()` in `afterEach`, per [TodoItem.test.tsx:14-26](../../apps/web/src/components/TodoItem.test.tsx#L14-L26)). Cover:
    - `toast={null}` → `toast-root`/`toast-description`/`toast-dismiss` are absent; `toast-viewport` is present (Viewport always mounts; only `Root` is conditional per AC #1).
    - `toast={{ message: 'x', id: '1' }}` → `toast-description` renders the message text; `getByRole('region')` finds the viewport.
    - Clicking the element with `aria-label="Dismiss"` calls `onDismiss` exactly once (`userEvent.setup()`, not `fireEvent`).
    - Pressing Escape while the toast is open calls `onDismiss`.
    - Auto-dismiss: with `vi.useFakeTimers()`, advance past the 5000ms `duration` (`await vi.advanceTimersByTimeAsync(5000)`) and assert `onDismiss` was called. Restore real timers in `afterEach` (`vi.useRealTimers()`) regardless of pass/fail.
  - [x] **Before writing the `aria-live`/`role="region"` assertion, inspect the actual rendered DOM** (e.g., temporarily `screen.debug()` or `console.log(container.innerHTML)`) rather than assuming the AC's literal wording matches installed-version output byte-for-byte. Radix's Toast primitive announces via a separate visually-hidden announcer element portalled to `document.body`, not necessarily via a literal `aria-live` attribute on `Toast.Viewport` itself — confirm what `@radix-ui/react-toast@^1.2.18` actually renders and assert against that, adjusting the test (not the component) if the DOM shape differs from the AC's literal description. The *intent* — message reaches assistive tech without stealing focus — is what matters.
  - [x] Update `apps/web/src/lib/reducer.test.ts` per Task 2's bullet above.
  - [x] Do not add polyfills speculatively — if a test run fails with `ResizeObserver is not defined` or similar jsdom gaps (Radix Toast's swipe/viewport machinery uses more browser APIs than Checkbox did), add a minimal stub to `apps/web/vitest.setup.ts` at that point, not preemptively.

- [x] **Task 6: Verify**
  - [x] `npm run lint`, `npm run typecheck`, `npm run test` (all workspaces) — all green, 0 warnings.
  - [x] Confirm the reducer's `default: { const _exhaustive: never = action; ... }` still compiles after adding `errorShown`/`errorDismiss` to `TodoAction` (AC #2's exhaustiveness clause) — a missing `case` for either action fails `tsc --noEmit` here, which is the intended guardrail.
  - [x] `@radix-ui/react-toast`'s gzipped size is small (comparable to `@radix-ui/react-checkbox`'s ~3 KB, per Story 2.6 precedent); no formal bundle-analyzer run is required for this story unless you have reason to suspect budget pressure against NFR4's ≤200 KB gzipped initial-JS cap.

## Review Findings

_Code review 2026-07-05 — 3 parallel adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Acceptance Auditor: 12 PASS / 1 PARTIAL / 0 FAIL, no scope creep into Stories 3.2–3.6. 0 decision-needed, 3 patch, 3 defer, 7 dismissed as noise._

- [x] [Review][Patch] Auto-dismiss test leaks fake timers on assertion failure — `vi.useRealTimers()` runs only on the pass path; move it to `afterEach` so a throwing assertion can't strand fake timers into later userEvent-based tests [apps/web/src/components/Toast.test.tsx] — FIXED: `vi.useRealTimers()` moved to `afterEach`, inline call removed
- [x] [Review][Patch] `loadSuccess`/`loadError` toast-carry-forward untested — only `loadStart` has the preservation regression test, yet all three literals were changed identically and the spec calls this "the sharpest trap"; add two mirror tests [apps/web/src/lib/reducer.test.ts] — FIXED: added `loadSuccess`/`loadError` preserve-toast regression tests
- [x] [Review][Patch] `errorShown` never tested outside `status:'success'` — the spec explicitly warns "do NOT gate on status"; add a test dispatching `errorShown` in a non-success status and asserting `status`/`error`/`requestId` are preserved [apps/web/src/lib/reducer.test.ts] — FIXED: added non-success `errorShown` test
- [x] [Review][Defer] Same-`id` `errorShown` while a toast is open won't remount (timer not restarted, no re-announce), and the `key={toast.id}` remount contract has no test [apps/web/src/lib/reducer.ts / Toast.tsx] — deferred, becomes live when Story 3.2 wires producers (each generates a fresh `crypto.randomUUID()` id at the call site)
- [x] [Review][Defer] `onDismiss` is not correlated to a toast id — a late dismiss event for an outgoing toast could null a newer one [apps/web/src/components/TodoApp.tsx / reducer.ts] — deferred, narrow race, only reachable once Story 3.2 wires real producers
- [x] [Review][Defer] Escape fires `onDismiss` twice (`onEscapeKeyDown` + `onOpenChange`); harmless today via the `errorDismiss` null no-op but would double-count a non-idempotent future `onDismiss`; the Escape test's loose `toHaveBeenCalled()` doesn't pin it [apps/web/src/components/Toast.tsx] — deferred, pre-existing behavior, no current impact

## Dev Notes

### Where this story sits

Epic 3 ("Failure Resilience & Recovery") intro, verbatim: "When something goes wrong (offline, server 5xx, timeout), the user sees a clear non-technical error, their typed input is preserved, and they can retry without losing list state or refreshing. The system surfaces every failure — nothing drops silently — and operators can diagnose failures from correlated server logs." [epics.md:1016-1018](../planning-artifacts/epics.md#L1016-L1018)

Story 3.1 is **infrastructure only** — the generic Toast surface + reducer plumbing. It is the first of six numbered Epic 3 stories (two of which, 3.0/3.0.1, were additive Playwright/axe-core E2E harness stories that already shipped ahead of this one and don't affect its scope):

| Story | Scope | Depends on 3.1? |
|---|---|---|
| **3.1 (this story)** | Toast UI primitive + `toast` reducer slice + `errorShown`/`errorDismiss` | — |
| 3.2 | `ApiError` → human-readable message mapping; wires `createTodo`/`updateTodo`/`deleteTodo` rejection handlers to dispatch `errorShown` | Yes — directly |
| 3.3 | `TodoInput` preserves typed text on add failure (FR19) | No (independent UI change; occurs in the same failure-flow narrative) |
| 3.4 | Replaces `TodoList`'s Epic-1 error placeholder with a real retry-button UI (FR20) | No (different state axis — `state.error`/`state.requestId`, not `state.toast`) |
| 3.5 | Global `window` `unhandledrejection`/`error` listeners dispatch a generic toast (NFR9) | Yes — directly |
| 3.6 | Journey-level resilience tests (Journeys 1–3, including 5 failure sub-cases) | Yes — asserts Toast visibility |

Do not let this story's scope creep into any of 3.2–3.6's territory. See "Out-of-scope" below.

### Critical architectural guardrails

- **Single-reducer state management, no Context, no state library.** [architecture.md:178,248-249](../planning-artifacts/architecture.md#L178) — Toast state is a slice of the *same* `TodoState`/`TodoAction` union that already drives load + optimistic mutations, not a separate `useReducer`/Context. This was explicitly pre-announced in Story 2.4's own Dev Notes: *"`errorDismiss`... is in the architecture as a long-term plan... **Story 3.1 (Toast infrastructure) introduces it alongside the dismissable toast**."*
- **Toast is prop-driven, not reducer-coupled.** [architecture.md:632](../planning-artifacts/architecture.md#L632): *"`Toast` reads from the reducer state (error string + dismiss callback) — implemented via prop drilling, not Context (single ancestor, depth 2)."* `Toast.tsx` must not import `@/lib/reducer`'s `reducer`/`dispatch` machinery, only the `ToastEntry` type.
- **Zero entropy inside the reducer.** Story 2.4 established (and this story must honor): no `crypto.randomUUID()`, `Date.now()`, `fetch`, `console.*`, or timers inside `reducer.ts` — all non-determinism is generated by the caller and passed through the action payload (mirrors how `addOptimistic` receives a caller-supplied `tempId`/`createdAt`). **This is why Task 2's `errorShown` payload is `{ message: string; id: string }`, not `{ message: string }` with the reducer calling `crypto.randomUUID()` itself**, even though AC #2's literal pseudo-code shows `id: <crypto.randomUUID()>` as if the reducer produces it. Read that clause as describing the *origin* of the entropy (crypto.randomUUID is *the* mechanism used, somewhere in the pipeline), not as a mandate that the reducer module calls it. The externally observable result — `state.toast = { message, id }` — is identical either way; deviating preserves an explicit, deliberate, already-documented architectural rule and keeps `reducer.test.ts` deterministic (pin exact `id` strings; no `crypto` mocking, unlike every other test in that file). Story 3.2's real dispatch sites will generate the id via `crypto.randomUUID()` at the call site, exactly like `handleAdd` does today for `tempId` ([TodoApp.tsx:63](../../apps/web/src/components/TodoApp.tsx#L63)).
- **No-op reference equality.** When a dispatch changes nothing, the reducer must return the *same* object reference, not a fresh clone — this is asserted with `toBe(state)` throughout `reducer.test.ts`, not `toEqual`. Apply this to `errorDismiss` on an already-`null` toast (see Task 2).
- **`toast` persists across the load lifecycle — it is not part of the load state machine.** This is the sharpest trap in this story: `loadStart`/`loadSuccess`/`loadError` currently construct fresh object literals rather than spreading `...state` (they intentionally reset `error`/`requestId` on every load attempt). Naively adding a required `toast` field to `TodoState` without threading `toast: state.toast` through those three literals either fails `tsc --noEmit` or (if you make the field optional to dodge the error) silently drops any in-flight toast on the next tab-visibility refetch. See Task 2's exact target code.
- **XSS / rendering discipline.** [architecture.md:216,435](../planning-artifacts/architecture.md#L216): `dangerouslySetInnerHTML` is prohibited codebase-wide; render `toast.message` via plain JSX text interpolation (`{toast.message}` inside `Toast.Description`), exactly as done here. Story 3.1's own toast messages are infrastructure-test-only fixed strings, but Story 3.2 will later pipe `ApiError.message` through this same path — the rendering discipline must already be correct.
- **This is NOT the Next.js you know** — [apps/web/AGENTS.md](../../apps/web/AGENTS.md) warns this Next.js version (16.2.4) has conventions that may differ from training data; skim `node_modules/next/dist/docs/` before assuming App Router/Client Component behavior. Radix's ESM-only builds are already confirmed compatible with Next 16 + React 19 ([architecture.md:795](../planning-artifacts/architecture.md#L795)) — no action needed there, just don't assume otherwise.

### Why presentational `<Toast>` receives `toast`/`onDismiss` props (not `state`/`dispatch`)

Mirrors `TodoInput`'s `onAdd` and `TodoItem`'s `onToggle`/`onDelete` contract: presentational components receive narrow callback props, never the raw `dispatch` function or reducer action-type strings. `TodoApp` is the sole place that knows about `TodoAction` shapes ([architecture.md:629-631](../planning-artifacts/architecture.md#L629-L631)).

### Why `Toast.Close` (not a bare `<button onClick={onDismiss}>`)

Radix's `Toast.Close` already triggers the Root's `onOpenChange(false)` on click/Enter/Space, so wiring `onOpenChange` once on `Toast.Root` handles both the close-button click and the timer-based auto-dismiss through the same code path — one source of truth for "how does a toast go away," rather than two (a manual `onClick={onDismiss}` plus the separate `onOpenChange` for the timer). This is different from Story 2.7's delete button (a native `<button>`, no Radix primitive existed for that) — here Radix supplies exactly the right primitive.

### Why `key={toast.id}` on `Toast.Root`

`state.toast` is a single slot, not a queue (confirmed by Story 3.2's AC #3: "two mutations fail in rapid succession → `state.toast` reflects only the most recent message"). If a second `errorShown` fires while a toast is already open, only the `message` prop would change without a fresh `key` — React would keep the same `Toast.Root` instance mounted, and Radix's internal auto-dismiss timer would **not** restart from the new message, nor would its announcer necessarily re-fire for assistive tech. Keying on `toast.id` forces an unmount/remount, giving each distinct toast its own full `duration` window and its own announcement. This is precisely why `id` exists on `ToastEntry` at all, beyond satisfying AC #2's literal type shape.

### What changes in the codebase

| File | Change | LOC delta (approx.) |
|------|--------|---------------------|
| [apps/web/package.json](../../apps/web/package.json) | Add `@radix-ui/react-toast` to dependencies | +1 |
| (root) `package-lock.json` | Refresh for new dep + transitive Radix utils | (auto) |
| [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts) | Add `ToastEntry` type, `toast` field on `TodoState`, `errorShown`/`errorDismiss` on `TodoAction`; thread `toast: state.toast` through `loadStart`/`loadSuccess`/`loadError`; add two new `case`s | +25 / -5 |
| [apps/web/src/lib/reducer.test.ts](../../apps/web/src/lib/reducer.test.ts) | Add `toast: null` to `initialState` expectation; new `describe('errorShown/errorDismiss', ...)` block; one `loadStart`-preserves-`toast` regression test | +40 / -1 |
| `apps/web/src/components/Toast.tsx` (new) | Presentational component wrapping the four Radix primitives | +45 / -0 |
| `apps/web/src/components/Toast.test.tsx` (new) | Component tests per Task 5 | +90 / -0 |
| [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) | Import `Toast`; wrap return in a Fragment; mount `<Toast toast={state.toast} onDismiss={...} />` | +10 / -1 |

Total: ~+210 added LOC across 5 modified + 2 new files. One new runtime dep.

### Out-of-scope (do NOT do in this story)

- Mapping `ApiError` to human-readable messages, or wiring `handleAdd`/`handleToggle`/`handleDelete`'s rejection callbacks to dispatch `errorShown` — Story 3.2.
- `TodoInput` text preservation on add failure — Story 3.3.
- Replacing `TodoList`'s `EPIC 1 PLACEHOLDER` error branch / surfacing `state.error`/`state.requestId` for debugging — Story 3.4. (Note: [deferred-work.md:157](./deferred-work.md#L157), written during Story 1.9's review before Epic 3's stories were broken down, guessed this would land in "Story 3.1" — the actual epics.md breakdown assigns it to 3.4. Don't let that older note pull you into touching `TodoList.tsx` here.)
- Global `window.addEventListener('unhandledrejection' | 'error', ...)` safety net — Story 3.5.
- A toast *queue* (multiple simultaneous toasts) — never planned; the single-slot `toast: ToastEntry | null` model is deliberate (Radix's own docs discourage stacking multiple foreground toasts for screen-reader users).
- Journey-level / E2E tests asserting Toast behavior end-to-end — Story 3.6 (Playwright). This story's tests are Vitest + RTL only.
- Enter/exit animation via a new Tailwind plugin (`tailwindcss-animate` or similar) — not installed; out of scope.

### Project Structure Notes

```text
apps/web/
├── package.json                 # ← extended: + @radix-ui/react-toast in dependencies
└── src/
    ├── components/
    │   ├── Toast.tsx            # ← NEW: presentational Radix Toast wrapper
    │   ├── Toast.test.tsx       # ← NEW
    │   ├── TodoApp.tsx          # ← extended: + <Toast> mount, Fragment wrap
    │   ├── TodoApp.test.tsx     # (unchanged — no new mutation wiring in this story)
    │   ├── TodoInput.tsx        # (unchanged)
    │   ├── TodoItem.tsx         # (unchanged)
    │   └── TodoList.tsx         # (unchanged — placeholder stays; Story 3.4 territory)
    └── lib/
        ├── api.ts               # (unchanged)
        ├── errors.ts            # (unchanged)
        ├── reducer.ts           # ← extended: toast slice + errorShown/errorDismiss
        └── reducer.test.ts      # ← extended
```

Naming conventions satisfied: PascalCase component file (`Toast.tsx`), co-located test, no `__tests__/` directory, no barrel/index file introduced ([architecture.md:338-340,351](../planning-artifacts/architecture.md#L338-L340)).

### Testing Requirements

- **Unit/component tests:** `apps/web/src/lib/reducer.test.ts` (extended) + `apps/web/src/components/Toast.test.tsx` (new). Mandatory, per AC #7.
- **Integration tests:** none — no API changes in this story.
- **E2E tests:** none — Story 3.6 owns journey-level Toast assertions via Playwright.
- **Test runner:** Vitest + jsdom, already configured at [apps/web/vitest.config.mts](../../apps/web/vitest.config.mts); setup file [apps/web/vitest.setup.ts](../../apps/web/vitest.setup.ts) (`@testing-library/jest-dom/vitest` + RTL `cleanup()` in `afterEach` — no ResizeObserver/PointerEvent polyfills currently present; add only if a real test failure demands it).
- **Fake timers for auto-dismiss:** use `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(5000)` (async variant — a sync `advanceTimersByTime` can deadlock against RTL's `waitFor` polling). Always pair with `vi.useRealTimers()` in `afterEach`.
- **Coverage gate:** none in v1.

### Library / version pins (2026)

Already installed — do NOT bump:
- `react@19.2.4`, `react-dom@19.2.4`, `next@16.2.4`
- `@radix-ui/react-checkbox@^1.3.3`
- `vitest@^2.1.0`, `@testing-library/react@^16.3.0`, `@testing-library/jest-dom@^6.9.0`, `@testing-library/user-event@^14.6.1`, `@testing-library/dom@^10.4.0`, `jsdom@^29.0.0`
- `typescript@^5`, `tailwindcss@^4`

NEW dep (runtime, ships with bundle):
- `@radix-ui/react-toast@^1.2.18` — current stable per the npm registry at authoring time. Peer deps allow React `^19.0`, compatible with this repo's React 19.2.4. Radix also publishes a unified `radix-ui` meta-package (`^1.6.1`) that re-exports Toast — do not use it; stay consistent with the per-primitive-package convention `@radix-ui/react-checkbox` already established.
- No known deprecations or CVEs against `@radix-ui/react-toast` at authoring time. One open upstream accessibility issue worth being aware of (not blocking): [radix-ui/primitives#3634](https://github.com/radix-ui/primitives/issues/3634) — toasts occasionally not announced in some environments due to `aria-live="off"`. Rely on the Playwright + axe-core harness (Story 3.0/3.6) for real assistive-tech verification, not Vitest/jsdom, which cannot prove an announcement actually fired.

### Story 2.6 pattern precedent (mirror where applicable)

- Runtime dep install via `npm install --save --workspace apps/web <pkg>`, pinned, verified with `require.resolve`.
- Component file: `'use client'` directive, namespace import of the Radix package (`import * as X from '@radix-ui/react-x'`), Radix-native ARIA (no hand-rolled `role`/`aria-*` duplicating what Radix already sets), Tailwind `data-[state=...]` variants for state-driven styling, `data-testid` on every testable primitive, 44×44px (`h-11 w-11`) tap targets, `focus-visible:ring-2 focus-visible:ring-current/40` focus ring.
- Component test file: strict `consoleErrorSpy`/`consoleWarnSpy` `afterEach` assertions (Story 2.5 deliberately omits this pattern from `TodoApp.test.tsx` specifically because async rejection paths there can emit warnings under test — that exception doesn't apply here since `Toast.test.tsx` is a new, isolated file).

### Deferred-work items relevant to this story

- [deferred-work.md:157](./deferred-work.md#L157) (Story 1.9 review): flagged that `TodoList`'s error branch drops `state.error`/`state.requestId`, guessing "Story 3.1 owns the full error UX." Per the actual epics.md breakdown this is Story 3.4's job, not 3.1's — see "Out-of-scope" above.
- [deferred-work.md:52](./deferred-work.md#L52), [:43](./deferred-work.md#L43), and the Story 2.1 NUL-byte item all explicitly punt user-facing error surfacing to "Story 3.2" (mutation-failure toasts) — consistent with this story's infra-only scope; nothing to action here, just confirms the boundary.
- 3-0-1's Dev Notes: E2E scenarios P0-024 (Journey 3), P1-026 (unhandledrejection), P2-007 (correlation id in toast) are explicitly deferred pending "Toast infra (3.1/3.2)" — this story is the first half of unblocking them; Story 3.6 is where the E2E coverage actually lands.

### References

- [epics.md:1016-1105](../planning-artifacts/epics.md#L1016-L1105) — Epic 3 intro + Story 3.1 and 3.2 full text (scope boundary).
- [prd.md](../planning-artifacts/prd.md) — FR18/FR19/FR20/FR21, NFR7/NFR8/NFR9/NFR24, Journey 3 narrative.
- [architecture.md:178,189,243,248,252-256,387-409,629-632,676,795,838](../planning-artifacts/architecture.md) — state management, Radix Toast decision, error-translation flow, component contracts, a11y/XSS rules.
- [2-4-reducer-extensions-for-optimistic-mutations.md](./2-4-reducer-extensions-for-optimistic-mutations.md) — zero-entropy-in-reducer rule, no-op reference-equality convention, and the explicit forward-reference to this story's `errorDismiss`.
- [2-6-toggle-completion-via-radix-checkbox.md](./2-6-toggle-completion-via-radix-checkbox.md) — first-and-only prior Radix dependency precedent (install, component, test, styling conventions).
- `apps/web/src/lib/reducer.ts`, `reducer.test.ts`, `TodoApp.tsx`, `TodoList.tsx` — current implementation read directly for this story.
- `apps/web/AGENTS.md` — Next.js 16 / Tailwind v4 project-specific caveats.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

None — no failures requiring debug-log capture. One deviation from the story's literal test-authoring guidance is worth recording: jsdom does not implement `Element.prototype.hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`, which Radix Toast's swipe-gesture handling calls unconditionally on pointer events. Without a stub, `userEvent.click()` on `Toast.Close` threw `TypeError: target.hasPointerCapture is not a function` inside a React event handler, which (a) logged via `console.error` (failing the file's strict no-console-output `afterEach` assertion) and (b) left stale DOM across tests once the exception interrupted Radix's internal pointer-tracking state, causing a subsequent `getByTestId` to match two elements. Added a minimal one-time stub for the three Pointer Capture methods to `apps/web/vitest.setup.ts`, per Task 5's explicit guidance to add jsdom polyfills only when a real test failure demands it — this was that case.

### Completion Notes List

- Task 1: Installed `@radix-ui/react-toast@^1.2.18` as a runtime dependency in `apps/web` via `npm install --save --workspace apps/web`; verified resolution with `require.resolve`. Resolved version: 1.2.18.
- Task 2: Extended `apps/web/src/lib/reducer.ts` exactly per the story's target end-state — added `ToastEntry` type, `toast: ToastEntry | null` field on `TodoState` (threaded through the three non-spreading `loadStart`/`loadSuccess`/`loadError` literals), `errorShown`/`errorDismiss` on `TodoAction`, and the two new reducer cases (neither gated on `state.status !== 'success'`, per the story's explicit warning). `errorDismiss` on an already-`null` toast returns the same state reference (no-op convention). Extended `reducer.test.ts`: `initialState`/existing state literals now include `toast: null`; added a new `describe('reducer (toast slice)', ...)` block covering `errorShown` set/replace semantics, `errorDismiss` set-to-null and no-op reference equality, and a `loadStart`-preserves-toast regression test.
- Task 3: Created `apps/web/src/components/Toast.tsx` — presentational component wrapping Radix's `Toast.Provider`/`Toast.Root`/`Toast.Description`/`Toast.Viewport`/`Toast.Close`, `duration={5000}`, keyed on `toast.id`, `onOpenChange`/`onEscapeKeyDown` both funneling into the single `onDismiss` prop. No `@/lib/reducer` reducer/dispatch imports — only the `ToastEntry` type, preserving the prop-driven contract.
- Task 4: Wired `<Toast>` into `TodoApp.tsx` — wrapped the existing return in a Fragment, mounted `<Toast toast={state.toast} onDismiss={() => dispatch({ type: 'errorDismiss' })} />` as a sibling after the `<section>`. `TodoList.tsx`'s Epic-1 error placeholder left untouched (Story 3.4's territory, per Dev Notes).
- Task 5: Created `apps/web/src/components/Toast.test.tsx` (6 tests: viewport-only when `toast === null`; message + `role('region')` render when a toast is present; Dismiss click calls `onDismiss` once; Escape calls `onDismiss`; fake-timer auto-dismiss at 5000ms calls `onDismiss`; an `[aria-live]` element exists in the document for assistive-tech announcement). Per Task 5's guidance, inspected the actual rendered DOM before asserting: Radix's Viewport itself does not carry a literal `aria-live` attribute in this installed version — the announcement is delivered via a separate visually-hidden `<span role="status" aria-live="assertive">` portalled to `document.body`; the AC #5 test asserts against that actual behavior (message reaches assistive tech) rather than the AC's literal wording. Added the `hasPointerCapture` jsdom stub described above. Updated `reducer.test.ts` per Task 2.
- Task 6: `npm run lint` (0 warnings), `npm run typecheck` (all 3 workspaces clean, including the `tsc --noEmit` exhaustiveness guardrail on the reducer's `default` branch), `npm run test` (all 3 workspaces green: shared 25/25, api 4/4, web 105/105 — up from 94, +6 `Toast.test.tsx` and +5 `reducer.test.ts`). `TodoList.test.tsx` required a mechanical update (add `toast: null` to five `TodoState` literals) to satisfy the now-required field — no behavioral change to that file or component.

### File List

- `apps/web/package.json` (modified) — added `@radix-ui/react-toast` to `dependencies`
- `package-lock.json` (modified) — refreshed for the new dependency and its transitives
- `apps/web/src/lib/reducer.ts` (modified) — `ToastEntry` type, `toast` field on `TodoState`, `errorShown`/`errorDismiss` actions and cases, `toast: state.toast` threaded through `loadStart`/`loadSuccess`/`loadError`
- `apps/web/src/lib/reducer.test.ts` (modified) — `toast: null` added to existing state literals; new `describe('reducer (toast slice)', ...)` block
- `apps/web/src/components/Toast.tsx` (new) — presentational Radix Toast wrapper
- `apps/web/src/components/Toast.test.tsx` (new) — component tests
- `apps/web/src/components/TodoApp.tsx` (modified) — mounts `<Toast>`, wraps return in a Fragment
- `apps/web/src/components/TodoList.test.tsx` (modified) — mechanical `toast: null` addition to five `TodoState` test literals (required by the now-non-optional field; no behavioral change)
- `apps/web/vitest.setup.ts` (modified) — added a minimal `hasPointerCapture`/`setPointerCapture`/`releasePointerCapture` stub for jsdom (Radix Toast's swipe-gesture handling requires it)

## Change Log

| Date       | Change                                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-05 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Story slot: Epic 3, Story 1 (first numbered Epic 3 story; builds the Toast infrastructure that Stories 3.2 and 3.5 depend on directly). No previous-story blockers — Story 2.4 pre-announced `errorDismiss`; Story 3.0/3.0.1 (E2E harness) are additive and outside epics.md's numbered sequence. |
| 2026-07-05 | Dev-Story: Toast infrastructure implemented — Radix Toast wrapper component + `toast` reducer slice + `errorShown`/`errorDismiss` actions; +1 runtime dep `@radix-ui/react-toast@^1.2.18`; lint/typecheck clean; web tests 94 → 105; one jsdom polyfill added (`hasPointerCapture` family) to unblock Radix's pointer-capture calls under jsdom; one mechanical fixup to `TodoList.test.tsx` for the now-required `toast` field; no other spec deviations. Status: ready-for-dev → review. |
