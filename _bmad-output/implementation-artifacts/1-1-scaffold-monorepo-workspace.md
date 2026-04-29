# Story 1.1: Scaffold monorepo workspace

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer joining the project,
I want a working monorepo with the web and API apps scaffolded and wired to a shared package,
So that every subsequent story has a place for its code and `npm install` at the root resolves everything.

## Acceptance Criteria

1. **Given** a fresh empty directory,
   **When** the scaffolding commands from Architecture §Starter Template are executed (`npm init -y`, `npx create-next-app@latest apps/web --typescript --app --eslint --tailwind --src-dir --use-npm --yes`, `npx fastify-cli@latest generate apps/api --lang=typescript`, `mkdir -p packages/shared/src`),
   **Then** the resulting tree contains `apps/web/`, `apps/api/`, `packages/shared/` and a root `package.json` with `"workspaces": ["apps/*", "packages/*"]`,
   **And** no third-party combined starter is used.

2. **Given** the scaffolded workspace,
   **When** a developer runs `npm install` from the root,
   **Then** all three workspace packages install successfully into a single root `node_modules`,
   **And** `packages/shared` is resolvable from both apps as `@todo-app/shared`.

3. **Given** the scaffolded workspace,
   **When** inspecting root config files,
   **Then** `tsconfig.base.json` defines `strict: true` and a shared `moduleResolution` and is extended by `apps/web/tsconfig.json`, `apps/api/tsconfig.json`, and `packages/shared/tsconfig.json`,
   **And** `.nvmrc` pins Node 22,
   **And** `.editorconfig`, `.prettierrc`, and `.eslintrc.cjs` are present at the root,
   **And** `.eslintrc.cjs` extends `eslint:recommended`, `@typescript-eslint/recommended`, and Next.js's config.

4. **Given** the ESLint config at the root,
   **When** a file in `apps/web/` attempts to import from `apps/api/` (or vice versa),
   **Then** the lint run fails with a `no-restricted-imports` error.

5. **Given** the scaffolded workspace,
   **When** `.gitignore` is inspected,
   **Then** it ignores `node_modules/`, `.next/`, `dist/`, `.env`, and other build artifacts.

## Tasks / Subtasks

