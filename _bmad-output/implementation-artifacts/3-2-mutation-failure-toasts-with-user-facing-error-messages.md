# Story 3.2: Mutation failure toasts with user-facing error messages

Status: done

## Story

As a user,
I want a clear, non-technical message when a mutation fails,
So that I know what happened and what to do next without seeing stack traces or server-side jargon (FR18, FR21).

## Acceptance Criteria

1. **Given** `apps/web/src/lib/errors.ts`, **when** `ApiError.fromResponse(response)` is invoked, **then** it returns an `ApiError` whose `.message` is a human-readable string derived from the status code, not a raw server envelope, **and** the mapping is: network failure → "You're offline. Your change wasn't saved."; `400` → "That change couldn't be saved."; `404` → "This todo no longer exists."; `429` → "Too many requests — please wait a moment."; `5xx` or unknown → "Something went wrong. Please try again.", **and** `.statusCode` and `.requestId` remain populated for diagnostics (not shown to the user).

2. **Given** `api.ts` mutation calls (`createTodo`, `updateTodo`, `deleteTodo`) throw `ApiError`, **when** a mutation handler in `TodoApp` catches the error, **then** after dispatching the corresponding `{intent}Failed` action, it dispatches `errorShown({ message: error.message })`.

3. **Given** two mutations fail in rapid succession, **when** the reducer processes both `errorShown` actions, **then** `state.toast` reflects only the most recent message, **and** the Toast visually updates to show the latest message (single-toast model).

4. **Given** a mutation succeeds, **when** it completes, **then** no Toast is shown, **and** any currently-displayed failure Toast is NOT auto-dismissed by the success (it continues to honor its own duration or user dismissal).

5. **Given** any mutation failure flow, **when** the Toast renders, **then** the Toast text contains NO part of a raw server envelope, no status code digits, no stack trace, and no URL, **and** its content is readable by a non-technical user.

6. **Given** `ApiError.requestId` is populated from the response `x-request-id` header, **when** the failure is processed, **then** the requestId is logged at the client console `debug` level only, **and** never rendered in the Toast.

7. **Given** `api.test.ts` and mutation handler tests in `TodoApp.test.tsx`, **when** Vitest runs, **then** tests cover each error mapping (network, 400, 404, 429, 500) produces the correct user-facing message, **and** no raw server messages leak into the Toast.

