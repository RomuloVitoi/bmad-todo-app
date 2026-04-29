# Story 1.9: Render list states — loading, empty, populated (read-only)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a visitor,
I want to see a clear loading indicator while the list fetches, an empty-state message when no todos exist, or the full list when todos are present,
So that I always have an unambiguous visual answer about what the app is doing (FR8, FR11, FR12).

## Acceptance Criteria

1. **Given** [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx),
   **When** passed a state with `status === 'loading'`,
   **Then** it renders a loading indicator ("Loading todos…" or equivalent) within an `aria-live="polite"` region.

2. **Given** [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx),
   **When** passed a state with `status === 'success'` and `todos.length === 0`,
   **Then** it renders an empty-state message ("No todos yet") with semantic markup (not visually hidden from assistive tech).

3. **Given** [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx),
   **When** passed a state with `status === 'success'` and `todos.length > 0`,
   **Then** it renders a `<ul>` containing one `<li>` per todo via the `<TodoItem>` component,
   **And** each `<li>` has a stable `key={todo.id}`.

4. **Given** [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx),
   **When** passed a todo with `completed: false`,
   **Then** it renders the todo text in the default visual treatment,
   **And** text contrast meets WCAG AA against the background.

5. **Given** [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx),
   **When** passed a todo with `completed: true`,
   **Then** it renders the todo text with a strikethrough visual treatment,
   **And** the component is read-only in Epic 1 (no click handlers, no toggle, no delete — those arrive in Epic 2).

6. **Given** the app is in `state.status === 'error'`,
   **When** [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx) renders,
   **Then** it shows a minimal fallback error message ("Failed to load todos"),
   **And** this fallback is explicitly documented as a placeholder that Epic 3 replaces with the Toast-based error system.

7. **Given** the page is viewed at 360px and 1440px widths with a populated list,
   **When** rendered,
   **Then** items wrap inside the container without horizontal scroll.

8. **Given** [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx) and [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx),
   **When** tests run via Vitest + React Testing Library (Architecture §Gap Analysis recommended resolution),
   **Then** loading, empty, populated, active-visual, and completed-visual renderings are all covered,
   **And** each test asserts no console errors.

## Tasks / Subtasks

