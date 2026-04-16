#!/usr/bin/env bash
# =============================================================
# Primus  Load Test Runner
# =============================================================
# Simulates 100 PCs and 100 client users hitting the backend
# concurrently with a mix of heartbeats, logins, and logouts.
#
# Run on the cloud server:
#   bash run_load_test.sh
#
# Auto-handled:
#   1. git pull
#   2. Backend restart with relaxed rate limit + 4 workers (sudo)
#   3. State cache invalidation + stale PC cleanup
#   4. Dependency check
#   5. Output tee'd to /tmp/load_test_<timestamp>.log
# =============================================================

set -euo pipefail

# ── Credentials (5 cafes) ─────────────────────────────────────
export LOAD_TEST_BASE_URL="${LOAD_TEST_BASE_URL:-http://localhost:8000}"

export CAFE1_EMAIL="${CAFE1_EMAIL:-shravyareddy767@gmail.com}"
export CAFE1_PASSWORD="${CAFE1_PASSWORD:-r8F8x^hoiiTj}"

export CAFE2_EMAIL="${CAFE2_EMAIL:-vaishwik.bojja@sticsoftsolutions.com}"
export CAFE2_PASSWORD='eSB&z&pkNbMU'

export CAFE3_EMAIL="${CAFE3_EMAIL:-vyomatechnologies7@gmail.com}"
export CAFE3_PASSWORD='9WKxNQp3$E8Q'

export CAFE4_EMAIL="${CAFE4_EMAIL:-ybojja@gmail.com}"
export CAFE4_PASSWORD='Y#kS$8&sLGwW'

export CAFE5_EMAIL="${CAFE5_EMAIL:-bhargavyyp.ae@gmail.com}"
export CAFE5_PASSWORD='N$^z59az*6^S'

# ── Tunables (per cafe) ───────────────────────────────────────
export LOAD_TEST_NUM_PCS_PER_CAFE="${LOAD_TEST_NUM_PCS_PER_CAFE:-100}"
export LOAD_TEST_NUM_USERS_PER_CAFE="${LOAD_TEST_NUM_USERS_PER_CAFE:-100}"
export LOAD_TEST_CONCURRENCY="${LOAD_TEST_CONCURRENCY:-200}"
export LOAD_TEST_DURATION_SEC="${LOAD_TEST_DURATION_SEC:-600}"
export LOAD_TEST_TARGET_RPS="${LOAD_TEST_TARGET_RPS:-0}"

# Force the python script to never emit ANSI color codes. We want a
# perfectly clean log that copies/pastes the same way it renders.
export NO_COLOR=1

# Backend restart knobs.
#
# By default this script DOES NOT touch the backend. Run the dedicated
# setup script ONCE first to prepare it:
#
#     sudo bash setup_backend_for_loadtest.sh
#
# Then this script just fires the load test. If you want this script
# to manage uvicorn directly (legacy non-docker setups), set
# AUTO_RESTART_BACKEND=1.
AUTO_RESTART_BACKEND="${AUTO_RESTART_BACKEND:-0}"
BACKEND_RATE_LIMIT_PER_MINUTE="${BACKEND_RATE_LIMIT_PER_MINUTE:-1000000}"
BACKEND_RATE_LIMIT_BURST="${BACKEND_RATE_LIMIT_BURST:-10000}"
BACKEND_WORKERS="${BACKEND_WORKERS:-4}"
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

# ── Setup ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
BACKEND_DIR="${BACKEND_DIR:-$SCRIPT_DIR/backend}"
LOG_FILE="/tmp/load_test_$(date +%s).log"

# Plain ASCII status helpers (no Unicode, no colors).
say()  { printf '%s\n' "$*"; }
info() { printf '[..] %s\n' "$*"; }
ok()   { printf '[OK] %s\n' "$*"; }
warn() { printf '[!!] %s\n' "$*"; }
err()  { printf '[XX] %s\n' "$*"; }

