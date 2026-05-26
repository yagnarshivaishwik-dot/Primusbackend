#!/usr/bin/env bash
# =============================================================================
# Primus Platform — PostgreSQL backup
# =============================================================================
# Purpose:
#   pg_dumpall the entire cluster (all 3 chains: core/cafe/global + globals),
#   gzip, push to Azure Blob with azcopy, age-prune local copies, and emit a
#   Prometheus textfile metric so Alertmanager can fire if backups stall.
#
# Forensic audit references:
#   BUG #BACK-001  No off-host backups — addressed by azcopy push.
#   BUG #BACK-002  No retention policy — addressed by 7d/4w/3m windows.
#   BUG #BACK-003  Backup failure was invisible — Prometheus metric + non-zero exit.
#
# Required external setup:
#   - /mnt/data/backups exists, writable by postgres user
#   - /var/log/primus exists, writable by postgres user
#   - /var/lib/node_exporter/textfile_collector exists, writable by postgres user
#     (node_exporter must be started with --collector.textfile.directory=...)
#   - azcopy CLI installed at /usr/local/bin/azcopy
#   - AZ_BLOB_SAS_URL env (in /etc/primus/backup.env) — short-lived container SAS
#     with write+list, no delete. Example:
#       AZ_BLOB_SAS_URL="https://primusprod.blob.core.windows.net/pg-backups?sv=..."
#   - /etc/primus/backup.env is mode 0600 root:postgres
#
# Run:
#   sudo -u postgres /opt/primus/scripts/backup_postgres.sh
#   (or via systemd: primus-backup.timer)
# =============================================================================

set -euo pipefail
set -o errtrace

# ---- Config ------------------------------------------------------------------
BACKUP_DIR="/mnt/data/backups"
LOG_FILE="/var/log/primus/backup.log"
METRIC_FILE="/var/lib/node_exporter/textfile_collector/primus_backup.prom"
METRIC_TMP="${METRIC_FILE}.tmp"
ENV_FILE="/etc/primus/backup.env"
RETAIN_DAILY=7
RETAIN_WEEKLY=4
RETAIN_MONTHLY=3
TS_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="${BACKUP_DIR}/pg-${TS_UTC}.sql.gz"
START_EPOCH="$(date -u +%s)"

# ---- Helpers -----------------------------------------------------------------
log() {
  local msg="[$(date -u +%FT%TZ)] $*"
  echo "${msg}"
  echo "${msg}" >> "${LOG_FILE}" || true
}

write_metric() {
  local success="$1"      # 1 or 0
  local size_bytes="$2"
  local duration="$3"
  cat > "${METRIC_TMP}" <<EOF
# HELP primus_backup_last_success_unixtime UNIX timestamp of last successful pg backup.
# TYPE primus_backup_last_success_unixtime gauge
primus_backup_last_success_unixtime ${success}
# HELP primus_backup_last_size_bytes Size of the most recent backup file in bytes.
# TYPE primus_backup_last_size_bytes gauge
primus_backup_last_size_bytes ${size_bytes}
# HELP primus_backup_last_duration_seconds Duration of the most recent backup run.
# TYPE primus_backup_last_duration_seconds gauge
primus_backup_last_duration_seconds ${duration}
EOF
  mv -f "${METRIC_TMP}" "${METRIC_FILE}"
}

on_error() {
  local exit_code=$?
  log "FAILED — exit=${exit_code} line=${BASH_LINENO[0]}"
  write_metric 0 0 "$(( $(date -u +%s) - START_EPOCH ))"
  exit "${exit_code}"
}
trap on_error ERR

# ---- Preflight ---------------------------------------------------------------
[ -d "${BACKUP_DIR}" ] || { log "ERROR: ${BACKUP_DIR} missing"; exit 2; }
mkdir -p "$(dirname "${LOG_FILE}")" "$(dirname "${METRIC_FILE}")"

if [ -r "${ENV_FILE}" ]; then
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
fi
: "${AZ_BLOB_SAS_URL:?AZ_BLOB_SAS_URL not set (check ${ENV_FILE})}"

log "START backup ts=${TS_UTC} target=${DUMP_FILE}"

