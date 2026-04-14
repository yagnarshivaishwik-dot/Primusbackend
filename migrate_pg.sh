#!/bin/bash
# =============================================================================
# ClutchHH PostgreSQL Migration: Docker → Native (Azure Data Disk)
# Azure VM: ClutchHH | Ubuntu 24.04 | Standard D8ls v6 | Data disk: /dev/nvme0n2p1 → /mnt/data
# Use this script to bring over data from an old Primus/ClutchHH Docker deployment.
# =============================================================================
set -euo pipefail

# ── Variables ────────────────────────────────────────────────────────────────
CONTAINER="${SOURCE_CONTAINER:-primus_db}"   # Override with: SOURCE_CONTAINER=mycontainer ./migrate_pg.sh
PG_USER="clutchhh_user"
PG_PASS="ClutchHHDbSecureP4ssw0rd!"
DATA_DISK="/dev/nvme0n2p1"
MOUNT_POINT="/mnt/data"
DUMP_FILE="/tmp/clutchhh_full_dump.sql"
EXPECTED_DBS="clutchhh_db clutchhh_global clutchhh_cafe_1 clutchhh_cafe_2 clutchhh_cafe_3"

# Auto-detect PostgreSQL version after install
PG_VERSION=""
PG_CONF=""

log()  { echo -e "\n\033[1;34m[$(date '+%H:%M:%S')] $*\033[0m"; }
ok()   { echo -e "\033[1;32m  ✓ $*\033[0m"; }
warn() { echo -e "\033[1;33m  ⚠ $*\033[0m"; }
die()  { echo -e "\033[1;31m  ✗ FATAL: $*\033[0m"; exit 1; }

# ── Step 1: Pre-checks ───────────────────────────────────────────────────────
log "Step 1: Pre-checks"

command -v docker &>/dev/null || die "Docker is not installed"
ok "Docker found"

docker inspect "$CONTAINER" &>/dev/null || die "Container '$CONTAINER' does not exist"
STATUS=$(docker inspect -f '{{.State.Running}}' "$CONTAINER")
[[ "$STATUS" == "true" ]] || die "Container '$CONTAINER' is not running"
ok "Container '$CONTAINER' is running"

[[ -b "$DATA_DISK" ]] || die "Data disk $DATA_DISK not found. Check Azure portal → Disks"
ok "Data disk $DATA_DISK detected"

if mountpoint -q "$MOUNT_POINT"; then
    warn "$MOUNT_POINT is already mounted — skipping disk prep"
    DISK_ALREADY_MOUNTED=true
else
    DISK_ALREADY_MOUNTED=false
fi

# ── Step 2: Backup ───────────────────────────────────────────────────────────
log "Step 2: Dumping all databases from container (pg_dumpall)"

docker exec "$CONTAINER" pg_dumpall -U "$PG_USER" > "$DUMP_FILE"

[[ -s "$DUMP_FILE" ]] || die "Dump file is empty — aborting to protect data"
DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
ok "Dump saved to $DUMP_FILE ($DUMP_SIZE)"

# ── Step 3: Disk Preparation ─────────────────────────────────────────────────
log "Step 3: Preparing Azure data disk"

if [[ "$DISK_ALREADY_MOUNTED" == "false" ]]; then
    FS_TYPE=$(blkid -o value -s TYPE "$DATA_DISK" 2>/dev/null || true)

    if [[ -z "$FS_TYPE" ]]; then
        log "  Formatting $DATA_DISK with ext4..."
        mkfs.ext4 -F -E nodiscard "$DATA_DISK"
        ok "Formatted $DATA_DISK as ext4"
    else
        ok "Disk already formatted as $FS_TYPE — skipping format"
    fi

    mkdir -p "$MOUNT_POINT"
    mount "$DATA_DISK" "$MOUNT_POINT"
    ok "Mounted $DATA_DISK → $MOUNT_POINT"

    # Persist in fstab (idempotent — uses UUID, not device path)
    DISK_UUID=$(blkid -s UUID -o value "$DATA_DISK")
    FSTAB_ENTRY="UUID=$DISK_UUID  $MOUNT_POINT  ext4  defaults,nofail  0  2"
    if ! grep -q "$DISK_UUID" /etc/fstab; then
        echo "$FSTAB_ENTRY" >> /etc/fstab
        ok "Added fstab entry (UUID=$DISK_UUID)"
    else
        ok "fstab entry already exists — skipping"
    fi