say ""
say "=========================================================="
say "  Primus Load Test"
say "  Target      : $LOAD_TEST_BASE_URL"
say "  PCs         : $LOAD_TEST_NUM_PCS"
say "  Users       : $LOAD_TEST_NUM_USERS"
say "  Concurrency : $LOAD_TEST_CONCURRENCY"
say "  Duration    : ${LOAD_TEST_DURATION_SEC}s"
say "  Log file    : $LOG_FILE"
say "=========================================================="

# Pull latest code
if [ -d .git ]; then
    say ""
    info "Pulling latest code..."
    git pull origin main || true
fi

# ── Auto-restart the backend with relaxed rate limit ─────────
restart_backend() {
    say ""
    info "Restarting backend with relaxed rate limit + $BACKEND_WORKERS workers"
    say  "     RATE_LIMIT_PER_MINUTE=$BACKEND_RATE_LIMIT_PER_MINUTE"
    say  "     RATE_LIMIT_BURST=$BACKEND_RATE_LIMIT_BURST"

    if ! sudo -n true 2>/dev/null; then
        warn "sudo requires a password. Run 'sudo -v' first or set AUTO_RESTART_BACKEND=0."
        return 1
    fi

    if [ ! -d "$BACKEND_DIR" ]; then
        err "Backend directory $BACKEND_DIR not found - set BACKEND_DIR env var"
        return 1
    fi

    # Aggressive multi-pass kill. Use pgrep + kill -9 by PID instead of
    # `pkill -f`, because `pkill -f 'uvicorn app.main:app'` would also
    # match the killer process itself (its argv contains the same
    # pattern), and bash would emit "line N: PID Killed" job-control
    # noise to stderr that interleaves with our stdout.
    info "killing existing backend processes (3 rounds)..."
    local round survivors final_survivors
    for round in 1 2 3; do
        survivors=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null || true)
        if [ -n "$survivors" ]; then
            # Single sudo kill -9 with the PID list. Quiet stderr/stdout
            # so bash job-control messages can't pollute the terminal.
            sudo kill -9 $survivors >/dev/null 2>&1 || true
        fi
        sudo fuser -k -9 "$BACKEND_PORT/tcp" >/dev/null 2>&1 || true
        sleep 1
        survivors=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null || true)
        if [ -z "$survivors" ]; then
            ok "all backend processes killed (round $round)"
            break
        fi
    done

    final_survivors=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null || true)
    if [ -n "$final_survivors" ]; then
        say ""
        err "Could not kill these uvicorn processes after 3 rounds:"
        for pid in $final_survivors; do
            local cmd
            cmd=$(ps -o args= -p "$pid" 2>/dev/null | head -c 100)
            printf '       pid=%s  %s\n' "$pid" "$cmd"
        done
        say ""
        say "These processes are likely still writing to your terminal,"
        say "which scrambles the load test output. Manually kill them:"
        printf '\n       sudo kill -9 %s\n\n' "$final_survivors"
        return 1
    fi

    # Start fresh, as root, with the new env vars. Critical: redirect
    # ALL of stdout/stderr to /tmp/primus.log via setsid so the new
    # uvicorn never inherits the current terminal.
    sudo setsid bash -c "cd '$BACKEND_DIR' && \
        RATE_LIMIT_PER_MINUTE=$BACKEND_RATE_LIMIT_PER_MINUTE \
        RATE_LIMIT_BURST=$BACKEND_RATE_LIMIT_BURST \
        nohup uvicorn app.main:app \
            --host $BACKEND_HOST --port $BACKEND_PORT \
            --workers $BACKEND_WORKERS \
            </dev/null >/tmp/primus.log 2>&1 &" >/dev/null 2>&1

    info "waiting for backend to come back..."
    for i in $(seq 1 30); do
        if curl -sf --max-time 2 "$LOAD_TEST_BASE_URL/docs" -o /dev/null 2>&1; then
            ok "backend is up after ${i}s"
            return 0
        fi
        sleep 1
    done
    err "Backend did not come back within 30s. Last lines of /tmp/primus.log:"
    sudo tail -30 /tmp/primus.log 2>/dev/null || true
    return 1
}

