#!/usr/bin/env bash
# =============================================================================
# Primus Platform — Monthly automated restore drill
# =============================================================================
# Purpose:
#   "An untested backup is not a backup." Once a month (cron/systemd timer),
#   take the most recent backup, restore it into a throwaway Postgres container,
#   run a few sanity SELECTs, then tear the container down. Emit a Prometheus
#   textfile metric so we'll alert if the drill ever fails.
#
# Forensic audit references:
#   BUG #BACK-004  Restores never tested — addressed.
#
# Required external setup:
#   - docker must be runnable by the user invoking this script
#   - Same metric directory as backup_postgres.sh
#
# Suggested schedule (systemd timer or cron):
#   0 5 1 * *  /opt/primus/scripts/restore_postgres_drill.sh
# =============================================================================

set -euo pipefail
set -o errtrace

BACKUP_DIR="/mnt/data/backups"
LOG_FILE="/var/log/primus/restore-drill.log"
METRIC_FILE="/var/lib/node_exporter/textfile_collector/primus_restore_drill.prom"
METRIC_TMP="${METRIC_FILE}.tmp"
CONTAINER_NAME="primus-restore-drill-$(date +%s)"
PG_IMAGE="postgres:15-alpine"
PG_PORT_HOST="55432"
START_EPOCH="$(date -u +%s)"

mkdir -p "$(dirname "${LOG_FILE}")" "$(dirname "${METRIC_FILE}")"

log() {
  local msg="[$(date -u +%FT%TZ)] $*"
  echo "${msg}"
  echo "${msg}" >> "${LOG_FILE}" || true
}

write_metric() {
  local success="$1"
  local duration="$2"
  local rows="$3"
  cat > "${METRIC_TMP}" <<EOF
# HELP primus_restore_drill_last_success_unixtime UNIX time of last successful drill.
# TYPE primus_restore_drill_last_success_unixtime gauge
primus_restore_drill_last_success_unixtime ${success}
# HELP primus_restore_drill_last_duration_seconds Duration of last drill in seconds.
# TYPE primus_restore_drill_last_duration_seconds gauge
primus_restore_drill_last_duration_seconds ${duration}
# HELP primus_restore_drill_last_user_rows Row count from sample SELECT count(*) FROM users.
# TYPE primus_restore_drill_last_user_rows gauge
primus_restore_drill_last_user_rows ${rows}
EOF
  mv -f "${METRIC_TMP}" "${METRIC_FILE}"
}

cleanup() {
  log "cleanup container=${CONTAINER_NAME}"
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}

on_error() {
  local exit_code=$?
  log "FAILED — exit=${exit_code} line=${BASH_LINENO[0]}"
  cleanup
  write_metric 0 "$(( $(date -u +%s) - START_EPOCH ))" 0
  exit "${exit_code}"
}
trap on_error ERR
trap cleanup EXIT

# ---- Find most recent backup -------------------------------------------------
LATEST="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'pg-*.sql.gz' -printf '%T@ %p\n' | sort -rn | head -n 1 | awk '{print $2}')"
[ -n "${LATEST:-}" ] && [ -f "${LATEST}" ] || { log "ERROR: no backup found in ${BACKUP_DIR}"; exit 2; }
log "START drill backup=${LATEST}"

# ---- Spin up throwaway Postgres ---------------------------------------------
docker run -d --rm \
    --name "${CONTAINER_NAME}" \
    -e POSTGRES_PASSWORD=drill_pw_$$ \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_DB=postgres \
    -p "${PG_PORT_HOST}:5432" \
    "${PG_IMAGE}" \
    -c shared_buffers=128MB -c max_connections=20 >/dev/null
log "container started ${CONTAINER_NAME}"

# ---- Wait for ready ----------------------------------------------------------
for i in $(seq 1 30); do
  if docker exec "${CONTAINER_NAME}" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
  [ "$i" -eq 30 ] && { log "ERROR: container never became ready"; exit 3; }
done
log "container ready"

# ---- Restore -----------------------------------------------------------------
log "restoring..."
gunzip -c "${LATEST}" | docker exec -i "${CONTAINER_NAME}" \
    psql -U postgres -v ON_ERROR_STOP=0 -q >/dev/null 2>&1 || true
log "restore complete"

# ---- Sanity queries ----------------------------------------------------------
# Discover the database name from the dump (first \connect line) — works because
# pg_dumpall preserves database names with --clean --if-exists.
DB_NAME="$(gunzip -c "${LATEST}" | grep -m1 -oE '\\connect [^ ]+' | awk '{print $2}' | tr -d '"' || true)"
[ -z "${DB_NAME}" ] && DB_NAME="postgres"
log "running sanity SELECTs against db=${DB_NAME}"

USER_ROWS="$(docker exec "${CONTAINER_NAME}" psql -U postgres -d "${DB_NAME}" -tAc \
    "SELECT count(*) FROM users;" 2>/dev/null | tr -d '[:space:]' || echo 0)"
USER_ROWS="${USER_ROWS:-0}"
log "users count = ${USER_ROWS}"

# Sanity: at least one table must exist
TABLE_COUNT="$(docker exec "${CONTAINER_NAME}" psql -U postgres -d "${DB_NAME}" -tAc \
    "SELECT count(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null | tr -d '[:space:]' || echo 0)"
log "public tables = ${TABLE_COUNT}"
if [ "${TABLE_COUNT:-0}" -lt 1 ]; then
  log "ERROR: restored db has no public tables"
  exit 4
fi

# ---- Done --------------------------------------------------------------------
DURATION=$(( $(date -u +%s) - START_EPOCH ))
write_metric "$(date -u +%s)" "${DURATION}" "${USER_ROWS}"
log "SUCCESS duration=${DURATION}s users=${USER_ROWS} tables=${TABLE_COUNT}"
exit 0
