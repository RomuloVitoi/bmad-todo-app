---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted:
  - step-01-detect-mode
  - step-02-load-context
  - step-03-risk-and-testability
  - step-04-coverage-plan
  - step-05-generate-output
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-04-19'
workflowType: 'testarch-test-design'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
---

# Test Design for QA: todo-app v1

**Purpose:** Test execution recipe for the QA team. Defines what to test, at what level, and what QA needs from other teams before testing can begin.

**Date:** 2026-04-19
**Author:** Master Test Architect (Romulo)
**Status:** Draft
**Project:** todo-app

**Related:** See `test-design-architecture.md` for testability concerns, risk details, and architectural blockers.

---

## Executive Summary

**Scope:** v1 delivery — shared todo list with optimistic CRUD, WCAG 2.1 AA, failure resilience, and diagnostic observability, across a Next.js + Fastify + Postgres monorepo.

**Risk Summary:**

- Total risks: **21** (4 high-priority ≥ 6, 12 medium = 4, 5 low ≤ 2).
- No score-9 blockers. Top categories: OPS (R-008), SEC (R-002), DATA (R-004), BUS (R-001).

**Coverage Summary:**

- P0 tests: ~24 (contracts, reducer matrix, CRUD path, XSS, migration fail-fast, 3 PRD journeys).
- P1 tests: ~27 (accessibility, observability, CORS, rate-limit, concurrency, client wrapper, responsive).
- P2 tests: ~11 (shared-list disclosure, openapi validator, side-states).
- P3 tests: ~5 (perf sample, bundle inspection, unprimed usability).
- **Total: ~67 tests — ~2–3 weeks with 1 QA engineer.**

---

## Testing Philosophy — Shift-Left

QA activities are integrated throughout development, not added at the end. Concretely:

- **Tests land with the code that makes them pass.** Contract tests ship with `packages/shared/src/contracts.ts` (Story 1.2). Reducer tests ship with `apps/web/src/lib/reducer.ts`. Integration tests ship alongside the route handler. No story is "done" without its designated P0/P1 tests passing.
- **Red-phase first for P0 scenarios.** The `/bmad-testarch-atdd` workflow generates failing acceptance tests ahead of implementation for every P0 test listed below — developers implement to green.
- **Accessibility is not a polish pass.** axe-core runs in component + E2E suites from the first UI story (1.7); WCAG AA regressions fail the PR, not a pre-release audit.
- **Developer-side exploration uses MCP tooling** (Postman MCP, Chrome DevTools MCP, Playwright MCP) for fast inspection during dev — these are complements to the automated CI suite, not replacements. See *Tooling & Access → Development-Time Tooling (MCP)* below.
- **Bug triage is test-first.** Any bug reproducible by a missing test case adds the test before the fix, then the fix turns it green.

**Gate implication:** the "release gate" criteria in *Exit Criteria* are continuous, not end-of-phase — a story cannot merge if it regresses any previously-passing P0/P1 test.

---

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| Load / sustained-perf testing | Low v1 scale; PRD does not require sustained load validation | NFR2 baseline spot-checked in integration runs; R-007 documented |
| Authentication / authorization flows | Explicit non-goal for v1 per NFR19 | None — no surface to test |
| Real-time sync / WebSocket behavior | Explicit non-goal per PRD §Real-Time Behavior | API envelope `{todos: [...]}` keeps option open; no v1 test |
| Multi-region / DR drills | Out of v1 scope; deploy-target dependent | Deployer responsibility per Architecture §Backup/DR |
| Bundle-size CI gate | Explicitly deferred in architecture | Manual pre-release check (P2-004); R-006 documented |
| Lighthouse-CI / pa11y-CI full a11y gate | Deferred post-v1 | axe-core scan (P1-013) covers AA violations |

**Note:** Exclusions above are validated against PRD + architecture non-goals.

---

## Dependencies & Test Blockers

**CRITICAL:** QA cannot proceed without these items. See Architecture doc Quick Guide for mitigation ownership.

### Backend / Architecture Dependencies (Pre-Implementation)

