# Sprint Change Proposal — todo-app

**Date:** 2026-07-05
**Author:** Romulo (via Correct Course workflow)
**Status:** Approved

---

## Section 1: Issue Summary

An acceptance-criteria audit of the shipped v1 product (covering Phase 1-2 deliverables, working CRUD, test coverage, E2E tests, Docker deployment, accessibility, documentation, and framework comparison) found that the **"Accessibility — Zero critical WCAG violations"** deliverable is unverified, not proven.

**Discovery context:** Not a single dev story — this surfaced from an external audit against a delivered-product checklist. The closest related story is **3-0 (Playwright E2E harness)**, which installed `@axe-core/playwright` as forward-looking scaffolding but never wired an actual scan into a test.

**Evidence:**
- `apps/web/package.json` — `@axe-core/playwright` devDependency present, unused in any spec.
- `apps/web/e2e/README.md` — explicitly lists "P1-013 / P1-014 — axe-core scans + keyboard traversal" under "What is NOT covered yet."
- `_bmad-output/test-artifacts/test-design-architecture.md` — the test-design phase planned P1-013/P1-014 (axe-core scans + keyboard traversal, tied to risk R-013, gate = "0 WCAG AA violations"), but this plan was never carried into epics.md as concrete story acceptance criteria.
- PRD NFR10–NFR14 and FR29–FR33 (WCAG 2.1 AA, keyboard operability, non-color state, contrast, tap-target sizing) are marked "✅ addressed by design" in `architecture.md`, but "addressed by design" (Radix primitives, semantic HTML) is not the same as "verified by test."

**Root cause classification:** A known-deferred test-design item that fell through the epic→story translation — not a new stakeholder requirement, not a misunderstanding of original scope, not a strategic pivot.

---

## Section 2: Impact Analysis

**Epic Impact:**
- Epic 3 (Failure Resilience & Recovery, containing trigger story 3-0) is fully `done` and does **not** require reopening — Story 3-0's actual acceptance criteria only required installing the harness and a canary XSS test, which it did. The gap is scope that was never assigned to any epic, not a defect in Epic 3.
- No existing epic (1, 2, or 3) requires modification.
- **New Epic 4 (Accessibility Verification) is added** to close the gap.

**Story Impact:**
- No existing stories (1-1 through 3-6) require changes.
- 4 new stories added under Epic 4 (4.1–4.4), detailed in Section 4.

**Artifact Conflicts:**
- **PRD:** None. NFR10–NFR14 / FR29–FR33 already specify the target; no requirement text changes needed.
- **Architecture:** None structurally. Minor traceability note recommended: `architecture.md`'s "Nice-to-have gaps" bullet on a11y audit gates (written pre-Story-3.0, mentions "lighthouse-ci") should be annotated to reflect that axe-core (already installed) is the actual chosen tool, and Epic 4 is what executes on it.
- **UI/UX:** No dedicated UX spec exists for this project (by design). Epic 4 is primarily test-writing but may surface real violations requiring component fixes (see Story 4.3).
- **Testing/CI:** `apps/web/e2e/README.md` needs updating once 4.1/4.2 land (remove "not covered yet" language). More significantly, `.github/workflows/ci.yml` currently runs only lint/typecheck/unit-tests — **the Playwright e2e suite is not run in CI at all today**, a pre-existing gap this proposal also closes (Story 4.4), so the new accessibility tests are durably enforced rather than only run manually.

**Technical Impact:** Low. No new runtime dependencies (axe-core tooling already installed). Possible component-level fixes in Story 4.3 depending on scan findings — expected to be small given Radix UI primitives are already used for interactive elements. CI workflow gains a new e2e stage requiring Postgres provisioning + browser install, adding to pipeline duration.

---

## Section 3: Recommended Approach

**Selected approach: Direct Adjustment (Option 1)** — add Epic 4 within the existing plan structure, following the same story format as Epics 1–3.