_(ACs #2-7 verbatim from [epics.md:1064-1105](../planning-artifacts/epics.md#L1064-L1105). AC #1 above deliberately drops epics.md's "derived from the status code **and response body**" clause down to "derived from the status code" alone — Task 1's `messageForStatus()` design (see its "Critical" bullet below) requires `.message` to be status-only and never body-derived; epics.md's literal wording is inconsistent with its own mapping table, which lists no body-dependent cases.)_

## Tasks / Subtasks

- [x] **Task 1: Add status-code → human-message mapping + `networkFailure()` factory to `errors.ts` (AC: #1, #6)**
  - [x] Edit [apps/web/src/lib/errors.ts](../../apps/web/src/lib/errors.ts). Target end-state:

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
        // Preserve `instanceof ApiError` when down-compiled.
        Object.setPrototypeOf(this, ApiError.prototype);
      }

      static async fromResponse(response: Response): Promise<ApiError> {
        const requestId = response.headers.get('x-request-id') ?? undefined;
        const message = messageForStatus(response.status);
        // `code` is diagnostic-only (never shown to the user) — kept from
        // the server envelope when present, e.g. for future log correlation.
        let code: string | undefined;
        try {
          const body: unknown = await response.json();
          const parsed = ErrorResponseSchema.safeParse(body);
          if (parsed.success) code = parsed.data.code;
        } catch {
          // No JSON body, or it didn't match the envelope shape. `.message`
          // is already status-derived above — this catch only affects `code`.
        }
        return new ApiError({
          statusCode: response.status,
          message,
          requestId,
          code,
        });
      }

      // No HTTP response was ever received (fetch() itself rejected — DNS
      // failure, offline, connection refused). Distinct from fromResponse,
      // which requires a Response object. `statusCode: 0` is the sentinel
      // for "no response."
      static networkFailure(): ApiError {
        return new ApiError({
          statusCode: 0,
          message: "You're offline. Your change wasn't saved.",
        });
      }
    }

    function messageForStatus(statusCode: number): string {
      switch (statusCode) {
        case 400:
          return "That change couldn't be saved.";
        case 404:
          return 'This todo no longer exists.';
        case 429:
          return 'Too many requests — please wait a moment.';
        default:
          return 'Something went wrong. Please try again.';
      }
    }
    ```

  - [x] **Critical — `.message` is now ALWAYS status-derived, never the server's raw `message` field.** The current implementation returns `parsed.data.message` (the server's literal string, e.g. `"text must be at least 1 character"`) when the body matches `ErrorResponseSchema`. AC #1 replaces this entirely — `messageForStatus()` is the only source of `.message` for any non-ok HTTP response, regardless of whether the body parses. The server's `message` field is no longer read into `ApiError.message` at all (only `code` is still extracted from the body, for diagnostics).
  - [x] Do NOT add a case for every HTTP status you can think of. The AC's mapping table is exactly four cases (400/404/429/default-covers-5xx-and-everything-else) — `default` intentionally catches 401/403/422/5xx/anything unlisted. Do not special-case 5xx separately from "unknown"; the AC groups them together under one message.
  - [x] `statusCode: 0` for `networkFailure()` is a deliberate sentinel meaning "no HTTP response was received." Do not use `NaN`, `-1`, or leave it `undefined` (the field is required on `ApiErrorOptions`).

- [x] **Task 2: Wrap fetch-level network failures for the three mutation functions in `api.ts` (AC: #1)**
  - [x] Edit [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts). In `createTodo`, `updateTodo`, and `deleteTodo` ONLY (not `getTodos`), wrap the `await fetch(...)` call in try/catch:

    ```ts
    export async function createTodo(
      text: string,
      signal?: AbortSignal,
    ): Promise<Todo> {
      const requestId = newRequestId();
      let response: Response;
      try {
        response = await fetch(`${API_URL}/todos`, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-request-id': requestId,
          },
          body: JSON.stringify({ text }),
          signal,
        });
      } catch {
        throw ApiError.networkFailure();
      }

      if (!response.ok) {
        throw await ApiError.fromResponse(response);
      }
      // ...rest of the function (response body parsing) is UNCHANGED.
    }
    ```

    Apply the identical `let response: Response; try { response = await fetch(...) } catch { throw ApiError.networkFailure(); }` wrapper to `updateTodo` and `deleteTodo`'s own `fetch(...)` calls. Every other line in all three functions (headers, body, the `!response.ok` branch, the schema-validation branch) is unchanged.
  - [x] **Do NOT wrap `getTodos()`'s fetch call.** `networkFailure()`'s message text ("Your change wasn't saved") is mutation-specific and would be misleading for an initial-load failure. `getTodos`'s own network/error UX belongs to Story 3.4 (retry-button initial-load recovery) — leave `getTodos` exactly as it is today. It still benefits indirectly from Task 1's `messageForStatus()` mapping for non-ok HTTP responses (that part of `errors.ts` is shared infrastructure), which is a harmless side effect, not new scope — no code in `getTodos` or `TodoList.tsx` changes.
  - [x] No caller currently passes an `AbortSignal` to `createTodo`/`updateTodo`/`deleteTodo` (only `getTodos` receives one, from `TodoApp`'s effect). This catch-all `catch { throw ApiError.networkFailure(); }` is therefore safe today — there's no `AbortError` case to special-case out. If a future story ever passes a signal into a mutation call, that story must add an `AbortError` carve-out before relying on this catch block; do not add speculative handling for it now.

- [x] **Task 3: Update `api.test.ts` for the new mapped messages + add network-failure coverage (AC: #1, #7)**
  - [x] Edit [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts). Every existing test that asserts `.message` equals a raw server string on a non-ok response now asserts the mapped message instead. Specifically:
    - `getTodos()` "throws an ApiError carrying status, message, and requestId..." (503 case): `message: 'database is unreachable'` → `message: 'Something went wrong. Please try again.'`
    - `createTodo()` "throws ApiError with status, message, and requestId..." (400 case): `message: 'text must be at least 1 character'` → `message: "That change couldn't be saved."`
    - `updateTodo()` "throws ApiError with status, message, and requestId when the server returns 404": `message: 'todo not found'` → `message: 'This todo no longer exists.'`
    - `deleteTodo()` "throws ApiError with status, message, and requestId when the server returns 404": `message: 'todo not found'` → `message: 'This todo no longer exists.'`
    - Any test asserting a 500 response's message (there are several "requestId === undefined" tests using 500) — if they don't currently assert `.message`, leave them; if the story author adds a message assertion, use `'Something went wrong. Please try again.'`.
    - Do NOT change the two "malformed JSON in successful response" / "did not match the expected ... schema" tests in `createTodo()`/`updateTodo()` — those messages are constructed directly in `api.ts` (not via `ApiError.fromResponse`) and are out of this story's AC scope (see Dev Notes → "Known gap, explicitly deferred").
  - [x] Add new test cases to each of `createTodo()`, `updateTodo()`, `deleteTodo()`'s `describe` blocks: mock `fetch` to reject (`vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))`), call the function, and assert it rejects with `{ name: 'ApiError', statusCode: 0, message: "You're offline. Your change wasn't saved." }`. Do NOT add this test to `getTodos()` — that function isn't wrapped (Task 2).
  - [x] Add one test per mutation function for the `429` mapping (`statusCode: 429` → `message: 'Too many requests — please wait a moment.'`) since no existing test in this file exercises 429.

- [x] **Task 4: Add `errors.test.ts` — direct unit coverage of the mapping table (AC: #1, #7)**
  - [x] Create `apps/web/src/lib/errors.test.ts`. This is a NEW file — no test currently exercises `errors.ts` in isolation (existing coverage is indirect, via `api.test.ts`'s `fromResponse` call sites). Cover, using `new Response(JSON.stringify({...}), { status, headers })` fixtures like `api.test.ts` already does:
    - `fromResponse` on a 400 response → `.message === "That change couldn't be saved."`
    - `fromResponse` on a 404 response → `.message === 'This todo no longer exists.'`
    - `fromResponse` on a 429 response → `.message === 'Too many requests — please wait a moment.'`
    - `fromResponse` on a 500 response → `.message === 'Something went wrong. Please try again.'`
    - `fromResponse` on an unmapped status (e.g. 403) → `.message === 'Something went wrong. Please try again.'` (default-bucket case)
    - `fromResponse` preserves `.statusCode` and `.requestId` from the response regardless of the mapped message
    - `fromResponse` extracts `.code` from a well-formed `ErrorResponseSchema` body when present, and leaves `.code` `undefined` when the body doesn't parse or is missing
    - `networkFailure()` → `.statusCode === 0`, `.message === "You're offline. Your change wasn't saved."`, `.requestId === undefined`
  - [x] Follow `api.test.ts`'s existing `Response` fixture style (no need for `vi.stubEnv`/`vi.resetModules()` here — `errors.ts` doesn't read `NEXT_PUBLIC_API_URL`).

- [x] **Task 5: Wire `TodoApp.tsx` mutation handlers to dispatch `errorShown` (AC: #2, #5, #6)**
  - [x] Edit [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx). In each of `handleAdd`, `handleToggle`, `handleDelete`'s rejection callback: keep the existing `{intent}Failed` dispatch FIRST (unchanged), then log the requestId at `debug` level, then dispatch `errorShown`. Target shape for `handleAdd` (apply the identical pattern to `handleToggle`'s and `handleDelete`'s rejection callbacks):

    ```tsx
    const handleAdd = useCallback((text: string): void => {
      const tempId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      dispatch({ type: 'addOptimistic', payload: { tempId, text, createdAt } });
      createTodo(text).then(
        (todo) => {
          dispatch({ type: 'addReconcile', payload: { tempId, todo } });
        },
        (err: unknown) => {
          dispatch({ type: 'addFailed', payload: { tempId } });
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
    }, []);
    ```

    For `handleToggle`'s rejection callback (currently `() => { dispatch({ type: 'toggleFailed', payload: { id, previousCompleted } }); }`), add the same three steps after the existing `toggleFailed` dispatch, using the caught error. For `handleDelete`'s rejection callback (currently `() => { dispatch({ type: 'deleteFailed', payload: { todo: previousTodo, index } }); }`), same pattern.
  - [x] **Every `api.ts` mutation function (Task 2) now only ever rejects with an `ApiError`** (network failures wrapped via `networkFailure()`, HTTP failures via `fromResponse()`, schema-drift failures already threw `ApiError` before this story). The `err instanceof ApiError ? ... : 'Something went wrong...'` fallback branch is therefore defensive-only (mirrors the existing pattern at `TodoApp.tsx`'s load-effect error handler) — it exists for type-narrowing and to match established codebase convention, not because a non-`ApiError` rejection is expected in practice.
  - [x] **Requestid logging: `console.debug`, never `console.warn`/`console.error`.** AC #6 specifies debug level. `TodoApp.test.tsx` does not assert "no console output" (unlike `Toast.test.tsx`) — Story 2.5's Dev Notes established this exception deliberately because async rejection paths in this file are expected to emit diagnostic output under test. Do not add a `consoleErrorSpy`/`consoleWarnSpy` `afterEach` assertion to this file as part of this story.
  - [x] **Never interpolate `requestId` or `statusCode` into the `errorShown` message.** The `message` field passed to `errorShown` is exactly `err.message` (already human-readable per Task 1) — nothing else gets appended. This is what satisfies AC #5 (no digits, no envelope, no URL) and AC #6 (requestId never rendered).
  - [x] Each dispatch site generates its OWN fresh `crypto.randomUUID()` for the `errorShown` payload's `id` — do not reuse `tempId`/the mutation's own id, and do not share one id across handlers. This is what makes 3.1's `key={toast.id}` remount-per-distinct-error contract actually work (see 3.1 Dev Notes → "Why `key={toast.id}`").

- [x] **Task 6: Add mutation-failure Toast tests to `TodoApp.test.tsx` (AC: #2, #3, #4, #5, #6, #7)**
  - [x] Edit [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx). The existing rollback tests (e.g. "rollback: optimistic entry appears then disappears when POST rejects") already exercise the failure path but don't assert Toast behavior — extend or add tests covering:
    - Add-failure (400 or 500 response body) → after rollback, `screen.getByTestId('toast-description')` shows the mapped message (e.g. `'Something went wrong. Please try again.'` for the existing 500 fixture already in that test).
    - Toggle-failure and delete-failure → same Toast assertion pattern (mirror the existing rollback tests' response fixtures — they already use `{ statusCode: 500, error: 'Internal Server Error', message: 'oops' }`; assert the Toast shows the mapped 500 message, not `'oops'`).
    - **AC #3 (single-toast, most-recent-wins):** trigger two failing mutations in sequence with DIFFERENT status codes (e.g. add fails with 400, then a second add fails with 404) and assert the final `toast-description` text is the 404 mapping (`'This todo no longer exists.'`), not the 400 one.
    - **AC #4 (success doesn't dismiss an existing toast):** cause one mutation to fail (Toast appears), then a second, independent mutation to succeed; assert the Toast is still present showing the original failure message.
    - **AC #5 (no raw envelope leaks):** for at least one failure case, assert `toast-description`'s `textContent` does NOT match `/\d{3}/` (no 3-digit status code) and does not contain `'oops'` (the server's raw fixture message) or any substring of a URL.
    - **AC #6 (requestId debug-only, never rendered):** spy on `console.debug` (`vi.spyOn(console, 'debug').mockImplementation(() => {})`), trigger a failure whose response includes an `x-request-id` header, assert `console.debug` was called with an object containing that requestId, AND assert the Toast's rendered text does not contain the requestId string.
  - [x] Reuse this file's existing `jsonResponse()` helper and response-fixture conventions; do not introduce a new mocking utility.

- [x] **Task 7: Verify**
  - [x] `npm run lint`, `npm run typecheck`, `npm run test` (all workspaces) — all green, 0 warnings.
  - [x] Confirm no test anywhere in the repo still asserts a raw server `.message` string (e.g. `'oops'`, `'database is unreachable'`, `'todo not found'`) as the expected value of a thrown `ApiError.message` from a non-ok HTTP response — grep for these literal strings across `apps/web/src` test files if unsure.

## Dev Notes

### Where this story sits

Epic 3 ("Failure Resilience & Recovery") intro, verbatim: "When something goes wrong (offline, server 5xx, timeout), the user sees a clear non-technical error, their typed input is preserved, and they can retry without losing list state or refreshing. The system surfaces every failure — nothing drops silently — and operators can diagnose failures from correlated server logs." [epics.md:1016-1018](../planning-artifacts/epics.md#L1016-L1018)

Story 3.2 is the second of six numbered Epic 3 stories and the first to actually PRODUCE a toast (3.1 only built the empty pipe):

| Story | Scope | Depends on 3.2? |
|---|---|---|
| 3.1 (done) | Toast UI primitive + `toast` reducer slice + `errorShown`/`errorDismiss` | — |
| **3.2 (this story)** | `ApiError` → human-readable message mapping; wires `createTodo`/`updateTodo`/`deleteTodo` rejection handlers to dispatch `errorShown` | Depends on 3.1 |
| 3.3 | `TodoInput` preserves typed text on add failure (FR19) | No (independent UI change, same failure-flow narrative) |
| 3.4 | Replaces `TodoList`'s Epic-1 error placeholder with a real retry-button UI (FR20) | No (different state axis — `state.error`/`state.requestId`, not `state.toast`) — but benefits for free from this story's `messageForStatus()` mapping (see Task 2) |
| 3.5 | Global `window` `unhandledrejection`/`error` listeners dispatch a generic toast (NFR9) | Yes, indirectly (reuses the `errorShown` pattern this story establishes) |
| 3.6 | Journey-level resilience tests (Journeys 1–3, including 5 failure sub-cases) | Yes — asserts Toast content this story produces |

Do not let this story's scope creep into 3.3/3.4/3.5/3.6's territory (see "Out-of-scope" below).

### Critical architectural guardrails

- **`.message` is status-derived, not server-derived.** This is the single biggest behavior change in this story and the reason `api.test.ts` needs the widespread mechanical updates in Task 3 — every existing test that pinned a raw server string as the expected `ApiError.message` will fail until updated. This is expected regression-test churn, not a sign something is broken.
- **Network failure is NOT the same code path as an HTTP error response.** `ApiError.fromResponse(response)` requires an already-received `Response` object — it cannot represent "the request never got a response at all" (offline, DNS failure, connection refused). That case is a distinct `ApiError.networkFailure()` factory, and the catching site is different too: it's a `try/catch` around the `fetch()` call itself in `api.ts` (Task 2), not inside the `!response.ok` branch. Do not try to shoehorn network failures into `fromResponse`.
- **Network-failure wrapping is scoped to mutations only — `getTodos()` is explicitly excluded.** `networkFailure()`'s message ("Your change wasn't saved") only makes sense for a mutation. Wrapping `getTodos()`'s fetch too would show a confusing "your change" message for an initial-load failure — that's Story 3.4's UI surface, with its own message needs. Do not touch `getTodos()` in this story.
- **`Toast` remains presentational (unchanged from 3.1).** `Toast.tsx` itself needs ZERO changes in this story — it already renders whatever `toast.message` string it's given. All the work is upstream: computing a good message (`errors.ts`) and dispatching it at the right moments (`TodoApp.tsx`).
- **Zero entropy inside the reducer (unchanged rule from 2.4/3.1).** `errorShown`'s `id` is generated at each `TodoApp.tsx` dispatch call site via `crypto.randomUUID()`, never inside `reducer.ts`. This story is exactly the "real dispatch sites" 3.1's Dev Notes forward-referenced.
- **XSS / rendering discipline (unchanged from 3.1).** `toast.message` is always plain JSX text interpolation inside `Toast.Description` — never `dangerouslySetInnerHTML`. This story's messages are now real, un-sanitized-at-the-boundary strings flowing from `errors.ts`, but they are ALL fixed literal strings from `messageForStatus()`/`networkFailure()` (never server-supplied text, never todo text) — there is no injection surface here regardless.
- **`api.ts` never surfaces raw `Error` to components** [architecture.md:406](../planning-artifacts/architecture.md#L406) — after this story, this is true for network failures too (previously a raw `TypeError` from `fetch()` would propagate un-wrapped out of `createTodo`/`updateTodo`/`deleteTodo`; Task 2 closes that gap).

### Known gap, explicitly deferred (do NOT fix in this story)

Two existing error messages in `api.ts` are constructed directly (not via `ApiError.fromResponse`) and are NOT covered by this story's mapping table: `'Malformed JSON in successful response'` and `'Response did not match the expected todo/todos schema'` (contract-drift branches, triggered when the server returns a 2xx status with a body that doesn't parse). These ARE `ApiError` instances and WOULD flow into a Toast via this story's wiring verbatim (technical wording), but epics.md's AC #1 mapping table does not mention this case, and it only occurs on a server bug / contract drift, not a real-world user-facing failure mode. Leave these two messages as-is. If this becomes a real problem, it's future scope (log it in `deferred-work.md` during code review, don't preemptively fix).

### What changes in the codebase

| File | Change | LOC delta (approx.) |
|------|--------|---------------------|
| [apps/web/src/lib/errors.ts](../../apps/web/src/lib/errors.ts) | `messageForStatus()` helper; `fromResponse()` rewritten to use it; new `networkFailure()` static factory | +30 / -8 |
| `apps/web/src/lib/errors.test.ts` (new) | Direct unit tests for the mapping table + `networkFailure()` | +60 / -0 |
| [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) | `createTodo`/`updateTodo`/`deleteTodo`: wrap `fetch()` in try/catch → `ApiError.networkFailure()` on rejection. `getTodos` unchanged. | +18 / -3 |
| [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts) | Update ~5 existing message assertions to mapped text; add network-failure + 429 tests per mutation function | +45 / -5 |
| [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) | `handleAdd`/`handleToggle`/`handleDelete` rejection callbacks: dispatch `errorShown` (with fresh id) after `{intent}Failed`; `console.debug` requestId/statusCode | +30 / -3 |
| [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx) | New/extended tests: Toast content on each mutation-failure path, single-toast-wins, success-doesn't-dismiss, no-raw-envelope, debug-only requestId | +90 / -0 |

Total: ~+270 added LOC across 4 modified + 1 new file. Zero new dependencies.

### Out-of-scope (do NOT do in this story)

- `TodoInput` text preservation on add failure — Story 3.3.
- Replacing `TodoList`'s `EPIC 1 PLACEHOLDER` error branch, or any UI change to how `state.error`/`state.requestId` are displayed — Story 3.4. (This story's `messageForStatus()` change is shared infra that happens to also improve `getTodos()`'s error text as a side effect — that's fine and expected, but do not touch `TodoList.tsx` or add a retry button here.)
- Global `window.addEventListener('unhandledrejection' | 'error', ...)` safety net — Story 3.5.
- Fixing the two contract-drift messages described above ("Known gap, explicitly deferred").
- Fixing `deferred-work.md`'s NUL-byte-produces-500 item ([deferred-work.md:101](./deferred-work.md#L101)) — that's a server-side validation gap (`CreateTodoRequestSchema` doesn't reject NUL bytes); this story's 5xx→generic-message mapping means a user hitting it now sees a sensible Toast instead of nothing, which is a welcome side effect, but the underlying 500-vs-400 misclassification is unrelated to this story's AC and stays deferred.
- Fixing `deferred-work.md`'s rapid-double-click-delete race ([deferred-work.md:43](./deferred-work.md#L43)) — noted there as "Epic 3 hardening pass alongside the toast/error surface (Story 3.2)" but not a numbered epics.md AC for this story; do not add click-debouncing/in-flight-id-tracking here.
- A toast *queue* (multiple simultaneous toasts) — never planned (see 3.1 Dev Notes).
- Journey-level / E2E tests asserting Toast behavior end-to-end — Story 3.6 (Playwright). This story's tests are Vitest + RTL only.

### Project Structure Notes

```text
apps/web/
└── src/
    ├── components/
    │   ├── Toast.tsx            # (unchanged — already renders any message string)
    │   ├── TodoApp.tsx          # ← extended: errorShown dispatch in 3 rejection callbacks
    │   ├── TodoApp.test.tsx     # ← extended: mutation-failure Toast assertions
    │   ├── TodoInput.tsx        # (unchanged — Story 3.3 territory)
    │   ├── TodoItem.tsx         # (unchanged)
    │   └── TodoList.tsx         # (unchanged — Story 3.4 territory)
    └── lib/
        ├── api.ts               # ← extended: network-failure wrap on 3 mutation fns
        ├── api.test.ts          # ← extended/updated
        ├── errors.ts            # ← extended: messageForStatus() + networkFailure()
        ├── errors.test.ts       # ← NEW
        └── reducer.ts           # (unchanged — toast slice already complete from 3.1)
```

No new files besides `errors.test.ts`; no new component; no new dependency.

### Testing Requirements

- **Unit tests:** `apps/web/src/lib/errors.test.ts` (new), `apps/web/src/lib/api.test.ts` (extended). Mandatory per AC #7.
- **Component tests:** `apps/web/src/components/TodoApp.test.tsx` (extended) — mutation-failure Toast assertions.
- **Integration tests:** none — no API changes in this story (purely client-side error handling).
- **E2E tests:** none — Story 3.6 owns journey-level Toast assertions via Playwright.
- **Test runner:** Vitest + jsdom, already configured. No new jsdom polyfills expected (this story adds no new Radix/browser-API surface).
- **Coverage gate:** none in v1.

### Library / version pins

No new dependencies. No version changes. This story is pure application logic (`errors.ts`, `api.ts`, `TodoApp.tsx`) — no new Radix primitive, no new npm package.

### Git intelligence (recent commits)

Most recent commits are Story 3.0/3.0.1 (Playwright E2E harness) and a CORS fix — unrelated to this story's file surface. The relevant prior-work commit is Story 3.1's (Toast infrastructure, `feat(web): ...` pattern, not yet in `git log` at story-creation time since it's mid-cycle) — this story continues directly from its `reducer.ts`/`Toast.tsx` state, read directly above rather than via `git show`.

### References

- [epics.md:1016-1105](../planning-artifacts/epics.md#L1016-L1105) — Epic 3 intro + Story 3.1 and 3.2 full text (scope boundary).
- [prd.md:182-192,304-307,340-342](../planning-artifacts/prd.md) — FR18/FR19/FR20/FR21, NFR7/NFR8/NFR9, Journey 3 narrative ("a clear, non-technical error... without clearing the typed text").
- [architecture.md:243,404-409,698-699,729,804,835](../planning-artifacts/architecture.md) — client-side error translation flow, `ApiError` contract, "add a todo" end-to-end failure narrative (already describes this story's exact wiring), NFR7 traceability.
- [3-1-toast-infrastructure-radix-toast-reducer-slice.md](./3-1-toast-infrastructure-radix-toast-reducer-slice.md) — Toast component/reducer slice this story wires into; its Dev Notes forward-reference this story's dispatch-site id generation and deferred items.
- [deferred-work.md:24,43,52,101,272,273](./deferred-work.md) — items explicitly earmarked for or touched by this story.
- `apps/web/src/lib/errors.ts`, `api.ts`, `api.test.ts`, `components/TodoApp.tsx`, `TodoApp.test.tsx` — current implementation read directly for this story.
- `apps/web/AGENTS.md` — Next.js 16 / Tailwind v4 project-specific caveats (not directly relevant to this story's pure-logic changes, but still governs the codebase).

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

None — no failures requiring debug-log capture. Implementation matched the story's target-state code snippets exactly; no deviations.

### Completion Notes List

- Task 1: Rewrote `apps/web/src/lib/errors.ts` — added `messageForStatus()` mapping (400/404/429/default) and `ApiError.networkFailure()` static factory (`statusCode: 0`). `fromResponse()` now always derives `.message` from `messageForStatus(response.status)`; `.code` is still extracted from a parsed `ErrorResponseSchema` body when present, for diagnostics only.
- Task 2: Wrapped the `fetch()` call in `createTodo`/`updateTodo`/`deleteTodo` in try/catch → `throw ApiError.networkFailure()` on rejection. `getTodos()` left untouched, per the story's explicit scope boundary.
- Task 3: Updated 4 existing `api.test.ts` assertions (503/400/404×2) from raw server messages to the mapped text; added a 429 test and a network-failure test to each of `createTodo`/`updateTodo`/`deleteTodo`'s describe blocks (6 new tests). `getTodos()` was not given a network-failure test, matching Task 2's scope.
- Task 4: Created `apps/web/src/lib/errors.test.ts` (new file, 10 tests) — direct coverage of `fromResponse()`'s mapping table (400/404/429/500/unmapped-403), `.statusCode`/`.requestId` preservation, `.code` extraction/absence, and `networkFailure()`.
- Task 5: Wired `handleAdd`/`handleToggle`/`handleDelete` in `TodoApp.tsx` — each rejection callback now dispatches `errorShown({ message, id: crypto.randomUUID() })` after its `{intent}Failed` dispatch, and logs `console.debug('mutation failed', { requestId, statusCode })` when the error is an `ApiError` (defensive `instanceof` fallback message for the non-`ApiError` case, matching the existing load-effect convention).
- Task 6: Added a new `describe('<TodoApp /> mutation-failure toasts', ...)` block to `TodoApp.test.tsx` (7 tests) covering: mapped-message Toast content for add/toggle/delete failures; single-toast most-recent-wins (AC #3); success not dismissing an existing failure toast (AC #4); no raw envelope/status-digits/URL leak (AC #5); `console.debug`-only requestId logging never rendered in the Toast (AC #6).
- Task 7: `npm run lint` (0 warnings), `npm run typecheck` (all 3 workspaces clean), `npm run test` (all 3 workspaces green: shared 25/25, api 4/4, web 131/131 — up from 108: +10 `errors.test.ts`, +6 `api.test.ts`, +7 `TodoApp.test.tsx`). Grepped for lingering raw-server-message assertions on `ApiError.message` — none found; the only remaining occurrences of strings like `'oops'`/`'todo not found'` are mock-fixture *inputs* (the server's raw response body), not expected outputs.

### File List

- `apps/web/src/lib/errors.ts` (modified) — `messageForStatus()` helper, `fromResponse()` rewritten, new `networkFailure()` static factory
- `apps/web/src/lib/errors.test.ts` (new) — direct unit tests for the mapping table + `networkFailure()`
- `apps/web/src/lib/api.ts` (modified) — `createTodo`/`updateTodo`/`deleteTodo` wrap `fetch()` in try/catch → `ApiError.networkFailure()`; `getTodos()` unchanged
- `apps/web/src/lib/api.test.ts` (modified) — updated 4 message assertions to mapped text; added 429 + network-failure tests per mutation function
- `apps/web/src/components/TodoApp.tsx` (modified) — `handleAdd`/`handleToggle`/`handleDelete` rejection callbacks dispatch `errorShown` after `{intent}Failed`; `console.debug` requestId/statusCode logging
- `apps/web/src/components/TodoApp.test.tsx` (modified) — new `<TodoApp /> mutation-failure toasts` describe block (7 tests)

## Change Log

| Date       | Change                                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-05 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Story slot: Epic 3, Story 2; depends directly on Story 3.1's Toast infrastructure (done). Establishes the `ApiError` status-code → human-message mapping and wires `createTodo`/`updateTodo`/`deleteTodo` failure paths to dispatch `errorShown`. No new dependencies. |
| 2026-07-05 | Dev-Story: mutation failure toasts implemented — `ApiError` status-code → human-message mapping + `networkFailure()` factory; `createTodo`/`updateTodo`/`deleteTodo` wrap network failures; `TodoApp.tsx` dispatches `errorShown` on all 3 mutation failure paths with debug-only requestId logging; lint/typecheck clean; web tests 108 → 131; no spec deviations. Status: ready-for-dev → review. |
| 2026-07-05 | Code-Review: 3 parallel adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Acceptance Auditor: 7/7 ACs PASS, all 9 guardrails PASS, all 7 out-of-scope prohibitions honored — no violations, no scope creep. 0 decision-needed, 0 patches, 3 defers (all spec-ratified: AbortError carve-out, contract-drift raw-message leak, TodoApp network-failure test gap), 5 dismissed. Status: review → done. |

## Review Findings

_Code review 2026-07-05 — 3 parallel adversarial layers. Acceptance Auditor: 7/7 ACs PASS, all guardrails + out-of-scope rules honored. 0 decision-needed, 0 patch, 3 defer, 5 dismissed._

- [x] [Review][Defer] `AbortError` misclassified as network/offline failure — [apps/web/src/lib/api.ts:73](../../apps/web/src/lib/api.ts#L73) (also L123, L170) — the bare `catch { throw ApiError.networkFailure(); }` on each mutation converts an aborted request (`AbortError`/`DOMException`) into `statusCode: 0` + "You're offline…". Latent today — no caller passes a signal to the mutations. Spec Task 2 explicitly ratifies this and forward-references the fix: a future story that passes a signal into a mutation must add an `if (err?.name === 'AbortError') throw err;` carve-out before relying on this catch. Deferred per spec.
- [x] [Review][Defer] Success-path contract-drift `ApiError` leaks raw technical message into the Toast — [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) (post-`!response.ok` JSON/schema branches) → [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) — on a 2xx response with malformed JSON or schema drift, `api.ts` throws `ApiError('Malformed JSON in successful response')` / `'Response did not match the expected todo schema'`; these bypass `messageForStatus()` and the handler's `err.message` dispatches the raw technical string verbatim into the toast. Only occurs on a server bug / contract drift. Spec's "Known gap, explicitly deferred" section pre-authorized deferring this and explicitly instructed logging it here. Deferred per spec.
- [x] [Review][Defer] TodoApp-level Toast coverage gap for the network-failure path + weak 500 assertions — [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx) — no RTL test drives a `fetch` rejection through `TodoApp` to confirm the "You're offline…" message reaches a rendered toast (and `console.debug` logs `statusCode: 0`); separately, the add/toggle/delete 500 tests assert `'Something went wrong…'`, which is also the non-`ApiError` fallback string, so a broken mapping could still pass those specific assertions. Mapping itself is proven directly in `errors.test.ts` and the 400/404 single-toast test, so this is non-blocking test-hardening. Deferred.

**Dismissed (5):** `getTodos()` not wrapped (spec-ratified out-of-scope, owned by Story 3.4); dead `err instanceof ApiError` fallback branches (spec Task 5 ratifies as defensive convention); `statusCode` sourced from HTTP status not envelope (matches spec target-state — transport status is authoritative); dead default-envelope branch in `errors.test.ts` `errorResponse` helper (harmless test-helper nit); `crypto.randomUUID()` may throw in a non-secure context (pre-existing codebase-wide pattern — `tempId`/`createdAt` already rely on it, secure context already required).
