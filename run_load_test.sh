#!/usr/bin/env bash
# =============================================================
# Primus · Load Test Runner
# =============================================================
# Simulates 100 PCs and 100 client users hitting the backend
# concurrently with a mix of heartbeats, logins, and logouts.
#
# Run on the cloud server:
#   bash run_load_test.sh
#
# What it auto-handles:
#   1. git pull
#   2. Cleanup of stale LoadTest PCs (via API or SQL fallback)
#   3. Backend restart with relaxed rate limit + 4 workers (sudo)
#   4. State cache invalidation
#   5. Dependency check
# =============================================================

set -euo pipefail

# ── Credentials ───────────────────────────────────────────────
export LOAD_TEST_BASE_URL="http://localhost:8000"
export CAFE1_EMAIL="vaishwik14366@gmail.com"
export CAFE1_PASSWORD="DFO0O6hh9b9n"

# ── Tunables ──────────────────────────────────────────────────
export LOAD_TEST_NUM_PCS="${LOAD_TEST_NUM_PCS:-100}"
export LOAD_TEST_NUM_USERS="${LOAD_TEST_NUM_USERS:-100}"
export LOAD_TEST_CONCURRENCY="${LOAD_TEST_CONCURRENCY:-30}"
export LOAD_TEST_DURATION_SEC="${LOAD_TEST_DURATION_SEC:-60}"
# After auto-restart the backend has a 1M req/min cap, so the pacer
# is no longer needed. Set TARGET_RPS=15 manually if you skip the
# auto-restart and want to stay under the production limit.
export LOAD_TEST_TARGET_RPS="${LOAD_TEST_TARGET_RPS:-0}"

# Backend restart knobs — set AUTO_RESTART_BACKEND=0 to skip the
# automated restart entirely (useful if the backend is managed by
# systemd or docker and you don't want this script touching it).
AUTO_RESTART_BACKEND="${AUTO_RESTART_BACKEND:-1}"
BACKEND_RATE_LIMIT_PER_MINUTE="${BACKEND_RATE_LIMIT_PER_MINUTE:-1000000}"
BACKEND_RATE_LIMIT_BURST="${BACKEND_RATE_LIMIT_BURST:-10000}"
BACKEND_WORKERS="${BACKEND_WORKERS:-4}"
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

# ── Setup ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
BACKEND_DIR="${BACKEND_DIR:-$SCRIPT_DIR/backend}"

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

# ── Auto-restart the backend with relaxed rate limit ─────────
restart_backend() {
    echo ""
    echo "▶  Restarting backend with relaxed rate limit + $BACKEND_WORKERS workers"
    echo "   (RATE_LIMIT_PER_MINUTE=$BACKEND_RATE_LIMIT_PER_MINUTE,"
    echo "    RATE_LIMIT_BURST=$BACKEND_RATE_LIMIT_BURST)"

    # Test sudo non-interactively first
    if ! sudo -n true 2>/dev/null; then
        echo ""
        echo "   ⚠ sudo requires a password. The backend is running as root,"
        echo "     so the script needs sudo to restart it. Either:"
        echo "       (a) prime sudo first:   sudo -v   then re-run this script"
        echo "       (b) skip auto-restart:  AUTO_RESTART_BACKEND=0 LOAD_TEST_TARGET_RPS=15 bash run_load_test.sh"
        echo ""
        return 1
    fi

    if [ ! -d "$BACKEND_DIR" ]; then
        echo "   ✗ Backend directory $BACKEND_DIR not found — set BACKEND_DIR env var"
        return 1
    fi

    # Kill any existing uvicorn / python main.py processes (root-owned ok)
    sudo pkill -9 -f 'uvicorn app.main:app' 2>/dev/null || true
    sudo pkill -9 -f 'python.*main\.py' 2>/dev/null || true
    sleep 2

    # Verify they're gone
    local survivors
    survivors=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null || true)
    if [ -n "$survivors" ]; then
        echo "   ✗ Some uvicorn processes survived: $survivors"
        return 1
    fi

    # Start fresh, as root, with the new env vars
    sudo bash -c "cd '$BACKEND_DIR' && \
        RATE_LIMIT_PER_MINUTE=$BACKEND_RATE_LIMIT_PER_MINUTE \
        RATE_LIMIT_BURST=$BACKEND_RATE_LIMIT_BURST \
        nohup uvicorn app.main:app \
            --host $BACKEND_HOST --port $BACKEND_PORT \
            --workers $BACKEND_WORKERS \
            > /tmp/primus.log 2>&1 &"

    # Wait for it to come up (max 30s)
    echo -n "   waiting for backend to come back"
    for i in $(seq 1 30); do
        if curl -sf --max-time 2 "$LOAD_TEST_BASE_URL/docs" -o /dev/null 2>&1; then
            echo " ✓"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    echo "   ✗ Backend did not come back within 30s. Check /tmp/primus.log:"
    sudo tail -30 /tmp/primus.log 2>/dev/null || true
    return 1
}

