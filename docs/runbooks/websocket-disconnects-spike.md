# Runbook: WebSocketDisconnectsSpike

> Severity **warning** — Slack `#prod-alerts`.
> Alert source: `primus_alerts.yml :: WebSocketDisconnectsSpike`.

## Symptoms
- `rate(ws_disconnects_total[5m]) > 10` for >2m.
- Kiosks reconnecting in a loop -> increased CPU + connection churn.
- Mobile app users see disconnected indicator.

## Dashboards
- Grafana **Primus / Overview** -> `Active WebSocket connections`
- Loki: `{container_id=~".+"} |= "ws" |= "disconnect"`

## Immediate triage
1. Check which namespace is bleeding: filter the metric by `namespace`
   (`pc`, `admin`, `mobile`).
2. Tail backend logs for the offending namespace.
3. Check nginx / cloud LB idle-timeout: should be >75s; lower values
   cause the LB to drop healthy WS sessions.
4. Confirm Redis (pub/sub bus) is healthy — see `redis-down.md`.

## Likely causes
- Backend deploy / pod restart kicked everyone off; transient.
- Bad nginx config (`proxy_read_timeout` regressed).
- TLS cert renewal cycling load balancer.
- Backend exception in `ws.on_disconnect` causing the supervisor to kill loops.
- Network blip at the kiosk site (single tenant noise).

## Mitigations
- **Transient**: do nothing; watch for resolve.
- **LB timeout**: bump `proxy_read_timeout 300s` and `proxy_send_timeout 300s`.
- **Per-cafe blip**: confirm only one `cafe_id` label affected; reach out to
  the cafe operator about local network.

## After resolution
- If sustained, file a capacity ticket and consider WS sticky-session pinning.
