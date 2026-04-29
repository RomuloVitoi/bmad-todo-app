# Story 1.4: API data layer — Drizzle schema, migration, client, fail-fast check

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer of the API app,
I want the `todos` table defined in Drizzle, a committed initial migration, a DB client plugin, and a migrate script that fails fast if the schema drifts,
So that the API has a typed, versioned data layer and cannot silently run against an outdated DB.

## Acceptance Criteria

1. **Given** `apps/api/src/db/schema.ts`,
   **When** the module is imported,
   **Then** it defines a `todos` table with `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `text text NOT NULL`, `completed boolean NOT NULL DEFAULT false`, `created_at timestamptz NOT NULL DEFAULT now()`,
   **And** no `owner_id` or `updated_at` column is defined.

2. **Given** `apps/api/drizzle.config.ts`,
   **When** `drizzle-kit generate` runs,
   **Then** it produces a SQL migration at `apps/api/drizzle/0000_init.sql` plus `meta/_journal.json`,
   **And** both files are committed to the repo.

3. **Given** a running Postgres container at `DATABASE_URL`,
   **When** `drizzle-kit migrate` runs,
   **Then** the `todos` table exists in the target database with the specified columns,
   **And** the migrations journal (`__drizzle_migrations`) records the applied migration.

4. **Given** `apps/api/src/db/client.ts`,
   **When** it is imported,
   **Then** it constructs a single `pg` connection pool and Drizzle instance at module scope,
   **And** exposes typed query helpers (e.g., `listTodos()`) so handlers import functions, not raw tables.

5. **Given** `apps/api/src/plugins/db.ts`,
   **When** the Fastify app registers the plugin,
   **Then** the Drizzle instance is decorated onto the app so route handlers can access it.

6. **Given** `apps/api/src/db/migrate.ts`,
   **When** it runs against a database whose applied-migration version matches the journal's expected version,
   **Then** it exits 0 silently,
   **And** when it runs against a database whose applied-migration version is older than expected, it exits non-zero with an error message explaining the drift (resolves Architecture §Gap Analysis gap #1).

## Tasks / Subtasks

- [x] **Task 1: Add Drizzle dependencies to apps/api (AC: #1, #2, #3, #4, #5, #6)**
  - [x] In [apps/api/package.json](../../apps/api/package.json), add to `dependencies`:
    - `"drizzle-orm": "^0.40.0"` — Drizzle runtime (schema definitions, query builder, migrator)
    - `"pg": "^8.13.0"` — node-postgres driver (used by `drizzle-orm/node-postgres`)
  - [x] Add to `devDependencies`:
    - `"drizzle-kit": "^0.30.0"` — generates SQL migrations from schema diffs; pinned major to match runtime ABI
    - `"@types/pg": "^8.11.0"` — types for pg
  - [x] Run `npm install` from repo root; verify `drizzle-orm`, `drizzle-kit`, `pg`, and `@types/pg` resolve from `apps/api/node_modules` or hoist to root. Use `npm ls drizzle-orm pg --workspace apps/api` to confirm.

- [x] **Task 2: Author Drizzle schema (AC: #1)**
  - [x] Create [apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts) with **exactly** this shape:
    ```ts
    import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';

    export const todos = pgTable('todos', {
      id: uuid('id').primaryKey().defaultRandom(),
      text: text('text').notNull(),
      completed: boolean('completed').notNull().default(false),
      createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    });
    ```
  - [x] Field-by-field intent (each is load-bearing):
    - `id`: `uuid` PK with `.defaultRandom()` — emits SQL `DEFAULT gen_random_uuid()`. Postgres 17 has `gen_random_uuid()` in core (no `pgcrypto` extension required).
    - `text`: `text` (unbounded SQL type). Length is enforced at the **API boundary** by `CreateTodoRequestSchema`'s `z.string().trim().min(1).max(500)` (Story 1.2). Do NOT add a SQL `CHECK (length(text) <= 500)` — duplicates the canonical Zod constraint and creates a drift hazard.
    - `completed`: `boolean` with `.notNull().default(false)` — wire-shape default matches.
    - `createdAt`: `timestamp` **with timezone** + `.defaultNow()`. Drizzle column alias maps DB `created_at` → TS field `createdAt` automatically. Wire-shape comes from this via the API's response serialization (Story 1.5).
  - [x] **Do NOT define** `owner_id`, `updated_at`, indexes, or any other column. v1 has no auth (FR14, NFR19) and no edit-text feature, so no `updated_at` is needed yet. Adding either now creates a migration hazard the moment they're actually wanted.

- [x] **Task 3: Author drizzle-kit config (AC: #2)**
  - [x] Create [apps/api/drizzle.config.ts](../../apps/api/drizzle.config.ts):
    ```ts
    import { defineConfig } from 'drizzle-kit';

    export default defineConfig({
      schema: './src/db/schema.ts',
      out: './drizzle',
      dialect: 'postgresql',
      dbCredentials: {
        url: process.env.DATABASE_URL!,
      },
      strict: true,
      verbose: true,
    });
    ```
  - [x] `dialect: 'postgresql'` — drizzle-kit's modern naming (was `pg` in older versions).
  - [x] `strict: true` — drizzle-kit refuses to drop columns silently; requires explicit confirmation. Worth the friction.
  - [x] **Do NOT set `migrations.prefix`** (defaults to numeric) or `breakpoints` — defaults match the architecture's "0000_init.sql" naming (AC #2 names the literal file).

- [x] **Task 4: Generate the initial migration (AC: #2, #3)**
  - [x] From `apps/api/`, run `npx drizzle-kit generate`. drizzle-kit reads `schema.ts`, diffs against `out/`, and writes:
    - `apps/api/drizzle/0000_init.sql` — `CREATE TABLE "todos" (...)` plus index DDL (none in v1)
    - `apps/api/drizzle/meta/0000_snapshot.json` — drizzle's internal schema snapshot
    - `apps/api/drizzle/meta/_journal.json` — list of applied migration entries
  - [x] Inspect the generated SQL. Verify it contains exactly:
    - `CREATE TABLE "todos"` (or `IF NOT EXISTS` — drizzle's choice; either is fine)
    - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
    - `text text NOT NULL`
    - `completed boolean DEFAULT false NOT NULL`
    - `created_at timestamp with time zone DEFAULT now() NOT NULL`
    - **No** `owner_id`, `updated_at`, or any other column.
    - **No** `DROP TABLE` or `ALTER` statements.
  - [x] If any field is wrong, fix `schema.ts` and re-run `drizzle-kit generate`. Do NOT hand-edit the generated SQL — it must remain a faithful artifact of the schema.
  - [x] Commit both `0000_init.sql` and `meta/_journal.json` (also `meta/0000_snapshot.json` since drizzle-kit needs it for future generation).

- [x] **Task 5: Apply the migration to the running container (AC: #3)**
  - [x] Ensure the local Postgres container from Story 1.3 is running: `docker compose up -d db` from repo root. (If host port 5432 is taken on this machine, see Story 1.3 follow-up notes.)
  - [x] Copy `.env.example` to `.env` if not present: `cp .env.example .env` (gitignored).
  - [x] From `apps/api/`, run `npx drizzle-kit migrate` (note: NOT `drizzle-kit push` — `migrate` applies versioned SQL files; `push` does declarative diffing without versioning, which violates AC #3).
  - [x] Verify the table exists: `docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c '\d todos'`. Output must show all 4 columns with the correct types and constraints.
  - [x] Verify the migrations journal exists: `docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c 'SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations";'`. Must show one row.
  - [x] Add a `db:migrate` script to [apps/api/package.json](../../apps/api/package.json): `"db:migrate": "drizzle-kit migrate"`. Used by `scripts/dev.sh` in Story 1.10.

- [x] **Task 6: Author the DB client (AC: #4)**
  - [x] Create [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts):
    ```ts
    import { drizzle } from 'drizzle-orm/node-postgres';
    import { Pool } from 'pg';
    import { asc } from 'drizzle-orm';
    import { todos } from './schema.ts';

    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required (apps/api/src/db/client.ts)');
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    export const db = drizzle(pool, { schema: { todos } });

    // Typed query helpers — handlers import these, not the raw `todos` table.
    // This keeps Drizzle replaceable per Architecture §Data Boundaries.
    export const listTodos = () =>
      db.select().from(todos).orderBy(asc(todos.createdAt));
    ```
  - [x] **Architectural rule:** route handlers (Stories 1.5+) MUST import functions like `listTodos`, NOT the raw `todos` table or the `db` instance directly. This is the Architecture §Data Boundaries contract: "handlers import functions, not raw tables (keeps swap-ability if Drizzle is replaced later)".
  - [x] The `import { todos } from './schema.ts'` uses the `.ts` extension — this is the ESM-required form when consumed by Node (apps/api compiles to CJS via tsc, but the TS source must stay valid for both ESM+TS toolchains). When apps/api emits to dist/, the .ts → .js rewrite is automatic (TypeScript's standard behavior with `module: NodeNext` or similar).
    - **Watch-out:** apps/api's `tsconfig.json` extends `[../../tsconfig.base.json, fastify-tsconfig]`. The fastify-tsconfig may set `module: commonjs`. Check the resolved config (`npx tsc --showConfig` from `apps/api/`) before assuming `.ts` extensions work in source. If the project is CJS-emitting, use `.js` extension instead (`from './schema.js'`) — TypeScript Bundler/NodeNext resolution rewrites at compile, JS ends up in dist/ resolving to the actually-emitted dist/schema.js.

- [x] **Task 7: Author the Fastify db plugin (AC: #5)**
  - [x] Create [apps/api/src/plugins/db.ts](../../apps/api/src/plugins/db.ts):
    ```ts
    import fp from 'fastify-plugin';
    import { db } from '../db/client.ts';

    export default fp(
      async (app) => {
        app.decorate('db', db);
      },
      { name: 'db' },
    );

    declare module 'fastify' {
      interface FastifyInstance {
        db: typeof db;
      }
    }
    ```
  - [x] `fastify-plugin` (already a dep from `fastify-cli` scaffold) is required to make the decoration visible OUTSIDE the plugin's encapsulation context. Without `fp()`, `app.db` would be undefined in routes registered at the same level.
  - [x] **Do NOT** register this plugin in `app.ts` yet — that's Story 1.5's full plugin-stack story. This story just authors the plugin file. Story 1.5 will register it alongside `@fastify/sensible`, `@fastify/cors`, etc.
  - [x] **Do NOT** auto-load it via fastify-cli's `@fastify/autoload`. Story 1.5 controls the registration order. Auto-loading here would race with `@fastify/env` (which validates `DATABASE_URL`).

- [x] **Task 8: Author the fail-fast check script (AC: #6, resolves Architecture Gap #1)**
  - [x] Create [apps/api/src/db/migrate.ts](../../apps/api/src/db/migrate.ts) as a **CHECK-only** script (it does NOT apply migrations — that's `drizzle-kit migrate`'s job). Behavior:
    1. Read [apps/api/drizzle/meta/_journal.json](../../apps/api/drizzle/meta/_journal.json). The latest entry (highest `idx`) is the **expected** migration tag/hash.
    2. Connect to `DATABASE_URL` via `pg`.
    3. Query `SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY id DESC LIMIT 1`. The result is the **applied** hash.
    4. Compute the **expected hash** the same way drizzle-kit would (read `drizzle/0000_init.sql` and SHA-256 it; OR use drizzle's own helper if exposed).
    5. Compare:
       - If `applied === expected` → log "Schema OK" (or stay silent), exit 0.
       - If `applied < expected` (older) OR `applied is null` (no migrations table) → log a clear error with both hashes/tags, exit 1.
       - If `applied > expected` (DB is ahead — shouldn't happen but guard against it) → log error, exit 1.
  - [x] **Hash computation note:** drizzle-kit hashes migrations via its internal algorithm. The simplest equivalent in user code: hash the migration SQL file content with SHA-256 and compare to the `hash` column. Verify by running `drizzle-kit migrate` first, then querying the recorded hash, then comparing it to a manual `sha256sum drizzle/0000_init.sql` — they should match. If drizzle-kit uses a different hashing strategy (e.g., normalized SQL), adjust accordingly. Worst case, fall back to comparing the **count of applied entries** vs. the journal's entry count — coarser but still satisfies AC #6's "older than expected" detection.
  - [x] Add a `db:check` script to [apps/api/package.json](../../apps/api/package.json): `"db:check": "node --import=tsx src/db/migrate.ts"` — but ONLY if `tsx` is added as a dev dep, OR use `tsc && node dist/db/migrate.js`. The execution model depends on apps/api's TS pipeline (see Task 6 watch-out). Pick one and document.
    - Story 1.10's `scripts/dev.sh` will call `db:migrate` (apply) then `db:check` (verify) then start the API.
  - [x] **Verification:**
    - With the DB freshly migrated (after Task 5): `npm run db:check --workspace apps/api` → exit 0.
    - To simulate drift: connect to the DB, manually run `DROP SCHEMA "drizzle" CASCADE` (destroys the migrations table), then `npm run db:check --workspace apps/api` → exit 1 with an error message naming the expected vs applied state. Restore by re-running `db:migrate`.

- [x] **Task 9: Sanity check — no regressions (AC: all)**
  - [x] Run `npm run lint` from repo root → exit 0 (apps/api boilerplate warnings from Story 1.1 carry over; no new errors introduced).
  - [x] Run `npm test --workspace packages/shared` → exit 0, 25/25 (Story 1.2 untouched).
  - [x] Run `npx tsc --noEmit` from `apps/api/` → exit 0 (the new schema/client/plugin/migrate files type-check cleanly).
  - [x] `git status` — only the new files (Task 1-8 deliverables) and the `package.json`/`package-lock.json` edits should appear. **No** new files in `apps/web/`, `packages/shared/`, or root config (this story is API-internal).

- [x] **Task 10: Commit**
  - [x] Stage exactly:
    - `apps/api/package.json`
    - `apps/api/drizzle.config.ts`
    - `apps/api/drizzle/0000_init.sql`
    - `apps/api/drizzle/meta/_journal.json`
    - `apps/api/drizzle/meta/0000_snapshot.json`
    - `apps/api/src/db/schema.ts`
    - `apps/api/src/db/client.ts`
    - `apps/api/src/db/migrate.ts`
    - `apps/api/src/plugins/db.ts`
    - root `package-lock.json`
  - [x] Commit message: `feat(api): drizzle schema + migration + db client + fail-fast check (Story 1.4)`

## Dev Notes

### Where this story sits

Story 1.4 is the **load-bearing data-layer foundation** for every API/data story:

| Story | What it depends on from here                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------- |
| 1.5   | `apps/api/src/plugins/db.ts` registered alongside the full plugin stack; `listTodos()` consumed by the `GET /todos` handler |
| 1.6   | `/health` runs `db.execute(sql"SELECT 1")` against the same `db` instance to check reachability             |
| 1.10  | `scripts/dev.sh` runs `npm run db:migrate --workspace apps/api`, then `npm run db:check --workspace apps/api`, then starts apps |
| 2.1   | `POST /todos` uses a typed query helper (`createTodo(text)`) added in Story 2.1 — extends the helper pattern from this story |
| 2.2   | `PATCH /todos/:id` uses a typed `updateTodoCompleted(id, completed)` helper                                  |
| 2.3   | `DELETE /todos/:id` uses a typed `deleteTodo(id)` helper                                                     |

The schema + helper pattern from this story is **the** template for every CRUD addition. Get it right here.

### Critical architectural guardrails (bind these hard)

- **Schema shape is exactly 4 columns.** No `owner_id`. No `updated_at`. The architecture's [Data Architecture](../../_bmad-output/planning-artifacts/architecture.md#data-architecture) section explicitly defers these and FR14 / NFR19 explicitly excludes auth. Adding either column now is forward-speculation, exactly the anti-pattern flagged in [PRD §Risk Mitigation](../../_bmad-output/planning-artifacts/prd.md).
- **`gen_random_uuid()` for IDs**, not `uuid_generate_v4()` (legacy uuid-ossp extension). Postgres 17 has `gen_random_uuid()` in core ([Source: architecture.md#Naming Patterns]).
- **`timestamptz` for `created_at`**, not `timestamp` (without timezone). Wire format is ISO 8601 with `Z` suffix; storing in UTC keeps the round-trip clean ([Source: architecture.md#Format Patterns]).
- **Handlers import typed query functions, not raw tables.** `listTodos`, `createTodo`, `updateTodoCompleted`, `deleteTodo` will be the surface area. The `todos` Drizzle table is an implementation detail of `client.ts` ([Source: architecture.md#Data Boundaries: "handlers import functions, not raw tables"]).
- **Migrations are versioned SQL, not declarative push.** Use `drizzle-kit migrate` (versioned), not `drizzle-kit push` (declarative diff). The committed migration files are the source of truth — operators apply them in order, including in production.
- **API never auto-applies migrations on startup.** `drizzle-kit migrate` is a separate one-shot command. The API only **verifies** (via `migrate.ts` check) that the DB is at the expected version before binding ports ([Source: architecture.md#Data Architecture: "Migrations executed as one-shot command... never on API startup"]).
- **Fail-fast check is the SOLE purpose of `apps/api/src/db/migrate.ts`.** It does NOT apply migrations. The naming is preserved from architecture for consistency, but read AC #6 carefully: it tests CHECK behavior (exit 0 on match, exit 1 on drift).

### DB ↔ wire shape mapping

| DB column      | DB type                       | TS field    | Wire field    | Notes                                                       |
| -------------- | ----------------------------- | ----------- | ------------- | ----------------------------------------------------------- |
| `id`           | `uuid` (gen_random_uuid)      | `id`        | `id`          | Same in all three layers. Lowercase hyphenated UUID v4.     |
| `text`         | `text NOT NULL`               | `text`      | `text`        | DB stores unbounded; bounds enforced at API boundary by Zod. |
| `completed`    | `boolean NOT NULL DEFAULT false` | `completed` | `completed`   | Same in all three.                                          |
| `created_at`   | `timestamptz NOT NULL DEFAULT now()` | `createdAt` | `createdAt`   | **The only snake_case ↔ camelCase mapping.** Drizzle column alias handles it. |

This is the canonical mapping. If a future column needs different casing, follow the same Drizzle alias pattern (TS field is the alias name; DB column is the first arg).

### Connection pool — single instance at module scope

```ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema: { todos } });
```

This is module-scoped, NOT lazily-created-on-first-call. Reasons:

- **Predictable startup:** if `DATABASE_URL` is invalid or the DB is unreachable, the failure surfaces at module-load time (Story 1.5's `@fastify/env` validates `DATABASE_URL` BEFORE this module loads, so a config issue manifests as a clean fail-fast).
- **Pool reuse:** every handler shares one pool. Don't create per-request pools — that defeats pooling and explodes connection count.
- **Test concerns:** integration tests (Story 1.5+) import the same `db` and reuse the pool. Don't worry about pool teardown in v1 — Node process exit closes pg sockets cleanly.

### `drizzle-kit migrate` vs the API's fail-fast check — they're different things

- **`drizzle-kit migrate`** (CLI): applies pending versioned SQL files to the target DB. Records each migration in `drizzle.__drizzle_migrations` with a hash. Idempotent (skips already-applied migrations). Used in dev (`scripts/dev.sh`) and prod (one-shot pre-deploy step).
- **`apps/api/src/db/migrate.ts`** (CHECK script): reads the local journal, queries the DB's `__drizzle_migrations`, compares. Exits 0 if the DB is up-to-date, exits 1 if it's behind. Does NOT apply anything.
- **`apps/api/src/plugins/db.ts`** (Fastify plugin): doesn't touch migrations at all. Just decorates `app.db = drizzle(pool)`.

Story 1.10 will wire these together: `compose up -d db` → `drizzle-kit migrate` (apply) → `apps/api/src/db/migrate.ts` (verify) → `npm run dev` (start API).

### Out-of-scope (do NOT do in this story)

- ❌ **No Fastify plugin registration in `app.ts`** — Story 1.5 wires the full plugin stack with order constraints. Adding `db.ts` registration here will conflict.
- ❌ **No `@fastify/env`, `@fastify/sensible`, etc.** — Story 1.5.
- ❌ **No `GET /todos` route handler** — Story 1.5.
- ❌ **No `@fastify/type-provider-zod` integration** — Story 1.5.
- ❌ **No additional query helpers beyond `listTodos`.** Story 2.1+ adds `createTodo`, `updateTodoCompleted`, `deleteTodo`. Pre-emptive helpers go stale.
- ❌ **No `drizzle-zod` integration.** Architecture mentions it, but `@todo-app/shared/contracts.ts` (Story 1.2) is the canonical Zod source. drizzle-zod would derive Zod from Drizzle — duplicates the contract surface and creates drift hazard. v1 keeps Drizzle and Zod aligned by hand (only one entity, four fields, change-rare).
- ❌ **No SQL `CHECK` constraints on `text` length.** Bounds belong at the API boundary (Zod). Putting them in the DB schema duplicates the Zod constraint and creates a drift hazard.
- ❌ **No indexes.** v1 has one query (`SELECT ... ORDER BY created_at`). Postgres uses a sequential scan; that's fine for the expected volume (a shared todo list in the dozens-to-hundreds of rows). Add indexes when measurements demand them, not preemptively (NFR21: "no module exists solely for speculative future use").
- ❌ **No integration tests with real Postgres.** Story 1.5 sets up `apps/api/test/integration/` infrastructure (helpers, ephemeral schemas). Adding tests here would duplicate that work. The Task 9 sanity checks (compile, lint, manual psql verification) cover this story's surface.
- ❌ **No `tsx` or alternative runtime loaders for migrate.ts.** Stick to whatever apps/api's existing tsc pipeline produces. If the package emits CJS to `dist/`, `db:check` runs `node dist/db/migrate.js` (after build).
- ❌ **No `pg-native`.** Pure-JS `pg` is the architecture-pinned driver.

### Previous story intelligence

**Story 1.1 (commit `9e4570e`):**
- `apps/api/` was scaffolded by `fastify-cli generate --lang=typescript`. The default scaffold has `dependencies: { fastify, fastify-plugin, @fastify/autoload, @fastify/sensible, fastify-cli }` and `devDependencies: { @types/node, c8, ts-node, concurrently, fastify-tsconfig, typescript }`. We add Drizzle to dependencies, drizzle-kit + @types/pg to devDependencies.
- `apps/api/tsconfig.json` extends `["../../tsconfig.base.json", "fastify-tsconfig"]`. The fastify-tsconfig preset sets module/moduleResolution for Node (likely CJS or NodeNext). Verify with `npx tsc --showConfig` before assuming `.ts` extensions are valid in imports.
- ESLint config at root applies `tseslint.configs.recommended` to `apps/api/**` with carve-outs for fastify-cli scaffold patterns (unused args `opts|request|reply|t`, etc.). New code in `src/db/` and `src/plugins/db.ts` should be clean against the recommended rules — these aren't fastify-cli boilerplate.

**Story 1.2 (commit `c2168ca`):**
- `@todo-app/shared` is precompiled to `dist/` via `prepare: tsc` on `npm install`. apps/api can import from `@todo-app/shared` and get types from `dist/index.d.ts`. We don't import contracts here (this story is DB-only), but the contracts will be the wire shape for Story 1.5.
- Two zod versions exist in the install tree (3.x in packages/shared, 4.x at root from eslint plugin transitive). Not relevant to this story (no Zod usage).

**Story 1.3 (commits `356ac02` + `976faa2`):**
- `docker-compose.yml` runs `postgres:17-alpine` on `127.0.0.1:5432:5432`. `.env.example` has `DATABASE_URL=postgres://todoapp:...@localhost:5432/todoapp`.
- **On dev machines with port 5432 conflicts** (the original verification machine), the developer must stop the conflicting container OR temporarily change the host port in `.env` (only — leave docker-compose.yml at the canonical 5432). Tasks 4 and 5 of this story require a running DB — same constraint applies.
- A named volume `todo-app-db-data` persists DB state across `docker compose down`/`up`.

### Drizzle versions and what to expect (April 2026)

- **`drizzle-orm` ^0.40.x** is current stable. Has `pgTable`, the `node-postgres` adapter, and the `migrator` helper. Compatible with TypeScript 5.5+.
- **`drizzle-kit` ^0.30.x** is current stable. Pinning major to runtime is mandatory — drizzle-kit and drizzle-orm sometimes ship breaking changes in lockstep.
- **`drizzle-kit generate`** (renamed from `generate:pg` in older versions) is the modern subcommand.
- **`drizzle-kit migrate`** (renamed from `migrate:pg`) applies pending migrations.
- The **`__drizzle_migrations`** table lives in a `drizzle` schema by default in current versions. Older versions used `public.__drizzle_migrations`. Confirm via `\dt drizzle.*` in `psql` after running migrate.
- Drizzle's hash algorithm: SHA-256 of the migration SQL content. The Task 8 implementation can shell out to `sha256sum` or use Node's `crypto.createHash('sha256')`.

### Project Structure Notes

Target additions from this story:

```text
apps/api/
├── drizzle.config.ts              # NEW — drizzle-kit config
├── drizzle/                       # NEW — committed generated migrations
│   ├── 0000_init.sql              # NEW
│   └── meta/
│       ├── _journal.json          # NEW
│       └── 0000_snapshot.json     # NEW
├── package.json                   # +deps: drizzle-orm, pg; +devDeps: drizzle-kit, @types/pg; +scripts: db:migrate, db:check
└── src/
    ├── db/
    │   ├── client.ts              # NEW — pool + drizzle instance + listTodos
    │   ├── migrate.ts             # NEW — fail-fast check script
    │   └── schema.ts              # NEW — todos table
    └── plugins/
        └── db.ts                  # NEW — Fastify plugin (decorates app.db)
```

- **Alignment:** matches [Architecture §Complete Project Directory Structure](../../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure) exactly.
- **Variances at end of Story 1.4:** No `apps/api/src/app.ts` plugin-stack registration yet (Story 1.5). No `apps/api/test/integration/` (Story 1.5 owns that). No `apps/web/src/lib/api.ts` (Story 1.8).
- **Pre-existing fastify-cli boilerplate stays untouched:** `src/app.ts`, `src/plugins/sensible.ts`, `src/plugins/support.ts`, `src/routes/root.ts`, `src/routes/example/index.ts`, `test/*` from Story 1.1's scaffold are NOT modified by this story.

### Testing Requirements

- **No automated tests in this story.** The schema/migration/client are pure data plumbing; meaningful behavior tests (the actual round-trip from HTTP request through the DB) live in Story 1.5's integration tests against a real Postgres. Adding partial tests here duplicates that work.
- **Manual verification (operational, encoded in Tasks 4–8):**
  - `drizzle-kit generate` produces the migration files
  - `drizzle-kit migrate` creates the table
  - `psql ... \d todos` shows the correct shape
  - `db:check` exits 0 against a migrated DB
  - `db:check` exits 1 against a tampered/empty DB
- **Type-checking is the implicit unit test for the schema and client surface** — Task 9's `npx tsc --noEmit` from apps/api catches any column/type misalignment.

### References

- [Source: epics.md#Story 1.4: API data layer — Drizzle schema, migration, client, fail-fast check] — original BDD acceptance criteria
- [Source: architecture.md#Data Architecture] — Postgres 17, Drizzle ORM, drizzle-kit migrations, fail-fast pattern
- [Source: architecture.md#Data Boundaries] — "handlers import functions, not raw tables"
- [Source: architecture.md#Naming Patterns] — `gen_random_uuid()`, snake_case DB columns + camelCase wire fields
- [Source: architecture.md#Format Patterns] — `timestamptz` storage, ISO 8601 wire format
- [Source: architecture.md#Gap Analysis Results — Gap #1] — fail-fast-on-schema-mismatch mechanism (resolved by this story)
- [Source: architecture.md#Implementation Sequence] — Story 1.4 = "API data layer: Drizzle schema + initial migration; DB connection plugin"
- [Source: prd.md#NFR21] — "no module exists solely for speculative future use" (justifies no-indexes, no-updated_at, no-owner_id)
- [Story 1.1 file] — apps/api scaffold via fastify-cli
- [Story 1.2 file] — `@todo-app/shared`'s precompile pattern, two-zod-versions follow-up flagged for this story (not relevant since we don't add Zod here)
- [Story 1.3 file] — docker-compose.yml local DB; port 5432 + collision workarounds

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`

### Debug Log References

- **drizzle-kit's auto-naming.** First `drizzle-kit generate` produced `0000_far_magik.sql` (drizzle-kit picks a random Marvel-style name when `--name` is omitted). AC #2 specifies `0000_init.sql` literally, so I removed the auto-named output and re-ran with `drizzle-kit generate --name init`. The journal records `tag: '0000_init'` and the SQL file matches the AC byte-for-byte.
- **`import.meta.url` vs CommonJS emit.** First migrate.ts draft used `import.meta.url` + `fileURLToPath` to compute paths. It RAN fine via `node --experimental-strip-types` (which detects ESM syntax and reparses), but `tsc --noEmit` errored: "TS1470: The 'import.meta' meta-property is not allowed in files which will build into CommonJS output." apps/api compiles to CJS (`module: nodenext` + no `"type": "module"` in package.json defaults to CJS). Switched to `process.cwd()` — works identically in CJS+ESM and avoids the dual-mode trap. The script must be invoked from `apps/api/`, which the `db:check` npm script enforces.
- **strictNullChecks on `expected.at(-1)`.** Initial draft used `expected.at(-1)?.tag` which compiled fine, but the same shape as plain index access (`expected[i]`) tripped TS2532 in the for-loop body. Restructured to extract `const exp = expected[i]; const app = applied[i];` with explicit guards. Cleaner and TS-strict-clean.
- **Drizzle's hash IS plain SHA-256 of the migration file.** Confirmed empirically: `shasum -a 256 drizzle/0000_init.sql` produces `2980ab5f3fe5ee707b6fd122a4a3f166fc91557aff0740254e52ad09846bc2c0`, which matches the `hash` column in `drizzle.__drizzle_migrations` exactly. No special normalization, no statement-by-statement hashing, no whitespace stripping — just `sha256(fileContent)`. This makes the migrate.ts comparison logic trivial.
- **Port-5432 conflict re-emerged.** The user's `compatibility-api-vmo2-cms-db-1` container was restarted (autostart-managed) between Story 1.3 and this story, blocking 5432. For Tasks 4–8 verification, I temporarily edited `docker-compose.yml` to bind `127.0.0.1:5433:5432` (matching my local `.env` which still had 5433 from Story 1.3 verification) — verified everything end-to-end — then reverted `docker-compose.yml` to the canonical `5432:5432` before staging the commit. The committed config is still 5432 per the user's preference; the local `.env` (gitignored) stays at 5433 for this dev machine.
- **Module-type warning on `node --experimental-strip-types`.** Running `db:check` produces a Node warning: "Module type of file://... is not specified and it doesn't parse as CommonJS. Reparsing as ES module because module syntax was detected." Harmless — the script runs correctly with exit 0 (success) or 1 (drift). Adding `"type": "module"` to `apps/api/package.json` would silence the warning but force ALL of apps/api into ESM mode, which conflicts with fastify-cli's scaffold (`__dirname` usage in `app.ts`). Defer the module-type decision to Story 1.5 or beyond.

### Completion Notes List

**What was built:**

- [apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts) — Drizzle `todos` table: `id` uuid PK with `.defaultRandom()` (emits `gen_random_uuid()`), `text` text NOT NULL, `completed` boolean NOT NULL DEFAULT false, `createdAt` timestamptz NOT NULL DEFAULT now() (DB column `created_at` via Drizzle's column alias). 4 columns, 0 indexes, 0 FKs.
- [apps/api/drizzle.config.ts](../../apps/api/drizzle.config.ts) — drizzle-kit config: `dialect: 'postgresql'`, schema → `./src/db/schema.ts`, out → `./drizzle`, `strict: true`, `verbose: true`.
- [apps/api/drizzle/0000_init.sql](../../apps/api/drizzle/0000_init.sql) — committed initial migration. Generated via `drizzle-kit generate --name init` (the `--name` flag forces the canonical `init` suffix per AC #2).
- [apps/api/drizzle/meta/_journal.json](../../apps/api/drizzle/meta/_journal.json) and [apps/api/drizzle/meta/0000_snapshot.json](../../apps/api/drizzle/meta/0000_snapshot.json) — drizzle-kit's tracking metadata. Both committed.
- [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts) — module-scoped `pg.Pool` + `drizzle(pool, { schema: { todos } })`. Exports `db` and the typed query helper `listTodos()` (orders by `createdAt` ASC). The architecture's "handlers import functions, not raw tables" rule is enforced by the helper pattern.
- [apps/api/src/plugins/db.ts](../../apps/api/src/plugins/db.ts) — Fastify plugin that decorates `app.db = db` via `fastify-plugin` (so the decoration leaks past the encapsulation context). NOT auto-registered. NOT loaded in `app.ts`. Story 1.5 owns plugin-stack registration.
- [apps/api/src/db/migrate.ts](../../apps/api/src/db/migrate.ts) — fail-fast schema-drift check. Reads `_journal.json`, computes SHA-256 for each `<tag>.sql`, queries `drizzle.__drizzle_migrations`, compares hashes in order. Exit 0 on match, exit 1 with detailed error on count mismatch, hash mismatch, or missing migrations table. Resolves [Architecture §Gap Analysis Gap #1](../../_bmad-output/planning-artifacts/architecture.md).
- New scripts on [apps/api/package.json](../../apps/api/package.json): `db:migrate` → `drizzle-kit migrate`, `db:check` → `node --experimental-strip-types src/db/migrate.ts`.
- Commit: `bd1954f feat(api): drizzle schema + migration + db client + fail-fast check (Story 1.4)` on `main`.

**ACs validated (with concrete evidence):**

- **AC #1** ✓ — `psql \d todos` (against the migrated DB) shows: `id uuid not null DEFAULT gen_random_uuid()`, `text text not null`, `completed boolean not null DEFAULT false`, `created_at timestamp with time zone not null DEFAULT now()`. Indexes: `todos_pkey PRIMARY KEY btree (id)`. No `owner_id`, no `updated_at`, no other columns.
- **AC #2** ✓ — `drizzle-kit generate --name init` produced `apps/api/drizzle/0000_init.sql` and `apps/api/drizzle/meta/_journal.json`. Both staged + committed (also `0000_snapshot.json` since drizzle-kit needs it for future generation).
- **AC #3** ✓ — `npx drizzle-kit migrate` against `DATABASE_URL` ran "migrations applied successfully!" `SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations"` returned 1 row with hash `2980ab5f3fe5ee707b6fd122a4a3f166fc91557aff0740254e52ad09846bc2c0`. Hash matches `shasum -a 256 drizzle/0000_init.sql`.
- **AC #4** ✓ — `client.ts` constructs a single module-scoped `pg.Pool` and Drizzle instance. `listTodos()` is a typed helper with the correct return shape (`Todo[]` inferred via Drizzle). `tsc --noEmit` from apps/api passes.
- **AC #5** ✓ — `plugins/db.ts` uses `fastify-plugin`'s `fp()` wrapper to decorate `app.db = db`. The TypeScript declaration merging (`declare module 'fastify'`) makes `app.db` typed in route handlers. NOT auto-registered (deferred to Story 1.5 per Out-of-Scope).
- **AC #6** ✓ — Two-pronged proof:
  - **Match path:** `npm run db:check --workspace apps/api` against the freshly-migrated DB → exit 0, silent (no stdout per AC's "exits 0 silently").
  - **Drift path:** ran `DROP SCHEMA "drizzle" CASCADE` to remove the migrations table → `npm run db:check` → exit 1, stderr: "ERROR: Could not read drizzle.__drizzle_migrations. The database has no migrations table — run `drizzle-kit migrate` first."
  - Re-applied migration after drift test, `db:check` exits 0 again.

**Final lint + test gate:**

- `npm run lint` → exit 0 (4 pre-existing fastify-cli boilerplate warnings, no new ones).
- `npm test --workspace packages/shared` → exit 0, 25/25 (Story 1.2 untouched).
- `(cd apps/api && npx tsc --noEmit)` → exit 0 (the new schema/client/plugin/migrate files type-check cleanly).
- `npm run db:check --workspace apps/api` → exit 0.

**Notable deviations from the story plan:**

1. **migrate.ts uses `process.cwd()` instead of `import.meta.url`-derived paths.** The story Task 8 didn't pin the path-resolution strategy, but my first draft used `import.meta.url` + `fileURLToPath`. tsc rejected it because apps/api emits CJS. `process.cwd()` works in both CJS and ESM execution modes and the script is required to be invoked from `apps/api/` (the `db:check` npm script's working dir).
2. **drizzle-kit auto-name workaround.** Plain `drizzle-kit generate` produces `0000_<adjective_noun>.sql`. Used `--name init` to satisfy AC #2's literal `0000_init.sql` filename. Story Task 4 didn't pre-specify the flag — flagging here so Story 2.1+ remembers to use `--name <descriptive>` for future migrations.

**Known follow-ups (out of this story's scope):**

- **Module-type decision for apps/api.** The current setup (no `"type": "module"` in package.json + `module: nodenext` in tsconfig) compiles to CJS and runs via Node's ESM-fallback when invoked with `--experimental-strip-types`. This produces a "module type not specified" warning. Picking ESM uniformly would require updating fastify-cli's `__dirname` usage in `app.ts`. Story 1.5 should make this decision when wiring the full plugin stack.
- **drizzle.__drizzle_migrations schema name.** Newer drizzle-kit versions store the migrations table in a dedicated `drizzle` schema (e.g., `drizzle.__drizzle_migrations`). Older versions used `public.__drizzle_migrations`. The migrate.ts script hardcodes the new location; if a downstream story rolls back drizzle-kit version this assumption breaks. Pin the version in package.json (already done — `^0.30.0`).
- **db:check warning silencing.** Adding `"type": "module"` would silence the Node warning but is invasive (see follow-up #1).

### File List

**Created:**

- [apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts) — Drizzle `todos` table
- [apps/api/drizzle.config.ts](../../apps/api/drizzle.config.ts) — drizzle-kit config
- [apps/api/drizzle/0000_init.sql](../../apps/api/drizzle/0000_init.sql) — initial migration SQL
- [apps/api/drizzle/meta/_journal.json](../../apps/api/drizzle/meta/_journal.json) — migration journal
- [apps/api/drizzle/meta/0000_snapshot.json](../../apps/api/drizzle/meta/0000_snapshot.json) — drizzle-kit snapshot
- [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts) — pg pool + Drizzle instance + `listTodos()`
- [apps/api/src/plugins/db.ts](../../apps/api/src/plugins/db.ts) — Fastify plugin decorating `app.db`
- [apps/api/src/db/migrate.ts](../../apps/api/src/db/migrate.ts) — fail-fast schema-drift check

**Modified:**

- [apps/api/package.json](../../apps/api/package.json) — `+dependencies.{drizzle-orm, pg}`, `+devDependencies.{drizzle-kit, @types/pg}`, `+scripts.{db:migrate, db:check}`
- `package-lock.json` (root) — reflects new transitive dependency tree

### Review Findings

_Code review run 2026-04-29 (multi-story batch covering 1.1–1.4). Three parallel layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor. The hash-algorithm-mismatch claim (raised by Edge Case Hunter as critical) was empirically verified false: `node_modules/drizzle-orm/migrator.js` confirms drizzle uses plain SHA-256 of the raw migration file content — exactly what migrate.ts computes._

**Patches (actionable now):**

- [x] [Review][Patch] migrate.ts: `_journal.json` malformed/missing or referenced SQL file missing produces opaque errors [apps/api/src/db/migrate.ts:30,35,59-61] — wrap `JSON.parse` and per-tag `readFile` in try/catch; emit actionable messages naming the missing/malformed file and reminding the developer to invoke from `apps/api/`.
- [x] [Review][Patch] migrate.ts: empty journal + empty `__drizzle_migrations` passes silently as "OK" without verifying tables exist [apps/api/src/db/migrate.ts:80] — treat `expected.length === 0` as suspicious; warn or fail rather than declaring "in sync" when nothing is tracked.
- [x] [Review][Patch] migrate.ts: DB-ahead-of-journal gives wrong remediation message [apps/api/src/db/migrate.ts:80-89] — currently `if (applied.length !== expected.length)` lumps both directions together and tells the user to "Run drizzle-kit migrate". When `applied.length > expected.length`, the right action is "pull/rebase your working tree" — branch the message accordingly.
- [x] [Review][Patch] migrate.ts: `pool.end()` not awaited on success path [apps/api/src/db/migrate.ts:97-117] — `process.exit(0)` tears the process down, but the success branch leaves an in-flight pool that may emit "Connection terminated unexpectedly" warnings. Wrap the query+verification block in `try/finally` and `await pool.end()` in finally.
- [x] [Review][Patch] CRLF/LF hash mismatch on Windows checkouts [.gitattributes — new file] — Git on Windows with `core.autocrlf=true` rewrites SQL line endings, breaking the SHA-256 comparison even when the file is unedited. Add `.gitattributes` with `*.sql text eol=lf` (and `*.json text eol=lf` for the journal) so Windows devs don't get false drift on `db:check`.
- [x] [Review][Patch] client.ts: `orderBy(asc(createdAt))` has no tiebreaker [apps/api/src/db/client.ts:14-15] — two rows inserted in the same millisecond/microsecond have undefined sort order (Postgres `defaultNow()` can collide within a transaction). FR10 promises consistent ordering across page loads. Add `asc(todos.id)` as a stable tiebreaker.

**Deferred (real, but premature for v1; track for Story 1.5+ when the API actually serves traffic):**

- [x] [Review][Defer] Pool not bounded — no `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, or `statement_timeout` set [apps/api/src/db/client.ts:10] — production tuning; defer to deploy-readiness story.
- [x] [Review][Defer] No `pool.on('error', ...)` listener [apps/api/src/db/client.ts:10] — pg's idle-client errors crash the process if unhandled. Hook in when the API actually owns long-running connections (Story 1.5+).
- [x] [Review][Defer] No graceful shutdown — `pool.end()` not called on Fastify `onClose` [apps/api/src/plugins/db.ts:6-9] — tests/SIGTERM leak connections. Wire up when integration tests land (Story 1.5).
- [x] [Review][Defer] Module-load throw on missing `DATABASE_URL` [apps/api/src/db/client.ts:12-14] — fail-fast is correct for prod, but inhibits unit tests that mock the DB and tooling that imports schema transitively. Consider lazy init when test infrastructure lands.
- [x] [Review][Defer] Zod `datetime()` round-trip with Drizzle `Date` objects [packages/shared/src/contracts.ts:11 ↔ apps/api/src/db/schema.ts:7-9] — Drizzle returns JS `Date` for `timestamptz` columns; `z.string().datetime()` rejects Date instances. Will surface in Story 1.5 when handlers serialize. Fix options: `mode: 'string'` on the Drizzle column, or `.preprocess(v => v instanceof Date ? v.toISOString() : v, ...)` on the Zod schema.
- [x] [Review][Defer] migrate.ts `process.cwd()` coupling [apps/api/src/db/migrate.ts:30] — already documented as a Notable Deviation. Defer hardening (e.g., resolve `drizzleDir` relative to module URL with appropriate ESM/CJS guard) until module-type decision is made.
- [x] [Review][Defer] `todos` raw table is exported and not encapsulated [apps/api/src/db/schema.ts:3] — the architectural rule "handlers import functions, not raw tables" is documentation-only. No ESLint rule prevents `import { todos } from '../db/schema.js'` in a future handler. Add a no-restricted-imports rule banning `apps/api/src/db/schema` outside `apps/api/src/db/` when more handlers land.
- [x] [Review][Defer] Defensive `WHERE hash IS NOT NULL` on the migrations query [apps/api/src/db/migrate.ts:87-90] — safety against drizzle-internal-table corruption.
- [x] [Review][Defer] `DATABASE_URL` truthy-but-malformed guard [apps/api/src/db/client.ts:12-14] — `URL` parse + clear message instead of relying on pg.Pool's runtime error. Story 1.5 will validate via `@fastify/env`.

### Change Log

| Date       | Author                | Change                                                              |
| ---------- | --------------------- | ------------------------------------------------------------------- |
| 2026-04-29 | Claude Opus 4.7 (Dev) | Story 1.4 implemented; status `ready-for-dev` → `review`. Commit `bd1954f`. |
| 2026-04-29 | Claude Opus 4.7 (Reviewer) | Code review applied — 6 patches identified, 9 defers, 14 dismissed (incl. the false hash-algo claim verified against drizzle-orm source). Status: `review` → `in-progress` if patches accepted. |
| 2026-04-29 | Claude Opus 4.7 (Reviewer) | Run 2 (3-agent chunked re-review of `bd1954f`+`9f2c763`, 370 lines): Acceptance Auditor confirmed all 6 ACs pass and verified hash semantics match drizzle-orm `migrator.js:23` (raw `sha256(file)`). Blind+Edge surfaced production-hardening concerns (pool config, SSL, SIGTERM) that the auditor confirmed are addressed by downstream Stories 1.5/1.6 in the working tree (e.g., `onClose` hook present, `pool.on('error')` listener present). 2 new patches applied: (a) resolve `drizzleDir` from `import.meta.dirname` to remove cwd coupling [migrate.ts:28]; (b) tighten `.gitattributes` from repo-wide `*.sql`/`*.json` to `apps/api/drizzle/**`. Lint + tsc clean. Status: `review` → `done`. |

### Review Findings (Run 2)

**Patches applied:**

- [x] [Review][Patch] Resolve `drizzleDir` from `import.meta.dirname` instead of `process.cwd()` [apps/api/src/db/migrate.ts:28] — eliminates the "must be invoked from `apps/api/`" coupling; script now works from any cwd.
- [x] [Review][Patch] Scope `.gitattributes` LF rules from repo-wide globs to `apps/api/drizzle/**` paths [.gitattributes] — repo-wide `*.sql` / `*.json` was a sledgehammer; the LF pin only matters for the SHA-256-hashed migration journal/SQL files.

**Deferred (out of Story 1.4 scope or already addressed by downstream stories):**

- [x] [Review][Defer] Pool config (`max`, `connectionTimeoutMillis`, `idleTimeoutMillis`, `statement_timeout`, SSL) [apps/api/src/db/client.ts] — production tuning; Story 1.5+ handles when the API serves real traffic.
- [x] [Review][Defer] Migration drift checker has zero unit tests [apps/api/src/db/migrate.ts] — the file is the lynchpin of Architecture §Gap #1; tests would need a real DB or a heavy mock harness. Defer until test infrastructure for the api app lands.
- [x] [Review][Defer] Concurrent `db:check` runs hit the same DB without an advisory lock — acceptable in v1 (single-developer dev loop); revisit when CI parallelism lands.
- [x] [Review][Defer] No `--> statement-breakpoint` discipline in `0000_init.sql` — single-statement migration is fine; future multi-statement migrations should enforce.
- [x] [Review][Defer] `listTodos` return type not exported as a named type — handlers re-derive via TS inference today; export `Todo` (or `TodoRow`) from `client.ts` when the second handler lands.
