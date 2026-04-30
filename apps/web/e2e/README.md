# End-to-end tests (Playwright)

Real-browser tests for the web app, run against the live dev stack.
Story 3.0 scaffolds this harness and lands the P0-013 stored-XSS canary;
follow-up Epic 3 stories add journey, a11y, and toast/listener coverage.

## Prerequisites

- `npm install` already ran from the repo root.
- `npm run test:e2e:install` once per machine — downloads browser binaries
  (Chromium, Firefox, WebKit) and Linux system libs. These are NOT npm
  packages and are NOT in `node_modules`. Re-run only when bumping
  `@playwright/test`.

## How to run

From the repo root:

```bash
npm run test:e2e
```

This auto-starts the full dev stack (Postgres + API + web) via Playwright's
`webServer` config when it's not already running. If you already have
`npm run dev` running in another terminal, Playwright reuses it (locally
only — CI always spawns its own).

## How to debug

```bash
npm --workspace apps/web run test:e2e:ui     # interactive runner (UI mode)
npx --workspace apps/web playwright show-report   # last HTML report
```

A failed run also writes `apps/web/test-results/` (trace.zip, video, screenshot)
and `apps/web/playwright-report/` (HTML report). Both are gitignored.

## Where the tests live

`apps/web/e2e/*.spec.ts` — one spec per scenario. Co-locate journey files when
Story 3.6 lands (e.g., `journey-3-resilience.spec.ts`).

## Tagging convention

Test titles include `@P0`, `@P1`, `@P2`, `@Security`, `@A11y` etc. so future
runs can filter via the CLI:

```bash
npm --workspace apps/web run test:e2e -- --grep @P0
```

## Naming

Specs MUST end in `*.spec.ts`. This is Playwright's default and is deliberately
distinct from Vitest's `*.test.ts` so a misconfigured runner cannot
double-execute them.

## What is NOT covered yet

Only P0-013 (stored-XSS canary) is implemented. The remaining nine E2E
scenarios from `_bmad-output/test-artifacts/test-design-architecture.md:89`
await dedicated stories:

- P0-024 — Journey 3 resilience (Story 3.6 territory).
- P1-013 / P1-014 — axe-core scans + keyboard traversal.
- P1-022 / P1-024 / P1-026 — toast and unhandled-rejection coverage
  (Stories 3.1 / 3.2 / 3.5).
- P2-001 — disclosure microcopy.
- P2-007 — responsive viewports.

CI integration (workflow, browser-binary cache, sharding, artifact upload) is
out of scope for Story 3.0; the harness is configured for local dev and ready
for CI integration in a future story.
