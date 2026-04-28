---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-04-19'
mode: 'system-level'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad/tea/config.yaml
  - knowledge/adr-quality-readiness-checklist.md
  - knowledge/risk-governance.md
  - knowledge/probability-impact.md
  - knowledge/test-levels-framework.md
  - knowledge/test-priorities-matrix.md
  - knowledge/test-quality.md
---

# Test Design — Progress

## Step 01 — Detect Mode & Prerequisites

**Mode:** System-Level

**Rationale:**
- No `sprint-status.yaml` present under `_bmad-output/implementation-artifacts/` → file-based detection routes to System-Level.
- Both PRD and Architecture artifacts are available; policy prefers System-Level when both PRD/ADR and Epic/Stories exist.

**Inputs located:**
- PRD: `_bmad-output/planning-artifacts/prd.md`
- Architecture / ADRs: `_bmad-output/planning-artifacts/architecture.md`
- Epics (auxiliary context): `_bmad-output/planning-artifacts/epics.md`

**Prerequisite check:** PASS for System-Level Mode (PRD + Architecture + tech context all present).

## Step 02 — Load Context & Knowledge Base

**Config (from `_bmad/tea/config.yaml`):**
- `test_artifacts`: `_bmad-output/test-artifacts`
- `tea_use_playwright_utils`: `true`
- `tea_use_pactjs_utils`: `false` — contract testing not applicable (monorepo with typed shared contract via `packages/shared` + Zod)
- `tea_pact_mcp`: `none`
- `tea_browser_automation`: `auto`
- `test_stack_type`: `auto` → detected **fullstack**
- `risk_threshold`: `p1`
- `communication_language` / `document_output_language`: English

**Stack Detection — `fullstack`:**
- Frontend: Next.js 16 (App Router, CSR-only) + React 19 + Tailwind + Radix UI (`Checkbox`, `Toast`)
- Backend: Fastify v5 + Zod type provider + Drizzle ORM + Postgres 17
- Shared contract: `packages/shared` (Zod schemas, single source of truth)
- Repo layout: npm workspaces monorepo (`apps/web`, `apps/api`, `packages/shared`)

**Playwright Utils profile:** Full UI+API (fullstack detected; `page.goto`/`page.locator` will be used in web tests).

**Browser exploration (CLI):** SKIPPED — application is not yet scaffolded (greenfield, planning-only). Rely on doc/code analysis. Re-evaluate after Epic 1 delivers a runnable shell.

**Project artifacts loaded:**
- `_bmad-output/planning-artifacts/prd.md` — 33 FRs + 24 NFRs, three named user journeys (Happy, Returning, Failure & Recovery)
- `_bmad-output/planning-artifacts/architecture.md` — Fastify + Next.js + Postgres + Drizzle + Zod shared contract; 6 HTTP endpoints; optimistic `useReducer` client state; Pino + correlation IDs
- `_bmad-output/planning-artifacts/epics.md` — 3 epics (Epic 1: Visible Read Experience; Epic 2: Core Loop CRUD; Epic 3: Failure Resilience)

**Extracted:**
- **Tech stack:** Node 22 LTS, TypeScript, Next.js 16 / React 19, Fastify 5.8, Postgres 17, Drizzle + `drizzle-zod`, Zod, Radix UI, Tailwind, `@fastify/{type-provider-zod, helmet, cors, rate-limit, sensible, swagger, swagger-ui, env, request-context}`, Pino logging.
- **Integration points:** `apps/web` ↔ `apps/api` via HTTP/JSON (typed by `packages/shared`); `apps/api` ↔ Postgres via Drizzle pool; `@fastify/swagger` for OpenAPI; `docker-compose` for local DB.
- **NFRs (testable):** NFR1 ≤100 ms perceived UI, NFR2 ≤300 ms p95 server, NFR3 <2 s TTI / <5 s on 3G, NFR4 ≤200 KB gzip bundle, NFR5–NFR9 durability + resilience + no silent failure, NFR10–NFR14 WCAG 2.1 AA + keyboard + contrast + tap targets, NFR15–NFR19 HTTPS/server-side validation/XSS escape/bounded input/no-auth, NFR20–NFR24 single-command run / readable codebase / independent API docs / critical-path test coverage / diagnosable logs.

