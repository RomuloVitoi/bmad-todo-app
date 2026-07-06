# Story 4.3: Remediate any violations found

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the product itself,
I want any critical/serious WCAG violations surfaced by Stories 4.1/4.2 fixed,
so that "zero critical WCAG violations" is actually true, not just tested-for.

## Acceptance Criteria

1. **Given** Stories 4.1 and 4.2's suites, **when** first run against the current codebase, **then** any `critical`/`serious` findings are triaged and documented (violation, WCAG success criterion, affected component/file).
2. **Given** a triaged violation, **when** a fix is implemented, **then** it follows existing architecture patterns (Radix primitives, Tailwind, no new dependencies unless explicitly justified and documented).
3. **Given** all triaged violations are fixed, **when** Stories 4.1 and 4.2's suites are re-run, **then** zero `critical`/`serious` violations remain.
4. **Given** no violations are found on the first run, **when** this story is reviewed, **then** it is marked done as a no-op, with that finding documented in the story's completion notes.

_(ACs verbatim from [epics.md:1373-1395](../planning-artifacts/epics.md#L1373-L1395).)_

## ⚠️ Read this before starting: this story is very likely a no-op

Both prerequisite stories already ran their full suites against the exact codebase this story starts from, and **found zero violations to hand off**:

- **Story 4.1** ([4-1-automated-axe-core-wcag-aa-scans-across-app-states.md](./4-1-automated-axe-core-wcag-aa-scans-across-app-states.md), Completion Notes): _"No critical/serious axe violations found against current markup in any of the 4 states (empty, populated, initial-load error, toast-visible) — nothing to hand off to Story 4.3."_
- **Story 4.2** ([4-2-keyboard-traversal-and-focus-order-tests.md](./4-2-keyboard-traversal-and-focus-order-tests.md), Completion Notes): _"...no findings to hand off to Story 4.3."_

No `apps/web/src/**` file has changed since either story's suite last ran (verify with `git log --oneline -- apps/web/src` against the commits below). **You must still execute Task 1** (re-run both suites) to satisfy AC #1's "when first run against the current codebase" literally — do not skip the run and assume the prior result still holds. But go in expecting AC #4 (no-op) to be the outcome, not AC #2/#3 (fix a violation). Do not manufacture work: do not "improve" or "harden" the component code, do not act on the pre-existing deferred items listed below — none of them are AC-#1-scoped findings.

## Tasks / Subtasks

- [x] **Task 1: Re-run Stories 4.1 and 4.2's suites against the current codebase (AC: #1)**
  - [x] `npm run test:e2e` from repo root (or scoped: `npm --workspace apps/web run test:e2e -- --grep "@A11y|@Keyboard"`) — runs `accessibility.spec.ts` (Story 4.1) and `keyboard-traversal.spec.ts` (Story 4.2) across all 3 browser projects (chromium, firefox, webkit).
  - [x] Confirm the full e2e suite is green (36/36 as of Story 4.2's last run: 21 pre-existing + 15 keyboard-traversal). Any red `@A11y` or `@Keyboard` test is a candidate finding — see Task 2 before treating it as one.

- [x] **Task 2: Triage any failures as a genuine finding vs. a test/environment issue (AC: #1)**
  - [x] If everything is green: **there is nothing to triage.** Skip to Task 5 (no-op path).
  - [ ] If something fails: first rule out non-violation causes — dev server not running / stale `webServer` cache, a flaky/dormant issue already logged in [deferred-work.md](./deferred-work.md)'s "Deferred from: code review of story-4.1" and "...story-4.2" sections (e.g. the toast 5s-auto-dismiss race, the retry-test call-count coupling — these are test-robustness risks, not accessibility defects), or a genuine environment problem (Postgres/API not up).
  - [ ] Only if a failure reproduces consistently against unmodified `apps/web/src/**` markup, record it as a **triaged violation**: violation description, axe rule id or keyboard-behavior description, WCAG success criterion, impact (`critical`/`serious` only — this story's scope, per AC #1, is bounded to what 4.1/4.2's suites themselves flag as critical/serious; `moderate`/`minor` axe findings are explicitly out of scope per Story 4.1 AC #5), and the affected component/file.
  - [ ] Document every triaged violation in this story's Completion Notes List before writing any fix.

- [x] **Task 3: Fix each triaged violation (AC: #2) — only runs if Task 2 found something** _(N/A — Task 2 found zero failures; no violation to fix)_
  - [ ] _(N/A — not executed, no violation triaged)_ Fix using existing patterns only: Radix primitives (`@radix-ui/react-checkbox`, `@radix-ui/react-toast` — already in use in [TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx) and [Toast.tsx](../../apps/web/src/components/Toast.tsx)), Tailwind utility classes matching the existing `outline-none focus-visible:ring-2 focus-visible:ring-current/40` convention used across `TodoItem.tsx`, `TodoList.tsx`'s Retry button, and `Toast.tsx`'s dismiss button.
  - [ ] _(N/A — not executed, no violation triaged)_ **No new dependencies** unless a fix is genuinely impossible with the existing stack — if one is added, name it and justify it explicitly in Completion Notes (this is the one guardrail in this whole epic that permits an exception, and only with documentation).
  - [ ] _(N/A — not executed, no violation triaged)_ Keep each fix minimal and scoped to the specific violation — do not refactor surrounding code, do not touch components the violation doesn't implicate.

- [x] **Task 4: Re-run the suites to confirm the fix (AC: #3) — only runs if Task 3 ran** _(N/A — Task 3 did not run)_
  - [ ] _(N/A — Task 3 did not run)_ `npm run test:e2e` again, full 3-browser run. Confirm the previously-failing test(s) now pass and nothing else regressed.
  - [ ] _(N/A — Task 3 did not run)_ `npm run test` (unit/component) and `npm run typecheck` / `npm run lint` across all workspaces — a production-code change in this story must not break existing coverage.

- [x] **Task 5: No-op path — mark done with findings documented (AC: #4)**
  - [x] If Task 1/2 found nothing (the expected outcome): write into Completion Notes that both suites were re-run against the current codebase, passed with zero critical/serious violations, and that this story closes as a no-op per AC #4 — cite the specific commit/run.
  - [x] Do not add any code, test, or config change in the no-op path. There is nothing to commit under `apps/web/src/**`, `apps/web/e2e/**`, or elsewhere for this story if Task 1 is clean.

- [x] **Task 6: Verify**
  - [x] `npm run lint`, `npm run typecheck` (all workspaces) — clean.
  - [x] `npm run test` (unit/component) — unaffected unless Task 3 touched `apps/web/src/**`.
  - [x] `npm run test:e2e` — full suite green, all 3 browsers.
  - [x] Do **not** edit `apps/web/e2e/README.md` in this story — its "Where the tests live" / "What is NOT covered yet" sections were already fully closed out by Stories 4.1/4.2 for P1-013/P1-014; there is no README line item that names Story 4.3.

### Review Findings

- [x] [Review][Patch] Task 3/4 parent checkboxes marked `[x]` while every nested sub-bullet is left `[ ]` — inconsistent checkbox semantics that could read as 0% done to a checkbox-only scanner [4-3-remediate-any-violations-found.md: Task 3/Task 4 blocks]
- [x] [Review][Patch] sprint-status.yaml's top header `last_updated` comment (line 2) still reads "in-progress" after the story advanced to "review" — stale relative to the authoritative `last_updated` comment further down the file [sprint-status.yaml:2]

## Dev Notes

### Where this story sits

Epic 4 ("Accessibility Verification") was added 2026-07-05 via Correct Course (see [sprint-change-proposal-2026-07-05.md](../planning-artifacts/sprint-change-proposal-2026-07-05.md)). Stories 4.1 and 4.2 are the *detection* half (axe-core structural/ARIA/contrast scans; keyboard traversal/focus-order/operability). This story is the *remediation* half — but detection found nothing to remediate.

| Story | Scope | Status |
|---|---|---|
| 4.1 (done) | axe-core WCAG AA scans, 4 states | Zero critical/serious violations found |
| 4.2 (done) | Keyboard traversal, focus order, operability | Zero findings to hand off |
| **4.3 (this story)** | Remediate whatever 4.1/4.2 found | Almost certainly a no-op — see warning above |
| 4.4 (backlog) | Wire the Playwright e2e suite into CI | Independent; not this story's concern |

### Why this is scoped so narrowly

This story's AC #1 explicitly bounds triage to "Stories 4.1 and 4.2's suites" — not a fresh, open-ended accessibility audit. `deferred-work.md` has several pre-existing, already-known, already-ratified a11y-adjacent items that were deliberately **not** turned into 4.1/4.2 test assertions (and therefore are not this story's job):

- `role="checkbox"` `<button>` nested inside `<li>` may double-announce in some screen readers ([deferred-work.md:54](./deferred-work.md), [TodoItem.tsx:34-53](../../apps/web/src/components/TodoItem.tsx#L34-L53)) — untested either direction, axe cannot detect it, no story has ever asserted against it.
- Focus-visible ring at `ring-current/40` opacity may have weak contrast against same-color borders in non-default themes ([deferred-work.md:53](./deferred-work.md)) — the app only ships default-foreground styling today; theming is out of scope.
- No skip-link for keyboard users ([deferred-work.md:212](./deferred-work.md)) — an architecture-level addition, not an AC violation for any shipped story.
- Toast's `<li>` root and dismiss button were not asserted via `hasVisibleFocusIndicator` in Story 4.2's Escape test ([deferred-work.md](./deferred-work.md), "Deferred from: code review of story-4.2") — this is a **test coverage gap**, not a proven violation; do not treat "untested" as "broken."

**Do not act on any of the above in this story.** They were each explicitly deferred by name during Epic 3/4 code reviews with a documented rationale. If Task 1's suite runs surface a *new*, reproducible, suite-asserted `critical`/`serious` failure, that is this story's job — the pre-existing deferred list is not.

### If a fix is genuinely needed (contingency only)

Should Task 1 actually turn something up, the existing focus-ring/ARIA conventions to match are:

- **Focus-visible indicator pattern:** `outline-none focus-visible:ring-2 focus-visible:ring-current/40` — used identically on the checkbox, delete button, Retry button, and toast dismiss button (see [TodoItem.tsx](../../apps/web/src/components/TodoItem.tsx), [TodoList.tsx:50](../../apps/web/src/components/TodoList.tsx#L50), [Toast.tsx:36](../../apps/web/src/components/Toast.tsx#L36)). The global `:focus-visible` outline in [globals.css:22-31](../../apps/web/src/app/globals.css#L22-L31) is the fallback for elements that don't set `outline-none` (only `TodoInput`'s submit button relies on it — see Story 4.2 Dev Notes for the full breakdown).
- **Non-color state signaling:** `data-completed` attribute on `<li>` + strikethrough text (`line-through opacity-60`) + Radix `Checkbox` semantics already convey completed state without color — this is what NFR12/FR32 map to; a violation here would be a Radix/ARIA wiring bug, not a missing feature.
- **Tap targets:** all interactive elements are `h-11 w-11` (44px) already, matching NFR14.
- **Component test split convention:** presentational assertions go in `TodoItem.test.tsx`/`TodoList.test.tsx`; state-transition assertions go in `TodoApp.test.tsx` (established since Story 3.3/3.4).

### Out-of-scope (do NOT do in this story)

- Fixing anything not surfaced as a `critical`/`serious` finding by Stories 4.1/4.2's actual suites (see "Why this is scoped so narrowly" above).
- `moderate`/`minor` axe findings — Story 4.1's own AC #5 says these are logged as annotations, not failures; they are not "violations" for this story's purposes either.
- Any `.github/workflows/ci.yml` edit (Story 4.4's job).
- Editing `apps/web/e2e/README.md` — already fully updated by 4.1/4.2; nothing about this story belongs there.
- Adding new tests — this story consumes 4.1/4.2's existing suites as the detection mechanism, it does not add new ones.

### Project Structure Notes

```text
apps/web/
├── e2e/
│   ├── accessibility.spec.ts        # Story 4.1 — run, not modified
│   └── keyboard-traversal.spec.ts   # Story 4.2 — run, not modified
└── src/components/
    ├── TodoItem.tsx                 # only touched if Task 3 finds a violation here
    ├── TodoList.tsx                 # only touched if Task 3 finds a violation here
    └── Toast.tsx                    # only touched if Task 3 finds a violation here
```

If Task 1 is clean (expected), **no files change** — this story's commit, if any, is documentation-only (this story file's Completion Notes/status).

### Testing Requirements

- **E2E tests:** re-run `apps/web/e2e/accessibility.spec.ts` and `apps/web/e2e/keyboard-traversal.spec.ts` (Story 4.1/4.2's existing suites) across chromium/firefox/webkit. No new spec files.
- **Unit/component tests:** only run/affected if Task 3 makes a production-code change.
- **Test runner:** Playwright `^1.59.1` and Vitest (already configured). No new devDependency expected.
- **Coverage gate:** none in v1.

### References

- [epics.md:1373-1395](../planning-artifacts/epics.md#L1373-L1395) — Story 4.3 full AC text (source of truth).
- [sprint-change-proposal-2026-07-05.md](../planning-artifacts/sprint-change-proposal-2026-07-05.md) — why Epic 4 exists; stakeholder decision to fix violations within Epic 4 rather than deferring.
- [4-1-automated-axe-core-wcag-aa-scans-across-app-states.md](./4-1-automated-axe-core-wcag-aa-scans-across-app-states.md) — Completion Notes confirm zero findings handed off.
- [4-2-keyboard-traversal-and-focus-order-tests.md](./4-2-keyboard-traversal-and-focus-order-tests.md) — Completion Notes confirm zero findings handed off; Dev Notes document the exact focus-ring/outline mechanics per component.
- [deferred-work.md](./deferred-work.md) — pre-existing, already-ratified a11y-adjacent items that are explicitly NOT this story's scope (see "Why this is scoped so narrowly" above).
- [prd.md:321-350](../planning-artifacts/prd.md#L321-L350) — FR29-FR33, NFR10-NFR14 — the requirements Stories 4.1-4.3 jointly verify.
- [architecture.md:838](../planning-artifacts/architecture.md#L838) — "NFR10–NFR14 (WCAG 2.1 AA) ✅" — the claim this epic turns from "addressed by design" into "verified by test, and true."
- `apps/web/src/components/TodoItem.tsx`, `TodoList.tsx`, `Toast.tsx` — read directly for exact current focus-ring/ARIA patterns to match if a fix is ever needed.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npm run test:e2e` (full 3-browser run, commit `72b1f75a2adb8fe9f43730d24d4a99fb7d2f9e4b`): 36/36 passed — all `@A11y` (`accessibility.spec.ts`, Story 4.1) and `@Keyboard` (`keyboard-traversal.spec.ts`, Story 4.2) tests green across chromium/firefox/webkit, alongside the pre-existing journey/xss specs.
- `git log --oneline -- apps/web/src` confirms the most recent change to `apps/web/src/**` is commit `8e6a5c8` (Story 3.6), which predates both Story 4.1 (`c387dac`) and Story 4.2 (`72b1f75`) — the re-run in this story is against the exact same markup Stories 4.1/4.2 already scanned/traversed.
- `npm run lint` — clean (no errors/warnings).
- `npm run typecheck` — clean across `packages/shared`, `apps/api`, `apps/web`.
- `npm run test` — 183/183 passed (`packages/shared` 25/25, `apps/api` unit 4/4, `apps/web` 154/154). No regressions.

### Completion Notes List

- **AC #1** (triage): Re-ran Stories 4.1 and 4.2's suites (`accessibility.spec.ts`, `keyboard-traversal.spec.ts`) against the current codebase via `npm run test:e2e`. Result: **36/36 passed**, zero `@A11y`/`@Keyboard` failures across chromium, firefox, and webkit. Nothing to triage — Task 2's "everything is green" branch applies.
- **AC #4** (no-op): Since the re-run surfaced zero critical/serious violations, this story closes as a **no-op**, consistent with both Story 4.1's and Story 4.2's Completion Notes ("nothing to hand off to Story 4.3"). `apps/web/src/**` has not changed since commit `8e6a5c8` (Story 3.6) — before either detection story ran — so this is a genuine re-verification against the same markup, not a stale assumption.
- **AC #2/#3**: Not applicable — no triaged violation existed to fix or re-verify (Tasks 3 and 4 correctly did not execute).
- No new dependencies, no production-code changes, no test/spec changes, no README changes (per Task 6's explicit prohibition — `apps/web/e2e/README.md`'s P1-013/P1-014 line items were already closed by Stories 4.1/4.2).
- Full regression check: lint clean, typecheck clean, unit/component tests 183/183 green, full e2e suite 36/36 green across all 3 browsers.
- This story's only diff is this story file itself (Tasks/Subtasks checkboxes, Dev Agent Record, Change Log, Status) plus the corresponding `sprint-status.yaml` status transition — there is nothing to commit under `apps/web/src/**` or `apps/web/e2e/**`.

### File List

No source, test, or config files were added, modified, or deleted. Files touched by this story:

- `_bmad-output/implementation-artifacts/4-3-remediate-any-violations-found.md` (this story file — Tasks/Subtasks, Dev Agent Record, Change Log, Status)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition: ready-for-dev → in-progress → review)

## Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-05 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Stories 4.1 and 4.2 (both done) each independently confirmed zero critical/serious findings to hand off — this story is scoped to re-run their suites against the current codebase (AC #1) and is very likely to close as a no-op (AC #4); AC #2/#3 (fix + re-verify) only apply if that re-run surfaces something new. Explicitly out of scope: the pre-existing a11y-adjacent items already ratified/deferred in `deferred-work.md` (checkbox double-announcement risk, ring-opacity contrast on non-default themes, missing skip-link, toast dismiss-button focus-indicator test gap) — none of these are suite-asserted critical/serious findings. |
| 2026-07-05 | Status: ready-for-dev → in-progress → review (Dev-Story: re-ran Stories 4.1/4.2's e2e suites (`accessibility.spec.ts` + `keyboard-traversal.spec.ts`) against the current codebase — 36/36 passed across chromium/firefox/webkit, zero critical/serious violations; `apps/web/src/**` unchanged since commit `8e6a5c8` (Story 3.6), predating both detection stories, confirming this is a genuine re-verification not a stale assumption; story closes as a **no-op** per AC #4 — nothing to triage, fix, or re-verify (AC #2/#3 N/A); lint/typecheck clean; full regression suite 183/183 unit + 36/36 e2e green; zero production-code changes, zero new deps, zero test/README changes). |
| 2026-07-05 | Status: review → done (Code-Review: 3 parallel adversarial layers; Acceptance Auditor independently re-executed `test:e2e`/`lint`/`typecheck`/`test`/`git log` and confirmed full compliance — all 4 ACs verified against real execution, all guardrails upheld (no new deps, no production-code changes, no new tests, README/deferred-work.md/ci.yml untouched); 0 decision-needed; 2 patches applied — both documentation-only: Task 3/4 sub-bullets annotated `(N/A — not executed)` for checkbox-scan clarity, sprint-status.yaml's stale top-header `last_updated` comment resynced to "review"; 0 defers; 14 dismissed — Blind Hunter's headline "commit hash mismatch" refuted (full SHA vs. its own 7-char abbreviation, same commit) + 12 others (misread checkboxes, meta-commentary on the prior Create-Story step's phrasing, or pre-existing project conventions predating this diff) + Edge Case Hunter's "Status left at review not done" (correct BMAD sequencing — this step sets done); zero code changes, confirming the no-op closure is genuine). |
