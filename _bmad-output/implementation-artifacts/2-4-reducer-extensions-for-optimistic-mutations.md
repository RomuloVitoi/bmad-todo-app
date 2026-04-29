# Story 2.4: Reducer extensions for optimistic mutations

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the web app,
I want reducer actions that apply mutations optimistically, reconcile with server responses for create, and roll back on failure for toggle/delete,
So that the UI can respond in ≤100 ms (NFR1) while preserving correctness on failure.

## Acceptance Criteria

1. **Given** [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts),
   **When** the `TodoAction` discriminated union is inspected,
   **Then** in addition to the existing `loadStart` / `loadSuccess` / `loadError` actions, it includes exactly seven new variants:
   - `addOptimistic` — payload `{ tempId: string; text: string; createdAt: string }`
   - `addReconcile` — payload `{ tempId: string; todo: Todo }`
   - `addFailed` — payload `{ tempId: string }`
   - `toggleOptimistic` — payload `{ id: string; completed: boolean }`
   - `toggleFailed` — payload `{ id: string; previousCompleted: boolean }`
   - `deleteOptimistic` — payload `{ id: string }`
   - `deleteFailed` — payload `{ todo: Todo; index: number }`

2. **Given** state `{ status: 'success', todos: [] }` and action `addOptimistic({ tempId: 't-1', text: 'milk', createdAt: '2026-04-29T12:00:00.000Z' })`,
   **When** the reducer is called,
   **Then** the new state is `{ status: 'success', todos: [{ id: 't-1', text: 'milk', completed: false, createdAt: '2026-04-29T12:00:00.000Z', pending: true }] }`,
   **And** the `pending: true` flag is the ONLY structural difference from a server-loaded `Todo` (i.e., the optimistic entry is a `Todo & { pending: true }`, not a different shape).

3. **Given** state containing a todo with `id === 't-1'` and `pending: true`,
   **When** action `addReconcile({ tempId: 't-1', todo: { id: 's-99', text: 'milk', completed: false, createdAt: '2026-04-29T12:00:01.000Z' } })` is dispatched,
   **Then** the entry whose `id === 't-1'` is replaced by the server `Todo`,
   **And** the replacement entry has NO `pending` flag (the field is absent or `undefined`, not `false`),
   **And** the position in `state.todos` is preserved (not reordered).

4. **Given** state containing a todo with `id === 't-1'` and `pending: true`,
   **When** action `addFailed({ tempId: 't-1' })` is dispatched,
   **Then** the entry whose `id === 't-1'` is removed from `state.todos`,
   **And** all other todos remain in place.

5. **Given** state containing a todo `{ id: 'x', completed: false, ... }`,
   **When** action `toggleOptimistic({ id: 'x', completed: true })` is dispatched,
   **Then** the matching todo's `completed` is `true` in the new state,
   **And** all other fields (id, text, createdAt) are unchanged,
   **And** all other todos are untouched.

6. **Given** a state where `toggleOptimistic({ id: 'x', completed: true })` was previously applied,
   **When** action `toggleFailed({ id: 'x', previousCompleted: false })` is dispatched,
   **Then** the matching todo's `completed` reverts to `false`,
   **And** all other todos are untouched.

7. **Given** state containing a todo with `id === 'y'`,
   **When** action `deleteOptimistic({ id: 'y' })` is dispatched,
   **Then** the matching todo is removed from `state.todos`,
   **And** all other todos remain in place.

8. **Given** a prior `deleteOptimistic({ id: 'y' })` has removed a todo at index 2 of a 5-element array,
   **When** action `deleteFailed({ todo: <originalTodo>, index: 2 })` is dispatched,
   **Then** the original todo is re-inserted at index 2,
   **And** the resulting array's other elements are at their original indices,
   **And** the re-inserted todo's structure is identical to the stashed one (no mutation, no `pending` flag added).

