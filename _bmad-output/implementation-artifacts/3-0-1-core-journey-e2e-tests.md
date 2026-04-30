---
title: 'Story 3.0.1 — Core Journey E2E Tests (P0-022, P0-023, P2-011)'
type: 'feature'
created: '2026-04-30'
status: 'done'
baseline_commit: 'f83d8fefa3393f19bdf38ed898d7ef196343e3a6'
context:
  - 'apps/web/e2e/xss-payload.spec.ts'
  - 'apps/web/e2e/README.md'
  - 'apps/web/playwright.config.ts'
  - '_bmad-output/test-artifacts/test-design-qa.md'
  - '_bmad-output/implementation-artifacts/3-0-playwright-e2e-harness.md'
  - '_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 1.9 / 2.5 / 2.6 / 2.7 shipped the create / toggle / delete UI flows on Vitest + RTL + jsdom only. The Playwright harness landed in Story 3.0 with a single P0-013 canary; the three journey-level E2E scenarios from [test-design-qa.md](../test-artifacts/test-design-qa.md) that exercise the already-shipped UI without depending on Toast/refetch infrastructure remain unimplemented — P0-022 (Journey 1 happy path), P0-023 (Journey 2 returning session: reload + delete persistence), and P2-011 (DELETE round-trip — subset of Journey 2's delete-then-reload assertion).

**Approach:** Add two new specs under `apps/web/e2e/` extending the harness — `journey-1-happy-path.spec.ts` (P0-022) and `journey-2-returning-session.spec.ts` (P0-023, also satisfies P2-011). Mirror the canary's pattern: tag titles with `@P0 @Journey<N>`, scope every locator by per-test `randomUUID()`-suffixed text to avoid `fullyParallel` cross-project collisions on the shared dev DB, clean up via API DELETE in `afterEach` (tolerate 404). UI-driven add/toggle/delete (the journey IS the test); API-only seed for Journey 2's pre-populated returning-session state.

## Boundaries & Constraints

