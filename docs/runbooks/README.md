# Primus Runbooks

One markdown file per Prometheus alert defined in
`docker/prometheus/rules/primus_alerts.yml`.

Each runbook lists:

- **Symptoms** — what the on-call sees first
- **Dashboards** — Grafana / Sentry / Loki views to open
- **Immediate triage** — first 5 minutes
- **Likely causes** — ordered by historical frequency
- **Mitigations** — per-cause action
- **Rollback procedure** — when a deploy caused it
- **After resolution** — followups, post-mortem rules

The `runbook_url` annotation on every alert points at one of these files,
so PagerDuty + Slack messages link directly to the right page at 03:00.

## Index

| Alert | Severity | Channel |
| --- | --- | --- |
| [PaymentWebhook5xx](payment-webhook-5xx.md) | critical | PagerDuty |
| [CashfreeWebhookFailureRate](cashfree-webhook-failure-rate.md) | critical | PagerDuty |
| [PostgresDown](postgres-down.md) | critical | PagerDuty |
| [RedisDown](redis-down.md) | critical | PagerDuty |
| [DiskSpaceLow](disk-space-low.md) | critical | PagerDuty |
| [CPUSustainedHigh](cpu-sustained-high.md) | warning | Slack |
| [CeleryQueueDepth](celery-queue-depth.md) | warning | Slack |
| [WebSocketDisconnectsSpike](websocket-disconnects-spike.md) | warning | Slack |
| [HTTP5xxSpike](http-5xx-spike.md) | critical | PagerDuty |
| [AuthBruteForce](auth-brute-force.md) | warning | Slack + PD security |
| [BackupOverdue](backup-overdue.md) | critical | PagerDuty |
| [BackupRestoreDrillFailed](backup-restore-drill-failed.md) | critical | PagerDuty |
