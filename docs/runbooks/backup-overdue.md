# Runbook: BackupOverdue

> Severity **critical** — paged via PagerDuty.
> Alert source: `primus_alerts.yml :: BackupOverdue`.

## Symptoms
- `primus_backup_last_success_unixtime` older than 4h.
- RPO commitment is 1h; this is a data-durability incident.

## Dashboards
- Grafana custom panel for backup metrics (planned dashboard `primus-backups`).
- Loki: `{job="systemd-journal", unit="primus-backup.service"}`.

## Immediate triage
1. SSH into the backup orchestrator host.
2. `systemctl status primus-backup.timer primus-backup.service`.
3. `journalctl -u primus-backup.service --since "6h ago"`.
4. Confirm storage destination is reachable (Azure Blob / S3 / local mount).

## Likely causes
- Backup cron job disabled (someone ran `systemctl stop primus-backup.timer`).
- Destination bucket full or credentials expired.
- Postgres WAL archiving paused due to disk pressure (see `disk-space-low.md`).
- Backup script silently failing (no exit-code propagation).

## Mitigations
- **Stopped timer**: `systemctl enable --now primus-backup.timer`.
- **Bucket / creds**: rotate per `docs/MANUAL_ROTATION_CHECKLIST.md`.
- **Run a backup NOW**: `systemctl start primus-backup.service` and watch the
  metric tick.

## After resolution
- File a post-mortem.
- Add a paging alert at the 90-min mark BEFORE the 4h threshold (warning).
- Verify a restore drill (see `backup-restore-drill-failed.md`).
