"""
Redis-based idempotency layer for financial endpoints.

Prevents duplicate transactions by caching responses keyed
by the Idempotency-Key header. Subsequent requests with the
same key return the cached response without re-executing.
"""

import hashlib
import json
import logging
from typing import Optional

from fastapi import HTTPException, Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

IDEMPOTENCY_TTL = 86400  # 24 hours


async def get_idempotency_key(request: Request) -> Optional[str]:
    """Extract idempotency key from request header."""
    return request.headers.get("Idempotency-Key")


async def require_idempotency_key(request: Request) -> str:
    """Require idempotency key on financial endpoints."""
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise HTTPException(
            status_code=400,
            detail="Idempotency-Key header is required for this endpoint",
        )
    if len(key) > 256:
        raise HTTPException(
            status_code=400,
            detail="Idempotency-Key must be 256 characters or less",
        )
    return key


def _make_redis_key(idempotency_key: str, endpoint: str) -> str:
    """Create a namespaced Redis key for idempotency."""
    import os
    env = os.getenv("ENVIRONMENT", "development")
    version = os.getenv("CACHE_VERSION", "v1")
    # Include endpoint in key to avoid collisions across different APIs
    key_hash = hashlib.sha256(f"{endpoint}:{idempotency_key}".encode()).hexdigest()[:32]
    return f"primus:{env}:{version}:idempotency:{key_hash}"


async def check_idempotency(
    idempotency_key: str,
    endpoint: str,
) -> Optional[dict]:
    """
    Check if a response is cached for this idempotency key.

    Returns the cached response dict if found, None otherwise.
    """
    try:
        from app.utils.cache import get_redis
        redis = await get_redis()
        if redis is None:
            return None

        redis_key = _make_redis_key(idempotency_key, endpoint)
        cached = await redis.get(redis_key)
        if cached:
            logger.info("Idempotency hit for key=%s endpoint=%s", idempotency_key, endpoint)
            return json.loads(cached)
        return None
    except Exception:
        logger.warning("Idempotency check failed, proceeding without cache", exc_info=True)
        return None


async def store_idempotency(
    idempotency_key: str,
    endpoint: str,
    response_data: dict,
    status_code: int = 200,
) -> None:
    """
    Cache a response for this idempotency key.

    The cached value includes both the response body and status code
    so we can reconstruct the exact response on replay.
    """
    try:
        from app.utils.cache import get_redis
        redis = await get_redis()
        if redis is None:
            return

        redis_key = _make_redis_key(idempotency_key, endpoint)
        cache_value = json.dumps({
            "status_code": status_code,
            "body": response_data,
        })
        await redis.set(redis_key, cache_value, ex=IDEMPOTENCY_TTL)
        logger.info("Idempotency stored for key=%s endpoint=%s", idempotency_key, endpoint)
    except Exception:
        logger.warning("Idempotency store failed", exc_info=True)


def make_idempotent_response(cached: dict) -> JSONResponse:
    """Reconstruct a JSONResponse from cached idempotency data."""
    return JSONResponse(
        content=cached["body"],
        status_code=cached.get("status_code", 200),
        headers={"X-Idempotency-Replay": "true"},
    )
