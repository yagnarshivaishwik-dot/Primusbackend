"""Phase 1: JWT jti revocation store backed by Redis.

Audit finding addressed:
  - BE-H1: JWT validation only checks signature + expiry. Force-logout sets
    RefreshToken.revoked=true but the access token still works until the
    20-minute exp rolls. With a typed jti claim and this revocation store,
    a token can be killed within milliseconds of force-logout.

Design:
  - Each access token now carries a `jti` claim (a 128-bit url-safe random id).
  - On force-logout (or any explicit revocation event), the jti is added to a
    Redis SET with a TTL equal to the remaining access-token lifetime, plus a
    small grace window. Once the token would have expired naturally, the
    Redis entry expires too — the set never grows unbounded.
  - On every request, the auth dependency checks the Redis set. If the jti
    is present, the token is rejected.
  - If Redis is unavailable, this module fails CLOSED in production
    (`PRIMUS_REVOCATION_FAIL_OPEN=false`, the default) and OPEN in
    development (so dev does not stall when Redis is down). The fail-closed
    default is the audit's recommendation; flip the env var only for an
    explicit DR scenario.

Memory cost analysis (10k concurrent users target):
  - Worst case: every active session is force-logged-out within one
    access-token lifetime (20 min). 10k entries × ~40 bytes = ~400 KB.
    Comfortably under any reasonable Redis budget.

Thread safety:
  - All operations are async and use the shared cache client from
    app.utils.cache. No module-level state, no locking required.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

from app.utils.cache import get_redis as _get_shared_redis


logger = logging.getLogger("primus.jwt_revocation")


# Namespace prefix in Redis. Keep it short — the key is read on every
# request.
_KEY_PREFIX = "rvk:"

# Grace seconds added to the TTL so a clock-skewed validator still rejects
# the token after its `exp` claim is already in the past.
_TTL_GRACE_SEC = 60

# Cap on how long a single jti entry can live in Redis. This is a safety
# valve against operator error (e.g., calling revoke() with a far-future
# expiry by mistake). Default 7 days; matches the refresh-token lifetime.
_MAX_TTL_SEC = int(os.getenv("REVOCATION_MAX_TTL_SEC", str(7 * 24 * 3600)))


def _fail_open() -> bool:
    """Return True if a missing Redis should be treated as 'token allowed'.

    Defaults to False in any environment that looks like production. Override
    with PRIMUS_REVOCATION_FAIL_OPEN=true only in a documented DR scenario.
    """
    env = (os.getenv("ENVIRONMENT") or "").strip().lower()
    if env == "production":
        return os.getenv("PRIMUS_REVOCATION_FAIL_OPEN", "false").lower() == "true"
    # Outside production, default to open so local dev does not stall.
    return os.getenv("PRIMUS_REVOCATION_FAIL_OPEN", "true").lower() == "true"


def _key(jti: str) -> str:
    return f"{_KEY_PREFIX}{jti}"


async def _redis() -> Any:
    return await _get_shared_redis()


async def is_revoked(jti: str | None) -> bool:
    """Return True if this jti is in the revocation set.

    Tokens without a jti claim (legacy issued before Phase 1) are NOT
    considered revoked here — the caller decides whether to accept legacy
    tokens at all. Treat None / empty as 'not revoked' so legacy tokens
    can still be validated by signature; once they all expire (≤ 20 min
    after Phase 1 deploy) the gap is closed.
    """
    if not jti:
        return False

    r = await _redis()
    if r is None:
        if _fail_open():
            logger.warning("jwt_revocation: Redis unavailable; failing OPEN per env")
            return False
        logger.error("jwt_revocation: Redis unavailable; failing CLOSED")
        return True

    try:
        # We use plain GET on a key, not SISMEMBER, because the value is a
        # single token. Cheaper and lets us see the metadata if needed.
        value = await r.get(_key(jti))
    except Exception as exc:
        logger.warning("jwt_revocation: redis error during is_revoked: %s", exc)
        return not _fail_open()

    return value is not None


async def revoke(
    jti: str,
    *,
    expires_at_unix: int | None = None,
    reason: str | None = None,
) -> bool:
    """Mark a jti as revoked. Returns True on success, False on best-effort failure.

    `expires_at_unix` is the token's `exp` claim. The Redis entry is given a
    TTL of `expires_at_unix - now + grace`, capped at REVOCATION_MAX_TTL_SEC.
    If omitted, falls back to the cap. After the TTL elapses the token would
    have expired anyway, so it is safe to drop the entry.
    """
    if not jti:
        return False

    now = int(time.time())
    if expires_at_unix is None:
        ttl = _MAX_TTL_SEC
    else:
        ttl = max(1, min(_MAX_TTL_SEC, expires_at_unix - now + _TTL_GRACE_SEC))

    r = await _redis()
    if r is None:
        logger.error("jwt_revocation: Redis unavailable; revoke(%s) lost", jti[:8])
        return False

    try:
        # Value is a small JSON-ish marker so an operator inspecting Redis can
        # see why the token was killed and when.
        marker = f"{reason or 'revoked'}|{now}"
        await r.set(_key(jti), marker, ex=ttl)
    except Exception as exc:
        logger.warning("jwt_revocation: redis error during revoke: %s", exc)
        return False

    return True


async def revoke_many(jtis: list[str], *, reason: str | None = None) -> int:
    """Bulk revoke. Returns the number successfully written."""
    n = 0
    for jti in jtis:
        if await revoke(jti, reason=reason):
            n += 1
    return n


def new_jti() -> str:
    """Generate a 128-bit url-safe random jti.

    Module-level so token mint code does not need to import secrets directly.
    """
    import secrets

    return secrets.token_urlsafe(16)
