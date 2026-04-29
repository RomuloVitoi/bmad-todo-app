# Story 1.8: Typed API client, error types, and load reducer

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the web app,
I want a typed `api.ts` client for the API, an `ApiError` type, and a reducer that tracks load state,
So that the list-rendering component receives todos, errors, and loading transitions without speaking HTTP directly.

## Acceptance Criteria

1. **Given** [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts),
   **When** `getTodos()` is invoked,
   **Then** it issues `GET ${NEXT_PUBLIC_API_URL}/todos` with an `x-request-id` header containing a freshly generated UUID,
   **And** on `200` it parses the response body with `TodoListResponseSchema.parse` and returns the `todos` array,
   **And** on non-OK status it throws an `ApiError` constructed from the server envelope and response headers.

2. **Given** [apps/web/src/lib/errors.ts](../../apps/web/src/lib/errors.ts),
   **When** `ApiError` is constructed,
   **Then** it carries `statusCode: number`, `message: string`, and optional `requestId: string`,
   **And** a static `ApiError.fromResponse(response)` reads the server envelope and `x-request-id` header.

3. **Given** [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts),
   **When** the initial state is produced,
   **Then** it is `{ status: 'idle', todos: [] }`,
   **And** the reducer handles `loadStart` → `{ status: 'loading', todos: [] }`,
   **And** `loadSuccess` → `{ status: 'success', todos: [...] }`,
   **And** `loadError` → `{ status: 'error', todos: [], error: string, requestId?: string }`.

4. **Given** the reducer's discriminated-union action types,
   **When** TypeScript compiles the switch statement,
   **Then** an unhandled action causes a compile-time exhaustiveness error (via a `never` check in the `default` branch).

5. **Given** [TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) is mounted,
   **When** the component first renders,
   **Then** it dispatches `loadStart`, calls `api.getTodos()`, and dispatches `loadSuccess` or `loadError` based on the result.

6. **Given** the page is visible, hidden, then visible again,
   **When** the `visibilitychange` event fires with `document.visibilityState === 'visible'`,
   **Then** `TodoApp` refetches todos,
   **And** on refetch failure the reducer is NOT transitioned to `error` — the failure is logged only (silent per Architecture §Retry).

7. **Given** [apps/web/src/lib/reducer.test.ts](../../apps/web/src/lib/reducer.test.ts) and [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts),
   **When** they run,
   **Then** all reducer transitions are covered including exhaustiveness,
   **And** `api.test.ts` covers success, parse-failure (invalid server response), and HTTP error paths using a mocked `fetch`.

## Tasks / Subtasks

