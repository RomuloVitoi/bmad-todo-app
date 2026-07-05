# Story 3.3: Preserve `TodoInput` text on add failure (FR19)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user whose add failed,
I want my typed text to stay (or return) in the input,
so that I can retry with a single Enter press without retyping (FR19, FR20).

## Acceptance Criteria

1. **Given** `<TodoInput>` as shipped in Story 2.5 (clears on submit), **when** its behavior is updated, **then** on form submit the component captures the text value, **and** clears the input optimistically (preserving the submit pattern), **and** on `addReconcile` no further input action is needed (input stays cleared), **and** on `addFailed` the captured text is restored into the input.

2. **Given** a user types "buy milk" and submits, then the server returns `500`, **when** `addFailed` is dispatched, **then** the input value re-appears as "buy milk", **and** the optimistic list entry is removed (per Story 2.4), **and** a Toast appears with the failure message (per Story 3.2).

3. **Given** the input text is restored after a failure, **when** the user presses Enter (or clicks submit) again with the restored text, **then** a fresh submit cycle begins normally (new tempId, new `addOptimistic`, new `createTodo` call).

4. **Given** multiple add submissions are in flight simultaneously (user submitted text A, then quickly text B), **when** A fails and B succeeds, **then** A's restoration does NOT overwrite B's in-progress or current input content, **and** no double-submission occurs from a single click.

5. **Given** the user focuses away from the input before a failure, **when** the input is restored, **then** the restored text is visible even if the input is not focused, **and** focus behavior remains predictable (does NOT steal focus on restore).

6. **Given** `TodoInput.test.tsx`, **when** tests run, **then** coverage includes: success path (input clears on reconcile); failure path (input restored on `addFailed`); retry succeeds after restore; two-fire submissions where one fails and one succeeds maintain correct input state.

