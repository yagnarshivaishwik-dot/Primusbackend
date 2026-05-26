# Runbook: PaymentWebhook5xx

> Severity **critical** — paged via PagerDuty.
> Alert source: `docker/prometheus/rules/primus_alerts.yml :: PaymentWebhook5xx`.

## Symptoms
- Cashfree / UPI webhook endpoint `/api/v1/payment/*` returning 5xx.
- Customer wallet credits delayed or missing.
- Slack `#prod-alerts` and PagerDuty open.

## Dashboards
- Grafana **Primus / Overview** -> `HTTP 5xx ratio` + `Payment success rate`
- Sentry `primus-backend` -> Issues filtered to `transaction:/api/v1/payment/*`
- Loki: `{container_id=~".+"} |= "payment" |= "5"` filtered to last 15m

## Immediate triage (5m)
1. Acknowledge in PagerDuty.
2. Open the dashboard above; confirm the 5xx is in `/api/v1/payment/*` and not
   site-wide. If site-wide, switch to `HTTP5xxSpike` runbook.
3. Pull last 50 errors from Sentry; look for a common stack trace.
4. Check the last 3 deploys (`gh run list --workflow=deploy`). If a deploy
   landed in the last 30 min, this is the most likely cause.

## Likely causes
- Upstream Cashfree API outage -> 502/504 propagated through.
- New deploy broke serializer / DB migration drift.
- Idempotency Redis full / down -> writes fail open.
- DB connection-pool exhaustion (check `pg_stat_activity`).

## Mitigations
- **Cashfree outage**: enable maintenance banner via SuperAdmin
  `/internal/system/maintenance`. Cashfree will retry; do NOT mark orders failed.
- **Bad deploy**: `kubectl rollout undo deployment/primus-backend` or revert
  the merge commit and redeploy.
- **Redis full**: scale Redis or flush idempotency keys older than TTL.
- **DB pool**: bounce one backend replica to release pool, then investigate.

## Rollback procedure
1. `git revert <bad-sha>` on `main`, push.
2. Watch deploy via `gh run watch`.
3. Confirm dashboard returns to baseline within 5m.
4. Post incident summary in `#prod-incidents`.

## After resolution
- File a post-mortem if customer impact > 5 min.
- Verify no double-charge by querying `SELECT * FROM payments WHERE
  cashfree_order_id IN (...) GROUP BY cashfree_order_id HAVING COUNT(*) > 1`.