**Rationale:**
- Rollback (Option 2) is not applicable — nothing needs to be undone; Epic 3 shipped correctly against its own narrower scope.
- MVP/PRD scope reduction (Option 3) is not applicable — this closes an existing requirement rather than changing what's in scope.
- Direct Adjustment is low-effort (tooling already installed, no architecture changes) and low-risk (test-only additions plus targeted remediation).

**Effort estimate:** Low–Medium. **Risk:** Low. **Timeline impact:** Additive; does not block or reopen any shipped work.

**Decisions confirmed with stakeholder (Romulo):**
1. If axe-core scans surface real critical/serious violations, **fix them within Epic 4** (Story 4.3) rather than deferring — so the epic actually delivers "zero critical WCAG violations," not just a report.
2. **Wire the Playwright e2e suite into CI** (Story 4.4) as part of this epic, since it currently isn't run there at all.

---

## Section 4: Detailed Change Proposals

### New Epic: Epic 4 — Accessibility Verification

> The application's accessibility claims (NFR10–NFR14, FR29–FR33) move from "addressed by design" to "verified by automated tests." Every app state is scanned for WCAG 2.1 AA violations via axe-core, keyboard operability is proven via traversal tests, any violations found are fixed, and the whole suite runs in CI so regressions are caught automatically going forward.

**FRs covered:** FR29, FR30, FR31, FR32 (verification of existing implementation)
**Key NFRs:** NFR10, NFR11, NFR12, NFR13, NFR14

#### Story 4.1: Automated axe-core WCAG AA scans across app states

As a reviewer of the v1 product for accessibility compliance,
I want automated axe-core scans against every distinct UI state,
So that NFR10 (WCAG 2.1 AA) is verified automatically, not just designed for.

**Acceptance Criteria:**

**Given** `apps/web/e2e/accessibility.spec.ts`,
**When** the file is created,
**Then** it uses `@axe-core/playwright`'s `AxeBuilder` configured with the `wcag2a` and `wcag2aa` tags.

**Given** the app in its empty-list state,
**When** the axe scan runs,
**Then** zero violations of impact `critical` or `serious` are reported.

**Given** the app in its populated state (seeded mix of active/completed todos),
**When** the axe scan runs,
**Then** zero `critical`/`serious` violations are reported.

**Given** the app's initial-load error state (Story 3.4's retry UI),
**When** the axe scan runs against it,
**Then** zero `critical`/`serious` violations are reported.

**Given** a Toast is visible (Story 3.2's mutation-failure toast),
**When** the axe scan runs with the toast open,
**Then** zero `critical`/`serious` violations are reported.

**Given** axe reports violations of impact `moderate` or `minor`,
**When** the test evaluates results,
**Then** they are logged as test annotations but do NOT fail the test — only `critical`/`serious` findings fail it.

**Given** `accessibility.spec.ts`,
**When** run across the 3 existing browser projects (chromium, firefox, webkit),
**Then** all pass.

#### Story 4.2: Keyboard-traversal and focus-order tests

As a keyboard-only user,
I want every interactive element reachable and operable via keyboard alone, with visible focus indicators,
So that FR30, FR31, and NFR11 are verified end-to-end, not just at the component-test level.

**Acceptance Criteria:**

**Given** the populated list state,
**When** a user tabs from the input through the page,
**Then** focus order is: input → submit button → each row's checkbox → its delete button → next row, matching DOM order.

**Given** a checkbox has keyboard focus,
**When** Space is pressed,
**Then** the todo's completed state toggles (end-to-end proof of Story 2.6's component-level behavior).