1. **ASR-1: Web-tier test stack pinned** — Architect + QA — pre-Story 1.7
   - Recommended: Vitest + `@testing-library/react` + MSW (unit/component); Playwright + `@axe-core/playwright` (E2E).
   - Blocks: every web-tier test.

2. **ASR-2: Integration-test DB isolation** — Dev — Story 1.4
   - Needed: per-worker ephemeral schema strategy in `apps/api/test/integration/helpers/buildTestApp.ts`; migrate-then-test-then-drop lifecycle.
   - Blocks: all Fastify integration tests; blocks `concurrency.int.test.ts` deterministic execution.

3. **ASR-3: Fail-fast schema-drift mechanism** — Dev — Story 1.4
   - Needed: concrete check in `apps/api/src/db/migrate.ts` comparing applied-migration row against journal head; non-zero exit on drift.
   - Blocks: P0-016.

4. **ASR-4: Rate-limit parameterization** — Dev — Story 1.5
   - Needed: config-driven `max` and `timeWindow` on `@fastify/rate-limit` so tests can bypass (default) or target (P1-002).
   - Blocks: all rate-limit-adjacent tests.

### QA Infrastructure Setup (Pre-Implementation)

1. **Test data factories** — QA
   - Faker-based factories for `Todo` and request shapes in a shared test helper under `apps/api/test/helpers/factories.ts`.
   - Auto-cleanup fixtures using the per-worker schema from ASR-2.

2. **Test environments** — QA
   - Local: `docker compose up -d db` + `npm run dev` (smoke-tested in NFR20 gate).
   - CI: GitHub Actions — shared Postgres service container, per-worker schemas.
   - Staging: none planned for v1 (deployment-agnostic).

3. **Playwright utilities (from config)** — QA
   - `tea_use_playwright_utils: true` → use `@seontechnologies/playwright-utils` fixtures where valuable (API-first seeding, typed `apiRequest`, network-first interception).
   - `tea_use_pactjs_utils: false` — no contract-testing fixtures needed (single typed contract boundary via `packages/shared`).