**Always:**
- Each test uses unique text via `randomUUID()` suffix so 3 parallel browser projects do not collide on shared rows in the dev DB (closes [deferred-work.md](./deferred-work.md) Story 3.0 item: "fullyParallel: true + 3 browser projects seed identical payload").
- Locators MUST be scoped by the per-test unique text. Never assert list length or row counts.
- Reuse `API_URL` + `randomUUID()` request-id patterns from [xss-payload.spec.ts:1-9](../../apps/web/e2e/xss-payload.spec.ts#L1-L9).
- Use ONLY shipped data-testids: `todo-list`, `todo-list-empty`, `todo-item`, `todo-item-text`, `todo-item-checkbox`, `todo-item-delete`, `todo-input-field`, `todo-input-submit`. Do not add new ones to production components.
- `afterEach` cleans up every recorded id via DELETE; tolerates 404 (test may have failed pre-insert).

**Ask First:**
- If `data-completed` flip-assertion proves flaky on a specific browser, propose ONE stabilization (e.g., switch to Radix's `data-state="checked"` on the checkbox, or assert visual class) before adding sleeps/network-idle waits.

**Never:**
- No `page.waitForLoadState('networkidle')`; no arbitrary `waitForTimeout`.
- No reliance on a clean DB at test start.
- No new helper / fixture / page-object modules — keep specs flat and self-contained (Story 3.0 Dev Notes: "additive to the harness, not foundational"). Extract when a 4th–5th spec lands.
- No edits to [playwright.config.ts](../../apps/web/playwright.config.ts) — config is correct as-is.
- No CI workflow changes. No new devDeps.
- No coverage of P0-024 / P1-013 / P1-014 / P1-019 / P1-020 / P1-026 / P2-001 / P2-003 / P2-005 / P2-007 — deferred to Stories 3.0.2 / 3.0.3 per [deferred-work.md](./deferred-work.md).

</frozen-after-approval>

## Code Map

- `apps/web/e2e/xss-payload.spec.ts` -- harness pattern to mirror (`API_URL` constant, afterEach cleanup, structural assertions)
- `apps/web/e2e/README.md` -- onboarding doc; append one bullet listing the two new specs (≤2 added lines)
- `apps/web/playwright.config.ts` -- already wired (3 projects, `fullyParallel`, `baseURL`, `webServer`); read-only reference
- `apps/web/src/components/TodoItem.tsx:34-74` -- selector source (`todo-item`, `data-completed`, `todo-item-checkbox`, `todo-item-delete`, `todo-item-text`); class `line-through` lives at line 59
- `apps/web/src/components/TodoInput.tsx:24-50` -- selector source (`todo-input-field`, `todo-input-submit`); Enter submits via `<form onSubmit>`
- `apps/web/src/components/TodoList.tsx:13-79` -- list-state selectors (`todo-list`, `todo-list-empty`, `todo-list-loading`)
- `apps/api/src/routes/todos.ts` -- API contract: `POST /todos` → 201 `{id, text, completed, createdAt}`; `DELETE /todos/:id` → 204 / 404; `GET /todos` → `{todos: [...]}`

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/e2e/journey-1-happy-path.spec.ts` -- create. Single `test.describe('P0-022 Journey 1 — happy path')` with one `test('@P0 @Journey1 add via input then toggle reflects completed state', …)`. Track `createdId: string | null`. Steps: `text = `j1-${randomUUID()}``; `page.goto('/')`; wait for `getByTestId('todo-list')` OR `getByTestId('todo-list-empty')` visible; fill `todo-input-field` with `text`; press Enter (form `onSubmit`); locate the new row via `page.getByTestId('todo-item').filter({ hasText: text })`; assert it has `data-completed="false"`; click its descendant `todo-item-checkbox`; assert `data-completed="true"` (Playwright auto-retries up to ~5 s); assert the descendant `todo-item-text` has class `line-through` via `toHaveClass(/line-through/)`. `afterEach`: `request.get('${API_URL}/todos')` → JSON `{todos: [...]}` → find one whose `text === <ourText>` → capture `createdId` → `request.delete('${API_URL}/todos/${createdId}')` and `expect([204, 404]).toContain(status())`.
- [x] `apps/web/e2e/journey-2-returning-session.spec.ts` -- create. Single `test.describe('P0-023 Journey 2 — returning session: reload + delete persists')` with one `test('@P0 @Journey2 @P2-011 reload preserves seeded rows; UI-deleted row stays gone after reload', …)`. Track `seededIds: string[]` (3 entries). `beforeEach`: seed THREE todos via API POST with texts `j2-keep-a-${uuid}`, `j2-keep-b-${uuid}`, `j2-delete-${uuid}`; push each returned `id` to `seededIds`. Test: `page.goto('/')`; assert all three texts are visible inside `getByTestId('todo-list')`; click the `todo-item-delete` button on the `j2-delete-` row; assert `expect(page.getByText(deleteText)).toHaveCount(0)`; `await page.reload()`; wait for `todo-list`; assert both `j2-keep-*` texts still visible (P0-023 persistence); assert `j2-delete-*` text count === 0 (P2-011 round-trip). `afterEach`: iterate `seededIds`, DELETE each, tolerate 404.
- [x] `apps/web/e2e/README.md` -- append a one-line bullet under the "Where the tests live" section listing the two new specs and the scenarios they cover. ≤2 added lines.

**Acceptance Criteria:**
- Given a clean local dev stack with `npm run dev` running, when `npm run test:e2e` executes from repo root, then BOTH new specs PASS across all three browser projects (chromium / firefox / webkit) — 6 new passing results, alongside the existing 3 canary results = 9 total — and aggregated wall-clock stays under 90 seconds.
- Given the `fullyParallel: true` config, when 3 projects run concurrently, then no test fails from a shared-text collision — every assertion locator is scoped by a `randomUUID()`-suffixed text the test itself created or seeded.
- Given any test fails mid-execution, when `afterEach` runs, then it attempts cleanup of every recorded id and tolerates 404 — never throws.
- Given the full sanity gate, when `npm run lint && npm run typecheck && npm run test` runs from repo root, then all three pass with zero warnings / zero errors, AND `npm run test` does NOT invoke Playwright (Story 3.0 AC #3 separation stays intact).
- Given a developer opens `apps/web/e2e/README.md`, when they read the test inventory, then they see three specs (canary + Journey 1 + Journey 2) and the per-scenario tags (`@P0`, `@Security`, `@Journey1`, `@Journey2`, `@P2-011`).

## Design Notes

**Why no helper / fixture module yet** — Story 3.0 Dev Notes pin "additive to the harness, not foundational" for follow-up specs. Three specs (canary + two journeys) do not justify a `fixtures/` or `helpers/` tree; the duplication cost (≈10 LOC of API_URL + afterEach boilerplate) is below the abstraction-cost threshold. Revisit at the 4th–5th spec.

**Why GET-then-filter cleanup for Journey 1** — The journey adds via the UI input. The DOM does not expose the server id ([TodoItem.tsx:34](../../apps/web/src/components/TodoItem.tsx#L34) has no `data-id` attribute, and adding one is a production change with no runtime benefit). The cleanup queries `GET /todos`, filters by the test's unique text suffix, and deletes the matching id. Journey 2 captures ids directly because its `beforeEach` seeds via API.

**Why `toHaveClass(/line-through/)` for the strikethrough assertion** — `TodoItem.tsx:57-61` is the authoritative source: when `completed === true`, the className contains `line-through`. `toHaveCSS('text-decoration-line', ...)` varies across browser engines (`line-through` longhand vs `underline line-through` shorthand), introducing brittleness without coverage gain. Class assertion mirrors the source.

**Test naming + tags** — Title format `@P0 @Journey<N> [@P2-011]` mirrors the canary's `@P0 @Security` ([xss-payload.spec.ts:25](../../apps/web/e2e/xss-payload.spec.ts#L25)) and matches [test-design-qa.md:429](../test-artifacts/test-design-qa.md#L429) "Run by tag". Future CI integration (out of scope here) can filter via `playwright test --grep @Journey1`.

**Why Journey 2 seeds 3 rows (not 2)** — Two `j2-keep-*` rows prove "list re-flows cleanly after deletion" (PRD line 176) — a single keep-row could pass even on a list-rewrite bug that drops everything except the survivor by coincidence of count. Three rows make the persistence + ordering assertion structurally sound.

## Verification

**Commands:**
- `npm install` -- expected: no lockfile changes (no new deps; specs use `@playwright/test` + `node:crypto` only)
- `npm --workspace apps/web run test:e2e -- journey-1-happy-path` -- expected: 3 passes (one per browser); under 30 s wall-clock
- `npm --workspace apps/web run test:e2e -- journey-2-returning-session` -- expected: 3 passes; under 30 s wall-clock
- `npm run test:e2e` -- expected: 9 passes total (3 canary + 6 new); aggregated under 90 s
- `npm run lint && npm run typecheck && npm run test` -- expected: zero warnings, zero errors, no Playwright invocation, unchanged Vitest test counts

## Review Findings

Code review run on 2026-04-30 against the in-progress diff. Three parallel layers: Blind Hunter (diff-only), Edge Case Hunter (diff + read access), Acceptance Auditor (diff + spec). Acceptance Auditor verdict on the 5 ACs: **3 PASS, 1 PARTIAL (AC #5 — README inventory satisfies the literal AC but does not enumerate `@Journey1` / `@Journey2` / `@P2-011` under the existing "Tagging convention" section), 2 N/V (AC #1 / AC #4 — runtime claims, structurally satisfied)**. No FAILs. Implementation byte-faithful to spec on hard requirements; no boundary violations.

- [x] \[Review]\[Patch] AC #5 boundary — README "≤2 added lines" overshoot accepted as documentation-coherence deviation. Reverting the "What is NOT covered yet" rewording would leave "Only P0-013 is implemented" factually false (directly contradicted by the new "Where the tests live" inventory two paragraphs above). Recorded in [deferred-work.md](./deferred-work.md) for transparency.
- [x] \[Review]\[Defer] `getByText` substring matching → latent strict-mode trap (`apps/web/e2e/journey-2-returning-session.spec.ts:54-56,80-82`) — bundle with the canary's existing Story 3.0 strict-mode deferral.
- [x] \[Review]\[Defer] Journey 1 captures server `id` via post-hoc `GET /todos` filter — races optimistic POST reconcile (`apps/web/e2e/journey-1-happy-path.spec.ts:60-72`) — empirically passes; harden via `page.waitForResponse` on POST when next robustness pass lands.
- [x] \[Review]\[Defer] `afterEach` DELETE rejection / sequential-loop failure leaks rows (`apps/web/e2e/journey-1-happy-path.spec.ts:12-21`, `apps/web/e2e/journey-2-returning-session.spec.ts:13-22`) — same family as Story 3.0's existing afterEach deferral; bundle.
- [x] \[Review]\[Defer] Unchecked `(await res.json()) as { id: string }` cast in seed loop (`apps/web/e2e/journey-2-returning-session.spec.ts:46-47`) — re-surfaces Story 3.0 deferral; bundle.
- [x] \[Review]\[Defer] `waitForResponse` predicate could match unintended DELETEs in future expanded specs (`apps/web/e2e/journey-2-returning-session.spec.ts:67-73`) — apply when next UI-delete spec in this file lands.
- [x] \[Review]\[Defer] README "Tagging convention" section enumeration gap for `@Journey1` / `@Journey2` / `@P2-011` (`apps/web/e2e/README.md:46-50`) — sweep alongside Story 3.0.2 / 3.0.3 README updates.

**Dismissed (~10):** spec-ratified design choices (no `data-id` on `todo-item` per Code Map, `getByText` non-strict per Story 3.0 pattern, `line-through` class assertion per Design Notes ratification, `waitForResponse` is a correctness fix not a stabilization per Ask First scope); Playwright auto-actionability handles checkbox-while-pending automatically (`click()` waits for `:not(disabled)`, no flake observed empirically across 9/9 cross-browser runs); `page.waitForResponse` cross-project-leak premise is false (page-scoped, not server-scoped); test-design doc-reference filename inconsistency (`test-design-architecture.md` vs `test-design-qa.md`) is pre-existing in the Story 3.0 README, not introduced here; `API_URL` localhost fallback already deferred from Story 3.0.

## Suggested Review Order

**Journey 1 — UI-driven create + toggle (entry point)**

- Single test capturing the whole journey: add via input, toggle via Radix checkbox, assert `data-completed` + `line-through`.
  [`journey-1-happy-path.spec.ts:23`](../../apps/web/e2e/journey-1-happy-path.spec.ts#L23)

- Post-hoc id capture for cleanup — DOM has no `data-id` (by design), so query API and filter by unique text.
  [`journey-1-happy-path.spec.ts:60`](../../apps/web/e2e/journey-1-happy-path.spec.ts#L60)

**Journey 2 — seeded state + reload + delete persistence**

- API-seed three rows, UI-delete one, reload, assert delete persists + the other two survive (closes P0-023 + P2-011).
  [`journey-2-returning-session.spec.ts:24`](../../apps/web/e2e/journey-2-returning-session.spec.ts#L24)

- `waitForResponse` + `Promise.all` — gates `page.reload()` on the actual API DELETE so the post-reload GET cannot race the still-in-flight DELETE.
  [`journey-2-returning-session.spec.ts:65`](../../apps/web/e2e/journey-2-returning-session.spec.ts#L65)

**Test isolation under `fullyParallel`**

- Per-test `randomUUID()`-suffixed text scopes every locator — closes Story 3.0's parallel-collision deferral.
  [`journey-1-happy-path.spec.ts:29`](../../apps/web/e2e/journey-1-happy-path.spec.ts#L29)

- Same UUID threaded through all three seed texts in Journey 2.
  [`journey-2-returning-session.spec.ts:31`](../../apps/web/e2e/journey-2-returning-session.spec.ts#L31)

**Documentation**

- README inventory listing all three specs (canary + Journey 1 + Journey 2).
  [`README.md:38`](../../apps/web/e2e/README.md#L38)

- Multi-goal split record — 3.0.2 (a11y + responsive) and 3.0.3 (cross-browser + smoke + mobile-reload) deferred.
  [`deferred-work.md:5`](./deferred-work.md#L5)

- Review findings + defer-bundling rationale for this story.
  [`deferred-work.md:18`](./deferred-work.md#L18)
