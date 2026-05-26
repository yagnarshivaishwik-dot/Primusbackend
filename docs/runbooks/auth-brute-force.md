# Runbook: AuthBruteForce

> Severity **warning** — Slack `#prod-security` + PagerDuty (security route).
> Alert source: `primus_alerts.yml :: AuthBruteForce`.

## Symptoms
- `rate(failed_login_attempts_total[1m]) > 5` for >2m.
- Possible credential-stuffing or scripted login attack.

## Dashboards
- Grafana **Primus / Overview** -> `Failed login attempts`
- Loki: `{container_id=~".+"} |= "failed_login_attempts"` -> source IP, user
- Sentry breadcrumbs may show the offending IP

## Immediate triage (do this fast)
1. Identify the top IP(s) firing the metric. Query Loki:
   ```
   {container_id=~".+"} |= "auth" |= "fail" | json | line_format "{{.client_ip}} {{.email}}"
   ```
2. Identify the top targeted accounts. Are they staff / admin? Treat as
   critical and lock immediately.
3. Confirm `RedisRateLimitMiddleware` is actually limiting -> if not,
   investigate Redis health.

## Likely causes
- Credential stuffing from a leaked-credential list.
- Single misconfigured kiosk hammering login.
- Internal load-test using prod env.
- Bot using the public auth endpoint as an enumeration vector.

## Mitigations
- **Hot-block IP**: `POST /api/security/lock_ip` with `{"ip":"x.x.x.x","minutes":60}`.
- **Lock account**: `POST /api/security/lock_user` for any victim above the
  threshold. Force a password reset.
- **Tighten global limit**: lower `RATE_LIMIT_PER_MINUTE` temporarily.
- **WAF**: push a deny rule upstream if Cloudflare / Azure FrontDoor sits in front.

## After resolution
- Notify affected users with a reset link.
- Add the offending IP to long-term denylist if it's a known bad ASN.
- File a security incident ticket.

## Forensics
- Pull `audit_log` rows for the window: `SELECT * FROM audit_log WHERE
  action='login' AND created_at > NOW() - interval '1 hour' ORDER BY created_at`.
- Cross-reference IP with prior successful logins to spot account takeover.
