---
title: 'TEA Test Design → BMAD Handoff Document'
version: '1.0'
workflowType: 'testarch-test-design-handoff'
inputDocuments:
  - _bmad-output/test-artifacts/test-design-architecture.md
  - _bmad-output/test-artifacts/test-design-qa.md
sourceWorkflow: 'testarch-test-design'
generatedBy: 'TEA Master Test Architect'
generatedAt: '2026-04-19'
projectName: 'todo-app'
---

# TEA → BMAD Integration Handoff: todo-app v1

## Purpose

Bridges TEA test-design outputs into BMAD's epic/story decomposition. Embeds risk assessment, quality gates, and P0/P1 scenarios into `create-epics-and-stories` so they flow downstream into implementation planning.

## TEA Artifacts Inventory

| Artifact               | Path                                                                | BMAD Integration Point                                   |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| Test Design — Arch     | `_bmad-output/test-artifacts/test-design-architecture.md`           | Epic-level quality gates, pre-implementation blockers    |
| Test Design — QA       | `_bmad-output/test-artifacts/test-design-qa.md`                     | Story acceptance-criteria guidance; test scenario matrix |
| Risk Assessment        | (embedded in architecture doc)                                      | Epic risk classification; story priority adjustments     |
| Coverage Strategy      | (embedded in QA doc)                                                | Story test requirements                                  |
| Progress / audit trail | `_bmad-output/test-artifacts/test-design-progress.md`               | Workflow resumption; traceability                        |

## Epic-Level Integration Guidance

### Risk References (P0 / P1 surface into epic quality gates)

| Epic                                               | Embedded Risks  | Epic-Level Gate                                                                                     |
| -------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| **Epic 1: Shared Todo List — Visible Read Experience** | R-008, R-016   | P0-015 `/health`, P0-016 migrate fail-fast, P1-007 OpenAPI valid, P0-006 ordering ship-ready         |
| **Epic 2: Todo Core Loop — Create / Complete / Delete** | R-001, R-002, R-003, R-004, R-009, R-013, R-014, R-019 | XSS (P0-013), reducer matrix (P0-017..P0-021), concurrency (P1-004), a11y (P1-013..P1-018) all green |
| **Epic 3: Failure Resilience & Recovery**          | R-015, R-020    | Journey 3 (P0-024), correlation-id plumbing (P1-005/P1-006), unhandled-rejection listener (P1-026)   |

### Quality Gates

- **Epic 1:** all P0-001..P0-016 pass; `/health` returns 503 under induced drift.
- **Epic 2:** all P0-017..P0-023 pass; axe-core scan clean; XSS test passes.
- **Epic 3:** Journey 3 E2E passes under stubbed 5xx / offline / timeout.
- **Release gate:** P0 = 100% · P1 ≥ 95% · 0 WCAG AA violations · all four score-6 risks covered by passing tests.

## Story-Level Integration Guidance

### P0 / P1 Test Scenarios that MUST become Story Acceptance Criteria

