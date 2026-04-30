# Story 3.0: Playwright E2E test harness + canary stored-XSS test

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the test-architecture team,
I want a Playwright + axe-core E2E harness scaffolded into [apps/web/e2e/](../../apps/web/e2e/) with one runnable canary test (P0-013 stored-XSS),
so that ASR-1 from [test-design-architecture.md:67](../test-artifacts/test-design-architecture.md#L67) ("Playwright + `@axe-core/playwright` for E2E") is finally executed and Epic 3 stories that depend on real-browser tests (P0-024 Journey 3, P1-013/P1-014 a11y + keyboard, P1-024 Toast `.message`) have a working harness to extend.

## Acceptance Criteria

1.  **Given** [apps/web/playwright.config.ts](../../apps/web/playwright.config.ts) — newly created,
    **When** the file is inspected,
    **Then** it imports `defineConfig`, `devices` from `@playwright/test`,
    **And** sets `testDir: './e2e'`,
    **And** sets `fullyParallel: true`,
    **And** sets `forbidOnly: !!process.env.CI` (catches stray `.only` in PRs),
    **And** sets `retries: process.env.CI ? 2 : 0`,
    **And** sets `reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]]`,
    **And** sets `use.baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'` (default-with-override; matches the web dev port from [scripts/dev.sh:25](../../scripts/dev.sh#L25)),
    **And** sets `use.trace: 'on-first-retry'` and `use.video: 'retain-on-failure'` (cheap on local, useful on CI without exploding artifact size),
    **And** declares THREE projects — `chromium` / `firefox` / `webkit` — each spreading `devices['Desktop {Chromium|Firefox|Safari}']` (matches [test-design-qa.md:325](../test-artifacts/test-design-qa.md#L325) "All E2E + axe-core across Chromium / Firefox / WebKit via Playwright projects"),
    **And** sets `webServer: { command: 'npm run dev', cwd: '../..', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI, timeout: 120_000, stdout: 'ignore', stderr: 'pipe' }` (Playwright auto-starts the full dev stack — Postgres + API + web — when the dev server isn't already running; reuses the developer's running stack when it is; `cwd: '../..'` resolves to the repo root from `apps/web/`).

2.  **Given** [apps/web/package.json](../../apps/web/package.json),
    **When** the diff is inspected,
    **Then** `devDependencies` gains `@playwright/test` (latest stable @^1.x at install time) and `@axe-core/playwright` (latest stable @^4.x; loaded for future a11y scenarios but NOT used in this story's canary test),
    **And** `scripts` gains:
    - `"test:e2e": "playwright test"` (runs all browsers, headless),
    - `"test:e2e:ui": "playwright test --ui"` (interactive debug runner; opt-in for local diagnosis),
    - `"test:e2e:install": "playwright install --with-deps chromium firefox webkit"` (developer/CI bootstrap; downloads browser binaries — these are NOT npm packages and are NOT in `node_modules`),
    **And** the existing `test` script (Vitest unit/component) is unchanged — `test` and `test:e2e` are deliberately separate (Vitest hits jsdom, Playwright hits real browsers; running Vitest's `test` must NOT trigger Playwright).

3.  **Given** the root [package.json](../../package.json),
    **When** the diff is inspected,
    **Then** `scripts` gains `"test:e2e": "npm --workspace apps/web run test:e2e"` (thin alias mirroring the existing per-tier pattern of `test:web` / `test:api` / `test:shared` at [package.json:15-18](../../package.json#L15-L18)),
    **And** the existing `test` script is unchanged — running `npm run test` from root still runs ONLY the unit/integration suites (Vitest + node:test), NOT Playwright (E2E is opt-in via `npm run test:e2e`; this matches [deferred-work.md:115](./deferred-work.md#L115)'s warning that the `test:*` glob will silently absorb future scripts and the Story 1.10 spec's "no DB required" contract for `npm run test`).

4.  **Given** [apps/web/e2e/xss-payload.spec.ts](../../apps/web/e2e/xss-payload.spec.ts) — newly created,
    **When** the file is inspected,
    **Then** it implements P0-013 verbatim per [test-design-qa.md:435-448](../test-artifacts/test-design-qa.md#L435-L448),
    **And** the test is tagged `@P0` `@Security` in its title (matches [test-design-qa.md:429-431](../test-artifacts/test-design-qa.md#L429-L431) "Run by tag" pattern),
    **And** the spec defines `const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'` at module scope (Playwright's `baseURL` is the WEB origin used by `page.goto`; API calls via `request.*` need an absolute URL because the API runs on a different port — see Dev Notes "Why a separate API_URL constant"),
    **And** the test:
    - creates a todo via `request.post(`${API_URL}/todos`, { data: { text: '<script>window.__xss__ = true</script>' }, headers: { 'x-request-id': randomUUID() } })` (uses Playwright's built-in `request` fixture per [Playwright docs](https://playwright.dev/docs/api-testing) — NOT the `@seontechnologies/playwright-utils` `apiRequest` fixture from [test-design-qa.md:391](../test-artifacts/test-design-qa.md#L391); future stories may adopt that fixture, but it adds an extra dep and this story keeps the harness minimal),
    - asserts `createRes.status() === 201` (the Story 2.1 contract per [todos.ts:67](../../apps/api/src/routes/todos.ts#L67)),
    - extracts `created = await createRes.json()` and saves `created.id` for cleanup,
    - calls `await page.goto('/')` (resolves to `baseURL + /` = `http://localhost:3000/`),
    - waits for the populated list to render via `await expect(page.getByTestId('todo-list')).toBeVisible()` (uses the existing [TodoList.tsx:66](../../apps/web/src/components/TodoList.tsx#L66) `data-testid="todo-list"` shipped by Story 1.9),
    - asserts the payload renders as VISIBLE TEXT: `await expect(page.getByText('<script>window.__xss__ = true</script>')).toBeVisible()` (Playwright's `getByText` matches against text-node content, not innerHTML — so a successful match proves the angle-brackets reached the DOM as text, not as a `<script>` element),
    - asserts the payload was NOT executed: `expect(await page.evaluate(() => (window as unknown as { __xss__?: boolean }).__xss__)).toBeUndefined()` (if React's JSX escaping had failed and the browser had executed the injected `<script>`, `window.__xss__` would be `true`),
    - asserts NO `<script>` element with the payload's content exists in the DOM: `expect(await page.locator('script:has-text("__xss__ = true")').count()).toBe(0)` (defense-in-depth — `getByText` could in principle match an attribute or comment; this check pins the structural assertion).

5.  **Given** [apps/web/e2e/xss-payload.spec.ts](../../apps/web/e2e/xss-payload.spec.ts) — same file,
    **When** test isolation is inspected,
    **Then** an `afterEach` hook calls `await request.delete(`${API_URL}/todos/${createdId}`, { headers: { 'x-request-id': randomUUID() } })` to remove the row from Postgres so the dev DB does not accumulate XSS payloads across runs (uses the same `API_URL` constant from AC #4 — same web/API split reason),
    **And** the cleanup tolerates 404 (test failed before insert; not all paths reach the DELETE call — `expect([204, 404]).toContain(deleteRes.status())`),
    **And** the test does NOT depend on a clean DB at start (`getByText(payload)` matches the specific payload regardless of pre-existing rows; the test does NOT assert list length).

6.  **Given** [apps/web/.gitignore](../../apps/web/.gitignore),
    **When** the diff is inspected,
    **Then** the following entries are appended (Playwright artifact dirs — `playwright test` writes here on every run, all are local-developer / CI-output and must NEVER be committed):
    - `/test-results/` — per-test trace.zip, video.webm, screenshot.png on failure,
    - `/playwright-report/` — HTML report from `reporter: ['html']`,
    - `/playwright/.cache/` — internal cache used by `playwright install`,
    - `/blob-report/` — sharded report blobs when CI matrix sharding lands.
    **And** the entries are placed near the existing `/.next/` / `/coverage/` block to group output artifacts.

7.  **Given** [apps/web/e2e/README.md](../../apps/web/e2e/README.md) — newly created (in the `e2e/` directory, NOT the workspace root),
    **When** read by a developer who has never run E2E tests in this repo,
    **Then** it covers — in this order, ≤ 80 lines total:
    1. **Prerequisites:** `npm install` already ran; `npm run test:e2e:install` once per machine to download browser binaries.
    2. **How to run:** `npm run test:e2e` from repo root (auto-starts the dev stack via `webServer` if not already running) OR run `npm run dev` in one terminal first and then `npm run test:e2e` reuses it.
    3. **How to debug:** `npm --workspace apps/web run test:e2e:ui` for the interactive runner; `npx --workspace apps/web playwright show-report` to view the last HTML report.
    4. **Where the tests live:** `apps/web/e2e/*.spec.ts` (one spec per scenario; co-locate journey files when Story 3.6+ lands).
    5. **What is NOT covered yet:** explicit pointer to [test-design-architecture.md:89](../../_bmad-output/test-artifacts/test-design-architecture.md#L89) — only P0-013 is implemented; the remaining 9 E2E scenarios (P0-024 Journey 3, P1-013/P1-014 a11y + keyboard, P1-022 / P1-024 / P1-026 toast/listener, P2-001 disclosure, P2-007 responsive) await dedicated stories.
    6. **Tagging convention:** test titles include `@P0`, `@P1`, `@Security`, `@A11y` etc. tags so future runs can filter via `playwright test --grep @P0`.
    8. **Naming:** `*.spec.ts` (Playwright convention; deliberately distinct from Vitest's `*.test.ts` so a misconfigured `test` script does not double-run them).

8.  **Given** [README.md](../../README.md) — updated,
    **When** the diff is inspected,
    **Then** the **Useful Scripts** table at [README.md:46-50](../../README.md#L46-L50) gains a row:
    | `npm run test:e2e` | Playwright E2E across Chromium / Firefox / WebKit (run `npm --workspace apps/web run test:e2e:install` once first) |
    **And** a new short subsection (≤ 15 lines) titled "End-to-end tests" is added AFTER the **Useful Scripts** table and BEFORE the **Troubleshooting** section, pointing to [apps/web/e2e/README.md](../../apps/web/e2e/README.md) for details and noting that `test:e2e` is intentionally separate from `test` so CI / contributors who do not want browser deps are not forced to install them.

9.  **Given** the harness scaffolding,
    **When** a developer runs `npm install` then `npm --workspace apps/web run test:e2e:install` then `npm run test:e2e` against a clean working tree on a machine where Postgres-via-docker works,
    **Then** the canary XSS test passes against ALL THREE projects (chromium / firefox / webkit) — total 3 test results,
    **And** the test runs in under 30 seconds wall-clock on a developer laptop (the bound is generous; the actual single-spec single-browser run should be ~3-5 s + ~10 s browser cold start),
    **And** the dev stack auto-started by `webServer` is correctly torn down by Playwright when the test run completes (Playwright sends SIGINT to the process group; `scripts/dev.sh`'s `exec` final line per [scripts/dev.sh:38](../../scripts/dev.sh#L38) propagates correctly).

10. **Given** the full sanity gate suite,
    **When** `npm run lint`, `npm run typecheck`, and `npm run test` run from the repo root,
    **Then** all three pass — zero ESLint warnings/errors, zero TypeScript errors, all unit/integration tests still green,
    **And** specifically `npm run test` does NOT run any Playwright spec (separation pinned in AC #3),
    **And** `apps/web/e2e/` is included in the workspace's `tsconfig.json` `include` (or has its own `tsconfig.json` that extends it) so type errors in spec files surface during `npm run typecheck:web` — Playwright tests are first-class TypeScript code, not opaque scripts.

11. **Given** [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs) (or root [eslint.config.mjs](../../eslint.config.mjs) — whichever owns the web rules per [eslint.config.mjs:38-50](../../eslint.config.mjs#L38-L50)),
    **When** the diff is inspected,
    **Then** the existing rules apply to `apps/web/e2e/**/*.{ts,tsx}` files (no new ignore added; Playwright specs are linted like any other web TS),
    **And** if the existing `import` cross-app ban at [eslint.config.mjs:38-50](../../eslint.config.mjs#L38-L50) blocks E2E specs from importing `@todo-app/shared` types (e.g., `Todo` for response typing), the ban is relaxed for `apps/web/e2e/**` ONLY — E2E specs are part of the web tier and may consume the shared contract package the same way `apps/web/src/**` does.

12. **Given** Story 3.0's harness lands,
    **When** Story 3.6 (Journey-level resilience tests) starts, OR any future Epic 3 story extends Playwright coverage,
    **Then** the next dev does NOT need to re-litigate: config location, browser projects, npm script naming, gitignore entries, dev stack orchestration, baseURL resolution, or test naming — all of those are pinned by this story,
    **And** the next story's scope is "add new spec(s) under `apps/web/e2e/`" — additive to the harness, not foundational.

## Tasks / Subtasks

- [x] **Task 1: Add Playwright + axe-core devDeps and scripts to `apps/web/package.json` (AC: #2)**
  - [x] Edit [apps/web/package.json](../../apps/web/package.json). Run `npm install --save-dev --workspace apps/web @playwright/test @axe-core/playwright`. The lockfile updates accordingly; verify `apps/web/package.json` `devDependencies` now contains both with caret ranges (`^1.x` / `^4.x`). Record the EXACT pinned versions in Completion Notes — they should be the latest stable as of 2026-04-30.
  - [x] Add the three scripts in AC #2 — copy verbatim. Order them after the existing `test:watch` script.
  - [x] **Why `@axe-core/playwright` is installed but unused in this story** — Future stories (P1-013 axe-core scan of empty/loading/populated states per [test-design-qa.md:258](../test-artifacts/test-design-qa.md#L258)) need it. Bundling the install with the harness scaffold avoids a "go re-run npm install on every machine" follow-up the moment story 3-7 lands. The package is dev-only and adds no runtime weight.
  - [x] **Why `playwright install --with-deps` (vs. plain `playwright install`)** — `--with-deps` installs the system libraries Playwright needs on Linux (for CI). On macOS / Windows the `--with-deps` flag is harmless (no-op).
  - [x] **Why three browsers (not just chromium)** — Test-design-qa.md:325 explicitly pins all three: "All E2E + axe-core across Chromium / Firefox / WebKit." Webkit catches Safari-only regressions (e.g., `:has()` selector early support, focus-ring quirks) that would slip through chromium-only runs.
  - [x] **Watch-out:** Do NOT add `playwright` (without `@`) as a dep. The legacy `playwright` package is the test-runner-less library; `@playwright/test` is what we want. Many tutorials confuse them.
  - [x] **Watch-out:** Do NOT add Playwright deps to the root `package.json`. Keep them in the web workspace where the tests live; the root `test:e2e` script is a pass-through.

- [x] **Task 2: Add the root-level `test:e2e` alias (AC: #3)**
  - [x] Edit [package.json](../../package.json). Add `"test:e2e": "npm --workspace apps/web run test:e2e"` to `scripts`. Place it directly after the existing `test:web` line.
  - [x] **Watch-out:** Do NOT modify the existing `test` script's glob (`npm-run-all --print-label test:*`). Adding `test:e2e` to the workspace WOULD cause the glob to absorb it, breaking the "no DB required for `npm run test`" contract from [Story 1.10](../planning-artifacts/epics.md#L632) and the explicit warning in [deferred-work.md:115](./deferred-work.md#L115). The `test:*` glob is a known footgun documented there. Either:
    - (a) **Preferred:** rename the new script so it does NOT match `test:*` (NOT chosen here — `test:e2e` is the conventional name), OR
    - (b) **Done in this task:** replace the glob with an explicit list. Edit the root `test` script from `"test": "npm-run-all --print-label test:*"` to `"test": "npm-run-all --print-label test:shared test:api test:web"` (explicit allow-list; new tiers must be opted in deliberately). This is the fix [deferred-work.md:115](./deferred-work.md#L115) recommended; landing it here closes that defer.
  - [x] Verify by running `npm run test` from the repo root after the change — the run must NOT include Playwright; the existing 48 unit tests + integration tests still execute.

- [x] **Task 3: Create `apps/web/playwright.config.ts` (AC: #1)**
  - [x] Create [apps/web/playwright.config.ts](../../apps/web/playwright.config.ts) with the following content. Match exactly — every option in AC #1 is justified there.

    ```ts
    import { defineConfig, devices } from '@playwright/test';

    /**
     * Story 3.0 — Playwright E2E test harness.
     * Story 3.6+ extends this with journey specs; out of scope here.
     */
    export default defineConfig({
      testDir: './e2e',
      fullyParallel: true,
      forbidOnly: !!process.env.CI,
      retries: process.env.CI ? 2 : 0,
      reporter: process.env.CI
        ? [['github'], ['html', { open: 'never' }]]
        : [['list'], ['html', { open: 'never' }]],
      use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
        trace: 'on-first-retry',
        video: 'retain-on-failure',
      },
      projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      ],
      webServer: {
        command: 'npm run dev',
        cwd: '../..',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
    });
    ```

  - [x] **Why `cwd: '../..'`** — Playwright resolves `cwd` relative to the config file. The config sits at `apps/web/playwright.config.ts` and the dev orchestrator at [scripts/dev.sh](../../scripts/dev.sh) lives at the repo root, two levels up. Without this, `npm run dev` would invoke the web workspace's per-app `dev` script (`next dev` only — no Postgres, no API), and the XSS canary's API call would fail.
  - [x] **Why `reuseExistingServer: !process.env.CI`** — On a developer laptop, you usually have `npm run dev` already running. Playwright's default would refuse to start a second dev server and fail. With this flag set true (in non-CI), Playwright detects port :3000 is open, skips the spawn, and proceeds. CI does NOT have a dev server, so Playwright spawns its own.
  - [x] **Why `timeout: 120_000` (2 min)** — `scripts/dev.sh` does docker compose pull (first run), DB healthcheck wait, drizzle migrate, then parallel-launches Next.js + Fastify. On a cold cache that's easily 60-90 s. The default 60 s is too tight.
  - [x] **Why `stdout: 'ignore'` / `stderr: 'pipe'`** — The dev stack is chatty (Next.js, Pino, Drizzle, Postgres). Piping stdout floods Playwright's terminal; piping stderr only surfaces real errors.
  - [x] **Why `forbidOnly: !!process.env.CI`** — If a developer commits a `test.only(...)` they'll see a clear failure in CI rather than green-but-skipped. Local runs allow `.only` for focused debugging.
  - [x] **Watch-out:** Do NOT add `outputDir`, `globalSetup`, or `globalTeardown` in this story. They are tools for journey/setup-heavy stories; YAGNI here.
  - [x] **Watch-out:** Do NOT add `testMatch` or `testIgnore`. Default `*.spec.ts` matching is correct.
  - [x] **Watch-out:** Do NOT add a `grep` filter to the config. That belongs on the CLI (`playwright test --grep @P0`).

- [x] **Task 4: Create the canary XSS spec (AC: #4, #5)**
  - [x] Create [apps/web/e2e/xss-payload.spec.ts](../../apps/web/e2e/xss-payload.spec.ts) with the following content. The test name includes `@P0 @Security` tags; the body mirrors the test-design-qa scaffold but adds the cleanup hook and the structural-assertion defense-in-depth check.

    ```ts
    import { test, expect } from '@playwright/test';
    import { randomUUID } from 'node:crypto';

    // The API and web origins are different (Playwright `baseURL` is the WEB
    // origin used by `page.goto`). For API calls via `request.*`, use an
    // absolute URL — fall back to localhost:4000, the dev port from
    // `.env.example` NEXT_PUBLIC_API_URL.
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

    test.describe('P0-013 stored-XSS payload renders as text, not as DOM', () => {
      const payload = '<script>window.__xss__ = true</script>';
      let createdId: string | null = null;

      test.afterEach(async ({ request }) => {
        // Tolerate 404 — test may have failed before insert.
        if (createdId !== null) {
          const res = await request.delete(`${API_URL}/todos/${createdId}`, {
            headers: { 'x-request-id': randomUUID() },
          });
          expect([204, 404]).toContain(res.status());
          createdId = null;
        }
      });

      test('@P0 @Security stored XSS payload rendered as text, not executed', async ({
        page,
        request,
      }) => {
        // Seed via the API — bypasses the UI input path so the payload reaches
        // the DB exactly as a hostile client would send it.
        const createRes = await request.post(`${API_URL}/todos`, {
          data: { text: payload },
          headers: { 'x-request-id': randomUUID() },
        });
        expect(createRes.status()).toBe(201);
        const created = (await createRes.json()) as { id: string };
        createdId = created.id;

        // Navigate to the home page; wait for the populated list to render.
        await page.goto('/');
        await expect(page.getByTestId('todo-list')).toBeVisible();

        // The payload must be visible AS LITERAL TEXT in the DOM — proving
        // React's JSX text-escaping passed the angle-brackets through as text.
        await expect(page.getByText(payload)).toBeVisible();

        // The payload must NOT have executed — `window.__xss__` is undefined.
        const xssExecuted = await page.evaluate(
          () => (window as unknown as { __xss__?: boolean }).__xss__,
        );
        expect(xssExecuted).toBeUndefined();

        // Defense-in-depth: no <script> element in the DOM matches the payload's body.
        // If JSX escaping had failed, browsers would have parsed the injected
        // <script> and one of these would resolve.
        const scriptCount = await page
          .locator('script:has-text("__xss__ = true")')
          .count();
        expect(scriptCount).toBe(0);
      });
    });
    ```

  - [x] **Why seed via API, not via UI typing** — Two reasons. (1) The XSS attack surface is the RENDER path, not the input path. A hostile client could `curl -X POST` the payload directly; the test must prove the render is safe regardless of how the row got there. (2) UI typing would be slower and less deterministic; the canary's purpose is to run fast and flag rendering regressions.
  - [x] **Why three escalating assertions** — `getByText(payload)` proves the text content matches. `window.__xss__ === undefined` proves the script did NOT execute. `script:has-text(...).count() === 0` proves no `<script>` element with the payload was constructed at all (defense-in-depth — covers a hypothetical regression where JSX is bypassed via `dangerouslySetInnerHTML`, which is currently banned by ESLint per [architecture.md:216](../planning-artifacts/architecture.md#L216) but the ESLint rule could be disabled, this test would still fire).
  - [x] **Why `randomUUID()` from `node:crypto`** — Playwright tests run in Node, not in a browser, until `page.goto` is called. `crypto.randomUUID()` is available globally only inside the browser context (via `page.evaluate`). For headers passed to `request.post`, use the Node-side `randomUUID` from `node:crypto`.
  - [x] **Why the `afterEach` tolerates 404** — If the test failed BEFORE `createdId` was set (e.g., the network call rejected), `createdId` stays `null` and the cleanup branch is skipped. If the test failed AFTER set but the DELETE itself races with another worker, 404 is acceptable. Pinning to 204 strictly would create false-fail noise on test bugs.
  - [x] **Why no list-length assertion** — The dev DB may already contain rows from prior runs / manual testing. `getByText(payload)` matches THIS specific test's row regardless. List-length assertions would make the test order-dependent and hostile to developer dev-loop usage.
  - [x] **Watch-out:** Do NOT use `page.locator(`text=${payload}`)` — string-interpolating user-controlled content into a Playwright text selector is a separate kind of trap (selectors aren't HTML, but escaping inconsistencies surprise people). `page.getByText(payload)` accepts a string argument and handles it as a literal substring match.
  - [x] **Watch-out:** Do NOT add `await page.waitForLoadState('networkidle')`. The home page does a single GET /todos on mount; once the list is visible, the test can proceed. `networkidle` is brittle when the page has long-poll-like behavior (it doesn't, today, but defending against future regressions makes the test fragile).
  - [x] **Watch-out:** Do NOT add a "happy path no-XSS" sibling test in this story. P1-001 / P1-022 / etc. cover non-payload journeys; this story is the harness + R-002 canary only. Scope creep here multiplies into a Story 3.6-sized PR.

- [x] **Task 5: Add `.gitignore` entries (AC: #6)**
  - [x] Edit [apps/web/.gitignore](../../apps/web/.gitignore). Append a `# playwright` block matching the format of the existing `# next.js` and `# testing` blocks at [apps/web/.gitignore:11-19](../../apps/web/.gitignore#L11-L19):

    ```
    # playwright
    /test-results/
    /playwright-report/
    /playwright/.cache/
    /blob-report/
    ```

  - [x] **Why each entry**:
    - `/test-results/` — Playwright's per-test artifact dir (trace.zip, video.webm, screenshots). Created on every run; can grow to hundreds of MB.
    - `/playwright-report/` — HTML report from `reporter: ['html']`. Not source; generated on run.
    - `/playwright/.cache/` — Playwright internal cache (browser binary checksums, etc.).
    - `/blob-report/` — Used when CI shards Playwright runs across multiple machines. Empty today; pre-emptive ignore.
  - [x] **Watch-out:** Do NOT add `/.playwright/` (no leading dot) or other variants — Playwright's actual directory names are documented; matching the wrong name produces silently uncovered files.
  - [x] **Watch-out:** Do NOT add the entries to the root [.gitignore](../../.gitignore). The Playwright run happens from inside `apps/web/`; output dirs are created there. Adding to root `.gitignore` would not catch the apps/web/test-results/ path under all git modes.

- [x] **Task 6: Verify ESLint and TypeScript pick up `apps/web/e2e/` (AC: #10, #11)**
  - [x] Open [apps/web/tsconfig.json](../../apps/web/tsconfig.json). Verify the `include` array covers `e2e/**/*.ts`. If it does not (most likely it covers `**/*.ts` already, which subsumes `e2e/`), no edit needed; record "verified — already covered" in Completion Notes. If a narrower `include` exists (e.g., `["src/**/*.ts"]`), append `"e2e/**/*.ts"` to it.
  - [x] Run `npm run typecheck:web` from the repo root. The new spec must compile cleanly (zero errors).
  - [x] Run `npm run lint` from the repo root. The new spec must lint cleanly (zero warnings, zero errors). If the existing `import` cross-app ban at [eslint.config.mjs:38-50](../../eslint.config.mjs#L38-L50) blocks the spec's imports (none in this story's spec — but check), relax the ban for `apps/web/e2e/**`. The relaxation is one entry in the rule's `pattern` array.
  - [x] **Why type-check the specs** — Playwright's API is heavily typed; a typo in a fixture name (`requrest` vs `request`) would silently fail the test rather than fail typecheck. Including specs in TS coverage catches drift early.
  - [x] **Why lint the specs** — Same reason. Specs are first-class TS code; treating them differently invites bit-rot.

- [x] **Task 7: Create `apps/web/e2e/README.md` (AC: #7)**
  - [x] Create [apps/web/e2e/README.md](../../apps/web/e2e/README.md). Use the structure and content from AC #7. The README is for HUMAN onboarding; keep it ≤ 80 lines. Do NOT duplicate config explanations that live in `playwright.config.ts` comments.
  - [x] **Watch-out:** Do NOT include CI configuration here. CI for E2E is a separate, future story (one of the deferred items in story 3.7+ work). The README explicitly says "the harness is configured for local dev and ready for CI integration in a future story."

- [x] **Task 8: Update root README.md (AC: #8)**
  - [x] Edit [README.md](../../README.md). Add the "End-to-end tests" subsection AFTER the **Useful Scripts** table (line 50) and BEFORE **Troubleshooting** (line 52). Keep it ≤ 15 lines. Reference [apps/web/e2e/README.md](../../apps/web/e2e/README.md) for details.
  - [x] Append the `npm run test:e2e` row to the **Useful Scripts** table.
  - [x] **Watch-out:** Do NOT change the existing Quick Start (lines 12-21). E2E setup is opt-in; it must NOT be in the critical path that every contributor runs.
  - [x] **Watch-out:** Do NOT mention the CI E2E setup. There is no CI E2E setup yet; doing so would be misleading.

- [x] **Task 9: Run the full sanity gate plus the new E2E spec (AC: #9, #10)**
  - [x] From the repo root: `npm install` (picks up the new web devDeps), then `npm --workspace apps/web run test:e2e:install` (downloads browser binaries — runs once per machine, takes 1-2 minutes), then `npm run dev` in one terminal AND `npm run test:e2e` in another (or single-terminal `npm run test:e2e` to use auto-spawn — which takes longer but proves the spawn path works).
  - [x] Verify all 3 test results pass (one per browser project).
  - [x] Verify wall-clock time is under 30 s for the single-spec run (per browser; aggregated ~15-30 s for all three).
  - [x] From the repo root: `npm run lint && npm run typecheck && npm run test`. All must pass with zero warnings / zero errors / zero changes to existing test counts (the harness adds Playwright tests but they live OUTSIDE the Vitest / node:test paths, so unit/integration counts stay exactly where they were after Story 2.7).
  - [x] Verify `npm run test` (without `:e2e`) does NOT trigger any `playwright` invocation. If it does, AC #3 / Task 2 was incomplete — fix the explicit allow-list and re-run.

- [x] **Task 10: Document deviations and follow-ups in Dev Notes / Completion Notes**
  - [x] In Completion Notes, record the EXACT pinned versions of `@playwright/test` and `@axe-core/playwright` from the lockfile (e.g., `@playwright/test@1.49.1`).
  - [x] If any AC could not be implemented as written (e.g., a Playwright API was removed/renamed in the latest version), document the deviation clearly with the workaround chosen, the version it was tested against, and the recommended replacement-spec citation.
  - [x] If `webServer` auto-spawn proved unreliable in your environment (e.g., docker-compose race with the dev shell), document the diagnostic and either fix it in this story OR file a deferred item with a concrete repro.

## Dev Notes

### Where this story sits

This story is a foundational tooling/test-architecture story that closes ASR-1 from the test-design phase, originally scheduled "pre-Story 1.7" but never executed. The architecture's planning docs assumed Playwright was wired up before Epic 1 shipped UI; in reality, every UI story (1.7, 1.9, 2.5, 2.6, 2.7) shipped on Vitest + RTL + jsdom alone. The 10 E2E scenarios pinned by [test-design-qa.md:194](../test-artifacts/test-design-qa.md#L194) (P0-013 stored XSS, P0-024 Journey 3, P1-013/P1-014 a11y + keyboard, P1-022 / P1-024 / P1-026 toast/listener, P2-001 disclosure, P2-007 responsive) currently have no implementation. **This story scaffolds the harness and lands ONE canary test (P0-013); the remaining 9 scenarios fan out to follow-up stories.**

The slot `3-0-playwright-e2e-harness` deliberately precedes Story 3.1 in Epic 3 to honor the original ASR-1 timeline (foundation-before-features), without forcing a renumber of the existing 3.1-3.6 sequence. Sprint-status.yaml gets a new entry inserted before `3-1-toast-infrastructure...`.

### Why this is in Epic 3 (not a separate "Test Hardening" epic)

Two reasons. (1) The remaining 9 E2E scenarios all map to Epic 3 stories — Journey 3 (P0-024) is the heart of Story 3.6; the toast/listener tests (P1-024, P1-026) attach to 3.1/3.5; the a11y scans (P1-013) attach to whichever story finalizes the relevant UI surface. Every E2E scenario has an Epic-3 home. (2) Splitting into a separate "Test Hardening" epic would add planning overhead for a story scope that fits Epic 3's "Failure Resilience & Recovery" theme — the harness exists primarily to validate failure-path UX, which is Epic 3's purpose.

### Why scaffold + one canary instead of "scaffold-only"

A bare smoke test ("load /, see heading") proves the harness compiles and runs. It does NOT prove the harness is wired correctly to the dev stack, the API request fixture works, the data-testid selectors from Story 1.9 / 2.5 / 2.6 / 2.7 are reachable from a real browser, the dev DB is touchable from within a Playwright test, or that test-result cleanup (afterEach DELETE) actually works. P0-013 exercises every one of those paths in a single test. If ANY of those is broken, the canary fails and the harness is not "done." A pure smoke test would let half-broken plumbing ship and surface as flake during Story 3.6.

### Why apps/web/e2e/ (not a separate apps/e2e/ workspace, not /e2e/ at root)

[test-design-qa.md:410](../test-artifacts/test-design-qa.md#L410) explicitly says: "translate the repro into a Playwright spec in `apps/web/e2e/`". That decision pre-dates this story; we honor it. The architecture document does not contradict it. Reasoning, in case the question arises again:
- E2E specs are tightly coupled to the web tier's data-testid contract. Putting them inside `apps/web/` makes the dependency obvious in `git log` / file-tree views.
- A separate `apps/e2e/` workspace would force cross-workspace imports for test types and mean the web team owns "their" e2e tests across two workspace boundaries.
- A root `/e2e/` directory escapes workspace conventions and complicates `npm --workspace` script orchestration.

### Why a separate `API_URL` constant in the spec (instead of relying on Playwright's `baseURL`)

Playwright's `baseURL` config option applies to BOTH `page.goto` AND path-relative `request.*` calls. The web app and the API run on different origins (`http://localhost:3000` and `http://localhost:4000` respectively), so a single `baseURL` cannot serve both. The split:

- `page.goto('/')` and any future `page.locator(...)` calls — relative to `baseURL` = web origin (`http://localhost:3000`).
- `request.post(...)`, `request.delete(...)`, etc. — pass the absolute URL via `${API_URL}/...` where `API_URL` reads `process.env.NEXT_PUBLIC_API_URL` with a `localhost:4000` default.

If you forget the absolute URL and write `request.post('/todos', ...)`, Playwright resolves against the web `baseURL` and the request hits Next.js (which has no route handler for `/todos` — Next.js returns 404; the test fails confusingly with "expected 201, got 404"). The DOUBLE-CHECK: the API spec returns 201 on success — if the canary ever fails with a 404 on the create call, the API_URL is wrong, not the assertion.

Do not add a second `baseURL` for the API. Playwright supports only one. The pattern of "page baseURL + explicit API_URL constant for request" is the established cross-origin testing approach.

### Why we install `@axe-core/playwright` now even though no a11y scans land in this story

Future stories (P1-013 axe-core scan of empty/loading/populated states) need it. Bundling the install with the harness scaffold avoids a "go re-run npm install on every machine" follow-up the moment story 3-7 lands. The package adds dev-only weight (~12 MB unpacked); it's invisible at runtime.

### Why `@seontechnologies/playwright-utils` is NOT installed

[test-design-qa.md:391](../test-artifacts/test-design-qa.md#L391) recommends it for an "API-first seeding, typed `apiRequest` fixture." Story 3.0 uses Playwright's built-in `request` fixture for the canary, which suffices. When Story 3.6 lands and Journey 3's offline / 5xx / timeout sub-cases need richer API setup/teardown, that story can decide whether to adopt `@seontechnologies/playwright-utils` or stay built-in. Pre-installing a fixture before its first user is YAGNI.

### Why the `test:*` glob fix lands in this story (not separately)

[deferred-work.md:115](./deferred-work.md#L115) flagged: "`test:*` glob will silently absorb future `test:integration`. Once Story 1.11 (or later) wires `test:integration`, `npm run test` from root will start requiring Postgres in CI, breaking the spec's explicit 'no DB required' contract. Replace the glob with an explicit list (`test:shared test:api test:web`) when the integration script lands." Adding `test:e2e` is the second occurrence of this gotcha; if we leave the glob in place, `npm run test` would silently start running Playwright (which IS slow AND needs browsers AND needs the dev stack). Closing the defer here is the right scope — it's the same hazard, fixed once.

### Why no CI integration

CI E2E pipelines need:
- A Playwright job in `.github/workflows/ci.yml`
- Browser binaries cached across runs (cache key on `package-lock.json`)
- A Postgres service container with the same migrations as dev
- A way to wait for the API to be ready before tests run
- Sharding strategy for parallel runs (vs. sequential within one runner)
- Artifact upload for trace.zip / video.webm on failure
- A failure threshold (do flaky retries fail the build?)

Each of those is a non-trivial decision. Bundling them into "ASR-1 closure" would balloon this story. Out-of-scope; documented as a follow-up.

### What is intentionally OUT-OF-SCOPE for this story

- **Visual regression tests** (Playwright snapshots) — adds a snapshot maintenance burden; Story 1.7 / 1.9 already pin layout via component tests. Out of scope.
- **Cross-browser headed video recording in CI** — `video: 'retain-on-failure'` is enabled; CI integration to upload videos to GHA artifacts is a future story.
- **Mobile viewport tests** (`devices['iPhone 13']`) — P2-007 (responsive viewports) is its own scenario; out of scope here.
- **Network throttling / latency injection** — Playwright's `page.route()` covers the Journey 3 cases (P0-024 sub-cases A/B/C/E) where it's needed; out of scope here.
- **`@axe-core/playwright` scans** — Installed for future use; no spec uses it in this story. P1-013 (axe-core scan of three list states) is its own scenario.
- **`@seontechnologies/playwright-utils` fixtures** — See above. Out of scope.
- **CI workflow changes** (`.github/workflows/ci.yml` edits) — See "Why no CI integration" above.
- **Dev-stack modifications** (changes to `scripts/dev.sh`, docker-compose) — The harness consumes the existing dev stack as-is. If `dev.sh` proves unreliable under Playwright's `webServer` auto-spawn, document the issue and propose fixes for a follow-up story; do not modify `dev.sh` here.
- **The other 9 E2E scenarios from [test-design-qa.md:194](../test-artifacts/test-design-qa.md#L194)** — Each gets its own story.
- **A general-purpose `apiRequest` test fixture** — Story 3.6 (Journey 3) is the natural home for it.

### What changes in the codebase

- **NEW** [apps/web/playwright.config.ts](../../apps/web/playwright.config.ts) — Playwright config (~50 LOC).
- **NEW** [apps/web/e2e/xss-payload.spec.ts](../../apps/web/e2e/xss-payload.spec.ts) — P0-013 canary (~50 LOC).
- **NEW** [apps/web/e2e/README.md](../../apps/web/e2e/README.md) — E2E onboarding doc (~80 LOC).
- **EDIT** [apps/web/package.json](../../apps/web/package.json) — add 2 devDeps + 3 scripts.
- **EDIT** [package.json](../../package.json) — add 1 root script + replace `test:*` glob with explicit list.
- **EDIT** [apps/web/.gitignore](../../apps/web/.gitignore) — append 4 entries.
- **EDIT** [README.md](../../README.md) — add 1 row to scripts table + ~15 line subsection.
- **EDIT POSSIBLY** [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs) or root [eslint.config.mjs](../../eslint.config.mjs) — IF the cross-app import ban blocks E2E specs (verify; relax for `apps/web/e2e/**` only if needed).
- **EDIT POSSIBLY** [apps/web/tsconfig.json](../../apps/web/tsconfig.json) — IF the `include` is narrower than `**/*.ts` (verify; append `e2e/**/*.ts` only if needed).

Total: ~250 LOC across 8-10 files.

### Cross-references to test-design

This story partially closes:
- **ASR-1** [test-design-architecture.md:67](../test-artifacts/test-design-architecture.md#L67) — Web-tier test stack (Playwright + axe-core portion). Vitest + RTL + MSW were closed informally during Stories 1.7-2.7.
- **R-002** [test-design-architecture.md:109](../test-artifacts/test-design-architecture.md#L109) — Stored-XSS risk (score 6). The integration-level coverage already exists ([apps/api/test/integration/todos.int.test.ts:99-100](../../apps/api/test/integration/todos.int.test.ts#L99-L100) — server accepts the payload). This story adds the E2E render-path coverage demanded by [test-design-architecture.md:215-216](../test-artifacts/test-design-architecture.md#L215-L216) "P0 end-to-end XSS payload test (P0-013)."
- **P0-013** scenario from [test-design-qa.md:223](../test-artifacts/test-design-qa.md#L223). Implementation matches the scaffold at [test-design-qa.md:435-448](../test-artifacts/test-design-qa.md#L435-L448) line for line, plus cleanup and structural-assertion hardening.

This story does NOT close:
- **P0-024 Journey 3 E2E** — Story 3.6.
- **P1-013 axe-core scans** — its own future story.
- **P1-014 keyboard traversal E2E** — its own future story.
- **P1-022 / P1-024 / P1-026 toast / unhandled-rejection E2E** — Stories 3.1 / 3.2 / 3.5 territory.
- **P2-001 disclosure microcopy E2E** — its own future story.
- **P2-007 responsive viewports E2E** — its own future story.

### Library / version pins (April 2026)

- `@playwright/test` — install latest stable @^1.x at scaffold time; record the exact pin in Completion Notes. Playwright maintains backward compatibility within 1.x; minor bumps are safe but not pinned by-pinned-version here.
- `@axe-core/playwright` — install latest stable @^4.x. Same reasoning.
- Playwright supports Node 18+ ([Playwright system requirements](https://playwright.dev/docs/intro)); the project's `.nvmrc` pins Node 22 ([package.json:33](../../package.json#L33) `engines.node >=22`). No version conflict.

### Project Structure Notes

The architecture's directory tree at [architecture.md:496-608](../planning-artifacts/architecture.md#L496-L608) does NOT show an `apps/web/e2e/` directory — the architecture pre-dates the Playwright wire-up. This story adds it without conflict; the addition is documented in `apps/web/e2e/README.md` and aligns with the test-design-qa.md guardrail ("translate the repro into a Playwright spec in `apps/web/e2e/`" at line 410). No existing path is moved or renamed.

The architecture's "Test organization" section at [architecture.md:748-752](../planning-artifacts/architecture.md#L748-L752) says: "Unit tests: co-located with implementation. Integration tests: `apps/api/test/integration/`. No separate `tests/` tree at root; no `__tests__/` directories." E2E tests are a third category not mentioned there; placing them in `apps/web/e2e/` is consistent with the principle (in-tier, not at root) without violating any explicit prohibition.

### Testing Requirements

This story's "tests" are not unit / integration / component — they are the E2E suite itself. The success criterion is:
- The Playwright canary spec passes against all three browser projects (chromium, firefox, webkit).
- All existing test counts (Vitest 94 web tests, integration 41, contracts, etc.) remain unchanged.
- `npm run lint` / `typecheck` / `test` (without `:e2e`) all pass clean.

There are no Vitest tests added by this story.

### References

- [test-design-architecture.md:67](../test-artifacts/test-design-architecture.md#L67) — ASR-1 (Pin Vitest + RTL + MSW for unit/component; Playwright + `@axe-core/playwright` for E2E).
- [test-design-architecture.md:89](../test-artifacts/test-design-architecture.md#L89) — Test strategy split: ~67 scenarios across unit (20), component (12), integration (22), E2E (10), perf/manual (3).
- [test-design-architecture.md:109-111](../test-artifacts/test-design-architecture.md#L109-L111) — R-002 score-6 risk (Stored XSS) and P0-013 mitigation.
- [test-design-architecture.md:167-168](../test-artifacts/test-design-architecture.md#L167-L168) — Playwright `page.route()` is the journey-3 fault-injection mechanism (no architectural change).
- [test-design-architecture.md:215-216](../test-artifacts/test-design-architecture.md#L215-L216) — XSS mitigation plan: ESLint ban on `dangerouslySetInnerHTML`, Zod bounds, P0-013 E2E test.
- [test-design-qa.md:194](../test-artifacts/test-design-qa.md#L194) — Test level distribution (24 P0, 27 P1, 11 P2, 5 P3).
- [test-design-qa.md:204-207](../test-artifacts/test-design-qa.md#L204-L207) — E2E (~10 scenarios) covers PRD journeys, XSS, responsive viewports, axe scans, stubbed-network failure recovery; "duplicate-coverage guard" notes XSS appears at integration AND E2E by design.
- [test-design-qa.md:222-223](../test-artifacts/test-design-qa.md#L222-L223) — P0-013 scenario row.
- [test-design-qa.md:325](../test-artifacts/test-design-qa.md#L325) — Browser projects: Chromium / Firefox / WebKit.
- [test-design-qa.md:390-391](../test-artifacts/test-design-qa.md#L390-L391) — Playwright + axe-core + `@seontechnologies/playwright-utils` recommendations (the third NOT used in this story).
- [test-design-qa.md:410](../test-artifacts/test-design-qa.md#L410) — `apps/web/e2e/` location guardrail.
- [test-design-qa.md:435-448](../test-artifacts/test-design-qa.md#L435-L448) — P0-013 implementation scaffold (used as the basis for `xss-payload.spec.ts`).
- [test-design/todo-app-handoff.md:65-77](../test-artifacts/test-design/todo-app-handoff.md#L65-L77) — Data-testid contract (note: actual shipped values use `todo-item-checkbox` / `todo-item-delete` / `todo-input-field` style — the handoff's `todo-checkbox` / `todo-delete` were prescriptive proposals, the implemented values diverged; this story uses the SHIPPED values per [TodoList.tsx:66](../../apps/web/src/components/TodoList.tsx#L66)).
- [architecture.md:216](../planning-artifacts/architecture.md#L216) — XSS prevention relies on React's default JSX escaping; `dangerouslySetInnerHTML` is prohibited.
- [architecture.md:431](../planning-artifacts/architecture.md#L431) — "no console in production code" rule (relevant: Playwright tests are NOT production code, so `console.log` for diagnosis is allowed in specs but should be cleaned up before merge).
- [architecture.md:494-608](../planning-artifacts/architecture.md#L494-L608) — Project structure (does not include `apps/web/e2e/`; this story adds it without conflict per Project Structure Notes above).
- [architecture.md:748-752](../planning-artifacts/architecture.md#L748-L752) — Test organization conventions.
- [epics.md:1016-1289](../planning-artifacts/epics.md#L1016-L1289) — Epic 3 stories 3.1-3.6 (downstream consumers of the harness landed by this story).
- [scripts/dev.sh:1-38](../../scripts/dev.sh#L1-L38) — Dev orchestrator that Playwright's `webServer` invokes via `cwd: '../..'`.
- [scripts/dev.sh:38](../../scripts/dev.sh#L38) — `exec npx --no-install npm-run-all --parallel ...` (the SIGINT-propagation pattern Playwright relies on for clean teardown).
- [package.json:13](../../package.json#L13) — Existing `dev` script Playwright will invoke.
- [package.json:14-18](../../package.json#L14-L18) — Existing `test:*` scripts pattern (the `test:*` glob fix in Task 2 / AC #3 affects this).
- [deferred-work.md:115](./deferred-work.md#L115) — Pre-existing `test:*` glob deferral (closed by this story per Task 2).
- [.env.example:28](../../.env.example#L28) — `NEXT_PUBLIC_API_URL=http://localhost:4000`. The Playwright spec reads this via `process.env.NEXT_PUBLIC_API_URL` (with fallback) at module scope; see "Why a separate API_URL constant" below for why path-relative `/todos` would hit the wrong origin.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- Verified `npm run test` from repo root after the `test:*` glob fix runs only `test:shared`, `test:api`, `test:web` — zero Playwright references in output (`grep -ciE "playwright|test:e2e"` returns 0).
- Verified dev stack already running locally on `:3000` and `:4000` before the E2E run; Playwright's `reuseExistingServer: !process.env.CI` correctly skipped the spawn and ran the canary against the existing stack.
- Browser binaries downloaded once via `playwright install --with-deps chromium firefox webkit` to `~/Library/Caches/ms-playwright/` (Chromium-headless-shell 147.0.7727.15, Firefox 148.0.2, WebKit 26.4 — all transient, not in the repo).

### Completion Notes List

- **Pinned versions (from `package-lock.json`):**
  - `@playwright/test@1.59.1` (caret-ranged in `apps/web/package.json` as `^1.59.1`).
  - `@axe-core/playwright@4.11.3` (caret-ranged as `^4.11.3`). Installed but UNUSED in this story per spec — pre-installed for the future P1-013 axe-core scan story to avoid an "npm install on every machine" follow-up at that point.
- **Test-results vs. expected:**
  - All 3 Playwright projects (chromium / firefox / webkit) PASSED on the canary `xss-payload.spec.ts` — total 3 test results, 17.5 s aggregated wall-clock (chromium 2.5 s, firefox 1.2 s, webkit 2.2 s) — well under the 30 s/browser bound from AC #9.
  - Vitest web suite: 94 tests across 6 files — UNCHANGED from Story 2.7 baseline (no regressions).
  - `npm run lint` / `npm run typecheck` / `npm run test`: all clean (zero warnings, zero errors).
- **`tsconfig.json` already covered `e2e/**/*.ts`:** `apps/web/tsconfig.json` `include` uses `**/*.ts` and `**/*.tsx`, which subsumes `e2e/**`. No edit needed (verified per Task 6).
- **ESLint cross-app ban did NOT block the spec:** the canary spec uses no `@todo-app/shared` import (it consumes only `@playwright/test` + `node:crypto` and a structural `{ id: string }` cast on the API response). The relaxation hook from AC #11 / Task 6 was therefore not exercised; if a future Epic 3 spec needs `Todo` from shared, the ban relaxation can be added at that point.
- **No spec deviations.** Every AC implemented as written. The `playwright.config.ts` matches the AC #1 / Task 3 code block byte-for-byte; the canary spec matches AC #4 / Task 4 byte-for-byte.
- **`webServer` auto-spawn not exercised end-to-end** — the dev stack was already running locally, so `reuseExistingServer` took the reuse path. This is the expected developer-laptop case. The spawn path will be exercised the next time a contributor runs `npm run test:e2e` on a clean tree (e.g., right after `git clone`) or in CI when the harness gets wired up; if the spawn path proves unreliable then, document and revisit per Task 10.
- **Closes deferred-work.md:115** — root `package.json` `test` script is now `npm-run-all --print-label test:shared test:api test:web` (explicit allow-list, not the `test:*` glob). The deferral entry can be removed or annotated as resolved.

### File List

NEW:

- `apps/web/playwright.config.ts`
- `apps/web/e2e/xss-payload.spec.ts`
- `apps/web/e2e/README.md`

MODIFIED:

- `apps/web/package.json` (3 scripts + 2 devDeps)
- `apps/web/.gitignore` (4 Playwright artifact entries)
- `package.json` (1 root script + `test:*` glob → explicit allow-list)
- `package-lock.json` (auto-updated by `npm install` for the new devDeps)
- `README.md` (1 row in Useful Scripts table + new "End-to-end tests" subsection)

### Review Findings

## Change Log

| Date       | Author      | Change                                                                                  |
| ---------- | ----------- | --------------------------------------------------------------------------------------- |
| 2026-04-30 | Romulo + AI | Initial story creation. Closes ASR-1 (Playwright + axe-core harness pinning) and lands the P0-013 stored-XSS canary E2E test. Slot `3-0-` precedes 3-1 in Epic 3 to honor the original "pre-Story 1.7" timeline without renumbering existing 3.1-3.6 stories. |
| 2026-04-30 | Romulo + AI | Dev-Story implementation. Playwright config + canary XSS spec + scripts + .gitignore + READMEs landed; `@playwright/test@1.59.1` and `@axe-core/playwright@4.11.3` pinned; root `test:*` glob replaced with explicit allow-list (closes deferred-work.md:115). Sanity gate green; canary passes 3/3 browsers in 17.5 s. Status → review. |
