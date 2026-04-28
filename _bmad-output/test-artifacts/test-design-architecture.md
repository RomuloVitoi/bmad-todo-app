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

# Test Design for Architecture: todo-app v1

**Purpose:** Architectural concerns, testability gaps, and risk mitigation contract between QA and Engineering. This document defines what must be addressed in the architecture/code before QA can write integration and E2E tests.

**Date:** 2026-04-19
**Author:** Master Test Architect (Romulo)
**Status:** Architecture Review Pending
**Project:** todo-app
**PRD:** `_bmad-output/planning-artifacts/prd.md`
**Architecture:** `_bmad-output/planning-artifacts/architecture.md`

---

## Executive Summary

**Scope:** Full v1 greenfield delivery — a deliberately minimal single shared todo list (CRUD, optimistic UI, no auth) across a Next.js 16 + Fastify 5 + Postgres 17 monorepo with a typed Zod shared contract.

**Business Context** (from PRD):

- **Positioning:** Reference-quality implementation — success measured by execution polish, not adoption.
- **User success metric:** 5/5 unprimed testers complete add → complete → delete without assistance.
- **Launch:** v1 scope only; post-MVP features (auth, multi-user, real-time) are explicitly deferred.

**Architecture** (from Architecture Decision Document):

- **Stack:** Next.js 16 / React 19 (CSR-only SPA) + Fastify 5 (REST, 6 endpoints) + Postgres 17 + Drizzle ORM + Zod shared contract in `packages/shared`.
- **State:** pure React `useReducer` with hand-rolled optimistic updates and rollback; no TanStack Query / SWR.
- **Observability:** Pino JSON + `x-request-id` correlation (generated or honored).
- **Deployment:** two containers (web, api) + Postgres; deployment-agnostic.

**Expected Scale:** low-load v1 (single shared list; no real-time; ≤ 300 ms p95 server; ≤ 100 ms perceived UI).

**Risk Summary:**

- **Total risks:** 21
- **High-priority (≥ 6):** 4 (R-001, R-002, R-004, R-008)
- **Score-9 blockers:** 0
- **Gate posture:** **CONCERNS** — resolvable with the 4 actionable testability gaps listed below.

---

## Quick Guide

### 🚨 BLOCKERS — Team Must Decide (Pre-Implementation Critical Path)

These MUST be resolved before QA can implement integration or E2E tests.

1. **ASR-1: Web-tier test stack unpinned** — pick Vitest + React Testing Library + MSW for unit/component; Playwright + `@axe-core/playwright` for E2E. (Owner: Architect + QA. Due: pre-Story 1.7.)
2. **ASR-2: Integration-test DB isolation strategy undefined** — adopt per-worker ephemeral schemas on the shared `docker-compose` Postgres; wire into `apps/api/test/integration/helpers/buildTestApp.ts`. (Owner: Dev. Due: Story 1.4.)
3. **ASR-3: Fail-fast schema-drift check mechanism unspecified** — pick a concrete check in `apps/api/src/db/migrate.ts` (e.g., compare `information_schema` applied-migration row against journal head) and document it. Resolves Architecture Gap #1. (Owner: Dev. Due: Story 1.4.)
4. **ASR-4: Rate-limit is not test-parameterized** — expose `max` and `timeWindow` via config so tests can both skip and target rate-limit behavior. (Owner: Dev. Due: Story 1.5.)

**What we need from team:** Commit owners and resolution milestones for these four items.

---

### ⚠️ HIGH PRIORITY — Team Should Validate

