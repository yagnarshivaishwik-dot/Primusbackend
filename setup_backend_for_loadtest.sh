#!/usr/bin/env bash
# =============================================================
# Primus  Backend Setup for Load Testing
# =============================================================
# Run this ONCE to prepare the backend for capacity testing.
# Auto-detects whether the backend is running:
#   (a) inside a docker container (uses compose override)
#   (b) under systemd
#   (c) standalone uvicorn
# and reconfigures it for high-throughput testing.
#
# Then wipes all stale LoadTest data from every cafe DB.
#
# After this, run:
#   AUTO_RESTART_BACKEND=0 LOAD_TEST_TARGET_RPS=0 sudo bash run_load_test.sh
# =============================================================

set -euo pipefail

# Detect the script's actual location regardless of who invokes it
# (sudo resets HOME to /root, which broke the previous default).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
BACKEND_DIR="${BACKEND_DIR:-$REPO_ROOT/backend}"
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

if ! sudo -n true 2>/dev/null; then
    info "This script needs sudo. Enter your password once:"
    sudo -v
fi

# ── 1. Detect runtime ─────────────────────────────────────────
info "Detecting backend runtime..."
say ""

DOCKER_CONTAINER=""
DOCKER_COMPOSE_CMD=""
SYSTEMD_UNIT=""

# Docker check. Look at ALL containers (running + stopped) AND at the
# presence of docker-compose.yml in the backend dir, since the
# container may have been stopped by a previous run of this script.
if command -v docker >/dev/null 2>&1; then
    # First: any container (running or stopped) that looks like the backend
    DOCKER_CONTAINER=$(sudo docker ps -a --format '{{.Names}}' 2>/dev/null \
        | grep -iE '^(clutchhh_backend|primus_backend)$' \
        | head -1 || true)

    # Fallback: if there's a docker-compose.yml in the backend dir,
    # assume docker even if no container exists yet (first ever run).
    if [ -z "$DOCKER_CONTAINER" ] && [ -f "$BACKEND_DIR/docker-compose.yml" ]; then
        # Check the compose file actually defines a backend service
        if grep -q '^\s*backend:' "$BACKEND_DIR/docker-compose.yml" 2>/dev/null; then
            DOCKER_CONTAINER="backend (from compose)"
        fi
    fi

    if [ -n "$DOCKER_CONTAINER" ]; then
        say "  Found docker backend: $DOCKER_CONTAINER"
        # Detect compose v1 vs v2
        if sudo docker compose version >/dev/null 2>&1; then
            DOCKER_COMPOSE_CMD="sudo docker compose"
        elif command -v docker-compose >/dev/null 2>&1; then
            DOCKER_COMPOSE_CMD="sudo docker-compose"
        fi
        if [ -z "$DOCKER_COMPOSE_CMD" ]; then
            warn "Docker container found but no docker compose binary detected"
            DOCKER_CONTAINER=""
        else
            say "  Compose command: $DOCKER_COMPOSE_CMD"
        fi
    fi
fi

# Systemd check (only relevant if NOT docker)
if [ -z "$DOCKER_CONTAINER" ] && command -v systemctl >/dev/null 2>&1; then
    SYSTEMD_UNIT=$(sudo systemctl list-units --type=service --state=running --no-legend 2>/dev/null \
        | grep -iE 'primus|clutch|uvicorn' \
        | head -1 \
        | awk '{print $1}' || true)
    if [ -n "$SYSTEMD_UNIT" ]; then
        say "  Found systemd unit: $SYSTEMD_UNIT"
    fi
fi

if [ -z "$DOCKER_CONTAINER" ] && [ -z "$SYSTEMD_UNIT" ]; then
    ok "No supervisor detected - will manage uvicorn directly"
fi

# ── 2. SQL cleanup BEFORE restart (need DB up & idle) ─────────
say ""
info "Wiping LoadTest data from cafe DB(s)..."
if command -v psql >/dev/null 2>&1; then
    for db in $(sudo -u postgres psql -tAc \
        "SELECT datname FROM pg_database WHERE datname LIKE 'clutchhh_cafe_%' OR datname LIKE 'primus_cafe_%';" 2>/dev/null); do
        say "  -> $db"
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

# ── 3. Restart backend with capacity-test config ──────────────
say ""
info "Restarting backend with capacity-test config..."
say "    workers      = $BACKEND_WORKERS"
say "    rate limit   = $RATE_LIMIT_PER_MINUTE / min"
say "    burst        = $RATE_LIMIT_BURST"

if [ -n "$DOCKER_CONTAINER" ]; then
    # ──────── Docker path ────────
    OVERRIDE_FILE="$BACKEND_DIR/docker-compose.loadtest.yml"
    if [ ! -f "$OVERRIDE_FILE" ]; then
        err "Override file not found: $OVERRIDE_FILE"
        err "Did you git pull the latest changes?"
        exit 1
    fi
    if [ ! -f "$BACKEND_DIR/docker-compose.yml" ]; then
        err "docker-compose.yml not found in $BACKEND_DIR"
        exit 1
    fi

    say ""
    info "Stopping current backend container (if running)..."
    (cd "$BACKEND_DIR" && $DOCKER_COMPOSE_CMD stop backend 2>/dev/null) || true
    (cd "$BACKEND_DIR" && $DOCKER_COMPOSE_CMD rm -f backend 2>/dev/null) || true

    info "Bringing backend up with capacity override..."
    (cd "$BACKEND_DIR" && $DOCKER_COMPOSE_CMD \
        -f docker-compose.yml \
        -f docker-compose.loadtest.yml \
        up -d backend)

