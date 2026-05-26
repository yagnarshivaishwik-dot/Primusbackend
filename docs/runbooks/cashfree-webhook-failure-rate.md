# Runbook: CashfreeWebhookFailureRate

> Severity **critical** — paged via PagerDuty.
> Alert source: `primus_alerts.yml :: CashfreeWebhookFailureRate`.

## Symptoms
- `/api/v1/payment/cashfree/*` failure ratio above 1% for 5m.
- Cashfree dashboard shows growing "retry" count.
- Customers report missing wallet credit minutes after a successful payment.

## Dashboards
- Grafana **Primus / Overview** -> `Payment success rate`
- Cashfree merchant dashboard -> Webhooks -> Failed (last 1h)
- Sentry -> `transaction:/api/v1/payment/cashfree/*`

## Immediate triage
1. Confirm alert in PagerDuty; acknowledge.
2. Check Cashfree status page: https://status.cashfree.com
3. Pull last 20 Sentry errors for the endpoint -> common exception?
4. Verify idempotency table is healthy: `SELECT COUNT(*) FROM
   idempotency_keys WHERE expires_at > NOW()` should be < 100k.

## Likely causes
- Signature verification failing after a Cashfree key rotation.
- DB write timing out (slow Postgres) -> webhook 5xx -> Cashfree retries.
- Internal feature flag flipped (new code path broken).
- Cashfree sandbox keys leaked into production env.

## Mitigations
- **Signature mismatch**: confirm `CASHFREE_WEBHOOK_SECRET` matches the dashboard
  value. Rotate if compromised.
- **Slow Postgres**: check `pg_stat_activity`; kill long-running queries; scale
  backend replicas to absorb retries.
- **Bad flag**: `redis-cli HGET feature_flags cashfree_v2` and revert.

## Cashfree retry note
Cashfree retries 9 times over ~6h. We have idempotency on the order_id, so a
successful recovery before the 9th retry will NOT double-credit. Verify by:

```sql
SELECT cashfree_order_id, COUNT(*) FROM payments
WHERE created_at > NOW() - interval '1 day'
GROUP BY 1 HAVING COUNT(*) > 1;
```

## Rollback
Same as PaymentWebhook5xx — `git revert` and redeploy.
