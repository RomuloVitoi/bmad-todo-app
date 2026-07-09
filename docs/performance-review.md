# Performance Review — Todo App

Scope: `apps/web` (Next.js) + `apps/api` (Fastify), production build, measured with Chrome DevTools MCP (performance traces, network inspection) against a locally-built instance backed by the real API/Postgres. Date: 2026-07-09.

**Overall**: Core Web Vitals are excellent at current data volume — LCP 255 ms, CLS 0.00, INP 34 ms, all well within "good" thresholds. There are no urgent problems. The findings below are efficiency gaps that don't matter yet (3–4 todos, localhost) but are worth fixing cheaply now or watching as the app scales.

## Measured baseline

| Metric | Value | Threshold ("good") |
|---|---|---|
| LCP (page load) | 255 ms (TTFB 3 ms + render delay 251 ms) | < 2500 ms |
| CLS (page load + interactions) | 0.00 | < 0.1 |
| INP (add/toggle/delete interaction) | 34 ms | < 200 ms |
| Render-blocking requests | 1 (app CSS, 5 ms) | — |
| Max critical-path latency | 47 ms | — |

No LCP resource issue, no render-blocking JS, no preconnect opportunities missed in a way that matters (single-origin app). This part of the app is not the bottleneck — the findings below are about network round-trips and payload weight, not rendering.

## Findings

### 1. Every API call pays a CORS preflight round-trip; GET's is avoidable
Captured in the network trace: **every** `GET`/`POST`/`PATCH`/`DELETE` to `/todos` is preceded by its own `OPTIONS` preflight request. For `POST`/`PATCH`/`DELETE` this is unavoidable (non-`GET`/`HEAD`/`POST`-with-simple-body methods always preflight per the Fetch spec), but `GET /todos` only preflights because the client attaches a custom `x-request-id` header (`apps/web/src/lib/api.ts`) — without it, `GET` would qualify as a CORS-simple request and skip the extra round trip entirely.

`GET /todos` fires on **every** initial page load and on every tab-visibility-regain refetch (`apps/web/src/components/TodoApp.tsx`'s `visibilitychange` handler) — so this is the one endpoint hit repeatedly enough that the extra round trip compounds. On localhost this costs low-single-digit ms; on a real network (50–150 ms RTT), it doubles the latency of every list load and every tab-refocus resync.

**Why it's this way**: `x-request-id` exists for client/server log correlation (visible in `ApiError` and the server's structured logs) — a reasonable feature, just not worth it on the read path.

**Fix**: drop the `x-request-id` header from `getTodos()`'s request (keep it on the mutating calls, where a preflight is already unavoidable and the correlation ID matters most for debugging failed writes).

### 2. No `Access-Control-Max-Age` on the API's CORS config — preflights are never cached
`apps/api/src/plugins/cors.ts` registers `@fastify/cors` without a `maxAge` option, so the browser has no signal to cache preflight results and re-preflights on every single call — confirmed in the trace: the *same* `OPTIONS /todos` fired fresh on both the initial load and the follow-up `GET` in the same session, no caching in between.

This matters most for `GET /todos` (identical URL every time — `POST`/`PATCH`/`DELETE` preflight caching is capped in practical value anyway, since the CORS preflight cache is keyed by exact URL, and `/todos/:id` has a different URL per todo).

**Fix**: add `maxAge: 600` (or similar) to the `@fastify/cors` options in `apps/api/src/plugins/cors.ts`. One line; the browser will skip re-preflighting `GET /todos` for repeat fetches within that window (e.g. rapid tab-focus/blur cycles).

### 3. API sends no response compression
`apps/api` has no `@fastify/compress` (or equivalent) registered — `GET /todos` responses go out uncompressed regardless of size. At today's payload (~366 bytes for 3 todos) this is genuinely negligible and possibly not worth the CPU trade-off. It's a scalability watch-item, not a current problem: the `/todos` route's own docstring already flags that pagination is deferred ("Architecture mandates wrapping the array in `{ todos: [...] }` for additive evolvability (pagination, etc.)"). If the list grows into the hundreds/thousands of items before pagination lands, compression would start to matter; worth bundling into that same future work rather than fixing in isolation now.

