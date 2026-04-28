# Story 1.1: Scaffold monorepo workspace

Status: ready-for-dev

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

- [ ] **Task 1: Initialize workspace root (AC: #1, #3)**
  - [ ] Run `npm init -y` at repo root; edit generated `package.json` to set `"private": true`, `"name": "todo-app"`, and `"workspaces": ["apps/*", "packages/*"]`
  - [ ] Create `.nvmrc` containing `22` (matches Architecture: Node 22 LTS)
  - [ ] Create `.editorconfig` with sane defaults (UTF-8, LF, 2-space indent, trim trailing whitespace, final newline)
  - [ ] Create `.prettierrc` with Prettier defaults (empty `{}` is acceptable per Architecture: "Prettier defaults")
  - [ ] Create `.prettierignore` (ignore `node_modules/`, `.next/`, `dist/`, `apps/api/drizzle/`, `package-lock.json`)
  - [ ] Create root `.gitignore` covering `node_modules/`, `.next/`, `dist/`, `.env`, `.env.local`, `*.log`, `.DS_Store`, `coverage/`, `.turbo/`, `build/`

- [ ] **Task 2: Create shared TypeScript base config (AC: #3)**
  - [ ] Create `tsconfig.base.json` at repo root with `"strict": true`, `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"esModuleInterop": true`, `"skipLibCheck": true`, `"forceConsistentCasingInFileNames": true`, `"noUncheckedIndexedAccess": true`, `"resolveJsonModule": true`
  - [ ] Do NOT set `paths` here — workspace symlinks + package `exports` handle resolution (avoids drift)

- [ ] **Task 3: Scaffold Next.js web app (AC: #1)**
  - [ ] From repo root, run exactly: `npx create-next-app@latest apps/web --typescript --app --eslint --tailwind --src-dir --use-npm --yes`
  - [ ] Verify `apps/web/src/app/{layout,page,globals.css}.tsx` exist (App Router layout)
  - [ ] Edit `apps/web/tsconfig.json` to add `"extends": "../../tsconfig.base.json"` at the top; preserve the CNA-generated `compilerOptions` that are Next.js-specific (`jsx: "preserve"`, `plugins: [{ name: "next" }]`, `incremental: true`, path aliases) — do not delete them
  - [ ] Confirm `apps/web/package.json` has a unique name (`web` is fine; CNA generates this) and does NOT duplicate root-level devDeps where it can inherit

- [ ] **Task 4: Scaffold Fastify API app (AC: #1)**
  - [ ] From repo root, run exactly: `npx fastify-cli@latest generate apps/api --lang=typescript`
  - [ ] Verify `apps/api/src/app.ts`, `apps/api/src/routes/`, `apps/api/src/plugins/` exist (fastify-cli default layout)
  - [ ] Edit `apps/api/tsconfig.json` to add `"extends": "../../tsconfig.base.json"` at the top; keep fastify-cli's `outDir`, `rootDir`, and any CJS/ESM settings it generated
  - [ ] Rename `apps/api/package.json` `name` field to `api` (or leave as fastify-cli default if already unique within workspace)

- [ ] **Task 5: Create packages/shared (AC: #1, #2, #3)**
  - [ ] Create directory: `packages/shared/src/`
  - [ ] Create `packages/shared/src/index.ts` with a single re-export placeholder: `export {};` (contracts land in Story 1.2)
  - [ ] Create `packages/shared/package.json`:
    - `"name": "@todo-app/shared"`
    - `"version": "0.0.0"`
    - `"private": true`
    - `"type": "module"`
    - `"main": "./src/index.ts"` **and** `"types": "./src/index.ts"` — consumed directly as TS source (no build step in v1; both apps run through their own TypeScript compilers)
    - `"exports": { ".": "./src/index.ts" }`
    - `"files": ["src"]`
  - [ ] Create `packages/shared/tsconfig.json` extending `../../tsconfig.base.json`, with `"include": ["src/**/*"]` and `"compilerOptions": { "outDir": "dist", "declaration": true }` (declaration output is forward-looking; not required to build in v1)

- [ ] **Task 6: Wire root ESLint config with cross-app import ban (AC: #3, #4)**
  - [ ] Install root devDeps: `npm install -D -w . eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-next eslint-plugin-import` (hoists to root `node_modules`)
  - [ ] Create `.eslintrc.cjs` at repo root:
    - `root: true`
    - `parser: '@typescript-eslint/parser'`
    - `plugins: ['@typescript-eslint', 'import']`
    - `extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'next']` — order matters; Next.js last so it wins for web
    - `parserOptions: { ecmaVersion: 2022, sourceType: 'module' }`
    - `ignorePatterns: ['node_modules/', 'dist/', '.next/', 'apps/api/drizzle/', 'coverage/']`
    - `overrides: [{ files: ['apps/web/**'], rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/apps/api/**', 'apps/api/*'], message: 'Cross-app import blocked: apps/web must not import from apps/api. Use @todo-app/shared + HTTP.' }] }] } }, { files: ['apps/api/**'], rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/apps/web/**', 'apps/web/*'], message: 'Cross-app import blocked: apps/api must not import from apps/web. Use @todo-app/shared + HTTP.' }] }] } }]`
  - [ ] Delete any per-app `.eslintrc*` file that `create-next-app` or `fastify-cli` generated (so the root config is authoritative) — **OR** keep app-level configs with `root: false` and extend the root config. Pick one pattern and apply it consistently. Recommendation: delete per-app configs; single-source-of-truth aligns with Architecture §Enforcement Guidelines
  - [ ] Verify: create a throwaway file `apps/web/src/_cross-import-check.ts` containing `import '../../../apps/api/src/app';`, run `npm run lint --workspace apps/web`, confirm it errors with the custom `no-restricted-imports` message, then delete the throwaway file

- [ ] **Task 7: Root-level install verification (AC: #2)**
  - [ ] Run `npm install` from repo root
  - [ ] Confirm exactly one `node_modules/` at the repo root (not inside each app)
  - [ ] Confirm `ls -la node_modules/@todo-app/shared` is a symlink pointing to `../../packages/shared`
  - [ ] In `apps/web/src/`, create a throwaway file that imports from `@todo-app/shared` (e.g., `import * as shared from '@todo-app/shared';`), run `npx tsc --noEmit` from `apps/web/`, confirm it resolves; repeat from `apps/api/`. Delete throwaway files before commit

- [ ] **Task 8: Commit the scaffolded baseline (AC: all)**
  - [ ] `git init` if not yet initialized
  - [ ] `git add -A && git commit -m "chore: scaffold monorepo workspace (Story 1.1)"`
  - [ ] Do NOT commit `node_modules/`, `.next/`, or `dist/` (verify via `.gitignore`)

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

_To be filled by dev agent at implementation time._

### Debug Log References

### Completion Notes List

### File List
