# Deferred Work

Items intentionally deferred from code reviews. Each entry: source review, file/area, brief rationale.

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
