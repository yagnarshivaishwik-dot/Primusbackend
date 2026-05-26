# Runbook: PostgresDown

> Severity **critical** — paged via PagerDuty.
> Alert source: `primus_alerts.yml :: PostgresDown`.

## Symptoms
- `up{job="postgres_exporter"} == 0` for >1 min.
- Backend `/readyz` returns 503; load balancer evicting replicas.
- Customer-facing 5xx across the board.

## Dashboards
- Grafana **Primus / Overview** -> `DB + Redis up`
- Grafana **PostgreSQL** (auto-imported, ID 9628) -> Connections, WAL, Replication
- Azure portal -> Postgres flexible server resource

## Immediate triage
1. SSH into the host: `ssh azureuser@<observability-host>`.
2. `sudo systemctl status postgresql` — running?
3. If running, exporter died: `sudo systemctl restart postgres_exporter`,
   re-check the alert in 1m.
4. If Postgres itself is down: `sudo journalctl -xe -u postgresql -n 200`.

## Likely causes
- Disk full on `/mnt/data` (cross-check `DiskSpaceLow` alert).
- OOM-killed by kernel (check `dmesg | grep -i kill`).
- Migration deadlock left a session holding `pg_stat_activity` (look for
  `idle in transaction`).
- Azure-managed VM maintenance event (check Azure activity log).

## Mitigations
- **Disk full**: free space FIRST. `sudo du -shx /mnt/data/postgresql/*/main/pg_wal`.
  Force a checkpoint to release WAL: `psql -c "CHECKPOINT;"`.
- **OOM**: bump VM size or trim `shared_buffers` / `work_mem`.
- **Stuck transaction**: `SELECT pg_terminate_backend(pid) FROM
  pg_stat_activity WHERE state = 'idle in transaction' AND query_start <
  NOW() - interval '5 minutes';`
- **Azure maintenance**: ride it out; switch DNS to standby if downtime > 5 min.

## Rollback
N/A — this is an infrastructure incident, not a code rollback.

## After resolution
- File a post-mortem if downtime > 1 min.
- Confirm `primus_backup_last_success_unixtime` ticked over within the last 1h.
