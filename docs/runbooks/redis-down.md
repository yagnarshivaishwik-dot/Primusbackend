# Runbook: RedisDown

> Severity **critical** — paged via PagerDuty.
> Alert source: `primus_alerts.yml :: RedisDown`.

## Symptoms
- `up{job="redis_exporter"} == 0` for >1m.
- Sessions failing (Redis-backed), rate-limit middleware falling back to
  in-memory (per-replica only), idempotency middleware open-failing.
- Celery broker connections dropping; queue depth climbing.

## Dashboards
- Grafana **Primus / Overview** -> `DB + Redis up`
- `redis-cli -h <host> info` for memory, clients, persistence

## Immediate triage
1. `sudo systemctl status redis-server` (host) or `docker logs primus-redis`
   (container).
2. If running, exporter died: `docker restart primus-redis-exporter`.
3. If Redis itself is down: check `journalctl -xe -u redis-server -n 200`.
4. Out of memory? `redis-cli info memory | grep used_memory_human`.

## Likely causes
- `maxmemory` reached and eviction policy is `noeviction` -> writes refused.
- AOF rewrite stuck on slow disk.
- Container restart without persisted volume -> data loss + restart loop.
- Network partition between backend and Redis.

## Mitigations
- **OOM**: temporarily `CONFIG SET maxmemory-policy allkeys-lru` and bump
  `maxmemory` if VM has headroom.
- **AOF stuck**: `CONFIG SET appendonly no` only as a stop-gap; re-enable
  after the underlying disk is fixed.
- **Crash loop**: confirm the volume is mounted; restore from RDB snapshot
  if needed: `cp /backups/redis/<latest>.rdb /var/lib/redis/dump.rdb`.

## Rollback
N/A.

## After resolution
- Verify session count recovers (Grafana `ws_active_connections`).
- Rotate idempotency keys if Redis was wiped: forces 24h of POSTs through fresh.