**Knowledge fragments loaded (System-Level required set + priority/levels):**
- `adr-quality-readiness-checklist.md` — 8-category, 29-criterion testability framework
- `risk-governance.md` — scoring matrix, gate decisions, coverage traceability
- `probability-impact.md` — 1-9 scoring with action thresholds (DOCUMENT / MONITOR / MITIGATE / BLOCK)
- `test-levels-framework.md` — unit/integration/E2E selection rules
- `test-priorities-matrix.md` — P0–P3 criteria and coverage targets
- `test-quality.md` — determinism and DoD

**Skipped (not relevant to v1 scope):**
- Contract testing / Pact fragments — single typed contract boundary (`packages/shared`) with both producer and consumer in the same monorepo; a dedicated consumer-driven contract test is overkill.
- Webhook fragments — no inbound webhooks in v1.
- Email-auth fragments — no auth in v1 (NFR19).
- Feature-flag fragments — no feature-flag layer in v1.

## Step 03 — Testability & Risk Assessment

### 🚨 Testability Concerns (ACTIONABLE)

**1. Web-app test stack is unpinned (Architecture Gap #2).**
- Impact: test implementation cannot begin on the web tier.
- Needed: pin Vitest + React Testing Library + MSW for component/unit tests; Playwright for E2E.
- Owner: Architect + QA. Timeline: pre-Epic 1 Story 1.7 (Web app shell).

**2. Integration-test DB isolation strategy is undefined.**
- Impact: Story 1.4/1.5/concurrency tests will be flaky or will pollute a shared DB.
- Needed: per-worker ephemeral schema on a shared Postgres container (Playwright workers each get a schema; Drizzle migrate on boot; truncate-and-drop on teardown). Codified in `apps/api/test/integration/helpers/buildTestApp.ts`.
- Owner: Dev. Timeline: Story 1.4 (data layer).

**3. Fail-fast schema-drift check mechanism unspecified (Architecture Gap #1).**
- Impact: we cannot write a deterministic integration test for Story 1.4's last AC without knowing the check.
- Needed: concrete implementation choice — compare `information_schema` applied-migration row vs. expected journal head.
- Owner: Dev. Timeline: Story 1.4.

**4. Rate-limit must be parameterized for tests.**
- Impact: rate-limit behavior leaks into unrelated tests; targeted test needs a low `max`.
- Needed: `rateLimit` plugin takes `max` + `timeWindow` from config; tests override both.
- Owner: Dev. Timeline: Story 1.5.

**5. No server-side fault-injection knob for client-failure tests.**
- Impact: Journey 3 (offline / 5xx / timeout) must be stubbed at Playwright's network layer — acceptable but constrains test design.
- Mitigation: Playwright `page.route()` interception is sufficient; no architectural change needed, but documented here so QA knows the approach is fixed.
- Owner: QA. Timeline: pre-Epic 3.

### ✅ Testability Assessment Summary — What Works Well

- **Headless-first API** (FR28/NFR22): Fastify `app.inject()` + OpenAPI docs → every endpoint is reachable without UI. Full unit + integration coverage possible with pure HTTP.
- **Single contract boundary**: `packages/shared` Zod schemas drive validation, types, and docs. Round-trip tests in `packages/shared/src/contracts.test.ts` catch drift early.
- **Deterministic observability**: Pino structured logs + `x-request-id` echoed in responses → tests assert correlation end-to-end without brittle log parsing.
- **Stateless API** (NFR6-ready): horizontal test parallelism is safe at the API layer.
- **Deterministic ordering** (FR10): `ORDER BY created_at` gives reproducible list assertions.
- **Pure reducer** on the client (`apps/web/src/lib/reducer.ts`): optimistic rollback is unit-testable without DOM/network.
- **No auth in v1** (NFR19): removes the largest class of test fixtures typically needed at this stage.

### ASRs (Architecturally Significant Requirements)

| ASR | Classification | Description | Owner |
|-----|---------------|-------------|-------|
| ASR-1 | **ACTIONABLE** | Pin web-tier test stack (Vitest + RTL + MSW + Playwright) | Architect + QA |
| ASR-2 | **ACTIONABLE** | Per-worker ephemeral schema strategy for integration tests | Dev |
| ASR-3 | **ACTIONABLE** | Concrete fail-fast schema-drift check mechanism | Dev |
| ASR-4 | **ACTIONABLE** | Parameterize rate-limit (`max`, `timeWindow`) via config for test overrides | Dev |
| ASR-5 | FYI | LWW concurrency testable via parallel PATCHes — no arch change | — |
| ASR-6 | FYI | Reducer purity enables optimistic-UI unit testing — no arch change | — |
| ASR-7 | FYI | HTTPS terminated at platform — no in-process TLS tests | — |
| ASR-8 | FYI | Bundle-size gate deferred; pre-release manual `@next/bundle-analyzer` check | Dev |

### Risk Assessment

Categories: **TECH** (technical/arch) · **SEC** (security) · **PERF** (performance) · **DATA** (integrity) · **BUS** (business/UX) · **OPS** (operations).

**High-Priority Risks (Score ≥ 6) — MITIGATE**

| ID | Cat | Description | P | I | Score | Mitigation | Owner |
|----|-----|-------------|---|---|-------|------------|-------|
| **R-001** | BUS | Shared unauthenticated list invites abuse (delete/edit others' items) | 3 | 2 | **6** | UI disclosure of shared nature (PRD microcopy); rate-limit 100/min/IP; accept trade-off per PRD §Known v1 Trade-offs | PM/UX |
| **R-002** | SEC | Stored XSS via todo text rendered in DOM to every visitor | 2 | 3 | **6** | React JSX escaping; ESLint ban on `dangerouslySetInnerHTML`; Zod length bound | Dev |
| **R-004** | DATA | Optimistic-UI rollback incorrect under mutation failure | 3 | 2 | **6** | Pure reducer with exhaustive TS discriminated-union cases; full matrix unit tests; E2E Journey 3 | Dev + QA |
| **R-008** | OPS | API starts against outdated DB schema (migration drift) | 2 | 3 | **6** | `apps/api/src/db/migrate.ts` fail-fast check (ASR-3); `/health` probes DB reachability → 503 | Dev |

**Medium-Priority Risks (Score 4) — MONITOR**

| ID | Cat | Description | P | I | Score | Mitigation | Owner |
|----|-----|-------------|---|---|-------|------------|-------|
| R-003 | DATA | LWW correctness under concurrent mutations | 2 | 2 | 4 | Postgres row-atomicity; dedicated `concurrency.int.test.ts` | Dev + QA |
| R-005 | SEC | CORS misconfiguration accepts unauthorized origins | 2 | 2 | 4 | `@fastify/env`-validated `CORS_ORIGIN`; integration test | Dev + Ops |
| R-006 | PERF | Initial JS bundle > 200 KB gzipped (NFR4) | 2 | 2 | 4 | `@next/bundle-analyzer` dev tool; manual pre-release check | Dev |
| R-009 | TECH | Forbidden-field injection on create (client sets `id`) | 2 | 2 | 4 | All request schemas `.strict()`; contract unit tests | Dev |
| R-010 | SEC | Rate-limit bypass via `X-Forwarded-For` spoofing | 2 | 2 | 4 | Careful `trustProxy`; deploy doc; direct-connection test | Dev + Ops |
| R-011 | BUS | Users believe todos are private | 2 | 2 | 4 | UI microcopy; PRD 5-user unprimed test | PM/UX |
| R-013 | BUS | Active/completed state conveyed only via color (NFR12) | 2 | 2 | 4 | Radix `Checkbox` aria-checked; semantic `<s>`/`line-through`; axe scan | Dev + QA |
| R-014 | SEC | Resource-exhaustion via oversized body | 2 | 2 | 4 | Fastify `bodyLimit: 4 KB`; Zod `max(500)` | Dev |
| R-015 | OPS | Unhandled promise rejection crashes UI (NFR9) | 2 | 2 | 4 | Top-level listener; try/catch per dispatch | Dev |
| R-016 | TECH | Drizzle ↔ Zod ↔ OpenAPI contract drift | 2 | 2 | 4 | `contracts.test.ts` round-trip; `tsc --noEmit` in CI | Dev |
| R-019 | PERF | Rapid-toggle race between optimistic state and server response | 2 | 2 | 4 | Reducer tracks `pending`; reconciles on response | Dev |
| R-020 | OPS | Correlation ID not reaching user-reported bug reports | 2 | 2 | 4 | `api.ts` sets `x-request-id`; `ApiError` captures echo; toast surfaces id | Dev |

**Low-Priority Risks (Score ≤ 2) — DOCUMENT**

| ID | Cat | Description | P | I | Score | Action |
|----|-----|-------------|---|---|-------|--------|
| R-007 | PERF | Server p95 > 300 ms (NFR2) | 1 | 2 | 2 | Baseline in integration run; defer load test |
| R-012 | OPS | Missing env var → silent misbehavior | 1 | 2 | 2 | `@fastify/env` hard-fails; smoke test |
| R-017 | OPS | Debug-level logs leak todo text over time | 1 | 1 | 1 | Per-architecture log-level policy |
| R-018 | BUS | Ordering inconsistency across users (FR10) | 1 | 2 | 2 | `ORDER BY created_at`; integration test |
| R-021 | BUS | Concurrent-delete UI jitter | 1 | 2 | 2 | Accept minor jitter per LWW |

### Risk Summary

- **21 risks identified** across all categories.
- **Distribution by action:** 4 MITIGATE (score 6) · 12 MONITOR (score 4) · 5 DOCUMENT (score ≤ 2).
- **No BLOCK-level (score 9) risks** → gate posture is **CONCERNS**, not FAIL.
- **Top categories by count:** OPS (5) · SEC (4) · BUS (5) · DATA (3) · PERF (3) · TECH (2).
- **Category hotspots:** Failure-recovery correctness (R-004) and migration drift (R-008) are the highest-leverage mitigations — both resolved with tests already specified in the architecture + one concrete implementation choice (ASR-3).
- **Zero score-9 blockers** confirms the architecture document's implementation-readiness finding; the remaining concerns are test-infrastructure gaps (ASR-1, ASR-2, ASR-4) and one implementation detail (ASR-3).

## Step 04 — Coverage Plan & Execution Strategy

### Coverage Matrix — Summary

Approximately **67 scenarios** distributed by priority and level. Full per-scenario tables are produced in the QA deliverable (`test-design-qa.md`).

| Priority | Count | Primary Levels | Key Targets |
|----------|------:|----------------|-------------|
| **P0** | ~24 | Unit (contracts, reducer), Integration (CRUD + migration + XSS), E2E (3 journeys) | All four score-6 risks; FR1–FR16, FR22–FR28; NFR23 |
| **P1** | ~27 | Unit (client wrapper), Component (presentational + a11y), Integration (CORS, rate-limit, observability, concurrency), E2E (a11y scan, responsive) | All score-4 risks; NFR10–NFR14; FR29, FR30, FR32 |
| **P2** | ~11 | Component (disclosure, side-states), Integration (openapi validator) | Medium-confidence edges; R-006, R-011, R-020 |
| **P3** | ~5 | Perf sample, manual UX | NFR2, NFR3 baseline; PRD 5-user unprimed test |

### Test Level Distribution

- **Unit (~20):** Zod contracts, `reducer`, `api.ts` wrapper with MSW, `ApiError.fromResponse`. Fast (<5 s total), deterministic. Test pyramid base.
- **Component (~12):** React Testing Library against `TodoList`, `TodoInput`, `TodoItem`, `Toast` — renders loading/empty/populated, preserves input on failure, keyboard/focus/aria-checked, tap-target sizing.
- **Integration (~22):** Fastify `app.inject()` against ephemeral Postgres schema — all CRUD paths, validation rejections, CORS, rate-limit, migration fail-fast, `/health`, `x-request-id` plumbing, LWW concurrency, OpenAPI shape, env fail-fast.
- **E2E (~10):** Playwright against running stack — three PRD user journeys, stored-XSS end-to-end, responsive viewports, axe-core a11y scans, stubbed-network failure recovery.
- **Perf / manual (~3):** k6 micro-sample; bundle-size check; unprimed usability.

**Duplicate-coverage guard:** business logic lives in unit (reducer, contracts); integration exercises handler + DB wiring only; E2E validates journeys only. XSS appears at both Integration (input accepted) and E2E (render-time escape) — deliberate defense-in-depth for score-6 risk R-002.

### Traceability Highlights

- **FRs:** every FR1–FR33 maps to at least one P0/P1 scenario.
- **NFRs:** NFR1 implicit in optimistic-UI unit+E2E; NFR2/NFR3/NFR4 covered by P3 perf + P2 bundle check; NFR5–NFR9 covered by integration (durability) + E2E Journey 3; NFR10–NFR14 covered by component + axe; NFR15 infra-layer (no test); NFR16–NFR18 contracts + integration; NFR19 non-test (absence); NFR20 smoke via `npm run dev`; NFR21 architectural; NFR22 openapi validator; NFR23 this plan; NFR24 observability P1 tests.
- **Risks:** every score-6 risk has ≥ 1 P0 test; every score-4 risk has ≥ 1 P1 test.

### Execution Strategy (PR / Nightly / Weekly)

- **Every PR (~10–15 min, sharded):** ALL Unit + Component + Integration + E2E including axe-core a11y. Target: stay under 15 min via Playwright parallelism + worker-scoped DB schemas.
- **Nightly:** P3 perf sample (k6 5 RPS, 2 min); bundle-size reporter diff vs. main baseline (informational).
- **Pre-release / manual:** P2-004 bundle inspection; P3-005 unprimed usability; smoke `npm run dev` on a fresh clone (NFR20 gate).
- **Weekly:** none warranted for v1.

**Tooling stack (recommended, pending ASR-1 decision):**

- Vitest + `@testing-library/react` + MSW — web tier unit + component.
- `node --test` (shipped by fastify-cli) + Testcontainers (or shared `docker-compose` Postgres with per-worker schema) — api tier integration.
- Playwright + `@axe-core/playwright` — E2E + accessibility.
- `swagger-parser` — OpenAPI validation.
- `@next/bundle-analyzer` — dev-tool bundle inspection.

### Resource Estimates (1 engineer, ranges only)

| Priority | Count | Effort Range |
|----------|------:|--------------|
| P0 | ~24 | ~25–35 hours |
| P1 | ~27 | ~20–30 hours |
| P2 | ~11 | ~8–14 hours |
| P3 | ~5  | ~2–5 hours |
| **Total** | **~67** | **~55–85 hours ≈ 2–3 weeks** |

Excludes test-infrastructure boilerplate — blocked on ASR-1 (test stack pinning) and ASR-2 (integration-DB isolation) — estimated separately at ~8–12 hours.

### Quality Gates

- **P0 pass rate:** 100% — release blocker (FAIL if any P0 fails).
- **P1 pass rate:** ≥ 95% — CONCERNS below this.
- **A11y:** 0 WCAG 2.1 AA violations on any reachable page (axe-core).
- **Mitigations required before release:**
  - R-002 (XSS) — P0-013 passing.
  - R-004 (optimistic UI) — P0-017…P0-021 + P0-024 passing.
  - R-008 (migration drift) — P0-015, P0-016 passing.
  - R-001 (shared-list abuse) — PM sign-off on UI disclosure + P1-002 rate-limit test.
- **FR coverage:** ≥ 95% of FRs map to a passing test at P0+P1.
- **Gate recommendation at current state:** **CONCERNS** pending ASR-1..ASR-4 resolution. No FAIL/BLOCK conditions (no score-9 risks).

## Step 05 — Generate Outputs & Validate

**Execution mode resolved:** `sequential` — `tea_execution_mode: auto` + single-agent context (no subagent runtime available for this skill).

**Output documents generated:**

- `_bmad-output/test-artifacts/test-design-architecture.md` — architecture-team contract (actionable-first: BLOCKERS → HIGH PRIORITY → INFO ONLY → Risk Assessment → Testability Concerns → Mitigation Plans → Assumptions).
- `_bmad-output/test-artifacts/test-design-qa.md` — QA execution recipe (scope → dependencies → risk summary → P0/P1/P2/P3 tables → execution strategy → effort → tooling → regression → appendices).
- `_bmad-output/test-artifacts/test-design/todo-app-handoff.md` — BMAD handoff (artifact inventory → epic-level gates → story-level mandatory ACs → data-testid requirements → risk-to-story mapping → phase transition gates).

**Checklist cross-check:**

- ✅ Two-document structure satisfied for System-Level mode.
- ✅ Architecture doc is actionable-first and under target line budget; no recipes / test code / quality-gate tables (those live in QA doc).
- ✅ QA doc has Dependencies section near top; playwright-utils example uses correct imports (`test` from `@seontechnologies/playwright-utils/...`, `expect` from `@playwright/test`); example carries assertions.
- ✅ Priority sections carry only "Criteria"; execution-timing lives in separate Execution Strategy section.
- ✅ Resource estimates are interval ranges, not point numbers.
- ✅ Cross-document consistency: risk IDs (R-001..R-021), ASRs (ASR-1..ASR-4), test IDs (P0-001..P3-005), dates (2026-04-19), PRD/Architecture references all aligned across docs.
- ✅ No score-9 risks. Gate posture CONCERNS, not FAIL.
- ✅ CLI sessions: none opened (browser exploration skipped — app not scaffolded yet).
- ✅ Temp artifacts stored under `_bmad-output/test-artifacts/`.

**Completion summary:**

- Mode: **System-Level** (PRD + Architecture + auxiliary Epics).
- Top risks (score ≥ 6): R-001 (shared-list abuse), R-002 (stored XSS), R-004 (optimistic rollback), R-008 (migration drift).
- Gate thresholds: P0 = 100% · P1 ≥ 95% · 0 WCAG AA violations · four score-6 mitigations passing.
- Open assumptions: ASR-1..ASR-4 must be resolved by the milestones noted; pending Dev ownership confirmation.
