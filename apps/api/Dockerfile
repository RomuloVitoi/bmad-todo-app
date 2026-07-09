# syntax=docker/dockerfile:1.7

# ===========================================================
# Stage 1: deps — install workspace deps (uses build cache)
# ===========================================================
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# packages/shared's `prepare` hook runs `tsc` during `npm ci`; its tsconfig
# extends ../../tsconfig.base.json, so the base must be present before install.
COPY tsconfig.base.json ./

# packages/shared's `prepare` hook builds dist/ via tsc; bring its source.
COPY packages/shared/ packages/shared/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --include-workspace-root

# ===========================================================
# Stage 2: builder — compile TypeScript to dist/
# ===========================================================
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared ./packages/shared
# Workspace-local node_modules are NOT always hoisted to the root (npm workspaces
# isolates conflicting versions per-workspace). Copy them explicitly so tsc can
# resolve apps/api's deps (e.g. fastify-type-provider-zod, drizzle-orm peers).
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/ apps/api/

RUN npm --workspace apps/api run build:ts

# Verify dist/server.js exists — fail loud if tsc silently produced nothing.
RUN test -f apps/api/dist/server.js || \
    (echo "ERROR: apps/api/dist/server.js not found after build:ts" && exit 1)

# Drop devDeps via prune, then surgically remove apps/web's hoisted PROD deps
# (next, react, lightningcss, etc.) — `npm prune --omit=dev --workspaces`
# only removes devDeps and would otherwise leave ~400 MB of web's prod deps in
# the root node_modules. Listing them explicitly keeps the runtime image down
# to ~150 MB. If apps/web grows new prod deps that hoist, add them here.
RUN npm prune --omit=dev --workspaces \
 && rm -rf \
    node_modules/next node_modules/@next node_modules/@swc \
    node_modules/react node_modules/react-dom node_modules/react-is node_modules/scheduler \
    node_modules/@img node_modules/lightningcss node_modules/lightningcss-* node_modules/sharp \
    node_modules/tailwindcss node_modules/@tailwindcss \
    apps/web apps/web/node_modules

# ===========================================================
# Stage 3: runtime — minimal image, non-root, compiled server
# ===========================================================
FROM node:22-alpine AS runtime
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs fastify

ENV NODE_ENV=production \
    PORT=4000

# Copy compiled API + production node_modules + drizzle migration files.
# Layer ordering: largest stable layer first (node_modules) for better caching.
COPY --from=builder --chown=fastify:nodejs /app/node_modules ./node_modules
# Workspace-local node_modules carry the non-hoisted prod deps (e.g.
# fastify-type-provider-zod). Include them post-prune so runtime resolution works.
COPY --from=builder --chown=fastify:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=fastify:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=fastify:nodejs /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=builder --chown=fastify:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=fastify:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=fastify:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=fastify:nodejs /app/package.json ./package.json

USER fastify

EXPOSE 4000

# The compiled entry point. Note: cwd is /app/apps/api so apps/api/src/db/migrate.ts
# paths (which use import.meta.dirname) resolve drizzle/ correctly:
# /app/apps/api/dist/db/migrate.js → ../../../drizzle → /app/apps/api/drizzle ✓
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]

# ===========================================================
# Stage 4: migrator — one-shot `drizzle-kit migrate` runner
# ===========================================================
# Branches off `deps` (not `builder`) because `builder` prunes devDependencies
# (drizzle-kit included) before producing the runtime image. `deps` still has
# the full node_modules tree, so this stage costs no extra install step.
FROM deps AS migrator
WORKDIR /app/apps/api

COPY apps/api/drizzle drizzle
COPY apps/api/drizzle.config.ts drizzle.config.ts

CMD ["npx", "drizzle-kit", "migrate"]
