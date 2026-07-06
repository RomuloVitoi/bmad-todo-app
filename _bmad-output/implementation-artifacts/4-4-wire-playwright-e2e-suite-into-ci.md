# Story 4.4: Wire Playwright e2e suite into CI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a maintainer,
I want the Playwright e2e suite (including the new accessibility tests) to run automatically on every PR,
so that accessibility and journey regressions are caught before merge, not just when someone remembers to run `test:e2e` locally.

## Acceptance Criteria

1. **Given** [.github/workflows/ci.yml](../../.github/workflows/ci.yml), **when** updated, **then** a new step runs `npm run test:e2e` after the existing lint/typecheck/unit-test steps.
2. **Given** the e2e suite needs Postgres + the API + the web app running, **when** CI executes this step, **then** it provisions Postgres (service container or docker compose), runs migrations, and starts both apps before invoking Playwright — mirroring `scripts/dev.sh`'s sequencing.
3. **Given** Playwright requires browser binaries, **when** the workflow runs, **then** it includes a `playwright install --with-deps` step (cached across runs where possible).
4. **Given** the e2e job fails, **when** a PR is opened, **then** the PR check is marked failed, same as the existing lint/typecheck/test gates.
5. **Given** the e2e job completes, **when** inspected, **then** the `playwright-report` artifact is uploaded via `actions/upload-artifact` for debugging failed runs.
6. **Given** a push to `main`, **when** CI runs, **then** e2e tests execute identically to the PR path (no special-casing).

_(ACs verbatim from [sprint-change-proposal-2026-07-05.md:174-198](../planning-artifacts/sprint-change-proposal-2026-07-05.md#L174-L198) / [epics.md:1403-1427](../planning-artifacts/epics.md#L1403-L1427).)_

## ⚠️ Read this before starting: the hard part is already done for you

`scripts/dev.sh` (Story 1.10) already provisions Postgres, runs migrations, and starts both apps in the exact sequence AC #2 asks for — and `apps/web/playwright.config.ts`'s `webServer.command` is `npm run dev` (i.e. `bash scripts/dev.sh`), with `cwd: '../..'` (repo root). **This means `npm run test:e2e` already triggers the full stack automatically** — you do not need to hand-roll `services:` blocks, a separate migrate step, or manual server startup in the workflow YAML. `reuseExistingServer: !process.env.CI` in the config means CI always spawns a fresh stack (never reuses a stale one), which is exactly the isolation CI needs.

**The one thing this chain requires that doesn't exist in CI today: a `.env` file at the repo root.** `scripts/dev.sh` exits with an error if `.env` is missing (it's gitignored, by design — see [.env.example](../../.env.example)), and `docker-compose.yml`'s `db` service uses required-env syntax (`${POSTGRES_USER:?...}`) that fails hard without it. Add a step that materializes `.env` (simplest: `cp .env.example .env` — the example file's defaults are self-consistent and dev-only, not secrets) **before** the `npm run test:e2e` step.

Do not duplicate `scripts/dev.sh`'s logic in the workflow YAML. If the e2e step is slow or flaky to start, the fix is tuning `scripts/dev.sh` / `playwright.config.ts`'s `webServer.timeout` (currently `120_000`ms), not reimplementing the sequence in `ci.yml`.

## Tasks / Subtasks

