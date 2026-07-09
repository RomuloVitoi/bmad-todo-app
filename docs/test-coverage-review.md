# Test Coverage Review — Todo App

Scope: `packages/shared`, `apps/api`, `apps/web` — unit, integration, and e2e suites. Measured by running each suite's coverage tooling directly (Node's built-in `--experimental-test-coverage` for the API, `vitest --coverage` for the web app) and cross-checking against what `.github/workflows/ci.yml` actually executes. Date: 2026-07-09.

**Summary**: coverage is strong across the board and the numbers CI enforces reflect that — every package clears 70% by a wide margin on every metric (line, branch, function). The API's integration suite (the bulk of its functional coverage) runs in CI alongside its unit suite. The web app's reported number reflects real application logic, not diluted by config files or boilerplate. The handful of lines still uncovered are, on inspection, deliberate defensive guards or compile-time-only checks — not gaps in testing.

## Coverage by package

| Package | What CI runs | Line % | Branch % | Func % |
|---|---|---|---|---|
| `packages/shared` | unit (25 tests) | 100.00 | 100.00 | 100.00 |
| `apps/api` | unit (9 tests) + integration (41 tests) | 98.36 | 93.65 | 96.88 |
| `apps/web` | unit (157 tests, vitest) | 97.12 | 89.71 | 93.33 |
| `apps/web` | + e2e (12 Playwright tests, in CI, not coverage-instrumented) | — | — | — |

`apps/api`'s two suites divide responsibility cleanly: unit tests (DI-stubbed, no DB) prove routing, schema validation, and status-code wiring — `todos.ts` and `health.ts`'s handler logic are 100%/100%/100% and 98.21%/83.33%/75% respectively under unit tests alone. Integration tests (real Postgres) prove the actual query behavior in `db/client.ts`, CORS, concurrency, and error-handling end-to-end. Both run in CI.

`apps/web`'s vitest config excludes build/tool config files (`next.config.ts`, `playwright.config.ts`, `postcss.config.mjs`) and trivial App Router boilerplate (`layout.tsx`, `page.tsx` — exercised by the Playwright e2e suite instead) from the coverage denominator, so the 97.12%/89.71%/93.33% figure is the real application-logic number.

## Per-file detail

### `apps/api`

| File | Line % | Branch % | Func % | Uncovered |
|---|---|---|---|---|
| `db/client.ts` | 91.04 | 75.00 | 100.00 | module-load guard; `.returning()` empty-array guards |
| `app.ts` | 94.34 | 80.00 | 100.00 | global error handler's truly-unhandled-error branch |
| `routes/health.ts` | 100.00 | 100.00 | 100.00 | — |
| `routes/todos.ts` | 100.00 | 100.00 | 100.00 | — |
| `config.ts`, `plugins/*.ts`, `schema.ts` | 100.00 | 100.00 | ~100.00 | — |

### `apps/web`

| File | Stmts % | Branch % | Func % | Uncovered |
|---|---|---|---|---|
| `components/TodoApp.tsx` | 92.95 | 63.63 | 80.00 | non-`ApiError` fallback branch, repeated in 3 mutation handlers |
| `components/TodoList.tsx` | 95.52 | 92.30 | 100.00 | compile-time exhaustiveness check |
| `components/Toast.tsx`, `TodoInput.tsx`, `TodoItem.tsx` | 100.00 | 100.00 | 100.00 | — |
| `lib/api.ts` | 98.69 | 97.36 | 100.00 | module-load `NEXT_PUBLIC_API_URL` guard |
| `lib/errors.ts`, `lib/reducer.ts` | 100.00 | 100.00 | 100.00 | — |

## What's left uncovered, and why it's fine

- **Module-load-time env guards** (`apps/api/src/db/client.ts`'s `DATABASE_URL` check, `apps/web/src/lib/api.ts`'s `NEXT_PUBLIC_API_URL` check): both throw synchronously at import time if the variable is unset. They can't be exercised without unloading the module in a separate process — standard, accepted-uncovered defensive code, not a test gap.
- **`db/client.ts`'s `.returning()` empty-array guards** (`createTodo`, `deleteTodoById`): documented in their own comments as invariants that can't fire under normal Postgres behavior (`.returning()` always emits rows on a successful `INSERT`; a `DELETE` on a primary key affects 0 or 1 rows, never >1). Belt-and-suspenders, not reachable.
- **`app.ts`'s global error handler catch-all**: every current failure mode in the app produces a typed `statusCode` (Zod validation, `reply.notFound()`/`internalServerError()`), so the branch for a genuinely untyped, unexpected throw is intentionally hard to reach without manufacturing one.
- **`TodoList.tsx`'s exhaustiveness branch** (`const _exhaustive: never = status`): a compile-time-only TypeScript pin (mirrors the same pattern in `reducer.ts`), unreachable at runtime by construction.
- **`TodoApp.tsx`'s non-`ApiError` fallback branches**: `createTodo`/`updateTodo`/`deleteTodo` always reject with an `ApiError` per `api.ts`'s contract, so the `else` branch of `err instanceof ApiError ? err.message : 'Something went wrong...'` (repeated in the add/toggle/delete failure handlers) only fires if that contract is ever violated by a future bug. Same defensive category as the above — lowest-priority item in this review if ever revisited, since it'd require deliberately breaking `api.ts`'s error-wrapping to exercise.

## What was checked and found clean beyond raw percentages

- **`packages/shared`**: 100% across the board.
- **List-rendering key usage**: `TodoList.tsx` uses a stable `key={todo.id}`, no index-key anti-pattern.
- **CI wiring**: both of `apps/api`'s suites (unit + integration) run automatically on every push/PR via `.github/workflows/ci.yml`, sharing one Postgres instance (`docker compose up -d --wait db`) with the e2e stack — no separate service container, no port conflicts, migrations applied once and reused idempotently.
- **Web e2e suite**: 12 Playwright tests across 5 spec files (happy path, returning session, keyboard traversal, WCAG accessibility, XSS payload) run in CI, covering the App Router boilerplate that vitest's config deliberately excludes.