1. **R-002 (SEC, score 6): Stored-XSS via todo text** — confirm ESLint rule bans `dangerouslySetInnerHTML` in `apps/web`; approve P0 end-to-end XSS payload test. (Approver: Dev Lead.)
2. **R-004 (DATA, score 6): Optimistic-UI rollback correctness** — approve the full reducer action matrix (add/toggle/delete × success/failure × out-of-order responses). (Approver: Dev Lead + QA Lead.)
3. **R-008 (OPS, score 6): API starts against outdated schema** — approve the concrete mechanism from ASR-3 and the integration test that drives it. (Approver: Dev Lead.)
4. **R-001 (BUS, score 6): Shared-list abuse** — approve UI microcopy disclosing the shared nature and the rate-limit defense posture. (Approver: PM/UX.)

**What we need from team:** Review and approve (or counter-propose).

---

### 📋 INFO ONLY — Solutions Provided

- **Test strategy split:** ~67 scenarios across unit (20), component (12), integration (22), E2E (10), perf/manual (3) — test pyramid preserved.
- **Execution:** PR-only for functional suites (< 15 min via Playwright parallelization); nightly for perf samples and bundle diff; pre-release manual for bundle budget and unprimed usability.
- **Priorities:** P0 × 24 · P1 × 27 · P2 × 11 · P3 × 5. See QA doc for the full scenario matrix.
- **Quality gates:** P0 = 100% · P1 ≥ 95% · 0 WCAG AA violations · all score-6 mitigations passing. See QA doc.

**What we need from team:** Acknowledge only.

---

## For Architects and Devs — Open Topics

### Risk Assessment

**Total risks:** 21 — 4 high (score ≥ 6) · 12 medium (score 4) · 5 low (score ≤ 2). Zero score-9 blockers.

#### High-Priority Risks (Score ≥ 6) — IMMEDIATE ATTENTION

| Risk ID    | Category | Description                                                      | Probability | Impact | Score | Mitigation                                                                                                                                           | Owner    | Timeline         |
| ---------- | -------- | ---------------------------------------------------------------- | ----------- | ------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------- |
| **R-001**  | BUS      | Shared unauthenticated list invites trolling/abuse               | 3           | 2      | **6** | UI microcopy disclosing shared nature; `@fastify/rate-limit` 100/min/IP; documented acceptance of the trade-off per PRD §Known v1 Trade-offs         | PM / UX  | Pre-Epic 2 ships |
| **R-002**  | SEC      | Stored XSS via todo text rendered to every visitor               | 2           | 3      | **6** | React JSX default escaping; ESLint ban on `dangerouslySetInnerHTML` in `apps/web`; Zod `max(500)` + `bodyLimit: 4 KB`                                | Dev      | Epic 2           |
| **R-004**  | DATA     | Optimistic-UI rollback incorrect on mutation failure             | 3           | 2      | **6** | Pure `useReducer` with TypeScript discriminated-union actions; exhaustive switch with `assertNever`; comprehensive unit matrix + E2E Journey 3       | Dev + QA | Epic 2 / Epic 3  |
| **R-008**  | OPS      | API boots against an outdated DB schema (migration drift)        | 2           | 3      | **6** | Concrete mechanism in `apps/api/src/db/migrate.ts` per ASR-3 (fail non-zero on drift); `/health` 503 on DB unreachable                               | Dev      | Story 1.4        |

#### Medium-Priority Risks (Score 3–5)

