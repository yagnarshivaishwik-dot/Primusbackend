#!/usr/bin/env bash
# Deploy the Persistent Profile Picture System to Azure (Linux).
#
#   - Validates required env vars (DATABASE_URL, GLOBAL_DATABASE_URL,
#     AZURE_STORAGE_CONNECTION_STRING).
#   - Installs / upgrades `azure-storage-blob`.
#   - Creates the `profile-pictures` Azure Blob container if missing.
#   - Runs the legacy + global Alembic migrations against Azure Postgres.
#   - Optionally pings the running API to confirm the new routes respond.
#
# Usage:
#   ./scripts/deploy-profile-pictures.sh                # full deploy
#   ./scripts/deploy-profile-pictures.sh --no-container # skip container create
#   ./scripts/deploy-profile-pictures.sh --no-pip       # skip pip install
#   ./scripts/deploy-profile-pictures.sh --smoke <api>  # ping API after deploy
#
# Run from the backend/ directory (parent of scripts/).

set -euo pipefail

# ---------------------------------------------------------------------------
# CLI flags
# ---------------------------------------------------------------------------

DO_PIP=1
DO_CONTAINER=1
DO_MIGRATE=1
SMOKE_BASE_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pip) DO_PIP=0; shift ;;
    --no-container) DO_CONTAINER=0; shift ;;
    --no-migrate) DO_MIGRATE=0; shift ;;
    --smoke) SMOKE_BASE_URL="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log()  { printf "\033[1;36m▸ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m! %s\033[0m\n" "$*"; }
fail() { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# Locate backend root (this script lives in backend/scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"
log "Backend root: $BACKEND_DIR"

# Try loading .env if present so the script works locally too.
if [[ -f .env ]]; then
  log "Loading .env"
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

# ---------------------------------------------------------------------------
# Env validation
# ---------------------------------------------------------------------------

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "$name is not set. Set it in your environment or .env file."
  fi
}

log "Validating environment"
require_env DATABASE_URL

if [[ -z "${GLOBAL_DATABASE_URL:-}" ]]; then
  warn "GLOBAL_DATABASE_URL not set — falling back to DATABASE_URL for the global migration."
  export GLOBAL_DATABASE_URL="$DATABASE_URL"
fi

CONTAINER="${AZURE_PROFILE_PICTURES_CONTAINER:-profile-pictures}"
PUBLIC="${AZURE_PROFILE_PICTURES_PUBLIC:-1}"

if [[ -z "${AZURE_STORAGE_CONNECTION_STRING:-}" \
   && -z "${AZURE_STORAGE_ACCOUNT_URL:-}" ]]; then
  warn "AZURE_STORAGE_CONNECTION_STRING is not set."
  warn "Backend will fall back to local /static/avatars/ — fine for dev, NOT for production."
  DO_CONTAINER=0
fi
ok "Environment OK"

# ---------------------------------------------------------------------------
# Pip install
# ---------------------------------------------------------------------------

if [[ "$DO_PIP" -eq 1 ]]; then
  log "Installing azure-storage-blob (and any other missing requirements)"
  pip install -q --upgrade pip
  # Install only the new dep — full requirements.txt install is the
  # deploy pipeline's job, not this script's.
  pip install -q "azure-storage-blob>=12.19.0"
  ok "Python deps OK"
else
  warn "Skipping pip install (--no-pip)"
fi

# ---------------------------------------------------------------------------
# Azure Blob container provisioning (idempotent)
# ---------------------------------------------------------------------------

if [[ "$DO_CONTAINER" -eq 1 ]]; then
  log "Ensuring Azure Blob container '$CONTAINER' exists (public=$PUBLIC)"
  python - <<'PY'
import os, sys
from azure.storage.blob import BlobServiceClient, PublicAccess
from azure.core.exceptions import ResourceExistsError

container = os.environ.get("AZURE_PROFILE_PICTURES_CONTAINER", "profile-pictures")
public = os.environ.get("AZURE_PROFILE_PICTURES_PUBLIC", "1") not in {"0", "false", "False"}

conn = os.environ.get("AZURE_STORAGE_CONNECTION_STRING")
acc_url = os.environ.get("AZURE_STORAGE_ACCOUNT_URL")
acc_key = os.environ.get("AZURE_STORAGE_ACCOUNT_KEY")

if conn:
    svc = BlobServiceClient.from_connection_string(conn)
elif acc_url and acc_key:
    svc = BlobServiceClient(account_url=acc_url, credential=acc_key)
else:
    sys.exit("No Azure credentials in env.")

cc = svc.get_container_client(container)
try:
    cc.create_container(public_access=PublicAccess.Blob if public else None)
    print(f"Created container '{container}' (public={public}).")
except ResourceExistsError:
    print(f"Container '{container}' already exists — leaving alone.")
PY
  ok "Azure Blob container ready"
else
  warn "Skipping container provisioning"
fi

# ---------------------------------------------------------------------------
# Alembic migrations on Azure Postgres
# ---------------------------------------------------------------------------

if [[ "$DO_MIGRATE" -eq 1 ]]; then
  log "Running Alembic migrations (legacy schema → DATABASE_URL)"
  if [[ -f alembic.ini ]]; then
    alembic -c alembic.ini upgrade head
    ok "Legacy migrations applied"
  else
    warn "alembic.ini not found — skipping legacy migration"
  fi

  log "Running Alembic migrations (global schema → GLOBAL_DATABASE_URL)"
  if [[ -f alembic_global.ini ]]; then
    alembic -c alembic_global.ini upgrade head
    ok "Global migrations applied"
  else
    warn "alembic_global.ini not found — skipping global migration"
  fi
else
  warn "Skipping migrations (--no-migrate)"
fi

# ---------------------------------------------------------------------------
# Smoke test (optional)
# ---------------------------------------------------------------------------

if [[ -n "$SMOKE_BASE_URL" ]]; then
  log "Smoke-testing API at $SMOKE_BASE_URL"
  # Just confirm the health endpoint responds and /api/profile is mounted
  # (returns 401 without a token — that's a healthy "yes, the route exists").
  if curl -fsS "$SMOKE_BASE_URL/health" >/dev/null; then
    ok "/health OK"
  else
    fail "/health did not respond at $SMOKE_BASE_URL"
  fi

  status=$(curl -s -o /dev/null -w "%{http_code}" "$SMOKE_BASE_URL/api/profile")
  if [[ "$status" == "401" || "$status" == "403" ]]; then
    ok "/api/profile mounted (got $status without token, as expected)"
  else
    warn "/api/profile returned HTTP $status — check router wiring."
  fi
fi

ok "Profile picture deploy complete."
log "Next step: restart the API process so the new routes & azure-storage-blob load."
