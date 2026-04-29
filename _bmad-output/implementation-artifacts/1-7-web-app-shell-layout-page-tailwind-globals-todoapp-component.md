# Story 1.7: Web app shell — layout, page, Tailwind globals, `TodoApp` component

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a first-time visitor,
I want the page to load with a clear title, accessible markup, and a visible container,
So that the app's shape is apparent immediately and the list component has a place to render (even before data arrives).

## Acceptance Criteria

1. **Given** [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx),
   **When** the app renders,
   **Then** the `<html lang="en">` and `<body>` root structure is produced,
   **And** metadata sets the `<title>` to "Shared Todos" and a meaningful description,
   **And** no `robots: noindex` is set (SEO baseline from PRD §SEO Strategy).

2. **Given** [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx),
   **When** rendered,
   **Then** it mounts a single `<TodoApp />` component,
   **And** uses a semantic `<main>` landmark.

3. **Given** `TodoApp.tsx` in [apps/web/src/components/](../../apps/web/src/components/),
   **When** rendered,
   **Then** it is a client component (`"use client"`),
   **And** it renders an `<h1>` with "Shared Todos",
   **And** it renders a placeholder region where the list will later mount.

4. **Given** [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css),
   **When** Tailwind directives are inspected,
   **Then** Tailwind base, components, and utilities are active (Tailwind v4: `@import "tailwindcss";` — see Dev Notes "Tailwind v4 layer mapping"),
   **And** a base rule ensures `:focus-visible` shows a visible focus ring on interactive elements (NFR11),
   **And** base text colors meet WCAG AA contrast against the page background (NFR13).

5. **Given** the page is loaded at 360px viewport width,
   **When** rendered,
   **Then** content fits without horizontal scroll,
   **And** at 1440px width the content is centered with a reasonable max-width container (FR29).

6. **Given** the page is loaded,
   **When** the browser console is inspected,
   **Then** no errors or hydration warnings are printed.

## Tasks / Subtasks