| Risk ID | Category | Description                                                            | Probability | Impact | Score | Mitigation                                                                                        | Owner       |
| ------- | -------- | ---------------------------------------------------------------------- | ----------- | ------ | ----- | ------------------------------------------------------------------------------------------------- | ----------- |
| R-003   | DATA     | Last-write-wins correctness under concurrent mutations                 | 2           | 2      | 4     | Postgres row-level atomicity; Drizzle `UPDATE … WHERE id`; dedicated `concurrency.int.test.ts`    | Dev + QA    |
| R-005   | SEC      | CORS misconfigured — unauthorized origin accepted                      | 2           | 2      | 4     | `@fastify/env`-validated `CORS_ORIGIN`; integration test for allowed vs. disallowed origins       | Dev + Ops   |
| R-006   | PERF     | Initial JS bundle exceeds ≤ 200 KB gzipped (NFR4)                      | 2           | 2      | 4     | `@next/bundle-analyzer` dev tool; manual pre-release check (no CI gate in v1, explicit deferral)  | Dev         |
| R-009   | TECH     | Client-spoofed fields accepted on create (e.g., `id`)                  | 2           | 2      | 4     | All request schemas use Zod `.strict()`; `contracts.test.ts` round-trip tests                     | Dev         |
| R-010   | SEC      | Rate-limit bypass via `X-Forwarded-For` spoofing                       | 2           | 2      | 4     | Careful `trustProxy`; deployment-doc guidance; direct-connection integration test                 | Dev + Ops   |
| R-011   | BUS      | Users assume todos are private (against v1 design)                     | 2           | 2      | 4     | UI disclosure microcopy; PRD 5-user unprimed test                                                 | PM / UX     |
| R-013   | BUS      | Active/completed state conveyed only via color (NFR12 failure)         | 2           | 2      | 4     | Radix `Checkbox` `aria-checked`; semantic `<s>`/`line-through`; axe-core scans                    | Dev + QA    |
| R-014   | SEC      | Resource-exhaustion via oversized body                                 | 2           | 2      | 4     | Fastify `bodyLimit: 4 KB`; Zod `max(500)`; integration test asserts 413/400                       | Dev         |
| R-015   | OPS      | Unhandled promise rejection crashes client (NFR9)                      | 2           | 2      | 4     | Top-level `unhandledrejection` listener; per-dispatch `try/catch` in reducer orchestrator         | Dev         |
| R-016   | TECH     | Drift between Drizzle schema, Zod contracts, and Swagger OpenAPI       | 2           | 2      | 4     | `drizzle-zod` derivation; `contracts.test.ts`; `tsc --noEmit` in CI; `swagger-parser` validation  | Dev         |
| R-019   | PERF     | Rapid-toggle race between optimistic state and server response         | 2           | 2      | 4     | Reducer tracks `pending`; reconciles deterministically on each response                           | Dev         |
| R-020   | OPS      | Correlation ID not reaching user-reported bug reports                  | 2           | 2      | 4     | `api.ts` always sets `x-request-id`; `ApiError` captures echo; toast surfaces id                  | Dev         |

#### Low-Priority Risks (Score 1–2)

| Risk ID | Category | Description                                        | Probability | Impact | Score | Action                                                              |
| ------- | -------- | -------------------------------------------------- | ----------- | ------ | ----- | ------------------------------------------------------------------- |
| R-007   | PERF     | Server p95 latency > 300 ms (NFR2)                 | 1           | 2      | 2     | Monitor — baseline in integration runs; no v1 load test required    |
| R-012   | OPS      | Missing env var → silent misbehavior               | 1           | 2      | 2     | Document — `@fastify/env` fails startup; smoke-test coverage        |
| R-017   | OPS      | Debug-level logs leak todo text                    | 1           | 1      | 1     | Document — log-level policy per architecture §Communication Patterns |
| R-018   | BUS      | Ordering inconsistency across users (FR10)         | 1           | 2      | 2     | Monitor — deterministic `ORDER BY created_at`; integration assertion |
| R-021   | BUS      | Concurrent-delete UI jitter                        | 1           | 2      | 2     | Document — acceptable within LWW semantics                          |

#### Risk Category Legend

- **TECH:** Technical/architecture (integration, contracts, drift)
- **SEC:** Security (XSS, CORS, rate-limit, input bounds)
- **PERF:** Performance (latency, bundle size, races)
- **DATA:** Data integrity (LWW, optimistic rollback)
- **BUS:** Business / UX (abuse, mental model, accessibility)
- **OPS:** Operations (deploy, migration, observability)

---

### Testability Concerns and Architectural Gaps

**🚨 ACTIONABLE CONCERNS — Architecture Team Must Address**

#### 1. Blockers to Fast Feedback

