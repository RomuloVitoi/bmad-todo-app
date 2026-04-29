#!/usr/bin/env bash
# scripts/dev.sh — Single-command local dev orchestrator (NFR20).
#
# Sequence:
#   1. docker compose up -d --wait db   # blocks until pg_isready healthcheck passes
#   2. npm --workspace apps/api run db:migrate   # idempotent; no-op when current
#   3. npm-run-all --parallel --print-label dev:web dev:api   # both servers, interleaved logs
#
# `set -euo pipefail` exits on first non-zero. `exec` on the final line lets
# SIGINT / SIGTERM propagate to npm-run-all (which forwards to children) so
# Ctrl+C cleanly stops both dev servers.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

if [ ! -f .env ]; then
  cat <<'EOF' >&2
ERROR: .env not found at repo root.

Copy the template and fill in any local overrides:

  cp .env.example .env

Then re-run: npm run dev
EOF
  exit 1
fi

echo "[dev.sh] Bringing up Postgres (docker compose up -d --wait db)…"
docker compose up -d --wait db

echo "[dev.sh] Applying database migrations (drizzle-kit migrate)…"
npm --workspace apps/api run db:migrate

echo "[dev.sh] Starting web (:3000) and api (:4000) in parallel…"
exec npx --no-install npm-run-all --parallel --print-label dev:web dev:api
