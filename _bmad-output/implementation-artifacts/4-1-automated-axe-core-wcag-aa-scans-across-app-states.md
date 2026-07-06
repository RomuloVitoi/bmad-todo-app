# Story 4.1: Automated axe-core WCAG AA scans across app states

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reviewer of the v1 product for accessibility compliance,
I want automated axe-core scans against every distinct UI state,
so that NFR10 (WCAG 2.1 AA) is verified automatically, not just designed for.

## Acceptance Criteria

1. **Given** `apps/web/e2e/accessibility.spec.ts`, **when** the file is created, **then** it uses `@axe-core/playwright`'s `AxeBuilder` configured with the `wcag2a` and `wcag2aa` tags.
2. **Given** the app in its empty-list state, **when** the axe scan runs, **then** zero violations of impact `critical` or `serious` are reported.
3. **Given** the app in its populated state (seeded mix of active/completed todos), **when** the axe scan runs, **then** zero `critical`/`serious` violations are reported.
4. **Given** the app's initial-load error state (Story 3.4's retry UI), **when** the axe scan runs against it, **then** zero `critical`/`serious` violations are reported.
5. **Given** a Toast is visible (Story 3.2's mutation-failure toast), **when** the axe scan runs with the toast open, **then** zero `critical`/`serious` violations are reported.
6. **Given** axe reports violations of impact `moderate` or `minor`, **when** the test evaluates results, **then** they are logged as test annotations but do NOT fail the test — only `critical`/`serious` findings fail it.
7. **Given** `accessibility.spec.ts`, **when** run across the 3 existing browser projects (chromium, firefox, webkit), **then** all pass.

_(ACs verbatim from [epics.md:1301-1336](../planning-artifacts/epics.md#L1301-L1336).)_

## Tasks / Subtasks

- [x] **Task 1: Create `apps/web/e2e/accessibility.spec.ts` with a shared axe-scan helper (AC: #1, #6)**
  - [x] New file. Import `AxeBuilder` from `@axe-core/playwright` (already a devDependency, `^4.11.3` — see [package.json:24](../../apps/web/package.json#L24), unused by any spec until now).
  - [x] Write one local helper used by all 4 state tests below — do not duplicate the scan-and-triage logic per test:

    ```ts
    import { test, expect, type Page, type TestInfo } from '@playwright/test';
    import AxeBuilder from '@axe-core/playwright';

    const FAILING_IMPACTS = new Set(['critical', 'serious']);

    async function assertNoSeriousA11yViolations(
      page: Page,
      testInfo: TestInfo,
    ): Promise<void> {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      for (const violation of results.violations) {
        if (!FAILING_IMPACTS.has(violation.impact ?? '')) {
          await testInfo.attach(`a11y-${violation.id}`, {
            body: `[${violation.impact}] ${violation.id}: ${violation.help} — ${violation.nodes.length} node(s) — ${violation.helpUrl}`,
            contentType: 'text/plain',
          });
        }
      }

      const failing = results.violations.filter((v) =>
        FAILING_IMPACTS.has(v.impact ?? ''),
      );
      expect(failing, JSON.stringify(failing, null, 2)).toEqual([]);
    }
    ```

    Use `testInfo.attach(...)` (not `testInfo.annotations.push(...)`) — annotations render as short labels in the HTML report and get truncated; attachments show full violation text and are what AC #6's "logged" actually needs to be useful. Either satisfies AC #6's letter ("logged... but do NOT fail the test"); `attach` is the more inspectable choice given this repo's existing `reporter: [['html', ...]]` config in [playwright.config.ts](../../apps/web/playwright.config.ts).
  - [x] `test.describe('P1-013 accessibility — axe-core WCAG AA scans across app states', () => { ... })` — one `describe`, 4 tests inside (Tasks 2–5). Each test gets Playwright's default fresh `page`/context, so route mocks set in one test never leak into another — no shared `afterEach` cleanup is needed (unlike the journey specs, nothing is written to the real DB by any of these 4 tests; see Task 2 below for why).

- [x] **Task 2: Empty-list state scan (AC: #2)**
  - [x] **Do not rely on the real dev DB being empty.** The DB is shared across all e2e specs and 3 parallel browser projects (`fullyParallel: true` in [playwright.config.ts:6](../../apps/web/playwright.config.ts#L6)) — [journey-1-happy-path.spec.ts:32-36](../../apps/web/e2e/journey-1-happy-path.spec.ts#L32-L36) explicitly "tolerates either populated list or empty state" for exactly this reason. A genuinely empty DOM for the axe scan is only reliable via **`page.route()` intercepting `GET /todos`** and fulfilling with a controlled `{ todos: [] }` body, before `page.goto('/')`. This is Playwright's built-in network-mocking API — zero new dependencies (no MSW, consistent with every prior Epic 2/3 story's "0 new deps" pattern).
  - [x] Pattern (repeat this route-mock shape for Tasks 3–5, changing only the fulfilled body/status):

    ```ts
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

    test('@P1 @A11y empty-list state has zero critical/serious violations', async ({
      page,
    }, testInfo) => {
      await page.route(`${API_URL}/todos`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({ json: { todos: [] } });
      });

      await page.goto('/');
      await expect(page.getByTestId('todo-list-empty')).toBeVisible();

      await assertNoSeriousA11yViolations(page, testInfo);
    });
    ```

  - [x] Guard the route handler on `method() !== 'GET'` and `route.continue()` for other methods — this file never issues a POST/PATCH/DELETE, but the guard mirrors the safer pattern and avoids accidentally black-holing a request if a future edit adds one.

- [x] **Task 3: Populated state scan — seeded mix of active/completed (AC: #3)**
  - [x] Same `page.route()` technique as Task 2, fulfilling `GET /todos` with 2 items — one `completed: false`, one `completed: true` — so the scan covers both `TodoItem` visual states (unchecked checkbox + plain text; checked checkbox + `line-through` text) in one pass:

    ```ts
    test('@P1 @A11y populated state (mixed active/completed) has zero critical/serious violations', async ({
      page,
    }, testInfo) => {
      const now = '2026-07-05T00:00:00.000Z';
      const todos = [
        { id: '11111111-1111-4111-8111-111111111111', text: 'active todo', completed: false, createdAt: now },
        { id: '22222222-2222-4222-8222-222222222222', text: 'completed todo', completed: true, createdAt: now },
      ];
      await page.route(`${API_URL}/todos`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({ json: { todos } });
      });

      await page.goto('/');
      await expect(page.getByTestId('todo-list')).toBeVisible();
      await expect(page.getByTestId('todo-item')).toHaveCount(2);

      await assertNoSeriousA11yViolations(page, testInfo);
    });
    ```

  - [x] Do not seed via the real API (`request.post(...)`) the way the journey specs do — mocking `GET /todos` directly is simpler here (no cleanup/`afterEach` needed) and, per Task 2, is the only reliable way to get a **known, exact** DOM for the scan rather than "known plus whatever else is in the shared DB."

- [x] **Task 4: Initial-load error state scan — Story 3.4's retry UI (AC: #4)**
  - [x] Mock `GET /todos` to return a `500` **before** `page.goto('/')`, so the mount effect's `getTodos()` rejects and the reducer transitions to `status: 'error'` (see [TodoApp.tsx:23-42](../../apps/web/src/components/TodoApp.tsx#L23-L42) → [TodoList.tsx:33-56](../../apps/web/src/components/TodoList.tsx#L33-L56), which renders `data-testid="todo-list-error"` with `role="alert"` and the Retry button):

    ```ts
    test('@P1 @A11y initial-load error state (retry UI) has zero critical/serious violations', async ({
      page,
    }, testInfo) => {
      await page.route(`${API_URL}/todos`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({
          status: 500,
          json: { statusCode: 500, error: 'Internal Server Error', message: 'boom' },
        });
      });

      await page.goto('/');
      await expect(page.getByTestId('todo-list-error')).toBeVisible();

      await assertNoSeriousA11yViolations(page, testInfo);
    });
    ```

  - [x] The exact error-detail message text does not matter for this test (the axe scan checks structure/ARIA/contrast, not copy) — any well-formed `ErrorResponseSchema`-shaped 500 body is sufficient to reach the error state.

- [x] **Task 5: Toast-visible state scan — Story 3.2's mutation-failure toast (AC: #5)**
  - [x] Two-step mock: (a) `GET /todos` returns one seeded item so a mutation target exists, (b) the DELETE for that item's id returns `500`, which drives `handleDelete`'s rollback + `dispatch({ type: 'errorShown', ... })` → visible Toast (see [TodoApp.tsx:200-244](../../apps/web/src/components/TodoApp.tsx#L200-L244), [Toast.tsx](../../apps/web/src/components/Toast.tsx)):

    ```ts
    test('@P1 @A11y toast-visible state (mutation failure) has zero critical/serious violations', async ({
      page,
    }, testInfo) => {
      const seed = {
        id: '33333333-3333-4333-8333-333333333333',
        text: 'a11y-scan-seed',
        completed: false,
        createdAt: '2026-07-05T00:00:00.000Z',
      };
      await page.route(`${API_URL}/todos`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({ json: { todos: [seed] } });
      });
      await page.route(`${API_URL}/todos/${seed.id}`, async (route) => {
        await route.fulfill({
          status: 500,
          json: { statusCode: 500, error: 'Internal Server Error', message: 'boom' },
        });
      });

      await page.goto('/');
      const row = page.getByTestId('todo-item').filter({ hasText: seed.text });
      await row.getByTestId('todo-item-delete').click();
      await expect(page.getByTestId('toast-root')).toBeVisible();

      await assertNoSeriousA11yViolations(page, testInfo);
    });
    ```

  - [x] Delete (not toggle) is the deliberate trigger here — it needs no follow-up assertion on reverted checkbox state, keeping the test focused on "toast is open," not re-testing Story 2.7/3.2's own behavior (already covered by `TodoApp.test.tsx` and `journey-2-returning-session.spec.ts`).
  - [x] Toast auto-dismisses after 5000ms (`Toast.tsx`'s `duration={5000}`, per [deferred-work.md](./deferred-work.md) 3.6 review note on the same timing). The scan runs immediately after the toast becomes visible — do not add any `waitFor`/sleep between visibility and the scan; there is no timing budget concern here since axe's `analyze()` resolves well under 5s.

- [x] **Task 6: Cross-browser pass (AC: #7) — no new code, verification only**
  - [x] `playwright.config.ts` already defines all 3 projects (chromium, firefox, webkit) — running `npm run test:e2e` with no `--project` filter exercises all 4 new tests × 3 browsers = 12 runs. Confirm all 12 pass; do not add browser-specific `test.skip()` conditionals unless a genuine, unavoidable engine difference in axe's own DOM analysis surfaces (unlikely — axe-core operates on the rendered DOM, not engine-specific paint).

- [x] **Task 7: Update `apps/web/e2e/README.md` (no scope creep into Story 4.2's territory)**
  - [x] In "Where the tests live" ([README.md:38-43](../../apps/web/e2e/README.md#L38-L43)), add `accessibility.spec.ts` (P1-013) to the inventory sentence.
  - [x] In "What is NOT covered yet" ([README.md:60-76](../../apps/web/e2e/README.md#L60-L76)), the existing bullet reads `P1-013 / P1-014 — axe-core scans + keyboard traversal.` **Split it**: remove P1-013 (this story closes it) but keep P1-014 listed as still-uncovered (`P1-014 — keyboard traversal (Story 4.2 territory)`) — P1-014 is explicitly Story 4.2's scope, not this one's. Do not remove or reword any other bullet in that list.
  - [x] The "Tagging convention" section ([README.md:45-52](../../apps/web/e2e/README.md#L45-L52)) already lists `@A11y` as an example tag — no edit needed there; this story's tests are the first to actually use it.

- [x] **Task 8: Verify**
  - [x] `npm run lint`, `npm run typecheck` (all workspaces) — clean, 0 warnings.
  - [x] `npm run test` (unit/component, unaffected) — still green; this story touches no production code and no `apps/web/src/**` file.
  - [x] `npm run test:e2e` from the repo root — all pre-existing specs (`xss-payload`, `journey-1-happy-path`, `journey-2-returning-session`) plus the new `accessibility.spec.ts` pass across all 3 browsers.
  - [x] If a scan genuinely reports a `critical`/`serious` violation against **current, unmodified** markup: **do not fix it in this story.** Fixing production code is Story 4.3's exclusive scope (see Dev Notes below). Instead: (1) double-check the failure isn't a test-authoring mistake (wrong route pattern never matching → real DB state leaking through; wrong tag list; scanning before the route/goto race settles), (2) if it's a genuine finding, record the violation id, impact, WCAG criterion, and affected selector in this story's Completion Notes so Story 4.3 can pick it up, and (3) leave the assertion as specified (asserting zero critical/serious) rather than weakening it to make the suite green — a red test that accurately reports a real violation is the correct outcome of this story, not a bug to paper over.

## Dev Notes

### Where this story sits

Epic 4 ("Accessibility Verification") was added 2026-07-05 via Correct Course (see [sprint-change-proposal-2026-07-05.md](../planning-artifacts/sprint-change-proposal-2026-07-05.md)) to close a gap an external acceptance audit found: PRD NFR10–NFR14/FR29–FR33 (WCAG 2.1 AA) are marked "✅ addressed by design" in `architecture.md`, but "addressed by design" (Radix primitives + semantic HTML) was never backed by an automated scan — `@axe-core/playwright` was installed in Story 3.0 as forward-looking scaffolding and never wired into a test. This is that wiring.

| Story | Scope | Relationship to 4.1 |
|---|---|---|
| **4.1 (this story)** | axe-core WCAG AA scans across 4 app states | — |
| 4.2 (backlog) | Keyboard-traversal + focus-order tests | Independent of 4.1; do not add keyboard-traversal assertions here |
| 4.3 (backlog) | Remediate any violations 4.1/4.2 find | Explicitly depends on this story's findings; **do not fix anything here** |
| 4.4 (backlog) | Wire the Playwright e2e suite into CI | Independent of 4.1; today `.github/workflows/ci.yml` runs lint/typecheck/unit-tests only — `test:e2e` is not in CI yet, and adding it is out of scope here |

### Git intelligence (recent commits)

The most recent commit (`8e6a5c8`, Story 3.6) closed out Epic 3 with a test-only, zero-production-code change. This story continues that shape one epic later: `apps/web/e2e/` last changed at `6cebd33` (Story 3.0.1, journey E2E specs) and `bc9d11b`/`f83d8fe` (Story 3.0, harness scaffold + the P0-013 canary) — both purely additive, new-file-only commits under `apps/web/e2e/`, never touching `apps/web/src/**`. This story's commit should follow the identical shape: one new spec file plus a README edit, nothing under `src/`.

### Critical architectural guardrails

- **Zero production-code changes.** This story only adds `apps/web/e2e/accessibility.spec.ts` and edits `apps/web/e2e/README.md`. Do not touch `TodoApp.tsx`, `TodoList.tsx`, `TodoItem.tsx`, `TodoInput.tsx`, `Toast.tsx`, `errors.ts`, `api.ts`, `reducer.ts`, or any Tailwind/CSS file — even if the scan finds something fixable. Same posture as Stories 3.0 and 3.0.1 (E2E-harness stories), and the inverse of 4.3 which exists specifically to make production-code fixes.
- **Zero new dependencies.** `@axe-core/playwright@^4.11.3` is already a devDependency ([package.json:24](../../apps/web/package.json#L24)), installed but unused since Story 3.0. No package.json edit needed. Route-mocking uses Playwright's own `page.route()`/`route.fulfill()` API — no MSW, matching the codebase-wide "no MSW" convention already established in Story 3.6's Dev Notes.
- **Route-mock the API for all 4 states — do not seed via the real DB.** This is the single most important implementation decision in this story. The dev/e2e Postgres instance is shared across all specs and all 3 parallel browser projects; the pre-existing journey specs explicitly design around this by tolerating either DOM state or scoping every locator with a fresh UUID per test. That tolerance is unacceptable for an axe scan that must assert against one specific, known state (e.g., *actually* empty) — so this story mocks `GET /todos` (and, for the toast state, the target `DELETE /todos/:id`) via `page.route()` instead. This also sidesteps any `afterEach` cleanup — nothing in this file ever writes to the real DB.
- **`@axe-core/playwright`'s `AxeBuilder` API** (confirmed against the installed `node_modules/@axe-core/playwright/dist/index.d.ts` for `4.11.3`): `new AxeBuilder({ page }).withTags(string | string[]).analyze(): Promise<AxeResults>`. `AxeResults.violations[]` items have `.impact` (`'minor' | 'moderate' | 'serious' | 'critical' | null`), `.id`, `.help`, `.helpUrl`, `.nodes[]`. There is no built-in "fail only on X impact" option on the builder itself — the critical/serious-only gate (AC #6) must be implemented in the test's own assertion logic (the `assertNoSeriousA11yViolations` helper in Task 1), by filtering `results.violations` after `analyze()` returns.
- **Known risk areas the scan may (legitimately) flag** — from [deferred-work.md](./deferred-work.md), pre-existing and known before this story: (1) `TodoItem`'s `role="checkbox"` `<button>` nested inside `<li>` — flagged there as an *AT double-announcement* concern, which axe-core generally cannot detect (it's a semantics/announcement issue, not a static rule violation) — do not expect or chase this via axe; (2) the global `:focus-visible` ring ([globals.css:24](../../apps/web/src/app/globals.css#L24)) uses a hardcoded `#2563eb`, already justified by the same file's comment as meeting WCAG contrast math in both light/dark — axe's `color-contrast` rule scans rendered text/background pairs, not the focus ring itself, so this is unlikely to trigger a finding either way. Mentioned here so a finding in either area is evaluated on its own merits, not assumed to be a test bug.
- **This story's tests may legitimately fail on first run** if a real critical/serious violation exists in current markup — see Task 8's last bullet for how to handle that without scope creep into Story 4.3.

### Out-of-scope (do NOT do in this story)

- Any fix to production code, regardless of what the scan finds (Story 4.3's job).
- Keyboard-traversal, focus-order, or `:focus-visible` computed-style assertions (Story 4.2's job — this story is axe-core structural/ARIA/contrast scanning only).
- Any `.github/workflows/ci.yml` edit (Story 4.4's job — `test:e2e` is not run in CI today; this story doesn't change that).
- Seeding test data via the real API/DB the way `journey-*.spec.ts` do — route-mock instead (see guardrails above).
- Removing the `P1-014` line from `README.md`'s "What is NOT covered yet" — only `P1-013` closes in this story.

### Project Structure Notes

```text
apps/web/
└── e2e/
    ├── accessibility.spec.ts   # ← NEW: 4 tests (empty/populated/error/toast states), P1-013
    └── README.md               # ← edited: inventory + "not covered yet" list updated
```

No other files change. Alignment: follows the exact `apps/web/e2e/*.spec.ts` convention established in Story 3.0 ([playwright.config.ts](../../apps/web/playwright.config.ts) `testDir: './e2e'`), and the `@axe-core/playwright` usage the same story's README already anticipated tagging for (`@A11y`).

### Testing Requirements

- **E2E tests:** `apps/web/e2e/accessibility.spec.ts` — 4 new tests, tagged `@P1 @A11y`, run across chromium/firefox/webkit via the existing `playwright.config.ts` projects. Mandatory per AC #1–#7.
- **Unit/component/integration tests:** none added or modified — this story touches no `apps/web/src/**`, no `apps/api/**`, no `packages/shared/**` file.
- **Test runner:** Playwright `^1.59.1` (already configured), `@axe-core/playwright ^4.11.3` (already installed, previously unused).
- **Coverage gate:** none in v1.

### References

- [epics.md:1301-1336](../planning-artifacts/epics.md#L1301-L1336) — Story 4.1 full AC text (source of truth for this story).
- [sprint-change-proposal-2026-07-05.md](../planning-artifacts/sprint-change-proposal-2026-07-05.md) — why Epic 4 exists, the audit finding, and the stakeholder decisions (fix violations within Epic 4; wire CI within Epic 4) that scope 4.1 vs. 4.3 vs. 4.4.
- [prd.md:321-350](../planning-artifacts/prd.md#L321-L350) — FR29-FR33 and NFR10-NFR14, the requirements this story verifies.
- [architecture.md:838](../planning-artifacts/architecture.md#L838) — "NFR10–NFR14 (WCAG 2.1 AA) ✅ — Radix primitives... focus-visible... aria-checked... 44×44 tap targets" — the "addressed by design" claim this story turns into "verified by test."
- `apps/web/e2e/playwright.config.ts` — 3 browser projects, `webServer` auto-spawn, `baseURL` — read directly; no changes needed.
- `apps/web/e2e/journey-1-happy-path.spec.ts`, `journey-2-returning-session.spec.ts`, `xss-payload.spec.ts` — existing spec conventions (API_URL fallback constant, per-test UUID scoping, tag format) — read directly; this story's route-mock approach deliberately diverges from their real-DB-seeding approach for the reason given above.
- `apps/web/src/components/TodoApp.tsx`, `TodoList.tsx`, `Toast.tsx` — read directly to confirm the exact state transitions (`loadStart`/`loadError`/`errorShown`) and test ids (`todo-list-empty`, `todo-list`, `todo-item`, `todo-list-error`, `toast-root`) this story's tests key off of.
- `apps/web/src/lib/errors.ts` — `ErrorResponseSchema`-shaped envelope used for the mocked `500` bodies in Tasks 4/5.
- `node_modules/@axe-core/playwright/dist/index.d.ts` — confirmed `AxeBuilder` API surface for the installed `4.11.3` (no version drift risk; already pinned).
- [deferred-work.md](./deferred-work.md) — pre-existing known a11y risk notes (checkbox/`<li>` nesting, focus-ring contrast) referenced under "Known risk areas" above.
- `apps/web/e2e/README.md` — current "not covered yet" list; edited by Task 7.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

None — no failures encountered. All 12 new tests (4 states × 3 browsers) passed on first run with zero critical/serious violations; no genuine axe findings surfaced, so no Story 4.3 hand-off notes are needed.

### Completion Notes List

- Implemented exactly per the story's prescribed code (Task 1's helper, Tasks 2–5's tests) — no deviations from the spec.
- `npm run lint` clean (0 warnings) and `npm run typecheck` clean across all 3 workspaces (shared/api/web).
- `npm run test` (unit/component/integration): 154/154 passed, no regressions — this story touches no `apps/web/src/**` file.
- `npx playwright test` (full e2e suite, all 3 browsers): 21/21 passed — the 3 pre-existing specs (`xss-payload`, `journey-1-happy-path`, `journey-2-returning-session`) plus the new `accessibility.spec.ts`'s 4 tests × 3 browsers = 12, all green.
- No critical/serious axe violations found against current markup in any of the 4 states (empty, populated, initial-load error, toast-visible) — nothing to hand off to Story 4.3.
- Zero production-code changes; zero new dependencies (`@axe-core/playwright@^4.11.3` was already installed since Story 3.0).

### File List

- `apps/web/e2e/accessibility.spec.ts` (new)
- `apps/web/e2e/README.md` (modified)

### Review Findings

_Code review 2026-07-05 — 3 adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Acceptance Auditor: 7/7 ACs PASS, all guardrails + out-of-scope prohibitions honored, zero scope creep. Reviewer re-ran the suite: 12/12 green (4 states × chromium/firefox/webkit), each ~1–2.3 s. 0 decision-needed, 0 patch, 1 defer, 6 dismissed._

- [x] [Review][Defer] Toast 5s auto-dismiss can race the axe scan under slow CI [apps/web/e2e/accessibility.spec.ts:126] — deferred, monitored flake risk (empirically ~5× margin: toast tests finish in ~1–2.3 s vs the `duration={5000}` window; no waitFor/sleep added per spec Task 5).

**Dismissed (6):**
- _(Edge, rated Critical) Cross-origin `route.fulfill` omits `Access-Control-Allow-Origin` → mocked GET CORS-blocked → 3 tests fail_ — **empirically false.** Reviewer ran all 12 tests across chromium/firefox/webkit; every test reaches its intended DOM state (empty list / 2 items / visible toast), not the error fallback. Playwright `route.fulfill` is not subject to browser CORS enforcement.
- _(Edge+Blind) DELETE mock has no method guard → preflight fulfilled with 500 → offline toast instead of mapped-500 toast_ — premise depends on the falsified CORS mechanism; code matches spec Task 5 verbatim (handler intentionally fulfills all methods); AC #5 only requires a visible toast for the a11y scan, message-agnostic.
- _(Blind, rated Medium) moderate/minor WCAG violations logged but not failing → under-enforces WCAG AA_ — by design, exactly per AC #6 (only critical/serious fail; moderate/minor attached). Blind Hunter had no spec.
- _(Blind) Exact-string route match has no query-string tolerance_ — `getTodos` fetches `${API_URL}/todos` with no query string ([api.ts:19](../../apps/web/src/lib/api.ts#L19)); matches empirically. Brittleness note only, no defect.
- _(Blind, self-labeled "no current defect") attachment name derived from `violation.id` could collide_ — axe returns one entry per rule id per scan; no collision possible in current usage.
- _(Edge) `API_URL` env coupling is coincidental_ — both the spec fallback and the web bundle default to `http://localhost:4000`; mirrors the established `xss-payload.spec.ts` fallback pattern, no defect.

## Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-05 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. New `apps/web/e2e/accessibility.spec.ts` — 4 route-mocked states (empty/populated/error/toast) scanned via `@axe-core/playwright`'s `AxeBuilder` (`wcag2a`+`wcag2aa` tags); critical/serious violations fail the test, moderate/minor are logged as attachments only. Zero production-code changes, zero new dependencies. `apps/web/e2e/README.md` updated to close P1-013 (P1-014 remains listed, Story 4.2's scope). First story in Epic 4 — epic status backlog → in-progress. |
| 2026-07-05 | Dev-Story: implemented `apps/web/e2e/accessibility.spec.ts` verbatim per spec — shared `assertNoSeriousA11yViolations` helper + 4 route-mocked state tests (empty/populated/error/toast). Zero critical/serious violations found in any state. lint/typecheck clean; unit tests 154/154 green (no regressions, no `src/**` changes); full e2e suite 21/21 green across chromium/firefox/webkit. `apps/web/e2e/README.md` updated to close P1-013 (P1-014 retained, Story 4.2's scope). Zero production-code changes, zero new deps. Status: ready-for-dev → review. |