| Concern                                            | Impact                                                                                   | What Architecture Must Provide                                                                                               | Owner          | Timeline           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------ |
| **Web test stack unpinned (ASR-1)**                | Test implementation on the web tier cannot start; estimate uncertainty rises             | Pin Vitest + React Testing Library + MSW for unit/component; Playwright + axe-core for E2E                                   | Architect + QA | Pre-Story 1.7      |
| **Integration DB isolation undefined (ASR-2)**     | Tests will be flaky or leak state between workers; `concurrency.int.test.ts` becomes unsafe | Per-worker ephemeral schema pattern in `buildTestApp.ts`; migrate-then-test-then-drop lifecycle                              | Dev            | Story 1.4          |
| **Fail-fast schema check mechanism unspecified (ASR-3)** | Cannot write a deterministic integration test for the intended safety net                   | Concrete check in `apps/api/src/db/migrate.ts` with exit-code contract documented                                            | Dev            | Story 1.4          |
| **Rate-limit not test-parameterized (ASR-4)**      | Rate-limit behavior leaks into unrelated tests; targeted test impossible                 | Make `max` and `timeWindow` configurable per environment so most tests bypass and one targeted test exercises                | Dev            | Story 1.5          |

#### 2. Architectural Improvements Needed

1. **Server-side test-fault-injection knob is absent**
   - **Current problem:** Journey 3 (offline, 5xx, timeout) can only be exercised by client-side Playwright route stubs; no way to inject server-side faults into a running stack.
   - **Required change:** None architectural. Playwright network interception is sufficient; documented here so QA aligns on the approach and no later request appears to demand server changes.
   - **Impact if not fixed:** N/A — test approach fixed.
   - **Owner:** QA.
   - **Timeline:** Pre-Epic 3.

---

### Testability Assessment Summary

**📊 What Works Well**

- ✅ **Headless-first API** (FR28 / NFR22): `app.inject()` + OpenAPI docs → every endpoint reachable without UI; full integration coverage possible.
- ✅ **Single contract boundary**: `packages/shared` Zod schemas drive validation, types, and `@fastify/swagger` docs. Round-trip tests in `contracts.test.ts` catch drift early.
- ✅ **Deterministic observability**: Pino structured logs + `x-request-id` echoed on responses → tests assert correlation end-to-end without brittle log parsing.
- ✅ **Stateless API** (NFR6-ready): horizontal test parallelism is safe at the API layer.
- ✅ **Deterministic ordering** (FR10): `ORDER BY created_at ASC` gives reproducible list assertions.
- ✅ **Pure reducer** (`apps/web/src/lib/reducer.ts`): optimistic rollback is unit-testable without DOM or network.
- ✅ **No auth in v1** (NFR19): removes the largest class of test fixtures typically needed at this stage.

**Accepted Trade-offs (No Action Required)**

- **No CI-enforced bundle-size gate** — PRD-scoped for v1; pre-release manual check via `@next/bundle-analyzer`. Revisit post-v1.
- **No load/perf test suite** — low scale; PRD NFR2/NFR3 validated by spot-checks, not sustained testing.
- **No automated a11y gate beyond axe-core in E2E** — Lighthouse CI / pa11y-ci deferred to post-v1 reference-quality polish.

---

### Risk Mitigation Plans (High-Priority Risks ≥ 6)

#### R-001: Shared unauthenticated list invites abuse (Score 6) — HIGH

**Mitigation Strategy:**

1. Add microcopy near the list heading that discloses the shared, non-private nature of the list (PRD §Known v1 Trade-offs).
2. Enable `@fastify/rate-limit` at 100 req/min/IP as baseline abuse defense.
3. Document in README that v1 has no moderation or content filtering; operator acceptance documented.

**Owner:** PM / UX
**Timeline:** Before Epic 2 ships
**Status:** Planned
**Verification:** PM sign-off on final copy; rate-limit 429 test (P1-002) passes.