# ---- pg_dumpall -> gzip ------------------------------------------------------
# --clean --if-exists makes restores idempotent.
pg_dumpall -U postgres --clean --if-exists | gzip -9 > "${DUMP_FILE}"
SIZE_BYTES=$(stat -c '%s' "${DUMP_FILE}")
log "dump complete size=${SIZE_BYTES}B"

# Sanity: dump must be at least 1KiB (empty/broken dumps usually trip this).
if [ "${SIZE_BYTES}" -lt 1024 ]; then
  log "ERROR: dump suspiciously small (${SIZE_BYTES}B)"
  exit 3
fi

# ---- Push to Azure Blob ------------------------------------------------------
log "uploading to Azure Blob"
/usr/local/bin/azcopy copy "${DUMP_FILE}" "${AZ_BLOB_SAS_URL}" \
    --output-level=essential \
    --log-level=ERROR
log "azcopy ok"

# ---- Retention: daily / weekly / monthly -------------------------------------
# Daily : keep latest N files anywhere (most recent ${RETAIN_DAILY})
# Weekly: keep files older than 7d but younger than 35d, one per ISO week
# Monthly: keep files older than 35d but younger than ~120d, one per month
# Anything older than 120d => delete.
log "applying retention daily=${RETAIN_DAILY} weekly=${RETAIN_WEEKLY} monthly=${RETAIN_MONTHLY}"

# 1) Delete anything older than 120 days unconditionally
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'pg-*.sql.gz' -mtime +120 -print -delete \
    | sed 's/^/  pruned-old /' | tee -a "${LOG_FILE}" >/dev/null

# 2) Keep newest RETAIN_DAILY daily files; nuke older "daily-band" files
#    (younger than 7d but in excess of the cap)
mapfile -t DAILIES < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'pg-*.sql.gz' -mtime -7 -printf '%T@ %p\n' | sort -rn | awk '{print $2}')
if [ "${#DAILIES[@]}" -gt "${RETAIN_DAILY}" ]; then
  for f in "${DAILIES[@]:${RETAIN_DAILY}}"; do
    rm -f -- "${f}" && log "  pruned-daily ${f}"
  done
fi

# 3) Weekly band: ages 7..35 days. Keep one per ISO week, up to RETAIN_WEEKLY.
declare -A WEEK_SEEN=()
WEEKLY_KEPT=0
while IFS= read -r f; do
  WK="$(date -u -d "@$(stat -c '%Y' "$f")" +%G-%V)"
  if [ -z "${WEEK_SEEN[$WK]:-}" ] && [ "${WEEKLY_KEPT}" -lt "${RETAIN_WEEKLY}" ]; then
    WEEK_SEEN[$WK]=1
    WEEKLY_KEPT=$((WEEKLY_KEPT+1))
  else
    rm -f -- "${f}" && log "  pruned-weekly ${f}"
  fi
done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'pg-*.sql.gz' -mtime +7 -mtime -35 -printf '%T@ %p\n' | sort -rn | awk '{print $2}')

# 4) Monthly band: ages 35..120 days. Keep one per YYYY-MM, up to RETAIN_MONTHLY.
declare -A MONTH_SEEN=()
MONTHLY_KEPT=0
while IFS= read -r f; do
  MO="$(date -u -d "@$(stat -c '%Y' "$f")" +%Y-%m)"
  if [ -z "${MONTH_SEEN[$MO]:-}" ] && [ "${MONTHLY_KEPT}" -lt "${RETAIN_MONTHLY}" ]; then
    MONTH_SEEN[$MO]=1
    MONTHLY_KEPT=$((MONTHLY_KEPT+1))
  else
    rm -f -- "${f}" && log "  pruned-monthly ${f}"
  fi
done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'pg-*.sql.gz' -mtime +35 -mtime -120 -printf '%T@ %p\n' | sort -rn | awk '{print $2}')

# ---- Emit success metric -----------------------------------------------------
DURATION=$(( $(date -u +%s) - START_EPOCH ))
write_metric "$(date -u +%s)" "${SIZE_BYTES}" "${DURATION}"
log "SUCCESS duration=${DURATION}s size=${SIZE_BYTES}B file=${DUMP_FILE}"
exit 0