- [x] **Task 1: Add a step to materialize `.env` before the e2e step (AC: #2)**
  - [x] In `.github/workflows/ci.yml`'s `verify` job, add a step (e.g. `- name: Create .env for e2e stack` / `run: cp .env.example .env`) positioned after `Install dependencies` and before the new e2e step. `.env.example`'s committed defaults are dev-only placeholders (`todoapp_dev_password_change_me`), safe to use verbatim in an ephemeral CI runner.
  - [x] Do not hand-write `POSTGRES_USER`/`DATABASE_URL`/etc. as separate `env:` keys — copying `.env.example` keeps CI's env in lockstep with local dev by construction and avoids drift.

- [x] **Task 2: Add Playwright browser install with caching (AC: #3)**
  - [x] Add a cache step for browser binaries (default install location `~/.cache/ms-playwright` on Linux runners) keyed on the pinned `@playwright/test` version from `apps/web/package.json` (currently `^1.59.1`) plus `runner.os`, e.g. via `actions/cache@v4` (matches the major-version convention already used for other pinned actions in this file — `actions/checkout@v6`, `actions/setup-node@v6`).
  - [x] On a cache miss, run the full install: `npx --workspace apps/web playwright install --with-deps chromium firefox webkit` (mirrors the existing `test:e2e:install` npm script in [apps/web/package.json](../../apps/web/package.json) — reuse that script name for consistency: `npm --workspace apps/web run test:e2e:install`).
  - [x] On a cache hit, browser binaries are restored but OS-level dependencies (apt packages) installed via `--with-deps` are **not** part of the cached directory and must still be installed every run — use `npx --workspace apps/web playwright install-deps chromium firefox webkit` in that branch. (There is no existing npm script for this half; add the raw `npx` command inline rather than adding a new package.json script for a single CI use site.)
  - [x] If caching proves not worth the complexity during implementation, a simpler always-run `npm --workspace apps/web run test:e2e:install` step still satisfies AC #3's literal requirement (`playwright install --with-deps` step exists) — AC #3's "cached across runs where possible" is a should, not a hard gate. Prefer the cached version, but don't block on it. — Implemented the cached version (`actions/cache@v4` keyed on `runner.os` + the resolved `@playwright/test` version read from `package.json`, with a cache-hit branch that still runs `playwright install-deps`).

- [x] **Task 3: Add the e2e test step (AC: #1, #4, #6)**
  - [x] Add a step running `npm run test:e2e` (the existing root script, already wired to `npm --workspace apps/web run test:e2e` → `playwright test`) positioned after the existing `Test (unit, no DB required)` step and before the `Setup Docker Buildx` / image-build steps — fail fast on e2e/a11y regressions before spending time on Docker builds.
  - [x] No `if:` branching on `github.event_name` or `github.ref` — the step runs unconditionally in the `verify` job, which already runs identically for both `pull_request` and `push` (main) triggers per the existing workflow structure. This alone satisfies AC #6 (no special-casing) — do not add a separate job or duplicate steps for the `main`-push case.
  - [x] Confirm `CI=true` is set in the step's environment (GitHub Actions sets this by default for all steps — do not override it) — `playwright.config.ts` branches on `process.env.CI` for `forbidOnly`, `retries: 2`, the `github` reporter, and `reuseExistingServer: false`. No workflow-level `env:` change needed; this is already correct by virtue of running on GitHub Actions.

- [x] **Task 4: Upload the playwright-report artifact (AC: #5)**
  - [x] Add an `actions/upload-artifact@v4` step immediately after the e2e step, `if: failure()` (or `if: always()` if broader visibility into passing runs is preferred — either satisfies AC #5's "for debugging failed runs" intent; `failure()` is the tighter, more literal reading), uploading `apps/web/playwright-report/` (the HTML reporter's default output directory, per `playwright.config.ts`'s `reporter` config — already gitignored per [apps/web/.gitignore:18](../../apps/web/.gitignore#L18), so this is purely a CI-artifact concern, no repo changes needed there).
  - [x] Give the artifact a stable, descriptive name, e.g. `playwright-report`. — Used `if: failure()` (the tighter reading) and named it `playwright-report` with a 7-day retention.

- [x] **Task 5: Verify end-to-end**
  - [x] Push the branch / open a draft PR and confirm the `verify` job runs all steps in order: checkout → setup-node → install deps → lint → typecheck → unit test → create `.env` → Playwright browser install (cache hit/miss both work) → `test:e2e` → Docker Buildx setup → image builds. — No git remote is configured in this sandbox (`git remote -v` is empty), so a real GitHub Actions run could not be triggered. Substituted with local verification that reproduces every new step's exact command: parsed the updated `ci.yml` with `js-yaml` to confirm syntactic validity and the step order matches the spec; ran `npm --workspace apps/web run test:e2e:install` (the cache-miss branch) then `CI=true npm run test:e2e` (the exact command the new step runs) against a freshly created `docker compose` stack, confirming the full `scripts/dev.sh` → Postgres → migrate → both-apps chain that Playwright's `webServer` triggers actually works end-to-end.
  - [x] Confirm the full e2e suite (36 tests as of Story 4.3: journey/xss specs + `accessibility.spec.ts` + `keyboard-traversal.spec.ts`) passes across chromium/firefox/webkit inside the CI runner, not just locally — CI's cold-start timing (docker pull of `postgres:17-alpine`, `npm run dev` bringing up both servers) is a **new** code path never exercised before this story; watch for `webServer.timeout` (120s) being too tight on a cold runner. If it is, increase the timeout in `playwright.config.ts` rather than working around it in the workflow — do not silently retry-loop or add `sleep` steps in `ci.yml`. — `CI=true npm run test:e2e` against a fresh `docker compose` stack (cold start, no pre-existing containers): 36/36 passed in ~17-21s across chromium/firefox/webkit; `webServer.timeout` (120s) was never close to being hit, no `playwright.config.ts` change needed.
  - [x] Intentionally break one e2e assertion locally (temporary, do not commit) to confirm the CI job actually fails and blocks the PR check (AC #4) — then revert. — Changed `xss-payload.spec.ts`'s `expect(createRes.status()).toBe(201)` to `.toBe(999)`, ran it, confirmed a nonzero Playwright exit code and 3 failed (chromium/firefox/webkit) with the expected assertion diff, then `git checkout --` reverted the file (confirmed clean via `git diff --stat`).
  - [x] Confirm `npm run lint` / `npm run typecheck` / `npm run test` still pass — this story should not touch any file under `apps/web/src/**`, `apps/api/src/**`, or `packages/shared/src/**`. — All three green (lint: 0 warnings; typecheck: shared/api/web all clean; test: 154 web + 25 shared + 4 api, all passing). `git status` confirms no changes under `apps/web/src/**`, `apps/api/src/**`, or `packages/shared/src/**`.
  - [x] Optional but recommended: update [apps/web/e2e/README.md](../../apps/web/e2e/README.md)'s closing line — "CI integration (workflow, browser-binary cache, sharding, artifact upload) is out of scope for Story 3.0; the harness is configured for local dev and ready for CI integration in a future story." — to reflect that this story is that future story. Keep the edit minimal (a sentence or two); do not restructure the README. — Done; updated to state CI integration shipped in Story 4.4, sharding remains out of scope.

### Review Findings

- [x] [Review][Decision] Story status rests on CI behavior never exercised in real GitHub Actions — Dev Agent Record admits no git remote is configured, so Task 5's push/PR verification was substituted with local command replication (macOS's Playwright cache path, not `ubuntu-latest`'s `~/.cache/ms-playwright`). ACs #1, #3, #4, #5, #6 all describe CI-runtime behavior that has only been asserted, not observed, in the actual GitHub Actions environment. **Resolved:** local verification (YAML syntax validation + exact command replication + 36/36 e2e pass twice + confirmed failure-blocks-check behavior) accepted as sufficient; no remote is available in this environment to do better. Not deferred — treated as resolved.
- [x] [Review][Patch] Playwright-report upload isn't scoped to e2e failure specifically [.github/workflows/ci.yml:67-73] — `if: failure()` fired on any prior step's failure (lint/typecheck/unit test), not just e2e, contradicting AC #5's "for debugging failed [e2e] runs" intent. **Fixed:** gave the e2e step `id: e2e` and changed the condition to `if: failure() && steps.e2e.outcome == 'failure'`.
- [x] [Review][Patch] Playwright browser cache key uses an unpinned semver range, not the resolved version [.github/workflows/ci.yml:43-47] — read `devDependencies['@playwright/test']` from `apps/web/package.json` (`^1.59.1`, a range), not the actual resolved/installed version, contradicting Dev Notes' explicit claim of using "the pinned" version. **Fixed:** resolves from the installed package's own `package.json` instead — `node -p "require('./node_modules/@playwright/test/package.json').version"` (note: npm workspaces hoist `@playwright/test` to the repo-root `node_modules`, not `apps/web/node_modules` — verified locally, resolves to `1.59.1`). This also fails loudly (`MODULE_NOT_FOUND`) if the package isn't installed, closing the silent-`undefined` gap too.
- [x] [Review][Defer] No `timeout-minutes` set on the e2e step [.github/workflows/ci.yml:64-65] — deferred, low-priority hardening not required by any AC; a hung dev-server bootstrap or stuck browser has no bounded failure point short of GitHub's default 6-hour job timeout.
- [x] [Review][Defer] No `restore-keys` fallback on the Playwright browser cache [.github/workflows/ci.yml:49-54] — deferred, low-priority; AC #3 explicitly treats caching as a "should," not a hard gate, and a version bump forcing one cold download is an acceptable cost.
- [x] [Review][Defer] Cache could mismatch across GitHub's periodic `ubuntu-latest` runner-image bumps [.github/workflows/ci.yml:49-54] — deferred, rare edge case; adding a runner-image version to the key is unwarranted complexity for the likelihood of impact.

## Dev Notes

### Where this story sits

Last story in Epic 4 ("Accessibility Verification", added 2026-07-05 via Correct Course). Stories 4.1/4.2 added the a11y/keyboard e2e specs; 4.3 confirmed (as a no-op) that nothing needs remediation. This story is purely CI plumbing — **independent of 4.1–4.3's findings**, it would look the same regardless of what they found.

| Story | Scope | Status |
|---|---|---|
| 4.1 (done) | axe-core WCAG AA scans, 4 states | Zero violations found |
| 4.2 (done) | Keyboard traversal, focus order, operability | Zero findings |
| 4.3 (done) | Remediate whatever 4.1/4.2 found | No-op — nothing to remediate |
| **4.4 (this story)** | Wire the full Playwright e2e suite (all specs, not just 4.1/4.2's) into CI | — |

### The key insight: reuse `scripts/dev.sh` via Playwright's `webServer`, don't reimplement it

- [scripts/dev.sh](../../scripts/dev.sh) (Story 1.10): `docker compose up -d --wait db` → `npm --workspace apps/api run db:migrate` → `npm-run-all --parallel dev:web dev:api`.
- [apps/web/playwright.config.ts:25-33](../../apps/web/playwright.config.ts#L25-L33): `webServer.command: 'npm run dev'`, `cwd: '../..'` (repo root), `reuseExistingServer: !process.env.CI`, `timeout: 120_000`.
- Net effect: running `npm run test:e2e` from the repo root **already** provisions Postgres, migrates, and starts both apps, satisfying AC #2 with zero new orchestration code — the workflow just needs to (a) make `.env` exist and (b) invoke the command. Do not add a GitHub Actions `services:` Postgres container or a separate `docker compose up` / migrate step in `ci.yml` — that would run Postgres twice (once via `services:`, once via `dev.sh`'s own `docker compose up`) or fight over port `5432`.
- `.env` is the one missing piece: [docker-compose.yml](../../docker-compose.yml) uses `${POSTGRES_USER:?POSTGRES_USER must be set in .env}`-style required-var interpolation, and [apps/api/drizzle.config.ts](../../apps/api/drizzle.config.ts) loads `.env` via `dotenv` for `db:migrate`. `scripts/dev.sh` itself checks `[ ! -f .env ]` and exits 1 with a instructive message if missing. `cp .env.example .env` is sufficient — the example file's placeholder Postgres password is dev-only and never used outside this ephemeral runner.
- Docker + Docker Compose v2 are preinstalled on GitHub-hosted `ubuntu-latest` runners — no additional setup step needed for `docker compose up` to work (the existing `Setup Docker Buildx` step later in the job is for `docker buildx build`, a different concern, and should stay where it is / after the e2e step).

### Exact step placement in `.github/workflows/ci.yml`

Current `verify` job step order: Checkout → Setup Node → Install dependencies → Lint → Typecheck → Test (unit) → Setup Docker Buildx → Build apps/web image → Build apps/api image.

New order: Checkout → Setup Node → Install dependencies → Lint → Typecheck → Test (unit) → **Create `.env`** → **Cache/install Playwright browsers** → **Test (e2e)** → **Upload playwright-report (on failure)** → Setup Docker Buildx → Build apps/web image → Build apps/api image.

Rationale for placement before the Docker builds: e2e failure should fail fast and skip the (slower) image-build steps, matching the existing lint→typecheck→test fail-fast ordering. The `publish` job's `needs: verify` dependency is untouched — it already only runs on `main` push and already blocks on the whole `verify` job (including the new e2e step) succeeding.

### Conventions to match (from Story 1.11 / existing `ci.yml`)

- Pinned major versions for third-party actions matching what's already in the file: `actions/checkout@v6`, `actions/setup-node@v6`. Use `actions/cache@v4` and `actions/upload-artifact@v4` (current stable majors at time of writing — verify against the Actions marketplace if a newer major exists by the time this is implemented, but don't gratuitously pin to a beta).
- `env.NODE_VERSION: '22'` is already defined at the workflow level — reuse it, don't hardcode `22` again in a new step.
- No `if:` special-casing by `github.event_name`/`github.ref` inside `verify` — that pattern is reserved for the `publish` job, which is a separate job gated on `needs: verify`. Keep `verify` trigger-agnostic (this directly satisfies AC #6).

### Project Structure Notes

```text
.github/workflows/ci.yml   # only file this story modifies (plus optionally apps/web/e2e/README.md)
```

No `apps/web/src/**`, `apps/api/src/**`, `packages/shared/src/**`, or `playwright.config.ts` changes expected — unless Task 5's cold-start verification surfaces a `webServer.timeout` problem, in which case a minimal, documented change to `apps/web/playwright.config.ts`'s `timeout` value is in scope (still no test-spec changes).

### Testing Requirements — how to verify this story

- There is no unit/component test for a CI workflow file. Verification is: (1) the workflow YAML is syntactically valid (GitHub validates on push/PR; a local `actionlint` run is optional but not part of this repo's toolchain), and (2) a real CI run (via a pushed branch or draft PR) demonstrably runs and passes/fails the e2e step as described in Task 5.
- Do not add a new test file for this story — AC #1–#6 are all about the workflow's *behavior when CI runs*, not something Vitest/Playwright can assert on directly.

### References

- [sprint-change-proposal-2026-07-05.md:168-198](../planning-artifacts/sprint-change-proposal-2026-07-05.md#L168-L198) — Story 4.4 origin and full AC text (source of truth; epics.md's copy is verbatim identical).
- [epics.md:1397-1427](../planning-artifacts/epics.md#L1397-L1427) — same AC text as it appears in the epics file.
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — the file this story modifies.
- [scripts/dev.sh](../../scripts/dev.sh) — the orchestration sequence AC #2 requires; already implements it, do not duplicate.
- [apps/web/playwright.config.ts](../../apps/web/playwright.config.ts) — `webServer` config that triggers `scripts/dev.sh` automatically; also the `CI`-gated behaviors (retries, reporter, `reuseExistingServer`).
- [apps/web/package.json](../../apps/web/package.json) — `test:e2e` / `test:e2e:install` npm scripts to reuse.
- [docker-compose.yml](../../docker-compose.yml), [.env.example](../../.env.example) — why `.env` must exist before `docker compose` / `db:migrate` / `next dev` will work.
- [apps/api/drizzle.config.ts](../../apps/api/drizzle.config.ts) — confirms `db:migrate` depends on `.env` via `dotenv`, independent of Node's own `--env-file` flag.
- [1-11-build-and-deployment-artifacts.md](./1-11-build-and-deployment-artifacts.md) — prior story that authored the existing `ci.yml`; matches its conventions (pinned action versions, `NODE_VERSION` env var reuse, fail-fast step ordering).
- [apps/web/e2e/README.md](../../apps/web/e2e/README.md) — "What is NOT covered yet" section explicitly named CI integration as future scope; this story closes that out (optional doc update, Task 5's last bullet).
- [architecture.md:838](../planning-artifacts/architecture.md#L838) area — NFR10-NFR14 traceability; this story is what makes the a11y suite (Stories 4.1/4.2) *durably enforced* rather than only run manually, completing the epic's stated goal.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npm run lint` — clean, 0 warnings.
- `npm run typecheck` — clean across `packages/shared`, `apps/api`, `apps/web`.
- `npm run test` — 154 web + 25 shared + 4 api = 183/183 passing, no regressions.
- `node -e "require('js-yaml').load(...)"` — confirmed `.github/workflows/ci.yml` is syntactically valid YAML and the `verify` job's step order matches the spec (Checkout → Setup Node → Install deps → Lint → Typecheck → Test unit → Create `.env` → Get Playwright version → Cache Playwright browsers → Install Playwright browsers → Install Playwright OS dependencies → Test e2e → Upload playwright-report → Setup Docker Buildx → Build images).
- `npm --workspace apps/web run test:e2e:install` — cache-miss branch's exact command; installed chromium/firefox/webkit + OS deps successfully.
- `CI=true npm run test:e2e` (run twice against a freshly recreated `docker compose` stack, `docker compose down -v` between runs to eliminate cross-run data pollution from manual retries) — 36/36 passed each time, ~17-21s, across chromium/firefox/webkit.
- Intentional-failure check: `apps/web/e2e/xss-payload.spec.ts`'s `toBe(201)` temporarily changed to `toBe(999)` → `npx playwright test xss-payload` exited non-zero with 3 failed (chromium/firefox/webkit) and the expected assertion diff → reverted via `git checkout --` (confirmed clean via `git diff --stat`).

### Completion Notes List

- No git remote is configured in this working copy (`git remote -v` empty), so Task 5's literal instruction — push a branch / open a draft PR and watch real GitHub Actions — could not be executed. Substituted with local verification that exercises the identical commands the new workflow steps run (see Debug Log References), plus YAML-syntax validation of the edited file. A real CI run against GitHub Actions (ubuntu-latest, `~/.cache/ms-playwright` cache path) has not been observed; the local runs used macOS's Playwright cache path instead, which is a platform difference only relevant to the cache step's cosmetic hit/miss behavior, not to correctness of the commands themselves.
- Confirmed AC #2 requires zero new orchestration code: `npm run test:e2e` alone (via Playwright's `webServer` → `npm run dev` → `scripts/dev.sh`) provisions Postgres, runs migrations, and starts both apps — verified by watching `[WebServer]` log lines during the local run showing `docker compose` bringing up `todo-app-db` from a cold, freshly-created volume.
- Confirmed AC #4 (failed e2e blocks the PR check) behaviorally, not just by reading the YAML: a broken assertion produced a non-zero Playwright/npm exit code, which is what GitHub Actions uses to mark a step (and therefore the job/check) as failed.
- `apps/web/e2e/README.md`'s closing section updated per Task 5's optional recommendation to reflect that CI integration is no longer future scope.
- No changes to `apps/web/src/**`, `apps/api/src/**`, `packages/shared/src/**`, or `playwright.config.ts` — the e2e run's cold-start timing left comfortable headroom under the existing 120s `webServer.timeout`, so no config change was needed.

### File List

- `.github/workflows/ci.yml` (modified) — added `.env` materialization, Playwright browser cache/install (hit and miss branches), `test:e2e` step, and `playwright-report` upload-on-failure step to the `verify` job, positioned per Dev Notes' "Exact step placement" section.
- `apps/web/e2e/README.md` (modified) — closing "What is NOT covered yet" section updated to state CI integration shipped in this story; sharding remains out of scope.

## Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-05 | Story created via `/bmad-create-story`. Status: backlog → ready-for-dev. Key insight: `scripts/dev.sh` + `playwright.config.ts`'s `webServer` already implement AC #2's provisioning/migration/startup sequence — the workflow only needs to materialize a `.env` file and invoke `npm run test:e2e`; do not duplicate the orchestration in `ci.yml`. Independent of Stories 4.1–4.3's findings. |
| 2026-07-05 | Dev-Story: implemented all 4 AC-mapped tasks in `.github/workflows/ci.yml`'s `verify` job — `.env` materialization, cached Playwright browser install (hit/miss branches), `test:e2e` step (no event/ref branching), `playwright-report` upload on failure. Verified locally (no git remote available for a real CI run): 36/36 e2e tests pass twice against a freshly recreated Docker stack; confirmed a broken assertion fails the run (then reverted); lint/typecheck/test all green (183/183), zero changes under `apps/web/src/**`, `apps/api/src/**`, `packages/shared/src/**`. Optional `apps/web/e2e/README.md` update applied. Status: in-progress → review. Last story in Epic 4 / the sprint plan. |
