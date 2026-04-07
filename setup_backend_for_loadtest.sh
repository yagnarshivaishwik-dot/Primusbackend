#!/usr/bin/env bash
# =============================================================
# Primus  Backend Setup for Load Testing
# =============================================================
# Run this ONCE to prepare the backend for capacity testing.
# It will:
#   1. Detect what's supervising uvicorn (systemd / docker / nothing)
#   2. Stop that supervisor
#   3. Wipe all stale LoadTest data from the cafe DB(s)
#   4. Launch uvicorn manually with relaxed rate limit + 4 workers
#   5. Verify the new backend is up and configured correctly
#
# After this, run:
#   AUTO_RESTART_BACKEND=0 LOAD_TEST_TARGET_RPS=0 sudo bash run_load_test.sh
#
# =============================================================

set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-$HOME/Primusbackend/backend}"
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_WORKERS="${BACKEND_WORKERS:-4}"
RATE_LIMIT_PER_MINUTE="${RATE_LIMIT_PER_MINUTE:-1000000}"
RATE_LIMIT_BURST="${RATE_LIMIT_BURST:-10000}"

say()  { printf '%s\n' "$*"; }
info() { printf '[..] %s\n' "$*"; }
ok()   { printf '[OK] %s\n' "$*"; }
warn() { printf '[!!] %s\n' "$*"; }
err()  { printf '[XX] %s\n' "$*"; }

say ""
say "=========================================================="
say "  Primus Backend Setup for Load Testing"
say "=========================================================="
say ""

# ── 1. Sudo upfront ───────────────────────────────────────────
if ! sudo -n true 2>/dev/null; then
    info "This script needs sudo. Enter your password once:"
    sudo -v
fi

# ── 2. Detect supervisor ──────────────────────────────────────
info "Detecting what's running uvicorn..."
say ""

# Check systemd
SYSTEMD_UNIT=""
if command -v systemctl >/dev/null 2>&1; then
    SYSTEMD_UNIT=$(sudo systemctl list-units --type=service --state=running --no-legend 2>/dev/null \
        | grep -iE 'primus|clutch|uvicorn|app' \
        | head -1 \
        | awk '{print $1}' || true)
    if [ -n "$SYSTEMD_UNIT" ]; then
        say "  systemd unit found: $SYSTEMD_UNIT"
    fi
fi

# Check docker
DOCKER_CONTAINER=""
if command -v docker >/dev/null 2>&1; then
    DOCKER_CONTAINER=$(sudo docker ps --format '{{.Names}}' 2>/dev/null \
        | grep -iE 'primus|clutch|backend|uvicorn' \
        | head -1 || true)
    if [ -n "$DOCKER_CONTAINER" ]; then
        say "  docker container found: $DOCKER_CONTAINER"
    fi
fi

# Check uvicorn process and its parent
UVICORN_PID=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null | head -1 || true)
PARENT_PID=""
PARENT_CMD=""
if [ -n "$UVICORN_PID" ]; then
    PARENT_PID=$(ps -o ppid= -p "$UVICORN_PID" 2>/dev/null | tr -d ' ' || true)
    if [ -n "$PARENT_PID" ] && [ "$PARENT_PID" != "1" ]; then
        PARENT_CMD=$(ps -o args= -p "$PARENT_PID" 2>/dev/null | head -c 200 || true)
        say "  uvicorn pid=$UVICORN_PID, parent pid=$PARENT_PID:"
        say "    $PARENT_CMD"
    fi
fi

if [ -z "$SYSTEMD_UNIT" ] && [ -z "$DOCKER_CONTAINER" ] && [ -z "$PARENT_CMD" ]; then
    ok "No supervisor detected - uvicorn is standalone"
fi

# ── 3. Stop the supervisor ────────────────────────────────────
say ""
info "Stopping any existing backend..."

if [ -n "$SYSTEMD_UNIT" ]; then
    say "  systemctl stop $SYSTEMD_UNIT"
    sudo systemctl stop "$SYSTEMD_UNIT" || true
    sleep 1
fi

if [ -n "$DOCKER_CONTAINER" ]; then
    say "  docker stop $DOCKER_CONTAINER"
    sudo docker stop "$DOCKER_CONTAINER" || true
    sleep 1
fi

# Brute-force kill anything still on port 8000
info "Killing any processes still on port $BACKEND_PORT..."
local_pids=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null || true)
if [ -n "$local_pids" ]; then
    sudo kill -9 $local_pids >/dev/null 2>&1 || true
fi
sudo fuser -k -9 "$BACKEND_PORT/tcp" >/dev/null 2>&1 || true

# Verify port is free
sleep 2
remaining=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null || true)
if [ -n "$remaining" ]; then
    err "These uvicorn processes are still alive: $remaining"
    err "Something is respawning them. You will need to find and stop the supervisor manually."
    err "Try one of these to investigate:"
    say  "    sudo systemctl list-units --type=service --state=running"
    say  "    sudo docker ps"
    say  "    ps -o ppid= -p $remaining | xargs ps -fp"
    exit 1
fi
ok "Port $BACKEND_PORT is free"