**Example fixture pattern (API seeding + assertion):**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('creates a todo and lists it back @P0 @API', async ({ apiRequest }) => {
  const text = faker.lorem.sentence({ min: 3, max: 8 });

  const createRes = await apiRequest({
    method: 'POST',
    path: '/todos',
    body: { text },
  });
  expect(createRes.status).toBe(201);
  expect(createRes.body).toMatchObject({ text, completed: false });

  const listRes = await apiRequest({ method: 'GET', path: '/todos' });
  expect(listRes.status).toBe(200);
  expect(listRes.body.todos.map((t: { text: string }) => t.text)).toContain(text);
});
```

---

## Risk Assessment

**Note:** Full risk details and mitigation plans are in the Architecture doc. This table summarizes QA coverage mapping.

### High-Priority Risks (Score ≥ 6)

| Risk ID   | Category | Description                                      | Score | QA Test Coverage                                                           |
| --------- | -------- | ------------------------------------------------ | ----- | -------------------------------------------------------------------------- |
| **R-001** | BUS      | Shared-list abuse / trolling                     | **6** | P1-002 rate-limit 429; P2-001 disclosure microcopy presence                |
| **R-002** | SEC      | Stored XSS via todo text                         | **6** | P0-013 end-to-end `<script>` payload; P1-024 Toast never renders stack     |
| **R-004** | DATA     | Optimistic-UI rollback correctness               | **6** | P0-017..P0-021 reducer unit matrix; P0-024 Journey 3 E2E                   |
| **R-008** | OPS      | API boots on outdated DB schema                  | **6** | P0-015 `/health` DB probe; P0-016 migrate fail-fast exit                   |

### Medium / Low Priority Risks

| Risk ID | Category | Description                                    | Score | QA Test Coverage                                    |
| ------- | -------- | ---------------------------------------------- | ----- | --------------------------------------------------- |
| R-003   | DATA     | LWW under concurrent mutations                 | 4     | P1-004 parallel PATCHes                             |
| R-005   | SEC      | CORS misconfiguration                          | 4     | P1-001 allowed vs. disallowed origin                |
| R-006   | PERF     | Bundle > 200 KB gzipped                        | 4     | P2-004 pre-release bundle inspection                |
| R-009   | TECH     | Forbidden-field injection on create            | 4     | P0-003 `.strict()` rejection                        |
| R-010   | SEC      | Rate-limit XFF bypass                          | 4     | P1-003 direct-connection rate-limit test            |
| R-011   | BUS     | Users assume list is private                   | 4     | P2-001 disclosure presence                          |
| R-013   | BUS     | Color-only state conveyance                    | 4     | P1-013 axe scan; P1-015 `aria-checked`              |
| R-014   | SEC      | Oversized body                                 | 4     | P0-014 413 on > 4 KB, 400 on > 500 chars           |
| R-015   | OPS      | Unhandled rejection crashes UI                 | 4     | P1-026 listener fires + P0-024 Journey 3           |
| R-016   | TECH     | Contract drift (Drizzle / Zod / OpenAPI)       | 4     | P1-007 swagger-parser; P1-009 round-trip           |
| R-019   | PERF     | Rapid-toggle race                              | 4     | P1-027 reducer rapid sequence                       |
| R-020   | OPS      | Correlation id not in support reports          | 4     | P1-005/P1-006 echo tests; P2-007 toast surfaces id |
| R-007   | PERF     | Server p95 > 300 ms                            | 2     | P3-001 k6 sample                                    |
| R-012   | OPS      | Missing env var silent misbehavior             | 2     | P1-021 startup fail on missing env                  |
| R-017   | OPS      | Debug logs leak todo text                      | 1     | P3-004 log-field audit                              |
| R-018   | BUS      | Ordering inconsistency across users            | 2     | P0-006 repeated-GET ordering                        |
| R-021   | BUS      | Concurrent-delete UI jitter                    | 2     | P3-003 exploratory                                  |

---

## Entry Criteria

- [ ] Architecture and PRD frozen for v1.
- [ ] ASR-1..ASR-4 resolved and in code.
- [ ] `packages/shared` Zod schemas implemented and published.
- [ ] `apps/api/src/db/schema.ts` + initial migration committed.
- [ ] `docker compose up -d db` runs cleanly on a fresh clone (smoke-validated by NFR20).
- [ ] Test data factories wired into `buildTestApp.ts`.

## Exit Criteria

- [ ] P0 pass rate = 100%.
- [ ] P1 pass rate ≥ 95%.
- [ ] 0 WCAG 2.1 AA violations (axe-core) on reachable pages.
- [ ] All score-6 mitigations covered by passing tests (R-001 by P1-002; R-002 by P0-013; R-004 by P0-017..P0-021 + P0-024; R-008 by P0-015 + P0-016).
- [ ] No open P0/P1 bugs.
- [ ] OpenAPI spec parses cleanly under `swagger-parser`.

---

## Test Coverage Plan

**IMPORTANT:** P0/P1/P2/P3 below indicate **priority and risk level** (what to focus on if time-constrained), NOT execution timing. All priorities run in every PR unless noted; see the Execution Strategy section for tool-based timing.

### P0 (Critical)

**Criteria:** Blocks core functionality + high risk (≥ 6) + no workaround + affects the primary user path.

| Test ID    | Requirement                                                                       | Test Level   | Risk Link       | Notes                                                                                   |
| ---------- | --------------------------------------------------------------------------------- | ------------ | --------------- | --------------------------------------------------------------------------------------- |
| **P0-001** | `TodoSchema` accepts valid todo; rejects bad uuid / bad datetime                  | Unit         | R-016           | `packages/shared/src/contracts.test.ts`                                                 |
| **P0-002** | `CreateTodoRequestSchema` trims; rejects empty/too-long/non-string; `.strict()`  | Unit         | R-009, R-014    | Includes whitespace trimming + unknown-field rejection                                  |
| **P0-003** | `UpdateTodoRequestSchema` accepts `{completed}` only; `.strict()` rejects extras | Unit         | R-009           | Guards forbidden-field injection                                                        |
| **P0-004** | `TodoListResponseSchema` — `{todos: []}` and `{todos: [...]}`; rejects `null`    | Unit         | R-016           | Envelope shape guarantee                                                                |
| **P0-005** | `GET /todos` on empty DB returns 200 `{todos: []}`                                | Integration  | —               | Matches `TodoListResponseSchema`                                                        |
| **P0-006** | `GET /todos` populated returns rows ordered by `createdAt` ASC, repeatable       | Integration  | R-018           | Same-order guarantee across repeated calls                                              |
| **P0-007** | `POST /todos` valid body → 201 + Todo; row in DB                                  | Integration  | —               | FR23                                                                                    |
| **P0-008** | `POST /todos` invalid body → 400 sensible envelope                                | Integration  | R-009, R-014    | FR27; covers empty, too-long, missing                                                   |
| **P0-009** | `PATCH /todos/:id` toggles completion → 200 + updated                             | Integration  | —               | FR24                                                                                    |
| **P0-010** | `PATCH /todos/:id` unknown id → 404                                               | Integration  | —               | FR27                                                                                    |
| **P0-011** | `DELETE /todos/:id` → 204; row absent                                             | Integration  | —               | FR25                                                                                    |
| **P0-012** | `DELETE /todos/:id` unknown id → 404                                              | Integration  | —               | FR27                                                                                    |
| **P0-013** | Stored XSS — `<script>alert(1)</script>` payload rendered literally, not executed | E2E          | **R-002**       | Assert `<script>` text visible in DOM; no alert; CSP headers present                    |
| **P0-014** | Oversized body → 413; overlong text → 400                                         | Integration  | **R-002**, R-014 | Fastify `bodyLimit: 4 KB`; Zod `max(500)`                                               |
| **P0-015** | `GET /health` — 200 on DB reachable; 503 on DB unreachable                        | Integration  | **R-008**       | Covers `SELECT 1` probe and the unreachable path                                        |
| **P0-016** | Migration fail-fast — API boot exits non-zero on schema drift                     | Integration  | **R-008**       | Point at unmigrated DB; assert exit code ≠ 0; relies on ASR-3                           |
| **P0-017** | Reducer — `addOptimistic` then `addReconcile` swaps `tempId → serverId`, clears `pending` | Unit         | **R-004**       | Pure function, no DOM                                                                   |
| **P0-018** | Reducer — `addOptimistic` then `addFailed` removes entry + surfaces error         | Unit         | **R-004**, R-015 | Input-preservation assertion belongs to TodoInput component test                        |
| **P0-019** | Reducer — `toggleOptimistic` then `toggleFailed` rolls back completion            | Unit         | **R-004**       | Covers both true→false and false→true flips                                             |
| **P0-020** | Reducer — `deleteOptimistic` then `deleteFailed` restores the deleted item        | Unit         | **R-004**       | Ordering preserved                                                                      |
| **P0-021** | Reducer — exhaustive discriminated-union switch (`assertNever` compile-check)     | Unit / type  | **R-004**       | Prevents silent drift when actions are added                                            |
| **P0-022** | Journey 1 (happy path) — load → see list → add → complete → styles reflect state  | E2E          | —               | Covers FR1/FR2/FR8–12; axe scan passes as well                                          |
| **P0-023** | Journey 2 (returning session) — reload after mutations; delete stale; re-flow ok  | E2E          | —               | Covers FR4, FR13, FR16                                                                  |
| **P0-024** | Journey 3 (failure & recovery) — stubbed POST 500 → rollback + toast + input preserved + retry succeeds | E2E | **R-004**, R-015 | Playwright `page.route()` stubs the API; input preservation is user-visible assertion   |

**Total P0:** ~24 tests.

---

### P1 (High)

**Criteria:** Important features + medium risk (= 4) + common workflows + workaround exists but inconvenient.

| Test ID     | Requirement                                                                   | Test Level   | Risk Link | Notes                                                               |
| ----------- | ----------------------------------------------------------------------------- | ------------ | --------- | ------------------------------------------------------------------- |
| **P1-001**  | CORS — allowed origin succeeds; disallowed origin preflight fails             | Integration  | R-005     | Uses env-driven `CORS_ORIGIN`                                       |
| **P1-002**  | Rate limit — 100+ requests/min from same IP → 429                             | Integration  | R-001, R-010 | Relies on ASR-4; runs with `max: 5` in a bubble                     |
| **P1-003**  | Rate limit not bypassed by client-set `x-forwarded-for` behind untrusted proxy | Integration  | R-010     | Confirms `trustProxy` configuration                                 |
| **P1-004**  | Concurrency — two parallel PATCHes on same row → deterministic final state   | Integration  | R-003     | `apps/api/test/integration/concurrency.int.test.ts`                 |
| **P1-005**  | `x-request-id` supplied by client is echoed in response and in log line       | Integration  | R-020     | Captures log via Pino test sink                                     |
| **P1-006**  | `x-request-id` absent → server generates UUID, echoes same id                 | Integration  | R-020     | Asserts both header and log                                         |
| **P1-007**  | OpenAPI doc at `/docs/json` parses under `swagger-parser` as valid OpenAPI 3.1 | Integration  | R-016     | Covers Swagger-to-Zod derivation                                    |
| **P1-008**  | `/docs` — 404 when `NODE_ENV=production` without `ENABLE_DOCS=true`; 200 otherwise | Integration  | —         | Prod vs. non-prod toggle                                            |
| **P1-009**  | Drizzle-zod derived shapes align with hand-written request/response Zod       | Unit         | R-016     | `contracts.test.ts` round-trip                                      |
| **P1-010**  | `api.createTodo` — sets `x-request-id`; parses `TodoSchema`; throws `ApiError` on non-2xx | Unit (MSW) | R-020     | Exercises shared wrapper                                            |
| **P1-011**  | `ApiError.fromResponse` parses sensible envelope; `.message` / `.statusCode` populated | Unit         | R-015     | Feeds Toast                                                         |
| **P1-012**  | `api.listTodos` / `api.updateTodo` / `api.deleteTodo` — contract-typed happy + error | Unit (MSW) | R-020     | Completes wrapper matrix                                            |
| **P1-013**  | axe-core scan of home page (loading, empty, populated) → 0 WCAG AA violations  | E2E / a11y   | R-013     | Three states via stubbed or seeded data                             |
| **P1-014**  | Keyboard-only traversal — Tab reaches input, checkbox, delete; Enter/Space operate | E2E          | —         | FR30, NFR11                                                          |
| **P1-015**  | `aria-checked` on `Checkbox` reflects completion; strikethrough via semantic markup | Component    | R-013     | NFR12                                                                |
| **P1-016**  | Focus-visible ring present on all interactive elements                         | Component    | —         | NFR11                                                                |
| **P1-017**  | Color contrast meets WCAG AA (text + button + focused states)                  | Component / axe | R-013 | NFR13                                                                |
| **P1-018**  | Tap-target size ≥ 44×44 CSS px on checkbox and delete on mobile viewport      | Component    | —         | NFR14                                                                |
| **P1-019**  | 360 px viewport fits without horizontal scroll; 1440 px centers with max-width | E2E          | —         | FR29                                                                |
| **P1-020**  | App renders without special config in Chrome, Firefox, Safari, Edge           | E2E          | —         | FR33; cross-browser Playwright projects                             |
| **P1-021**  | Missing `DATABASE_URL` / `PORT` / `LOG_LEVEL` / `CORS_ORIGIN` → non-zero boot | Integration  | R-012     | `@fastify/env` fail-fast                                             |
| **P1-022**  | `TodoList` renders loading / empty / populated per reducer `status`           | Component    | —         | FR11, FR12                                                           |
| **P1-023**  | `TodoInput` preserves typed text on submit failure                            | Component    | R-004     | FR19                                                                 |
| **P1-024**  | `Toast` renders `ApiError.message` (never a stack); `aria-live="polite"`      | Component    | R-015     | FR18                                                                 |
| **P1-025**  | `TodoItem` — click checkbox dispatches `toggleOptimistic`; delete dispatches `deleteOptimistic` | Component    | —         | Callbacks verified                                                  |
| **P1-026**  | Top-level `unhandledrejection` listener surfaces generic toast; app survives  | Component / E2E | R-015 | NFR9                                                                 |
| **P1-027**  | Reducer — rapid `toggleOptimistic` ↔ `toggleReconcile` sequence stays consistent | Unit         | R-019     | Simulates user spam-clicks                                          |

**Total P1:** ~27 tests.

---

### P2 (Medium)

**Criteria:** Secondary features + low risk (≤ 2) + edge cases + regression protection.

| Test ID    | Requirement                                                                | Test Level      | Risk Link | Notes                                                           |
| ---------- | -------------------------------------------------------------------------- | --------------- | --------- | --------------------------------------------------------------- |
| **P2-001** | Shared-list disclosure microcopy present + screen-reader-accessible        | E2E / a11y      | R-001, R-011 | Asserts text in DOM and reachable via AT                        |
| **P2-002** | OpenAPI JSON fetched over HTTP validates against own spec                  | Integration     | R-016     | Complements P1-007                                              |
| **P2-003** | Swagger UI loads and renders endpoints in non-prod                         | E2E smoke       | —         | Visual smoke only                                               |
| **P2-004** | Initial JS bundle — pre-release `next build` report ≤ 200 KB gzipped        | Manual / script | R-006     | Optional script under `scripts/bundle-check.sh`                 |
| **P2-005** | Journey 2 at 360 px mobile viewport — persistence across reload            | E2E             | —         | FR13–16                                                         |
| **P2-006** | Reducer — `errorDismiss` clears error from state                           | Unit            | —         | Covers toast dismissal path                                     |
| **P2-007** | Correlation id surfaces in error toast (user-copyable)                     | Component / E2E | R-020     | Helps support reports                                           |
| **P2-008** | `visibilitychange` triggers silent refetch; failure logs only (no toast)   | Component       | —         | Per architecture §Process Patterns                              |
| **P2-009** | Forced-throw in handler → sensible 500 envelope + Pino error with stack + correlation | Integration | R-015   | Exercises global `setErrorHandler`                              |
| **P2-010** | DB `created_at` maps to wire `createdAt` correctly end-to-end              | Integration     | R-016     | Guards naming-pattern alignment                                 |
| **P2-011** | After DELETE, subsequent list does not contain the deleted item           | E2E             | —         | FR4 end-to-end                                                   |

**Total P2:** ~11 tests.

---

### P3 (Low)

**Criteria:** Nice-to-have + exploratory + performance benchmarks + documentation validation.

| Test ID    | Requirement                                                    | Test Level    | Notes                                                    |
| ---------- | -------------------------------------------------------------- | ------------- | -------------------------------------------------------- |
| **P3-001** | k6 sample — 5 RPS against `POST /todos` meets NFR2 p95 ≤ 300 ms | Perf (nightly) | Single small test, not a sustained load campaign         |
| **P3-002** | Lighthouse CI-lite pass — TTI < 2 s on broadband profile       | Perf (nightly) | Informational; not a gate                                |
| **P3-003** | Concurrent-delete UI jitter under artificial latency           | Exploratory   | R-021                                                     |
| **P3-004** | Log-field audit — todo text never appears at info level        | Manual / grep | R-017                                                     |
| **P3-005** | 5-user unprimed usability — time-to-first-task < 10 s           | Manual UX     | PRD success metric                                       |

**Total P3:** ~5 tests.

---

## Execution Strategy

**Philosophy:** Run everything in PRs unless there's significant infrastructure overhead. Playwright parallelization keeps hundreds of tests under 15 minutes.

### Every PR: Vitest + node:test + Playwright (~10–15 min)

- All Unit (contracts, reducer, api wrapper) via Vitest + MSW — ~1 min.
- All Component (RTL) — ~2 min.
- All Integration (Fastify `app.inject()` + per-worker Postgres schema) — ~3–5 min.
- All E2E + axe-core across Chromium / Firefox / WebKit via Playwright projects, sharded — ~5–10 min.
- **Total:** ~10–15 min, covers P0 + P1 + most P2.

### Nightly: k6 + Bundle Diff (~20–30 min)

- P3-001 k6 micro-benchmark.
- P3-002 Lighthouse-lite.
- Bundle-size diff vs. `main` baseline (informational, no gate).

### Pre-release / Manual

- P2-004 bundle inspection via `@next/bundle-analyzer`.
- P3-005 5-user unprimed usability.
- NFR20 fresh-clone smoke (`docker compose up -d db && npm run dev` — single command succeeds).

### Weekly

None warranted for v1.

---

## QA Effort Estimate

QA test development effort only (excludes infrastructure work owned by Dev per ASR-1..ASR-4).

| Priority  | Count | Effort Range      | Notes                                                        |
| --------- | ----- | ----------------- | ------------------------------------------------------------ |
| P0        | ~24   | ~25–35 hours      | Reducer matrix, XSS E2E, migration fail-fast, three journeys |
| P1        | ~27   | ~20–30 hours      | a11y scans, client wrapper, observability, responsive        |
| P2        | ~11   | ~8–14 hours       | Disclosure, openapi validator, side-states                   |
| P3        | ~5    | ~2–5 hours        | Perf sample, manual usability                                |
| **Total** | ~67   | **~55–85 hours**  | **1 engineer, ~2–3 weeks end-to-end**                        |

**Assumptions:**

- Test infrastructure (factories, fixtures, `buildTestApp.ts`, Playwright config) delivered separately by Dev per ASR-1..ASR-4 — adds ~8–12 hours.
- Ongoing maintenance overhead (~10%) not included.

**Dependencies from other teams:** see "Dependencies & Test Blockers" above.

---

## Implementation Planning Handoff

| Work Item                                               | Owner  | Target Milestone | Dependencies / Notes                                  |
| ------------------------------------------------------- | ------ | ---------------- | ----------------------------------------------------- |
| Pin web-tier test stack (ASR-1)                         | Dev    | Pre-Story 1.7    | Vitest + RTL + MSW + Playwright + axe-core            |
| Per-worker ephemeral schema helper (ASR-2)              | Dev    | Story 1.4        | `buildTestApp.ts` + `seedDb.ts` + migrate lifecycle    |
| Migration fail-fast mechanism (ASR-3)                   | Dev    | Story 1.4        | Concrete check in `apps/api/src/db/migrate.ts`        |
| Rate-limit config parameterization (ASR-4)              | Dev    | Story 1.5        | `max` + `timeWindow` env-driven                       |
| Test data factories + Playwright fixtures               | QA     | Story 1.5        | Faker + `@seontechnologies/playwright-utils`          |
| P0 suite implementation                                 | QA     | End of Epic 2    | Blocks Epic 2 ship gate                               |
| P1 accessibility + responsive suite                     | QA     | End of Epic 2    | Parallelizable with P0                                |
| P1 observability + CORS + rate-limit tests              | QA     | End of Story 1.5 | Relies on ASR-4                                       |
| Journey 3 (E2E) + optimistic UI matrix                  | QA     | End of Epic 3    | Depends on reducer implementation                     |

---

## Tooling & Access

| Tool / Service                                 | Purpose                                         | Access Required            | Status                     |
| ---------------------------------------------- | ----------------------------------------------- | -------------------------- | -------------------------- |
| Vitest + `@testing-library/react`              | Unit + component tests on web tier              | npm install only           | Pending (ASR-1)            |
| MSW                                            | HTTP mocking for `api.ts` wrapper tests         | npm install only           | Pending (ASR-1)            |
| `node --test` (shipped by fastify-cli)         | Unit + integration on api tier                  | already in stack           | Ready                      |
| Playwright + `@axe-core/playwright`            | E2E + a11y scans                                | npm install + browsers     | Pending (ASR-1)            |
| `@seontechnologies/playwright-utils`           | API-first seeding, typed `apiRequest` fixture   | npm install                | Ready per config           |
| `swagger-parser`                               | OpenAPI 3.1 validation                          | npm install only           | Ready                      |
| `@next/bundle-analyzer`                        | Dev-time bundle inspection                      | npm install (dev-only)     | Ready                      |
| k6                                             | P3 perf sample (nightly)                        | local binary or CI runner  | Pending                    |

**Access requests needed:**

- [ ] GitHub Actions runner with Docker + Postgres service container (for per-worker schema CI).

### Development-Time Tooling (MCP)

These Model Context Protocol servers accelerate dev-time inspection. They do **not** replace the CI test suite above — they are interactive aids for developers and AI coding agents working locally.

| Tool                      | Purpose                                                           | When to use                                                                                                 | Relationship to CI suite                                 |
| ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Postman MCP**           | Interactive API contract validation against `/docs/json` OpenAPI  | Exploring endpoint shapes during Story 1.5 / 1.6; verifying ad-hoc payloads without writing a test          | Complements P1-007 (`swagger-parser` in CI), not replacing |
| **Chrome DevTools MCP**   | DOM / network / console inspection while iterating on the UI      | Debugging optimistic-UI state, inspecting `x-request-id` headers, diagnosing failing E2E traces locally     | No CI role; dev-only                                     |
| **Playwright MCP**        | Agent-driven browser automation against a locally running stack   | Exploring the five PRD user flows (**create todo**, **complete todo**, **delete todo**, **empty state**, **error handling**) for smoke-check and flake diagnosis | The same flows run deterministically in CI as P0-007 / P0-009 / P0-011 / P1-022 / P0-024; MCP is exploratory |

**Guardrail:** MCP exploration produces no committed test artifacts on its own. When MCP exploration uncovers a bug, translate the repro into a Playwright spec in `apps/web/e2e/` before committing — the regression test is the deliverable, not the MCP transcript.

---

## Interworking & Regression

**Services / components impacted:** v1 is greenfield; there are no upstream services to regress against. Internal regression scope is the three-layer monorepo.

| Component            | Impact                                                          | Regression Scope                                              | Validation Steps                                           |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `packages/shared`    | Contract changes propagate to both apps                         | `contracts.test.ts` + integration + E2E                       | Every PR touching `packages/shared` runs full suite        |
| `apps/api`           | API handler or Drizzle schema changes                           | Integration + E2E; `/health` + swagger validator               | Migration check (P0-016) on any schema-touching PR         |
| `apps/web`           | Reducer, api.ts, or component changes                           | Unit + component + E2E                                        | Reducer matrix (P0-017..P0-021) on any reducer change      |
| `docker-compose.yml` | DB image / port / credential changes                            | Integration + `GET /health` (P0-015)                          | `npm run dev` smoke test on fresh clone                    |

---

## Appendix A: Code Examples & Tagging

**Playwright tags for selective execution:**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';

test('@P0 @Security stored XSS payload rendered as text, not executed', async ({ apiRequest, page }) => {
  const payload = '<script>window.__xss__ = true</script>';

  const createRes = await apiRequest({
    method: 'POST',
    path: '/todos',
    body: { text: payload },
  });
  expect(createRes.status).toBe(201);

  await page.goto('/');
  await expect(page.getByText(payload)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss__?: boolean }).__xss__)).toBeUndefined();
});

test('@P1 @Observability x-request-id echoed and logged', async ({ apiRequest }) => {
  const requestId = crypto.randomUUID();

  const { status, headers } = await apiRequest({
    method: 'GET',
    path: '/todos',
    headers: { 'x-request-id': requestId },
  });

  expect(status).toBe(200);
  expect(headers['x-request-id']).toBe(requestId);
});
```

**Run by tag:**

```bash
npx playwright test --grep @P0                 # P0 only (smoke)
npx playwright test --grep "@P0|@P1"           # P0 + P1 (release gate)
npx playwright test --grep @Security           # security suite
npx playwright test                            # full matrix (default in PR)
```

---

## Appendix B: Knowledge Base References

- **Risk governance:** `risk-governance.md` — scoring methodology and gate decision engine.
- **Probability × impact:** `probability-impact.md` — 1-9 matrix with DOCUMENT / MONITOR / MITIGATE / BLOCK thresholds.
- **Test levels:** `test-levels-framework.md` — unit / component / integration / E2E selection rules.
- **Test priorities:** `test-priorities-matrix.md` — P0-P3 criteria + risk-to-priority mapping.
- **Test quality:** `test-quality.md` — determinism / isolation / focus / ≤ 1.5 min / ≤ 300 lines / self-cleanup.

---

**Generated by:** BMad TEA Agent
**Workflow:** `bmad-testarch-test-design`
**Version:** 4.0 (BMad v6)
