"""Distributed mutual exclusion helpers backed by Redis.

This module provides a small, well-scoped Redis lock primitive suitable for
serializing short, latency-sensitive critical sections across multiple
FastAPI workers (e.g. the booking creation path).

Concrete example — preventing double-booking of a PC slot::

    from app.core.locks import redis_lock

    lock_key = f"pc:{pc_id}:slot:{start_iso}~{end_iso}"
    async with redis_lock(lock_key, ttl_ms=5000) as acquired:
        if not acquired:
            raise HTTPException(409, "Slot is being booked by another user")

        # Inside the lock: SELECT ... FOR UPDATE, overlap-check, INSERT.
        ...

Semantics:
    * Acquisition uses ``SET key <token> NX PX ttl_ms``. A random token is
      generated for each call so a stale TTL-expired lock cannot be
      accidentally released by the original owner.
    * Release executes a tiny Lua script atomically: the key is deleted
      **only** if its current value still matches our token. This prevents
      one caller from deleting a lock held by someone else after expiry.
    * If Redis is unavailable (client not initialised / connection down),
      ``redis_lock`` yields ``True`` (fail-open). Without Redis the database
      EXCLUDE-USING-GIST constraint added by the booking migration is the
      authoritative guard — the Redis lock is a fast pre-check that reduces
      contention on the hot path.
"""

from __future__ import annotations

import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

logger = logging.getLogger(__name__)

# Atomic "compare-and-delete" — delete the key only if its value matches our
# token. Prevents releasing a lock that has expired and been re-acquired by
# another caller.
_RELEASE_SCRIPT = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
else
    return 0
end
"""


@asynccontextmanager
async def redis_lock(
    key: str,
    ttl_ms: int = 5000,
    *,
    redis: Any | None = None,
) -> AsyncIterator[bool]:
    """Async context manager acquiring a Redis-backed lock named ``key``.

    Args:
        key: Logical lock name. The caller is responsible for namespacing
            (e.g. ``"pc:42:slot:2026-04-16T10:00~2026-04-16T11:00"``).
        ttl_ms: Lock lifetime in milliseconds. If the holder crashes before
            releasing, the lock is reclaimable after this TTL expires.
            Keep this slightly larger than the worst-case critical section.
        redis: Optional pre-fetched Redis client. If ``None`` (the default)
            the singleton client from :mod:`app.utils.cache` is used.

    Yields:
        ``True`` when the lock was acquired (or Redis is unavailable and we
        are fail-opening to the DB constraint). ``False`` when the lock is
        currently held by someone else — callers should respond 409 / retry.

    Example:
        >>> async with redis_lock("my-key", ttl_ms=3000) as ok:
        ...     if not ok:
        ...         return  # someone else is working on the same key
        ...     do_critical_section()
    """

    if redis is None:
        # Reuse the singleton client managed by app.utils.cache.
        from app.utils.cache import get_redis

        redis = await get_redis()

    # Fail-open when Redis is not configured / reachable. The DB-level
    # EXCLUDE constraint remains authoritative; the lock here is an
    # opportunistic optimisation to avoid 49 racing transactions hitting
    # the constraint at once.
    if redis is None:
        logger.debug("redis_lock(%s): Redis unavailable — yielding fail-open True", key)
        yield True
        return

    token = secrets.token_hex(16)
    acquired = False

    try:
        try:
            # SET key token NX PX ttl_ms  — atomic acquisition.
            acquired = bool(await redis.set(key, token, nx=True, px=ttl_ms))
        except Exception as exc:  # pragma: no cover - network issues
            logger.warning("redis_lock(%s): SET failed — yielding fail-open: %s", key, exc)
            yield True
            return

        yield acquired
    finally:
        if acquired:
            try:
                # Atomic compare-and-delete so we never unlock someone else.
                await redis.eval(_RELEASE_SCRIPT, 1, key, token)
            except Exception as exc:  # pragma: no cover - network issues
                logger.warning("redis_lock(%s): release failed: %s", key, exc)
