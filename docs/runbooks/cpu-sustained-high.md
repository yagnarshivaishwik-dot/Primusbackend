# Runbook: CPUSustainedHigh

> Severity **warning** — Slack `#prod-alerts`.
> Alert source: `primus_alerts.yml :: CPUSustainedHigh`.

## Symptoms
- Host CPU >85% for >10m.
- Possible latency spike, p95 climbing.

## Dashboards
- Grafana **Node Exporter Full** -> CPU
- Grafana **Primus / Overview** -> `p95 latency` panel
- Grafana **cadvisor** dashboard for per-container breakdown

## Immediate triage
1. `top -b -n1 -o %CPU | head -25` — which process?
2. If `uvicorn` or `python`: hit `/metrics` and check request rate. Is this
   organic load, or a runaway worker?
3. If `postgres`: identify the query via `pg_stat_activity` ordered by
   `query_start`.
4. If a container: `docker stats --no-stream` to confirm offender.

## Likely causes
- Traffic spike (legitimate or DOS).
- Hot loop in newly-deployed code.
- Postgres missing index -> seq scan storms.
- Celery worker stuck in retry loop.

## Mitigations
- **Traffic spike**: scale horizontally; enable Redis rate-limit globally.
- **Code regression**: roll back the last deploy (see `payment-webhook-5xx.md`
  rollback section).
- **DB**: add the missing index; run `ANALYZE` on the offending table.
- **DOS**: temporarily tighten `MetricsGuardMiddleware` IP allowlist and add
  the bad IP to `failed_login_attempts`-style blocklist.

## After resolution
- Capture flamegraph (`py-spy dump --pid <pid>` for python, `perf` for native).
- File a capacity ticket if traffic was legitimate.
