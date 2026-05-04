"""Redis-backed cluster-wide WebSocket presence tracker for client PCs.

Each open kiosk WebSocket sets one Redis key with a TTL. The TTL is refreshed
on every heartbeat the worker observes. When the WS closes — or the worker
dies — the key expires and the PC drops out of the cluster-wide presence set.

Why this exists: ``app.ws.pc._pc_connections`` is a per-process Python dict.
Under uvicorn / gunicorn with multiple workers the WebSocket lives on whichever
worker accepted the upgrade, but admin ``GET /api/clientpc/`` requests can land
on any worker. Without a shared registry, ``ws_connected`` would only be true
for the worker holding the socket, and the admin UI would flap.

The local dict remains the fast path; Redis is the source of truth across
workers. Both fall back gracefully when Redis is unavailable.
"""
from __future__ import annotations

from app.utils.cache import get_redis

# Roughly 4x the kiosk's 30s heartbeat cadence so a single missed beat
# doesn't drop the PC from the cluster registry.
PRESENCE_TTL_SECONDS = 120

_KEY_TEMPLATE = "primus:presence:ws:{pc_id}"


async def mark_ws_alive(pc_id: int) -> None:
    """Mark a PC as having an active WebSocket somewhere in the cluster."""
    redis = await get_redis()
    if redis is None:
        return
    try:
        await redis.set(_KEY_TEMPLATE.format(pc_id=pc_id), "1", ex=PRESENCE_TTL_SECONDS)
    except Exception:  # pragma: no cover - best-effort only
        pass


async def mark_ws_dead(pc_id: int) -> None:
    """Drop a PC from the cluster-wide presence set on clean disconnect."""
    redis = await get_redis()
    if redis is None:
        return
    try:
        await redis.delete(_KEY_TEMPLATE.format(pc_id=pc_id))
    except Exception:  # pragma: no cover - best-effort only
        pass


async def get_alive_pc_ids(pc_ids: list[int]) -> set[int]:
    """Return the subset of ``pc_ids`` that have an active WS in the cluster.

    A single Redis ``MGET`` keeps this O(1) round-trips per admin list call.
    Returns an empty set if Redis is unavailable so callers can fall back to
    local in-memory state without crashing.
    """
    if not pc_ids:
        return set()
    redis = await get_redis()
    if redis is None:
        return set()
    try:
        keys = [_KEY_TEMPLATE.format(pc_id=p) for p in pc_ids]
        results = await redis.mget(*keys)
        return {pc_id for pc_id, value in zip(pc_ids, results) if value is not None}
    except Exception:  # pragma: no cover - best-effort only
        return set()
