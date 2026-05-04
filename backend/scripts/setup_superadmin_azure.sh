#!/usr/bin/env bash
# =============================================================================
# setup_superadmin_azure.sh
# One-shot SuperAdmin setup for the Primus Azure VM.
#
# What it does:
#   1. Verifies you are in the backend root (where app/main.py lives).
#   2. Activates a Python virtualenv if one exists (venv / .venv / env).
#   3. Sources backend/.env so DATABASE_URL etc. are available.
#   4. Runs scripts/seed_superadmin.py with --force (idempotent: creates
#      the row if missing, updates the password/role if it already exists).
#   5. Smoke-tests POST /api/internal/auth/login against the local backend.
#
# Run on the Azure VM, from the backend root:
#   ssh azureuser@20.55.214.91
#   cd /opt/primus/backend          # or wherever you cloned the repo
#   git pull origin main            # make sure this script is present
#   bash scripts/setup_superadmin_azure.sh
#
# Override anything via env vars, e.g.:
#   SUPERADMIN_PASSWORD='other-pass' bash scripts/setup_superadmin_azure.sh
#
# SECURITY: the default password below is convenient but well-known.
# Rotate it after first login by re-running this script with a stronger
# SUPERADMIN_PASSWORD env var, or via the Change Password flow in the UI.
# =============================================================================
set -e

# ---------- Defaults (override via env) ----------
SUPERADMIN_USERNAME="${SUPERADMIN_USERNAME:-primus}"
SUPERADMIN_EMAIL="${SUPERADMIN_EMAIL:-admin@primusadmin.in}"
SUPERADMIN_PASSWORD="${SUPERADMIN_PASSWORD:-Vaishwik@123}"
SUPERADMIN_FIRST_NAME="${SUPERADMIN_FIRST_NAME:-Primus}"
SUPERADMIN_LAST_NAME="${SUPERADMIN_LAST_NAME:-Admin}"
API_BASE="${API_BASE:-http://localhost:8000}"

# ---------- Tiny output helpers ----------
info()  { printf '\033[0;36m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[0;32mOK \033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33mWARN\033[0m %s\n' "$*"; }
fail()  { printf '\033[0;31mFAIL\033[0m %s\n' "$*"; exit 1; }

# ---------- 1. Sanity ----------
[[ -f app/main.py ]] \
  || fail "Run from the backend root (where app/main.py lives). Currently in: $(pwd)"
[[ -f scripts/seed_superadmin.py ]] \
  || fail "scripts/seed_superadmin.py missing. Run 'git pull origin main' first."

# ---------- 2. Activate venv (best-effort) ----------
for v in venv .venv env; do
  if [[ -f "$v/bin/activate" ]]; then
    info "Activating venv: $v"
    # shellcheck disable=SC1090
    source "$v/bin/activate"
    break
  fi
done

# ---------- 3. Load .env ----------
# We deliberately do NOT use `set -a; source .env`. That naive approach
# breaks on common, valid .env values that contain unquoted spaces — e.g.
# Gmail App Passwords (`MAIL_PASSWORD=wfcq egau rthj wlgj`), which bash
# interprets as `MAIL_PASSWORD=wfcq` followed by the command `egau`.
#
# Instead, parse .env via python-dotenv (already a backend dependency)
# which correctly handles unquoted spaces, surrounding quotes, comments,
# and escapes. Then export each KEY into the current shell.
[[ -f .env ]] || fail ".env not found in $(pwd). Copy .env.template -> .env first."
info "Loading .env via python-dotenv"
if ! python -c "import dotenv" >/dev/null 2>&1; then
  fail "python-dotenv not installed in this venv. Run: pip install python-dotenv"
fi
# shellcheck disable=SC2046
eval "$(
  python - <<'PYEOF'
import shlex
from dotenv import dotenv_values

for key, value in dotenv_values(".env").items():
    if value is None:
        continue
    print(f"export {key}={shlex.quote(value)}")
PYEOF
)"

[[ -n "${GLOBAL_DATABASE_URL:-}${DATABASE_URL:-}" ]] \
  || fail "Neither GLOBAL_DATABASE_URL nor DATABASE_URL is set after sourcing .env."

