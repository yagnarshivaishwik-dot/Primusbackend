#!/usr/bin/env bash
# =============================================================================
# setup_superadmin_azure.sh
# Docker-aware one-shot SuperAdmin setup for the Primus Azure VM.
#
# Runs every piece of Python work INSIDE the running backend container, so:
#   * no host venv required
#   * no host pip install required
#   * no host-side .env parsing (the container already has env loaded
#     via the `env_file:` entry in docker-compose.yml)
#
# Workflow:
#   1. Verify docker-compose.yml is in the cwd and the backend container
#      is running.
#   2. `docker cp` the freshly-pulled seed script into the container so
#      we don't have to rebuild the image for a script-only change.
#   3. `docker compose exec` to run the seed (--force --no-prompt) inside
#      the container, where DATABASE_URL etc. are already exported.
#   4. `docker compose exec` again to verify the row + DB grants.
#   5. curl the published port 8000 from the host to confirm login works.
#
# Run from the directory that contains docker-compose.yml (i.e. backend/):
#   cd ~/Primusbackend/backend       # or /opt/primus/backend
#   git pull origin main
#   bash scripts/setup_superadmin_azure.sh
#
# Override defaults via env vars:
#   SUPERADMIN_PASSWORD='other-pass' bash scripts/setup_superadmin_azure.sh
#
# SECURITY: the default password below (Vaishwik@123) is convenient but
# well-known. Rotate it after first login by re-running this script with
# SUPERADMIN_PASSWORD=... or via the UI's Change Password flow.
# =============================================================================
set -e

# ---------- Defaults (override via env) ----------
SUPERADMIN_USERNAME="${SUPERADMIN_USERNAME:-primus}"
SUPERADMIN_EMAIL="${SUPERADMIN_EMAIL:-admin@primusadmin.in}"
SUPERADMIN_PASSWORD="${SUPERADMIN_PASSWORD:-Vaishwik@123}"
SUPERADMIN_FIRST_NAME="${SUPERADMIN_FIRST_NAME:-Primus}"
SUPERADMIN_LAST_NAME="${SUPERADMIN_LAST_NAME:-Admin}"
SERVICE_NAME="${SERVICE_NAME:-backend}"
API_BASE="${API_BASE:-http://localhost:8000}"

# ---------- Tiny output helpers ----------
info()  { printf '\033[0;36m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[0;32mOK \033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33mWARN\033[0m %s\n' "$*"; }
fail()  { printf '\033[0;31mFAIL\033[0m %s\n' "$*"; exit 1; }

# ---------- 1. Sanity ----------
[[ -f docker-compose.yml ]] \
  || fail "docker-compose.yml not found in $(pwd). Run from the backend/ dir (the one that contains docker-compose.yml)."
[[ -f scripts/seed_superadmin.py ]] \
  || fail "scripts/seed_superadmin.py missing on the host. Run 'git pull origin main' first."

# ---------- 2. Pick a docker compose command (v2 plugin or v1 binary) ----------
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  fail "Neither 'docker compose' (v2 plugin) nor 'docker-compose' (v1) is available. Install Docker first."
fi
info "Using: ${DC[*]}"

# ---------- 3. Confirm the backend container is running ----------
cid="$("${DC[@]}" ps -q "$SERVICE_NAME" 2>/dev/null || true)"
if [[ -z "$cid" ]]; then
  fail "Container for service '$SERVICE_NAME' is not running. Start it: ${DC[*]} up -d $SERVICE_NAME"
fi
info "Backend container: $SERVICE_NAME ($cid)"

# ---------- 4. Sync latest seed script into the running container ----------
# The image was built with `COPY . /app`, so the bundled scripts are
# whatever existed at last `docker compose build`. We push the freshly
# pulled file in directly, which is much faster than a full rebuild and
# is fine for a one-off seed script.
info "Copying latest seed_superadmin.py into the container"
docker cp scripts/seed_superadmin.py "$cid:/app/scripts/seed_superadmin.py" \
  || fail "docker cp failed. Is the container running and writable?"

# ---------- 5. Run the seed INSIDE the container ----------
info "Seeding SuperAdmin (username=$SUPERADMIN_USERNAME, email=$SUPERADMIN_EMAIL)"
"${DC[@]}" exec -T \
  -e SUPERADMIN_USERNAME="$SUPERADMIN_USERNAME" \
  -e SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" \
  -e SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
  -e SUPERADMIN_FIRST_NAME="$SUPERADMIN_FIRST_NAME" \
  -e SUPERADMIN_LAST_NAME="$SUPERADMIN_LAST_NAME" \
  "$SERVICE_NAME" python scripts/seed_superadmin.py --force --no-prompt

# ---------- 6. Verify the row + DB grants (also inside the container) ----------
info "Verifying SuperAdmin row in Postgres (from inside the container)..."
"${DC[@]}" exec -T \
  -e SA_EMAIL="$SUPERADMIN_EMAIL" \
  -e SA_USER="$SUPERADMIN_USERNAME" \
  "$SERVICE_NAME" python - <<'PYEOF'
import os, sys
from sqlalchemy import create_engine, text

url = os.getenv("GLOBAL_DATABASE_URL") or os.getenv("DATABASE_URL")
if not url:
    print("FAIL: no GLOBAL_DATABASE_URL / DATABASE_URL inside the container")
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

# ---------- 7. Smoke test login (from host — backend exposes port 8000) ----------
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
  warn "(If the backend is reverse-proxied and not on $API_BASE, try the public URL from your laptop.)"
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
