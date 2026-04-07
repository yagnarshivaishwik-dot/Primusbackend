#!/usr/bin/env bash
# =============================================================
# Primus · Load Test Runner
# =============================================================
# Simulates 40 PCs and 30 client users hitting the backend
# concurrently with a mix of heartbeats, logins, and logouts.
#
# Run on the cloud server:
#   bash run_load_test.sh
# =============================================================

set -euo pipefail

# ── Credentials ───────────────────────────────────────────────
export LOAD_TEST_BASE_URL="http://localhost:8000"
export CAFE1_EMAIL="yagnarshivaishwik@gmail.com"
export CAFE1_PASSWORD="j#J*zdDtCcS3"

# ── Tunables ──────────────────────────────────────────────────
export LOAD_TEST_NUM_PCS="${LOAD_TEST_NUM_PCS:-40}"
export LOAD_TEST_NUM_USERS="${LOAD_TEST_NUM_USERS:-30}"
export LOAD_TEST_CONCURRENCY="${LOAD_TEST_CONCURRENCY:-20}"
export LOAD_TEST_DURATION_SEC="${LOAD_TEST_DURATION_SEC:-60}"

# ── Setup ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Primus Load Test"
echo "  Target      : $LOAD_TEST_BASE_URL"
echo "  PCs         : $LOAD_TEST_NUM_PCS"
echo "  Users       : $LOAD_TEST_NUM_USERS"
echo "  Concurrency : $LOAD_TEST_CONCURRENCY"
echo "  Duration    : ${LOAD_TEST_DURATION_SEC}s"
echo "══════════════════════════════════════════════════════════"

# Pull latest code (if running from a git checkout)
if [ -d .git ]; then
    echo ""
    echo "▶  Pulling latest code..."
    git pull origin main || true
fi

# Ensure requests is installed
echo ""
echo "▶  Checking dependencies..."
python3 -c "import requests" 2>/dev/null || pip3 install --quiet requests

# Connectivity check
echo ""
echo "▶  Checking backend is reachable at $LOAD_TEST_BASE_URL ..."
if curl -sf --max-time 5 "$LOAD_TEST_BASE_URL/docs" -o /dev/null; then
    echo "   ✓ Backend is up"
else
    echo ""
    echo "   ✗ Cannot reach $LOAD_TEST_BASE_URL"
    echo "   Is the backend running?"
    exit 1
fi

# ── Run ───────────────────────────────────────────────────────
echo ""
python3 load_test.py
