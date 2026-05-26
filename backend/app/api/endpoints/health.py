"""
Health probe endpoints.

Kubernetes / Azure / nginx upstream health checks need a clear split:

    /livez   -> Is the process alive? (no dependency checks)
                Used by the container runtime to decide *restart*.
                MUST be cheap (no DB, no Redis) so a slow Postgres
                doesn't restart the API pod.

    /readyz  -> Is the process ready to take traffic? (DB + Redis ping)
                Used by load balancer to decide *route traffic*.
                Returns 503 if any critical dependency is down so the LB
                evicts the instance without restarting it.

    /health  -> Legacy alias, kept for back-compat with existing infra that
                still probes /health or /api/health.

Forensic audit BUGs:
    - BUG #F.9: liveness vs readiness conflation -> a sick Postgres took
                down the entire API by restarting every replica.
    - BUG #F.9a: /health returned 200 even when Redis was unreachable.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import JSONResponse

logger = logging.getLogger("primus.health")

router = APIRouter(tags=["health"])

# Service metadata for the probe payload — read once at import time.
_SERVICE_NAME = "primus-backend"
_BUILD_REV = os.getenv("BUILD_REVISION") or os.getenv("GIT_SHA") or "dev"


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


# -----------------------------------------------------------------------------
# /livez -- cheap, no dependencies
# -----------------------------------------------------------------------------
@router.get("/livez", include_in_schema=False)
async def livez() -> JSONResponse:
    """Liveness probe — just proves the event loop is responsive."""
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "service": _SERVICE_NAME,
            "release": _BUILD_REV,
            "timestamp": _now_iso(),
        },
    )


# -----------------------------------------------------------------------------
# /readyz -- DB + Redis ping required
# -----------------------------------------------------------------------------
async def _check_postgres() -> tuple[str, str | None]:
    """Return ('ok', None) or ('error', message)."""
    try:
        from app.db.global_db import global_session_factory
        from sqlalchemy import text

        db = global_session_factory()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
        return "ok", None
    except Exception as exc:  # pragma: no cover — environment dependent
        return "error", f"{exc.__class__.__name__}: {exc}"


async def _check_redis() -> tuple[str, str | None]:
    """Return ('ok', None) or ('error', message). 'not_configured' is also ok."""
    try:
        from app.utils.cache import get_redis

        redis_client = await get_redis()
        if redis_client is None:
            return "not_configured", None
        await redis_client.ping()
        return "ok", None
    except Exception as exc:  # pragma: no cover
        return "error", f"{exc.__class__.__name__}: {exc}"


@router.get("/readyz", include_in_schema=False)
async def readyz() -> JSONResponse:
    """Readiness probe — checks DB + Redis.

    503 if EITHER critical dependency is unreachable. The load balancer
    is expected to evict the instance until /readyz recovers.
    """
    pg_status, pg_err = await _check_postgres()
    redis_status, redis_err = await _check_redis()

    # Postgres is hard-required; Redis is treated as critical for readiness
    # because rate-limiting, idempotency, and sessions all depend on it.
    healthy = pg_status == "ok" and redis_status in ("ok", "not_configured")

    payload: dict[str, object] = {
        "status": "ok" if healthy else "degraded",
        "service": _SERVICE_NAME,
        "release": _BUILD_REV,
        "timestamp": _now_iso(),
        "checks": {
            "postgres": pg_status,
            "redis": redis_status,
        },
    }
    if pg_err:
        payload["postgres_error"] = pg_err
    if redis_err:
        payload["redis_error"] = redis_err

    return JSONResponse(status_code=200 if healthy else 503, content=payload)


# -----------------------------------------------------------------------------
# /health -- legacy alias. Delegates to /readyz so behaviour is unchanged
# for existing probes that expected dependency-aware checks.
# -----------------------------------------------------------------------------
@router.get("/health", include_in_schema=False)
async def health_legacy() -> JSONResponse:
    """Legacy alias — returns the same payload as /readyz."""
    return await readyz()


@router.get("/api/health", include_in_schema=False)
async def api_health_legacy() -> JSONResponse:
    """Legacy alias used by older infra probes that hit /api/health."""
    return await readyz()
