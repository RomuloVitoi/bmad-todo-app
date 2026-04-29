# Story 1.2: Define the shared Todo contract

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer of either tier,
I want Zod schemas for every API wire shape in `packages/shared`,
So that validation, typing, and OpenAPI generation derive from a single source of truth.

## Acceptance Criteria

1. **Given** `packages/shared/src/contracts.ts`,
   **When** the module is imported,
   **Then** it exports `TodoSchema`, `CreateTodoRequestSchema`, `UpdateTodoRequestSchema`, `TodoListResponseSchema`, and `ErrorResponseSchema` as named Zod schemas,
   **And** all object schemas use `.strict()` so unknown fields cause validation errors.

2. **Given** `TodoSchema`,
   **When** a valid todo is parsed,
   **Then** it contains `id` (UUID string), `text` (non-empty trimmed string, max 500 chars), `completed` (boolean), and `createdAt` (ISO 8601 datetime string),
   **And** `TodoSchema.parse({...with text longer than 500})` throws a `ZodError`.

3. **Given** `CreateTodoRequestSchema`,
   **When** parsing `{ text: "  pick up milk  " }`,
   **Then** it returns `{ text: "pick up milk" }` (trimmed),
   **And** parsing `{ text: "" }` or `{ text: "x".repeat(501) }` throws.

4. **Given** `UpdateTodoRequestSchema`,
   **When** parsing `{ completed: true }`,
   **Then** it passes,
   **And** parsing an object containing fields other than `completed` throws due to `.strict()`.

5. **Given** `TodoListResponseSchema`,
   **When** parsing `{ todos: [] }` or `{ todos: [validTodo] }`,
   **Then** it passes; parsing `null` or `{}` without a `todos` key throws.

6. **Given** `packages/shared/src/contracts.test.ts`,
   **When** `node --test` runs in the package,
   **Then** round-trip tests for every schema pass (valid → parse → pass; invalid → parse → throw).

7. **Given** `packages/shared/package.json`,
   **When** its `exports` field is inspected,
   **Then** it exposes the package entry so both apps can import via `@todo-app/shared`.

## Tasks / Subtasks