fi

# ── Step 4: Install PostgreSQL ───────────────────────────────────────────────
log "Step 4: Installing PostgreSQL"

if command -v psql &>/dev/null && pg_lsclusters &>/dev/null 2>&1; then
    warn "PostgreSQL already installed — skipping apt install"
else
    apt-get update -qq
    apt-get install -y postgresql postgresql-contrib
    ok "PostgreSQL installed"
fi

# Auto-detect version (handles 14, 15, 16, 17...)
PG_VERSION=$(pg_lsclusters | awk 'NR==2{print $1}')
PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"
PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"
PG_DATA_DEFAULT="/var/lib/postgresql/${PG_VERSION}/main"
PG_DATA_TARGET="${MOUNT_POINT}/postgresql/${PG_VERSION}/main"

ok "Detected PostgreSQL version: $PG_VERSION"
ok "Config: $PG_CONF"

# ── Step 5: Data Directory Migration ─────────────────────────────────────────
log "Step 5: Moving data directory to $MOUNT_POINT"

CURRENT_DATA_DIR=$(grep -E "^data_directory" "$PG_CONF" | awk -F"'" '{print $2}' || echo "$PG_DATA_DEFAULT")

if [[ "$CURRENT_DATA_DIR" == "$PG_DATA_TARGET" ]]; then
    warn "data_directory already points to $PG_DATA_TARGET — skipping move"
else
    systemctl stop postgresql
    ok "PostgreSQL service stopped"

    mkdir -p "$(dirname "$PG_DATA_TARGET")"

    if [[ -d "$PG_DATA_DEFAULT" ]] && [[ ! -d "$PG_DATA_TARGET" ]]; then
        rsync -av --progress "$PG_DATA_DEFAULT/" "$PG_DATA_TARGET/"
        ok "Data directory copied to $PG_DATA_TARGET"
    else
        warn "Source already moved or target exists — skipping rsync"
    fi

    chown -R postgres:postgres "${MOUNT_POINT}/postgresql"
    chmod 700 "$PG_DATA_TARGET"
    ok "Permissions set (postgres:postgres, 700)"

    # Update postgresql.conf data_directory
    sed -i "s|^#*data_directory.*|data_directory = '$PG_DATA_TARGET'|" "$PG_CONF"
    ok "postgresql.conf → data_directory = $PG_DATA_TARGET"
fi

# ── Step 6: Configure PostgreSQL for Docker Bridge Access ───────────────────
log "Step 6: Configuring PostgreSQL to accept Docker container connections"

# Listen on all interfaces so Docker containers can reach host PostgreSQL
sed -i "s|^#*listen_addresses.*|listen_addresses = '*'|" "$PG_CONF"
ok "listen_addresses = '*'"

# Allow connections from entire Docker bridge subnet (172.16.0.0/12)
HBA_LINE="host    all             all             172.16.0.0/12           scram-sha-256"
if ! grep -qF "172.16.0.0/12" "$PG_HBA"; then
    echo "$HBA_LINE" >> "$PG_HBA"
    ok "Added Docker subnet rule to pg_hba.conf"
else
    ok "Docker subnet rule already in pg_hba.conf"
fi

# ── Step 7: Start PostgreSQL ─────────────────────────────────────────────────
log "Step 7: Starting PostgreSQL service"

systemctl start postgresql
systemctl enable postgresql

sleep 3
systemctl is-active --quiet postgresql || die "PostgreSQL failed to start — run: journalctl -xe"
ok "PostgreSQL is active and enabled on boot"

