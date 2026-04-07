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
export PRIMUS_BASE_URL="http://20.55.214.91:8000"

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

# ── Run tests ─────────────────────────────────────────────────
echo ""
python3 test_universal_login.py