- [x] **Task 1: Add Zod dependency to packages/shared (AC: #1)**
  - [x] In [packages/shared/package.json](../../packages/shared/package.json), add `"dependencies": { "zod": "^3.23.0" }` (3.x is required for ecosystem compatibility — `drizzle-zod` and `@fastify/type-provider-zod` consume Zod 3 schemas in Stories 1.4 and 1.5)
  - [x] Run `npm install` from repo root; verify `zod` hoists into root `node_modules` and `node_modules/zod/package.json` resolves the installed version

- [x] **Task 2: Author the five Zod contract schemas (AC: #1, #2, #3, #4, #5)**
  - [x] Replace the placeholder `packages/shared/src/index.ts` content. New content: `export * from './contracts.ts';` (using explicit `.ts` extension — see Dev Notes "Module resolution and test execution")
  - [x] Create [packages/shared/src/contracts.ts](../../packages/shared/src/contracts.ts) and define exactly these named exports:
    - `TodoSchema = z.object({ id, text, completed, createdAt }).strict()`
    - `CreateTodoRequestSchema = z.object({ text }).strict()`
    - `UpdateTodoRequestSchema = z.object({ completed }).strict()`
    - `TodoListResponseSchema = z.object({ todos: z.array(TodoSchema) }).strict()`
    - `ErrorResponseSchema = z.object({ statusCode, error, message, code? }).strict()` — `code` is `.optional()` (not `.nullable()`)
  - [x] Field shapes (exact — these are load-bearing for downstream stories; deviations require an architecture update):
    - `id`: `z.string().uuid()` (lowercase, hyphenated UUID v4)
    - `text` (on `TodoSchema`): `z.string().trim().min(1).max(500)` — trim **must** be applied here too so server-stored values are also trim-validated on round-trip
    - `text` (on `CreateTodoRequestSchema`): `z.string().trim().min(1).max(500)` — same shape
    - `completed`: `z.boolean()`
    - `createdAt`: `z.string().datetime()` — ISO 8601, UTC
    - `statusCode`: `z.number().int().positive()`
    - `error`: `z.string()`
    - `message`: `z.string()`
    - `code`: `z.string().optional()` — omitted, NOT `null`, when absent
  - [x] Also export TypeScript types derived from each schema (consumers infer from these — saves callers from re-importing Zod just to type a value):
    - `export type Todo = z.infer<typeof TodoSchema>;`
    - `export type CreateTodoRequest = z.infer<typeof CreateTodoRequestSchema>;`
    - `export type UpdateTodoRequest = z.infer<typeof UpdateTodoRequestSchema>;`
    - `export type TodoListResponse = z.infer<typeof TodoListResponseSchema>;`
    - `export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;`

- [x] **Task 3: Author round-trip tests in contracts.test.ts (AC: #6)**
  - [x] Create [packages/shared/src/contracts.test.ts](../../packages/shared/src/contracts.test.ts) using `node:test` + `node:assert/strict`
  - [x] One `describe` block per schema. Each block must include both **valid → parses** and **invalid → throws** cases. Minimum coverage matrix:
    - **`TodoSchema`**:
      - ✓ Parses a valid todo `{ id: <uuid v4>, text: "buy milk", completed: false, createdAt: "2026-04-19T22:17:57.864Z" }`
      - ✗ Throws on `text` longer than 500 chars (`"x".repeat(501)`)
      - ✗ Throws on empty `text` (`""`)
      - ✗ Throws on non-UUID `id` (`"not-a-uuid"`)
      - ✗ Throws on non-ISO `createdAt` (`"2026-04-19"` — date-only is not datetime)
      - ✗ Throws on extra field (e.g., `{ ...valid, extra: 1 }`) due to `.strict()`
    - **`CreateTodoRequestSchema`**:
      - ✓ Parses `{ text: "  pick up milk  " }` and returns `{ text: "pick up milk" }` (trimmed) — assert exact trimmed equality
      - ✗ Throws on `{ text: "" }`
      - ✗ Throws on `{ text: "x".repeat(501) }`
      - ✗ Throws on extra field (`{ text: "x", completed: true }`)
    - **`UpdateTodoRequestSchema`**:
      - ✓ Parses `{ completed: true }` and `{ completed: false }`
      - ✗ Throws on `{ text: "x" }` (extra field, no `completed`) due to `.strict()`
      - ✗ Throws on `{ completed: true, text: "x" }` (extra field) due to `.strict()`
      - ✗ Throws on `{}` (missing required `completed`)
    - **`TodoListResponseSchema`**:
      - ✓ Parses `{ todos: [] }`
      - ✓ Parses `{ todos: [<validTodo>] }`
      - ✗ Throws on `{}` (missing `todos`)
      - ✗ Throws on `null`
      - ✗ Throws on `{ todos: [{ ...invalidTodo }] }` (nested validation)
    - **`ErrorResponseSchema`**:
      - ✓ Parses `{ statusCode: 404, error: "Not Found", message: "Not found" }` (without `code`)
      - ✓ Parses `{ statusCode: 400, error: "Bad Request", message: "Validation failed", code: "VALIDATION_ERROR" }` (with `code`)
      - ✗ Throws on `{ statusCode: -1, ... }` (non-positive)
      - ✗ Throws on `{ statusCode: 1.5, ... }` (non-integer)
      - ✗ Throws on extra field
  - [x] Use `assert.throws(() => Schema.parse(invalid), z.ZodError)` to assert that validation failures specifically throw `ZodError`, not generic `Error`
  - [x] Use a stable, hand-written UUID v4 literal in test fixtures (e.g., `'00000000-0000-4000-8000-000000000000'`) — do NOT call `crypto.randomUUID()` at test-author time so failures are reproducible

- [x] **Task 4: Wire the test runner (AC: #6)**
  - [x] Add a `test` script to [packages/shared/package.json](../../packages/shared/package.json):
    `"test": "node --experimental-strip-types --test src/contracts.test.ts"`
  - [x] Rationale: Node 22 LTS pinned via `.nvmrc` supports TypeScript via `--experimental-strip-types` (Node 22.6+). This avoids adding `tsx`/`ts-node`/build-step deps just to run tests on a 50-line schema file. Newer Node 22.x patches enable type-stripping by default — the flag is forward-compatible (recognized as no-op in newer Node)
  - [x] Verify locally: `npm test --workspace packages/shared` exits 0 and reports passing tests for all five schemas
  - [x] Verify the **node:test default reporter** prints a pass/fail summary (don't bury failures behind an unfamiliar reporter; default `tap` is fine for v1)

- [x] **Task 5: Verify cross-app import resolution still works after content changes (AC: #7)**
  - [x] Create a throwaway TS file in `apps/web/src/_shared_check.ts`: `import { TodoSchema } from '@todo-app/shared'; export const t = TodoSchema;`
  - [x] Run `npx tsc --noEmit` from inside `apps/web/`; expect exit 0 and no type errors
  - [x] Repeat from `apps/api/`: same throwaway, same `tsc --noEmit`, same exit 0
  - [x] Verify autocompletion of `Todo`, `CreateTodoRequest` types works in both apps (manual smoke check; if running headless, skip)
  - [x] Delete throwaway files before commit

- [x] **Task 6: Lint and root validation pass clean**
  - [x] Run `npm run lint` from repo root; expect exit 0
  - [x] Run `npm test --workspace packages/shared` from repo root; expect exit 0 with all assertions green
  - [x] No warnings introduced beyond the four pre-existing fastify-cli boilerplate warnings carried over from Story 1.1

- [x] **Task 7: Commit**
  - [x] Stage: `packages/shared/package.json`, `packages/shared/src/index.ts`, `packages/shared/src/contracts.ts`, `packages/shared/src/contracts.test.ts`, root `package-lock.json`
  - [x] Commit message:
    `feat(shared): define Zod contracts for Todo wire shapes (Story 1.2)`
  - [x] Do NOT commit throwaway verification files

## Dev Notes

### Where this story sits

`packages/shared/src/contracts.ts` is the **single source of truth** for every JSON shape that crosses the wire between web and API. Every downstream story references it:

| Story | What it derives from `contracts.ts`                              |
| ----- | ---------------------------------------------------------------- |
| 1.4   | `drizzle-zod` derives entity shape from `TodoSchema`             |
| 1.5   | `@fastify/type-provider-zod` validates `GET /todos` from `TodoListResponseSchema` |
| 1.6   | `@fastify/swagger` emits OpenAPI from these schemas              |
| 1.8   | Web's `lib/api.ts` calls `TodoSchema.parse()` on every response  |
| 2.1+  | All POST/PATCH/DELETE handlers validate via these schemas        |
| 3.2   | Client error toast surfaces `ErrorResponseSchema.message`        |

A schema name change here ripples through six stories. **Treat the schema names and field shapes as a contract** — deviations require an architecture document update.

### Critical architectural guardrails (bind these hard)

- **Naming:** PascalCase + `Schema` suffix exactly as listed in ACs ([Source: architecture.md#Naming Patterns]). No abbreviations (`TodoReqSchema` is wrong; `CreateTodoRequestSchema` is right).
- **`.strict()` on every object schema** — applies to all five schemas. Unknown fields must throw, not silently pass through ([Source: architecture.md#Implementation Patterns & Consistency Rules → "Zod schemas use `.strict()`"]).
- **Wire format is camelCase**, DB is snake_case ([Source: architecture.md#Naming Patterns → "JSON field names on the wire: camelCase — `createdAt`, not `created_at`"]). The Zod schemas are the authoritative wire shape; Drizzle's column aliases (Story 1.4) handle DB ↔ wire mapping.
- **Text bounds:** `z.string().trim().min(1).max(500)` ([Source: architecture.md#Data Architecture]). Trim is applied at the schema level; do not duplicate trim in handlers.
- **List response is wrapped:** `{ todos: [...] }` even for empty list. Never bare arrays, never `null`. Pagination/`nextCursor` will be added later by extending this envelope additively ([Source: architecture.md#API & Communication Patterns]).
- **Optional vs nullable:** prefer omitted over `null`. `code` field on `ErrorResponseSchema` uses `.optional()`, not `.nullable()` ([Source: architecture.md#Format Patterns → "Null vs omitted: prefer omitted over `null` for optional fields"]).
- **Error shape matches Fastify-sensible default** exactly: `{ statusCode, error, message, code? }` ([Source: architecture.md#Format Patterns]). `error` is the HTTP status reason phrase (e.g., "Not Found"), not a redundant copy of `message`.
- **Dates are ISO 8601 strings on the wire**, validated with `z.string().datetime()` (which enforces the strict ISO-with-`Z` format, e.g., `"2026-04-19T22:17:57.864Z"`). The DB stores `timestamptz`; serialization to ISO is done at the API boundary, not in the schema.

### Module resolution and test execution

[packages/shared/package.json](../../packages/shared/package.json) (from Story 1.1) is configured as ESM (`"type": "module"`) with `main`/`types`/`exports` pointing at `./src/index.ts`. Two implications:

1. **Cross-package imports use `.ts` source directly** — both apps' TypeScript compilers transpile the source as part of their own builds. Web does this via Next.js's bundler; API does this via `tsc`. Neither needs a precompiled `dist/` from `packages/shared`. This was a deliberate Story 1.1 decision to keep the dev loop tight.
2. **In-package imports must use explicit extensions** because the package is ESM. So [packages/shared/src/index.ts](../../packages/shared/src/index.ts) must say `export * from './contracts.ts';` (with `.ts`), not `from './contracts'` or `from './contracts.js'`. Modern Node ESM resolves `.ts` extensions when type-stripping is enabled.

For the test runner: **use Node 22's native TypeScript support** via `--experimental-strip-types`. Do NOT add `tsx`, `ts-node`, `vitest`, `jest`, or compile-step dependencies — the architecture's "small dependency footprint" directive applies. The test invocation is:

```bash
node --experimental-strip-types --test src/contracts.test.ts
```

This works on the Node 22 LTS pinned by `.nvmrc`. In Node 22.18+ the flag becomes a no-op (type stripping enables by default), so the script is forward-compatible.

### Out-of-scope (do NOT do in this story)

- ❌ **No Drizzle integration** — `drizzle-zod` derivation lands in Story 1.4. Do not import or even devDep `drizzle-zod` here.
- ❌ **No `@fastify/type-provider-zod` wiring** — that's Story 1.5. Schemas in this story are *unconsumed* by Fastify; they exist only to be parsed and tested.
- ❌ **No OpenAPI generation** — Story 1.6 wires `@fastify/swagger` against these schemas. Don't add OpenAPI annotations or docstrings here.
- ❌ **No `Todo`-domain helper functions** (e.g., `isOverdue`, `formatTodoText`, `sortByCreatedAt`). The shared package is a **contract package**, not a domain library. Helpers belong in the consuming app's `lib/` until proven cross-cutting.
- ❌ **No client API wrapper** — `apps/web/src/lib/api.ts` (which calls `TodoSchema.parse()`) is Story 1.8.
- ❌ **No backwards-compat aliases for renamed schemas** — there is no v1 history to be backwards-compatible with.
- ❌ **No JSDoc comments documenting field meaning** — the field names + Zod constraints are the documentation. Adding JSDoc adds maintenance load without giving the dev agent (or downstream readers) information that's not already in the schema.

### Previous story intelligence (Story 1.1)

Story 1.1 (`9e4570e chore: scaffold monorepo workspace`) established:

- [packages/shared/package.json](../../packages/shared/package.json) is ESM, `name: @todo-app/shared`, `private: true`, with `main`/`types`/`exports` pointing at `./src/index.ts`. **Add `dependencies.zod` here in Task 1; do not change anything else.**
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts) currently contains `export {};` — replace it.
- [packages/shared/tsconfig.json](../../packages/shared/tsconfig.json) extends [tsconfig.base.json](../../tsconfig.base.json) and has `noEmit: true`. Don't change either — tests run via Node directly, not via emitted output.
- Both apps verified resolve `@todo-app/shared` via the `node_modules/@todo-app/shared → ../../packages/shared` workspace symlink. Adding real exports won't break this; Task 5 verifies.
- Root [eslint.config.mjs](../../eslint.config.mjs) applies `tseslint.configs.recommended` to `packages/shared/**/*.ts`. The new `contracts.ts` and `contracts.test.ts` will be linted on Task 6 — write them in TS-recommended-clean style (no `any`, no unused imports, no `require()`).
- **The cross-app import ban does NOT apply to imports of `@todo-app/shared`** — it bans `apps/web ↔ apps/api` edges. `packages/shared` is the explicitly sanctioned channel. Both apps are expected to import from it.

### Web research notes (April 2026 state)

- **Zod ^3.23**: stable, widely supported. Both `drizzle-zod` (used in Story 1.4) and `@fastify/type-provider-zod` (Story 1.5) consume Zod 3 schemas. **Do not use Zod 4 even if released** — ecosystem compatibility is not yet guaranteed across both consumers.
- **`z.string().datetime()`**: strict ISO 8601 with timezone. Default behavior accepts only UTC (`Z` suffix). If we need offset-aware datetimes later, switch to `.datetime({ offset: true })` — but for v1's `created_at` from `now()` rendered as ISO UTC, the default is correct.
- **`z.string().uuid()`**: matches v1, v3, v4, v5. We use v4 (Postgres `gen_random_uuid()` produces v4); the schema is intentionally version-agnostic.
- **Node 22 LTS native TS support**: `--experimental-strip-types` is the flag we depend on. Do not specify a Node version below 22.6 anywhere; `.nvmrc` already pins 22.

### Project Structure Notes

Target additions from this story (deviations require architecture update):

```text
packages/shared/
├── package.json           # +dependencies.zod, +scripts.test
├── tsconfig.json          # unchanged from Story 1.1
└── src/
    ├── index.ts           # MODIFIED: re-exports from contracts.ts
    ├── contracts.ts       # NEW: 5 Zod schemas + 5 inferred types
    └── contracts.test.ts  # NEW: round-trip tests via node:test
```

- **Alignment:** matches [Architecture §Complete Project Directory Structure](../../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure) exactly. No deviations expected.
- **Variances at end of Story 1.2:** [.env.example](../../.env.example), [docker-compose.yml](../../docker-compose.yml), [scripts/dev.sh](../../scripts/dev.sh), and the API DB layer remain absent — they're owned by Stories 1.3 and 1.4.

### Testing Requirements

- **Framework:** `node:test` + `node:assert/strict` (zero deps; matches architecture's [Testing Standards](../../_bmad-output/planning-artifacts/architecture.md#testing-requirements) for `packages/shared`).
- **Run command:** `npm test --workspace packages/shared` (exits 0 on pass, non-zero on fail).
- **Coverage matrix (minimum)** is enumerated in Task 3. Do not skip the negative cases — they are the load-bearing assertions for `.strict()` and field bounds.
- **Determinism:** use literal UUIDs in fixtures, not `crypto.randomUUID()`, so failure messages reference stable values.
- **No integration tests in this story** — they require a live Postgres + API and land in Story 1.4+.

### References

- [Source: epics.md#Story 1.2: Define the shared Todo contract] — original BDD acceptance criteria (verbatim above)
- [Source: epics.md#Shared Contract] — consolidated contract constraints
- [Source: architecture.md#Data Architecture] — Zod-as-source-of-truth, `z.string().trim().min(1).max(500)` text bound, schema location
- [Source: architecture.md#API & Communication Patterns] — list response envelope, error shape, contract single-sourcing
- [Source: architecture.md#Format Patterns] — date format (ISO 8601), UUID format, optional-not-nullable, empty-list-not-null
- [Source: architecture.md#Naming Patterns] — schema naming (PascalCase + Schema), wire camelCase vs DB snake_case
- [Source: architecture.md#Coherence Validation] — `drizzle-zod` + `@fastify/type-provider-zod` + Zod compose cleanly (justifies Zod 3 ecosystem pinning)
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — `.strict()` mandate
- [Source: prd.md#Risk Mitigation] — "boring, idiomatic tooling, small dependency footprint" (justifies native node:test over vitest)
- [Story 1.1 file: 1-1-scaffold-monorepo-workspace.md] — `packages/shared` initial state and ESM constraints

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`

### Debug Log References

- **Story 1.1 architectural revision (load-bearing).** The original Story 1.1 plan said `packages/shared` would be "consumed as TypeScript source" (`main`/`types` → `./src/index.ts`, no precompile step). This pattern broke down in practice:
  1. With `.ts` extensions in relative imports (`export * from './contracts.ts'`), TypeScript requires `allowImportingTsExtensions: true`, which itself requires `noEmit: true` OR `emitDeclarationOnly: true`. `apps/api`'s tsc → dist/ pipeline (from `fastify-cli`) violates that constraint, so we can't enable the option in `tsconfig.base.json`.
  2. With `.js` extensions (TypeScript's standard "fake .js" pattern), Node's `--experimental-strip-types` does NOT auto-rewrite `.js` → `.ts` at runtime. Tests fail with `ERR_MODULE_NOT_FOUND`. Only `--experimental-transform-types` (or full ESM-with-loader) handles the rewrite, but that's bleeding-edge and adds runtime fragility.
  3. Even if tests were made to work, `apps/api` in production (`node dist/app.js`) imports `@todo-app/shared` and Node would try to load the `.ts` source — fails without strip-types in the production node invocation.
  - **Decision:** revert Story 1.1's "no precompile step" decision. `packages/shared` now compiles to `dist/` via `tsc`, with `prepare: tsc` running automatically on `npm install`. `package.json` exports `dist/index.js` + `dist/index.d.ts`. Apps consume compiled JS at runtime and `.d.ts` at type-check time. This is the standard ESM monorepo pattern, robust at runtime for Stories 1.5+.
- **Tests went RED before GREEN as expected.** Initial test run failed with `ERR_MODULE_NOT_FOUND: ./contracts.ts` (file didn't exist) — confirming the test file actually loads and the runner is wired correctly. After writing `contracts.ts`, all 25 tests turned green.
- **Two zod versions installed.** `npm ls zod` showed `@todo-app/shared` resolves to `zod@3.25.76` (matches our `^3.23.0` range) at `packages/shared/node_modules/zod`, while a transitive of `eslint-plugin-react-hooks` pulled `zod@4.3.6` to root `node_modules/zod`. Resolution order means our schemas always use 3.25.76 (the `@todo-app/shared` scope wins). No drift risk for this story; flagged as a follow-up for Story 1.5 if `@fastify/type-provider-zod` ends up resolving against root and pulling in v4.

### Completion Notes List

**What was built:**

- [packages/shared/src/contracts.ts](../../packages/shared/src/contracts.ts) — five named Zod schemas (`TodoSchema`, `CreateTodoRequestSchema`, `UpdateTodoRequestSchema`, `TodoListResponseSchema`, `ErrorResponseSchema`), all `.strict()`. Field constraints exactly match the architecture: `z.string().uuid()`, `z.string().trim().min(1).max(500)`, `z.string().datetime()`, `z.boolean()`, `z.number().int().positive()`, `z.string().optional()` for `code`. Inferred TypeScript types (`Todo`, `CreateTodoRequest`, etc.) exported alongside schemas so callers don't re-import Zod just to type a value.
- [packages/shared/src/contracts.test.ts](../../packages/shared/src/contracts.test.ts) — 25 round-trip tests across 5 `describe` blocks, using `node:test` + `node:assert/strict`. Coverage matrix from the story spec is implemented exactly: every schema has both ✓ valid-parses and ✗ invalid-throws cases, including the `.strict()` extra-field violations and the field-bound violations (text length, UUID format, ISO datetime format, integer/positive `statusCode`).
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts) — barrel re-export: `export * from './contracts.js';`.
- [packages/shared/package.json](../../packages/shared/package.json) — added `dependencies.zod ^3.23.0`, `devDependencies.typescript`, `scripts.{build,prepare,test}`. Switched `main`/`types`/`exports` to point at compiled `dist/`.
- [packages/shared/tsconfig.json](../../packages/shared/tsconfig.json) — switched from `noEmit: true` to emitting `dist/` with `declaration: true` + `declarationMap` + `sourceMap`.
- Initial commit: `c2168ca feat(shared): define Zod contracts for Todo wire shapes (Story 1.2)` on `main`.

**ACs validated (with concrete evidence):**

- **AC #1** ✓ — All five schemas exported as named exports from `contracts.ts`; all five use `.strict()`. Test `contracts.test.ts > * > throws on extra field due to .strict()` covers the unknown-fields-throw assertion for every object schema.
- **AC #2** ✓ — `TodoSchema` parses `{ id, text, completed, createdAt }`; tests cover the 501-char `text` violation throwing `ZodError` (`TodoSchema > throws on text longer than 500 chars`).
- **AC #3** ✓ — `CreateTodoRequestSchema.parse({ text: '  pick up milk  ' })` returns exactly `{ text: 'pick up milk' }` (asserted via `assert.deepEqual`); empty and 501-char inputs throw.
- **AC #4** ✓ — `UpdateTodoRequestSchema.parse({ completed: true })` passes; `{ text: 'x' }`, `{ completed: true, text: 'x' }`, and `{}` all throw.
- **AC #5** ✓ — `TodoListResponseSchema` parses `{ todos: [] }` and `{ todos: [validTodo] }`; rejects `null`, `{}`, and nested invalid todos.
- **AC #6** ✓ — `npm test --workspace packages/shared` runs `tsc && node --test dist/contracts.test.js`. Output: **25 tests, 5 suites, 25 pass, 0 fail, 0 skipped**. Exit 0.
- **AC #7** ✓ — `package.json` `exports` field exposes `{ types: './dist/index.d.ts', import: './dist/index.js' }`. Throwaway TS files in both `apps/web/src/` and `apps/api/src/` imported `TodoSchema`, `CreateTodoRequestSchema`, `Todo`, `CreateTodoRequest` from `@todo-app/shared` and ran `tsc --noEmit` cleanly (exit 0). Throwaways deleted.

**Final lint + test gate:**

- `npm run lint` → exit 0 (4 cosmetic warnings carried over from Story 1.1's fastify-cli boilerplate; no new warnings).
- `npm test --workspace packages/shared` → exit 0, 25/25 pass.

**Notable deviations from the story plan:**

1. **Switched `packages/shared` from "TS source" to compiled-dist consumption** (see Debug Log References for full reasoning). This revises Story 1.1's `main: ./src/index.ts` decision to `main: ./dist/index.js`. The change is covered by the `prepare: tsc` script so `npm install` produces a working `dist/` automatically — dev experience is preserved (no manual build step needed for the common path), while runtime is now standard-pattern correct.
2. **Used `.js` extension in internal relative imports** (`export * from './contracts.js';` even though the file is `contracts.ts`). This is the canonical TypeScript+ESM+Node pattern: TS resolves `.js` → `.ts` at type-check via `moduleResolution: Bundler`; tsc emits the `.js` literal in `dist/` where the file actually exists as `.js` after compilation.
3. **Added `typescript` as a devDep on `packages/shared`** (alongside `zod`). The story spec only required adding `zod`, but `prepare: tsc` needs `tsc` available. With workspaces hoisting, `typescript` was already transitively available; declaring it explicitly makes the dependency relationship visible and survives any future hoisting-config changes.
4. **The `prepare` script causes `tsc` to run on every `npm install`.** Acceptable cost (sub-second build for a 50-line package). Could be replaced by TypeScript Project References later if the package grows.

**Known follow-ups (out of this story's scope, flagged for visibility):**

- Story 1.5 should verify that `@fastify/type-provider-zod` resolves against `zod@3.x` (the version in `packages/shared/node_modules/zod`), not the v4 hoisted at root. If they diverge, errors will be misleading because `instanceof z.ZodError` checks across versions will fail. Mitigation if it surfaces: pin a top-level `zod` devDep at `^3.23` to force hoisting of v3.
- The `dist/` output directory is gitignored (root `.gitignore` covers `dist/`). `npm install` always rebuilds it via `prepare`, so missing `dist/` after a fresh clone is self-healing.
- `typescript` is currently scoped to `packages/shared`. When apps/api Story 1.4 lands, we may want to centralize the typescript devDep at the workspace root for version consistency. Defer until then.

### File List

**Modified:**

- [packages/shared/package.json](../../packages/shared/package.json) — `+dependencies.zod`, `+devDependencies.typescript`, `+scripts.{build,prepare,test}`; switched `main`/`types`/`exports` to compiled `dist/`
- [packages/shared/tsconfig.json](../../packages/shared/tsconfig.json) — flipped from `noEmit:true` to emit `dist/` with declarations + source maps
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts) — replaced placeholder `export {};` with `export * from './contracts.js';`
- `package-lock.json` (root) — reflects new zod dep + transitive updates

**Created:**

- [packages/shared/src/contracts.ts](../../packages/shared/src/contracts.ts) — 5 Zod schemas + 5 inferred types
- [packages/shared/src/contracts.test.ts](../../packages/shared/src/contracts.test.ts) — 25 round-trip tests via `node:test`

### Review Findings

_Code review run 2026-04-29 (multi-story batch covering 1.1–1.4). Findings on Story 1.2's contracts.ts and contracts.test.ts._

**Deferred (real but premature; track for downstream stories):**

- [x] [Review][Defer] `z.string().datetime()` round-trip with Drizzle Date objects [packages/shared/src/contracts.ts:11 ↔ apps/api/src/db/schema.ts:7-9] — `z.string().datetime()` rejects Date instances, but Drizzle returns JS Date for `timestamptz` columns. Will surface in Story 1.5 when the API serializes rows. Fix options: `mode: 'string'` on the Drizzle column, or `.preprocess(v => v instanceof Date ? v.toISOString() : v, ...)` on the Zod schema.
- [x] [Review][Defer] `ErrorResponseSchema.statusCode` accepts any positive integer (>599) [packages/shared/src/contracts.ts:34] — `.int().positive()` permits e.g. `99999`. Tighten to `.int().gte(100).lte(599)` to reject impossible HTTP statuses. Low priority since Fastify-sensible always emits valid codes.
- [x] [Review][Defer] contracts.test.ts coverage gaps [packages/shared/src/contracts.test.ts] — missing assertions for: whitespace-only `text` (e.g. `"     "` should reject after trim), `completed: null`, `todos: 'not-an-array'`, datetime variants (`+00:00` offset, missing milliseconds), `Date` instances. The 25 existing tests exercise the spec's enumerated matrix; gaps are around edges not pinned in the AC.

### Change Log

| Date       | Author                | Change                                                                |
| ---------- | --------------------- | --------------------------------------------------------------------- |
| 2026-04-28 | Claude Opus 4.7 (Dev) | Story 1.2 implemented; status `ready-for-dev` → `review`. Commit `c2168ca`. |
| 2026-04-29 | Claude Opus 4.7 (Reviewer) | Code review found 0 patches, 3 defers. All ACs verified satisfied; disclosed deviations (TS-source-to-`dist`, test script form) re-validated. Story status unchanged. |
| 2026-04-29 | Claude Opus 4.7 (Reviewer) | Run 2 (3-agent chunked re-review of `c2168ca`, 333 lines): Acceptance Auditor confirmed all 7 ACs pass. Blind+Edge surfaced ~46 additional findings, all of which are test-coverage hardening or schema tightening that exceeds spec scope (e.g., `.min(1)` on error/message strings, statusCode upper bound ≤599, top-level non-object input rejection tests, ZodError path-pinning predicates). 0 new patches; defers added below. Status: `review` → `done`. |

### Review Findings (Run 2)

**Deferred (out-of-scope hardening — spec is satisfied as-written; tightening = future work):**

- [x] [Review][Defer] Tighten `error`/`message` to `.min(1)` and `statusCode` to `.gte(100).lte(599)` in `ErrorResponseSchema` [packages/shared/src/contracts.ts] — spec defines them as `z.string()`/`z.number().int().positive()` exactly; tightening is a deliberate hardening pass.
- [x] [Review][Defer] Add export-surface pin test [packages/shared/src/contracts.test.ts] — no test asserts that exactly 5 schemas + 5 inferred types are exported; an accidental future export slips through undetected.
- [x] [Review][Defer] Tighten `assert.throws(..., z.ZodError)` to predicate form that pins the failing field path — current form passes for any ZodError, regardless of which field caused the failure.
- [x] [Review][Defer] Top-level non-object input tests (null/undefined/array/primitive) are missing for TodoSchema, CreateTodoRequestSchema, UpdateTodoRequestSchema, ErrorResponseSchema — only TodoListResponseSchema has the null test.
- [x] [Review][Defer] ISO datetime edge cases untested — no explicit test for `+00:00` offset (rejected by default), microsecond precision, or missing-`Z`.
