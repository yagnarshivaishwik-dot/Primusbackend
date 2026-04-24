#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# Primus Cashfree env bootstrapper.
#
# Usage:
#   ./scripts/setup_cashfree_env.sh \
#       <APP_ID> <SECRET_KEY> <WEBHOOK_SECRET> [production|sandbox]
#
#   # or, interactive prompts if no args:
#   ./scripts/setup_cashfree_env.sh
#
# Writes/updates the five CASHFREE_* entries in backend/.env (creating it
# from env.example if missing), backing up the previous file first. After
# running, restart the backend container:
#
#   docker compose restart backend
#
# This script NEVER commits secrets — .env is git-ignored.
# ----------------------------------------------------------------------------

set -euo pipefail

cd "$(dirname "$0")/.."   # cd into backend/
ENV_FILE=".env"
EXAMPLE_FILE="env.example"

if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$EXAMPLE_FILE" ]; then
        echo "[setup-cashfree] Creating .env from env.example"
        cp "$EXAMPLE_FILE" "$ENV_FILE"
    else
        echo "[setup-cashfree] Creating fresh empty .env"
        : > "$ENV_FILE"
    fi
fi

APP_ID="${1:-}"
SECRET="${2:-}"
WEBHOOK="${3:-}"
ENV_MODE="${4:-}"

if [ -z "$APP_ID" ]; then
    read -r -p "Cashfree APP ID: " APP_ID
fi
if [ -z "$SECRET" ]; then
    read -rs -p "Cashfree SECRET KEY: " SECRET; echo
fi
if [ -z "$WEBHOOK" ]; then
    read -rs -p "Cashfree WEBHOOK SECRET: " WEBHOOK; echo
fi
if [ -z "$ENV_MODE" ]; then
    if [[ "$SECRET" == *"_prod_"* ]]; then
        ENV_MODE="production"
    else
        ENV_MODE="sandbox"
    fi
fi

NOTIFY_URL="https://api.primustech.in/api/v1/payment/cashfree/webhook"

backup="${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$backup"
echo "[setup-cashfree] Backed up existing .env → $backup"

upsert() {
    local key="$1" value="$2"
    if grep -q "^${key}=" "$ENV_FILE"; then
        # Escape &, /, \ for sed replacement string.
        local esc
        esc=$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')
        sed -i.tmp "s|^${key}=.*|${key}=${esc}|" "$ENV_FILE"
        rm -f "${ENV_FILE}.tmp"
    else
        printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    fi
}

upsert CASHFREE_APP_ID "$APP_ID"
upsert CASHFREE_SECRET_KEY "$SECRET"
upsert CASHFREE_WEBHOOK_SECRET "$WEBHOOK"
upsert CASHFREE_ENV "$ENV_MODE"
upsert CASHFREE_NOTIFY_URL "$NOTIFY_URL"

# Print redacted summary so an operator can visually confirm without echoing secrets.
redact() { printf '%s' "$1" | sed 's/.\{6\}$/******/'; }
echo "[setup-cashfree] Wrote:"
echo "  CASHFREE_APP_ID          = $(redact "$APP_ID")"
echo "  CASHFREE_SECRET_KEY      = $(redact "$SECRET")"
echo "  CASHFREE_WEBHOOK_SECRET  = $(redact "$WEBHOOK")"
echo "  CASHFREE_ENV             = $ENV_MODE"
echo "  CASHFREE_NOTIFY_URL      = $NOTIFY_URL"
echo
echo "[setup-cashfree] Next: docker compose restart backend"