- [x] **Task 1: Add Vitest as the web-tier test runner (AC: #7; resolves Architecture Known Gap "Web app test tooling not pinned")**
  - [x] In [apps/web/package.json](../../apps/web/package.json), add to `devDependencies`:
    - `"vitest": "^2.1.0"` — the Vitest 2.x line is the stable choice for Next.js 16 + React 19.2 as of April 2026. (Vitest 3.x is shipping but introduces a config-format break; pin 2.x for predictable upgrades.)
    - `"@vitest/ui": "^2.1.0"` — optional, dev-only; nice for `--ui` mode while iterating. Skip if you'd rather keep deps minimal.
    - `"vite-tsconfig-paths": "^5.0.0"` — wires the `"@/*"` path alias from [apps/web/tsconfig.json](../../apps/web/tsconfig.json) into Vitest's resolver. Without this, tests using `import api from '@/lib/api'` fail to resolve.
  - [x] Run `npm install` from repo root. Verify with `npm ls vitest vite-tsconfig-paths --workspace apps/web`.
  - [x] **Do NOT add `jsdom`, `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom`, or `@testing-library/user-event` in this story.** Story 1.8's tests are pure TS (reducer + fetch wrapper) — they run in Vitest's default `node` environment. Story 1.9 introduces component tests and owns that dep set.
  - [x] **Do NOT install `vitest@^3` or any `@vitejs/plugin-react`** — JSX transformation isn't needed for pure-lib tests. The Next.js Babel pipeline handles JSX for the dev server / build; tests stay in TS-only territory.
  - [x] Add an `apps/web/package.json` script: `"test": "vitest run"` AND `"test:watch": "vitest"`. Both forms used: `vitest run` for CI / one-shot; `vitest` for interactive watch.

- [x] **Task 2: Author `apps/web/vitest.config.ts` (AC: #7)** — Note: filename is [apps/web/vitest.config.mts](../../apps/web/vitest.config.mts) (`.mts`) because `vite-tsconfig-paths@5` is ESM-only and `apps/web/package.json` is not `"type": "module"`. The `.mts` extension forces Node to load it as ESM. The `tsconfig.json` `include` glob already covers `**/*.mts`.
  - [x] Create [apps/web/vitest.config.mts](../../apps/web/vitest.config.mts):
    ```ts
    import tsconfigPaths from 'vite-tsconfig-paths';
    import { defineConfig } from 'vitest/config';

    export default defineConfig({
      plugins: [tsconfigPaths()],
      test: {
        environment: 'node', // Story 1.8: pure-TS tests. Story 1.9 will add 'jsdom'.
        include: ['src/**/*.test.{ts,tsx}'],
        globals: false,      // import { describe, it, expect } explicitly — no test-globals leak.
      },
    });
    ```
  - [x] **Why `environment: 'node'`** — both `reducer.test.ts` and `api.test.ts` are pure TS. They mock `fetch` via `vi.stubGlobal` (or assign to `globalThis.fetch`); no DOM API needed yet. Story 1.9 will switch to `jsdom` (or `happy-dom`) when component tests land.
  - [x] **Why `globals: false`** — explicit imports (`import { describe, it, expect, vi } from 'vitest'`) keep the test files self-documenting and play nicely with `tsc --noEmit` (no `vitest/globals` types pollution in `tsconfig.json`).
  - [x] **Why `vite-tsconfig-paths` plugin** — tests use the `@/lib/...` alias. Without the plugin, Vitest's resolver can't find them. Cheap to add.

- [x] **Task 3: Author `apps/web/src/lib/errors.ts` (AC: #2)**
  - [x] Create [apps/web/src/lib/errors.ts](../../apps/web/src/lib/errors.ts):
    ```ts
    import { ErrorResponseSchema } from '@todo-app/shared';

    export interface ApiErrorOptions {
      statusCode: number;
      message: string;
      requestId?: string;
      code?: string;
    }

    export class ApiError extends Error {
      readonly statusCode: number;
      readonly requestId?: string;
      readonly code?: string;

      constructor(opts: ApiErrorOptions) {
        super(opts.message);
        this.name = 'ApiError';
        this.statusCode = opts.statusCode;
        this.requestId = opts.requestId;
        this.code = opts.code;
        // Restore prototype chain when extending built-ins (TS down-compile to ES5
        // would otherwise break instanceof checks). Safe to call in ES2017+.
        Object.setPrototypeOf(this, ApiError.prototype);
      }

      static async fromResponse(response: Response): Promise<ApiError> {
        const requestId = response.headers.get('x-request-id') ?? undefined;
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          // Response wasn't JSON (network HTML error page, empty body, etc.).
          return new ApiError({
            statusCode: response.status,
            message: `Request failed with status ${response.status}`,
            requestId,
          });
        }
        const parsed = ErrorResponseSchema.safeParse(body);
        if (parsed.success) {
          return new ApiError({
            statusCode: parsed.data.statusCode,
            message: parsed.data.message,
            requestId,
            code: parsed.data.code,
          });
        }
        // Server returned non-envelope JSON. Use HTTP status + a generic message.
        return new ApiError({
          statusCode: response.status,
          message: `Request failed with status ${response.status}`,
          requestId,
        });
      }
    }
    ```
  - [x] **Why subclass `Error` (not a plain interface)** — gives `instanceof ApiError` checks in `try/catch` and a real `.stack` for debugging. Architecture §Process Patterns: "Components handle `ApiError` with a single `try/catch` per reducer action".
  - [x] **Why `Object.setPrototypeOf` after `super(...)`** — TS compiled with `target` lower than ES6 emits Error subclassing in a way that breaks `instanceof`. apps/web targets `ES2017` (per [tsconfig.json](../../apps/web/tsconfig.json)) which is ES6+, so this is technically defensive — but the line is cheap insurance and the de-facto idiom for JS Error subclasses.
  - [x] **Why `ErrorResponseSchema.safeParse` (not `.parse`)** — a non-conforming response body shouldn't throw a ZodError that masquerades as the original API error. `safeParse` returns `{ success, data | error }`; we fall back to a generic message if the body doesn't match.
  - [x] **Why we read `x-request-id` from response headers** — Story 1.5 wired the API to echo the inbound `x-request-id` (or generate one). The web client surfaces this on `ApiError.requestId` so future failure-toast UI (Stories 3.1+) can include it for support / debugging. Architecture line 307: "the api.ts wrapper captures and logs the response x-request-id on failures".
  - [x] **Why include `code: string?`** — `ErrorResponseSchema` has an optional `code` field for machine-readable error subclassing. Exposing it on `ApiError` lets future code branch on `err.code === 'RATE_LIMITED'` etc. Adds zero runtime cost when absent.
  - [x] **DO NOT** import `ErrorResponseSchema` from anywhere other than `@todo-app/shared`. The contract package is the single source of truth (Story 1.2's pin).

- [x] **Task 4: Author `apps/web/src/lib/api.ts` (AC: #1)**
  - [x] Create [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts):
    ```ts
    import { TodoListResponseSchema, type Todo } from '@todo-app/shared';
    import { ApiError } from './errors';

    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    if (!API_URL) {
      // NEXT_PUBLIC_* values are inlined at build time; an undefined value here
      // means the developer started `next dev` without a .env. Fail loudly so
      // the empty fetch URL doesn't silently 404 against the page's own origin.
      throw new Error('NEXT_PUBLIC_API_URL is required (apps/web/src/lib/api.ts)');
    }

    function newRequestId(): string {
      // crypto.randomUUID is widely available in modern browsers (Chrome 92+,
      // Safari 15.4+, Firefox 95+). Architecture's "modern browsers only"
      // baseline (FR33) covers it. Fall back not provided — hard fail surfaces
      // any unsupported environment immediately rather than producing logs
      // without a correlation ID.
      return crypto.randomUUID();
    }

    export async function getTodos(signal?: AbortSignal): Promise<Todo[]> {
      const requestId = newRequestId();
      const response = await fetch(`${API_URL}/todos`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'x-request-id': requestId,
        },
        signal,
      });

      if (!response.ok) {
        throw await ApiError.fromResponse(response);
      }

      const body = await response.json();
      const parsed = TodoListResponseSchema.parse(body);
      return parsed.todos;
    }
    ```
  - [x] **Why `process.env.NEXT_PUBLIC_API_URL`** — Next.js inlines `NEXT_PUBLIC_*` env vars at build time; this access is safe in client components and the bundle picks up the value from `.env` (or the platform's environment). Architecture §Frontend Architecture: "NEXT_PUBLIC_API_URL explicitly points to the Fastify base (keeps tier separation visible; no Next.js proxy rewrites)".
  - [x] **Why throw at module load if the URL is missing** — same pattern apps/api uses for `DATABASE_URL` (Story 1.4 + 1.5 deferred-work). Surfaces config errors loudly instead of producing 404s against the page origin. NEXT_PUBLIC_API_URL is required by the architecture's env-var inventory; Story 1.3's `.env.example` already lists it.
  - [x] **Why `crypto.randomUUID()` directly (not a polyfill)** — FR33 commits to a "modern browser baseline". The native API is universally available in the targeted browsers. A fallback would invite a polyfill dep (uuid) for zero practical benefit.
  - [x] **Why pass `signal?: AbortSignal`** — lets `TodoApp.tsx` (Task 6) cancel an in-flight request on unmount. Optional so the parameter is invisible to test code that doesn't care.
  - [x] **Why use `TodoListResponseSchema.parse` (throws) instead of `.safeParse`** — a malformed 200 response IS a contract break that should surface as a runtime error caught by the reducer's `loadError` path. The thrown `ZodError` is wrapped to a user-friendly `ApiError` in the test (Task 8) — the architecture's `try/catch` pattern handles it via `dispatch({ type: 'loadError', ... })`.
  - [x] **Why the response schema wraps in `{ todos: [...] }`** — Story 1.2's `TodoListResponseSchema` is `z.object({ todos: z.array(TodoSchema) }).strict()`. Returning `parsed.todos` (the inner array) gives consumers the natural shape; the envelope is a future-evolvability concern (pagination, etc.) per the architecture.
  - [x] **DO NOT** introduce `mode: 'cors'`, `credentials: 'include'`, or any cookies — Story 1.5's CORS plugin runs with `credentials: false`. Architecture §Authentication & Security explicitly excludes auth and cookies in v1.
  - [x] **DO NOT** retry, backoff, or queue. Architecture §Retry: "No automatic retries in v1." The visibilitychange best-effort refetch (Task 6) is the only re-issue path, and it's silent on failure.
  - [x] **DO NOT** wrap the call in a try/catch here — let `ApiError` (HTTP failure) and `ZodError` (parse failure) bubble up. The reducer dispatch handlers (Task 6) catch them.

- [x] **Task 5: Author `apps/web/src/lib/reducer.ts` (AC: #3, #4)**
  - [x] Create [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts):
    ```ts
    import type { Todo } from '@todo-app/shared';

    export type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

    export interface TodoState {
      status: LoadStatus;
      todos: Todo[];
      error?: string;
      requestId?: string;
    }

    export type TodoAction =
      | { type: 'loadStart' }
      | { type: 'loadSuccess'; payload: Todo[] }
      | { type: 'loadError'; payload: { error: string; requestId?: string } };

    export const initialState: TodoState = {
      status: 'idle',
      todos: [],
    };

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
        default: {
          // Compile-time exhaustiveness: if a new TodoAction member is added but
          // not handled above, TS infers `action` as something other than `never`
          // and this assignment fails to type-check.
          const _exhaustive: never = action;
          return state;
        }
      }
    }
    ```
  - [x] **Why a discriminated union for actions** — pattern matches Redux Toolkit / Stately convention; keyword `type` is the discriminator. TS narrows `action.payload` to the right shape inside each `case`.
  - [x] **Why `loadStart` empties `todos: []` (not preserving previous list)** — initial-load semantics. Story 1.9's loading state is "spinner over empty list". Architecture §Loading state: "Never show a spinner over an existing populated list. Spinners are for empty-state initial load only." This is the v1 simplification; once mutations land in Story 2.4 the picture gets richer (mutations don't transition the load status at all).
  - [x] **Why the `_exhaustive: never` assignment** — AC #4 mandates compile-time exhaustiveness. `const _exhaustive: never = action` is the canonical TS idiom: when `action` exhaustively matches all union members in the `case` branches above, TS narrows `action` to `never` in the `default`; assigning `never` to `never` compiles. Adding a new action without a `case` makes `action` non-`never` in `default` and the line errors at `tsc --noEmit`. NOTE — added `void _exhaustive;` to silence `noUnusedLocals`/`@typescript-eslint/no-unused-vars` while preserving the type-level exhaustiveness guarantee.
  - [x] **Why `return state` after the `never` check** — at runtime, an unknown action (e.g., from a buggy dispatch) returns the unchanged state rather than throwing. Defensive: pure reducers should never throw.
  - [x] **Why explicit `LoadStatus` type alias** — exported so component code (Story 1.9) can write `state.status === 'success'` with strong narrowing.
  - [x] **DO NOT** add mutation actions (`addOptimistic`, `toggleOptimistic`, `deleteOptimistic`, etc.) here. Story 2.4 owns reducer extensions for mutations. Pre-emptive actions would have no consumer and create test-coverage debt.
  - [x] **DO NOT** add `errorDismiss` either. Story 3.1 owns the toast slice. The `error` field on `TodoState` is read-only from the reducer's perspective in v1's load-only scope.

- [x] **Task 6: Wire `<TodoApp />` to use the reducer + visibilitychange refetch (AC: #5, #6)**
  - [x] Update [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) (created in Story 1.7). Final shape:
    ```tsx
    'use client';

    import { useEffect, useReducer } from 'react';
    import { getTodos } from '@/lib/api';
    import { ApiError } from '@/lib/errors';
    import { initialState, reducer } from '@/lib/reducer';

    export default function TodoApp() {
      const [state, dispatch] = useReducer(reducer, initialState);

      useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;

        // Initial load — transitions through loading → success | error.
        dispatch({ type: 'loadStart' });
        getTodos(controller.signal).then(
          (todos) => {
            if (!cancelled) dispatch({ type: 'loadSuccess', payload: todos });
          },
          (err) => {
            if (cancelled) return;
            // AbortError on unmount is expected — drop silently.
            if (err instanceof Error && err.name === 'AbortError') return;
            const message =
              err instanceof ApiError
                ? err.message
                : 'Could not load todos. Please try again.';
            const requestId = err instanceof ApiError ? err.requestId : undefined;
            dispatch({ type: 'loadError', payload: { error: message, requestId } });
          },
        );

        // Best-effort refetch on tab visibility regain. Fails SILENTLY (no state
        // transition to 'error') per Architecture §Retry: "GET /todos on
        // visibilitychange is a best-effort refetch; it fails silently
        // (log only, no toast)."
        const onVisibility = (): void => {
          if (document.visibilityState !== 'visible') return;
          getTodos().then(
            (todos) => {
              if (!cancelled) dispatch({ type: 'loadSuccess', payload: todos });
            },
            (err) => {
              // eslint-disable-next-line no-console
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
          <div
            data-testid="todo-list-placeholder"
            data-status={state.status}
            aria-live="polite"
            className="rounded-md border border-current/10 px-4 py-8 text-center text-sm opacity-70"
          >
            The list will appear here.
          </div>
        </section>
      );
    }
    ```
  - [x] **What the visible UI looks like:** unchanged from Story 1.7. The placeholder still says "The list will appear here." — Story 1.9 is what swaps in real list-state branches. Story 1.8 ONLY wires the state machine; the render contract is preserved so 1.7's manual smoke test still passes.
  - [x] **`data-status={state.status}` attribute on the placeholder** — exposes the reducer's status to DevTools (and Story 1.9's component tests) without changing visible UI. Cheap diagnostic; Story 1.9 will inspect it during the swap to assert the state machine before the visual rendering changes.
  - [x] **`AbortController` for the initial fetch** — cancels the request if `<TodoApp />` unmounts before the response arrives. React 19 strict-mode dev runs effects twice (mount → cleanup → mount); without `AbortController` the first fetch resolves into a discarded reducer and produces a `Warning: Can't perform a React state update on an unmounted component` (React 19 still emits this in strict). With it, the cleanup `.abort()` raises an AbortError which we drop silently (`err.name === 'AbortError'`).
  - [x] **Why no `AbortController` on the visibilitychange refetch** — the refetch is fire-and-forget. If the user hides the tab mid-flight it will eventually resolve and either dispatch (no-op if `cancelled`) or fail silently. Adding a controller per refetch over-engineers a best-effort path.
  - [x] **Why `console.warn` for silent refetch failure (not Pino, not nothing)** — architecture §Communication Patterns / Logging mandates server-side Pino logs only; on the client, `console.warn` is the appropriate channel for "something happened but we're not surfacing it to the user". Story 3.5 (NFR9 safety net) will add a global `unhandledrejection` listener but that's out of scope here. NOTE — story 1.1's ESLint config does NOT ban `console` in apps/web; the original spec's defensive `eslint-disable-next-line no-console` was reported as "Unused eslint-disable directive" by the actual lint run, so the directive was removed.
  - [x] **Why both the cleanup `cancelled = true` AND `controller.abort()`** — `controller.abort()` aborts the in-flight request; `cancelled` gates the dispatch in case the promise has already resolved (after fetch returns but before the `.then` runs). Belt + suspenders against the race.
  - [x] **Why the user-facing message for non-`ApiError` errors is generic** — a `ZodError` from a malformed server response carries low-level validation details that aren't useful to a visitor. `ApiError.message` is curated by the server (Fastify-sensible's envelope) and IS user-readable. Architecture §Process Patterns: "ApiError instances with a user-facing .message".
  - [x] **DO NOT** call `getTodos` outside the `useEffect`. No render-time side effects. Architecture §Frontend Architecture: "Initial fetch on mount; refetch on visibilitychange."

- [x] **Task 7: Author `apps/web/src/lib/reducer.test.ts` (AC: #7)**
  - [x] Create [apps/web/src/lib/reducer.test.ts](../../apps/web/src/lib/reducer.test.ts):
    ```ts
    import { describe, expect, it } from 'vitest';
    import type { Todo } from '@todo-app/shared';
    import { initialState, reducer, type TodoAction } from './reducer';

    describe('initialState', () => {
      it('is { status: "idle", todos: [] }', () => {
        expect(initialState).toEqual({ status: 'idle', todos: [] });
      });
    });

    describe('reducer', () => {
      it('idle → loadStart → loading with empty todos', () => {
        const next = reducer(initialState, { type: 'loadStart' });
        expect(next).toEqual({ status: 'loading', todos: [] });
      });

      it('loading → loadSuccess → success with payload', () => {
        const todo: Todo = {
          id: '11111111-1111-4111-8111-111111111111',
          text: 'pick up milk',
          completed: false,
          createdAt: '2026-04-29T00:00:00.000Z',
        };
        const next = reducer(
          { status: 'loading', todos: [] },
          { type: 'loadSuccess', payload: [todo] },
        );
        expect(next).toEqual({ status: 'success', todos: [todo] });
      });

      it('loading → loadError → error with message and optional requestId', () => {
        const next = reducer(
          { status: 'loading', todos: [] },
          {
            type: 'loadError',
            payload: { error: 'Service unavailable', requestId: 'corr-abc' },
          },
        );
        expect(next).toEqual({
          status: 'error',
          todos: [],
          error: 'Service unavailable',
          requestId: 'corr-abc',
        });
      });

      it('loadError without requestId leaves the field undefined', () => {
        const next = reducer(initialState, {
          type: 'loadError',
          payload: { error: 'boom' },
        });
        expect(next.requestId).toBeUndefined();
      });

      it('returns the original state for an unrecognized action (defensive runtime fallback)', () => {
        // Compile-time exhaustiveness is enforced by the `never` check in the reducer's
        // default branch — adding a new TodoAction without a case fails `tsc --noEmit`.
        // At runtime, an unknown action object (e.g., from a buggy dispatch) falls
        // through to `return state` rather than throwing.
        const state = { status: 'success' as const, todos: [] };
        // Cast through `unknown` because by design this type is unrepresentable.
        const next = reducer(state, { type: 'bogus' } as unknown as TodoAction);
        expect(next).toBe(state);
      });
    });
    ```
  - [x] **Why `toBe` (not `toEqual`) on the unrecognized-action test** — `state` is the same reference; the reducer returns it untouched. `toBe` enforces reference equality, proving no spread/clone leaked in.
  - [x] **Why explicit Vitest imports** — `globals: false` in the config (Task 2). Self-documents the test runtime.
  - [x] **Why import `Todo` and use a real shape** — exercises the contract package's type. If `packages/shared`'s `TodoSchema` shape ever drifts, the test breaks at compile-time.

- [x] **Task 8: Author `apps/web/src/lib/api.test.ts` (AC: #7)**
  - [x] Create [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts):
    ```ts
    import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
    import { ApiError } from './errors';

    // The api.ts module reads NEXT_PUBLIC_API_URL at module load (top-level throw
    // if missing). vi.stubEnv MUST run BEFORE the dynamic import below.
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
      vi.resetModules();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    function mockFetchOnce(response: Response): void {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response));
    }

    describe('getTodos()', () => {
      it('issues GET with x-request-id and returns the parsed todos array on 200', async () => {
        const todo = {
          id: '11111111-1111-4111-8111-111111111111',
          text: 'pick up milk',
          completed: false,
          createdAt: '2026-04-29T00:00:00.000Z',
        };
        mockFetchOnce(
          new Response(JSON.stringify({ todos: [todo] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
        const { getTodos } = await import('./api');
        const result = await getTodos();
        expect(result).toEqual([todo]);

        const fetchMock = vi.mocked(globalThis.fetch);
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4000/todos',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'x-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/i),
            }),
          }),
        );
      });

      it('throws an ApiError carrying status, message, and requestId when the server returns a non-OK envelope', async () => {
        mockFetchOnce(
          new Response(
            JSON.stringify({
              statusCode: 503,
              error: 'Service Unavailable',
              message: 'database is unreachable',
            }),
            {
              status: 503,
              headers: {
                'content-type': 'application/json',
                'x-request-id': 'srv-correlation-xyz',
              },
            },
          ),
        );
        const { getTodos } = await import('./api');
        await expect(getTodos()).rejects.toMatchObject({
          name: 'ApiError',
          statusCode: 503,
          message: 'database is unreachable',
          requestId: 'srv-correlation-xyz',
        });
        // Defensive: the thrown thing is an actual ApiError instance.
        await expect(getTodos.bind(null)).rejects.toBeInstanceOf(ApiError);
        // (The .bind keeps the next test from sharing the same fetch-mock state;
        // this last expect re-runs the mock, so reset before.)
      });

      it('throws when the 200 body fails TodoListResponseSchema parsing (server contract drift)', async () => {
        mockFetchOnce(
          new Response(JSON.stringify({ wrong: 'shape', not_todos: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
        const { getTodos } = await import('./api');
        // ZodError surfaces — TodoApp.tsx's catch wraps it into a generic message.
        await expect(getTodos()).rejects.toThrow();
      });
    });
    ```
  - [x] **Watch-out:** the second test's `await expect(getTodos.bind(null)).rejects.toBeInstanceOf(ApiError)` line re-invokes `getTodos` after the first `mockFetchOnce` was consumed, which would call a real fetch. Either:
    - Drop that second assertion (the `toMatchObject({ name: 'ApiError', ... })` already proves the shape).
    - Or move the `mockFetchOnce` AND the import inside the `it` body so each test starts fresh.

    **Implemented choice:** dropped the second assertion. The `name: 'ApiError'` field check (via `toMatchObject`) is sufficient evidence; the `ApiError extends Error` constructor sets `this.name = 'ApiError'`, establishing subclass identity.
  - [x] **Why `vi.resetModules()` in beforeEach** — `api.ts` reads `NEXT_PUBLIC_API_URL` at module-load time. Without `resetModules`, the dynamic `import('./api')` returns the cached module (loaded once, env evaluated then). `resetModules` forces a fresh module evaluation per test so `vi.stubEnv` takes effect.
  - [x] **Why dynamic `import('./api')` (not top-of-file)** — same reason: the env stub must be in place before the module-load throw runs. Top-of-file import would evaluate before `beforeEach`.
  - [x] **Why `vi.stubGlobal('fetch', ...)` (not `globalThis.fetch = ...`)** — Vitest tracks stubs and auto-restores in `vi.unstubAllGlobals()`. Direct assignment would persist across tests if the cleanup is forgotten. Added explicit `vi.unstubAllGlobals()` to `afterEach` for the same hygiene.
  - [x] **Why we don't test `crypto.randomUUID` directly** — the assertion `expect.stringMatching(/^[0-9a-f-]{36}$/i)` against the header value proves a UUID was generated. Native `crypto.randomUUID()` is a platform contract; we're not in the business of testing the platform.

- [x] **Task 9: Add `apps/web/.env.example` consumer note + verify `NEXT_PUBLIC_API_URL` is wired (AC: #1, #5)**
  - [x] Verify [apps/web/.env.example](../../apps/web/.env.example) — Story 1.3 already added `NEXT_PUBLIC_API_URL=http://localhost:4000` to the **root** `.env.example`. Next.js reads from the workspace's local `.env` files when running `next dev`/`next build`, so a copy at `apps/web/.env.example` is helpful for clarity:
    ```
    # Copy to apps/web/.env.local for local development.
    # In production, the deploy target injects this directly.
    NEXT_PUBLIC_API_URL=http://localhost:4000
    ```
  - [x] Verify [apps/web/.gitignore](../../apps/web/.gitignore) ignores `.env*` (Next.js convention; create-next-app from Story 1.1 should already do this — confirm). NOTE — confirmed [apps/web/.gitignore](../../apps/web/.gitignore) already had `.env*` from the Next.js scaffold AND the repo-root [.gitignore](../../.gitignore) covers `.env`/`.env.local`/`.env.*.local`. Issue: the Next.js `.env*` pattern was also masking the `apps/web/.env.example` we just created. Added `!.env.example` exception below the existing `.env*` line so the template is committed while real env files stay ignored.
  - [x] **Watch-out:** Next.js loads `.env.local` from the **workspace root that Next runs in** — i.e., `apps/web/.env.local`, NOT the repo root `.env`. The repo root `.env` is for the API. If this is the dev's first time running `npm run dev --workspace apps/web`, they need to either:
    - Copy `apps/web/.env.example` to `apps/web/.env.local` (preferred — explicit per-workspace).
    - OR set `NEXT_PUBLIC_API_URL` in their shell before invoking `next dev`.
    Story 1.10 will own the single-command orchestration that abstracts this; for now, document in the story.

- [x] **Task 10: Sanity gates — no regressions, all new tests pass (AC: all)**
  - [x] **Type-check:** `(cd apps/web && npx tsc --noEmit)` → exit 0. The `_exhaustive: never` check in the reducer (AC #4) is the implicit unit test for action union completeness. PASS.
  - [x] **Lint:** `npm run lint --workspace apps/web` → exit 0, 0 warnings, 0 errors. PASS.
  - [x] **Web tests:** `npm test --workspace apps/web` → 9 passed (6 reducer + 3 api). PASS.
  - [x] **Build:** `NEXT_PUBLIC_API_URL=http://localhost:4000 npm run build --workspace apps/web` → exit 0. Compiled successfully in 3.7s, TS check 1234ms, 4/4 static pages generated. PASS.
  - [x] **Shared package regression:** `npm test --workspace packages/shared` → 25/25 still pass. PASS.
  - [x] **API regression:** `npm test --workspace apps/api` → 19/19 still pass (with `docker compose up -d db` running for integration tests; Postgres reported `Up 5 hours (healthy)`). PASS.
  - [ ] **End-to-end smoke test (manual; requires running API):**
    1. `cd apps/api && docker compose up -d db && npm run db:migrate && npm run dev` → API on :4000.
    2. `cd apps/web && npm run dev` → web on :3000.
    3. Open [http://localhost:3000](http://localhost:3000). Page renders the same placeholder as Story 1.7.
    4. **DevTools Network tab:** confirm a `GET http://localhost:4000/todos` fires on page load, with `x-request-id: <UUID>` request header, and a `200 {"todos":[]}` response.
    5. **DevTools Console:** zero errors, zero hydration warnings (AC #6 from Story 1.7 still applies).
    6. **Visibility refetch test:** in DevTools Console, run `document.dispatchEvent(new Event('visibilitychange'))` — confirm a second `GET /todos` fires in the Network tab.
    7. **Failure path manual test:** stop the API (`docker compose stop db` to break /health, OR Ctrl-C the API process). Reload the page — Network tab shows `fetch` rejected (CORS or connection refused). DevTools Elements shows `<div data-testid="todo-list-placeholder" data-status="error">` (the data attribute confirms the reducer transitioned correctly even though the visible UI is unchanged in 1.8).

- [ ] **Task 11: Commit** — DEFERRED to user. Per project convention (Stories 1.5–1.7), the user reviews the working tree and runs the commit; this dev agent leaves staging untouched. Manual smoke test (Task 10 final subtask) is also deferred to the user since it requires running both `apps/api` and `apps/web` dev servers.
  - [ ] Stage exactly:
    - **New:** [apps/web/vitest.config.mts](../../apps/web/vitest.config.mts) (renamed from `.ts` — see Task 2 note), [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts), [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts), [apps/web/src/lib/errors.ts](../../apps/web/src/lib/errors.ts), [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts), [apps/web/src/lib/reducer.test.ts](../../apps/web/src/lib/reducer.test.ts), [apps/web/.env.example](../../apps/web/.env.example).
    - **Modified:** [apps/web/package.json](../../apps/web/package.json) (deps + scripts), [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx), root `package-lock.json`.
  - [ ] Commit message: `feat(web): typed api client + load reducer + ApiError + visibility refetch (Story 1.8)`
  - [ ] **Do NOT** stage anything in `apps/api/`, `packages/shared/`, or other unrelated paths. If `git status` shows surprises, investigate before staging.

## Dev Notes

### Where this story sits

Story 1.8 introduces the **first end-to-end load path** between web and API. After this story, the dev tools' Network tab shows a real `GET /todos` request with proper correlation, but the visible UI is unchanged from Story 1.7 (the placeholder still says "The list will appear here"). Story 1.9 swaps the placeholder for actual list-state rendering.

| Story | Reuses from this story |
| ----- | ---------------------- |
| 1.9   | Replaces the placeholder `<div>` with branches keyed off `state.status`: loading skeleton (or simple "loading…" copy), empty state, populated `<ul>` of `<TodoItem>`s, error message. Will switch Vitest's `environment` to `jsdom` and add RTL deps. |
| 2.4   | Extends [reducer.ts](../../apps/web/src/lib/reducer.ts) with optimistic mutation actions (`addOptimistic`, `addReconcile`, `addFailed`, `toggleOptimistic`, `toggleFailed`, `deleteOptimistic`, `deleteFailed`). The exhaustiveness `never` check from this story will catch any missed mutation case. |
| 2.5   | Adds `createTodo(input: CreateTodoRequest): Promise<Todo>` to [api.ts](../../apps/web/src/lib/api.ts), following the same `x-request-id` + `ApiError.fromResponse` pattern as `getTodos`. |
| 2.6   | Adds `updateTodoCompleted(id, completed)`. |
| 2.7   | Adds `deleteTodo(id)`. |
| 3.1   | `<Toast />` consumes `state.error` — the field is already in `TodoState` from this story. |
| 3.4   | Initial-load error retry button — reads `state.status === 'error'` and re-dispatches the same effect from Task 6. Architecture's "user retries by repeating the action" pattern. |

### Critical architectural guardrails (bind these hard)

- **All HTTP through `api.ts`.** Components never call raw `fetch`. Architecture §Communication Patterns: "All requests go through `apps/web/src/lib/api.ts`. Components never call raw `fetch`." [Source: architecture.md#Communication Patterns].
- **`ApiError` is the only error type components see.** `api.ts` translates HTTP envelopes and ZodError parse failures into `ApiError` (or, for ZodError, lets it bubble — but `TodoApp.tsx` catches non-`ApiError` errors and uses a generic message). UI never renders stack traces. [Source: architecture.md#Process Patterns — Error handling (client)].
- **`x-request-id` per request.** UUID generated client-side, sent on outgoing fetch, captured from response headers on `ApiError`. Server (Story 1.5) honors the header verbatim if it matches the SAFE_REQUEST_ID regex; this story's `crypto.randomUUID()` always produces a UUID-shape value, so the server preserves it for log correlation. [Source: architecture.md#Communication Patterns; Story 1.5 review patches].
- **One reducer, exhaustive switch.** Discriminated union via TS; `default` branch enforces compile-time exhaustiveness via `never` assignment. [Source: architecture.md#Communication Patterns — "Discriminated unions via TS; reducer.ts exhaustive-checks the switch"].
- **Loading state is for empty initial load only.** The reducer's `loading` status starts with `todos: []`. Once mutations land in Story 2.4, mutations apply optimistically without flipping `status`. Architecture §Loading state: "One state per async operation: `status: 'idle' | 'loading' | 'error'` on the reducer state (initial load only). Mutations do not introduce separate loading flags".
- **Visibility refetch fails silently.** No state transition to `error`, no toast, just `console.warn`. Architecture §Retry: "GET /todos on visibilitychange is a best-effort refetch; it fails silently (log only, no toast)."
- **No retries, no backoff, no queue.** v1 has no automatic recovery. User-initiated retry (re-mount, refresh, or Story 3.4's button) is the only recovery path. [Source: architecture.md#Process Patterns — Retry].

### Why Vitest now (resolves Architecture Known Gap)

Architecture flagged "Web app test tooling is not pinned" with a recommended resolution of "Vitest + React Testing Library". Story 1.7 deferred the decision because the shell had nothing to test. Story 1.8 has explicit AC #7 demanding `reducer.test.ts` and `api.test.ts` — so this is the natural moment to pin the framework.

**Decision: Vitest 2.x + (later) React Testing Library + jsdom.**

- This story adds **Vitest 2.x and `vite-tsconfig-paths` only**. Pure-TS tests run in Vitest's `node` environment.
- Story 1.9 will add **`jsdom` (or `happy-dom`), `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`** when component tests land.
- Vitest 2.x rather than 3.x because the 3.x line introduced a config-format break in early 2026 and is still settling. Pin 2.x for predictable upgrades; revisit when 3.x's surface stabilizes.
- Vitest rather than `node:test` (which `apps/api` uses) because:
  - Story 1.9 needs JSX support, which `node:test` lacks.
  - Vitest's mock APIs (`vi.fn`, `vi.stubGlobal`, `vi.stubEnv`) are well-suited to fetch/env stubbing.
  - One test runner per workspace minimizes context switching.

[Source: architecture.md#Architecture Validation Results — Gap Analysis Results].

### Why no `apps/web` "type": "module" (yet)

`apps/api` got `"type": "module"` in Story 1.5's review (resolves the deferred Module-type decision). `apps/web`'s `package.json` does NOT have `"type": "module"` and **shouldn't** in this story:

- Next.js manages its own ESM/CJS choices via the bundler; it doesn't care about the package-level `type` field for source files inside the App Router.
- Adding `"type": "module"` would make `vitest.config.ts` need explicit `.ts` extensions, change how `next.config.ts` loads, and require updating ESLint's `parserOptions.ecmaVersion`. None of those changes pay back in this story.
- Vitest handles TS imports (with the path-alias plugin) regardless of the `type` field.

If a future story (e.g., 1.11 production Dockerfile) needs a different choice, that's the time to revisit.

### `NEXT_PUBLIC_API_URL` and Next.js env-var semantics

- Next.js inlines `NEXT_PUBLIC_*` env vars at **build time**. The value baked into the production bundle is whatever `process.env.NEXT_PUBLIC_API_URL` was at `next build` time. This is the architecture's intent — the deployed bundle has a fixed API base URL.
- For dev (`next dev`), Next.js reads from `apps/web/.env.local` (or `.env`, `.env.development.local`, etc., per Next's resolution order) at server start.
- The repo-root `.env` is for `apps/api` (DATABASE_URL, etc.) and is NOT picked up by `next dev` — it's a workspace-local concern.
- Task 9 adds `apps/web/.env.example` so the dev knows which file to copy. Don't conflate with `apps/api/.env` (different concern).
- Production deployment passes `NEXT_PUBLIC_API_URL` via the platform's build-time env injection (Story 1.11).

### `crypto.randomUUID` browser support and FR33

- Architecture's FR33 commits to React 19 + Next 16 + ES2020+ — modern browsers only.
- `crypto.randomUUID()` is supported in Chrome 92+, Safari 15.4+, Firefox 95+, Edge 92+ — all widely available since 2021.
- A polyfill (e.g., `uuid` v9+) would add ~5 KB gzipped for zero gain. Skip.
- If `crypto.randomUUID` is undefined at runtime, the failure surfaces as a `TypeError` on first request — loud failure, easy to diagnose. We don't try/catch around it because there's no recovery path on a browser too old to support modern web APIs.

### `@todo-app/shared` consumption from `apps/web`

- `packages/shared` is precompiled to `dist/` via its `prepare: tsc` hook (Story 1.2). `apps/web` imports `TodoListResponseSchema`, `ErrorResponseSchema`, and the `Todo` type from `@todo-app/shared` and gets the `dist/index.js` ESM build with `dist/index.d.ts` types.
- The shared package is `"type": "module"`. Next.js bundles it for the browser without issue (its ESM transform handles workspace deps).
- Vitest also handles the workspace ESM dep — `vite-tsconfig-paths` resolves `@/lib/...`, and `node_modules` resolution finds `@todo-app/shared` directly.
- **DO NOT** import from `@todo-app/shared/src/contracts` — only from the package root. The internal path is not part of the package's exports surface.

### Story 1.5/1.6/1.7 carry-overs and non-goals

- **CORS** is server-side function-mode (Story 1.5 review) — locks to `http://localhost:3000`. The web dev server runs on that exact origin, so the browser will succeed. No CORS friction expected.
- **Rate-limit** server-side is 100 req/min/IP. The visibility-refetch path is bursty in theory (every tab focus); in practice 100/min is plenty for a single user.
- **Helmet's CSP is off** (Story 1.5). No CSP-related fetch rejection from the API side.
- **Story 1.6's `/docs` and `/health`** are not consumed by the web tier in v1. `api.ts` only owns `getTodos` in this story; future stories add the mutation calls but do NOT call `/health`.
- **`<TodoApp />`** from Story 1.7 is the only file in `apps/web/src/components/` and stays intact except for the `useEffect`/`useReducer` wiring added in Task 6. The visible UI doesn't change in this story.
- **Web bundle budget (NFR4: ≤200 KB gzipped initial JS)** is informational only in v1. The new lib code is small; expect well-under-budget. Story 1.11 may add `@next/bundle-analyzer` and decide whether to add a CI gate.

### Out-of-scope (do NOT do in this story)

- ❌ **No `createTodo`, `updateTodoCompleted`, `deleteTodo`** in `api.ts` — Stories 2.5/2.6/2.7.
- ❌ **No mutation reducer actions** (`addOptimistic`, etc.) — Story 2.4.
- ❌ **No `<TodoList />`, `<TodoItem />`, `<TodoInput />`, `<Toast />`** components — Stories 1.9, 2.5, 3.1.
- ❌ **No Radix UI primitives** — Stories 1.9 (Toast) and 2.6 (Checkbox).
- ❌ **No jsdom, no @testing-library/*, no @vitejs/plugin-react** — Story 1.9 owns those when component tests land.
- ❌ **No global `unhandledrejection` handler** — Story 3.5 (NFR9 safety net).
- ❌ **No retry / backoff / queue** in `api.ts` — architecture forbids in v1.
- ❌ **No automatic visibility-refetch debouncing** — fire on every visibilitychange-to-visible. If users observe rapid-fire refetches in v2, optimize then.
- ❌ **No `AbortSignal` plumbing through `<TodoApp />` props** — `getTodos` accepts an optional `signal` for the initial-load abort, but the visibility-refetch is fire-and-forget.
- ❌ **No `npm run start` regression check** — Next.js production server (`next start` after `next build`) requires `NEXT_PUBLIC_API_URL` to be set at build time. Manual testing of the prod build is Story 1.11's responsibility.
- ❌ **No `apps/api/**` or `packages/shared/**` modifications** — story is web-only.
- ❌ **No `.env.local` checked into source control** — `.gitignore` already handles this (Story 1.1 standard scaffold).
- ❌ **No Storybook, MSW (Mock Service Worker), or contract-test infrastructure** — vitest with `vi.stubGlobal('fetch', ...)` is sufficient for the API tests at this scope.
- ❌ **No SWR / TanStack Query / React Query introduction** — architecture explicitly excludes these in v1.

### Project Structure Notes

Target additions/modifications:

```text
apps/web/
├── package.json                              # +devDeps: vitest, vite-tsconfig-paths; +scripts: test, test:watch
├── vitest.config.ts                          # NEW — tsconfig-paths, environment: 'node'
├── .env.example                              # NEW — apps/web-local NEXT_PUBLIC_API_URL stub
└── src/
    ├── components/
    │   └── TodoApp.tsx                       # MODIFIED — useReducer + useEffect + visibilitychange wiring
    └── lib/                                  # NEW directory
        ├── api.ts                            # NEW — getTodos, x-request-id, ApiError translation
        ├── api.test.ts                       # NEW — success / parse-fail / HTTP-error
        ├── errors.ts                         # NEW — ApiError class, fromResponse
        └── reducer.ts                        # NEW — load-only state + actions + exhaustive switch
        └── reducer.test.ts                   # NEW — initial state, all 3 transitions, exhaustiveness fallback
```

- **Alignment:** matches [Architecture §Complete Project Directory Structure](../../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure) for `apps/web/src/lib/{api,reducer,errors}.ts`.
- **Variances at end of Story 1.8:**
  - No `apps/web/src/components/{TodoList,TodoItem,Toast}.tsx` — Stories 1.9 and 3.1.
  - No `apps/web/src/components/TodoApp.test.tsx` — Story 1.9 introduces RTL infrastructure.
  - No `apps/web/Dockerfile` — Story 1.11.
- **Pre-existing files NOT modified by this story:**
  - [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx), [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx), [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css) (Story 1.7).
  - [apps/web/next.config.ts](../../apps/web/next.config.ts), [apps/web/postcss.config.mjs](../../apps/web/postcss.config.mjs), [apps/web/tsconfig.json](../../apps/web/tsconfig.json) (Story 1.1).
  - All of `apps/api/**` and `packages/shared/**`.

### Testing Requirements

- **Unit tests** ([reducer.test.ts](../../apps/web/src/lib/reducer.test.ts), [api.test.ts](../../apps/web/src/lib/api.test.ts)) — Vitest in `node` environment. Reducer tests are pure-function transitions; api tests use `vi.stubGlobal('fetch', ...)` and `vi.stubEnv`. All assertions via Vitest's `expect` (not `node:assert`).
- **Type-checking** is the implicit unit test for the reducer's exhaustiveness (`never` check) and the api wrapper's contract types.
- **Manual end-to-end smoke test** (Task 10) is the integration confidence check at this scope. Story 1.9's component tests will exercise the `<TodoApp />` wire from a higher layer; cross-tier real-fetch tests are deferred (Epic 3 owns journey-level resilience tests).
- **No coverage threshold or CI gate** — v1 doesn't enforce coverage. Story 1.11 may revisit.

### References

- [Source: epics.md#Story 1.8: Typed API client, error types, and load reducer] — original BDD acceptance criteria.
- [Source: architecture.md#API & Communication Patterns] — endpoint shapes, error envelope, correlation ID design.
- [Source: architecture.md#Communication Patterns — Client → Server] — "All requests go through `apps/web/src/lib/api.ts`. Components never call raw `fetch`."
- [Source: architecture.md#Communication Patterns — Reducer actions] — discriminated unions via TS; exhaustiveness check.
- [Source: architecture.md#Process Patterns — Error handling (client)] — `ApiError` class with `.message` and `.statusCode`; components catch via `try/catch`.
- [Source: architecture.md#Process Patterns — Loading state] — `status: 'idle' | 'loading' | 'error'` for initial load only.
- [Source: architecture.md#Process Patterns — Retry] — visibilitychange refetch fails silently.
- [Source: architecture.md#Frontend Architecture] — `<TodoApp />` is the only stateful component; owns reducer + all `api.ts` calls.
- [Source: architecture.md#Architecture Validation Results — Gap Analysis Results] — "Web app test tooling is not pinned"; this story resolves it by pinning Vitest.
- [Source: architecture.md#Pattern Examples — Good api.ts] — the canonical `createTodo` snippet (line 449); `getTodos` follows the same shape sans body.
- [Source: prd.md#FR8, FR10, FR12] — list rendering, ordering, loading-state requirements.
- [Source: prd.md#FR16] — reducer reconciles from server on fetch.
- [Source: prd.md#FR22] — `GET /todos` endpoint (consumed here).
- [Source: prd.md#FR33] — modern-browser baseline (drives `crypto.randomUUID` decision).
- [Source: prd.md#NFR16, NFR17] — server-side validation (already in place); client-side rendering safety (React JSX escaping).
- [Source: prd.md#NFR24] — server logs diagnosable; web `ApiError.requestId` echoes the API correlation ID for cross-tier debugging.
- [Story 1.2 file] — `TodoListResponseSchema`, `ErrorResponseSchema`, `Todo` type in `@todo-app/shared`.
- [Story 1.3 file] — `.env.example` at root with `NEXT_PUBLIC_API_URL`.
- [Story 1.5 file] — server `x-request-id` echo + safe-id regex; CORS function-mode pinned to `http://localhost:3000`; rate-limit 100/min/IP.
- [Story 1.7 file] — `<TodoApp />` shell + placeholder; `data-testid="todo-list-placeholder"` selector reserved for Story 1.9.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — claude-opus-4-7[1m]

### Debug Log References

- `vite-tsconfig-paths@5` is ESM-only; `apps/web/package.json` is not `"type": "module"` (per the architecture decision in Dev Notes §"Why no apps/web 'type': 'module'"). First Vitest run failed with `"vite-tsconfig-paths" resolved to an ESM file. ESM file cannot be loaded by 'require'`. Resolved by renaming `vitest.config.ts` → `vitest.config.mts` so Node loads it as ESM. The `tsconfig.json` `include` already covers `**/*.mts`. No `"type": "module"` change to `apps/web/package.json` (architecture guardrail preserved).
- ESLint reported the spec's defensive `// eslint-disable-next-line no-console` (above the silent-refetch `console.warn`) as `Unused eslint-disable directive` — the `no-console` rule is not active in `apps/web`'s flat config. Removed the directive; lint exits clean.
- Added `void _exhaustive;` after the `const _exhaustive: never = action` line in `reducer.ts` so the unused-local check stays quiet without weakening the compile-time exhaustiveness assertion.

### Completion Notes List

- All 7 acceptance criteria satisfied:
  - **AC #1** (`api.ts` `getTodos`): `GET ${NEXT_PUBLIC_API_URL}/todos` with fresh-per-call `crypto.randomUUID()` `x-request-id` header, parses `TodoListResponseSchema` on 200, throws `ApiError.fromResponse(response)` on non-OK. Verified by `api.test.ts` "issues GET with x-request-id…" + "throws an ApiError…".
  - **AC #2** (`ApiError`): subclasses `Error`, carries `statusCode`/`message`/`requestId?`/`code?`, `static async fromResponse` reads `x-request-id` header and parses `ErrorResponseSchema.safeParse` with a generic-message fallback.
  - **AC #3** (reducer state machine): `initialState` is `{ status: 'idle', todos: [] }`; transitions for `loadStart` / `loadSuccess` / `loadError` match spec exactly. Verified by 4 reducer tests.
  - **AC #4** (compile-time exhaustiveness): `default` branch contains `const _exhaustive: never = action`. `tsc --noEmit` passes; adding a new union member without a `case` would fail type-check.
  - **AC #5** (`<TodoApp />` mount): `useEffect` dispatches `loadStart` → calls `api.getTodos(controller.signal)` → `loadSuccess` or `loadError`. `AbortError` on unmount is dropped silently; non-`ApiError` errors get a generic user-facing message.
  - **AC #6** (visibilitychange refetch): `document.addEventListener('visibilitychange', …)` gated by `document.visibilityState === 'visible'`; success dispatches `loadSuccess`; failure logs via `console.warn` only — no `loadError` transition.
  - **AC #7** (tests): 6 reducer tests + 3 api tests = 9 total, all passing in Vitest 2.1.9 in `node` environment.
- Sanity gates summary: `tsc --noEmit` clean, `eslint` 0/0, `vitest run` 9/9, `next build` OK, `packages/shared` 25/25, `apps/api` 19/19. No regressions.
- Manual end-to-end smoke test (Task 10's last subtask: dual dev-server run with DevTools Network observation) deferred to user — both `apps/api` and `apps/web` dev servers required.
- Task 11 (commit) intentionally not executed by this dev agent, per project convention from prior stories. Working tree is left ready for the user to review and commit.

### File List

**New:**

- [apps/web/vitest.config.mts](../../apps/web/vitest.config.mts)
- [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts)
- [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts)
- [apps/web/src/lib/errors.ts](../../apps/web/src/lib/errors.ts)
- [apps/web/src/lib/reducer.ts](../../apps/web/src/lib/reducer.ts)
- [apps/web/src/lib/reducer.test.ts](../../apps/web/src/lib/reducer.test.ts)
- [apps/web/.env.example](../../apps/web/.env.example)

**Modified:**

- [apps/web/package.json](../../apps/web/package.json) — added `vitest`, `@vitest/ui`, `vite-tsconfig-paths` to devDependencies; added `test` and `test:watch` scripts.
- [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) — added `useReducer` + `useEffect` initial-load wiring with `AbortController`, visibilitychange refetch, and `data-status={state.status}` diagnostic attribute.
- [apps/web/.gitignore](../../apps/web/.gitignore) — added `!.env.example` exception so the new `apps/web/.env.example` template is committed (the existing `.env*` line was masking it).
- [package-lock.json](../../package-lock.json) — `npm install` of new web devDependencies.

### Change Log

| Date | Author | Change |
| ---- | ------ | ------ |
| 2026-04-29 | Claude Opus 4.7 (Create-Story) | Story 1.8 contexted; status `backlog` → `ready-for-dev`. |
| 2026-04-29 | Claude Opus 4.7 (Dev-Story) | Implemented Story 1.8 (Tasks 1–10). Added Vitest 2.1 + `vite-tsconfig-paths`; authored `apps/web/src/lib/{api,errors,reducer}.ts` and matching `*.test.ts`; wired `<TodoApp />` to `useReducer` + visibilitychange refetch with silent-failure logging. All sanity gates green: tsc, eslint, vitest 9/9, next build, packages/shared 25/25, apps/api 19/19. Status `ready-for-dev` → `in-progress` → `review`. Note: `vitest.config.ts` renamed to `.mts` to load `vite-tsconfig-paths` as ESM without forcing `"type": "module"` on apps/web. Task 11 (commit) and the manual end-to-end smoke test deferred to user. |
