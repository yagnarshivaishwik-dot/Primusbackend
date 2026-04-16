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

# ── Credentials (5 cafes) ─────────────────────────────────────
export LOAD_TEST_BASE_URL="${LOAD_TEST_BASE_URL:-http://20.55.214.91:8000}"

export CAFE1_EMAIL="${CAFE1_EMAIL:-shravyareddy767@gmail.com}"
export CAFE1_PASSWORD="${CAFE1_PASSWORD:-r8F8x^hoiiTj}"

export CAFE2_EMAIL="${CAFE2_EMAIL:-yagnarshivaishwik@gmail.com}"
export CAFE2_PASSWORD="${CAFE2_PASSWORD:-j#J*zdDtCcS3}"

export CAFE3_EMAIL="${CAFE3_EMAIL:-vyomatechnologies7@gmail.com}"
export CAFE3_PASSWORD='9WKxNQp3$E8Q'

export CAFE4_EMAIL="${CAFE4_EMAIL:-ybojja@gmail.com}"
export CAFE4_PASSWORD='Y#kS$8&sLGwW'

export CAFE5_EMAIL="${CAFE5_EMAIL:-bhargavyyp.ae@gmail.com}"
export CAFE5_PASSWORD='N$^z59az*6^S'

# ── Tunables (per cafe) ───────────────────────────────────────
export LOAD_TEST_NUM_PCS_PER_CAFE="${LOAD_TEST_NUM_PCS_PER_CAFE:-100}"
export LOAD_TEST_NUM_USERS_PER_CAFE="${LOAD_TEST_NUM_USERS_PER_CAFE:-100}"
export LOAD_TEST_CONCURRENCY="${LOAD_TEST_CONCURRENCY:-30}"
export LOAD_TEST_DURATION_SEC="${LOAD_TEST_DURATION_SEC:-60}"
export LOAD_TEST_TARGET_RPS="${LOAD_TEST_TARGET_RPS:-0}"
# Fresh state every run by default — triggers per-cafe stale-PC API
# cleanup via /api/clientpc/{id} DELETE for each admin's cafe.
export LOAD_TEST_FRESH="${LOAD_TEST_FRESH:-1}"
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
say "  Target          : $LOAD_TEST_BASE_URL"
say "  Cafes           : 5"
say "  PCs   per cafe  : $LOAD_TEST_NUM_PCS_PER_CAFE"
say "  Users per cafe  : $LOAD_TEST_NUM_USERS_PER_CAFE"
say "  Concurrency     : $LOAD_TEST_CONCURRENCY"
say "  Duration        : ${LOAD_TEST_DURATION_SEC}s"
say "  Target RPS      : $LOAD_TEST_TARGET_RPS (0 = unlimited)"
say "  Log file        : $LOG_FILE"
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