# ── Step 8: Create clutchhh_user ─────────────────────────────────────────────
log "Step 8: Setting up database user '$PG_USER'"

USER_EXISTS=$(sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'" | tr -d ' ')
if [[ "$USER_EXISTS" == "1" ]]; then
    ok "User '$PG_USER' already exists"
else
    sudo -u postgres psql -c "CREATE USER $PG_USER WITH LOGIN SUPERUSER PASSWORD '$PG_PASS';"
    ok "Created user '$PG_USER'"
fi

# Always sync password in case it changed
sudo -u postgres psql -c "ALTER USER $PG_USER WITH PASSWORD '$PG_PASS';"
ok "Password confirmed for '$PG_USER'"

# ── Step 9: Restore Databases ────────────────────────────────────────────────
log "Step 9: Restoring databases from dump"

ALREADY_RESTORED=true
for DB in $EXPECTED_DBS; do
    EXISTS=$(sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB'" | tr -d ' ')
    if [[ "$EXISTS" != "1" ]]; then
        ALREADY_RESTORED=false
        break
    fi
done

if [[ "$ALREADY_RESTORED" == "true" ]]; then
    warn "All expected databases already exist — skipping restore (idempotent)"
else
    sudo -u postgres psql < "$DUMP_FILE"
    ok "Databases restored from $DUMP_FILE"
fi

log "Current database list:"
sudo -u postgres psql -c "\l" | grep -E "Name|clutchhh" || true

# ── Step 10: Docker Container Cleanup ───────────────────────────────────────
log "Step 10: Docker container cleanup"

echo ""
read -rp "  Remove Docker container '$CONTAINER'? This is IRREVERSIBLE. (yes/no): " CONFIRM
if [[ "$CONFIRM" == "yes" ]]; then
    docker stop "$CONTAINER" 2>/dev/null || true
    docker rm "$CONTAINER" 2>/dev/null || true
    docker volume prune -f
    ok "Container '$CONTAINER' removed, unused volumes pruned"
else
    warn "Skipped — container still running (safe, you can remove later)"
fi

# ── Step 11: Final Verification ──────────────────────────────────────────────
log "Step 11: Final verification"

DATA_DIR_LIVE=$(sudo -u postgres psql -tc "SHOW data_directory;" | tr -d ' \n')
ok "data_directory = $DATA_DIR_LIVE"

if [[ "$DATA_DIR_LIVE" != "$PG_DATA_TARGET" ]]; then
    warn "data_directory mismatch! Expected: $PG_DATA_TARGET — Got: $DATA_DIR_LIVE"
fi

echo ""
log "Database status:"
for DB in $EXPECTED_DBS; do
    EXISTS=$(sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB'" | tr -d ' ')
    if [[ "$EXISTS" == "1" ]]; then
        ok "$DB"
    else
        warn "$DB — MISSING"
    fi
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Migration complete! REQUIRED NEXT STEPS:"
echo ""
echo " 1. Edit backend/.env — update database URLs:"
echo "    DATABASE_URL=postgresql+psycopg2://clutchhh_user:${PG_PASS}@host.docker.internal:5432/clutchhh_db"
echo "    GLOBAL_DATABASE_URL=postgresql+psycopg2://clutchhh_user:${PG_PASS}@host.docker.internal:5432/clutchhh_global"
echo "    ADMIN_DATABASE_URL=postgresql+psycopg2://clutchhh_user:${PG_PASS}@host.docker.internal:5432/clutchhh_db"
echo ""
echo " 2. Ensure docker-compose.yml has under clutchhh_backend service:"
echo "    extra_hosts:"
echo "      - \"host.docker.internal:host-gateway\""
echo ""
echo " 3. Restart backend:"
echo "    sudo docker compose up -d --force-recreate clutchhh_backend"
echo ""
echo " 4. Verify backend connected:"
echo "    sudo docker logs clutchhh_backend --tail=20"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
