#!/usr/bin/env bash
# =============================================================
# Primus  Load Test (no backend management)
# =============================================================
# Minimal runner that just fires the load test against whatever
# backend is currently running. Does NOT touch uvicorn, docker, or
# systemd in any way. Use this when:
#
#   - You've already prepared the backend with
#     setup_backend_for_loadtest.sh
#   - Or you don't want this script anywhere near your running
#     backend processes
#
# Usage:
#     bash loadtest_only.sh
#
# All env vars are honored exactly as in run_load_test.sh, e.g.
#     LOAD_TEST_TARGET_RPS=15 bash loadtest_only.sh
# =============================================================

set -euo pipefail

# ── Credentials ───────────────────────────────────────────────
export LOAD_TEST_BASE_URL="${LOAD_TEST_BASE_URL:-http://localhost:8000}"
export CAFE1_EMAIL="${CAFE1_EMAIL:-vaishwik14366@gmail.com}"
export CAFE1_PASSWORD="${CAFE1_PASSWORD:-DFO0O6hh9b9n}"

# ── Tunables ──────────────────────────────────────────────────
export LOAD_TEST_NUM_PCS="${LOAD_TEST_NUM_PCS:-100}"
export LOAD_TEST_NUM_USERS="${LOAD_TEST_NUM_USERS:-100}"
export LOAD_TEST_CONCURRENCY="${LOAD_TEST_CONCURRENCY:-30}"
export LOAD_TEST_DURATION_SEC="${LOAD_TEST_DURATION_SEC:-60}"
export LOAD_TEST_TARGET_RPS="${LOAD_TEST_TARGET_RPS:-0}"
export NO_COLOR=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
LOG_FILE="/tmp/load_test_$(date +%s).log"

say()  { printf '%s\n' "$*"; }
info() { printf '[..] %s\n' "$*"; }
ok()   { printf '[OK] %s\n' "$*"; }
err()  { printf '[XX] %s\n' "$*"; }

say ""
say "=========================================================="
say "  Primus Load Test (no backend management)"
say "  Target      : $LOAD_TEST_BASE_URL"
say "  PCs         : $LOAD_TEST_NUM_PCS"
say "  Users       : $LOAD_TEST_NUM_USERS"
say "  Concurrency : $LOAD_TEST_CONCURRENCY"
say "  Duration    : ${LOAD_TEST_DURATION_SEC}s"
say "  Target RPS  : $LOAD_TEST_TARGET_RPS (0 = unlimited)"
say "  Log file    : $LOG_FILE"
say "=========================================================="

# Pull latest
if [ -d .git ]; then
    say ""
    info "Pulling latest code..."
    git pull origin main 2>/dev/null || true
fi

# Install requests if missing (no sudo needed for pip3 --user, but
# tolerate either)
say ""
info "Checking dependencies..."
python3 -c "import requests" 2>/dev/null \
    || pip3 install --quiet --user requests 2>/dev/null \
    || pip3 install --quiet requests 2>/dev/null \
    || true

# Connectivity
say ""
info "Checking backend is reachable at $LOAD_TEST_BASE_URL ..."
if curl -sf --max-time 5 "$LOAD_TEST_BASE_URL/docs" -o /dev/null; then
    ok "backend is reachable"
else
    err "Cannot reach $LOAD_TEST_BASE_URL"
    err "Make sure the backend is running. To prepare it for capacity"
    err "testing, run: sudo bash setup_backend_for_loadtest.sh"
    exit 1
fi

# Wipe state cache so we get fresh PC IDs
if [ -f load_test_state.json ]; then
    say ""
    info "Clearing cached state file..."
    rm -f load_test_state.json
fi

# ── Run ───────────────────────────────────────────────────────
say ""
say "=========================================================="
say "  Running load test (output also saved to $LOG_FILE)"
say "=========================================================="
say ""

python3 -u load_test.py 2>&1 | tee "$LOG_FILE"
exit_code=${PIPESTATUS[0]}

say ""
say "Full log saved to: $LOG_FILE"
exit "$exit_code"
