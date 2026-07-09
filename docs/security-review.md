# Security Review — Todo App

Scope: full repo (`apps/api`, `apps/web`, `packages/shared`, Docker/Compose, env files). Manual review of application code + `npm audit` for dependency CVEs. Date: 2026-07-09. Updated 2026-07-09 after applying fixes for Findings 1–7.

**Overall**: the application layer is well hardened — Zod `.strict()` validation on every route, parameterized queries via Drizzle (no string-built SQL), CORS in function mode with explicit origin matching, no `dangerouslySetInnerHTML`/`eval`/raw `innerHTML`, non-root Docker users, secrets properly gitignored. Findings below are dependency CVEs and a couple of hardening gaps, not exploitable app-logic bugs.

## Status

| # | Finding | Status |
| --- | --- | --- |
| 1 | Next.js CVEs | **Fixed** — upgraded to `16.2.10` |
| 2 | `drizzle-orm` SQL-injection advisory | **Fixed** — upgraded to `0.45.2` |
| 3 | `fast-uri` path-traversal/host-confusion | **Fixed** — pinned to `3.1.3` via `overrides` |
| 4 | `postcss` XSS (transitive via `next`) | **Fixed** — pinned to `8.5.12` via `overrides` (Next's bundled copy was pinned below the patch) |
| 5 | `brace-expansion` DoS (transitive via Swagger UI) | **Fixed** — pinned to `5.0.7` via a version-scoped override |
| 6 | `shell-quote` critical (unreachable, via `drizzle-orm`'s optional `gel` driver) | **Fixed** — pinned to `1.9.0` via `overrides`, resolved as a side effect |
| 7 | No CSP on the web app | **Fixed** — added `headers()` in `apps/web/next.config.ts` |
| 8 | Rate limiting bypassable via spoofed `X-Forwarded-For` | **Open** — needs a deployment-topology decision, see below |
| 9 | No auth (by design) | **Not a bug** — no action taken |

`npm audit --omit=dev` now reports **0 vulnerabilities**. Full test suite (154+ tests across `packages/shared`, `apps/api`, `apps/web`) and typecheck pass. Verified in a real browser (production build): CSP headers present, no console/CSP violations, and an injected `<script>` payload in a todo's text rendered as literal escaped text (React auto-escaping) rather than executing.

## Findings

### 1. HIGH — Next.js `16.2.4` has multiple known vulnerabilities (fix: upgrade)
`apps/web` depends on `next@16.2.4`. `npm audit` reports it's below the patched `16.2.5`/`16.2.6`/`16.2.10` lines for a cluster of CVEs, including:
- **XSS in App Router apps using CSP nonces** (GHSA-ffhc-5mcf-pf4q)
- **XSS via `beforeInteractive` scripts with untrusted input** (GHSA-gx5p-jg67-6x7h)
- **SSRF via WebSocket upgrades** (GHSA-c4j6-fc7j-m34r)
- Several middleware/proxy route-bypass and cache-poisoning issues, plus a DoS in Server Components and the Image Optimization API.

**Fixed**: upgraded to `next@16.2.10` (`npm install next@16.2.10 -w apps/web`). Confirmed clean via `npm audit`, full test suite, and a manual browser check of the production build.

### 2. HIGH — `drizzle-orm@0.40.1` has a known SQL-injection advisory in identifier escaping
GHSA-gpj5-g38j-94v9: Drizzle ORM versions `<0.45.2` can improperly escape SQL identifiers. In this codebase, all queries go through the type-safe query builder (`db.select()/.insert()/.update()/.delete()` with `eq()`/`asc()`) with no dynamically constructed identifiers or `sql.identifier()` calls — the specific vulnerable path isn't reachable from current app code. Still, it's a direct dependency shipping a known CVE.

**Fixed**: upgraded to `drizzle-orm@0.45.2`. API test suite (unit) passes unchanged; the query-builder calls this app uses (`select`/`insert`/`update`/`delete`/`eq`/`asc`) are unaffected by the version bump.

### 3. HIGH — `fast-uri` path-traversal / host-confusion (transitive via `ajv`)
`fast-uri@3.1.0` (pulled in by `ajv`, used by Fastify's schema compiler, `@fastify/env`, and `@fastify/swagger`) is vulnerable to path traversal via percent-encoded dot segments and host confusion via percent-encoded authority delimiters (GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc). Not directly reachable from user input in this app's routes today, but it's in the request-validation hot path.

**Fixed**: `npm audit fix` couldn't resolve this on its own (it hit an unrelated peer-dependency conflict in `apps/web`'s dev toolchain and refused to proceed without `--force`). Instead, pinned `fast-uri` to `^3.1.3` via a root `overrides` entry in `package.json` — a minimal patch-level bump (not the `4.x` major `npm audit` initially suggested) that both advisories are fixed in.

### 4. MODERATE — `postcss` XSS in CSS stringification (transitive via `next`)
GHSA-qx2v-qp2m-jg93. `next@16.2.10` still ships an internal exact pin on `postcss@8.4.31` (below the `8.5.10` patch) for its own asset pipeline — the Next.js upgrade in Finding 1 didn't clear this one automatically.

**Fixed**: added `"postcss": "^8.5.12"` to the root `overrides`, forcing the patched version everywhere, including inside `next`'s own dependency tree. `npm ls postcss` confirms `8.5.12` resolved throughout after a clean reinstall; build and test suite pass.

### 5. MODERATE — `brace-expansion` ReDoS-style DoS (transitive via Swagger UI's `glob`/`minimatch`)
GHSA-jxxr-4gwj-5jf2, reachable only through `@fastify/swagger-ui`'s static-file glob matching, not user-facing request data.

**Fixed**: added a version-scoped override, `"brace-expansion@5.0.5": "^5.0.7"`, rather than a blanket `"brace-expansion": "..."` override — the repo also carries unrelated `brace-expansion@1.x`/`2.x` copies (via ESLint's toolchain) that use a different major-version API; a blanket override broke those (confirmed via `npm ls brace-expansion --all` showing `invalid` resolutions) before narrowing it to the specific vulnerable version.

### 6. CRITICAL (severity label) but low practical risk — `shell-quote` in `drizzle-orm`'s optional `gel` driver
GHSA-w7jw-789q-3m8p is critical by CVSS, but it's pulled in transitively by `drizzle-orm`'s optional support for the Gel database driver (`gel` package), which this app never imports or uses — it uses `pg`/`node-postgres` exclusively. No reachable code path today.

**Fixed** (as a side effect): pinned `"shell-quote": "^1.9.0"` in `overrides` for defense-in-depth, even though the `gel` code path is unreachable from this app.

### 7. LOW/hardening — Web app ships no Content-Security-Policy
`apps/web/next.config.ts` sets no custom headers, and there's no CSP anywhere in the Next.js app. Current app code has no XSS sink (JSX auto-escapes `{todo.text}`, no `dangerouslySetInnerHTML`), so this isn't currently exploitable — but a CSP is the standard defense-in-depth layer against any future injection (a compromised dependency, an accidentally-added `dangerouslySetInnerHTML`, a third-party script).

**Fixed**: added a `headers()` block to `apps/web/next.config.ts` setting `Content-Security-Policy` (`default-src 'self'`, `connect-src 'self' <NEXT_PUBLIC_API_URL>`, `frame-ancestors 'none'`, etc.), plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a baseline `Permissions-Policy`. `script-src`/`style-src` include `'unsafe-inline'` — the App Router injects inline hydration/streaming scripts that a strict `'self'`-only policy would block without wiring a per-request nonce through middleware; this is a documented trade-off in the config file's comment, not an oversight. Verified in a real browser against the production build: header renders with the API origin correctly interpolated, zero CSP console violations, and the app's create/toggle/delete flows all still work.

### 8. LOW/informational — Rate limiting is bypassable via spoofed `X-Forwarded-For`
`apps/api/src/server.ts` sets `trustProxy: true` unconditionally, and `@fastify/rate-limit` keys by `req.ip`. With `trustProxy: true` and no restriction on which hop is trusted, any client can set `X-Forwarded-For` to an arbitrary value and get a fresh rate-limit bucket per request, defeating the 100 req/min cap entirely. **This is already flagged in the code's own comments** as deferred hardening for Story 1.11 ("tighten to a CIDR allow-list or hop count") — flagging here only so it's tracked in this review too, not a newly discovered issue.

**Remediation**: when a real deployment topology is known, set `trustProxy` to the specific number of trusted hops (e.g. `1` behind a single LB) or a CIDR allow-list of the terminator's address, per the existing TODO.

### 9. INFORMATIONAL — No authentication/authorization by design
There is no auth anywhere in the API — any client that can reach it can list, create, update, or delete **any** todo. This is explicit, stated product intent (`layout.tsx` metadata: *"visible to everyone, no sign-in required"*), not an oversight, so it's not treated as a vulnerability. Documenting it here for completeness: if the product scope ever expands to per-user data, this is the first thing that needs to change, and the current CORS/rate-limit posture would need to be re-evaluated alongside it (e.g., `credentials: false` in CORS would need revisiting if cookies/sessions are introduced).

## What was checked and found clean
- **XSS**: no `dangerouslySetInnerHTML`, `innerHTML`, or `eval`/`new Function` anywhere in `apps/web` or `apps/api`. All user-supplied todo text is rendered via JSX text interpolation (`{todo.text}`), which React escapes automatically.
- **SQL injection**: all queries use Drizzle's parameterized query builder; the one raw-SQL usage (`sql\`SELECT 1\`` in the health check) is a static literal with no interpolation.
- **Input validation**: every API route validates body/params against `.strict()` Zod schemas (rejects unknown fields, enforces UUID format on `:id`, length-bounds todo text at 500 chars).
- **CORS**: function-mode origin check against a single configured, normalized origin; `credentials: false`; explicit method allow-list.
- **Secrets management**: `.env`/`.env.local` are gitignored and not tracked in git; only `.env.example` (placeholder dev credentials, clearly labeled) is committed.
- **Docker**: multi-stage builds, non-root runtime users (`fastify`, `nextjs`, uid 1001), minimal runtime images, Postgres port bound to `127.0.0.1` only.
- **Request smuggling / log injection**: inbound `x-request-id` header is validated against a strict charset regex before use; falls back to a generated UUID otherwise.
- **Body size**: `bodyLimit: 4096` on the Fastify instance bounds request payload size.
- **Swagger/docs exposure**: gated behind `NODE_ENV !== 'production'` with an explicit override flag; documented and intentional.

## Remaining work

**Finding 8** (rate-limit bypass via spoofed `X-Forwarded-For`) is intentionally left open. Fixing it means setting `trustProxy` to a specific hop count or CIDR allow-list, which requires knowing the real deployment topology (is there a load balancer? how many hops? what's its address range?) — information not available from the codebase alone. The code's own comment in `apps/api/src/server.ts` already defers this to "Story 1.11 deployment hardening" for the same reason. Revisit once that's known.

**Finding 9** (no auth) requires no action — it's stated product intent, not a defect.
