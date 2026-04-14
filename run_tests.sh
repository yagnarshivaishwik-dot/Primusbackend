#!/usr/bin/env bash
# =============================================================
# Primus · Universal Login & Data Isolation Test Runner
# =============================================================
# Run on the cloud server:
#   chmod +x run_tests.sh
#   ./run_tests.sh
# =============================================================

set -euo pipefail

# ── Credentials ───────────────────────────────────────────────
# Use localhost — the script runs ON the server, so the external IP
# is unreachable from within the same machine (firewall/NAT).
export PRIMUS_BASE_URL="http://localhost:8000"

export CAFE1_EMAIL="yagnarshivaishwik@gmail.com"
export CAFE1_PASSWORD="j#J*zdDtCcS3"

export CAFE2_EMAIL="cristianomessi00110@gmail.com"
export CAFE2_PASSWORD="jgpKhhoabn5r"

export CLIENT_EMAIL="vaishwik"
export CLIENT_PASSWORD="Vaishwik@123"

# ── Setup ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Primus Test Runner"
echo "  Target: $PRIMUS_BASE_URL"
echo "══════════════════════════════════════════════════════════"

# Pull latest code
echo ""
echo "▶  Pulling latest code..."
git pull origin main

# Ensure requests is installed (works with both system python and venv)
echo ""
echo "▶  Checking dependencies..."
python3 -c "import requests" 2>/dev/null || pip3 install --quiet requests

# ── Connectivity check ────────────────────────────────────────
echo ""
echo "▶  Checking backend is reachable at $PRIMUS_BASE_URL ..."
if curl -sf --max-time 5 "$PRIMUS_BASE_URL/docs" -o /dev/null; then
    echo "   ✓ Backend is up"
else
    echo ""
    echo "   ✗ Cannot reach $PRIMUS_BASE_URL"
    echo "   Is the backend running?  Try:  cd backend && python main.py"
    echo "   Or check:  ps aux | grep 'python\|uvicorn\|gunicorn'"
    exit 1
fi

# ── Run tests ─────────────────────────────────────────────────
echo ""
python3 test_universal_login.py