elif [ -n "$SYSTEMD_UNIT" ]; then
    # ──────── systemd path ────────
    say ""
    err "Backend is managed by systemd ($SYSTEMD_UNIT)."
    err "I can't safely override its env vars from here without editing the unit."
    err "Manual fix:"
    say "    sudo systemctl edit $SYSTEMD_UNIT"
    say "    # Add these lines in the editor:"
    say "    [Service]"
    say "    Environment=\"RATE_LIMIT_PER_MINUTE=$RATE_LIMIT_PER_MINUTE\""
    say "    Environment=\"RATE_LIMIT_BURST=$RATE_LIMIT_BURST\""
    say "    # Save & exit, then:"
    say "    sudo systemctl restart $SYSTEMD_UNIT"
    exit 1

else
    # ──────── Standalone path ────────
    if [ ! -d "$BACKEND_DIR" ]; then
        err "Backend directory not found: $BACKEND_DIR"
        err "Set BACKEND_DIR env var to override"
        exit 1
    fi

    say ""
    info "Killing any standalone uvicorn processes..."
    local_pids=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null || true)
    if [ -n "$local_pids" ]; then
        sudo kill -9 $local_pids >/dev/null 2>&1 || true
    fi
    sudo fuser -k -9 "$BACKEND_PORT/tcp" >/dev/null 2>&1 || true
    sleep 2

    info "Launching uvicorn manually..."
    sudo setsid bash -c "cd '$BACKEND_DIR' && \
        RATE_LIMIT_PER_MINUTE=$RATE_LIMIT_PER_MINUTE \
        RATE_LIMIT_BURST=$RATE_LIMIT_BURST \
        nohup uvicorn app.main:app \
            --host $BACKEND_HOST --port $BACKEND_PORT \
            --workers $BACKEND_WORKERS \
            </dev/null >/tmp/primus.log 2>&1 &" >/dev/null 2>&1
fi

# ── 4. Wait for backend to be reachable ───────────────────────
say ""
info "Waiting for backend to come up..."
for i in $(seq 1 60); do
    if curl -sf --max-time 2 "http://localhost:$BACKEND_PORT/docs" -o /dev/null 2>&1; then
        ok "Backend is up after ${i}s"
        break
    fi
    sleep 1
    if [ "$i" = "60" ]; then
        err "Backend did not come up within 60s."
        if [ -n "$DOCKER_CONTAINER" ]; then
            err "Last container logs:"
            sudo docker logs --tail 50 "$DOCKER_CONTAINER" 2>&1 || true
        else
            err "Last lines of /tmp/primus.log:"
            sudo tail -50 /tmp/primus.log 2>/dev/null || true
        fi
        exit 1
    fi
done

# ── 5. Verify config ──────────────────────────────────────────
say ""
info "Verifying new backend config..."

if [ -n "$DOCKER_CONTAINER" ]; then
    # Verify env via docker inspect
    container_name=$(sudo docker ps --format '{{.Names}}' \
        | grep -iE 'clutchhh_backend|primus_backend|backend' \
        | head -1)
    loaded_limit=$(sudo docker exec "$container_name" sh -c 'echo "$RATE_LIMIT_PER_MINUTE"' 2>/dev/null || true)
    say "    rate_limit_per_minute = $loaded_limit"
    if [ "$loaded_limit" != "$RATE_LIMIT_PER_MINUTE" ]; then
        warn "Rate limit env var did not propagate"
    fi
    # Verify worker count via process list inside container
    worker_count=$(sudo docker exec "$container_name" sh -c \
        'pgrep -f "uvicorn app.main:app" 2>/dev/null | wc -l' || echo "?")
    say "    worker_count          = $worker_count (master + workers)"
else
    new_pid=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null | head -1)
    if [ -z "$new_pid" ]; then
        err "Could not find new uvicorn process"
        exit 1
    fi
    loaded_limit=$(sudo cat "/proc/$new_pid/environ" 2>/dev/null \
        | tr '\0' '\n' | grep '^RATE_LIMIT_PER_MINUTE=' | cut -d= -f2 || true)
    worker_count=$(pgrep -f 'uvicorn app.main:app' 2>/dev/null | wc -l)
    say "    rate_limit_per_minute = $loaded_limit"
    say "    worker_count          = $worker_count (master + workers)"
fi

say ""
ok "Backend is ready for load testing."
say ""
say "Now run:"
say "    AUTO_RESTART_BACKEND=0 LOAD_TEST_TARGET_RPS=0 sudo bash run_load_test.sh"
say ""