**Given** a delete button has keyboard focus,
**When** Enter is pressed,
**Then** the item is removed (end-to-end proof of Story 2.7's behavior).

**Given** the Retry button is visible (error state),
**When** it has keyboard focus and Enter is pressed,
**Then** a retry is triggered (end-to-end proof of Story 3.4's behavior).

**Given** a Toast is visible,
**When** the user presses Escape,
**Then** it is dismissed via keyboard (end-to-end proof of Story 3.1's behavior).

**Given** any interactive element receives keyboard focus,
**When** inspected,
**Then** a visible `:focus-visible` indicator is present (asserted via computed style, not just DOM focus).

**Given** the full keyboard-traversal spec,
**When** run across chromium, firefox, and webkit,
**Then** all pass with no reliance on mouse/pointer events.

#### Story 4.3: Remediate any violations found

As the product itself,
I want any critical/serious WCAG violations surfaced by Stories 4.1/4.2 fixed,
So that "zero critical WCAG violations" is actually true, not just tested-for.

**Acceptance Criteria:**

**Given** Stories 4.1 and 4.2's suites,
**When** first run against the current codebase,
**Then** any `critical`/`serious` findings are triaged and documented (violation, WCAG success criterion, affected component/file).

**Given** a triaged violation,
**When** a fix is implemented,
**Then** it follows existing architecture patterns (Radix primitives, Tailwind, no new dependencies unless explicitly justified and documented).

**Given** all triaged violations are fixed,
**When** Stories 4.1 and 4.2's suites are re-run,
**Then** zero `critical`/`serious` violations remain.

**Given** no violations are found on the first run,
**When** this story is reviewed,
**Then** it is marked done as a no-op, with that finding documented in the story's completion notes.

#### Story 4.4: Wire Playwright e2e suite into CI

As a maintainer,
I want the Playwright e2e suite (including the new accessibility tests) to run automatically on every PR,
So that accessibility and journey regressions are caught before merge, not just when someone remembers to run `test:e2e` locally.

**Acceptance Criteria:**

**Given** `.github/workflows/ci.yml`,
**When** updated,
**Then** a new step runs `npm run test:e2e` after the existing lint/typecheck/unit-test steps.

**Given** the e2e suite needs Postgres + the API + the web app running,
**When** CI executes this step,
**Then** it provisions Postgres (service container or docker compose), runs migrations, and starts both apps before invoking Playwright — mirroring `scripts/dev.sh`'s sequencing.

**Given** Playwright requires browser binaries,
**When** the workflow runs,
**Then** it includes a `playwright install --with-deps` step (cached across runs where possible).

**Given** the e2e job fails,
**When** a PR is opened,
**Then** the PR check is marked failed, same as the existing lint/typecheck/test gates.

**Given** the e2e job completes,
**When** inspected,
**Then** the `playwright-report` artifact is uploaded via `actions/upload-artifact` for debugging failed runs.

**Given** a push to `main`,
**When** CI runs,
**Then** e2e tests execute identically to the PR path (no special-casing).

---

## Section 5: Implementation Handoff

**Change scope classification: Minor** — new epic fits within existing architecture and patterns, no PRD/architecture rewrite needed, no rollback of shipped work.

**Routed to:** Developer agent (Amelia / `bmad-dev-story`), via the standard `bmad-create-story` → `bmad-dev-story` flow, same as Epics 1–3.

**Responsibilities:**
- Create Story 4.1 file via `bmad-create-story`, implement via `bmad-dev-story`, review via the standard code-review workflow — repeat for 4.2, 4.3, 4.4 in order (4.3 depends on findings from 4.1/4.2; 4.4 is independent and could be parallelized).
- No PM/Architect escalation needed; no PRD or architecture document edits required beyond the optional traceability annotation noted in Section 2.

**Success criteria:**
- `apps/web/e2e/accessibility.spec.ts` and a keyboard-traversal spec exist and pass across all 3 browsers.
- Zero critical/serious axe violations across empty/populated/error/toast states.
- `ci.yml` runs the e2e suite (including these new tests) on every PR and on `main`.
- `apps/web/e2e/README.md` no longer lists P1-013/P1-014 as uncovered.

**Artifacts modified by this proposal:**
- `_bmad-output/planning-artifacts/epics.md` — Epic 4 + Stories 4.1–4.4 appended.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `epic-4` and its 4 stories added with status `backlog`.