9. **Given** the reducer's discriminated-union switch,
   **When** TypeScript compiles `apps/web/`,
   **Then** the existing `_exhaustive: never` pin (currently in [reducer.ts:38](../../apps/web/src/lib/reducer.ts#L38)) covers all ten action variants,
   **And** adding an eleventh action type without a case fails `tsc --noEmit` with a "Type 'X' is not assignable to type 'never'" error.

10. **Given** the reducer is called with any of the seven new actions,
    **When** inspected,
    **Then** it performs no side effects: NO `Date.now()`, NO `crypto.randomUUID()`, NO `fetch`, NO `console.log`/`console.warn`, NO `setTimeout`/`setInterval`, NO mutation of the input `state` or `action` arguments. All time-, id-, and prior-value entropy must arrive via action payloads (caller's responsibility).

11. **Given** state with `status !== 'success'` (e.g., `'idle'`, `'loading'`, `'error'`),
    **When** any of the seven new optimistic actions is dispatched,
    **Then** the state is returned unchanged (defensive no-op — mutations are only meaningful after the initial load succeeds, and the architecture says "mutations do not introduce separate loading flags" at [architecture.md:413](../../_bmad-output/planning-artifacts/architecture.md#L413)).

12. **Given** [apps/web/src/lib/reducer.test.ts](../../apps/web/src/lib/reducer.test.ts),
    **When** Vitest runs (`npm run test --workspace apps/web`),
    **Then** all seven new action transitions are covered (one happy-path test each, minimum),
    **And** a test verifies that an `addReconcile` result is structurally equivalent to a server-loaded `Todo` except for the absence of the `pending` flag (AC #2's "visually indistinguishable in shape" assertion),
    **And** a test verifies that optimistic actions on a non-`success` state are no-ops (AC #11),
    **And** a test verifies pure-function behavior: the input `state` reference is preserved when the reducer returns unchanged state (no shallow clone), and is NOT preserved when state actually changes (defensive immutability check),
    **And** all assertions pass with no warnings/errors.

## Tasks / Subtasks

- [ ] **Task 1: Extend reducer types and action union (AC: #1, #2)**
  - [ ] Edit [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts):

    ```ts
    import type { Todo } from '@todo-app/shared';

    // Internal state shape: a server `Todo` optionally enriched with a
    // `pending` flag while a create is in flight. The flag is reducer-internal —
    // it never crosses the wire (TodoSchema in @todo-app/shared is `.strict()`).
    export type TodoEntry = Todo & { pending?: boolean };

    export type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

    export interface TodoState {
      status: LoadStatus;
      todos: TodoEntry[];
      error?: string;
      requestId?: string;
    }

    export type TodoAction =
      | { type: 'loadStart' }
      | { type: 'loadSuccess'; payload: Todo[] }
      | { type: 'loadError'; payload: { error: string; requestId?: string } }
      | { type: 'addOptimistic'; payload: { tempId: string; text: string; createdAt: string } }
      | { type: 'addReconcile'; payload: { tempId: string; todo: Todo } }
      | { type: 'addFailed'; payload: { tempId: string } }
      | { type: 'toggleOptimistic'; payload: { id: string; completed: boolean } }
      | { type: 'toggleFailed'; payload: { id: string; previousCompleted: boolean } }
      | { type: 'deleteOptimistic'; payload: { id: string } }
      | { type: 'deleteFailed'; payload: { todo: Todo; index: number } };
    ```

  - [ ] **Why widen `state.todos` from `Todo[]` to `TodoEntry[]`** — the optimistic entries carry a transient `pending: true` flag that's not part of the wire schema. Keeping the wire `Todo` type strict in `packages/shared` means we layer the flag at the reducer boundary, not in the contract. `TodoEntry & { pending?: boolean }` is structurally a supertype of `Todo`, so existing code paths assigning `Todo[] → TodoEntry[]` continue to typecheck. Components reading `state.todos` automatically receive `TodoEntry`; the optional `pending` is opt-in (Story 2.5+ uses it).
  - [ ] **Why a single union (not separate "read" and "write" types)** — discriminated unions via `type` are React-idiomatic for `useReducer` and align with the existing pattern at [reducer.ts:12-15](../../apps/web/src/lib/reducer.ts#L12-L15). Splitting load- and mutation-actions into two unions would double the dispatch surface and force consumers to type-narrow twice.
  - [ ] **Why `Todo` (not `TodoEntry`) on `addReconcile.todo` and `deleteFailed.todo`** — the server response IS a wire-shape `Todo`. Tagging it `Todo` (not `TodoEntry`) makes the contract explicit at the type system: only the reducer mints `pending: true`, callers cannot. (TS allows `Todo` to be assigned where `TodoEntry` is expected since `pending` is optional, so this asymmetry creates no friction.)
  - [ ] **Why `previousCompleted` on `toggleFailed` (not "compute from current state")** — the reducer's call to `toggleOptimistic` already mutated `completed`; the prior boolean is gone from state by the time the failure arrives. Caller stashes `previousCompleted` BEFORE dispatching `toggleOptimistic`, then dispatches `toggleFailed` with that stashed value on rejection. This pushes entropy to the caller and keeps the reducer pure.
  - [ ] **Why `index` on `deleteFailed` (not just `todo`)** — restoring the deleted row at the END of the array would reorder; restoring at index 0 would also reorder. Only the original index preserves visual continuity. Caller stashes `index` from `state.todos.findIndex(t => t.id === id)` before dispatching `deleteOptimistic`.
  - [ ] **Watch-out:** Do NOT use `Pick<Todo, 'id'>` or other utility types in payloads. Each action's payload should explicitly enumerate its fields — easier to grep, easier for the dev agent in Story 2.5+ to copy.
  - [ ] **Watch-out:** Do NOT add a `pending: false` field to reconciled entries. The architecture's distinction is "flag absent (server-confirmed)" vs "flag truthy (in-flight)". Setting `pending: false` would make AC #3 fail, since the test asserts the flag is absent or `undefined`, not `false`.

- [ ] **Task 2: Implement seven new action handlers (AC: #2–#8, #10, #11)**
  - [ ] Edit [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts) — extend the existing `switch (action.type)` block. The `default` exhaustiveness guard already exists; the new cases slot in BEFORE it:

    ```ts
    export function reducer(state: TodoState, action: TodoAction): TodoState {
      switch (action.type) {
        case 'loadStart':
          return { status: 'loading', todos: [] };
        case 'loadSuccess':
          return { status: 'success', todos: action.payload };
        case 'loadError':
          return {
            status: 'error',
            todos: [],
            error: action.payload.error,
            requestId: action.payload.requestId,
          };

        case 'addOptimistic': {
          if (state.status !== 'success') return state;
          const { tempId, text, createdAt } = action.payload;
          const optimistic: TodoEntry = {
            id: tempId,
            text,
            completed: false,
            createdAt,
            pending: true,
          };
          return { ...state, todos: [...state.todos, optimistic] };
        }

        case 'addReconcile': {
          if (state.status !== 'success') return state;
          const { tempId, todo } = action.payload;
          const idx = state.todos.findIndex((t) => t.id === tempId);
          if (idx === -1) return state;
          const next = state.todos.slice();
          next[idx] = todo; // server `Todo` — `pending` flag absent by definition
          return { ...state, todos: next };
        }

        case 'addFailed': {
          if (state.status !== 'success') return state;
          const { tempId } = action.payload;
          const next = state.todos.filter((t) => t.id !== tempId);
          if (next.length === state.todos.length) return state; // unknown id → no-op
          return { ...state, todos: next };
        }

        case 'toggleOptimistic': {
          if (state.status !== 'success') return state;
          const { id, completed } = action.payload;
          const idx = state.todos.findIndex((t) => t.id === id);
          if (idx === -1) return state;
          const target = state.todos[idx]!;
          if (target.completed === completed) return state; // no-op if same
          const next = state.todos.slice();
          next[idx] = { ...target, completed };
          return { ...state, todos: next };
        }

        case 'toggleFailed': {
          if (state.status !== 'success') return state;
          const { id, previousCompleted } = action.payload;
          const idx = state.todos.findIndex((t) => t.id === id);
          if (idx === -1) return state;
          const target = state.todos[idx]!;
          if (target.completed === previousCompleted) return state; // already reverted
          const next = state.todos.slice();
          next[idx] = { ...target, completed: previousCompleted };
          return { ...state, todos: next };
        }

        case 'deleteOptimistic': {
          if (state.status !== 'success') return state;
          const { id } = action.payload;
          const next = state.todos.filter((t) => t.id !== id);
          if (next.length === state.todos.length) return state; // unknown id → no-op
          return { ...state, todos: next };
        }

        case 'deleteFailed': {
          if (state.status !== 'success') return state;
          const { todo, index } = action.payload;
          // Defensive bounds check — `index` came from caller's stashed pre-delete
          // findIndex; if state has shrunk further (concurrent deletes), clamp.
          const clamped = Math.max(0, Math.min(index, state.todos.length));
          const next = state.todos.slice();
          next.splice(clamped, 0, todo);
          return { ...state, todos: next };
        }

        default: {
          // Compile-time exhaustiveness: adding a TodoAction member without a
          // case narrows `action` away from `never` here and fails
          // `tsc --noEmit`. Mirrors the existing pattern.
          const _exhaustive: never = action;
          void _exhaustive;
          return state;
        }
      }
    }
    ```

  - [ ] **Why `if (state.status !== 'success') return state;` at the top of every optimistic case** — AC #11 mandates no-op behavior outside the `success` state. Centralising the guard inside each case (rather than a shared helper) keeps the discriminated-union narrowing clean and makes each case self-contained. The architecture's "mutations apply optimistically" rule ([architecture.md:248](../../_bmad-output/planning-artifacts/architecture.md#L248)) implicitly assumes the success state.
  - [ ] **Why return `state` (the same reference) on no-ops** — AC #12 explicitly tests this: when nothing changes, return the input reference so React's `useReducer` short-circuits the re-render. Returning a fresh object (`{ ...state }`) on every dispatch would force a re-render even when nothing visually changed — regressing toward the kind of waste optimistic UI is meant to avoid.
  - [ ] **Why `state.todos.slice()` then mutate by index (rather than `map`)** — `Array.prototype.slice()` is O(n) once for the copy; the index mutation is O(1). `map` is O(n) plus O(n) per element callback overhead. For up-to-thousands-of-todos lists, the slice-then-index pattern is the cheaper idiom and matches React's "shallow new reference" requirement.
  - [ ] **Why `next.splice(clamped, 0, todo)` in `deleteFailed`** — `splice` is the standard "insert at index" idiom on a fresh array copy. The `clamped` bound is defensive: if the caller's stashed index becomes out-of-bounds (e.g., concurrent deletes shrunk the list), clamping to `[0, state.todos.length]` ensures the insertion succeeds without throwing. The architecture says mutations are non-blocking ([architecture.md:248](../../_bmad-output/planning-artifacts/architecture.md#L248)); we trust the caller's index but don't trust the world to hold still.
  - [ ] **Why "no-op when target's `completed` already matches"** — `toggleOptimistic({ id, completed: true })` on a row that is already `true` should not trigger a re-render. Same logic for `toggleFailed` on a row already reverted. Defensive against double-dispatch from rapid clicks.
  - [ ] **Why a no-op on unknown `id` / `tempId`** — race window: a reconcile/fail for a row that's already been removed by a separate delete should not throw or push a new entry. Returning the same state reference is the safest correctness-preserving behavior.
  - [ ] **Why NO `Date.now()`, `crypto.randomUUID()`, or `console.*` in the reducer** — AC #10 mandates pure-function behavior. All entropy (uuid, timestamp, prior boolean, prior index) MUST arrive via the action payload. Story 2.5/2.6/2.7 components will generate these and dispatch.
  - [ ] **Watch-out:** Do NOT replace `findIndex` + `slice()[idx] = ...` with `state.todos.map(t => t.id === id ? {...} : t)`. Both work, but `map` is wasteful here (we know there's exactly one match) and the code-style precedent in the architecture pattern examples favors the explicit `slice + index` for in-place updates.
  - [ ] **Watch-out:** Do NOT use `Object.assign` or spread the action payload directly into the entry — be explicit. Spreading `{ ...action.payload }` into a `TodoEntry` would silently merge stray fields if the payload type ever drifts.
  - [ ] **Watch-out:** Do NOT compute `index` server-side or via the reducer. AC #8 mandates the caller stash `index` before delete; the reducer's input is the source of truth for re-insertion position.

- [ ] **Task 3: Extend reducer.test.ts with comprehensive coverage (AC: #2–#8, #10, #11, #12)**
  - [ ] Edit [apps/web/src/lib/reducer.test.ts](../../apps/web/src/lib/reducer.test.ts) — append new `describe` blocks after the existing `reducer` describe. Suggested structure:

    ```ts
    import { describe, expect, it } from 'vitest';
    import type { Todo } from '@todo-app/shared';
    import { initialState, reducer, type TodoAction, type TodoEntry, type TodoState } from './reducer';

    // Helper: build a server-shape Todo for tests
    const todo = (over: Partial<Todo> = {}): Todo => ({
      id: '11111111-1111-4111-8111-111111111111',
      text: 'sample',
      completed: false,
      createdAt: '2026-04-29T00:00:00.000Z',
      ...over,
    });

    const successState = (todos: TodoEntry[]): TodoState => ({ status: 'success', todos });

    describe('reducer (optimistic mutations)', () => {
      describe('addOptimistic', () => {
        it('appends a TodoEntry with pending: true and the supplied tempId/text/createdAt', () => {
          const next = reducer(successState([]), {
            type: 'addOptimistic',
            payload: { tempId: 't-1', text: 'milk', createdAt: '2026-04-29T12:00:00.000Z' },
          });
          expect(next.todos).toEqual([
            {
              id: 't-1',
              text: 'milk',
              completed: false,
              createdAt: '2026-04-29T12:00:00.000Z',
              pending: true,
            },
          ]);
          expect(next.status).toBe('success');
        });

        it('appends to the END of the todos array (chronological, oldest-first)', () => {
          const existing: TodoEntry = todo({ id: 'a', text: 'first' });
          const next = reducer(successState([existing]), {
            type: 'addOptimistic',
            payload: { tempId: 't-1', text: 'milk', createdAt: '2026-04-29T12:00:00.000Z' },
          });
          expect(next.todos).toHaveLength(2);
          expect(next.todos[0]).toBe(existing); // existing reference preserved
          expect(next.todos[1]!.id).toBe('t-1');
        });

        it('is a no-op when state.status is not success', () => {
          const loading: TodoState = { status: 'loading', todos: [] };
          const next = reducer(loading, {
            type: 'addOptimistic',
            payload: { tempId: 't-1', text: 'milk', createdAt: '2026-04-29T12:00:00.000Z' },
          });
          expect(next).toBe(loading); // SAME reference — no spurious re-render
        });
      });

      describe('addReconcile', () => {
        it('replaces the tempId entry with the server todo, in place', () => {
          const optimistic: TodoEntry = {
            id: 't-1',
            text: 'milk',
            completed: false,
            createdAt: '2026-04-29T12:00:00.000Z',
            pending: true,
          };
          const other: TodoEntry = todo({ id: 'a', text: 'before' });
          const serverTodo = todo({ id: 's-99', text: 'milk', createdAt: '2026-04-29T12:00:01.000Z' });
          const next = reducer(successState([other, optimistic]), {
            type: 'addReconcile',
            payload: { tempId: 't-1', todo: serverTodo },
          });
          expect(next.todos).toHaveLength(2);
          expect(next.todos[0]).toBe(other); // unchanged reference
          expect(next.todos[1]).toBe(serverTodo); // server todo by reference
        });

        it('reconciled entry has NO `pending` flag (key absent or undefined)', () => {
          const optimistic: TodoEntry = {
            id: 't-1',
            text: 'milk',
            completed: false,
            createdAt: '2026-04-29T12:00:00.000Z',
            pending: true,
          };
          const serverTodo = todo({ id: 's-99', text: 'milk' });
          const next = reducer(successState([optimistic]), {
            type: 'addReconcile',
            payload: { tempId: 't-1', todo: serverTodo },
          });
          expect(next.todos[0]).not.toHaveProperty('pending'); // strict absence
        });

        it('is a no-op when tempId is not found', () => {
          const state = successState([todo({ id: 'a' })]);
          const next = reducer(state, {
            type: 'addReconcile',
            payload: { tempId: 'unknown', todo: todo({ id: 's-99' }) },
          });
          expect(next).toBe(state);
        });
      });

      describe('addFailed', () => {
        it('removes the tempId entry from state', () => {
          const optimistic: TodoEntry = {
            id: 't-1',
            text: 'milk',
            completed: false,
            createdAt: '2026-04-29T12:00:00.000Z',
            pending: true,
          };
          const other: TodoEntry = todo({ id: 'a' });
          const next = reducer(successState([other, optimistic]), {
            type: 'addFailed',
            payload: { tempId: 't-1' },
          });
          expect(next.todos).toEqual([other]);
        });

        it('is a no-op when tempId is not found', () => {
          const state = successState([todo({ id: 'a' })]);
          const next = reducer(state, { type: 'addFailed', payload: { tempId: 'unknown' } });
          expect(next).toBe(state);
        });
      });

      describe('toggleOptimistic / toggleFailed', () => {
        it('toggleOptimistic flips completed and leaves other todos untouched', () => {
          const a: TodoEntry = todo({ id: 'a', completed: false });
          const b: TodoEntry = todo({ id: 'b', completed: false });
          const next = reducer(successState([a, b]), {
            type: 'toggleOptimistic',
            payload: { id: 'a', completed: true },
          });
          expect(next.todos[0]!.completed).toBe(true);
          expect(next.todos[1]).toBe(b); // unchanged reference
        });

        it('toggleFailed reverts to previousCompleted', () => {
          const a: TodoEntry = todo({ id: 'a', completed: true });
          const next = reducer(successState([a]), {
            type: 'toggleFailed',
            payload: { id: 'a', previousCompleted: false },
          });
          expect(next.todos[0]!.completed).toBe(false);
        });

        it('toggleOptimistic is a no-op when target is already at the requested value', () => {
          const a: TodoEntry = todo({ id: 'a', completed: true });
          const state = successState([a]);
          const next = reducer(state, {
            type: 'toggleOptimistic',
            payload: { id: 'a', completed: true },
          });
          expect(next).toBe(state); // SAME reference
        });

        it('toggle actions are no-ops when id is not found', () => {
          const state = successState([todo({ id: 'a' })]);
          expect(reducer(state, { type: 'toggleOptimistic', payload: { id: 'x', completed: true } })).toBe(state);
          expect(reducer(state, { type: 'toggleFailed', payload: { id: 'x', previousCompleted: false } })).toBe(state);
        });
      });

      describe('deleteOptimistic / deleteFailed', () => {
        it('deleteOptimistic removes the matching entry; others remain', () => {
          const a: TodoEntry = todo({ id: 'a' });
          const b: TodoEntry = todo({ id: 'b' });
          const c: TodoEntry = todo({ id: 'c' });
          const next = reducer(successState([a, b, c]), {
            type: 'deleteOptimistic',
            payload: { id: 'b' },
          });
          expect(next.todos).toEqual([a, c]);
        });

        it('deleteFailed re-inserts the stashed todo at the original index', () => {
          const a: TodoEntry = todo({ id: 'a' });
          const c: TodoEntry = todo({ id: 'c' });
          const stashed: Todo = todo({ id: 'b', text: 'restored' });
          const next = reducer(successState([a, c]), {
            type: 'deleteFailed',
            payload: { todo: stashed, index: 1 },
          });
          expect(next.todos).toEqual([a, stashed, c]);
          expect(next.todos[1]).toBe(stashed); // exact reference (no clone)
        });

        it('deleteFailed clamps index when out of bounds (defensive against concurrent deletes)', () => {
          const a: TodoEntry = todo({ id: 'a' });
          const stashed: Todo = todo({ id: 'b' });
          const next = reducer(successState([a]), {
            type: 'deleteFailed',
            payload: { todo: stashed, index: 99 }, // way out of bounds
          });
          expect(next.todos).toEqual([a, stashed]); // appended at end (clamped)
        });

        it('deleteOptimistic is a no-op when id is not found', () => {
          const state = successState([todo({ id: 'a' })]);
          expect(reducer(state, { type: 'deleteOptimistic', payload: { id: 'x' } })).toBe(state);
        });
      });

      describe('non-success state guard (AC #11)', () => {
        it.each(['idle', 'loading', 'error'] as const)(
          'all seven optimistic actions are no-ops when status === "%s"',
          (status) => {
            const state: TodoState = { status, todos: [] };
            const actions: TodoAction[] = [
              { type: 'addOptimistic', payload: { tempId: 't', text: 'x', createdAt: '2026-04-29T00:00:00.000Z' } },
              { type: 'addReconcile', payload: { tempId: 't', todo: todo() } },
              { type: 'addFailed', payload: { tempId: 't' } },
              { type: 'toggleOptimistic', payload: { id: 'x', completed: true } },
              { type: 'toggleFailed', payload: { id: 'x', previousCompleted: false } },
              { type: 'deleteOptimistic', payload: { id: 'x' } },
              { type: 'deleteFailed', payload: { todo: todo(), index: 0 } },
            ];
            for (const action of actions) {
              expect(reducer(state, action)).toBe(state); // SAME reference
            }
          },
        );
      });

      describe('shape parity (AC #2 wording: "visually indistinguishable except for pending")', () => {
        it('addReconcile produces an entry structurally identical to a server-loaded Todo', () => {
          const serverTodo = todo({ id: 's-99', text: 'milk', completed: false });
          // Path 1: added optimistically, then reconciled
          let s = successState([]);
          s = reducer(s, {
            type: 'addOptimistic',
            payload: { tempId: 't-1', text: 'milk', createdAt: '2026-04-29T00:00:00.000Z' },
          });
          s = reducer(s, { type: 'addReconcile', payload: { tempId: 't-1', todo: serverTodo } });
          // Path 2: loaded fresh from the server
          const loaded = reducer(successState([]), {
            type: 'loadSuccess',
            payload: [serverTodo],
          });
          // Both paths produce equivalent entries (Todo with no `pending` flag).
          expect(s.todos[0]).toEqual(loaded.todos[0]);
          expect(s.todos[0]).not.toHaveProperty('pending');
          expect(loaded.todos[0]).not.toHaveProperty('pending');
        });
      });
    });
    ```

  - [ ] **Why `toBe` (reference equality) on no-op cases** — `toEqual` compares structurally, so `{ ...state }` would still pass. Reference equality (`toBe`) catches the silent regression where someone accidentally clones state on a no-op.
  - [ ] **Why `not.toHaveProperty('pending')` (not `toBe(undefined)`)** — AC #3 demands the flag is *absent*, not *set to undefined*. `expect(x.pending).toBe(undefined)` passes for both cases; `expect(x).not.toHaveProperty('pending')` only passes when the key isn't on the object. This pins the AC's specific wording.
  - [ ] **Why `it.each([...])` for AC #11** — three statuses × seven actions = 21 assertions. A parameterised test is more readable than nested loops and produces 21 named subtests in the Vitest reporter.
  - [ ] **Why a "shape parity" test (AC #12)** — proves the contract explicitly: a reconciled todo from the optimistic path is structurally equal to a load-success todo. This is the integration point Story 2.5+ relies on (TodoItem can be ignorant of `pending` and still render correctly).
  - [ ] **Watch-out:** Use the `todo(over)` helper to keep test setup compact. Inlining the four-field literal in every test bloats the file and makes diffs noisy.
  - [ ] **Watch-out:** Do NOT test internal implementation (e.g., "uses splice"). Tests assert behavior — input state + action → output state. The slice/splice choice can change without touching tests.

- [ ] **Task 4: Sanity gates**
  - [ ] `npm run lint` — must report 0 warnings, 0 errors.
  - [ ] `npm run typecheck` — must report 0 errors. The exhaustiveness pin (`_exhaustive: never`) at [reducer.ts:38](../../apps/web/src/lib/reducer.ts#L38) MUST cover all ten variants; if it doesn't, TypeScript will report `Type '...' is not assignable to type 'never'` and Task 4 fails.
  - [ ] `npm run test` — runs unit tests across all workspaces. Must pass. Web tests should jump from 19 → ~38 (existing 5 + ~24 new in `reducer.test.ts`).
  - [ ] **Test the exhaustiveness guard locally** — temporarily comment out one of the seven new `case` blocks; `npm run typecheck --workspace apps/web` must fail with a `never` mismatch. Restore the case before declaring Task 4 done.
  - [ ] No new lint/typecheck rules required.

- [ ] **Task 5: Commit**
  - [ ] Stage exactly:
    - **Modified:** [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts), [apps/web/src/lib/reducer.test.ts](../../apps/web/src/lib/reducer.test.ts).
  - [ ] Commit message: `feat(web): reducer optimistic mutation actions (Story 2.4)`
  - [ ] **Do NOT** stage anything in `_bmad-output/`, `node_modules/`, `.env*`, `apps/api/**`, or `apps/web/src/components/**` (Story 2.4 is reducer-only; UI wiring lives in Stories 2.5–2.7).
  - [ ] Record commit hash in the Change Log when the user runs the commit.

## Dev Notes

### Where this story sits

Story 2.4 is the first web-side story of Epic 2 (Todo Core Loop). Stories 2.1–2.3 shipped the API surface (POST, PATCH, DELETE). Story 2.4 ships the reducer logic that future Stories 2.5 (TodoInput create), 2.6 (Radix Checkbox toggle), and 2.7 (delete button) will dispatch into.

After this story:

- The reducer has all ten action handlers (3 load + 7 optimistic).
- `state.todos` is `TodoEntry[]` — a `Todo & { pending?: boolean }` widening.
- `<TodoItem>` and `<TodoList>` are unchanged — they continue to receive `Todo`-compatible entries. Story 2.6+ will branch on `pending` to render a spinner/dim styling.
- 24-ish new reducer tests prove pure-function semantics, exhaustive coverage, and reference preservation on no-ops.

This story does NOT touch:

- The API (Stories 2.1–2.3 closed it).
- `apps/web/src/lib/api.ts` — Story 2.5 adds `createTodo`, Story 2.6 adds `toggleTodo`, Story 2.7 adds `deleteTodo`.
- Any component file — Story 2.5+ wires components to dispatch the new actions.
- Toast UI — Story 3.2 owns it.
- Input preservation on add failure — Story 3.3 owns FR19.

### Critical architectural guardrails

1. **The reducer is pure.** [architecture.md:248](../../_bmad-output/planning-artifacts/architecture.md#L248) ("optimistic actions apply locally with a temp UUID and `pending: true` flag"). The "temp UUID" is generated by the caller, not the reducer. AC #10 makes this explicit.
2. **Reference equality on no-ops.** React's `useReducer` short-circuits re-renders when the new state is `===` the previous state. Returning `{ ...state }` on every dispatch defeats this and causes spurious renders.
3. **Exhaustive switch.** The existing `_exhaustive: never` pattern at [reducer.ts:38](../../apps/web/src/lib/reducer.ts#L38) MUST cover all ten variants after this story. Story 1.8 established this pattern; do not deviate.
4. **No `console.*` in the reducer.** `console.warn`/`console.error` are side effects. The architecture says "Toast renders the user-facing message" ([architecture.md:408](../../_bmad-output/planning-artifacts/architecture.md#L408)) — error surfacing is the component's responsibility, not the reducer's.
5. **No `pending: false` field.** AC #3 mandates the flag is *absent* on reconciled entries, not set to `false`. The semantic distinction is "in-flight (truthy)" vs "server-confirmed (key not present)". A `false` flag would be ambiguous.
6. **Caller stashes entropy before dispatching.** The reducer cannot regenerate UUIDs, timestamps, or prior boolean values. Stories 2.5–2.7 will:
   - Stash a UUID via `crypto.randomUUID()` BEFORE dispatching `addOptimistic`.
   - Stash `previousCompleted` BEFORE dispatching `toggleOptimistic`.
   - Stash `index` (from `findIndex`) BEFORE dispatching `deleteOptimistic`.
7. **Optimistic actions only operate on `success` state.** AC #11 mandates no-op behavior outside `success`. This is the architecture's "mutations apply optimistically" rule ([architecture.md:248](../../_bmad-output/planning-artifacts/architecture.md#L248)) — mutations only make sense after the initial load completes.
8. **`TodoEntry` is reducer-internal.** The `pending` flag never crosses the wire (`TodoSchema` in `packages/shared` is `.strict()` and explicitly does NOT include it). Only the in-memory reducer state and components rendering from it observe the flag.

### Why a discriminated union (and not a state machine library)

The architecture explicitly chose hand-rolled `useReducer` over libraries like Zustand, Redux Toolkit, or XState ([architecture.md:178](../../_bmad-output/planning-artifacts/architecture.md#L178) — "Frontend state: React `useReducer` with hand-rolled optimistic updates and rollback"). The reasoning:

- The state space is tiny (one list + one status).
- Discriminated unions + exhaustive switch + TS strict mode give type-level state-machine guarantees without runtime overhead.
- Bundle budget: ≤200 KB gzipped initial JS (NFR4). State libraries add 5-50 KB. We can't afford it.

### Why `pending: true` (not a separate `pendingTempIds: Set<string>`)

Three options were considered:

1. **Inline flag (chosen):** `TodoEntry = Todo & { pending?: boolean }`.
2. **Separate set:** `state.pendingIds: Set<string>` plus `state.todos: Todo[]`.
3. **Branded subtype:** `OptimisticTodo = Todo & { __brand: 'optimistic' }`.

Option 1 wins because:

- Components rendering a list iterate `state.todos` once and branch on `entry.pending` per item. Option 2 forces a join (`pendingIds.has(t.id)`) for every item — O(n) anyway, but two data structures to keep in sync.
- AC #2's exact JSON shape demands `pending: true` IN the entry, not in a sidecar.
- Option 3's brand is over-engineered for a transient flag.

### Why caller-stashed entropy

This is a reducer-design decision worth calling out explicitly. The caller pattern in Stories 2.5–2.7 will look like:

```ts
// In TodoApp.tsx (Story 2.5):
const tempId = crypto.randomUUID();
const createdAt = new Date().toISOString();
dispatch({ type: 'addOptimistic', payload: { tempId, text, createdAt } });
api.createTodo(text).then(
  (todo) => dispatch({ type: 'addReconcile', payload: { tempId, todo } }),
  () => dispatch({ type: 'addFailed', payload: { tempId } }),
);

// In TodoItem.tsx (Story 2.6):
const previousCompleted = todo.completed;
dispatch({ type: 'toggleOptimistic', payload: { id: todo.id, completed: !previousCompleted } });
api.toggleTodo(todo.id, !previousCompleted).catch(() => {
  dispatch({ type: 'toggleFailed', payload: { id: todo.id, previousCompleted } });
});

// In TodoItem.tsx (Story 2.7):
const index = state.todos.findIndex((t) => t.id === id);
dispatch({ type: 'deleteOptimistic', payload: { id } });
api.deleteTodo(id).catch(() => {
  dispatch({ type: 'deleteFailed', payload: { todo, index } });
});
```

If the reducer generated UUIDs/timestamps itself, it would be impure (failing AC #10) and untestable without monkey-patching `crypto` and `Date`. Pushing entropy to the caller keeps the reducer a math function.

### Why no `errorDismiss` action in this story

The architecture's reducer-action list ([architecture.md:248](../../_bmad-output/planning-artifacts/architecture.md#L248)) includes `errorDismiss`. That action is in the architecture as a long-term plan, but it's NOT in Epic 2's scope — Story 3.1 (Toast infrastructure) introduces it alongside the dismissable toast. Story 2.4 ships exactly the seven optimistic actions the AC enumerates; adding `errorDismiss` here would be premature.

### Why no `loadStart`/`loadSuccess`/`loadError` changes

Those three actions exist (Story 1.8) and are not modified by this story. They live alongside the new seven and continue to handle the initial-fetch flow exactly as today.

### What changes in the codebase

| File | Change | LOC delta (approx.) |
|------|--------|---------------------|
| [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts) | Add `TodoEntry` type; widen `TodoState['todos']`; add 7 actions to `TodoAction` union; add 7 case blocks (each with `if (state.status !== 'success') return state;` guard) | +75 / -2 |
| [apps/web/src/lib/reducer.test.ts](../../apps/web/src/lib/reducer.test.ts) | Add ~20 new tests across 6 `describe` blocks (per-action + non-success guard + shape parity) | +200 / -0 |

Total: ~+275 added LOC across 2 files. No new files. No new dependencies.

### Out-of-scope (do NOT do in this story)

- `apps/web/src/lib/api.ts` `createTodo`/`toggleTodo`/`deleteTodo` wrappers — Stories 2.5/2.6/2.7.
- `apps/web/src/components/TodoInput.tsx` — Story 2.5 (NEW component).
- Modifying `<TodoApp>` to dispatch new actions — Stories 2.5/2.6/2.7.
- Modifying `<TodoItem>` to render `pending` styling — Stories 2.5/2.6/2.7.
- Toast UI — Story 3.2.
- Input preservation (FR19) — Story 3.3.
- `errorDismiss` action — Story 3.1.
- Concurrency/conflict resolution UI — never (architecture cuts it from v1).
- Undo/redo — never.
- Drag-to-reorder — never.

### Project Structure Notes

The change is two-files-only inside `apps/web/src/lib/`:

```text
apps/web/
└── src/
    └── lib/
        ├── reducer.ts        # ← extended with TodoEntry + 7 actions + 7 case blocks
        └── reducer.test.ts   # ← extended with ~20 new tests
```

No new files, no new directories, no migration. The architecture's "non-component files: `camelCase.ts`" rule ([architecture.md:339](../../_bmad-output/planning-artifacts/architecture.md#L339)) is satisfied (`reducer.ts` already follows it).

### Testing Requirements

- **Unit tests:** mandatory in `reducer.test.ts` covering all seven new actions plus AC #11 (non-success guard), AC #2 (shape parity), and reference-equality on no-ops. Run via `npm run test --workspace apps/web` (Vitest).
- **Integration tests:** none in this story. Story 2.5+ will add component-level integration tests (React Testing Library) that exercise the dispatch flow end-to-end.
- **E2E tests:** none in this story. Epic 3 adds journey-level resilience tests.
- **Test runner:** Vitest (already wired in Story 1.8).
- **Coverage gate:** none in v1.
- **Test isolation:** each test constructs its own state via the `todo(over)` helper. No shared module-level state.

### Library / version pins (April 2026)

These are already installed and pinned by Story 1.7 / 1.8; do NOT bump them in this story:

- `react@^19.x`, `react-dom@^19.x`
- `next@^16.x` (CSR-only via `'use client'` on `TodoApp`)
- `vitest@^2.x`, `@testing-library/react@^16.x`, `@testing-library/jest-dom@^6.x`, `jsdom@^25.x`
- `@todo-app/shared` (workspace dep) — `Todo` and `TodoSchema` types
- `typescript@~5.9.x`

### Story 1.8 patterns to mirror (verbatim, where applicable)

The following patterns established by Story 1.8 ([1-8-typed-api-client-error-types-and-load-reducer.md](./1-8-typed-api-client-error-types-and-load-reducer.md)) are the canonical templates for this story:

- **Discriminated union with `type` field** — every action declares `type: 'X'`.
- **`payload` envelope on all actions that carry data** — even single-field payloads use `payload: { ... }` for consistency.
- **`_exhaustive: never` guard in the `default` case** — already in place at [reducer.ts:38](../../apps/web/src/lib/reducer.ts#L38). Extend, do not duplicate.
- **`it('idle → loadStart → loading with empty todos', ...)` test naming** — describes the transition arrow. The new tests should follow the same `'state X → action Y → result Z'` shape where applicable.
- **`reducer.test.ts` co-located with `reducer.ts`** — no separate `__tests__/` folder.

Story 2.3 review yielded two deferred items in [deferred-work.md](./deferred-work.md). Neither applies to Story 2.4 (both are API-side: 204 header assertions, integration-test row-presence preconditions).

### References

- **Architecture:**
  - State management choice: [architecture.md:178](../../_bmad-output/planning-artifacts/architecture.md#L178) ("React `useReducer` with hand-rolled optimistic updates and rollback").
  - Reducer action list: [architecture.md:248](../../_bmad-output/planning-artifacts/architecture.md#L248) (the canonical roll-call: `loadSuccess | loadError | addOptimistic | addReconcile | addFailed | toggleOptimistic | toggleFailed | deleteOptimistic | deleteFailed | errorDismiss`).
  - Naming convention: [architecture.md:387](../../_bmad-output/planning-artifacts/architecture.md#L387) (`{intent}Optimistic` / `{intent}Reconcile` / `{intent}Failed`).
  - Shape: [architecture.md:388](../../_bmad-output/planning-artifacts/architecture.md#L388) (`{ type, payload }`, discriminated union, exhaustive switch).
  - Loading-state rule: [architecture.md:413](../../_bmad-output/planning-artifacts/architecture.md#L413) ("Mutations do not introduce separate loading flags — they apply optimistically").
  - Bundle budget: [architecture.md:266](../../_bmad-output/planning-artifacts/architecture.md#L266) (≤200 KB gzipped initial JS).
- **PRD:**
  - FR1 (instantaneous response): [prd.md:217](../../_bmad-output/planning-artifacts/prd.md#L217) (cross-references this reducer).
  - FR17–FR21 (feedback & error handling): [prd.md:303-307](../../_bmad-output/planning-artifacts/prd.md#L303-L307).
  - NFR1 (≤100 ms perceived UI): [prd.md:331](../../_bmad-output/planning-artifacts/prd.md#L331).
- **Epics:**
  - Story 2.4 full text: [epics.md:824-874](../../_bmad-output/planning-artifacts/epics.md#L824-L874).
  - Story 2.5 cross-dependency (TodoInput create flow): [epics.md:876-919](../../_bmad-output/planning-artifacts/epics.md#L876-L919).
- **Prior stories (patterns to mirror):**
  - Story 1.8 (typed api client + load reducer): [_bmad-output/implementation-artifacts/1-8-typed-api-client-error-types-and-load-reducer.md](./1-8-typed-api-client-error-types-and-load-reducer.md). Established the reducer foundation, exhaustiveness pattern, and `LoadStatus` type.
  - Story 1.9 (TodoList rendering): [_bmad-output/implementation-artifacts/1-9-render-list-states-loading-empty-populated-read-only.md](./1-9-render-list-states-loading-empty-populated-read-only.md). Establishes how `state.todos` flows into rendering — Story 2.4's widening must not break the assumptions there.
- **Source files (current state):**
  - [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts) — extend; existing exhaustiveness guard at line 38.
  - [apps/web/src/lib/reducer.test.ts](../../apps/web/src/lib/reducer.test.ts) — extend; existing pattern follows `state X → action Y → result Z` test names.
  - [packages/shared/src/contracts.ts](../../packages/shared/src/contracts.ts) — `Todo` type (line 41). Do NOT modify.
  - [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) — calls `useReducer(reducer, initialState)`. No change needed in this story; widening `state.todos` to `TodoEntry[]` is contravariant-safe.
  - [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx) — receives `state: TodoState`. No change needed.
  - [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx) — receives `todo: Todo`. No change needed (Story 2.6+ widens to `TodoEntry` for `pending` rendering).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context) — `/bmad-create-story` workflow.

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date       | Change                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-04-29 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Story slot: Epic 2, Story 4 (first web-side story; reducer extensions for optimistic mutations; follows API stories 2.1–2.3, precedes UI wiring stories 2.5–2.7). |