### 4. Geist Mono font is downloaded but never used
`apps/web/src/app/layout.tsx` loads both `Geist` and `Geist_Mono` from `next/font/google` and applies both as CSS variables on `<html>`. `globals.css` maps `--font-mono` to the Geist Mono variable, but grepping the entire `src/components` and `src/app` trees turns up **zero** uses of the `font-mono` Tailwind utility (or any other reference to the mono variable) in actual markup. The result: a real network request for a ~29 KB (transferred) woff2 file on every fresh page load that contributes nothing to the rendered UI.

**Fix**: remove the `Geist_Mono` import/config from `layout.tsx` and the `--font-mono` mapping from `globals.css` unless there's a near-term plan to use it (e.g. for todo timestamps or an id display). If it's just anticipatory scaffolding, cut it — this app renders no monospace text anywhere today.

### 5. `TodoItem` re-renders the whole list on every single-item mutation (not measurable yet, but doesn't scale)
`TodoList.tsx` maps `todos` to `TodoItem` with a stable `key={todo.id}` (good), but `TodoItem` isn't wrapped in `React.memo`, and the `onToggle`/`onDelete` callbacks passed down from `TodoApp.tsx` are recreated on every `todos` change (`useCallback([..., state.todos])` — `state.todos` is a dependency because the callback bodies read from it directly for pending/rollback checks). Combined, toggling or deleting **one** todo causes React to re-render **every** `TodoItem` in the list, not just the changed one.

At the current scale (3–4 items) this is invisible — the measured INP for a full add→toggle→delete interaction was 34 ms, comfortably under the 200 ms "good" threshold, so there's no user-facing symptom today. Flagging it because the cost is O(n) per mutation and there's no pagination/virtualization on the list (see Finding 3) — if this app's real-world todo counts grow into the hundreds, this pattern (recreated callbacks + no memoization) is the first thing that would show up as jank on toggle/delete. Not worth restructuring pre-emptively; worth knowing about before that day arrives.

### 6. JS payload baseline: ~173 KB gzip across 6 chunks, ~4 KB CSS
For reference, not a specific problem: the initial page load pulls ~173 KB (gzip) of JS across 6 chunks (Next.js/React framework runtime, Turbopack loader, and the app + Radix UI + Zod code) plus ~4 KB CSS. The largest single chunk (~71 KB gzip) is Next.js/React framework bootstrap — largely fixed cost of the framework choice, not something to trim. A ~27 KB chunk carries Zod, bundled via `@todo-app/shared`'s schemas so the client can validate API responses at runtime (`apps/web/src/lib/api.ts`) — a deliberate defense-in-depth trade-off (catch a malformed/incompatible server response before it corrupts UI state), not a bug. Mentioning for baseline awareness only; nothing here needs fixing.

## What was checked and found clean
- **Core Web Vitals**: LCP, CLS, INP all comfortably within "good" thresholds on both initial load and the create/toggle/delete interaction flow.
- **Render-blocking resources**: only the app's own CSS (5 ms), no third-party or unnecessary blocking scripts.
- **Layout shift**: 0.00 CLS throughout — toast appearance/dismissal and list item add/remove don't cause visible layout jumps.
- **Network dependency chain**: shallow (`/` → its CSS), no deep chains, no missed/misconfigured `preconnect` opportunities (single-origin app, N/A here).
- **List rendering**: uses a stable `key` per item (no index-keyed list anti-pattern).

## Priority order for improvement
1. Drop `x-request-id` from the `GET /todos` request (Finding 1) — trivial, removes a real round trip from the most-frequently-hit endpoint.
2. Add `maxAge` to the API's CORS config (Finding 2) — one-line fix, compounds with Finding 1 for repeat `GET /todos` calls.
3. Remove the unused Geist Mono font load (Finding 4) — trivial, ~29 KB saved on every page load for zero visual change.
4. Track response compression (Finding 3) and list re-render efficiency (Finding 5) as scalability watch-items to revisit alongside pagination, not urgent fixes today.