# ── 4. SQL cleanup (loadtest data + vacuum) ───────────────────
say ""
info "Wiping LoadTest data from cafe DB(s)..."
if command -v psql >/dev/null 2>&1; then
    for db in $(sudo -u postgres psql -tAc \
        "SELECT datname FROM pg_database WHERE datname LIKE 'clutchhh_cafe_%' OR datname LIKE 'primus_cafe_%';" 2>/dev/null); do
        say "  -> $db"
        # Order matters: child tables first, then parents.
        sudo -u postgres psql -d "$db" -q <<SQL 2>/dev/null || true
DELETE FROM hardware_stats WHERE pc_id IN (SELECT id FROM client_pcs WHERE name LIKE 'LoadTest-PC-%');
DELETE FROM remote_commands WHERE pc_id IN (SELECT id FROM client_pcs WHERE name LIKE 'LoadTest-PC-%');
DELETE FROM system_events  WHERE pc_id IN (SELECT id FROM client_pcs WHERE name LIKE 'LoadTest-PC-%');
UPDATE sessions SET pc_id = NULL WHERE pc_id IN (SELECT id FROM client_pcs WHERE name LIKE 'LoadTest-PC-%');
DELETE FROM client_pcs WHERE name LIKE 'LoadTest-PC-%';
VACUUM ANALYZE client_pcs;
VACUUM ANALYZE sessions;
VACUUM ANALYZE system_events;
SQL
    done

    # Global DB: wipe loadtest users and their refresh tokens
    GLOBAL_DB=$(sudo -u postgres psql -tAc \
        "SELECT datname FROM pg_database WHERE datname IN ('clutchhh_global','clutchhh_db','primus_global');" 2>/dev/null \
        | head -1 || true)
    if [ -n "$GLOBAL_DB" ]; then
        say "  -> $GLOBAL_DB (loadtest users + refresh tokens)"
        sudo -u postgres psql -d "$GLOBAL_DB" -q <<SQL 2>/dev/null || true
DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'loadtest_user_%');
DELETE FROM users WHERE email LIKE 'loadtest_user_%';
VACUUM ANALYZE refresh_tokens;
VACUUM ANALYZE users;
SQL
    fi
    ok "Cleanup complete"
else
    warn "psql not found, skipping SQL cleanup"
fi

# ── 5. Launch uvicorn manually ────────────────────────────────
say ""
info "Launching uvicorn manually with capacity-test config..."
say  "    workers      = $BACKEND_WORKERS"
say  "    rate limit   = $RATE_LIMIT_PER_MINUTE / min"
say  "    burst        = $RATE_LIMIT_BURST"
say  "    log file     = /tmp/primus.log"

if [ ! -d "$BACKEND_DIR" ]; then
    err "Backend directory not found: $BACKEND_DIR"
    err "Set BACKEND_DIR env var to override"
    exit 1
fi

# setsid + redirect = fully detached, can never write to current terminal
sudo setsid bash -c "cd '$BACKEND_DIR' && \
    RATE_LIMIT_PER_MINUTE=$RATE_LIMIT_PER_MINUTE \
    RATE_LIMIT_BURST=$RATE_LIMIT_BURST \
    nohup uvicorn app.main:app \
        --host $BACKEND_HOST --port $BACKEND_PORT \
        --workers $BACKEND_WORKERS \
        </dev/null >/tmp/primus.log 2>&1 &" >/dev/null 2>&1

# Wait for it to come up
say ""
info "Waiting for backend to come up..."
for i in $(seq 1 30); do
    if curl -sf --max-time 2 "http://localhost:$BACKEND_PORT/docs" -o /dev/null 2>&1; then
        ok "Backend is up after ${i}s"
        break
    fi
    sleep 1
    if [ "$i" = "30" ]; then
        err "Backend did not come up within 30s. Last lines of /tmp/primus.log:"
        sudo tail -30 /tmp/primus.log 2>/dev/null
        exit 1
    fi
done

# ── 6. Verify config ──────────────────────────────────────────
say ""
info "Verifying new backend config..."
new_pid=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null | head -1)
if [ -z "$new_pid" ]; then
    err "Could not find new uvicorn process"
    exit 1
fi

# Read env from /proc
loaded_limit=$(sudo cat "/proc/$new_pid/environ" 2>/dev/null \
    | tr '\0' '\n' | grep '^RATE_LIMIT_PER_MINUTE=' | cut -d= -f2 || true)
worker_count=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null | wc -l)

say "    rate_limit_per_minute = $loaded_limit"
say "    worker_count          = $worker_count (master + workers)"

if [ "$loaded_limit" != "$RATE_LIMIT_PER_MINUTE" ]; then
    err "Rate limit env var did not propagate"
    exit 1
fi
if [ "$worker_count" -lt $((BACKEND_WORKERS + 1)) ]; then
    warn "Expected $((BACKEND_WORKERS + 1)) processes (master + $BACKEND_WORKERS workers), got $worker_count"
fi

say ""
ok "Backend is ready for load testing."
say ""
say "Now run:"
say "    AUTO_RESTART_BACKEND=0 LOAD_TEST_TARGET_RPS=0 sudo bash run_load_test.sh"
say ""
