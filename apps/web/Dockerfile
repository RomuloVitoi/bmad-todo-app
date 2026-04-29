# syntax=docker/dockerfile:1.7

# ===========================================================
# Stage 1: deps — install workspace deps (uses build cache)
# ===========================================================
FROM node:22-alpine AS deps
WORKDIR /app

# Copy ONLY the manifests so the npm-ci layer caches between source changes.
# Workspace install needs every package.json in the tree.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# packages/shared's `prepare` hook runs `tsc` during `npm ci`; its tsconfig
# extends ../../tsconfig.base.json, so the base must be present before install.
COPY tsconfig.base.json ./

# `npm ci` honors workspaces. The `prepare` hook in packages/shared (Story 1.2)
# builds dist/ via tsc — we need its source tree available here for the prepare
# to succeed. Bring just the shared package source (cheap layer).
COPY packages/shared/ packages/shared/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --include-workspace-root

# ===========================================================
# Stage 2: builder — produce Next.js standalone output
# ===========================================================
FROM node:22-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_API_URL is inlined at build time. CI passes this via --build-arg.
# Default to a sentinel so an unset value fails loudly during smoke testing,
# not silently against a wrong origin.
ARG NEXT_PUBLIC_API_URL=__UNSET__
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Bring deps from stage 1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared ./packages/shared
# Workspace-local node_modules carry non-hoisted deps (npm workspaces isolates
# conflicting versions per-workspace). apps/web has e.g. vite-tsconfig-paths
# here; without this, `next build`'s TS pass can't resolve its own configs.
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copy what next build needs
COPY package.json package-lock.json ./
COPY apps/web/ apps/web/
# tsconfig.base.json is referenced via apps/web/tsconfig.json's `extends`
COPY tsconfig.base.json ./

# Fail loudly if the build-arg wasn't passed (or was passed empty, which CI's
# `${{ vars.NEXT_PUBLIC_API_URL }}` substitution does silently for an unset var).
RUN test -n "$NEXT_PUBLIC_API_URL" && test "$NEXT_PUBLIC_API_URL" != "__UNSET__" || \
    (echo "ERROR: --build-arg NEXT_PUBLIC_API_URL=<base-url> is required (non-empty)" && exit 1)

RUN npm --workspace apps/web run build

# ===========================================================
# Stage 3: runtime — minimal image, non-root, standalone server
# ===========================================================
FROM node:22-alpine AS runtime
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Copy ONLY the standalone artifacts. Total runtime image: ~150–200 MB.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

# The standalone server is at apps/web/server.js because the standalone copy
# preserves the workspace path layout.
CMD ["node", "apps/web/server.js"]
