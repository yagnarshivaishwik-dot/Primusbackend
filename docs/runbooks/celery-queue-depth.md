# Runbook: CeleryQueueDepth

> Severity **warning** — Slack `#prod-alerts`.
> Alert source: `primus_alerts.yml :: CeleryQueueDepth`.

## Symptoms
- `celery_queue_length > 1000` for >5m.
- Background tasks delayed: revenue aggregation, presence sweep,
  campaign email send, webhook retries.

## Dashboards
- Grafana **Primus / Overview** -> `Celery queue depth`
- Loki: `{container_id=~".+"} |= "celery" |= "ERROR"`

## Immediate triage
1. `docker ps | grep celery` — workers up? How many?
2. `celery -A app.celery_app inspect active` — what are they doing?
3. `celery -A app.celery_app inspect stats` — prefetch counts, pool size.
4. Check broker (Redis) -> queue depth: `redis-cli LLEN celery`.

## Likely causes
- Worker container crash-looped (OOM, signal).
- Poisoned task at head of queue stalling everything (no time limit).
- DB-bound task slowing throughput (revenue aggregation joins).
- Burst from a campaign send.

## Mitigations
- **Scale**: `docker compose up -d --scale celery-worker=4`.
- **Poison task**: identify via `inspect active`, then
  `celery -A app.celery_app control revoke <task-id> --terminate`.
- **Time-limit unsafe tasks**: ensure `task_soft_time_limit` and
  `task_time_limit` are set; restart workers.
- **Drain stuck queue**: `redis-cli DEL celery` ONLY if you've confirmed
  the tasks are idempotent or already processed elsewhere.

## After resolution
- Tag any new long-running tasks with explicit `time_limit`.
- Add per-queue concurrency knobs.
