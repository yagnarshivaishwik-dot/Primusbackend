# Runbook: HTTP5xxSpike

> Severity **critical** — paged via PagerDuty.
> Alert source: `primus_alerts.yml :: HTTP5xxSpike`.

## Symptoms
- `>1%` of HTTP requests returning 5xx for 5m.
- Customers report errors across multiple flows (login, wallet, sessions).

## Dashboards
- Grafana **Primus / Overview** -> `HTTP 5xx ratio`
- Sentry -> Issues since 30 min ago, grouped by transaction
- Loki: `{container_id=~".+"} |= "ERROR" | json | status >= 500`

## Immediate triage
1. Look at the top-3 endpoints contributing to 5xx in Grafana.
   Filter `http_requests_total{status=~"5.."}` by endpoint.
2. Sentry: which 3 errors dominate? Group by exception class.
3. Recent deploy? `gh run list --workflow=deploy --limit 5`.
4. Infra alert co-firing? Check `PostgresDown`, `RedisDown`, `DiskSpaceLow`.

## Likely causes
- Bad deploy.
- DB outage (cross-ref `PostgresDown`).
- Upstream third-party (Cashfree, FCM, SMTP) down.
- Resource exhaustion (file descriptors, connections).

## Mitigations
- **Bad deploy**: `git revert <bad-sha>` + redeploy. See payment-webhook-5xx
  rollback section.
- **DB/Redis**: follow the corresponding runbook.
- **Third-party**: enable graceful degradation flag; surface a banner.

## Rollback procedure
1. Identify offending deploy via Sentry's "first seen" timestamp.
2. `git revert <sha>` on `main`, push.
3. Watch `gh run watch`.
4. Confirm 5xx ratio returns under 0.5% within 5m.
5. Post incident summary in `#prod-incidents`.

## After resolution
- File a post-mortem if customer impact > 5m.
- Add a regression test for the offending code path.