needs_restart() {
    # Detect whether the running backend already has the high rate limit.
    # We read /proc/<pid>/environ for the uvicorn process and grep for
    # the env var. If found and matching, no restart needed.
    local pid env_str
    pid=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null | head -1)
    if [ -z "$pid" ]; then
        return 0  # nothing running → needs restart
    fi
    env_str=$(sudo cat "/proc/$pid/environ" 2>/dev/null | tr '\0' '\n' \
              | grep '^RATE_LIMIT_PER_MINUTE=' || true)
    if [ -z "$env_str" ]; then
        return 0  # no env var set → restart
    fi
    local current_limit
    current_limit="${env_str#RATE_LIMIT_PER_MINUTE=}"
    if [ "$current_limit" -lt "$BACKEND_RATE_LIMIT_PER_MINUTE" ] 2>/dev/null; then
        return 0  # too low → restart
    fi
    # Also check workers — count uvicorn worker processes (master + N workers)
    local worker_count
    worker_count=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null | wc -l)
    if [ "$worker_count" -lt $((BACKEND_WORKERS + 1)) ]; then
        return 0  # not enough workers → restart
    fi
    return 1  # already configured correctly
}

if [ "$AUTO_RESTART_BACKEND" = "1" ]; then
    if needs_restart; then
        if ! restart_backend; then
            echo "   ⚠ Auto-restart failed — falling back to client-side pacing"
            export LOAD_TEST_TARGET_RPS=15
        fi
    else
        echo ""
        echo "▶  Backend already running with high rate limit and $BACKEND_WORKERS+ workers — skipping restart"
    fi
fi

# Default to a fresh run: wipe state cache and trigger PC cleanup phase.
export LOAD_TEST_FRESH="${LOAD_TEST_FRESH:-1}"
if [ "$LOAD_TEST_FRESH" = "1" ] && [ -f load_test_state.json ]; then
    echo ""
    echo "▶  LOAD_TEST_FRESH=1 — clearing cached state file"
    rm -f load_test_state.json
fi

# SQL fallback cleanup: nuke stale LoadTest PCs in every per-cafe DB.
if [ "${LOAD_TEST_SQL_CLEANUP:-0}" = "1" ]; then
    echo ""
    echo "▶  LOAD_TEST_SQL_CLEANUP=1 — running SQL cleanup"
    if command -v psql >/dev/null 2>&1; then
        for db in $(sudo -u postgres psql -tAc \
            "SELECT datname FROM pg_database WHERE datname LIKE 'clutchhh_cafe_%' OR datname LIKE 'primus_cafe_%';" 2>/dev/null); do
            echo "   → cleaning $db"
            sudo -u postgres psql -d "$db" -c \
                "DELETE FROM client_pcs WHERE name LIKE 'LoadTest-PC-%';" || true
        done
    else
        echo "   ⚠ psql not found, skipping SQL cleanup"
    fi
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
    exit 1
fi

# Backend process info
echo ""
echo "▶  Backend process info"
ps -eo pid,pcpu,pmem,args 2>/dev/null \
    | grep -E 'uvicorn app.main:app' \
    | grep -v grep \
    | awk '{printf "   pid=%-6s cpu=%-5s%% mem=%-5s%%\n", $1, $2, $3}' \
    || echo "   (no backend processes detected via ps)"

# ── Run ───────────────────────────────────────────────────────
echo ""
python3 load_test.py