| Story (from epics.md)                                         | Mandatory AC derived from TEA                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Story 1.2 — Define shared Todo contract**                   | P0-001..P0-004 contract round-trips; `.strict()` rejection of unknown fields                                   |
| **Story 1.4 — API data layer + migrate fail-fast**            | P0-016 non-zero exit on schema drift (resolves Architecture Gap #1 / ASR-3)                                    |
| **Story 1.5 — `GET /todos` + plugin stack + observability**    | P0-005/P0-006 list + ordering; P1-005/P1-006 x-request-id plumbing; P1-001 CORS; P1-002/P1-003 rate-limit       |
| **Story 1.6 — `/health` and `/docs`**                          | P0-015 healthy/503; P1-007 openapi validity; P1-008 docs 404 in prod                                            |
| **Story 1.7 — Web app shell**                                  | P1-016 focus-visible ring; P1-017 color contrast AA; metadata title set                                         |
| **Story 2.x — CRUD mutation UI + reducer**                     | P0-017..P0-021 reducer matrix; P1-023 input preservation; P1-027 rapid-toggle                                   |
| **Story 2.x — TodoItem with checkbox + delete**                | P1-015 `aria-checked` reflects state; P1-018 tap-target ≥ 44×44; P1-013 axe clean                               |
| **Story 2.x — Stored-text rendering**                          | P0-013 XSS payload rendered literally; ESLint rule bans `dangerouslySetInnerHTML`                               |
| **Story 3.x — Error surfacing + optimistic rollback on failure** | P0-024 Journey 3 end-to-end; P1-024 Toast renders `.message`; P1-026 unhandled-rejection listener               |

### Data-TestId Requirements

To enable deterministic E2E selectors without coupling to Tailwind classes, stories should surface the following `data-testid` values:

- `data-testid="todo-input"` on the create `<input>`.
- `data-testid="todo-submit"` on the create form submit button (or rely on `type="submit"` + Enter).
- `data-testid="todo-list"` on the `<ul>`.
- `data-testid="todo-item"` on each `<li>`, plus `data-completed="true|false"` for filtering.
- `data-testid="todo-checkbox"` on the Radix `Checkbox`.
- `data-testid="todo-delete"` on the delete button.
- `data-testid="toast"` on the Radix `Toast` root.
- `data-testid="empty-state"` on the empty-state region.
- `data-testid="loading-state"` on the initial-load skeleton.

These keep Playwright selectors stable across CSS changes and are orthogonal to accessible roles (which tests should continue to use for a11y assertions via `getByRole`).

## Risk-to-Story Mapping

| Risk ID | Category | P × I | Recommended Story / Epic                       | Test Level(s)                   |
| ------- | -------- | ----- | ----------------------------------------------- | ------------------------------- |
| R-001   | BUS      | 3×2=6 | Epic 2 (UI disclosure) + Story 1.5 (rate-limit) | E2E (P2-001), Integration       |
| R-002   | SEC      | 2×3=6 | Epic 2 (text rendering)                         | E2E (P0-013) + Integration      |
| R-004   | DATA     | 3×2=6 | Epic 2 (reducer) + Epic 3 (E2E journey)         | Unit matrix + E2E               |
| R-008   | OPS      | 2×3=6 | Story 1.4 (migrate) + Story 1.6 (`/health`)     | Integration                     |
| R-003   | DATA     | 2×2=4 | Story 1.5 (PATCH) + concurrency test            | Integration                     |
| R-005   | SEC      | 2×2=4 | Story 1.5 (plugin stack)                        | Integration                     |
| R-006   | PERF     | 2×2=4 | Epic 2 (bundle inspection pre-release)          | Manual                          |
| R-009   | TECH     | 2×2=4 | Story 1.2 (contracts)                           | Unit                            |
| R-010   | SEC      | 2×2=4 | Story 1.5 (trustProxy config)                   | Integration                     |
| R-011   | BUS      | 2×2=4 | Epic 2 (disclosure microcopy)                   | E2E                             |
| R-013   | BUS      | 2×2=4 | Epic 2 (TodoItem) + axe scan                    | Component + E2E                 |
| R-014   | SEC      | 2×2=4 | Story 1.2 / 1.5 (bounds)                        | Integration                     |
| R-015   | OPS      | 2×2=4 | Epic 3 (unhandled rejection listener)           | Component + E2E                 |
| R-016   | TECH     | 2×2=4 | Story 1.2 + Story 1.6 (contracts + openapi)     | Unit + Integration              |
| R-019   | PERF     | 2×2=4 | Epic 2 (reducer rapid-toggle)                   | Unit                            |
| R-020   | OPS      | 2×2=4 | Story 1.5 (request-context) + Epic 3 (toast)    | Integration + Component         |
| R-007   | PERF     | 1×2=2 | Nightly p3 perf                                 | Perf sample                     |
| R-012   | OPS      | 1×2=2 | Story 1.5 (env)                                 | Integration                     |
| R-017   | OPS      | 1×1=1 | Log-field audit                                 | Manual                          |
| R-018   | BUS      | 1×2=2 | Story 1.5 (ordering)                            | Integration (covered by P0-006) |
| R-021   | BUS      | 1×2=2 | Exploratory                                     | Exploratory                     |

## Recommended BMAD → TEA Workflow Sequence

1. **TEA Test Design** (`TD`, this workflow) → produces this handoff + Architecture + QA docs.
2. **BMAD Epic/Story creation** — consumes this handoff; embeds the mandatory AC rows above into the existing `epics.md`.
3. **TEA ATDD** (`AT`) — generates red-phase acceptance tests for P0 scenarios.
4. **BMAD Implementation** — developers implement against the red tests; ASR-1..ASR-4 resolved as prerequisites to Story 1.4 / 1.5 / 1.7.
5. **TEA Automate** (`TA`) — expand to full P0/P1 suite once infrastructure is green.
6. **TEA Trace** (`TR`) — validate that every AC maps to at least one test before the release gate.

## Phase Transition Quality Gates

| From Phase             | To Phase               | Gate Criteria                                                                 |
| ---------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| Test Design            | Epic / Story Creation  | All 4 high-priority (score 6) risks have mitigation owners and ACs            |
| Epic / Story Creation  | ATDD                   | Stories 1.4 / 1.5 / 2.x / 3.x carry the mandatory ACs from the table above    |
| ATDD                   | Implementation         | Failing P0 acceptance tests exist for R-002 / R-004 / R-008 / contract shapes |
| Implementation         | Test Automation        | P0 green; Dev has resolved ASR-1..ASR-4 in code                               |
| Test Automation        | Release                | P0 = 100% · P1 ≥ 95% · axe clean · trace matrix ≥ 95% AC coverage             |