- [x] **Task 1: Initialize workspace root (AC: #1, #3)**
  - [x] Run `npm init -y` at repo root; edit generated `package.json` to set `"private": true`, `"name": "todo-app"`, and `"workspaces": ["apps/*", "packages/*"]`
  - [x] Create `.nvmrc` containing `22` (matches Architecture: Node 22 LTS)
  - [x] Create `.editorconfig` with sane defaults (UTF-8, LF, 2-space indent, trim trailing whitespace, final newline)
  - [x] Create `.prettierrc` with Prettier defaults (empty `{}` is acceptable per Architecture: "Prettier defaults")
  - [x] Create `.prettierignore` (ignore `node_modules/`, `.next/`, `dist/`, `apps/api/drizzle/`, `package-lock.json`)
  - [x] Create root `.gitignore` covering `node_modules/`, `.next/`, `dist/`, `.env`, `.env.local`, `*.log`, `.DS_Store`, `coverage/`, `.turbo/`, `build/`

- [x] **Task 2: Create shared TypeScript base config (AC: #3)**
  - [x] Create `tsconfig.base.json` at repo root with `"strict": true`, `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"esModuleInterop": true`, `"skipLibCheck": true`, `"forceConsistentCasingInFileNames": true`, `"noUncheckedIndexedAccess": true`, `"resolveJsonModule": true`
  - [x] Do NOT set `paths` here — workspace symlinks + package `exports` handle resolution (avoids drift)

- [x] **Task 3: Scaffold Next.js web app (AC: #1)**
  - [x] From repo root, run exactly: `npx create-next-app@latest apps/web --typescript --app --eslint --tailwind --src-dir --use-npm --yes`
  - [x] Verify `apps/web/src/app/{layout,page,globals.css}.tsx` exist (App Router layout)
  - [x] Edit `apps/web/tsconfig.json` to add `"extends": "../../tsconfig.base.json"` at the top; preserve the CNA-generated `compilerOptions` that are Next.js-specific (`jsx: "preserve"`, `plugins: [{ name: "next" }]`, `incremental: true`, path aliases) — do not delete them
  - [x] Confirm `apps/web/package.json` has a unique name (`web` is fine; CNA generates this) and does NOT duplicate root-level devDeps where it can inherit

- [x] **Task 4: Scaffold Fastify API app (AC: #1)**
  - [x] From repo root, run exactly: `npx fastify-cli@latest generate apps/api --lang=typescript`
  - [x] Verify `apps/api/src/app.ts`, `apps/api/src/routes/`, `apps/api/src/plugins/` exist (fastify-cli default layout)
  - [x] Edit `apps/api/tsconfig.json` to add `"extends": "../../tsconfig.base.json"` at the top; keep fastify-cli's `outDir`, `rootDir`, and any CJS/ESM settings it generated
  - [x] Rename `apps/api/package.json` `name` field to `api` (or leave as fastify-cli default if already unique within workspace)

- [x] **Task 5: Create packages/shared (AC: #1, #2, #3)**
  - [x] Create directory: `packages/shared/src/`
  - [x] Create `packages/shared/src/index.ts` with a single re-export placeholder: `export {};` (contracts land in Story 1.2)
  - [x] Create `packages/shared/package.json`:
    - `"name": "@todo-app/shared"`
    - `"version": "0.0.0"`
    - `"private": true`
    - `"type": "module"`
    - `"main": "./src/index.ts"` **and** `"types": "./src/index.ts"` — consumed directly as TS source (no build step in v1; both apps run through their own TypeScript compilers)
    - `"exports": { ".": "./src/index.ts" }`
    - `"files": ["src"]`
  - [x] Create `packages/shared/tsconfig.json` extending `../../tsconfig.base.json`, with `"include": ["src/**/*"]` and `"compilerOptions": { "outDir": "dist", "declaration": true }` (declaration output is forward-looking; not required to build in v1)

- [x] **Task 6: Wire root ESLint config with cross-app import ban (AC: #3, #4)**
  - [x] Install root devDeps: `npm install -D -w . eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-next eslint-plugin-import` (hoists to root `node_modules`)
  - [x] Create `.eslintrc.cjs` at repo root:
    - `root: true`
    - `parser: '@typescript-eslint/parser'`
    - `plugins: ['@typescript-eslint', 'import']`
    - `extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'next']` — order matters; Next.js last so it wins for web
    - `parserOptions: { ecmaVersion: 2022, sourceType: 'module' }`
    - `ignorePatterns: ['node_modules/', 'dist/', '.next/', 'apps/api/drizzle/', 'coverage/']`
    - `overrides: [{ files: ['apps/web/**'], rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/apps/api/**', 'apps/api/*'], message: 'Cross-app import blocked: apps/web must not import from apps/api. Use @todo-app/shared + HTTP.' }] }] } }, { files: ['apps/api/**'], rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/apps/web/**', 'apps/web/*'], message: 'Cross-app import blocked: apps/api must not import from apps/web. Use @todo-app/shared + HTTP.' }] }] } }]`
  - [x] Delete any per-app `.eslintrc*` file that `create-next-app` or `fastify-cli` generated (so the root config is authoritative) — **OR** keep app-level configs with `root: false` and extend the root config. Pick one pattern and apply it consistently. Recommendation: delete per-app configs; single-source-of-truth aligns with Architecture §Enforcement Guidelines
  - [x] Verify: create a throwaway file `apps/web/src/_cross-import-check.ts` containing `import '../../../apps/api/src/app';`, run `npm run lint --workspace apps/web`, confirm it errors with the custom `no-restricted-imports` message, then delete the throwaway file

- [x] **Task 7: Root-level install verification (AC: #2)**
  - [x] Run `npm install` from repo root
  - [x] Confirm exactly one `node_modules/` at the repo root (not inside each app)
  - [x] Confirm `ls -la node_modules/@todo-app/shared` is a symlink pointing to `../../packages/shared`
  - [x] In `apps/web/src/`, create a throwaway file that imports from `@todo-app/shared` (e.g., `import * as shared from '@todo-app/shared';`), run `npx tsc --noEmit` from `apps/web/`, confirm it resolves; repeat from `apps/api/`. Delete throwaway files before commit

- [x] **Task 8: Commit the scaffolded baseline (AC: all)**
  - [x] `git init` if not yet initialized
  - [x] `git add -A && git commit -m "chore: scaffold monorepo workspace (Story 1.1)"`
  - [x] Do NOT commit `node_modules/`, `.next/`, or `dist/` (verify via `.gitignore`)

## Dev Notes

### This story's purpose (read first)

The sole deliverable is a **scaffolded monorepo skeleton** that makes every subsequent story implementable. **Do not** write application logic, install runtime deps beyond what CLIs generate, add docker-compose, add Drizzle, add Radix, or wire API routes. Those live in Stories 1.2 through 1.11. Scope creep here is the single biggest risk.

### Critical architectural guardrails (bind these hard)

- **No third-party combined starter.** Architecture §Starter Template explicitly rejects `maybemaby/fastify-next-starter`, `maybemaby/fastify-trpc-next`, `riipandi/fuelstack`. Use only the official CLIs.
- **Workspace tool:** plain **npm workspaces**. Not pnpm. Not Yarn. Not Turborepo. Not Nx. (Architecture §Starter Template.)
- **Node 22 LTS**, TypeScript end-to-end in strict mode (Architecture §Language & Runtime, §Project Context Analysis).
- **The three workspace members:** `apps/web/` (Next.js), `apps/api/` (Fastify), `packages/shared/` (hand-rolled). No other `apps/*` or `packages/*` in v1.
- **Cross-app imports are banned** — enforced via ESLint `no-restricted-imports`. The only channel between `apps/web` and `apps/api` is `@todo-app/shared` (types/contracts) and HTTP (runtime). This is a first-class architectural invariant (Architecture §Architectural Boundaries, §Enforcement Guidelines).
- **`packages/shared` is consumed as TypeScript source** in v1 (no precompile step). `main`/`types` point to `src/index.ts`. Both apps' TypeScript compilers transpile it as part of their own builds. This keeps the dev loop tight and avoids build ordering ceremony.

### Exact scaffolding commands (run in order)

```bash
# Step 1 — workspace root
npm init -y
# Then edit package.json: set "private": true, "workspaces": ["apps/*", "packages/*"]

# Step 2 — Next.js web app (all flags required)
npx create-next-app@latest apps/web --typescript --app --eslint --tailwind --src-dir --use-npm --yes

# Step 3 — Fastify API app
npx fastify-cli@latest generate apps/api --lang=typescript

# Step 4 — shared package
mkdir -p packages/shared/src
# Then hand-create packages/shared/package.json and packages/shared/tsconfig.json (see Task 5)
```

All flags on `create-next-app` are load-bearing:

- `--typescript` → TS, not JS
- `--app` → App Router (Architecture §Frontend Architecture requires App Router; no Pages Router)
- `--eslint` → generates an ESLint config we will later override or delete
- `--tailwind` → Tailwind (Architecture §Styling Solution)
- `--src-dir` → `src/` layout (Architecture §Complete Project Directory Structure)
- `--use-npm` → npm (not pnpm/yarn)
- `--yes` → non-interactive

### Configuration pattern details

**`tsconfig.base.json` (root, shared):**

- `strict: true` is mandatory (Architecture §Language & Runtime).
- `moduleResolution: "Bundler"` is the current (April 2026) idiomatic setting for Next.js 16 + modern Node, matching `create-next-app`'s generated default. If `create-next-app` generates `"node"` or `"nodenext"`, align the base with the app's need and document the choice.
- `noUncheckedIndexedAccess: true` — adds safety on array/record access; minimal cost in a small codebase.
- Do NOT set `paths` in the base — workspace linking handles `@todo-app/shared` resolution natively.

**`.eslintrc.cjs`:**

- Use `.cjs` (not `.json`, not `.mjs`, not the new flat `eslint.config.js`). Rationale: `eslint-config-next` and `@typescript-eslint` are most stable with legacy config in April 2026; Next.js 16's lint tooling still expects it. If CNA 16 has switched to flat config by the time of scaffolding, adopt flat config and translate the `overrides` below into the `[{...}]` array shape — the blocking rule (`no-restricted-imports` with cross-app patterns) is the contract, not the file format.
- **The cross-app import ban is the load-bearing AC here (AC #4).** Verify it actually fires before marking the story done — create a throwaway violating import, confirm ESLint errors on it, then delete.

**`.gitignore` (must contain at minimum):**

```
node_modules/
.next/
dist/
build/
coverage/
.env
.env.local
.env.*.local
*.log
.DS_Store
```

### Handling CLI-generated files you will encounter

`create-next-app` generates:

- `apps/web/.eslintrc.json` (or `eslint.config.mjs`) → **delete** (root owns lint config)
- `apps/web/tsconfig.json` → **edit** to extend `../../tsconfig.base.json`
- `apps/web/README.md` → keep (app-specific)
- `apps/web/AGENTS.md` (if generated) → keep (Architecture §Development Experience)
- `apps/web/next.config.ts`, `apps/web/tailwind.config.ts`, `apps/web/postcss.config.mjs` → keep untouched

`fastify-cli generate --lang=typescript` generates:

- `apps/api/package.json` with a `test` script using `node --test` → keep (Architecture §Testing Framework)
- `apps/api/src/app.ts`, `apps/api/src/plugins/`, `apps/api/src/routes/` → keep — Story 1.5 extends them
- `apps/api/tsconfig.json` → **edit** to extend `../../tsconfig.base.json`
- Any generated `.eslintrc*` → **delete** (root owns lint config)

### Out-of-scope (do NOT do in this story)

- ❌ Do not create `docker-compose.yml` — that's Story 1.3
- ❌ Do not install Drizzle, Zod, Radix, Pino, or any `@fastify/*` plugins beyond what `fastify-cli` scaffolds
- ❌ Do not create `.env.example` content beyond a placeholder (full env documentation is Story 1.3)
- ❌ Do not write `apps/api/src/db/schema.ts` — that's Story 1.4
- ❌ Do not write `packages/shared/src/contracts.ts` — that's Story 1.2
- ❌ Do not add GitHub Actions, Dockerfiles, or `scripts/dev.sh` — those are Stories 1.10 / 1.11
- ❌ Do not pin specific versions of `create-next-app` or `fastify-cli` beyond `@latest` — the architecture dates these to April 2026 and the CLIs resolve correctly at install time

### Project Structure Notes

Target tree at end of this story (exact; deviations require architecture update):

```
todo-app/
├── package.json                 # workspaces root; private
├── package-lock.json            # generated by npm install
├── tsconfig.base.json           # shared TS config
├── .eslintrc.cjs                # root ESLint with cross-app ban
├── .prettierrc
├── .prettierignore
├── .editorconfig
├── .gitignore
├── .nvmrc                       # contains: 22
├── node_modules/                # hoisted; gitignored
├── apps/
│   ├── web/                     # from create-next-app
│   │   ├── src/app/{layout,page,globals.css}.tsx
│   │   ├── package.json
│   │   ├── tsconfig.json        # extends ../../tsconfig.base.json
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.mjs
│   │   └── public/
│   └── api/                     # from fastify-cli
│       ├── src/app.ts
│       ├── src/plugins/
│       ├── src/routes/
│       ├── package.json
│       └── tsconfig.json        # extends ../../tsconfig.base.json
└── packages/
    └── shared/                  # hand-rolled
        ├── package.json         # name: @todo-app/shared; main: src/index.ts
        ├── tsconfig.json        # extends ../../tsconfig.base.json
        └── src/
            └── index.ts         # placeholder export {}
```

- **Alignment:** structure matches Architecture §Complete Project Directory Structure exactly. Any deviation is a defect.
- **Known variances at end of Story 1.1:** `.env.example`, `docker-compose.yml`, `scripts/dev.sh`, `.github/workflows/ci.yml`, Dockerfiles, and all `packages/shared/src/contracts.ts` content are **not yet present** — they are owned by later stories (1.3, 1.10, 1.11, 1.2 respectively). This is correct and expected.
- **No `AGENTS.md` at root yet** — Architecture mentions it; its authorship is outside this story's scope unless `create-next-app` auto-generates one in which case keep it.

### Testing Requirements

- **No unit tests or integration tests are added in this story.** The testable outcome is the scaffolding itself — enforced by the ACs.
- **Manual verification steps (must execute before marking done):**
  1. `npm install` at root succeeds with zero peer-dep errors or workspace resolution warnings.
  2. `ls node_modules/@todo-app/shared` resolves to a symlink pointing at `../../packages/shared`.
  3. Create a throwaway TS file in `apps/web/src/` that imports from `@todo-app/shared`; `npx tsc --noEmit` inside `apps/web/` succeeds. Repeat inside `apps/api/`. Delete throwaway files.
  4. Create a throwaway TS file in `apps/web/src/` that imports from `../../../apps/api/src/app`; `npm run lint --workspace apps/web` errors with the `no-restricted-imports` message. Delete throwaway file.
  5. `cat .nvmrc` outputs `22`.
  6. `git status` (post-commit) is clean; `node_modules/`, `.next/`, `dist/` are untracked/ignored.

- Test-framework pinning (Vitest + React Testing Library for web, `node --test` for API) lands in Stories 1.5 / 1.9 per the Implementation Readiness Report. Not required here.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation] — exact scaffolding commands, third-party-starter rejection, npm-workspaces mandate
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] — target file tree
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries] — cross-app import ban as first-class invariant
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines] — ESLint `no-restricted-imports` as the enforcement mechanism
- [Source: _bmad-output/planning-artifacts/architecture.md#Language & Runtime] — Node 22, TypeScript strict, React 19, Next.js 16, Fastify 5.8.x
- [Source: _bmad-output/planning-artifacts/architecture.md#Pattern Examples] — good/anti-pattern exemplars for code that lands in later stories
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1: Scaffold monorepo workspace] — original BDD acceptance criteria (verbatim above)
- [Source: _bmad-output/planning-artifacts/epics.md#Starter / Scaffolding (drives Epic 1 Story 1)] — consolidated constraint list
- [Source: _bmad-output/planning-artifacts/prd.md#Risk Mitigation] — "boring, idiomatic tooling, small dependency footprint" directive

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`

### Debug Log References

- Initial `create-next-app apps/web` from repo root failed with "application path is not writable" — likely a CNA pre-flight check colliding with the root `package.json`'s `"workspaces": ["apps/*"]` glob. Worked around by `cd apps && npx create-next-app web …`. Captured for future scaffolding stories.
- First cross-app ban implementation used `no-restricted-imports` with literal `apps/{name}` patterns. Web→api fired (the test path `'../../../apps/api/src/app'` contains the literal `apps/api`), but api→web with `'../../web/src/app/page'` did NOT fire because the literal `apps/web` was absent. Switched to `eslint-plugin-import`'s path-resolving `no-restricted-paths` rule, which resolves the import against the file system regardless of relative-path style. Both directions verified.
- `tseslint.configs.recommended` initially flagged 10 errors in fastify-cli scaffold boilerplate (unused handler args, empty plugin interface, `require()` in test helpers). Tightened with carve-outs in [eslint.config.mjs](../../eslint.config.mjs): `argsIgnorePattern` extended to cover Fastify handler arg names (`opts|request|reply|t`), plus `no-empty-object-type` and `no-require-imports` disabled scoped to `apps/api/**`. Real handler code in later stories will replace boilerplate, at which point these carve-outs can be re-tightened.

### Completion Notes List

**What was built:**

- npm workspaces monorepo at repo root (`package.json` with `"workspaces": ["apps/*", "packages/*"]`).
- `apps/web/`: Next.js 16.2.4 + React 19.2.4 + Tailwind 4 via official `create-next-app` (App Router, src/, TypeScript). Inner `.git` and per-app `eslint.config.mjs` removed; `tsconfig.json` rewired to extend root base.
- `apps/api/`: Fastify 5 via official `fastify-cli generate --lang=typescript`. `tsconfig.json` rewired to `extends: ["../../tsconfig.base.json", "fastify-tsconfig"]` so the workspace constraint (AC #3) is honored without losing fastify-cli's CJS compile defaults.
- `packages/shared/`: hand-rolled `@todo-app/shared` consumed as TypeScript source (no precompile step in v1) — `main`/`types`/`exports` all point at `src/index.ts`.
- Root toolchain: `tsconfig.base.json` (strict + `noUncheckedIndexedAccess`), `.nvmrc=22`, `.editorconfig`, `.prettierrc`, `.prettierignore`, `.gitignore`, root `eslint.config.mjs` (flat).
- Cross-app import ban: enforced via `eslint-plugin-import`'s `import/no-restricted-paths` (path-resolving zones), not literal-string `no-restricted-imports`. More robust against relative-path bypass.

**ACs validated:**

- **AC #1** ✓ — `apps/web/`, `apps/api/`, `packages/shared/` exist; root `package.json` has `"workspaces": ["apps/*", "packages/*"]`; no third-party combined starter.
- **AC #2** ✓ — `npm install` from root hoists into a single root `node_modules`; `node_modules/@todo-app/shared` is a symlink to `../../packages/shared`; `npx tsc --noEmit` resolves `@todo-app/shared` cleanly from both apps (verified with throwaways, then deleted).
- **AC #3** ✓ — `tsconfig.base.json` defines `strict: true` + shared `moduleResolution: Bundler`; all three child tsconfigs extend it; `.nvmrc=22`; `.editorconfig`/`.prettierrc` present; root ESLint config (flat: `eslint.config.mjs`) extends Next.js's config (`eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`) and `@typescript-eslint/recommended` (via `tseslint.configs.recommended`); ESLint v9's flat config implicitly applies its built-in recommended rule set per the v9 default. **Deviation:** flat config (`eslint.config.mjs`) instead of legacy `.eslintrc.cjs` — explicitly authorized in the story Dev Notes ("If CNA 16 has switched to flat config by the time of scaffolding, adopt flat config…"). CNA 16.2.4 ships flat config out of the box.
- **AC #4** ✓ — Throwaway imports verified the ban fires in BOTH directions:
  - `apps/web/src/_cross_import_check.ts` importing `'../../../apps/api/src/app'` → ESLint exit 1 with the cross-app message.
  - `apps/api/src/_cross_import_check.ts` importing `'../../web/src/app/page'` → ESLint exit 1 with the cross-app message.
  - Throwaways deleted; final `npm run lint` is clean (exit 0, 4 cosmetic warnings only).
- **AC #5** ✓ — Root `.gitignore` ignores `node_modules/`, `.next/`, `dist/`, `.env`, `.env.local`, `.env.*.local`, `*.log`, `.DS_Store`, `coverage/`, etc.

**Manual verification log (story Testing Requirements):**

1. `npm install` from root succeeded with no peer-dep errors (529 packages audited).
2. `node_modules/@todo-app/shared → ../../packages/shared` confirmed via `ls -la`.
3. Throwaway TS files importing `@todo-app/shared` from each app passed `tsc --noEmit`. Deleted.
4. Throwaway TS files importing across apps both errored with the `import/no-restricted-paths` rule. Deleted.
5. `cat .nvmrc` → `22`.
6. Post-commit `git status` is clean; `node_modules/`, `.next/`, `dist/` are gitignored.

**Known follow-ups (out of this story's scope, flagged for visibility):**

- 4 cosmetic lint warnings remain about `unused eslint-disable directive` in fastify-cli's test scaffold (`apps/api/test/helper.ts`, `apps/api/test/plugins/support.test.ts`). Will resolve naturally when real test code replaces the fastify-cli boilerplate (Story 1.5+).
- `apps/api`'s `argsIgnorePattern` carve-out (`opts|request|reply|t`) is intentionally lenient for fastify-cli scaffold patterns. Can be tightened to just `^_` once handler signatures are written by hand.
- `eslint-plugin-import`'s TypeScript resolver setting (`import/resolver.typescript.project`) was added speculatively for future cross-package import correctness; not strictly required for `no-restricted-paths` to function.

### File List

**Created (root toolchain):**

- `package.json` — workspaces root; private; declares `eslint`, `eslint-config-next`, `eslint-plugin-import` as devDeps
- `package-lock.json` — generated by `npm install`
- `tsconfig.base.json` — shared TS compiler options (strict, ES2022, Bundler resolution, `noUncheckedIndexedAccess`)
- `eslint.config.mjs` — root flat ESLint config (Next.js for web, tseslint recommended for api+shared, cross-app ban via `import/no-restricted-paths`)
- `.nvmrc` — pins Node 22
- `.editorconfig`, `.prettierrc`, `.prettierignore`
- `.gitignore`

**Created (`apps/web`, via `create-next-app@latest`):**

- `apps/web/` (full Next.js 16 App Router scaffold): `src/app/{layout,page,globals.css}`, `next.config.ts`, `next-env.d.ts`, `postcss.config.mjs`, `public/` assets, `package.json`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`
- `apps/web/tsconfig.json` — **modified post-scaffold** to add `"extends": "../../tsconfig.base.json"` (top-level)

**Created (`apps/api`, via `fastify-cli generate`):**

- `apps/api/` (full Fastify 5 TypeScript scaffold): `src/app.ts`, `src/plugins/{sensible,support}.ts`, `src/routes/{root,example/index}.ts`, `test/{helper.ts,tsconfig.json,plugins/support.test.ts,routes/{root,example}.test.ts}`, `package.json`, `README.md`, `.gitignore`
- `apps/api/tsconfig.json` — **modified post-scaffold** to extend `["../../tsconfig.base.json", "fastify-tsconfig"]` and add `rootDir: "src"`

**Created (`packages/shared`, hand-rolled):**

- `packages/shared/package.json` — name `@todo-app/shared`, private, ESM, `main`/`types`/`exports` → `./src/index.ts`
- `packages/shared/tsconfig.json` — extends root base, `noEmit: true`
- `packages/shared/src/index.ts` — placeholder `export {};` (real contracts land in Story 1.2)

**Deleted from CNA scaffold output (intentionally — replaced/hoisted):**

- `apps/web/.git/` — CNA auto-initializes a nested git repo; we want one root git only
- `apps/web/eslint.config.mjs` — replaced by root `eslint.config.mjs`
- `apps/web/node_modules/` and `apps/web/package-lock.json` — replaced by hoisted root install

### Review Findings

_Code review run 2026-04-29 (multi-story batch covering 1.1–1.4). Findings on Story 1.1's deliverables only._

**Deferred (low impact for v1; future hardening):**

- [x] [Review][Defer] argsIgnorePattern in eslint.config.mjs whitelists handler-arg names [eslint.config.mjs:281-284] — `argsIgnorePattern: '^_|^(opts|request|reply|t)$'` weakens the unused-arg rule for fastify-cli boilerplate but also gives a free pass to refactored handlers that legitimately stop using `request`/`reply`. Story 1.1 Dev Notes already disclose this as "tightened by stricter overrides as real code lands in later stories" — flag for Story 1.5+ to drop the named alternatives in favor of the standard `_request`/`_reply` underscore convention.
- [x] [Review][Defer] Cross-app ban via `import/no-restricted-paths` is static-analysis only [eslint.config.mjs:38-50] — does not catch dynamic `import()` of computed paths, `createRequire(...)('../api/...')`, or `import.meta.resolve` bypasses. v1 has no such patterns; flag for inclusion if/when the codebase grows tooling that uses dynamic imports.
- [x] [Review][Defer] Cross-app ban scope does not cover repo-root files [eslint.config.mjs:51-60] — files like `next.config.ts` or `eslint.config.mjs` itself are outside `apps/web/**` and `apps/api/**` globs, so a future root-level config file could `import` from `apps/api` undetected. Minor for v1 (no such files import from app dirs).

---

_Code review run 2026-04-29 (Run 2 — hand-rolled chunk only: root configs, tsconfigs, packages/shared, and `eslint.config.mjs`). Excluded CLI-generated scaffold (Next.js src/, Fastify src/, public/, package-lock.json) by user choice._

**Decisions resolved (now patches):**

- [x] [Review][Patch] (resolved from Decision D1) Flip `verbatimModuleSyntax` to `true` [tsconfig.base.json:14] — adopt the safer pairing with `isolatedModules: true` before Story 1.2's contracts introduce the first cross-package type imports.
- [x] [Review][Patch] (resolved from Decision D2) Drop `allowJs: true` from `apps/web/tsconfig.json` [apps/web/tsconfig.json:8] — project is TS-only; remove the CNA-default reflex setting to match actual project state.

**Patches (unambiguous fixes):**

- [x] [Review][Patch] Declare missing devDeps in root `package.json` — `typescript-eslint`, `eslint-import-resolver-typescript`, and `prettier` are referenced but undeclared [package.json:13-17, eslint.config.mjs:3-4, 11]. The first two work today only because they are pulled transitively via `eslint-config-next`; `prettier` is not installed at all (verified: `node_modules/prettier` does not exist), making `.prettierrc`/`.prettierignore` decorative. Pin all three explicitly.
- [x] [Review][Patch] Remove dead `repoRoot` constant [eslint.config.mjs:7] — `const repoRoot = new URL('.', import.meta.url).pathname;` is computed and never used. Delete the line. Side-effect: retires the Windows-portability concern around `import.meta.url.pathname`.
- [x] [Review][Patch] Trim redundant overrides in `apps/web/tsconfig.json` [apps/web/tsconfig.json:4-15] — CNA-generated tsconfig re-declares `target: "ES2017"`, `strict`, `esModuleInterop`, `skipLibCheck`, `resolveJsonModule`, `isolatedModules`, `module`, `moduleResolution`. The base sets `target: "ES2022"` and adds `noUncheckedIndexedAccess` + `forceConsistentCasingInFileNames` — the override silently downgrades the web app to ES2017 and weaker safety than `apps/api`/`packages/shared`. Keep only Next.js-specific options (`jsx`, `plugins`, `paths`, `incremental`, `noEmit`, `lib`); let base own the rest.
- [x] [Review][Patch] Align ESLint files-glob extensions across api blocks [eslint.config.mjs:62 (tseslint) vs 242 (cross-app ban)] — tseslint applies to `apps/api/**/*.{ts,tsx}` while cross-app applies to `apps/api/**/*.{ts,tsx,js,jsx,mjs,cjs}`. Same workspace, different lint coverage. Pick one extension set per app and apply it everywhere.
- [x] [Review][Patch] Add cross-app zone for `packages/shared` [eslint.config.mjs:9-31, 237-244] — `crossAppBan` only wires `apps/web ↔ apps/api`. `packages/shared/**` has no zone, so a future `packages/shared` file can `import` from `apps/web` or `apps/api` and ESLint will say nothing. The architectural intent is shared has no app deps. Add a zone (or an inline comment explaining the intentional gap) so the rule is self-documenting.

**Deferred (low impact for v1; later-story hardening):**

- [x] [Review][Defer] Add `typecheck` / `format` / `format:check` scripts to root `package.json` — only `lint` exists, so strict TS isn't verified on any PR and the prettier files are decorative. Belongs in CI/orchestration story (1.10/1.11).
- [x] [Review][Defer] Add `packageManager` field and pin `.nvmrc` to a minor — `engines.node >=22` and `.nvmrc=22` allow drift across 22.x. Reproducibility nicety; lockfile already catches the npm-vs-pnpm/yarn case in practice.
- [x] [Review][Defer] Add `*.tsbuildinfo`, `.turbo/`, `.vercel/` to `.gitignore` and `.prettierignore` — `incremental: true` in web tsconfig will produce `.tsbuildinfo`. Not a problem until tools start generating them.
- [x] [Review][Defer] Tighten `lint` to `eslint . --max-warnings=0` — current 4 cosmetic warnings in fastify-cli scaffold pass CI silently. Aligns with the spec's Completion Notes follow-ups.
- [x] [Review][Defer] Resolver project paths in `eslint.config.mjs:13` are relative — works when invoked via `npm run lint` from repo root; would silently fall back to the node resolver if invoked with a different CWD. Cosmetic for current usage.

### Change Log

| Date       | Author                | Change                                                                  |
| ---------- | --------------------- | ----------------------------------------------------------------------- |
| 2026-04-28 | Claude Opus 4.7 (Dev) | Story 1.1 implemented; status `ready-for-dev` → `review`. Initial commit `9e4570e`. |
| 2026-04-29 | Claude Opus 4.7 (Reviewer) | Code review found 0 patches, 3 defers — no blocking issues. Disclosed deviations (flat config vs `.eslintrc.cjs`, `import/no-restricted-paths` vs `no-restricted-imports`) re-validated as defensible. Story status unchanged. |
| 2026-04-29 | Claude Opus 4.7 (Reviewer) | Run 2 (hand-rolled chunk re-review): 2 decisions resolved into patches; 7 patches applied (devDeps declared, dead `repoRoot` removed, web tsconfig trimmed, ESLint api-globs aligned, packages/shared cross-app zone added, `verbatimModuleSyntax` flipped to `true`, `allowJs` dropped from web). 5 defers logged. Lint + tsc clean post-patch. Status → `done`. |