_(ACs verbatim from [epics.md:1107-1144](../planning-artifacts/epics.md#L1107-L1144).)_

## Tasks / Subtasks

- [x] **Task 1: Correlate `TodoInput` submissions with reducer failures via a returned tempId (AC: #1, #3, #4)**
  - [x] Edit [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx). Change `handleAdd`'s signature to **return** the generated `tempId` (a `string`) to its caller, instead of `void`. No other line inside `handleAdd`'s success branch changes. Target end-state:

    ```tsx
    const handleAdd = useCallback((text: string): string => {
      const tempId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      dispatch({ type: 'addOptimistic', payload: { tempId, text, createdAt } });
      createTodo(text).then(
        (todo) => {
          dispatch({ type: 'addReconcile', payload: { tempId, todo } });
        },
        (err: unknown) => {
          dispatch({ type: 'addFailed', payload: { tempId } });
          setFailedAdd({ tempId, text });
          const message =
            err instanceof ApiError
              ? err.message
              : 'Something went wrong. Please try again.';
          if (err instanceof ApiError) {
            console.debug('mutation failed', {
              requestId: err.requestId,
              statusCode: err.statusCode,
            });
          }
          dispatch({
            type: 'errorShown',
            payload: { message, id: crypto.randomUUID() },
          });
        },
      );
      return tempId;
    }, []);
    ```

  - [x] Add one new piece of local state to `TodoApp` (plain `useState`, NOT a reducer action — see "Critical architectural guardrail" below): `const [failedAdd, setFailedAdd] = useState<{ tempId: string; text: string } | null>(null);`. Add `useState` to the existing `react` import.
  - [x] In `handleAdd`'s rejection callback, call `setFailedAdd({ tempId, text })` immediately after the existing `dispatch({ type: 'addFailed', ... })` line (before the `errorShown` dispatch). `text` is already in scope — it's `handleAdd`'s own parameter, captured by the closure exactly like `tempId` already is.
  - [x] Pass `failedAdd` down to `TodoInput`: `{state.status === 'success' && <TodoInput onAdd={handleAdd} failedAdd={failedAdd} />}`.
  - [x] **Do NOT touch `handleToggle` or `handleDelete`.** They have no analogous "restore" concept — this story is `TodoInput`/add-only, per FR19's exact wording.

- [x] **Task 2: Update `TodoInput` to capture, clear-optimistically, and restore-on-failure (AC: #1, #2, #3, #5)**
  - [x] Edit [apps/web/src/components/TodoInput.tsx](../../apps/web/src/components/TodoInput.tsx). Target end-state:

    ```tsx
    'use client';

    import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

    export interface TodoInputProps {
      onAdd: (text: string) => string;
      failedAdd?: { tempId: string; text: string } | null;
    }

    export default function TodoInput({ onAdd, failedAdd = null }: TodoInputProps) {
      const [value, setValue] = useState('');
      const inputId = useId();
      const inputRef = useRef<HTMLInputElement>(null);
      const lastTempIdRef = useRef<string | undefined>(undefined);

      const isEmpty = value.trim().length === 0;

      const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        if (value.trim().length === 0) return;
        lastTempIdRef.current = onAdd(value);
        setValue('');
        inputRef.current?.focus();
      };

      useEffect(() => {
        if (failedAdd !== null && failedAdd.tempId === lastTempIdRef.current) {
          setValue(failedAdd.text);
        }
      }, [failedAdd]);

      return (
        // ...unchanged JSX below this line (form/label/input/button) —
        // do NOT modify markup, test ids, or class names.
      );
    }
    ```

    Only the imports, the `TodoInputProps` interface, the function signature/params, `lastTempIdRef`, `handleSubmit`'s first line, and the new `useEffect` change. The returned JSX tree is untouched.
  - [x] **Do NOT call `inputRef.current?.focus()` inside the new `useEffect`.** AC #5 requires the restore to NOT steal focus — the existing `.focus()` call stays exactly where it is today (synchronously inside `handleSubmit`, at submit time), and is not duplicated or moved.
  - [x] **Do NOT add a "consumed"/dismiss callback for `failedAdd`.** Each failure produces a brand-new `{ tempId, text }` object reference from `TodoApp` (via `setFailedAdd`), so the `useEffect`'s `[failedAdd]` dependency naturally fires once per failure without needing an ack round-trip. Keep this simple — do not invent a `TodoState.failedAdd` reducer slice or an `onFailedAddConsumed` prop.

- [x] **Task 3: Update `TodoInput.test.tsx` for the new `onAdd` contract + failure-restore coverage (AC: #6)**
  - [x] Edit [apps/web/src/components/TodoInput.test.tsx](../../apps/web/src/components/TodoInput.test.tsx). Every existing `onAdd={vi.fn()}` call remains valid as-is (an untyped `vi.fn()` is assignable to `(text: string) => string` — TypeScript does not require it to return a `string` at the call site). No existing test needs to change to keep passing.
  - [x] Add new tests to the `describe('<TodoInput />', ...)` block:
    - **Failure path restores text:** render with a controlled `onAdd` mock that returns a fixed tempId (e.g. `vi.fn().mockReturnValue('temp-1')`) and an initial `failedAdd={null}` prop; type + submit "buy milk" (input clears); re-render (or use a wrapper that lets you update props — see note below) with `failedAdd={{ tempId: 'temp-1', text: 'buy milk' }}`; assert the input's value is now `'buy milk'`.
    - **Non-matching failure does NOT restore:** same setup, but re-render with `failedAdd={{ tempId: 'temp-2', text: 'ignore me' }}` (a tempId that does NOT match the mock's returned `'temp-1'`); assert the input value stays `''` (this is the two-fire/AC #4 case, exercised at the component level since `TodoInput` alone owns the correlation logic).
    - **Retry after restore begins a fresh cycle:** after a restore (input shows `'buy milk'`), submit again; assert `onAdd` was called a second time with `'buy milk'` and the input clears again.
    - **Restore does not steal focus:** blur the input (or simply don't focus it) before triggering the prop update that restores text; assert `document.activeElement` is NOT the input after the restore (`expect(input).not.toHaveFocus()`), while the input's `.value` IS the restored text.
  - [x] To change a prop after initial render in RTL, capture the `rerender` function from `render()`'s return value: `const { rerender } = render(<TodoInput onAdd={onAdd} failedAdd={null} />); ...; rerender(<TodoInput onAdd={onAdd} failedAdd={{ tempId: 'temp-1', text: 'buy milk' }} />);`.
  - [x] These tests are Vitest + RTL, no new dependency. Follow this file's existing `beforeEach`/`afterEach` console-spy convention (no `console.error`/`console.warn` calls expected in any of the new tests).

- [x] **Task 4: Update `TodoApp.test.tsx` for the new AC #2 end-to-end behavior (AC: #2, #4)**
  - [x] Edit [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx). Extend the existing test `'rollback: optimistic entry appears then disappears when POST rejects'` (around line 68) with an additional assertion after the rollback completes: the input's value is back to `'fail me'` (the text originally typed). Use the same `input` variable already captured earlier in that test via `screen.findByLabelText(/add a todo/i)`.
  - [x] Add one new integration test to the `<TodoApp /> create journey` describe block covering AC #4 at the full-component level: submit text A, before its POST resolves submit text B, resolve B's POST successfully (201) and then resolve A's POST with a failure (e.g. 500); assert the input is empty (not `'A'`) after both settle, and the list contains B's todo. Follow this file's existing pattern of manually-controlled promises (see the `resolvePost` pattern in the rollback test) — you will need two separately-resolvable POST promises here, resolved out of submission order.

- [x] **Task 5: Verify**
  - [x] `npm run lint`, `npm run typecheck`, `npm run test` (all workspaces) — all green, 0 warnings.
  - [x] Confirm `reducer.ts` and `reducer.test.ts` are untouched — this story adds zero new reducer actions and zero new `TodoState` fields (see "Critical architectural guardrail" below).

### Review Findings

_Code review 2026-07-05 — 3 parallel adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Auditor: all 6 ACs PASS, all 6 guardrails honored, zero scope creep. 1 decision-needed, 0 patch, 3 defer, 3 dismissed._

- [x] [Review][Patch][Fixed] Restore effect unconditionally overwrote the input on tempId match — clobbered text typed after the last submit [apps/web/src/components/TodoInput.tsx:29-38] — The restore `useEffect` ran `setValue(failedAdd.text)` whenever `failedAdd.tempId === lastTempIdRef.current`, with no check that the input was currently empty. Sequence: user submits "A" (input clears, "A" still in flight) → user starts typing a fresh draft "world" → A's create fails → effect overwrote "world" with "A". Silent loss of active typing. Raised by blind+edge (HIGH). **Resolved (decision → patch):** the restore now uses a functional updater guarded on `current.trim().length === 0`, so it only restores into an empty input and never clobbers a fresh draft; the functional form reads the latest value without adding `value` to the effect deps. Added regression test `does NOT clobber a fresh draft the user typed after submitting` to `TodoInput.test.tsx`. lint/typecheck clean; web tests 136 → 137.

- [x] [Review][Defer] Concurrent double-failure drops the earlier submission's text [apps/web/src/components/TodoApp.tsx:77 + TodoInput.tsx:29-33] — deferred, spec-accepted design. Submit A then B (`lastTempIdRef` = B); if BOTH fail, only B's text is restored — A's is lost. The "correlation guardrail" explicitly ratifies "a stale failure signal for an earlier submission is silently ignored"; AC #4 only requires A's failure not clobber B, not that A be restored. Raised by blind+edge (MEDIUM).
- [x] [Review][Defer] `failedAdd` is never reset; restore correctness relies on `crypto.randomUUID()` uniqueness [apps/web/src/components/TodoApp.tsx:64-96] — deferred, spec forbade the fix. Nothing ever sets `failedAdd` back to `null`; it stays in state indefinitely and re-fires only because each real submit mints a fresh UUID that diverges from the ref. The spec explicitly instructs "do NOT add a consumed/dismiss callback." Correct today, but fragile-by-accident (a tempId reuse or remount-ordering change would resurrect stale text). Raised by blind+edge (MEDIUM/LOW).
- [x] [Review][Defer] Untrimmed whitespace round-trips into the restored input [apps/web/src/components/TodoInput.tsx:24-27] — deferred, pre-existing from Story 2.5. `handleSubmit` passes the raw `value` (only `.trim()` for the empty-guard), so leading/trailing whitespace flows into the optimistic todo, `failedAdd.text`, and the restored input. Not caused by this change. Raised by blind (LOW).

## Dev Notes

### Where this story sits

Epic 3 ("Failure Resilience & Recovery") intro, verbatim: "When something goes wrong (offline, server 5xx, timeout), the user sees a clear non-technical error, their typed input is preserved, and they can retry without losing list state or refreshing. The system surfaces every failure — nothing drops silently — and operators can diagnose failures from correlated server logs." [epics.md:1016-1018](../planning-artifacts/epics.md#L1016-L1018)

| Story | Scope | Depends on 3.3? |
|---|---|---|
| 3.1 (done) | Toast UI primitive + `toast` reducer slice + `errorShown`/`errorDismiss` | — |
| 3.2 (done) | `ApiError` → human-readable message mapping; wires `createTodo`/`updateTodo`/`deleteTodo` rejection handlers to dispatch `errorShown` | No — 3.3 reuses 3.2's Toast/message plumbing but adds no new error-message logic |
| **3.3 (this story)** | `TodoInput` captures + restores typed text across a failed `createTodo` call (FR19) | — |
| 3.4 | Replaces `TodoList`'s Epic-1 error placeholder with a real retry-button UI (FR20) | No (different surface — initial-load `state.error`, not `TodoInput`) |
| 3.5 | Global `window.addEventListener('unhandledrejection' \| 'error', ...)` safety net (NFR9) | No |
| 3.6 | Journey-level resilience tests (Journeys 1–3, including "typed text preserved" per Journey 3) | Yes — asserts the exact restore behavior this story implements |

Do not let this story's scope creep into 3.4/3.5/3.6's territory (see "Out-of-scope" below).

### Critical architectural guardrails

- **This story adds ZERO new reducer actions and ZERO new `TodoState` fields.** [architecture.md:248](../planning-artifacts/architecture.md#L248) enumerates the frozen reducer action list: `loadSuccess | loadError | addOptimistic | addReconcile | addFailed | toggleOptimistic | toggleFailed | deleteOptimistic | deleteFailed | errorDismiss` (plus 3.1's `errorShown`) — there is no "restore" or "inputRestore" action in this list, and none should be added. The restore signal (`failedAdd`) is **plain React state living in `TodoApp`**, entirely outside the reducer, because it is ephemeral UI-only correlation data (which `TodoInput` instance's submission failed), not server/list state. `reducer.ts` and `reducer.test.ts` are untouched by this story.
- **Correlation is by tempId, not by "most recent failure wins."** The naive approach — always restoring the most recent `addFailed`'s text — breaks AC #4 (concurrent A/B submissions): if A fails after B was already submitted, restoring A's text would incorrectly clobber B's in-flight state. Instead, `TodoInput` remembers (in a `ref`, not `state` — it must not trigger a re-render) the `tempId` of **its own most recent submission** and only applies a `failedAdd` signal whose `tempId` matches. A later submission (B) overwrites the ref, so a stale failure signal for an earlier submission (A) is silently ignored — this is what makes AC #4 work without an explicit ordering/queueing mechanism.
- **`tempId` generation still happens in exactly one place: `TodoApp.handleAdd`'s `crypto.randomUUID()` call.** This story does NOT move id generation into `TodoInput` — it only changes `handleAdd` to *return* the id it already generates, so `TodoInput` can remember which submission is "its own." This preserves the "zero entropy in the reducer, ids generated at the dispatch call site" convention established in 2.4/3.1/3.2's Dev Notes (`TodoApp` is the one dispatch call site that ever calls `crypto.randomUUID()` for add-related ids).
- **`TodoInput` remains the sole owner of the input's `value` state.** This story does NOT lift `value` into `TodoApp` or the reducer to become a "controlled" input from `TodoApp`'s perspective — `TodoInput` still manages `useState('')` internally exactly as it has since Story 2.5. `TodoApp` only ever pushes a one-shot *signal* (`failedAdd`) down, it does not own or set the input's value directly.
- **The restore effect must never call `.focus()`.** AC #5 explicitly requires the restore to not steal focus. The pre-existing `inputRef.current?.focus()` call (from Story 2.5, at the end of `handleSubmit`) stays exactly where it is — it fires synchronously at submit time (success-path optimism), not at restore time. Do not add a second `.focus()` call inside the new `useEffect`.
- **`onAdd`'s new return type (`string`) is a source-compatible widening, not a breaking change for existing callers.** `vi.fn()` (untyped) remains assignable to `(text: string) => string` in every existing `TodoInput.test.tsx` call site — no existing test needs modification to keep compiling/passing (only new tests are added per Task 3).
- **XSS / rendering discipline (unchanged from prior stories).** The restored text flows through the exact same `<input value={value} onChange={...}>` controlled-input binding already in place — no new rendering surface, no `dangerouslySetInnerHTML`, nothing to sanitize differently than today.

### Known gap, explicitly deferred (do NOT fix in this story)

- If `TodoInput` unmounts and remounts while an add is in flight (e.g., `state.status` transitions away from `'success'` and back — `TodoApp` only renders `<TodoInput>` when `state.status === 'success'`), the new instance's `lastTempIdRef` starts `undefined` and a subsequently-arriving `failedAdd` for the old instance's submission will not restore (silently dropped). This is an existing-pattern-consistent edge case (the component is fully unmounted, so there is no DOM input to restore text into anyway) and is out of scope — do not add persistence across unmounts.

### What changes in the codebase

| File | Change | LOC delta (approx.) |
|------|--------|---------------------|
| [apps/web/src/components/TodoInput.tsx](../../apps/web/src/components/TodoInput.tsx) | New `failedAdd` prop; `onAdd` now returns `tempId`; new `lastTempIdRef`; new restore `useEffect` | +20 / -3 |
| [apps/web/src/components/TodoInput.test.tsx](../../apps/web/src/components/TodoInput.test.tsx) | New tests: failure-restore, non-matching-failure-no-restore, retry-after-restore, restore-does-not-steal-focus | +50 / -0 |
| [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) | New `failedAdd` local state; `handleAdd` returns `tempId` + calls `setFailedAdd`; passes `failedAdd` prop to `<TodoInput>` | +10 / -2 |
| [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx) | Extend rollback test with input-restore assertion; new concurrent A/B submission test | +30 / -0 |

Total: ~+110 added LOC across 4 files. Zero new dependencies. No `reducer.ts` / `errors.ts` / `api.ts` changes.

### Out-of-scope (do NOT do in this story)

- Any change to `reducer.ts`, `reducer.test.ts`, `errors.ts`, `api.ts`, or their tests — this story is `TodoInput`/`TodoApp` orchestration only.
- Replacing `TodoList`'s `EPIC 1 PLACEHOLDER` error branch or adding a retry button — Story 3.4.
- Global `window.addEventListener('unhandledrejection' | 'error', ...)` safety net — Story 3.5.
- Journey-level / E2E tests asserting this restore behavior end-to-end via Playwright — Story 3.6. This story's tests are Vitest + RTL only.
- Debouncing rapid double-submits, or any change to the existing `disabled={isEmpty}` submit-guard logic beyond what's already shipped.
- A "restore" affordance for `handleToggle`/`handleDelete` — FR19 is about in-progress *input* (typed text), which only `TodoInput` has; toggle/delete have no analogous typed-text state to preserve.

### Project Structure Notes

```text
apps/web/
└── src/
    ├── components/
    │   ├── Toast.tsx            # (unchanged)
    │   ├── TodoApp.tsx          # ← extended: failedAdd state + handleAdd returns tempId
    │   ├── TodoApp.test.tsx     # ← extended: input-restore assertions
    │   ├── TodoInput.tsx        # ← extended: failedAdd prop + restore useEffect
    │   ├── TodoInput.test.tsx   # ← extended: restore-behavior tests
    │   ├── TodoItem.tsx         # (unchanged)
    │   └── TodoList.tsx         # (unchanged — Story 3.4 territory)
    └── lib/
        ├── api.ts               # (unchanged)
        ├── errors.ts            # (unchanged)
        └── reducer.ts           # (unchanged — see "Critical architectural guardrails")
```

No new files; no new component; no new dependency.

### Testing Requirements

- **Unit/component tests:** `apps/web/src/components/TodoInput.test.tsx` (extended — primary coverage per AC #6), `apps/web/src/components/TodoApp.test.tsx` (extended — end-to-end AC #2/#4 coverage). Mandatory per AC #6.
- **Integration tests:** none — no API changes in this story.
- **E2E tests:** none — Story 3.6 owns journey-level assertions via Playwright.
- **Test runner:** Vitest + jsdom + RTL, already configured. No new jsdom polyfills expected (no new Radix/browser-API surface — plain `<input>`/`useEffect`).
- **Coverage gate:** none in v1.

### Library / version pins

No new dependencies. No version changes. Pure application logic (`TodoInput.tsx`, `TodoApp.tsx`).

### Previous story intelligence (3.2)

- 3.2 established the `errorShown`/Toast wiring this story's failure path already benefits from — `handleAdd`'s rejection callback (Task 1's target snippet above) is 3.2's exact existing code with only the `setFailedAdd(...)` line and the final `return tempId;` inserted; every other line (the `addFailed` dispatch, the message mapping, the `console.debug`, the `errorShown` dispatch) is verbatim unchanged.
- 3.2's Dev Notes established the "ids are generated at the dispatch call site, never inside a reducer" convention — this story extends that same convention to `tempId`'s new second consumer (`TodoInput`'s `lastTempIdRef`) without relocating generation.
- 3.2 deferred (did not fix) an `AbortError`-misclassification gap in `api.ts`'s mutation `catch` blocks, gated on "a future story passing an `AbortSignal` into a mutation call." This story does **not** pass a signal into `createTodo` — that gap remains correctly out of scope here too.

### Git intelligence (recent commits)

Most recent commit (`f656ac5`) is the squashed Stories 3.1+3.2 work (Toast infra + mutation error mapping) — establishes the exact `TodoApp.tsx` shape (`handleAdd`/`handleToggle`/`handleDelete` with `errorShown` dispatches) that Task 1 above builds on directly. No other recent commits touch `TodoInput.tsx` or `TodoApp.tsx`.

### References

- [epics.md:1107-1144](../planning-artifacts/epics.md#L1107-L1144) — Story 3.3 full AC text (source of truth for this story).
- [prd.md:182-186,213,305-306](../planning-artifacts/prd.md) — FR19/FR20, Journey 3 narrative ("a clear, non-technical error... without clearing the typed text").
- [architecture.md:248,418,719-729](../planning-artifacts/architecture.md) — frozen reducer action list; "no automatic retries... input is preserved per FR19"; "add a todo" end-to-end data-flow narrative already stating "The original `TodoInput` text remains (FR19)."
- [3-2-mutation-failure-toasts-with-user-facing-error-messages.md](./3-2-mutation-failure-toasts-with-user-facing-error-messages.md) — immediately-preceding story; `handleAdd`'s current shape that Task 1 extends.
- `apps/web/src/components/TodoInput.tsx`, `TodoApp.tsx`, `TodoInput.test.tsx`, `TodoApp.test.tsx`, `apps/web/src/lib/reducer.ts` — current implementation read directly for this story.
- `apps/web/AGENTS.md` — Next.js 16 / Tailwind v4 project-specific caveats (not directly relevant to this story's logic-only changes, but still governs the codebase).

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

None — no failures requiring debug-log capture. Implementation matched the story's target-state code snippets exactly; no deviations.

### Completion Notes List

- Task 1: `TodoApp.tsx` — `handleAdd` now returns the generated `tempId` (was `void`); added local `failedAdd` state (`useState<{ tempId: string; text: string } | null>(null)`); rejection callback now calls `setFailedAdd({ tempId, text })` immediately after the existing `addFailed` dispatch; `<TodoInput>` now also receives `failedAdd={failedAdd}`. `handleToggle`/`handleDelete` untouched.
- Task 2: `TodoInput.tsx` — `onAdd` prop type changed to `(text: string) => string`; new optional `failedAdd` prop; new `lastTempIdRef` tracks the tempId of the component's own most recent submission; new `useEffect` restores `value` from `failedAdd.text` only when `failedAdd.tempId === lastTempIdRef.current`. No `.focus()` call added to the effect (AC #5); JSX markup unchanged.
- Task 3: Added 4 new tests to `TodoInput.test.tsx` (18 total, up from 14): matching-failure restores text, non-matching-failure does not restore, retry-after-restore begins a fresh submit cycle, restore does not steal focus. All existing tests pass unmodified — `vi.fn()` remained assignable to the new `(text: string) => string` signature.
- Task 4: Extended the existing `'rollback: optimistic entry appears then disappears when POST rejects'` test in `TodoApp.test.tsx` with an input-value-restored assertion; added a new integration test `'preserves in-flight input when an earlier submission fails after a later one succeeds'` covering AC #4 at the full-component level (submits A then B, resolves B success first, then A failure, asserts input stays empty and B remains in the list).
- Task 5: `npm run lint` (0 warnings), `npm run typecheck` (all 3 workspaces clean), `npm run test` (all 3 workspaces green: shared 25/25, api 4/4, web 136/136 — up from 131: +4 `TodoInput.test.tsx`, +1 `TodoApp.test.tsx`). Confirmed `reducer.ts`/`reducer.test.ts`, `errors.ts`, and `api.ts` are untouched — zero new reducer actions, zero new `TodoState` fields.

### File List

- `apps/web/src/components/TodoApp.tsx` (modified) — `handleAdd` returns `tempId`; new `failedAdd` local state; passes `failedAdd` prop to `<TodoInput>`
- `apps/web/src/components/TodoApp.test.tsx` (modified) — extended rollback test with input-restore assertion; new concurrent A/B submission test
- `apps/web/src/components/TodoInput.tsx` (modified) — new `failedAdd` prop; `onAdd` returns `tempId`; new `lastTempIdRef`; new restore `useEffect`
- `apps/web/src/components/TodoInput.test.tsx` (modified) — 4 new tests covering failure-restore, non-matching-failure, retry-after-restore, and no-focus-steal

## Change Log

| Date       | Change                                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-05 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Story slot: Epic 3, Story 3; independent of Story 3.2 (reuses its Toast/message plumbing, adds no new error-message logic). Zero reducer changes, zero new dependencies — correlation via a returned `tempId` + local `failedAdd` React state in `TodoApp`, matched against a per-`TodoInput`-instance ref. |
| 2026-07-05 | Dev-Story: `TodoInput` text preservation on add failure implemented — `handleAdd` returns `tempId`; `TodoApp` tracks local `failedAdd` state; `TodoInput` restores its value via a `lastTempIdRef`-matched `useEffect`, without stealing focus; lint/typecheck clean; web tests 131 → 136; zero reducer/errors/api changes; no spec deviations. Status: ready-for-dev → review. |