needs_restart() {
    local pid env_str
    pid=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null | head -1)
    if [ -z "$pid" ]; then
        return 0
    fi
    env_str=$(sudo cat "/proc/$pid/environ" 2>/dev/null | tr '\0' '\n' \
              | grep '^RATE_LIMIT_PER_MINUTE=' || true)
    if [ -z "$env_str" ]; then
        return 0
    fi
    local current_limit
    current_limit="${env_str#RATE_LIMIT_PER_MINUTE=}"
    if [ "$current_limit" -lt "$BACKEND_RATE_LIMIT_PER_MINUTE" ] 2>/dev/null; then
        return 0
    fi
    local worker_count
    worker_count=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null | wc -l)
    if [ "$worker_count" -lt $((BACKEND_WORKERS + 1)) ]; then
        return 0
    fi
    return 1
}

if [ "$AUTO_RESTART_BACKEND" = "1" ]; then
    if ! sudo -n true 2>/dev/null; then
        say ""
        info "Backend restart needs sudo. Enter your password once:"
        if ! sudo -v 2>/dev/null; then
            err "Could not acquire sudo. Re-run with AUTO_RESTART_BACKEND=0 LOAD_TEST_TARGET_RPS=10."
            exit 1
        fi
    fi

    if needs_restart; then
        if ! restart_backend; then
            say ""
            err "Backend restart failed. Aborting to avoid polluted output."
            err "Re-run with AUTO_RESTART_BACKEND=0 LOAD_TEST_TARGET_RPS=10 to use"
            err "client-side pacing instead, OR fix the surviving processes and retry."
            exit 1
        fi
    else
        say ""
        ok "Backend already running with high rate limit and $BACKEND_WORKERS+ workers - skipping restart"
    fi
fi

# Default to a fresh run
export LOAD_TEST_FRESH="${LOAD_TEST_FRESH:-1}"
if [ "$LOAD_TEST_FRESH" = "1" ] && [ -f load_test_state.json ]; then
    say ""
    info "LOAD_TEST_FRESH=1 - clearing cached state file"
    rm -f load_test_state.json
fi

# SQL fallback cleanup
if [ "${LOAD_TEST_SQL_CLEANUP:-0}" = "1" ]; then
    say ""
    info "LOAD_TEST_SQL_CLEANUP=1 - running SQL cleanup"
    if command -v psql >/dev/null 2>&1; then
        for db in $(sudo -u postgres psql -tAc \
            "SELECT datname FROM pg_database WHERE datname LIKE 'clutchhh_cafe_%' OR datname LIKE 'primus_cafe_%';" 2>/dev/null); do
            say "     -> cleaning $db"
            sudo -u postgres psql -d "$db" -c \
                "DELETE FROM client_pcs WHERE name LIKE 'LoadTest-PC-%';" || true
        done
    else
        warn "psql not found, skipping SQL cleanup"
    fi
fi

# Dependencies
say ""
info "Checking dependencies..."
python3 -c "import requests" 2>/dev/null || pip3 install --quiet requests

# Connectivity
say ""
info "Checking backend is reachable at $LOAD_TEST_BASE_URL ..."
if curl -sf --max-time 5 "$LOAD_TEST_BASE_URL/docs" -o /dev/null; then
    ok "backend is reachable"
else
    err "Cannot reach $LOAD_TEST_BASE_URL"
    exit 1
fi

# Backend process info
say ""
info "Backend process info:"
ps -eo pid,pcpu,pmem,args 2>/dev/null \
    | grep -E 'uvicorn app.main:app' \
    | grep -v grep \
    | awk '{printf "     pid=%-6s cpu=%-5s%% mem=%-5s%%\n", $1, $2, $3}' \
    || say  "     (no backend processes detected via ps)"

# ── Run ───────────────────────────────────────────────────────
say ""
say "=========================================================="
say "  Running load test (output also saved to $LOG_FILE)"
say "=========================================================="
say ""

# tee output to a log file. PIPESTATUS preserves python's exit code.
python3 -u load_test.py 2>&1 | tee "$LOG_FILE"
exit_code=${PIPESTATUS[0]}

say ""
say "Full log saved to: $LOG_FILE"
exit "$exit_code"
