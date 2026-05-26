# Runbook: BackupRestoreDrillFailed

> Severity **critical** — paged via PagerDuty.
> Alert source: `primus_alerts.yml :: BackupRestoreDrillFailed`.

## Symptoms
- `primus_backup_restore_drill_success == 0`.
- Means the most recent automated restore drill couldn't bring a sample DB
  back up. We cannot meet RTO until this is fixed.

## Dashboards
- Loki: `{unit="primus-restore-drill.service"}` for the failing run's logs.
- Grafana backup dashboard (planned).

## Immediate triage
1. Pull the most recent drill log:
   `journalctl -u primus-restore-drill.service --since "12h ago"`.
2. Identify the stage that failed: download? decryption? pg_restore?
   integrity verify?
3. If decryption failed, the master key may have rotated without updating
   the drill script — fix the key reference and re-run.

## Likely causes
- Backup file corruption (network upload truncated).
- pg_restore version mismatch (drill VM running older pg_restore).
- Encryption key rotation that didn't update the drill secret.
- Drill VM out of disk space.

## Mitigations
- **Bad backup**: try the previous day's backup; if that works, the latest
  is corrupt -> investigate the producer.
- **Version mismatch**: align pg_restore with prod Postgres version.
- **Key mismatch**: confirm `PRIMUS_BACKUP_KEY_VERSION` in drill env.
- **Disk**: free space on drill VM; expand if needed.

## After resolution
- Re-run the drill manually:
  `systemctl start primus-restore-drill.service`.
- Confirm metric flips to 1.
- File a post-mortem (RTO unverified = security/compliance issue).
- Add an extra drill cadence (twice-weekly) until 4 consecutive passes.
