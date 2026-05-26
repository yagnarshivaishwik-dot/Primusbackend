# Runbook: DiskSpaceLow

> Severity **critical** — paged via PagerDuty.
> Alert source: `primus_alerts.yml :: DiskSpaceLow`.

## Symptoms
- Root `/` filesystem <15% free for >5m.
- Risk of Postgres WAL stall, Loki write rejection, or full container crash.

## Dashboards
- Grafana **Node Exporter Full** -> Filesystem -> Free space %
- `df -h` on the host

## Immediate triage
1. `sudo df -h` — confirm which mount is low.
2. `sudo du -shx /var/log /var/lib/docker /mnt/data/* 2>/dev/null | sort -h | tail -20`.
3. Free the obvious offenders first; check below.

## Likely causes (and per-cause fix)
| Offender | Fix |
| --- | --- |
| `/var/lib/docker/containers/*/*.log` | `truncate -s 0 *-json.log` after promtail has shipped. Configure log rotation in `/etc/docker/daemon.json`. |
| `/var/log/journal` | `sudo journalctl --vacuum-time=2d`. |
| Loki chunks | `docker exec primus-loki sh -c "rm -rf /loki/chunks/oldest"` only if Loki retention failed. Better: bump compactor. |
| Prometheus TSDB | `--storage.tsdb.retention.size` flag, OR delete `/prometheus/wal/*` after stopping it. |
| Postgres WAL | `psql -c "CHECKPOINT"`; lower `wal_keep_size` if streaming replication is off. |
| Backups | `find /mnt/data/backups -mtime +14 -delete`. |

## Mitigations
- Free **immediately** if <5%: Postgres will stop accepting writes if `/`
  hits 0%.
- Run `docker system prune -a -f --volumes` only if you understand which
  volumes you're nuking (NEVER on the prom/loki/tempo data volumes).

## After resolution
- Add a longer-horizon capacity ticket.
- Confirm log rotation + retention is set correctly so this doesn't repeat.