#### R-002: Stored XSS via todo text (Score 6) — CRITICAL FOR SEC

**Mitigation Strategy:**

1. Rely on React's default JSX escaping for rendered text; prohibit `dangerouslySetInnerHTML` in `apps/web` via ESLint rule.
2. Enforce server-side input bounds: Zod `.string().trim().min(1).max(500)` + Fastify `bodyLimit: 4 KB`.
3. P0 end-to-end XSS payload test (P0-013): POST `<script>`-containing text, render home page, assert literal rendering and no script execution.

**Owner:** Dev
**Timeline:** Epic 2
**Status:** Planned
**Verification:** P0-013 passes; ESLint rule visible in CI `lint` job.

#### R-004: Optimistic-UI rollback correctness (Score 6) — HIGH

**Mitigation Strategy:**

1. Implement `reducer.ts` as a pure function over a discriminated-union action set; add `assertNever` exhaustiveness check.
2. Cover the full action matrix with unit tests (P0-017..P0-021): add / toggle / delete × success / failure × in-flight reconcile order.
3. End-to-end Journey 3 (P0-024) validates user-visible rollback plus input preservation plus retry recovery.

**Owner:** Dev + QA
**Timeline:** Epic 2 (reducer + tests) and Epic 3 (E2E)
**Status:** Planned
**Verification:** All reducer unit tests pass; Journey 3 E2E passes under stubbed failure.

#### R-008: API boots against outdated DB schema (Score 6) — CRITICAL FOR OPS

**Mitigation Strategy:**

1. Pick a concrete drift check in `apps/api/src/db/migrate.ts` (ASR-3): compare applied-migration row against the `__drizzle_migrations` journal head.
2. Exit non-zero with a diagnostic message on drift; zero and silent on match.
3. Wire `GET /health` to return 503 when the DB is unreachable or when the drift check fails at probe time.
4. Integration test (P0-016) points at an unmigrated database and asserts non-zero exit.

**Owner:** Dev
**Timeline:** Story 1.4
**Status:** Planned
**Verification:** P0-016 passes; `/health` returns 503 under induced drift.

---

### Assumptions and Dependencies

#### Assumptions

1. Architecture as documented is frozen; no additional services (auth, real-time, queues) appear in v1.
2. Production deploy pipeline runs `drizzle-kit migrate` as an explicit pre-deploy step; API is not responsible for self-migrating.
3. Pino JSON logs are shipped to stdout and captured by the deploy platform; no log aggregator is in the testing loop.
4. Single `docker-compose` Postgres is acceptable as the integration-test DB (ASR-2 resolves its isolation inside).

#### Dependencies

1. ASR-1 (test stack pinned) — required before Story 1.7 test work begins.
2. ASR-2 (integration DB isolation) — required before Story 1.4 concurrency tests land.
3. ASR-3 (fail-fast drift mechanism) — required before Story 1.4 ACs are verifiable.
4. ASR-4 (rate-limit parameterization) — required before Story 1.5 rate-limit tests land.

#### Risks to Plan

- **Risk:** The four ASRs slip, pushing test-infrastructure work into Epic 2.
  - **Impact:** Epic 2 feature stories land without accompanying tests; technical debt at the close of v1.
  - **Contingency:** Treat ASR-1/2 as part of Story 1.4/1.7 definitions of done, not separate tickets.

---

**End of Architecture Document**

**Next Steps for Architecture Team:**

1. Assign owners and milestones for ASR-1..ASR-4.
2. Approve the four score-6 mitigation plans.
3. Review and approve microcopy for R-001 / R-011.

**Next Steps for QA Team:**

1. Await ASR-1 / ASR-2 / ASR-4 resolutions before standing up test infrastructure.
2. Consume the companion QA doc (`test-design-qa.md`) for the full scenario matrix.
3. Prepare test data factories and Playwright/Vitest scaffolding against the pinned stack.