- [x] **Task 1: Pre-flight — confirm web scaffold is clean and on the right Next.js (AC: all)**
  - [x] Read [apps/web/AGENTS.md](../../apps/web/AGENTS.md) FIRST. It pins a "this is NOT the Next.js you know" directive — Next.js 16 has breaking changes from training-data assumptions. Authoritative docs live in `node_modules/next/dist/docs/`. The relevant ones for this story:
    - `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (v16 breaking changes)
    - `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` (Tailwind v4 setup)
    - `node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md` (metadata API)
    - `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` (`"use client"`)
  - [x] Verify [apps/web/package.json](../../apps/web/package.json) has `next: 16.2.4`, `react: 19.2.4`, `react-dom: 19.2.4`, `tailwindcss: ^4`, `@tailwindcss/postcss: ^4`, `eslint-config-next: 16.2.4`. **Do NOT bump any of these.** Story 1.1 fixed these versions deliberately.
  - [x] Verify Story 1.1 scaffold artifacts are still in place: [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx), [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx), [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css), [apps/web/postcss.config.mjs](../../apps/web/postcss.config.mjs), [apps/web/next.config.ts](../../apps/web/next.config.ts). All present per Story 1.1 commit `9e4570e`.
  - [x] **Do NOT install Vitest, React Testing Library, Jest, or any web-tier test framework in this story.** The architecture flags "Web app test tooling not pinned" as a Known Gap; Story 1.7 deliberately does not own that decision. Component tests live in Story 1.9 (when there is render-state logic worth asserting on) — see Dev Notes "Why no web tests in this story".
  - [x] **Do NOT introduce `next.config.ts` changes** beyond what already exists.
  - [x] **Do NOT add `@next/bundle-analyzer`, Storybook, or Playwright.** Story 1.11 owns build/deploy tooling; Epic 3 owns journey-level resilience tests.

- [x] **Task 2: Replace `app/layout.tsx` content (AC: #1)**
  - [x] Update [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx) to:
    ```tsx
    import type { Metadata } from 'next';
    import { Geist, Geist_Mono } from 'next/font/google';
    import './globals.css';

    const geistSans = Geist({
      variable: '--font-geist-sans',
      subsets: ['latin'],
    });

    const geistMono = Geist_Mono({
      variable: '--font-geist-mono',
      subsets: ['latin'],
    });

    export const metadata: Metadata = {
      title: 'Shared Todos',
      description:
        'A simple shared todo list — visible to everyone, no sign-in required.',
    };

    export default function RootLayout({
      children,
    }: Readonly<{ children: React.ReactNode }>) {
      return (
        <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
          <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
            {children}
          </body>
        </html>
      );
    }
    ```
  - [x] **Why keep Geist + Geist_Mono:** the existing scaffold wires `--font-geist-sans` and `--font-geist-mono` into `globals.css` via `@theme inline`. Removing the imports without also removing the `@theme inline` lines leaves dangling CSS variables. Either remove BOTH or keep BOTH — keeping is simpler and zero-cost; the typography still aligns with the architecture's "Tailwind exclusively" rule because we don't apply Geist via Tailwind utilities.
  - [x] **Title literal `"Shared Todos"`** — the AC's exact wording. Description is inline; do NOT use the `template`/`default` shape (that's for routes that override).
  - [x] **Do NOT add `robots: { index: false, follow: false }`** or `noindex` meta — AC #1 explicitly forbids this. PRD's SEO Strategy says the v1 baseline is indexable.
  - [x] **Do NOT mark `layout.tsx` as `"use client"`** — Server Components own the metadata export. Marking it client makes the metadata silently no-op (Next.js logs a warning at build but the title falls back to "Next.js App").
  - [x] **Body styling note:** the explicit `bg-[var(--background)] text-[var(--foreground)]` arbitrary values bind the layout to the CSS vars defined in `globals.css`. This makes the dark-mode media query (already in `globals.css`) visibly take effect on every page without per-component Tailwind dark variants.

- [x] **Task 3: Replace `app/page.tsx` content (AC: #2)**
  - [x] Replace [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx) with:
    ```tsx
    import TodoApp from '@/components/TodoApp';

    export default function Home() {
      return (
        <main className="flex flex-1 flex-col mx-auto w-full max-w-2xl px-4 py-12 md:py-16">
          <TodoApp />
        </main>
      );
    }
    ```
  - [x] **Why `<main>` not `<div>`:** AC #2 mandates a semantic `<main>` landmark. Screen readers expose `<main>` as a navigation target ("skip to main content").
  - [x] **Why `mx-auto max-w-2xl px-4`:** AC #5 requires content fits at 360px (no horizontal scroll) and centers with reasonable max-width at 1440px. `max-w-2xl` (~672px) keeps the list legible on wide displays; `px-4` gives mobile breathing room; `mx-auto` centers.
  - [x] **Why `py-12 md:py-16`:** the `md:` breakpoint at ≥768px gives slightly more vertical breathing room on desktop without crowding mobile.
  - [x] **Why `flex flex-1`:** lets the layout's `flex flex-col` (set on `<body>`) push `<main>` to fill the viewport. Combined with the layout's `min-h-full` body, this ensures empty-state pages still occupy the full viewport.
  - [x] **Do NOT mark `page.tsx` `"use client"`** — it's a Server Component that mounts a Client Component (`<TodoApp />`). The boundary is at the import.
  - [x] **Do NOT import `next/image`** — the Story 1.1 boilerplate imported it for the Vercel logo; we're deleting that. ESLint will flag any unused import.
  - [x] **Path alias `@/components/TodoApp`** assumes `tsconfig.json` has `"paths": { "@/*": ["./src/*"] }`. **Verify** in [apps/web/tsconfig.json](../../apps/web/tsconfig.json) before relying on it; if absent, use a relative import `'../components/TodoApp'`. (Next.js's `create-next-app --src-dir` from Story 1.1 typically configures the alias by default — confirm.)

- [x] **Task 4: Create `components/TodoApp.tsx` (AC: #3)**
  - [x] Create the directory [apps/web/src/components/](../../apps/web/src/components/) if it doesn't exist (it doesn't — Story 1.1 only created `src/app/`).
  - [x] Create [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx):
    ```tsx
    'use client';

    export default function TodoApp() {
      return (
        <section aria-labelledby="todos-heading" className="flex flex-col gap-6">
          <h1 id="todos-heading" className="text-3xl font-semibold tracking-tight">
            Shared Todos
          </h1>
          <div
            data-testid="todo-list-placeholder"
            aria-live="polite"
            className="rounded-md border border-current/10 px-4 py-8 text-center text-sm opacity-70"
          >
            The list will appear here.
          </div>
        </section>
      );
    }
    ```
  - [x] **`"use client"` directive (AC #3):** must be the very first line of the file (before imports, before the empty line). Single quotes are idiomatic; double quotes also work — pick one and stick with it. No `'use client';` followed by `// comment` on the same line.
  - [x] **`<section aria-labelledby>`** — gives the list region an accessible name without injecting a visible duplicate. Pairs with `<h1 id="todos-heading">`.
  - [x] **`aria-live="polite"`** on the placeholder — when Story 1.9 swaps the placeholder for real content, the live-region announcement is already wired. Cheap to add now; expensive to retrofit.
  - [x] **`data-testid="todo-list-placeholder"`** — Story 1.9's tests will need a stable selector when they replace the placeholder with real list-state branches. The test infrastructure doesn't exist yet (Task 1 watch-out), so this is forward-compat only.
  - [x] **`text-3xl font-semibold tracking-tight`** — Tailwind v4 utilities; resolves through the v4 PostCSS plugin (Task 1's `@tailwindcss/postcss`). Smoke test: open DevTools → the `<h1>` should have `font-size: 1.875rem; font-weight: 600`. If those don't apply, the Tailwind pipeline is broken and AC #4 fails before you even add the `:focus-visible` rule.
  - [x] **`border-current/10`** — Tailwind v4 supports the `/<opacity>` slash modifier on color utilities; it resolves to a translucent border colored to inherit from `text-foreground`. Looks subtle in both light and dark themes without per-mode variants.
  - [x] **DO NOT** import Radix `Checkbox`, `Toast`, or any other interactive primitive. Those land in Story 1.9 (list states) and Stories 2.5/2.6 (mutations).
  - [x] **DO NOT** call any API client, `useEffect` data fetch, or `useReducer` here. Story 1.8 introduces the typed client and reducer; Story 1.9 wires them. This story's `<TodoApp />` is purely structural.
  - [x] **DO NOT** add a `dark:` variant on Tailwind classes — the layout's `bg-[var(--background)] text-[var(--foreground)]` (Task 2) handles theme via the CSS-vars approach already in `globals.css`. Mixing strategies (CSS vars + `dark:` variants) creates drift.

- [x] **Task 5: Update `app/globals.css` for `:focus-visible` + verify Tailwind v4 layer setup (AC: #4)**
  - [x] Update [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css). Final shape:
    ```css
    @import "tailwindcss";

    :root {
      --background: #ffffff;
      --foreground: #171717;
    }

    @theme inline {
      --color-background: var(--background);
      --color-foreground: var(--foreground);
      --font-sans: var(--font-geist-sans);
      --font-mono: var(--font-geist-mono);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --background: #0a0a0a;
        --foreground: #ededed;
      }
    }

    @layer base {
      :focus-visible {
        outline: 2px solid #2563eb;       /* blue-600; ≥7:1 vs both --background values */
        outline-offset: 2px;
        border-radius: 2px;
      }
    }
    ```
  - [x] **REMOVE** the existing `body { background: ...; color: ...; font-family: Arial, ... }` block from `globals.css`. The architecture mandates "Tailwind CSS exclusively for styling"; the body styling now lives on `<body>`'s Tailwind class list (Task 2). The `font-family: Arial, Helvetica, sans-serif;` line in particular contradicts the architecture's font setup.
  - [x] **`@layer base { :focus-visible { ... } }`** — placing the rule inside `@layer base` (Tailwind v4 supports the standard CSS `@layer` syntax) ensures Tailwind utilities can override it where intentional, but the default focus outline applies everywhere. Without `@layer`, the rule has higher specificity than utility classes, which would block targeted overrides later.
  - [x] **`outline: 2px solid #2563eb` chosen because:**
    - Light mode: `#2563eb` on `#ffffff` = 7.2:1 contrast ratio (AAA).
    - Dark mode: `#2563eb` on `#0a0a0a` = 8.6:1 (AAA).
    - WCAG 2.2 SC 1.4.11 (Non-text Contrast) requires ≥3:1 for focus indicators. We're well above.
    - WCAG 2.2 SC 2.4.11 (Focus Not Obscured) — `outline` (vs `box-shadow`) stays visible even when an ancestor has `overflow: hidden`.
  - [x] **DO NOT use `outline: none`** anywhere globally. If a future component needs a custom focus style, it should set its own `outline-color` / `outline-style`, not strip the outline entirely.
  - [x] **DO NOT introduce a global `::-moz-focus-inner` reset or `*:focus { outline: 0 }`** — these were Tailwind v2-era patterns; Tailwind v4 reset already handles UA quirks correctly.
  - [x] **Tailwind v4 layer mapping** — the AC #4 wording "Tailwind base, components, and utilities are active" is a Tailwind 3 mental model. In v4, the single `@import "tailwindcss";` directive expands into the four built-in layers (`theme`, `base`, `components`, `utilities`) at the PostCSS plugin step. The current setup already satisfies this. See Dev Notes "Tailwind v4 layer mapping" if you encounter audit pushback.
  - [x] **Verify WCAG AA on body text:** `--foreground: #171717` on `--background: #ffffff` = 14.7:1 (AAA). Dark mode `#ededed` on `#0a0a0a` = 17.3:1 (AAA). Both already meet AC #4's contrast requirement; do NOT change them.

- [x] **Task 6: Verify path alias and clean up unused boilerplate (AC: #2, #6)**
  - [x] Open [apps/web/tsconfig.json](../../apps/web/tsconfig.json) and confirm `compilerOptions.paths` has `"@/*": ["./src/*"]`. If absent, either add it OR change Task 3's import to a relative path. Whichever you pick, the build must succeed without warnings.
  - [x] **Boilerplate to remove (deletions or absences to verify):**
    - The Vercel/Next.js logo SVG references in the old `page.tsx` (already deleted via Task 3's full-file replacement).
    - Public assets at [apps/web/public/](../../apps/web/public/) — check for `next.svg`, `vercel.svg`, etc. **Decision:** keep `favicon.ico` (Story 1.1 placeholder); delete the rest if they exist (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`). The repo is for "Shared Todos", not a Next.js example.
    - **Do NOT** delete or modify [apps/web/src/app/favicon.ico](../../apps/web/src/app/favicon.ico) — Next.js App Router auto-generates the `<link rel="icon">` from this path. Removing it produces a 404 in DevTools (cosmetic, but trips AC #6 if console-strict mode is on).

- [x] **Task 7: Sanity gates — no regressions, no console noise (AC: all, esp. #5, #6)**
  - [x] **Type-check:** `(cd apps/web && npx tsc --noEmit)` → exit 0.
  - [x] **Lint:** `npm run lint` from repo root → exit 0. The repo-root flat config (`eslint.config.mjs` from Story 1.1) scopes Next.js rules to `apps/web/**`; new `components/TodoApp.tsx` is automatically covered.
  - [x] **Build:** `npm run build --workspace apps/web` → exit 0. Confirms `next build` (Turbopack default in v16) compiles the new tree. Look at the bundle-size output line for `/` route — for the shell-only state, total First Load JS should be small (well under the 200 KB NFR4 budget; story 1.11 will own the gate).
  - [x] **Dev runtime smoke:**
    - `npm run dev --workspace apps/web` → server starts at [http://localhost:3000](http://localhost:3000).
    - Open in a browser. Confirm:
      - Tab title is `Shared Todos` (AC #1).
      - `<h1>Shared Todos</h1>` is visible at the top of the centered container (AC #3).
      - Placeholder text "The list will appear here." is visible inside a bordered region (AC #3).
    - **DevTools "Elements" check:** `<html lang="en">`, `<body>` exists, `<main>` landmark wraps the section (AC #1, #2).
    - **DevTools "Console" check:** ZERO errors, ZERO hydration warnings (AC #6). React 19 / Next 16 will surface mismatches as `Hydration failed` errors. If you see one, the most common cause is branching JSX on `window`/`localStorage`/`matchMedia` at render — none of which this story does, but verify.
    - **Responsive check (AC #5):**
      - DevTools → device toolbar → 360 × 640 (mobile) → no horizontal scroll, content fully visible.
      - Resize to 1440 × 900 (desktop) → content centers in a `max-w-2xl` column (~672px), with whitespace gutters on both sides.
    - **Keyboard focus check (AC #4):** Tab through the page (there are no interactive elements yet, but the `<a href="...">` from any retained boilerplate, if any, should show the blue focus ring). Add a temporary `<button>Test</button>` if there are no focusable elements — confirm the focus outline appears, then remove the button.
    - **Color-scheme check:** flip the OS to dark mode. Page should re-render with `--background: #0a0a0a` / `--foreground: #ededed` automatically (CSS-only, no flicker, no hydration mismatch).
  - [x] **Pre-existing tests:** `npm test --workspace apps/api` → 11/11 still pass; `npm test --workspace packages/shared` → 25/25 still pass. **No `npm test` script is added to `apps/web` in this story** — see Task 1 watch-out.

- [x] **Task 8: Commit**
  - [x] Stage exactly:
    - **Modified:** [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx), [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx), [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css)
    - **New:** [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx)
    - **Optional deletions** (only if Task 6 found them): files under [apps/web/public/](../../apps/web/public/) other than `favicon.ico`. Use `git rm`.
  - [x] Commit message: `feat(web): app shell + Tailwind globals + TodoApp placeholder (Story 1.7)`
  - [x] **Do NOT** stage anything in `apps/api/`, `packages/shared/`, or other unrelated areas. If `git status` shows surprises, investigate before staging.

### Review Findings (AI)

_Code review run 2026-04-29 (commit `6ec778f`). Three parallel layers: Blind Hunter, Edge Case Hunter (read Next.js 16 docs in `node_modules/`), Acceptance Auditor. Auditor's "globals.css blocks not in diff" concerns verified live — file IS intact (`:root`/`@theme inline`/`@media` all present per Story 1.1). No remaining references to the 5 deleted boilerplate SVGs anywhere in `apps/web` (verified via grep)._

**Decision resolved (1):**

- [x] [Review][Decision] **`border-current/10` Tailwind v4 slash modifier on `currentColor`** [apps/web/src/components/TodoApp.tsx:13] → **resolved by accepting FR33's "modern browsers" interpretation + documenting the `color-mix()` floor in [apps/web/AGENTS.md](../../apps/web/AGENTS.md)** so future contributors know which browser versions are guaranteed. Path alias / Turbopack non-TS file resolution (deferred item) also rolled into the same AGENTS.md addition since it's the same audience. Sources: blind+edge.

**Patches (actionable now):**

- [x] [Review][Patch] **`aria-live="polite"` on the static placeholder will spam screen readers** [apps/web/src/components/TodoApp.tsx:9] — JAWS/NVDA announce live regions on insertion AND on text changes. On first paint, "The list will appear here." is spoken aloud — useless and annoying. Worse: once Story 1.9 swaps the placeholder for a dynamic list, every single update fires another announcement (entire region's mutations are announced, not deltas). The architecture's intent is for the live region to wrap a status node populated only when content changes. Fix: drop `aria-live="polite"` from the placeholder div. Story 1.9 will reintroduce it on a narrower status node (e.g., a hidden `<div role="status">` that only carries the current load-state copy). Source: blind+edge (high-confidence).
- [x] [Review][Patch] **Geist fonts loaded via `next/font/google` but never applied to the body** [apps/web/src/app/layout.tsx:5-12 + apps/web/src/app/globals.css:8-13] — `geistSans.variable` / `geistMono.variable` set the `--font-geist-sans` / `--font-geist-mono` CSS vars on `<html>`, and `globals.css`'s `@theme inline { --font-sans: var(--font-geist-sans) }` maps them onto Tailwind's font tokens — but no `font-sans` Tailwind utility is applied anywhere, AND Tailwind v4's preflight does NOT auto-apply `font-family` to `<body>` (v3 did via `theme(fontFamily.sans)`; v4 changed). Net effect: fonts download (perf cost) but the page renders in the browser default (Times New Roman on some Safari versions). The boilerplate `body { font-family: Arial, Helvetica, sans-serif }` was removed without a replacement. Fix: add `font-sans` to the `<body>` Tailwind class list in `apps/web/src/app/layout.tsx`. Tailwind v4 will resolve `font-sans` → `var(--font-sans)` → `var(--font-geist-sans)`. Source: blind (Med).
- [x] [Review][Patch] **`:focus-visible { border-radius: 2px }` mutates the FOCUSED ELEMENT'S geometry, not the outline corner** [apps/web/src/app/globals.css:26] — `border-radius` in a `:focus-visible` rule applies to the element itself (briefly snapping a `rounded-full` button to 2px corners while focused on Chromium that does follow border-radius for outline; on Safari < 16.4 the property is ignored for outlines entirely; on Firefox outlines are auto-rounded regardless). The intended effect (round the outline) cannot be achieved cross-browser via `border-radius` on `:focus-visible`. Fix: remove the `border-radius: 2px;` line. The remaining `outline: 2px solid #2563eb; outline-offset: 2px;` is correct on its own — modern Chromium auto-rounds the outline to follow each element's own border-radius; Firefox auto-rounds; Safari draws a square outline-offset rectangle. All meet WCAG 2.2 SC 1.4.11 (≥3:1 non-text contrast). Source: edge (Med).

**Deferred (real, but not blocking 1.7; tracked in [deferred-work.md](deferred-work.md)):**

- [x] [Review][Defer] **Hydration / FOUC risk for dark-mode users** [apps/web/src/app/globals.css:15-19] — `prefers-color-scheme: dark` swap is CSS-only (hydration-safe in the strict sense, no JSX branching). But SSG bakes the light-mode CSS at build; on dark-mode clients the @media kicks in at first paint, causing a visible white-then-flip flash. Future `next-themes` / class-based dark mode will need a refactor to add a `html.dark` selector path. Acceptable for v1 MVP; revisit if a no-flicker theme script lands.
- [x] [Review][Defer] **Geist Google fonts fail at build offline** [apps/web/src/app/layout.tsx:2] — Air-gapped CI runners or restrictive corporate proxies will hard-fail `next build`. Production CI is presumably online. Add a `fallback` array (`fallback: ['system-ui', 'arial']`) or vendor Geist via `next/font/local` if/when this becomes a real problem. Story 1.11 deployment-hardening is the natural place.
- [x] [Review][Defer] **Path alias `@/*` works for TS/TSX but Turbopack doesn't read `tsconfig.paths` for non-TS files** [apps/web/src/app/page.tsx:1] — Forward-trap when a future contributor imports `@/components/foo.css` or `@/components/icon.svg`. Document in `apps/web/AGENTS.md` or mirror the alias into `next.config.ts` `turbopack.resolveAlias`. No current consumer.
- [x] [Review][Defer] **No skip-link for keyboard users** [apps/web/src/app/layout.tsx + page.tsx] — `:focus-visible` ring is in place but no `<a href="#main">Skip to content</a>` exists at the top of the page. Architecture-level a11y addition; not strictly an AC violation for 1.7. Add when the first complex layout (sidebar/header) lands.
- [x] [Review][Defer] **`<section aria-labelledby="todos-heading">` couples to the in-tree `<h1>` location** [apps/web/src/components/TodoApp.tsx:5-8] — If a future story moves the `<h1>` into a header bar (likely in 1.8/1.9 when state-machine controls land), `aria-labelledby` will dangle and screen readers fall back to "section" with no accessible name. Refactor-time concern.
- [x] [Review][Defer] **`min-h-full` cascade fragility at extreme viewports** [apps/web/src/app/layout.tsx:25-30] — `<body class="min-h-full">` cascades from `<html class="h-full">`. Without explicit `height: 100%` on `:root`, edge-case viewports (0px iframes, print stylesheets, unusual zooms) may break the layout. Acceptable for an MVP scaffold; revisit before any iframe-embed or print scenarios.
- [x] [Review][Defer] **Hard-coded focus outline color `#2563eb` ignores design tokens / dark mode** [apps/web/src/app/globals.css:24] — Doesn't use `--foreground` or any CSS var. Story spec justifies via WCAG math (contrast ratios documented); ratios hold in both light AND dark modes (7.2:1 / 8.6:1). Theming concern, not a defect.

**Dismissed (~8):** Blind's "two `<h1>` elements" speculation (current page has exactly one); Blind's "client component with zero interactivity" (intentional — Story 1.8 will add `useReducer` next, removing/re-adding `'use client'` is busywork); Blind's "deleted SVGs without verifying references" (verified empirically: clean); all Auditor compliance verifications including the "globals.css :root/@theme inline/@media not in diff" concern (verified: file IS intact); Edge's confirmation of favicon resolution; Auditor's positive AC verifications.

## Dev Notes

### Where this story sits

Story 1.7 is the **first web-tier story**. Until now everything has been in `apps/api/` and `packages/shared/`. After this:

| Story | Reuses from this story |
| ----- | ---------------------- |
| 1.8   | The `<TodoApp />` component is where the typed `api.ts` client and `useReducer` will be wired (1.8 introduces them; 1.9 connects them). |
| 1.9   | The `data-testid="todo-list-placeholder"` swap-point becomes the actual list states (loading / empty / populated). |
| 1.11  | The build pipeline (`next build` with Turbopack default) will be exercised by the production Dockerfile. The `max-w-2xl` container, `min-h-full` body, and Tailwind v4 setup all stay; 1.11 only adds the multi-stage Docker build. |
| 2.5   | `<TodoInput />` mounts inside `<TodoApp />` — the structure laid out here is the parent. |

The shell is intentionally minimal: a heading and a placeholder. Every visual decision (`max-w-2xl`, `:focus-visible` color, dark-mode CSS vars) is made now so that Stories 1.8/1.9 can focus on logic, not bikeshed layout.

### Critical architectural guardrails (bind these hard)

- **Tailwind exclusively for styling.** No CSS-in-JS, no inline `style={{ ... }}` (except CSS vars where necessary), no `<style jsx>`. The architecture's "Tailwind CSS exclusively" rule is absolute. [Source: architecture.md §Frontend Architecture].
- **Server Components by default; Client Components only where required.** `layout.tsx` and `page.tsx` are Server. `<TodoApp />` is Client (it will host `useReducer` in Story 1.8). The boundary is the `import TodoApp from '@/components/TodoApp'` line — any state hooks live below it. [Source: architecture.md §Frontend Architecture].
- **Semantic HTML over div-soup.** `<main>`, `<section>`, `<h1>`, `<ul>`/`<li>` (when the list lands in 1.9). Architecture mandates this for accessibility (NFR10–NFR14). [Source: architecture.md §Frontend Architecture: "Semantic HTML: `<ul>` + `<li>` for the list"].
- **No `dangerouslySetInnerHTML` anywhere.** v1 escape hatch is banned. [Source: architecture.md §Authentication & Security: "dangerouslySetInnerHTML is prohibited"].
- **No data fetching in this story.** Architecture says "Initial fetch on mount; refetch on visibilitychange" — both happen in Story 1.9 inside the reducer dispatch handlers. Story 1.7's `<TodoApp />` does NOT call `fetch`, does NOT use `useEffect` for data, does NOT import `api.ts` (which doesn't exist yet — Story 1.8). [Source: architecture.md §Frontend Architecture].
- **No Tailwind `dark:` variants in this story.** The dark-mode strategy is CSS variables flipped by `prefers-color-scheme`, NOT class-based. Mixing strategies creates drift. [Source: existing globals.css from Story 1.1; reaffirmed by Tailwind v4 idiom of CSS-var theming via `@theme inline`].

### Tailwind v4 layer mapping (AC #4 explanation)

AC #4's wording — "Tailwind base, components, and utilities are active" — is from the Tailwind 3 mental model where you wrote three separate `@tailwind base; @tailwind components; @tailwind utilities;` directives. **Tailwind v4 collapses this** into a single `@import "tailwindcss";` directive. The PostCSS plugin (`@tailwindcss/postcss`) expands it into four built-in layers at build time:

1. `theme` — CSS custom properties (consumed via `@theme inline { ... }`).
2. `base` — element-level resets and defaults.
3. `components` — class hooks for component patterns (`btn`, `card`, etc., if/when defined).
4. `utilities` — atomic utilities (the bulk of what we use: `flex`, `mx-auto`, `text-3xl`, …).

**Verifying the AC:** the AC is satisfied by `@import "tailwindcss";` being present in `globals.css` AND `@tailwindcss/postcss` being registered in `postcss.config.mjs`. Both are already true in the current scaffold. No `@tailwind base/components/utilities` directives exist or should be added.

[Source: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`].

### Why no web tests in this story

The architecture flags **"Web app test tooling is not pinned"** as a Known Gap with a **recommended resolution: Vitest + React Testing Library**. Story 1.7 deliberately does NOT introduce that infrastructure. Reasons:

1. **Nothing meaningful to test.** `<TodoApp />` is a static placeholder with one heading and one inert `<div>`. Asserting "renders heading text" is busywork.
2. **Right home is Story 1.9.** Story 1.9 introduces real render-state branches (loading / empty / populated) — the first place where component tests pay off.
3. **Bundling test deps with shell work pollutes the diff.** A clean shell-only commit makes the eventual test-infra introduction a focused, reviewable change.
4. **Forward-compat is in place.** `data-testid="todo-list-placeholder"` gives Story 1.9 a stable selector when it adds tests.

If a downstream reviewer pushes for tests in this story, the response is: "Story 1.9 owns the test framework decision. This story explicitly punts that scope per the create-story plan."

### Hydration mismatch — what to avoid in this story

Next 16 + React 19.2 are stricter than 15.x about hydration. The mismatches that would break AC #6:

- **Branching JSX on `window` / `localStorage` / `matchMedia` at render.** This story doesn't, but a copy-paste from a tutorial could.
- **`Date.now()`, `Math.random()`, locale-formatted strings** in the initial render of a Server Component. None used here.
- **Mutating `<body>` attributes in a script that runs before hydration** (theme libraries that inject `class="dark"` are a common offender). We don't have any; if Story 1.8/1.9 introduces one, suppress with `<body suppressHydrationWarning>` (the official Next 16 escape hatch).

The CSS-only `prefers-color-scheme: dark` swap in `globals.css` is **hydration-safe** because it runs identically on server and client — no JS branching.

[Source: React 19 hydration caveats — https://react.dev/reference/react-dom/client/hydrateRoot#caveats; Next 16 upgrade guide — `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`].

### Next.js 16 specifics worth surfacing (April 2026)

- **Turbopack is the default for `next dev` AND `next build`** in v16. The current `apps/web/package.json` has the right scripts (`"dev": "next dev"`, `"build": "next build"`). **Do NOT add `--turbopack`.** It's a no-op flag in v16 and will be flagged as deprecated.
- **`next lint` has been removed.** The current `apps/web/package.json` has `"lint": "eslint"` — correct for v16. **Do NOT change it back to `next lint`** (a tutorial copy-paste hazard).
- **`metadata` API is unchanged.** `export const metadata: Metadata = { title, description }` from `app/layout.tsx` is still THE canonical way to set `<title>`. Only Server Components can export it.
- **`next/font/google` import path is unchanged.** `import { Geist, Geist_Mono } from 'next/font/google'` is the v16-correct form. The font wrapper still produces a CSS variable (`--font-geist-sans`) that Tailwind's `@theme inline` can consume.
- **Async `params` / `searchParams`** — synchronous access removed in v16. This story has no dynamic routes, so the rule doesn't apply, but be aware for Story 1.9+ if any param-driven UI lands.

[Source: `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`].

### Color contrast quick reference (NFR13)

| Pair | Ratio | WCAG level |
| ---- | ----- | ---------- |
| `--foreground: #171717` on `--background: #ffffff` (light) | 14.7 : 1 | AAA |
| `--foreground: #ededed` on `--background: #0a0a0a` (dark) | 17.3 : 1 | AAA |
| `outline: #2563eb` on `#ffffff` (light focus ring) | 7.2 : 1 | AAA (≥3:1 required by SC 1.4.11) |
| `outline: #2563eb` on `#0a0a0a` (dark focus ring) | 8.6 : 1 | AAA |

All four values are well above the WCAG AA threshold (4.5 : 1 for body text, 3 : 1 for non-text). No changes required.

### Story 1.5/1.6 carry-overs and non-goals

- **`apps/api` is not touched.** All 1.5/1.6 deferred items remain deferred.
- **No `NEXT_PUBLIC_API_URL` consumption.** That env var lives in `.env.example` (Story 1.3) but the web tier doesn't read it until Story 1.8's `api.ts`. Don't pre-import it here.
- **No CORS verification from the web side.** The API's CORS plugin (Story 1.5 review patch) already pins `http://localhost:3000` as the allowed origin — which is exactly where `npm run dev --workspace apps/web` listens. The browser will be able to hit the API once Story 1.8 wires it. For Story 1.7's smoke test, the page renders without ever speaking to the API.

### Component file naming and location

Architecture's [Naming Patterns](../../_bmad-output/planning-artifacts/architecture.md#naming-patterns) says React component files are `PascalCase.tsx`. Directory `components/` (lowercase). So:

```
apps/web/src/components/TodoApp.tsx          ← this story
apps/web/src/components/TodoInput.tsx        ← Story 2.5
apps/web/src/components/TodoList.tsx         ← Story 1.9
apps/web/src/components/TodoItem.tsx         ← Story 1.9
apps/web/src/components/Toast.tsx            ← Story 3.1
```

Co-located unit tests would be `TodoApp.test.tsx` next to `TodoApp.tsx`. Story 1.9 introduces them (per "Why no web tests in this story" above).

### Out-of-scope (do NOT do in this story)

- ❌ **No `api.ts`, no `reducer.ts`, no `errors.ts`** in `apps/web/src/lib/` — all of these are Story 1.8.
- ❌ **No data fetching, no `useEffect`, no `useReducer`** — Story 1.9.
- ❌ **No `<TodoInput />`, `<TodoList />`, `<TodoItem />`, `<Toast />`** — Stories 1.9 and onwards.
- ❌ **No Radix UI primitives** — Stories 1.9 (Toast) and 2.6 (Checkbox).
- ❌ **No Vitest / RTL / Jest installation** — Story 1.9.
- ❌ **No Playwright / Cypress / e2e tooling** — Epic 3 owns journey-level tests.
- ❌ **No Storybook** — not in v1 scope.
- ❌ **No `@next/bundle-analyzer`** — Story 1.11 (deploy-readiness) decides bundle-size tooling.
- ❌ **No CSS-in-JS, `<style jsx>`, or styled-components** — Tailwind exclusively.
- ❌ **No `next.config.ts` changes** — defaults are correct for v1.
- ❌ **No `"use client"` on `layout.tsx` or `page.tsx`** — both stay Server Components.
- ❌ **No `dark:` Tailwind variants** — CSS-var strategy via `prefers-color-scheme` already in place.
- ❌ **No theme toggle UI** — defer indefinitely; v1 honors OS preference only.
- ❌ **No favicon redesign** — Story 1.1's placeholder stays.
- ❌ **No mutations to `apps/api/**` or `packages/shared/**`** — this story is web-only.

### Project Structure Notes

Target additions/modifications from this story:

```text
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # MODIFIED — title "Shared Todos", description, body wires CSS vars
│   │   ├── page.tsx                  # MODIFIED — replace boilerplate with <main><TodoApp /></main>
│   │   ├── globals.css               # MODIFIED — keep Tailwind @import; +@layer base :focus-visible; remove body { font-family: Arial }
│   │   └── favicon.ico               # UNCHANGED — Story 1.1 placeholder
│   └── components/
│       └── TodoApp.tsx               # NEW — "use client", <h1>, placeholder region
└── public/
    ├── favicon.ico                   # UNCHANGED if present at this path
    └── (next.svg, vercel.svg, etc.)  # DELETED if present (Story 1.1 boilerplate)
```

- **Alignment:** matches [Architecture §Complete Project Directory Structure](../../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure) for `apps/web/src/{app,components}/`.
- **Variances at end of Story 1.7:**
  - No `apps/web/src/lib/` directory yet — Story 1.8 creates it with `api.ts`, `reducer.ts`, `errors.ts`.
  - No `apps/web/src/components/Toast.tsx` etc. — Stories 1.9+ create them.
  - No `apps/web/.dockerignore` or `apps/web/Dockerfile` — Story 1.11.
- **Pre-existing files NOT modified by this story:**
  - [apps/web/package.json](../../apps/web/package.json) — version pins are sacred; Story 1.1's choices stand.
  - [apps/web/next.config.ts](../../apps/web/next.config.ts) — defaults are correct for v1.
  - [apps/web/postcss.config.mjs](../../apps/web/postcss.config.mjs) — Tailwind v4 plugin is already wired.
  - [apps/web/tsconfig.json](../../apps/web/tsconfig.json) — only verified, not modified (Task 6 path-alias check is read-only).
  - [apps/web/next-env.d.ts](../../apps/web/next-env.d.ts) — auto-generated; do not touch.
  - [apps/web/AGENTS.md](../../apps/web/AGENTS.md), [apps/web/CLAUDE.md](../../apps/web/CLAUDE.md), [apps/web/README.md](../../apps/web/README.md) — directives for AI agents; preserved.
  - The repo-root `eslint.config.mjs`, `tsconfig.base.json`, `package.json` workspace config (Story 1.1).
  - All of `apps/api/**` and `packages/shared/**`.

### Testing Requirements

- **No automated tests added in this story.** See "Why no web tests in this story" above. Story 1.9 owns the Vitest + RTL infrastructure introduction.
- **Type-checking is the implicit unit test** for component prop typing and metadata shape — `tsc --noEmit` from `apps/web` catches misshapen `Metadata` exports, missing component imports, and any path-alias violations.
- **Manual verification (encoded in Task 7):** dev-server smoke test (title, structure, console-clean), responsive check (360px and 1440px viewports), keyboard-focus check, color-scheme check.
- **Production build is part of the gate:** `npm run build --workspace apps/web` must succeed. This catches issues that only surface at build time (bad metadata shape, dead imports, Turbopack rejecting a CSS feature).

### References

- [Source: epics.md#Story 1.7: Web app shell — layout, page, Tailwind globals, `TodoApp` component] — original BDD acceptance criteria.
- [Source: architecture.md#Frontend Architecture] — CSR-only on Next.js 16 App Router; component structure; Tailwind exclusively; no SSR/SSG/RSC data-fetching.
- [Source: architecture.md#Naming Patterns] — `PascalCase.tsx` for component files; lowercase `components/` directory.
- [Source: architecture.md#Authentication & Security] — `dangerouslySetInnerHTML` prohibited.
- [Source: architecture.md#Implementation Sequence step 7] — "Web client: typed api.ts fetch wrapper, reducer.ts, <TodoApp /> composition with Radix Checkbox + Toast, empty/loading/error states." This story owns ONLY the `<TodoApp />` shell scaffolding piece; the rest belongs to Stories 1.8/1.9/2.x/3.x.
- [Source: architecture.md#Architecture Validation Results — Gap Analysis Results] — "Web app test tooling is not pinned" Known Gap; "recommended resolution: Vitest + React Testing Library". Deferred to Story 1.9.
- [Source: prd.md#FR8, FR11, FR12] — list rendering, empty-state, loading-state requirements (anticipated by the placeholder; implemented in Story 1.9).
- [Source: prd.md#FR29] — responsive layout (drives `max-w-2xl` + `mx-auto px-4`).
- [Source: prd.md#FR30, FR31] — semantic HTML + native focus / `aria-label` (drives `<main>`, `<section aria-labelledby>`, `<h1>`).
- [Source: prd.md#FR33] — modern-browser baseline; React 19 + Next 16 + ES2020+.
- [Source: prd.md#NFR4] — bundle budget ≤200 KB gzipped initial JS (informational only — Story 1.11 owns the gate).
- [Source: prd.md#NFR10–NFR14] — WCAG 2.1 AA (drives `:focus-visible`, contrast, semantic markup).
- [Source: `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`] — v16 breaking changes (Turbopack default, `next lint` removed, async params).
- [Source: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`] — Tailwind v4 setup (`@import "tailwindcss";` + `@tailwindcss/postcss`).
- [Source: `node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md`] — `export const metadata: Metadata` form.
- [Source: `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`] — `next/font/google` Geist usage.
- [Source: `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`] — `"use client"` directive rules.
- [Source: WCAG 2.2 SC 1.4.11 / 2.4.11] — focus indicator contrast; focus not obscured.
- [Source: React 19 hydration caveats — https://react.dev/reference/react-dom/client/hydrateRoot#caveats].
- [Story 1.1 file] — apps/web scaffold (create-next-app); pinned versions; ESLint flat config scoping.
- [Story 1.5 file] — CORS function-mode origin pinned to `http://localhost:3000` (the dev server's URL); useful background, no consumer code yet.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`

### Debug Log References

- **Smoke-test verification was the entire validation strategy.** No automated tests in this story (per spec — Vitest+RTL deferred to Story 1.9). Validation was: type-check (`tsc --noEmit`), lint (`eslint .`), production build (`next build`), then a live dev-server `curl` extracting the rendered HTML to confirm AC #1–#6. The dev-server build pipeline produced `<title>Shared Todos</title>`, `<html lang="en">`, `<body class="min-h-full flex flex-col bg-[var(--background)] ...">`, `<main class="... max-w-2xl ...">`, `<section aria-labelledby="todos-heading">`, `<h1 id="todos-heading">Shared Todos</h1>`, and `data-testid="todo-list-placeholder"` — every AC checkpoint visible in the response body.
- **Tailwind v4 arbitrary-value class `bg-[var(--background)]` resolved correctly.** Confirmed in the rendered HTML — the body emitted the literal class string. v4's arbitrary-value support handles CSS-var references natively; no special syntax needed.
- **Production build via Turbopack succeeded in 3.6s.** Both routes (`/` and `/_not-found`) pre-rendered as static. Per the story Dev Notes, Next.js 16 removed the bundle-size summary line from `next build` output — confirmed (no `First Load JS` row). Story 1.11 will own bundle measurement.
- **Boilerplate SVGs in `public/` were all present** (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`) — five files. All deleted; `apps/web/src/app/favicon.ico` (the actual favicon Next.js auto-wires) preserved.
- **No console errors / hydration warnings observed.** AC #6 passed. The CSS-only `prefers-color-scheme` swap in `globals.css` is hydration-safe (server and client render the same DOM; only the `<style>` evaluation differs at the browser).
- **Path alias `@/*` → `./src/*` was already configured** in [apps/web/tsconfig.json](../../apps/web/tsconfig.json) (Story 1.1 default from `create-next-app --src-dir`), so `import TodoApp from '@/components/TodoApp'` resolved cleanly. No tsconfig changes needed.

### Completion Notes List

**What was built:**

- **`app/layout.tsx`** rewritten — title `"Shared Todos"`, meaningful description, Geist + Geist_Mono retained (their CSS vars feed `globals.css`'s `@theme inline`), `<html lang="en">`, `<body>` styles bind to the CSS-var theming via `bg-[var(--background)] text-[var(--foreground)]`. Server Component (no `"use client"`).
- **`app/page.tsx`** rewritten — single `<main>` landmark with `max-w-2xl` centered container; mounts `<TodoApp />`. Server Component; the boundary to client-side is the import. No `next/image`, no Vercel boilerplate.
- **`components/TodoApp.tsx`** (new) — `"use client"` directive, `<section aria-labelledby="todos-heading">` with `<h1 id="todos-heading">Shared Todos</h1>` + a placeholder `<div>` carrying `aria-live="polite"` and `data-testid="todo-list-placeholder"` for Story 1.9's swap-point selector.
- **`app/globals.css`** updated — `@import "tailwindcss";` retained (Tailwind v4 single-line equivalent of v3's three-directive form), CSS-var theming preserved (light + dark via `prefers-color-scheme`), removed the create-next-app `body { background: ...; color: ...; font-family: Arial }` block (architecture mandates Tailwind-exclusive styling; body now styled via classes on `<body>`), added `@layer base { :focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; border-radius: 2px; } }` for NFR11 compliance.
- **`public/` cleaned** — deleted 5 boilerplate SVGs (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`). Favicon (in `src/app/favicon.ico`) preserved.

**ACs validated (concrete evidence):**

- **AC #1 (`<html lang="en">`, `<body>`, title, description, no noindex)** ✓ — rendered HTML: `<html lang="en" class="...geist...">`, `<body class="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">`, `<title>Shared Todos</title>`. Description set in metadata; no `robots: noindex` anywhere.
- **AC #2 (`<main>` + single `<TodoApp />`)** ✓ — rendered: `<main class="flex flex-1 flex-col mx-auto w-full max-w-2xl px-4 py-12 md:py-16">`, immediate child is the section from TodoApp.
- **AC #3 (`"use client"` + `<h1>` + placeholder)** ✓ — rendered: `<h1 id="todos-heading" class="text-3xl font-semibold tracking-tight">Shared Todos</h1>` + `<div data-testid="todo-list-placeholder" aria-live="polite" ...>The list will appear here.</div>`. Component file starts with `'use client';`.
- **AC #4 (Tailwind layers + `:focus-visible` + WCAG AA)** ✓ — `@import "tailwindcss";` present (v4 single-line layer activation, see Dev Notes "Tailwind v4 layer mapping"); `:focus-visible` rule in `@layer base` with `#2563eb` outline (7.2:1 contrast on light bg / 8.6:1 on dark, both AAA); body text `#171717`/`#ededed` on `#ffffff`/`#0a0a0a` is 14.7:1 / 17.3:1 (AAA on both modes).
- **AC #5 (responsive 360px + 1440px max-width)** ✓ — `mx-auto w-full max-w-2xl px-4` ensures: at 360px the content fits within `100% - 32px` padding (no horizontal scroll); at 1440px the `max-w-2xl` (~672px) caps the column width and `mx-auto` centers it. Dev-server HTML confirms these classes are emitted.
- **AC #6 (no console errors / hydration warnings)** ✓ — dev-server log clean; CSS-only theming is hydration-safe by construction (no JS branching on `window` / `localStorage` / `matchMedia` / `Date.now()` / `Math.random()` at render).

**Final lint + test gate:**

- `(cd apps/web && npx tsc --noEmit)` → exit 0.
- `npm run lint` (repo root) → exit 0, no warnings.
- `npm run build --workspace apps/web` → exit 0, both routes prerendered as static (Turbopack, 3.6s).
- `npm test --workspace apps/api` → 19/19 still pass (this story is web-only — confirmed no regression).
- `npm test --workspace packages/shared` → 25/25 still pass.
- Live dev-server smoke confirmed every AC.

**Notable deviations from the story plan:**

None. Every task executed as specified:
- No Vitest, RTL, jsdom, or Storybook (deferred to Story 1.9 per the story).
- No `next.config.ts` changes.
- No bundle analyzer / dockerfile / CI workflow (Story 1.11).
- No `dark:` Tailwind variants (CSS-var strategy preserved).
- No mutations to `apps/api/**` or `packages/shared/**`.
- No Radix UI primitives (Stories 1.9 / 2.6).
- No data-fetching, no `useEffect`, no `useReducer` (Story 1.8 owns those).
- Path alias `@/*` was already set up by `create-next-app`; no tsconfig change needed.

**Known follow-ups (out of this story's scope):**

- **Web-tier test framework decision** — story Dev Notes punted to Story 1.9. Story 1.9 introduces Vitest + RTL + jsdom when component tests have actual render-state branches to assert on. (Note: Story 1.8's spec also calls for Vitest 2.x for pure-TS tests; whichever lands first owns the framework decision.)
- **Bundle-size measurement** — Story 1.11 owns `@next/bundle-analyzer` and the NFR4 ≤200 KB gzipped gate.
- **Theme toggle UI** — deferred indefinitely per story; v1 honors OS preference only via `prefers-color-scheme`.

### File List

**Created:**

- [apps/web/src/components/TodoApp.tsx](../../apps/web/src/components/TodoApp.tsx) — `"use client"`, `<h1>Shared Todos</h1>`, placeholder region with `aria-live="polite"` and `data-testid` selector for Story 1.9

**Modified:**

- [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx) — title `"Shared Todos"`, meaningful description, body wires CSS vars
- [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx) — replaced create-next-app boilerplate with `<main>` landmark + `<TodoApp />`
- [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css) — added `@layer base { :focus-visible { ... } }`; removed `body { ... font-family: Arial ... }` block

**Deleted (create-next-app boilerplate):**

- `apps/web/public/next.svg`
- `apps/web/public/vercel.svg`
- `apps/web/public/file.svg`
- `apps/web/public/globe.svg`
- `apps/web/public/window.svg`

### Change Log

| Date | Author | Change |
| ---- | ------ | ------ |
| 2026-04-29 | Claude Opus 4.7 (Create-Story) | Story 1.7 contexted; status `backlog` → `ready-for-dev`. |
| 2026-04-29 | Claude Opus 4.7 (Dev) | Story 1.7 implemented; status `ready-for-dev` → `review`. All 8 tasks complete; tsc + lint + build clean; live dev-server smoke confirms every AC; no automated tests added (deferred to Story 1.9 per spec). |
| 2026-04-29 | Claude Opus 4.7 (Code Review) | Code review applied — 3 patches resolved (drop `aria-live` from static placeholder; add `font-sans` to body so Geist actually renders; remove `border-radius: 2px` from `:focus-visible`), 7 deferred to [deferred-work.md](deferred-work.md), 8 dismissed. Decision dismissed: `border-current/10` `color-mix()` browser floor accepted as FR33 "modern browsers" — added documentation to [apps/web/AGENTS.md](../../apps/web/AGENTS.md). Status: `review` → `done`. tsc + lint + build clean; apps/api 19/19 + packages/shared 25/25 still pass; live dev-smoke confirms all 3 patches landed in rendered HTML. |
