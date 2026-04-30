# Deferred Work

Items intentionally deferred from code reviews. Each entry: source review, file/area, brief rationale.

## Deferred from: code review of story 2-6 (2026-04-30)

### Story 2.6 — toggle completion via Radix Checkbox (commit `8361df8`)

- **Concurrent rapid toggles can produce inconsistent rollback under specific failure interleavings** — [apps/web/src/components/TodoApp.tsx:71-99](../../apps/web/src/components/TodoApp.tsx#L71-L99). Reducer no-ops same-value transitions and Radix only emits change events on real transitions, so single-flow remains correct; back-to-back true→false→true with mixed PATCH success/failure could leave UI showing the wrong final state. Spec ratifies the no-debounce + no-pending-on-toggle design (Dev Notes "Why no client-side debounce on rapid checkbox toggles" + "Why no `aria-busy` on the checkbox"). Proper UX for in-flight toggles reserved for a future polish pass.
- **`fetch()` rejection (network error / DNS / abort) propagates raw `TypeError`/`DOMException`, not `ApiError`** — [apps/web/src/lib/api.ts:106-115](../../apps/web/src/lib/api.ts#L106-L115) plus same pattern in [getTodos:19-26](../../apps/web/src/lib/api.ts#L19-L26) and [createTodo:61-70](../../apps/web/src/lib/api.ts#L61-L70). All three lack a try/catch around `await fetch(...)`. Not introduced by Story 2.6 (mirrors `createTodo` per spec line 197). Folds into the api-wrapper hardening pass already noted in Story 2.5's `?? requestId` empty-header / `cause:` chaining deferrals.
- **Toggle rejection callback swallows the error without logging** — [apps/web/src/components/TodoApp.tsx:90-95](../../apps/web/src/components/TodoApp.tsx#L90-L95). Mirrors `handleAdd`'s rejection callback (no log) at [TodoApp.tsx:65-67](../../apps/web/src/components/TodoApp.tsx#L65-L67); diverges from the visibility-refetch path at [TodoApp.tsx:42-46](../../apps/web/src/components/TodoApp.tsx#L42-L46) which does `console.warn`. Story 3.2 (Toast for mutation failures) is the user-facing surface; Story 3.5 (global unhandled-rejection net) is the larger backstop. Until then, rollback is observable only via the UI revert.
- **Focus-visible ring uses `current/40` opacity with `outline-none` and no `ring-offset`** — [apps/web/src/components/TodoItem.tsx:36](../../apps/web/src/components/TodoItem.tsx#L36). Intentional mirror of `<TodoInput>`'s focus-ring pattern (spec AC #3 ratifies). On a row with `border-current/10` neighbors, the 40% foreground ring may have weak contrast against same-color borders in non-default themes. Today the app uses default browser foreground (black) with high background contrast; theming/contrast hardening for non-default foregrounds is a future a11y polish concern.
- **`role="checkbox"` `<button>` nested inside `<li>` may double-announce in some screen readers** — [apps/web/src/components/TodoItem.tsx:25-56](../../apps/web/src/components/TodoItem.tsx#L25-L56). Untested in either direction; Radix's documented `aria-labelledby` label-association pattern was used. Some VoiceOver/JAWS list-traversal modes can announce both the list item and the checkbox separately. Real AT testing belongs to a journey-level a11y pass (Epic 3 territory).

## Deferred from: code review of story 2-5 (2026-04-29)

### Story 2.5 — create-todo full vertical slice (commit `73b60ca`)

- **Visibility refetch races optimistic POST → silent reconcile no-op** — [apps/web/src/components/TodoApp.tsx:36-67](../../apps/web/src/components/TodoApp.tsx#L36-L67) + [apps/web/src/lib/reducer.ts:42-52](../../apps/web/src/lib/reducer.ts#L42-L52). If `loadSuccess` (visibility refetch) replaces `state.todos` while a `createTodo` is in flight, the resolving `addReconcile` finds no `tempId` and no-ops; the just-created server row only appears on the next GET. Cross-epic interaction — resolution belongs in Epic 3 (Stories 3.4/3.5) where retry/refetch UX is in scope.
- **IME composition Enter submits partial CJK text** — [apps/web/src/components/TodoInput.tsx:24-29](../../apps/web/src/components/TodoInput.tsx#L24-L29). `<form onSubmit>` fires on Enter even during IME composition (`event.nativeEvent.isComposing === true`), so a CJK candidate-confirmation Enter can submit the partial composition. Suppress submit while composing in a future a11y/UX hardening pass; no PRD requirement today.
- **`?? requestId` does not fall back when server sends empty `x-request-id` header** — [apps/web/src/lib/api.ts:76](../../apps/web/src/lib/api.ts#L76) (createTodo) and [apps/web/src/lib/api.ts:32](../../apps/web/src/lib/api.ts#L32) (getTodos). `headers.get(...) ?? requestId` only catches null/undefined, so an empty server header propagates as `''`. Realistic risk is low (servers don't normally emit empty headers); fix belongs in a focused hardening pass that touches both wrappers consistently.
- **Synthetic `ApiError` on JSON-parse rejection swallows original `SyntaxError` (no cause chaining)** — [apps/web/src/lib/api.ts:79-87](../../apps/web/src/lib/api.ts#L79-L87) (createTodo) and [apps/web/src/lib/api.ts:35-43](../../apps/web/src/lib/api.ts#L35-L43) (getTodos). Bare `catch {}` discards line/column info and any abort-during-stream signal. Add `cause: error` to the synthetic `ApiError` constructor in the same hardening pass.
- **`neverResolves` test promise leaks past test boundary** — [apps/web/src/components/TodoApp.test.tsx:139-147](../../apps/web/src/components/TodoApp.test.tsx#L139-L147). `vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))` leaves a dangling microtask that survives `vi.unstubAllGlobals()`. Not a runtime defect; flaky-test seed under parallelism. Tighten by stubbing with an `AbortController.signal` and aborting in `afterEach`, or by mocking with a Response that never flushes.
- **No explicit three-rapid-submit test for AC #9** — [apps/web/src/components/TodoApp.test.tsx](../../apps/web/src/components/TodoApp.test.tsx). AC #9 ("three rapid submits → three reconciled todos, distinct tempIds, no orphans") is structurally satisfied by the reducer's index-replacement `addReconcile` plus per-call `crypto.randomUUID()`, but no test pins the multi-submit interleaving. Optional coverage addition; not a regression.

## Deferred from: code review of story 2-4 (2026-04-29)

### Story 2.4 — reducer extensions for optimistic mutations (commit `505c6df`)

- **`loadStart` / `loadSuccess` / `loadError` clobber pending optimistic entries** — [apps/web/src/lib/reducer.ts:42-52](../../apps/web/src/lib/reducer.ts#L42-L52). Today only the initial-mount load fires `loadStart`, so no in-flight optimistic exists at that moment — the lifecycle is safe by construction. The hazard becomes load-bearing for Story 3.4 (initial-load error recovery / retry button): a retry that fires `loadStart` while a mutation is mid-flight would silently discard the pending entry, and any subsequent `addReconcile`/`addFailed` for that tempId becomes a permanent no-op (status would no longer be `success`). Decide stale-while-revalidate semantics when the retry button lands. (Architecture cuts re-fetch UI from v1; this is the natural place to revisit.)
- **No frozen-input test pinning AC #10's "no mutation of state/action arguments"** — [apps/web/src/lib/reducer.test.ts](../../apps/web/src/lib/reducer.test.ts). Reducer uses `slice()`/`filter()`/spread correctly today; a future regression that mutates `state.todos` in place (e.g. `state.todos.push(...)` then return `state`) would silently pass — tests assert on `next.todos` references and `toBe(existing)` child preservation, both of which survive in-place mutation. Hardening: `Object.freeze(state)` + `Object.freeze(state.todos)` in setup, or pre/post `state.todos.length` snapshots. Belongs in a future test-infra story.

## Deferred from: code review of story 2-3 (2026-04-29)

### Story 2.3 — DELETE /todos/:id with concurrent-delete safety (commits `114056d..c46a3e4`)

- **204 response: no assertion on `Content-Length` or `Content-Type` headers** — [apps/api/test/integration/todos.int.test.ts:108-112](../../apps/api/test/integration/todos.int.test.ts#L108-L112). The test asserts `res.body === ''` (sufficient for the practical case), but does not pin `content-length: 0` or absence of `content-type`. A future Fastify config drift that emits `Content-Type: application/json` with a `null` payload on 204 would still pass the body-empty check. Low risk — Fastify is well-behaved here — but worth tightening alongside future error-envelope work.
- **`find(...) === undefined` tautology when array is empty** — [apps/api/test/integration/todos.int.test.ts:131-137,165-173](../../apps/api/test/integration/todos.int.test.ts) and [apps/api/test/integration/concurrency.int.test.ts:75-82](../../apps/api/test/integration/concurrency.int.test.ts#L75-L82). Post-DELETE round-trip GET asserts the row is missing via `find(...) === undefined`, but if the GET ever returned `[]` for an unrelated reason, the assertion would silently pass. Adding an `assert.ok(todos.some(t => t.id === id))` precondition before the DELETE would prove "row was there → row was removed" rather than just "row is not there now." Test hardening, not a current bug.

## Deferred from: code review of story 2-2 (2026-04-29)

### Story 2.2 — PATCH /todos/:id with LWW semantics (commits `ab93e19..32eec9c`)

- **`--test-concurrency=1` masks a structural cross-file isolation problem** — [apps/api/package.json:13](../../apps/api/package.json#L13). The fix works for now but treats a symptom: cross-file `beforeEach(resetTodos)` is unsound for the architecture's pre-named test files (`todos`, `validation`, `concurrency` per [architecture.md:597](../../_bmad-output/planning-artifacts/architecture.md#L597)). Story 2.3 DELETE concurrency and any future per-file integration test will inherit the forced serial execution. Hardening options: (a) per-file schema namespace, (b) transactional rollback per test, (c) move `concurrency.int.test.ts` outside the shared `beforeEach(resetTodos)` lifecycle. Revisit before CI sharding or before Story 2.3 lands a second concurrency test.
- **`Promise.all` may not actually demonstrate LWW non-determinism** — [apps/api/test/integration/concurrency.int.test.ts:31-39](../../apps/api/test/integration/concurrency.int.test.ts#L31-L39). With a single Fastify event loop and pg pool serialization, the test can pass without ever truly racing — the assertion `final.completed === true || final.completed === false` is trivially satisfied. The test still proves "no error/deadlock under contention" (NFR6), but the LWW non-determinism itself is not directly observed. Future stress/chaos test would harden.
- **Idempotent test doesn't compare bodies of repeated PATCHes byte-for-byte** — [apps/api/test/integration/todos.int.test.ts:233-251](../../apps/api/test/integration/todos.int.test.ts#L233-L251). Both PATCHes return 200 with `completed: true`, but a regression where the second response differs in any other field (`text`, `id`) would not be caught. Low-priority test hardening.
- **Unknown-field test depends solely on `.strict()` being on** — [apps/api/test/integration/todos.int.test.ts:299-313](../../apps/api/test/integration/todos.int.test.ts#L299-L313). If `UpdateTodoRequestSchema` ever drops `.strict()`, Zod would silently strip the unknown `text` field and the route would 200 instead of 400. The shared schema's contract tests cover strictness; a redundant assertion at the integration boundary would catch cross-package drift earlier. Low risk.
- **No test for wrong/missing `Content-Type` on PATCH** — [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts). Same pre-existing gap as Story 2.1; revisit when an error-envelope-focused story lands.
- **No test for malformed-JSON body or `completed: null`** — [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts). Schema rejects null and Fastify rejects malformed JSON before the handler runs; both are framework-level guarantees but worth a single-line test each.

## Deferred from: code review of story 2-1 (2026-04-29)

### Story 2.1 — POST /todos endpoint (commits `c9ec25a..a94e6cc`)

- **`createdAt` regex doesn't pin timezone or full ISO-8601 format** — [apps/api/test/integration/todos.int.test.ts:99](../../apps/api/test/integration/todos.int.test.ts#L99). Regex `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/` matches local-time emissions; a regression away from `toISOString()` would not be caught. AC #1 promises "ISO-8601" verbatim. Low risk — `toWire` always calls `.toISOString()` — but worth tightening alongside other contract assertions.
- **Negative tests assert status code only, not validation message/path** — [apps/api/test/integration/todos.int.test.ts:120-176](../../apps/api/test/integration/todos.int.test.ts#L120-L176). A regression where the schema rejects valid input for the wrong reason (broken `.trim()`, length cap moved) would still produce 400 silently. At least one negative test should pin the validation `message` content.
- **No test for missing `text` field entirely (`payload: {}`)** — [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts). Schema enforces `required` so the boundary is real but unverified. Most common client bug (forgetting the field) is uncovered. Add when 2.2/2.3 PATCH/DELETE land and similar coverage is needed.
- **No test for wrong/missing `Content-Type`** — [apps/api/test/integration/todos.int.test.ts](../../apps/api/test/integration/todos.int.test.ts). Fastify behavior here depends on parser config; the contract is undocumented. Pre-existing pattern (GET tests don't cover it either). Revisit when error-envelope tests get a dedicated story.
- **No test verifying response schema strips additional fields** — [apps/api/src/routes/todos.ts:51](../../apps/api/src/routes/todos.ts#L51). Without `removeAdditional` configured globally, a future internal column accidentally returned by `toWire` would leak. Same concern applies to GET /todos — pre-existing, orthogonal to Story 2.1's scope. Revisit alongside a global Fastify serializer audit.
- **NUL byte (` `) in `text` produces 500 instead of 400** — [packages/shared/src/contracts.ts:14-18](../../packages/shared/src/contracts.ts#L14-L18). Postgres rejects NUL in `text` columns with SQLSTATE 22021; the global error handler turns this into a 500. Architecture says validation lives at the API boundary (Zod), but `CreateTodoRequestSchema` doesn't refine against NUL. v1 tolerates 5xx from hostile input via the global error handler; harden alongside other Zod refinements when toasts cover mutation-failure UX (Story 3.2).

## Deferred from: code review of story 1-11 (2026-04-29)

### Story 1.11 — build & deployment artifacts (commits `ad5e3ab..141aeae`)

- **README "Reference deployment" Option B `docker compose ... run --rm api ... drizzle-kit migrate` will fail; `|| echo` swallows the error** — [README.md:127-129](../../README.md#L127-L129). drizzle-kit is pruned from the runtime image, drizzle.config.ts is not copied, and the `fastify` user (uid 1001) cannot `npx`-install at runtime. Explicitly deferred to a future `apps/api/Dockerfile.migrate` story per Dev Notes; Option A (deployer host) is the supported path for v1.
- **Hand-maintained denylist of hoisted apps/web prod deps in api Dockerfile** — [apps/api/Dockerfile:51-57](../../apps/api/Dockerfile#L51-L57). Future web prod dep additions (e.g., `@vercel/og`) will silently bloat the api image and ship unused code/CVEs. Acknowledged as Deviation #3 in Dev Notes. Revisit when image-size monitoring or dep policy tooling is in scope.
- **`apps/web/next.config.ts` does not set `outputFileTracingRoot`** — [apps/web/next.config.ts](../../apps/web/next.config.ts). Next.js standalone in a monorepo can emit `server.js` at `.next/standalone/server.js` (root) instead of `.next/standalone/apps/web/server.js`; the Dockerfile's `CMD ["node", "apps/web/server.js"]` would then crash at runtime. Dev claims `docker build` succeeded with image size 195 MB; build success ≠ runtime success. Pair with the next item.
- **No CI smoke-test step actually runs the built images** — [.github/workflows/ci.yml:42-67](../../.github/workflows/ci.yml#L42-L67). `docker build` in the verify job catches build-time errors only; a broken `CMD` (e.g., the standalone path issue above) still publishes to GHCR. Add a `docker run --rm <image> --help` or HTTP probe against a transient container.
- **Production compose `image: ghcr.io/...` lines are commented out** — [docker-compose.production.yml:38, 65](../../docker-compose.production.yml). Operators following the README quick-start build locally on the prod host instead of pulling the published GHCR images. README claims images publish to GHCR on every push, creating a documentation/UX disconnect. Document operator-edit step or default to `image:` with `${IMAGE_TAG:-latest}` and `<owner>` placeholder.
- **`:latest` race on concurrent main pushes; no `concurrency:` block on publish job** — [.github/workflows/ci.yml:69-128](../../.github/workflows/ci.yml#L69-L128). Two near-simultaneous main merges can overwrite `:latest` non-deterministically; web/api `:latest` can drift to different commits → contract drift. Add `concurrency: { group: publish-${{ github.ref }}, cancel-in-progress: false }`.
- **`packages: write` granted at workflow top-level rather than scoped to publish job** — [.github/workflows/ci.yml:11](../../.github/workflows/ci.yml#L11). Defense-in-depth gap; verify-job actions get write access they don't need.
- **GitHub Actions pinned by major tag (`@v6`/`@v7`/`@v4`), not full SHA** — [.github/workflows/ci.yml](../../.github/workflows/ci.yml) (multiple). Supply-chain hardening miss; combined with `packages: write` granted to verify, a compromised major-tagged action could push to GHCR.
- **No SBOM/provenance attestation, no image vulnerability scan in `docker/build-push-action`** — [.github/workflows/ci.yml:97-128](../../.github/workflows/ci.yml#L97-L128). Operators consuming `:latest` images cannot verify build origin; node:22-alpine CVEs go unnoticed without scheduled rebuilds. Add `provenance: true`, `sbom: true`, or a Trivy/grype step.
- **No multi-arch build; published images are amd64-only** — [.github/workflows/ci.yml](../../.github/workflows/ci.yml). Apple Silicon dev machines, AWS Graviton, Hetzner ARM hosts pull amd64 manifests and emulate (5–10× slowdown for native deps like `pg`/`sharp`) or fail on strict-platform hosts.
- **No `concurrency: cancel-in-progress` on PR verify job** — [.github/workflows/ci.yml](../../.github/workflows/ci.yml). Rapid commits to a PR run all verify jobs to completion in parallel; ~5× CI cost for no benefit.
- **Per-app `apps/api/.dockerignore` and `apps/web/.dockerignore` files are dead code** — `context: .` (repo root) consults only the root `.dockerignore`, never the per-app ones. Spec asked for them; removing them is out-of-spec. Dead-code maintenance burden; entries like `apps/api/test/`, `**/*.test.ts` are NOT honored, so test fixtures leak into the build context and `tsc` may compile them into `dist/`.
- **Root `.dockerignore` missing `coverage/`, `.vscode/`, `.idea/`, `*.tsbuildinfo`, `.DS_Store`** — [.dockerignore](../../.dockerignore). Bigger build context than necessary; minor perf and leakage concern.
- **`.dockerignore` excludes `**/.env*` correctly, but README tells operators to create `.env.production`** — [.dockerignore:5-6](../../.dockerignore#L5-L6), [README.md:117](../../README.md#L117). Documentation conflict that may lead an operator to "fix" by removing the exclude and accidentally bake real `.env` (with dev passwords) into the image.
- **No read-only filesystem, `cap_drop`, `security_opt: no-new-privileges`, or `tmpfs` on services** — [docker-compose.production.yml](../../docker-compose.production.yml). Hardening miss in a "production reference" file.
- **No `mem_limit`, `cpus`, or `pids_limit` resource constraints on services** — [docker-compose.production.yml](../../docker-compose.production.yml). Memory leak in api → OOM-killer → Postgres eviction → potential DB volume corruption on a single-host VPS deployment.
- **No `tini`/`dumb-init` for PID-1 init in either runtime image** — [apps/api/Dockerfile](../../apps/api/Dockerfile), [apps/web/Dockerfile](../../apps/web/Dockerfile). Node handles SIGTERM via app handlers but does not reap zombie children if any code path forks.
- **Web container has no healthcheck** — [docker-compose.production.yml:55-72](../../docker-compose.production.yml#L55-L72). Compose's `service_healthy` works for `api → web`, but a fronting reverse proxy or orchestrator has no liveness signal for web.
- **API healthcheck depends on DB; transient DB blip cascades** — [docker-compose.production.yml:52-57](../../docker-compose.production.yml#L52-L57). `/health` returns 503 if `SELECT 1` fails; a brief Postgres restart flips api unhealthy after 3×30s retries; liveness/readiness conflated.
- **Bare `fetch()` in api healthcheck has no per-call timeout** — [docker-compose.production.yml:53](../../docker-compose.production.yml#L53). Relies on docker `timeout: 5s` to kill hung node invocation; ~100ms cold start per probe.
- **`depends_on: condition: service_healthy` makes web hang forever if api never goes healthy** — [docker-compose.production.yml:72-74](../../docker-compose.production.yml#L72-L74). DATABASE_URL typo → api never healthy → web pending forever; no compose-level timeout. Operator sees "web pending" with no obvious error.
- **`restart: unless-stopped` + fail-fast schema-drift exit = restart loop without back-off** — [docker-compose.production.yml](../../docker-compose.production.yml). If operator forgets pre-deploy migration, api fails fast → restart → fail fast → loop ~10–100×/min, flooding logs and exhausting Postgres connection slots.
- **Production compose volume `todo-app-db-data` shares its name with the dev compose volume** — [docker-compose.production.yml:24, 76-77](../../docker-compose.production.yml#L24). Compose default project name = directory name; if both stacks run on the same host, they share `<project>_todo-app-db-data` and can cross-contaminate data.
- **Builder stage `COPY --from=deps /app/apps/api/node_modules` may break if hoisting changes** — [apps/api/Dockerfile:35](../../apps/api/Dockerfile#L35). If a future npm/lockfile change hoists everything (no per-workspace dir), the COPY fails with "not found in builder context."
- **Builder stage compiles test files into `dist/` if `apps/api/tsconfig.json` doesn't `exclude` `**/*.test.ts`** — [apps/api/Dockerfile:40](../../apps/api/Dockerfile#L40). Combined with the dead per-app .dockerignore: test fixtures leak into the build context and tsc may compile them, increasing surface area in the runtime image.
- **README example writes `POSTGRES_PASSWORD=<strong-password>` to `.env.production` plaintext** — [README.md:117-124](../../README.md#L117-L124). No `chmod 600`, no secret-manager guidance. For a "reference deployment" this normalizes plaintext secrets at rest.
- **`apps/api/node_modules` copied into runtime stage but not acknowledged in Dev Notes Debug Log Deviation #2** — [apps/api/Dockerfile:76](../../apps/api/Dockerfile#L76). Documentation transparency: Deviation #2 only mentions builder stages. Update Dev Notes when the file is next touched.

## Deferred from: code review of story 1-10 (2026-04-29)

### Story 1.10 — single-command local dev orchestration (commit `3cf9a6a`)

- **`.env` guard misses directories, dangling symlinks, and missing required keys** — [scripts/dev.sh:18](../../scripts/dev.sh#L18). `[ ! -f .env ]` returns false for a directory, dangling symlink (where target is missing/unreadable), or a regular file with perms 000; downstream `docker compose` substitution then fails with a less-friendly `${VAR:?}` message. Spec explicitly out-of-scoped env validation.
- **No friendly guard for Docker daemon down or Compose v2 plugin missing** — [scripts/dev.sh:32](../../scripts/dev.sh#L32). Bare `docker compose up` errors are cryptic ("Cannot connect to the Docker daemon" / "compose is not a docker command"). A pre-flight `docker info` + `docker compose version` would map to actionable hints. Spec out-of-scoped.
- **No `--wait-timeout` on `docker compose up --wait db`** — [scripts/dev.sh:32](../../scripts/dev.sh#L32). Compose v2's default is 0 = no timeout; a wedged healthcheck (e.g., a corrupt PG volume) can hang indefinitely. Healthcheck `start_period`/`retries` from docker-compose.yml will eventually fail, but explicit `--wait-timeout` would surface the issue faster.
- **No port 5432 / 3000 / 4000 collision precheck** — [scripts/dev.sh](../../scripts/dev.sh), [README.md:52-58](../../README.md#L52-L58). Today only documented in README troubleshooting. A `lsof -nPi :5432 -sTCP:LISTEN` precheck before `docker compose up` would have caught the Debug Log §Environmental-incident scenario. Spec out-of-scoped.
- **DATABASE_URL ↔ docker-compose.yml drift footgun** — [scripts/dev.sh:35](../../scripts/dev.sh#L35). If `.env` `DATABASE_URL` host/port doesn't match the compose-published port, `db:migrate` runs against a different DB. The Debug Log already documents one occurrence (5432 vs 5433 drift). A simple URL parse + port match would catch it. Env validation is explicitly out-of-scope per the spec, but this is the highest-risk footgun on the list — revisit early in any dev-experience hardening pass.
- **`exec npx --no-install npm-run-all` falls through to global PATH** — [scripts/dev.sh:38](../../scripts/dev.sh#L38). If a developer runs `npm run dev` before `npm install` (or after a partial `node_modules` clean), `npx --no-install` can pick up a globally-installed `npm-run-all` (likely the unmaintained original, not `npm-run-all2`). Replace with explicit `exec ./node_modules/.bin/npm-run-all` plus a pre-flight `[ -x node_modules/.bin/npm-run-all ] || die "run 'npm install' first"`.
- **No `--race` / `--kill-others-on-fail` on parallel dev servers** — [scripts/dev.sh:38](../../scripts/dev.sh#L38). If `dev:api` crashes, `dev:web` keeps running and the user sees a half-running stack until manual Ctrl+C; AC #2's "fail-fast" is satisfied technically but not in spirit. Adding `--race` changes semantics (a single recoverable crash kills the whole stack), so deferred for an explicit decision rather than auto-applied.
- **Ctrl+C may leak `next dev` / `node --watch` grandchildren** — [scripts/dev.sh:38](../../scripts/dev.sh#L38). `npm-run-all2` forwards SIGINT to direct children, but Next.js / `node --watch` workers can survive past their parents on macOS. No clean fix without dedicated process-group management; revisit if EADDRINUSE-on-restart becomes a recurring annoyance.
- **No SIGINT/SIGTERM trap around `db:migrate`** — [scripts/dev.sh:35](../../scripts/dev.sh#L35). Interrupting `drizzle-kit migrate` mid-statement leaves the DB in a partial state with no remediation hint. Drizzle's journal/migrations table is supposed to make this safe, but the user gets no friendly pointer to `db:check`.
- **`test:*` glob will silently absorb future `test:integration`** — [package.json:15](../../package.json#L15). Once Story 1.11 (or later) wires `test:integration`, `npm run test` from root will start requiring Postgres in CI, breaking the spec's explicit "no DB required" contract. Replace the glob with an explicit list (`test:shared test:api test:web`) when the integration script lands.
- **README docs nits** — [README.md:8-10](../../README.md#L8-L10), [README.md:52-58](../../README.md#L52-L58). (a) `brew services stop postgresql` is macOS-only with no Linux (`systemctl`) or Windows hint; (b) `PORT` override is documented for api but not web (`npm --workspace apps/web run dev -- -p 3001`); (c) `bash` is not listed in Prerequisites despite Windows-without-WSL users needing it (`npm run dev` invokes `bash scripts/dev.sh`).
- **Image-pull offline / unhealthy-container failure modes lack diagnostic surfacing** — [scripts/dev.sh:32](../../scripts/dev.sh#L32). On `docker compose up -d --wait db` failure (image pull offline, healthcheck retries exhausted), the script dies with bare exit 1; no automatic `docker compose logs db` echo to point the user at the actual cause.

## Deferred from: code review of story 1-9 (2026-04-29)

### Story 1.9 — TodoList + TodoItem (commit `01f9a75`)

- **`aria-checked` on `<li role="listitem">` is invalid ARIA per ARIA 1.2** — `apps/web/src/components/TodoItem.tsx:11-13`. Spec-prescribed in Task 3 line 149 as the lightest Epic-1 signal that satisfies NFR12 without falsely advertising interactivity; eslint-disable comment in place documents the deferral. Story 2.6 swaps the entire row to Radix Checkbox with proper `role="checkbox"` semantics, which retires the disable.
- **Error branch drops `state.error` and `state.requestId`** — `apps/web/src/components/TodoList.tsx:21-32`. Component destructures `{ status, todos }` only; the reducer's captured correlation-id is not rendered, copied, or even hidden in a `data-*` attribute. Spec-mandated minimal fallback per AC #6 ("EPIC 1 PLACEHOLDER"); Story 3.1 owns the full error UX via Radix Toast where the requestId can surface for debugging.
- **`aria-live` region is a sibling-swap, not a persistent container** — `apps/web/src/components/TodoList.tsx:8-50`. Each branch (loading / empty / populated / error) returns a different DOM node, so a `success → loading` transition mounts a fresh live region; some screen readers only announce updates inside an *existing* live region. No `success → loading` transition exists in Epic 1 (visibility refetch deliberately skips `loadStart`). Revisit when Story 3.4's retry button or a manual-refresh affordance introduces the transition path.

## Deferred from: code review of stories 1-2, 1-3, 1-4, 1-8 (2026-04-29, Run 2)

### Story 1.2 — Zod contracts (commit `c2168ca`)

- **Tighten `error`/`message` to `.min(1)` and `statusCode` to `.gte(100).lte(599)`** — ErrorResponseSchema accepts empty strings and out-of-band status codes today. Spec defines them as bare types; tightening = future hardening.
- **Add export-surface pin test** — no test asserts that exactly 5 schemas + 5 inferred types are exported; an accidental future export slips through.
- **ZodError predicate-form assertions** — `assert.throws(..., z.ZodError)` doesn't pin which field caused the failure; tighten to `(e) => e.issues[0].path[0] === 'id'` form.
- **Top-level non-object input tests** — null/undefined/array/primitive at the schema root are untested for TodoSchema, CreateTodoRequestSchema, UpdateTodoRequestSchema, ErrorResponseSchema.
- **ISO datetime edge cases** — no explicit test for `+00:00` offset, microsecond precision, or missing-`Z`.

### Story 1.3 — docker-compose Postgres (commits `356ac02` + `976faa2`)

- **Pin `postgres:17-alpine` to a digest (`@sha256:...`)** — minor patch-version drift today; revisit if a deployed-image story lands.
- **Make host port configurable via `${HOST_DB_PORT:-5432}`** — currently hard-coded; the historical 5433 detour shows the collision is real.
- **Postgres tuning knobs (`shm_size`, `logging.options.max-size`, `ulimits`)** — none needed at v1 scale.

### Story 1.4 — Drizzle data layer (commit `bd1954f` + `9f2c763`)

- **Pool config (`max`, timeouts, SSL)** [apps/api/src/db/client.ts] — production tuning; Story 1.5+ handles when the API serves real traffic.
- **Migration drift checker has zero unit tests** [apps/api/src/db/migrate.ts] — needs a real DB or heavy mock harness; defer until api-app test infra lands.
- **Concurrent `db:check` invocations have no advisory lock** — acceptable for single-developer dev loop; revisit when CI parallelism lands.
- **No `--> statement-breakpoint` discipline** — single-statement migration is fine; future multi-statement migrations should enforce.
- **Export `Todo`/`TodoRow` named type from `client.ts`** — handlers re-derive via TS inference today; export when the second handler lands.

### Story 1.8 — typed API client + reducer (commit `33d63b8`)

- **Explicit fetch timeout via `AbortSignal.timeout(...)` composed with caller's signal** [apps/web/src/lib/api.ts] — hung server keeps the user in `loading` indefinitely; spec doesn't mandate a deadline.
- **`crypto.randomUUID()` polyfill for non-secure contexts** — works in current targets; revisit if deploy story expands browser baseline.
- **No tests for `TodoApp.tsx`** (visibilitychange handler, AbortError swallow path, cancelled-flag race) — vitest config uses `environment: 'node'`; React component tests need jsdom + RTL devDeps. Belongs in a dedicated test-infra story.
- **No tests for `ApiError.fromResponse` non-JSON-body and CORS-stripped-`x-request-id` paths** — coverage hardening, not blocking.
- **`ErrorResponseSchema.safeParse` with `.strict()` drops the server's `message` when the body adds an unknown field** — relaxing this requires a contract decision (spec defines `.strict()` in Story 1.2). Couple to a later schema-evolution discussion.
- **Reducer `loadStart` wipes `todos` and `loadError` clears them** — current behavior is unreached today (visibility refetch silently ignores failures and skips `loadStart`); a future retry button would flicker the list. Decide on stale-while-revalidate semantics when Story 3.3+ wires retry.
- **`aria-live="polite"` on the placeholder always announces** — should gate to loading/error transitions; minor a11y polish for a later UX story.
- **`@vitest/ui` shipped as devDep but no `test:ui` script** — add the script or drop the dep; cosmetic.

## Deferred from: code review of story 1-1 (2026-04-29, Run 2)

### Story 1.1 — monorepo scaffold (commit `9e4570e`, hand-rolled chunk only)

- **Add `typecheck` / `format` / `format:check` scripts to root `package.json`** — only `lint` exists, so strict TS is not verified on any PR and `.prettierrc`/`.prettierignore` are decorative. Belongs in CI/orchestration story (1.10/1.11).
- **Add `packageManager` field and pin `.nvmrc` to a 22.x minor** — `engines.node >=22` and `.nvmrc=22` allow drift across 22.x releases. Reproducibility nicety; lockfile already catches the npm-vs-pnpm/yarn divergence in practice.
- **Add `*.tsbuildinfo`, `.turbo/`, `.vercel/` to `.gitignore` and `.prettierignore`** — `incremental: true` in `apps/web/tsconfig.json` will produce `.tsbuildinfo`. Not a problem until tools start generating them; revisit when CI/build artifacts land.
- **Tighten `lint` script to `eslint . --max-warnings=0`** — 4 cosmetic warnings in fastify-cli scaffold currently pass silently. Aligns with the spec's Completion Notes follow-up about real test code replacing the boilerplate.
- **Resolver project paths in `eslint.config.mjs:13` are relative** — works when invoked via `npm run lint` from repo root; falls back to node resolver silently if invoked with a different CWD. Cosmetic for current usage.

## Deferred from: code review of story 1-7 (2026-04-29)

### Story 1.7 — apps/web shell + Tailwind + TodoApp placeholder (commit `6ec778f`)

- **Hydration / FOUC risk for dark-mode users** — `apps/web/src/app/globals.css:15-19`. CSS-only `prefers-color-scheme: dark` swap is hydration-safe in React's strict sense (no JSX branching), but SSG bakes light-mode CSS at build → dark-mode clients see a white-then-flip flash at first paint. Future class-based dark mode (e.g., `next-themes`) needs `html.dark` selector path. Acceptable for v1 MVP; revisit if a no-flicker theme script lands.
- **Geist Google fonts fail at build offline** — `apps/web/src/app/layout.tsx:2`. Air-gapped CI / restrictive corporate proxies / Docker stages without network will hard-fail `next build`. No `fallback` array declared. Mitigate with `fallback: ['system-ui', 'arial']` or vendor Geist via `next/font/local` if/when this becomes a real problem. Story 1.11 deployment-hardening is the natural place.
- **Path alias `@/*` works for TS/TSX but Turbopack doesn't read `tsconfig.paths` for non-TS files** — `apps/web/src/app/page.tsx:1`. Forward-trap: a future contributor importing `@/components/foo.css` or `@/components/icon.svg` will get a Turbopack resolution error even though the editor's TS Language Server resolves it fine. Document in `apps/web/AGENTS.md` or mirror the alias into `next.config.ts` `turbopack.resolveAlias` if it becomes a real problem.
- **No skip-link for keyboard users** — `apps/web/src/app/layout.tsx + page.tsx`. `:focus-visible` ring is in place but no `<a href="#main">Skip to content</a>` exists. Architecture-level a11y addition; not an AC violation for 1.7. Add when the first complex layout (sidebar/header) lands.
- **`<section aria-labelledby="todos-heading">` couples to the in-tree `<h1>` location** — `apps/web/src/components/TodoApp.tsx:5-8`. If a future story moves the `<h1>` into a header bar, `aria-labelledby` dangles and screen readers fall back to "section" with no accessible name. Refactor-time concern.
- **`min-h-full` cascade fragility at extreme viewports** — `apps/web/src/app/layout.tsx:25-30`. Without explicit `height: 100%` on `:root`, edge-case viewports (0px iframes, print stylesheets, unusual zooms) may break the layout. Acceptable for an MVP scaffold; revisit before any iframe-embed or print scenarios.
- **Hard-coded focus outline color `#2563eb` ignores design tokens / dark mode** — `apps/web/src/app/globals.css:24`. Doesn't use `--foreground` or any CSS var. Story spec justifies via WCAG math (7.2:1 / 8.6:1 in both modes — both AAA). Theming concern, not a defect.

## Deferred from: code review of story 1-6 (2026-04-29)

### Story 1.6 — apps/api /health + /docs (commit `e044afa`)

- **`buildProductionTestApp` env mutation is parallel-test-hostile** — `apps/api/test/integration/helpers/buildTestApp.ts:152-180`. `process.env` is process-global; mutating in the build phase poisons concurrent reads in sibling tests until `onClose` restores. Within a single file `node:test` is sequential (safe today); cross-file parallel workers race. Defer to Story 1.11 if/when CI parallelization arrives.
- **`HealthDegradedSchema.checks.db` is always `false` — useless field** — `apps/api/src/routes/health.ts:11-16`. Field shape is decorative until a second probe lands ("API up but cache/queue down"). AC #2 wording locks the current shape; defer reshape to whenever multi-probe arrives.
- **`req.log.warn` throwing inside the 503 path is uncaught** — `apps/api/src/routes/health.ts:30`. Theoretical: Pino doesn't throw in normal operation. Defensive try/catch would be overkill for v1.
- **`/health` 503 schema drift to 500 hazard** — `apps/api/src/routes/health.ts:18-29`. If a future contributor adds a redis/queue check to `HealthDegradedSchema` but not the handler payload, Zod's `.strict()` would cause the response serializer to throw → setErrorHandler → 500. Add a "schema parity test" if/when extending.
- **No test asserts `/health` is rate-limited / behind helmet / CORS** — `apps/api/test/integration/health.int.test.ts`. Story 1.5 deferred-work item AC #3 (rate-limit envelope direct test) covers this turf; adding a `/health`-specific case duplicates that work.
- **`/docs/` HTML test brittle to swagger-ui upgrades** — `apps/api/test/integration/docs.int.test.ts:46-50`. Permissive `text\/html` regex is fine today; future swagger-ui changes (charset negotiation, redirect-target rename) could mask a regression.
- **Pool teardown idempotency masks the deeper architectural concern** — `apps/api/src/plugins/db.ts:23-30`. Even after the message-substring → flag refactor (Story 1.6 patch), the real issue is module-singleton pool ownership. Per-instance pool factory or lazy initialization is the architectural fix. Story 1.11 deployment-hardening is the natural place.

## Deferred from: code review of story 1-5 (2026-04-29)

### Story 1.5 — apps/api GET /todos + plugin stack (commit `727cbad`)

- ~~**Pool singleton can't survive `app.close()` in multi-instance scenarios**~~ — **RESOLVED in Story 1.6** (commit pending). `apps/api/src/plugins/db.ts` now wraps `pool.end()` in a try/catch that swallows the specific "Called end on pool more than once" error message. Multi-instance teardown is idempotent without restructuring pool ownership.
- **`onSend` x-request-id doesn't check headers-sent state** — `apps/api/src/plugins/requestContext.ts:11-13`. If a future stream endpoint begins writing before the hook runs, `reply.header('x-request-id', ...)` is a no-op or throws (Fastify version-dependent). Risk dormant until a streaming endpoint lands; revisit then.
- **AC #3 (429 envelope) direct test** — Story 1.5 Task 12 explicitly cut this; trust the rate-limit plugin's own tests in v1. Story 1.11 (deployment-hardening) is the natural place to revisit with a real exhaustion scenario behind a feature flag.
- **No HTTP header-size cap** — `apps/api/src/server.ts:10`. `bodyLimit: 4096` only caps request bodies. Fastify's default header limits are reasonable; no abuse observed yet. Revisit if hostile-traffic patterns emerge.
- **Logger `LOG_LEVEL` bypasses `@fastify/env` validation** — `apps/api/src/server.ts:12`. Fastify is constructed before `@fastify/env` registers, so the JSON-Schema enum on `LOG_LEVEL` doesn't apply to the logger. Pino throws clearly on truly invalid levels (loud failure, just not "fail-fast" per AC #1's literal wording). Pre-validating env outside `buildApp` adds duplication; defer until value clearly outweighs cost.

## Deferred from: code review of stories 1.1–1.4 (2026-04-29)

### Story 1.4 — apps/api data layer (commit `bd1954f`)

- **Pool not bounded** — `apps/api/src/db/client.ts:10`. No `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, `statement_timeout`. Production tuning concern; the API doesn't serve traffic until Story 1.5. Defer to deploy-readiness story (1.11).
- **No `pool.on('error', ...)` listener** — `apps/api/src/db/client.ts:10`. Idle-client errors crash the process if unhandled. Wire up in Story 1.5 when the API actually owns long-running connections.
- **No graceful shutdown / `pool.end()` on Fastify `onClose`** — `apps/api/src/plugins/db.ts:6-9`. Tests/SIGTERM leak connections. Address when integration tests land in Story 1.5.
- **Module-load throw on missing `DATABASE_URL`** — `apps/api/src/db/client.ts:12-14`. Inhibits unit tests with mocks and tooling that imports schema transitively. Consider lazy init in Story 1.5 when test infrastructure lands.
- **Zod `datetime()` round-trip with Drizzle `Date` objects** — `packages/shared/src/contracts.ts:11` ↔ `apps/api/src/db/schema.ts:7-9`. Surfaces in Story 1.5 when handlers serialize. Fix via `mode: 'string'` on Drizzle column or `.preprocess` on the Zod schema.
- **`migrate.ts` `process.cwd()` coupling** — `apps/api/src/db/migrate.ts:30`. Already disclosed as a Notable Deviation. Harden when module-type decision is made for apps/api.
- **`todos` raw table is exported and not encapsulated** — `apps/api/src/db/schema.ts:3`. The architectural rule "handlers import functions, not raw tables" is documentation-only. Add an ESLint `no-restricted-imports` rule banning `apps/api/src/db/schema` outside `apps/api/src/db/` when more handlers land.
- **Defensive `WHERE hash IS NOT NULL`** — `apps/api/src/db/migrate.ts:87-90`. Safety against drizzle-internal-table corruption. Low priority.
- **`DATABASE_URL` truthy-but-malformed guard** — `apps/api/src/db/client.ts:12-14`. Defensive `URL` parse. Story 1.5 will validate via `@fastify/env`.

### Story 1.3 — docker-compose

- **Volume pruning across schema changes** — `docker-compose.yml:13,21-22`. Operational doc concern; address in Story 1.10's README updates.
- **Host port 5432 collision configurability** — `docker-compose.yml:11`. Operational onboarding note; address in Story 1.10.

### Story 1.2 — shared contracts

- **Zod `datetime()` Date round-trip** — duplicated under Story 1.4 (cross-package issue).
- **`ErrorResponseSchema.statusCode` accepts >599** — `packages/shared/src/contracts.ts:34`. Tighten to `.int().gte(100).lte(599)`. Low priority.
- **contracts.test.ts coverage gaps** — whitespace-only `text`, `completed: null`, `todos: 'not-an-array'`, datetime variants, `Date` instances. Coverage gaps, not bugs.

### Story 1.1 — scaffolding

- **argsIgnorePattern whitelisting in eslint.config.mjs** — `eslint.config.mjs:281-284`. Drop named alternatives in favor of `_request`/`_reply` underscore convention when real API code lands (Story 1.5+).
- **Cross-app ban does not catch dynamic imports** — `eslint.config.mjs:38-50`. Static-analysis only. Add when tooling that uses dynamic imports appears.
- **Cross-app ban scope at repo-root files** — `eslint.config.mjs:51-60`. Files outside `apps/{web,api}/**` globs are not subject to the ban. Minor for v1.