db_host="$(printf '%s' "${GLOBAL_DATABASE_URL:-$DATABASE_URL}" | sed 's|.*@||')"
info "Target Postgres: $db_host"

# ---------- 4. Run the seed ----------
info "Seeding SuperAdmin (username=$SUPERADMIN_USERNAME, email=$SUPERADMIN_EMAIL)"
SUPERADMIN_USERNAME="$SUPERADMIN_USERNAME" \
SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" \
SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
SUPERADMIN_FIRST_NAME="$SUPERADMIN_FIRST_NAME" \
SUPERADMIN_LAST_NAME="$SUPERADMIN_LAST_NAME" \
python scripts/seed_superadmin.py --force --no-prompt

# ---------- 5. Verify the row actually landed in the DB ----------
info "Verifying SuperAdmin row in Postgres..."
SA_EMAIL="$SUPERADMIN_EMAIL" SA_USER="$SUPERADMIN_USERNAME" python <<'PYEOF'
import os, sys
from sqlalchemy import create_engine, text

url = os.getenv("GLOBAL_DATABASE_URL") or os.getenv("DATABASE_URL")
if not url:
    print("FAIL: no GLOBAL_DATABASE_URL / DATABASE_URL")
    sys.exit(1)

engine = create_engine(url, pool_pre_ping=True, future=True)
with engine.connect() as conn:
    row = conn.execute(
        text(
            "SELECT id, name, email, role, "
            "       COALESCE(LENGTH(password_hash), 0) AS pwhash_len, "
            "       COALESCE(is_email_verified, FALSE)  AS verified "
            "  FROM users "
            " WHERE email = :em OR name = :nm "
            " LIMIT 1"
        ),
        {"em": os.environ["SA_EMAIL"], "nm": os.environ["SA_USER"]},
    ).first()

    if not row:
        print("FAIL: row not found after seed (something is very wrong)")
        sys.exit(1)

    print(f"  id              = {row.id}                  (auto-generated)")
    print(f"  name (username) = {row.name}")
    print(f"  email           = {row.email}")
    print(f"  role            = {row.role}")
    print(f"  password_hash   = stored ({row.pwhash_len}-char Argon2 hash; never plaintext)")
    print(f"  is_verified     = {row.verified}")

    # Prove the connection user has grants on other tables, not just `users`.
    print()
    print("  DB-grant sanity check (the Postgres role can read other tables):")
    for tbl in ("cafes", "audit_logs", "user_cafe_map"):
        try:
            n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
            print(f"    {tbl:<16} accessible — {n} row(s)")
        except Exception as e:
            msg = str(e).split("\n")[0]
            print(f"    {tbl:<16} NOT accessible: {msg[:80]}")
PYEOF

# ---------- 6. Smoke test ----------
info "Smoke test: $API_BASE/api/internal/auth/login"
resp_body="$(mktemp)"
http_code="$(
  curl -sS -o "$resp_body" -w '%{http_code}' \
       -X POST "$API_BASE/api/internal/auth/login" \
       -H 'content-type: application/json' \
       -d "{\"username\":\"$SUPERADMIN_USERNAME\",\"password\":\"$SUPERADMIN_PASSWORD\"}" \
  || echo "000"
)"
if [[ "$http_code" == "200" ]] && grep -q access_token "$resp_body"; then
  ok "Login returned 200 with access_token."
else
  warn "Login probe returned HTTP $http_code. Response (first 5 lines):"
  head -5 "$resp_body" || true
  warn "(If the backend isn't running on $API_BASE, this is expected. Try from your laptop against the public URL.)"
fi
rm -f "$resp_body"

# ---------- Done ----------
cat <<EOF

============================================================
SuperAdmin ready.
  Username: $SUPERADMIN_USERNAME
  Email:    $SUPERADMIN_EMAIL
  Password: $SUPERADMIN_PASSWORD

Open your Vercel URL and log in with those credentials.
Re-run this script anytime to reset the password (idempotent).
============================================================
EOF