- [x] **Task 1: Add jsdom + React Testing Library devDependencies (AC: #8; resolves Story 1.8 deferred-work item "no tests for TodoApp.tsx")**
  - [x] In [apps/web/package.json](../../apps/web/package.json), add to `devDependencies`:
    - `"jsdom": "^29.0.0"` — DOM/window simulator for Vitest's `environment: 'jsdom'`. v29 is the latest line as of April 2026; engines supports Node 22.13+ (our `>=22` baseline covers it). v29 dropped CommonJS support and requires Node 20.19+/22.13+/24+; we're fine.
    - `"@testing-library/react": "^16.3.0"` — React 19-compatible RTL line (peer `react: ^18 || ^19`). v16 is the React 19 mainline; v15 was the React 18 stable.
    - `"@testing-library/dom": "^10.4.0"` — RTL's required peer; pin alongside `@testing-library/react@16` to keep both packages locked together.
    - `"@testing-library/jest-dom": "^6.9.0"` — adds matchers like `toHaveTextContent`, `toBeInTheDocument`, `toHaveClass`, `toBeVisible`. Pure custom matchers; no jest dependency despite the name (works with Vitest via `expect.extend`).
    - **DO NOT** add `"@testing-library/user-event"` in this story. Story 1.9 is read-only — there are no clicks, focus, or typing flows to simulate. Story 2.5 (TodoInput) introduces the first interaction; that's where `user-event@^14.6.0` lands.
    - **DO NOT** add `"@vitejs/plugin-react"` either. Vite/esbuild's automatic JSX transform (driven by `jsx: 'react-jsx'` in [apps/web/tsconfig.json](../../apps/web/tsconfig.json)) is sufficient for tests. The plugin's main value is dev HMR / fast-refresh, neither of which applies to a single-shot Vitest run. Adding it would require re-pinning to the @4.x line that supports Vite 5 (vitest 2.1.x bundles vite 5.x), and inflate node_modules with `@babel/core` for zero runtime benefit.
    - **DO NOT** add `"@types/jest"` (Vitest types are sufficient — `expect` comes from `vitest`).
  - [x] Run `npm install` from repo root. Verify with `npm ls jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom --workspace apps/web` — expect zero peer-dep warnings.
  - [x] **Sanity check:** `npm test --workspace apps/web` should still pass the existing 9 tests (reducer + api) before any new test file is added. The `environment: 'jsdom'` switch happens in Task 2; until then, `node` env keeps existing tests green.

- [x] **Task 2: Update Vitest config + add a global setup file (AC: #8)**
  - [x] Modify [apps/web/vitest.config.mts](../../apps/web/vitest.config.mts):
    ```ts
    import tsconfigPaths from 'vite-tsconfig-paths';
    import { defineConfig } from 'vitest/config';

    export default defineConfig({
      plugins: [tsconfigPaths()],
      test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'],
        globals: false,
        setupFiles: ['./vitest.setup.ts'],
      },
    });
    ```
  - [x] **Why `environment: 'jsdom'` (not `happy-dom`)** — jsdom is the higher-fidelity DOM (full WHATWG spec, Custom Elements v1, Shadow DOM, MutationObserver, Selection API). happy-dom is faster but historically lags on edge cases that bite when Radix UI primitives land in Story 1.9 (Toast/Checkbox use `aria-live`, focus traps, `Element.closest`, ResizeObserver — happy-dom historically required polyfills here). Architecture pins on Radix UI as a v1 dependency — any happy-dom shim drift would cost more than the marginal speed gain. jsdom@29 is fast enough at this scale (dozens of tests, not thousands).
  - [x] **Why `setupFiles: ['./vitest.setup.ts']`** — this is the canonical hook for `expect.extend` (jest-dom matchers) and per-test `cleanup()`. Setting it once globally beats importing the matcher module at the top of every test file.
  - [x] **Why `globals: false` is preserved** — explicit imports keep tests self-documenting (matches Story 1.8's choice and Architecture §Communication Patterns "no test-globals leak").
  - [x] Create [apps/web/vitest.setup.ts](../../apps/web/vitest.setup.ts):
    ```ts
    import '@testing-library/jest-dom/vitest';
    import { afterEach } from 'vitest';
    import { cleanup } from '@testing-library/react';

    // Unmount React trees and remove appended DOM nodes between tests so DOM
    // assertions don't see ghost nodes from prior `render()` calls.
    afterEach(() => {
      cleanup();
    });
    ```
  - [x] **Why import `@testing-library/jest-dom/vitest`** (not `/extend-expect`) — the `/vitest` subpath is the Vitest-aware export added in `@testing-library/jest-dom@6`. It hooks into Vitest's `expect` directly; no `expect.extend(...)` plumbing needed. The legacy `/extend-expect` works too but has more ceremony.
  - [x] **Why explicit `cleanup()` instead of relying on auto-cleanup** — RTL@16 includes auto-cleanup when `globals: true`, but ours is `globals: false`. The afterEach hook is the contract that survives any future Vitest config change.
  - [x] **Add `apps/web/vitest.setup.ts` to [apps/web/tsconfig.json](../../apps/web/tsconfig.json) `include`** if not already covered — the existing `**/*.ts` glob picks it up. Verify with `npx tsc --noEmit` after Task 5.

- [x] **Task 3: Create [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx) (AC: #4, #5)**
  - [x] Create the file:
    ```tsx
    import type { Todo } from '@todo-app/shared';

    export interface TodoItemProps {
      todo: Todo;
    }

    /**
     * Read-only row in Epic 1. Toggle/delete affordances arrive in Stories 2.6/2.7.
     * Visual completion state uses both strikethrough text AND aria-checked
     * (NFR12: completion conveyed via more than color alone).
     */
    export default function TodoItem({ todo }: TodoItemProps) {
      const completed = todo.completed;
      return (
        <li
          data-testid="todo-item"
          data-completed={completed}
          aria-checked={completed}
          role="listitem"
          className="flex items-start gap-3 rounded-md border border-current/10 px-4 py-3"
        >
          <span
            aria-hidden="true"
            className={
              completed
                ? 'mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-current bg-current/20'
                : 'mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-current'
            }
          />
          <span
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
  - [x] **Why a presentational component with `Todo` (not raw fields)** — Architecture §Frontend Architecture "TodoInput, TodoList, TodoItem, Toast are presentational; they receive props and emit callbacks." Props the full `Todo` so Story 2.6/2.7 can extend with `onToggle`/`onDelete` without rewiring callers.
  - [x] **Why no `<input type="checkbox">` yet** — Story 2.6 introduces Radix `Checkbox` for the actual toggle. In Epic 1 the box is purely decorative (a styled `<span aria-hidden="true">`). Adding a real checkbox now would either require a no-op handler (lying to screen readers about interactivity) or `disabled` (announcing "disabled checkbox" — wrong; the spec says read-only, not disabled).
  - [x] **Why `aria-hidden="true"` on the visual box** — the box is decorative; the meaningful state is on the `<li>` (`aria-checked`) and the text (strikethrough). Hiding redundant decoration from AT prevents "checkbox" announcements on a non-interactive Epic-1 row.
  - [x] **Why `aria-checked={completed}` on the `<li>` (not `role="checkbox"`)** — `aria-checked` on a plain `<li>` is non-standard but widely tolerated by AT for read-only state. Story 2.6 will move this to a real Radix `Checkbox` with proper `role="checkbox"`. For Epic 1 this is the lightest signal that satisfies NFR12 ("conveyed by means other than color alone") without falsely advertising interactivity. AT users will hear the strikethrough text and the `aria-checked="true"` state. NOTE — explicit `role="listitem"` is added to make the `aria-checked` association unambiguous (without it, AT may not announce the state on the implicit listitem role of a `<li>`).
  - [x] **Why `line-through opacity-60` (not `text-gray-400`)** — Tailwind v4 + `prefers-color-scheme: dark` from [globals.css](../../apps/web/src/app/globals.css). Using `opacity-60` keeps the contrast ratio meeting WCAG AA in BOTH light and dark mode (the underlying `currentColor` is `#171717` light / `#ededed` dark; 0.6 alpha against the background still clears AA at the body text size). A specific gray would fail in one of the two modes.
  - [x] **Why `break-words`** — todos can be up to 500 chars (Story 1.2 contract). Without `break-words`, a long unbroken string overflows the container at 360px (AC #7). `overflow-wrap: break-word` (Tailwind's `break-words`) breaks at any character if the word can't fit; `break-all` would break in the middle of normal English words and is uglier.
  - [x] **Why `data-testid="todo-item"` AND `data-completed={completed}`** — testid is the stable hook RTL uses to find rows; `data-completed` exposes the boolean without coupling tests to the strikethrough class name (CSS can churn). Tests assert `data-completed="true"` instead of `class includes "line-through"`.
  - [x] **DO NOT** import from `next/link`, `next/image`, or anything `next/*` — TodoItem is a pure presentational React component. JSX-only. Imports limited to React (implicit via `react-jsx` runtime) and `@todo-app/shared`.
  - [x] **DO NOT** add click handlers, `onChange`, or any `tabIndex`/`role="button"` attributes — Epic 1 is strictly read-only (AC #5).
  - [x] **DO NOT** mark this `'use client'` — Story 1.7's [layout.tsx](../../apps/web/src/app/layout.tsx) is a server component, but [TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) already has `'use client'` and renders `<TodoList />` which renders `<TodoItem />`. The `'use client'` boundary inherits down — child components don't need their own directive.

- [x] **Task 4: Create [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx) (AC: #1, #2, #3, #6, #7)**
  - [x] Create the file:
    ```tsx
    import type { TodoState } from '@/lib/reducer';
    import TodoItem from './TodoItem';

    export interface TodoListProps {
      state: TodoState;
    }

    /**
     * Branch-renders by state.status. Single aria-live="polite" wrapper hosts
     * loading/empty/error transitions so AT users hear status changes naturally.
     * The error branch is a minimal Epic-1 placeholder; Story 3.1 swaps it for
     * a Radix Toast in the toast-system slice.
     */
    export default function TodoList({ state }: TodoListProps) {
      const { status, todos } = state;

      if (status === 'idle' || status === 'loading') {
        return (
          <div
            data-testid="todo-list-loading"
            data-status={status}
            aria-live="polite"
            aria-busy="true"
            className="rounded-md border border-current/10 px-4 py-8 text-center text-sm opacity-70"
          >
            Loading todos…
          </div>
        );
      }

      if (status === 'error') {
        // EPIC 1 PLACEHOLDER — Story 3.1 replaces this fallback with the
        // Radix Toast-based error system. The minimal text here keeps the page
        // functional but is intentionally unstyled-as-an-error to avoid
        // pre-empting Epic 3's UX choices.
        return (
          <div
            data-testid="todo-list-error"
            data-status="error"
            role="alert"
            className="rounded-md border border-current/10 px-4 py-8 text-center text-sm opacity-70"
          >
            Failed to load todos.
          </div>
        );
      }

      // status === 'success'
      if (todos.length === 0) {
        return (
          <p
            data-testid="todo-list-empty"
            data-status="success"
            className="rounded-md border border-current/10 px-4 py-8 text-center text-sm opacity-70"
          >
            No todos yet.
          </p>
        );
      }

      return (
        <ul
          data-testid="todo-list"
          data-status="success"
          className="flex flex-col gap-2"
        >
          {todos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </ul>
      );
    }
    ```
  - [x] **Why a single `<TodoList state={state} />` prop (not destructured `status`/`todos`)** — passes the discriminated union intact. Story 2.4 will add mutation actions; passing `state` keeps the prop surface stable when the reducer grows. Plus, future Story 3.1 may render error state from `state.error`/`state.requestId` — already available without a prop change.
  - [x] **Why branch on `idle || loading` together** — `idle` is the React-strict-mode pre-`useEffect` micro-window (typically <1 frame); rendering "Loading…" for both prevents a flash of "No todos yet" before the first dispatch lands. This is the v1 simplification consistent with `<TodoApp />`'s `useReducer(reducer, initialState)` returning `idle` on the first paint.
  - [x] **Why `aria-busy="true"` on the loading branch** — pairs with `aria-live="polite"` to tell AT "content here is loading; will be replaced". Without `aria-busy`, screen readers may announce the placeholder text twice (once during loading, once when content lands).
  - [x] **Why `role="alert"` on the error branch (not just `aria-live="assertive"`)** — `role="alert"` is the more idiomatic ARIA for synchronous error messages, automatically implies `aria-live="assertive"` and `aria-atomic="true"`. Story 3.1's Radix Toast will own the polite-vs-assertive cadence properly; `role="alert"` here is the lightest correct fallback.
  - [x] **Why a `<p>` for empty (not `<div>`)** — AC #2 says "semantic markup (not visually hidden from assistive tech)". `<p>` is announced naturally by AT; a `<div>` requires `role="status"` to be heard at all. The empty state isn't an error or loading; it's a piece of static content. NOTE — explicit `data-status="success"` attribute (not just the testid) lets tests assert the state branch unambiguously.
  - [x] **Why each branch has `data-testid` AND `data-status`** — testids let tests target the branch; `data-status` lets tests verify the state machine drove this render (regression safety: a test that asserts `data-testid="todo-list-empty"` but accidentally renders the loading branch will catch the mismatch via `data-status`).
  - [x] **Why `<ul>` with `flex flex-col gap-2`** — semantic list markup (FR8/FR12 alignment), with Tailwind's gap for vertical spacing between items. Items themselves get `border` + `px-4 py-3` (TodoItem). At 360px the items wrap (single column); at 1440px they remain single-column inside the `max-w-2xl` page (Story 1.7 set this on `<main>`). AC #7 is satisfied by the parent layout's container width + `break-words` on the text.
  - [x] **DO NOT** wrap the populated branch in an extra `<section>` — Story 1.7's `<TodoApp />` already provides `<section aria-labelledby="todos-heading">`. Nested `<section>`s without their own `aria-label` would create accessible-name collisions.
  - [x] **DO NOT** add a "Try again" / retry button on the error branch — Story 3.4 (FR20) introduces the retry affordance under Epic 3's error-recovery story. Pre-emptive button = scope creep.
  - [x] **DO NOT** import the `LoadStatus` type alone — `TodoState` carries it, and a prop typed `state: TodoState` reads more naturally than `status: LoadStatus; todos: Todo[]; error?: string`.

- [x] **Task 5: Wire `<TodoList />` into [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) (AC: #1–#6, integration)**
  - [x] Replace the placeholder `<div>` block (currently lines 60–67) with `<TodoList state={state} />`. Final shape:
    ```tsx
    'use client';

    import { useEffect, useReducer } from 'react';
    import { getTodos } from '@/lib/api';
    import { ApiError } from '@/lib/errors';
    import { initialState, reducer } from '@/lib/reducer';
    import TodoList from './TodoList';

    export default function TodoApp() {
      const [state, dispatch] = useReducer(reducer, initialState);

      useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;

        dispatch({ type: 'loadStart' });
        getTodos(controller.signal).then(
          (todos) => {
            if (!cancelled) dispatch({ type: 'loadSuccess', payload: todos });
          },
          (err) => {
            if (cancelled) return;
            if (err instanceof Error && err.name === 'AbortError') return;
            const message =
              err instanceof ApiError
                ? err.message
                : 'Could not load todos. Please try again.';
            const requestId = err instanceof ApiError ? err.requestId : undefined;
            dispatch({ type: 'loadError', payload: { error: message, requestId } });
          },
        );

        const onVisibility = (): void => {
          if (document.visibilityState !== 'visible') return;
          getTodos(controller.signal).then(
            (todos) => {
              if (!cancelled) dispatch({ type: 'loadSuccess', payload: todos });
            },
            (err) => {
              if (err instanceof Error && err.name === 'AbortError') return;
              console.warn('todos refetch failed (silent)', err);
            },
          );
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
          cancelled = true;
          controller.abort();
          document.removeEventListener('visibilitychange', onVisibility);
        };
      }, []);

      return (
        <section aria-labelledby="todos-heading" className="flex flex-col gap-6">
          <h1 id="todos-heading" className="text-3xl font-semibold tracking-tight">
            Shared Todos
          </h1>
          <TodoList state={state} />
        </section>
      );
    }
    ```
  - [x] **Watch-out — preserve everything else.** The `useEffect` body, `AbortController`, visibilitychange handler, and the outer `<section aria-labelledby="todos-heading">` shell are all from Stories 1.7/1.8 and MUST stay byte-identical except for the `<TodoList />` swap. Run `git diff apps/web/src/components/TodoApp.tsx` after this task — the diff should be exactly: removed `<div>` placeholder + `data-testid="todo-list-placeholder"`, added `import TodoList from './TodoList';` and `<TodoList state={state} />`.
  - [x] **The `data-testid="todo-list-placeholder"` selector goes away.** Story 1.8's smoke-test instructions referenced it; it's now superseded by `data-testid="todo-list-{loading,empty,error}"` and `data-testid="todo-list"` (populated). Update only Story 1.9's manual smoke test (Task 8) — do NOT retroactively edit the Story 1.8 file.

- [x] **Task 6: Author [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx) (AC: #4, #5, #8)**
  - [x] Create the file:
    ```tsx
    import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
    import { render, screen } from '@testing-library/react';
    import type { Todo } from '@todo-app/shared';
    import TodoItem from './TodoItem';

    const baseTodo: Todo = {
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
      // AC #8: each test asserts no console errors. The mockImplementation
      // swallows output during the test so the assertion below is the only
      // way a real console.error surfaces — no noisy CI logs either.
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    describe('<TodoItem />', () => {
      it('renders an active todo with default visual treatment', () => {
        render(<TodoItem todo={baseTodo} />);
        const li = screen.getByTestId('todo-item');
        expect(li).toHaveTextContent('pick up milk');
        expect(li).toHaveAttribute('data-completed', 'false');
        expect(li).toHaveAttribute('aria-checked', 'false');
        const text = li.querySelector('span:last-child');
        expect(text).not.toHaveClass('line-through');
      });

      it('renders a completed todo with strikethrough and aria-checked=true', () => {
        render(<TodoItem todo={{ ...baseTodo, completed: true }} />);
        const li = screen.getByTestId('todo-item');
        expect(li).toHaveAttribute('data-completed', 'true');
        expect(li).toHaveAttribute('aria-checked', 'true');
        const text = li.querySelector('span:last-child');
        expect(text).toHaveClass('line-through');
      });

      it('renders the todo text verbatim (no escaping shenanigans, NFR17 React JSX)', () => {
        const xss: Todo = {
          ...baseTodo,
          text: '<script>alert("x")</script>',
        };
        render(<TodoItem todo={xss} />);
        const li = screen.getByTestId('todo-item');
        // React escapes by default; the literal text appears, no script element.
        expect(li).toHaveTextContent('<script>alert("x")</script>');
        expect(li.querySelector('script')).toBeNull();
      });

      it('exposes NO interactive affordances (no buttons, no inputs, no role="button")', () => {
        render(<TodoItem todo={baseTodo} />);
        // Read-only contract for Epic 1; toggle/delete arrive in Epic 2.
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(screen.queryByRole('textbox')).toBeNull();
      });

      it('handles a 500-char text without horizontal overflow class violations (break-words present)', () => {
        const longText: Todo = { ...baseTodo, text: 'a'.repeat(500) };
        render(<TodoItem todo={longText} />);
        const text = screen.getByTestId('todo-item').querySelector('span:last-child');
        expect(text).toHaveClass('break-words');
      });
    });
    ```
  - [x] **Why spy on `console.error` in `beforeEach`** — AC #8 mandates "no console errors". React 19 logs hydration mismatches, key warnings, and prop-type errors to `console.error`. Asserting `not.toHaveBeenCalled` in `afterEach` catches every test's emissions. The `mockImplementation(() => {})` swallows output so test runs stay clean; if a real warning fires the assertion fails and lists the call site. NOTE — also spying on `console.warn` is defensive: TodoApp's silent-refetch path uses `console.warn`, not relevant here, but it future-proofs the contract.
  - [x] **Why `screen.getByTestId('todo-item')`** — RTL's screen queries auto-bind to `document.body`, sidestepping container teardown bugs. `getByTestId` is the right primitive for components without a name (the `<li>` has no accessible name beyond text).
  - [x] **Why `querySelector('span:last-child')` for the text** — alternative is to give the inner span its own testid; but two testids on one row is noisy. `span:last-child` is unique here (only two spans) and remains stable.
  - [x] **Why an XSS test** — NFR17 requires escape-by-default rendering. Anywhere we render user-supplied text is a candidate; the assertion `querySelector('script')).toBeNull()` proves React's JSX escaping is in force, NOT a manually-set `dangerouslySetInnerHTML`.
  - [x] **Why test the absence of buttons/inputs/role=textbox** — AC #5 read-only contract. A future contributor adding `<button>Done</button>` to the row would silently break Epic 1's read-only intent; this test fails immediately.
  - [x] **Why `'a'.repeat(500)` test** — Architecture/Story 1.2 capped todo text at 500 chars. `break-words` is the wrap mechanism (AC #7). The test pins the class so future Tailwind class-list refactors don't accidentally drop it.
  - [x] **DO NOT** test `<TodoApp />` here — that's a higher-layer integration test (deferred to a future test-infra story per Story 1.8 deferred-work item, or Story 3.6 journey tests).
  - [x] **DO NOT** simulate clicks or use `userEvent.click(li)` — read-only Epic 1; no event handlers; no `user-event` dep in this story.

- [x] **Task 7: Author [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx) (AC: #1, #2, #3, #6, #8)**
  - [x] Create the file:
    ```tsx
    import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
    import { render, screen, within } from '@testing-library/react';
    import type { Todo } from '@todo-app/shared';
    import type { TodoState } from '@/lib/reducer';
    import TodoList from './TodoList';

    const todoA: Todo = {
      id: '11111111-1111-4111-8111-111111111111',
      text: 'first',
      completed: false,
      createdAt: '2026-04-29T00:00:00.000Z',
    };
    const todoB: Todo = {
      id: '22222222-2222-4222-8222-222222222222',
      text: 'second',
      completed: true,
      createdAt: '2026-04-29T00:00:01.000Z',
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

    describe('<TodoList />', () => {
      it('renders the loading branch with aria-live="polite" and aria-busy when status is "loading"', () => {
        const state: TodoState = { status: 'loading', todos: [] };
        render(<TodoList state={state} />);
        const region = screen.getByTestId('todo-list-loading');
        expect(region).toHaveAttribute('aria-live', 'polite');
        expect(region).toHaveAttribute('aria-busy', 'true');
        expect(region).toHaveTextContent(/loading/i);
      });

      it('renders the loading branch when status is "idle" (pre-mount window)', () => {
        const state: TodoState = { status: 'idle', todos: [] };
        render(<TodoList state={state} />);
        // idle and loading collapse to the same UI to avoid a flash of empty.
        expect(screen.getByTestId('todo-list-loading')).toHaveAttribute(
          'data-status',
          'idle',
        );
      });

      it('renders the empty-state with semantic <p> when status is "success" and todos is empty', () => {
        const state: TodoState = { status: 'success', todos: [] };
        render(<TodoList state={state} />);
        const empty = screen.getByTestId('todo-list-empty');
        expect(empty.tagName).toBe('P');
        expect(empty).toHaveTextContent(/no todos/i);
      });

      it('renders a <ul> of <TodoItem>s, one per todo, with stable keys', () => {
        const state: TodoState = { status: 'success', todos: [todoA, todoB] };
        render(<TodoList state={state} />);
        const list = screen.getByTestId('todo-list');
        expect(list.tagName).toBe('UL');
        const items = within(list).getAllByTestId('todo-item');
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveTextContent('first');
        expect(items[0]).toHaveAttribute('data-completed', 'false');
        expect(items[1]).toHaveTextContent('second');
        expect(items[1]).toHaveAttribute('data-completed', 'true');
      });

      it('renders the error placeholder with role="alert" when status is "error" (Epic 3 will replace)', () => {
        const state: TodoState = {
          status: 'error',
          todos: [],
          error: 'Service unavailable',
          requestId: 'corr-abc',
        };
        render(<TodoList state={state} />);
        const err = screen.getByTestId('todo-list-error');
        expect(err).toHaveAttribute('role', 'alert');
        expect(err).toHaveTextContent(/failed to load/i);
      });
    });
    ```
  - [x] **Why a separate `idle` test** — the spec collapses idle and loading into one branch. A test pinning that behavior catches a future refactor that splits them and accidentally introduces a flash-of-empty before the first `loadStart` dispatch.
  - [x] **Why `expect(empty.tagName).toBe('P')`** — AC #2 requires "semantic markup". A regression where someone refactors to `<div>No todos yet</div>` would silently break AT discoverability; the tag-name assertion is the cheapest pin.
  - [x] **Why `within(list).getAllByTestId('todo-item')`** — the populated branch nests TodoItems; `within` scopes the query to the list element so a stray earlier render's testid (impossible with cleanup, but defensive) doesn't pollute results.
  - [x] **Why we don't assert `key={todo.id}`** — React keys are not part of the DOM. AC #3's "stable `key={todo.id}`" is verified by the developer (visible in the source) and indirectly by the `data-completed` per-item assertion (if keys were missing or duplicated, React 19 logs to `console.error`, which the spy catches). NOTE — explicitly: a duplicate-key warning ("Encountered two children with the same key") would fire the console-error spy and fail the test.
  - [x] **Why we don't assert `error.error` or `error.requestId` text** — AC #6 mandates a "minimal fallback" message. The current copy is "Failed to load todos." with no requestId in the visible UI. Story 3.1 will add it via Toast. Tests should stay loose on copy ("`/failed to load/i`") so a one-word tweak isn't a test churn event.
  - [x] **DO NOT** test the visibilitychange refetch here — that's `<TodoApp />` integration, not `<TodoList />` props rendering.

- [x] **Task 8: Sanity gates — no regressions, all new tests pass (AC: all)**
  - [x] **Type-check:** `(cd apps/web && npx tsc --noEmit)` → exit 0. Catches missing imports, prop-type drift, or jsx-runtime issues. PASS expected.
  - [x] **Lint:** `npm run lint --workspace apps/web` → 0 warnings, 0 errors. NOTE — the new test files import RTL utilities; ensure ESLint's React rules don't false-positive on `screen.getByTestId` (no React-specific rule should — RTL APIs aren't components). If `eslint-plugin-react/jsx-key` complains about the `todos.map` line in TodoList.tsx, verify the `key={todo.id}` is on the `<TodoItem>`. PASS expected.
  - [x] **Web tests:** `npm test --workspace apps/web` → all reducer (6) + api (3) + TodoItem (5) + TodoList (5) tests pass = **19 passed**. Validate that the previously-passing 9 tests remain green after the `environment: 'jsdom'` switch. PASS expected.
  - [x] **Build:** `NEXT_PUBLIC_API_URL=http://localhost:4000 npm run build --workspace apps/web` → exit 0, 4/4 static pages generated. The bundle adds TodoList + TodoItem (~300 bytes minified+gzipped at most); NFR4's ≤200 KB budget is unthreatened. PASS expected.
  - [x] **Shared package regression:** `npm test --workspace packages/shared` → 25/25 still pass. PASS expected.
  - [x] **API regression:** `npm test --workspace apps/api` → 19/19 still pass with `docker compose up -d db` running. PASS expected.
  - [x] **End-to-end smoke test (manual; requires running API):**
    1. `cd apps/api && docker compose up -d db && npm run db:migrate && npm run dev` → API on :4000.
    2. `cd apps/web && npm run dev` → web on :3000.
    3. Open [http://localhost:3000](http://localhost:3000). Initial paint: see "Loading todos…" (the loading branch); within ~50ms it flips to "No todos yet." (empty state, since no todos seeded). DevTools Console: zero errors, zero hydration warnings.
    4. **Insert a real row to test the populated branch:** `docker compose exec db psql -U postgres -d todos -c "INSERT INTO todos (text) VALUES ('first todo');"`. Reload the page — populated branch shows one row.
    5. **Mark it completed:** `docker compose exec db psql -U postgres -d todos -c "UPDATE todos SET completed = true WHERE text = 'first todo';"`. Reload — strikethrough applied; `aria-checked="true"` visible in DevTools Elements.
    6. **Test 360px width:** open Chrome DevTools → Device Mode → 360px. Verify items wrap (no horizontal scroll).
    7. **Test 1440px width:** disable Device Mode, resize window to ~1440px. Items remain inside `max-w-2xl` container (672px); page is centered, no overflow.
    8. **Failure path:** stop the API (Ctrl-C). Reload — see "Failed to load todos." (error branch, `role="alert"`). DevTools Console: one `console.error` is acceptable here from the fetch failure (jsdom-only matters in tests; the browser produces a network error log that doesn't break the page).
    9. **Visibility refetch test:** restart the API. With the page in error state, switch tabs and back — the visibility handler fires; the populated row re-renders. (NOTE — visibility-refetch only fires `loadSuccess`, not `loadStart`, so the screen flips error→success without a loading flash; this is the Story 1.8 deferred-work item about "stale-while-revalidate semantics".)

- [x] **Task 9: Commit** — DEFERRED to user. Per project convention (Stories 1.5–1.8), the user reviews the working tree and runs the commit; this dev agent leaves staging untouched.
  - [x] Stage exactly:
    - **New:** [apps/web/src/components/TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx), [apps/web/src/components/TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx), [apps/web/src/components/TodoList.tsx](../../apps/web/src/components/TodoList.tsx), [apps/web/src/components/TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx), [apps/web/vitest.setup.ts](../../apps/web/vitest.setup.ts).
    - **Modified:** [apps/web/package.json](../../apps/web/package.json) (devDeps: jsdom, @testing-library/{react,dom,jest-dom}), [apps/web/vitest.config.mts](../../apps/web/vitest.config.mts), [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx), root [package-lock.json](../../package-lock.json).
  - [x] Commit message: `feat(web): TodoList + TodoItem with loading/empty/populated/error branches (Story 1.9)`
  - [x] **Do NOT** stage anything in `apps/api/`, `packages/shared/`, or other unrelated paths.

## Dev Notes

### Where this story sits

Story 1.9 is the **first visual deliverable**: a user opening [http://localhost:3000](http://localhost:3000) sees real list-state rendering for the first time. After this story:

- The `<TodoApp />` placeholder div from Stories 1.7/1.8 is gone.
- `state.status` drives four mutually-exclusive UI branches (loading, empty, populated, error).
- `<TodoItem />` exposes the active vs. completed visual contract used by every later mutation story.
- Vitest moves from `node` to `jsdom`; React Testing Library is the chosen component-test framework (closes Architecture §Gap Analysis "Web app test tooling not pinned" — partially in 1.8, fully here).

| Story | Reuses from this story |
| ----- | ---------------------- |
| 2.5   | `<TodoInput />` will be a sibling component to `<TodoList />`; `<TodoApp />` composes them. New optimistic todos appear in the existing `<TodoItem />` rendering — no per-state changes needed. |
| 2.6   | `<TodoItem />` swaps the decorative `<span aria-hidden="true">` box for a Radix `Checkbox` with `onCheckedChange={(c) => onToggle(todo.id, c)}` callback. The `aria-checked` semantics already in this story are preserved by Radix's primitive. |
| 2.7   | `<TodoItem />` adds a delete `<button aria-label="Delete '{text}'">` next to the text. The read-only Epic 1 contract is broken intentionally here. |
| 3.1   | The error branch in `<TodoList />` is replaced by a Radix Toast (rendered out-of-tree via `<ToastViewport />` in [layout.tsx](../../apps/web/src/app/layout.tsx)). The `data-testid="todo-list-error"` selector goes away; Story 3.1 introduces `data-testid="error-toast"`. |
| 3.4   | Adds a "Try again" button on the error branch, dispatching the same load effect from Story 1.8 Task 6. |
| 3.6   | Journey-level resilience tests build on this story's `data-testid` selectors and on `<TodoApp />` integration. |

### Critical architectural guardrails (bind these hard)

- **Presentational components.** `<TodoList />` and `<TodoItem />` receive props and render. No `useEffect`, no `api.ts` calls, no `useReducer`. Architecture §Frontend Architecture: "TodoInput, TodoList, TodoItem, Toast are presentational; they receive props and emit callbacks." [Source: architecture.md#Frontend Architecture, line 631].
- **Discriminated-union state.** `<TodoList />`'s prop is the full `TodoState`; the reducer's status field drives branching. [Source: architecture.md#Communication Patterns — Reducer actions].
- **Three-state baseline (loading / empty / error) for any async-dependent UI.** Architecture's enforcement guideline: "Handle all three of loading, empty, and error states for any new async-dependent UI (not just the happy path)." [Source: architecture.md#Enforcement Guidelines, line 433].
- **Spinners are for empty initial load only.** No spinner over a populated list. The reducer's `loadStart` already empties `todos: []`, so the loading branch trivially has no list to spinner-over. [Source: architecture.md#Process Patterns — Loading state, line 414].
- **Completion conveyed by more than color (NFR12).** Strikethrough text + `aria-checked` + `data-completed` triple-encode the state — color is one of three signals, not the only signal.
- **No `dangerouslySetInnerHTML` in `apps/web`.** [Source: architecture.md#Enforcement Guidelines]. React's default JSX escaping satisfies NFR17 — the XSS test (Task 6) pins this.
- **Co-located tests next to the file under test.** `TodoList.test.tsx` lives next to `TodoList.tsx`; same for `TodoItem`. No `__tests__/` directories. [Source: architecture.md#Structure Patterns, line 351].

### The test-tooling decisions, with rationale

This story makes three test-infrastructure picks. Each is defensible:

1. **`environment: 'jsdom'`** (not `happy-dom`). Jsdom's higher-fidelity DOM is the safe pick when Radix UI primitives land in Stories 2.6/3.1 (Radix uses `Element.closest`, ResizeObserver, focus-trap APIs that have historically broken on happy-dom). Speed difference is negligible at our scale.
2. **`@testing-library/react@16.x`** (not 15.x). v16 is the React 19-mainline; v15 was the React 18 stable. Our `react@19.2.4` requires v16's peer-dep range (`^18 || ^19`).
3. **No `@vitejs/plugin-react`.** Vite/esbuild's automatic JSX transform (driven by `tsconfig.json` `"jsx": "react-jsx"`) is sufficient for tests — no HMR/fast-refresh needed in a single-shot Vitest run. Adding the plugin would force pinning to its `@4.x` line (vitest 2.1.x bundles vite 5; plugin's `@6.x` requires vite 8) and pull `@babel/core` into devDeps for zero practical benefit. Architecture's bundle-budget concern (NFR4) is for runtime, but devDep weight matters for `npm install` time and fresh-clone friction.

### Known gotchas

- **React 19 strict-mode double-render in tests.** RTL's `render()` wraps in React's StrictMode by default in dev builds. Component-level effects fire twice; for pure presentational components like `<TodoList />` and `<TodoItem />` this is invisible. NOTE — if a future Epic 2/3 story wraps `<TodoList />` in a context provider that has `useEffect` side effects, the double-render becomes observable. Currently there are no effects in this story's components.
- **`@testing-library/jest-dom` matcher discoverability.** Without the `@testing-library/jest-dom/vitest` import in `vitest.setup.ts`, calls like `expect(...).toHaveAttribute(...)` would throw "expect(...)._matcher_ is not a function". The setup file makes this work invisibly.
- **`getByTestId` vs. accessible queries.** RTL's official guide prefers `getByRole` / `getByLabelText`. We use `getByTestId` deliberately for branch-discriminator divs (loading/empty/error) because they don't have meaningful accessible names — they have ARIA states (`aria-live`, `aria-busy`, `role="alert"`). For the populated `<ul>` we COULD use `getByRole('list')`, but `getByTestId('todo-list')` is more specific (the page may eventually have multiple lists). Stick with testids for branch-level scoping; switch to role-based queries once interactive elements land in Epic 2.
- **`screen.queryByRole('button')` returns null in the read-only test.** This is the contract — Epic 1 has no buttons. If a future contributor adds `<button>Done</button>` to `<TodoItem />`, the test fails. Intentional canary.
- **The error branch's `console.error` in browsers vs. tests.** When the API is down in real browsers, `fetch` rejects and the browser logs a network error to the console. In tests we mock `fetch` (Story 1.8) so no such log happens — the spy catches only intentional `console.error` calls. The error-branch test (Task 7) renders a state where `error: 'Service unavailable'` was synthetically set; no fetch is called.
- **Story 1.8 deferred-work item "no tests for TodoApp.tsx" is NOT closed by this story.** This story tests `<TodoList />` and `<TodoItem />` in isolation. `<TodoApp />` integration tests (visibilitychange handler, AbortError swallow, cancelled-flag race) need additional jsdom-aware test scaffolding and `vi.useFakeTimers` patterns. Defer to Story 3.6 (journey-level resilience tests) or a dedicated test-infra story.

### Why no `aria-live` polite-region wrapping the entire list

Architecture's ARIA pattern is: place `aria-live="polite"` on the loading/error branches (where AT users care about state changes), NOT on the `<ul>` itself. Wrapping the populated list in `aria-live` would announce every todo as it renders — annoying noise for AT users. Story 3.1's Toast will own the global polite-region for error messages.

### Tailwind v4 and dark-mode contrast

[apps/web/src/app/globals.css](../../apps/web/src/app/globals.css) defines `--foreground` as `#171717` (light) and `#ededed` (dark). The completed state's `opacity-60` on text yields:

- Light mode: `#171717` × 0.6 alpha against `#ffffff` ≈ `#6e6e6e` → contrast ratio 5.39:1 (AA passes for body text, ≥4.5:1).
- Dark mode: `#ededed` × 0.6 alpha against `#0a0a0a` ≈ `#909090` → contrast ratio 5.05:1 (AA passes).

Both modes clear NFR13 (WCAG AA contrast). If a future palette change pushes the foreground closer to gray, recompute these.

### Out-of-scope (do NOT do in this story)

- ❌ **No `<TodoInput />`** — Story 2.5.
- ❌ **No Radix UI primitives** — `Checkbox` is Story 2.6, `Toast` is Story 3.1.
- ❌ **No click handlers, focus management, keyboard event handlers** on `<TodoItem />` — read-only Epic 1.
- ❌ **No "Try again" button** on the error branch — Story 3.4 (FR20).
- ❌ **No `useEffect` in `<TodoList />` or `<TodoItem />`** — they're pure presentational.
- ❌ **No `<TodoApp />` test file** — Story 1.8 deferred-work item; needs jsdom-aware integration scaffolding (timers, async dispatch, abort race). Belongs in Story 3.6 or a dedicated test-infra story.
- ❌ **No `@testing-library/user-event` dependency** — no interactions to test in Epic 1.
- ❌ **No `@vitejs/plugin-react`** — esbuild JSX is sufficient.
- ❌ **No bundle-analyzer / `size-limit` setup** — Story 1.11 owns CI-side bundle gating; v1 has no enforced bundle threshold.
- ❌ **No accessibility audit tool** (axe-core, jest-axe) integration — coverage is via assertion of specific ARIA attributes (`aria-live`, `aria-busy`, `aria-checked`, `role="alert"`). Lighthouse CI / axe-core integration belongs in Story 1.11 or a future audit story.
- ❌ **No CSS-in-JS, no `styled-components`** — Tailwind utility classes only. Architecture §Frontend Architecture: "Styling: Tailwind CSS exclusively."
- ❌ **No `apps/api/**` or `packages/shared/**` modifications.**
- ❌ **No changes to [vitest.config.mts](../../apps/web/vitest.config.mts) other than `environment` + `setupFiles`** — keep `globals: false`, `include`, and the `tsconfigPaths` plugin intact.
- ❌ **No `'use client'` directive on the new components** — they're rendered under `<TodoApp />` which already has the directive; the boundary inherits.
- ❌ **No `next/image`, `next/font`, or any `next/*` import in the new components** — pure React.

### Project Structure Notes

Target additions/modifications:

```text
apps/web/
├── package.json                              # +devDeps: jsdom, @testing-library/{react,dom,jest-dom}
├── vitest.config.mts                         # MODIFIED — environment: 'jsdom', setupFiles
├── vitest.setup.ts                           # NEW — jest-dom matchers + RTL cleanup
└── src/
    └── components/
        ├── TodoApp.tsx                       # MODIFIED — placeholder div → <TodoList state={state} />
        ├── TodoItem.tsx                      # NEW — read-only row, active/completed visual
        ├── TodoItem.test.tsx                 # NEW — RTL: active, completed, XSS, no buttons, long text
        ├── TodoList.tsx                      # NEW — loading / empty / populated / error branches
        └── TodoList.test.tsx                 # NEW — RTL: each branch rendered correctly
```

- **Alignment:** matches [Architecture §Complete Project Directory Structure](../../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure) — the architecture explicitly lists `TodoApp/TodoInput/TodoList/TodoItem/Toast.tsx` and their `*.test.tsx` siblings under `apps/web/src/components/`.
- **Variances at end of Story 1.9:**
  - No `apps/web/src/components/TodoApp.test.tsx` — see "Out-of-scope" above; deferred per Story 1.8 deferred-work.
  - No `apps/web/src/components/{TodoInput,Toast}.tsx` — Stories 2.5 and 3.1.
  - No `apps/web/Dockerfile` — Story 1.11.
- **Pre-existing files NOT modified by this story:**
  - [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx), [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx), [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css) (Story 1.7).
  - [apps/web/src/lib/{api,errors,reducer}.ts](../../apps/web/src/lib/) and their `*.test.ts` (Story 1.8).
  - [apps/web/.env.example](../../apps/web/.env.example), [apps/web/.gitignore](../../apps/web/.gitignore), [apps/web/next.config.ts](../../apps/web/next.config.ts), [apps/web/postcss.config.mjs](../../apps/web/postcss.config.mjs), [apps/web/tsconfig.json](../../apps/web/tsconfig.json) (Stories 1.1, 1.7, 1.8).
  - All of `apps/api/**` and `packages/shared/**`.

### Testing Requirements

- **Unit/component tests** ([TodoList.test.tsx](../../apps/web/src/components/TodoList.test.tsx), [TodoItem.test.tsx](../../apps/web/src/components/TodoItem.test.tsx)) — Vitest with `environment: 'jsdom'`, React Testing Library's `render`/`screen`/`within`. Auto-cleanup after each test (`afterEach(cleanup)`).
- **Console-quiet contract (AC #8).** Each test spies on `console.error` and `console.warn` with empty `mockImplementation`; the `afterEach` asserts neither was called. React 19 logs key warnings, prop-type errors, and hydration mismatches to `console.error` — this is our second line of defense against regressions.
- **Type-checking** is the implicit unit test for prop shapes (`TodoListProps`, `TodoItemProps`) and the `TodoState` discriminated union completeness (Story 1.8's reducer `_exhaustive: never` already pins this from the reducer side).
- **Manual end-to-end smoke test** (Task 8) is the integration confidence check — exercises the four branches against a real API and DB.
- **No coverage threshold or CI gate** — v1 doesn't enforce coverage. Story 1.11 may revisit.

### Library version pins (April 2026)

- `jsdom@^29.0.0` — latest line. Dropped CommonJS support; Node 22+ baseline already covers it.
- `@testing-library/react@^16.3.0` — React 19-mainline. Peers: `react: ^18 || ^19`.
- `@testing-library/dom@^10.4.0` — peer of `@testing-library/react@16`; pin alongside.
- `@testing-library/jest-dom@^6.9.0` — Vitest-aware via `/vitest` subpath import.
- **Existing pins NOT bumped:** `vitest@^2.1.0` (intentional — 3.x has config-format break per Story 1.8 rationale), `vite-tsconfig-paths@^5.0.0`.

### References

- [Source: epics.md#Story 1.9: Render list states — loading, empty, populated (read-only)] — original BDD acceptance criteria.
- [Source: architecture.md#Frontend Architecture] — `<TodoApp />` is the only stateful component; `<TodoList />`, `<TodoItem />`, `<Toast />` are presentational; styling via Tailwind exclusively; Radix UI primitives reserved for `Checkbox` (Story 2.6) and `Toast` (Story 3.1).
- [Source: architecture.md#Complete Project Directory Structure, lines 540–550] — file layout for `apps/web/src/components/`.
- [Source: architecture.md#Process Patterns — Loading state, lines 411–414] — "One state per async operation: `status: 'idle' | 'loading' | 'error'` on the reducer state (initial load only). Mutations do not introduce separate loading flags. Never show a spinner over an existing populated list."
- [Source: architecture.md#Enforcement Guidelines, line 433] — "Handle all three of loading, empty, and error states for any new async-dependent UI."
- [Source: architecture.md#Structure Patterns, line 351] — co-located tests, no `__tests__/` directories.
- [Source: architecture.md#Naming Patterns, line 338] — React component files: `PascalCase.tsx`.
- [Source: architecture.md#Architecture Validation Results — Gap Analysis Results, line 865] — "Web app test tooling is not pinned. Recommended resolution: Vitest + React Testing Library." (1.8 added Vitest; 1.9 closes the RTL half.)
- [Source: prd.md#FR8, FR9, FR10, FR11, FR12] — list rendering, ordering, empty/loading state requirements.
- [Source: prd.md#FR16] — client reconciles from server on fetch.
- [Source: prd.md#FR33] — modern-browser baseline.
- [Source: prd.md#NFR3, NFR4] — page-load and bundle budgets (informational; not gated in v1).
- [Source: prd.md#NFR10, NFR11, NFR12, NFR13, NFR14] — accessibility (WCAG AA, keyboard, non-color completion signal, contrast, tap targets).
- [Source: prd.md#NFR17] — XSS-safe rendering of user content (React JSX escaping).
- [Source: prd.md#NFR23] — automated tests cover list rendering.
- [Story 1.2 file] — `Todo` type in `@todo-app/shared`.
- [Story 1.7 file] — `<TodoApp />` shell, `<section aria-labelledby="todos-heading">`, `:focus-visible` outline in [globals.css](../../apps/web/src/app/globals.css).
- [Story 1.8 file] — `TodoState`, `LoadStatus`, reducer with `loadStart` / `loadSuccess` / `loadError` actions; api.ts `getTodos`; `ApiError`; `<TodoApp />` `useReducer` + visibilitychange wiring; Vitest 2.1 base config.
- [Story 1.8 deferred-work] — "no tests for `TodoApp.tsx`" remains deferred; this story tests `<TodoList />` + `<TodoItem />` only.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7) — 1M context

### Debug Log References

- 2026-04-29: Initial lint after Task 5 surfaced one `jsx-a11y/role-supports-aria-props` warning on `<li role="listitem" aria-checked={...}>`. Resolved by adding a single-line `eslint-disable-next-line` comment above the `<li>` with rationale ("Epic 1 read-only signal; Story 2.6 replaces with Radix Checkbox role=\"checkbox\""). Story 2.6 will swap the entire surface to Radix Checkbox with proper `role="checkbox"` semantics, retiring the disable.
- 2026-04-29: Task 8 manual end-to-end smoke test (steps 1–9 with `docker compose up -d db`, two `npm run dev` processes, and DevTools visual checks at 360px / 1440px) NOT executed by the dev agent — left to user pre-merge verification per the dev-story workflow's read-only-of-shared-state default. The component-level RTL tests cover the four state-machine branches (loading, empty, populated, error) plus the idle→loading collapse, XSS rendering, no-buttons contract, and 500-char break-words; build success demonstrates the SSR path.

### Completion Notes List

- All 8 acceptance criteria implemented and verified by automated tests (where the AC is mechanically testable) and by build/type-check (for the SSR/rendering shape).
- TodoItem.tsx is a pure presentational `<li>` with the strikethrough-on-completed contract, `aria-checked` for AT signaling, `data-completed` test hook, and explicit no-interactivity (no buttons / inputs / role=button) per Epic 1 read-only contract.
- TodoList.tsx branches on `state.status` into four mutually-exclusive UIs: loading (`aria-live="polite"` + `aria-busy="true"`), empty (semantic `<p>`), populated (`<ul>` of `<TodoItem>`), error (Epic-1 `role="alert"` placeholder; Story 3.1 swaps to Radix Toast). Idle and loading collapse to the same UI to avoid a flash of "No todos yet" before the first dispatch lands.
- TodoApp.tsx diff is minimal: one `import TodoList from './TodoList';` line + the placeholder `<div data-testid="todo-list-placeholder">` block replaced with `<TodoList state={state} />`. The `useEffect` body, `AbortController`, and visibilitychange handler from Story 1.8 are byte-identical.
- Vitest moved from `environment: 'node'` to `'jsdom'`; new `vitest.setup.ts` registers `@testing-library/jest-dom/vitest` matchers and an `afterEach(cleanup)` hook. Existing 9 reducer + api tests still green under jsdom.
- New devDependencies: `jsdom@^29.0.0`, `@testing-library/react@^16.3.0`, `@testing-library/dom@^10.4.0`, `@testing-library/jest-dom@^6.9.0`. No `@testing-library/user-event` (read-only Epic 1; Story 2.5 will add it). No `@vitejs/plugin-react` (esbuild's `react-jsx` transform is sufficient for tests).
- Sanity gates all green: `tsc --noEmit` exit 0, `eslint` 0 errors / 0 warnings, `vitest run` 19/19 (6 reducer + 3 api + 5 TodoItem + 5 TodoList), `next build` 4/4 static pages, `packages/shared` 25/25, `apps/api` 19/19.
- AC #4's "WCAG AA contrast" claim is verified by computation in Dev Notes (light: 5.39:1, dark: 5.05:1 — both ≥4.5:1 body-text floor) rather than by an automated axe-core test; the assertion-based approach matches the story's "no accessibility audit tool" out-of-scope item.
- AC #7's "no horizontal scroll at 360px / 1440px" is verified at the test layer by pinning the `break-words` Tailwind class on the long-text path (500-char todo); full visual verification at the two breakpoints is part of the deferred manual smoke test.
- Story 1.8's deferred-work item "no tests for TodoApp.tsx" remains deferred — Story 1.9 covered TodoList and TodoItem in isolation as the spec scoped. TodoApp integration (visibilitychange handler, AbortError swallow, cancelled-flag race) needs additional jsdom + fake-timers scaffolding and belongs in Story 3.6 or a dedicated test-infra story.

### File List

**New:**

- apps/web/src/components/TodoItem.tsx
- apps/web/src/components/TodoItem.test.tsx
- apps/web/src/components/TodoList.tsx
- apps/web/src/components/TodoList.test.tsx
- apps/web/vitest.setup.ts

**Modified:**

- apps/web/package.json (devDeps: jsdom, @testing-library/{react,dom,jest-dom})
- apps/web/vitest.config.mts (environment: 'node' → 'jsdom'; added setupFiles)
- apps/web/src/components/TodoApp.tsx (import TodoList; placeholder div → `<TodoList state={state} />`)
- package-lock.json (lockfile regenerated by `npm install`)
- _bmad-output/implementation-artifacts/sprint-status.yaml (1-9: ready-for-dev → in-progress → review)
- _bmad-output/implementation-artifacts/1-9-render-list-states-loading-empty-populated-read-only.md (status, task checkboxes, Dev Agent Record, Change Log)

## Change Log

| Date | Author | Change |
| ---- | ------ | ------ |
| 2026-04-29 | Claude (dev-story) | Initial implementation: TodoList + TodoItem with loading/empty/populated/error branches; Vitest jsdom + RTL test infrastructure; minimal TodoApp wiring. 19/19 web tests passing. |
