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
export CAFE1_EMAIL="vaishwik14366@gmail.com"
export CAFE1_PASSWORD="DFO0O6hh9b9n"

# ── Tunables ──────────────────────────────────────────────────
export LOAD_TEST_NUM_PCS="${LOAD_TEST_NUM_PCS:-100}"
export LOAD_TEST_NUM_USERS="${LOAD_TEST_NUM_USERS:-100}"
# Concurrency is intentionally modest. The backend default uvicorn
# launch is single-process, so >10 concurrent workers saturate the
# Argon2 hashing path during login storms. Bump only if the backend
# is running with multiple workers (uvicorn --workers N or gunicorn).
export LOAD_TEST_CONCURRENCY="${LOAD_TEST_CONCURRENCY:-10}"
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

cat <<'EOM'

  IMPORTANT: For meaningful capacity testing the backend's rate
  limiter must be relaxed. The default RATE_LIMIT_PER_MINUTE=1000
  caps everyone at ~16 req/s and produces a sea of HTTP 429s.

  Restart the backend with a high limit AND multiple workers:

      pkill -f 'python main.py' ; pkill -f 'uvicorn' ; sleep 1
      cd ~/Primusbackend/backend
      RATE_LIMIT_PER_MINUTE=1000000 \
      RATE_LIMIT_BURST=10000 \
      nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 \
          --workers 4 > /tmp/primus.log 2>&1 &

  Then re-run this script. (You can ignore this notice if the
  backend is already started with those env vars.)

EOM

# Pull latest code (if running from a git checkout)
if [ -d .git ]; then
    echo ""
    echo "▶  Pulling latest code..."
    git pull origin main || true
fi

# Default to a fresh run: wipe state cache and trigger PC cleanup phase.
# Set LOAD_TEST_FRESH=0 to reuse cached state and skip cleanup.
export LOAD_TEST_FRESH="${LOAD_TEST_FRESH:-1}"
if [ "$LOAD_TEST_FRESH" = "1" ] && [ -f load_test_state.json ]; then
    echo ""
    echo "▶  LOAD_TEST_FRESH=1 — clearing cached state file"
    rm -f load_test_state.json
fi

# SQL fallback cleanup: nuke stale LoadTest PCs in every per-cafe DB
# directly. Only runs if LOAD_TEST_SQL_CLEANUP=1 AND psql is available
# AND we can sudo to postgres. Useful when the DELETE API has bugs.
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
    echo "   Is the backend running?"
    exit 1
fi

# Server diagnostic: show how many backend processes are running and
# how much CPU/RAM they have. A single-process uvicorn will hit ~100%
# on one core under login storms; multiple workers spread the load.
echo ""
echo "▶  Backend process info"
ps -eo pid,pcpu,pmem,comm,args 2>/dev/null \
    | grep -E 'uvicorn|gunicorn|main\.py' \
    | grep -v grep \
    | awk '{printf "   %-6s cpu=%-5s%% mem=%-5s%% %s %s\n", $1, $2, $3, $4, $5}' \
    || echo "   (no backend processes detected via ps)"
WORKER_COUNT=$(ps -eo args 2>/dev/null | grep -E 'uvicorn|gunicorn' | grep -v grep | wc -l)
if [ "$WORKER_COUNT" -le 1 ]; then
    echo ""
    echo "   ⚠ Only $WORKER_COUNT backend worker detected."
    echo "   For meaningful load testing run with multiple workers, e.g.:"
    echo "     pkill -f 'python main.py' ; sleep 1"
    echo "     cd backend && nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 > /tmp/primus.log 2>&1 &"
    echo ""
fi

# ── Run ───────────────────────────────────────────────────────
echo ""
python3 load_test.py
